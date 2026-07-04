// Task #2483 — client guard for the self-serve "Withdraw" affordance in the
// artist's "Your change requests" panel (Task #2482). Two behaviours must hold
// so a regression can't corrupt the review queue or the audit trail:
//   1. The Withdraw control is rendered ONLY on a still-pending row — never on
//      an already-reviewed (approved / rejected) request. The server rejects a
//      withdraw of a reviewed request too (see pendingChangeWithdraw.db.test),
//      but the UI must not even offer it.
//   2. Withdrawing an own pending request drops it out of the artist's list on
//      the follow-up refetch (the row is soft-marked "withdrawn" server-side
//      and filtered out of the list read).
//
// Renders the REAL MyChangeRequestsPanel (exported from AdminAlbum) inside a
// QueryClientProvider — no AdminFrame — so the assertions target just this
// panel's contract.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/myChangeRequestsWithdraw.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports (.svg/.png/…) + rewrite import.meta.env so the
// real page module imports under tsx without Vite. Must run before any import
// that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

const ALBUM_ID = "album-1";
const { window } = installTestDom({ url: `http://localhost/admin/albums/${ALBUM_ID}` });
const g = globalThis as any;

// useToast() (fired by the withdraw mutation) arms shadcn's 1,000,000ms
// TOAST_REMOVE_DELAY setTimeout that the harness doesn't capture. Record and
// clear every setTimeout so the buffered tsx --test process drains instead of
// hanging ~1000s after the assertions pass.
const realSetTimeout = globalThis.setTimeout;
const createdTimeouts = new Set<any>();
(globalThis as any).setTimeout = (...args: any[]) => {
  const id = (realSetTimeout as any)(...args);
  createdTimeouts.add(id);
  return id;
};
after(() => {
  for (const id of createdTimeouts) clearTimeout(id);
  createdTimeouts.clear();
});

// The AlertDialog confirm popup mounts a Radix FocusScope + DismissableLayer on
// open, which reach for MutationObserver / ResizeObserver / pointer-capture and
// a string of `instanceof HTML*Element` / createTreeWalker checks against
// window-only globals. Stub the observers + pointer-capture, then copy every
// window global across so any DOM constructor resolves (mirrors the delete-
// gating test). Copy AFTER installTestDom wrapped setInterval so the wrapper
// survives.
g.MutationObserver =
  window.MutationObserver ??
  class {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
(window as any).MutationObserver = g.MutationObserver;
g.ResizeObserver =
  window.ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
(window as any).ResizeObserver = g.ResizeObserver;
if (!window.HTMLElement.prototype.hasPointerCapture) {
  (window.HTMLElement.prototype as any).hasPointerCapture = () => false;
  (window.HTMLElement.prototype as any).setPointerCapture = () => {};
  (window.HTMLElement.prototype as any).releasePointerCapture = () => {};
}
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in g)) {
    try {
      g[key] = (window as any)[key];
    } catch {
      // getter-only props — skip.
    }
  }
}

// ── stateful fetch stub ──────────────────────────────────────────────
// GET  /my-change-requests           → the current (non-withdrawn) rows.
// POST /my-change-requests/:id/withdraw → soft-marks the row withdrawn, so it
//        drops out of the next GET (mirrors listMyChangeRequestsForAlbum).
type Row = {
  id: string;
  targetTable: string;
  targetId: string;
  albumId: string;
  patch: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  submittedNote: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
  createdAt: string;
};

function seedRows(): Row[] {
  const base = {
    targetTable: "albums",
    targetId: ALBUM_ID,
    albumId: ALBUM_ID,
    submittedNote: null,
    reviewedAt: null,
    reviewerNote: null,
    createdAt: new Date("2026-01-01").toISOString(),
  };
  return [
    { ...base, id: "req-pending", patch: { title: "New title" }, status: "pending" },
    {
      ...base,
      id: "req-approved",
      patch: { title: "Applied title" },
      status: "approved",
      reviewedAt: new Date("2026-01-02").toISOString(),
    },
    {
      ...base,
      id: "req-rejected",
      patch: { title: "Nope title" },
      status: "rejected",
      reviewedAt: new Date("2026-01-02").toISOString(),
    },
  ];
}

