// Task #2815 — label + manager dashboards must keep the same three-bucket
// play semantics as the artist dashboard:
//   • primary plays/listeners = FAN-ONLY (NOT nonFanListen),
//   • grant plays/listeners   = comp/preview grant holders (grantListen),
//   • staff/internal          = excluded from BOTH buckets.
// Conservation: total seeded plays == fan + grant + staff (nothing lost,
// nothing double-counted).
//
// Exercises computeKpis in server/labelReports.ts and server/managerReports.ts
// against a real Postgres (DATABASE_URL). Seed mirrors
// server/artistReports.exclusion.db.test.ts. All rows torn down in `after`.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { computeKpis as labelKpis, computeTopTracks as labelTopTracks, type LabelScope } from "./labelReports";
import { computeKpis as managerKpis, computeTopTracks as managerTopTracks, type ManagerScope } from "./managerReports";
import { staffInternalListen } from "./artistReports";

const exec = (q: any) => db.execute(q);

const tag = randomUUID().slice(0, 8);
const labelId = `lmx-label-${tag}`;
const managerId = `lmx-mgr-${tag}`;
const personId = `lmx-person-${tag}`;
const albumId = `lmx-album-${tag}`;
const songId = `lmx-song-${tag}`;
const adminUserId = `lmx-admin-${tag}`;

// Fan bucket: buyer (2 plays) + anonymous session (1 play) = 3 plays, 2 listeners.
const buyerId = `lmx-buyer-${tag}`;
const paidOrderId = `lmx-order-${tag}`;
const sAnonFan = `lmx-anon-${tag}`;

// Grant bucket: comp holder (2 plays) + preview holder (1 play) = 3 plays, 2 listeners.
const compId = `lmx-comp-${tag}`;
const previewId = `lmx-preview-${tag}`;

// Staff/internal (excluded from both): admin users-row (1) + _internal session (1) = 2.
const sInternal = `lmx-int-${tag}`;

function ev(sessionId: string, payload: Record<string, any>, userId?: string, name = "play_start") {
  return exec(sql`
    INSERT INTO analytics_events (id, name, payload, ts, session_id, user_id)
    VALUES (
      ${randomUUID()}, ${name}, ${JSON.stringify({ albumId, songId, ...payload })}::json,
      now(), ${sessionId}, ${userId ?? null}
    )
  `);
}

function customer(id: string) {
  return exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${id}, ${id}, ${`${id}@example.com`}, ${"LMX Fan"})
  `);
}

function grant(userId: string, isPreview: boolean, previewExpiresAt: string | null) {
  return exec(sql`
    INSERT INTO user_albums (id, user_id, album_id, is_preview, preview_expires_at)
    VALUES (${randomUUID()}, ${userId}, ${albumId}, ${isPreview}, ${previewExpiresAt})
  `);
}

before(async () => {
  await exec(sql`INSERT INTO labels (id, name) VALUES (${labelId}, ${"LMX Test Label"})`);
  await exec(sql`INSERT INTO managers (id, name) VALUES (${managerId}, ${"LMX Test Mgmt"})`);
  await exec(sql`
    INSERT INTO people (id, name, label_id, manager_id)
    VALUES (${personId}, ${"LMX Artist"}, ${labelId}, ${managerId})
  `);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, label_id, primary_artist_id)
    VALUES (${albumId}, ${"LMX Bucket Test"}, ${"LMX Artist"}, ${"/album-placeholder.svg"}, ${labelId}, ${personId})
  `);
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${songId}, ${albumId}, ${"LMX Track"}, ${1})
  `);
  await exec(sql`
    INSERT INTO users (id, username, email, display_name, password)
    VALUES (${adminUserId}, ${`lmx-admin-${tag}`}, ${`lmx-admin-${tag}@example.com`}, ${"LMX Admin"}, ${"x"})
  `);

  // Fan: genuine buyer, 2 plays.
  await customer(buyerId);
  await grant(buyerId, false, null);
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, created_at)
    VALUES (${paidOrderId}, ${buyerId}, ${albumId}, ${2500}, ${"paid"}, now())
  `);
  await ev(`${sAnonFan}-buyer`, {}, buyerId);
  await ev(`${sAnonFan}-buyer`, {}, buyerId);
  // Fan: anonymous session, 1 play.
  await ev(sAnonFan, {});

  // Grant: comp holder (no order), 2 plays.
  await customer(compId);
  await grant(compId, false, null);
  await ev(`${sInternal}-comp`, {}, compId);
  await ev(`${sInternal}-comp`, {}, compId);
  // Grant: unexpired preview holder, 1 play.
  await customer(previewId);
  await grant(previewId, true, new Date(Date.now() + 86_400_000).toISOString());
  await ev(`${sInternal}-preview`, {}, previewId);

  // Staff/internal: admin users-row (1 play) + internal-stamped session (1 play).
  await ev(`${sInternal}-admin`, {}, adminUserId);
  await ev(sInternal, { _internal: true });

  // Engagement events for the top-tracks split: only the buyer's complete is
  // a fan metric; grant-holder complete and staff favorite must be excluded.
  await ev(`${sAnonFan}-buyer`, {}, buyerId, "play_complete");
  await ev(`${sInternal}-comp`, {}, compId, "play_complete");
  await ev(`${sInternal}-admin`, {}, adminUserId, "favorite_song");
});

