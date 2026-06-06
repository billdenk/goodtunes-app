// Task #1485 — client coverage for the shared CertNameConfirmCard, the
// "name on your GoodDeed® certificate" confirm/edit control used on the
// post-checkout /welcome screen and inside the in-page PDF viewer sheet.
//
// The server endpoints (GET/POST /api/orders/:id/cert/digital-name) are
// covered elsewhere; this exercises the CLIENT contract the two surfaces
// share:
//   - it self-gates and renders NOTHING when the order isn't editable
//     (physical signed-cert orders come back { editable: false }),
//   - it renders the editor when editable,
//   - a successful save updates the displayed name and fires onSaved.
//
// The component only talks to the network through apiRequest, which calls
// the global fetch, so we stub fetch per-test instead of mocking modules.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   npx tsx --test client/src/components/ui/certNameConfirmCard.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
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
// apiRequest's getAuthToken() reads the bare global `localStorage`.
g.localStorage = window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

// ── per-test fetch stub ──────────────────────────────────────────────
// Each test installs a handler that returns the mock payloads for the
// GET (digital-name info) and POST (save) endpoints.
type FetchHandler = (
  url: string,
  init: any,
) => { status?: number; body: any };
let fetchHandler: FetchHandler = () => ({ body: {} });
const fetchCalls: { method: string; url: string; body: any }[] = [];

g.fetch = async (url: string, init: any = {}) => {
  const method = init.method ?? "GET";
  const parsedBody = init.body ? JSON.parse(init.body) : undefined;
  fetchCalls.push({ method, url, body: parsedBody });
  const { status = 200, body } = fetchHandler(url, init);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as any;
};

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const { CertNameConfirmCard } = await import("./CertNameConfirmCard");

const h = React.createElement;

// ── helpers ──────────────────────────────────────────────────────────
async function mount(props: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(CertNameConfirmCard, props));
  });
  // Let the mount-effect fetch (GET) resolve and re-render.
  await settle();
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const type = async (el: HTMLInputElement, value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, value);
      el.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, q, click, type, cleanup };
}

async function settle(frames = 4) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

// ── tests ────────────────────────────────────────────────────────────
test("renders nothing when the order is not editable", async () => {
  fetchHandler = () => ({
    body: {
      editable: false,
      confirmed: true,
      currentName: "Jane Doe",
      defaultName: "Jane Doe",
    },
  });
  const { container, q, cleanup } = await mount({ orderId: "o-physical" });

  assert.equal(
    q("cert-name-editor"),
    null,
    "non-editable (physical signed-cert) orders render no editor",
  );
  assert.equal(
    container.textContent?.trim(),
    "",
    "the component is fully self-gated — nothing on screen",
  );
  await cleanup();
});

test("renders the editor and the current name when editable", async () => {
  fetchHandler = () => ({
    body: {
      editable: true,
      confirmed: false,
      currentName: "Janr Doe",
      defaultName: "Janr Doe",
    },
  });
  const { q, cleanup } = await mount({ orderId: "o-digital" });

  assert.ok(q("cert-name-editor"), "editable orders render the editor");
  assert.equal(
    q("text-cert-name")?.textContent,
    "Janr Doe",
    "shows the current (synthesized) name from the GET",
  );
  assert.ok(q("button-edit-cert-name"), "exposes an Edit affordance");
  await cleanup();
});

test("a successful save updates the displayed name and fires onSaved", async () => {
  fetchHandler = (_url, init) => {
    const method = init.method ?? "GET";
    if (method === "POST") {
      return { body: { confirmedName: "Jane Doe", confirmed: true } };
    }
    return {
      body: {
        editable: true,
        confirmed: false,
        currentName: "Janr Doe",
        defaultName: "Janr Doe",
      },
    };
  };
  fetchCalls.length = 0;
  const savedNames: string[] = [];
  const { q, click, type, cleanup } = await mount({
    orderId: "o-save",
    onSaved: (n: string) => savedNames.push(n),
  });

  // Enter edit mode → the input appears prefilled with the current name.
  await click(q("button-edit-cert-name")!);
  await settle();
  const input = q("input-cert-name") as HTMLInputElement | null;
  assert.ok(input, "Edit reveals the name input");
  assert.equal(input!.value, "Janr Doe", "input is prefilled with current name");

  // Correct the typo and save.
  await type(input!, "Jane Doe");
  await click(q("button-save-cert-name")!);
  await settle();

  // POST went to the digital-name endpoint with the trimmed name.
  const post = fetchCalls.find((c) => c.method === "POST");
  assert.ok(post, "save issues a POST");
  assert.equal(
    post!.url,
    "/api/orders/o-save/cert/digital-name",
    "POST hits the digital-name endpoint for the order",
  );
  assert.deepEqual(post!.body, { name: "Jane Doe" }, "POST sends the new name");

  // Editor returns to the view row showing the server-confirmed name.
  assert.equal(
    q("text-cert-name")?.textContent,
    "Jane Doe",
    "displayed name updates to the saved value",
  );
  assert.deepEqual(savedNames, ["Jane Doe"], "onSaved fired with the saved name");
  await cleanup();
});
