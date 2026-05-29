---
name: Press catalog shape
description: How per-press pricing is modelled (formats → tiers → colors + ladders) and where it splits from platform-wide pricing.
---

Per-press vinyl pricing on GoodTunes is a five-table tree, not a flat per-format override:

- `press_formats` — one row per format a press actually runs (gates the SellPanel `+ Add physical good` menu when the album is invited by that press).
- `press_color_tiers` — color *tiers* under each format (e.g. Black / Standard color / Splatter). The legacy jsonb `priceLadder` on this row is kept for back-compat reads but is no longer the source of truth.
- `press_colors` — the actual color options inside a tier (name + hex swatch OR uploaded swatch image for marbled / splatter / picture-disc).
- `press_jackets` — per-press jacket SKUs (e.g. "Standard Full-Color Jacket", "Gatefold"). Exactly one row per press carries `is_default=true`.
- `press_tier_jacket_ladders` — the real source of truth: one row per `(tier, jacket)` combo, carrying the `{qty, unitCents}` rungs. The artist's typed quantity snaps up to the next rung; over the top rung → `requiresQuote`. Lookups when no jacket is passed (SellPanel doesn't pick one today) resolve via the press's default jacket. `getPressCatalog` populates `tier.priceLadder` from the default jacket's combo so `/invited-press` consumers stay on the old shape.

**Cost-knob split — don't cross the streams:**
- Per-unit *manufacturing* cents for invited-press vinyl come ONLY from the picked tier's ladder. Editing manufacturing on the platform pricing page only affects free / non-invited flow + non-vinyl placeholders.
- Publishing / payment-processing / GoodTunes-margin cents are platform-wide and edited on the super-admin Platform Pricing page (`payout_format_costs`, `PUT /api/admin/payout-format-costs/:format`).

**Why:** a new press can be onboarded without super-admin touching the cost calculator, and a platform fee change rolls out without disturbing each press's negotiated rates. Keep the catalog editor (`AdminManufacturer.tsx`) and the Platform Pricing per-format table conceptually separate even if a future redesign tries to merge them.

**How to apply:**
- When the SellPanel needs to render the picker, read `invitedPress.catalog` returned by `GET /api/admin/albums/:id/invited-press`. Empty `formats` (or no invited press) ⇒ fall back to the legacy Hellbender matrix block + full `ALBUM_FORMATS` menu.
- Save sends `pressTierId` + `pressColorId` to the SKU upsert; the server resolves names and snapshots them onto the SKU as `vinylColorTier` (tier name), `vinylColor` (color display name), `quantityTier` (snapped qty), `costSource: "catalog"`. SKU storage shape is unchanged — checkout / cart / payout don't need to know about catalog ids.
- `seedHellbenderCatalog()` in `server/pressCatalog.ts` is lazy + idempotent: it materializes Hellbender's tiers/colors from `shared/pressing.ts` on first read of `/invited-press`, so don't add a migration to backfill.
- Jackets ARE first-class in the catalog (Task #467): each press carries its own jacket SKUs in `press_jackets` and pricing is keyed on `(tier, jacket)` combos. SellPanel doesn't pick a jacket today — server resolves to the press's `is_default=true` jacket. When the SellPanel grows a jacket picker (Task #469), pass `pressJacketId` through to `lookupCatalogUnitCents` and snapshot the jacket name onto the SKU alongside `vinylColorTier`.

**Adding/renaming tiers as data (no republish):**
- A new `press_color_tiers` row is NOT enough to be usable — the SellPanel qty selector reads `tier.priceLadder`, which `getPressCatalog` fills from the **default jacket's** `press_tier_jacket_ladders` row (legacy `tier.price_ladder` is usually `[]`). So a tier with no default-jacket ladder shows an empty quantity picker. Clone an existing tier's ladders (e.g. an unpriced one with `{qty,confirmed:false,unitCents:0}` rungs) when minting new tiers.
- `press_colors` reference the tier by `tier_id`, so **renaming a tier keeps its swatches**. But the SellPanel re-picks a saved SKU's tier by NAME (`tiers.find(t => t.name === existing.vinylColorTier)`), so renaming a tier orphans any saved SKU onto the first tier (Black). Only rename tiers that are unpriced/unused.
- Tiers with 0 `press_colors` don't break the catalog flow (Black/Color/Splatter ship with zero) — the swatch row is just empty.
- Operator convention (MRP demo): unpriced tiers carry a literal `*` suffix in the tier `name` (e.g. `Metallic Blends*`) to signal "pricing TBD" — done as data, not code. `matchFamilyToTier` + `getPressCatalog` strip nothing, but the importer's `norm()` ignores `*`. The catalog tier dropdown renders `t.name` verbatim; the `SEVEN_INCH_VISIBLE_TIERS` (`n`) trim is legacy-VINYL_COLORS-only and does NOT touch the catalog dropdown.
- The MRP color taxonomy (their site SKU prefixes → families): Solids = Opaque(O)/Translucent(T)/Neon(N)/Glow(G); Blends = Standard(MB)/Smoke(SB)/Cream(CB)/Metallic(HB, includes Galaxy/Metallic Gold-Silver-Copper)/Glitter(HG)/Shimmer(SHM)/Deluxe(MD); plus EcoMix(ECO, by hue), Black, Splatter. The built-in "Import colors from MRP" route (`/api/admin/manufacturers/:id/catalog/mrp-import/*`, MRP-domain-gated) imports swatch photos into Object Storage but only into **existing** tiers — it never creates tiers.
