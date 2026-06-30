// Task #2367 — client coverage that a press partner never gets bounced off a
// person page in the browser.
//
// The original redirect bug (a manufacturer-role session opening a person page
// → bounced to /vendor) was a CLIENT-side routing problem inside the press
// portal. The server-side counterpart (server/pressScopedPeople.db.test.ts)
// already locks the scoped /api/press/:id/people/:personId endpoints in (200
// in-scope, 404 out-of-scope, 403 cross-press). What was missing was a test
// that actually mounts the PressScopedPersonDetail component and proves that,
// given a valid in-scope person, it renders the person and DOES NOT navigate
// away from the press portal.
//
// This exercises the client contract:
//   - a mocked 200 person response → the person renders (name + detail panel)
//     and the route stays exactly where it was (no redirect to /vendor or
//     anywhere else),
//   - a 404 from the scoped endpoint → a graceful in-portal "not found" state
//     (still no hard bounce; the URL is untouched).
//
// PressScopedPersonDetail lives inside PressPortal.tsx and reads
// useToast()/useQuery()/useMutation(), so we render it inside a
// QueryClientProvider and stub the global fetch (the only network seam) per
// test. Importing PressPortal.tsx pulls a heavy module graph (OperatorShell,
// PartnerDashboard, @assets imports, …) so we use the shared jsdom harness +
// the asset/import.meta.env ESM loader.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/pressScopedPersonDetail.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports (.svg/.png/…) + rewrite import.meta.env so the
// real page module can be imported under tsx without Vite. Must run before
// any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// Boot the portal at the press-portal URL (with the ?person= deep link the
// portal uses to open a person). The test asserts this path is still the
// location after the person renders — i.e. no bounce to /vendor.
const PORTAL_PATH = "/press?tab=people&person=p-1";
const { window } = installTestDom({ url: `http://localhost${PORTAL_PATH}` });

// The remove mutation (and any future toast) arms shadcn's TOAST_REMOVE_DELAY
// (1,000,000ms) setTimeout. The harness only captures setInterval, so capture
// every setTimeout we arm and clear them on teardown — otherwise the buffered
// tsx --test process stays alive ~1000s and looks like an infinite hang even
// though every test passed.
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
type FetchHandler = (url: string, init: any) => { status?: number; body: any };
let fetchHandler: FetchHandler = () => ({ body: {} });
const fetchCalls: { method: string; url: string }[] = [];

(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const method = init.method ?? "GET";
  fetchCalls.push({ method, url });
  const { status = 200, body } = fetchHandler(url, init);
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
const { PressScopedPersonDetail } = await import("./PressPortal");

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
const PRESS_ID = "press-own";
const PERSON_ID = "p-1";

function makePerson(overrides: Partial<any> = {}) {
  return {
    id: PERSON_ID,
    name: "Test Artist",
    photoUrl: null,
    coverUrl: null,
    bio: "A press-homed artist.",
    labelId: null,
    appleMusicUrl: null,
    spotifyUrl: null,
    tidalUrl: null,
    qobuzUrl: null,
    deezerUrl: null,
    pandoraUrl: null,
    roles: ["Vocals"],
    derivedRoles: [],
    shape: "artist",
    invitedByPressId: null,
    ...overrides,
  };
}

// A scoped person endpoint that returns the in-scope person (200) and an empty
// album list — exactly what a manufacturer-role session reading its OWN
// artist should see.
function inScopeHandler(person = makePerson()): FetchHandler {
  return (url) => {
    if (url.includes(`/people/${PERSON_ID}/albums`)) return { body: [] };
    if (url.includes(`/people/${PERSON_ID}`)) return { body: person };
    return { body: {} };
  };
}

// ── render helper ────────────────────────────────────────────────────
async function mount(props: any) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: "returnNull" }),
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
      },
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(PressScopedPersonDetail, props),
      ),
    );
  });
  await settle();
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  };
  return { container, q, cleanup };
}

async function settle(frames = 4) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

// ── tests ────────────────────────────────────────────────────────────
test("renders the in-scope person and stays on the press portal (no bounce)", async () => {
  fetchHandler = inScopeHandler();
  const onBack = () => {};
  const pathBefore = window.location.pathname + window.location.search;

  const { q, cleanup } = await mount({
    pressId: PRESS_ID,
    personId: PERSON_ID,
    canEdit: true,
    onBack,
  });

  // The person actually rendered — name heading + the detail container keyed
  // by personId, NOT the not-found fallback.
  assert.ok(
    q(`press-person-detail-${PERSON_ID}`),
    "the scoped person-detail panel renders",
  );
  assert.equal(
    q("heading-person-name")?.textContent,
    "Test Artist",
    "the in-scope person's name renders",
  );
  assert.equal(
    q("press-person-not-found"),
    null,
    "the not-found state is NOT shown for a valid in-scope person",
  );

  // The bug this guards: the route must NOT change. A bounce would have
  // navigated the global location to /vendor (or elsewhere); it must be
  // exactly where the portal mounted it.
  const pathAfter = window.location.pathname + window.location.search;
  assert.equal(
    pathAfter,
    pathBefore,
    "the browser stays on the press portal — no redirect to /vendor or elsewhere",
  );
  assert.ok(
    !window.location.pathname.includes("/vendor"),
    "the route never lands on /vendor",
  );

  // It read the scoped press endpoint (the in-scope success path), not some
  // global /admin/people route.
  assert.ok(
    fetchCalls.some((c) =>
      c.url.includes(`/api/press/${PRESS_ID}/people/${PERSON_ID}`),
    ),
    "the detail reads the press-scoped person endpoint",
  );

  await cleanup();
});

test("a 404 from the scoped endpoint shows a graceful in-portal state, not a hard bounce", async () => {
  fetchHandler = (url) => {
    if (url.includes(`/people/${PERSON_ID}/albums`)) return { status: 404, body: { message: "Not found" } };
    if (url.includes(`/people/${PERSON_ID}`)) return { status: 404, body: { message: "Not found" } };
    return { body: {} };
  };
  const pathBefore = window.location.pathname + window.location.search;

  const { q, cleanup } = await mount({
    pressId: PRESS_ID,
    personId: PERSON_ID,
    canEdit: true,
    onBack: () => {},
  });

  // Graceful in-portal fallback (a "Back to People" affordance), NOT a redirect.
  assert.ok(
    q("press-person-not-found"),
    "an out-of-scope / missing person renders the in-portal not-found state",
  );
  assert.ok(
    q("button-back-to-people"),
    "the fallback offers an in-portal way back to People",
  );

  const pathAfter = window.location.pathname + window.location.search;
  assert.equal(
    pathAfter,
    pathBefore,
    "even on 404 the browser stays on the press portal (no hard bounce)",
  );

  await cleanup();
});
