// Task #3349 — the Assets-tab vinyl-art BlockCard's tap routing:
//   • an EMPTY tile ("Drop file or tap to upload") opens the OS file picker;
//   • a tile that already shows art (custom upload or album-art inheritance)
//     opens that piece's TEST VIEW — the page copy promises "Tap any piece to
//     open its test view" — and does NOT open the picker;
//   • the explicit footer "Replace" control opens the picker so replacing art
//     doesn't depend on drag-and-drop alone.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/artist/restructure/artistReleaseBlockCard.test.ts
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../../jsdomHarness";

register("../../assetStubLoader.mjs", import.meta.url);
installTestDom({ url: "http://localhost/artist/albums/a1" });

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");
const { BlockCard } = await import("./ArtistRelease");
const { THEMES } = await import("./shared");

const h = React.createElement;
const HREF = "/artist/albums/a1/art-test/cover";

// Spy on the hidden file input's programmatic .click() — that's what "opens
// the OS file picker" means in jsdom.
let pickerOpens = 0;
const InputProto = (window as any).HTMLInputElement.prototype;
const origClick = InputProto.click;
InputProto.click = function (this: any) {
  if (this.type === "file") pickerOpens += 1;
  return origClick.call(this);
};

async function mount(block: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const qc = new RQ.QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        RQ.QueryClientProvider,
        { client: qc },
        h(BlockCard, { block, href: HREF, t: THEMES.light }),
      ),
    );
  });
  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
  };
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { q, click, teardown };
}

test("empty tile click opens the file picker, not the test view", async () => {
  pickerOpens = 0;
  window.history.replaceState(null, "", "/artist/albums/a1");
  const { q, click, teardown } = await mount({
    id: "cover",
    title: "Cover \u00b7 jacket",
    status: "waiting",
    imageUrl: null,
  });
  const target = q("upload-target-cover")!;
  assert.ok(target, "upload target renders");
  assert.equal(target.getAttribute("aria-label"), "Upload Cover \u00b7 jacket art");
  assert.equal(q("button-replace-cover"), null, "no Replace control on an empty tile");
  await click(target);
  assert.equal(pickerOpens, 1, "picker opened once");
  assert.equal(window.location.pathname, "/artist/albums/a1", "no navigation");
  await teardown();
});

test("filled tile click navigates to the test view, no file dialog", async () => {
  pickerOpens = 0;
  window.history.replaceState(null, "", "/artist/albums/a1");
  const { q, click, teardown } = await mount({
    id: "cover",
    title: "Cover \u00b7 jacket",
    status: "custom",
    imageUrl: "/objects/uploads/art.png",
  });
  const target = q("upload-target-cover")!;
  assert.equal(
    target.getAttribute("aria-label"),
    "Open Cover \u00b7 jacket test view",
  );
  await click(target);
  assert.equal(pickerOpens, 0, "no file dialog");
  assert.equal(window.location.pathname, HREF, "navigated to the test view");
  await teardown();
});

test("album-art-inherited tile (image present) also opens the test view", async () => {
  pickerOpens = 0;
  window.history.replaceState(null, "", "/artist/albums/a1");
  const { q, click, teardown } = await mount({
    id: "center_labels",
    title: "Center labels",
    status: "album",
    imageUrl: "/objects/uploads/album-art.png",
  });
  await click(q("upload-target-center_labels")!);
  assert.equal(pickerOpens, 0, "no file dialog");
  assert.equal(window.location.pathname, HREF, "navigated to the test view");
  await teardown();
});

test("Replace control on a filled tile opens the picker without navigating", async () => {
  pickerOpens = 0;
  window.history.replaceState(null, "", "/artist/albums/a1");
  const { q, click, teardown } = await mount({
    id: "cover",
    title: "Cover \u00b7 jacket",
    status: "custom",
    imageUrl: "/objects/uploads/art.png",
  });
  const replace = q("button-replace-cover")!;
  assert.ok(replace, "Replace control renders on a filled tile");
  assert.equal(
    replace.getAttribute("aria-label"),
    "Replace Cover \u00b7 jacket art",
  );
  await click(replace);
  assert.equal(pickerOpens, 1, "picker opened once");
  assert.equal(window.location.pathname, "/artist/albums/a1", "no navigation");
  await teardown();
});

after(() => {
  InputProto.click = origClick;
});
