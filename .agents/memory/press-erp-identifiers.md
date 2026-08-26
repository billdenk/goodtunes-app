---
name: Press ERP identifiers + customer profile
description: Boundaries for press-ERP reference fields on pressing orders and the press-scoped customer profile — generic fields with per-press labels, operator-only classification.
---

**The rule:** order↔ERP matching fields are press-GENERIC columns with per-press display labels (resolved via `shared/pressErp.ts`) — never press-specific columns. The press assigns the numbers out-of-band, so blank is normal and operators may enter them in ANY status.

**Why:** every white-label press runs a different ERP (MRP→Coda, Hellbender→Odoo, Viryl/PMP→spreadsheets); improvements must land for all presses at once, with only labels/values varying.

**How to apply:**
- Any surface showing these numbers must resolve labels per-press: snapshot pressId first, else the album's `album_skus.press_id`, else generic defaults (older order snapshots have a null pressId — the fallback is what makes labels work for them).
- The press customer profile (category/tier/terms) is INTERNAL ops data — how the press's own ERP classifies us. Operator-only (super_admin): a press must never read/write its own classification of GoodTunes from our side.
- Category/tier stay loose short strings seeded with one press's vocabulary — don't tighten to enums, another press's scheme must fit without schema change.
