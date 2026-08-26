// Task #3394 — the cross-press import route is NOT a surface while held OFF.
//
// The route /projects/import registers on every white-label host, so the page
// itself must be the wall: while the press's cross_press_import_enabled flag
// is OFF, a direct navigation renders the portal's 404 page — identical to a
// route that was never registered. No import shell, no blank canvas that
// hints at a feature, no post-mount redirect. While eligibility is still
// resolving, nothing paints at all.
//
//   GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/mrp/pressClientImportHeldOff.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../jsdomHarness";

register("../assetStubLoader.mjs", import.meta.url);
installTestDom({ url: "http://localhost/projects/import" });

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { withDevWlParam } = await import("@/hooks/useAuthKind");
const PressClientImportMRP = (await import("./PressClientImportMRP")).default;

const h = React.createElement;
const ELIGIBILITY_KEY = [withDevWlParam("/api/press-client/import/eligibility")];
const PROJECTS_KEY = [withDevWlParam("/api/press-client/import/projects")];

function makeClient() {
  // Infinity stale + gc ⇒ no background timer scheduled; a never-resolving
  // default queryFn ⇒ any query we did NOT pre-seed stays pending forever
  // instead of hitting the network.
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        queryFn: () => new Promise(() => {}),
      },
    },
  });
}

async function mount(client: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(QueryClientProvider, { client }, h(PressClientImportMRP, {})),
    );
  });
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { container, cleanup };
}

test("flag OFF: direct navigation renders the 404 page — no import shell, no redirect", async () => {
  const client = makeClient();
  client.setQueryData(ELIGIBILITY_KEY, { enabled: false });
  const { container, cleanup } = await mount(client);
  try {
    assert.ok(
      container.textContent?.includes("404 Page Not Found"),
      "held OFF reads exactly like an unregistered route",
    );
    assert.equal(
      document.querySelector('[data-testid="heading-import"]'),
      null,
      "the import shell must not render while held OFF",
    );
    assert.equal(
      window.location.pathname,
      "/projects/import",
      "no redirect — the wall is the 404 itself",
    );
  } finally {
    await cleanup();
  }
});

test("eligibility still resolving: nothing paints (no shell to glimpse)", async () => {
  const client = makeClient(); // nothing seeded — the query stays pending
  const { container, cleanup } = await mount(client);
  try {
    assert.equal(container.textContent, "", "no visible surface while unknown");
    assert.equal(document.querySelector('[data-testid="heading-import"]'), null);
  } finally {
    await cleanup();
  }
});

test("flag ON: the import surface renders", async () => {
  const client = makeClient();
  client.setQueryData(ELIGIBILITY_KEY, { enabled: true });
  client.setQueryData(PROJECTS_KEY, { projects: [] });
  const { cleanup } = await mount(client);
  try {
    assert.ok(
      document.querySelector('[data-testid="heading-import"]'),
      "flag ON shows the wizard",
    );
  } finally {
    await cleanup();
  }
});
