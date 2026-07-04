// Task #2477 — a released record must never be *silently* edited.
//
// When an artist owner edits their OWN already-released / post-sale release,
// the PUT is DIVERTED to the GoodTunes review queue instead of applied and the
// server answers HTTP 202 (nothing was written). The shared EditablePanel is
// the single admin edit surface for those fields, and its client contract is:
//   - 202  → show a "Sent for review" toast, DON'T call onSaved (which assumes
//            a real write), and DON'T present the attempted value as saved.
//   - 200  → normal save proceeds and onSaved fires.
// The server side is regression-pinned (server/artistOwnerSelfServe.db.test.ts),
// but this client branch (EditablePanel onSuccess, status === 202) had no direct
// test — the existing "202 divert isn't shown as saved" test covers the
// RolesChipEditor in adminPersonRolesPanel.test.ts, a different component.
//
// This mounts the REAL EditablePanel, edits a field, and drives the mutation
// against a stubbed 202 / 200 response, locking in both halves of the contract.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/editablePanelReviewDivert.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the component imports under tsx
// without Vite. Must run before any import that pulls them in.
register("../../pages/assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` arms a module-level setInterval flush loop that is never
// cleared; useToast() arms shadcn's 1,000,000ms TOAST_REMOVE_DELAY setTimeout
// on dismiss. jsdom captures neither, so a live handle would keep this shared,
// buffered tsx --test process alive ~1000s and look like an infinite hang even
// though every test passed. Capture both and clear them on teardown.
const realSetInterval = globalThis.setInterval;
const realSetTimeout = globalThis.setTimeout;
const createdIntervals = new Set<ReturnType<typeof setInterval>>();
const createdTimeouts = new Set<ReturnType<typeof setTimeout>>();
(globalThis as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  createdIntervals.add(id);
  return id;
};
(globalThis as any).setTimeout = (...args: any[]) => {
  const id = (realSetTimeout as any)(...args);
  createdTimeouts.add(id);
  return id;
};
after(() => {
  for (const id of createdIntervals) clearInterval(id);
  for (const id of createdTimeouts) clearTimeout(id);
  createdIntervals.clear();
  createdTimeouts.clear();
  (globalThis as any).setInterval = realSetInterval;
  (globalThis as any).setTimeout = realSetTimeout;
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
  url: "http://localhost/admin/albums/a1",
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

// ── per-test fetch stub ──────────────────────────────────────────────
let putStatus = 200;
const putBodies: any[] = [];
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const method = init.method ?? "GET";
  let status = 200;
  let body: any = {};
  if (method === "PUT" && url.includes("/api/admin/albums/")) {
    putBodies.push(init.body ? JSON.parse(init.body) : {});
    status = putStatus;
    body =
      status === 202
        ? { message: "Your change was sent to GoodTunes for review." }
        : { id: "a1" };
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: () => null },
  } as any;
};

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
const { useToast } = await import("@/hooks/use-toast");

const h = React.createElement;

// A minimal live probe over the shared toast store — renders the newest
// toast's title text so we can assert on it without pulling in Radix's
// portal-based <Toaster/>.
function ToastProbe() {
  const { toasts } = useToast();
  return h(
    "div",
    { "data-testid": "toast-probe" },
    toasts.map((t: any) => (typeof t.title === "string" ? t.title : "")).join("|"),
  );
}

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
      mutations: { retry: false },
    },
  });
}

const TITLE_FIELD: FieldConfig = { key: "title", label: "Title", type: "text" };

async function mount() {
  const savedCalls: any[] = [];
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
          title: "Release",
          endpoint: "/api/admin/albums/a1",
          values: { title: "Original" },
          fields: [TITLE_FIELD],
          invalidate: [],
          onSaved: (r: any) => savedCalls.push(r),
        }),
        h(ToastProbe),
      ),
    );
  });

  const qid = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const type = async (el: HTMLInputElement, next: string) => {
    // React tracks the input value internally; set it through the native
    // prototype setter then fire an `input` event so onChange sees the change.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(el, next);
      el.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const submit = async () => {
    const form = qid("panel-release") as HTMLFormElement | null;
    assert.ok(form, "panel is in edit mode (a form)");
    await act(async () => {
      form!.dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
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
  return { qid, click, type, submit, settle, teardown, savedCalls };
}

// Drive the panel from read mode through an edit + save, returning the harness
// so each test can assert against the outcome.
async function editAndSave(status: number) {
  putStatus = status;
  putBodies.length = 0;
  const h = await mount();
  await h.click(h.qid("button-edit-release")!);
  await h.settle();
  const input = h.qid("input-title") as HTMLInputElement | null;
  assert.ok(input, "Title input renders in edit mode");
  await h.type(input!, "Edited");
  await h.submit();
  await h.settle();
  return h;
}

// ── tests ────────────────────────────────────────────────────────────
test("a 202 divert shows 'Sent for review', skips onSaved, and never presents the attempted value as saved", async () => {
  const { qid, savedCalls, teardown } = await editAndSave(202);
  try {
    assert.equal(putBodies.length, 1, "the PUT still fired");
    assert.equal(putBodies[0].title, "Edited", "the edit was sent to the server");

    assert.match(
      qid("toast-probe")!.textContent ?? "",
      /Sent for review/,
      "a diverted save is announced as sent for review, not saved",
    );
    assert.equal(
      savedCalls.length,
      0,
      "onSaved must NOT fire on a 202 — nothing was written",
    );

    // Back in read mode the panel shows the unchanged source value, never the
    // attempted edit — the queued change must not read as applied.
    const cell = qid("field-title");
    assert.ok(cell, "panel returned to read mode");
    assert.match(cell!.textContent ?? "", /Original/, "read mode keeps the real value");
    assert.doesNotMatch(
      cell!.textContent ?? "",
      /Edited/,
      "the attempted (queued) value is NOT shown as saved",
    );
  } finally {
    await teardown();
  }
});

test("a 200 save proceeds normally and fires onSaved", async () => {
  const { qid, savedCalls, teardown } = await editAndSave(200);
  try {
    assert.equal(putBodies.length, 1, "the PUT fired");
    assert.equal(putBodies[0].title, "Edited", "the edit was sent to the server");

    assert.match(
      qid("toast-probe")!.textContent ?? "",
      /Release updated/,
      "a real save shows the 'updated' toast",
    );
    assert.equal(savedCalls.length, 1, "onSaved fires once on a real 200 save");
  } finally {
    await teardown();
  }
});
