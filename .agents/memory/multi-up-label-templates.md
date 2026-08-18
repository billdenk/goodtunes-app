---
name: Multi-up label templates (two-up preview oval)
description: Two-up label pages must never render the single-die circle model or a merged-round layer overlay.
---

Rule: label templates can carry MORE than one die per page (e.g. Hellbender's two-up 12" center-label sheet, 8.5 × 4.25 in, Side A / Side B circles side by side). No preview surface may assume page == one circular die.

**Why:** the study builder forced labels to a 1:1 circle (cropping the render), and the Live-test GT-layer extractor merged a layer's two circles into one bbox flagged `round`, painting a giant page-spanning dashed oval + wash over the real dies.

**How to apply:**
- `buildStudySpec.ts`: `isMultiUpLabelPage` — labels page with max/min aspect > 1.45 drops the circle model (true aspect, square shape, no Hole ring). MRP's real single-die page is 6.5 × 7.6811 (ratio ≈ 1.18) and must stay circle.
- Labels (single OR multi-up) NEVER consume `measuredGuides` — the dieline classifier's merged bboxes could span dies (classifier also drops curved strokes, so circles never classify anyway).
- Live-test overlay (`extractGtLayers`): `round` only when one curve subpath covers ≥80% of the merged layer bbox in both dims; otherwise honest rectangle.
- Per-die Side A/B circular rings are NOT implemented (die centers unavailable client-side); the extractor's `subs` already hold per-die boxes if someone builds it.
