// Guard for the operator "Needs attention" audit (incomplete-albums).
// Task #2006 — the per-track completeness rules in `incompleteAlbums()` MUST
// mirror the album-editor Tracks tab and must never silently drift:
//   - master ready    → songs.mux_status = 'ready'
//   - lyrics satisfied → instrumental OR plain/synced lyrics present
//   - credits complete → the track has BOTH a writer AND a performer
// A fully-complete album must be EXCLUDED; an album short in any single
// dimension must be INCLUDED with the right ready/total counts; and the
// HAVING clause must keep complete albums out. The instrumental exemption
// (no lyrics, still satisfied) is asserted explicitly.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/reports/incompleteAlbums.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { incompleteAlbums, type IncompleteAlbumRow } from "./admin";

const exec = (q: any) => db.execute(q);

const id = (p: string) => `incaudit-test-${p}-${randomUUID().slice(0, 8)}`;
const personId = id("person");

// One album per scenario so each can be asserted independently.
const completeAlbum = id("album-complete");
const instrumentalAlbum = id("album-instrumental");
const missingMasterAlbum = id("album-master");
const missingLyricsAlbum = id("album-lyrics");
const missingCreditsAlbum = id("album-credits");
const emptyAlbum = id("album-empty");
const nonGoodtunesAlbum = id("album-nongt");

const allAlbumIds = [
  completeAlbum,
  instrumentalAlbum,
  missingMasterAlbum,
  missingLyricsAlbum,
  missingCreditsAlbum,
  emptyAlbum,
  nonGoodtunesAlbum,
];

// Seed an album (GoodTunes release by default) plus a song with controllable
// completeness. Credits are added separately so we can omit them per scenario.
async function seedAlbum(
  albumId: string,
  opts: { isGoodtunes?: boolean } = {},
) {
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_goodtunes_release)
    VALUES (${albumId}, ${"Audit " + albumId}, 'Audit Artist', 'x', ${personId},
            ${opts.isGoodtunes ?? true})
  `);
}

async function seedSong(
  songId: string,
  albumId: string,
  opts: {
    muxStatus?: string | null;
    instrumental?: boolean;
    lyrics?: string | null;
    writer?: boolean;
    performer?: boolean;
  },
) {
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number, mux_status, instrumental, lyrics)
    VALUES (${songId}, ${albumId}, ${"Track " + songId}, 1,
            ${opts.muxStatus ?? null}, ${opts.instrumental ?? false}, ${opts.lyrics ?? null})
  `);
  if (opts.writer) {
    await exec(sql`
      INSERT INTO track_writers (song_id, name, role, position)
      VALUES (${songId}, 'A Writer', 'Composer', 0)
    `);
  }
  if (opts.performer) {
    await exec(sql`
      INSERT INTO track_performers (song_id, name, role, position)
      VALUES (${songId}, 'A Performer', 'Guitar', 0)
    `);
  }
}

before(async () => {
  await exec(sql`INSERT INTO people (id, name) VALUES (${personId}, 'Audit Artist')`);

  // 1. Fully complete: ready master, has lyrics, has writer + performer.
  await seedAlbum(completeAlbum);
  await seedSong(id("song-complete"), completeAlbum, {
    muxStatus: "ready",
    lyrics: "la la la",
    writer: true,
    performer: true,
  });

  // 2. Instrumental edge case: ready master, NO lyrics but instrumental=true,
  //    has writer + performer. Instrumental counts as lyrics-satisfied, so this
  //    album is COMPLETE and must be excluded.
  await seedAlbum(instrumentalAlbum);
  await seedSong(id("song-instrumental"), instrumentalAlbum, {
    muxStatus: "ready",
    instrumental: true,
    lyrics: null,
    writer: true,
    performer: true,
  });

  // 3. Missing master: lyrics + credits present, but mux not ready.
  await seedAlbum(missingMasterAlbum);
  await seedSong(id("song-master"), missingMasterAlbum, {
    muxStatus: "preparing",
    lyrics: "words",
    writer: true,
    performer: true,
  });

  // 4. Missing lyrics: ready master + credits, but no lyrics and NOT instrumental.
  await seedAlbum(missingLyricsAlbum);
  await seedSong(id("song-lyrics"), missingLyricsAlbum, {
    muxStatus: "ready",
    lyrics: null,
    instrumental: false,
    writer: true,
    performer: true,
  });

  // 5. Missing credits: ready master + lyrics, but performer only (no writer).
  await seedAlbum(missingCreditsAlbum);
  await seedSong(id("song-credits"), missingCreditsAlbum, {
    muxStatus: "ready",
    lyrics: "words",
    writer: false,
    performer: true,
  });

  // 6. Zero tracks: a GoodTunes release with no songs at all.
  await seedAlbum(emptyAlbum);

  // 7. Non-GoodTunes album that is incomplete — must never appear (the audit is
  //    GoodTunes-releases only).
  await seedAlbum(nonGoodtunesAlbum, { isGoodtunes: false });
  await seedSong(id("song-nongt"), nonGoodtunesAlbum, { muxStatus: null });
});

