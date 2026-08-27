// Task #3437 — Edit a saved package restores its saved state, always.
//
// PMP's "250 Special" (140g Clear Red) showed correctly on the Packages index
// card but opened in the builder with Classic Black selected: the hydrate
// effect flipped its ref synchronously, so the catalog "snap" effect ran in
// the SAME commit with the pre-hydration demo colorId in its closure and
// queued the first catalog color AFTER hydration's setState — last write
// wins. Two more silent-substitution paths (the size-filtered display
// fallback, the snap fallback) and a hydration latch bug (latching on a list
// that doesn't contain the target row) are covered here too.
//
// We render the REAL PressPackageBuilder with both react-query caches hot —
// exactly the state a press is in after visiting the Packages index and
// clicking Edit — so the original race is exercised, not simulated.
//
// Runs under Node's built-in runner via tsx:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test --test-force-exit client/src/pages/press-create/pressPackageBuilderColorRestore.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/.jpg) — the builder pulls in the MRP
// logo + cover art. Must run before any import that reaches them.
register("../assetStubLoader.mjs", import.meta.url);

// Capture any module-level intervals (analytics flush loop et al.) so the
// shared test process drains cleanly.
const realSetInterval = globalThis.setInterval;
const createdIntervals = new Set<ReturnType<typeof setInterval>>();
(globalThis as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  createdIntervals.add(id);
  return id;
};
after(() => {
  for (const id of createdIntervals) clearInterval(id);
  createdIntervals.clear();
  (globalThis as any).setInterval = realSetInterval;
});
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/admin",
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location;
g.history = window.history;
g.localStorage = window.localStorage;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
g.dispatchEvent = window.dispatchEvent.bind(window);
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
window.matchMedia = ((query: string) => ({
  matches: /reduce/.test(query),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
})) as any;
g.matchMedia = window.matchMedia;
(window as any).scrollBy = () => {};
(window as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollIntoView = () => {};
g.ResizeObserver =
  (window as any).ResizeObserver ??
  class { observe() {} unobserve() {} disconnect() {} };
(window as any).ResizeObserver = g.ResizeObserver;
g.MutationObserver =
  window.MutationObserver ??
  class { observe() {} disconnect() {} takeRecords() { return []; } };
// No query should hit the network — every read is seeded or answered by the
// per-test queryFn map. Fail loud-but-harmless if one slips through.
g.fetch = async () =>
  ({ ok: false, status: 404, text: async () => "not found", json: async () => ({}) }) as any;
// Copy remaining window-only globals (DOM constructors etc.) — AFTER the
// setInterval wrapper so it survives.
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in g)) {
    try { g[key] = (window as any)[key]; } catch { /* getter-only */ }
  }
}
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React = ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const mod: any = await import("./PressPackageBuilder");
const { PressPackageBuilder, PressBrandContext, resolveSavedSwatch, parseSummaryColorName } = mod;

const h = React.createElement;

// ── Fixtures (PMP-shaped) ────────────────────────────────────────────
const PRESS_ID = "press-pmp";
const PKG_ID = "pkg-250-special";
const listKey = `/api/press/${PRESS_ID}/estimates?kind=package`;
const catalogKey = `/api/admin/manufacturers/${PRESS_ID}/catalog`;
const componentsKey = `/api/press/${PRESS_ID}/components`;

// Black FIRST — the buggy fallbacks all landed on the first catalog color,
// so "shows Classic Black" is exactly the regression signature.
const FORMATS = [
  {
    format: "12_lp",
    tiers: [
      { id: "t-black", name: "Black", colors: [{ id: "c-black", name: "Classic Black", swatchHex: "#111114" }] },
      { id: "t-color", name: "Color", colors: [
        { id: "c-clear-red", name: "Clear Red", swatchHex: "#cc2233" },
        { id: "c-opaque-red", name: "Opaque Red", swatchHex: "#aa1122" },
      ] },
    ],
  },
];

