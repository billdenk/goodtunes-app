// Task #1177 — accessibility/structure coverage for the DESKTOP bonus grid.
//
// The desktop album view (DesktopAlbumView.tsx → BonusGrid) renders the same
// shared `BonusPlayBadge` the mobile bonus tile does (covered separately in
// bonusVideoPlayer.test.ts), but had no test. This pins the desktop play-badge
// contract so a refactor of BonusGrid can't silently regress it.
//
// NOTE on scope: unlike the MOBILE `BonusVideoPlayer` (a real tap-to-play
// <button> that mints a signed URL and swaps in a <video>), the desktop
// `BonusGrid` play badge is currently a DECORATIVE overlay — a
// `pointer-events-none` sibling with no click handler and no inline <video>.
// Clicking a desktop bonus tile does nothing today. So this test pins the
// contract that actually exists on desktop:
//   • Unlocked video tile → poster image + play badge over it.
//   • Locked tile → lock badge, NO play badge (nothing presented as playable).
//   • Photo tiles → never carry the (video-only) play badge.
// (See the proposed follow-up to make desktop bonus videos actually playable.)
//
// We render the REAL BonusGrid (exported from DesktopAlbumView.tsx) into
// jsdom, so a regression fails here instead of in QA.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/desktopBonusGrid.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// DesktopAlbumView pulls in sibling UI modules that may import binary assets
// and read import.meta.env; this loader stubs both so tsx can import the
// module graph without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

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
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { BonusGrid } = await import("@/components/ui/DesktopAlbumView");

const h = React.createElement;

const VIDEO_ID = "v1";
const POSTER = "https://cdn.example.com/poster.jpg";
const videoItem = { id: VIDEO_ID, thumb: POSTER, label: "Behind the scenes" };

async function mount(props: {
  kind: "video" | "photo";
  locked: boolean;
  items?: { id: string; thumb: string; label: string }[];
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(BonusGrid, {
        items: props.items ?? [videoItem],
        locked: props.locked,
        kind: props.kind,
      }),
    );
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

test("unlocked desktop video tile: poster shows with the play badge over it", async () => {
  const { container, q, teardown } = await mount({ kind: "video", locked: false });
  try {
    // The tile renders for the video.
    assert.ok(q(`thumb-video-${VIDEO_ID}`), "the video tile renders");

    // The poster image is shown.
    const poster = container.querySelector(
      `img[src="${POSTER}"]`,
    ) as HTMLImageElement | null;
    assert.ok(poster, "unlocked tile shows the poster image");

    // The shared play badge sits over the poster, marking the tile playable.
    assert.ok(
      q(`badge-play-video-${VIDEO_ID}`),
      "unlocked video tile renders the play badge",
    );

    // It is NOT shown as locked.
    assert.equal(
      q(`badge-locked-video-${VIDEO_ID}`),
      null,
      "unlocked tile shows no lock badge",
    );
  } finally {
    await teardown();
  }
});

test("locked desktop video tile: lock badge, no play badge", async () => {
  const { q, teardown } = await mount({ kind: "video", locked: true });
  try {
    assert.ok(
      q(`badge-locked-video-${VIDEO_ID}`),
      "locked tile shows the lock badge",
    );
    assert.equal(
      q(`badge-play-video-${VIDEO_ID}`),
      null,
      "locked tile exposes no play badge",
    );
  } finally {
    await teardown();
  }
});

test("desktop photo tile: never carries the (video-only) play badge", async () => {
  const { q, teardown } = await mount({
    kind: "photo",
    locked: false,
    items: [{ id: VIDEO_ID, thumb: POSTER, label: "A still" }],
  });
  try {
    assert.ok(q(`thumb-photo-${VIDEO_ID}`), "the photo tile renders");
    assert.equal(
      q(`badge-play-photo-${VIDEO_ID}`),
      null,
      "photo tiles never show the play badge",
    );
  } finally {
    await teardown();
  }
});
