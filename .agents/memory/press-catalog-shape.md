---
name: Press catalog shape
description: How per-press pricing is modelled (formats → tiers → colors + ladders) and where it splits from platform-wide pricing.
---

Per-press vinyl pricing on GoodTunes is a three-table tree, not a flat per-format override:

- `press_formats` — one row per format a press actually runs (gates the SellPanel `+ Add physical good` menu when the album is invited by that press).
- `press_color_tiers` — color *tiers* under each format (e.g. Black / Standard color / Splatter). Each carries a jsonb `priceLadder` of `{qty, unitCents}` rungs. The artist's typed quantity snaps up to the next rung; the top rung is the cap (over it → `requiresQuote`).
- `press_colors` — the actual color options inside a tier (name + hex swatch).

**Cost-knob split — don't cross the streams:**
- Per-unit *manufacturing* cents for invited-press vinyl come ONLY from the picked tier's ladder. Editing manufacturing on the platform pricing page only affects free / non-invited flow + non-vinyl placeholders.
- Publishing / payment-processing / GoodTunes-margin cents are platform-wide and edited on the super-admin Platform Pricing page (`payout_format_costs`, `PUT /api/admin/payout-format-costs/:format`).

**Why:** a new press can be onboarded without super-admin touching the cost calculator, and a platform fee change rolls out without disturbing each press's negotiated rates. Keep the catalog editor (`AdminManufacturer.tsx`) and the Platform Pricing per-format table conceptually separate even if a future redesign tries to merge them.

**How to apply:**
- When the SellPanel needs to render the picker, read `invitedPress.catalog` returned by `GET /api/admin/albums/:id/invited-press`. Empty `formats` (or no invited press) ⇒ fall back to the legacy Hellbender matrix block + full `ALBUM_FORMATS` menu.
- Save sends `pressTierId` + `pressColorId` to the SKU upsert; the server resolves names and snapshots them onto the SKU as `vinylColorTier` (tier name), `vinylColor` (color display name), `quantityTier` (snapped qty), `costSource: "catalog"`. SKU storage shape is unchanged — checkout / cart / payout don't need to know about catalog ids.
- `seedHellbenderCatalog()` in `server/pressCatalog.ts` is lazy + idempotent: it materializes Hellbender's tiers/colors from `shared/pressing.ts` on first read of `/invited-press`, so don't add a migration to backfill.
- Jacket upgrades are deliberately NOT part of the catalog model. If they return, model them as a separate addon-style table; don't smuggle them back into `priceLadder`.
