// Task #1919 — coverage for the Orders page "needs push" alert badge logic.
//
// The badge counts paid physical orders whose Order Desk push failed
// (non-null fulfillmentError), clicking it scopes the list to those rows,
// and it clears itself once every error resolves. The decision logic lives
// in four pure helpers exported from AdminOrders.tsx, so we test those
// directly instead of mounting the heavy AdminFrame module graph (same
// approach as adminCustomerJoinedDate.test.ts).
//
// Runs under Node's built-in runner via tsx:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/adminOrdersNeedsPush.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// AdminOrders.tsx pulls PNG asset imports + import.meta.env (via AdminFrame)
// at module load, so register the shared asset-stub loader + env shim first.
register("./assetStubLoader.mjs", import.meta.url);
(globalThis as any).__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

const {
  orderNeedsPush,
  countOrdersNeedingPush,
  applyOrderScope,
  nextScopeOnNeedsAttentionToggle,
} = await import("./AdminOrders");
import type { AdminOrderRow } from "./AdminOrders";

function makeOrder(overrides: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    id: "o1",
    status: "paid",
    skuKind: "vinyl",
    fulfillmentError: null,
    items: [],
    ...overrides,
  } as AdminOrderRow;
}

// ── orderNeedsPush: paid-only + physical-only gate ───────────────────────
test("paid physical order with an error needs a push", () => {
  assert.equal(
    orderNeedsPush(makeOrder({ status: "paid", skuKind: "vinyl", fulfillmentError: "OD down" })),
    true,
  );
});

test("a refunded physical order with a stale error does NOT need a push", () => {
  // The blocking review finding: refunds are nothing to push, so a stale
  // error on a non-paid order must not light the badge.
  assert.equal(
    orderNeedsPush(makeOrder({ status: "refunded", skuKind: "vinyl", fulfillmentError: "OD down" })),
    false,
  );
});

test("a paid physical order with NO error does not need a push (clears on success)", () => {
  assert.equal(
    orderNeedsPush(makeOrder({ status: "paid", skuKind: "vinyl", fulfillmentError: null })),
    false,
  );
});

test("a paid DIGITAL order with an error never needs a push (only physical ships)", () => {
  assert.equal(
    orderNeedsPush(makeOrder({ status: "paid", skuKind: "digital", fulfillmentError: "OD down" })),
    false,
  );
});

test("every physical sku kind counts (vinyl/cassette/cd/bundle)", () => {
  for (const skuKind of ["vinyl", "cassette", "cd", "bundle"]) {
    assert.equal(
      orderNeedsPush(makeOrder({ status: "paid", skuKind, fulfillmentError: "x" })),
      true,
      `${skuKind} should need a push`,
    );
  }
});

// ── countOrdersNeedingPush: badge count is paid-only, clears at 0 ─────────
test("the badge count tallies only paid physical orders with errors", () => {
  const orders = [
    makeOrder({ id: "a", status: "paid", skuKind: "vinyl", fulfillmentError: "down" }), // counts
    makeOrder({ id: "b", status: "refunded", skuKind: "vinyl", fulfillmentError: "down" }), // refunded → no
    makeOrder({ id: "c", status: "paid", skuKind: "digital", fulfillmentError: "down" }), // digital → no
    makeOrder({ id: "d", status: "paid", skuKind: "bundle", fulfillmentError: "down" }), // counts
    makeOrder({ id: "e", status: "paid", skuKind: "vinyl", fulfillmentError: null }), // resolved → no
  ];
  assert.equal(countOrdersNeedingPush(orders), 2);
});

test("the badge count drops to 0 once every error resolves (badge clears)", () => {
  const resolved = [
    makeOrder({ id: "a", status: "paid", skuKind: "vinyl", fulfillmentError: null }),
    makeOrder({ id: "d", status: "paid", skuKind: "bundle", fulfillmentError: null }),
  ];
  assert.equal(countOrdersNeedingPush(resolved), 0);
});

// ── applyOrderScope: needs-attention filter ──────────────────────────────
test("needs-attention scope keeps only the paid-error rows", () => {
  const orders = [
    makeOrder({ id: "a", status: "paid", skuKind: "vinyl", fulfillmentError: "down" }),
    makeOrder({ id: "b", status: "paid", skuKind: "vinyl", fulfillmentError: null }),
    makeOrder({ id: "c", status: "refunded", skuKind: "vinyl", fulfillmentError: "down" }),
  ];
  const scoped = applyOrderScope(orders, {
    needsAttentionOnly: true,
    statusFilter: "all",
    fulfillerFilter: "all",
  });
  assert.deepEqual(scoped.map((o) => o.id), ["a"]);
});

test("with the scope off, the status filter still applies as before", () => {
  const orders = [
    makeOrder({ id: "a", status: "paid" }),
    makeOrder({ id: "b", status: "refunded" }),
  ];
  const scoped = applyOrderScope(orders, {
    needsAttentionOnly: false,
    statusFilter: "refunded",
    fulfillerFilter: "all",
  });
  assert.deepEqual(scoped.map((o) => o.id), ["b"]);
});

// ── nextScopeOnNeedsAttentionToggle: clicking from a non-"all" status ─────
test("enabling the badge from a non-'all' status forces the status filter to 'all'", () => {
  // The review finding: an operator sitting on the 'shipped' (or 'refunded')
  // filter who clicks the badge must not land on an empty list — the paid
  // error rows would be hidden by the status filter otherwise.
  const next = nextScopeOnNeedsAttentionToggle({
    needsAttentionOnly: false,
    statusFilter: "shipped",
  });
  assert.deepEqual(next, { needsAttentionOnly: true, statusFilter: "all" });
});

test("clicking from a non-'all' status then scoping shows the paid-error rows", () => {
  const orders = [
    makeOrder({ id: "a", status: "paid", skuKind: "vinyl", fulfillmentError: "down" }),
    makeOrder({ id: "b", status: "shipped", skuKind: "vinyl", fulfillmentError: null }),
  ];
  // Operator is on the "shipped" filter and clicks the badge.
  const next = nextScopeOnNeedsAttentionToggle({
    needsAttentionOnly: false,
    statusFilter: "shipped",
  });
  const scoped = applyOrderScope(orders, {
    needsAttentionOnly: next.needsAttentionOnly,
    statusFilter: next.statusFilter,
    fulfillerFilter: "all",
  });
  assert.deepEqual(scoped.map((o) => o.id), ["a"], "the paid-error row is visible, not hidden by 'shipped'");
});

test("disabling the badge leaves the operator's status filter untouched", () => {
  const next = nextScopeOnNeedsAttentionToggle({
    needsAttentionOnly: true,
    statusFilter: "paid",
  });
  assert.deepEqual(next, { needsAttentionOnly: false, statusFilter: "paid" });
});
