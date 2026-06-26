// Coverage for the NewAlbumArtistDialog Name-box paste-a-link fallback.
//
// The Name input doubles as a paste-a-link field: when the operator drops
// a full http(s) URL into it, the dialog detects the URL (`isPastedUrl`)
// and swaps the search/manual row for a "Resolve this link" button
// (`button-resolve-pasted-link`) that routes through the scrape path —
// the guaranteed fallback when name search can't surface an obscure
// artist. A plain name instead shows the streaming-search row
// (`button-search-streaming`). Both were verified manually only; a
// regression (the paste branch stops rendering, or a name is mistaken for
// a link) would be silent.
//
// Runs under Node's built-in runner via tsx, same as the rest of the
// suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/newAlbumArtistDialogPaste.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the component graph imports
// under tsx without Vite. Must run before any import that pulls them in.
register("../../pages/assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` (transitively via the query client / hooks) can arm a
// module-level setInterval flush loop that's never cleared; capture and
// clear any interval so the buffered tsx --test run drains cleanly.
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
// The loader rewrites `import.meta.env` (Vite-only) to this global.
(globalThis as any).__VITE_ENV__ = {
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
};

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/admin/albums",
  pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
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
g.NodeFilter = window.NodeFilter; // Radix FocusScope walks the tree via createTreeWalker
g.DocumentFragment = window.DocumentFragment;
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.KeyboardEvent = window.KeyboardEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// framer-motion useReducedMotion → force reduced so the Dialog opens at 0ms.
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
(window as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollTo = () => {};
// No query should hit the network; the local typeahead query is seeded.
g.fetch = async () =>
  ({
    ok: false,
    status: 404,
    text: async () => "not found",
    json: async () => ({}),
  }) as any;
// Radix Dialog mounts a FocusScope + DismissableLayer on open, which reach
// for observers + the pointer-capture API none of which jsdom ships.
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
// Radix's FocusScope does `instanceof HTMLInputElement` / createTreeWalker
// checks against globals that live on `window` but not Node's globalThis.
// Copy every window-only global across so any DOM constructor resolves.
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in g)) {
    try {
      g[key] = (window as any)[key];
    } catch {
      // some window props are getter-only; skip those.
    }
  }
}
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { NewAlbumArtistDialog } = await import("./NewAlbumArtistDialog");

const h = React.createElement;

// Seed an empty People catalog so the local typeahead has no matches —
// that's the state where a plain name shows the streaming-search row.
function makeClient() {
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
  qc.setQueryData(["/api/people"], []);
  return qc;
}

// React tracks controlled-input values internally; set via the native
// value setter then fire an `input` event so onChange sees the new value.
function setInputValue(el: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc!.set!.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient() },
        h(NewAlbumArtistDialog, {
          open: true,
          onOpenChange: () => {},
          onSelect: () => {},
          onSkip: () => {},
        }),
      ),
    );
  });

  // Radix Dialog renders into a portal on document.body — query the whole
  // document, not the mount container.
  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async (frames = 4) => {
    for (let i = 0; i < frames; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };
  const type = async (value: string) => {
    const input = q("input-artist-name") as HTMLInputElement | null;
    assert.ok(input, "the Name input is rendered");
    await act(async () => {
      setInputValue(input!, value);
    });
    await settle();
  };
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };

  await settle();
  return { q, type, teardown };
}

test("pasting an http(s) URL swaps in the Resolve-this-link button", async () => {
  const { q, type, teardown } = await mount();
  try {
    await type("https://open.spotify.com/artist/3WrFJ7ztbogyGnTHbHJFl2");

    assert.ok(
      q("button-resolve-pasted-link"),
      "a pasted URL renders the Resolve-this-link button",
    );
    // The plain-name streaming-search row must NOT render for a URL.
    assert.equal(
      q("button-search-streaming"),
      null,
      "a pasted URL must NOT render the Spotify search row",
    );
  } finally {
    await teardown();
  }
});

test("a plain name renders the streaming-search row, not the paste button", async () => {
  const { q, type, teardown } = await mount();
  try {
    await type("Some Very Obscure Artist Name");

    assert.ok(
      q("button-search-streaming"),
      "a plain name renders the streaming-search row",
    );
    assert.equal(
      q("button-resolve-pasted-link"),
      null,
      "a plain name must NOT render the Resolve-this-link button",
    );
  } finally {
    await teardown();
  }
});
