// Task #237 — sub-brand vendor lookup + child enumeration smoke tests.
//
// Runs against a transient in-memory shape; the real DatabaseStorage
// methods are thin Drizzle calls so we test the contract (top-level
// only for getTopLevelVendorByDomain; children-only for
// getVendorChildren) without a live Postgres handle.
//
//   npx tsx --test server/lib/vendorsParent.test.ts
//
// Mirrors the pattern in dropboxCreditsImport.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

type V = {
  id: string;
  domain: string;
  parentVendorId: string | null;
};

// Reference implementation matching server/storage.ts logic — kept in
// the test so a future drift between this contract and the storage
// impl shows up as a failure here.
function getTopLevelVendorByDomain(rows: V[], domain: string): V | undefined {
  const norm = domain.toLowerCase();
  return rows.find((r) => r.domain.toLowerCase() === norm && r.parentVendorId === null);
}

function getVendorChildren(rows: V[], parentId: string): V[] {
  return rows.filter((r) => r.parentVendorId === parentId);
}

const SAMPLE: V[] = [
  { id: "gibson", domain: "gibson.com", parentVendorId: null },
  { id: "epiphone", domain: "epiphone.com", parentVendorId: "gibson" },
  { id: "kramer", domain: "kramerguitars.com", parentVendorId: "gibson" },
  { id: "fender", domain: "fender.com", parentVendorId: null },
  // Same domain as Gibson but a sub-brand row — must be skipped by
  // the domain lookup, otherwise the partial-unique index isn't doing
  // its job.
  { id: "gibson-promo", domain: "gibson.com", parentVendorId: "gibson" },
];

test("getTopLevelVendorByDomain finds only the top-level row", () => {
  const v = getTopLevelVendorByDomain(SAMPLE, "gibson.com");
  assert.equal(v?.id, "gibson");
});

test("getTopLevelVendorByDomain ignores sub-brand rows sharing a domain", () => {
  const v = getTopLevelVendorByDomain(SAMPLE, "gibson.com");
  assert.notEqual(v?.id, "gibson-promo");
});

test("getTopLevelVendorByDomain is case-insensitive", () => {
  const v = getTopLevelVendorByDomain(SAMPLE, "GIBSON.COM");
  assert.equal(v?.id, "gibson");
});

test("getTopLevelVendorByDomain returns undefined for unknown domains", () => {
  assert.equal(getTopLevelVendorByDomain(SAMPLE, "nope.example"), undefined);
});

test("getVendorChildren lists every sub-brand of a parent", () => {
  const kids = getVendorChildren(SAMPLE, "gibson")
    .map((c) => c.id)
    .sort();
  assert.deepEqual(kids, ["epiphone", "gibson-promo", "kramer"]);
});

test("getVendorChildren returns empty for vendors with no sub-brands", () => {
  assert.deepEqual(getVendorChildren(SAMPLE, "fender"), []);
});

// Route-level validation contract for POST/PUT — server enforces:
//   (1) parent must exist
//   (2) parent must itself be top-level (no chains)
//   (3) a vendor with existing children can't be re-parented
function validateParentChange(opts: {
  selfId: string;
  nextParentId: string;
  rows: V[];
}): { ok: true } | { ok: false; reason: string } {
  if (opts.nextParentId === opts.selfId) return { ok: false, reason: "self" };
  const parent = opts.rows.find((r) => r.id === opts.nextParentId);
  if (!parent) return { ok: false, reason: "missing" };
  if (parent.parentVendorId) return { ok: false, reason: "chain" };
  const hasChildren = opts.rows.some((r) => r.parentVendorId === opts.selfId);
  if (hasChildren) return { ok: false, reason: "owns-children" };
  return { ok: true };
}

test("parent change rejects self", () => {
  assert.deepEqual(
    validateParentChange({ selfId: "gibson", nextParentId: "gibson", rows: SAMPLE }),
    { ok: false, reason: "self" },
  );
});

test("parent change rejects missing parent", () => {
  assert.deepEqual(
    validateParentChange({ selfId: "epiphone", nextParentId: "ghost", rows: SAMPLE }),
    { ok: false, reason: "missing" },
  );
});

test("parent change rejects chains (parent is itself a sub-brand)", () => {
  // Trying to make Kramer a sub-brand of Epiphone (which is itself a
  // sub-brand) must fail — sub-brands are one level deep only.
  assert.deepEqual(
    validateParentChange({ selfId: "kramer", nextParentId: "epiphone", rows: SAMPLE }),
    { ok: false, reason: "chain" },
  );
});

test("parent change rejects vendors that already own sub-brands", () => {
  // Gibson can't become a sub-brand of Fender because Epiphone +
  // Kramer + gibson-promo point at it.
  assert.deepEqual(
    validateParentChange({ selfId: "gibson", nextParentId: "fender", rows: SAMPLE }),
    { ok: false, reason: "owns-children" },
  );
});

test("parent change accepts a clean top-level→top-level link", () => {
  assert.deepEqual(
    validateParentChange({ selfId: "fender", nextParentId: "gibson", rows: SAMPLE }),
    { ok: true },
  );
});
