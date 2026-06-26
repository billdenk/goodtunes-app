// Task: Trustworthy Release Acquisition Funnel.
//
// Exercises `acquisitionFunnel()` against a real Postgres. Two structural
// guarantees are covered:
//
//  1. Completions are ORDER-derived (ground truth), not event-derived — a
//     purchase finishes on a different host with a brand-new analytics session,
//     so counting `checkout_completed` events would miss every purchase. We seed
//     paid orders and assert the completed step reflects them, attributed to the
//     right source via (a) the server-stitched completion bridge, (b) the
//     buyer's signed-in landing session, or (c) "Direct / unknown".
//  2. The opt-in `excludeInternal` option drops operator/staff + flagged-device
//     sessions from every top step AND internal/test purchases from the
//     completed step, leaving real fan traffic and recomputed math intact.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/reports/acquisitionFunnel.exclusion.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { acquisitionFunnel } from "./admin";
import { FULL_ACCESS_EMAILS } from "@shared/fullAccess";

const exec = (q: any) => db.execute(q);

const tag = randomUUID().slice(0, 8);
const albumId = `funnelx-album-${tag}`;
const adminUserId = `funnelx-admin-${tag}`;
const fullAccessEmail = FULL_ACCESS_EMAILS[0];

// Distinct session ids so COALESCE(session_id, …) keys each journey separately.
const sFanFull = `funnelx-fan-full-${tag}`; // real fan, top 3 steps, instagram, bought (bridged)
const sFanLanded = `funnelx-fan-landed-${tag}`; // real fan, landed only, direct
const sSignedIn = `funnelx-signedin-${tag}`; // real fan, signed-in browsing, google, bought (userId fallback)
const sMarker = `funnelx-marker-${tag}`; // _internal-flagged device
const sAdmin = `funnelx-admin-sess-${tag}`; // admin users-row userId
const sFullAccess = `funnelx-fa-sess-${tag}`; // full-access operator fan, bought (internal purchase)

// Buyers (orders.customer_id → customer_users.id).
const buyerFull = `funnelx-buyer-full-${tag}`;
const buyerSignedIn = `funnelx-buyer-signedin-${tag}`;
const buyerDirect = `funnelx-buyer-direct-${tag}`;

// Orders.
const oBridged = `funnelx-order-bridged-${tag}`;
const oSignedIn = `funnelx-order-signedin-${tag}`;
const oFullAccess = `funnelx-order-fa-${tag}`;
const oDirect = `funnelx-order-direct-${tag}`;

// Device-denylist fixtures live on a SEPARATE album so they don't perturb the
// counts the four tests above assert. They prove a whole DEVICE is treated as
// internal retroactively (old logged-out QA session on a device that later
// produced a stamped event) and that the explicit GT_INTERNAL_DEVICE_IDS
// server-maintained denylist also excludes a device with no flagged events.
const albumDev = `funnelx-album-dev-${tag}`;
const qaDevice = `funnelx-qa-device-${tag}`;
const envDevice = `funnelx-env-device-${tag}`;
const realDevice = `funnelx-real-device-${tag}`;
const sQaOld = `funnelx-qa-old-${tag}`; // OLD logged-out QA session, no marker
const sQaSignedIn = `funnelx-qa-signin-${tag}`; // later stamped session, same device
const sEnvDevice = `funnelx-env-dev-${tag}`; // clean events, excluded only via env
const sRealDev = `funnelx-real-dev-${tag}`; // genuine fan, clean device

let fullAccessFanId: string;
let createdFullAccessFan = false;

const STEP = {
  landed: "album_viewed",
  offer: "bundle_viewed",
  checkout: "checkout_started",
  completed: "checkout_completed",
} as const;

function ev(sessionId: string, name: string, payload: Record<string, any>, userId?: string) {
  return exec(sql`
    INSERT INTO analytics_events (id, name, payload, ts, session_id, user_id)
    VALUES (
      ${randomUUID()}, ${name}, ${JSON.stringify({ albumId, ...payload })}::json,
      now(), ${sessionId}, ${userId ?? null}
    )
  `);
}

