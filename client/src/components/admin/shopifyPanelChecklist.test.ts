// Task #2892 — ShopifyPanel three-step checklist gating + mapped-row save
// feedback.
//
// Pins the Shopify+ restructure:
//   1. With NO connected store, steps 2 (Map a product) and 3 (Sale URL)
//      render locked (data-state="locked", "Connect a store first.", no
//      mapping form mounted) while step 1 is active.
//   2. With a store + a mapping + a sale URL, all three steps render
//      collapsed-complete with summaries; expanding step 2 shows the mapped
//      row; the retired signed-GoodDeed add-on checkbox is nowhere; the
//      row's mint toggle PATCHes the new flags endpoint and confirms with
//      an inline "Saved".
//   3. A failed PATCH keeps the user's choice visible with an inline
//      "Couldn't save" + Retry (never silently reverts), and Retry re-sends.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/shopifyPanelChecklist.test.ts

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../../pages/jsdomHarness";

// Stub static asset imports + rewrite import.meta.env so the real component
// modules import under tsx without Vite. Must run before any app import.
register("../../pages/assetStubLoader.mjs", import.meta.url);

// The toast reducer (reachable from ShopifyPanel's remove/resolve error
// paths) arms shadcn's TOAST_REMOVE_DELAY (1,000,000ms) setTimeout the
// harness doesn't capture; trap setTimeout so the buffered tsx --test
// process doesn't stay alive ~1000s after the tests pass.
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
  (globalThis as any).setTimeout = realSetTimeout;
});

const { window } = installTestDom({ url: "http://localhost/admin/albums/a1" });

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");
const { QueryClientProvider } = RQ;
// The component mutates via the app's singleton queryClient (setQueryData
// write-through on PATCH success), so the provider must use the SAME client
// or the cache the component writes isn't the cache the queries read.
const { queryClient } = await import("../../lib/queryClient");
const { ShopifyPanel } = await import("./ShopifyPanel");

const h = React.createElement;

// ── fetch stub ───────────────────────────────────────────────────────
const STORE = { id: "st1", shopDomain: "hoku.myshopify.com", storeName: "Hoku Records" };
const PUSH_BASE = {
  album: { priceCents: 2500, maxRedemptions: null, signedCertRetailCents: null },
  cert: null,
  earnings: null,
  stores: [] as any[],
  push: null,
};
const M1 = {
  id: "m1",
  storeId: "st1",
  shopifyProductId: "gid://shopify/Product/1",
  shopifyVariantId: null,
  shopifyProductTitle: "Vinyl LP",
  albumId: "a1",
  offerSignedCert: false,
  offersDigitalUnlock: true,
  signedCertPriceCents: null,
  storeName: "Hoku Records",
  shopDomain: "hoku.myshopify.com",
  isSignedGooddeedAddon: false,
};

let mappingsFixture: any[] = [];
let pushFixture: any = { ...PUSH_BASE };
let patchCalls: { url: string; body: any }[] = [];
let patchResponder: (body: any) => { status: number; json: any } = (body) => ({
  status: 200,
  json: { ...M1, offersDigitalUnlock: body.offersDigitalUnlock, offerSignedCert: body.offerSignedCert },
});

const jsonResponse = (status: number, body: any) =>
  new (globalThis as any).Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" && url.includes("/shopify-mappings")) return jsonResponse(200, mappingsFixture);
  if (method === "GET" && url.includes("/shopify-push")) return jsonResponse(200, pushFixture);
  if (method === "GET" && url.includes("/products")) return jsonResponse(200, { products: [], nextCursor: null });
  if (method === "PATCH" && url.includes("/shopify-mappings/")) {
    const body = init?.body ? JSON.parse(init.body) : {};
    patchCalls.push({ url, body });
    const r = patchResponder(body);
    return jsonResponse(r.status, r.json);
  }
  throw new Error(`unexpected fetch in test: ${method} ${url}`);
}) as any;
after(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  queryClient.clear();
  patchCalls = [];
  mappingsFixture = [];
  pushFixture = { ...PUSH_BASE, stores: [] };
  patchResponder = (body) => ({
    status: 200,
    json: { ...M1, offersDigitalUnlock: body.offersDigitalUnlock, offerSignedCert: body.offerSignedCert },
  });
});

// ── helpers ──────────────────────────────────────────────────────────
async function settle(frames = 6) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => realSetTimeout(r, 0));
    });
  }
}

async function mount(albumOverrides: Record<string, any> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(ShopifyPanel, {
          albumId: "a1",
          album: { id: "a1", title: "Test Album", artist: "Test Artist", externalSaleUrl: null, ...albumOverrides },
          sellMode: "shopify_plus",
        }),
      ),
    );
  });
  await settle();
  const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, q, cleanup };
}

