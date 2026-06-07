// Task #1599 — regression guard for the desktop album-page right rail being
// SHARED between lyrics and Up Next (queue), added in Task #1597.
//
// AlbumDetailDesktop wires the dock's two rail toggles to the real
// PlayerContext.toggleRail, which enforces mutual exclusivity:
//   • onLyrics → toggleRail("lyrics")  → showLyrics on, showQueue off
//   • onQueue  → toggleRail("queue")   → showQueue on, showLyrics off
// and the single side panel renders whichever is active
// (`railBody = showQueue ? <DesktopQueueBody/> : lyricsBody`). A regression
// that let both open at once, that failed to swap the panel body, or that
// re-tapping the open mode failed to close the rail would slip through QA.
//
// albumDetailLyricsBreakpoints.test.ts already renders the REAL page inside
// the REAL PlayerProvider to prove the lyrics button opens the lg side
// panel; this test reuses that exact harness to additionally drive the Up
// Next button and assert the lyrics↔queue swap goes through the real
// toggleRail.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/albumDetailRailMutualExclusivity.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the real page can be imported
// under tsx without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` lazily starts a module-level setInterval flush loop the
// first time track()/identify fires (which it does once we render the real
// page). It's never cleared, so capture any interval created during the run
// and clear them in an `after` hook so the process drains cleanly.
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
  url: "http://localhost/album/a1",
  pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
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
// wouter v3 patches history.pushState/replaceState to emit a navigation
// event via the GLOBAL dispatchEvent; jsdom only exposes it on window.
g.dispatchEvent = window.dispatchEvent.bind(window);
g.HTMLElement = window.HTMLElement;
g.SVGElement = window.SVGElement;
g.Element = window.Element;
g.Node = window.Node;
g.DocumentFragment = window.DocumentFragment;
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.KeyboardEvent = window.KeyboardEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.Audio = window.Audio; // PlayerContext news up a hidden <audio> element

// Mutable viewport the matchMedia stub answers `(min-width: Npx)` against;
// fixed at lg so the in-flow side panel (panel-lyrics) is the active surface.
let viewportWidth = 1280;
function setViewport(px: number) {
  viewportWidth = px;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: px,
  });
}
window.matchMedia = ((query: string) => {
  let matches = false;
  if (/reduce/.test(query)) {
    matches = true;
  } else {
    const m = /min-width:\s*(\d+)px/.exec(query);
    if (m) matches = viewportWidth >= Number(m[1]);
    const mx = /max-width:\s*(\d+)px/.exec(query);
    if (mx) matches = viewportWidth <= Number(mx[1]);
  }
  return {
    matches,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  };
}) as any;
g.matchMedia = window.matchMedia;
// SyncedLyrics auto-scrolls via element.scrollTo, which jsdom doesn't ship.
(window.HTMLElement.prototype as any).scrollTo = () => {};
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
const { PlayerProvider } = await import("@/context/PlayerContext");
const { AlbumDetailDesktop } = await import("./AlbumDetailDesktop");

const h = React.createElement;

const ALBUM_ID = "a1";
const LYRIC_TEXT = "First line of the song";

// Album payload shaped like GET /api/albums/:id — one owned, full-length
// song carrying lyrics so the lyrics surface renders SyncedLyrics. A second
// song so the Up Next queue body has an upcoming row to show.
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
      lyrics: `${LYRIC_TEXT}\nSecond line of the song\nThird line of the song`,
      audioUrl: null,
      syncedLyrics: null,
      isExplicit: false,
      isPreviewable: true,
    },
    {
      id: "s2",
      albumId: ALBUM_ID,
      title: "Song two",
      trackNumber: 2,
      duration: 200,
      lyrics: null,
      audioUrl: null,
      syncedLyrics: null,
      isExplicit: false,
      isPreviewable: true,
    },
  ],
};

// Seed a QueryClient so the page renders without touching the network.
// `/api/my-albums` carrying this album makes the fan an owner → full-length
// playback + the white Play pill (button-play-album).
function makeClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => null,
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
  qc.setQueryData(["/api/albums", ALBUM_ID], album);
  qc.setQueryData(["/api/albums", ALBUM_ID, "credits"], { production: [] });
  qc.setQueryData(["/api/albums", ALBUM_ID, "videos"], []);
  qc.setQueryData(["/api/albums", ALBUM_ID, "photos"], []);
  qc.setQueryData(["/api/songs"], []);
  qc.setQueryData(["/api/me"], null);
  qc.setQueryData(["/api/my-albums"], [{ albumId: ALBUM_ID }]);
  return qc;
}

