// Task #3020 — pure geometry for cropping Completed Art previews to the
// finished/front-facing area. Kept free of sharp/pdftoppm/IO so the crop
// semantics are unit-testable.
//
// Crop semantics ("finished area" definition):
//   • A real TrimBox IS the finished area of the sheet — it excludes bleed
//     by definition, so it is used as-is (no bleed inset).
//   • Without a TrimBox, the finished area is approximated from either the
//     spec's finished square centered in the artboard (labels), or from a
//     detected content bounding box (jacket/sleeve), which spans art PLUS
//     bleed — so that path insets the bleed to land on the same finished
//     area a TrimBox would describe. The two paths intentionally converge
//     on the same rectangle; only their inputs differ.
//   • The finished area may still be a multi-panel sheet (jacket spread,
//     two-panel sleeve). Panel selection is shape-driven: a near-square
//     finished area (e.g. a TrimBox marking a single 12×12 jacket face) is
//     used whole; only clearly wide/tall sheets are reduced to the front
//     panel square.

/** A PDF box in points, origin bottom-left (PDF coordinate space). */
export type PdfBox = { x0: number; y0: number; x1: number; y1: number };
/** A crop rectangle in raster pixel space, origin top-left. */
export type PxRect = { left: number; top: number; width: number; height: number };

export const boxW = (b: PdfBox) => Math.abs(b.x1 - b.x0);
export const boxH = (b: PdfBox) => Math.abs(b.y1 - b.y0);

export type PageBoxes = { media: PdfBox | null; crop: PdfBox | null; trim: PdfBox | null };

/**
 * Parse MediaBox/CropBox/TrimBox for one page out of `pdfinfo -box` output.
 * Poppler always prints a TrimBox, defaulting it to the CropBox — a TrimBox
 * equal (within 1pt) to the MediaBox or CropBox is treated as absent.
 */
export function parsePdfBoxes(stdout: string, page: number): PageBoxes {
  const grab = (name: string): PdfBox | null => {
    const re = new RegExp(
      `Page\\s+${page}\\s+${name}:\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)`,
    );
    const m = re.exec(stdout);
    if (!m) return null;
    const [x0, y0, x1, y1] = [1, 2, 3, 4].map((i) => parseFloat(m[i]));
    if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
    return { x0, y0, x1, y1 };
  };
  const media = grab("MediaBox");
  const crop = grab("CropBox") ?? media;
  let trim = grab("TrimBox");
  const sameBox = (a: PdfBox | null, b: PdfBox | null) =>
    !!a && !!b &&
    Math.abs(a.x0 - b.x0) <= 1 && Math.abs(a.y0 - b.y0) <= 1 &&
    Math.abs(a.x1 - b.x1) <= 1 && Math.abs(a.y1 - b.y1) <= 1;
  if (sameBox(trim, media) || sameBox(trim, crop)) trim = null;
  return { media, crop, trim };
}

/**
 * Map a PDF-space rect into raster pixels. `renderBox` is the box pdftoppm
 * rendered (CropBox, falling back to MediaBox); raster y runs top-down
 * while PDF y runs bottom-up.
 */
export function pdfBoxToPx(rect: PdfBox, renderBox: PdfBox, pxW: number, pxH: number): PxRect {
  const scaleX = pxW / boxW(renderBox);
  const scaleY = pxH / boxH(renderBox);
  return {
    left: Math.round((Math.min(rect.x0, rect.x1) - Math.min(renderBox.x0, renderBox.x1)) * scaleX),
    top: Math.round((Math.max(renderBox.y0, renderBox.y1) - Math.max(rect.y0, rect.y1)) * scaleY),
    width: Math.round(boxW(rect) * scaleX),
    height: Math.round(boxH(rect) * scaleY),
  };
}

