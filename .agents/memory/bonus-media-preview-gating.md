---
name: Bonus media preview gating
description: How locked album bonus video posters / photos are kept from leaking to non-owners (server-side blurred preview route).
---

# Bonus media (Videos/Photos) leak prevention

Album bonus **video posters** and **photos** are publicly-fetchable `/objects/uploads/<id>` masters. A CSS blur on a locked tile is cosmetic only — the raw URL still ships in the markup (view-source / Reader / DOM). So they must be gated **server-side**, exactly like the Mux-only audio precedent.

**Rule:** a non-owner must NEVER receive the original poster/photo URL. Gate on **(admin OR `storage.userOwnsAlbum`)**, never host/is-fan.

**How it works:**
- `/api/albums/:id/videos` and `/photos` (server/routes.ts): admin/owner get the real `posterUrl`/`photoUrl`; everyone else gets `/api/album-media/:kind/:id/preview`. Helper `bonusMediaViewerAccess(req, albumId)` resolves admin/owns.
- `/api/album-media/:kind/:id/preview` looks up the row **BY ID** (never a client-supplied URL), then `renderBonusMediaPreview()` (server/bonusMediaPreview.ts) reads source bytes (object storage direct for `/objects/`, SSRF-guarded fetch for absolute http(s)) and streams a tiny downscaled + blurred WebP. Blur is baked into the bytes → no recoverable original. Brand-navy fallback tile on missing/failed source. No auth gate (the bytes are a safe smear).
- Global search (`/api/search`) gates video/photo `thumbUrl` the same way (precompute per-album ownership set + admin flag).

**Why these 3 surfaces:** mobile `AlbumBonusContent` + desktop `AlbumDetailDesktop` both fetch the SAME two endpoints, and admin CMS (`AdminAlbum` BonusVideos/BonusPhotos) reuses the SAME query keys — so gating the two endpoints (with `isAdminUser` short-circuit) covers album pages AND keeps admin full media. Search is the separate third surface.

**Client needs NO change:** locked tiles already render `posterUrl`/`photoUrl`, which now carry the gated preview URL; the existing CSS blur is harmless defense-in-depth.

**Gotcha:** dev DB has no `album_videos`/`album_photos` rows (Hope's bonus media is prod-only) — seed a test row pointing at an existing `/objects/uploads/...` asset to verify. Search only surfaces bonus media for **fan-visible** parent albums (not hidden/prepping/non-goodtunes), so seed against such an album. Column is `albums.is_goodtunes_release` (not `is_good_tunes_release`).
