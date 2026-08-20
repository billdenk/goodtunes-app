// Task #3212 — component-level regression for the sharp Full-Template zoom in
// the shared TemplateArtViewer (the same effect structure the press live-test
// page mirrors):
//   1. Zooming to >1 produces the sharp full-page overlay once the (injected)
//      renderer resolves — including on a template that was JUST loaded (the
//      completion-review defect: an invalidation effect ordered after the
//      render effect staled the fresh template's own first render).
//   2. Replacing the template while a slow render for the OLD template is
//      still in flight must never overlay the old template's raster; the NEW
//      template's render lands instead.
//
// Runs under Node's built-in runner via tsx:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/press-templates/templateArtViewerFullSharp.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ── jsdom environment ────────────────────────────────────────────────
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
g.SVGElement = window.SVGElement;
g.Element = window.Element;
g.Node = window.Node;
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.matchMedia = (query: string) => ({
  matches: false, media: query,
  addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
  dispatchEvent: () => false,
});
window.matchMedia = g.matchMedia;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { TemplateArtViewer } = await import("./TemplateArtViewer");

const theme = {
  card: "#fff", soft: "#f0f0f2", hairline: "#e6e6ea",
  ink: "#1d1d1f", subink: "#6e6e73", faint: "#a1a1a6", blue: "var(--brand-blue, #2f9ed8)",
};

const makeTemplate = (img: string) => ({ img, wMm: 320, hMm: 320, layers: [] });

type Deferred = { resolve: (v: { img: string }) => void; promise: Promise<{ img: string }> };
const deferred = (): Deferred => {
  let resolve!: (v: { img: string }) => void;
  const promise = new Promise<{ img: string }>((r) => { resolve = r; });
  return { resolve, promise };
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const overlay = () => document.querySelector('[data-testid="img-full-sharp"]') as HTMLImageElement | null;
const clickZoomIn = () => act(async () => {
  (document.querySelector('[data-testid="button-zoom-in"]') as HTMLButtonElement).click();
});

test("freshly loaded template gets the sharp overlay at zoom > 1, and a template swap never lands the old render", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const docA = { tag: "A" } as any;
  const docB = { tag: "B" } as any;
  const pending: Array<{ doc: any; d: Deferred }> = [];
  const renderFullPage = (doc: any) => {
    const d = deferred();
    pending.push({ doc, d });
    return d.promise;
  };

  const props = (doc: any, img: string) => ({
    template: makeTemplate(img),
    pdfDoc: doc,
    art: null,
    dark: false,
    t: theme,
    renderFullPage,
    sharpDebounceMs: 0,
  });

  await act(async () => { root.render(React.createElement(TemplateArtViewer, props(docA, "data:img-A"))); });

  // Zoom to 150% then 200% — render attempts kick off (debounce 0).
  await clickZoomIn();
  await clickZoomIn();
  await flush();
  assert.equal(overlay(), null, "no overlay before a sharp render resolves");
  assert.ok(pending.length >= 1, "sharp render requested for template A");

  // The FRESH template's own first render must apply (ordering regression):
  const lastA = pending[pending.length - 1];
  assert.equal(lastA.doc.tag, "A");
  await act(async () => { lastA.d.resolve({ img: "sharp-A" }); await lastA.d.promise; });
  assert.ok(overlay(), "sharp overlay shown for the just-loaded template");
  assert.equal(overlay()!.getAttribute("src"), "sharp-A");

  // Now swap templates while a slow render for A is still in flight.
  const slowA = pending[0]; // an earlier (zoom 1.5) attempt, still unresolved
  await act(async () => { root.render(React.createElement(TemplateArtViewer, props(docB, "data:img-B"))); });
  assert.equal(overlay(), null, "swap clears the old sharp overlay immediately");
  await flush();
  // Old template's slow render finally completes — must NOT overlay.
  await act(async () => { slowA.d.resolve({ img: "sharp-A-stale" }); await slowA.d.promise; });
  const cur = overlay();
  assert.ok(!cur || cur.getAttribute("src") !== "sharp-A-stale", "stale template-A render must never show over template B");

  // Template B's own render lands normally.
  const lastB = pending[pending.length - 1];
  assert.equal(lastB.doc.tag, "B", "a fresh render was requested for template B");
  await act(async () => { lastB.d.resolve({ img: "sharp-B" }); await lastB.d.promise; });
  assert.equal(overlay()?.getAttribute("src"), "sharp-B");

  // Zoom-out below the threshold hides the overlay.
  await act(async () => {
    (document.querySelector('[data-testid="text-zoom-level"]') as HTMLButtonElement).click(); // reset to 100%
  });
  assert.equal(overlay(), null, "overlay gated off at 100%");

  await act(async () => { root.unmount(); });
  container.remove();
});
