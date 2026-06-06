// App Review 3.1.1 regression guard for the desktop album surface.
//
// The native iOS app (iPad included) now renders the SAME desktop album
// surface (DesktopAlbumView) as a desktop browser so the left rail persists
// when a fan opens an album — see AlbumDetail.tsx. That surface is only
// App-Review-safe because it hides every purchase CTA when buying is
// disabled. On native the host (AlbumDetailDesktop) passes
// `onBuyBundle={undefined}` (buyEnabled=false), and DesktopAlbumView gates
// the Buy pill on `onBuyBundle` being defined. If someone re-gates that pill
// on `album.priceCents` alone (its previous condition), the iOS app would
// ship a visible "Buy Now" CTA — an App Store rejection. This locks that.
//
// We render the REAL DesktopAlbumView (not a mock) for a NOT-OWNED album
// that has a price, once with `onBuyBundle` omitted (native) and once with
// it supplied (web), and assert the Buy pill is absent / present
// respectively.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   npx tsx --test client/src/components/ui/desktopAlbumBuyGate.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the real component tree can be
// imported under tsx without Vite. Must run before any import that pulls
// them in.
register("../../pages/assetStubLoader.mjs", import.meta.url);

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
g.location = window.location; // wouter's <Link> reads the global location/history
g.history = window.history;
g.localStorage = window.localStorage;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
// wouter v3 patches history.pushState to emit a navigation event via the
// GLOBAL dispatchEvent; jsdom only exposes it on window, so mirror it.
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

// Force reduced motion (0ms framer animations) and answer min-width queries
// against a lg viewport so the desktop hero renders.
window.matchMedia = ((query: string) => {
  let matches = false;
  if (/reduce/.test(query)) matches = true;
  else if (/hover:\s*hover/.test(query)) matches = true;
  else {
    const m = /min-width:\s*(\d+)px/.exec(query);
    if (m) matches = 1280 >= Number(m[1]);
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
(window.HTMLElement.prototype as any).scrollTo = () => {};
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { DesktopAlbumView } = await import("./DesktopAlbumView");

const h = React.createElement;

// NOT-OWNED album that carries a price — the only state where a Buy pill
// would render. priceCents is set so the gate's `album.priceCents != null`
// half is satisfied; the `onBuyBundle &&` half is what we're guarding.
const album = {
  id: "a1",
  title: "Test Album",
  artist: "Tester",
  artwork: "",
  year: 2026,
  type: "LP" as const,
  description: null,
  priceCents: 2599,
};
const songs = [
  { id: "s1", title: "Track One", trackNumber: 1, duration: 200 },
];

async function render(props: Record<string, unknown>) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      h(DesktopAlbumView, {
        album,
        songs,
        videos: [],
        photos: [],
        isOwned: false,
        canPlay: true,
        ...props,
      }),
    );
  });
  return {
    host,
    cleanup: () =>
      act(async () => {
        root.unmount();
        host.remove();
      }),
  };
}

test("native (onBuyBundle omitted) renders NO Buy pill — App Review 3.1.1", async () => {
  const { host, cleanup } = await render({});
  assert.equal(
    host.querySelector('[data-testid="button-buy-bundle"]'),
    null,
    "Buy pill must be absent when onBuyBundle is undefined (native)",
  );
  assert.ok(
    !/Buy\s*Now/i.test(host.textContent ?? ""),
    "no 'Buy Now' purchase wording may render on the native surface",
  );
  await cleanup();
});

test("web (onBuyBundle supplied) renders the Buy pill", async () => {
  const { host, cleanup } = await render({ onBuyBundle: () => {} });
  assert.ok(
    host.querySelector('[data-testid="button-buy-bundle"]'),
    "Buy pill must render when onBuyBundle is supplied (web)",
  );
  assert.ok(
    /Buy\s*Now/i.test(host.textContent ?? ""),
    "the web Buy pill shows its 'Buy Now' label at rest",
  );
  await cleanup();
});
