// Task #886 — storage-level coverage for the scheduled-release sunrise gate.
//
// getAlbums / getAlbumById / getAllSongs are thin Drizzle calls, so — as in
// vendorsParent.test.ts — we mirror their fan-vs-admin filter contract here
// against an in-memory dataset instead of standing up a live Postgres. The
// reference filters below are a 1:1 transcription of the WHERE clauses in
// server/storage.ts; if the storage gate drifts from this contract, these
// tests are the canary.
//
//   npx tsx --test server/lib/albumSunriseGate.test.ts
//
// The rule (Task #800): when includeHidden is false (fan reads), a non-null
// goodTunesReleaseDate strictly after today is a "Staged" album and must be
// excluded. Dateless / today / past stay live. Admin reads (includeHidden:
// true) skip the gate so Staged rows stay editable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { todayISODate } from "@shared/albumStage";

type Album = {
  id: string;
  isHidden: boolean;
  deletedAt: string | null;
  goodTunesReleaseDate: string | null;
};

type Song = { id: string; albumId: string; deletedAt: string | null };

const TODAY = todayISODate();
const PAST = "2000-01-01";
// Far enough out that it is always strictly after today, whenever this runs.
const FUTURE = "2999-12-31";

// --- Reference filters: mirror of server/storage.ts WHERE clauses ----------

// getAlbums(opts): isNull(deletedAt) always; when !includeHidden also
// isHidden === false AND (releaseDate is null OR releaseDate <= today).
function getAlbums(
  rows: Album[],
  opts?: { includeHidden?: boolean },
): Album[] {
  return rows.filter((a) => {
    if (a.deletedAt) return false;
    if (!opts?.includeHidden) {
      if (a.isHidden) return false;
      if (a.goodTunesReleaseDate && a.goodTunesReleaseDate > TODAY) return false;
    }
    return true;
  });
}

// getAlbumById(id, opts): fetch by id, then drop for fans if deleted, hidden,
// or future-dated. Returns undefined (== not found) in those cases.
function getAlbumById(
  rows: Album[],
  id: string,
  opts?: { includeHidden?: boolean },
): Album | undefined {
  const row = rows.find((a) => a.id === id);
  if (!row) return undefined;
  if (row.deletedAt) return undefined;
  if (row.isHidden && !opts?.includeHidden) return undefined;
  if (
    !opts?.includeHidden &&
    row.goodTunesReleaseDate &&
    row.goodTunesReleaseDate > TODAY
  ) {
    return undefined;
  }
  return row;
}

// getAllSongs(opts): admin returns every non-deleted song; fans only get
// songs whose album is non-hidden, non-deleted, and past its sunrise.
function getAllSongs(
  albums: Album[],
  songs: Song[],
  opts?: { includeHidden?: boolean },
): Song[] {
  if (opts?.includeHidden) {
    return songs.filter((s) => !s.deletedAt);
  }
  const byId = new Map(albums.map((a) => [a.id, a]));
  return songs.filter((s) => {
    if (s.deletedAt) return false;
    const a = byId.get(s.albumId);
    if (!a) return false;
    if (a.deletedAt) return false;
    if (a.isHidden) return false;
    if (a.goodTunesReleaseDate && a.goodTunesReleaseDate > TODAY) return false;
    return true;
  });
}

// --- Fixtures --------------------------------------------------------------

const ALBUMS: Album[] = [
  { id: "live-dateless", isHidden: false, deletedAt: null, goodTunesReleaseDate: null },
  { id: "live-past", isHidden: false, deletedAt: null, goodTunesReleaseDate: PAST },
  { id: "live-today", isHidden: false, deletedAt: null, goodTunesReleaseDate: TODAY },
  { id: "staged-future", isHidden: false, deletedAt: null, goodTunesReleaseDate: FUTURE },
  { id: "hidden", isHidden: true, deletedAt: null, goodTunesReleaseDate: null },
];

const SONGS: Song[] = [
  { id: "s-dateless", albumId: "live-dateless", deletedAt: null },
  { id: "s-past", albumId: "live-past", deletedAt: null },
  { id: "s-today", albumId: "live-today", deletedAt: null },
  { id: "s-future", albumId: "staged-future", deletedAt: null },
  { id: "s-hidden", albumId: "hidden", deletedAt: null },
];

// --- getAlbums -------------------------------------------------------------

test("getAlbums (fan): excludes the future-dated Staged album", () => {
  const ids = getAlbums(ALBUMS).map((a) => a.id);
  assert.ok(!ids.includes("staged-future"));
});

test("getAlbums (fan): keeps dateless, past, and today albums", () => {
  const ids = getAlbums(ALBUMS).map((a) => a.id).sort();
  assert.deepEqual(ids, ["live-dateless", "live-past", "live-today"]);
});

test("getAlbums (admin includeHidden): returns the Staged album", () => {
  const ids = getAlbums(ALBUMS, { includeHidden: true }).map((a) => a.id);
  assert.ok(ids.includes("staged-future"));
});

// --- getAlbumById ----------------------------------------------------------

test("getAlbumById (fan): future-dated album reads as not-found", () => {
  assert.equal(getAlbumById(ALBUMS, "staged-future"), undefined);
});

test("getAlbumById (fan): today's album is returned", () => {
  assert.equal(getAlbumById(ALBUMS, "live-today")?.id, "live-today");
});

test("getAlbumById (admin includeHidden): future-dated album is returned", () => {
  assert.equal(
    getAlbumById(ALBUMS, "staged-future", { includeHidden: true })?.id,
    "staged-future",
  );
});

// --- getAllSongs -----------------------------------------------------------

test("getAllSongs (fan): omits songs from the future-dated album", () => {
  const ids = getAllSongs(ALBUMS, SONGS).map((s) => s.id);
  assert.ok(!ids.includes("s-future"));
});

test("getAllSongs (fan): omits songs from hidden albums too", () => {
  const ids = getAllSongs(ALBUMS, SONGS).map((s) => s.id);
  assert.ok(!ids.includes("s-hidden"));
});

test("getAllSongs (fan): keeps songs from dateless/past/today albums", () => {
  const ids = getAllSongs(ALBUMS, SONGS).map((s) => s.id).sort();
  assert.deepEqual(ids, ["s-dateless", "s-past", "s-today"]);
});

test("getAllSongs (admin includeHidden): returns the future album's song", () => {
  const ids = getAllSongs(ALBUMS, SONGS, { includeHidden: true }).map((s) => s.id);
  assert.ok(ids.includes("s-future"));
});
