# Handoff checklist (Playground → Agent)

Copy this file into each new `handoff/<feature>/` folder, fill it in, and check the boxes before handing off.

## The contract
- Agent copies every className and inline style **verbatim** — the TSX is the pixel spec.
- Agent replaces **only** the `MOCK_*` consts with real data.
- Acceptance check = literal text-diff of the styling between your file and the shipped page (not screenshots).

## Files
- [ ] One self-contained `.tsx` per screen (no imports from Playground-only helpers; inline everything or note it below).
- [ ] All dummy data in clearly-named consts at the top of each file: `const MOCK_TIERS = [...]`, `const MOCK_COLORS = [...]`.
  Anything NOT in a `MOCK_*` const is treated as design and copied as-is.

## States (for each screen)
- [ ] Default / happy path
- [ ] Empty (zero items)
- [ ] Loading
- [ ] Error
- [ ] Read-only / permission-reduced variant (if the screen has one)

## Flow notes (fill in)
1. **Screen order:** e.g. `Catalog.tsx` → click "Add color" → `AddColorSheet.tsx` → save → back to Catalog with new color selected.
2. **Wired vs decorative:** list which buttons/links must actually work vs are visual placeholders.
3. **Intentional deviations:** anything on purpose different from the rest of the admin (type sizes, colors, spacing) so it isn't "normalized" away.
4. **Data mapping hints (optional):** e.g. `MOCK_TIERS ↔ catalog tiers API`, "count under tile name = colors in that tier".

## Don'ts (for the Agent — enforced)
- No substituting responsive grids for fixed ones, no "equivalent" borders/shadows/text sizes.
- No skipping states that exist in the handoff.
- No design-system "corrections" — if design-lint complains, the baseline gets re-snapshotted instead.
