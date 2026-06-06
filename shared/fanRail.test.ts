import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRailActive,
  HOME_HREF,
  COLLECTION_HREF,
  COLLECTION_SONGS_HREF,
  COLLECTION_ARTISTS_HREF,
} from "../client/src/lib/fanRail";

// Task #1081 / #1376 — the fan nav highlight (desktop rail + mobile dock) is
// derived from the URL. These tests lock the URL→state mapping so a future
// change to routes can't silently break the rail highlight or the Collection
// deep-links. The pure logic lives in client/src/lib/fanRail.ts; both
// StorefrontSidebar (railActive) and BottomNav consume it.

test("computeRailActive maps /search to the search item", () => {
  assert.deepEqual(computeRailActive("/search"), { kind: "search" });
  assert.deepEqual(computeRailActive("/search/anything"), { kind: "search" });
});

test("computeRailActive maps /home to home", () => {
  assert.deepEqual(computeRailActive("/home"), { kind: "home" });
});

test("computeRailActive maps the Collection landing + detail views", () => {
  assert.deepEqual(computeRailActive("/collection"), { kind: "collection" });
  assert.deepEqual(computeRailActive("/collection/songs"), { kind: "songs" });
  assert.deepEqual(computeRailActive("/collection/artists"), {
    kind: "artists",
  });
});

test("computeRailActive maps /playlists (and /playlist/:id) to playlists", () => {
  assert.deepEqual(computeRailActive("/playlists"), { kind: "playlists" });
  assert.deepEqual(computeRailActive("/playlist/abc123"), {
    kind: "playlists",
  });
});

test("computeRailActive maps /recents to recents", () => {
  assert.deepEqual(computeRailActive("/recents"), { kind: "recents" });
});

test("computeRailActive returns null for routes the nav does not own", () => {
  assert.equal(computeRailActive("/account"), null);
  assert.equal(computeRailActive("/artist/nightbirde"), null);
  assert.equal(computeRailActive("/bookmarks"), null);
  assert.equal(computeRailActive("/album/1"), null);
  // "/" is always a redirect hub, never rendered — the nav never owns it.
  assert.equal(computeRailActive("/"), null);
});

test("computeRailActive precedence: detail views win over the bare landing", () => {
  // an unknown /collection sub-path is NOT the collection landing
  assert.equal(computeRailActive("/collection/extra"), null);
});

test("hrefs are the canonical route strings the nav links to", () => {
  assert.equal(HOME_HREF, "/home");
  assert.equal(COLLECTION_HREF, "/collection");
  assert.equal(COLLECTION_SONGS_HREF, "/collection/songs");
  assert.equal(COLLECTION_ARTISTS_HREF, "/collection/artists");
});

test("each canonical href derives back to its own active descriptor", () => {
  assert.deepEqual(computeRailActive(HOME_HREF), { kind: "home" });
  assert.deepEqual(computeRailActive(COLLECTION_HREF), { kind: "collection" });
  assert.deepEqual(computeRailActive(COLLECTION_SONGS_HREF), { kind: "songs" });
  assert.deepEqual(computeRailActive(COLLECTION_ARTISTS_HREF), {
    kind: "artists",
  });
});
