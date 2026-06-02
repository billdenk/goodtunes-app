---
name: Vinyl disc mask — two-tone studio backdrop
description: How maskToVinylDisc separates a vinyl disc from a non-uniform studio backdrop, and how to re-process already-stored swatch photos.
---

# Cropping vinyl mock-ups to a clean transparent disc

`maskToVinylDisc` (server/vendorColorScrape.ts) turns a square product
mock-up into a transparent round disc. Two backdrop families matter:

- **Uniform backdrops** (MRP, plus solid black/white/gray uploads): handled
  by a flat-tone fallback — perimeter tones (chromatic + achromatic) are
  background, everything else foreground.
- **Two-tone studio backdrops** (Hellbender): a split gray/white frame with a
  diagonal gradient seam + drop shadow. A flat-tone match on the corners alone
  left the seam/shadow as foreground, so discs came out as rough squares.

**The rule that makes both work:** when the perimeter is *mostly light and
achromatic* (`achroFrac ≥ 0.5 && achroMax ≥ 170` → "studio"), treat the whole
**gray band** as background (`chroma ≤ 30 && v ≥ bandLo`, where
`bandLo = max(78, achroMin − 60)` so the band swallows seam + shadow but a true
black disc stays foreground), and **do NOT fold achromatic gray tones into the
flat-tone matcher** — doing so eats grayish translucent discs (coke bottle).
Achromatic flat tones are only added when *not* studio. Chromatic perimeter
tones always count as background.

**Why the split matters:** the gray band and the achromatic flat-tone matcher
overlap, but the band is tuned (seam/shadow margin) while the flat matcher has a
tight per-channel tolerance. Using the flat matcher on grays in a studio image
mis-classifies a translucent disc's grayish body as backdrop.

**Graceful bail (returns null → caller keeps the original, maskApplied:false):**
- fully transparent perimeter (`periCount === 0`) — MRP's already-cut PNGs.
- color-ambiguous discs where the record can't be told from the backdrop:
  white, clear, silver, smokey, natural, and true **black** (its drop shadow is
  inseparable by color). These keep their raw square photo — accepted, not a bug.
- low-confidence component: size < 0.33·minDim, aspect outside [0.85,1.18],
  circle-fill outside [0.80,1.15], or bbox-fill < 0.62 (rectangles, photos).

After masking: hole-fill (border flood → enclosed bg becomes fg, fixes label +
spindle holes), keep the largest 4-connected component, crop, 1px AA fade.

## Re-processing already-stored swatch photos

The Hellbender backfill (scripts/backfill-hellbender-photos.ts) mirrors the
Shopify mock-up into the shared object-storage bucket and stamps press_colors.
`mirrorImage` now runs each image through `maskToVinylDisc` (was raw before).

Add `--remask` to re-crop existing rows: it re-mirrors any color whose manifest
entry lacks `masked: true`, then re-points existing rows (drops the
`swatch_image_url IS NULL` guard). Run on dev once (mints the circle images into
the shared bucket + persists URLs + `masked:true` to
scripts/data/hellbender-photos.json), then on prod — prod reuses the manifest
URLs instead of re-mirroring, so dev and prod point at the *same* image (the
shared-bucket "mirror once, write both DBs" rule). The interactive importer
(routes.ts hellbender commit) already masked, so only the backfill path needed
the change.
