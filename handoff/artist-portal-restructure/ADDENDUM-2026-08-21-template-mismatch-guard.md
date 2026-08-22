# ADDENDUM 2026-08-21 — Full-template dimension-mismatch guard

Fixes the live miss Bill hit in a client demo: choosing "Full template" in the
"How are you replacing the art?" dialog, then uploading PANEL-SIZED art, silently
seated the file centered on the 779.41 x 539.33 mm spread. The app must catch this.

ArtistPortalRestructureFlow.tsx in this folder is REPLACED by this push. Handoff law
applies (handoff/README-template.md): copy verbatim, wire data only, delete-first.

## The behavior (wire this for real)
On upload through the FULL TEMPLATE path, measure the file's true dimensions and
compare against the template spec:
- Matches the full template (within tolerance) -> seat it and run checks, as today.
- Matches a PANEL size instead -> show the MismatchSheet (in this file). Never seat it.
  There is deliberately NO "use it anyway" escape - a wrong-size full template is
  never seatable.
- Matches neither -> the existing failed-check treatment.

## The MismatchSheet (new in this file)
- Heading: "That file measures like a single panel." Status chip "Size mismatch" with
  AlertTriangle - word + icon, never color alone.
- Numbers block: uploaded file's measured mm ("matches a front panel") vs
  "Full template expects 779.41 x 539.33 mm - back, spine and front".
- Actions: ONE filled action "Swap the front panel instead" (routes to the single-panel
  path WITH the file carried along); secondary "Choose a different file"; text Cancel.
- All dummy values in MOCK_MISMATCH; swap for real measured values. In production the
  "matches a front panel" label comes from comparing measured dims against each panel
  in the template spec, not a hardcoded string.

## Must work
- Real measurement on upload (the same source of truth as the "Exact mm, straight from
  Illustrator" layer table - PDF page box, not the preview raster).
- "Swap the front panel instead" -> single-panel flow, file preattached, panel preselected
  to whichever panel the dims matched.
- "Choose a different file" -> reopens the full-template picker.
- Tolerance: treat dims within 1 mm of spec as a match.

## Click path in the mock (for your screenshot diff)
Release card -> Replace -> "Full template" -> Continue -> mismatch sheet.
Test IDs: button-replace -> replace-method-template -> replace-confirm -> mismatch-sheet
(mismatch-swap-panel / mismatch-choose-another / mismatch-cancel).

## Acceptance
Screenshot diff of the sheet at 1440px, both themes, against this file.