/**
 * Reduce a finished-area rect (pixels) to the front-facing panel and decide
 * orientation. Shape-driven, never vendor-hardwired:
 *   • jacket, panels side-by-side (w > 1.5h) → RIGHT square, upright
 *     (e.g. MRP single 3D jacket: back left, front right, right-side up)
 *   • jacket, panels stacked (h > 1.5w)      → TOP square, rotated 180°
 *     (e.g. MRP old-style tip-on gatefold prints the front upside-down)
 *   • inner sleeve, stacked (h > 1.3w)       → TOP square, upright
 *   • labels / near-square finished areas    → whole rect (this is how a
 *     TrimBox that already marks a single front face passes through intact)
 */
export function frontPanelRect(
  componentId: string,
  trim: PxRect,
): { rect: PxRect; rotate180: boolean } {
  const { left, top, width: w, height: h } = trim;
  const isJacket = componentId === "jacket";
  const isSleeve = componentId.startsWith("inner_sleeve");
  if (isJacket && w > h * 1.5) {
    return { rect: { left: left + w - h, top, width: h, height: h }, rotate180: false };
  }
  if (isJacket && h > w * 1.5) {
    return { rect: { left, top, width: w, height: w }, rotate180: true };
  }
  if (isSleeve && h > w * 1.3) {
    return { rect: { left, top, width: w, height: w }, rotate180: false };
  }
  return { rect: trim, rotate180: false };
}

export type ContentBBox = { left: number; top: number; width: number; height: number };

/**
 * Resolve the finished-area rect in raster pixels for one rendered page.
 * Order of preference:
 *   1. real TrimBox (authoritative finished area, no bleed inset needed);
 *   2. labels: the spec's finished square centered in the artboard
 *      (label sheets are often full-bleed edge to edge — nothing to detect);
 *   3. jacket/sleeve: the detected content bbox (art + bleed) inset by the
 *      bleed, when the detection found a meaningful block;
 *   4. null → caller keeps the full-page render.
 */
export function resolveFinishedRectPx(opts: {
  componentId: string;
  boxes: PageBoxes;
  pxW: number;
  pxH: number;
  finishedInches?: { w: number; h: number } | null;
  bleedInches?: number | null;
  contentBBox?: ContentBBox | null;
}): PxRect | null {
  const { componentId, boxes, pxW, pxH, finishedInches, bleedInches, contentBBox } = opts;
  const renderBox = boxes.crop ?? boxes.media;
  if (pxW <= 0 || pxH <= 0) return null;
  if (boxes.trim && renderBox) {
    return pdfBoxToPx(boxes.trim, renderBox, pxW, pxH);
  }
  const scaleX = renderBox ? pxW / boxW(renderBox) : 96 / 72;
  const scaleY = renderBox ? pxH / boxH(renderBox) : 96 / 72;
  if (componentId === "labels" && finishedInches) {
    const w = Math.round(finishedInches.w * 72 * scaleX);
    const h = Math.round(finishedInches.h * 72 * scaleY);
    if (w > 0 && h > 0 && w <= pxW && h <= pxH) {
      return {
        left: Math.round((pxW - w) / 2),
        top: Math.round((pxH - h) / 2),
        width: w,
        height: h,
      };
    }
    return null;
  }
  if (contentBBox && contentBBox.width > pxW * 0.25 && contentBBox.height > pxH * 0.25) {
    const bleedPx = Math.round((bleedInches ?? 0.125) * 72 * scaleX);
    return {
      left: contentBBox.left + bleedPx,
      top: contentBBox.top + bleedPx,
      width: contentBBox.width - bleedPx * 2,
      height: contentBBox.height - bleedPx * 2,
    };
  }
  return null;
}

/** Clamp a crop rect into the raster; null when degenerate (<8px a side). */
export function clampCrop(rect: PxRect, pxW: number, pxH: number): PxRect | null {
  const left = Math.max(0, Math.min(rect.left, pxW - 1));
  const top = Math.max(0, Math.min(rect.top, pxH - 1));
  const width = Math.max(1, Math.min(rect.width, pxW - left));
  const height = Math.max(1, Math.min(rect.height, pxH - top));
  if (width < 8 || height < 8) return null;
  return { left, top, width, height };
}