let serverRows: Row[] = seedRows();
const withdrawCalls: string[] = [];

g.fetch = async (url: string, init: any = {}) => {
  const method = (init.method ?? "GET").toUpperCase();
  const withdrawMatch = url.match(/my-change-requests\/([^/]+)\/withdraw$/);
  if (method === "POST" && withdrawMatch) {
    const reqId = withdrawMatch[1];
    withdrawCalls.push(reqId);
    const row = serverRows.find((r) => r.id === reqId);
    // Server scoping: only a still-pending row is retractable.
    if (!row || row.status !== "pending") {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ message: "not found" }),
        text: async () => "not found",
        headers: { get: () => null },
      } as any;
    }
    serverRows = serverRows.filter((r) => r.id !== reqId);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ ...row, status: "withdrawn" }),
      text: async () => JSON.stringify({ ...row, status: "withdrawn" }),
      headers: { get: () => null },
    } as any;
  }
  // GET list
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => serverRows,
    text: async () => JSON.stringify(serverRows),
    headers: { get: () => null },
  } as any;
};

// ── React + real component (imported AFTER the DOM globals exist) ─────
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { MyChangeRequestsPanel } = await import("./AdminAlbum");

const h = React.createElement;

async function settle(frames = 5) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(MyChangeRequestsPanel, { albumId: ALBUM_ID }),
      ),
    );
  });
  await settle();
  const q = (id: string) =>
    (container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null) ??
    (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null);
  const click = async (el: HTMLElement | null) => {
    assert.ok(el, "element to click exists");
    await act(async () => {
      el!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await settle();
  };
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  };
  return { q, click, cleanup };
}

// ── tests ────────────────────────────────────────────────────────────
test("the Withdraw control shows only on a pending row, never on a reviewed one", async () => {
  serverRows = seedRows();
  const { q, click, cleanup } = await mount();

  // The disclosure is exclusive (one row expanded at a time), so probe each
  // row on its own. An expanded reviewed row must render its detail but NO
  // Withdraw affordance; an expanded pending row must offer it.
  await click(q("button-toggle-my-change-request-req-approved"));
  assert.equal(
    q("button-withdraw-my-change-request-req-approved"),
    null,
    "approved (reviewed) row must NOT offer Withdraw",
  );

  await click(q("button-toggle-my-change-request-req-rejected"));
  assert.equal(
    q("button-withdraw-my-change-request-req-rejected"),
    null,
    "rejected (reviewed) row must NOT offer Withdraw",
  );

  await click(q("button-toggle-my-change-request-req-pending"));
  assert.ok(
    q("button-withdraw-my-change-request-req-pending"),
    "pending row offers Withdraw",
  );

  await cleanup();
});

test("withdrawing an own pending request removes it from the list on refetch", async () => {
  serverRows = seedRows();
  withdrawCalls.length = 0;
  const { q, click, cleanup } = await mount();

  assert.ok(q("row-my-change-request-req-pending"), "pending row is present up front");

  await click(q("button-toggle-my-change-request-req-pending"));
  // Open the confirm dialog, then confirm.
  await click(q("button-withdraw-my-change-request-req-pending"));
  await click(q("button-confirm-withdraw-req-pending"));

  assert.deepEqual(
    withdrawCalls,
    ["req-pending"],
    "exactly the pending request was withdrawn server-side",
  );
  assert.equal(
    q("row-my-change-request-req-pending"),
    null,
    "the withdrawn request drops out of the artist's list after refetch",
  );
  // The reviewed rows stay — withdraw only removes the retracted pending one.
  assert.ok(
    q("row-my-change-request-req-approved"),
    "reviewed rows remain in the list",
  );

  await cleanup();
});
