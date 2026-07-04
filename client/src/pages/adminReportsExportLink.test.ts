// Task #2500 — regression guard for the report CSV export view-as leak.
//
// Task #2497 fixed the shared `ExportLink` in AdminReports.tsx so CSV
// downloads fetch via `fetchBlob` (which threads `authHeaders()` — Bearer +
// preview pass + crucially the `X-View-As-Token`) and turn the response into
// a blob download, instead of a plain `<a href>` navigation. A bare anchor
// navigation sends cookies but NOT custom headers, so `X-View-As-Token` would
// be dropped: an operator impersonating a partner via "View as" would then
// download the CSV under their real super_admin god-view scope and leak every
// partner's data (see .agents/memory/report-csv-export-authheaders.md).
//
// There was no automated guard preventing a future edit from regressing
// `ExportLink` back to a header-less anchor. This exercises the client
// contract:
//   - clicking ExportLink issues a fetch to the CSV href that carries
//     `X-View-As-Token` (from sessionStorage) AND `Authorization: Bearer`,
//   - the export affordance is a <button>, not a bare `<a href>` anchor that
//     would navigate without headers — so a revert to an anchor makes the
//     click fire no fetch and this test fail.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/adminReportsExportLink.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports (.svg/.png/…) + rewrite import.meta.env so the
// real page module can be imported under tsx without Vite. Must run before
// any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

const { window } = installTestDom({ url: "http://localhost/admin/reports" });

// jsdom doesn't implement URL.createObjectURL/revokeObjectURL, and the blob
// download path calls both. Stub them so the click handler runs to completion.
(window.URL as any).createObjectURL = () => "blob:mock";
(window.URL as any).revokeObjectURL = () => {};
(globalThis as any).URL.createObjectURL = (window.URL as any).createObjectURL;
(globalThis as any).URL.revokeObjectURL = (window.URL as any).revokeObjectURL;

// The handler appends a temporary <a download> and calls .click(); jsdom would
// otherwise log a "navigation not implemented" virtual-console error. Neuter
// the anchor click — we only care that the fetch already carried the headers.
(window.HTMLAnchorElement.prototype as any).click = () => {};

// A failed fetchBlob toasts (shadcn use-toast arms a 1,000,000ms auto-dismiss
// setTimeout the harness doesn't capture). Our fetch stub resolves ok, so no
// toast fires, but capture+clear setTimeout anyway to stay hang-proof.
const realSetTimeout = globalThis.setTimeout;
const createdTimeouts = new Set<any>();
(globalThis as any).setTimeout = (...args: any[]) => {
  const id = (realSetTimeout as any)(...args);
  createdTimeouts.add(id);
  return id;
};

// ── fetch stub — record every call's url + headers, return a blob-able ok ──
const fetchCalls: { url: string; headers: Record<string, string> }[] = [];
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  fetchCalls.push({
    url: String(url),
    headers: { ...(init.headers ?? {}) },
  });
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    blob: async () => ({}) as any,
    text: async () => "",
    json: async () => ({}),
  } as any;
};

after(() => {
  for (const id of createdTimeouts) clearTimeout(id);
  createdTimeouts.clear();
  (globalThis as any).setTimeout = realSetTimeout;
});

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { ExportLink } = await import("./AdminReports");

const h = React.createElement;

const CSV_HREF = "/api/partner/reports/sales.csv?from=2026-01-01&to=2026-02-01";

async function settle(frames = 4) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(ExportLink, { href: CSV_HREF, label: "Download CSV" }));
  });
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
  };
  return { container, q, click, cleanup };
}

// ── tests ────────────────────────────────────────────────────────────
test("clicking the export downloads via a fetch carrying the view-as + bearer headers", async () => {
  window.localStorage.setItem("goodtunes_auth_token", "test-bearer-token");
  window.sessionStorage.setItem("gt:viewAsToken", "view-as-hmac-123");
  fetchCalls.length = 0;

  const { q, click, cleanup } = await mount();

  const btn = q("link-export-csv");
  assert.ok(btn, "the export affordance renders");
  // It must be a <button>, NOT a bare <a href> that would navigate without
  // headers — the exact regression this guard exists to catch.
  assert.equal(
    btn!.tagName,
    "BUTTON",
    "export is a button (blob download), not a header-less anchor",
  );

  await click(btn!);

  const csvFetch = fetchCalls.find((c) => c.url === CSV_HREF);
  assert.ok(csvFetch, "clicking the export issues a fetch to the CSV href");
  assert.equal(
    csvFetch!.headers["X-View-As-Token"],
    "view-as-hmac-123",
    "the CSV fetch carries the view-as token so the server scopes to the impersonated partner",
  );
  assert.equal(
    csvFetch!.headers["Authorization"],
    "Bearer test-bearer-token",
    "the CSV fetch carries the bearer token",
  );

  await cleanup();
});

test("no bare <a href> to the CSV exists — a revert to an anchor navigation would drop headers", async () => {
  window.localStorage.setItem("goodtunes_auth_token", "test-bearer-token");
  window.sessionStorage.setItem("gt:viewAsToken", "view-as-hmac-123");

  const { container, cleanup } = await mount();

  // A regression to `<a href={csvUrl}>` would surface an anchor pointing at
  // the .csv endpoint (a browser navigation that sends cookies but not the
  // X-View-As-Token header, leaking god-view data).
  const csvAnchor = container.querySelector('a[href*=".csv"]');
  assert.equal(
    csvAnchor,
    null,
    "there is no anchor navigating straight to the CSV endpoint",
  );

  await cleanup();
});

test("without a view-as token the fetch simply omits the header (still a fetch, not a nav)", async () => {
  window.localStorage.setItem("goodtunes_auth_token", "test-bearer-token");
  window.sessionStorage.removeItem("gt:viewAsToken");
  fetchCalls.length = 0;

  const { q, click, cleanup } = await mount();
  await click(q("link-export-csv")!);

  const csvFetch = fetchCalls.find((c) => c.url === CSV_HREF);
  assert.ok(csvFetch, "still downloads through a fetch");
  assert.equal(
    csvFetch!.headers["X-View-As-Token"],
    undefined,
    "no view-as header when not impersonating",
  );

  await cleanup();
});
