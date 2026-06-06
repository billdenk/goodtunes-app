// Task #1585 — regression guard for the Apple song-page credits header.
//
// Task #1580 added a per-track credits header (CreditsSongHeader →
// SongCreditHeader in client/src/components/ui/AlbumCreditsSheet.tsx): a
// centered song artwork, a Play/Pause control that toggles just this one song,
// and an "artist · album · date" line whose album name links back to the
// album. The desktop page also flows the role groups into balanced columns
// (multiColumn) ONLY when that header is present. The existing credits tests
// (songCreditsSheet.test.ts, albumCreditsPersonSlide.test.ts) never pass a
// `songHeader`, so the new header + the multiColumn flow have no coverage and
// could silently regress. This guards:
//   • Artwork, title and the artist · album · date line render.
//   • The Play control toggles play ↔ pause via the supplied callback (label +
//     aria-label flip with the controlling `isPlaying` prop).
//   • Tapping the album name fires `onOpenAlbum`.
//   • Album-credits callers (no `songHeader`) still render the legacy
//     eyebrow/title header and DON'T render the song header.
//   • The multiColumn (balanced-columns) layout class is applied only when a
//     `songHeader` is present (desktop page), not on the legacy header.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/songCreditsHeader.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the real modules import under tsx
// without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` starts a module-level setInterval flush loop the first time
// track() fires. It's never cleared, so it would keep the process alive and the
// buffered TAP output would never flush. Capture any interval created during
// the run and clear them in an `after` hook.
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
// framer-motion useReducedMotion → force reduced so slide animations resolve
// to a short fade instead of a 420-stiffness spring that never settles.
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
// Profile content may auto-scroll via element.scrollTo, which jsdom lacks.
(window.HTMLElement.prototype as any).scrollTo = () => {};
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real modules AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;

const { SongCreditsSheet, AlbumCreditsPage } = await import(
  "@/components/ui/AlbumCreditsSheet"
);

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
const ALBUM_ID = "a1";
const SONG_ID = "s1";
const SONG_TITLE = "Song One";
const ARTWORK = "https://example.com/art.jpg";

// A one-song credits payload (performers + writers) so the credits list
// renders more than one role group — needed to see the multiColumn flow.
const credits = {
  bySongId: {
    [SONG_ID]: {
      performers: [
        {
          id: "c-1",
          personId: "p-1",
          name: "Drummer",
          role: "Drums",
          person: { id: "p-1", name: "Drummer", photoUrl: null },
        },
      ],
      writers: [
        {
          id: "c-2",
          personId: "p-2",
          name: "Writer",
          role: "Songwriter",
          person: { id: "p-2", name: "Writer", photoUrl: null },
        },
      ],
    },
  },
} as any;

const SONG = {
  id: SONG_ID,
  title: SONG_TITLE,
  albumId: ALBUM_ID,
  trackNumber: 1,
  duration: 180,
} as any;

const album = {
  id: ALBUM_ID,
  title: "Test Album",
  artist: "Tester",
  artwork: "",
  year: 2026,
  type: "LP",
  songs: [SONG],
} as any;

function makeSongHeader(over: Record<string, any> = {}) {
  return {
    artwork: ARTWORK,
    songTitle: SONG_TITLE,
    artistName: "Tester",
    albumName: album.title,
    dateLabel: "2026",
    isPlaying: false,
    onTogglePlay: () => {},
    onOpenAlbum: () => {},
    ...over,
  };
}

