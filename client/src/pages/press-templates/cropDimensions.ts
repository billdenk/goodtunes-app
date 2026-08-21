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

// ── Crop transform + rendered-extent helpers (Task #3290) ───────────────────
// The crop tabs used to translate the canvas by (-focus.x·k, -focus.y·k) and
// let pdf.js apply the page viewport on top — which is only correct when the
// page is unrotated with a (0,0) MediaBox origin. On a rotated or offset-
// origin page the crop raster drifted under the (correctly placed) overlays.
// These helpers make the crop provably share the overlay's coordinate frame:
//
//   overlay mm frame (top-left origin, as measured by extractGtLayers):
//     xMm = X_userspace · PT_TO_MM
//     yMm = (vp1Height − Y_userspace) · PT_TO_MM        (vp1Height in pt)
//
// computeCropTransform returns the ctx.setTransform matrix P such that after
// pdf.js multiplies the page viewport transform T on top (effective = P·T),
// user-space content lands at canvas px = (mm − focus origin) · k — i.e. the
// EXACT same mm frame the overlays are drawn in, for ANY T (rotation, offset
// origin, skew).

/** Row-major 2D affine matrix [a, b, c, d, e, f] — canvas/pdf.js convention. */
export type Mat2D = [number, number, number, number, number, number];

/** Composite "apply b, then a" (a·b). */
export function mulMat(a: Mat2D, b: Mat2D): Mat2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function invMat(m: Mat2D): Mat2D {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || det === 0) throw new Error('non-invertible viewport transform');
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function applyMat(m: Mat2D, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * The matrix N mapping user-space pt → crop-canvas px through the overlay mm
 * frame: canvas = (overlayMm(user) − focus origin) · k, k = PT_PER_MM·scale.
 */
export function cropFrameMatrix(
  focus: { x: number; y: number },
  scale: number,
  vp1HeightPt: number,
): Mat2D {
  const k = PT_PER_MM * scale;
  // xC = X·scale − focus.x·k ;  yC = (vp1H − Y)·scale − focus.y·k
  return [scale, 0, 0, -scale, -focus.x * k, vp1HeightPt * scale - focus.y * k];
}

/**
 * The ctx.setTransform matrix to install BEFORE page.render, given the page
 * viewport transform T that pdf.js will multiply on top: P = N·T⁻¹, so the
 * effective mapping P·T equals the overlay-frame matrix N exactly.
 */
export function computeCropTransform(
  focus: { x: number; y: number },
  scale: number,
  vp1HeightPt: number,
  viewportTransform: Mat2D,
): Mat2D {
  return mulMat(cropFrameMatrix(focus, scale, vp1HeightPt), invMat(viewportTransform));
}

/**
 * The mm rectangle the rendered canvas ACTUALLY covers, post integer
 * rounding of the canvas size — the viewer must stretch the raster over this
 * rect (not the requested focus rect) so raster and overlay cannot diverge.
 * The origin is exact by construction (focus top-left maps to canvas (0,0));
 * only the extent reflects the rounded targetW/targetH.
 */
export function cropRenderedRectMm(
  focus: { x: number; y: number },
  targetW: number,
  targetH: number,
  scale: number,
): { x: number; y: number; w: number; h: number } {
  const k = PT_PER_MM * scale;
  return { x: focus.x, y: focus.y, w: targetW / k, h: targetH / k };
}
