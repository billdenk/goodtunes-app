---
name: Press catalog pricing sources + sync lock
description: How a press tier's ladder can be written from multiple sources, the lockedFromSync guard, and the Hellbender importer's color-group name mismatch.
---

A single press tier×jacket ladder can be populated from several independent
sources over its life: a hand-entered PDF quote seed, the live Shopify importer,
and a manual "site builder" load. They overwrite the same rungs, so provenance
matters.

**Rung provenance fields** (jsonb, optional, pass through getPressCatalog
untouched): `source`, `syncedAt`, `lockedFromSync`, `estimated`. The SellPanel
snap only reads `confirmed` — extra fields are inert to pricing but survive
round-trips.

**lockedFromSync is the only clobber guard.** The Hellbender Shopify importer
skips any existing rung where `lockedFromSync===true`. Any value you load that
must outlive a re-sync (operator price, site-builder price, an interpolated fill)
MUST carry it, or the next sync silently replaces it with the base catalog
number.
**Why:** Hellbender's per-color Shopify variants quote the *bare-disc* price; the
manually-loaded GoodTunes prices are *upgrade-inclusive* (12″ = +insert, 7″ =
+gatefold). Without the lock a re-sync downgrades a finished-record quote to a
bare disc and undercharges.

**Importer color-group name mismatch (live gotcha).** `resolveTierForHandle`
returns bare tier names — "Translucent" / "Clear" / "Metallic" / "Opaque" — but
the catalog tiers are named "Translucent Colors" / "Clear Colors" / etc. The
importer keys writes by `format|tierName`, so those four color groups never match
a catalog tier and fall into `tiersMissing` — the importer simply can't write
them. Only **Black**, **House Mix**, and **12_lp Color** names line up, so those
are the only tiers the Shopify sync (or the lock) actually affects today. If you
ever want the importer to write color-group pricing, fix the name mapping first.
