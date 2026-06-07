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
      nameEditable: false,
      confirmed: true,
      currentName: "Jane Doe",
      defaultName: "Jane Doe",
      paperSize: "letter",
      defaultPaperSize: "letter",
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
      nameEditable: true,
      confirmed: false,
      currentName: "Janr Doe",
      defaultName: "Janr Doe",
      paperSize: "letter",
      defaultPaperSize: "letter",
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
  assert.equal(
    q("text-cert-paper-size")?.textContent,
    "US Letter",
    "shows the paper size in muted text under the name",
  );
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
        nameEditable: true,
        confirmed: false,
        currentName: "Janr Doe",
        defaultName: "Janr Doe",
        paperSize: "letter",
        defaultPaperSize: "letter",
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

test("a paper-size-only change POSTs just the paperSize, leaving the name alone", async () => {
  fetchHandler = (_url, init) => {
    const method = init.method ?? "GET";
    if (method === "POST") {
      return { body: { ok: true, paperSize: "a4" } };
    }
    return {
      body: {
        editable: true,
        nameEditable: true,
        confirmed: false,
        currentName: "Jane Doe",
        defaultName: "Jane Doe",
        paperSize: "letter",
        defaultPaperSize: "letter",
      },
    };
  };
  fetchCalls.length = 0;
  const { q, click, cleanup } = await mount({ orderId: "o-paper" });

  await click(q("button-edit-cert-name")!);
  await settle();
  // Switch the paper size without touching the name input.
  await click(q("button-paper-a4")!);
  await click(q("button-save-cert-name")!);
  await settle();

  const post = fetchCalls.find((c) => c.method === "POST");
  assert.ok(post, "save issues a POST");
  assert.deepEqual(
    post!.body,
    { paperSize: "a4" },
    "POST sends ONLY the paper size — the unchanged name is not re-sent",
  );
  assert.equal(
    q("text-cert-paper-size")?.textContent,
    "A4",
    "the displayed paper size updates to the saved value",
  );
  await cleanup();
});

test("a locked name (nameEditable:false) disables the input but still allows paper size", async () => {
  fetchHandler = (_url, init) => {
    const method = init.method ?? "GET";
    if (method === "POST") {
      return { body: { ok: true, paperSize: "a4" } };
    }
    return {
      body: {
        editable: true,
        nameEditable: false, // one-time courtesy already spent
        confirmed: true,
        currentName: "Jane Doe",
        defaultName: "Jane Doe",
        paperSize: "letter",
        defaultPaperSize: "letter",
      },
    };
  };
  fetchCalls.length = 0;
  const { q, click, cleanup } = await mount({ orderId: "o-locked" });

  await click(q("button-edit-cert-name")!);
  await settle();
  const input = q("input-cert-name") as HTMLInputElement | null;
  assert.ok(input, "the name input still renders");
  assert.equal(input!.disabled, true, "the name input is locked after first save");
  assert.ok(q("text-cert-name-locked"), "shows the locked note");

  // Paper size remains changeable even with the name locked.
  await click(q("button-paper-a4")!);
  await click(q("button-save-cert-name")!);
  await settle();
  const post = fetchCalls.find((c) => c.method === "POST");
  assert.deepEqual(
    post!.body,
    { paperSize: "a4" },
    "a locked-name order can still update its paper size",
  );
  await cleanup();
});

// Task #1612 — the live page-frame preview contract. CertNameConfirmCard
// fires the optional onPaperPreview(paper) on every paper-segment tap so
// the host PDF viewer can overlay a dashed frame at the new proportions
// before the save re-renders the real PDF, and onPaperPreview(null) once
// the edit ends (save or cancel) to clear that preview. None of the tests
// above assert this callback, so a refactor could silently drop the
// preview wiring.
test("onPaperPreview fires the picked size on each segment tap, then null on Save", async () => {
  fetchHandler = (_url, init) => {
    const method = init.method ?? "GET";
    if (method === "POST") {
      return { body: { ok: true, paperSize: "a4" } };
    }
    return {
      body: {
        editable: true,
        nameEditable: true,
        confirmed: false,
        currentName: "Jane Doe",
        defaultName: "Jane Doe",
        paperSize: "letter",
        defaultPaperSize: "letter",
      },
    };
  };
  fetchCalls.length = 0;
  const previewCalls: (string | null)[] = [];
  const { q, click, cleanup } = await mount({
    orderId: "o-preview",
    onPaperPreview: (p: string | null) => previewCalls.push(p),
  });

  await click(q("button-edit-cert-name")!);
  await settle();

  // Each tap immediately previews the just-picked size.
  await click(q("button-paper-a4")!);
  await click(q("button-paper-letter")!);
  await click(q("button-paper-a4")!);
  assert.deepEqual(
    previewCalls,
    ["a4", "letter", "a4"],
    "each paper-segment tap previews the size the fan just picked",
  );

  // Saving (paper changed letter → a4) clears the preview with null.
  await click(q("button-save-cert-name")!);
  await settle();
  assert.deepEqual(
    previewCalls,
    ["a4", "letter", "a4", null],
    "a successful save clears the live preview with null",
  );
  await cleanup();
});

test("onPaperPreview fires null when the fan cancels the edit", async () => {
  fetchHandler = () => ({
    body: {
      editable: true,
      nameEditable: true,
      confirmed: false,
      currentName: "Jane Doe",
      defaultName: "Jane Doe",
      paperSize: "letter",
      defaultPaperSize: "letter",
    },
  });
  fetchCalls.length = 0;
  const previewCalls: (string | null)[] = [];
  const { q, click, cleanup } = await mount({
    orderId: "o-preview-cancel",
    onPaperPreview: (p: string | null) => previewCalls.push(p),
  });

  await click(q("button-edit-cert-name")!);
  await settle();

  await click(q("button-paper-a4")!);
  assert.deepEqual(previewCalls, ["a4"], "the tap previews A4");

  // Cancelling abandons the change and clears the preview with null.
  await click(q("button-cancel-cert-name")!);
  await settle();
  assert.deepEqual(
    previewCalls,
    ["a4", null],
    "cancel clears the live preview with null (no POST issued)",
  );
  assert.equal(
    fetchCalls.find((c) => c.method === "POST"),
    undefined,
    "cancel never persists — no POST",
  );
  await cleanup();
});
