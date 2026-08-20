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
import { computeCropCanvasSize, PT_PER_MM } from './cropDimensions';

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

/**
 * One hi-DPI render of the focus sub-region (mm, top-left origin) of page 1.
 * Throws on any failure — retry/fallback policy belongs to the caller.
 */
export async function renderCropOnce(
  doc: pdfjs.PDFDocumentProxy,
  focus: CropFocus,
  desiredPx: number,
): Promise<string> {
  const { targetW, targetH, scale } = computeCropCanvasSize(focus.w, focus.h, desiredPx);
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  // Translate so that (focus.x, focus.y) in the full-page render maps to
  // canvas (0, 0). pdf.js renders with Y=0 at the PDF page top.
  ctx.translate(-(focus.x * PT_PER_MM * scale), -(focus.y * PT_PER_MM * scale));
  await (page.render({ canvas, canvasContext: ctx as CanvasRenderingContext2D, viewport: vp } as Parameters<typeof page.render>[0])).promise;
  return canvas.toDataURL('image/png');
}
