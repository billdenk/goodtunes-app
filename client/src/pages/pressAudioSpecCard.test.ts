// Task #2339 — regression guard that the per-press AUDIO spec card (Task #2324)
// stays wired into the press portal catalog editor and stays gated on edit
// access. The card is rendered by ONE line deep in the shared CatalogEditor
// render chain — `{isVinyl && <PressAudioSpecCard pressId={pressId} />}` — and
// the whole PressCatalogPanel returns null when the caller can't edit this
// press. A refactor of that chain could silently drop the card from the portal,
// or a loosened role gate could show a press another plant's editor. We render
// the REAL PressCatalogPanel so either regression fails here, not in QA.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/pressAudioSpecCard.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so AdminManufacturer imports under
// tsx without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` lazily arms a module-level setInterval flush loop the first
// time track()/identify fires; never cleared, so it would keep this shared
// process alive forever and the buffered TAP output would never flush. Capture
// any interval created during the run and clear it in `after`.
const realSetInterval = globalThis.setInterval;
const createdIntervals = new Set<ReturnType<typeof setInterval>>();
(globalThis as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  createdIntervals.add(id);
  return id;
};
// The save/clear mutations toast on success, which arms shadcn's 1,000,000ms
// auto-dismiss setTimeout that jsdom never fires. Capture every timer so we can
// clear them on teardown and the tsx --test process exits instead of hanging
// ~1000s after the assertions already passed (cross-file isolation hygiene; the
// runner's --test-force-exit is the load-bearing guarantee).
const realSetTimeout = globalThis.setTimeout;
const createdTimeouts = new Set<ReturnType<typeof setTimeout>>();
(globalThis as any).setTimeout = (...args: any[]) => {
  const id = (realSetTimeout as any)(...args);
  createdTimeouts.add(id);
  return id;
};
after(() => {
  for (const id of createdIntervals) clearInterval(id);
  createdIntervals.clear();
  (globalThis as any).setInterval = realSetInterval;
  for (const id of createdTimeouts) clearTimeout(id);
  createdTimeouts.clear();
  (globalThis as any).setTimeout = realSetTimeout;
});
// The loader rewrites `import.meta.env` (Vite-only) to this global.
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

