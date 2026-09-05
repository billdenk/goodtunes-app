import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/admin/albums/album-1",
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.KeyboardEvent = window.KeyboardEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.scrollBy = () => {};

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const { AlbumWorkspaceTabs } = await import("./AlbumWorkspaceTabs");
const h = React.createElement;

test("album tablist roves focus and selection with Arrow, Home, and End", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const selections: string[] = [];

  function Harness() {
    const [activeKey, setActiveKey] = React.useState("overview");
    return h(AlbumWorkspaceTabs, {
      tabs: [
        { key: "overview", label: "Overview" },
        { key: "sell", label: "Package" },
        { key: "press", label: "Physical" },
      ],
      activeKey,
      onSelect: (key: string) => {
        selections.push(key);
        setActiveKey(key);
      },
    });
  }

  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(Harness));
  });

  const overview = container.querySelector('[data-testid="tab-overview"]') as HTMLButtonElement;
  const sell = container.querySelector('[data-testid="tab-sell"]') as HTMLButtonElement;
  const press = container.querySelector('[data-testid="tab-press"]') as HTMLButtonElement;

  assert.equal(overview.tabIndex, 0);
  assert.equal(sell.tabIndex, -1);
  overview.focus();

  await act(async () => {
    overview.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  assert.equal(document.activeElement, sell);
  assert.equal(sell.getAttribute("aria-selected"), "true");
  assert.equal(sell.tabIndex, 0);
  assert.equal(overview.tabIndex, -1);

  await act(async () => {
    sell.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
  });
  assert.equal(document.activeElement, press);
  assert.equal(press.getAttribute("aria-selected"), "true");

  await act(async () => {
    press.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
  });
  assert.equal(document.activeElement, overview);
  assert.equal(overview.getAttribute("aria-selected"), "true");
  assert.deepEqual(selections, ["sell", "press", "overview"]);

  await act(async () => {
    root.unmount();
  });
  container.remove();
});