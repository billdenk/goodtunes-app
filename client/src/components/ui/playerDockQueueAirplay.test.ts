// Task #1599 — integration coverage for the desktop dock's two newer
// utility controls: AirPlay and Up Next (queue), added in Task #1597.
//
// desktopLyricsPanel.test.ts already exercises the dock lyrics mic, but the
// AirPlay and Up Next buttons sit right next to it with their own
// render/disable rules and were left uncovered:
//   • button-queue is rendered whenever the host wires `onQueue`, is
//     DISABLED without a selection (mirrors the lyrics mic), and calls
//     `onQueue` on click when a track is seated.
//   • button-airplay is rendered ONLY when BOTH `airPlaySupported` and
//     `onAirPlay` are supplied (iOS Safari / native apps); it stays hidden
//     on Android/desktop where no output target exists. When shown, a click
//     calls `onAirPlay`.
// A regression that dropped a button, mis-gated AirPlay, or stopped
// disabling Up Next without a selection would slip through QA, so we render
// the REAL PlayerDock into jsdom and drive it with synthetic clicks.
//
// Runs under Node's built-in test runner via tsx, same as the rest of the
// suite:
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/components/ui/playerDockQueueAirplay.test.ts
//
// React components need a DOM, so we stand up jsdom + a few globals BEFORE
// importing anything React. We mount the dock at `density="compact"` (the
// fan-facing desktop density) which renders the full transport bar directly
// instead of the admin corner-pill that has to be expanded first.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location;
g.history = window.history;
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
// framer-motion useReducedMotion → force reduced so animations are 0ms.
window.matchMedia = ((query: string) => ({
  matches: /reduce/.test(query),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
})) as any;
g.matchMedia = window.matchMedia;
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

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

// Mount the real dock at fan (compact) density — which never collapses to a
// corner pill, so the transport bar (and its utility cluster) renders
// straight away — with whatever prop overrides a given case needs.
async function mount(props: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(PlayerDock, {
        density: "compact",
        track: TRACK,
        hasSelection: true,
        playing: false,
        progress: 0,
        totalSeconds: 180,
        onTogglePlay: () => {},
        onPrev: () => {},
        onNext: () => {},
        ...props,
      }),
    );
  });
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { q, click, cleanup };
}

test("Up Next button renders, is disabled without a selection, and calls onQueue when active", async () => {
  // No selection: the Up Next button is still rendered (host wired onQueue)
  // but disabled, exactly like the lyrics mic.
  const idleCalls: number[] = [];
  {
    const { q, click, cleanup } = await mount({
      hasSelection: false,
      track: { title: "", subtitle: undefined, playable: false },
      onQueue: () => idleCalls.push(1),
    });
    const queueBtn = q("button-queue");
    assert.ok(queueBtn, "Up Next button renders whenever onQueue is wired");
    assert.equal(
      (queueBtn as HTMLButtonElement).disabled,
      true,
      "Up Next button is disabled without a selection",
    );
    // A click on a disabled button must not fire the handler.
    await click(queueBtn!);
    assert.equal(idleCalls.length, 0, "disabled Up Next never calls onQueue");
    await cleanup();
  }

  // With a selection: clicking the button calls onQueue (the host then flips
  // toggleRail("queue")). Active state mirrors the lyrics mic's aria-pressed.
  const calls: number[] = [];
  const { q, click, cleanup } = await mount({
    hasSelection: true,
    onQueue: () => calls.push(1),
    queueActive: false,
  });
  const queueBtn = q("button-queue");
  assert.ok(queueBtn, "Up Next button renders with a selection");
  assert.equal(
    (queueBtn as HTMLButtonElement).disabled,
    false,
    "Up Next button is enabled with a selection",
  );
  assert.equal(
    queueBtn!.getAttribute("aria-pressed"),
    "false",
    "Up Next button is unpressed while the queue rail is closed",
  );
  await click(queueBtn!);
  assert.equal(calls.length, 1, "clicking Up Next calls onQueue");
  await cleanup();
});

test("Up Next button reflects the active (pressed) state", async () => {
  const { q, cleanup } = await mount({
    hasSelection: true,
    onQueue: () => {},
    queueActive: true,
  });
  const queueBtn = q("button-queue");
  assert.ok(queueBtn, "Up Next button renders");
  assert.equal(
    queueBtn!.getAttribute("aria-pressed"),
    "true",
    "Up Next button is pressed while the queue rail is open",
  );
  await cleanup();
});

test("Up Next button is absent when the host never wires onQueue", async () => {
  const { q, cleanup } = await mount({ hasSelection: true });
  assert.equal(
    q("button-queue"),
    null,
    "no Up Next button without an onQueue handler",
  );
  await cleanup();
});

test("AirPlay button renders only when airPlaySupported AND onAirPlay are both supplied", async () => {
  // Supported + handler → rendered, and a click calls onAirPlay.
  const calls: number[] = [];
  {
    const { q, click, cleanup } = await mount({
      airPlaySupported: true,
      onAirPlay: () => calls.push(1),
    });
    const airplay = q("button-airplay");
    assert.ok(
      airplay,
      "AirPlay button renders when airPlaySupported && onAirPlay",
    );
    await click(airplay!);
    assert.equal(calls.length, 1, "clicking AirPlay calls onAirPlay");
    await cleanup();
  }

  // No output target reported (Android/desktop) → hidden even with a handler.
  {
    const { q, cleanup } = await mount({
      airPlaySupported: false,
      onAirPlay: () => {},
    });
    assert.equal(
      q("button-airplay"),
      null,
      "AirPlay button stays hidden when airPlaySupported is false",
    );
    await cleanup();
  }

  // Supported but no handler wired → hidden (nothing to call).
  {
    const { q, cleanup } = await mount({ airPlaySupported: true });
    assert.equal(
      q("button-airplay"),
      null,
      "AirPlay button stays hidden when onAirPlay is missing",
    );
    await cleanup();
  }
});
