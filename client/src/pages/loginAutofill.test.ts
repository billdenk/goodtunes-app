// Regression guard for browser autofill on the login page — both the
// admin shell (admin.goodtunes.music/admin/login) AND the customer (fan)
// shell (my.goodtunes.music/login), which render the same shared login
// form, refs, and native `change` listener.
//
// Two browser families behave differently at submit time:
//
//   Chrome/Edge: the password manager fires a native `change` event (not
//   `input`) when it fills a field, leaving React state empty.  The ref
//   approach captures the real value via ref.current.value, and our native
//   `change` listener syncs it into state so the submit button enables.
//
//   Safari/WebKit: iCloud Keychain visually fills the field but WITHHOLDS
//   the value from scripted .value reads until the user manually interacts
//   with the field.  A Sign In button click is not such an interaction, so
//   ref.current.value returns "" on Safari.  All browsers DO include
//   autofilled values in FormData on submit, so reading `new FormData(form)`
//   is the only reliable cross-browser source.
//
// The fix in handleLogin reads from three sources in priority order:
//   FormData (all browsers, incl. Safari) → ref.value (Chrome) → React state
// whichever carries a non-empty credential wins.
//
// This test exercises four scenarios per shell (admin + customer):
//   1. Value in DOM (no onChange) — Chrome ref path, also covers FormData
//   2. Native `change` event — Chrome sync-state path
//   3. Typed credentials (onChange fires) — happy path regression
//   4. FormData only, ref/.value empty — Safari/WebKit autofill simulation
//
// Runs under Node's built-in runner via tsx:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/loginAutofill.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

register("./assetStubLoader.mjs", import.meta.url);

// Capture and clear any analytics intervals so the process drains cleanly.
const realSetInterval = globalThis.setInterval;
const createdIntervals = new Set<ReturnType<typeof setInterval>>();
(globalThis as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  createdIntervals.add(id);
  return id;
};
after(() => {
  for (const id of createdIntervals) clearInterval(id);
  createdIntervals.clear();
  (globalThis as any).setInterval = realSetInterval;
});

// Vite env shim — the loader rewrites `import.meta.env` to this global.
(globalThis as any).__VITE_ENV__ = {
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
};

// ── jsdom environment ─────────────────────────────────────────────────
// Mount on the admin host path so `useAuthKind` returns "admin" and the
// login form renders in admin mode (no customer OAuth path).
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://admin.localhost/admin/login",
  pretendToBeVisual: true,
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location;
g.history = window.history;
g.localStorage = window.localStorage;
g.sessionStorage = window.sessionStorage;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
g.dispatchEvent = window.dispatchEvent.bind(window);
g.HTMLElement = window.HTMLElement;
g.SVGElement = window.SVGElement;
g.HTMLInputElement = window.HTMLInputElement;
g.Element = window.Element;
g.Node = window.Node;
g.NodeFilter = window.NodeFilter;
g.DocumentFragment = window.DocumentFragment;
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.KeyboardEvent = window.KeyboardEvent;
g.InputEvent = window.InputEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

window.matchMedia = ((query: string) => ({
  matches: /reduce/.test(query),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
})) as any;
g.matchMedia = window.matchMedia;

(window as any).scrollBy = () => {};
(window as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollTo = () => {};
(window.HTMLElement.prototype as any).scrollIntoView = () => {};

g.MutationObserver = window.MutationObserver ?? class {
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
};
window.MutationObserver = g.MutationObserver;

g.ResizeObserver = window.ResizeObserver ?? class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.ResizeObserver = g.ResizeObserver;

if (!window.HTMLElement.prototype.hasPointerCapture) {
  (window.HTMLElement.prototype as any).hasPointerCapture = () => false;
  (window.HTMLElement.prototype as any).setPointerCapture = () => {};
  (window.HTMLElement.prototype as any).releasePointerCapture = () => {};
}

// Copy remaining window-only globals (Radix needs them).
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in g)) {
    try { g[key] = (window as any)[key]; } catch {}
  }
}

g.IS_REACT_ACT_ENVIRONMENT = true;

// ── Captured fetch calls ──────────────────────────────────────────────
// Intercept all fetch so we can assert on the POST body without hitting
// the network. We record every /api/login call as a parsed JSON object.
const loginRequests: Array<{ username: string; password: string; kind: string }> = [];
g.fetch = async (input: string, init?: RequestInit) => {
  const url = typeof input === "string" ? input : (input as Request).url;
  if (url.includes("/api/login")) {
    const body = JSON.parse((init?.body as string) ?? "{}");
    loginRequests.push(body);
    // Return a minimal "requiresEmailCode" response so the login handler
    // doesn't throw — we only care what was sent, not what happens next.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        requiresEmailCode: true,
        email: "a***@example.com",
        kind: "admin",
      }),
    } as any;
  }
  // Any other request (TanStack Query auto-fetches, etc.) — silent 200.
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  } as any;
};

