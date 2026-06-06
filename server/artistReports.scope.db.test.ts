// Cross-tenant scoping coverage for manager (and label) artist drill-through.
// Task #1425 — a manager who drills into a roster artist must see ONLY that
// artist's owned catalog, never the artist's guest credits on OTHER artists'
// albums (off-roster catalog/play-metric leak). Exercises the dataset-narrowing
// helper computeArtistDatasetScope directly against a real Postgres, so it
// doesn't need a seeded session/membership row.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/artistReports.scope.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { computeArtistDatasetScope } from "./artistReports";

const exec = (q: any) => db.execute(q);

const id = (p: string) => `mgrscope-test-${p}-${randomUUID().slice(0, 8)}`;
const managerId = id("manager");
const labelId = id("label");
const rosterPerson = id("person"); // the act on the manager's roster
const ownedAlbum = id("album-owned"); // released by the roster artist
const ownedSong = id("song-owned");
const otherAlbum = id("album-other"); // someone else's album
const otherSong = id("song-guest"); // roster artist is a GUEST credit here

before(async () => {
  await exec(sql`
    INSERT INTO managers (id, name) VALUES (${managerId}, 'Test Manager Co')
  `);
  await exec(sql`
    INSERT INTO labels (id, name) VALUES (${labelId}, 'Test Label Co')
  `);
  // Roster artist tagged to the manager (people.manager_id is the roster link).
  await exec(sql`
    INSERT INTO people (id, name, manager_id) VALUES (${rosterPerson}, 'Roster Artist', ${managerId})
  `);
  // The roster artist's OWN album + song.
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${ownedAlbum}, 'Owned LP', 'Roster Artist', 'x', ${rosterPerson})
  `);
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${ownedSong}, ${ownedAlbum}, 'Owned Song', 1)
  `);
  // A DIFFERENT artist's album + song; the roster artist only guests on it.
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${otherAlbum}, 'Other Artist LP', 'Some Other Artist', 'x')
  `);
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${otherSong}, ${otherAlbum}, 'Guest Song', 1)
  `);
  // Guest credit: the roster artist performs on the OTHER album's song.
  await exec(sql`
    INSERT INTO track_performers (song_id, person_id, name, role, position)
    VALUES (${otherSong}, ${rosterPerson}, 'Roster Artist', 'Featured', 0)
  `);
});

after(async () => {
  await exec(sql`DELETE FROM track_performers WHERE song_id = ${otherSong}`);
  await exec(sql`DELETE FROM songs WHERE id IN (${ownedSong}, ${otherSong})`);
  await exec(sql`DELETE FROM albums WHERE id IN (${ownedAlbum}, ${otherAlbum})`);
  await exec(sql`DELETE FROM people WHERE id = ${rosterPerson}`);
  await exec(sql`DELETE FROM managers WHERE id = ${managerId}`);
  await exec(sql`DELETE FROM labels WHERE id = ${labelId}`);
  await pool.end();
});

test("manager drill-through sees the roster artist's owned catalog", async () => {
  const scope = await computeArtistDatasetScope(rosterPerson, "manager", managerId);
  assert.ok(scope.albumIds.includes(ownedAlbum), "owned album must be in scope");
  assert.ok(scope.songIds.includes(ownedSong), "owned song must be in scope");
  assert.ok(scope.ownedSongIds.includes(ownedSong), "owned song must be in ownedSongIds");
});

test("manager drill-through does NOT leak guest-credit songs on off-roster albums", async () => {
  const scope = await computeArtistDatasetScope(rosterPerson, "manager", managerId);
  assert.ok(!scope.albumIds.includes(otherAlbum), "off-roster album must not be in scope");
  assert.ok(!scope.songIds.includes(otherSong), "guest-credit song must not leak into song scope");
});

test("label drill-through also drops the guest-credit union (parity)", async () => {
  // Label callers get the same protection; verifies the shared roster-partner
  // guard, not just the manager branch.
  const scope = await computeArtistDatasetScope(rosterPerson, "label", labelId);
  assert.ok(!scope.songIds.includes(otherSong), "label must not see guest-credit song either");
});

test("self-view artist DOES keep their guest credits (union not dropped)", async () => {
  // The artist viewing their own dashboard still sees songs they're credited
  // on elsewhere — only roster-partner callers lose the union.
  const scope = await computeArtistDatasetScope(rosterPerson, "artist", rosterPerson);
  assert.ok(scope.songIds.includes(ownedSong), "owned song still present");
  assert.ok(scope.songIds.includes(otherSong), "self-view keeps guest-credit song");
});
