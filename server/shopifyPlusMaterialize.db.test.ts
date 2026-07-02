// Task #2428 line 31 — Shopify+ "optionally still mint the digital unlock".
//
// A shopify_plus album sells on the CUSTOMER's own Shopify; manufacturing is
// prepaid via the ACH ledger. Step 8's baseline routes those orders
// fulfillment-only (mints nothing). This task adds a per-mapping opt-in
// (`offers_digital_unlock`) so a mapping may STILL mint the GoodTunes digital
// unlock + GoodDeed "exactly as today" — but as an `external_paid` order that
// is kept out of every GoodTunes revenue/payout read and never accrues the
// fan-sale press pool.
//
// This drives the real webhook materializer (__internal.materializeOrderFromShopify)
// + refund handler against a live Postgres and asserts the branch matrix:
//   (a) flag=false                         → fulfillment-only, nothing minted
//   (b) flag=true  + fulfillment ON        → unlock+code+GoodDeed, external_paid,
//                                            zero press-pool accrual (revenue-excluded)
//   (c) refund revokes the unlock only when no other live order remains,
//       and an external_paid order counts as "live"
//   (d) flag=true  + fulfillment OFF       → unlock minted, but no per-order ship
//   (e) flag=true  + signed-GoodDeed OFF   → cert NOT minted even when offered
//   (f) plain "shopify" mode               → status stays "paid" (deltas gated on sellMode)
//
// Hermetic: globalThis.fetch is stubbed so nothing leaves the box — both the
// best-effort Shopify note_attributes PUT and the Order Desk handoff (Order
// Desk creds may or may not be present in a given env; the stub makes that
// irrelevant, and OD returns "no order id" from the stubbed body, which we
// don't assert on).
//
//   npx tsx --test server/shopifyPlusMaterialize.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "./db";
import { shopifyStores } from "@shared/schema";
import { __internal } from "./shopify";

const { materializeOrderFromShopify, handleShopifyRefund } = __internal;

const q = (query: any) => db.execute(query);
const rows = async (query: any) => ((await q(query)) as any).rows ?? [];

const EMAIL_DOMAIN = "sp2428plus.test";
const uid = (p: string) => `sp2428-${p}-${randomUUID().slice(0, 8)}`;

// Collect everything we create so `after` can tear it down FK-safe.
const albumIds: string[] = [];
const storeIds: string[] = [];
let productSeq = 900_000_000;
let orderSeq = 800_000_000;

async function seedStore() {
  const id = uid("store");
  await q(sql`
    INSERT INTO shopify_stores (id, shop_domain, store_name, access_token)
    VALUES (${id}, ${id + ".myshopify.com"}, ${"SP+ Test Store"}, ${"plaintext-token"})
  `);
  storeIds.push(id);
  const [store] = await db.select().from(shopifyStores).where(eq(shopifyStores.id, id));
  return store;
}

async function seedAlbum(opts: {
  sellMode: "direct" | "shopify" | "shopify_plus";
  fulfillment?: boolean;
  signedGooddeed?: boolean;
}) {
  const id = uid("album");
  await q(sql`
    INSERT INTO albums (id, title, artist, artwork, sell_mode, shopify_plus_fulfillment, shopify_plus_signed_gooddeed)
    VALUES (${id}, ${"SP+ Album"}, ${"SP+ Artist"}, ${"/album-placeholder.svg"},
            ${opts.sellMode}, ${!!opts.fulfillment}, ${!!opts.signedGooddeed})
  `);
  albumIds.push(id);
  return id;
}

async function seedMapping(opts: {
  storeId: string;
  albumId: string;
  productId: string;
  offersDigitalUnlock: boolean;
  offerSignedCert?: boolean;
  signedCertPriceCents?: number | null;
}) {
  await q(sql`
    INSERT INTO shopify_product_mappings
      (store_id, shopify_product_id, shopify_variant_id, album_id, offer_signed_cert, offers_digital_unlock, signed_cert_price_cents)
    VALUES (${opts.storeId}, ${opts.productId}, ${null}, ${opts.albumId},
            ${!!opts.offerSignedCert}, ${opts.offersDigitalUnlock}, ${opts.signedCertPriceCents ?? null})
  `);
}

