// Task #1472 — automated coverage for the mobile full-screen player's
// pointer-capture scrubber (MobileScrubber) and volume slider
// (MobileVolume) in client/src/pages/Player.tsx.
//
// These controls were hand-rolled with pointer events + pointer capture
// (NOT `<input type="range">`) so a continuous finger-drag seeks on iOS
// Safari instead of scrolling the page. Two behaviours are easy to break
// in a refactor and have no other guard:
//   1. The scrubber DEFERS the actual seek to pointer-up — onSeek must fire
//      exactly once, with the RELEASED position, never on every move.
//   2. The volume block is gated behind `!isIOS` (iOS makes volume
//      read-only, so the slider would be a dead control) and applies
//      LIVE on drag (no defer).
//
// Like the other mobile-player tests, Player reads everything from
// usePlayer(), so we render it inside a controlled PlayerContext.Provider
// with spy stubs for seekTo / setVolume.
//
// `isIOS` is computed once from navigator.userAgent at module load, so to
// exercise both states from one cached Player import we redirect
// `@/lib/platform` to a live-binding stub (mobilePlayerLoader.mjs) that
// exposes `__setTestIsIOS`.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/mobilePlayerScrubber.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports + import.meta.env AND redirect @/lib/platform
// to the live-binding isIOS stub. Must run before any React import.
register("./mobilePlayerLoader.mjs", import.meta.url);

// Stand up jsdom + the globals React/wouter/framer-motion read, force
// reduced-motion, capture analytics' lazy flush-loop timer, and restore every
// touched global on teardown so this file can't pollute a sibling when the
// suite shares a process. The scrubber-specific prototype stubs below are
// applied AFTER install, against the returned window.
const { window } = installTestDom();

// The scrubber/volume math reads getBoundingClientRect; jsdom returns all
// zeros (width 0 → divide-by-zero). Pin a known 200px-wide rail so
// clientX maps to a predictable ratio: time = (clientX / 200) * duration.
const RAIL_LEFT = 0;
const RAIL_WIDTH = 200;
(window.HTMLElement.prototype as any).getBoundingClientRect = function () {
  return {
    left: RAIL_LEFT,
    top: 0,
    width: RAIL_WIDTH,
    height: 28,
    right: RAIL_LEFT + RAIL_WIDTH,
    bottom: 28,
    x: RAIL_LEFT,
    y: 0,
    toJSON() {},
  };
};

// jsdom doesn't implement pointer capture; the handlers gate moves/up on
// hasPointerCapture, so back it with a per-element Set.
(window.HTMLElement.prototype as any).setPointerCapture = function (id: number) {
  (this.__caps ??= new Set()).add(id);
};
(window.HTMLElement.prototype as any).releasePointerCapture = function (
  id: number,
) {
  this.__caps?.delete(id);
};
(window.HTMLElement.prototype as any).hasPointerCapture = function (
  id: number,
) {
  return !!this.__caps?.has(id);
};

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { Player } = await import("./Player");
const { PlayerContext } = await import("@/context/PlayerContext");
// Comes from the redirected stub (mobilePlayerLoader.mjs).
const platform: any = await import("@/lib/platform");

const h = React.createElement;

const DURATION = 180;

const SONG = {
  id: "s1",
  title: "Song one",
  duration: DURATION,
  lyrics: null,
  syncedLyrics: null,
  writers: ["Tester"],
  album: { id: "a1", title: "Test Album", artist: "Tester", artwork: "" },
};

// Stateful host supplying a controlled PlayerContext. seekTo / setVolume are
// spies; `volume` is real state so the volume fill reflects setVolume calls.
function makeHarness(seekCalls: number[], volumeCalls: number[]) {
  return function Harness() {
    const [volume, setVolumeState] = React.useState(40);
    const value = {
      queue: [SONG],
      currentIndex: 0,
      currentSong: SONG,
      isPlaying: false,
      currentTime: 0,
      duration: DURATION,
      shuffle: false,
      repeat: "none",
      showLyrics: false,
      showPlayer: true,
      showAddToPlaylist: false,
      showQueue: false,
      autoplay: false,
      favorites: new Set<string>(),
      trulyOwnedAlbumIds: new Set<string>(),
      airPlayAvailable: false,
      airPlaySupported: false,
      previewMode: false,
      volume,
      playSong: () => {},
      togglePlay: () => {},
      next: () => {},
      prev: () => {},
      seekTo: (t: number) => seekCalls.push(t),
      toggleShuffle: () => {},
      toggleRepeat: () => {},
      setShowLyrics: () => {},
      setShowPlayer: () => {},
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
      showAirPlayPicker: () => {},
      setVolume: (level: number) => {
        volumeCalls.push(level);
        setVolumeState(level);
      },
    };
    return h(PlayerContext.Provider, { value: value as any }, h(Player));
  };
}

