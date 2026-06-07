// Integration coverage for the MOBILE Now Playing lyrics view — the
// counterpart to client/src/components/ui/desktopLyricsPanel.test.ts.
//
// Both surfaces render the SAME shared SyncedLyrics engine
// (client/src/components/ui/SyncedLyrics.tsx), so a regression in one
// could silently affect the other. The desktop test exercises the dock
// button → side-panel wiring; this one exercises the mobile Player's
// bottom "Lyrics" button → full-screen lyrics overlay wiring.
//
// Unlike the desktop components (driven by props), the mobile Player
// (client/src/pages/Player.tsx) reads everything from usePlayer(). We
// mirror the desktop harness's "stateful host flips a single showLyrics
// flag the component reads" approach by supplying a controlled
// PlayerContext value: setShowLyrics flips the flag, the bottom button
// raises it, the overlay's X clears it, and the overlay hosts the shared
// SyncedLyrics fed the current song's lyrics.
//
// Runs under Node's built-in test runner via tsx, same as the rest of the
// suite:
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/playerLyricsPanel.test.ts
//
// React components need a DOM, so we stand up jsdom + a few globals BEFORE
// importing anything React. framer-motion's useReducedMotion reads
// matchMedia; we force "reduce" so the player's menu enter/exit animations
// resolve instantly and assertions aren't racing a spring.

import test from "node:test";
import assert from "node:assert/strict";
import { installTestDom } from "./jsdomHarness";

// Player → musicData imports binary image assets; tsconfig.test.json maps
// "@assets/*" to a string stub so tsx can load the component graph.

// Stand up jsdom + the globals React/framer-motion/SyncedLyrics read, force
// reduced-motion so the player's menu animations resolve at 0ms, capture
// analytics' lazy flush-loop timer, and restore every touched global on
// teardown so this file can't pollute a sibling when the suite shares a
// process.
const { window } = installTestDom();

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { Player } = await import("./Player");
const { PlayerContext } = await import("@/context/PlayerContext");

const h = React.createElement;

const LYRIC_TEXT = "First line of the song";

// The song fed through the player context. Carries lyrics so the bottom
// "Lyrics" button is enabled and the overlay can render SyncedLyrics.
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

// Stateful host mirroring the real PlayerContext: one `showLyrics` flag
// drives the overlay; the bottom Lyrics button raises it (setShowLyrics),
// the overlay's X clears it. Everything else is a no-op stub so the Player
// renders without the real audio/query/HLS machinery.
function Harness() {
  const [showLyrics, setShowLyrics] = React.useState(false);

  const value = {
    queue: [SONG],
    currentIndex: 0,
    currentSong: SONG,
    isPlaying: false,
    currentTime: 0,
    duration: 180,
    shuffle: false,
    repeat: "none",
    showLyrics,
    showPlayer: true,
    showAddToPlaylist: false,
    showQueue: false,
    autoplay: false,
    favorites: new Set<string>(),
    airPlayAvailable: false,
    airPlaySupported: false,
    previewMode: false,
    playSong: () => {},
    togglePlay: () => {},
    next: () => {},
    prev: () => {},
    seekTo: () => {},
    toggleShuffle: () => {},
    toggleRepeat: () => {},
    setShowLyrics: (v: boolean) => setShowLyrics(v),
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
  };

  return h(PlayerContext.Provider, { value: value as any }, h(Player));
}

test("mobile player lyrics overlay opens from the Lyrics button and closes via its X", async () => {
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

  // Closed state: the bottom Lyrics button is mounted, no overlay yet.
  const lyricsBtn = q("button-lyrics");
  assert.ok(lyricsBtn, "the Now Playing surface renders the Lyrics button");
  assert.equal(
    q("lyrics-scroll"),
    null,
    "no lyrics overlay before tapping Lyrics",
  );

  // Tap the Lyrics button → overlay opens hosting the shared SyncedLyrics.
  await click(lyricsBtn!);
  await settle();
  const scroll = q("lyrics-scroll");
  assert.ok(scroll, "tapping Lyrics opens the overlay with SyncedLyrics");
  assert.ok(
    scroll!.textContent?.includes(LYRIC_TEXT),
    "the overlay shows the current song's lyrics",
  );
  // The overlay's transport controls render too (sanity: it's the real
  // full-screen surface, not just a bare lyric column).
  assert.ok(q("lyrics-controls"), "the lyrics overlay renders its controls");

  // Close via the overlay's X → overlay unmounts.
  await click(q("button-close-lyrics")!);
  await settle();
  assert.equal(
    await waitForGone("lyrics-scroll"),
    null,
    "the X closes the lyrics overlay",
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("lyrics overlay: a swipe-down on the HEADER dismisses, a drag on the lyric column does NOT (manual scroll coexists)", async () => {
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

  // The swipe handler reads e.touches[0].clientY (React synthetic on the
  // header) and ev.touches[0].clientY (native window touchmove/touchend).
  // jsdom has no TouchEvent, so dispatch a bubbling Event carrying a
  // hand-built `touches` array. touchstart goes on the element React listens
  // through; move/end go on window where the handler binds them.
  const touch = (target: any, type: string, clientY: number) => {
    const ev: any = new window.Event(type, { bubbles: true, cancelable: true });
    ev.touches = [{ clientY }];
    target.dispatchEvent(ev);
  };

  // ---- First: a downward drag that STARTS on the lyric column must NOT
  // dismiss (that region is owned by SyncedLyrics' manual scroll). ----
  await click(q("button-lyrics")!);
  await settle();
  assert.ok(q("lyrics-scroll"), "overlay open before the column-drag check");

  await act(async () => {
    touch(q("lyrics-scroll"), "touchstart", 120);
    touch(window, "touchmove", 260); // dy = 140, well past the 80px threshold
    touch(window, "touchend", 260);
  });
  await settle();
  assert.ok(
    q("lyrics-scroll"),
    "a drag on the lyric column does NOT close the overlay — scrolling is safe",
  );

  // ---- Then: the same downward swipe on the HEADER bar dismisses. ----
  const header = q("lyrics-header");
  assert.ok(header, "the lyrics overlay renders its header swipe zone");
  await act(async () => {
    touch(header!, "touchstart", 100);
    touch(window, "touchmove", 220); // dy = 120 > 80 → dismiss
    touch(window, "touchend", 220);
  });
  await settle();
  assert.equal(
    await waitForGone("lyrics-scroll"),
    null,
    "a swipe-down on the header closes the lyrics overlay",
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
