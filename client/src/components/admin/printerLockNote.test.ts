// Task #2308 — regression guard for the locked Sell-panel printer note copy.
// The note was trimmed to a single sentence ("You were invited by {press}.")
// and a `.replace(/\.+$/, "")` strips a trailing period off the press name so a
// press whose legal name ends in a period (e.g. "Pressing Business, Inc.")
// doesn't render a double period. There's no automated check guarding this, so
// a future edit could re-introduce the removed "directory unlocks" sentence or
// the double-period bug. This pins both: exactly one sentence, single period.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/printerLockNote.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../../pages/jsdomHarness";

// PrinterAndPressPanel reads no static assets, but its module graph (and
// react-query) read import.meta.env via the loader-rewritten global; register
// the loader before importing the component, then stand up the DOM.
register("../../pages/assetStubLoader.mjs", import.meta.url);
installTestDom({ url: "http://localhost/admin/albums/a1" });

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const { PrinterAndPressPanel } = await import("./SellPanel");

const h = React.createElement;

// A press whose legal name ends in a period — the exact case the trailing-dot
// strip exists for. `locked` is derived from press present + !hasShippedFirst +
// non-"all" press mode, so this minimal payload puts the panel in its locked
// state (single invited chip, lock note visible).
const PRESS = {
  id: "p1",
  name: "Pressing Business, Inc.",
  logoUrl: null,
  coverUrl: null,
  bio: null,
  location: null,
  websiteUrl: null,
  turnaroundDays: null,
  turnaroundWeeksMin: null,
  turnaroundWeeksMax: null,
  specialties: [],
};

const INVITED = {
  press: PRESS,
  hasShippedFirst: false,
  pressMode: "dedicated" as const,
  formatCosts: [],
};

async function mount(invited: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(PrinterAndPressPanel, {
        invited,
        selectedId: "invited",
        onSelectId: () => {},
      }),
    );
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

test("locked printer note is a single sentence with no double period", async () => {
  const { q, teardown } = await mount(INVITED);
  try {
    const note = q("text-printer-lock-note");
    assert.ok(note, "locked panel renders the printer lock note");
    // Exact copy: single sentence, trailing period of the press name stripped
    // so there's only ONE period, and none of the removed "directory unlocks"
    // language.
    assert.equal(
      note!.textContent,
      "You were invited by Pressing Business, Inc.",
    );
    assert.ok(
      !/\.\./.test(note!.textContent ?? ""),
      "no double period when the press name ends in a period",
    );
    assert.ok(
      !/unlock/i.test(note!.textContent ?? ""),
      'the removed "directory unlocks" sentence must not return',
    );
  } finally {
    await teardown();
  }
});

test("unlocked panel (already shipped) does not render the lock note", async () => {
  const { q, teardown } = await mount({ ...INVITED, hasShippedFirst: true });
  try {
    assert.equal(
      q("text-printer-lock-note"),
      null,
      "no lock note once the first order has shipped",
    );
  } finally {
    await teardown();
  }
});
