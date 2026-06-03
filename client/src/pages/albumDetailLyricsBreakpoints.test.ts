// Task #1105 — regression guard for the desktop lyrics button at every width.
//
// AlbumDetailDesktop renders lyrics three different ways depending on
// viewport: the mobile player (<768, AlbumDetail.tsx, not this page), a
// full-bleed overlay at md (768–1023, `overlay-lyrics-md` lives in this
// page) and a right-side slide-in panel at lg (≥1024, `panel-lyrics` lives
// in DesktopAlbumView). The switch hinges on a single
// `isLgViewport = useMediaQuery("(min-width: 1024px)")` plus the two
// boolean gates it feeds:
//   • `lyricsOpen={showLyrics && isLgViewport}`            → panel-lyrics
//   • `{showLyrics && !isLgViewport && !searchMode && …}`  → overlay-lyrics-md
// A future refactor that re-gates a class to the wrong breakpoint (the
// `lg:mx-0 lg:ml-auto` reflow that caused this very bug) would surface a
// lyrics button that opens nothing — or BOTH surfaces at once. We render
// the REAL page so that regression fails here, not in QA.
//
// We drive the breakpoint through a matchMedia stub keyed off a mutable
// viewport width (md ≈ 900px, lg ≈ 1280px), click the album's Play pill to
// seat a current song with lyrics, then click the dock lyrics button and
// assert exactly the right surface mounts — and that only ONE SyncedLyrics
// is ever on screen.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   npx tsx --test client/src/pages/albumDetailLyricsBreakpoints.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the real page can be imported
// under tsx without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` lazily starts a module-level setInterval flush loop the
// first time track()/identify fires (which it does once we render the real
// page). It's never cleared, so it would keep this process alive forever and
// the suite's TAP output (buffered until exit) would never flush. Capture
// any interval created during the run and clear them in an `after` hook so
// the process drains cleanly once our tests finish.
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
g.location = window.location; // wouter reads the global location/history
g.history = window.history;
g.localStorage = window.localStorage;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
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

// Mutable viewport the matchMedia stub answers `(min-width: Npx)` against.
// useReducedMotion → force reduced so width/opacity animations are 0ms.
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
// song carrying lyrics so the lyrics surface renders SyncedLyrics.
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
  ],
};

// Seed a QueryClient so the page renders without touching the network.
// `/api/my-albums` carrying this album makes the fan an owner → full-length
// playback + the white Play pill (button-play-album) instead of the preview
// pill, and disables the buy-options fetch.
function makeClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => null,
        retry: false,
        staleTime: Infinity,
        // Disable react-query garbage collection so it never schedules the
        // 5-minute gc setTimeout per query on unmount — those linger past the
        // test and would keep the shared suite process alive.
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

async function mountAt(width: number) {
  setViewport(width);
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

test("lg (1280px): dock lyrics button opens the side panel, not the md overlay", async () => {
  const { q, all, click, settle, teardown } = await mountAt(1280);
  try {
    // Seat a current song (white Play pill is present because the fan owns
    // the album). The dock auto-expands on the first track change.
    const playAll = q("button-play-album");
    assert.ok(playAll, "owned album shows the Play pill");
    await click(playAll!);
    await settle();

    // The dock surfaces an enabled lyrics button now that a song is playing.
    const lyricsBtn = q("button-lyrics");
    assert.ok(lyricsBtn, "dock renders the lyrics button");
    assert.equal(
      lyricsBtn!.getAttribute("aria-pressed"),
      "false",
      "lyrics button starts unpressed",
    );
    assert.equal(q("panel-lyrics"), null, "no panel before opening");
    assert.equal(q("overlay-lyrics-md"), null, "no md overlay before opening");

    // Open lyrics → at lg the SIDE PANEL mounts, the md overlay does not.
    await click(lyricsBtn!);
    await settle();
    assert.ok(q("panel-lyrics"), "lg shows the side panel");
    assert.equal(
      q("overlay-lyrics-md"),
      null,
      "lg must NOT show the md overlay",
    );
    assert.equal(
      q("button-lyrics")!.getAttribute("aria-pressed"),
      "true",
      "lyrics button is pressed while open",
    );

    // Exactly one karaoke surface on screen, fed the song's lyrics.
    const scrolls = all("lyrics-scroll");
    assert.equal(scrolls.length, 1, "only one SyncedLyrics is mounted");
    assert.ok(
      q("panel-lyrics")!.textContent?.includes(LYRIC_TEXT),
      "panel shows the current song's lyrics",
    );
  } finally {
    await teardown();
  }
});

test("md (900px): dock lyrics button opens the full-bleed overlay, not the panel", async () => {
  const { q, all, click, settle, teardown } = await mountAt(900);
  try {
    const playAll = q("button-play-album");
    assert.ok(playAll, "owned album shows the Play pill");
    await click(playAll!);
    await settle();

    const lyricsBtn = q("button-lyrics");
    assert.ok(lyricsBtn, "dock renders the lyrics button");
    assert.equal(q("panel-lyrics"), null, "no panel before opening");
    assert.equal(q("overlay-lyrics-md"), null, "no md overlay before opening");

    // Open lyrics → at md the OVERLAY mounts, the lg panel does not.
    await click(lyricsBtn!);
    await settle();
    assert.ok(q("overlay-lyrics-md"), "md shows the full-bleed overlay");
    assert.equal(q("panel-lyrics"), null, "md must NOT show the lg side panel");
    assert.equal(
      q("button-lyrics")!.getAttribute("aria-pressed"),
      "true",
      "lyrics button is pressed while open",
    );

    // Exactly one karaoke surface on screen, fed the song's lyrics.
    const scrolls = all("lyrics-scroll");
    assert.equal(scrolls.length, 1, "only one SyncedLyrics is mounted");
    assert.ok(
      q("overlay-lyrics-md")!.textContent?.includes(LYRIC_TEXT),
      "overlay shows the current song's lyrics",
    );

    // The md overlay's own X closes it back down.
    await click(q("button-close-lyrics-md")!);
    await settle();
    for (let i = 0; i < 60 && q("overlay-lyrics-md"); i++) await settle(1);
    assert.equal(q("overlay-lyrics-md"), null, "overlay X closes it");
    assert.equal(
      q("button-lyrics")!.getAttribute("aria-pressed"),
      "false",
      "lyrics button returns to unpressed after closing",
    );
  } finally {
    await teardown();
  }
});
