---
name: Desktop lyrics test jsdom dispatchEvent + missing panel close
description: Why the desktop lyrics tests threw on setup, and the long-unrendered lg panel × button.
---

# Desktop lyrics jsdom dispatchEvent + lg panel × button

Two related facts uncovered fixing the desktop lyrics tests:

- **wouter v3 patches `history.pushState`/`replaceState` to emit its
  navigation event via the GLOBAL `dispatchEvent`** (not `window.dispatchEvent`).
  The client inline-jsdom test setups assign `window`/`document`/`history` to
  `globalThis` but historically omitted `dispatchEvent`. Any rendered fan page
  that runs `window.history.pushState` (e.g. AlbumDetailDesktop's overlay
  back-button effect) trips the patch and throws before assertions run.
  **Fix:** add `g.dispatchEvent = window.dispatchEvent.bind(window)` alongside
  the other jsdom globals in each test's inline bootstrap (there is NO shared
  bootstrap file — each `*.test.ts` stands up its own jsdom).

- **The lg lyrics side panel's `×` close button was documented + wired but
  never rendered.** `DesktopAlbumView`'s `onCloseLyrics` prop docstring says it
  "wires the panel's `×` button," AlbumDetailDesktop passes it, but the panel
  body only rendered `{lyrics}` — no close affordance. The md overlay had its
  own `button-close-lyrics-md`; the lg panel's `button-close-lyrics` was added
  here (IconButton ghost + `<X/>`, mirroring the md overlay) so the panel can
  be dismissed without the dock toggle. Closing lyrics across both surfaces now
  reads identically.
