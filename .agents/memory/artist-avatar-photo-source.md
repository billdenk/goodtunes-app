---
name: Artist avatar photo source
description: Where fan artist-avatar surfaces must get the artist photo, and why the static ARTIST_PHOTOS map silently shows album covers.
---

Any fan surface that renders an **artist avatar** must resolve the photo from
`/api/people` first, then the static `ARTIST_PHOTOS` map, then album artwork —
in that order, matched by `name.trim().toLowerCase()`.

**Why:** `ARTIST_PHOTOS` (client/src/data/musicData.ts) contains ONLY
`"Nick Carter"`. A surface that reads it alone and falls back to
`artist.albums[0].artwork` shows the **album cover** as the avatar for every
other artist. This is exactly what happened on desktop Collection → Artists:
Nightbirde rendered her "Hope" album cover instead of her real photo.

**How to apply:**
- Add `useQuery(['/api/people'])` (shared queryKey with ArtistDetail /
  FavoriteArtists, so it's usually a cached/free read) and build a
  `Map<nameLower, photoUrl>`; prefer it over `ARTIST_PHOTOS`.
- Gate the album-art fallback on `isLoading` (peopleLoading): while people are
  loading, render a gradient-initial placeholder, NOT the album cover, or the
  wrong image flashes before the real photo resolves.
- Known artist-avatar surfaces: `CollectionArtists` (Collection.tsx — list +
  lg grid), `FavoriteArtists.tsx`, `ArtistDetail.tsx`. The first two had/has a
  local avatar component; keep the resolve order identical across all three.
- Person name must match the album's `artist` string exactly (after
  trim/lowercase); aliases/punctuation differences silently miss.
