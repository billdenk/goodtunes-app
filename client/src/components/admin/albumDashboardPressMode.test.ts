// Task #2256 — regression guard for the press-partner cut of the per-album
// Dashboard. A press partner (AdminAlbum renders AlbumDashboardPanel with
// `pressMode={isPress}`) must see commerce numbers only: a press never gets the
// artist's listening telemetry, so the Plays + Listeners KPIs, the
// "New vs. returning fans" card, and the "Most popular songs" card are all
// gated behind `!pressMode`. Operators (pressMode false) keep everything. Each
// gate is its own `{!pressMode && …}` expression, so a refactor could re-expose
// one of them to a press without touching the others — this pins all four, plus
// the commerce cards that must ALWAYS render in both modes.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/albumDashboardPressMode.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../../pages/jsdomHarness";

// The panel renders no static assets, but it (and react-query) read
// import.meta.env via the loader-rewritten global; register the loader before
// the component graph is imported, then stand up the DOM.
register("../../pages/assetStubLoader.mjs", import.meta.url);
installTestDom({ url: "http://localhost/admin/albums/a1" });

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { AlbumDashboardPanel } = await import("./AlbumDashboardPanel");

const h = React.createElement;
const ALBUM_ID = "a1";

// A fully-populated dashboard payload (GET /api/admin/albums/:id/dashboard) so
// every conditionally-rendered card has data to draw and the press-mode gate is
// the ONLY reason a section would be absent. Seeded into the cache with
// staleTime Infinity so the panel's own queryFn never fires (no network).
const DASHBOARD = {
  lifetime: {
    grossCents: 123400,
    units: 42,
    orders: 30,
    buyers: 25,
    refundedCents: 0,
    plays: 5000,
    listeners: 1200,
  },
  addons: [{ sku: "vinyl", label: "Vinyl", count: 10, revenueCents: 50000 }],
  newVsReturning: { newBuyers: 18, returningBuyers: 7 },
  topSongs: [
    { songId: "s1", title: "Song one", plays: 3000, completes: 2500, favorites: 100 },
  ],
  geo: { points: [], totalCities: 0, geocoded: 0 },
};

function makeClient() {
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
  qc.setQueryData(["/api/admin/albums", ALBUM_ID, "dashboard"], DASHBOARD);
  return qc;
}

async function mount(pressMode: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient() },
        h(AlbumDashboardPanel, { albumId: ALBUM_ID, pressMode }),
      ),
    );
  });
  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  // Let the seeded query resolve out of the cache.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { q, teardown };
}

// Cards every viewer (operator AND press) always sees.
const ALWAYS = [
  "panel-dashboard",
  "kpi-units",
  "kpi-gross",
  "kpi-buyers",
  "kpi-orders",
  "section-addons",
];
// Engagement/play surfaces gated to operators only.
const OPERATOR_ONLY = [
  "kpi-plays",
  "kpi-listeners",
  "section-new-vs-returning",
  "section-top-songs",
];

test("operator dashboard (pressMode false) shows commerce AND engagement surfaces", async () => {
  const { q, teardown } = await mount(false);
  try {
    for (const id of ALWAYS) assert.ok(q(id), `operator sees ${id}`);
    for (const id of OPERATOR_ONLY) assert.ok(q(id), `operator sees ${id}`);
  } finally {
    await teardown();
  }
});

test("press dashboard (pressMode true) hides plays/listeners + engagement cards, keeps commerce", async () => {
  const { q, teardown } = await mount(true);
  try {
    for (const id of ALWAYS) assert.ok(q(id), `press still sees ${id}`);
    for (const id of OPERATOR_ONLY)
      assert.equal(q(id), null, `press must NOT see the engagement surface ${id}`);
  } finally {
    await teardown();
  }
});
