---
name: iOS setPointerCapture kills tap+drag on thin rails
description: Why fan desktop scrubber/volume/lyrics drags must bind window listeners instead of setPointerCapture
---

On iOS/iPadOS WKWebView, calling `setPointerCapture()` inside a `pointerdown`
handler makes Safari fire an immediate `pointercancel` and STOP delivering
`pointermove`/`pointerup` to the captured element. On a thin rail (scrubber,
volume) this means the bar can be neither tapped nor dragged on an iPad — the
exact symptom Bill reported prepping for Play submission.

**Why:** the desktop/tablet shell uses DesktopNowPlaying + PlayerDock, NOT the
mobile `Player.tsx`. The mobile scrubber already worked because it uses
`hasPointerCapture` guards + `onPointerCancel=handleUp`; the desktop ones used
raw setPointerCapture and stale-state move guards, so they died on iPad.

**How to apply:** for any finger-draggable rail in the fan player, use
`client/src/lib/useRailDrag.ts` — it binds `pointermove`/`pointerup`/
`pointercancel` to `window` for the gesture's life (no capture), reads geometry
off a ref, and needs `touch-action: none` on the rail. `live:true` commits
continuously (volume); `live:false` defers the seek to release but a plain tap
still commits (scrubber). The shared `SyncedLyrics` lyric column uses the same
window-bound pattern for its DESKTOP-only `enableManualScroll` drag-to-browse
(tap-to-seek still fires unless the finger moved >6px; auto-follow resumes
~4s after release). Keep manual lyric scroll OFF on mobile — its overlay owns
swipe-to-dismiss on the grabber/artwork and would conflict.
