// #3295 review gate — the dev white-label override must ride onto portal
// API paths as `wl=<slug>` from EVERY MRP portal page (next-steps included),
// or the host-scoped server 404s and the page sticks at the login state.
//
//   npx tsx --test client/src/hooks/withDevWlParam.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../pages/assetStubLoader.mjs", import.meta.url);

// Vite env shim — the loader rewrites `import.meta.env` to this global.
(globalThis as any).__VITE_ENV__ = { DEV: true, PROD: false, MODE: "test", SSR: false };

// Minimal window/sessionStorage for devWhitelabelSlug.
const store = new Map<string, string>();
(globalThis as any).window = {
  location: { search: "", host: "127.0.0.1" },
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};
(globalThis as any).sessionStorage = (globalThis as any).window.sessionStorage;

const { withDevWlParam } = await import("./useAuthKind");

test("no dev override → path unchanged", () => {
  store.clear();
  assert.equal(withDevWlParam("/api/press-client/portal"), "/api/press-client/portal");
});

test("dev override appends wl= with ? or & as appropriate", () => {
  store.set("gt-dev-wl-slug", "memphis");
  assert.equal(withDevWlParam("/api/press-client/portal"), "/api/press-client/portal?wl=memphis");
  assert.equal(withDevWlParam("/api/press-client/dashboard?range=7d"), "/api/press-client/dashboard?range=7d&wl=memphis");
  store.clear();
});
