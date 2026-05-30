---
name: Album bonus media (videos/photos) single CMS surface
description: Which component owns fan-facing album videos/photos, and the duplicate trap to avoid
---

Fan album bonus videos/photos come ONLY from the CMS endpoints
`GET /api/albums/:id/videos|photos`. There is exactly one rendering
surface per platform:
- Mobile: `AlbumBonusContent` (in `client/src/pages/AlbumDetail.tsx`),
  passed as `bonusSlot` to `AlbumDetailMobileSurface`. Same component is
  reused by the admin album previews (AlbumPreviewCard /
  AlbumDesktopPreviewCard), which is what keeps previews in lock-step.
- Desktop: `DesktopAlbumView` BonusGrid, fed by `AlbumDetailDesktop`'s
  own useQuery on the same endpoints.

**Why this matters:** there used to be a SECOND mobile surface — a static
`editorialPanel` reading `album.videos`/`album.photos` from
`musicData.ts` (hardcoded TOMMYGUNN demo + Big Buck Bunny clips). It
rendered as `children` alongside the CMS `bonusSlot`, so fans saw bonus
media twice. Removed in the "remove hardcoded album videos & photos"
work.

**How to apply:** never reintroduce a per-album videos/photos array in
`musicData.ts` or a second editorial render path. Add bonus-media
behavior to `AlbumBonusContent` (mobile) + `DesktopAlbumView` BonusGrid
(desktop) so fan and admin-preview stay identical. Note the surfaces are
NOT yet consistent on ownership gating: desktop locks via
`locked={!isOwned}`, mobile does not.
