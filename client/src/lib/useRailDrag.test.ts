// Task #1706 — automated coverage for the TOUCH path of the fan player's
// shared drag-to-set rail hook (`useRailDrag`).
//
// The iPad seek fix (Task #1705) added a dedicated native-touch path to
// useRailDrag: touchstart is bound NON-passively on the rail node, and
// touchmove/touchend/touchcancel are bound on `window` for the life of one
// gesture, tracked by the touch's `identifier`. That path — the exact thing
// that was dead on the native iPad — had no automated guard; only the
// mouse/pointer path was covered (mobilePlayerScrubber.test.ts). A future
// refactor could silently re-break iPad seeking before anyone notices
// on-device. This file dispatches real `touchstart`/`touchmove`/`touchend`
// events (each carrying a tracked `identifier`) against a minimal rail backed
// by the hook and asserts the three behaviours that matter:
//   1. a plain tap commits the seek once, at the tap position (defer rail);
//   2. a drag previews the fill while moving and commits exactly once on
//      release, never during the move (defer-to-release / scrubber);
//   3. a live rail (volume) commits continuously during the drag.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/lib/useRailDrag.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { installTestDom } from "../pages/jsdomHarness";

// Stand up jsdom + the globals React reads, with per-file teardown.
const { window } = installTestDom();

// useRailDrag maps clientX → ratio via getBoundingClientRect; jsdom returns
// all zeros (width 0 → the hook bails to 0). Pin a known 200px-wide rail at
// left 0 so clientX maps to a predictable ratio: ratio = clientX / 200.
const RAIL_LEFT = 0;
const RAIL_WIDTH = 200;
(window.HTMLElement.prototype as any).getBoundingClientRect = function () {
  return {
    left: RAIL_LEFT,
    top: 0,
    width: RAIL_WIDTH,
    height: 28,
    right: RAIL_LEFT + RAIL_WIDTH,
    bottom: 28,
    x: RAIL_LEFT,
    y: 0,
    toJSON() {},
  };
};

// Import React + the hook AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { useRailDrag } = await import("./useRailDrag");

const h = React.createElement;

// A minimal rail that wires the hook's callback ref and renders the live
// preview/drag state into the DOM so the test can read the fill mid-gesture.
function makeRail(onChange: (ratio: number) => void, live: boolean) {
  return function Rail() {
    const { railRef, previewRatio, dragging } = useRailDrag(onChange, { live });
    return h(
      "div",
      { ref: railRef, "data-testid": "rail" },
      h("span", { "data-testid": "preview" }, String(previewRatio)),
      h("span", { "data-testid": "dragging" }, String(dragging)),
    );
  };
}

async function mount(onChange: (ratio: number) => void, live: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(makeRail(onChange, live)));
  });
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { container, root, q };
}

// Dispatch a native touch event the hook will catch. touchstart is bound on
// the rail node; touchmove/touchend/touchcancel are bound on `window`. Each
// touch carries an `identifier` so the hook only tracks its own gesture.
function touch(
  target: EventTarget,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  clientX: number,
  identifier = 1,
) {
  const ev: any = new window.Event(type, { bubbles: true, cancelable: true });
  const t = { identifier, clientX, clientY: 0 };
  Object.defineProperty(ev, "changedTouches", { value: [t] });
  Object.defineProperty(ev, "touches", {
    value: type === "touchend" || type === "touchcancel" ? [] : [t],
  });
  target.dispatchEvent(ev);
}

