// Task #1394 regression — tapping an artist name on a mobile album page must
// reliably OPEN that artist's page, even for a fan who owns none of the
// artist's releases. The bug: the #1292 owned-album filter empties
// `artistAlbums` for a non-owning fan, and the old "Artist not found" gate
// keyed only off `artistAlbums`/`streamingAll`, so a real artist (e.g. Nick
// Carter, who has GoodTunes releases + a /api/people row) dead-ended on
// "Artist not found" and the fan backed out to the previous album.
//
// This renders the REAL AlbumDetail (mobile) + ArtistDetail in a wouter
// Switch, seeds prod-like Nick Carter data (releases the fan does NOT own + a
// person row), opens the Love Life Tragedy album page, taps the artist link,
// and asserts we land on the artist page (artist name rendered), NOT on
// "Artist not found".

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

register("./assetStubLoader.mjs", import.meta.url);

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
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/album/album-llt",
  pretendToBeVisual: true,
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
g.Audio = window.Audio;

let viewportWidth = 400; // mobile
window.matchMedia = ((query: string) => {
  let matches = false;
  if (/reduce/.test(query)) matches = true;
  else {
    const m = /min-width:\s*(\d+)px/.exec(query);
    if (m) matches = viewportWidth >= Number(m[1]);
    const mx = /max-width:\s*(\d+)px/.exec(query);
    if (mx) matches = viewportWidth <= Number(mx[1]);
  }
  return {
    matches, media: query, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  };
}) as any;
g.matchMedia = window.matchMedia;
Object.defineProperty(window, "innerWidth", { configurable: true, value: viewportWidth });
(window.HTMLElement.prototype as any).scrollTo = () => {};
window.scrollTo = () => {};
g.scrollTo = () => {};
g.IS_REACT_ACT_ENVIRONMENT = true;

// stub fetch so any un-seeded query resolves empty rather than hitting network
g.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" });

const ReactNs: any = await import("react");
const React = ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const wouter: any = await import("wouter");
const { Router, Switch, Route } = wouter;
const { PlayerProvider } = await import("@/context/PlayerContext");
const { AlbumDetail } = await import("./AlbumDetail");
const { ArtistDetail } = await import("./ArtistDetail");

const h = React.createElement;

const ARTIST = "Nick Carter";
function mkAlbum(id: string, title: string) {
  return {
    id, title, artist: ARTIST, artwork: "", year: 2026, type: "LP",
    description: null, isExplicit: false, priceCents: null,
    isGoodTunesRelease: true, isHidden: false,
    songs: [{
      id: `${id}-s1`, albumId: id, title: "Track", trackNumber: 1, duration: 180,
      lyrics: null, audioUrl: null, syncedLyrics: null, isExplicit: false, isPreviewable: true,
    }],
  };
}
const cold = mkAlbum("album-cold", "Cold Night");
const llt = mkAlbum("album-llt", "Love Life Tragedy");
const bonus = mkAlbum("album-bonus", "Love Life Tragedy (Deluxe)");

function makeClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: {
      queryFn: async () => null, retry: false, staleTime: Infinity,
      gcTime: Infinity, refetchOnWindowFocus: false,
    } },
  });
  const customer = { id: "fan1", username: "fan", email: "f@x.co", displayName: "Fan", kind: "customer", signupCompletedAt: "2026-01-01" };
  qc.setQueryData(["/api/me"], customer);
  qc.setQueryData(["/api/albums"], [cold, llt, bonus]);
  qc.setQueryData(["/api/albums", "album-cold"], cold);
  qc.setQueryData(["/api/albums", "album-llt"], llt);
  qc.setQueryData(["/api/albums", "album-bonus"], bonus);
  for (const a of [cold, llt, bonus]) {
    qc.setQueryData(["/api/albums", a.id, "credits"], { bySongId: {}, production: [] });
    qc.setQueryData(["/api/albums", a.id, "videos"], []);
    qc.setQueryData(["/api/albums", a.id, "photos"], []);
  }
  qc.setQueryData(["/api/songs"], []);
  qc.setQueryData(["/api/orders"], []);
  qc.setQueryData(["/api/my-albums"], []);
  qc.setQueryData(["/api/people"], [{ id: "p-nc", name: ARTIST, artistShareSlug: "nickcarter" }]);
  qc.setQueryData(["/api/discography/by-artist-name", { name: ARTIST }], []);
  return qc;
}

test("mobile: album → artist tap lands on artist page (non-owning fan)", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(QueryClientProvider, { client: makeClient() },
        h(PlayerProvider, null,
          h(Router, null,
            h(Switch, null,
              h(Route, { path: "/album/:id" }, h(AlbumDetail)),
              h(Route, { path: "/artist/:slug" }, h(ArtistDetail)),
            ),
          ),
        ),
      ),
    );
  });
  const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  // Poll instead of waiting a fixed number of frames: under the full suite's
  // concurrency the renders/queries settle at variable speed, so a fixed frame
  // count is flaky. waitFor pumps act() until the predicate holds or it times
  // out (then the following assert reports the real failure).
  const waitFor = async (pred: () => boolean, tries = 200) => {
    for (let i = 0; i < tries; i++) {
      if (pred()) return true;
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
    return pred();
  };
  const click = async (el: HTMLElement) => {
    await act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  };

  await waitFor(() => q("text-album-title")?.textContent === "Love Life Tragedy");
  assert.equal(q("text-album-title")?.textContent, "Love Life Tragedy", "on the LLT album page");

  const artistBtn = await waitFor(() => !!q("link-album-artist")) ? q("link-album-artist") : null;
  assert.ok(artistBtn, "artist link renders");
  assert.equal(artistBtn!.textContent, "Nick Carter", "artist link shows the artist name");
  await click(artistBtn!);
  await waitFor(() => window.location.pathname === "/artist/Nick%20Carter" && !!q("text-artist-name"));

  // The artist page must OPEN: correct route + artist name rendered, and we
  // must NOT have fallen through to the "Artist not found" dead end (which is
  // what bounced the non-owning fan back to the previous album).
  assert.equal(window.location.pathname, "/artist/Nick%20Carter", "URL is the artist route");
  assert.equal(q("text-artist-name")?.textContent, "Nick Carter", "artist page rendered the artist name");
  assert.ok(!q("text-album-title"), "left the album page");
  assert.ok(
    !(document.body.textContent || "").includes("Artist not found"),
    "did not dead-end on 'Artist not found'",
  );

  await act(async () => { root.unmount(); });
  container.remove();
});
