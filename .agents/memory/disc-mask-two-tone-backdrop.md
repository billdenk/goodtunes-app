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

**Two-stage now:** color segmentation runs first (above); if it bails (but
perimeter is NOT fully transparent) a **shape/edge-aware fallback**
(`detectDiscByEdges`) runs before giving up. It detects the disc by SHAPE not
colour: Sobel-gradient-direction voting picks the disc CENTRE (every concentric
groove + the rim point at it), constrained to a central window (centred-disc
prior); then it takes the OUTERMOST radius whose circumference is ≥0.5 edge-
covered and accepts only if the refined coverage ≥0.62. This recovers the
translucent **white / clear / silver / smokey / natural** stocks (real discs
score ~1.0) that colour can't separate from the backdrop. Edge threshold is
adaptive (`mean·1.8`, floor 28) because studio mockups are very low-contrast
(mean ≈10) vs lifestyle photos.

**Graceful bail (returns null → caller keeps the original, maskApplied:false):**
- fully transparent perimeter (`periCount === 0`) — MRP's already-cut PNGs.
  This early-bails BEFORE the edge fallback so MRP doesn't regress.
- true **black**: Hellbender's only black images are *lifestyle photos* (record
  on a stack of sleeves, off-centre + occluded), not centred studio mockups, so
  the shape pass correctly rejects them (coverage ~0.52 < 0.62). They stay square.
- low-confidence colour component AND no confident centred ring (coverage <0.62):
  rectangles, photos — still bail.

**Re-running after a mask change:** the backfill manifest now carries
`maskVersion` (not the old `masked:true`); `backfill-hellbender-photos.ts`
re-mirrors any entry whose version ≠ the script's `MASK_VERSION`. Bump that
constant whenever maskToVinylDisc's crop changes, then `--remask` on dev
(mints v2 circle PNGs into the shared bucket + commits manifest) and on prod
(reuses the manifest URLs, re-points rows). v2 = the shape/edge-aware pass.

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