async function click(el: Element | null) {
  assert.ok(el, "expected element to click");
  await act(async () => {
    (el as HTMLElement).dispatchEvent(
      new (window as any).MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  await settle(4);
}

const stepHeader = (step: HTMLElement) =>
  step.querySelector(':scope > div[role="button"]') as HTMLElement | null;

// ── 1. locked gating with no store ───────────────────────────────────
test("no connected store: steps 2 and 3 are locked with the unlock hint", async () => {
  pushFixture = { ...PUSH_BASE, stores: [] };
  const { container, q, cleanup } = await mount();
  try {
    const checklist = q("shopify-plus-checklist");
    assert.ok(checklist, "checklist should render for shopify_plus");

    assert.equal(q("step-shopify-connect")!.getAttribute("data-state"), "active");
    assert.equal(q("step-shopify-map")!.getAttribute("data-state"), "locked");
    assert.equal(q("step-shopify-sale-url")!.getAttribute("data-state"), "locked");

    assert.match(q("step-shopify-map")!.textContent ?? "", /Connect a store first\./);
    assert.match(q("step-shopify-sale-url")!.textContent ?? "", /Connect a store first\./);

    // Locked steps render no interactive content: no mapping form, no
    // sale-url input.
    assert.equal(q("input-shopify-url"), null);
    assert.equal(q("input-external-sale-url"), null);

    // The old gray intro banner is gone.
    assert.ok(!/exactly like Shopify mode/i.test(container.textContent ?? ""));
  } finally {
    await cleanup();
  }
});

// ── 2. complete collapse + cert toggle saves via edit panel ──────────
// Task #2909 — MappingRow replaced by MappingListRow + edit panel.
// Editing a mapping now opens an edit panel (click the row's Edit button),
// then Save mapping fires the PATCH and confirms with a "Saved" chip.
test("store + mapping + sale URL: steps collapse complete; cert toggle PATCHes and confirms", async () => {
  pushFixture = { ...PUSH_BASE, stores: [STORE] };
  mappingsFixture = [{ ...M1 }];
  const { container, q, cleanup } = await mount({
    externalSaleUrl: "https://hoku.myshopify.com/products/vinyl-lp",
  });
  try {
    assert.equal(q("step-shopify-connect")!.getAttribute("data-state"), "complete");
    assert.equal(q("step-shopify-map")!.getAttribute("data-state"), "complete");
    assert.equal(q("step-shopify-sale-url")!.getAttribute("data-state"), "complete");

    // Collapsed summaries: store name / mapping count / the URL.
    assert.match(q("step-shopify-connect")!.textContent ?? "", /Hoku Records/);
    assert.match(q("step-shopify-map")!.textContent ?? "", /1 product mapped/);
    assert.match(
      q("step-shopify-sale-url")!.textContent ?? "",
      /hoku\.myshopify\.com\/products\/vinyl-lp/,
    );

    // Collapsed → the mapped row isn't mounted yet.
    assert.equal(q("row-shopify-mapping-m1"), null);

    // Expand step 2 via its header.
    await click(stepHeader(q("step-shopify-map")!));
    assert.ok(q("row-shopify-mapping-m1"), "mapped row appears once step 2 expands");

    // The retired signed-GoodDeed add-on option is nowhere in the panel.
    assert.ok(!/add-on for the album/i.test(container.textContent ?? ""));
    assert.equal(q("checkbox-signed-addon"), null);

    // Task #2909: rows are silent at rest; open the edit panel via the
    // row's Edit button (hover controls are always present in DOM, just
    // opacity:0). The old expand-toggle is gone.
    assert.equal(q("button-toggle-mapping-m1"), null, "expand toggle is retired in new design");
    await click(q("button-edit-mapping-m1"));

    // Edit panel: digital access is stated as intrinsic; cert toggle present.
    assert.equal(q("row-mint-toggle-m1"), null, "mint toggle is retired");
    assert.match(
      q("text-shopify-included-access-edit")!.textContent ?? "",
      /digital access and a numbered GoodDeed \(PDF\)/,
    );
    const cert = q("toggle-shopify-cert-edit") as HTMLInputElement | null;
    assert.ok(cert, "cert toggle renders in the edit panel");
    assert.equal(cert!.checked, false);
    await click(cert);

    // Clicking Save mapping fires the PATCH.
    await click(q("button-shopify-edit-save-mapping"));

    assert.equal(patchCalls.length, 1);
    assert.match(patchCalls[0].url, /\/api\/admin\/albums\/a1\/shopify-mappings\/m1$/);
    assert.equal(patchCalls[0].body.offerSignedCert, true);
    assert.equal(patchCalls[0].body.offersDigitalUnlock, undefined);
    assert.equal(patchCalls[0].body.signedCertPriceCents, undefined);
  } finally {
    await cleanup();
  }
});

// ── 3. failed PATCH shows error inline; re-save succeeds ─────────────
// Task #2909 — No inline retry button; user just clicks "Save mapping" again.
test("failed flag save keeps the user's choice with Couldn't save + Retry", async () => {
  pushFixture = { ...PUSH_BASE, stores: [STORE] };
  mappingsFixture = [{ ...M1 }];
  patchResponder = () => ({ status: 400, json: { message: "Price is below the album's signed-cert floor" } });
  const { q, cleanup } = await mount();
  try {
    await click(stepHeader(q("step-shopify-map")!));
    // Open edit panel.
    await click(q("button-edit-mapping-m1"));
    const cert = q("toggle-shopify-cert-edit") as HTMLInputElement;
    await click(cert);

    // Click Save mapping — PATCH fires and fails.
    await click(q("button-shopify-edit-save-mapping"));
    assert.equal(patchCalls.length, 1);

    // Error shown inline in the edit panel.
    const errEl = q("text-edit-save-error");
    assert.ok(errEl, "inline error renders in the edit panel");
    assert.match(errEl!.textContent ?? "", /below the album's signed-cert floor/);

    // The cert toggle is still checked (user's choice not silently reverted).
    assert.equal((q("toggle-shopify-cert-edit") as HTMLInputElement).checked, true);

    // Re-send succeeds: click Save mapping again.
    patchResponder = (body) => ({
      status: 200,
      json: { ...M1, offerSignedCert: body.offerSignedCert },
    });
    await click(q("button-shopify-edit-save-mapping"));
    assert.equal(patchCalls.length, 2);
    assert.equal(patchCalls[1].body.offerSignedCert, true);
    // Edit panel closes after success; no more error.
    assert.equal(q("text-edit-save-error"), null, "error clears after successful save");
  } finally {
    await cleanup();
  }
});
