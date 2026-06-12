// Task #1995 — guard the Add-gear track picker cleanup from Task #1993.
//
// The admin Person → "+ Add gear" panel renders one group per release
// (header + per-release "Select all" + checkbox track rows). Two data-shape
// bugs made it look broken, and these tests pin the fixes so a future change
// to the gear-context builders can't silently reintroduce them:
//
//   1. Empty streaming-catalog shells (releases where the person is the
//      primary artist but no real songs exist) rendered a header + a dead
//      "Select all" with nothing beneath it.
//   2. Soft-deleted songs leaked in as selectable rows.
//
// We exercise the two storage builders directly against the real DB:
//   - getPersonGearContext(personId)  — the own/credited catalog list.
//   - searchPersonGearTracks(personId, query) — the "search all releases"
//     fallback.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/personGearContext.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";

const exec = (q: any) => db.execute(q);

// A unique tag stamped into every seeded album + song title so the
// title-LIKE search only ever matches THIS test's rows in the shared dev DB.
const TAG = "t1995_" + randomUUID().slice(0, 8);

const created = {
  people: new Set<string>(),
  albums: new Set<string>(),
};

let personId = "";
// A_mix: 2 live tracks + 1 soft-deleted track (the real-world "Waves" case).
let albumMixId = "";
let liveTrack1Id = "";
let liveTrack2Id = "";
let deletedTrackId = "";
// A_emptyDeleted: a release whose ONLY song is soft-deleted (must drop).
let albumEmptyDeletedId = "";
let emptyDeletedSongId = "";
// A_emptyShell: a streaming-catalog shell with zero songs (must drop).
let albumEmptyShellId = "";

async function seedPerson(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${id}, ${TAG + " person"})`);
  created.people.add(id);
  return id;
}

async function seedAlbum(title: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, year, primary_artist_id, is_goodtunes_release)
    VALUES (${id}, ${title}, ${TAG + " artist"}, ${""}, ${2024}, ${personId}, ${true})
  `);
  created.albums.add(id);
  return id;
}

async function seedSong(
  albumId: string,
  title: string,
  trackNumber: number,
  deleted: boolean,
): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number, deleted_at)
    VALUES (${id}, ${albumId}, ${title}, ${trackNumber}, ${deleted ? new Date() : null})
  `);
  return id;
}

before(async () => {
  personId = await seedPerson();

  albumMixId = await seedAlbum(`${TAG} Waves`);
  liveTrack1Id = await seedSong(albumMixId, `${TAG} Live One`, 1, false);
  liveTrack2Id = await seedSong(albumMixId, `${TAG} Live Two`, 2, false);
  deletedTrackId = await seedSong(albumMixId, `${TAG} Deleted Ghost`, 3, true);

  albumEmptyDeletedId = await seedAlbum(`${TAG} EmptyDeleted`);
  emptyDeletedSongId = await seedSong(albumEmptyDeletedId, `${TAG} Only Deleted`, 1, true);

  albumEmptyShellId = await seedAlbum(`${TAG} EmptyShell`);
});

// ─── getPersonGearContext — own/credited catalog list ─────────────────

test("getPersonGearContext drops empty releases and excludes soft-deleted tracks", async () => {
  const ctx = await storage.getPersonGearContext(personId);
  const byId = new Map(ctx.map((a) => [a.albumId, a] as const));

  // Empty streaming-catalog shells never reach the picker.
  assert.equal(
    byId.has(albumEmptyShellId),
    false,
    "a release with zero songs is dropped (no dead 'Select all')",
  );
  assert.equal(
    byId.has(albumEmptyDeletedId),
    false,
    "a release whose only song is soft-deleted is dropped",
  );

  // The mixed release stays, showing ONLY its live tracks.
  const mix = byId.get(albumMixId);
  assert.ok(mix, "the release with live tracks is kept");
  const trackIds = mix!.tracks.map((t) => t.songId).sort();
  assert.deepEqual(
    trackIds,
    [liveTrack1Id, liveTrack2Id].sort(),
    "only the live tracks appear — the soft-deleted one is filtered out",
  );
  assert.equal(
    mix!.tracks.some((t) => t.songId === deletedTrackId),
    false,
    "the soft-deleted track is never a selectable row",
  );
});

// ─── searchPersonGearTracks — "search all releases" fallback ──────────

test("searchPersonGearTracks excludes soft-deleted matches and empty releases", async () => {
  const results = await storage.searchPersonGearTracks(personId, TAG);
  const byId = new Map(results.map((a) => [a.albumId, a] as const));

  // Only the release with at least one live track comes back. The
  // album titles of all three seeded releases contain TAG, but the two
  // empty ones have no live song to anchor a group.
  assert.equal(
    byId.has(albumEmptyShellId),
    false,
    "a zero-song release is not returned even though its title matches",
  );
  assert.equal(
    byId.has(albumEmptyDeletedId),
    false,
    "a release whose only matching song is soft-deleted is not returned",
  );

  const mix = byId.get(albumMixId);
  assert.ok(mix, "the release with live matching tracks is returned");
  const trackIds = mix!.tracks.map((t) => t.songId).sort();
  assert.deepEqual(
    trackIds,
    [liveTrack1Id, liveTrack2Id].sort(),
    "only live tracks are returned",
  );
  assert.equal(
    mix!.tracks.some((t) => t.songId === deletedTrackId),
    false,
    "the soft-deleted match is excluded",
  );
});

after(async () => {
  try {
    for (const id of created.albums) {
      await exec(sql`DELETE FROM songs WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
    for (const id of created.people) {
      await exec(sql`DELETE FROM people WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
