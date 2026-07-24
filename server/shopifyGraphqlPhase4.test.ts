// Task #2846 — Phase 4 GraphQL migration: orders, webhooks, transactions.
//
// The webhook-registration, order-update (note_attributes stamp), and
// order-transaction REST calls in server/shopify.ts moved to Admin
// GraphQL. Callers keep speaking the REST vocabulary, bridged by the
// Phase 4 helpers. These tests pin that bridge hermetically (stubbed
// globalThis.fetch — no network):
//
//   (a) topic mapping: REST topic strings ↔ WebhookSubscriptionTopic
//       enums, including the generic first-underscore fallback.
//   (b) createWebhookSubscription: sends the right mutation variables,
//       returns "registered" on clean success and "already_registered"
//       on Shopify's duplicate-address userError (the GraphQL analogue
//       of REST's 422), throws on any other userError.
//   (c) listWebhookSubscriptions: maps nodes to REST-style
//       { topic, address } rows the inspect route compares against.
//   (d) updateOrderCustomAttributes: sends orderUpdate with an Order gid
//       + customAttributes, throws on userErrors.
//   (e) gqlTransactionToRest / fetchOrderTransactions: numeric ids off
//       the gid tail, lowercase kind/status, snake_case parent_id, and
//       a throw for a missing order (GraphQL `order: null` vs REST 404).
//
//   npx tsx --test server/shopifyGraphqlPhase4.test.ts
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { __internal } from "./shopify";
import { pool } from "./db";

const {
  orderGid,
  webhookEnumToTopic,
  createWebhookSubscription,
  listWebhookSubscriptions,
  updateOrderCustomAttributes,
  gqlTransactionToRest,
  fetchOrderTransactions,
} = __internal as any;

after(async () => {
  await pool.end().catch(() => {});
});

const STORE = { id: "phase4-test-store", shopDomain: "phase4-test.myshopify.com", accessToken: "" } as any;

// Stub fetch for the duration of `fn`. `respond` receives the parsed
// GraphQL body ({ query, variables }) and returns the `data` payload.
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

test("(a) topic mapping round-trips ours and falls back generically", () => {
  assert.equal(webhookEnumToTopic("ORDERS_PAID"), "orders/paid");
  assert.equal(webhookEnumToTopic("ORDERS_REFUNDED"), "orders/refunded");
  assert.equal(webhookEnumToTopic("REFUNDS_CREATE"), "refunds/create");
  assert.equal(webhookEnumToTopic("APP_UNINSTALLED"), "app/uninstalled");
  // Fallback: only the FIRST underscore becomes a slash.
  assert.equal(webhookEnumToTopic("CUSTOMERS_DATA_REQUEST"), "customers/data_request");
  assert.equal(webhookEnumToTopic("ORDERS_FULFILLED"), "orders/fulfilled");
});

test("(a) orderGid builds an Admin API global id", () => {
  assert.equal(orderGid("12345"), "gid://shopify/Order/12345");
});

test("(b) createWebhookSubscription: registered / already_registered / other error", async () => {
  const seen: any[] = [];
  await withGraphqlStub(
    (body) => {
      seen.push(body.variables);
      return {
        webhookSubscriptionCreate: {
          webhookSubscription: { id: "gid://shopify/WebhookSubscription/1" },
          userErrors: [],
        },
      };
    },
    async () => {
      const r = await createWebhookSubscription(STORE, "orders/paid", "https://app.example/api/webhooks/shopify/orders");
      assert.equal(r, "registered");
    },
  );
  assert.equal(seen[0].topic, "ORDERS_PAID");
  assert.deepEqual(seen[0].webhookSubscription, {
    callbackUrl: "https://app.example/api/webhooks/shopify/orders",
    format: "JSON",
  });

  await withGraphqlStub(
    () => ({
      webhookSubscriptionCreate: {
        webhookSubscription: null,
        userErrors: [{ field: ["webhookSubscription"], message: "Address for this topic has already been taken" }],
      },
    }),
    async () => {
      const r = await createWebhookSubscription(STORE, "app/uninstalled", "https://app.example/x");
      assert.equal(r, "already_registered");
    },
  );

  await withGraphqlStub(
    () => ({
      webhookSubscriptionCreate: {
        webhookSubscription: null,
        userErrors: [{ field: null, message: "Invalid callback url" }],
      },
    }),
    async () => {
      await assert.rejects(
        () => createWebhookSubscription(STORE, "refunds/create", "notaurl"),
        /Invalid callback url/,
      );
    },
  );

  // Unknown topic never reaches the network.
  await assert.rejects(() => createWebhookSubscription(STORE, "orders/mystery", "https://x"), /Unknown webhook topic/);
});

