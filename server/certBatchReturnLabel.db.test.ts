// Task #3075 — DB-backed coverage for the cert-batch return-label leg:
//
//   1. resolveBatchFulfillmentRouting mirrors REAL order routing
//      (pickFulfillmentPartner): live album_fulfillment_splits beat the
//      per-album override, and with no explicit default the oldest live
//      partner still resolves (never "unassigned" when routing exists).
//   2. saveCertBatchReturnLabel's one-shot notify claim is ATOMIC —
//      concurrent saves for the same partner yield exactly one
//      claimed=true; re-saving doesn't re-claim; re-targeting a
//      different partner re-claims; clearing resets the guard.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/certBatchReturnLabel.db.test.ts
// It also drives the real PATCH /api/admin/albums/:id/cert-batch/
// return-label route over loopback to prove the delivery semantics:
// "notified" only when at least one email actually SENT — zero
// subscribed recipients or send failures (RESEND_API_KEY absent here)
// release the claim so a later save retries, and notifyProblem tells
// the operator why.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import {
  resolveBatchFulfillmentRouting,
  saveCertBatchReturnLabel,
} from "./certBatch";

const albumId = randomUUID();
const fpSplit = randomUUID();
const fpOverride = randomUUID();
const fpOld = randomUUID();
const fpNew = randomUUID();
const marker = `t3075-${albumId.slice(0, 8)}`;

let baseUrl = "";
let httpServer: HttpServer | undefined;
let adminToken = "";
const adminUserId = randomUUID();

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await db.execute(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${adminUserId}, ${marker + "_admin"}, 'x', ${marker}, ${marker + "@example.test"},
            true, 'super_admin', NULL)
  `);
  adminToken = marker + "tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminUserId, "admin");

  await db.execute(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"Return Label Test " + marker}, 'Test Artist', '')
  `);
  // NOTE: created_at ordering matters for the no-default fallback.
  await db.execute(sql`
    INSERT INTO fulfillment_partners (id, name, is_default, created_at) VALUES
      (${fpSplit},    ${marker + " Split Co"},    false, now() - interval '4 days'),
      (${fpOverride}, ${marker + " Override Co"}, false, now() - interval '3 days'),
      (${fpOld},      ${marker + " Oldest Co"},   false, now() - interval '10 days'),
      (${fpNew},      ${marker + " Newest Co"},   false, now())
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM album_fulfillment_splits WHERE album_id = ${albumId}`);
  await db.execute(sql`DELETE FROM albums WHERE id = ${albumId}`);
  await db.execute(sql`
    DELETE FROM partner_notification_log WHERE recipient_id IN (
      SELECT id FROM partner_notification_recipients WHERE name LIKE ${marker + "%"}
    )
  `);
  await db.execute(sql`DELETE FROM partner_notification_recipients WHERE name LIKE ${marker + "%"}`);
  await db.execute(sql`DELETE FROM fulfillment_partners WHERE name LIKE ${marker + "%"}`);
  await db.execute(sql`DELETE FROM auth_tokens WHERE token = ${adminToken}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${adminUserId}`);
  if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
  await pool.end();
});

