// Task #2530 — automated coverage for the owner-only "Not yet released"
// marker on the album detail header (both the mobile AlbumDetailMobileSurface
// and the desktop DesktopAlbumView).
//
// The badge mirrors the Library card gating: it renders only when the host
// passes `notYetReleased={true}` — derived upstream from the owner-scoped
// /api/my-albums prepping/hidden flags — and disappears once a release is
// public. That gating is pure prop-driven presentation the surfaces own, so a
// refactor could silently drop the badge or leak it. We mount both real
// surfaces with the prop set/unset and assert the badge presence + wording.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/components/ui/albumNotYetReleasedBadge.test.ts

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

const { AlbumDetailMobileSurface } = await import("./AlbumDetailMobileSurface");
const { DesktopAlbumView } = await import("./DesktopAlbumView");

const h = React.createElement;

const baseAlbum = {
  id: "a1",
  title: "Prepping Release",
  artist: "Tester",
  artwork: "",
  year: 2025,
  type: "LP" as const,
  description: null,
  priceCents: 2999,
};

async function mount(Component: any, props: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(Component, {
        album: baseAlbum,
        songs: [],
        videos: [],
        photos: [],
        isOwned: true,
        canPlay: true,
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

for (const [label, Component] of [
  ["mobile", AlbumDetailMobileSurface],
  ["desktop", DesktopAlbumView],
] as const) {
  test(`owner of a not-yet-public release sees the badge (${label})`, async () => {
    const { q, cleanup } = await mount(Component, { notYetReleased: true });
    const badge = q("badge-not-yet-released");
    assert.ok(badge, "the Not yet released badge renders for the owner");
    assert.equal(
      (badge!.textContent ?? "").trim(),
      "Not yet released",
      "badge keeps the Library card wording",
    );
    await cleanup();
  });

  test(`public release (notYetReleased unset) shows no badge (${label})`, async () => {
    const { q, cleanup } = await mount(Component, {});
    assert.equal(
      q("badge-not-yet-released"),
      null,
      "no badge once the release is public / for non-owners",
    );
    await cleanup();
  });
}
