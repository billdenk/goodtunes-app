// Task #2071 — coverage for the admin Person → affiliation "Business title"
// picker, the curated job-title selector that is deliberately separate from
// the music "Creative credits" picker (RolePicker).
//
// Two layers:
//   1. Pure-helper tests for `filterBusinessTitles` — single-select dedup,
//      selected-floats-first, substring search — no DOM needed.
//   2. DOM tests for `BusinessTitlePicker` — picking a chip selects it,
//      clicking the active chip clears it, and a free-typed title can be
//      added (the curated vocab is just a head start, not a hard list).
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/businessTitlePicker.test.ts

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

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const {
  BusinessTitlePicker,
  filterBusinessTitles,
  BUSINESS_TITLE_VOCAB,
} = await import("./BusinessTitlePicker");

const h = React.createElement;

// ── Pure-helper tests (no DOM) ───────────────────────────────────────

test("filterBusinessTitles: empty query returns the full curated vocab", () => {
  const out = filterBusinessTitles("", null);
  // Same membership as the curated list (order is alpha-sorted).
  assert.deepEqual(
    [...out].sort(),
    [...BUSINESS_TITLE_VOCAB].sort(),
  );
});

test("filterBusinessTitles: substring search is case-insensitive", () => {
  const out = filterBusinessTitles("man", null);
  // "Manager", "Label Manager" match "man"; "Marketing" does not.
  assert.ok(out.includes("Manager"));
  assert.ok(out.includes("Label Manager"));
  assert.ok(!out.includes("Marketing"));
});

test("filterBusinessTitles: the selected title floats to the front", () => {
  const out = filterBusinessTitles("", "Fulfillment");
  assert.equal(out[0], "Fulfillment", "selected title leads the list");
});

test("filterBusinessTitles: a free-typed selection not in the vocab still shows", () => {
  const out = filterBusinessTitles("", "Plant Manager");
  assert.ok(
    out.includes("Plant Manager"),
    "a previously free-typed title remains a selectable chip",
  );
  // And it isn't duplicated if it happened to match a vocab entry by case.
  const ceo = filterBusinessTitles("", "ceo");
  assert.equal(
    ceo.filter((t) => t.toLowerCase() === "ceo").length,
    1,
    "case-variant selected value dedupes against the vocab entry",
  );
});

// ── DOM tests ────────────────────────────────────────────────────────

async function mount(initial: string | null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  let current: string | null = initial;
  const changes: (string | null)[] = [];

  function Harness() {
    const [val, setVal] = React.useState<string | null>(initial);
    current = val;
    return h(BusinessTitlePicker, {
      value: val,
      onChange: (v: string | null) => {
        changes.push(v);
        setVal(v);
      },
      testIdPrefix: "t",
    });
  }

  await act(async () => {
    root = createRoot(container);
    root.render(h(Harness));
  });

  const qid = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async (frames = 3) => {
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
  return {
    qid,
    settle,
    type,
    click,
    teardown,
    get value() {
      return current;
    },
    changes,
  };
}

test("clicking a curated chip selects that title", async () => {
  const ui = await mount(null);
  try {
    const chip = ui.qid("chip-t-CEO");
    assert.ok(chip, "the CEO chip renders");
    await ui.click(chip!);
    await ui.settle();
    assert.equal(ui.value, "CEO", "onChange selects CEO");
    assert.equal(
      ui.qid("chip-t-CEO")!.getAttribute("aria-pressed"),
      "true",
      "the selected chip is pressed",
    );
  } finally {
    await ui.teardown();
  }
});

test("clicking the active chip clears the title (single-select toggle)", async () => {
  const ui = await mount("CEO");
  try {
    const chip = ui.qid("chip-t-CEO");
    assert.ok(chip, "the active CEO chip renders");
    await ui.click(chip!);
    await ui.settle();
    assert.equal(ui.value, null, "clicking the active chip clears it to null");
  } finally {
    await ui.teardown();
  }
});

test("a free-typed title can be added beyond the curated vocab", async () => {
  const ui = await mount(null);
  try {
    const search = ui.qid("input-t-search") as HTMLInputElement | null;
    assert.ok(search, "the search box renders");
    await ui.type(search!, "Plant Manager");
    await ui.settle();
    const add = ui.qid("button-t-add");
    assert.ok(add, "the add-custom button shows for a non-vocab term");
    await ui.click(add!);
    await ui.settle();
    assert.equal(
      ui.value,
      "Plant Manager",
      "the free-typed title becomes the selected value",
    );
  } finally {
    await ui.teardown();
  }
});

test("the 'No title' chip clears a selected title to null", async () => {
  const ui = await mount("A&R");
  try {
    const clear = ui.qid("button-t-clear");
    assert.ok(clear, "the No-title clear chip renders when a title is set");
    await ui.click(clear!);
    await ui.settle();
    assert.equal(ui.value, null, "clearing sends null");
  } finally {
    await ui.teardown();
  }
});
