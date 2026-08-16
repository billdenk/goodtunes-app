---
name: Rendered-content bleed vs template geometry
description: When/how the completed-template Bleed check trusts rendered content over PDF boxes, and why sheet-with-margins templates need a client-supplied cut rect.
---

**Rules**
- Full-artboard exports routinely stamp TrimBox==BleedBox (declaring 0" bleed) while the art physically covers the sheet — "trustworthy" PDF boxes can still lie. Rendered-content measurement (`contentBleedMeasurement`) overrides boxes when they're untrusted OR when they fail the certified line.
- The content override is only safe with the per-side **bleed-band coverage gate** (≥50% ink in the band just outside trim, `bleedBandInches` on `contentBleedFromRaster`) — otherwise one crop-mark tick touching each page edge makes the global bounding box fake a pass.
- Sheet-with-margins vendor templates (MRP jackets: 30.7×21.2" sheet, cut line inches inside) make "page inset by bleed-width" nonsense geometry. `templateTrimRectInches` returns null there (honest unmeasured); the press live-test client sends the REAL cut rect + bleed line read from the template's GT Bleed/Cut layer boxes, and the server persists the line as `measured_bleed_line_inches` when none is stored.
- Templates drawing guides in GT Illustrator layers (not a "does not print" separation) never get a server-measured bleed line — the client-derived line is the only source.

**Why:** shelf tile showed "Failed" after a clean live pass (gogoods, Aug 16 2026) because the certification run fell back to the art's meaningless BleedBox with no stored line; the naive fixes (centered-rect assumption, bbox-only content) were review-rejected as false-pass risks.

**How to apply:** any new route calling `validateCompletedComponent` on print art should spool the file and pass `{ contentBleed }` when a line exists and boxes are untrusted/below-line; never infer cut geometry — require it measured (template layers or dieline separation) or stay unmeasured.