function customer(id: string, email: string) {
  return exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${id}, ${id}, ${email}, ${"Funnel Buyer"})
  `);
}

function order(id: string, customerId: string) {
  return exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, created_at)
    VALUES (${id}, ${customerId}, ${albumId}, ${2500}, ${"paid"}, now())
  `);
}

before(async () => {
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"Funnel Exclusion Test"}, ${"Test Artist"}, ${"/album-placeholder.svg"})
  `);
  // Admin staff account — any analytics userId matching a `users` row is internal.
  await exec(sql`
    INSERT INTO users (id, username, email, display_name, password)
    VALUES (${adminUserId}, ${`funnelx-admin-${tag}`}, ${`funnelx-admin-${tag}@example.com`}, ${"Funnel Admin"}, ${"x"})
  `);
  // Full-access operator fan — matched by email, not by a users row. The email
  // is the real hardcoded full-access address, so reuse the row if it already
  // exists (unique constraint) and only tear down what we created.
  const existing = await exec(sql`SELECT id FROM customer_users WHERE email = ${fullAccessEmail} LIMIT 1`);
  if ((existing.rows as any[]).length > 0) {
    fullAccessFanId = (existing.rows as any[])[0].id;
  } else {
    fullAccessFanId = `funnelx-fa-${tag}`;
    await exec(sql`INSERT INTO customer_users (id, email) VALUES (${fullAccessFanId}, ${fullAccessEmail})`);
    createdFullAccessFan = true;
  }

  // Real fan buyers.
  await customer(buyerFull, `funnelx-buyer-full-${tag}@example.com`);
  await customer(buyerSignedIn, `funnelx-buyer-signedin-${tag}@example.com`);
  await customer(buyerDirect, `funnelx-buyer-direct-${tag}@example.com`);

  // ── Real fan #1: top 3 steps, instagram first-touch, then bought. The buy
  //    finishes cross-host; the server stitches a `checkout_completed` back onto
  //    the original landing session (sFanFull), carrying orderId + _stitched. ──
  await ev(sFanFull, STEP.landed, { _utm_source: "instagram" });
  await ev(sFanFull, STEP.offer, { _utm_source: "instagram" });
  await ev(sFanFull, STEP.checkout, { _utm_source: "instagram" });
  await ev(sFanFull, STEP.completed, { _utm_source: "instagram", orderId: oBridged, _stitched: true }, buyerFull);
  await order(oBridged, buyerFull);

  // ── Real fan #2: landed only, direct, no purchase ──
  await ev(sFanLanded, STEP.landed, {});

  // ── Real fan #3: signed-in browsing (userId on every landing event), google
  //    first-touch, top 3 steps, then bought with NO stitch — attribution must
  //    fall back to this buyer's own landing session. ──
  await ev(sSignedIn, STEP.landed, { _utm_source: "google" }, buyerSignedIn);
  await ev(sSignedIn, STEP.offer, { _utm_source: "google" }, buyerSignedIn);
  await ev(sSignedIn, STEP.checkout, { _utm_source: "google" }, buyerSignedIn);
  await order(oSignedIn, buyerSignedIn);

  // ── Internal: device-marker session, reaches the offer ──
  await ev(sMarker, STEP.landed, { _internal: true });
  await ev(sMarker, STEP.offer, { _internal: true });
  // ── Internal: admin users-row userId, reaches checkout ──
  await ev(sAdmin, STEP.landed, {}, adminUserId);
  await ev(sAdmin, STEP.offer, {}, adminUserId);
  await ev(sAdmin, STEP.checkout, {}, adminUserId);
  // ── Internal: full-access operator fan, reaches the offer, then bought —
  //    a staff test purchase that must drop under excludeInternal. ──
  await ev(sFullAccess, STEP.landed, {}, fullAccessFanId);
  await ev(sFullAccess, STEP.offer, {}, fullAccessFanId);
  await order(oFullAccess, fullAccessFanId);

  // ── Unattributable purchase: a buyer with no funnel session and no stitch.
  //    Counts at completed under "Direct / unknown" (honest fallback). ──
  await order(oDirect, buyerDirect);

  // ── Device-denylist fixtures on a separate album ──
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumDev}, ${"Funnel Device Denylist Test"}, ${"Test Artist"}, ${"/album-placeholder.svg"})
  `);
  // qaDevice: an OLD logged-out QA session (no marker) PLUS a later stamped
  // session on the SAME device. The stamped one taints the device, which must
  // retroactively drop the older unmarked logged-out session.
  await ev(sQaOld, STEP.landed, { albumId: albumDev, _device_id: qaDevice });
  await ev(sQaSignedIn, STEP.landed, { albumId: albumDev, _device_id: qaDevice, _internal: true });
  await ev(sQaSignedIn, STEP.offer, { albumId: albumDev, _device_id: qaDevice, _internal: true });
  // envDevice: every event is clean — only the explicit GT_INTERNAL_DEVICE_IDS
  // denylist can exclude it.
  await ev(sEnvDevice, STEP.landed, { albumId: albumDev, _device_id: envDevice });
  // realDevice: a genuine fan on a clean device — always counts.
  await ev(sRealDev, STEP.landed, { albumId: albumDev, _device_id: realDevice });
});

