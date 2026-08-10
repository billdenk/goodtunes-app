---
name: overflow-x hidden vs clip — sliding admin shell
description: Why the whole admin shell (header + rail) could scroll sideways despite overflow-x hidden, and the FitScale fix for fixed-px stages.
---

The rule: `overflow-x: hidden` still makes a box PROGRAMMATICALLY scrollable — a focus/scrollIntoView on a descendant hanging past the right edge scrolls the hidden ancestor (including `html`), sliding the entire shell with no scrollbar to bring it back. Use `overflow-x: clip` (with a `hidden` fallback line above) on the shell root, `<main>`, and html/body to forbid horizontal scrolling entirely.

Detection: a bounding-rect audit can show ZERO offenders while the escape still exists — audit `scrollWidth > clientWidth` on every element instead; clipped escapes are the ones focus-scroll exploits.

Root case: the press-catalog JacketStage is a fixed-px composition (`jacketPx * 1.5` ≈ 450px wide for 12") in a sticky grid column that bottoms out ~340px at two-column widths; it overflowed `visible` at EVERY two-col width. Fix = `FitScale` wrapper (ResizeObserver + `zoom`, layout-affecting so hover geometry/height stay right) in PressPackagePricingCatalog.tsx.

**How to apply:** any fixed-px visual composition placed in a fluid column needs a fit-scaling wrapper; when a "page slides sideways" report can't be reproduced with rect audits, switch to the scrollWidth audit and check hidden-vs-clip on the ancestors. Note: the artist package builder also renders JacketStage — same risk if its column can shrink below the stage width.
