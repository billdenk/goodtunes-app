// Task #1074 / #1081 / #1376 — single source of truth for the fan nav's
// URL→state logic so the desktop rail highlight (StorefrontSidebar's
// railActive), the mobile dock, and the page routes stay in lock-step and
// stay testable. These are pure string helpers: no React, no wouter, no `@/`
// imports — the test runner (node:test via tsx, shared/server glob only)
// imports this module directly, so it must have zero DOM/alias dependencies.
//
// Task #1376 — the Apple-Music restructure: the fan shell is now Home ·
// Collection · Recents (+ a standalone Search). Home is the owned-albums
// grid (`/home`); Collection is the Apple-Library landing list (`/collection`)
// whose Songs / Artists rows deep-link into dedicated detail views
// (`/collection/songs`, `/collection/artists`). Playlists is no longer a
// top-level tab — it folds under Collection (still reachable at `/playlists`).

export type FanRailActive =
  | { kind: "search" }
  | { kind: "home" }
  | { kind: "collection" }
  | { kind: "songs" }
  | { kind: "artists" }
  | { kind: "playlists" }
  | { kind: "recents" }
  | null;

/** Canonical hrefs for the Collection detail views, shared by the rail, the
 *  Collection landing list rows, and the page routes so they can't drift. */
export const HOME_HREF = "/home";
export const COLLECTION_HREF = "/collection";
export const COLLECTION_SONGS_HREF = "/collection/songs";
export const COLLECTION_ARTISTS_HREF = "/collection/artists";

/** Map the current location (pathname) to the nav's active descriptor.
 *  Precedence: search > home > collection detail (songs/artists) > collection
 *  landing > playlists > recents > none. Songs/Artists are matched before the
 *  bare `/collection` so the deeper routes win. */
export function computeRailActive(location: string): FanRailActive {
  if (location.startsWith("/search")) return { kind: "search" };
  if (location === "/home") return { kind: "home" };
  if (location === COLLECTION_SONGS_HREF) return { kind: "songs" };
  if (location === COLLECTION_ARTISTS_HREF) return { kind: "artists" };
  if (location === COLLECTION_HREF) return { kind: "collection" };
  if (location === "/playlists" || location.startsWith("/playlist"))
    return { kind: "playlists" };
  if (location.startsWith("/recents")) return { kind: "recents" };
  return null;
}
