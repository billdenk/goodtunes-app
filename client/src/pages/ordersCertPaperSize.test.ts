// Task #1650 — client coverage for the physical signed-cert paper-size
// toggle (US Letter / A4) in the Orders page CertConfirmationCard.
//
// The server endpoint (POST /api/orders/:id/cert/paper-size) and the
// auto-pick are covered in server/certificates.physicalPaperSize.db.test.ts,
// and the DIGITAL cert's name+paper control has its own component tests in
// certNameConfirmCard.test.ts. The PHYSICAL CertConfirmationCard toggle
// itself had no component test, so a regression that hid the toggle,
// mis-wired the segmented control, or left it editable while the cert is
// locked-for-print would slip through. This exercises the client contract:
//   - the segmented toggle renders in BOTH the confirmed and the
//     unconfirmed (awaiting) cert states,
//   - the active segment reflects cert.paperSize via aria-pressed,
//   - tapping the inactive segment POSTs the picked paperSize to the
//     paper-size endpoint (and tapping the already-active one is a no-op),
//   - once the cert is locked_for_print / printed the control is read-only
//     (no buttons, just the committed size).
//
// CertConfirmationCard lives inside Orders.tsx and reads useAuth()/useToast()
// + TanStack mutations, so we render it inside a QueryClientProvider and stub
// the global fetch (the only network seam) per test. Importing Orders.tsx
// pulls a heavy module graph (MiniPlayer, BottomNav, @assets imports, …) so
// we use the shared jsdom harness + the asset/import.meta.env ESM loader.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/ordersCertPaperSize.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports (.svg/.png/…) + rewrite import.meta.env so the
// real page module can be imported under tsx without Vite. Must run before
// any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

const { window } = installTestDom({ url: "http://localhost/orders" });

// The paper-size mutation toasts on success, and shadcn's use-toast arms a
// TOAST_REMOVE_DELAY (1,000,000ms) setTimeout to auto-dismiss the toast. The
// harness only captures setInterval (analytics' flush loop), so that stray
// setTimeout would keep this buffered tsx --test process alive for ~1000s —
// looking like an infinite hang even though every test passed. Capture every
// setTimeout we arm and clear them on teardown. (act()/settle's own
// setTimeout(0)s have already fired by then, so clearing them is a no-op.)
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

// ── per-test fetch stub ──────────────────────────────────────────────
// Each test installs a handler returning the mock payload for whatever
// endpoint is hit (GET /api/me for useAuth, POST …/cert/paper-size for
// the toggle). Calls are recorded so we can assert the POST body.
type FetchHandler = (url: string, init: any) => { status?: number; body: any };
let fetchHandler: FetchHandler = () => ({ body: {} });
const fetchCalls: { method: string; url: string; body: any }[] = [];

(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const method = init.method ?? "GET";
  const parsedBody = init.body ? JSON.parse(init.body) : undefined;
  fetchCalls.push({ method, url, body: parsedBody });
  const { status = 200, body } = fetchHandler(url, init);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
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
const { CertConfirmationCard } = await import("./Orders");

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
const ORDER_ID = "o-cert";

function makeOrder() {
  return {
    id: ORDER_ID,
    albumId: "a1",
    albumTitle: "Test Album",
    albumArtist: "Tester",
    albumArtwork: null,
    status: "paid",
    totalCents: 5000,
    goodDeedNumber: 12,
    shippedAt: null,
    refundedAt: null,
    createdAt: new Date().toISOString(),
    items: [],
    gift: null,
  } as any;
}

function makeCert(
  overrides: Partial<{
    nameStatus: "awaiting" | "confirmed" | "locked_for_print" | "printed";
    paperSize: "letter" | "a4";
  }> = {},
) {
  return {
    id: "cert-1",
    shortId: "abc123",
    nameStatus: "confirmed",
    confirmedIdentityKind: "display",
    confirmedName: "Jane Doe",
    paperSize: "letter",
    ...overrides,
  } as any;
}

// useAuth() fires GET /api/me on mount; give it a real fan so the picker
// (only relevant to the unconfirmed branch) has a user to read.
function meHandler(): FetchHandler {
  return (url, init) => {
    const method = init.method ?? "GET";
    if (url.includes("/api/me")) {
      return {
        body: {
          id: "u1",
          username: "fan",
          email: "fan@example.com",
          displayName: "Jane Doe",
          realName: "Jane Doe",
          kind: "customer",
        },
      };
    }
    if (method === "POST" && url.includes("/cert/paper-size")) {
      const picked = init.body ? JSON.parse(init.body).paperSize : "letter";
      return { body: { ok: true, paperSize: picked } };
    }
    return { body: {} };
  };
}

// ── render helpers ───────────────────────────────────────────────────
async function mount(props: any) {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Infinity ⇒ TanStack schedules no stale/gc timers that would keep
      // the shared tsx --test process alive (and hang the buffered output).
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(QueryClientProvider, { client: queryClient }, h(CertConfirmationCard, props)),
    );
  });
  // Let the mount-effect /api/me fetch resolve and re-render.
  await settle();
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await settle();
  };
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  };
  return { container, q, click, cleanup };
}

