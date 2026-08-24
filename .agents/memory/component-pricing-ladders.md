---
name: Component pricing quantity ladders + style inheritance
<<<<<<< HEAD
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
=======
description: How press component Pricing rows carry imported quantity ladders, style-first color inheritance, and splatter surcharge-over-style (MRP Tier 3 import pattern).
---

Pricing component rows (shared/pressComponents.ts) carry optional imported-price fields beside operator cells:
- `rungsBySize` (per-size quantity ladders, cents), `rungsBySizeHeavy` (180 g only), `oneTime: boolean` (rungs are one-time TOTALS; genuine 0 renders "Included"), `surchargeOver: "type:<cat>"` (row is an adder on the base style), `pricingSource` (provenance stamp).

**Rules:**
- Operator edits ALWAYS win: importers never write `pricesBySize`; resolution order is operator per-size cell → ladder rung (snap UP to smallest rung ≥ qty; beyond top rung = null, never extrapolate) → legacy priceCents. 180 g resolves ONLY `rungsBySizeHeavy` (operator cells are standard-weight prices).
- Style-first: colors inherit their `type:<cat>` parent's price (structural key parent beats name match); per-color override optional; priced-count counts styles not colors (`styleRowsForSize`).
- Surcharge rows (Splatter) price as base style + adder; sum in CENTS (float dollar addition drifts, 2.30+0.55≠2.85).
- Relaxed color-name matching must require tier-name compatibility (one contains the other) or a "Ruby" under Opaque prices a Splatter ask.
- Shared pricer lives in shared/quotePricing.ts (`makeQuotePricer.vinylEx/flatEx`), used by builder AND the server send gate; `laddered: true` lines must NOT be rescaled by the builder's synthetic run-size curve.

**MRP Tier 3 import** (`scripts/load-mrp-tier3-component-pricing.ts`, marker `mrp_tier3_component_pricing_v1`, runs dev+prod via post-merge.sh): looks up Memphis by name ILIKE; splits neon-glow category into neon+glow (G-coded swatch ids → glow); maps sheet styles onto EXISTING `type:<cat>` keys only, reports unmapped both ways; label full-color key is `labels:color` not `labels:cmyk`. Honestly pending after import: color, ghostly/torrent effects, jackets:discobag, inserts:booklet/poster, labels:blank; 180 g stamper delta not laddered; splatter's $50 setup fee not surfaced in builder.
>>>>>>> 11e0ff9 (Connect MRP Tier 3 pricing to components: style-first Pricing page with color inheritance, splatter surcharge-over-style, 8-step quantity ladders (per-unit/heavy/one-time), provenance-stamped re-runnable importer (operator edits always win), and ladder-aware quote builder pricing)
