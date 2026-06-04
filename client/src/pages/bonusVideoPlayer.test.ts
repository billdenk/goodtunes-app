// Task #1168 — accessibility + behavior coverage for the bonus-video tile.
//
// The Apple-style play badge added in Task #1166 (BonusPlayBadge) is the
// only affordance a keyboard or screen-reader user has to start a bonus
// video — the native <video> control is hidden until playback begins. This
// test pins the contract so a future refactor of BonusVideoPlayer can't
// silently regress it:
//   • Unlocked + idle → the poster shows behind a real <button>
//     (button-play-album-bonus-<id>) carrying an accessible label, and the
//     <video> is mounted but hidden.
//   • Tapping the badge mints a signed URL and swaps in the playing
//     <video> (video-album-bonus-<id>), retiring the poster/badge overlay.
//   • Locked tiles expose NO play badge (nothing to tap, nothing for AT to
//     announce as playable).
//
// We render the REAL BonusVideoPlayer (exported from AlbumDetail.tsx) into
// jsdom, so a regression fails here instead of in QA.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/bonusVideoPlayer.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// AlbumDetail → musicData imports binary assets and the page reads
// import.meta.env; this loader stubs both so tsx can import the module
// graph without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// @/lib/analytics lazily arms a module-level setInterval flush loop the
// first time track() fires (it does when we tap play). Left running it
// keeps this shared process alive and the buffered TAP output never
// flushes — capture and clear any interval created during the run.
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
g.localStorage = window.localStorage; // analytics.track() writes here
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
// framer-motion useReducedMotion → force reduced so animations resolve 0ms.
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
// jsdom doesn't implement the media-element methods BonusVideoPlayer calls
// on the <video> ref. Stub them so attach()/startPlayback don't throw.
(window.HTMLMediaElement.prototype as any).load = () => {};
(window.HTMLMediaElement.prototype as any).play = () => Promise.resolve();
(window.HTMLMediaElement.prototype as any).pause = () => {};
(window.HTMLMediaElement.prototype as any).canPlayType = () => "";
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

// A non-HLS URL so attach() takes the plain el.src branch (jsdom has no
// MSE, so Hls.isSupported() is false regardless, but mp4 keeps it simple).
const SIGNED_URL = "https://cdn.example.com/signed/clip.mp4";
const fetchCalls: string[] = [];
g.fetch = async (input: any) => {
  fetchCalls.push(String(input));
  return {
    ok: true,
    status: 200,
    json: async () => ({ url: SIGNED_URL }),
  } as any;
};

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { BonusVideoPlayer } = await import("./AlbumDetail");

const h = React.createElement;

const VIDEO_ID = "v1";
const video = {
  id: VIDEO_ID,
  albumId: "a1",
  title: "Behind the scenes",
  posterUrl: "https://cdn.example.com/poster.jpg",
  position: 0,
  muxPlaybackId: "mux123",
  muxStatus: "ready",
};

async function mount(props: { locked?: boolean }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(BonusVideoPlayer, { video, locked: props.locked }));
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
  return { container, q, click, settle, teardown };
}

test("unlocked bonus tile: idle shows a labelled play badge over the poster, tapping it swaps in the video", async () => {
  const { container, q, click, settle, teardown } = await mount({});
  try {
    // Idle state: a real <button> carries the badge with an accessible
    // label so keyboard/screen-reader users can find and start playback.
    const playBtn = q(`button-play-album-bonus-${VIDEO_ID}`);
    assert.ok(playBtn, "idle tile renders the play badge button");
    assert.equal(playBtn!.tagName, "BUTTON", "the play badge is a real button");
    const label = playBtn!.getAttribute("aria-label");
    assert.ok(
      label && /play/i.test(label) && label.includes(video.title),
      "play badge exposes an accessible label naming the video",
    );

    // The poster is visible behind the badge while idle.
    const poster = container.querySelector(
      `img[src="${video.posterUrl}"]`,
    ) as HTMLImageElement | null;
    assert.ok(poster, "idle tile shows the poster image");

    // The <video> is mounted (hls.js needs the element) but hidden until play.
    const videoEl = q(`video-album-bonus-${VIDEO_ID}`) as HTMLVideoElement | null;
    assert.ok(videoEl, "the <video> element is mounted while idle");
    assert.equal(
      videoEl!.style.display,
      "none",
      "the <video> is hidden until the fan taps play",
    );

    // Tap the badge → mints a signed URL and switches the tile to playing.
    await click(playBtn!);
    await settle();

    assert.ok(
      fetchCalls.some((u) => u.includes(`/api/album-videos/${VIDEO_ID}/playback-url`)),
      "tapping play requests a signed playback URL",
    );
    const playingVideo = q(`video-album-bonus-${VIDEO_ID}`) as HTMLVideoElement | null;
    assert.ok(playingVideo, "the <video> stays mounted after play");
    assert.equal(
      playingVideo!.style.display,
      "block",
      "the <video> becomes visible once playing",
    );
    // The idle poster/badge overlay retires once playback is active.
    assert.equal(
      q(`button-play-album-bonus-${VIDEO_ID}`),
      null,
      "the play badge is gone once the video is playing",
    );
  } finally {
    await teardown();
  }
});

test("locked bonus tile: no play badge for keyboard or screen-reader users", async () => {
  const { q, teardown } = await mount({ locked: true });
  try {
    assert.ok(
      q(`video-album-bonus-locked-${VIDEO_ID}`),
      "locked tile renders the locked surface",
    );
    assert.equal(
      q(`button-play-album-bonus-${VIDEO_ID}`),
      null,
      "locked tile exposes no play badge button",
    );
    assert.equal(
      q(`video-album-bonus-${VIDEO_ID}`),
      null,
      "locked tile mounts no playable <video>",
    );
  } finally {
    await teardown();
  }
});
