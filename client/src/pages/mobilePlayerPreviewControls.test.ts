// Task #1881 — regression guard for the mobile full-screen player's
// "dead controls stay dimmed during preview" behaviour in
// client/src/pages/Player.tsx.
//
// When an un-owned album plays its 30-second preview, the controls that
// can't meaningfully work on a snippet are dimmed AND disabled, matching
// the desktop dock: the volume slider, the AirPlay button (`button-airplay`),
// and the Up Next / Queue button (`button-queue`). The controls that DO
// work on a preview stay live: Play/Pause, Prev (`button-prev`),
// Next (`button-next`), and the scrubber (which is windowed to the preview,
// never disabled).
//
// None of this is guarded elsewhere, so a future refactor of Player.tsx
// could silently re-activate the dead controls in preview without anyone
// noticing. These tests lock it in by rendering the real Player inside a
// controlled PlayerContext with `previewMode` toggled both ways.
//
// Like the sibling mobile-player tests, Player reads everything from
// usePlayer(), so we render it inside a PlayerContext.Provider. The volume
// slider is gated behind `!isIOS`, so we force isIOS=false via the
// live-binding `@/lib/platform` stub (mobilePlayerLoader.mjs) to exercise it.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/mobilePlayerPreviewControls.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports + import.meta.env AND redirect @/lib/platform
// to the live-binding isIOS stub. Must run before any React import.
register("./mobilePlayerLoader.mjs", import.meta.url);

// Stand up jsdom + the globals React/wouter/framer-motion read, force
// reduced-motion, capture analytics' lazy flush-loop timer, and restore every
// touched global on teardown so this file can't pollute a sibling.
const { window } = installTestDom();

// The scrubber/volume math reads getBoundingClientRect; jsdom returns all
// zeros. Pin a known rail so the components mount without divide-by-zero.
(window.HTMLElement.prototype as any).getBoundingClientRect = function () {
  return {
    left: 0,
    top: 0,
    width: 200,
    height: 28,
    right: 200,
    bottom: 28,
    x: 0,
    y: 0,
    toJSON() {},
  };
};

// jsdom doesn't implement pointer capture; back it with a per-element Set so
// the hand-rolled sliders don't throw on mount.
(window.HTMLElement.prototype as any).setPointerCapture = function (id: number) {
  (this.__caps ??= new Set()).add(id);
};
(window.HTMLElement.prototype as any).releasePointerCapture = function (
  id: number,
) {
  this.__caps?.delete(id);
};
(window.HTMLElement.prototype as any).hasPointerCapture = function (id: number) {
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

// Controlled PlayerContext. `previewMode` is the variable under test;
// `airPlaySupported` is forced on so the AirPlay button actually renders.
function makeHarness(previewMode: boolean) {
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
      airPlayAvailable: true,
      airPlaySupported: true,
      previewMode,
      previewStartSec: 0,
      previewWindowSec: 30,
      volume,
      playSong: () => {},
      togglePlay: () => {},
      next: () => {},
      prev: () => {},
      seekTo: () => {},
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
      setVolume: (level: number) => setVolumeState(level),
    };
    return h(PlayerContext.Provider, { value: value as any }, h(Player));
  };
}

async function mount(previewMode: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(makeHarness(previewMode)));
  });
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { container, q, teardown };
}

// The volume slider's `data-testid` sits on the inner rail; the dimming
// (opacity-40 pointer-events-none) is applied to its wrapping container.
function volumeWrapper(slider: HTMLElement | null): HTMLElement | null {
  return slider?.parentElement ?? null;
}

