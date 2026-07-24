// Task #2848 — Phase 6 GraphQL migration: refunds (the final REST call).
//
// `POST orders/:id/refunds/calculate.json` → `order.suggestedRefund`
// query (advisory preview) and `POST orders/:id/refunds.json` →
// `mutation refundCreate`. Callers keep speaking numeric REST ids; the
// Phase 6 helpers translate at the boundary. Hermetic (stubbed
// globalThis.fetch — no network):
//
//   (a) gid builder for OrderTransaction.
//   (b) fetchSuggestedRefund: sends the suggestedRefund query, maps
//       shopMoney amounts; null on missing order; never throws.
//   (c) issueRefundCreate: sends refundCreate with the RefundInput shape
//       (orderId gid, notify, note, transactions[] with parent gid +
//       kind REFUND + gateway), returns the numeric refund id.
//   (d) userErrors / missing-refund-id → throws "Shopify refund failed".
//   (e) webhook topic map no longer registers orders/refunded (removed
//       from the 2026-01 enum) but the enum→topic fallback still decodes
//       it for legacy rows.
//
//   npx tsx --test server/shopifyGraphqlPhase6.test.ts
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { __internal } from "./shopify";
import { pool } from "./db";

const { orderTransactionGid, fetchSuggestedRefund, issueRefundCreate, webhookTopicToEnum, webhookEnumToTopic } =
  __internal as any;

after(async () => {
  await pool.end().catch(() => {});
});

const STORE = { id: "phase6-test-store", shopDomain: "phase6-test.myshopify.com", accessToken: "" } as any;

async function withGraphqlStub(
  respond: (body: { query: string; variables: any }) => any,
  fn: () => Promise<void>,
) {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(init?.body ?? "{}");
      return new Response(JSON.stringify({ data: respond(body) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("(a) orderTransactionGid builder", () => {
  assert.equal(orderTransactionGid(123), "gid://shopify/OrderTransaction/123");
  assert.equal(orderTransactionGid("456"), "gid://shopify/OrderTransaction/456");
});

test("(b) fetchSuggestedRefund maps amounts and never throws", async () => {
  const seen: any[] = [];
  await withGraphqlStub(
    (body) => {
      seen.push(body);
      return {
        order: {
          suggestedRefund: {
            amountSet: { shopMoney: { amount: "12.34" } },
            maximumRefundableSet: { shopMoney: { amount: "20.00" } },
          },
        },
      };
    },
    async () => {
      const r = await fetchSuggestedRefund(STORE, "555");
      assert.deepEqual(r, { amount: "12.34", maximumRefundable: "20.00" });
    },
  );
  assert.match(seen[0].query, /suggestedRefund/);
  assert.equal(seen[0].variables.id, "gid://shopify/Order/555");

  // Missing order → null, no throw.
  await withGraphqlStub(
    () => ({ order: null }),
    async () => {
      assert.equal(await fetchSuggestedRefund(STORE, "555"), null);
    },
  );

  // Transport blows up → null, no throw (preview is advisory-only).
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as any;
    assert.equal(await fetchSuggestedRefund(STORE, "555"), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("(c) issueRefundCreate sends the RefundInput shape and returns the numeric id", async () => {
  const seen: any[] = [];
  await withGraphqlStub(
    (body) => {
      seen.push(body);
      return {
        refundCreate: {
          refund: { id: "gid://shopify/Refund/98765" },
          userErrors: [],
        },
      };
    },
    async () => {
      const r = await issueRefundCreate(STORE, {
        shopifyOrderId: "555",
        amount: "12.34",
        note: "GoodTunes admin refund",
        parentTransactionId: 777,
        gateway: "shopify_payments",
      });
      assert.deepEqual(r, { refundId: "98765" });
    },
  );
  assert.match(seen[0].query, /refundCreate\(input: \$input\)/);
  assert.deepEqual(seen[0].variables.input, {
    orderId: "gid://shopify/Order/555",
    notify: true,
    note: "GoodTunes admin refund",
    transactions: [
      {
        orderId: "gid://shopify/Order/555",
        parentId: "gid://shopify/OrderTransaction/777",
        amount: "12.34",
        kind: "REFUND",
        gateway: "shopify_payments",
      },
    ],
  });
});

test("(d) issueRefundCreate throws on userErrors and on missing refund id", async () => {
  await withGraphqlStub(
    () => ({
      refundCreate: {
        refund: null,
        userErrors: [{ field: ["input"], message: "Cannot refund more than available" }],
      },
    }),
    async () => {
      await assert.rejects(
        issueRefundCreate(STORE, {
          shopifyOrderId: "555",
          amount: "999.00",
          note: "x",
          parentTransactionId: 1,
          gateway: "g",
        }),
        /Shopify refund failed: Cannot refund more than available/,
      );
    },
  );

  await withGraphqlStub(
    () => ({ refundCreate: { refund: null, userErrors: [] } }),
    async () => {
      await assert.rejects(
        issueRefundCreate(STORE, {
          shopifyOrderId: "555",
          amount: "1.00",
          note: "x",
          parentTransactionId: 1,
          gateway: "g",
        }),
        /no refund id returned/,
      );
    },
  );
});

test("(e) orders/refunded dropped from registration map, decodes via fallback", () => {
  assert.equal(webhookTopicToEnum["orders/refunded"], undefined);
  assert.equal(webhookTopicToEnum["refunds/create"], "REFUNDS_CREATE");
  // Legacy subscriptions listing an old enum still decode to the REST form.
  assert.equal(webhookEnumToTopic("ORDERS_REFUNDED"), "orders/refunded");
});
