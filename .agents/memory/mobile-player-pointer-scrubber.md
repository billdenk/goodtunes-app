---
name: Mobile player scrubber + volume are pointer-driven, not native range inputs
description: Why the iPhone full-screen player uses pointer-capture sliders and hides volume on iOS
---

The iPhone full-screen player's progress + volume controls are hand-rolled
pointer sliders + `touch-none` + h-7 hit area, NOT `<input type="range">`. They
DIFFER in how they bind the drag, and that difference matters:

- **Scrubber** (`MobileScrubber`) binds move/up/cancel to `window` via
  `useRailDrag` (`client/src/lib/useRailDrag.ts`), reading geometry off
  `railRef`. It passes `{ live: false }` — commits the seek on release via
  `previewRatio`; a plain tap still commits at the tap position.
- **Volume** (`MobileVolume`) STILL uses `setPointerCapture` on pointerdown
  (commits live on every move). It has NOT been migrated to `useRailDrag`, and
  that's fine: volume is gated behind `!isIOS` and `setPointerCapture` only
  breaks on iOS/iPadOS WKWebView (immediate `pointercancel`), so the one
  surface where capture fails never renders the volume slider. Don't "fix" it
  to window-bound unless volume ever ships on iOS.

**Why the scrubber is window-bound:** a native range input only tap-jumps on
iOS Safari — a continuous finger-drag scrolls the page instead of scrubbing, so
it never felt like Spotify/Apple. AND `setPointerCapture` is broken on
iOS/iPadOS WKWebView (fires an immediate `pointercancel`, kills move/up → bar
could only be tapped, never rubbed — see `ios-setpointercapture-breaks-drag.md`).
The scrubber is the only one of the two that must work on iOS, so it's the one
that had to move off capture. The mobile scrubber test
(`mobilePlayerScrubber.test.ts`) dispatches bubbling pointer events so the
window listeners still catch them.

**Why volume is hidden on iOS:** mobile WebKit makes `HTMLMediaElement.volume`
read-only — the OS/hardware buttons own loudness — so a wired slider would be a
dead control. Gate every mobile volume block behind `!isIOS` (from
`client/src/lib/platform.ts`); desktop immersive player does the same.

**How to apply:** the player's real volume state lives on PlayerContext
(`volume` 0-100 / `setVolume`, applied to the single persistent audio element) —
never re-introduce a local `useState` volume in the player, it desyncs from
playback. Reuse the same pattern for any new mobile slider; don't reach for a
native range input.
