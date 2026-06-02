---
name: Production-partner capability model
description: manufacturers carry doesVinyl/doesGoodDeed/doesFulfillment flags; one partner serves multiple jobs; capability surfaces filter the one canonical row, but selection/pricing FKs are NOT capability-aware.
---

# Production-partner capabilities (Vinyl / GoodDeeds / Fulfillment)

The canonical `manufacturers` table carries three notNull capability booleans (`doesVinyl` default true, `doesGoodDeed`/`doesFulfillment` default false), guarded by a `manufacturers_capability_at_least_one` CHECK. A single partner can carry all three — never split a multi-capability partner into multiple rows. POST defaults vinyl-on when none sent; both POST and PUT reject all-off with a 400 (PUT merges patch over current row). Mirrors the vendors Maker/Reseller at-least-one shape.

Capability surfaces filter the same canonical list: a per-press toggle card on the press detail Overview (auto-save, blocks last-off), an All/Vinyl/GoodDeeds filter + chips on the Presses tab, and a Fulfillment **nav/browse** union that lists fulfillment-capable presses alongside dedicated fulfillment partners (discriminated entry kind, "Press" chip, links back to the press detail page).

**Why:** GoodTunes production partners aren't one-job-each (a plant may press vinyl *and* warehouse/ship; a printer may only mint GoodDeeds). Flags on one row keep a partner editable in one place instead of a second entity per job.

## Critical: capability flags are browse/eligibility metadata, NOT selection/pricing keys
The operational **selection and pricing** paths are keyed to other tables by hard FKs and are deliberately NOT capability-aware. Bridging them is a separate redesign, not a quick wire-up:
- GoodDeed routing-default printer/hologram/insertion picker → `payout_settings.default_*_vendor_id` are real FKs → `vendors.id`; GoodDeed pricing resolves by vendor id. Storing a manufacturer id breaks the FK and zeroes pricing.
- Fulfillment selection → `manufacturers.default_fulfillment_partner_id` and `albums.fulfillment_partner_id` are real FKs → `fulfillment_partners.id`. A press id can't be selected there without breaking the FK.

**How to apply:** treat the capability flags as "what this partner *can* do" for filtering/browsing. Making a selection or pricing flow honor a capability requires resolving the cross-table FK first (polymorphic owner, deterministic manufacturer↔vendor mapping, or a synchronized eligibility projection) — expect a dedicated task, and never naively widen those pickers to manufacturer ids.

## Backfill (post-merge, domain-keyed, ID-drift safe)
Existing rows fill vinyl-on from the column default. A guarded, domain-keyed post-merge backfill flips the GoodDeeds-only printer and the all-three flagship plant (domain-keyed because founding-seed ids drift per clone). Schema add ships as a prod-schema-fixup .sql (ADD COLUMN IF NOT EXISTS + pg_constraint-guarded CHECK).