after(async () => {
  await exec(sql`
    DELETE FROM analytics_events
     WHERE session_id IN (
       ${sFanFull}, ${sFanLanded}, ${sSignedIn}, ${sMarker}, ${sAdmin}, ${sFullAccess},
       ${sQaOld}, ${sQaSignedIn}, ${sEnvDevice}, ${sRealDev}
     )
  `);
  await exec(sql`DELETE FROM orders WHERE id IN (${oBridged}, ${oSignedIn}, ${oFullAccess}, ${oDirect})`);
  await exec(sql`DELETE FROM customer_users WHERE id IN (${buyerFull}, ${buyerSignedIn}, ${buyerDirect})`);
  await exec(sql`DELETE FROM albums WHERE id IN (${albumId}, ${albumDev})`);
  await exec(sql`DELETE FROM users WHERE id = ${adminUserId}`);
  if (createdFullAccessFan) {
    await exec(sql`DELETE FROM customer_users WHERE id = ${fullAccessFanId}`);
  }
  await pool.end();
});

const ctx = () => ({ from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) });
const stepCount = (data: any, key: string) => data.steps.find((s: any) => s.key === key).sessions;

test("without exclusion: top steps count every session; completed is order-derived", async () => {
  const data = await acquisitionFunnel(ctx(), { albumId, groupBy: "source" });
  // 6 landed: 3 real fans + marker + admin + full-access operator.
  assert.equal(stepCount(data, "landed"), 6);
  // 5 viewed the offer: fan-full + signed-in + marker + admin + full-access.
  assert.equal(stepCount(data, "viewed_offer"), 5);
  // 3 started checkout: fan-full + signed-in + admin.
  assert.equal(stepCount(data, "started_checkout"), 3);
  // 4 completed = 4 paid orders (bridged, signed-in fallback, full-access, direct).
  assert.equal(stepCount(data, "completed"), 4);
  assert.equal(data.excludedInternal, 0);
});

