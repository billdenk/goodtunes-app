// Task #1268 — regression guard for who can delete an album from the editor.
//
// AdminAlbum gates the album-delete affordance on the caller's admin role
// (GET /api/me/role): artist *and* label partners get a single request-only
// button (`button-request-delete-album`) that routes to the sold-blocked
// popup or the request-to-delete confirm based on `album.firstSoldAt`, while
// operators (super_admin / admin) keep the direct-delete chrome
// (`button-delete-album` on Overview, the multi-select / delete-all dropdown
// `button-delete-options` on Tracks). The whole split hinges on one line —
// `const partnerDelete = isArtist || isLabel` — so a future refactor could
// silently re-hide the button for labels or hand partners the direct-delete
// chrome. We render the REAL page so that regression fails here, not in QA.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/adminAlbumDeleteGating.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the real page imports under tsx
// without Vite (AdminFrame pulls in the GoodTunes wordmark PNG). Must run
// before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` lazily arms a module-level setInterval flush loop the
// first time track()/identify fires (useAuth identifies on mount). It's never
// cleared, so it would keep this shared process alive forever and the
// buffered TAP output would never flush. Capture any interval created during
// the run and clear it in an `after` hook so the process drains cleanly.
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

const ALBUM_ID = "a1";

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: `http://localhost/admin/albums/${ALBUM_ID}`,
  pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location; // wouter reads the GLOBAL location/history
g.history = window.history;
g.localStorage = window.localStorage; // AdminFrame persists sidebar/preview state
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
// wouter v3 patches history.pushState/replaceState to emit a navigation event
// via the GLOBAL dispatchEvent (the page mirrors `tab` into ?tab= on mount).
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
// framer-motion useReducedMotion → force reduced so any width/opacity
// animations resolve at 0ms (radix dropdown / dialog open instantly).
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
// anchorScrollToElement (tab clicks) calls window.scrollBy; jsdom omits it.
(window as any).scrollBy = () => {};
(window as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollIntoView = () => {};
// No query should hit the network; if one slips past the seeded cache, fail
// loud-but-harmless instead of opening a real socket.
g.fetch = async () =>
  ({
    ok: false,
    status: 404,
    text: async () => "not found",
    json: async () => ({}),
  }) as any;
// Radix Dialog (the delete confirm/sold-blocked popups) mounts a FocusScope +
// DismissableLayer on open, which reach for MutationObserver / ResizeObserver
// and the pointer-capture API — none of which jsdom ships. Stub them so the
// dialogs render instead of tripping AdminFrame's error boundary.
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
// Radix's FocusScope (mounted by every Dialog) does a string of `instanceof
// HTMLInputElement` / `createTreeWalker` checks against globals that live on
// `window` but not Node's `globalThis`. Rather than enumerate each one, copy
// every window-only global across so any DOM constructor resolves.
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in g)) {
    try {
      g[key] = (window as any)[key];
    } catch {
      // some window props are getter-only; skip those.
    }
  }
}
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real page AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { AdminAlbum } = await import("./AdminAlbum");

const h = React.createElement;

// Album payload shaped like GET /api/albums/:id. `sellMode: "direct"` keeps
// the auto-open mode-picker modal from firing and gives operators the Press
// tab; a single song keeps the operator's "delete all/selected tracks" menu
// items enabled. `firstSoldAt` is toggled per-test to exercise the
// sold-blocked vs request-to-delete branch.
function makeAlbum(firstSoldAt: string | null) {
  return {
    id: ALBUM_ID,
    title: "Test Album",
    artist: "Tester",
    artwork: "",
    year: 2026,
    type: "LP",
    description: null,
    isHidden: false,
    isGoodTunesRelease: true,
    isPrepping: false,
    sellMode: "direct",
    sellQuoteLockedAt: null,
    firstSoldAt,
    songs: [
      {
        id: "s1",
        title: "Song one",
        trackNumber: 1,
        duration: 180,
        lyrics: null,
        audioUrl: null,
      },
    ],
  };
}

// Seed a QueryClient so the page renders without touching the network.
// `staleTime: Infinity` keeps seeded entries fresh so queries that define
// their own queryFn (useAuth /api/me, edit-access) never refetch; the default
// queryFn returns [] so AdminFrame's many sidebar-count queries resolve to
// empty arrays instead of null (which would throw on .filter).
function makeClient(role: string, firstSoldAt: string | null) {
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
  qc.setQueryData(["/api/me"], {
    id: "u1",
    username: "op",
    email: "op@example.com",
    displayName: "Operator",
    isAdmin: true,
    kind: "admin",
  });
  qc.setQueryData(["/api/me/role"], { role, roleScopeId: null });
  qc.setQueryData(["/api/albums", ALBUM_ID], makeAlbum(firstSoldAt));
  qc.setQueryData(["/api/admin/albums", ALBUM_ID, "skus"], {
    skus: [],
    addons: [],
  });
  qc.setQueryData(["/api/admin/albums", ALBUM_ID, "edit-access"], {
    canEdit: true,
    locked: false,
    hasActiveOverride: false,
    requiresApproval: false,
    missingPermissions: [],
  });
  // AdminFrame's two status banners read object-shaped payloads (the []
  // default queryFn would crash their `.join` / `.thresholds` access), so
  // seed benign "nothing to report" objects that make both early-return null.
  qc.setQueryData(["/api/admin/mux-status"], {
    configured: true,
    missingSecrets: [],
    counts: {
      ready: 0,
      ingesting: 0,
      preparing: 0,
      errored: 0,
      notIngested: 0,
    },
    erroredSample: [],
  });
  qc.setQueryData(["/api/admin/job-runs/alerts"], {
    alerts: [],
    thresholds: { lookbackDays: 7 },
  });
  // OverviewPanel renders inside AdminFrame's single error boundary, so a
  // crash in any of its sub-panels (which read object-shaped payloads) would
  // replace the whole page — tabs + delete chrome included. Seed the NPO
  // donation-split panel's payload so it renders its empty editor instead.
  qc.setQueryData(["/api/admin/albums", ALBUM_ID, "npo-beneficiaries"], {
    beneficiaries: [],
    capCents: 100,
    maxBeneficiaries: 4,
    locked: false,
    isDefault: true,
  });
  qc.setQueryData(["/api/non-profits"], []);
  // TracksPanel does `albumCredits?.bySongId[song.id]` — the `?.` only guards
  // the top level, so the [] default would crash on `.bySongId`. Seed an
  // empty credits map so the Tracks tab (operator delete-options chrome)
  // renders.
  qc.setQueryData(["/api/albums", ALBUM_ID, "credits"], {
    bySongId: {},
    production: [],
  });
  return qc;
}