// Build a minimal paid-order webhook payload for one physical line item.
function makeOrder(opts: { productId: string; email: string; orderId?: number }) {
  const id = opts.orderId ?? ++orderSeq;
  return {
    id,
    order_number: id,
    token: `tok-${id}`,
    email: opts.email,
    total_price: "29.99",
    currency: "usd",
    customer: { first_name: "Fan", last_name: "Buyer", phone: null },
    billing_address: null,
    shipping_address: null,
    line_items: [
      {
        id: id + 1,
        product_id: Number(opts.productId),
        variant_id: null,
        title: "Limited Vinyl",
        quantity: 1,
        price: "29.99",
      },
    ],
  } as any;
}

// ── hermetic fetch stub (Shopify note_attributes PUT is best-effort) ──
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ order: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as any;
});

after(async () => {
  globalThis.fetch = realFetch;
  try {
    for (const aid of albumIds) {
      await q(sql`DELETE FROM shopify_redemption_codes WHERE order_id IN (SELECT id FROM orders WHERE album_id = ${aid})`);
      await q(sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE album_id = ${aid})`);
      await q(sql`DELETE FROM cert_reservations WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM album_press_pool_ledger WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM user_albums WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM orders WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM albums WHERE id = ${aid}`);
    }
    for (const sid of storeIds) {
      await q(sql`DELETE FROM shopify_product_mappings WHERE store_id = ${sid}`);
      await q(sql`DELETE FROM shopify_stores WHERE id = ${sid}`);
    }
    await q(sql`DELETE FROM customer_users WHERE email LIKE ${"%@" + EMAIL_DOMAIN}`);
  } finally {
    await pool.end();
  }
});

async function orderRow(shopifyOrderId: number) {
  const [row] = await rows(sql`SELECT * FROM orders WHERE shopify_order_id = ${String(shopifyOrderId)}`);
  return row;
}
async function codeCount(orderId: string) {
  const [r] = await rows(sql`SELECT count(*)::int AS n FROM shopify_redemption_codes WHERE order_id = ${orderId}`);
  return Number(r?.n ?? 0);
}
async function unlockCount(albumId: string, customerId: string) {
  const [r] = await rows(
    sql`SELECT count(*)::int AS n FROM user_albums WHERE album_id = ${albumId} AND user_id = ${customerId}`,
  );
  return Number(r?.n ?? 0);
}
async function poolCount(orderId: string) {
  const [r] = await rows(sql`SELECT count(*)::int AS n FROM album_press_pool_ledger WHERE source_order_id = ${orderId}`);
  return Number(r?.n ?? 0);
}
async function certCount(orderId: string) {
  const [r] = await rows(sql`SELECT count(*)::int AS n FROM cert_reservations WHERE order_id = ${orderId}`);
  return Number(r?.n ?? 0);
}

test("(a) flag=false → fulfillment-only, nothing minted", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum({ sellMode: "shopify_plus", fulfillment: true });
  const productId = String(++productSeq);
  await seedMapping({ storeId: store.id, albumId, productId, offersDigitalUnlock: false });

  const order = makeOrder({ productId, email: `a-${uid("f")}@${EMAIL_DOMAIN}` });
  const result = await materializeOrderFromShopify(store, order);
  assert.equal(result, null, "fulfillment-only returns null (no redemption code)");

  const row = await orderRow(order.id);
  assert.ok(row, "an order row is still written (for fulfillment routing)");
  assert.equal(row.status, "fulfillment_only", "status is fulfillment_only, NOT a sale");
  assert.equal(row.good_deed_number, null, "no GoodDeed number minted");
  assert.equal(await codeCount(row.id), 0, "no redemption code minted");
  assert.equal(await unlockCount(albumId, row.customer_id), 0, "no album unlock granted");
});

test("(b) flag=true + fulfillment ON → external_paid unlock, GoodDeed, zero press-pool", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum({ sellMode: "shopify_plus", fulfillment: true });
  const productId = String(++productSeq);
  await seedMapping({ storeId: store.id, albumId, productId, offersDigitalUnlock: true });

  const order = makeOrder({ productId, email: `b-${uid("f")}@${EMAIL_DOMAIN}` });
  const result = await materializeOrderFromShopify(store, order);
  assert.ok(result?.code, "opting in mints a redemption code");

  const row = await orderRow(order.id);
  assert.equal(row.status, "external_paid", "status is external_paid (revenue-excluded, not 'paid')");
  assert.ok(String(row.origin).startsWith("shopify_plus:"), "origin marks it as shopify_plus");
  assert.notEqual(row.good_deed_number, null, "a GoodDeed number IS assigned");
  assert.equal(await codeCount(row.id), 1, "redemption code minted");
  assert.equal(await unlockCount(albumId, row.customer_id), 1, "album unlock granted");
  assert.equal(row.fulfillment_status, "pending", "fulfillment ON → per-order shipment pending");
  assert.equal(await poolCount(row.id), 0, "NO fan-sale press-pool accrual for a shopify_plus order");
});

test("(c) refund revokes the unlock only when no other live order remains", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum({ sellMode: "shopify_plus", fulfillment: true });
  const productId = String(++productSeq);
  await seedMapping({ storeId: store.id, albumId, productId, offersDigitalUnlock: true });

  // Same buyer, two separate external_paid unlock orders for the same album.
  const email = `c-${uid("f")}@${EMAIL_DOMAIN}`;
  const order1 = makeOrder({ productId, email });
  const order2 = makeOrder({ productId, email });
  await materializeOrderFromShopify(store, order1);
  await materializeOrderFromShopify(store, order2);

  const row1 = await orderRow(order1.id);
  assert.equal(await unlockCount(albumId, row1.customer_id), 1, "unlock present after two purchases");

  // Refund the first: the second external_paid order keeps the unlock alive.
  await handleShopifyRefund({ order_id: order1.id });
  const row1After = await orderRow(order1.id);
  assert.equal(row1After.status, "refunded", "order 1 marked refunded");
  assert.equal(
    await unlockCount(albumId, row1.customer_id),
    1,
    "unlock SURVIVES because the other external_paid order is still live",
  );

  // Refund the second: now nothing live remains → unlock revoked.
  await handleShopifyRefund({ order_id: order2.id });
  assert.equal(await unlockCount(albumId, row1.customer_id), 0, "unlock revoked once the last live order is refunded");
});

test("(d) flag=true + fulfillment OFF → unlock minted, no per-order ship handoff", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum({ sellMode: "shopify_plus", fulfillment: false });
  const productId = String(++productSeq);
  await seedMapping({ storeId: store.id, albumId, productId, offersDigitalUnlock: true });

  const order = makeOrder({ productId, email: `d-${uid("f")}@${EMAIL_DOMAIN}` });
  const result = await materializeOrderFromShopify(store, order);
  assert.ok(result?.code, "unlock still minted with fulfillment OFF");

  const row = await orderRow(order.id);
  assert.equal(row.status, "external_paid", "still an external_paid unlock");
  assert.equal(await unlockCount(albumId, row.customer_id), 1, "album unlock granted");
  assert.equal(row.fulfillment_status, null, "fulfillment OFF → no per-order shipment queued");
  assert.equal(row.fulfillment_error, null, "no Order Desk handoff attempted (so no OD error stamped)");
});

test("(e) flag=true + signed-GoodDeed OFF → cert NOT minted even when the mapping offers it", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum({ sellMode: "shopify_plus", fulfillment: false, signedGooddeed: false });
  const productId = String(++productSeq);
  await seedMapping({
    storeId: store.id,
    albumId,
    productId,
    offersDigitalUnlock: true,
    offerSignedCert: true,
    signedCertPriceCents: 999,
  });

  const order = makeOrder({ productId, email: `e-${uid("f")}@${EMAIL_DOMAIN}` });
  await materializeOrderFromShopify(store, order);

  const row = await orderRow(order.id);
  assert.equal(row.status, "external_paid", "unlock still minted");
  assert.equal(await certCount(row.id), 0, "no cert reservation — album-level signed-GoodDeed toggle is OFF");
  const [certItem] = await rows(
    sql`SELECT count(*)::int AS n FROM order_items WHERE order_id = ${row.id} AND sku = ${"signed_cert"}`,
  );
  assert.equal(Number(certItem?.n ?? 0), 0, "no signed_cert line item");
});

test("(f) plain shopify mode is unaffected — status stays 'paid'", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum({ sellMode: "shopify" });
  const productId = String(++productSeq);
  // offersDigitalUnlock defaults true; for plain shopify the flag is inert.
  await seedMapping({ storeId: store.id, albumId, productId, offersDigitalUnlock: true });

  const order = makeOrder({ productId, email: `f-${uid("f")}@${EMAIL_DOMAIN}` });
  const result = await materializeOrderFromShopify(store, order);
  assert.ok(result?.code, "plain shopify mints a code");

  const row = await orderRow(order.id);
  assert.equal(row.status, "paid", "plain shopify remains a GoodTunes 'paid' sale");
  assert.ok(String(row.origin).startsWith("shopify:"), "origin is plain shopify, not shopify_plus");
  assert.equal(await unlockCount(albumId, row.customer_id), 1, "album unlock granted");
});