async function patchReturnLabel(body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/admin/albums/${albumId}/cert-batch/return-label`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

test("no default flagged: oldest live partner still resolves (platform_default)", async () => {
  // Guard: this test relies on our seeded "Oldest Co" being the oldest
  // live partner overall. If the shared dev DB has an even older or
  // default-flagged partner, the routing should return THAT one — assert
  // agreement with pickFulfillmentPartner rather than a specific id.
  const { pickFulfillmentPartner } = await import("./orderDesk");
  const expected = await pickFulfillmentPartner({ albumId, fulfillmentPartnerId: null } as any);
  const out = await resolveBatchFulfillmentRouting({ id: albumId, fulfillmentPartnerId: null });
  assert.ok(out, "routing must resolve when any live partner exists");
  assert.equal(out!.ref.id, expected);
  assert.equal(out!.source, "platform_default");
});

test("album override beats the platform fallback", async () => {
  const out = await resolveBatchFulfillmentRouting({ id: albumId, fulfillmentPartnerId: fpOverride });
  // pickFulfillmentPartner reads the override off the albums row, so stamp it.
  await db.execute(sql`UPDATE albums SET fulfillment_partner_id = ${fpOverride} WHERE id = ${albumId}`);
  const out2 = await resolveBatchFulfillmentRouting({ id: albumId, fulfillmentPartnerId: fpOverride });
  assert.equal(out2!.ref.id, fpOverride);
  assert.equal(out2!.source, "album_routing");
  void out;
});

test("live split beats the album override", async () => {
  await db.execute(sql`
    INSERT INTO album_fulfillment_splits (album_id, fulfillment_partner_id, sort_order)
    VALUES (${albumId}, ${fpSplit}, 0)
  `);
  const out = await resolveBatchFulfillmentRouting({ id: albumId, fulfillmentPartnerId: fpOverride });
  assert.equal(out!.ref.id, fpSplit);
  assert.equal(out!.source, "album_routing");
});

test("concurrent saves claim the notify exactly once", async () => {
  const args = { albumId, fulfillmentPartnerId: fpNew, carrier: "UPS", trackingNumber: "1Z1" };
  const results = await Promise.all([
    saveCertBatchReturnLabel(args),
    saveCertBatchReturnLabel(args),
    saveCertBatchReturnLabel(args),
    saveCertBatchReturnLabel(args),
  ]);
  const claims = results.filter((r) => r.claimed).length;
  assert.equal(claims, 1, `expected exactly 1 claim, got ${claims}`);
});

test("re-save same partner does not re-claim; renotify does; new partner re-claims; clear resets", async () => {
  const base = { albumId, fulfillmentPartnerId: fpNew, carrier: "UPS", trackingNumber: "1Z2" };
  assert.equal((await saveCertBatchReturnLabel(base)).claimed, false);
  assert.equal((await saveCertBatchReturnLabel({ ...base, renotify: true })).claimed, true);
  assert.equal((await saveCertBatchReturnLabel({ ...base, fulfillmentPartnerId: fpOld })).claimed, true);
  // Clear resets the guard…
  assert.equal(
    (await saveCertBatchReturnLabel({ albumId, fulfillmentPartnerId: null, carrier: null, trackingNumber: null })).claimed,
    false,
  );
  const [row] = (await db.execute(sql`
    SELECT cert_batch_return_notified_at AS n, cert_batch_return_fulfillment_id AS f
    FROM albums WHERE id = ${albumId}
  `) as any).rows;
  assert.equal(row.n, null);
  assert.equal(row.f, null);
  // …so the next targeted save claims again.
  assert.equal((await saveCertBatchReturnLabel(base)).claimed, true);
});

test("route: zero subscribed recipients → notified=false, claim released, notifyProblem set", async () => {
  // Reset state first.
  await patchReturnLabel({ fulfillmentPartnerId: null, carrier: null, trackingNumber: null });
  const r = await patchReturnLabel({ fulfillmentPartnerId: fpNew, carrier: "UPS", trackingNumber: "1Z-A" });
  assert.equal(r.status, 200);
  assert.equal(r.json.notified, false);
  assert.match(String(r.json.notifyProblem ?? ""), /No subscribed email contacts/i);
  // Claim released → notified_at stays NULL, so a later save retries.
  const [row] = (await db.execute(sql`
    SELECT cert_batch_return_notified_at AS n FROM albums WHERE id = ${albumId}
  `) as any).rows;
  assert.equal(row.n, null);
});

test("route: send failure (no RESEND key here) → notified=false, claim released for retry", async () => {
  assert.equal(process.env.RESEND_API_KEY ?? "", "", "test expects no RESEND key in the task env");
  await db.execute(sql`
    INSERT INTO partner_notification_recipients (partner_kind, partner_id, name, channel, address, events)
    VALUES ('fulfillment', ${fpNew}, ${marker + " ops"}, 'email', 'ops@example.test', '[]'::jsonb)
  `);
  await patchReturnLabel({ fulfillmentPartnerId: null, carrier: null, trackingNumber: null });
  const r = await patchReturnLabel({ fulfillmentPartnerId: fpNew, carrier: "UPS", trackingNumber: "1Z-B" });
  assert.equal(r.status, 200);
  assert.equal(r.json.notified, false);
  assert.match(String(r.json.notifyProblem ?? ""), /delivery failed/i);
  const [row] = (await db.execute(sql`
    SELECT cert_batch_return_notified_at AS n FROM albums WHERE id = ${albumId}
  `) as any).rows;
  assert.equal(row.n, null, "claim must be released after a failed send");
  // The failure is durably logged against the recipient.
  const [log] = (await db.execute(sql`
    SELECT status FROM partner_notification_log
    WHERE recipient_id IN (SELECT id FROM partner_notification_recipients WHERE name = ${marker + " ops"})
    ORDER BY sent_at DESC LIMIT 1
  `) as any).rows;
  assert.equal(log?.status, "failed");
});
