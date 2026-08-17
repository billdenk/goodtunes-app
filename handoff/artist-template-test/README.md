# Handoff: Artist Template Test page

**Replace presentational code verbatim; wire data only.** This file is the source, not a reference — copy it character-for-character, then swap the `MOCK_` consts for real data. See `handoff/README-template.md` for the standing handoff law (delete-first, states checklist, ledger, pane-of-glass, questions-beat-inventions).

## What this is
The ARTIST-facing version of the live press "Template. Test. Certify." page. Same exact layout as the live press page, with press-only items removed. An artist reaches it by clicking any art block on a release's Assets tab: they see their art seated in the press template, the check results, and the overlay/zoom viewer — read-only.

Removed vs. the press page (deliberate — do not re-add for artists):
- "File hygiene / GT template layers" check row (press-internal)
- "18 GT layers read", the "Originally 20260814_…" line, the flag/trail line
- Cancel / Save pill pair (artists never edit templates)
- "Save result & test another" + ••• (replaced by quiet "Download test proof")
- No filled blue anywhere — this is a viewer; the press page's blue Save is an edit action.

## Files
- `ArtistTemplateTest.tsx` — one self-contained screen. Imports only `react`, `lucide-react`, and `assets/niina-jacket.png`. Local `cn` + local `THEMES`.
- `assets/niina-jacket.png` — CALIFORNIALAND wide jacket-spread dummy art (MOCK data only; ships for pixel-diff acceptance).

## MOCK_ consts (all dummy data; swap these, nothing else)
- `MOCK_ART` — breadcrumb page label, art image, alt.
- `MOCK_TEMPLATE` — template name, certified date, size, uploaded line, art filename.
- `MOCK_TEST_FILE` — the upload-summary filename string.
- `MOCK_CHECKS` — check rows `{ param, tone: 'pass'|'na', detail }`.

## Wired vs decorative
Wired (local state / navigation):
- Appearance toggle (Sun/Moon) — light/dark mode (mock-only chrome; Otis uses its own theming)
- View tabs Full Template / Back / Front / Spine — active pill state
- Line | Area segmented control
- Zoom − / + (50–200%, scales canvas art live)
- Upload-card summary row — expands/collapses check rows
- Breadcrumb "Assets" — hash-navigates back (point at the real release Assets route)

Decorative (wire in Otis):
- Overlay chips: Template / Bleed / Cut / Spine / Front / Back off (last two with carets) — should drive the same overlay rendering as the press live-test page
- Layers-view icon button (toolbar right)
- "Download test proof"
- "Try another file"

## States to enumerate (acceptance bar)
1. Resting: passed banner collapsed ("Pass! All measured checks passed · 4 of 4 passed").
2. Banner expanded: four check rows, word + icon each, "Try another file" bottom-right.
3. In-progress upload state exists on the press page ("Uploading art… 58%" + thin sweep bar) — not mocked here; reuse the press page's progress treatment verbatim when wiring.
4. Both themes: dark charcoal default + light.

Acceptance: full-page screenshot diff vs this file's render, both themes, at 1440 / 1024 / 768. Any visual difference other than data values is a failure.

## Canon notes
- Statuses always word + icon, never color alone (colorblind-safe).
- Real ® characters ("GoodTunes®"). "Estimate", never "quote".
- Zero filled-blue on this screen by design.
- Questions beat inventions — anything ambiguous, flag to Bill.
