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
// Soft-delete coverage (the audit must ignore trashed songs + credit rows).
const trashedSongAlbum = id("album-trashed-song");
const deletedWriterAlbum = id("album-deleted-writer");
const deletedAlbum = id("album-deleted");

const allAlbumIds = [
  completeAlbum,
  instrumentalAlbum,
  missingMasterAlbum,
  missingLyricsAlbum,
  missingCreditsAlbum,
  emptyAlbum,
  nonGoodtunesAlbum,
  trashedSongAlbum,
  deletedWriterAlbum,
  deletedAlbum,
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
    // Soft-delete the song itself (sets songs.deleted_at).
    deleted?: boolean;
    // Soft-delete the credit rows (sets track_writers/performers.deleted_at)
    // while leaving the row in place, mimicking the album editor's delete.
    writerDeleted?: boolean;
    performerDeleted?: boolean;
  },
) {
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number, mux_status, instrumental, lyrics, deleted_at)
    VALUES (${songId}, ${albumId}, ${"Track " + songId}, 1,
            ${opts.muxStatus ?? null}, ${opts.instrumental ?? false}, ${opts.lyrics ?? null},
            ${opts.deleted ? sql`now()` : null})
  `);
  if (opts.writer) {
    await exec(sql`
      INSERT INTO track_writers (song_id, name, role, position, deleted_at)
      VALUES (${songId}, 'A Writer', 'Composer', 0, ${opts.writerDeleted ? sql`now()` : null})
    `);
  }
  if (opts.performer) {
    await exec(sql`
      INSERT INTO track_performers (song_id, name, role, position, deleted_at)
      VALUES (${songId}, 'A Performer', 'Guitar', 0, ${opts.performerDeleted ? sql`now()` : null})
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

  // 8. Soft-deleted song: one fully-complete live track PLUS a trashed,
  //    master-less song. The trashed song's deleted_at must keep it out of the
  //    audit entirely — counting it would (a) inflate trackCount and (b) drop
  //    the album into the audit because of its missing master. With the filter
  //    working the album is COMPLETE and must be EXCLUDED.
  await seedAlbum(trashedSongAlbum);
  await seedSong(id("song-live"), trashedSongAlbum, {
    muxStatus: "ready",
    lyrics: "words",
    writer: true,
    performer: true,
  });
  await seedSong(id("song-trashed"), trashedSongAlbum, {
    muxStatus: null, // master-less — would mark the album incomplete if counted
    lyrics: null,
    deleted: true,
  });

  // 9. Soft-deleted writer credit: a single track that is otherwise complete
  //    (ready master, lyrics, a live performer) but whose ONLY writer row is
  //    soft-deleted. The EXISTS subquery filters on deleted_at IS NULL, so the
  //    live credits are performer-only → creditsComplete must be 0 and the
  //    album must be INCLUDED. A regression that counted deleted credit rows
  //    would report creditsComplete = 1 and silently drop the album.
  await seedAlbum(deletedWriterAlbum);
  await seedSong(id("song-delwriter"), deletedWriterAlbum, {
    muxStatus: "ready",
    lyrics: "words",
    writer: true,
    writerDeleted: true,
    performer: true,
  });

  // 10. Soft-deleted album: incomplete (master-less song) but a.deleted_at is
  //     set, so it must never appear regardless of completeness.
  await seedAlbum(deletedAlbum);
  await exec(sql`UPDATE albums SET deleted_at = now() WHERE id = ${deletedAlbum}`);
  await seedSong(id("song-delalbum"), deletedAlbum, { muxStatus: null });
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

test("a soft-deleted (trashed) song is ignored and doesn't skew the audit", async () => {
  const { rows } = await incompleteAlbums();
  // The album's only live track is complete, so the trashed master-less song
  // must NOT pull it into the audit.
  assert.equal(
    byId(rows, trashedSongAlbum),
    undefined,
    "a trashed master-less song must not count against an otherwise-complete album",
  );
});

test("a soft-deleted credit row is not counted toward creditsComplete", async () => {
  const { rows } = await incompleteAlbums();
  const row = byId(rows, deletedWriterAlbum);
  assert.ok(row, "an album whose only writer credit is trashed must appear");
  assert.equal(row!.trackCount, 1);
  assert.equal(row!.mastersReady, 1);
  assert.equal(row!.lyricsSatisfied, 1);
  assert.equal(
    row!.creditsComplete,
    0,
    "a soft-deleted writer leaves the track performer-only, so credits are incomplete",
  );
});

test("a soft-deleted album never appears, however incomplete", async () => {
  const { rows } = await incompleteAlbums();
  assert.equal(
    byId(rows, deletedAlbum),
    undefined,
    "albums with deleted_at set are excluded from the audit",
  );
});
