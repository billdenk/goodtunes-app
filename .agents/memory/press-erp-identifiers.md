---
name: Press ERP identifiers + customer profile
description: Boundaries for press-ERP reference fields on pressing orders and the press-scoped customer profile.
---

# Press ERP identifiers + customer profile — boundaries

- **ERP reference fields are press-GENERIC columns with per-press display labels, never press-specific columns.** Every white-label press runs a different ERP; improvements must land for all presses at once with only labels/values varying. Resolve labels per-press (snapshot press first, album's press as fallback, generic defaults last). Presses assign these numbers out-of-band, so blank is normal and operators may enter them at ANY status.
- **The press customer profile (category/tier/payment terms) is internal ops data — how the press's ERP classifies us.** Operator-only (super_admin): a press must never read or write its own classification of GoodTunes from our side.
- **Keep classification fields loose text seeded with vocabulary, not enums**, so another press's scheme fits without schema change.