after(async () => {
  await exec(sql`DELETE FROM analytics_events WHERE payload->>'songId' = ${songId}`);
  await exec(sql`DELETE FROM orders WHERE id = ${paidOrderId}`);
  await exec(sql`DELETE FROM user_albums WHERE album_id = ${albumId}`);
  await exec(sql`DELETE FROM songs WHERE id = ${songId}`);
  await exec(sql`DELETE FROM customer_users WHERE id IN (${buyerId}, ${compId}, ${previewId})`);
  await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
  await exec(sql`DELETE FROM people WHERE id = ${personId}`);
  await exec(sql`DELETE FROM users WHERE id = ${adminUserId}`);
  await exec(sql`DELETE FROM managers WHERE id = ${managerId}`);
  await exec(sql`DELETE FROM labels WHERE id = ${labelId}`);
  await pool.end();
});

const labelScope = (): LabelScope => ({
  labelId, albumIds: [albumId], songIds: [songId], rosterPersonIds: [personId],
});
const managerScope = (): ManagerScope => ({
  managerId, albumIds: [albumId], songIds: [songId], rosterPersonIds: [personId],
});
const range = () => ({ from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) });

async function seededCounts() {
  const total = await exec(sql`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${staffInternalListen()})::int AS staff
    FROM analytics_events e
    WHERE e.name = 'play_start' AND e.payload->>'songId' = ${songId}
  `);
  return (total.rows as any[])[0] as { total: number; staff: number };
}

test("label KPIs: fan-only plays, grant separate, staff excluded from both", async () => {
  const k = await labelKpis(labelScope(), range());
  assert.equal(k.plays, 3, "fan plays = buyer(2) + anon(1)");
  assert.equal(k.listeners, 2, "fan listeners = buyer + anon session");
  assert.equal(k.grantPlays, 3, "grant plays = comp(2) + preview(1)");
  assert.equal(k.grantListeners, 2, "distinct grant holders");
  assert.equal(k.excludedPlays, 2, "staff/internal footnote count");
});

test("label conservation: total = fan + grant + staff (nothing lost or blended)", async () => {
  const k = await labelKpis(labelScope(), range());
  const { total } = await seededCounts();
  assert.equal(total, k.plays + k.grantPlays + k.excludedPlays, "exact three-way partition");
});

test("manager KPIs: fan-only plays, grant separate, staff excluded from both", async () => {
  const k = await managerKpis(managerScope(), range());
  assert.equal(k.plays, 3, "fan plays = buyer(2) + anon(1)");
  assert.equal(k.listeners, 2, "fan listeners = buyer + anon session");
  assert.equal(k.grantPlays, 3, "grant plays = comp(2) + preview(1)");
  assert.equal(k.grantListeners, 2, "distinct grant holders");
});

test("manager conservation: total = fan + grant + staff (staff in NEITHER bucket)", async () => {
  const k = await managerKpis(managerScope(), range());
  const { total, staff } = await seededCounts();
  assert.equal(staff, 2, "staff/internal plays identified");
  assert.equal(total, k.plays + k.grantPlays + staff, "exact three-way partition");
});

function assertTopTrackRow(row: any) {
  assert.ok(row, "seeded song appears in top tracks");
  assert.equal(row.plays, 3, "fan plays exclude grant + staff");
  assert.equal(row.grantPlays, 3, "grant plays are their own bucket");
  assert.equal(row.completes, 1, "completes are fan-only (grant complete excluded)");
  assert.equal(row.favorites, 0, "staff favorite excluded from fan favorites");
  assert.equal(row.playlistAdds, 0);
  assert.equal(row.shares, 0);
}

test("label top tracks: every metric fan-only, grant separate, staff nowhere; sorted by fan plays", async () => {
  const tracks = await labelTopTracks(labelScope(), range(), 25);
  assertTopTrackRow(tracks.find((t: any) => t.songId === songId));
});

test("manager top tracks: every metric fan-only, grant separate, staff nowhere; sorted by fan plays", async () => {
  const tracks = await managerTopTracks(managerScope(), range(), 25);
  assertTopTrackRow(tracks.find((t: any) => t.songId === songId));
});
