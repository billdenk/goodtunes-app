// Task #1765 — regression guard for the fan player dock staying TUCKED in the
// content channel between the rails (never edge-to-edge over the left rail) at
// every desktop width.
//
// Task #1764 reversed the old "intentional iPad rail/dock overlap" decision:
// the fan (compact-density) dock, when its host supplies the content-channel
// insets (channelLeft/channelRight), must stay in CHANNEL mode at every
// desktop-shell width — even below the COMPACT_BREAKPOINT (1100px) where the
// width-based `compact` flag is true and the dock would OTHERWISE slide
// edge-to-edge (`left-2 right-2`) under the left nav rail. Bill asked us to
// kill that overlap; without a test a future PlayerDock change could silently
// re-introduce it.
//
// The dock derives its layout regime from three things (PlayerDock.tsx ~517):
//   compact     = forceCompact ?? window.innerWidth < 1100
//   edgeToEdge  = compact && forceCompact !== true
//                 && !(isCompactDensity && hasChannelInsets)
//   channelMode = !edgeToEdge && channelLeft != null && channelRight != null
// and the root `player-dock` div picks its positioning classes off those:
//   edgeToEdge  → "left-2 right-2"
//   channelMode → "-translate-x-1/2 transition-[left,width] …" + inline left/width
//   else        → "left-1/2 -translate-x-1/2"
//
// We render the REAL PlayerDock into jsdom at fan (compact) density and read
// the root div's className/style to prove the regime, sweeping the desktop
// widths the task calls out (1024px and ~1080px — both BELOW the 1100
// breakpoint, so `compact` is true and the exception is what keeps it docked)
// with the right lyrics rail both closed (small channelRight) and open (a
// wide channelRight). The companion case proves the admin/default-density
// dock (no channel insets) still goes edge-to-edge at narrow widths and that
// the demo `forceCompact` caller's constrained-centered layout is unchanged.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/components/ui/playerDockChannelMode.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { installTestDom } from "../../pages/jsdomHarness";

// Stand up jsdom + the globals React/framer-motion read, force reduced-motion,
// capture stray timers, and restore every touched global on teardown so this
// file can't pollute a sibling in the shared `tsx --test` process. The
// returned setViewport() repoints window.innerWidth, which the dock reads to
// derive its width-based `compact` flag.
const { window, setViewport } = installTestDom({
  url: "http://localhost/",
  viewportWidth: 1024,
});

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { PlayerDock } = await import("./PlayerDock");

const h = React.createElement;

const TRACK = {
  title: "Song one",
  subtitle: "Tester — Test Album",
  playable: true,
};

const BASE_PROPS = {
  track: TRACK,
  hasSelection: true,
  playing: false,
  progress: 0,
  totalSeconds: 180,
  onTogglePlay: () => {},
  onPrev: () => {},
  onNext: () => {},
};

// Mount the real dock at the given viewport with whatever prop overrides a
// case needs, returning the root `player-dock` div + a re-render/cleanup pair.
async function mount(viewportWidth: number, props: Record<string, unknown>) {
  setViewport(viewportWidth);
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  const render = async (extra: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(h(PlayerDock, { ...BASE_PROPS, ...props, ...extra }));
    });
  };
  await act(async () => {
    root = createRoot(container);
  });
  await render();
  // The full dock carries data-testid="player-dock"; the collapsed corner
  // pill carries player-dock-mini. Default-density mounts start collapsed.
  const dock = () =>
    container.querySelector('[data-testid="player-dock"]') as HTMLElement | null;
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { dock, render, cleanup };
}

// Layout-regime probes off the root div's className/inline style.
const isEdgeToEdge = (el: HTMLElement) =>
  el.className.includes("left-2") && el.className.includes("right-2");
const isChannelMode = (el: HTMLElement) =>
  el.className.includes("transition-[left,width]");
const isCentered = (el: HTMLElement) =>
  el.className.includes("left-1/2") &&
  !el.className.includes("transition-[left,width]");

// The desktop-shell widths the task calls out — both BELOW the 1100px
// COMPACT_BREAKPOINT, so the width-based `compact` flag is TRUE and only the
// compact-density + channel-insets exception keeps the dock off the rail.
const DESKTOP_WIDTHS = [1024, 1080];

// Right lyrics rail CLOSED → small channelRight (just the window margin);
// OPEN → a wide channelRight (rail width + margin). Both must stay docked.
const RAIL_STATES = [
  { name: "lyrics rail closed", channelRight: 24 },
  { name: "lyrics rail open", channelRight: 380 },
];

