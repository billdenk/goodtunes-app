// ── Reliable hi-DPI crop rendering (Task #3213) ─────────────────────────────
// Right after a fresh template upload, the Back/Front/Spine crop tabs used to
// fire ONE pdf.js sub-region render with a silent catch — if that single
// attempt failed (worker still warming, a transient render conflict on the
// page proxy, a canvas hiccup), the viewer was stranded on the CSS-magnified
// 1400px raster (a very blurry spine) with no retry and no indication.
//
// This module centralizes the crop render for BOTH viewers (the operator
// live-test page and the shared artist TemplateArtViewer):
//   • renderCropOnce — one attempt, THROWS on failure (no silent catch).
//   • runWithRetry   — bounded retries with backoff, superseded-aware so a
//     slow attempt can never land after a newer crop request.
// Callers surface exhaustion as a subtle "Sharp preview unavailable" pill
// while keeping the blurry fallback visible underneath.

import type * as pdfjs from 'pdfjs-dist';
import { computeCropCanvasSize, computeCropTransform, cropRenderedRectMm, type Mat2D } from './cropDimensions';

/** Backoff before retry #1 and retry #2 (3 attempts total). */
export const CROP_RETRY_DELAYS_MS = [300, 1000];

export type RetryResult<T> =
  | { ok: true; value: T }
  | { ok: false; superseded: boolean };

/**
 * Run `attempt` up to `delays.length + 1` times, sleeping between failures.
 * Bails out (superseded) the moment `isCurrent()` turns false — before an
 * attempt, and before committing a value that landed late.
 * Pure control flow — testable without jsdom via the injectable `sleep`.
 */
export async function runWithRetry<T>(
  attempt: () => Promise<T>,
  isCurrent: () => boolean,
  delays: number[] = CROP_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<RetryResult<T>> {
  for (let i = 0; i <= delays.length; i++) {
    if (!isCurrent()) return { ok: false, superseded: true };
    try {
      const value = await attempt();
      if (!isCurrent()) return { ok: false, superseded: true };
      return { ok: true, value };
    } catch {
      if (i === delays.length) return { ok: false, superseded: !isCurrent() };
      await sleep(delays[i]);
    }
  }
  return { ok: false, superseded: false };
}

export type CropFocus = { x: number; y: number; w: number; h: number };

export type CropRender = {
  img: string;
  /** The mm rect (top-left origin, overlay frame) the raster ACTUALLY covers
   *  post canvas-size rounding — stretch the <img> over THIS, not the focus. */
  rectMm: { x: number; y: number; w: number; h: number };
};

/**
 * One hi-DPI render of the focus sub-region (mm, top-left origin) of page 1.
 * Throws on any failure — retry/fallback policy belongs to the caller.
 *
 * Task #3290 — the render shares the overlay's coordinate frame provably:
 * the ctx transform is derived from the page's ACTUAL viewport transform
 * (rotation + MediaBox origin included) so that user-space content lands at
 * exactly (overlayMm − focus origin)·k, matching extractGtLayers' mm frame;
 * and the returned rectMm reflects the exact rendered canvas extent.
 */
export async function renderCropOnce(
  doc: pdfjs.PDFDocumentProxy,
  focus: CropFocus,
  desiredPx: number,
  pageNum = 1,
): Promise<CropRender> {
  const { targetW, targetH, scale } = computeCropCanvasSize(focus.w, focus.h, desiredPx);
  const page = await doc.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 }); // overlay mm frame flips Y with THIS height
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  // P = N·T⁻¹ — after pdf.js multiplies the viewport transform T on top, the
  // effective mapping equals the overlay-frame matrix N for ANY page geometry.
  const p = computeCropTransform(focus, scale, vp1.height, vp.transform as Mat2D);
  ctx.setTransform(p[0], p[1], p[2], p[3], p[4], p[5]);
  await (page.render({ canvas, canvasContext: ctx as CanvasRenderingContext2D, viewport: vp } as Parameters<typeof page.render>[0])).promise;
  return { img: canvas.toDataURL('image/png'), rectMm: cropRenderedRectMm(focus, targetW, targetH, scale) };
}