test("preview mode dims + disables the dead controls (volume, AirPlay, Up Next)", async () => {
  platform.__setTestIsIOS(false);
  const { q, teardown } = await mount(true);
  try {
    // Volume slider renders off-iOS but is dimmed and non-interactive.
    const slider = q("slider-volume");
    assert.ok(slider, "volume slider renders off-iOS");
    const wrap = volumeWrapper(slider);
    assert.ok(
      wrap?.className.includes("opacity-40"),
      "volume slider is dimmed (opacity-40) in preview",
    );
    assert.ok(
      wrap?.className.includes("pointer-events-none"),
      "volume slider is non-interactive (pointer-events-none) in preview",
    );

    // AirPlay is disabled in preview.
    const airplay = q("button-airplay") as HTMLButtonElement | null;
    assert.ok(airplay, "AirPlay button renders when airPlaySupported");
    assert.equal(
      airplay!.disabled,
      true,
      "AirPlay button is disabled in preview",
    );
    assert.ok(
      airplay!.className.includes("text-fan-faint"),
      "AirPlay button is dimmed (text-fan-faint) in preview",
    );

    // Up Next / Queue is disabled in preview.
    const queue = q("button-queue") as HTMLButtonElement | null;
    assert.ok(queue, "Up Next button renders");
    assert.equal(queue!.disabled, true, "Up Next button is disabled in preview");
    assert.ok(
      queue!.className.includes("text-fan-faint"),
      "Up Next button is dimmed (text-fan-faint) in preview",
    );
  } finally {
    await teardown();
  }
});

test("preview mode keeps the working controls live (play/pause, prev, next, scrubber)", async () => {
  platform.__setTestIsIOS(false);
  const { q, teardown } = await mount(true);
  try {
    const play = q("button-play-pause") as HTMLButtonElement | null;
    const prev = q("button-prev") as HTMLButtonElement | null;
    const next = q("button-next") as HTMLButtonElement | null;
    assert.ok(play && prev && next, "transport buttons render");
    assert.notEqual(play!.disabled, true, "Play/Pause stays active in preview");
    assert.notEqual(prev!.disabled, true, "Prev stays active in preview");
    assert.notEqual(next!.disabled, true, "Next stays active in preview");

    // The scrubber is windowed to the preview, never disabled.
    const rail = q("rail-scrubber");
    assert.ok(rail, "scrubber renders in preview");
    assert.ok(
      !rail!.className.includes("pointer-events-none"),
      "scrubber stays interactive in preview (it's windowed, not killed)",
    );
  } finally {
    await teardown();
  }
});

test("owned album (no preview) leaves every control active", async () => {
  platform.__setTestIsIOS(false);
  const { q, teardown } = await mount(false);
  try {
    const slider = q("slider-volume");
    assert.ok(slider, "volume slider renders off-iOS");
    const wrap = volumeWrapper(slider);
    assert.ok(
      !wrap?.className.includes("opacity-40"),
      "volume slider is NOT dimmed when owned",
    );
    assert.ok(
      !wrap?.className.includes("pointer-events-none"),
      "volume slider stays interactive when owned",
    );

    const airplay = q("button-airplay") as HTMLButtonElement | null;
    assert.ok(airplay, "AirPlay button renders");
    assert.notEqual(
      airplay!.disabled,
      true,
      "AirPlay button is active when owned",
    );

    const queue = q("button-queue") as HTMLButtonElement | null;
    assert.ok(queue, "Up Next button renders");
    assert.notEqual(queue!.disabled, true, "Up Next button is active when owned");

    const play = q("button-play-pause") as HTMLButtonElement | null;
    const prev = q("button-prev") as HTMLButtonElement | null;
    const next = q("button-next") as HTMLButtonElement | null;
    assert.ok(play && prev && next, "transport buttons render");
    assert.notEqual(play!.disabled, true, "Play/Pause active when owned");
    assert.notEqual(prev!.disabled, true, "Prev active when owned");
    assert.notEqual(next!.disabled, true, "Next active when owned");

    assert.ok(q("rail-scrubber"), "scrubber renders when owned");
  } finally {
    // Leave isIOS back at the default for any later work in this process.
    platform.__setTestIsIOS(false);
    await teardown();
  }
});
