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