after(async () => {
  const ids = sql.join(allAlbumIds.map((a) => sql`${a}`), sql`, `);
  // Songs cascade-delete their credits via FK onDelete cascade.
  await exec(sql`DELETE FROM songs WHERE album_id IN (${ids})`);
  await exec(sql`DELETE FROM albums WHERE id IN (${ids})`);
  await exec(sql`DELETE FROM people WHERE id = ${personId}`);
  await pool.end();
});

function byId(rows: IncompleteAlbumRow[], albumId: string) {
  return rows.find((r) => r.id === albumId);
}

test("a fully-complete album is excluded from the audit", async () => {
  const { rows } = await incompleteAlbums();
  assert.equal(byId(rows, completeAlbum), undefined, "complete album must not appear");
});

test("instrumental tracks count as lyrics-satisfied (edge case excluded)", async () => {
  const { rows } = await incompleteAlbums();
  assert.equal(
    byId(rows, instrumentalAlbum),
    undefined,
    "an album whose only track is a credited, ready instrumental is complete",
  );
});

test("an album missing a ready master is included with the right counts", async () => {
  const { rows } = await incompleteAlbums();
  const row = byId(rows, missingMasterAlbum);
  assert.ok(row, "missing-master album must appear");
  assert.equal(row!.trackCount, 1);
  assert.equal(row!.mastersReady, 0, "no ready masters");
  assert.equal(row!.lyricsSatisfied, 1);
  assert.equal(row!.creditsComplete, 1);
});

test("an album missing lyrics is included with the right counts", async () => {
  const { rows } = await incompleteAlbums();
  const row = byId(rows, missingLyricsAlbum);
  assert.ok(row, "missing-lyrics album must appear");
  assert.equal(row!.trackCount, 1);
  assert.equal(row!.mastersReady, 1);
  assert.equal(row!.lyricsSatisfied, 0, "no lyrics and not instrumental");
  assert.equal(row!.creditsComplete, 1);
});

test("an album missing credits is included with the right counts", async () => {
  const { rows } = await incompleteAlbums();
  const row = byId(rows, missingCreditsAlbum);
  assert.ok(row, "missing-credits album must appear");
  assert.equal(row!.trackCount, 1);
  assert.equal(row!.mastersReady, 1);
  assert.equal(row!.lyricsSatisfied, 1);
  assert.equal(row!.creditsComplete, 0, "a writer alone does not complete credits");
});

test("an album with zero tracks is included", async () => {
  const { rows } = await incompleteAlbums();
  const row = byId(rows, emptyAlbum);
  assert.ok(row, "zero-track album must appear");
  assert.equal(row!.trackCount, 0);
  assert.equal(row!.mastersReady, 0);
  assert.equal(row!.lyricsSatisfied, 0);
  assert.equal(row!.creditsComplete, 0);
});

test("non-GoodTunes-release albums never appear, however incomplete", async () => {
  const { rows } = await incompleteAlbums();
  assert.equal(byId(rows, nonGoodtunesAlbum), undefined, "audit is GoodTunes-releases only");
});
