// Task #1867 — Verify per-box custom add-on shipping persists on the order.
//
// Bill's "Gift of Hope" add-on charges the fan a flat per-box shipping fee
// (× quantity). That fee folds into the SINGLE Stripe shipping option at
// checkout, so Stripe's collected `total_details.amount_shipping` is the
// authoritative charged total.
//
// The hazard this guards: a DIGITAL-only purchase + box has NO vinyl rate-card
// quote, so the session never stamps `gt_ship_base` (it stays null). An earlier
// materialize path gated `shippingChargedCents` on `gt_ship_base` being set,
// which dropped the box shipping to NULL on the order even though Stripe
// charged the fan for it — silently breaking the receipt + refund reconcile.
//
// This test drives a digital line item + a custom_addon box line through the
// real `materializeOrderFromSession` path (with the injectable `{ stripe }`
// seam and an UNPAID session so the paid-only side effects are skipped) and
// asserts the order's `shipping_charged_cents` equals Stripe's collected
// shipping. A pure-digital order (no box) must keep NULL.
//
//   npx tsx --test server/commerce.customAddonShipping.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.

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
    VALUES (${id}, ${"t1867_" + uniq}, ${"t1867_" + uniq + "@example.test"}, ${"t1867 fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t1867 album"}, ${"t1867 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedDigitalSku(albumId: string): Promise<void> {
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents)
    VALUES (${randomUUID()}, ${albumId}, ${"digital"}, ${1500})
  `);
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

const digitalLine = {
  description: "Digital album",
  amount_total: 1500,
  quantity: 1,
  price: {
    unit_amount: 1500,
    product: { name: "Digital album", metadata: { gt_kind: "format", gt_sku: "digital" } },
  },
};

function boxLine(qty: number) {
  return {
    description: "Gift of Hope",
    amount_total: 5000 * qty,
    quantity: qty,
    price: {
      unit_amount: 5000,
      product: {
        name: "Gift of Hope",
        metadata: {
          gt_kind: "custom_addon",
          gt_sku: randomUUID(),
          gt_fulfiller: "Nightbirde Foundation",
          gt_recipient_mode: "specific",
        },
      },
    },
  };
}

test("digital + Gift-of-Hope boxes: per-box shipping persists from Stripe's collected total", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  await seedDigitalSku(albumId);

  // Two boxes × $7/box = $14 collected shipping (Stripe authoritative).
  const BOX_QTY = 2;
  const BOX_SHIP_TOTAL = 1400;

  const sessionId = `cs_test_${randomUUID()}`;
  const session: any = {
    id: sessionId,
    payment_status: "unpaid",
    amount_total: 1500 + 10000 + BOX_SHIP_TOTAL,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    // Stripe's collected pre-tax shipping — the authoritative charged total.
    total_details: { amount_shipping: BOX_SHIP_TOTAL, amount_tax: 0 },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: "digital",
      gt_quantity: "1",
      gt_sku_kind: "digital",
      // Digital purchase => NO vinyl rate-card quote, so gt_ship_base stays "".
      gt_ship_base: "",
      // The box portion is stamped separately so materialize knows shipping
      // applies even without a vinyl leg.
      gt_ship_custom_addon: String(BOX_SHIP_TOTAL),
      gt_ship_charged: String(BOX_SHIP_TOTAL),
    },
  };

  const stripe = makeStripeStub({ session, lineItems: [digitalLine, boxLine(BOX_QTY)] });
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  const [row] = rows(await exec(sql`
    SELECT shipping_charged_cents, shipping_base_cents
      FROM orders WHERE id = ${order.id}
  `));
  assert.ok(row, "the order row should exist");
  assert.equal(
    row.shipping_charged_cents,
    BOX_SHIP_TOTAL,
    "box-only (digital) shipping must persist from Stripe's collected shipping total",
  );
  // No vinyl leg => the rate-card base stays null; only the charged total lands.
  assert.equal(
    row.shipping_base_cents,
    null,
    "digital order has no vinyl rate-card base",
  );
});

test("pure digital (no box): no shipping option, shipping_charged_cents stays NULL", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  await seedDigitalSku(albumId);

  const sessionId = `cs_test_${randomUUID()}`;
  const session: any = {
    id: sessionId,
    payment_status: "unpaid",
    amount_total: 1500,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    total_details: { amount_shipping: 0, amount_tax: 0 },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: "digital",
      gt_quantity: "1",
      gt_sku_kind: "digital",
      gt_ship_base: "",
      gt_ship_custom_addon: "0",
    },
  };

  const stripe = makeStripeStub({ session, lineItems: [digitalLine] });
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  const [row] = rows(await exec(sql`
    SELECT shipping_charged_cents FROM orders WHERE id = ${order.id}
  `));
  assert.ok(row, "the order row should exist");
  assert.equal(
    row.shipping_charged_cents,
    null,
    "a no-shipping digital order must keep shipping_charged_cents NULL",
  );
});
