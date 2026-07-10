// Task #2642 — Regression test for the missing-shipping-address bug.
//
// Under the pinned Basil Stripe API version (2025-08-27.basil), a Checkout
// Session's shipping snapshot moved from `session.shipping_details` to
// `session.collected_information.shipping_details`. materializeOrderFromSession
// was still reading the legacy field (plus had a `??`/`?:` precedence bug),
// so every physical order materialized a name-only shipping_address (all
// address fields null) — this silently blanked the fulfillment CSV.
//
// This test drives `materializeOrderFromSession` with a Stripe stub shaped
// like a real Basil session (`collected_information.shipping_details`) and
// asserts the persisted `orders.shipping_address` carries the full address,
// not just the name.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/commerce.shippingAddress.db.test.ts

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { materializeOrderFromSession } from "./commerce";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  orders: new Set<string>(),
  albums: new Set<string>(),
  customers: new Set<string>(),
};

after(async () => {
  try {
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
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
    VALUES (${id}, ${"t2642_" + uniq}, ${"t2642_" + uniq + "@example.test"}, ${"t2642 fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t2642 album"}, ${"t2642 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedVinylSku(albumId: string): Promise<void> {
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents)
    VALUES (${randomUUID()}, ${albumId}, ${"12_lp"}, ${3500})
  `);
}

function makeStripeStub(session: any) {
  const lineItems = [
    {
      description: '12" LP',
      amount_total: 3500,
      quantity: 1,
      price: {
        unit_amount: 3500,
        product: { name: '12" LP', metadata: { gt_kind: "format", gt_sku: "12_lp" } },
      },
    },
  ];
  return {
    checkout: {
      sessions: {
        retrieve: async (_id: string, _params?: any) => session,
        listLineItems: async (_id: string, _params?: any) => ({ data: lineItems }),
      },
    },
  } as any;
}

test("materializeOrderFromSession reads shipping address from collected_information (Basil shape)", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  await seedVinylSku(albumId);

  const sessionId = `cs_test_${randomUUID()}`;
  const session: any = {
    id: sessionId,
    payment_status: "unpaid",
    amount_total: 3500,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    // Basil-shaped: shipping now lives under collected_information, not the
    // legacy top-level `shipping_details`.
    collected_information: {
      shipping_details: {
        name: "Test Fan",
        address: {
          line1: "123 Main St",
          line2: "Apt 4",
          city: "Nashville",
          state: "TN",
          postal_code: "37201",
          country: "US",
        },
      },
    },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: "12_lp",
      gt_quantity: "1",
      gt_sku_kind: "vinyl",
    },
  };

  const stripe = makeStripeStub(session);
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  const [row] = rows(await exec(sql`
    SELECT shipping_address FROM orders WHERE id = ${order.id}
  `));

  assert.ok(row, "order row should exist");
  const addr = row.shipping_address;
  assert.ok(addr, "shipping_address should be populated");
  assert.equal(addr.line1, "123 Main St", "line1 must be read from collected_information.shipping_details");
  assert.equal(addr.line2, "Apt 4");
  assert.equal(addr.city, "Nashville");
  assert.equal(addr.state, "TN");
  assert.equal(addr.postalCode, "37201");
  assert.equal(addr.country, "US");
  assert.equal(addr.name, "Test Fan");
});

test("materializeOrderFromSession falls back to legacy top-level shipping_details", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  await seedVinylSku(albumId);

  const sessionId = `cs_test_${randomUUID()}`;
  const session: any = {
    id: sessionId,
    payment_status: "unpaid",
    amount_total: 3500,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan2@example.test", name: "Legacy Fan", phone: null, address: null },
    // Legacy pre-Basil shape — no collected_information at all.
    shipping_details: {
      name: "Legacy Fan",
      address: {
        line1: "456 Oak Ave",
        line2: null,
        city: "Austin",
        state: "TX",
        postal_code: "73301",
        country: "US",
      },
    },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: "12_lp",
      gt_quantity: "1",
      gt_sku_kind: "vinyl",
    },
  };

  const stripe = makeStripeStub(session);
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  const [row] = rows(await exec(sql`
    SELECT shipping_address FROM orders WHERE id = ${order.id}
  `));

  const addr = row.shipping_address;
  assert.ok(addr, "shipping_address should be populated via legacy fallback");
  assert.equal(addr.line1, "456 Oak Ave");
  assert.equal(addr.city, "Austin");
});
