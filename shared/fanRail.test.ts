import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRailActive,
  deriveCollectionTab,
  collectionTabHref,
} from "../client/src/lib/fanRail";

// Task #1081 — the desktop fan rail's highlight and the Collection page's
// active tab are both derived from the URL. These tests lock the URL→state
// mapping so a future change to routes or query parsing can't silently break
// the rail highlight or the Collection deep-links. The pure logic lives in
// client/src/lib/fanRail.ts; StorefrontSidebar (railActive) and Collection
// (tab/setTab) both consume it.

// --- Rail active descriptor (StorefrontSidebar's railActive) ---

test("computeRailActive maps /search to the search item", () => {
  assert.deepEqual(computeRailActive("/search", ""), { kind: "search" });
  // search sub-paths / queries still count as the search item
  assert.deepEqual(computeRailActive("/search", "?q=hope"), { kind: "search" });
});

test("computeRailActive maps /collection to collection with the URL tab", () => {
  assert.deepEqual(computeRailActive("/collection", ""), {
    kind: "collection",
    tab: "albums",
  });
  assert.deepEqual(computeRailActive("/collection", "?tab=songs"), {
    kind: "collection",
    tab: "songs",
  });
  assert.deepEqual(computeRailActive("/collection", "?tab=artists"), {
    kind: "collection",
    tab: "artists",
  });
  // unknown tab value falls back to albums
  assert.deepEqual(computeRailActive("/collection", "?tab=bogus"), {
    kind: "collection",
    tab: "albums",
  });
});

test("computeRailActive maps /playlists (and /playlist/:id) to playlists", () => {
  assert.deepEqual(computeRailActive("/playlists", ""), { kind: "playlists" });
  assert.deepEqual(computeRailActive("/playlist/abc123", ""), {
    kind: "playlists",
  });
});

test("computeRailActive maps /recents to recents", () => {
  assert.deepEqual(computeRailActive("/recents", ""), { kind: "recents" });
});

test("computeRailActive returns null for routes the rail does not own", () => {
  assert.equal(computeRailActive("/account", ""), null);
  assert.equal(computeRailActive("/artist/nightbirde", ""), null);
  assert.equal(computeRailActive("/bookmarks", ""), null);
  assert.equal(computeRailActive("/", ""), null);
});

test("computeRailActive precedence: search wins, only exact /collection is collection", () => {
  // a query string on /search must not be mis-read as a collection tab
  assert.deepEqual(computeRailActive("/search", "?tab=songs"), {
    kind: "search",
  });
  // /collections (plural-ish) or /collection/sub is NOT the collection item
  assert.equal(computeRailActive("/collection/extra", "?tab=songs"), null);
});

// --- Collection tab derivation + setTab navigation target ---

test("deriveCollectionTab reads ?tab=, defaulting to albums", () => {
  assert.equal(deriveCollectionTab(""), "albums");
  assert.equal(deriveCollectionTab("?tab=albums"), "albums");
  assert.equal(deriveCollectionTab("?tab=songs"), "songs");
  assert.equal(deriveCollectionTab("?tab=artists"), "artists");
  // garbage / unknown values fall back to albums, never throw
  assert.equal(deriveCollectionTab("?tab="), "albums");
  assert.equal(deriveCollectionTab("?tab=ARTISTS"), "albums"); // case-sensitive
  assert.equal(deriveCollectionTab("?foo=bar"), "albums");
});

test("deriveCollectionTab tolerates the search string with or without a leading ?", () => {
  assert.equal(deriveCollectionTab("tab=songs"), "songs");
  assert.equal(deriveCollectionTab("?tab=songs"), "songs");
});

test("collectionTabHref builds the URL setTab navigates to", () => {
  // albums is the bare canonical URL (default tab, no query noise)
  assert.equal(collectionTabHref("albums"), "/collection");
  assert.equal(collectionTabHref("songs"), "/collection?tab=songs");
  assert.equal(collectionTabHref("artists"), "/collection?tab=artists");
});

test("collectionTabHref ↔ deriveCollectionTab round-trip", () => {
  for (const tab of ["albums", "songs", "artists"] as const) {
    const href = collectionTabHref(tab);
    const search = href.includes("?") ? href.slice(href.indexOf("?")) : "";
    assert.equal(
      deriveCollectionTab(search),
      tab,
      `href ${href} should derive back to ${tab}`,
    );
  }
});
