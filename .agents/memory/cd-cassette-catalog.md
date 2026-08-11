---
name: CD/cassette catalog pages
description: How the CD + cassette catalog build pages store data; bodies are theme-aware verbatim handoff code (dark-only rule superseded Aug 2026).
---

# CD / Cassette catalog build pages (handoff/cd-cassette-catalog)

- Unlike vinyl (press_formats/tiers/colors tables), CD and cassette have a FIXED
  product structure defined in code (cases, prints, booklet panels, the 8 stock
  shells, imprints). Each press varies only: custom silkscreen spot inks (CD),
  the run price ladder, and a turnaround override — stored as ONE jsonb blob per
  format on `manufacturers.cd_catalog` / `cassette_catalog`. Null resolves to
  handoff defaults server-side (`resolveMediaCatalog`).
- **Why:** the handoff README is a binding contract — presentational code copied
  character-for-character. As of the Aug 2026 theme-aware re-pull, the handoff
  files carry a THEMES map (light + dark token sets) and the wired bodies pick
  the set from the shell's active theme via `useAdminDark()` — the old
  "dark-only, never theme-flip" rule is SUPERSEDED. The mock's floating
  "View light / View dark" pill is mock-only chrome, never shipped. Don't
  "fix" raw hexes inside the THEMES map; design-lint baseline is
  re-snapshotted to accept handoff-verbatim patterns.
- **How to apply:** any new editable knob goes INTO the jsonb blob via the merge
  PUT `/api/admin/manufacturers/:id/catalog/media/:format` (atomic
  `COALESCE(col,'{}') || patch` — never read/merge/write the whole blob).
  Selection state (case/shell/imprint/booklet) is preview-only, never persisted.
  Tape length is derived from album runtime — never a picker.
- The pill row's CD/cassette state is local `mediaTab` (deep link `?media=cd|cassette`),
  deliberately separate from vinyl's `activeTab`/offeredList reset logic.
