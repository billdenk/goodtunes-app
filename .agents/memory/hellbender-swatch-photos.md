---
name: Hellbender catalog swatch photos
description: Source of truth for Hellbender non-Splatter color swatches and how to restore them safely.
---

# Hellbender catalog swatch source of truth

A Hellbender press_colors row's `swatch_image_url` for every **non-Splatter** color
must be the real **cropped disc PHOTO** (angled disc, GoodTunes label, transparent
bg). Those photos are committed as `/objects/uploads/<id>` URLs in
`scripts/data/hellbender-photos.json` (all maskVersion 2, already mirrored into the
shared Object Storage bucket).

`scripts/data/hellbender-records.json` holds **synthetic flat-color disc renders**.
Pointing catalog swatches at those was a regression — keep records.json only as a
fallback / as the set of "tool-written URLs we are allowed to overwrite."

## Restore path: `backfill-hellbender-photos.ts --repoint`
Network-free (no Shopify fetch, no re-upload). Re-points every non-Splatter row at
its committed photo, overwriting **only** rows that are blank OR carry a URL this
tooling wrote (a photos.json or records.json URL). An operator's hand-picked swatch
URL is in neither manifest → preserved. Splatter tiers are skipped via
`t.name NOT ILIKE '%splatter%'` AND no Splatter color name exists in either manifest.

The 31 Splatter color names per format are NOT all literally "splatter" but are
their own curated image swatches — never re-point them.

## Why post-merge runs --repoint every merge (NOT marker-guarded)
**Why:** the previous restore was a once-per-DB marker-guarded *unconditional*
re-point (`hellbender_record_swatches_v1`). Because it ran once and never again,
the 12" grouped tiers (Translucent/Clear/Metallic/Opaque/House Mix) that the seed
materialized *after* the marker was set were left with NULL swatches forever.
**How to apply:** for any backfill that must also cover rows/tiers added after its
first run, make the SQL operator-safe (overwrite only blank + tool-written values)
and run it every merge, instead of relying on a once-per-DB marker.
