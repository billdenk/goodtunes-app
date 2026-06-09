// Task #1574 — integration coverage for the persistent storefront lyrics
// rail (DesktopLyricsRail), the counterpart to the album page's in-flow
// lyrics panel exercised by desktopLyricsPanel.test.ts.
//
// The rail is a fixed, flush-to-the-right/bottom panel that stays open as
// the fan navigates the storefront (Home, Search, Collection, Artist, …)
// whenever PlayerContext.showLyrics is on and a song is playing. It also
// carries an expand affordance — a single button whose click opens the
// full-screen immersive player (setShowPlayer(true)) — revealed on hover
// for pointer devices and on the first tap for touch devices.
//
// desktopLyricsPanel.test.ts only covers the in-flow panel, never the rail,
// so a regression here (rail not mounting, the expand button not opening
// the player, or the touch reveal breaking) would slip through. This test
// renders the REAL DesktopLyricsRail into jsdom with a controlled
// PlayerContext and drives it with synthetic clicks.
//
// Runs under Node's built-in test runner via tsx, same as the rest of the
// suite:
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/components/ui/desktopLyricsRail.test.ts
//
// React components need a DOM, so we stand up jsdom + a few globals BEFORE
// importing anything React.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ── jsdom environment ────────────────────────────────────────────────
// The rail only renders on a storefront route (shouldRenderStorefrontSidebar)
// so boot wouter's global location on "/home", not "/".
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/home",
  pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location; // wouter reads the global location/history
g.history = window.history;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
// wouter v3 patches history.pushState/replaceState to emit via the GLOBAL
// dispatchEvent; jsdom only exposes it on window, so mirror it or wouter
// throws "dispatchEvent is not defined".
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

// matchMedia drives three queries here:
//   - useDesktopShell's "(min-width: 1024px)" → must match so the rail's
//     desktop gate (useLyricsRailOpen) is satisfied.
//   - the rail's "(hover: hover)" → toggled per-test via `hoverMatches` so
//     we can exercise both the pointer (hover) and touch (tap) reveal paths.
//     canHover is captured once at mount, so set this BEFORE rendering.
//   - framer-motion's useReducedMotion "(prefers-reduced-motion: reduce)"
//     inside SyncedLyrics → force reduced so animations resolve instantly.
let hoverMatches = true;
window.matchMedia = ((query: string) => ({
  matches: /min-width:\s*1024px/.test(query)
    ? true
    : /hover:\s*hover/.test(query)
      ? hoverMatches
      : /reduce/.test(query)
        ? true
        : false,
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
// SyncedLyrics (rendered by DesktopLyricsBody) auto-scrolls via
// element.scrollTo, which jsdom doesn't ship.
(window.HTMLElement.prototype as any).scrollTo = () => {};
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real components AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { DesktopLyricsRail } = await import("./DesktopLyricsRail");
const { PlayerContext } = await import("@/context/PlayerContext");

const h = React.createElement;

const LYRIC_TEXT = "First line of the song";

// The song fed through the player context. Carries lyrics so the rail body
// (DesktopLyricsBody → SyncedLyrics) renders, and — more importantly — so
// useLyricsRailOpen's `!!currentSong` gate passes.
const SONG = {
  id: "s1",
  title: "Song one",
  duration: 180,
  lyrics: `${LYRIC_TEXT}\nSecond line of the song\nThird line of the song`,
  syncedLyrics: null,
  writers: ["Tester"],
  album: {
    id: "a1",
    title: "Test Album",
    artist: "Tester",
    artwork: "",
  },
};

// Build a controlled PlayerContext value with showLyrics ON (so the rail is
// open) and a setShowPlayer spy so we can assert the expand button opens the
// full-screen player.
function makeValue(showPlayerCalls: boolean[]) {
  return {
    queue: [SONG],
    currentIndex: 0,
    currentSong: SONG,
    isPlaying: false,
    currentTime: 0,
    duration: 180,
    shuffle: false,
    repeat: "none",
    showLyrics: true,
    showPlayer: false,
    showAddToPlaylist: false,
    showQueue: false,
    autoplay: false,
    favorites: new Set<string>(),
    trulyOwnedAlbumIds: new Set<string>(),
    airPlayAvailable: false,
    airPlaySupported: false,
    previewMode: false,
    volume: 100,
    muted: false,
    playSong: () => {},
    togglePlay: () => {},
    next: () => {},
    prev: () => {},
    seekTo: () => {},
    toggleShuffle: () => {},
    toggleRepeat: () => {},
    setShowLyrics: () => {},
    setShowPlayer: (v: boolean) => showPlayerCalls.push(v),
    setShowAddToPlaylist: () => {},
    setShowQueue: () => {},
    toggleAutoplay: () => {},
    reorderQueue: () => {},
    removeFromQueue: () => {},
    toggleFavorite: () => {},
    isFavorite: () => false,
    addToQueue: () => {},
    playNext: () => {},
    playLast: () => {},
    setPreviewMode: () => {},
    trulyOwnedAlbumIds: new Set<string>(),
    setVolume: () => {},
    toggleMute: () => {},
    showAirPlayPicker: () => {},
  };
}

async function mount(showPlayerCalls: boolean[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        PlayerContext.Provider,
        { value: makeValue(showPlayerCalls) as any },
        h(DesktopLyricsRail),
      ),
    );
  });
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { container, q, click, cleanup };
}

