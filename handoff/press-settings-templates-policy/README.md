# Press Settings — Templates policy toggle

One self-contained card for the press Settings page: **"Require a passing test
before a template goes live"** (default **Off**). Per handoff law: replace
presentational code verbatim; wire data only.

## What it decides
- **Off (default):** a template is usable the moment the press saves it.
  Certification is optional proof — it happens automatically when a finished
  file passes a live test against the template.
- **On:** a saved template stays **Pending** until a finished file passes a
  live test. Only certified templates measure client files.

## Wiring
- `MOCK_DEFAULT_REQUIRE_TEST` → the press's saved setting (per-press column,
  same home as inks/prices/turnaround jsonb).
- The toggle writes through the settings page's normal save flow.
- Enforcement lives wherever client files get measured: if On and the matched
  template is not certified, the file waits (same "Pending" language as the
  Templates shelf).

## Theming
Card ships with the dark charcoal tokens inline (matches the settings mock it
came from). Map the token consts to the settings page's THEMES vars — light +
dark ALWAYS (Bill's binding rule). Status/state is word + toggle position,
never color alone.

## States checklist (acceptance)
- Off at rest · On at rest (explainer line changes with it)
- Both themes, 1440px full-page diff.
