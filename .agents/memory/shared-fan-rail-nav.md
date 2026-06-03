---
name: Shared desktop fan rail nav
description: The desktop fan rail's nav items live in one shared component so the album-page rail and storefront rail stay identical.
---

# Shared desktop fan rail nav

The desktop fan rail's middle nav (Search · Collection[Albums/Songs/Artists] ·
Playlists · Recents) lives in **one** shared component (`FanRailNav`). Two
hosts render it and must keep doing so or they drift:

- the storefront rail (`StorefrontSidebar`, fixed left rail on
  storefront/account/artist pages), and
- the album-page rail (`AlbumDesktopSidebar`, used by `AlbumDetailDesktop`).

Each host keeps its OWN brand header + account footer; only the nav items are
shared. The album rail passes `onSearch` so Search swaps content in-page
(search mode); the storefront omits it so Search routes to `/search`.

**Why:** the two rails used to be hand-maintained copies with different items
(album rail had Discover/Songs/Artists + Support/Notifications + a blue
indicator bar; storefront had Library/Search/Recents/Playlists). They drifted.
A single source keeps them byte-identical and on Apple Music's rounded-highlight
treatment (no blue bar).

**How to apply:** add/remove/reorder rail items only in `FanRailNav`. Don't
re-introduce per-rail nav rows. Active highlight comes from a `FanRailActive`
descriptor each host computes from the URL.

## Collection tab is URL-driven
`/collection` reads its active lens from `?tab=` (`songs`/`artists`, else
`albums`); `setTab` just navigates. This is what lets the rail's Collection
sub-items deep-link into Songs/Artists and makes browser back/forward work.
The mockup-sandbox keeps its own parallel rail copy — leave it alone.
