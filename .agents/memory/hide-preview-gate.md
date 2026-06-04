---
name: Hide-preview gate lives only in trackPlaybackState
description: How the per-track "Hide preview" embargo flows end-to-end on the fan surfaces, and the single client gate that decides a "locked" row.
---

The Master tile's **"Hide preview"** toggle writes `songs.previewHidden`
(+ optional `previewHiddenUntil` sunrise). On the fan side it is honored
**end-to-end except for one client helper**:

- Server: `normalizePreviewHide` (server/storage.ts) sends fans
  `isPreviewable = !previewHidden` (sunrise auto-clears the flag).
- Server: `POST /api/songs/:id/playback-url` 403s a not-owned fan on a hidden
  track ("Preview not available") — so a hidden track can never be signed/played.
- Client queues: both `AlbumDetail`/mobile `handlePlayAll` and
  `AlbumDetailDesktop` `playableSongs` already filter `isOwned || isPreviewable`,
  so hidden tracks never enter Play/Shuffle/auto-advance.

**The single UI gate is `shared/trackPlaybackState()`**: `isOwned ? "full"
: isPreviewable === false ? "locked" : "preview"`. Both fan surfaces
(`AlbumDetailMobileSurface`, `DesktopAlbumView`) pass `isPreviewable` in and
already have full "locked" rendering paths (track # + title only, no runtime,
not tappable, small lock icon).

**Why:** During the "store-wide previews" change the helper was flattened to
`isOwned ? "full" : "preview"` — it stopped reading `isPreviewable`, so every
not-owned track rendered as a playable preview row and "Hide preview" silently
did nothing on the fan UI even though the server + queues still enforced it. Bill
wanted the Apple pre-release look back (hidden tracks: number+name, no time, no
play). The fix was purely re-honoring the flag in that one helper.

**How to apply:** If "Hide preview" appears broken on the fan UI, check
`trackPlaybackState` first — the data is already plumbed everywhere else. Don't
re-flatten it to store-wide. `true`/`null`/absent stay store-wide previews; only
an explicit `false` locks. Default fan-facing copy must NOT say "30 sec preview"
(Bill's call) — the visible CTA is just "Play"/"Preview".