// ── React + Login page ────────────────────────────────────────────────
const ReactNs: any = await import("react");
const React = ReactNs.default?.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;

const { Login } = await import("./Login");

const h = React.createElement;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => ({}),
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
}

async function mount(path: string = "/admin/login") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  window.history.replaceState(null, "", path);
  loginRequests.length = 0;

  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(QueryClientProvider, { client: makeClient() }, h(Login, null)));
  });

  const settle = async (frames = 8) => {
    for (let i = 0; i < frames; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
  };

  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  const teardown = async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    loginRequests.length = 0;
  };

  await settle();
  return { q, settle, teardown };
}

// Both shells render the exact same login form (refs + native `change`
// listener), so the autofill protection must hold identically on each.
// `detectAuthKind` falls back to the pathname on the non-production test
// host: `/admin/login` → admin, `/login` → customer (fan).
const MODES: Array<{ label: string; path: string }> = [
  { label: "admin", path: "/admin/login" },
  { label: "customer", path: "/login" },
];

for (const { label, path } of MODES) {
  // ───────────────────────────────────────────────────────────────────
  // Test 1: autofilled value (no onChange) reaches the login POST body.
  //
  // Chrome autofill sets .value directly and does NOT fire React's
  // onChange (React listens on the `input` event; Chrome fires a native
  // `change` event). The user then presses Enter to submit — even with the
  // button disabled from empty React state, pressing Enter dispatches a
  // `submit` event on the form. The fix reads the ref's current DOM value,
  // so the correct credential is POSTed.
  // ───────────────────────────────────────────────────────────────────
  test(`[${label}] autofill simulation: value written to DOM without onChange is POSTed correctly`, async () => {
    const { q, settle, teardown } = await mount(path);
    try {
      const usernameInput = q("input-login-username") as HTMLInputElement;
      const passwordInput = q("input-login-password") as HTMLInputElement;
      const form = usernameInput?.closest("form") as HTMLFormElement | null;

      assert.ok(usernameInput, "username input must be present");
      assert.ok(passwordInput, "password input must be present");
      assert.ok(form, "login form must be present");

      // Simulate Chrome autofill: write the value into the DOM without
      // firing any React synthetic event. Chrome uses the native value
      // setter and dispatches a `change` event (not `input`), which React's
      // onChange misses entirely. Here we go even stricter — no event at
      // all — to prove the ref-based submit fallback catches it regardless.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!.call(usernameInput, "andrew@gogoods.com");
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!.call(passwordInput, "CorrectPassword123!");

      // Submit the form directly — same as the user pressing Enter while the
      // form is focused. This works even when the submit button is `disabled`
      // (which it is when React state is empty from the missing onChange).
      await act(async () => {
        form.dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
      });
      await settle();

      assert.equal(loginRequests.length, 1, "exactly one /api/login call was made");
      const body = loginRequests[0];
      assert.equal(
        body.username,
        "andrew@gogoods.com",
        "username must equal the autofilled DOM value, not empty React state",
      );
      assert.equal(
        body.password,
        "CorrectPassword123!",
        "password must equal the autofilled DOM value, not empty React state",
      );
    } finally {
      await teardown();
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // Test 2: Chrome-style native `change` event syncs into React state so
  // the submit button becomes enabled and a normal click also works.
  // ───────────────────────────────────────────────────────────────────
  test(`[${label}] native change event (Chrome autofill style) syncs state and enables button`, async () => {
    const { q, settle, teardown } = await mount(path);
    try {
      const usernameInput = q("input-login-username") as HTMLInputElement;
      const passwordInput = q("input-login-password") as HTMLInputElement;
      const submitBtn    = q("button-submit-login") as HTMLButtonElement;

      assert.ok(usernameInput, "username input must be present");
      assert.ok(passwordInput, "password input must be present");
      assert.ok(submitBtn,     "submit button must be present");

      // Write value + fire native `change` (what Chrome autofill does).
      const fireChange = (el: HTMLInputElement, value: string) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
          .set!.call(el, value);
        el.dispatchEvent(new window.Event("change", { bubbles: true }));
      };

      await act(async () => { fireChange(usernameInput, "andrew@gogoods.com"); });
      await act(async () => { fireChange(passwordInput, "CorrectPassword123!"); });
      await settle();

      // After the native `change` listeners sync state, the button should
      // be enabled and clickable.
      assert.equal(
        submitBtn.hasAttribute("disabled"),
        false,
        "submit button must be enabled after native change events sync state",
      );

      await act(async () => {
        submitBtn.dispatchEvent(
          new window.MouseEvent("click", { bubbles: true, cancelable: true })
        );
      });
      await settle();

      assert.equal(loginRequests.length, 1, "exactly one /api/login call was made");
      assert.equal(loginRequests[0].username, "andrew@gogoods.com");
      assert.equal(loginRequests[0].password, "CorrectPassword123!");
    } finally {
      await teardown();
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // Test 3: normally typed credentials (onChange fires) still work.
  // ───────────────────────────────────────────────────────────────────
  test(`[${label}] typed credentials (onChange fires) are also POSTed correctly`, async () => {
    const { q, settle, teardown } = await mount(path);
    try {
      const usernameInput = q("input-login-username") as HTMLInputElement;
      const passwordInput = q("input-login-password") as HTMLInputElement;
      const submitBtn    = q("button-submit-login") as HTMLButtonElement;

      // Simulate typing via real input events so React state updates.
      const fireInput = (el: HTMLInputElement, value: string) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
          .set!.call(el, value);
        el.dispatchEvent(new window.Event("input", { bubbles: true }));
      };

      await act(async () => { fireInput(usernameInput, "bill@goodtunes.com"); });
      await act(async () => { fireInput(passwordInput, "TypedPassword456!"); });
      await settle();

      assert.equal(
        submitBtn.hasAttribute("disabled"),
        false,
        "submit button must be enabled after typing",
      );

      await act(async () => {
        submitBtn.dispatchEvent(
          new window.MouseEvent("click", { bubbles: true, cancelable: true })
        );
      });
      await settle();

      assert.equal(loginRequests.length, 1, "exactly one /api/login call was made");
      assert.equal(loginRequests[0].username, "bill@goodtunes.com");
      assert.equal(loginRequests[0].password, "TypedPassword456!");
    } finally {
      await teardown();
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // Test 4: Safari/WebKit autofill path — FormData carries the value
  // but scripted .value reads (and React state) are both empty.
  //
  // WebKit's ITP withholds autofilled values from JS .value reads until
  // the user physically touches the field. A Sign In button click does
  // NOT count as such an interaction. The fix reads `new FormData(form)`
  // first, which all browsers populate with autofilled values at submit
  // time — even when .value is blocked. This test simulates that by
  // replacing globalThis.FormData with a mock that returns the autofilled
  // credentials while the DOM inputs' .value properties remain empty
  // (no native setter, no React event — exactly what WebKit does).
  // ───────────────────────────────────────────────────────────────────
  test(`[${label}] Safari/WebKit autofill: FormData carries value while .value is empty`, async () => {
    const { q, settle, teardown } = await mount(path);
    try {
      const usernameInput = q("input-login-username") as HTMLInputElement;
      const passwordInput = q("input-login-password") as HTMLInputElement;
      const form = usernameInput?.closest("form") as HTMLFormElement | null;

      assert.ok(usernameInput, "username input must be present");
      assert.ok(passwordInput, "password input must be present");
      assert.ok(form, "login form must be present");

      // Verify the inputs are genuinely empty before the test (no stale state).
      assert.equal(usernameInput.value, "", "username must start empty");
      assert.equal(passwordInput.value, "", "password must start empty");

      // Install a FormData stub that returns autofilled values — exactly
      // what Safari's form submission provides even when .value is blocked.
      const OriginalFormData = (globalThis as any).FormData;
      const safariAutofilled: Record<string, string> = {
        username: "andrew@gogoods.com",
        password: "SafariAutofill99!",
      };
      (globalThis as any).FormData = class MockFormData {
        // handleLogin only calls .get(); implement just that.
        get(key: string): string | null {
          return safariAutofilled[key] ?? null;
        }
      };

      try {
        // Submit via a form `submit` event — same as the user pressing Enter
        // or clicking Sign In. DOM inputs' .value remains "" throughout.
        await act(async () => {
          form.dispatchEvent(
            new window.Event("submit", { bubbles: true, cancelable: true })
          );
        });
        await settle();
      } finally {
        // Always restore the real FormData so other tests are unaffected.
        (globalThis as any).FormData = OriginalFormData;
      }

      assert.equal(loginRequests.length, 1, "exactly one /api/login call was made");
      const body = loginRequests[0];
      assert.equal(
        body.username,
        "andrew@gogoods.com",
        "username must come from FormData (Safari path), not empty .value",
      );
      assert.equal(
        body.password,
        "SafariAutofill99!",
        "password must come from FormData (Safari path), not empty .value",
      );
    } finally {
      await teardown();
    }
  });
}
