// Task #1629 — Verify Stripe Tax breakout reconciles on the order.
//
// With `automatic_tax` on and `tax_behavior: "exclusive"`, Stripe returns
// tax-INCLUSIVE `amount_total` on each line item and on `shipping_cost`, while
// `total_details.amount_tax` separately reports the whole tax (items + shipping).
// The receipt / order summary breaks out a dedicated Tax line, so the stored
// item + shipping amounts MUST be PRE-TAX or the fan sees tax twice and the
// breakdown won't sum to the total.
//
// This drives a representative taxed checkout through the same
// `materializeOrderFromSession` path the webhook uses and asserts:
//   1) each order_items.unit_price_cents is the PRE-TAX line amount
//      (amount_subtotal), NOT the tax-inclusive amount_total,
//   2) orders.tax_cents == total_details.amount_tax,
//   3) orders.shipping_charged_cents is the PRE-TAX (quoted) shipping, NOT the
//      tax-inclusive shipping_cost.amount_total,
//   4) items-subtotal + shipping + tax == orders.total_cents (reconciles).
//
// Session is left UNPAID so the paid-only side effects are skipped — the order
// + order_items insert (the surface under test) happens regardless. Stripe is
// never called: a stub returns the fixture session + line items.
//
//   npx tsx --test server/commerce.taxReconcile.db.test.ts
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
    VALUES (${id}, ${"t1629_" + uniq}, ${"t1629_" + uniq + "@example.test"}, ${"t1629 fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t1629 album"}, ${"t1629 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedVinylSku(albumId: string, format: string): Promise<void> {
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents)
    VALUES (${randomUUID()}, ${albumId}, ${format}, ${3500})
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

test("materializeOrderFromSession stores PRE-TAX item/shipping amounts and a reconciling tax breakout", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const VINYL_FORMAT = "12_lp";
  await seedVinylSku(albumId, VINYL_FORMAT);

  // Pre-tax economics: $35.00 record + $5.00 shipping (the quote). Stripe Tax
  // adds 10% on both → $4.00 tax. Tax-inclusive line/shipping totals are what
  // a real "exclusive" session reports alongside the pre-tax subtotals.
  const ITEM_SUBTOTAL = 3500; // pre-tax line amount (amount_subtotal)
  const ITEM_TAX = 350;
  const ITEM_TOTAL = ITEM_SUBTOTAL + ITEM_TAX; // tax-inclusive amount_total
  const SHIP_SUBTOTAL = 500; // pre-tax shipping (== quote)
  const SHIP_TAX = 50;
  const SHIP_TOTAL = SHIP_SUBTOTAL + SHIP_TAX;
  const TAX_TOTAL = ITEM_TAX + SHIP_TAX; // total_details.amount_tax (items + shipping)
  const GRAND_TOTAL = ITEM_SUBTOTAL + SHIP_SUBTOTAL + TAX_TOTAL;

  const sessionId = `cs_test_${randomUUID()}`;
  const session: any = {
    id: sessionId,
    payment_status: "unpaid",
    amount_total: GRAND_TOTAL,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    total_details: { amount_tax: TAX_TOTAL, amount_shipping: SHIP_SUBTOTAL },
    shipping_cost: { amount_total: SHIP_TOTAL, amount_subtotal: SHIP_SUBTOTAL },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: VINYL_FORMAT,
      gt_quantity: "1",
      gt_sku_kind: "vinyl",
      // Presence of gt_ship_base flips materialize into the shipping branch.
      gt_ship_base: String(SHIP_SUBTOTAL),
      gt_ship_markup: "0",
      gt_ship_charged: String(SHIP_SUBTOTAL),
      gt_ship_country: "US",
      gt_ship_band: "single_lp",
    },
  };

  const lineItems = [
    {
      description: '12" LP',
      // A real Stripe "exclusive" line item carries BOTH: pre-tax subtotal and
      // tax-inclusive total. We must snapshot the PRE-TAX one.
      amount_subtotal: ITEM_SUBTOTAL,
      amount_total: ITEM_TOTAL,
      quantity: 1,
      price: {
        unit_amount: ITEM_SUBTOTAL,
        product: { name: '12" LP', metadata: { gt_kind: "format", gt_sku: VINYL_FORMAT } },
      },
    },
  ];

  const stripe = makeStripeStub({ session, lineItems });
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  const orderRow = rows(await exec(sql`
    SELECT total_cents, tax_cents, shipping_charged_cents FROM orders WHERE id = ${order.id}
  `))[0];
  const items = rows(await exec(sql`
    SELECT unit_price_cents, quantity FROM order_items WHERE order_id = ${order.id}
  `));

  assert.equal(items.length, 1, "the format line item should materialize");
  assert.equal(
    Number(items[0].unit_price_cents),
    ITEM_SUBTOTAL,
    "order_items.unit_price_cents must be the PRE-TAX amount (amount_subtotal), not tax-inclusive amount_total",
  );
  assert.equal(Number(orderRow.tax_cents), TAX_TOTAL, "orders.tax_cents must equal total_details.amount_tax");
  assert.equal(
    Number(orderRow.shipping_charged_cents),
    SHIP_SUBTOTAL,
    "orders.shipping_charged_cents must be PRE-TAX shipping (the quote), not the tax-inclusive shipping_cost.amount_total",
  );
  assert.equal(Number(orderRow.total_cents), GRAND_TOTAL, "orders.total_cents must be the tax-inclusive grand total");

  // The receipt/summary identity: items-subtotal + shipping + tax == total.
  const itemsSubtotal = items.reduce((a, b) => a + Number(b.unit_price_cents) * Number(b.quantity), 0);
  assert.equal(
    itemsSubtotal + Number(orderRow.shipping_charged_cents) + Number(orderRow.tax_cents),
    Number(orderRow.total_cents),
    "items-subtotal + shipping + tax must reconcile to the order total (no double-counted tax)",
  );
});