const PRESS_ID = "press-own";
const OTHER_PRESS_ID = "press-other";

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: `http://localhost/admin/manufacturers/${PRESS_ID}`,
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location; // wouter reads the GLOBAL location/history
g.history = window.history;
g.localStorage = window.localStorage;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
g.dispatchEvent = window.dispatchEvent.bind(window);
g.HTMLElement = window.HTMLElement;
g.SVGElement = window.SVGElement;
g.Element = window.Element;
g.Node = window.Node;
g.NodeFilter = window.NodeFilter;
g.DocumentFragment = window.DocumentFragment;
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.KeyboardEvent = window.KeyboardEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// framer-motion useReducedMotion → force reduced so any width/opacity
// animations resolve at 0ms (radix dropdown / dialog open instantly).
window.matchMedia = ((query: string) => ({
  matches: /reduce/.test(query),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
})) as any;
g.matchMedia = window.matchMedia;
(window as any).scrollBy = () => {};
(window as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollIntoView = () => {};
// Capture every fetch the component makes. Reads are seeded into the
// QueryClient so they never hit here; the only calls that reach this stub are
// the save (PUT) / clear (DELETE) mutations' `apiRequest`, which we record and
// answer OK so the mutation resolves into its onSuccess (invalidate + toast).
type FetchCall = { method: string; url: string; body: any };
const fetchCalls: FetchCall[] = [];
g.fetch = async (url: any, init?: any) => {
  fetchCalls.push({
    method: (init?.method ?? "GET").toUpperCase(),
    url: String(url),
    body: init?.body ? JSON.parse(init.body) : undefined,
  });
  return {
    ok: true,
    status: 200,
    text: async () => "{}",
    json: async () => ({ spec: null }),
  } as any;
};
// Radix DropdownMenu / AlertDialog (the catalog editor's format menu + delete
// confirm) mount a FocusScope + DismissableLayer that reach for
// MutationObserver / ResizeObserver and the pointer-capture API — none of which
// jsdom ships. Stub them so the editor renders instead of throwing.
g.MutationObserver =
  window.MutationObserver ??
  class {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
window.MutationObserver = g.MutationObserver;
g.ResizeObserver =
  window.ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
window.ResizeObserver = g.ResizeObserver;
if (!window.HTMLElement.prototype.hasPointerCapture) {
  (window.HTMLElement.prototype as any).hasPointerCapture = () => false;
  (window.HTMLElement.prototype as any).setPointerCapture = () => {};
  (window.HTMLElement.prototype as any).releasePointerCapture = () => {};
}
// Radix's FocusScope does a string of `instanceof HTMLInputElement` /
// createTreeWalker checks against globals that live on `window` but not Node's
// `globalThis`. Copy every window-only global across so any DOM constructor
// resolves. Done AFTER wrapping setInterval so the wrapper survives
// (`"setInterval" in g` is true natively).
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in g)) {
    try {
      g[key] = (window as any)[key];
    } catch {
      // getter-only window props — skip.
    }
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
const { PressCatalogPanel } = await import("./AdminManufacturer");

const h = React.createElement;

// A catalog that offers a vinyl format (12" LP) so the CatalogEditor's vinyl
// branch — the one that renders PressAudioSpecCard — is the active tab. One
// tier + one color keeps the VinylPreview / swatch UI happy.
function makeCatalog() {
  return {
    formats: [
      {
        format: "12_lp",
        position: 0,
        defaultJacketId: null,
        tiers: [
          {
            id: "tier-black",
            name: "Black",
            position: 0,
            priceLadder: [],
            laddersByJacket: {},
            colors: [
              {
                id: "color-black",
                name: "Black",
                swatchHex: "#000000",
                swatchImageUrl: null,
                position: 0,
                importSourceUrl: null,
              },
            ],
          },
        ],
      },
    ],
    jackets: [],
    defaultJacketId: null,
  };
}

// Seed a QueryClient so the panel renders without touching the network. The
// default queryFn returns [] so any unseeded array-shaped sidebar query
// resolves empty instead of null.
function makeClient(roleScopeId: string | null, audioSpec: any = null) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => [],
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
  // A manufacturer scoped to `roleScopeId`. canEdit is true only when that
  // scope equals the press being rendered.
  qc.setQueryData(["/api/me/role"], { role: "manufacturer", roleScopeId });
  qc.setQueryData(["/api/admin/manufacturers", PRESS_ID, "catalog"], makeCatalog());
  qc.setQueryData(["/api/admin/manufacturers", PRESS_ID, "audio-spec"], { spec: audioSpec });
  qc.setQueryData(["/api/admin/manufacturers", PRESS_ID, "template-specs"], { specs: [] });
  return qc;
}