test("completions are attributed to the right source (bridge, fallback, direct)", async () => {
  const data = await acquisitionFunnel(ctx(), { albumId, groupBy: "source" });
  const instagram = data.bySource.find((s: any) => s.source.toLowerCase().includes("instagram"));
  assert.ok(instagram, "instagram source row should exist");
  assert.equal(instagram.completed, 1, "bridged order attributed to instagram");
  const google = data.bySource.find((s: any) => s.source.toLowerCase().includes("google"));
  assert.ok(google, "google source row should exist");
  assert.equal(google.completed, 1, "signed-in fallback order attributed to google");
  const direct = data.bySource.find((s: any) => s.key === "direct");
  assert.ok(direct, "direct source row should exist");
  // The full-access fan's session (no utm → direct) and the unattributable
  // buyer both land under Direct / unknown.
  assert.equal(direct.completed, 2);
  // Per-source completed sums to the overall completed step.
  const sumCompleted = data.bySource.reduce((n: number, s: any) => n + s.completed, 0);
  assert.equal(sumCompleted, stepCount(data, "completed"));
});

test("excludeInternal drops internal sessions AND internal purchases from every step", async () => {
  const data = await acquisitionFunnel(ctx(), { albumId, groupBy: "source", excludeInternal: true });
  // Only the 3 real fans remain at the top.
  assert.equal(stepCount(data, "landed"), 3);
  // fan-full + signed-in reach the offer and checkout.
  assert.equal(stepCount(data, "viewed_offer"), 2);
  assert.equal(stepCount(data, "started_checkout"), 2);
  // The full-access (staff) purchase drops; bridged + fallback + direct stay.
  assert.equal(stepCount(data, "completed"), 3);
  // 3 internal sessions (marker, admin, full-access) + 1 internal purchase.
  assert.equal(data.excludedInternal, 4);
  // Conversion recomputed from the reduced counts: 3 of 3 landed → bought.
  assert.equal(data.overallConversion, 1);
});

test("excluded internal sessions/purchases vanish from the per-source breakdown", async () => {
  const data = await acquisitionFunnel(ctx(), { albumId, groupBy: "source", excludeInternal: true });
  const instagram = data.bySource.find((s: any) => s.source.toLowerCase().includes("instagram"));
  assert.ok(instagram, "instagram source row should remain");
  assert.equal(instagram.landed, 1);
  assert.equal(instagram.completed, 1);
  // With the internal direct sessions gone, Direct keeps the real landed-only
  // fan and the one unattributable real purchase (the staff buy is excluded).
  const direct = data.bySource.find((s: any) => s.key === "direct");
  assert.ok(direct, "a real direct fan should still be present");
  assert.equal(direct.landed, 1);
  assert.equal(direct.completed, 1);
});

test("excludeInternal taints whole devices retroactively + honors the env denylist", async () => {
  const c = ctx();
  // No exclusion: all four device sessions count.
  const raw = await acquisitionFunnel(c, { albumId: albumDev, groupBy: "source" });
  assert.equal(stepCount(raw, "landed"), 4);
  assert.equal(raw.excludedInternal, 0);

  // Exclude: the later stamped session taints qaDevice, so the OLD unmarked
  // logged-out session on that same device drops too (the historical-QA case).
  // envDevice (no flag, not in env) and realDevice stay.
  const excl = await acquisitionFunnel(c, { albumId: albumDev, groupBy: "source", excludeInternal: true });
  assert.equal(stepCount(excl, "landed"), 2); // envDevice + realDevice
  assert.equal(excl.excludedInternal, 2); // sQaOld + sQaSignedIn

  // Add the explicit server-maintained denylist for envDevice — now it drops
  // too, even though none of its events were ever flagged.
  const prev = process.env.GT_INTERNAL_DEVICE_IDS;
  process.env.GT_INTERNAL_DEVICE_IDS = envDevice;
  try {
    const withEnv = await acquisitionFunnel(c, { albumId: albumDev, groupBy: "source", excludeInternal: true });
    assert.equal(stepCount(withEnv, "landed"), 1); // only realDevice
    assert.equal(withEnv.excludedInternal, 3);
  } finally {
    if (prev === undefined) delete process.env.GT_INTERNAL_DEVICE_IDS;
    else process.env.GT_INTERNAL_DEVICE_IDS = prev;
  }
});
