// Regression coverage for invalidateAdminEntity's vendor case.
//
// The Maker/Reseller index lists cache under their FULL URL including the
// `?role=` filter (`["/api/vendors?role=maker"]`). React Query compares the
// first string element by strict equality, so an exact `["/api/vendors"]`
// invalidation can never reach a single-element full-URL key — after an
// operator replaced a logo the list kept showing the old image until a hard
// refresh. These tests lock in the prefix sweep that fixes it (and keep it
// scoped to the vendor kind).
//
// Pure logic, no DOM needed — runs under Node's built-in runner via tsx:
//   npx tsx --test client/src/lib/adminEntityInvalidation.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";

import { invalidateAdminEntity } from "./adminEntityInvalidation";

const VENDOR_ID = "v-123";

function seed(qc: QueryClient, key: readonly unknown[]) {
  qc.setQueryData(key as unknown[], { seeded: true });
}

function invalidated(qc: QueryClient, key: readonly unknown[]): boolean {
  return qc.getQueryState(key as unknown[])?.isInvalidated === true;
}

test("vendor invalidation sweeps the role-filtered Maker/Reseller lists", async () => {
  const qc = new QueryClient();
  seed(qc, ["/api/vendors?role=maker"]);
  seed(qc, ["/api/vendors?role=reseller"]);

  await invalidateAdminEntity(qc, "vendor", VENDOR_ID);

  assert.equal(invalidated(qc, ["/api/vendors?role=maker"]), true);
  assert.equal(invalidated(qc, ["/api/vendors?role=reseller"]), true);
});

test("vendor invalidation also busts the detail, candidate, and join feeds", async () => {
  const qc = new QueryClient();
  seed(qc, [`/api/vendors/${VENDOR_ID}/profile`]);
  seed(qc, [`/api/makers/${VENDOR_ID}/profile`]);
  seed(qc, ["/api/vendors"]);
  seed(qc, ["/api/instruments"]);

  await invalidateAdminEntity(qc, "vendor", VENDOR_ID);

  assert.equal(invalidated(qc, [`/api/vendors/${VENDOR_ID}/profile`]), true);
  assert.equal(invalidated(qc, [`/api/makers/${VENDOR_ID}/profile`]), true);
  assert.equal(invalidated(qc, ["/api/vendors"]), true);
  assert.equal(invalidated(qc, ["/api/instruments"]), true);
});

test("vendor invalidation leaves unrelated caches alone", async () => {
  const qc = new QueryClient();
  seed(qc, ["/api/albums"]);
  seed(qc, ["/api/people"]);

  await invalidateAdminEntity(qc, "vendor", VENDOR_ID);

  assert.equal(invalidated(qc, ["/api/albums"]), false);
  assert.equal(invalidated(qc, ["/api/people"]), false);
});

test("the role-prefix sweep is scoped to the vendor kind", async () => {
  const qc = new QueryClient();
  seed(qc, ["/api/vendors?role=maker"]);

  // A non-vendor entity must not reach across and bust the vendor lists.
  await invalidateAdminEntity(qc, "person", VENDOR_ID);

  assert.equal(invalidated(qc, ["/api/vendors?role=maker"]), false);
});
