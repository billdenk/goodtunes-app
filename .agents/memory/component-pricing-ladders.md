---
name: Component pricing quantity ladders + style inheritance
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