function makeClient() {
  return new QueryClient({
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
}

async function mount(element: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(QueryClientProvider, { client: makeClient() }, element));
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

  return { q, click, settle, teardown };
}

test("song header: artwork + artist·album·date render and the album name links back to the album", async () => {
  let opened = 0;
  const { q, click, settle, teardown } = await mount(
    h(SongCreditsSheet, {
      songId: SONG_ID,
      songTitle: SONG_TITLE,
      albumId: ALBUM_ID,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      album,
      resolveInstrument: () => undefined,
      resolvePersonContext: () => null,
      songHeader: makeSongHeader({ onOpenAlbum: () => opened++ }),
      onClose: () => {},
    }),
  );
  try {
    await settle();

    // Artwork + title render from the song header (not the legacy eyebrow path).
    const art = q("img-song-credits-art");
    assert.ok(art, "song header renders the centered artwork");
    assert.equal(art!.getAttribute("src"), ARTWORK, "artwork src is the song art");
    assert.ok(
      q("text-song-credits-title")?.textContent?.includes(SONG_TITLE),
      "song header renders the song title",
    );

    // The artist · album · date line carries the album name as a tappable link.
    const albumLink = q("link-song-credits-album");
    assert.ok(albumLink, "the album name renders as a link");
    assert.ok(
      albumLink!.textContent?.includes(album.title),
      "the album link shows the album name",
    );

    // Tapping the album name returns the fan to the album.
    await click(albumLink!);
    assert.equal(opened, 1, "tapping the album name fires onOpenAlbum");
  } finally {
    await teardown();
  }
});

test("song header: the Play control toggles play ↔ pause via the supplied callback", async () => {
  const toggles = { count: 0 };

  // A tiny stateful host that owns `isPlaying` and flips it on each toggle,
  // mirroring AlbumDetail's call site so the button's label/aria reflect the
  // controlling prop after the callback fires.
  function PlayHarness() {
    const [playing, setPlaying] = React.useState(false);
    return h(SongCreditsSheet, {
      songId: SONG_ID,
      songTitle: SONG_TITLE,
      albumId: ALBUM_ID,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      album,
      resolveInstrument: () => undefined,
      resolvePersonContext: () => null,
      songHeader: makeSongHeader({
        isPlaying: playing,
        onTogglePlay: () => {
          toggles.count++;
          setPlaying((p: boolean) => !p);
        },
      }),
      onClose: () => {},
    });
  }

  const { q, click, settle, teardown } = await mount(h(PlayHarness, {}));
  try {
    await settle();

    const playBtn = q("button-song-credits-play");
    assert.ok(playBtn, "song header renders the Play control");
    // Starts paused → reads "Play".
    assert.equal(
      playBtn!.getAttribute("aria-label"),
      "Play song",
      "control starts in the Play state",
    );
    assert.ok(playBtn!.textContent?.includes("Play"), "label reads Play");

    // Tap → callback fires and the controlling prop flips → "Pause".
    await click(playBtn!);
    assert.equal(toggles.count, 1, "tapping Play fires onTogglePlay");
    assert.equal(
      q("button-song-credits-play")!.getAttribute("aria-label"),
      "Pause song",
      "after toggling on, the control reads Pause",
    );
    assert.ok(
      q("button-song-credits-play")!.textContent?.includes("Pause"),
      "label reads Pause",
    );

    // Tap again → toggles back to Play.
    await click(q("button-song-credits-play")!);
    assert.equal(toggles.count, 2, "tapping Pause fires onTogglePlay again");
    assert.equal(
      q("button-song-credits-play")!.getAttribute("aria-label"),
      "Play song",
      "toggling off returns the control to Play",
    );
  } finally {
    await teardown();
  }
});

test("album-credits callers (no songHeader) keep the legacy eyebrow/title header and no song header", async () => {
  const { q, click, settle, teardown } = await mount(
    h(SongCreditsSheet, {
      songId: SONG_ID,
      songTitle: SONG_TITLE,
      albumId: ALBUM_ID,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      album,
      resolveInstrument: () => undefined,
      resolvePersonContext: () => null,
      // No songHeader → legacy header path.
      onClose: () => {},
    }),
  );
  try {
    await settle();

    // The sheet still mounts and shows the credits list.
    assert.ok(q("sheet-credits"), "the credits sheet renders without a songHeader");
    // The legacy title is shown via the eyebrow/title block (testid on the
    // title element is absent on the legacy path → the song-header testids must
    // NOT appear).
    assert.equal(
      q("img-song-credits-art"),
      null,
      "no song artwork on the legacy header",
    );
    assert.equal(
      q("button-song-credits-play"),
      null,
      "no Play control on the legacy header",
    );
    assert.equal(
      q("link-song-credits-album"),
      null,
      "no album link on the legacy header",
    );

    // The multiColumn class is NOT applied without a songHeader.
    assert.equal(
      document.querySelector('[class*="column-count"]'),
      null,
      "legacy header keeps the single-column credits list",
    );
    void click; // (unused here; kept for the shared mount signature)
  } finally {
    await teardown();
  }
});

test("desktop page: the multiColumn balanced-columns layout is applied only with a songHeader", async () => {
  // WITH a songHeader → the page flows role groups into balanced columns.
  const withHeader = await mount(
    h(AlbumCreditsPage, {
      album,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      eyebrow: "Song Credits",
      songHeader: makeSongHeader(),
      onClose: () => {},
    }),
  );
  try {
    await withHeader.settle();
    assert.ok(
      withHeader.q("button-song-credits-play"),
      "desktop page renders the song header when given one",
    );
    assert.ok(
      document.querySelector('[class*="column-count"]'),
      "with a songHeader the desktop page flows credits into balanced columns",
    );
  } finally {
    await withHeader.teardown();
  }

  // WITHOUT a songHeader → the legacy single-column page, no balanced columns.
  const noHeader = await mount(
    h(AlbumCreditsPage, {
      album,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      onClose: () => {},
    }),
  );
  try {
    await noHeader.settle();
    assert.equal(
      noHeader.q("button-song-credits-play"),
      null,
      "legacy album-credits page renders no song header",
    );
    assert.equal(
      document.querySelector('[class*="column-count"]'),
      null,
      "without a songHeader the desktop page stays single-column",
    );
  } finally {
    await noHeader.teardown();
  }
});
