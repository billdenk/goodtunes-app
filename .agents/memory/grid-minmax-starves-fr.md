---
name: Fixed-max minmax track starves fr siblings
description: Why a minmax(340px,460px) column beside minmax(0,1fr) squeezed the press-catalog right column to ~124px and clipped content off-screen.
---

The rule: in CSS grid, a track with a FIXED max (`minmax(340px,460px)`) grows all the way to its max BEFORE any `fr` sibling receives leftover space. Beside `minmax(0,1fr)`, on a tight container the fixed-max track takes 460px and the fr track collapses toward 0 — its content then overflows/clips (the admin shell clips at the root, so it shows as content cut off past the viewport edge, not a page scrollbar).

**Why:** press-catalog Catalog tab at 1024–1300px gave the sections column ~124px; size cards / price rows / audio inputs ran past the viewport (looked like "page wider than viewport").

**How to apply:** when one column must yield to another, give the greedy column a PERCENTAGE max (`minmax(340px,36%)`) or make both fr-based; and gate two-column layouts on a breakpoint that accounts for the 256px admin rail (`w-64`, NOT 220 — AdminFrame's SIDEBAR_W fit constant is 256). Verify with a headless scrollWidth/getBoundingClientRect audit: nix ungoogled-chromium + puppeteer-core works in task envs (no bundled Chromium needed).
