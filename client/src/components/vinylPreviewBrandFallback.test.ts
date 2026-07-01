// Task #2371 — regression guard for the operator/partner Package-designer
// brand fallback. When an art-less album resolves NO single press to credit
// (no earmarked press, no artist/label default, ambiguous multi-press SKUs),
// the Package designer opts into `brandFallback` so the jacket shows the
// grayscale GoodTunes mark instead of the generic vinyl line-art. Fan surfaces
// never set the prop, so the GoodTunes mark must NOT leak onto their covers —
// they keep the line-art placeholder. This pins both directions.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/vinylPreviewBrandFallback.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../pages/jsdomHarness";

register("../pages/assetStubLoader.mjs", import.meta.url);
installTestDom({ url: "http://localhost/admin/albums/a1" });

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const { JacketArtFill } = await import("./VinylPreview");

const h = React.createElement;

async function mount(props: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(JacketArtFill, props));
  });
  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { q, teardown };
}

test("brandFallback renders the grayscale GoodTunes mark when no art/press resolves", async () => {
  const { q, teardown } = await mount({
    artworkUrl: "/album-placeholder.svg",
    brandFallback: true,
  });
  try {
    const logo = q("img-goodtunes-logo-placeholder") as HTMLImageElement | null;
    assert.ok(logo, "GoodTunes brand mark renders");
    assert.match(
      logo!.getAttribute("src") ?? "",
      /goodtunes-logo-color\.png/,
      "uses the canonical color logo asset",
    );
    assert.match(
      logo!.className,
      /grayscale/,
      "the color logo is desaturated to match the muted press-logo family",
    );
    assert.equal(
      q("img-vinyl-jacket-placeholder"),
      null,
      "the generic vinyl line-art is replaced, not stacked",
    );
  } finally {
    await teardown();
  }
});

test("a resolved press placeholder wins over the brand fallback", async () => {
  const { q, teardown } = await mount({
    artworkUrl: "/album-placeholder.svg",
    placeholderLogoUrl: "https://example.com/press-logo.png",
    brandFallback: true,
  });
  try {
    assert.ok(
      q("img-press-logo-placeholder"),
      "the press logo still wins when one resolves",
    );
    assert.equal(
      q("img-goodtunes-logo-placeholder"),
      null,
      "the brand fallback only shows when no press placeholder resolves",
    );
  } finally {
    await teardown();
  }
});

test("fan surfaces (no brandFallback) keep the line-art placeholder", async () => {
  const { q, teardown } = await mount({ artworkUrl: "/album-placeholder.svg" });
  try {
    assert.ok(
      q("img-vinyl-jacket-placeholder"),
      "without brandFallback the generic line-art placeholder renders",
    );
    assert.equal(
      q("img-goodtunes-logo-placeholder"),
      null,
      "the GoodTunes mark must never leak onto a fan cover",
    );
  } finally {
    await teardown();
  }
});

test("real art always wins over the brand fallback", async () => {
  const { q, teardown } = await mount({
    artworkUrl: "https://example.com/real-art.jpg",
    brandFallback: true,
  });
  try {
    assert.equal(
      q("img-goodtunes-logo-placeholder"),
      null,
      "real album art beats every placeholder",
    );
    assert.equal(q("img-vinyl-jacket-placeholder"), null);
  } finally {
    await teardown();
  }
});
