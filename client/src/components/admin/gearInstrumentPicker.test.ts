// Task #1954 — regression guard for the admin Person → Gear "Add gear"
// instrument picker.
//
// Bug: typing a partial instrument name, then CLICKING the match in the
// dropdown did nothing visible — the field reverted to an empty search box
// instead of locking in the chosen instrument as a selected pill, so the
// operator could never credit gear to the artist.
//
// Root cause: the InstrumentPicker (an interactive combobox whose dropdown is
// a stack of <button> options) was rendered INSIDE the <label> produced by the
// shared `Field` primitive. Clicking a labelable descendant of a <label> is
// invalid HTML and Safari forwards/duplicates the activation to the label's
// labeled control (the search <input>), which re-opened the typeahead and
// swallowed the selection. The fix gives `Field` a non-label `as="div"` mode
// and uses it for the Instrument field.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/gearInstrumentPicker.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the component imports under tsx
// without Vite. Must run before any import that pulls them in.
register("../../pages/assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` arms a module-level setInterval flush loop that is never
// cleared; capture + clear intervals so the buffered TAP output can flush and
// the shared process drains cleanly.
const realSetInterval = globalThis.setInterval;
const createdIntervals = new Set<ReturnType<typeof setInterval>>();
(globalThis as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  createdIntervals.add(id);
  return id;
};
// The toast reducer arms a 1,000,000ms setTimeout the harness doesn't capture;
// trap setTimeout the same way so the process doesn't hang ~1000s after pass.
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

(globalThis as any).__VITE_ENV__ = {
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
};

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/admin/people/p1",
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
  dispatchEvent() {
    return false;
  },
})) as any;
g.matchMedia = window.matchMedia;
(window as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollIntoView = () => {};
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
// fetch is hit by the (disabled) search query; stub so nothing throws.
g.fetch = async () => ({ ok: true, json: async () => [], text: async () => "" });

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { AddGearPanel } = await import("./PersonGearManager");
import type { AdminInstrument } from "./PersonGearManager";

const h = React.createElement;

function makeClient() {
  return new QueryClient({
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
}

const instruments: AdminInstrument[] = [
  {
    id: "inst_ibanez",
    name: "Ibanez Artist 2630 1978, Sunburst",
    category: "Hollow and Semi-Hollow Body",
    shortCategory: "Guitar",
    photoUrl: null,
    about: null,
    artistNote: null,
    vendors: [],
  },
  {
    id: "inst_fender",
    name: "Fender Precision Bass",
    category: "Solid Body",
    shortCategory: "Bass",
    photoUrl: null,
    about: null,
    artistNote: null,
    vendors: [],
  },
];

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
        h(AddGearPanel, {
          personId: "p1",
          personName: "Fernando Perdomo",
          instruments,
          context: [],
          onClose: () => {},
          onSaved: () => {},
        }),
      ),
    );
  });

  const qid = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async (frames = 4) => {
    for (let i = 0; i < frames; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };
  const type = async (el: HTMLInputElement, value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, value);
      el.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const fireMouseDown = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    });
  };
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  await settle();
  return { qid, settle, type, fireMouseDown, click, teardown };
}

test("typing a partial name then clicking the match selects the instrument as a pill", async () => {
  const { qid, settle, type, fireMouseDown, click, teardown } = await mount();
  try {
    const search = qid("input-instrument-search") as HTMLInputElement | null;
    assert.ok(search, "instrument search box renders");

    await type(search!, "iban");
    await settle();

    const option = qid("option-instrument-inst_ibanez");
    assert.ok(option, "the matching instrument shows in the dropdown");

    // Reproduce the real pointer sequence: the option's onMouseDown calls
    // preventDefault to keep input focus, then the click commits the choice.
    await fireMouseDown(option!);
    await click(option!);
    await settle();

    // The selected pill must now show and the search box must be gone.
    const pill = qid("display-selected-instrument");
    assert.ok(
      pill,
      "after clicking the match the chosen instrument shows as the selected pill",
    );
    assert.match(
      pill!.textContent ?? "",
      /Ibanez Artist 2630/,
      "the pill shows the chosen instrument name",
    );
    assert.equal(
      qid("input-instrument-search"),
      null,
      "the search box collapses once an instrument is selected",
    );
  } finally {
    await teardown();
  }
});

test("the instrument combobox is not nested inside a <label> (Safari click-forward guard)", async () => {
  // jsdom can't reproduce Safari forwarding a labelable-descendant click to the
  // label's labeled control, so guard the structural fix directly: the picker
  // must not live inside a <label>.
  const { qid, teardown } = await mount();
  try {
    const combobox = qid("combobox-instrument");
    assert.ok(combobox, "instrument combobox renders");
    assert.equal(
      combobox!.closest("label"),
      null,
      "the interactive instrument picker must not be wrapped in a <label>",
    );
  } finally {
    await teardown();
  }
});
