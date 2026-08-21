---
name: Press surcharge tiers + named price lists
description: How surcharge-mode color tiers and press_price_lists work; which rung sources are overwritable.
---

- A color tier can be `pricing_mode='surcharge'` (base tier ref + jsonb amount ladder, floor-snap via `snapSurchargeAmountCents` in server/pressCatalog.ts). `getPressCatalog` COMPOSES the surcharge tier's ladders from the base tier so every existing consumer (SellPanel, quotes, catalog page) works unchanged; `lookupCatalogUnitCents` resolves base + adder recursively. Surcharge tiers' own stored ladders are ignored — never seed prices onto them.
- **Why:** MRP prices Splatter as +$0.55–0.75 over the chosen color tier; forcing a standalone price would drift from base-tier updates.
- Named price lists live in `press_price_lists` (unique press_id+label, newest active wins); it's a provenance/labeling layer only — one active list per press, badge on the operator catalog page.
- Rung-source rule: `placeholder-estimate` rungs (confirmed+estimated) are SCRIPT estimates and safe to overwrite/drop when loading real press pricing; null-source confirmed rungs are operator-entered and must be preserved. Off-grid script rungs (old qty grids) should be dropped when re-seeding, or quotes snap to bogus prices.
- MRP component/print ladders (sleeves/jackets/inserts/DL cards/sticker grids verbatim) live under press_components componentKey='pricing' → config.componentLadders, awaiting the component→price association task.
