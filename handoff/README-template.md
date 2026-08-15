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


## Handoff law — how every handoff lands (standing rules, Aug 14 2026)

These rules apply to EVERY folder in `handoff/`. They exist because drift has
always had the same root cause: reconciling an existing page with the handoff
instead of replacing it.

1. **Delete-first rule.** The existing UI for this flow comes OUT before the
   handoff goes in. Keep your data wiring, endpoints, and tests of behavior —
   retire your components, layouts, and modals. Do not merge the two UIs, do
   not keep "your version" of any piece the handoff covers. If a test only
   exists to protect the old UI, retire the test with it.
2. **States checklist is the acceptance bar.** Each handoff README enumerates
   every reachable state (tabs, toggles, hover, empty, sheets, view-as, …).
   Done = a screenshot diff per line, BOTH themes, at 1440px. A diff that only
   covers the default state is not a diff.
3. **Handoff ledger in STATUS.md.** For each page built from a handoff, record
   the handoff commit SHA it currently matches. When a correction round lands
   on main, that pointer is stale and the page owes a re-diff — no memory, no
   guessing.
4. **View-as is a pane of glass.** Admin "Viewing as <press>" renders the
   press's exact components and states — never a separate implementation.
5. **Questions beat inventions.** If the handoff conflicts with something real
   you've built (data model, product need), STOP and flag it to Bill. Silent
   adaptation — extra dropdowns, substituted art, simplified renders — is the
   one unforgivable move.
