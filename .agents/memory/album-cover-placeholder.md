---
name: Branded album-cover placeholder
description: One shared AlbumCover decides every cover fill (real art → ghosted artist photo → brand tile); never inline a raw album-art <img> that can break.
---

# Branded album-cover placeholder

`client/src/components/ui/AlbumCover.tsx` is the SINGLE component that decides
what fills an album's square cover, so a cover never shows the browser's
broken-image "?" glyph. Decision order: real artwork that loads → ghosted artist
photo (grayscale + darken + navy scrim) + album name → brand-toned navy tile +
name.

**Why:** every cover surface used to inline `<img src={album.artwork}>`, so a
null OR dead URL rendered the broken glyph. One component fixes all surfaces at
once and keeps the placeholder identical everywhere.

**How to apply:**
- A cover that can ever be missing/dead must route through `AlbumCover`, OR (when
  a surface keeps its own special-shaped `<img>`, e.g. the GoodDeed cert) it must
  carry an `onError` → render the placeholder. Missing-only (`artwork ? img :
  placeholder`) is NOT enough — a dead URL still breaks; you must also handle the
  load error.
- The ghosted fallback needs the primary artist's photo on the album payload as
  `artistPhoto` (a `people` leftJoin in the album reads, mirrored onto the shared
  + client album types and `PlayerAlbum`). Any NEW album read OR hand-built
  `PlayerAlbum`/song mapping that feeds a cover must thread `artistPhoto`, or it
  silently degrades to the brand tile even when a photo exists.
- The full-screen `Player.tsx` and the AdminAlbums list were intentionally out of
  scope for the first pass.