const baseBuilderState = (over: Record<string, unknown> = {}) => ({
  sizeId: "12", discs: 2, qty: 250, weightId: "140",
  colorId: "c-clear-red", colorKind: "color",
  jacketId: "single", jacketVariantId: "standard",
  sleeveId: "printed", sleeveVariantId: "board",
  useArtistArt: false, labelId: "bw", holeId: "small",
  insertId: "none", insertVariantId: "",
  stickerShapeId: "none", stickerSizeId: "3x3",
  pkgName: "250 Special",
  done: ["size", "discs", "weight", "ctype", "color", "hole", "label", "jacket", "sleeve", "insert", "sticker", "qty"],
  ...over,
});

const makeRow = (bs: Record<string, unknown>, payloadExtra: Record<string, unknown> = {}) => ({
  id: PKG_ID,
  kind: "package",
  title: "250 Special",
  status: "live",
  updatedAt: "2026-08-01T00:00:00.000Z",
  payload: {
    builderState: bs,
    summary: "140g clear red vinyl · b&w label · single pocket jacket · printed inner sleeve · shrinkwrapped",
    perUnitCents: 700,
    ...payloadExtra,
  },
});

// ── Harness ──────────────────────────────────────────────────────────
const flush = async () => {
  // A few micro/macro-task rounds: react-query settle → hydrate effect →
  // re-render → snap effect → re-render.
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};

type MountOpts = {
  row: any;
  // When set, the seeded (stale) list omits the row and the refetch returns
  // it — exercises the hydration latch against a stale cached list.
  staleListWithoutRow?: boolean;
};

async function mount({ row, staleListWithoutRow }: MountOpts) {
  const responses: Record<string, any> = {
    [listKey]: { rows: [row] },
    [catalogKey]: { formats: FORMATS },
    [componentsKey]: {},
  };
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity, // no gc timers keeping the process alive
        staleTime: staleListWithoutRow ? 0 : Infinity,
        queryFn: async ({ queryKey }: { queryKey: unknown[] }) => {
          const key = String(queryKey[0]);
          if (!(key in responses)) throw new Error(`unseeded query: ${key}`);
          // Give the latch scenario a realistic in-flight window.
          await new Promise((r) => setTimeout(r, 10));
          return responses[key];
        },
      },
    },
  });
  qc.setQueryData([catalogKey], { formats: FORMATS });
  qc.setQueryData([componentsKey], {});
  qc.setQueryData([listKey], staleListWithoutRow ? { rows: [] } : { rows: [row] });

  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      h(QueryClientProvider, { client: qc },
        h(PressBrandContext.Provider, {
          value: { name: "Physical Music Products", shortName: "PMP", labelLogo: "", pressId: PRESS_ID },
        },
          h(PressPackageBuilder, {
            pressId: PRESS_ID,
            packageId: PKG_ID,
            canEdit: true,
            onExit: () => {},
            onSaved: () => {},
          }),
        ),
      ),
    );
  });
  await flush();
  const cleanup = async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    qc.clear();
  };
  return { container, cleanup };
}

