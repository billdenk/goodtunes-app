// Task #1074 / #1081 — single source of truth for the desktop fan rail's
// URL→state logic so the rail highlight (StorefrontSidebar's railActive) and
// the Collection page's active tab stay in lock-step and stay testable. These
// are pure string helpers: no React, no wouter, no `@/` imports — the test
// runner (node:test via tsx, shared/server glob only) imports this module
// directly, so it must have zero DOM/alias dependencies.

export type CollectionTab = "albums" | "songs" | "artists";

export type FanRailActive =
  | { kind: "search" }
  | { kind: "collection"; tab: CollectionTab }
  | { kind: "playlists" }
  | { kind: "recents" }
  | null;

/** Derive the active Collection tab from a URL search string (`?tab=...`).
 *  Anything other than songs/artists (missing, "albums", garbage) → albums. */
export function deriveCollectionTab(searchStr: string): CollectionTab {
  const tabParam = new URLSearchParams(searchStr).get("tab");
  return tabParam === "songs"
    ? "songs"
    : tabParam === "artists"
      ? "artists"
      : "albums";
}

/** Map the current location (pathname) + search string to the rail's active
 *  descriptor. Mirrors the precedence the storefront sidebar relies on:
 *  search > collection > playlists > recents > none. */
export function computeRailActive(
  location: string,
  searchStr: string,
): FanRailActive {
  if (location.startsWith("/search")) return { kind: "search" };
  if (location === "/collection")
    return { kind: "collection", tab: deriveCollectionTab(searchStr) };
  if (location === "/playlists" || location.startsWith("/playlist"))
    return { kind: "playlists" };
  if (location.startsWith("/recents")) return { kind: "recents" };
  return null;
}

/** The URL a Collection tab links to. Albums is the bare `/collection`
 *  (default tab, keeps the canonical URL clean); songs/artists carry `?tab=`. */
export function collectionTabHref(tab: CollectionTab): string {
  return tab === "albums" ? "/collection" : `/collection?tab=${tab}`;
}
