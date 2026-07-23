// Task #2814 — Prove the test suite can NEVER reach the real Order Desk store.
//
// On June 3–4 2026 the paid-checkout verification tests pushed hundreds of
// fake "Test Fan" orders into the live Order Desk store: auto-push was on at
// the time and the workspace carries live ORDERDESK_STORE_ID/API_KEY
// credentials. Auto-push has since been gated off (ORDERDESK_AUTO_PUSH,
// default off), but nothing structurally prevented a recurrence — until the
// isTestRun() guard in server/orderDesk.ts's odFetch choke point.
//
// This test deliberately recreates the dangerous configuration:
//   • live-looking credentials present (the workspace's real ones, untouched),
//   • ORDERDESK_AUTO_PUSH forced ON,
//   • a PAID physical order driven through the very same
//     materializeOrderFromSession path the Stripe webhook uses,
// and asserts that NO outbound HTTP request to app.orderdesk.me is ever
// attempted. globalThis.fetch is stubbed to fail loudly if any Order Desk
// host is contacted (hermetic-fetch-stub pattern); everything else passes
// through to the real fetch.
//
// It also asserts the guard trips (the order row records the blocked
// message) rather than silently succeeding some other way, and that
// isTestRun() itself detects this process.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test server/orderDesk.testGuard.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { materializeOrderFromSession } from "./commerce";
import { isTestRun } from "./orderDesk";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  orders: new Set<string>(),
  albums: new Set<string>(),
  customers: new Set<string>(),
};

// ── Hermetic fetch stub ────────────────────────────────────────────────
// Any request to an Order Desk host is a hard test failure. Everything
// else (none expected, but e.g. loopback) passes through to the real fetch.
const realFetch = globalThis.fetch;
const orderDeskCalls: string[] = [];

before(() => {
  process.env.ORDERDESK_AUTO_PUSH = "1"; // force the dangerous config
  // Ensure credentials LOOK present even if the env somehow lacks them —
  // the guard must block before credentials are even consulted.
  if (!process.env.ORDERDESK_STORE_ID) process.env.ORDERDESK_STORE_ID = "00000";
  if (!process.env.ORDERDESK_API_KEY) process.env.ORDERDESK_API_KEY = "test-key";
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    if (url.includes("orderdesk.me")) {
      orderDeskCalls.push(url);
      throw new Error(`TEST FAILURE: outbound Order Desk HTTP attempted during a test run: ${url}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  try {
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM user_albums WHERE album_id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.customers) await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});

async function seedCustomer(): Promise<string> {
  const id = randomUUID();
  const uniq = id.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${id}, ${"t2814_" + uniq}, ${"t2814_" + uniq + "@example.test"}, ${"t2814 fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t2814 album"}, ${"t2814 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

function makeStripeStub(opts: { session: any; lineItems: any[] }) {
  return {
    checkout: {
      sessions: {
        retrieve: async (_id: string, _params?: any) => opts.session,
        listLineItems: async (_id: string, _params?: any) => ({ data: opts.lineItems }),
      },
    },
  } as any;
}

test("isTestRun() detects this test process", () => {
  assert.equal(isTestRun(), true, "isTestRun() must be true under the node test runner / GT_TEST");
});

test("paid physical materialization with auto-push ON never hits Order Desk", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();

  const FORMAT = "12_lp";
  const UNIT_PRICE_CENTS = 3000;

  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents)
    VALUES (${randomUUID()}, ${albumId}, ${FORMAT}, ${UNIT_PRICE_CENTS})
  `);

  const sessionId = `cs_test_${randomUUID()}`;
  const session: any = {
    id: sessionId,
    payment_status: "paid",
    amount_total: UNIT_PRICE_CENTS,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: FORMAT,
      gt_quantity: "1",
      gt_sku_kind: "vinyl",
    },
  };
  const lineItems = [
    {
      description: FORMAT,
      amount_total: UNIT_PRICE_CENTS,
      quantity: 1,
      price: {
        unit_amount: UNIT_PRICE_CENTS,
        product: { name: FORMAT, metadata: { gt_kind: "format", gt_sku: FORMAT } },
      },
    },
  ];

  const stripe = makeStripeStub({ session, lineItems });
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  assert.equal(order.status, "paid", "the fixture session is PAID so the order must materialize as paid");

  // The core assertion: no HTTP request to Order Desk was even attempted.
  assert.equal(
    orderDeskCalls.length,
    0,
    `NO outbound Order Desk request may happen in a test run — got: ${orderDeskCalls.join(", ")}`,
  );

  // And prove the guard actually tripped (auto-push DID try, and was
  // blocked at the odFetch choke point), rather than the push being
  // skipped for some unrelated reason.
  const [row] = rows(await exec(sql`
    SELECT order_desk_order_id, fulfillment_status, fulfillment_error
      FROM orders WHERE id = ${order.id}
  `));
  assert.equal(row.order_desk_order_id, null, "no Order Desk order id may be recorded in a test run");
  assert.equal(row.fulfillment_status, "pending", "the order must stay pending for a later real push");
  assert.match(
    String(row.fulfillment_error ?? ""),
    /blocked.*test run/i,
    "the guard's blocked-in-test-run message must be recorded on the order row",
  );
});
