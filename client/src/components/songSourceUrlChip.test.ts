// Task #3260 — operator-only "Imported from" provenance chip for tracks.
//
// Server routes strip songs.sourceUrl from fan reads, partner reads, AND
// partner mutation responses (covered in server/externalMirror.routes.db.
// test.ts). This locks the CLIENT half of the contract:
//   - sourceUrl present  → the chip renders a labeled external link with the
//     hostname as text and the stable per-song testid,
//   - sourceUrl absent (fan/partner payloads never carry it) → NOTHING
//     renders — a stripped payload cannot leak a provenance affordance.
//
//   npx tsx --test client/src/components/songSourceUrlChip.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { SongSourceUrlChip } = await import("./SongSourceUrlChip");

function render(el: React.ReactElement): HTMLElement {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return host;
}

test("renders an Imported-from link with hostname text when sourceUrl is present", () => {
  const host = render(
    React.createElement(SongSourceUrlChip, {
      songId: "song-1",
      sourceUrl: "https://www.dropbox.com/scl/fi/abc/master.wav?dl=1",
    }),
  );
  const link = host.querySelector('[data-testid="link-song-source-url-song-1"]') as HTMLAnchorElement;
  assert.ok(link, "chip link renders");
  assert.equal(link.textContent, "dropbox.com", "hostname shown, www. stripped");
  assert.equal(link.getAttribute("href"), "https://www.dropbox.com/scl/fi/abc/master.wav?dl=1");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  assert.match(host.textContent || "", /Imported from/i);
});

test("renders NOTHING when sourceUrl is absent (server-stripped payloads)", () => {
  for (const sourceUrl of [null, undefined, ""] as const) {
    const host = render(
      React.createElement(SongSourceUrlChip, { songId: "song-2", sourceUrl }),
    );
    assert.equal(host.innerHTML, "", `no chip for sourceUrl=${String(sourceUrl)}`);
  }
});

test("non-http(s) values render as INERT TEXT, never a clickable href", () => {
  for (const bad of ["not-a-url", "javascript:alert(1)", "data:text/html,x", "ftp://x/y"]) {
    const host = render(
      React.createElement(SongSourceUrlChip, { songId: "song-3", sourceUrl: bad }),
    );
    const el = host.querySelector('[data-testid="link-song-source-url-song-3"]');
    assert.ok(el, `element renders for ${bad}`);
    assert.notEqual(el!.tagName, "A", `${bad} is not an anchor`);
    assert.equal(host.querySelector("a"), null, `no anchor at all for ${bad}`);
    assert.equal(el!.textContent, bad);
  }
});
