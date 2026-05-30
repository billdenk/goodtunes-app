---
name: framer-motion vs Tailwind/CSS transform conflicts
description: When framer-motion animates scale on an element, it owns the inline `transform` — Tailwind transform utilities and CSS `transition: all` on the same element break.
---

When you give an element to framer-motion (`motion.*` with `animate`/`whileTap` driving scale/translate), framer writes the element's inline `transform` every frame. Two things then silently break on that **same element**:

1. **Tailwind transform utilities** (`active:scale-95`, `translate-x-[6px]`, etc.) — these compose `transform` via `--tw-*` vars, but framer's direct inline `transform` overrides them. Replace `active:scale-95` with framer `whileTap={{ scale: 0.92 }}`; move any `translate-x` onto a *different* (non-motion) wrapper element.
2. **CSS `transition: all`** — it will try to CSS-transition the per-frame transform framer is writing, fighting it and causing lag/jank. Narrow the CSS transition to only the non-framer properties you still need to animate (e.g. `transition: "right 260ms ..."` instead of `all`).

**Why:** the GoodTunes mobile dock (`BottomNav.tsx`) uses framer for the pillow/puck spring-in and the per-tab bounce; the original pillow had `transition: all` and the puck had `active:scale-95` — both had to be neutralized when framer took over the transform.

**How to apply:** apply the scale-bounce to a wrapper div that carries NO Tailwind transform class and NO `transition: all`. Keep `transformOrigin` in the style object (framer respects it). Gate all overshoot behind framer's `useReducedMotion()` (returns true for `prefers-reduced-motion: reduce`) — fall back to opacity-only / instant.

Also: framer transforms don't change `offsetHeight`, so a measuring `useLayoutEffect` (the dock's `dockH` measure on `pillowRef`) keeps working even while the element animates scale.