async function settle(frames = 4) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

// ── tests ────────────────────────────────────────────────────────────
test("renders the paper-size toggle in the confirmed state with the right active segment", async () => {
  fetchHandler = meHandler();
  const { q, cleanup } = await mount({
    order: makeOrder(),
    cert: makeCert({ nameStatus: "confirmed", paperSize: "a4" }),
  });

  assert.ok(q(`cert-paper-${ORDER_ID}`), "paper-size block renders");
  const letterBtn = q(`button-cert-paper-letter-${ORDER_ID}`);
  const a4Btn = q(`button-cert-paper-a4-${ORDER_ID}`);
  assert.ok(letterBtn, "US Letter segment renders");
  assert.ok(a4Btn, "A4 segment renders");
  assert.equal(letterBtn!.textContent, "US Letter");
  assert.equal(a4Btn!.textContent, "A4");
  // cert.paperSize === "a4" → A4 segment is the pressed one.
  assert.equal(a4Btn!.getAttribute("aria-pressed"), "true", "A4 is active");
  assert.equal(
    letterBtn!.getAttribute("aria-pressed"),
    "false",
    "US Letter is inactive",
  );
  assert.equal(
    q(`cert-paper-readonly-${ORDER_ID}`),
    null,
    "no read-only display while the cert is still editable",
  );
  await cleanup();
});

test("renders the paper-size toggle in the unconfirmed (awaiting) state too", async () => {
  fetchHandler = meHandler();
  const { q, cleanup } = await mount({
    order: makeOrder(),
    cert: makeCert({ nameStatus: "awaiting", paperSize: "letter" }),
  });

  // The name still needs confirming…
  assert.ok(
    q(`button-cert-confirm-${ORDER_ID}`),
    "the awaiting state still shows the Confirm name affordance",
  );
  // …but the paper size is independently editable from the start.
  assert.ok(
    q(`button-cert-paper-letter-${ORDER_ID}`),
    "US Letter segment renders before the name is confirmed",
  );
  const letterBtn = q(`button-cert-paper-letter-${ORDER_ID}`);
  assert.equal(
    letterBtn!.getAttribute("aria-pressed"),
    "true",
    "US Letter is the active default",
  );
  await cleanup();
});

test("tapping a segment POSTs the picked paper size to the cert paper-size endpoint", async () => {
  fetchHandler = meHandler();
  const { q, click, cleanup } = await mount({
    order: makeOrder(),
    cert: makeCert({ nameStatus: "confirmed", paperSize: "letter" }),
  });
  fetchCalls.length = 0;

  await click(q(`button-cert-paper-a4-${ORDER_ID}`)!);

  const post = fetchCalls.find((c) => c.method === "POST");
  assert.ok(post, "tapping the inactive segment issues a POST");
  assert.equal(
    post!.url,
    `/api/orders/${ORDER_ID}/cert/paper-size`,
    "POST hits the paper-size endpoint for the order",
  );
  assert.deepEqual(
    post!.body,
    { paperSize: "a4" },
    "POST sends the picked paper size",
  );
  await cleanup();
});

test("tapping the already-active segment is a no-op (no POST)", async () => {
  fetchHandler = meHandler();
  const { q, click, cleanup } = await mount({
    order: makeOrder(),
    cert: makeCert({ nameStatus: "confirmed", paperSize: "letter" }),
  });
  fetchCalls.length = 0;

  await click(q(`button-cert-paper-letter-${ORDER_ID}`)!);

  assert.equal(
    fetchCalls.find((c) => c.method === "POST"),
    undefined,
    "re-picking the current size never persists",
  );
  await cleanup();
});

test("the control is read-only once the cert is locked_for_print", async () => {
  fetchHandler = meHandler();
  const { q, cleanup } = await mount({
    order: makeOrder(),
    cert: makeCert({ nameStatus: "locked_for_print", paperSize: "a4" }),
  });

  assert.ok(
    q(`cert-paper-readonly-${ORDER_ID}`),
    "shows the committed size read-only",
  );
  assert.equal(
    q(`cert-paper-readonly-${ORDER_ID}`)?.textContent,
    "A4",
    "read-only display reflects the committed paper size",
  );
  assert.equal(
    q(`button-cert-paper-letter-${ORDER_ID}`),
    null,
    "no editable US Letter segment once locked",
  );
  assert.equal(
    q(`button-cert-paper-a4-${ORDER_ID}`),
    null,
    "no editable A4 segment once locked",
  );
  await cleanup();
});

test("the control is read-only once the cert is printed", async () => {
  fetchHandler = meHandler();
  const { q, cleanup } = await mount({
    order: makeOrder(),
    cert: makeCert({ nameStatus: "printed", paperSize: "letter" }),
  });

  assert.ok(
    q(`cert-paper-readonly-${ORDER_ID}`),
    "printed certs show the size read-only",
  );
  assert.equal(q(`cert-paper-readonly-${ORDER_ID}`)?.textContent, "US Letter");
  assert.equal(
    q(`button-cert-paper-a4-${ORDER_ID}`),
    null,
    "no editable segments once printed",
  );
  await cleanup();
});
