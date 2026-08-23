// Task #3030 — review-gate coverage for the completed-art check dialog:
//   Gate 1: every bleed result names its measurement source as VISIBLE
//           plain text on the row itself (never a tooltip).
//   Gate 2 (colorblind rule): every status — Unverified included — renders
//           as icon + WORD, never color alone.
// Also: the Unverified acknowledgment box shows who/when once present.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/components/ui/completedTemplateUnverified.test.ts

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
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
g.HTMLElement = window.HTMLElement;
g.SVGElement = window.SVGElement;
g.Element = window.Element;
g.Node = window.Node;
g.DocumentFragment = window.DocumentFragment;
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.KeyboardEvent = window.KeyboardEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.localStorage = window.localStorage;
g.matchMedia = (query: string) => ({
  matches: /reduce/.test(query),
  media: query,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
window.matchMedia = g.matchMedia;
// Radix Dialog focus management touches these.
if (!(window.HTMLElement.prototype as any).scrollTo) {
  (window.HTMLElement.prototype as any).scrollTo = () => {};
}
(window.HTMLElement.prototype as any).releasePointerCapture = () => {};
(window.HTMLElement.prototype as any).hasPointerCapture = () => false;
g.MutationObserver = window.MutationObserver;
g.NodeFilter = window.NodeFilter;
g.HTMLIFrameElement = window.HTMLIFrameElement;
g.HTMLInputElement = window.HTMLInputElement;
g.HTMLButtonElement = window.HTMLButtonElement;
g.HTMLAnchorElement = window.HTMLAnchorElement;
g.HTMLTextAreaElement = window.HTMLTextAreaElement;
g.HTMLSelectElement = window.HTMLSelectElement;
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.ResizeObserver = g.ResizeObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { PreviewArtDialog } = await import(
  "../admin/CompletedTemplatePanel"
);

const CONFIG = {
  size: '12"',
  discs: 1,
  jacket: "standard",
  innerSleeves: "plain",
  labelColor: "process-4c",
} as any;

function makeComponent(over: Record<string, any> = {}) {
  return {
    componentId: "jacket",
    label: "Jacket",
    presence: "present",
    assetUrl: "/objects/uploads/jacket",
    fileName: "jacket.pdf",
    previewUrl: null,
    previewUrl2: null,
    status: "unverified",
    override: null,
    unverifiedAck: null,
    checks: [
      {
        key: "tmpl.size",
        label: "Artboard size",
        status: "warn",
        message: "Review the artboard size.",
      },
      {
        key: "tmpl.bleed",
        label: "Bleed",
        status: "unverified",
        message:
          'Bleed measures 0.25". Measured against PDF bleed box; no certified template line.',
        source: "Measured against PDF bleed box; no certified template line.",
      },
      {
        key: "tmpl.pages",
        label: "Pages",
        status: "fail",
        message: "Wrong page count.",
      },
    ],
    ...over,
  } as any;
}

async function render(component: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root = createRoot(container);
  await (React as any).act(async () => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(PreviewArtDialog as any, {
          albumId: "a1",
          spec: null,
          component,
          config: CONFIG,
          canOperate: true,
          onClose: () => {},
        }),
      ),
    );
  });
  return {
    root,
    container,
    cleanup: async () => {
      await (React as any).act(async () => root.unmount());
      container.remove();
      qc.clear();
    },
  };
}

test("review gates: status WORD + visible source text on the bleed row", async () => {
  const h = await render(makeComponent());
  const body = window.document.body.textContent ?? "";
  // Gate 2 — icon + word for every status shown.
  assert.match(body, /Needs attention/);
  assert.match(body, /Unverified/);
  assert.match(body, /Failed check/);
  // Gate 1 — the measurement source is visible plain text (not a tooltip).
  const sourceEl = window.document.querySelector(
    '[data-testid="text-check-source-jacket-tmpl.bleed"]',
  );
  assert.ok(sourceEl, "source line element should render");
  assert.match(
    sourceEl!.textContent ?? "",
    /Measured against PDF bleed box; no certified template line\./,
  );
  // Unacknowledged → the operator acknowledge action is offered.
  assert.ok(
    window.document.querySelector('[data-testid="button-completed-ack-jacket"]'),
    "acknowledge button should render for operators",
  );
  await h.cleanup();
});

test("acknowledged unverified result shows who/when and hides the button", async () => {
  const h = await render(
    makeComponent({
      unverifiedAck: {
        byUserId: "u1",
        byDisplayName: "Ruby Operator",
        at: "2026-08-11T12:00:00Z",
      },
    }),
  );
  const ackEl = window.document.querySelector('[data-testid="text-completed-ack-jacket"]');
  assert.ok(ackEl, "acknowledgment box should render");
  assert.match(ackEl!.textContent ?? "", /acknowledged/i);
  assert.match(ackEl!.textContent ?? "", /Ruby Operator/);
  assert.equal(
    window.document.querySelector('[data-testid="button-completed-ack-jacket"]'),
    null,
  );
  await h.cleanup();
});
