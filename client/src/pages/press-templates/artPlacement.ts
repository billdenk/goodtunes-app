// artPlacement — the PDF-art placement decision for the Template Test viewers
// (press live-test page + the artist art-test page via TemplateArtViewer).
//
// Task #3189: a full-artboard PDF export (art page size == template sheet
// size) must seat edge-to-edge over the template, not centered on the GT
// Bleed box — on jacket templates with fold-over flaps the bleed box is
// off-center in the sheet, so centering misregisters art authored in the
// exact same template. The raster (JPG/PNG) path already promotes
// full-artboard exports; this is the PDF-side mirror of that guard:
// promote ONLY when the sheet is both within tolerance AND a strictly
// better size match than the anchor box — a bleed-sized export (or a
// near-tie) stays centered on the anchor, the safer placement.
//
// Pure module (no jsdom) so the decision is testable under tsx --test.

export type BoxMm = { xMm: number; yMm: number; wMm: number; hMm: number };

/** Relative per-dimension size tolerance for "same physical size". */
const SIZE_TOL = 0.02;

/** Worst relative per-dimension mismatch between the art page and a box, in
 *  the RENDERED (direct) orientation only. The viewers draw the art raster
 *  unrotated, so a transposed page must never be promoted edge-to-edge — it
 *  would occupy a narrow over-tall region, worse than the centered fallback. */
function sizeErr(artW: number, artH: number, boxW: number, boxH: number): number {
  return Math.max(Math.abs(artW / boxW - 1), Math.abs(artH / boxH - 1));
}

/**
 * Placement rect (mm, template coordinates) for a PDF art page with real
 * physical dimensions.
 *
 * - Art whose page size matches the template's FULL sheet (within tolerance,
 *   in the rendered orientation) AND is a strictly better match for the sheet
 *   than for the anchor box → anchored at the sheet origin, edge-to-edge.
 * - Otherwise → centered on the anchor (GT Bleed, falling back to Cut, then
 *   the full page when the template has no GT boxes at all).
 */
export function computePdfArtRect(
  template: { wMm: number; hMm: number },
  anchor: BoxMm | null,
  art: { wMm: number; hMm: number },
): BoxMm {
  const anchor2 = anchor ?? { xMm: 0, yMm: 0, wMm: template.wMm, hMm: template.hMm };
  const pageErr = sizeErr(art.wMm, art.hMm, template.wMm, template.hMm);
  const anchorErr = sizeErr(art.wMm, art.hMm, anchor2.wMm, anchor2.hMm);
  if (pageErr <= SIZE_TOL && pageErr < anchorErr) {
    // Full-artboard export: seat it at the sheet origin, its own real size.
    return { xMm: 0, yMm: 0, wMm: art.wMm, hMm: art.hMm };
  }
  // Centered on the anchor (today's behavior for bleed/cut-sized exports).
  const cx = anchor2.xMm + anchor2.wMm / 2;
  const cy = anchor2.yMm + anchor2.hMm / 2;
  return { xMm: cx - art.wMm / 2, yMm: cy - art.hMm / 2, wMm: art.wMm, hMm: art.hMm };
}
