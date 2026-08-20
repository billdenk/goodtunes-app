---
name: Swatch photo resolution facts + layered disc-generator asset
description: Where low-res press swatch photos actually come from, the audit tool, and Andrew's layered PSD for the pick-a-color disc generator.
---

- **No pipeline ever downscaled swatch photos.** Good Press is a clone of Viryl Technologies (`scripts/create-good-press.ts`) copying image URLs as-is; all 111 are 1612px. Soft-looking swatches are the vendors' own source tiles: MRP ~400px (720/948 under 680px), Hellbender ~378–600px (all 201 under). The MRP importer already strips `-WxH` thumb suffixes; the originals are just small.
- **680px shorter side** is the floor for the 340px preview disc at retina. `scripts/audit-swatch-resolution.ts` (read-only) measures every stored swatch/tier image per press and lists offenders. `/api/admin/upload?mask=disc` returns `{lowRes, sourceWidth, sourceHeight}` (warn-only — blocking would strand vendor imports); PressVinylColors toasts it.
- **Client uploads downscale to 2048px max** (`downscaleImageFile` ADMIN_MAX_EDGE) — above the floor, not a culprit.
- **Disc generator asset**: `attached_assets/Splatter_VinylMockup_ALLLAYERS_1787184032655.psd` (Andrew, Aug 2026) — 20 vinyl-style groups of colorable stencil layers (~1104px plate) + shared CENTER STICKER / VINYL HIGHLIGHTS groups. Style rules are encoded in group/layer names ("ANY 2 COLORS", "IF BLACK MOVE TO TOP"). Four styles (Cloudy, 3-Color Side A/B, Galaxy, Marble) rely on Gradient Map adjustment layers — must be replicated programmatically (grayscale texture → color ramp). `pip install --user psd-tools` works in this env for reading the group tree (ImageMagick flattens hierarchy).

- **Andrew's style rules (Aug 19 2026)**: some styles use a gradient map on an image; others assign a color per layer; a group with BOTH "OPAQUE VINYL" and "TRANSLUCENT VINYL" base layers = either/or base choice (never both); CORNETTO's 4/5/6 SPOKES layers = pick ONE spoke count (never all three).
- **Confirmed model**: each MAIN GROUP in the PSD = one vinyl style option. Per style, the PRESS assigns the hex colors (one per applicable layer, OR the expected N colors — usually 2 — for a gradient map where applicable). ARTISTS later pick only from the press-assigned hexes for that style — artists can NEVER enter their own hex code (bake into future package-designer logic).

**Why:** Bill's direction (Aug 2026): don't mass-reprocess existing photos; humans set sizing standards and presses re-upload — OR build discs from these layers so uniformity is by construction.
**How to apply:** Any swatch-quality or disc-generator task starts from the audit script + this PSD; never assume our importers degraded images.
