---
name: Hellbender Splatter swatches are a generic template set
description: Where Hellbender's 12" Splatter disc colors came from, and that they are NOT the verified catalog.
---

The colors on Hellbender's 12" Splatter tiers (`12_lp` + `12_double`) are disc renders extracted from the press's generic `BONUS_VinylMockUp_Examples.psd` — a MIX of effects (splatter, marble, smoke, galaxy, color-in-color, tri-color), NOT Hellbender's verified per-color catalog, and all priced at the flat Splatter tier rung. They are image-backed (`swatch_image_url` = the disc PNG; `swatch_hex` is a never-displayed fallback) and were loaded by a standalone script that uploads to the shared dev+prod Object Storage bucket then inserts insert-if-absent into the existing tiers — the same pattern as the image-swatch backfills, NOT the boot seed (which only sets hex via `ensureColor`).

**Why:** Bill confirmed the PSD as a quick source to fill the empty picker; he or an operator may later rename, reprice, or prune them in admin, so the names/prices are not canonical.
**How to apply:** If asked to "fix" or "verify" Hellbender Splatter colors, know they are a template fill that is curatable in admin. Re-running the loader is additive (it re-adds any deleted name), so it is not a curation-safe sync.