async function mount(roleScopeId: string | null, audioSpec: any = null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  window.history.replaceState(null, "", `/admin/manufacturers/${PRESS_ID}`);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient(roleScopeId, audioSpec) },
        h(PressCatalogPanel, { pressId: PRESS_ID, pressDomain: null }),
      ),
    );
  });
  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async (frames = 6) => {
    for (let i = 0; i < frames; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  await settle();
  return { q, settle, teardown };
}

// ── Scoped manufacturer: the audio card renders and is editable ──────
test("a press scoped to THIS plant sees the editable audio spec card in the catalog editor", async () => {
  // roleScopeId === PRESS_ID → canEdit true.
  const { q, teardown } = await mount(PRESS_ID);
  try {
    assert.ok(q("panel-press-catalog"), "the catalog panel renders for the scoped press");
    const bitDepth = q("input-audio-bit-depth") as HTMLInputElement | null;
    assert.ok(
      bitDepth,
      "PressAudioSpecCard is wired into the vinyl catalog editor render chain",
    );
    assert.equal(
      bitDepth!.disabled,
      false,
      "the audio spec field is editable (not disabled) for a scoped press",
    );
  } finally {
    await teardown();
  }
});

// ── canEdit false: the whole panel (and the audio card) is hidden ────
test("a press scoped to a DIFFERENT plant gets no panel and no audio card", async () => {
  // roleScopeId !== PRESS_ID → canEdit false → PressCatalogPanel returns null,
  // mirroring the print-template card: both live behind the same gate.
  const { q, teardown } = await mount(OTHER_PRESS_ID);
  try {
    assert.equal(
      q("panel-press-catalog"),
      null,
      "the catalog panel is hidden when the caller can't edit this press",
    );
    assert.equal(
      q("input-audio-bit-depth"),
      null,
      "the audio spec card is hidden right alongside the rest of the editor",
    );
  } finally {
    await teardown();
  }
});

// Set a controlled input's value the way React expects: write through the
// native value setter (so React's value tracker sees the change) then dispatch
// a bubbling input event to fire onChange.
function type(el: HTMLElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new (window as any).Event("input", { bubbles: true }));
}

// ── Save fires the PUT with the typed values ─────────────────────────
test("typing a bit depth + a side length and clicking Save fires the PUT with those values", async () => {
  const { q, settle, teardown } = await mount(PRESS_ID);
  try {
    const bitDepth = q("input-audio-bit-depth") as HTMLInputElement | null;
    // 12" side at 33 RPM — testid drops the non-digits from the size label.
    const side = q("input-audio-side-12-33") as HTMLInputElement | null;
    assert.ok(bitDepth && side, "the editable bit-depth + side-length cells render");

    await act(async () => {
      type(bitDepth!, "24");
      type(side!, "20"); // minutes — the card converts to seconds on save
    });

    fetchCalls.length = 0;
    const saveBtn = q("button-save-audio-spec");
    assert.ok(saveBtn, "the Save action renders");
    await act(async () => {
      saveBtn!.click();
    });
    await settle();

    const put = fetchCalls.find((c) => c.method === "PUT");
    assert.ok(
      put,
      "clicking Save fires a PUT (the button is actually wired to the save mutation)",
    );
    assert.equal(
      put!.url,
      `/api/admin/manufacturers/${PRESS_ID}/audio-spec`,
      "the PUT targets this plant's audio-spec endpoint",
    );
    assert.equal(
      put!.body.requiredBitDepth,
      24,
      "the typed bit depth is sent in the PUT body",
    );
    // 20 minutes → 1200 seconds, keyed by size then RPM.
    assert.equal(
      put!.body.maxSideSeconds?.['12"']?.["33"],
      1200,
      "the typed side length is converted to seconds and sent in the PUT body",
    );
  } finally {
    await teardown();
  }
});

// ── Clear fires the DELETE ───────────────────────────────────────────
test("clicking Clear override fires the DELETE for this plant's audio spec", async () => {
  // The Clear control only renders when a saved spec exists, so seed one.
  const { q, settle, teardown } = await mount(PRESS_ID, {
    id: "audio-1",
    requiredBitDepth: 24,
    requiredSampleRateHz: 96000,
    maxSideSeconds: { '12"': { "33": 1200 } },
    notes: null,
  });
  try {
    fetchCalls.length = 0;
    const clearBtn = q("button-clear-audio-spec");
    assert.ok(clearBtn, "the Clear override action renders once a spec is saved");
    await act(async () => {
      clearBtn!.click();
    });
    await settle();

    const del = fetchCalls.find((c) => c.method === "DELETE");
    assert.ok(
      del,
      "clicking Clear fires a DELETE (the button is actually wired to the remove mutation)",
    );
    assert.equal(
      del!.url,
      `/api/admin/manufacturers/${PRESS_ID}/audio-spec`,
      "the DELETE targets this plant's audio-spec endpoint",
    );
  } finally {
    await teardown();
  }
});
