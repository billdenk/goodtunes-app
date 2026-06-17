---
name: Hellbender Splatter swatches (Bill's authoritative export)
description: Where Hellbender's 12" Splatter disc colors came from, that they are operator-curatable, and the marker-guarded scoped-replace contract.
---

Hellbender's 12" Splatter tiers (`12_lp` + `12_double`) render disc-image swatches: `swatch_image_url` is the disc PNG (what the SellPanel picker shows), `swatch_hex` a never-displayed fallback. The discs are Bill's own authoritative PNG export, mirrored ONCE into the shared dev+prod Object Storage bucket; the committed manifest's resolved `/objects/...` URLs let prod + fresh clones reuse the images instead of re-uploading.

They remain a MIX of effects (splatter, marble, smoke, galaxy, color-in-color, tri-color) at the flat Splatter tier rung — NOT a verified per-color catalog. Bill confirmed this set to fill the empty picker; he or an operator may rename, reprice, or prune them, so names/prices are not canonical.

**Why this matters:** an earlier PROVISIONAL set (import_source `psd:BONUS_VinylMockUp_Examples`) had already landed in dev and included one color Bill's export drops. A blind insert-if-absent would strand that dropped color.

**How to apply:** the loader is a SCOPED clean-REPLACE, not a blind insert — per tier it DELETEs only the old `psd:BONUS_VinylMockUp_Examples` rows (operator-added rows with other sources are untouched) then inserts the export if-absent-by-name with a fresh import_source. It is one-time per DB via a `post_merge_data_backfills` marker and runs from `post-merge.sh` on both DBs, so once applied operator curation survives future merges and the dropped color never returns. Re-running by hand is safe even unmarked (scoped delete + if-absent insert = no-op). Self-gates on a clone lacking the press/Splatter tiers (writes nothing, marker stays unset to retry).
