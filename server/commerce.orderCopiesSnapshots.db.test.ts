// Task #1136 — Verify per-copy order snapshot fields at checkout.
//
// `order_copies` is the gift-able per-physical-copy view written alongside
// the aggregate `order_items` rows at materialize time. One row per copy in
// a multi-quantity order, each stamping its own point-in-time snapshot:
// `vinylColor` / `jacketUpgrade` (copied off the album SKU), `booklet`
// (the 7" "+ booklet" bundle flag from `gt_booklet_bundle`), and the
// `formatPriceCents` / `addonPriceCents` the fan actually paid for that copy.
//
// The schema-drift guard only proves those columns *exist* — it can't catch
// a write path that stops *populating* one. If `materializeOrderFromSession`
// ever stops stamping one, a fan could get a copy with a silently-wrong
// color / jacket / booklet flag on its certificate and fulfillment record.
// This test drives a representative multi-quantity checkout through the very
// same `materializeOrderFromSession` path the Stripe webhook uses, then reads
// the inserted `order_copies` rows back and asserts every snapshot field is
// populated and matches the fixture, failing loudly naming the field.
//
// Stripe is never called: `materializeOrderFromSession` takes an injectable
// `{ stripe }` seam and we hand it a stub that returns our fixture session +
// line items. Unlike the `order_items` sibling test (which stays UNPAID),
// this session is PAID so the copy-numbering branch fires and the per-copy
// rows are written — which is exactly the surface under test. The paid-only
// side effects (GoodDeed numbering, stock, referral credits, cert mint,
// receipt email, Order Desk) are all best-effort and tolerate the minimal
// fixture seeded here.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test server/commerce.orderCopiesSnapshots.db.test.ts
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
    // order_items / order_copies cascade on orders delete (FK onDelete: cascade).
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
    // The PAID path unlocks the album for the fan by inserting a
    // `user_albums` entitlement row, whose album_id FK is NO ACTION — clear it
    // before deleting the album (album_skus etc. cascade on albums delete).
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
    VALUES (${id}, ${"t1136_" + uniq}, ${"t1136_" + uniq + "@example.test"}, ${"t1136 fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t1136 album"}, ${"t1136 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedVinylSku(opts: {
  albumId: string;
  format: string;
  priceCents: number;
  vinylColor: string;
  jacketUpgrade: string;
}): Promise<void> {
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents, vinyl_color, jacket_upgrade)
    VALUES (${randomUUID()}, ${opts.albumId}, ${opts.format}, ${opts.priceCents}, ${opts.vinylColor}, ${opts.jacketUpgrade})
  `);
}

// A minimal Stripe stub exposing only what materializeOrderFromSession reads:
// checkout.sessions.retrieve (the expanded session) and listLineItems.
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

test("materializeOrderFromSession stamps every order_copies snapshot field", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();

  const VINYL_FORMAT = "7_single";
  const VINYL_COLOR = "translucent_mint";
  const JACKET_UPGRADE = "gatefold";
  const UNIT_PRICE_CENTS = 2500; // 7" + booklet bundle price the fan paid
  const SIGNED_CERT_PRICE_CENTS = 1500;
  const QUANTITY = 3;
  // Mix of signed (1) and unsigned (0): copies 1 & 3 signed, copy 2 not.
  const COPIES_MASK = "101";

  await seedVinylSku({
    albumId,
    format: VINYL_FORMAT,
    priceCents: UNIT_PRICE_CENTS,
    vinylColor: VINYL_COLOR,
    jacketUpgrade: JACKET_UPGRADE,
  });

  const sessionId = `cs_test_${randomUUID()}`;
  // PAID — exercises the per-copy order_copies insert + copy-numbering branch.
  const session: any = {
    id: sessionId,
    payment_status: "paid",
    amount_total: UNIT_PRICE_CENTS * QUANTITY + SIGNED_CERT_PRICE_CENTS * 2,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: VINYL_FORMAT,
      gt_quantity: String(QUANTITY),
      gt_sku_kind: "vinyl",
      gt_copies: COPIES_MASK,
      gt_signed_cert: "1",
      gt_signed_cert_price: String(SIGNED_CERT_PRICE_CENTS),
      // 7" "+ booklet" bundle variant — every copy is stamped with-booklet.
      gt_booklet_bundle: "1",
    },
  };

  // One aggregate vinyl `format` line item covering all 3 copies. The
  // per-copy formatPriceCents is derived from amount_total / quantity, so the
  // line item's amount_total must be the run total (unit × quantity).
  const lineItems = [
    {
      description: '7" single — translucent mint (+ booklet)',
      amount_total: UNIT_PRICE_CENTS * QUANTITY,
      quantity: QUANTITY,
      price: {
        unit_amount: UNIT_PRICE_CENTS,
        product: { name: '7" single', metadata: { gt_kind: "format", gt_sku: VINYL_FORMAT } },
      },
    },
  ];

  const stripe = makeStripeStub({ session, lineItems });
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  assert.equal(order.status, "paid", "the fixture session is PAID so the order must materialize as paid");

  const copies = rows(await exec(sql`
    SELECT position, signed_cert, booklet, format_price_cents, addon_price_cents, vinyl_color, jacket_upgrade
      FROM order_copies WHERE order_id = ${order.id} ORDER BY position ASC
  `));

  assert.equal(
    copies.length,
    QUANTITY,
    `a ${QUANTITY}-copy order must materialize ${QUANTITY} order_copies rows (got ${copies.length})`,
  );

  const expectedCertPattern = Array.from({ length: QUANTITY }, (_, i) => COPIES_MASK[i] === "1");

  for (let i = 0; i < copies.length; i++) {
    const c = copies[i];
    const hasCert = expectedCertPattern[i];
    const label = `copy ${i + 1}`;

    // Pressing snapshot — copied off the album SKU at materialize time.
    assert.equal(
      c.vinyl_color,
      VINYL_COLOR,
      `${label}: \`vinylColor\` must be snapshotted from the album SKU`,
    );
    assert.equal(
      c.jacket_upgrade,
      JACKET_UPGRADE,
      `${label}: \`jacketUpgrade\` must be snapshotted from the album SKU`,
    );

    // Booklet flag — mirrors the gt_booklet_bundle metadata for every copy.
    assert.equal(
      c.booklet,
      true,
      `${label}: \`booklet\` must match the gt_booklet_bundle metadata`,
    );

    // formatPriceCents — the per-copy price the fan paid (run total / qty).
    assert.equal(
      typeof c.format_price_cents,
      "number",
      `${label}: \`formatPriceCents\` snapshot must be populated`,
    );
    assert.equal(
      c.format_price_cents,
      UNIT_PRICE_CENTS,
      `${label}: \`formatPriceCents\` must be the per-copy price the fan paid`,
    );

    // addonPriceCents — the signed-cert add-on price for signed copies, 0 otherwise.
    assert.equal(
      typeof c.addon_price_cents,
      "number",
      `${label}: \`addonPriceCents\` snapshot must be populated`,
    );
    assert.equal(
      c.signed_cert,
      hasCert,
      `${label}: \`signedCert\` must match the gt_copies mask`,
    );
    assert.equal(
      c.addon_price_cents,
      hasCert ? SIGNED_CERT_PRICE_CENTS : 0,
      `${label}: \`addonPriceCents\` must be the signed-cert price on signed copies and 0 otherwise`,
    );
  }
});
