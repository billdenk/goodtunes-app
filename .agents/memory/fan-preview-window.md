---
name: Fan preview window (previewStartMs/previewEndMs)
description: How 30s fan previews honor the operator/GoodSync-placed window, and the sneaky lyrics-seek compliance-bypass path.
---

# Fan preview window

Fan 30s previews must play the operator/GoodSync-placed window per song, NOT a
hardcoded 0:00–0:30. The window lives on `songs.preview_start_ms` /
`preview_end_ms` (already shipped to the client: `/api/songs` returns them in
`...rest`, and `PlayerContext.hydrate()` spreads the catalog row onto every
`PlayerSong`, so the window is on `currentSong` at play time with no server
change).

**Why:** a song's chorus is often well past the intro (Nightbirde "Gold" chorus
at 2:20). Playing 0:00–0:30 made fans hear a quiet intro and report "silence" on
the live campaign.

**How it works (PlayerContext):** derive `previewStartSec` / `previewEndSec` /
`previewWindowSec` from the current song, gated on `previewMode`. Null/invalid
start → 0; null/invalid end → start + `PREVIEW_CAP_SECONDS` (30); length clamped
≤ 30 so the store-compliance cap always holds; finite-number guarded (an
`Infinity` start would otherwise poison the scrubber division). Off-preview they
resolve to 0 / cap / cap so all the consuming scrubber math collapses back to
plain `0..duration`. A one-shot `previewSeekTargetRef` is armed on source-attach
and consumed in the `loadedmetadata`/`durationchange` handler once duration is
finite (covers hls.js, native iOS HLS, and offline blobs), then cleared so it
never fights a fan's manual scrub. Auto-advance keys off
`currentTime >= previewEndSec`.

**The non-obvious bypass:** every player surface scrubber must be window-relative
AND clamp seeks into `[previewStartSec, previewEndSec)`. The easy-to-miss one is
`SyncedLyrics.onSeek` — tapping a lyric line seeks. If it passes raw `seekTo`, a
fan can jump *before* `previewStartSec`, and since auto-advance only fires at
`previewEndSec` they hear far more than 30s → store-compliance break. The lyric
*highlight* still needs absolute `currentTime` (lyrics are timestamped against
the master); only the seek handler clamps. There are THREE SyncedLyrics call
sites: mobile `Player.tsx`, and the two desktop bodies `DesktopNowPlaying`
(LyricsPanelBody) + `DesktopLyricsBody`.

**How to apply:** any new player surface or seek entry point must route through
the window clamp when `previewMode` is on; never wire a raw `seekTo` to a
fan-reachable control in preview mode.
