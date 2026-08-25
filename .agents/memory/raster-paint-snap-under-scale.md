---
name: Raster paint snapping under extreme CSS scale
description: Why a bitmap <img> inside a heavily CSS-scaled frame drifts off vector overlays, and the rasterCssLayout fix.
---

The rule: never lay out a raster `<img>` with a tiny pre-transform box inside a frame that CSS-scales by a large factor. Chromium snaps the image's PAINT rect to whole layout pixels before the ancestor transform multiplies the error — a 3.5 mm spine crop got a ~3.8 CSS px box under a 27× frame scale, so a ±0.5 px snap became a ~0.8× squeeze + mm-scale shift on screen. Vector SVG overlays in the same frame are immune, so raster and overlay visibly diverge.

**Why:** the template art viewer's Spine crop tab showed the purple Spine overlay misregistered against the template's own printed dielines while Full Template (scale 1) aligned perfectly. Invisible to every analytic check: DOM getBoundingClientRect was correct, the rendered PNG's pixels were correct (verified by in-page histogram), node-canvas repros were correct — only the actual screen paint was wrong. Diagnose this class of bug by histogramming a real screenshot against predicted px positions, not by DOM inspection.

**How to apply:** all rasters in the template-viewer frame (base, full-sharp, crop, art) go through `rasterCssLayout()` in client/src/pages/press-templates/cropDimensions.ts — full-size layout box (frame % × viewScale) placed entirely by `translate(%) scale(1/viewScale)`; transforms go through the compositor unsnapped. Regression-pinned with the real MRP 12-JKTSG3D-100 numbers in cropTransform.test.ts. Any new raster added to either viewer stage (TemplateArtViewer.tsx or PressTemplateLiveTest.tsx) must use the same helper.
