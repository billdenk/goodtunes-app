// ── Crop-canvas dimension helper (Task #3162) ────────────────────────────────
// Computes the canvas size for a high-DPI crop render of a PDF focus region.
// Both dimensions are guaranteed to be ≤ MAX_CROP_PX — essential for tall
// narrow crops (e.g. a 3.5 mm × 120 mm spine) where naively scaling to the
// desired width would produce a canvas tens of thousands of pixels tall.
//
// Exported as a pure function so it can be tested without jsdom.

export const PT_PER_MM = 72 / 25.4;

/** Maximum pixel count for either canvas dimension (GPU / browser cap). */
export const MAX_CROP_PX = 4096;

/**
 * Given a focus rectangle and render targets, return the canvas dimensions
 * and pdf.js scale factor that keep both sides ≤ MAX_CROP_PX.
 *
 * @param focusWMm   Focus region width in mm
 * @param focusHMm   Focus region height in mm
 * @param desiredPx  Desired canvas width in pixels (before the cap applies).
 *                   Typically: viewportWidth * maxZoom * devicePixelRatio.
 * @param maxPx      Per-dimension cap (defaults to MAX_CROP_PX).
 * @returns          { targetW, targetH, scale } — all integers ≥ 1.
 */
export function computeCropCanvasSize(
  focusWMm: number,
  focusHMm: number,
  desiredPx: number,
  maxPx = MAX_CROP_PX,
): { targetW: number; targetH: number; scale: number } {
  // Scale that renders focus.w at desiredPx pixels.
  const sDesired = desiredPx / (focusWMm * PT_PER_MM);
  // Scale capped so that the LARGER dimension (w or h) stays ≤ maxPx.
  const sMax = maxPx / (Math.max(focusWMm, focusHMm) * PT_PER_MM);
  const scale = Math.min(sDesired, sMax);
  const targetW = Math.max(1, Math.round(focusWMm * PT_PER_MM * scale));
  const targetH = Math.max(1, Math.round(focusHMm * PT_PER_MM * scale));
  return { targetW, targetH, scale };
}