async function mount() {
  setViewport(1280);
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient() },
        h(PlayerProvider, null, h(AlbumDetailDesktop, { albumId: ALBUM_ID })),
      ),
    );
  });
  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const all = (id: string) =>
    Array.from(document.querySelectorAll(`[data-testid="${id}"]`));
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
  return { q, all, click, settle, teardown };
}

test("the shared side panel swaps between lyrics and Up Next, never both at once", async () => {
  const { q, all, click, settle, teardown } = await mount();
  try {
    // Seat a current song (the dock auto-expands on the first track change),
    // which enables both the lyrics mic and the Up Next button.
    const playAll = q("button-play-album");
    assert.ok(playAll, "owned album shows the Play pill");
    await click(playAll!);
    await settle();

    // The queue body (DesktopQueueBody) always renders its "Up Next" header
    // whenever it is mounted — even when the upcoming list is empty. We key
    // off that instead of a specific queue-item row so the assertion stays
    // robust to how many songs ended up seated in the queue (in the shared
    // full-suite process a leaked global fetch can hydrate-filter the second
    // track out of the queue, leaving the body mounted but with no rows).
    const panelHostsQueue = (panel: Element | null) =>
      !!panel && /Up Next/.test(panel.textContent ?? "");
    const panelHostsLyrics = (panel: Element | null) =>
      !!panel && !!panel.querySelector('[data-testid="lyrics-scroll"]');

    const lyricsBtn = q("button-lyrics");
    const queueBtn = q("button-queue");
    assert.ok(lyricsBtn, "dock renders the lyrics button");
    assert.ok(queueBtn, "dock renders the Up Next button");
    // Nothing open yet.
    assert.equal(q("panel-lyrics"), null, "no side panel before opening");
    assert.equal(lyricsBtn!.getAttribute("aria-pressed"), "false");
    assert.equal(queueBtn!.getAttribute("aria-pressed"), "false");

    // ── Open lyrics ────────────────────────────────────────────────
    await click(lyricsBtn!);
    await settle();
    let panel = q("panel-lyrics");
    assert.ok(panel, "lyrics opens the shared side panel");
    assert.ok(
      panelHostsLyrics(panel),
      "panel hosts the SyncedLyrics surface",
    );
    assert.ok(!panelHostsQueue(panel), "queue body is not mounted yet");
    assert.equal(q("button-lyrics")!.getAttribute("aria-pressed"), "true");
    assert.equal(q("button-queue")!.getAttribute("aria-pressed"), "false");

    // ── Switch to Up Next ──────────────────────────────────────────
    // Opening the queue must CLOSE lyrics (toggleRail mutual exclusivity)
    // and swap the SAME panel's body to DesktopQueueBody.
    await click(q("button-queue")!);
    await settle();
    panel = q("panel-lyrics");
    assert.ok(panel, "the shared panel stays mounted for Up Next");
    assert.ok(panelHostsQueue(panel), "panel now hosts the Up Next queue body");
    assert.equal(
      all("lyrics-scroll").length,
      0,
      "the lyrics surface is gone — both can't be open at once",
    );
    assert.ok(!panelHostsLyrics(panel), "lyrics body is no longer mounted");
    assert.equal(q("button-queue")!.getAttribute("aria-pressed"), "true");
    assert.equal(q("button-lyrics")!.getAttribute("aria-pressed"), "false");

    // ── Switch back to lyrics ──────────────────────────────────────
    // Opening lyrics again must CLOSE the queue and restore the lyrics body.
    await click(q("button-lyrics")!);
    await settle();
    assert.ok(q("panel-lyrics"), "the shared panel stays mounted for lyrics");
    assert.ok(
      panelHostsLyrics(q("panel-lyrics")),
      "panel restores the lyrics surface",
    );
    assert.ok(!panelHostsQueue(q("panel-lyrics")), "the queue body is gone");
    assert.equal(q("button-lyrics")!.getAttribute("aria-pressed"), "true");
    assert.equal(q("button-queue")!.getAttribute("aria-pressed"), "false");

    // ── Re-tap the open mode → rail closes ─────────────────────────
    await click(q("button-lyrics")!);
    await settle();
    for (let i = 0; i < 60 && q("panel-lyrics"); i++) await settle(1);
    assert.equal(
      q("panel-lyrics"),
      null,
      "re-tapping the active mode closes the shared rail",
    );
    assert.equal(q("button-lyrics")!.getAttribute("aria-pressed"), "false");
    assert.equal(q("button-queue")!.getAttribute("aria-pressed"), "false");
  } finally {
    await teardown();
  }
});
