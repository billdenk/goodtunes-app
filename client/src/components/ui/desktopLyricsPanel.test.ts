// Task #1099 — integration coverage for the desktop right-side lyrics panel.
//
// Exercises the real wiring contract between the dock lyrics button
// (PlayerDock `onLyrics` / `lyricsActive`) and the slide-in panel
// (DesktopAlbumView `lyricsOpen` / `lyrics` / `onCloseLyrics`) exactly as
// AlbumDetailDesktop hooks them together — a stateful host flips a single
// `showLyrics` flag that both components read. We render the two real
// components into jsdom and drive them with synthetic clicks so a
// regression (button state not reflecting the panel, the panel not hosting
// SyncedLyrics, or the X not closing it) fails here instead of in QA.
//
// Runs under Node's built-in test runner via tsx, same as the rest of the
// suite:
//
//   npx tsx --test client/src/components/ui/desktopLyricsPanel.test.ts
//
// React components need a DOM, so we stand up jsdom + a few globals BEFORE
// importing anything React. framer-motion's useReducedMotion reads
// matchMedia; we force "reduce" so the panel's enter/exit width animation
// resolves instantly and the close assertion isn't racing a spring.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
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
// framer-motion useReducedMotion → force reduced so width animations are 0ms.
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
// SyncedLyrics auto-scrolls via element.scrollTo, which jsdom doesn't ship.
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

const { DesktopAlbumView } = await import("./DesktopAlbumView");
const { PlayerDock } = await import("./PlayerDock");
const { SyncedLyrics } = await import("./SyncedLyrics");

const h = React.createElement;

const LYRIC_TEXT = "First line of the song";

// Stateful host mirroring AlbumDetailDesktop's lyrics wiring: one
// `showLyrics` flag feeds the panel (lyricsOpen) and the dock button
// (lyricsActive); the dock toggles it, the panel X clears it.
function Harness() {
  const [showLyrics, setShowLyrics] = React.useState(false);

  const lyricsBody = h(SyncedLyrics, {
    lyrics: `${LYRIC_TEXT}\nSecond line of the song\nThird line of the song`,
    duration: 180,
    syncedLyrics: null,
    currentTime: 0,
    onSeek: () => {},
    active: showLyrics,
    fontSize: 22,
  });

  return h(
    "div",
    null,
    h(DesktopAlbumView, {
      album: {
        id: "a1",
        title: "Test Album",
        artist: "Tester",
        artwork: "",
        year: 2026,
        type: "LP",
        description: null,
      },
      songs: [],
      videos: [],
      photos: [],
      isOwned: true,
      canPlay: true,
      tab: "music",
      onTabChange: () => {},
      currentSongId: "s1",
      isPlaying: false,
      lyricsOpen: showLyrics,
      lyrics: lyricsBody,
      onCloseLyrics: () => setShowLyrics(false),
    }),
    h(PlayerDock, {
      track: { title: "Song one", subtitle: "Tester — Test Album", playable: true },
      hasSelection: true,
      playing: false,
      progress: 0,
      totalSeconds: 180,
      onTogglePlay: () => {},
      onPrev: () => {},
      onNext: () => {},
      onLyrics: () => setShowLyrics((v: boolean) => !v),
      lyricsActive: showLyrics,
    }),
  );
}

test("desktop lyrics panel toggles from the dock button and closes via its X", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(Harness));
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
  const settle = async (frames = 4) => {
    for (let i = 0; i < frames; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };
  const waitForGone = async (id: string) => {
    for (let i = 0; i < 60 && q(id); i++) await settle(1);
    return q(id);
  };

  // The dock boots collapsed to a corner pill; expand it so the real
  // transport (and the lyrics button) is on screen — same affordance a
  // fan uses.
  const showPlayer = q("button-show-player");
  assert.ok(showPlayer, "collapsed dock exposes a Show player control");
  await click(showPlayer!);

  // Closed state: button reflects "not pressed", no panel mounted.
  const lyricsBtn = q("button-lyrics");
  assert.ok(lyricsBtn, "expanded dock renders the lyrics button");
  assert.equal(
    lyricsBtn!.getAttribute("aria-pressed"),
    "false",
    "lyrics button starts unpressed",
  );
  assert.equal(q("panel-lyrics"), null, "no lyrics panel before opening");

  // Click the dock lyrics button → panel opens.
  await click(lyricsBtn!);
  await settle();
  const panel = q("panel-lyrics");
  assert.ok(panel, "clicking the lyrics button opens the panel");
  assert.equal(
    q("button-lyrics")!.getAttribute("aria-pressed"),
    "true",
    "lyrics button is pressed while the panel is open",
  );
  // Panel hosts the shared SyncedLyrics surface, fed the current lyrics.
  assert.ok(
    panel!.querySelector('[data-testid="lyrics-scroll"]'),
    "panel hosts the SyncedLyrics surface",
  );
  assert.ok(
    panel!.textContent?.includes(LYRIC_TEXT),
    "panel shows the current song's lyrics",
  );

  // Close via the panel's X → panel hides, button returns to unpressed.
  await click(q("button-close-lyrics")!);
  await settle();
  assert.equal(await waitForGone("panel-lyrics"), null, "X closes the panel");
  assert.equal(
    q("button-lyrics")!.getAttribute("aria-pressed"),
    "false",
    "lyrics button returns to unpressed after closing",
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
