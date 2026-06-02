---
name: Object Storage bucket is shared across dev + prod
description: Image uploads land in one repl-level bucket that BOTH the dev workspace and the published prod app read from, so mirror catalog/scraped images once and reference the same /objects/uploads URL in both DBs.
---

# Object Storage bucket is shared across dev + prod

There is ONE object-storage bucket per repl (PRIVATE_OBJECT_DIR /
DEFAULT_OBJECT_STORAGE_BUCKET_ID). The dev workspace and the deployed
production app both read/write it — `/objects/uploads/<id>` resolves in
either environment.

**Why it matters:** when seeding catalog/scraped imagery into BOTH the dev
DB and the prod DB (e.g. press color swatches), you only upload each image
ONCE. Mirror upstream → object storage, capture the `/objects/uploads/<id>`
URL, then write that SAME URL into both DBs. Don't re-upload per environment
(you'd orphan duplicate blobs and the URLs would diverge).

**How to apply:** the importer pattern stores `swatch_image_url` =
`/objects/uploads/<uuid>.<ext>` (display copy) and `import_source_url` = the
upstream URL (audit / "already imported" detection). To mirror from a
script, replicate `resolveUploadTarget` + `saveBufferToObjectStorage` from
server/routes.ts: split PRIVATE_OBJECT_DIR into bucket + prefix, write under
`<prefix>/uploads/<uuid>.<ext>` via `objectStorageClient`, then
`setObjectAclPolicy(file, { owner:"admin", visibility:"public" })`.
`scripts/add-memphis-metallic.ts` is a working template (manifest holds the
resolved publicUrls so a second run against the other DB reuses them instead
of re-mirroring). DB rows still drift per environment (different tier/color
ids) — only the blob + its URL are shared.

**Press swatch photo provenance** (matched by color NAME, not id):
- Memphis: the all-vinyl-colors page PNGs (e.g. Metallic Blends = HB01–HB36).
  These arrive ALREADY pre-cut as clean transparent-background discs (no studio
  backdrop), so maskToVinylDisc bails (periCount===0) and the raw mirror IS the
  clean disc — Memphis needs NO re-masking even though add-memphis-metallic.ts
  mirrors raw. Only Memphis's "Metallic Blends" tier has photos; its other tiers
  (Opaque/Translucent/etc.) carry neither hex nor photo. PMP (Physical Music
  Products) is hex-only, no photos. So as of the swatch-consistency audit, NO
  press serves square studio mockups — only Hellbender's mockups needed masking.
- Hellbender: `hellbendervinyl.com/products.json` — each "Custom Vinyl
  Records - <Color>" product's first image is that color's mockup (square
  gray/white background, png + a few webp/jpg); pull at `?width=600`. DB color
  name == Shopify title minus the prefix, except "Coke Bottle"→"Coke Bottle
  Clear" and "House Mix"→"Regrind Mix". See
  `scripts/backfill-hellbender-photos.ts` — backfills `swatch_image_url` only
  where it IS NULL (keeps hex as the matching fallback; never clobbers).