test("(c) listWebhookSubscriptions maps nodes to REST-style rows", async () => {
  await withGraphqlStub(
    () => ({
      webhookSubscriptions: {
        nodes: [
          {
            id: "gid://shopify/WebhookSubscription/11",
            topic: "ORDERS_PAID",
            endpoint: { __typename: "WebhookHttpEndpoint", callbackUrl: "https://app.example/api/webhooks/shopify/orders" },
          },
          {
            id: "gid://shopify/WebhookSubscription/12",
            topic: "APP_UNINSTALLED",
            endpoint: { __typename: "WebhookEventBridgeEndpoint" },
          },
        ],
      },
    }),
    async () => {
      const rows = await listWebhookSubscriptions(STORE);
      assert.equal(rows.length, 2);
      assert.deepEqual(rows[0], {
        id: "gid://shopify/WebhookSubscription/11",
        topic: "orders/paid",
        address: "https://app.example/api/webhooks/shopify/orders",
      });
      assert.equal(rows[1].topic, "app/uninstalled");
      assert.equal(rows[1].address, null); // non-HTTP endpoint
    },
  );
});

test("(d) updateOrderCustomAttributes sends orderUpdate and throws on userErrors", async () => {
  const seen: any[] = [];
  await withGraphqlStub(
    (body) => {
      seen.push(body.variables);
      return { orderUpdate: { order: { id: "gid://shopify/Order/777" }, userErrors: [] } };
    },
    async () => {
      await updateOrderCustomAttributes(STORE, "777", [
        { key: "GoodTunes redemption URL", value: "https://my.goodtunes.music/redeem/abc" },
      ]);
    },
  );
  assert.equal(seen[0].input.id, "gid://shopify/Order/777");
  assert.deepEqual(seen[0].input.customAttributes, [
    { key: "GoodTunes redemption URL", value: "https://my.goodtunes.music/redeem/abc" },
  ]);

  await withGraphqlStub(
    () => ({ orderUpdate: { order: null, userErrors: [{ field: ["id"], message: "Order does not exist" }] } }),
    async () => {
      await assert.rejects(
        () => updateOrderCustomAttributes(STORE, "999", [{ key: "k", value: "v" }]),
        /Order does not exist/,
      );
    },
  );
});

test("(e) gqlTransactionToRest maps to the legacy REST transaction shape", () => {
  const t = gqlTransactionToRest({
    id: "gid://shopify/OrderTransaction/6001",
    kind: "CAPTURE",
    status: "SUCCESS",
    gateway: "shopify_payments",
    amountSet: { shopMoney: { amount: "29.99" } },
    parentTransaction: { id: "gid://shopify/OrderTransaction/5001" },
  });
  assert.deepEqual(t, {
    id: 6001,
    kind: "capture",
    status: "success",
    gateway: "shopify_payments",
    amount: "29.99",
    parent_id: 5001,
  });
  const bare = gqlTransactionToRest({
    id: "gid://shopify/OrderTransaction/6002",
    kind: "SALE",
    status: "SUCCESS",
    gateway: null,
    amountSet: null,
    parentTransaction: null,
  });
  assert.equal(bare.gateway, "");
  assert.equal(bare.amount, "0");
  assert.equal(bare.parent_id, null);
});

test("(e) fetchOrderTransactions: REST rows for found, throw for missing order", async () => {
  await withGraphqlStub(
    (body) => ({
      order:
        body.variables.id === "gid://shopify/Order/321"
          ? {
              transactions: [
                {
                  id: "gid://shopify/OrderTransaction/1",
                  kind: "SALE",
                  status: "SUCCESS",
                  gateway: "shopify_payments",
                  amountSet: { shopMoney: { amount: "10.00" } },
                  parentTransaction: null,
                },
              ],
            }
          : null,
    }),
    async () => {
      const rows = await fetchOrderTransactions(STORE, "321");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, "sale");
      assert.equal(rows[0].status, "success");
      await assert.rejects(() => fetchOrderTransactions(STORE, "404404"), /not found/);
    },
  );
});
