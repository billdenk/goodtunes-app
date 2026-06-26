// Task #2278 — automated coverage for the sunset "Sold Out" guard on the
// mobile album surface (AlbumDetailMobileSurface).
//
// The sunset state is pure client-side date logic upstream: once a release
// passes its streamingReleaseDate the host passes `soldOut={true}` and the
// surface must replace the Buy CTA with a disabled "Sold Out" pill — no path
// into checkout. That's exactly the kind of conditional that silently
// regresses in a refactor, and nothing else guards it, so we mount the real
// surface with `soldOut={true}` and assert the pill renders disabled while
// every buy affordance is suppressed (even though onOpenBuy is wired).
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/components/ui/albumDetailMobileSoldOut.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { installTestDom } from "../../pages/jsdomHarness";

// Stand up jsdom + the globals React/framer-motion read, force reduced-motion,
// and restore every touched global on teardown so this file can't pollute a
// sibling when the suite shares a process.
installTestDom();

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { AlbumDetailMobileSurface } = await import("./AlbumDetailMobileSurface");

const h = React.createElement;

const baseAlbum = {
  id: "a1",
  title: "Sunset Sessions",
  artist: "Tester",
  artwork: null,
  year: 2025,
  type: "LP" as const,
  description: null,
  priceCents: 2999,
};

async function mountSurface(props: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(AlbumDetailMobileSurface, {
        album: baseAlbum,
        songs: [],
        // Wire onOpenBuy so the test proves the Buy CTA is suppressed by the
        // sunset guard itself, not merely because no handler was supplied.
        onOpenBuy: () => {},
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

test("sunset release shows a disabled Sold Out pill and no Buy CTA", async () => {
  const { q, cleanup } = await mountSurface({ soldOut: true });

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

  // No buy affordance of any kind while sold out.
  assert.equal(q("button-open-buy-sheet"), null, "no live Buy CTA");
  assert.equal(q("button-get-notified"), null, "no Get Notified CTA");
  assert.equal(q("button-sales-begin"), null, "no Sales Begin pill");

  await cleanup();
});

test("a live (not sold-out) release still surfaces the Buy CTA", async () => {
  // Guard against a regression that suppresses Buy unconditionally: with
  // soldOut=false the same album must show the live Buy CTA and no pill.
  const { q, cleanup } = await mountSurface({ soldOut: false });

  assert.ok(q("button-open-buy-sheet"), "live release renders the Buy CTA");
  assert.equal(q("button-sold-out"), null, "live release shows no Sold Out pill");

  await cleanup();
});