async function mount(role: string, firstSoldAt: string | null = null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  // wouter reads the GLOBAL location/history, which persists across tests in
  // this shared jsdom — earlier tests click `tab-tracks`, leaving `?tab=tracks`
  // behind so a later operator mount would start on Tracks (delete-options)
  // instead of Overview (delete-album). Reset to a clean album URL per mount.
  window.history.replaceState(null, "", `/admin/albums/${ALBUM_ID}`);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient(role, firstSoldAt) },
        h(AdminAlbum, null),
      ),
    );
  });

  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const settle = async (frames = 6) => {
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
  return { q, click, settle, teardown };
}

// ── Partner roles: single request-only button, no direct-delete chrome ──
for (const role of ["artist", "label"]) {
  test(`${role} partner sees the request-only delete button, not the operator chrome`, async () => {
    const { q, click, settle, teardown } = await mount(role);
    try {
      assert.ok(
        q("button-request-delete-album"),
        `${role} sees the request-to-delete button`,
      );
      // None of the operator-only direct-delete chrome is rendered.
      assert.equal(
        q("button-delete-album"),
        null,
        `${role} must NOT see the operator delete-album button`,
      );
      assert.equal(
        q("button-delete-options"),
        null,
        `${role} must NOT see the operator delete-options dropdown`,
      );

      // Even on the Tracks tab (where operators get the multi-select /
      // delete-all dropdown) the partner still only has the request button —
      // the direct-delete chrome never appears for them.
      const tracksTab = q("tab-tracks");
      assert.ok(tracksTab, "Tracks tab is reachable");
      await click(tracksTab!);
      await settle();
      assert.ok(
        q("button-request-delete-album"),
        `${role} keeps the request button on the Tracks tab`,
      );
      assert.equal(
        q("button-delete-options"),
        null,
        `${role} must NOT get the multi-select dropdown on Tracks`,
      );
    } finally {
      await teardown();
    }
  });
}

// ── Operator roles: direct-delete chrome, never the request-only button ──
for (const role of ["admin", "super_admin"]) {
  test(`${role} operator sees the direct-delete chrome, not the request button`, async () => {
    const { q, click, settle, teardown } = await mount(role);
    try {
      // Overview tab: the standalone "delete this album" button.
      assert.ok(
        q("button-delete-album"),
        `${role} sees the direct delete-album button on Overview`,
      );
      assert.equal(
        q("button-request-delete-album"),
        null,
        `${role} must NOT see the partner request-to-delete button`,
      );

      // Tracks tab: the multi-select / delete-all dropdown is operator-only.
      const tracksTab = q("tab-tracks");
      assert.ok(tracksTab, "Tracks tab is reachable");
      await click(tracksTab!);
      await settle();
      assert.ok(
        q("button-delete-options"),
        `${role} gets the multi-select delete dropdown on Tracks`,
      );
      assert.equal(
        q("button-request-delete-album"),
        null,
        `${role} still never sees the request-to-delete button`,
      );
    } finally {
      await teardown();
    }
  });
}

// ── Sold vs unsold routing for the partner request button ──
test("partner request button opens the request-to-delete confirm for an UNSOLD album", async () => {
  const { q, click, settle, teardown } = await mount("artist", null);
  try {
    assert.equal(
      q("dialog-request-delete-album"),
      null,
      "no confirm dialog before clicking",
    );
    assert.equal(
      q("dialog-album-sold-blocked"),
      null,
      "no sold-blocked dialog before clicking",
    );

    await click(q("button-request-delete-album")!);
    await settle();

    assert.ok(
      q("dialog-request-delete-album"),
      "unsold album opens the request-to-delete confirm",
    );
    assert.ok(
      q("button-request-delete-confirm"),
      "confirm dialog exposes the Request-to-delete action",
    );
    assert.equal(
      q("dialog-album-sold-blocked"),
      null,
      "unsold album does NOT open the sold-blocked popup",
    );
  } finally {
    await teardown();
  }
});

test("partner request button opens the sold-blocked popup for a SOLD album", async () => {
  const { q, click, settle, teardown } = await mount(
    "artist",
    "2026-01-01T00:00:00.000Z",
  );
  try {
    await click(q("button-request-delete-album")!);
    await settle();

    assert.ok(
      q("dialog-album-sold-blocked"),
      "sold album opens the sold-blocked popup",
    );
    assert.equal(
      q("dialog-request-delete-album"),
      null,
      "sold album does NOT open the request-to-delete confirm",
    );
  } finally {
    await teardown();
  }
});
