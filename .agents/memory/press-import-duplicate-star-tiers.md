---
name: Press color-library re-import creates duplicate "*" tiers
description: A vendor color-library re-import that doesn't match existing tier rows by name spawns parallel "*"-suffixed twin tiers instead of enriching the originals.
---

# Press color-library re-import creates duplicate "*" tiers

A per-color photo re-import (MRP "Import from MRP", and the same class on
Hellbender — see press-pricing-sources-and-lock) can land its results in a
NEW tier named like the original plus a trailing `*` (e.g. `Opaque*`,
`Neon*`, plus empty `Metallic Blends*` shells) instead of updating the
existing plain tier. The result is a doubled catalog where:

- the **plain** tier keeps the clean name, the hex swatches, the position
  sequence, and the (possibly all-$0) jacket-ladder pricing, while
- the **`*`** tier carries only the uploaded photos (no hex, no real
  pricing).

**Why it matters:** pricing lives in `press_tier_jacket_ladders` (the
`press_color_tiers.price_ladder` jsonb is deprecated/empty), and SKU
snapshots store the tier/color NAME as text (`album_skus.vinyl_color_tier`).
So the safe collapse is **keep the plain tier, fold the photos onto its
same-named colors, then delete the `*` tier** — never rename `*`→plain and
never keep `*` (you'd drop the clean name + any pricing). FK cascade on
`press_colors` and `press_tier_jacket_ladders` means deleting a tier cleanly
drops its colors + ladder.

**How to apply:** before collapsing, verify no live `album_skus` reference
the `*` names (they shouldn't — picks store the plain name); pricing-neutral
when ladders are all-$0; the kept plain tiers already form a gapless 0..N
position sequence once the `*` artifacts are gone, so no re-sequencing is
needed. `scripts/cleanup-memphis-catalog.ts` is the idempotent, backup-first
template (no-op once the `*` tiers are gone, so safe on already-clean DBs
like a fresh dev clone). The underlying importer bug (creating `*` twins on
re-import) is still unfixed — a re-import can re-spawn them.
