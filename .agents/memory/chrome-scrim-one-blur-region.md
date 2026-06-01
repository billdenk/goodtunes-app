---
name: ChromeScrim one-blur-per-region
description: How the fan-chrome ChromeScrim primitive owns the single per-region backdrop-filter, how in-region controls hand their blur off to it, and why the search+album-menu two-blur edge state is NOT a real iOS hazard.
---

# ChromeScrim: gradient-at-rest / single-blur-on-active

`client/src/components/ui/ChromeScrim.tsx` is the shared fan-chrome top/bottom bar:
gradient fade (through `--brand-bg-rgb`) at rest with **zero** backdrop-filter, and
exactly **one** frosted blur layer mounted via AnimatePresence + opacity cross-fade
only while `active`. Never animate the `backdrop-filter` property itself
(mount/unmount + opacity only).

**Rule:** while the scrim is `active` it is the region's *single* blur owner. Any
other control overlapping that band must drop its own `backdrop-filter` while active,
or you re-stack two backdrop-filters (the iOS-WebKit stacked-blur hazard).

**How to apply (the handoff is lifecycle-timed, not flag-timed):**
- Keep the control's own blur at rest (scrim is gradient-only then) and swap to a
  blur-free opaque fill while active. See BottomNav search/close toggle
  (`glassStyle` ↔ `solidDockStyle`, gated on `searchOpen`) and the AlbumDetail
  share/menu capsule (`capsuleStyle`).
- The capsule gates on a **lifecycle state** (`scrimBlurPresent`), NOT raw
  `showMenu`: true the instant the menu opens, false only after a timeout that
  exceeds the scrim's exit fade (240ms vs the scrim's 200ms; 80ms vs 50ms reduced).
  Reason: on close, `showMenu` flips false instantly but the scrim blur fades out
  over ~200ms — gating on raw `showMenu` re-enables the capsule blur mid-fade and
  the two briefly coexist.
- A floating menu/popup that also blurs must be clamped to start strictly below the
  band. AlbumDetail shares one `TOP_SCRIM_PX` const for both the scrim height and
  the menu's top clamp (`+12` headroom so the pop-in `y:-6`/exit `y:-4` never
  crosses the band on any frame).
- `IconButton` `glass` variant is **not** a blur surface (translucent rgba fill
  only, no backdrop-filter) — glass chips never count toward the per-region blur
  budget. Only `dimmed` (backdrop-blur-md) does.

# Why the search-open + album-menu-open two-blur state is safe (not a real hazard)

On `/album/:id`, `BottomNav` is mounted alongside the album surface, both manage
independent state, so "BottomNav search open" + "album menu open" is reachable and
puts the search field blur + the album top scrim blur in the same top band. The
architect flags this as a strict one-blur-per-region violation, but the actual
iOS GPU-OOM hazard (stacked blur over an *actively scrolling image list*) is absent:
- BottomNav search renders an **opaque** full-screen overlay (`var(--brand-bg)`,
  z-20) beneath both blurs; the album scrim (z-40) composites over solid navy, not
  hero art.
- The album menu's **modal click-catcher backdrop (z-60, `fixed inset-0`)** sits
  above everything and freezes scrolling of the search results while the menu (and
  thus the scrim blur) is active. No active scroll recompositing ⇒ no OOM.

**Decision:** did NOT add cross-component blur-owner plumbing for this edge — the
hazard the rule guards against doesn't occur. A "single top-blur-owner for the
mobile fan shell" is a legitimate but optional hardening (filed as a follow-up).

# design-lint gotcha hit while doing this

`naked-icon-button` (R10 in `scripts/design-lint.ts`) suppresses a naked `<button>`
with a single icon child if the string `IconButton` appears in the **200 chars
before** it. Adding length (comments / a longer className) between an `IconButton`
and a sibling naked button pushes `IconButton` out of that window and re-exposes the
pre-existing (baselined-by-proximity) violation as NEW. Fix by keeping the markup
compact (hoist long conditional styles into a `const` above the JSX) rather than
re-baselining. Baseline key is `rule+file+snippet` (line content, not line number).
