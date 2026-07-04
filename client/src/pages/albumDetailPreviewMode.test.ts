// Task #1771 — regression guard for the staged-launch review "preview pass"
// fan experience: the discrete "Preview" pill + the checkout block.
//
// When the operator's "See Preview Flow" link plants a preview pass
// (sessionStorage, via #previewpass=), a reviewer walks the real buyer
// experience on a not-yet-live release. Two things make that safe and obvious,
// and neither has any other client coverage:
//   • AlbumDetail renders a discrete floating "Preview" pill
//     (`banner-preview-mode`) whose text still spells out "Checkout is
//     disabled" (visible label "Preview" + sr-only/tooltip detail). It is the
//     ONLY visible signal that the reviewer is in no-charge mode, so a silent
//     regression would make the review flow look like a real purchase flow.
//   • The block itself is NOT a disabled Buy button — the Buy pill still opens
//     the sheet. The actual enforcement is that `apiRequest`/the query fetcher
//     attach an `X-Preview-Pass` header on EVERY request whenever a pass is
//     present, and the server hard-rejects any checkout that carries it. So we
//     assert the block at the request layer (the genuine contract) rather than
//     on a button's `disabled` attribute, which would be testing the wrong
//     thing.
//
// We render the REAL exported AlbumDetail page (desktop surface, the
// proven-stable render path) so a refactor that drops the banner, or mis-gates
// it, fails here. The banner is a function of sessionStorage only, so we toggle
// the real previewPass module and assert presence/absence across both cases.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/albumDetailPreviewMode.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports (.svg/.png/…) so the real page imports under tsx
// without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// Stand up jsdom + every global React/wouter/framer-motion/SyncedLyrics need,
// reduced-motion matchMedia, the analytics-timer capture, and per-file global
// restoration. Desktop width → AlbumDetail renders the desktop surface.
const { window, g } = installTestDom({
  url: "http://localhost/album/a1",
  viewportWidth: 1280,
});

// previewPass.ts reads the BARE `sessionStorage` global, which the harness does
// not set (it only manages localStorage). Point it at jsdom's.
g.sessionStorage = window.sessionStorage;

// Import React + the real modules AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { PlayerProvider } = await import("@/context/PlayerContext");
const { AlbumDetail } = await import("./AlbumDetail");
const { setPreviewPass, clearPreviewPass, hasPreviewPass } = await import(
  "@/lib/previewPass"
);
const { apiRequest } = await import("@/lib/queryClient");

const h = React.createElement;

const ALBUM_ID = "a1";
const PASS_TOKEN = "review-pass-xyz";

// Album payload shaped like GET /api/albums/:id — minimal owned album so the
// desktop surface renders its stable owner path without touching the network.
const album = {
  id: ALBUM_ID,
  title: "Test Album",
  artist: "Tester",
  artwork: "",
  year: 2026,
  type: "LP",
  description: null,
  isExplicit: false,
  priceCents: null,
  songs: [
    {
      id: "s1",
      albumId: ALBUM_ID,
      title: "Song one",
      trackNumber: 1,
      duration: 180,
      lyrics: null,
      audioUrl: null,
      syncedLyrics: null,
      isExplicit: false,
      isPreviewable: true,
    },
  ],
};

// Seed a QueryClient so the page renders without hitting the network. Unseeded
// queries fall back to the null queryFn, which the surface handles. Owning the
// album (my-albums) lands on the proven-stable owner render path.
function makeClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => null,
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity, // no per-query 5-min gc timer to linger past the test
        refetchOnWindowFocus: false,
      },
    },
  });
  qc.setQueryData(["/api/albums", ALBUM_ID], album);
  qc.setQueryData(["/api/albums", ALBUM_ID, "credits"], {
    production: [],
    bySongId: {},
  });
  qc.setQueryData(["/api/albums", ALBUM_ID, "videos"], []);
  qc.setQueryData(["/api/albums", ALBUM_ID, "photos"], []);
  qc.setQueryData(["/api/songs"], []);
  qc.setQueryData(["/api/me"], null);
  qc.setQueryData(["/api/my-albums"], [{ albumId: ALBUM_ID }]);
  return qc;
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient() },
        h(PlayerProvider, null, h(AlbumDetail, { albumId: ALBUM_ID })),
      ),
    );
  });

  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
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

  return { q, settle, teardown };
}

// Run apiRequest against a one-shot fetch stub and return the headers it sent,
// so we can prove the X-Preview-Pass block header is (or isn't) attached. This
// is the real client-side checkout-block mechanism the banner advertises.
async function capturedCheckoutHeaders(): Promise<Record<string, string>> {
  let sent: Record<string, string> = {};
  const realFetch = g.fetch;
  g.fetch = async (_url: string, init: any) => {
    sent = { ...(init?.headers ?? {}) };
    // jsdom doesn't ship a Response constructor; apiRequest only reads .ok and
    // .text() (via throwIfResNotOk), so a minimal stand-in is enough.
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "{}",
    } as any;
  };
  try {
    await apiRequest("POST", "/api/checkout/session", { albumId: ALBUM_ID });
  } finally {
    g.fetch = realFetch;
  }
  return sent;
}

test("preview pass active: banner renders and the checkout request carries the block header", async () => {
  setPreviewPass(PASS_TOKEN);
  assert.equal(hasPreviewPass(), true, "preview pass is set for this case");

  const { q, settle, teardown } = await mount();
  try {
    await settle();

    const banner = q("banner-preview-mode");
    assert.ok(banner, "the Preview mode banner renders while a pass is active");
    assert.match(
      banner!.textContent ?? "",
      /Checkout is disabled/i,
      "banner spells out that checkout is disabled (the reviewer's only signal)",
    );

    // The Buy pill is deliberately NOT disabled client-side; the block is the
    // X-Preview-Pass header the server hard-rejects. Prove it's attached.
    const headers = await capturedCheckoutHeaders();
    assert.equal(
      headers["X-Preview-Pass"],
      PASS_TOKEN,
      "checkout request carries the X-Preview-Pass header so the server blocks the charge",
    );
  } finally {
    await teardown();
    clearPreviewPass();
  }
});

test("no preview pass: banner is absent and the checkout request carries no block header", async () => {
  clearPreviewPass();
  assert.equal(hasPreviewPass(), false, "no preview pass for the normal case");

  const { q, settle, teardown } = await mount();
  try {
    await settle();

    assert.equal(
      q("banner-preview-mode"),
      null,
      "no banner when there's no preview pass (this is a real purchase flow)",
    );

    const headers = await capturedCheckoutHeaders();
    assert.equal(
      headers["X-Preview-Pass"],
      undefined,
      "no X-Preview-Pass header → the real checkout is allowed to proceed",
    );
  } finally {
    await teardown();
  }
});
