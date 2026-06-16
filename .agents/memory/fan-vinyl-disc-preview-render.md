---
name: Fan vinyl-disc preview render path
description: How the fan-facing vinyl-disc preview gets its disc image, and why it silently falls back to a gradient.
---

# Fan vinyl-disc preview render path

There are TWO independent ways a tinted vinyl disc gets drawn, and they read
different data:

1. **Admin manufacturer chips + the SellPanel color picker** read the catalog
   row's `swatch_image_url` (a.k.a. `swatchImageUrl`) directly. These have
   always shown the real extracted disc photos.
2. **Every prominent fan-facing disc preview** — `VinylPreview.tsx` used in the
   Buy sheet "You'll get", the fan + admin order rows, and the post-purchase
   Welcome receipt — builds its disc from `resolveVinylColor(<color>)` in
   `shared/pressing.ts` and renders `option.thumbnailUrl`. If `thumbnailUrl`
   is null it **silently** renders the synthetic gradient/radial disc — no
   error, no broken image, just "the photos never show."

**Why this bit us:** the static `VINYL_COLORS` options shipped with
`thumbnailUrl` unset, so the fan previews ALWAYS drew the gradient even though
the extracted PSD disc PNGs existed in object storage. Fix = wire a complete
id→`/objects/uploads/<uuid>.png` map into `VINYL_COLORS` so every option
carries a `thumbnailUrl`.

**Second gotcha — SKUs snapshot color by DISPLAY NAME, not id.** Standard
catalog SKUs store the color as its display name ("Ultra Clear", "Violet"),
not the snake_case id ("ultra_clear", "violet"). So `resolveVinylColor` must
try the id map AND a normalized-name map (`VINYL_COLOR_BY_NAME`,
trim+lowercase) before falling back to a neutral `#888` disc. Other-press /
special-finish names (e.g. "Metallic Marble", "Apple Red + School Bus")
correctly fall through to the neutral disc with no photo.

**How to apply:** any time a disc should show a real photo on a fan surface,
make sure the color resolves to an option WITH `thumbnailUrl` — check both
the id and the display-name paths. The disc PNGs are full colored records
inscribed in a transparent square (corners transparent, a ~3% transparent
spindle hole at center; clear colors carry partial alpha), which is exactly
what `VinylPreview`'s `thumbnailUrl` path (rounded-full clip + slight scale)
expects. The object-storage bucket is shared dev+prod, so one URL serves both.
