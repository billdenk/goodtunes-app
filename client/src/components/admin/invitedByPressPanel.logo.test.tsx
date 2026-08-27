// Regression: the InvitedByPressPanel "current invited press" row must route
// its logo through the shared BrandMarkImg decision — a colored / external
// (cross-origin, unsampleable) SVG press logo must NOT be masked white or
// inverted in admin dark mode, while a same-origin dark-mark upload does
// still read white. The old dark-mode branch drew every logo as a white CSS
// mask (WhiteMarkGlyph), recoloring colored brands.
//
//   GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/components/admin/invitedByPressPanel.logo.test.tsx

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
g.matchMedia =
  window.matchMedia ??
  (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
(window as any).matchMedia = g.matchMedia;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { InvitedByPressPanel } = await import("./InvitedByPressPanel");
const { BRAND_MARK_INVERT_FILTER } = await import("./BrandMarkImg");
const { primeDarkMarkCacheForTest } = await import("@/lib/adminAppearance");

const COLORED_EXTERNAL_SVG = "https://cdn.example.com/colored-press-brand.svg";
const DARK_UPLOAD_SVG = "/objects/uploads/dark-press-mark.svg";

function renderPanel(pressLogoUrl: string): HTMLElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: true, queryFn: async () => null } },
  });
  qc.setQueryData(["/api/me/role"], { role: "super_admin", roleScopeId: null });
  qc.setQueryData(["/api/manufacturers"], [
    { id: "press-1", name: "Test Press", logoUrl: pressLogoUrl, identityIconUrl: null },
  ]);
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(InvitedByPressPanel, {
          kind: "people",
          id: "person-1",
          currentPressId: "press-1",
        }),
      ),
    );
  });
  return host;
}

// Dark theme painted for both cases.
window.document.body.classList.add("gt-admin-dark");

test("dark mode: colored/external press logo stays raw — no mask, no invert", () => {
  const host = renderPanel(COLORED_EXTERNAL_SVG);
  const row = host.querySelector('[data-testid="row-current-invited-press"]');
  assert.ok(row, "current invited-press row renders");
  const img = row!.querySelector(`img[src="${COLORED_EXTERNAL_SVG}"]`) as HTMLImageElement;
  assert.ok(img, "logo renders as a real <img>, not a CSS mask glyph");
  assert.equal(img.style.filter, "", "no invert filter on an unverifiable external logo");
  // No white-mask element (the old WhiteMarkGlyph used mask-image styling).
  const masked = Array.from(row!.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.style.maskImage || (el.style as any).webkitMaskImage,
  );
  assert.equal(masked.length, 0, "no CSS mask applied to the logo");
});

test("dark mode: sampled near-black same-origin upload still inverts white", () => {
  primeDarkMarkCacheForTest(DARK_UPLOAD_SVG, true);
  const host = renderPanel(DARK_UPLOAD_SVG);
  const img = host.querySelector(`img[src="${DARK_UPLOAD_SVG}"]`) as HTMLImageElement;
  assert.ok(img, "logo renders");
  assert.equal(img.style.filter, BRAND_MARK_INVERT_FILTER);
});
