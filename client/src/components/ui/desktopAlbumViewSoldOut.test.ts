// Task #2278 — automated coverage for the sunset "Sold Out" guard on the
// desktop album surface (DesktopAlbumView), non-lockedPreview branch.
//
// The not-owned preview/buy transport row replaces its Buy pill with a
// disabled "Sold Out" pill once the host passes `soldOut={true}` (past the
// release's streamingReleaseDate). This is the desktop counterpart to the
// mobile surface guard and shares the same regression risk: pure date logic
// upstream, no other test confirming the pill renders and the buy path is
// removed. We mount the real view with isOwned=false, lockedPreview unset
// (the default), and soldOut=true, then assert the disabled pill is present
// and no Buy CTA renders despite onBuyBundle being wired.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/components/ui/desktopAlbumViewSoldOut.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { installTestDom } from "../../pages/jsdomHarness";

installTestDom();

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { DesktopAlbumView } = await import("./DesktopAlbumView");

const h = React.createElement;

const baseAlbum = {
  id: "a1",
  title: "Sunset Sessions",
  artist: "Tester",
  artwork: "",
  year: 2025,
  type: "LP" as const,
  description: null,
  priceCents: 2999,
};

async function mountView(props: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(DesktopAlbumView, {
        album: baseAlbum,
        songs: [],
        videos: [],
        photos: [],
        isOwned: false,
        canPlay: true,
        // lockedPreview omitted → the normal preview/buy transport row.
        // onBuyBundle wired so the test proves the sunset guard removes the
        // Buy pill, not the absence of a handler.
        onBuyBundle: () => {},
        ...props,
      }),
    );
  });
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { q, cleanup };
}

test("sunset release shows a disabled Sold Out pill and no Buy CTA (desktop)", async () => {
  const { q, cleanup } = await mountView({ soldOut: true });

  const pill = q("button-sold-out");
  assert.ok(pill, "sunset release renders the Sold Out pill");
  assert.equal(
    (pill as HTMLButtonElement).disabled,
    true,
    "the Sold Out pill is a disabled button (no path into checkout)",
  );
  assert.equal(
    pill!.getAttribute("aria-disabled"),
    "true",
    "the Sold Out pill is marked aria-disabled",
  );

  assert.equal(q("button-buy-bundle"), null, "no Buy pill while sold out");
  assert.equal(q("button-sales-begin"), null, "no Sales Begin pill");

  await cleanup();
});

test("a live (not sold-out) release still surfaces the Buy pill (desktop)", async () => {
  const { q, cleanup } = await mountView({ soldOut: false });

  assert.ok(q("button-buy-bundle"), "live release renders the Buy pill");
  assert.equal(q("button-sold-out"), null, "live release shows no Sold Out pill");

  await cleanup();
});
