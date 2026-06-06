---
name: Mobile player scrubber + volume are pointer-driven, not native range inputs
description: Why the iPhone full-screen player uses pointer-capture sliders and hides volume on iOS
---

The iPhone full-screen player's progress + volume controls are hand-rolled
pointer-capture sliders (setPointerCapture + `touch-none` + h-7 hit area), NOT
`<input type="range">`.

**Why:** a native range input only tap-jumps on iOS Safari — a continuous
finger-drag scrolls the page instead of scrubbing, so it never felt like
Spotify/Apple. Pointer capture + `touch-none` lets one finger drag-seek (rub
left/right). The scrubber shows a live drag value and only commits the seek on
pointer-up (defer-to-release); volume is cheap so it applies live.

**Why volume is hidden on iOS:** mobile WebKit makes `HTMLMediaElement.volume`
read-only — the OS/hardware buttons own loudness — so a wired slider would be a
dead control. Gate every mobile volume block behind `!isIOS` (from
`client/src/lib/platform.ts`); desktop immersive player does the same.

**How to apply:** the player's real volume state lives on PlayerContext
(`volume` 0-100 / `setVolume`, applied to the single persistent audio element) —
never re-introduce a local `useState` volume in the player, it desyncs from
playback. Reuse the same pattern for any new mobile slider; don't reach for a
native range input.
