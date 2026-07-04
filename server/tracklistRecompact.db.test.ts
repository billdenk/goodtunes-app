// Task #2449 — coverage for gap-free tracklist recompaction on song delete.
//
// After a track is (soft-)deleted from an album, the album's remaining
// non-deleted songs must be renumbered to a gap-free 1..N sequence in
// their existing `track_number` order — server-side, in the shared delete
// path (storage.deleteSong → softDeleteEntity), within the delete's own
// transaction. It must touch ONLY `track_number`, never the vinyl
// side/order fields, and a track added afterwards must still land at N+1
// without colliding.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/tracklistRecompact.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  albums: new Set<string>(),
  songs: new Set<string>(),
};

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t2449 album"}, ${"t2449 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedSong(
  albumId: string,
  trackNumber: number,
  opts: { vinylSide?: string | null; vinylOrder?: number | null } = {},
): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number, vinyl_side, vinyl_order)
    VALUES (${id}, ${albumId}, ${"t2449 track " + trackNumber}, ${trackNumber},
            ${opts.vinylSide ?? null}, ${opts.vinylOrder ?? null})
  `);
  created.songs.add(id);
  return id;
}

// The surviving (non-deleted) tracklist, ordered by track_number.
async function liveTracklist(
  albumId: string,
): Promise<{ id: string; track_number: number; vinyl_side: string | null; vinyl_order: number | null }[]> {
  return rows(await exec(sql`
    SELECT id, track_number, vinyl_side, vinyl_order
      FROM songs
     WHERE album_id = ${albumId} AND deleted_at IS NULL
     ORDER BY track_number ASC, id ASC
  `));
}

test("deleting a middle track recompacts the rest to a gap-free 1..N", async () => {
  const albumId = await seedAlbum();
  const s1 = await seedSong(albumId, 1);
  const s2 = await seedSong(albumId, 2);
  const s3 = await seedSong(albumId, 3);
  const s4 = await seedSong(albumId, 4);
  const s5 = await seedSong(albumId, 5);

  // Delete track 2 → survivors were 1,3,4,5, must become 1,2,3,4.
  await storage.deleteSong(s2);

  const live = await liveTracklist(albumId);
  assert.deepEqual(
    live.map((r) => r.track_number),
    [1, 2, 3, 4],
    "remaining tracks renumber to a gap-free 1..N",
  );
  // Order is preserved: the survivors keep their original relative order.
  assert.deepEqual(
    live.map((r) => r.id),
    [s1, s3, s4, s5],
    "recompaction preserves the existing track order",
  );
});

test("deleting multiple tracks one-by-one stays gap-free each time", async () => {
  const albumId = await seedAlbum();
  const ids = [];
  for (let i = 1; i <= 6; i++) ids.push(await seedSong(albumId, i));

  await storage.deleteSong(ids[0]); // drop track 1
  await storage.deleteSong(ids[5]); // drop the last (now-renumbered) track

  const live = await liveTracklist(albumId);
  assert.deepEqual(
    live.map((r) => r.track_number),
    [1, 2, 3, 4],
    "after two deletes the survivors are still a clean 1..N",
  );
});

test("recompaction never touches vinyl side/order", async () => {
  const albumId = await seedAlbum();
  await seedSong(albumId, 1, { vinylSide: "A", vinylOrder: 1 });
  const s2 = await seedSong(albumId, 2, { vinylSide: "A", vinylOrder: 2 });
  const s3 = await seedSong(albumId, 3, { vinylSide: "B", vinylOrder: 1 });

  await storage.deleteSong(s2);

  const live = await liveTracklist(albumId);
  // track_number recompacted 1,3 → 1,2 …
  assert.deepEqual(live.map((r) => r.track_number), [1, 2]);
  // … but the vinyl fields are untouched (A/1 and B/1, NOT renumbered).
  const survivor3 = live.find((r) => r.id === s3);
  assert.equal(survivor3?.vinyl_side, "B", "vinyl side left as-is");
  assert.equal(survivor3?.vinyl_order, 1, "vinyl order left as-is");
});

test("a track added after a delete lands at N+1 with no collision", async () => {
  const albumId = await seedAlbum();
  const s1 = await seedSong(albumId, 1);
  const s2 = await seedSong(albumId, 2);
  const s3 = await seedSong(albumId, 3);

  await storage.deleteSong(s3); // survivors 1,2 stay 1,2

  // Mirror the admin add-track rule: next = max(track_number)+1.
  const maxRow = rows(await exec(sql`
    SELECT COALESCE(MAX(track_number), 0) AS mx
      FROM songs WHERE album_id = ${albumId} AND deleted_at IS NULL
  `))[0];
  const next = Number(maxRow.mx) + 1;
  assert.equal(next, 3, "the next track number is N+1 with no gap");

  const added = await seedSong(albumId, next);
  const live = await liveTracklist(albumId);
  assert.deepEqual(
    live.map((r) => r.track_number),
    [1, 2, 3],
    "the added track slots in cleanly with no duplicate number",
  );
  assert.deepEqual(
    live.map((r) => r.id),
    [s1, s2, added],
    "survivors keep their identity/order and the new track appends last",
  );
});

after(async () => {
  try {
    for (const id of created.songs) {
      await exec(sql`DELETE FROM songs WHERE id = ${id}`);
    }
    for (const id of created.albums) {
      await exec(sql`DELETE FROM songs WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
