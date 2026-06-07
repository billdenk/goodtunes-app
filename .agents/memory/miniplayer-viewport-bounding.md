---
name: Fan mini-player dock viewport bounding
description: Why the mobile mini-player width must be capped with 100vw + safe-area, not w-full
---
The fan mobile mini-player (`MobileMiniPlayer` in client/src/components/MiniPlayer.tsx)
must cap its OUTER fixed wrapper width with `min(390px, calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right)))`, NOT `w-full max-w-[390px]`.

**Why:** `w-full`/percent widths resolve against the containing block; a transformed
ancestor or an iOS mobile-Safari / in-app-browser layout-vs-visual-viewport mismatch
can make that block wider than the visible viewport, so a centered pill runs off the
RIGHT edge on scroll. `100vw` is viewport-relative regardless of ancestors, and the
safe-area subtraction keeps it off notch/home-indicator zones. Centering stays
`left-1/2 + -translate-x-1/2`.

**How to apply:** Any fixed, centered fan dock pill that reportedly overflows the right
edge on mobile Safari → switch its width cap to a `100vw`-based `min()` with safe-area
insets. Keep BottomNav alignment in portrait (insets=0 → identical to min(viewport,390)).
Also: making the inner pill a definite-width block (drop `flex` on the hidden-state
container so the pill fills left:70→right:70) prevents long titles from growing the
capsule past its right boundary.