const pressedColor = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-testid="quote-color-${id}"]`)?.getAttribute("aria-pressed");

// ── Tests ────────────────────────────────────────────────────────────

test("saved color restores when the catalog id matches (hot caches — the Edit race)", async () => {
  const { container, cleanup } = await mount({ row: makeRow(baseBuilderState()) });
  try {
    // The saved Clear Red is selected — NOT the first catalog color.
    assert.equal(pressedColor(container, "c-clear-red"), "true", "Clear Red must be the active swatch");
    assert.notEqual(pressedColor(container, "c-black"), "true", "Classic Black must NOT be selected");
    // Header strip reads the saved color, and no "no longer offered" note shows.
    assert.match(container.textContent ?? "", /Clear Red/);
    assert.ok(!container.querySelector('[data-testid="color-unavailable-note"]'), "no unavailable note for a live color");
    // The rest of the saved state came back too (weight shown in the strip).
    assert.match(container.textContent ?? "", /140g/);
  } finally {
    await cleanup();
  }
});

test("saved color restores by NAME when the catalog id drifted (legacy row, summary-derived name)", async () => {
  // Re-imports mint fresh ids for the same color names; legacy rows have no
  // colorSnapshot, so the name comes from the summary line.
  const row = makeRow(baseBuilderState({ colorId: "old-uuid-from-before-reimport" }));
  const { container, cleanup } = await mount({ row });
  try {
    // The snap effect adopts the live catalog id for the same name.
    assert.equal(pressedColor(container, "c-clear-red"), "true", "name-matched Clear Red must be selected");
    assert.notEqual(pressedColor(container, "c-black"), "true");
    assert.ok(!container.querySelector('[data-testid="color-unavailable-note"]'));
  } finally {
    await cleanup();
  }
});

test("saved colorSnapshot name wins for id drift on new-style rows", async () => {
  const row = makeRow(
    baseBuilderState({ colorId: "another-dead-uuid" }),
    { colorSnapshot: { name: "Opaque Red", base: "#aa1122" }, summary: "no parseable color here" },
  );
  const { container, cleanup } = await mount({ row });
  try {
    assert.equal(pressedColor(container, "c-opaque-red"), "true", "snapshot-named Opaque Red must be selected");
    assert.notEqual(pressedColor(container, "c-black"), "true");
  } finally {
    await cleanup();
  }
});

test("a color the catalog no longer offers is preserved with a note — never snapped to black", async () => {
  const row = makeRow(
    baseBuilderState({ colorId: "gone-uuid" }),
    { colorSnapshot: { name: "Galaxy Swirl", base: "#123456" }, summary: "140g galaxy swirl vinyl · shrinkwrapped" },
  );
  const { container, cleanup } = await mount({ row });
  try {
    // No silent substitution: nothing in the catalog grid is selected…
    assert.notEqual(pressedColor(container, "c-black"), "true", "must not silently select Classic Black");
    assert.notEqual(pressedColor(container, "c-clear-red"), "true");
    assert.notEqual(pressedColor(container, "c-opaque-red"), "true");
    // …the saved color stays visible by its snapshot, with the note.
    assert.match(container.textContent ?? "", /Galaxy Swirl/);
    assert.ok(container.querySelector('[data-testid="color-unavailable-note"]'), "unavailable note must render");
    assert.match(container.textContent ?? "", /no longer offered/i);
  } finally {
    await cleanup();
  }
});

test("hydration waits for the target row — a stale cached list without it can't latch", async () => {
  // Seeded cache: an empty (stale) package list. The background refetch
  // returns the real row; the old latch marked hydration complete on the
  // stale list and the builder opened on fresh defaults forever.
  const { container, cleanup } = await mount({ row: makeRow(baseBuilderState()), staleListWithoutRow: true });
  try {
    assert.equal(pressedColor(container, "c-clear-red"), "true", "hydration must run once the refetch lands the row");
    assert.match(container.textContent ?? "", /250 Special/);
  } finally {
    await cleanup();
  }
});

test("pure helpers: resolveSavedSwatch id→name precedence, parseSummaryColorName shape", () => {
  const cat = [
    { id: "a", name: "Classic Black", kind: "black", kindNote: "Black", base: "#111", sizes: ["12"], price: 1.8 },
    { id: "b", name: "Clear Red", kind: "color", kindNote: "Color", base: "#c23", sizes: ["12"], price: 2.6 },
  ];
  assert.equal(resolveSavedSwatch(cat, "b", "Classic Black")?.id, "b", "exact id beats name");
  assert.equal(resolveSavedSwatch(cat, "dead", "clear red")?.id, "b", "case-insensitive name fallback");
  assert.equal(resolveSavedSwatch(cat, "dead", "Galaxy Swirl"), null, "no match = null, never a substitute");
  assert.equal(parseSummaryColorName("140g clear red vinyl · full color label · shrinkwrapped"), "clear red");
  assert.equal(parseSummaryColorName("180g classic black vinyl"), "classic black");
  assert.equal(parseSummaryColorName("digital only"), undefined);
  assert.equal(parseSummaryColorName(undefined), undefined);
});
