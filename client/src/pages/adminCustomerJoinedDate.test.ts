// Task #1342 (#6) — regression guard for the customer-detail "Joined …" header.
//
// Imported goGoods fans were inserted into our DB at import time, so their
// `createdAt` is a migration artifact and must NEVER be shown as a join date.
// `resolveJoinedDisplay` is the single source of truth for that decision; the
// header renders straight off its result. The blocking gap a prior review
// caught was the no-orders legacy case silently falling back to `createdAt`,
// so these cases pin every branch.
//
// The helper is pure, so we import it directly instead of rendering the page.
// AdminCustomerDetail.tsx still pulls PNG asset imports + `import.meta.env`
// at module load (via AdminFrame), so we register the shared asset-stub
// loader and the Vite env shim first — same harness as the other page tests.
//
// Runs under Node's built-in runner via tsx:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/adminCustomerJoinedDate.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./assetStubLoader.mjs", import.meta.url);
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

const { resolveJoinedDisplay } = await import("./AdminCustomerDetail");

test("native fan → plain createdAt, no imported note", () => {
  const r = resolveJoinedDisplay({
    legacyGogoodsId: null,
    createdAt: "2025-01-02T00:00:00.000Z",
    earliestOrderAt: null,
  });
  assert.deepEqual(r, { kind: "joined", iso: "2025-01-02T00:00:00.000Z", importedNote: false });
});

test("native fan with orders still uses createdAt (no legacy → no order fallback)", () => {
  const r = resolveJoinedDisplay({
    legacyGogoodsId: null,
    createdAt: "2025-01-02T00:00:00.000Z",
    earliestOrderAt: "2024-06-01T00:00:00.000Z",
  });
  assert.deepEqual(r, { kind: "joined", iso: "2025-01-02T00:00:00.000Z", importedNote: false });
});

test("legacy fan WITH orders → earliest order date + imported note (never the import createdAt)", () => {
  const r = resolveJoinedDisplay({
    legacyGogoodsId: "gg-123",
    createdAt: "2025-03-15T00:00:00.000Z", // import timestamp — must NOT win
    earliestOrderAt: "2019-08-09T00:00:00.000Z",
  });
  assert.deepEqual(r, { kind: "joined", iso: "2019-08-09T00:00:00.000Z", importedNote: true });
});

test("legacy fan with NO orders → imported-no-date (the blocking gap: never falls back to createdAt)", () => {
  const r = resolveJoinedDisplay({
    legacyGogoodsId: "gg-123",
    createdAt: "2025-03-15T00:00:00.000Z", // import timestamp — must be suppressed
    earliestOrderAt: null,
  });
  assert.deepEqual(r, { kind: "imported-no-date" });
});

test("empty-string legacyGogoodsId is treated as native (falsy guard)", () => {
  const r = resolveJoinedDisplay({
    legacyGogoodsId: "",
    createdAt: "2025-01-02T00:00:00.000Z",
    earliestOrderAt: null,
  });
  assert.deepEqual(r, { kind: "joined", iso: "2025-01-02T00:00:00.000Z", importedNote: false });
});
