// Saved-builds transition — regression guard for the press Packages routing.
// Presses' legacy catalog deep links (?tab=catalog AND the older
// ?tab=settings&settings=catalog) must resolve to the saved-builds "packages"
// tab AND canonicalize the URL to ?tab=packages (copied/bookmarked/feedback
// links must not stay legacy). God-view (AdminManufacturer) is the exception:
// its resolveExtra claims plain ?tab=catalog so operators keep the legacy
// pricing catalog, while &section=specs|gooddeeds still map to specs/overview.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/pressPackagesNav.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

register("./assetStubLoader.mjs", import.meta.url);

// Capture timers so the shared tsx --test process exits (toast/analytics
// hygiene — same pattern as pressAudioSpecCard.test.ts).
const realSetInterval = globalThis.setInterval;
const createdIntervals = new Set<ReturnType<typeof setInterval>>();
(globalThis as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  createdIntervals.add(id);
  return id;
};
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
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/vendor",
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
g.Element = window.Element;
g.Node = window.Node;
// wouter's patched history.replaceState dispatches `new Event(...)` — that
// constructor MUST be jsdom's (Node's built-in Event is rejected by jsdom's
// Window.dispatchEvent), so override the Node globals explicitly.
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
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
g.fetch = async () =>
  ({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) }) as any;
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

const ReactNs: any = await import("react");
const React = ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const { usePressPortalNav } = await import("./PressPortal");

const h = React.createElement;

// Mount a bare probe that runs the REAL hook (wouter reads global location)
// and report the resolved tab + the post-canonicalization URL search string.
async function resolveNav(
  search: string,
  opts?: Parameters<typeof usePressPortalNav>[0],
): Promise<{ tab: string; search: string }> {
  window.history.replaceState(null, "", `/vendor${search}`);
  let captured: any = null;
  function Probe() {
    captured = usePressPortalNav(opts);
    return null;
  }
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(h(Probe));
  });
  const result = { tab: captured.tab as string, search: window.location.search };
  await act(async () => {
    root.unmount();
  });
  host.remove();
  return result;
}

// The exact god-view options AdminManufacturer passes (kept in lockstep —
// if that page's resolveExtra changes, update this mirror deliberately).
const GOD_VIEW_OPTS = {
  extraTabIds: ["overview", "contacts", "analytics", "catalog"] as const,
  resolveExtra: (t: string | null, sp: URLSearchParams) => {
    const section = sp.get("section");
    if (t === "catalog" && section === "specs") return "specs";
    if (t === "catalog" && section === "gooddeeds") return "overview";
    if (t === "catalog") return "catalog";
    return null;
  },
};

test("press portal: ?tab=catalog lands on saved-builds packages and canonicalizes the URL", async () => {
  const r = await resolveNav("?tab=catalog&view=colors");
  assert.equal(r.tab, "packages");
  const sp = new URLSearchParams(r.search);
  assert.equal(sp.get("tab"), "packages");
  assert.equal(sp.get("view"), null);
  assert.equal(sp.get("settings"), null);
});

test("press portal: legacy ?tab=settings&settings=catalog lands on packages and canonicalizes", async () => {
  const r = await resolveNav("?tab=settings&settings=catalog");
  assert.equal(r.tab, "packages");
  const sp = new URLSearchParams(r.search);
  assert.equal(sp.get("tab"), "packages");
  assert.equal(sp.get("settings"), null);
});

test("press portal: ?tab=packages resolves unchanged (no rewrite churn)", async () => {
  const r = await resolveNav("?tab=packages");
  assert.equal(r.tab, "packages");
  assert.equal(new URLSearchParams(r.search).get("tab"), "packages");
});

test("press portal: ?tab=settings&settings=whitelabel is NOT hijacked by the catalog rewrite", async () => {
  const r = await resolveNav("?tab=settings&settings=whitelabel");
  assert.equal(r.tab, "settings");
  const sp = new URLSearchParams(r.search);
  assert.equal(sp.get("tab"), "settings");
  assert.equal(sp.get("settings"), "whitelabel");
});

test("god-view: plain ?tab=catalog stays on the legacy pricing catalog, URL untouched", async () => {
  const r = await resolveNav("?tab=catalog", GOD_VIEW_OPTS);
  assert.equal(r.tab, "catalog");
  assert.equal(new URLSearchParams(r.search).get("tab"), "catalog");
});

test("god-view: legacy section deep links still map to specs / overview", async () => {
  const specs = await resolveNav("?tab=catalog&section=specs", GOD_VIEW_OPTS);
  assert.equal(specs.tab, "specs");
  const overview = await resolveNav("?tab=catalog&section=gooddeeds", GOD_VIEW_OPTS);
  assert.equal(overview.tab, "overview");
});
