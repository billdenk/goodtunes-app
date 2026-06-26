// Regression guard: a logged-out visitor on the player host (my.goodtunes.music)
// must qualify for the campaign "locked preview" surface, identical to the
// purchase-funnel hosts (get./store.). This test locks the host-gate predicate
// so the player-host-logged-out case can't silently regress.
//
// These are pure function tests — no DOM, no React, no jsdom required.
//   npx tsx --test client/src/hooks/playerHostLockedPreview.test.ts

import test from "node:test";
import assert from "node:assert/strict";

// The loader rewrites `import.meta.env` (Vite-only). Stub the global so
// the module can be imported under tsx without Vite.
(globalThis as any).__VITE_ENV__ = {
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
};

// Stub window so the functions don't crash when reading window.location.host
// (we always pass explicit host args in these tests anyway).
(globalThis as any).window = { location: { host: "localhost" } };

const { isPurchaseFunnelHost, isPlayerHost } = await import("./useAuthKind");

// ── isPurchaseFunnelHost ──────────────────────────────────────────────────────

test("isPurchaseFunnelHost: get. is a funnel host", () => {
  assert.equal(isPurchaseFunnelHost("get.goodtunes.music"), true);
});

test("isPurchaseFunnelHost: store. is a funnel host", () => {
  assert.equal(isPurchaseFunnelHost("store.goodtunes.music"), true);
});

test("isPurchaseFunnelHost: my. is NOT a funnel host", () => {
  assert.equal(isPurchaseFunnelHost("my.goodtunes.music"), false);
});

test("isPurchaseFunnelHost: dev/replit is NOT a funnel host", () => {
  assert.equal(isPurchaseFunnelHost("abc.repl.co"), false);
  assert.equal(isPurchaseFunnelHost("localhost"), false);
});

// ── isPlayerHost ──────────────────────────────────────────────────────────────

test("isPlayerHost: my. is the player host", () => {
  assert.equal(isPlayerHost("my.goodtunes.music"), true);
});

test("isPlayerHost: get. is NOT the player host", () => {
  assert.equal(isPlayerHost("get.goodtunes.music"), false);
});

test("isPlayerHost: store. is NOT the player host", () => {
  assert.equal(isPlayerHost("store.goodtunes.music"), false);
});

test("isPlayerHost: dev/replit is NOT the player host", () => {
  assert.equal(isPlayerHost("localhost"), false);
  assert.equal(isPlayerHost("abc.repl.co"), false);
});

// ── Composed lockedPreview predicate ─────────────────────────────────────────
// Mirrors the logic in AlbumDetail.tsx and AlbumDetailDesktop.tsx:
//   previewFirst && (isPurchaseFunnelHost() || (!user && isPlayerHost()))

function simulateLockedPreview(opts: {
  previewFirst: boolean;
  host: string;
  loggedIn: boolean;
}): boolean {
  const { previewFirst, host, loggedIn } = opts;
  const user = loggedIn ? { id: "u1" } : null;
  return (
    previewFirst &&
    (isPurchaseFunnelHost(host) || (!user && isPlayerHost(host)))
  );
}

test("lockedPreview: get. host, not owned → campaign surface", () => {
  assert.equal(
    simulateLockedPreview({ previewFirst: true, host: "get.goodtunes.music", loggedIn: false }),
    true,
  );
});

test("lockedPreview: my. host, logged OUT, not owned → campaign surface (new behavior)", () => {
  assert.equal(
    simulateLockedPreview({ previewFirst: true, host: "my.goodtunes.music", loggedIn: false }),
    true,
    "Logged-out visitor on my. should get the campaign surface",
  );
});

test("lockedPreview: my. host, logged IN, not owned → NO campaign surface (unchanged)", () => {
  assert.equal(
    simulateLockedPreview({ previewFirst: true, host: "my.goodtunes.music", loggedIn: true }),
    false,
    "Logged-in non-owner on my. must NOT get the campaign chrome (task scope)",
  );
});

test("lockedPreview: my. host, owned → NO campaign surface (previewFirst=false)", () => {
  assert.equal(
    simulateLockedPreview({ previewFirst: false, host: "my.goodtunes.music", loggedIn: false }),
    false,
    "Owned albums never enter previewFirst so lockedPreview stays false",
  );
});

test("lockedPreview: dev host, logged OUT → NO campaign surface (single-host dev)", () => {
  assert.equal(
    simulateLockedPreview({ previewFirst: true, host: "localhost", loggedIn: false }),
    false,
    "Dev/replit is neither a funnel nor the player host — campaign chrome stays off",
  );
});

test("lockedPreview: native (previewFirst=false, buyEnabled=false) → never fires", () => {
  // On native, buyEnabled=false so previewFirst is always false regardless of host.
  assert.equal(
    simulateLockedPreview({ previewFirst: false, host: "my.goodtunes.music", loggedIn: false }),
    false,
  );
});
