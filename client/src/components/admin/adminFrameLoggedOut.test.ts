// Task #3318 — regression guard: the admin shell must not crash when the
// operator's auth is gone. The default react-query queryFn
// (`getQueryFn({ on401: "returnNull" })`) returns literal `null` on a 401,
// and destructuring defaults like `const { data: albums = [] }` only apply
// for `undefined` — so every sidebar-count query in AdminFrame used to call
// `.filter`/`.length` on null and error-boundary the whole shell
// ("Admin failed to load") after a browser cache clear wiped the token.
//
// Covered here by rendering the REAL AdminFrame with a QueryClient whose
// default queryFn resolves `null` (exactly what the app's default does on a
// 401):
//   1. /api/me resolves an admin user but EVERY badge endpoint returns null
//      (bearer-only admin APIs 401ing while the session-backed /api/me still
//      works) → the shell renders, zero counts, no throw.
//   2. /api/me/role itself resolves null (full admin-API auth loss) → the
//      frame redirects to /admin/login instead of rendering with null data.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/adminFrameLoggedOut.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../../pages/jsdomHarness";

// Stub static asset imports (AdminFrame pulls in the GoodTunes wordmark PNG)
// + rewrite import.meta.env so the real modules import under tsx without
// Vite. Must run before any import that pulls them in.
register("../../pages/assetStubLoader.mjs", import.meta.url);

const { window } = installTestDom({
  url: "http://localhost/admin/dashboard",
  viewportWidth: 1440,
});

// AdminFrame's shell renders framer-motion nav + banners that reach for a few
// jsdom gaps.
(window.HTMLElement.prototype as any).scrollIntoView = () => {};
(window as any).scrollTo = () => {};
const g = globalThis as any;
g.ResizeObserver =
  window.ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
(window as any).ResizeObserver = g.ResizeObserver;
// Any query that slips past the seeded cache must not open a real socket.
g.fetch = async () =>
  ({
    ok: false,
    status: 404,
    text: async () => "not found",
    json: async () => ({}),
  }) as any;
// Radix/framer reach for window-only DOM constructors via bare globals.
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in g)) {
    try {
      g[key] = (window as any)[key];
    } catch {
      // getter-only props; skip.
    }
  }
}

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const AdminFrameMod: any = await import("./AdminFrame");
const AdminFrame = AdminFrameMod.AdminFrame ?? AdminFrameMod.default;

const h = React.createElement;

const ADMIN_USER = {
  id: "u1",
  username: "op",
  email: "op@goodtunes.music",
  displayName: "Operator",
  isAdmin: true,
  kind: "admin",
};

// Default queryFn resolves `null` — the exact payload the app's
// getQueryFn({ on401: "returnNull" }) hands react-query on a 401.
// Seed only /api/me (useAuth defines its own queryFn; staleTime Infinity
// keeps the seed authoritative) plus, per-test, /api/me/role.
function makeClient(roleInfo: { role: string } | null) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => null,
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
  qc.setQueryData(["/api/me"], ADMIN_USER);
  if (roleInfo !== null) qc.setQueryData(["/api/me/role"], roleInfo);
  return qc;
}

async function renderFrame(qc: any) {
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(AdminFrame, { title: "Dashboard" }, h("div", { "data-testid": "page-body" }, "hello")),
      ),
    );
  });
  // Let the seeded/null queries settle + the redirect effect run.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return { container, root };
}

test("AdminFrame renders with zero counts when every badge query resolves null", async () => {
  window.history.replaceState(null, "", "/admin/dashboard");
  // Role resolves fine (session-backed route) while all list endpoints 401 →
  // null. Shell must render its chrome + page body, not throw.
  const qc = makeClient({ role: "super_admin" });
  const { container, root } = await renderFrame(qc);
  try {
    assert.ok(
      container.querySelector('[data-testid="page-body"]'),
      "page body should render inside the frame",
    );
    // Still on the dashboard — no bounce, no error boundary card.
    assert.equal(window.location.pathname, "/admin/dashboard");
    assert.equal(container.textContent?.includes("Admin failed to load"), false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("AdminFrame redirects to /admin/login when the role query resolves unauthenticated (null)", async () => {
  window.history.replaceState(null, "", "/admin/dashboard");
  const qc = makeClient(null); // /api/me/role falls through to the null queryFn
  const { container, root } = await renderFrame(qc);
  try {
    assert.equal(
      window.location.pathname,
      "/admin/login",
      "auth loss must route to the admin login screen",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
