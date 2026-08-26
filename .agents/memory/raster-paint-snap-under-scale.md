---
name: Raster paint snapping under extreme CSS scale
description: Why a bitmap <img> inside a heavily CSS-scaled frame drifts off vector overlays, and how to lay rasters out to avoid it.
---

The rule: never lay out a raster `<img>` with a tiny pre-transform box inside a frame that CSS-scales by a large factor. Chromium snaps the image's PAINT rect to whole layout pixels before the ancestor transform multiplies the error, so a sub-pixel snap becomes a millimeter-scale squeeze/shift on screen. Vector SVG overlays in the same frame are immune, so raster and overlay visibly diverge.

**Why:** the misregistration is invisible to DOM inspection — layout rects and decoded pixels all read correct; only the actual screen paint is wrong. Trust a real screenshot over DOM measurements when a raster looks shifted at high zoom.

**How to apply:** give the raster a full-size layout box and do ALL scaling/positioning in one transform so it rides the compositor unsnapped.
