---
name: Press catalog unitCents must be per-unit cents
description: The `press_tier_jacket_ladders.price_ladder[].unitCents` field is per-unit cents — never vendor TOTAL dollars. Consumers (commerce.ts manufacturingCents, /api/admin/manufacturers/.../catalog) divide/multiply assuming cents-per-unit, so storing totals silently over-charges 100×.
---

## Rule
Every rung in `press_tier_jacket_ladders.price_ladder` stores `unitCents` as **per-unit cents** (e.g. `1643` for $16.43/record). Never store vendor TOTAL dollars in this field even though the seed-time math (`totalDollars * 100 / qty`) is what you read off the PDF.

## Why
Consumer code (`server/commerce.ts` `manufacturingCents = looked.unitCents`, catalog UI rendering, `lookupCatalogUnitCents` in `pressCatalog.ts`) treats the value literally as cents-per-unit. If it ever holds the vendor total, manufacturing cost is inflated by ~qty/100 and never noticed — the catalog UI just shows `$82.15/record` when the real price is `$16.43/record`. The bug shipped in the MRP + Hellbender seeds and persisted for months because all three founding presses had the same bug, so cross-press comparison looked internally consistent.

## How to apply
- Always derive `unitCents = round(vendorTotalDollars * 100 / qty)` when transcribing a PDF rung, and inline that math as a comment on the literal (see MRP_LADDERS / HELLBENDER_NEW_12_LADDERS in `server/pressCatalog.ts`).
- For Hellbender specifically, store the **undiscounted** subtotal-per-unit. The `manufacturers.broker_discount_pct` column (seeded at 10 for Hellbender) gets applied at lookup time, so any pre-discounted number double-discounts.
- Seeds normally don't overwrite existing confirmed rungs (`upgradeRung` refuses to downgrade). To repair a wrong-units bug after it shipped, use `forceRungPrice(tierId, jacketId, qty, unitCents)` — unconditional overwrite, idempotent when the value already matches.
- The live per-unit pricing lives in `press_tier_jacket_ladders` (keyed by tier_id + jacket_id). The sibling `press_color_tiers.price_ladder` column is frequently empty `[]` even for fully-priced tiers (the importer leaves it blank) — that empty array is a RED HERRING; never conclude a color is unpriced from it. A locked SKU's `cost_snapshot_manufacturing_cents` resolves from the jacket ladder for the SKU's tier, so a catalog (e.g. metallic/gold) SKU DOES carry its color premium over Black even when the color-tier ladder looks empty. Most rungs are `source: placeholder-estimate` / `estimated:true` until a vendor confirms.
- Reseed across dev + prod after any unit/value change: `npx tsx -e "import('./server/pressCatalog.ts').then(m => Promise.all([m.seedHellbenderCatalog(), m.seedMrpCatalog(), m.seedPmpCatalog()]))"` against each DATABASE_URL.
