---
name: PMP dev/prod vinyl catalog generations differ
description: PMP's vinyl type keys diverge between dev clones and prod; seeds must match by candidate key lists, not exact keys.
---

PMP (Physical Music Products, press id pinned in scripts/seed-pmp-component-pricing.ts) carries **different generations of its vinyl color library in dev vs prod**: the operator restructured prod on Aug 26 2026, so prod type keys are `black, color, splatter, mix-swirl, splatter-2-colors, black-splatter-2-colors` while task-clone dev still has `black, color, opaque, translucent, splatter, splatter-4, splatter-5, deed`.

**Why:** the record-pricing seed FATALed on prod when it required exact dev-era keys; either DB can drift again whenever the operator edits the vinyl library.

**How to apply:** any seed/backfill targeting PMP pricing-component type rows must match sheet families by **candidate key list** (≥1 present required per family; genuinely-absent families like Handmade on prod are optional → skip with a log, honest pending). Never assume dev row shapes predict prod. Family mapping interpretation lives in docs/vendors/pmp.md.
