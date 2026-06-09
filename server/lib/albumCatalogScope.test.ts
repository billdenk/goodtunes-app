// Task #1873 — regression tests for partner-admin catalog visibility.
//
// Invariant: NO partner-admin role may fall through to the full catalog.
//   - unattached partner (no roleScopeId)  → empty list
//   - attached partner                     → only their scoped set
//   - operator (super_admin / admin)       → null (full catalog, caller handles)
//   - unknown / no-list roles              → empty list
//
//   npx tsx --test server/lib/albumCatalogScope.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { filterAlbumsForPartnerRole, NO_ALBUM_LIST_ROLES } from "./albumCatalogScope";

const A1 = { id: "alb-1", primaryArtistId: "artist-a", labelId: "label-x" };
const A2 = { id: "alb-2", primaryArtistId: "artist-b", labelId: "label-y" };
const A3 = { id: "alb-3", primaryArtistId: "artist-a", labelId: null };
const ALL = [A1, A2, A3];

// ── Operators ────────────────────────────────────────────────────────────────

test("operator super_admin → null (full catalog)", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "super_admin", roleScopeId: null });
  assert.equal(result, null);
});

test("operator admin → null (full catalog)", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "admin", roleScopeId: null });
  assert.equal(result, null);
});

// ── Artist ───────────────────────────────────────────────────────────────────

test("artist — attached → only own releases", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "artist", roleScopeId: "artist-a" });
  assert.deepEqual(result?.map((a: any) => a.id), ["alb-1", "alb-3"]);
});

test("artist — unattached (null scopeId) → empty list", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "artist", roleScopeId: null });
  assert.deepEqual(result, []);
});

test("artist — attached to unknown artist → empty list", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "artist", roleScopeId: "artist-zzz" });
  assert.deepEqual(result, []);
});

// ── Label ────────────────────────────────────────────────────────────────────

test("label — attached → only that label's releases", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "label", roleScopeId: "label-x" });
  assert.deepEqual(result?.map((a: any) => a.id), ["alb-1"]);
});

test("label — unattached (null scopeId) → empty list, NOT full catalog", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "label", roleScopeId: null });
  assert.deepEqual(result, []);
});

test("label — attached to a label with no matching albums → empty list", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "label", roleScopeId: "label-zzz" });
  assert.deepEqual(result, []);
});

// ── Manager ──────────────────────────────────────────────────────────────────

test("manager — attached with roster → only roster artists' releases", () => {
  const roster = new Set(["artist-a"]);
  const result = filterAlbumsForPartnerRole(ALL, { role: "manager", roleScopeId: "mgr-1" }, roster);
  assert.deepEqual(result?.map((a: any) => a.id), ["alb-1", "alb-3"]);
});

test("manager — unattached (null scopeId) → empty list", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "manager", roleScopeId: null });
  assert.deepEqual(result, []);
});

test("manager — empty roster → empty list, NOT full catalog", () => {
  const emptyRoster = new Set<string>();
  const result = filterAlbumsForPartnerRole(ALL, { role: "manager", roleScopeId: "mgr-1" }, emptyRoster);
  assert.deepEqual(result, []);
});

test("manager — no roster provided → empty list (safe default)", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "manager", roleScopeId: "mgr-1" });
  assert.deepEqual(result, []);
});

// ── No-list partner roles ─────────────────────────────────────────────────────

test("manufacturer → empty list (uses dedicated /albums endpoint)", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "manufacturer", roleScopeId: "mfr-1" });
  assert.deepEqual(result, []);
});

test("fulfillment → empty list", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "fulfillment", roleScopeId: "ff-1" });
  assert.deepEqual(result, []);
});

test("vendor → empty list", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "vendor", roleScopeId: "vnd-1" });
  assert.deepEqual(result, []);
});

test("non_profit → empty list", () => {
  const result = filterAlbumsForPartnerRole(ALL, { role: "non_profit", roleScopeId: "npo-1" });
  assert.deepEqual(result, []);
});

test("no-list roles are exactly manufacturer/fulfillment/vendor/non_profit", () => {
  assert.deepEqual(
    [...NO_ALBUM_LIST_ROLES].sort(),
    ["fulfillment", "manufacturer", "non_profit", "vendor"],
  );
});

// ── Invariant: no partner role leaks the full catalog ────────────────────────

const PARTNER_ROLES = ["artist", "label", "manager", "manufacturer", "fulfillment", "vendor", "non_profit"];

test("invariant: no partner role returns null (full catalog)", () => {
  for (const role of PARTNER_ROLES) {
    const result = filterAlbumsForPartnerRole(ALL, { role, roleScopeId: "some-scope" });
    assert.notEqual(
      result,
      null,
      `role "${role}" must never return null (full catalog) — scoped set or [] only`,
    );
  }
});

test("invariant: unattached partner always returns empty, never full catalog", () => {
  for (const role of PARTNER_ROLES) {
    const result = filterAlbumsForPartnerRole(ALL, { role, roleScopeId: null });
    assert.deepEqual(result, [], `unattached role "${role}" must return [] not full catalog`);
  }
});
