---
name: CD/cassette catalog pages
description: How the CD + cassette catalog build pages store data and why their bodies are dark-only verbatim handoff code.
---

# CD / Cassette catalog build pages (handoff/cd-cassette-catalog)

- Unlike vinyl (press_formats/tiers/colors tables), CD and cassette have a FIXED
  product structure defined in code (cases, prints, booklet panels, the 8 stock
  shells, imprints). Each press varies only: custom silkscreen spot inks (CD),
  the run price ladder, and a turnaround override — stored as ONE jsonb blob per
  format on `manufacturers.cd_catalog` / `cassette_catalog`. Null resolves to
  handoff defaults server-side (`resolveMediaCatalog`).
- **Why:** the handoff README is a binding contract — presentational code copied
  character-for-character, dark-only body even inside the dual-theme shipped
  Catalog page. Don't theme-flip or "fix" its raw hexes; design-lint baseline
  was re-snapshotted to accept them.
- **How to apply:** any new editable knob goes INTO the jsonb blob via the merge
  PUT `/api/admin/manufacturers/:id/catalog/media/:format` (atomic
  `COALESCE(col,'{}') || patch` — never read/merge/write the whole blob).
  Selection state (case/shell/imprint/booklet) is preview-only, never persisted.
  Tape length is derived from album runtime — never a picker.
- The pill row's CD/cassette state is local `mediaTab` (deep link `?media=cd|cassette`),
  deliberately separate from vinyl's `activeTab`/offeredList reset logic.