test("rail mounts on a storefront route and its expand button opens the full-screen player", async () => {
  // Pointer device: hover reveals the expand control (group-hover), so it's
  // always clickable.
  hoverMatches = true;
  const showPlayerCalls: boolean[] = [];
  const { q, click, cleanup } = await mount(showPlayerCalls);

  // The rail itself is mounted (showLyrics on + a current song + desktop +
  // a storefront route all satisfied).
  const rail = q("lyrics-rail");
  assert.ok(rail, "the lyrics rail renders on a storefront route");
  // The rail hosts the shared SyncedLyrics surface fed the current lyrics.
  assert.ok(
    rail!.querySelector('[data-testid="lyrics-scroll"]'),
    "the rail hosts the SyncedLyrics surface",
  );

  // The expand affordance is present and, on pointer devices, always
  // clickable (no pointer-events-none gate — it's revealed via group-hover).
  const expand = q("button-expand-lyrics");
  assert.ok(expand, "the rail renders the expand-to-player button");
  assert.ok(
    !expand!.className.includes("pointer-events-none"),
    "on pointer devices the expand button isn't pointer-events gated",
  );

  // Clicking it opens the full-screen immersive player.
  await click(expand!);
  assert.deepEqual(
    showPlayerCalls,
    [true],
    "clicking the expand button calls setShowPlayer(true)",
  );

  await cleanup();
});

test("touch path: the expand button is hidden until the first tap reveals it", async () => {
  // Touch device: no hover, so the button starts hidden + pointer-events
  // gated, and the first tap anywhere in the rail reveals it.
  hoverMatches = false;
  const showPlayerCalls: boolean[] = [];
  const { q, click, cleanup } = await mount(showPlayerCalls);

  const rail = q("lyrics-rail");
  assert.ok(rail, "the lyrics rail renders on a storefront route");

  const expand = q("button-expand-lyrics");
  assert.ok(expand, "the rail renders the expand-to-player button");
  // Before any tap the control is hidden and non-interactive.
  assert.ok(
    expand!.className.includes("opacity-0") &&
      expand!.className.includes("pointer-events-none"),
    "the expand button starts hidden + pointer-events gated on touch",
  );

  // First tap anywhere in the rail reveals the control.
  await click(rail!);
  const revealed = q("button-expand-lyrics");
  assert.ok(
    revealed!.className.includes("opacity-100") &&
      !revealed!.className.includes("pointer-events-none"),
    "the first tap reveals the expand button (opacity-100, interactive)",
  );

  // And the now-revealed control opens the full-screen player.
  await click(revealed!);
  assert.deepEqual(
    showPlayerCalls,
    [true],
    "tapping the revealed expand button calls setShowPlayer(true)",
  );

  await cleanup();
});
