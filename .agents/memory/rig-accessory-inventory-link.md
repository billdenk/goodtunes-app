---
name: Rig accessories are inventory-backed
description: rig_accessories carry an optional instrumentId link to the gear catalog; the fan-out sites that must keep it in sync
---

# Rig accessories link to gear catalog via nullable instrumentId

A rig accessory is no longer just free text. `rig_accessories` carries an
optional `instrument_id` FK (nullable, `ON DELETE SET NULL`) so an accessory
(strings, picks, capo) can be a real catalog item, while the legacy `{type,
value}` text stays for fan-facing display + back-compat (legacy rows = `null`).
The admin value field is the reusable `GearPicker` (exported from
`PersonGearManager.tsx`, modeled on `InstrumentPicker`): type-to-search the
inventory, or paste a product URL → scrape → create with
`shortCategory: "Accessory"` → link.

**Why:** accessories needed to become first-class cross-linkable gear (same as
the main "Add gear" picker) without breaking the thousands of existing free-text
accessory rows.

**How to apply — the field is a fan-out landmine.** Adding/keeping any per-
accessory field (like `instrumentId`) means touching it in EVERY one of these or
it silently vanishes:
- BOTH per-editor `clean()`/`cleanAcc()` helpers — one in `PersonGearManager`,
  one in `TrackCreditsPanel`. Forgetting either strips the field on save.
- The add-a-blank-draft push (must seed the field, e.g. `instrumentId: null`).
- The edit-existing-rig path (spreads `{...a}` — fine only if the read payload
  carries the field).
- ALL read-serialization sites in `storage.ts`: `loadRigDetail` (full-row
  select is fine), the person gear-context `matchingRigs` map, AND the
  `songs/:id/rigs` map — the last two map fields explicitly, so they each need
  the field added or the picker chip won't rehydrate on reopen.
- The rig-accessory zod body schema in `routes.ts` (optional).

`"Accessory"` in `SHORT_CATEGORIES` is display-only — it does NOT spawn a fan
filter chip (fan surfaces use shortCategory as label text, not a filter source),
so tagging scraped accessories with it is safe.
