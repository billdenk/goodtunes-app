---
name: Hide-preview gate (per-track preview embargo on fan album surfaces)
description: How the per-track "Hide preview" embargo flows end-to-end, who gets locked (NON-owners), and the mobile field-plumbing pitfall that silently disables the gate.
---

The Master tile's **"Hide preview"** toggle writes `songs.previewHidden`
(+ optional `previewHiddenUntil` sunrise). Server sends fans
`isPreviewable = !previewHidden` (sunrise auto-clears the flag), and
`POST /api/songs/:id/playback-url` 403s a **not-owned** fan on a hidden track.

**Who is locked:** a preview-hidden track (`isPreviewable === false`) is a quiet,
non-tappable "locked" row for **NON-OWNERS** — grayed, number + title only, no
runtime, no menu, dropped from the Play/Shuffle/auto-advance queue. **Owners who
bought the album get the FULL tracklist, embargoed title track included** (both
the mobile and desktop queue filters keep the owner short-circuit). The release-
date sunrise (`previewHiddenUntil`) is the public unlock; ownership is the private
unlock.

**Where the rule lives (surface-level, NOT the shared helper):**
- `shared/trackPlaybackState()` returns `"full"` for owners
  (`isOwned ? "full" : isPreviewable===false ? "locked" : "preview"`). Don't change it.
- Lock + queue gates, per surface (all gate on an explicit `=== false`; `true`/`null`/`undefined` stay previewable):
  - `AlbumDetailMobileSurface` row: `locked = !isOwned && song.isPreviewable === false`.
  - `AlbumDetail` (mobile page) queue: `playableAlbumSongs.filter(s => isOwned || s.isPreviewable !== false)`.
  - `AlbumDetailDesktop` queue: `.filter(s => effectiveOwned || s.isPreviewable !== false)`.
  - Render always uses the FULL song list; only the QUEUE list is filtered.

**PITFALL that silently disables the whole gate — plumb `isPreviewable` through the page's OWN types/memo.**
`/api/albums/:id` returns songs via `storage.getSongsByAlbum → normalizePreviewHide`,
which emits `isPreviewable`. But each fan album PAGE re-declares its own `ApiAlbum`
song type and re-maps the songs into a local `songs` useMemo. If that local type
or memo OMITS `isPreviewable`, the field is stripped before it reaches the gate →
`song.isPreviewable` is `undefined` → `=== false` is false → the embargoed track is
NEVER locked → it stays first in the queue → Play hits it → `playback-url` 403 →
silence + "needs 3 taps". Desktop typed it through and worked; the MOBILE
`AlbumDetail.tsx` dropped it in both its `ApiAlbum.songs` type and its `songs`
useMemo, and was broken for months. The client `Song` interface (musicData.ts) also
carries `isPreviewable?: boolean | null` so the typed `Song[]` memo literal is valid;
static seed omits it (undefined → previewable).
**How to apply:** any new fan album surface (or change to an existing one's local
song shape) must declare AND copy `isPreviewable` end-to-end. Don't just fix the
gate read — verify the field survives the page's own ApiAlbum type + map/useMemo.

**Historical note / open product tension:** "Hide preview" was first built so the
embargo lifted on ownership; an EARLIER decision (Bill, Nightbirde "Hope") wanted
the Apple/McCartney pre-release treatment for *everyone including owners*. The code
has since reverted to owner-inclusive (owners see the full tracklist). Bill tests on
get.goodtunes as a NON-OWNER (he 403s), so the non-owner path is what his bug reports
exercise — but if he ever wants owners locked too, the change is the two queue filters
+ the mobile/desktop row lock (drop the `isOwned`/`effectiveOwned` short-circuit), NOT
`trackPlaybackState`. Confirm with Bill before changing owner behavior.

Default fan copy must NOT say "30 sec preview" (Bill's call) — CTA is "Play"/"Preview".
