---
name: Interactive content inside a <label> breaks clicks on Safari
description: Why combobox/button-bearing fields must not be wrapped in a <label>, and how to guard it
---

The admin gear `Field` primitive (`client/src/components/admin/PersonGearManager.tsx`)
wraps its children in a `<label>`. That is correct for a single plain input,
but the `InstrumentPicker` combobox renders a stack of `<button>` options. A
`<button>` is a *labelable* element, so nesting it inside a `<label>` is invalid
HTML.

**Symptom:** typing a partial instrument name showed the match, but
clicking it reverted to an empty search box — the selection never stuck, so no
gear could be credited. Prod/Safari-only.

**Why:** Safari forwards/duplicates the activation of a labelable descendant to
the label's labeled control (the search `<input>`), which reopens the typeahead
and swallows the selection. Chrome and jsdom honor the spec's "the activation
behavior for events targeted at interactive content descendants must be to do
nothing", so it works there — which is exactly why it only surfaced on the
published app and never in dev.

**Fix:** `Field` takes `as="label" | "div"` (default `"label"`, backward
compatible). Any field hosting its own focusable controls (the Instrument
picker) uses `as="div"`.

**How to apply:** never wrap a combobox, menu, or any element containing its own
`<button>`/`<input>` controls in a `<label>`. jsdom CANNOT reproduce the Safari
forwarding, so the meaningful regression guard is structural —
`combobox.closest("label") === null` — not a click-then-assert-pill test (that
passes even when the bug is live).
