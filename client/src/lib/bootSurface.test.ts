// Task #3322 — navy-flash guard: the boot-surface classifier decides which
// theme the full-screen loading interstitial paints and when the gt-admin
// body class may be released. These tests pin the host/path rules AND verify
// the pre-React inline detector in client/index.html stays in lock-step with
// isAdminSurfacePath (the two are duplicated by necessity — the inline one
// must run before any module loads).
//
//   npx tsx --test client/src/lib/bootSurface.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { register } from "node:module";
register("../pages/assetStubLoader.mjs", import.meta.url);

// Vite env shim — the loader rewrites `import.meta.env` to this global.
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

// Minimal window for the dev ?gtwl override lookup inside onWhitelabelHost
// (PROD mode above disables it, so search/sessionStorage go unused).
const store = new Map<string, string>();
(globalThis as any).window = {
  location: { search: "", host: "my.goodtunes.music", pathname: "/" },
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};
(globalThis as any).sessionStorage = (globalThis as any).window.sessionStorage;

const { isAdminSurfacePath, classifyBootSurface, releaseAdminBodyClass } =
  await import("./bootSurface");

// ---------------------------------------------------------------------------
// Fixtures shared by the classifier tests and the index.html parity test.
// ---------------------------------------------------------------------------
const FAN_HOST = "my.goodtunes.music";
const ADMIN_HOST = "admin.goodtunes.music";
const WL_HOST = "portal.makesvinyl.com";

const CASES: Array<{ host: string; path: string; admin: boolean; surface: string }> = [
  // Fan surfaces
  { host: FAN_HOST, path: "/", admin: false, surface: "fan" },
  { host: FAN_HOST, path: "/album/abc", admin: false, surface: "fan" },
  { host: FAN_HOST, path: "/artist/nick-carter", admin: false, surface: "fan" }, // fan artist page, NOT the portal
  { host: FAN_HOST, path: "/e/tok123", admin: false, surface: "fan" },
  // Admin host + /admin paths
  { host: ADMIN_HOST, path: "/", admin: true, surface: "admin" },
  { host: ADMIN_HOST, path: "/admin/dashboard", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/admin", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/admin/orders", admin: true, surface: "admin" },
  // /e/:token is PUBLIC even on the admin host
  { host: ADMIN_HOST, path: "/e/tok123", admin: false, surface: "fan" },
  // Partner portals — exact landing paths + embedded album detail
  { host: FAN_HOST, path: "/artist", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/artist/albums/uuid-1", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/label", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/manager", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/vendor", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/vendor/albums/uuid-2", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/non-profit", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/publisher", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/invite", admin: true, surface: "admin" },
  { host: FAN_HOST, path: "/invite/abc", admin: true, surface: "admin" },
  // White-label wins over admin — never GoodTunes branding there
  { host: WL_HOST, path: "/", admin: false, surface: "whitelabel" },
  { host: WL_HOST, path: "/admin/login", admin: true, surface: "whitelabel" },
  { host: "pressesvinyl.com", path: "/e/tok", admin: false, surface: "whitelabel" },
];

test("isAdminSurfacePath + classifyBootSurface host/path rules", () => {
  for (const c of CASES) {
    assert.equal(isAdminSurfacePath(c.host, c.path), c.admin, `${c.host}${c.path} admin`);
    assert.equal(classifyBootSurface(c.host, c.path), c.surface, `${c.host}${c.path} surface`);
  }
});

test("port suffix on host is ignored", () => {
  assert.equal(isAdminSurfacePath("admin.goodtunes.music:5000", "/"), true);
});

// ---------------------------------------------------------------------------
// Parity with the inline first-paint detector in client/index.html — extract
// its bootAdmin/bootWhiteLabel logic and run it against the same fixtures.
// ---------------------------------------------------------------------------
test("client/index.html inline detector agrees with the shared classifier", () => {
  const htmlPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../index.html",
  );
  const html = readFileSync(htmlPath, "utf8");
  // Pull just the var declarations we need out of the inline script.
  const grab = (name: string) => {
    const m = html.match(new RegExp(`var ${name} =[\\s\\S]*?;`));
    assert.ok(m, `index.html should declare ${name}`);
    return m![0];
  };
  const snippet = [grab("bootWhiteLabel"), grab("bootLightPortal"), grab("bootAdmin")].join("\n");
  const evalDetector = (host: string, pathname: string) => {
    const fn = new Function(
      "location",
      `var bootHost = location.hostname.toLowerCase();
       var bootPath = location.pathname || "";
       ${snippet}
       return { bootAdmin: bootAdmin, bootWhiteLabel: bootWhiteLabel };`,
    );
    return fn({ hostname: host.split(":")[0], pathname });
  };
  for (const c of CASES) {
    const r = evalDetector(c.host, c.path);
    assert.equal(r.bootWhiteLabel, c.surface === "whitelabel", `${c.host}${c.path} whitelabel parity`);
    // The inline detector has no white-label branch inside bootAdmin (it
    // layers boot-whitelabel on top), so compare its bootAdmin against the
    // shared isAdminSurfacePath directly.
    assert.equal(r.bootAdmin, c.admin, `${c.host}${c.path} admin parity`);
  }
});

// ---------------------------------------------------------------------------
// releaseAdminBodyClass — destination-aware gt-admin removal.
// ---------------------------------------------------------------------------
test("releaseAdminBodyClass keeps gt-admin on admin destinations, drops it on fan", () => {
  const classes = new Set<string>(["gt-admin"]);
  (globalThis as any).document = {
    body: { classList: { remove: (c: string) => void classes.delete(c) } },
  };
  // Destination still an admin surface → class stays.
  (globalThis as any).window.location = { host: FAN_HOST, pathname: "/admin/people", search: "" };
  releaseAdminBodyClass();
  assert.ok(classes.has("gt-admin"), "kept on admin destination");
  // Portal-to-portal transition → class stays.
  (globalThis as any).window.location = { host: FAN_HOST, pathname: "/artist", search: "" };
  releaseAdminBodyClass();
  assert.ok(classes.has("gt-admin"), "kept on portal destination");
  // Genuine navigation back to a fan surface → class released.
  (globalThis as any).window.location = { host: FAN_HOST, pathname: "/album/abc", search: "" };
  releaseAdminBodyClass();
  assert.ok(!classes.has("gt-admin"), "released on fan destination");
  delete (globalThis as any).document;
});
