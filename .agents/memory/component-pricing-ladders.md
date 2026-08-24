---
name: Component pricing quantity ladders + style inheritance
description: Behavioral rules for press component pricing ladders, style-first color inheritance, splatter surcharge-over-style, and the MRP Tier 3 import.
---

Press component Pricing rows can carry imported quantity ladders (per size, cents; separate heavyweight/180 g ladders; one-time rows hold TOTALS not per-unit — a genuine 0 renders "Included") plus a provenance stamp, beside the operator-entered per-size cells.

**Rules (the durable decisions):**
- Operator edits ALWAYS win; importers never touch operator cells. Resolution: operator cell → ladder rung snapped UP to the smallest rung ≥ qty (beyond the top rung = no price, never extrapolate) → legacy flat price. 180 g resolves ONLY from the heavyweight ladder (operator cells are standard-weight prices).
- Style-first: vinyl styles (type rows) are the priced unit; colors inherit their parent style's price, per-color override optional; the priced-count counts styles not colors.
- Splatter is a surcharge ON TOP of the base color's style price, never independently priced colors. Money composition happens in CENTS (float dollar addition drifts: 2.30+0.55 ≠ 2.85).
- Surcharge compositions must preserve provenance PER PORTION: an operator-entered base or adder still rides the builder's synthetic run-size curve, while ladder portions are already at the run size — a single "laddered" flag on the composed total misprices mixed cases (review-rejected once).
- Relaxed color-name matching must require tier-name compatibility (one contains the other), or a color under one style can answer a different style's ask.
- One shared pricer feeds the quote builder, the estimate email breakdown, AND the server send gate — a pricing rule changed in one place must hold in all three.

**MRP Tier 3 import quirks:** Memphis prices by STYLE with 8 quantity breaks; the import maps sheet styles onto EXISTING style keys only (unmapped rows reported both ways, never guessed), splits the combined neon/glow category, and leaves honest "Pricing pending" gaps for anything the sheet lacks (some effects, discobag, booklet, poster, blank labels); splatter's one-time setup fee and the 180 g stamper delta are known not-yet-surfaced gaps (follow-up tasks exist).
