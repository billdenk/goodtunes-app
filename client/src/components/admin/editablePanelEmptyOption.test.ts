// Task #1849 — regression guard for the admin dropdown "empty-option
// collision".
//
// The shared EditablePanel renderer used to ALWAYS inject a "—" placeholder
// (`<option value="">`) at the top of every non-required select. When a
// field's own `options` already contained a `value: ""` entry (e.g. the
// Identity "Type" field's "Solo artist", or Label's "Independent"), that
// produced TWO empty rows in the dropdown — and read-mode showed the generic
// "—" instead of the meaningful label, which read as a silent save-diff no-op.
//
// The fix lives in EditablePanel's select EditInput (suppress the injected "—"
// when the options already carry an empty value) and ReadField (resolve the
// empty-value option's label in read mode). EVERY admin `type: "select"` /
// `type: "entity-combobox"` field flows through this one component, so this
// test renders it directly and locks in both halves of the fix.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/editablePanelEmptyOption.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the component imports under tsx
// without Vite. Must run before any import that pulls them in.
register("../../pages/assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` arms a module-level setInterval flush loop that is never
// cleared, which would keep this shared process alive and stop the buffered
// TAP output from flushing. Capture intervals created during the run and clear
// them in an `after` hook so the process drains cleanly.
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
const { EditablePanel } = await import("./EditablePanel");
import type { FieldConfig } from "./EditablePanel";

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

async function mount(
  fields: FieldConfig[],
  values: Record<string, string | null>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient() },
        h(EditablePanel, {
          title: "Identity",
          endpoint: "/api/admin/people/p1",
          values,
          fields,
          invalidate: [],
        }),
      ),
    );
  });

  const q = (sel: string) =>
    container.querySelector(sel) as HTMLElement | null;
  const qid = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const settle = async (frames = 4) => {
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
  return { q, qid, click, settle, teardown };
}

// Identity "Type" field — empty value means "Solo artist".
const groupKindField: FieldConfig = {
  key: "groupKind",
  label: "Type",
  type: "select",
  options: [
    { value: "", label: "Solo artist" },
    { value: "Band", label: "Band" },
    { value: "Duo", label: "Duo" },
  ],
};

test("read mode shows the empty-value option's label, not the generic placeholder", async () => {
  const { qid, teardown } = await mount([groupKindField], { groupKind: "" });
  try {
    const cell = qid("field-group-kind");
    assert.ok(cell, "Type field renders in read mode");
    const text = cell!.textContent ?? "";
    assert.match(
      text,
      /Solo artist/,
      "read mode resolves value='' to its option label",
    );
    assert.doesNotMatch(
      text,
      /Not set/,
      "an empty-value option must not read as 'Not set'",
    );
  } finally {
    await teardown();
  }
});

test("edit mode renders exactly one empty <option> (no duplicate placeholder collision)", async () => {
  const { qid, click, settle, teardown } = await mount([groupKindField], {
    groupKind: "",
  });
  try {
    await click(qid("button-edit-identity")!);
    await settle();
    const select = qid("input-group-kind") as HTMLSelectElement | null;
    assert.ok(select, "Type select renders in edit mode");
    const emptyOptions = Array.from(select!.querySelectorAll("option")).filter(
      (o) => (o as HTMLOptionElement).value === "",
    );
    assert.equal(
      emptyOptions.length,
      1,
      "exactly one empty-value option — the injected '—' must be suppressed",
    );
    assert.match(
      emptyOptions[0].textContent ?? "",
      /Solo artist/,
      "the single empty option keeps the field's own label, not '—'",
    );
  } finally {
    await teardown();
  }
});

test("a non-required select WITHOUT an empty option still gets the injected '—' placeholder", async () => {
  const noEmptyField: FieldConfig = {
    key: "copyrightSymbol",
    label: "Symbol",
    type: "select",
    options: [
      { value: "℗", label: "℗ (sound recording)" },
      { value: "©", label: "© (copyright)" },
    ],
  };
  const { qid, click, settle, teardown } = await mount([noEmptyField], {
    copyrightSymbol: "℗",
  });
  try {
    await click(qid("button-edit-identity")!);
    await settle();
    const select = qid("input-copyright-symbol") as HTMLSelectElement | null;
    assert.ok(select, "Symbol select renders in edit mode");
    const emptyOptions = Array.from(select!.querySelectorAll("option")).filter(
      (o) => (o as HTMLOptionElement).value === "",
    );
    assert.equal(
      emptyOptions.length,
      1,
      "the injected '—' clear option is present when options carry no empty value",
    );
    assert.equal(
      emptyOptions[0].textContent,
      "—",
      "injected clear option reads as '—'",
    );
  } finally {
    await teardown();
  }
});

test("a required select gets NO injected empty placeholder", async () => {
  const requiredField: FieldConfig = {
    key: "albumType",
    label: "Type",
    type: "select",
    required: true,
    options: [
      { value: "LP", label: "LP" },
      { value: "EP", label: "EP" },
    ],
  };
  const { qid, click, settle, teardown } = await mount([requiredField], {
    albumType: "LP",
  });
  try {
    await click(qid("button-edit-identity")!);
    await settle();
    const select = qid("input-album-type") as HTMLSelectElement | null;
    assert.ok(select, "required select renders in edit mode");
    const emptyOptions = Array.from(select!.querySelectorAll("option")).filter(
      (o) => (o as HTMLOptionElement).value === "",
    );
    assert.equal(
      emptyOptions.length,
      0,
      "a required select must not offer an empty/clear option",
    );
  } finally {
    await teardown();
  }
});

// entity-combobox read path (album Label → "Independent" for the empty FK).
test("entity-combobox read mode resolves the empty-id option to its label", async () => {
  const labelField: FieldConfig = {
    key: "labelId",
    label: "Label",
    type: "entity-combobox",
    options: [
      { value: "", label: "Independent" },
      { value: "lbl_1", label: "Compass Records" },
    ],
    entityListEndpoint: "/api/labels",
    entityCreateEndpoint: "/api/admin/labels",
    emptyOptionLabel: "Independent",
  };
  const { qid, teardown } = await mount([labelField], { labelId: "" });
  try {
    const cell = qid("field-label-id");
    assert.ok(cell, "Label field renders in read mode");
    const text = cell!.textContent ?? "";
    assert.match(
      text,
      /Independent/,
      "an album with no label reads as 'Independent', not 'Not set'",
    );
    assert.doesNotMatch(text, /Not set/, "empty FK must not read as 'Not set'");
  } finally {
    await teardown();
  }
});
