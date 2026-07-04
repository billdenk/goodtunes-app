// Task #2525 — Separate comp/preview listens from genuine fan listens.
//
// Exercises the shared artist-reports compute path (`computeKpis` /
// `computeLifetime` in server/artistReports.ts) against a real Postgres to
// prove the structural guarantee behind the whole task: fan-facing play
// metrics EXCLUDE non-fan listens, while operators still see the excluded
// volume via a separate count (`excludedPlays`), never a silent drop.
//
// A play is a NON-fan listen (and must be excluded) when its listener is:
//   • a comp grant holder (user_albums is_preview=false) with NO paid order,
//   • an unexpired preview grant holder (user_albums is_preview=true),
//   • an operator/staff account (a `users` row, or a full-access email fan),
//   • an internal-stamped session (payload `_internal='true'`).
// Genuine fans stay in: a real buyer (user_albums + paid order) and an
// anonymous session-only listener with no non-fan signal.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/artistReports.exclusion.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { computeKpis, computeLifetime, type ArtistScope } from "./artistReports";
import { FULL_ACCESS_EMAILS } from "@shared/fullAccess";

const exec = (q: any) => db.execute(q);

const tag = randomUUID().slice(0, 8);
const albumId = `arx-album-${tag}`;
const songId = `arx-song-${tag}`;
const adminUserId = `arx-admin-${tag}`;
const fullAccessEmail = FULL_ACCESS_EMAILS[0];

// Genuine fans (kept).
const buyerId = `arx-buyer-${tag}`; // user_albums + paid order
const paidOrderId = `arx-order-${tag}`;
const sAnonFan = `arx-anon-fan-${tag}`; // session-only, no non-fan signal

// Non-fans (excluded).
const compId = `arx-comp-${tag}`; // user_albums is_preview=false, NO order
const previewId = `arx-preview-${tag}`; // user_albums is_preview=true, unexpired
const sInternal = `arx-internal-${tag}`; // _internal-stamped session

let fullAccessFanId: string;
let createdFullAccessFan = false;

function ev(sessionId: string, name: string, payload: Record<string, any>, userId?: string) {
  return exec(sql`
    INSERT INTO analytics_events (id, name, payload, ts, session_id, user_id)
    VALUES (
      ${randomUUID()}, ${name}, ${JSON.stringify({ albumId, songId, ...payload })}::json,
      now(), ${sessionId}, ${userId ?? null}
    )
  `);
}

function customer(id: string, email: string) {
  return exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${id}, ${id}, ${email}, ${"ARX Fan"})
  `);
}

// user_albums.user_id is a loose FK that actually holds a customer_users.id.
function grant(userId: string, isPreview: boolean, previewExpiresAt: string | null) {
  return exec(sql`
    INSERT INTO user_albums (id, user_id, album_id, is_preview, preview_expires_at)
    VALUES (${randomUUID()}, ${userId}, ${albumId}, ${isPreview}, ${previewExpiresAt})
  `);
}

before(async () => {
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"ARX Exclusion Test"}, ${"Test Artist"}, ${"/album-placeholder.svg"})
  `);
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${songId}, ${albumId}, ${"ARX Track"}, ${1})
  `);
  // Admin staff account — any analytics userId matching a `users` row is internal.
  await exec(sql`
    INSERT INTO users (id, username, email, display_name, password)
    VALUES (${adminUserId}, ${`arx-admin-${tag}`}, ${`arx-admin-${tag}@example.com`}, ${"ARX Admin"}, ${"x"})
  `);
  // Full-access operator fan — matched by email, reuse the row if it exists.
  const existing = await exec(sql`SELECT id FROM customer_users WHERE email = ${fullAccessEmail} LIMIT 1`);
  if ((existing.rows as any[]).length > 0) {
    fullAccessFanId = (existing.rows as any[])[0].id;
  } else {
    fullAccessFanId = `arx-fa-${tag}`;
    await exec(sql`INSERT INTO customer_users (id, email) VALUES (${fullAccessFanId}, ${fullAccessEmail})`);
    createdFullAccessFan = true;
  }

  // ── Genuine buyer: user_albums row AND a paid order → stays in. 2 plays. ──
  await customer(buyerId, `arx-buyer-${tag}@example.com`);
  await grant(buyerId, false, null);
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, created_at)
    VALUES (${paidOrderId}, ${buyerId}, ${albumId}, ${2500}, ${"paid"}, now())
  `);
  await ev(sAnonFan.concat("-buyer"), "play_start", {}, buyerId);
  await ev(sAnonFan.concat("-buyer"), "play_start", {}, buyerId);

  // ── Anonymous genuine fan: session-only, no non-fan signal → stays in. 1 play. ──
  await ev(sAnonFan, "play_start", {});

  // ── Comp holder: user_albums is_preview=false, NO paid order → excluded. 3 plays. ──
  await customer(compId, `arx-comp-${tag}@example.com`);
  await grant(compId, false, null);
  await ev(`${sInternal}-comp`, "play_start", {}, compId);
  await ev(`${sInternal}-comp`, "play_start", {}, compId);
  await ev(`${sInternal}-comp`, "play_start", {}, compId);

  // ── Preview holder: unexpired preview grant, NO order → excluded. 1 play. ──
  await customer(previewId, `arx-preview-${tag}@example.com`);
  await grant(previewId, true, new Date(Date.now() + 86_400_000).toISOString());
  await ev(`${sInternal}-preview`, "play_start", {}, previewId);

  // ── Admin users-row listener → excluded. 1 play. ──
  await ev(`${sInternal}-admin`, "play_start", {}, adminUserId);

  // ── Full-access operator fan (matched by email) → excluded. 1 play. ──
  await ev(`${sInternal}-fa`, "play_start", {}, fullAccessFanId);

  // ── Internal-stamped anonymous session → excluded. 1 play. ──
  await ev(sInternal, "play_start", { _internal: true });
});