for (const width of DESKTOP_WIDTHS) {
  for (const rail of RAIL_STATES) {
    test(`fan dock stays in channel mode at ${width}px with the ${rail.name}`, async () => {
      const { dock, cleanup } = await mount(width, {
        density: "compact",
        channelLeft: 96,
        channelRight: rail.channelRight,
      });
      try {
        const el = dock();
        assert.ok(el, "the full fan dock renders at compact density");
        assert.ok(
          isChannelMode(el!),
          `dock is in channel mode at ${width}px (${rail.name})`,
        );
        assert.ok(
          !isEdgeToEdge(el!),
          `dock never goes edge-to-edge over the left rail at ${width}px (${rail.name})`,
        );
        // Channel mode pins an inline left + width so the pill floats in the
        // gutter between the rails (and slides/resizes as the right rail opens).
        // (The width caps to `min(cap, channel)`; jsdom rewrites that to a
        // calc() so we just assert it's present, not its exact text.)
        assert.notEqual(
          el!.style.left,
          "",
          "channel mode sets an inline left offset",
        );
        assert.notEqual(
          el!.style.width,
          "",
          "channel mode caps the pill width to the channel",
        );
      } finally {
        await cleanup();
      }
    });
  }
}

test("the right rail opening narrows the channel-docked pill (slides + resizes, never edge-to-edge)", async () => {
  // Same width, rail closed → open: the pill must shift right (larger left
  // offset) and stay in channel mode the whole time — proving the dock tracks
  // the channel rather than snapping edge-to-edge when the rail appears.
  const { dock, render, cleanup } = await mount(1080, {
    density: "compact",
    channelLeft: 96,
    channelRight: 24,
  });
  try {
    const closed = dock();
    assert.ok(closed && isChannelMode(closed), "starts docked in the channel");
    const closedLeft = parseFloat(closed!.style.left);

    await render({ channelRight: 380 });
    const open = dock();
    assert.ok(open && isChannelMode(open), "stays docked when the rail opens");
    assert.ok(!isEdgeToEdge(open!), "never edge-to-edge when the rail opens");
    const openLeft = parseFloat(open!.style.left);

    assert.ok(
      openLeft < closedLeft,
      "the pill re-centers leftward as the right rail eats channel width",
    );
  } finally {
    await cleanup();
  }
});

test("the admin/default-density dock (no channel insets) still goes edge-to-edge at narrow widths", async () => {
  // Default density starts collapsed to the corner pill; changing the track
  // auto-restores the full dock (PlayerDock's track-change effect), matching
  // how the admin surface surfaces a freshly-seated track.
  const { dock, render, cleanup } = await mount(1024, {
    // density defaults to "default"; no channelLeft/channelRight supplied.
  });
  try {
    assert.equal(dock(), null, "default-density dock starts collapsed");
    await render({
      track: { ...TRACK, title: "Song two" },
    });
    const el = dock();
    assert.ok(el, "changing the track restores the full default-density dock");
    assert.ok(
      isEdgeToEdge(el!),
      "the admin/default dock still goes edge-to-edge below the breakpoint",
    );
    assert.ok(
      !isChannelMode(el!),
      "the admin dock without channel insets is not in channel mode",
    );
  } finally {
    await cleanup();
  }
});

test("the demo forceCompact caller keeps its constrained-centered layout (unchanged)", async () => {
  // forceCompact short-circuits the edge-to-edge branch (forceCompact !== true
  // is false) AND, with no channel insets, the channel branch — leaving the
  // constrained 640px centered pill the demo callers rely on inside a wide
  // iframe. Sweep a narrow + wide width to prove forceCompact ignores width.
  for (const width of [1024, 1280]) {
    const { dock, cleanup } = await mount(width, {
      density: "compact",
      forceCompact: true,
    });
    try {
      const el = dock();
      assert.ok(el, `forceCompact dock renders at ${width}px`);
      assert.ok(
        isCentered(el!),
        `forceCompact stays centered (not edge-to-edge / channel) at ${width}px`,
      );
      assert.ok(
        !isEdgeToEdge(el!),
        `forceCompact is never edge-to-edge at ${width}px`,
      );
      // The constrained branch positions purely with the `left-1/2` class +
      // a width-only wrapper style (no inline left); channel mode (which we
      // must NOT hit here) is the only regime that pins an inline left.
      assert.equal(
        el!.style.left,
        "",
        `forceCompact never pins an inline left (not channel mode) at ${width}px`,
      );
    } finally {
      await cleanup();
    }
  }
});
