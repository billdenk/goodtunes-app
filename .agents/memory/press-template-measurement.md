---
name: Press template measurement drives artwork checks
description: press_template_specs measured_* columns, precedence order, and where the scan triggers live
---
Attached press catalog template PDFs are measured server-side (artboard size, page count, CMYK/RGB/spot, live text, embedded fonts, dieline) into `measured_*` columns on `press_template_specs`. Per-field precedence in `resolveFinishedComponents`: explicit operator edit → measured-from-template → hardcoded baseline → computed finished+bleed (advisory). Provenance rides on `FinishedComponentSpec.sizeSource/pagesSource/measuredFromLabel` and drives check wording ("vs <press> template on file").

**Rules:**
- The scan writes ONLY `measured_*` columns (separate storage method) so re-uploads never clobber operator overrides; removing/replacing the URL clears measurements first.
- Convention flags (color/fonts/dieline) are shown for operator confirmation in the catalog editor — never auto-applied to the configured rules.
- Scan failure is non-fatal: `measured_error` set, row falls back to baseline/computed, editor shows a "couldn't measure" note + Re-scan button (`POST .../template-specs/:specId/measure`).
- Backfill: `scripts/backfill-template-spec-measurements.ts` (rows with template_file_url and measured_at IS NULL), invoked bounded from post-merge.sh.

**Why:** hand-entered specs drifted from the plants' real templates; different presses need different expectations per component.

**Gotcha:** PMP's on-file templates are ShareFile share-page links (HTML, no direct-download URL) — those legitimately land in the "couldn't measure" state; only raw-PDF links or /objects uploads measure.