// Dispatch a pointer event React will catch (it listens for the native
// "pointerdown"/"move"/"up" names regardless of event class). MouseEvent
// carries clientX; pointerId is added on top.
function pointer(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  clientX: number,
  pointerId = 1,
) {
  const ev: any = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
  });
  Object.defineProperty(ev, "pointerId", { value: pointerId });
  el.dispatchEvent(ev);
}

async function mount(seekCalls: number[], volumeCalls: number[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(makeHarness(seekCalls, volumeCalls)));
  });
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { container, root, q };
}

test("scrubber defers the seek to pointer-up and fires once with the released position", async () => {
  platform.__setTestIsIOS(false);
  const seekCalls: number[] = [];
  const volumeCalls: number[] = [];
  const { container, root, q } = await mount(seekCalls, volumeCalls);

  const rail = q("rail-scrubber");
  assert.ok(rail, "the Now Playing surface renders the pointer scrubber");

  // Press near the start, rub right across two moves, then lift at 160px.
  await act(async () => {
    pointer(rail!, "pointerdown", 40);
  });
  await act(async () => {
    pointer(rail!, "pointermove", 120);
  });
  await act(async () => {
    pointer(rail!, "pointermove", 160);
  });
  // No seek yet — the drag is purely visual until the thumb lifts.
  assert.equal(
    seekCalls.length,
    0,
    "onSeek must NOT fire during the drag (defer-to-release)",
  );

  await act(async () => {
    pointer(rail!, "pointerup", 160);
  });

  // Exactly one seek, at the RELEASED position: 160/200 * 180 = 144s.
  assert.equal(seekCalls.length, 1, "onSeek fires exactly once, on release");
  assert.ok(
    Math.abs(seekCalls[0] - 144) < 0.5,
    `seek lands at the release point (~144s), got ${seekCalls[0]}`,
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("volume block is present off-iOS and dragging it calls setVolume live", async () => {
  platform.__setTestIsIOS(false);
  const seekCalls: number[] = [];
  const volumeCalls: number[] = [];
  const { container, root, q } = await mount(seekCalls, volumeCalls);

  const slider = q("slider-volume");
  assert.ok(slider, "volume slider renders when isIOS is false");

  // Press at 100px (→ 50%), then drag to 150px (→ 75%). Volume applies live,
  // so setVolume fires on BOTH the down and the move (no defer-to-release).
  await act(async () => {
    pointer(slider!, "pointerdown", 100);
  });
  await act(async () => {
    pointer(slider!, "pointermove", 150);
  });

  assert.ok(
    volumeCalls.length >= 2,
    `setVolume applies live during the drag, got ${volumeCalls.length} call(s)`,
  );
  assert.equal(volumeCalls[0], 50, "press at 100/200px sets volume to 50");
  assert.equal(
    volumeCalls[volumeCalls.length - 1],
    75,
    "dragging to 150/200px sets volume to 75 live",
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("volume block is absent on iOS (read-only volume → no dead control)", async () => {
  platform.__setTestIsIOS(true);
  const seekCalls: number[] = [];
  const volumeCalls: number[] = [];
  const { container, root, q } = await mount(seekCalls, volumeCalls);

  assert.equal(
    q("slider-volume"),
    null,
    "volume slider is gated out when isIOS is true",
  );
  // The scrubber is platform-independent and still renders.
  assert.ok(q("rail-scrubber"), "the scrubber still renders on iOS");

  await act(async () => {
    root.unmount();
  });
  container.remove();
  // Leave isIOS back at the default for any later work in this process.
  platform.__setTestIsIOS(false);
});
