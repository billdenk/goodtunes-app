---
name: Press catalog color swatches
description: Why catalog colors only carry a solid swatchHex (+ optional photo), not the in-code gradient, and how to backfill without clobbering operators.
---

# Press catalog color swatches

A catalog color row (`press_colors`) carries only `swatchHex` (a single solid
hex, constrained `^#[0-9a-fA-F]{6}$` by the admin save schema) plus an optional
`swatchImageUrl` (a real imported product photo). It does **not** carry the
gradient swatch strings that live in code (`VINYL_COLORS[].swatch` can be a
`linear-gradient(...)`).

**Why it bites:** gradient stocks (House Mix, Smokey/Ultra Clear, Gold, Silver,
metallics) can't round-trip through `swatchHex`, so an earlier seed stored
`null` for them → the Sell-panel COLOR chip + VinylPreview disc rendered grey
even though we *know* the color. Fix: collapse the gradient to a representative
solid via `representativeHex()` (takes the middle `#`-stop) and store that.

**How to backfill safely (the rule):** color backfills must only fill rows
where **both** `swatchHex IS NULL AND swatchImageUrl IS NULL`. Never overwrite a
non-null swatch — operators edit colors by hand and the one-click importers
(MRP / Hellbender) stamp real `swatchImageUrl` photos that must always win.
Two helpers in `server/pressCatalog.ts`:
- `backfillColorHexes(pressId, hexByTier)` — match by tier name + color name.
- `backfillColorHexesByName(pressId, hexByName)` — tier-agnostic, for presses
  where the same color name lives under more than one tier (Hellbender's "Gold"
  is under both the 7" Metallic tier and the 12" Color tier).

Backfills run inside the module-flag-guarded `seed*Catalog()` fns, which fire on
the first admin catalog read (`server/commerce.ts`) in dev **and** prod — so no
manual prod SQL is needed; they're idempotent.

**Frontend contract:** VinylPreview shows the photo when `color.thumbnailUrl`
(mapped from `swatchImageUrl`) is set, else tints to `color.swatch` (mapped from
`swatchHex`), else grey. PMP publishes no per-color catalog (only ~5 combined
category JPGs), so its colors are a best-guess seeded standard palette
(Translucent + Opaque), not real names/photos — swap when a CSR supplies them.

**MRP photo backfill — join on the CODE, not the name.** GoodTunes seeds each
MRP color as `"<CODE> <short name>"` (`T01 Ruby`, `O01 Brown`, `ECO2 Greens`),
but the published all-vinyl-colors page tiles use family-prefixed names
(`Translucent Ruby`, `Opaque Brown`). Normalized name-matching gives **zero**
overlap; matching on the embedded code (`/^([A-Z]{1,4}\d{1,3})\b/`) → tile.code
hits ~56 of 76 colors. The misses are legit: EcoMix (random recycled blends),
codeless `CB` cream blends, a few neon/smoke codes MRP doesn't publish per-color
— they keep their hex tint. Backfill lives in `scripts/backfill-press-photos.ts`
(scrape via `server/vendorColorScrape.ts`, mask to vinyl disc, upload Object
Storage); idempotent on `swatchImageUrl IS NULL AND importSourceUrl IS NULL`.
The live in-routes MRP importer keys off `format === "Vinyl"`, which no album
format ever equals (formats are 7_inch/12_lp/12_double/cassette/cd), so it finds
0 tiers — the standalone script matches across all vinyl formats instead.