after(async () => {
  await exec(sql`
    DELETE FROM analytics_events
     WHERE payload->>'songId' = ${songId}
  `);
  await exec(sql`DELETE FROM orders WHERE id = ${paidOrderId}`);
  await exec(sql`DELETE FROM user_albums WHERE album_id = ${albumId}`);
  await exec(sql`DELETE FROM songs WHERE id = ${songId}`);
  await exec(sql`DELETE FROM customer_users WHERE id IN (${buyerId}, ${compId}, ${previewId})`);
  await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
  await exec(sql`DELETE FROM users WHERE id = ${adminUserId}`);
  if (createdFullAccessFan) {
    await exec(sql`DELETE FROM customer_users WHERE id = ${fullAccessFanId}`);
  }
  await pool.end();
});

const scope = (): ArtistScope => ({
  personId: `arx-person-${tag}`,
  albumIds: [albumId],
  songIds: [songId],
  ownedSongIds: [songId],
});
const range = () => ({ from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) });

// Genuine-fan plays = 2 (buyer) + 1 (anon fan) = 3.
// Excluded plays     = 3 (comp) + 1 (preview) + 1 (admin) + 1 (full-access) + 1 (internal) = 7.
// Genuine-fan listeners = distinct(buyer, anon session) = 2.
test("computeKpis: fan plays exclude comp/preview/operator/internal; excluded stays visible", async () => {
  const k = await computeKpis(scope(), range());
  assert.equal(k.plays, 3, "only genuine-fan plays counted");
  assert.equal(k.listeners, 2, "only genuine-fan listeners counted");
  assert.equal(k.excludedPlays, 7, "all non-fan plays surfaced as excluded, not dropped");
});

test("computeLifetime: same exclusion + excluded count on the all-time totals", async () => {
  const l = await computeLifetime(scope());
  assert.equal(l.plays, 3, "only genuine-fan plays counted");
  assert.equal(l.listeners, 2, "only genuine-fan listeners counted");
  assert.equal(l.excludedPlays, 7, "all non-fan plays surfaced as excluded");
});

test("sanity: total seeded plays = fan plays + excluded plays (nothing lost)", async () => {
  const k = await computeKpis(scope(), range());
  const total = await exec(sql`
    SELECT COUNT(*)::int AS n FROM analytics_events
     WHERE name = 'play_start' AND payload->>'songId' = ${songId}
  `);
  assert.equal((total.rows as any[])[0].n, k.plays + k.excludedPlays, "no play is silently dropped");
});
