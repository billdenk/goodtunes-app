---
name: Hide-preview gate (preview-hidden = dead for EVERYONE on fan album surfaces)
description: How the per-track "Hide preview" embargo flows end-to-end, and why the fan album surfaces lock a hidden track even for owners (not via the shared helper).
---

The Master tile's **"Hide preview"** toggle writes `songs.previewHidden`
(+ optional `previewHiddenUntil` sunrise). Server sends fans
`isPreviewable = !previewHidden` (sunrise auto-clears the flag), and
`POST /api/songs/:id/playback-url` 403s a **not-owned** fan on a hidden track.

**A preview-hidden track (`isPreviewable === false`) is treated as not-yet-released
and is dead for EVERYONE on the fan album surfaces — including owners and the
operator.** It still renders (full song list is passed for display) as a grayed,
non-tappable "locked" row (number + title, no runtime, no menu), and Play /
Shuffle / track-click / auto-advance can never enqueue it.

**Where the owner-inclusive rule lives (surface-level, NOT the shared helper):**
- `shared/trackPlaybackState()` is UNCHANGED and still returns `"full"` for owners
  (`isOwned ? "full" : isPreviewable===false ? "locked" : "preview"`). Do NOT change
  this contract — other (non-album) owned-playback paths rely on it.
- Fan album surfaces override it for hidden tracks:
  - `DesktopAlbumView` row: `state = isPreviewable===false ? "locked" : trackPlaybackState(...)`, and `isCurrent` is gated `state !== "locked"` so a stale session can't highlight a dead row.
  - `AlbumDetailMobileSurface` row: `locked = song.isPreviewable === false` (no longer calls trackPlaybackState).
  - Queue filters dropped the owner short-circuit: `AlbumDetailDesktop` `playableSongs` and `AlbumDetail` mobile `playableAlbumSongs` both filter `s.isPreviewable !== false` (was `isOwned || ...`). Render uses the FULL list; only the QUEUE list is filtered.

**Why:** "Hide preview" was first built as a *preview* embargo that lifted on
ownership, so an owner (Bill, comped on the Nightbirde album) hit Play and the
hidden headline track "Hope" played. Bill wanted the Apple/McCartney pre-release
treatment for everyone, himself included: gray it, no runtime, dead row, Play
skips to the next track. The release-date sunrise (`previewHiddenUntil`) is the
intended unlock path, not ownership.

**How to apply:** If a hidden track is playing for an owner, fix it at the album
SURFACE (row state + queue filter), never by flattening `trackPlaybackState`.
`true`/`null`/absent stay store-wide previews; only an explicit `false` locks.
Default fan copy must NOT say "30 sec preview" (Bill's call) — the CTA is just
"Play"/"Preview".
