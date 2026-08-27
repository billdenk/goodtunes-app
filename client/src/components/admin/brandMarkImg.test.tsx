// BrandMarkImg contract tests — the shared dark-mode treatment for partner
// logos on admin surfaces (Task: white partner logos in admin dark mode).
//
// The contract: the white invert filter applies ONLY when (a) the admin dark
// theme is painted AND (b) the image is known/assumed to be a near-black
// monochrome mark. Colored logos must stay raw, and cross-origin URLs — which
// can never be pixel-sampled (CORS taints the canvas) — must NEVER invert on
// an extension guess. Same-origin SVG uploads are the one allowed assumption.
//
//   GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/components/admin/brandMarkImg.test.tsx

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

register("../../pages/assetStubLoader.mjs", import.meta.url);
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/admin",
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location;
g.localStorage = window.localStorage;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.Image = window.Image;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrandMarkImg, BRAND_MARK_INVERT_FILTER } = await import("./BrandMarkImg");
const { darkMarkFallback, primeDarkMarkCacheForTest } = await import("@/lib/adminAppearance");

const DARK_CLASS = "gt-admin-dark";

function renderImg(src: string): HTMLImageElement {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(React.createElement(BrandMarkImg, { src, alt: "" }));
  });
  const img = host.querySelector("img");
  assert.ok(img, "renders an <img>");
  return img as HTMLImageElement;
}

function setDark(on: boolean) {
  act(() => {
    window.document.body.classList.toggle(DARK_CLASS, on);
    // applyAdminAppearance would notify listeners; flip the class directly and
    // re-render via a fresh mount instead (each test mounts after setting it).
  });
}

// ── darkMarkFallback: the no-sample verdict ──────────────────────────
test("fallback: same-origin SVG upload is assumed a dark mark", () => {
  assert.equal(darkMarkFallback("/objects/uploads/mark.svg"), true);
  assert.equal(darkMarkFallback("http://localhost/objects/uploads/mark.svg"), true);
});

test("fallback: cross-origin SVG must NOT invert on a guess", () => {
  assert.equal(darkMarkFallback("https://cdn.example.com/brand.svg"), false);
  assert.equal(darkMarkFallback("//cdn.example.com/brand.svg"), false);
});

test("fallback: rasters never invert without a real sample", () => {
  assert.equal(darkMarkFallback("/objects/uploads/logo.png"), false);
  assert.equal(darkMarkFallback("https://www.google.com/s2/favicons?sz=128&domain=x.com"), false);
});

// ── BrandMarkImg rendering ───────────────────────────────────────────
test("dark mode + sampled near-black mark → white invert filter", () => {
  setDark(true);
  primeDarkMarkCacheForTest("/objects/uploads/near-black.png", true);
  const img = renderImg("/objects/uploads/near-black.png");
  assert.equal(img.style.filter, BRAND_MARK_INVERT_FILTER);
});

test("dark mode + sampled colored logo → no filter", () => {
  setDark(true);
  primeDarkMarkCacheForTest("/objects/uploads/colored.png", false);
  const img = renderImg("/objects/uploads/colored.png");
  assert.equal(img.style.filter, "");
});

test("dark mode + external SVG that can't be sampled → no filter", () => {
  setDark(true);
  const img = renderImg("https://cdn.example.com/colored-brand.svg");
  assert.equal(img.style.filter, "");
});

test("dark mode + same-origin SVG upload (unsampled) → invert", () => {
  setDark(true);
  const img = renderImg("/objects/uploads/press-mark.svg");
  assert.equal(img.style.filter, BRAND_MARK_INVERT_FILTER);
});

test("light mode → never a filter, even for a known dark mark", () => {
  setDark(false);
  primeDarkMarkCacheForTest("/objects/uploads/near-black-2.png", true);
  const img = renderImg("/objects/uploads/near-black-2.png");
  assert.equal(img.style.filter, "");
});
