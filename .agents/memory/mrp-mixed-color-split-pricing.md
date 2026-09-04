---
name: MRP mixed-color split pricing
description: Authoritative MRP business rule for quotes that divide one vinyl order across multiple color tiers.
---

For an MRP order split across multiple vinyl colors, shared components such as jackets, sleeves, and labels use the total order quantity for their price break. Vinyl is priced per color portion using that portion's quantity and tier. Applicable setup fees are evaluated and added for each split.

**Why:** MRP confirmed this rule directly on August 19, 2026. The current single-color builder cannot represent it faithfully; treating every component as split-priced would overcharge shared packaging, while pricing all vinyl at the total quantity would understate color-tier costs.

**How to apply:** Model mixed-color builds as positive color-split quantities that sum exactly to the total run. Price shared components once at the total quantity, price each vinyl split separately, and aggregate setup fees per split while preserving MRP's existing per-color/per-disc and splatter-color rules. Keep existing single-color builds unchanged.