test("a plain tap commits the seek once at the tap position (defer rail)", async () => {
  const calls: number[] = [];
  const { container, root, q } = await mount((r) => calls.push(r), false);

  const rail = q("rail");
  assert.ok(rail, "the rail renders and wires the touch listener");

  // Finger down then up at the same spot (140/200 → 0.7), no movement.
  await act(async () => {
    touch(rail!, "touchstart", 140);
  });
  // A defer rail must NOT commit on the press alone.
  assert.equal(calls.length, 0, "no commit on touchstart for a defer rail");

  await act(async () => {
    touch(window, "touchend", 140);
  });

  assert.equal(calls.length, 1, "a tap commits exactly once");
  assert.ok(
    Math.abs(calls[0] - 0.7) < 0.001,
    `the tap commits at the tap position (~0.7), got ${calls[0]}`,
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("a drag previews the fill while moving and commits once on release", async () => {
  const calls: number[] = [];
  const { container, root, q } = await mount((r) => calls.push(r), false);

  const rail = q("rail");
  const preview = () => Number(q("preview")!.textContent);

  // Press near the start, drag right across two moves, then lift at 160px.
  await act(async () => {
    touch(rail!, "touchstart", 40);
  });
  assert.ok(
    Math.abs(preview() - 0.2) < 0.001,
    `preview tracks the press position (0.2), got ${preview()}`,
  );

  await act(async () => {
    touch(window, "touchmove", 120);
  });
  assert.ok(
    Math.abs(preview() - 0.6) < 0.001,
    `preview follows the finger mid-drag (0.6), got ${preview()}`,
  );

  await act(async () => {
    touch(window, "touchmove", 160);
  });
  assert.ok(
    Math.abs(preview() - 0.8) < 0.001,
    `preview keeps following the finger (0.8), got ${preview()}`,
  );

  // The drag is purely visual until release — no commit yet.
  assert.equal(
    calls.length,
    0,
    "onChange must NOT fire during the drag (defer-to-release)",
  );

  await act(async () => {
    touch(window, "touchend", 160);
  });

  assert.equal(calls.length, 1, "onChange fires exactly once, on release");
  assert.ok(
    Math.abs(calls[0] - 0.8) < 0.001,
    `the commit lands at the release point (0.8), got ${calls[0]}`,
  );
  assert.equal(
    q("dragging")!.textContent,
    "false",
    "the gesture ends with dragging cleared",
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("a live rail (volume) commits continuously during the drag", async () => {
  const calls: number[] = [];
  const { container, root, q } = await mount((r) => calls.push(r), true);

  const rail = q("rail");

  // Press at 100px (→ 0.5), then drag to 150px (→ 0.75). A live rail applies
  // on the press AND every move — no defer-to-release.
  await act(async () => {
    touch(rail!, "touchstart", 100);
  });
  await act(async () => {
    touch(window, "touchmove", 150);
  });

  assert.ok(
    calls.length >= 2,
    `a live rail commits during the drag, got ${calls.length} call(s)`,
  );
  assert.ok(
    Math.abs(calls[0] - 0.5) < 0.001,
    `the press commits live at 0.5, got ${calls[0]}`,
  );
  assert.ok(
    Math.abs(calls[calls.length - 1] - 0.75) < 0.001,
    `the move commits live at 0.75, got ${calls[calls.length - 1]}`,
  );

  await act(async () => {
    touch(window, "touchend", 150);
  });

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test("a second finger can't hijack an in-flight gesture", async () => {
  const calls: number[] = [];
  const { container, root, q } = await mount((r) => calls.push(r), false);

  const rail = q("rail");

  // Finger #1 starts the gesture at 40px.
  await act(async () => {
    touch(rail!, "touchstart", 40, 1);
  });
  // Finger #2 lands on the rail mid-gesture — it must be ignored.
  await act(async () => {
    touch(rail!, "touchstart", 200, 2);
  });
  // A move from the SECOND finger's id must not move the preview/commit.
  await act(async () => {
    touch(window, "touchmove", 200, 2);
  });
  assert.equal(
    Number(q("preview")!.textContent),
    0.2,
    "the foreign touch id is ignored mid-gesture",
  );

  // Finger #1 releases at 80px → the one and only commit, at 0.4.
  await act(async () => {
    touch(window, "touchend", 80, 1);
  });
  assert.equal(calls.length, 1, "only the tracked finger commits");
  assert.ok(
    Math.abs(calls[0] - 0.4) < 0.001,
    `the commit follows the tracked finger (0.4), got ${calls[0]}`,
  );

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
