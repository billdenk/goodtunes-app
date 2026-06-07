// Task #1615 — client coverage for the live paper-size preview geometry in
// CertPdfViewerSheet, the in-page GoodDeed PDF viewer.
//
// Task #1612 proved that CertNameConfirmCard *fires* onPaperPreview(paper)
// on each paper-segment tap and onPaperPreview(null) on save/cancel. This
// covers the CONSUMER side: CertPdfViewerSheet receives that callback into
// `previewPaper` state and overlays a dashed page-frame whose proportions
// must track PAPER_ASPECT — taller for A4, shorter for US Letter — and
// must clear when the preview ends. That frame's box is produced by the
// pure `computePaperPreviewGeometry` helper, so a refactor of the overlay
// geometry that broke the visible preview (while the callback kept firing)
// would surface here.
//
// The full sheet can't be mounted under the node/tsx runner: it rasterizes
// the PDF with pdf.js (a Vite-only `?url` worker import the runner can't
// resolve) onto a <canvas> (unavailable in jsdom), so `pageCss` — which
// gates the overlay — is never set. We therefore drive the geometry helper
// directly with the same `previewPaper` values onPaperPreview produces.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   npx tsx --test client/src/components/ui/certPdfViewerSheet.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ── jsdom environment ────────────────────────────────────────────────
// The helper itself is pure, but importing the module pulls in react-dom
// and the CertNameConfirmCard chain, which expect the DOM globals to exist
// at module-eval time. Mirror the harness the rest of the suite uses.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location;
g.history = window.history;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.localStorage = window.localStorage;

const { computePaperPreviewGeometry, PAPER_ASPECT } = await import(
  "./CertPdfViewerSheet"
);

// A representative fit-to-width page box. The rendered page keeps the
// SAVED paper's aspect (that's the PDF on screen); the dashed overlay is
// drawn at the PREVIEWED paper's aspect on top of it.
const PAGE_W = 360;
const letterPage = { width: PAGE_W, height: PAGE_W * PAPER_ASPECT.letter };
const a4Page = { width: PAGE_W, height: PAGE_W * PAPER_ASPECT.a4 };

const frameAspect = (g: { width: number; height: number }) => g.height / g.width;

// ── tests ────────────────────────────────────────────────────────────
test("PAPER_ASPECT: A4 is proportionally taller than US Letter", () => {
  assert.ok(
    PAPER_ASPECT.a4 > PAPER_ASPECT.letter,
    "A4 (≈1.414) must be taller per width than US Letter (≈1.294)",
  );
});

test("onPaperPreview('a4') over a Letter page draws a TALLER frame at A4's aspect", () => {
  const geom = computePaperPreviewGeometry({
    previewPaper: "a4",
    pageCss: letterPage,
    loading: false,
    error: null,
  });
  assert.equal(geom.show, true, "the dashed frame is drawn");
  assert.equal(geom.width, PAGE_W, "frame keeps the rendered page width");
  assert.ok(
    Math.abs(frameAspect(geom) - PAPER_ASPECT.a4) < 0.001,
    `frame aspect ${frameAspect(geom)} matches A4 ${PAPER_ASPECT.a4}`,
  );
  assert.ok(
    geom.height > letterPage.height,
    "frame is taller than the Letter page on screen",
  );
  assert.equal(geom.taller, true, "preview reports the page got taller");
});

test("onPaperPreview('letter') over an A4 page draws a SHORTER frame at Letter's aspect", () => {
  const geom = computePaperPreviewGeometry({
    previewPaper: "letter",
    pageCss: a4Page,
    loading: false,
    error: null,
  });
  assert.equal(geom.show, true, "the dashed frame is drawn");
  assert.equal(geom.width, PAGE_W, "frame keeps the rendered page width");
  assert.ok(
    Math.abs(frameAspect(geom) - PAPER_ASPECT.letter) < 0.001,
    `frame aspect ${frameAspect(geom)} matches US Letter ${PAPER_ASPECT.letter}`,
  );
  assert.ok(
    geom.height < a4Page.height,
    "frame is shorter than the A4 page on screen",
  );
  assert.equal(geom.taller, false, "preview reports the page got shorter");
});

test("switching A4 → Letter flips the frame's proportions", () => {
  const a4 = computePaperPreviewGeometry({
    previewPaper: "a4",
    pageCss: letterPage,
    loading: false,
    error: null,
  });
  const letter = computePaperPreviewGeometry({
    previewPaper: "letter",
    pageCss: a4Page,
    loading: false,
    error: null,
  });
  assert.ok(
    frameAspect(a4) > frameAspect(letter),
    "the A4 preview frame is proportionally taller than the Letter preview frame",
  );
});

test("onPaperPreview(null) clears the frame", () => {
  const geom = computePaperPreviewGeometry({
    previewPaper: null,
    pageCss: letterPage,
    loading: false,
    error: null,
  });
  assert.equal(geom.show, false, "no frame when there's no active preview");
  assert.equal(geom.width, 0, "cleared frame has no width");
  assert.equal(geom.height, 0, "cleared frame has no height");
  assert.equal(geom.taller, false);
});

test("previewing the SAME paper the page already uses clears the frame", () => {
  // Toggling back to the saved size: target aspect ≈ rendered aspect, so
  // the redundant overlay is suppressed (within the 0.01 tolerance).
  const geom = computePaperPreviewGeometry({
    previewPaper: "letter",
    pageCss: letterPage,
    loading: false,
    error: null,
  });
  assert.equal(
    geom.show,
    false,
    "no frame when the previewed paper matches what's on screen",
  );
  assert.equal(geom.height, 0, "no redundant frame is drawn");
});

test("the frame is suppressed before a page renders (pageCss null) or while loading/errored", () => {
  const base = { previewPaper: "a4" as const };
  assert.equal(
    computePaperPreviewGeometry({ ...base, pageCss: null, loading: false, error: null }).show,
    false,
    "no frame until a page has rendered (pageCss null)",
  );
  assert.equal(
    computePaperPreviewGeometry({ ...base, pageCss: letterPage, loading: true, error: null }).show,
    false,
    "no frame while the PDF is still loading",
  );
  assert.equal(
    computePaperPreviewGeometry({ ...base, pageCss: letterPage, loading: false, error: "boom" }).show,
    false,
    "no frame when the viewer is showing an error",
  );
});
