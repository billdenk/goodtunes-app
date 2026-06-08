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

**Window-bound POINTER events still aren't enough on iPad WKWebView.** A later
device test (native iPad TestFlight) showed the scrubbers STILL dead even with
the window-bound `pointermove`/`pointerup` path: iPadOS WKWebView does not
reliably deliver the pointer-event stream for *touch* at all. Fix = give
`useRailDrag` a SECOND input path: native `touchstart`/`touchmove`/`touchend`/
`touchcancel`, registered NON-passive (so move can `preventDefault`) bound
straight to the rail node via a callback `railRef` (React's synthetic touch
listeners are passive at the root). Touch is excluded from the pointer path
(`if (e.pointerType === "touch") return`) so a tap never commits twice. Mouse/pen
keep the window-bound pointer path unchanged. Touch end identifier-tracked so a
2nd finger can't hijack the gesture.

**How to apply:** for any finger-draggable rail in the fan player, use
`client/src/lib/useRailDrag.ts` — mouse/pen bind `pointermove`/`pointerup`/
`pointercancel` to `window`; touch uses native non-passive listeners. It reads
geometry off a ref and needs `touch-action: none` on the rail. `railRef` is a
CALLBACK ref (not a RefObject) so the non-passive touch listener attaches/detaches
exactly when the (often conditionally-rendered) rail mounts. `live:true` commits
continuously (volume); `live:false` defers the seek to release but a plain tap
still commits (scrubber). The shared `SyncedLyrics` lyric column uses the same
window-bound pattern for its DESKTOP-only `enableManualScroll` drag-to-browse
(tap-to-seek still fires unless the finger moved >6px; auto-follow resumes
~4s after release). Mobile lyrics NOW enables manual scroll too: the overlay's
swipe-to-dismiss is scoped to its HEADER bar only (`dismissLyricsOnSwipeDown` in
Player.tsx), while the lyric column owns vertical drag — different regions, so
they can't conflict (Apple-Music style). Don't re-disable mobile manual scroll.
