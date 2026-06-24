---
name: Press template specs catalog
description: How the completed-PDF-template press check resolves operator-editable catalog specs over the measured baseline, and the call-site landmine.
---

The completed-PDF-template press check compares each supplied component file against
required finished specs that are now **operator-editable catalog data**
(`press_template_specs`, keyed `press_id` → `format` (AlbumFormat) → `component_key`
[+ `variant_key` + `disc_count`]), merged **OVER** the measured-from-real-files
baseline (`requiredFinishedComponents` in `shared/vendorSpecs.ts`).

**Rule:** any route that needs the required components MUST go through the async
`resolveRequired` (→ `resolveFinishedComponents`), never call
`requiredFinishedComponents` directly. There are several completed-template call
sites; if a new one calls the baseline directly it silently bypasses every operator
edit and only ever sees the hardcoded constants.

**Why:** specs were code-only constants measured from real MRP print files. Bill
approved making them editable per press without losing those measured defaults, so
the resolver falls back to the baseline whenever a press hasn't customized a slot —
"never worse than before the table existed". Merge rules guard a half-filled row:
BOTH artboard dims must be set to override sizing (one dim alone is ignored), a
jacket `variant_key` match wins over the `""` fallback, an exact `disc_count` wins
over the generic `0`, and `expected_pages`/`color` override individually.

**How to apply:**
- The album and the completed-template check carry a `vendorId`, NOT a `pressId`.
  The vendor→press bridge is by **name** (mirror of `matchInvitedPressToVendor`
  over `storage.getManufacturers()`), because there is no stored vendor↔press map.
  No name match → no store rows → baseline only.
- New spec fields must thread through the resolver merge AND the seed; keep the
  post-merge seed behavior-neutral (dims only — don't stamp color/pages) so it
  can't change verdicts on existing releases.
- The table is created in dev now; prod gets it from `scripts/post-merge.sh` on
  merge (prod is read-only from the task env), so schema-drift-smoke will flag it
  prod-missing until then — that's expected, not a bug.
