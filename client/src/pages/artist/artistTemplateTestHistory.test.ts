// Task #3356 — File-history rows are clickable revisions:
//   • clicking a previous "uploaded" row swaps the viewer's PDF source to
//     the gated file-event route for that event id
//   • clicking the Current row (or the banner return) restores the current
//     art-file route
//   • download rows are NOT clickable (no file of their own)
//   • legacy uploaded rows with no stored file (hasFile=false) render as a
//     disabled, honestly-tooltipped row — never a silent failure
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/artist/artistTemplateTestHistory.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../jsdomHarness";

register("../assetStubLoader.mjs", import.meta.url);
installTestDom({ url: "http://localhost/artist/albums/a1/art-test/jacket" });

const ReactNs: any = await import("react");
const React = ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const { HistoryPanel } = await import("./ArtistTemplateTest");

const h = React.createElement;

const THEME = {
  canvas: "#fff", card: "#fff", soft: "#eee", ink: "#111", subink: "#666",
  faint: "#999", hairline: "#ddd", ready: "#1c8a5b", readyWash: "#eaf5ef",
  chipBorder: "#ddd", hoverCard: "hover:bg-slate-100", headerBg: "#fff",
  blue: "#0071e3", dashed: "#ccc", dot: "#ccc",
};

const ROWS = [
  { id: "ev-current", componentId: "jacket", event: "uploaded", fileName: "art-v3.pdf", dims: null, result: "pass", actorLabel: null, at: "2026-08-20T10:00:00Z", hasFile: true },
  { id: "ev-dl", componentId: "jacket", event: "downloaded", fileName: "art-v3.pdf", dims: null, result: null, actorLabel: "MRP", at: "2026-08-19T10:00:00Z", hasFile: false },
  { id: "ev-old", componentId: "jacket", event: "uploaded", fileName: "art-v2.pdf", dims: null, result: "pass", actorLabel: null, at: "2026-08-18T10:00:00Z", hasFile: true },
  { id: "ev-legacy", componentId: "jacket", event: "uploaded", fileName: "art-v1.pdf", dims: null, result: "pass", actorLabel: null, at: "2026-08-01T10:00:00Z", hasFile: false },
];

// Harness mirroring the page's wiring: selection state drives the viewer's
// fetch path exactly the way ArtistTemplateTest computes it.
function artPath(albumId: string, componentId: string, revisionId: string | null): string {
  return revisionId
    ? `/api/admin/albums/${albumId}/completed-template/file-event/${encodeURIComponent(revisionId)}/file`
    : `/api/admin/albums/${albumId}/completed-template/art-file/${encodeURIComponent(componentId)}`;
}
function Harness() {
  const [revision, setRevision] = React.useState<any>(null);
  return h(
    "div",
    null,
    h("div", { "data-testid": "viewer-src" }, artPath("a1", "jacket", revision?.id ?? null)),
    h(HistoryPanel, {
      t: THEME,
      rows: ROWS,
      onClose: () => {},
      selectedId: revision?.id ?? null,
      onSelect: (row: any) => setRevision(row),
    }),
  );
}

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);
await act(async () => { root.render(h(Harness)); });

const byId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }); };

test("clicking an older uploaded row swaps the viewer source to the revision route", async () => {
  const row = byId("history-row-ev-old");
  assert.ok(row, "older row rendered");
  assert.equal(row!.tagName, "BUTTON", "viewable uploaded row is a button");
  await click(row!);
  assert.equal(
    byId("viewer-src")!.textContent,
    "/api/admin/albums/a1/completed-template/file-event/ev-old/file",
  );
  // Word + icon selection indicator — never color alone.
  assert.match(row!.textContent ?? "", /Viewing/);
});

test("clicking the Current row restores the current art-file source", async () => {
  const current = byId("history-row-ev-current");
  assert.ok(current, "current row rendered");
  assert.equal(current!.tagName, "BUTTON", "current row is clickable");
  await click(current!);
  assert.equal(
    byId("viewer-src")!.textContent,
    "/api/admin/albums/a1/completed-template/art-file/jacket",
  );
});

test("download rows are not clickable — no file of their own", () => {
  const dl = byId("history-row-ev-dl");
  assert.ok(dl, "download row rendered");
  assert.notEqual(dl!.tagName, "BUTTON", "download row must stay inert");
});

test("legacy uploads with no stored file are disabled with an honest tooltip", () => {
  const legacy = byId("history-row-ev-legacy");
  assert.ok(legacy, "legacy row rendered");
  assert.notEqual(legacy!.tagName, "BUTTON", "not clickable without a stored file");
  assert.equal(legacy!.getAttribute("aria-disabled"), "true");
  assert.match(legacy!.getAttribute("title") ?? "", /predates revision viewing/);
});
