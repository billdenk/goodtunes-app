// Task #2444 — the admin Person → Overview "Music credits" card (RolePicker
// inside RolesPanel) let operators toggle role chips that visibly checked on
// but never persisted: the selection was wiped after a page reload or a
// navigate-away/return, and in approval mode a queued (not-applied) edit was
// reported as a successful "Credits saved".
//
// Two client seams caused it:
//   1. The panel re-seeded its local chip state from `person.roles` on EVERY
//      new array reference. Every sibling panel invalidates the shared person
//      query, so any of those saves refetched the person → a fresh roles
//      array → the picker reset, discarding unsaved toggles.
//   2. A partner account in approval mode gets its edit queued for review
//      (HTTP 202) rather than applied; the client treated the 2xx as success.
//
// This mounts the REAL RolesPanel and locks in:
//   - toggling a chip + Save PUTs the roles and the saved set reads back,
//   - an unrelated background person refetch (same person, unchanged roles)
//     does NOT wipe an in-progress toggle,
//   - a 202 divert is NOT presented as a saved value (the picker resets).
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/adminPersonRolesPanel.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports (.svg/.png/…) + rewrite import.meta.env so the
// real page module can be imported under tsx without Vite. Must run before
// any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

const { window } = installTestDom({ url: "http://localhost/admin/people/p-1" });

// useToast() arms shadcn's TOAST_REMOVE_DELAY (1,000,000ms) setTimeout the
// harness doesn't capture. Capture every setTimeout we arm and clear them on
// teardown, else the buffered tsx --test process stays alive ~1000s and looks
// like an infinite hang even though every test passed.
const realSetTimeout = globalThis.setTimeout;
const createdTimeouts = new Set<any>();
(globalThis as any).setTimeout = (...args: any[]) => {
  const id = (realSetTimeout as any)(...args);
  createdTimeouts.add(id);
  return id;
};
after(() => {
  for (const id of createdTimeouts) clearTimeout(id);
  createdTimeouts.clear();
});

// ── per-test fetch stub ──────────────────────────────────────────────
type PutBody = { roles?: string[] };
let putStatus = 200;
const putBodies: PutBody[] = [];

(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const method = init.method ?? "GET";
  let status = 200;
  let body: any = {};
  if (url.includes("/api/admin/credit-roles")) {
    // The searchable catalog the CreativeSection unions with the four
    // headline credits — supplies the "Guitar" chip we toggle.
    body = [{ id: "g", name: "Guitar", kind: "instrument" }];
  } else if (method === "PUT" && url.includes("/api/admin/people/")) {
    putBodies.push(init.body ? JSON.parse(init.body) : {});
    status = putStatus;
    body = { id: "p-1" };
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: () => null },
  } as any;
};

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { getQueryFn } = await import("@/lib/queryClient");
const { RolesPanel } = await import("./AdminPerson");

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
function makePerson(roles: string[], overrides: Partial<any> = {}) {
  return {
    id: "p-1",
    name: "Test Artist",
    roles,
    derivedRoles: [],
    shape: "artist",
    ...overrides,
  };
}

// ── render helpers ───────────────────────────────────────────────────
async function settle(frames = 4) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount(person: any) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: "returnNull" }),
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
      },
      mutations: { retry: false },
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(QueryClientProvider, { client: queryClient }, h(RolesPanel, { person })),
    );
  });
  await settle();
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const rerender = async (p: any) => {
    await act(async () => {
      root.render(
        h(QueryClientProvider, { client: queryClient }, h(RolesPanel, { person: p })),
      );
    });
    await settle();
  };
  const click = async (el: HTMLElement | null) => {
    assert.ok(el, "element to click exists");
    await act(async () => {
      el!.click();
    });
    await settle();
  };
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  };
  return { q, rerender, click, cleanup };
}

const GUITAR_CHIP = "chip-person-overview-creative-Guitar";
const SAVE_BTN = "button-save-roles";
const isPressed = (el: HTMLElement | null) => el?.getAttribute("aria-pressed") === "true";

// ── tests ────────────────────────────────────────────────────────────
test("toggling a chip + Save persists the roles and the saved set reads back", async () => {
  putStatus = 200;
  putBodies.length = 0;
  const { q, rerender, click, cleanup } = await mount(makePerson([]));

  // Chip starts unselected; Save is disabled (nothing dirty).
  assert.equal(isPressed(q(GUITAR_CHIP)), false, "Guitar starts off");
  assert.ok((q(SAVE_BTN) as HTMLButtonElement).disabled, "Save disabled when clean");

  await click(q(GUITAR_CHIP));
  assert.equal(isPressed(q(GUITAR_CHIP)), true, "Guitar checks on after toggle");
  assert.ok(!(q(SAVE_BTN) as HTMLButtonElement).disabled, "Save enabled when dirty");

  await click(q(SAVE_BTN));
  assert.equal(putBodies.length, 1, "exactly one PUT fired");
  assert.deepEqual(putBodies[0].roles, ["Guitar"], "the PUT carries the toggled role");

  // Simulate the post-save person refetch handing back the saved set.
  await rerender(makePerson(["Guitar"]));
  assert.equal(isPressed(q(GUITAR_CHIP)), true, "the saved role reads back after refetch");
  assert.ok((q(SAVE_BTN) as HTMLButtonElement).disabled, "Save disabled again once saved");

  await cleanup();
});

test("an unrelated background refetch does NOT wipe an in-progress toggle", async () => {
  putStatus = 200;
  putBodies.length = 0;
  const { q, rerender, click, cleanup } = await mount(makePerson([]));

  await click(q(GUITAR_CHIP));
  assert.equal(isPressed(q(GUITAR_CHIP)), true, "Guitar toggled on (unsaved)");

  // A sibling panel's save invalidates the shared person query → the person
  // refetches and hands us a BRAND-NEW roles array reference with the SAME
  // (unchanged) contents. The old code re-seeded on that reference change and
  // wiped the unsaved toggle. It must survive now.
  await rerender(makePerson([]));
  assert.equal(
    isPressed(q(GUITAR_CHIP)),
    true,
    "the in-progress toggle survives a same-person background refetch",
  );
  assert.ok(!(q(SAVE_BTN) as HTMLButtonElement).disabled, "still dirty / saveable");

  await cleanup();
});

test("a 202 approval divert is not presented as a saved value", async () => {
  putStatus = 202; // approval mode: edit queued for review, NOT applied
  putBodies.length = 0;
  const { q, click, cleanup } = await mount(makePerson([]));

  await click(q(GUITAR_CHIP));
  assert.equal(isPressed(q(GUITAR_CHIP)), true, "Guitar toggled on");

  await click(q(SAVE_BTN));
  assert.equal(putBodies.length, 1, "the PUT still fired");
  // Nothing persisted — the picker must reset to the real (unchanged) server
  // value so the queued edit isn't shown as saved.
  assert.equal(
    isPressed(q(GUITAR_CHIP)),
    false,
    "the queued (not-applied) role is reset, not presented as saved",
  );

  await cleanup();
});
