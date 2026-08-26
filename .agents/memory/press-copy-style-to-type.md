---
name: Press copy says "type", never "style"
description: Standing copy rule for all press surfaces — component/vinyl categories are "types", not "styles"
---
**Rule:** On every press-facing surface (vinyl styles page, component pages — jackets/labels/sleeves/inserts, package builder, quote/estimate builder, server-side pricing notes), the user-facing word for a component or vinyl category is **"type"**, never "style". Requested by MRP (Aug 2026), ratified by gogoods as a rule for all presses.

**Why:** MRP found "style" confusing/ambiguous; "type" is their house vocabulary. Same pattern as the vendor→Maker/Reseller rename: UI copy only.

**How to apply:** Copy/aria-labels/placeholders only — NEVER rename identifiers, data-testids (`gen-style-name`, `button-archive-type-*` etc.), variables, file names (PressVinylStyles.tsx stays), routes, or DB columns. Exception: **"Old-Style Tip-On"** is a jacket product name and keeps its wording. New press-surface copy must say "type" from the start.
