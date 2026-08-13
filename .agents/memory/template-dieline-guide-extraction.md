---
name: Template dieline guide extraction
description: How Bleed/Cut/Safe/Fold rings for the press-template Printed-areas study are measured from a template's "does not print" separation.
---

Real press templates (e.g. MRP jackets) export TrimBox == MediaBox, so box-metadata bleed is null; the actual cut/bleed/safety/fold guides live as vector strokes in a spot separation named like `MRP DIELINE - Does Not Print`.

**Rule:** guide geometry is extracted at template-scan time (`CompletedPdfScanner` retains stripped content streams; classifier in `server/validators/completedTemplate.ts`), persisted as jsonb `press_template_specs.measured_guides` (shape `shared/templateGuides.ts`). jsonb NULL = never guide-scanned; a scanned file with NO guides stores the empty object — that distinction drives the one-shot rescan predicate (`RESCAN_GUIDES=1` in the measurement backfill, marker `task_3097_guides_rescan`).

**Why the classifier is conservative:**
- `Dimensions` separations carry measurement arrows/callouts, NOT die geometry — the sep-name regex deliberately excludes "dimension(s)".
- Staircase bleed edges of the front panel sit ~0.2″ inside the global bbox and look like full-height lines; folds require ≥0.3″ interior distance from the die bbox AND not sitting on any ring edge, or panel edges masquerade as folds.
- Ambiguity → emit nothing (single rect = cut only; 2 rings = cut+safety, never a guessed bleed).

**How to apply:** `measuredBleedLineInches` stays box-metadata-only (cert/proof logic untouched); guide bleed lives inside measured_guides and only the STUDY reads it (guides first). Labels ignore guide rects — the die is circular. Study fold source order: measured foldX/foldY → gatefold variant inference → "pending spec" footnote.

Verified against the real 12-JKTWS-200 PDF: bleed 0.126″, safety 0.125″, two spine folds 0.222″ apart at center.
