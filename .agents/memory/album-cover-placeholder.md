---
name: Branded album-cover placeholder
description: One shared AlbumCover decides every cover fill (real art → ghosted artist photo → brand tile); never drop a raw album-art <img> again.
---

# Branded album-cover placeholder

`client/src/components/ui/AlbumCover.tsx` is the SINGLE place that decides what
fills an album's square cover, so a cover never shows the browser's broken-image
"?" glyph. Decision order:

1. Real `artwork` present and loads → `<img>` (unchanged behavior).
2. Artwork missing OR its URL is dead (`onError`) → primary artist's profile
   photo, ghosted (grayscale + darken + navy scrim) with the album name overlaid.
3. No artist photo → brand-toned navy tile (`var(--brand-bg)` + blue/purple
   glows) with the name.

It's a drop-in `w-full h-full` fill; callers keep their own sized/rounded/
overflow-hidden wrapper + overlays. `showName={false}` on tiny surfaces (dock,
mini-player, cert thumbnail). `decorative` for stacked multi-owned copies.

**Why:** every cover surface used to inline `<img src={album.artwork}>`, so a
null/dead URL rendered the broken glyph. Consolidating fixes all surfaces at once
and keeps the placeholder identical everywhere.

**How to apply:**
- A cover that can ever be missing/dead must route through `AlbumCover`, OR (when
  a surface keeps its own special-shaped `<img>`, e.g. the GoodDeed cert) it must
  carry an `onError` → render the placeholder. Missing-only (`artwork ? img :
  placeholder`) is NOT enough — a dead URL still breaks; you must also handle the
  load error.
- The fallback needs the artist photo on the album payload: it's `artistPhoto`,
  a `people` leftJoin (`r.people?.photoUrl ?? null`) added to all four
  `getAlbum*` reads in `server/storage.ts`, on `AlbumWithLabel` (shared/schema.ts)
  and client `Album` (musicData.ts). Any NEW album read that feeds a cover must
  thread `artistPhoto` too, or it silently falls to the brand tile.
- Wired surfaces (Task #1884): AlbumCard, AlbumDetailMobileSurface,
  DesktopAlbumView, AdminAlbum cover thumbnail, MiniPlayer (dock + collapsed +
  expanded), AlbumDetailDesktop dock, GoodDeedCertificate. The full-screen
  `Player.tsx` and AdminAlbums list were intentionally OUT of scope.
- The dock/mini cover value depends on the queue source's album; if it lacks
  `artistPhoto` it degrades to the brand tile (acceptable — never a broken glyph).
- design-lint flags raw brand hex even inside JS string gradients/styles: use
  `var(--brand-bg)` and `rgba(var(--brand-bg-rgb), a)`, not `#00062B`.
