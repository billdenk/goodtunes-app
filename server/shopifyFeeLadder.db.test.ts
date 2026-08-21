// Task #3275 — Shopify per-unit platform fee resolution ladder.
//
// Drives resolveShopifyUnitFee + the real order materializer against live
// Postgres with a stubbed globalThis.fetch. Asserts:
//   (a) ladder precedence: release override → store explicit fee → artist
//       default → $3.50 platform default (with provenance labels)
//   (b) pre-install case: an artist default set BEFORE the store row exists
//       applies to the store's first minted webhook order
//   (c) the historical backfill resolves through the same ladder (release
//       override wins there too)
//
//   GT_TEST=1 npx tsx --test server/shopifyFeeLadder.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "./db";
import { shopifyStores } from "@shared/schema";
import { __internal } from "./shopify";

const { resolveShopifyUnitFee, materializeOrderFromShopify, planHistoricalBackfill, gqlHistoricalOrderToRest } =
  __internal as any;

const q = (query: any) => db.execute(query);
const rows = async (query: any) => ((await q(query)) as any).rows ?? [];

const uid = (p: string) => `fee3275-${p}-${randomUUID().slice(0, 8)}`;
const EMAIL_DOMAIN = "fee3275.test";

const albumIds: string[] = [];
const storeIds: string[] = [];
const personIds: string[] = [];
let productSeq = 920_000_000;
let orderSeq = 820_000_000;

async function seedPerson(feeCents: number | null) {
  const id = uid("person");
  await q(sql`INSERT INTO people (id, name, shopify_unit_fee_cents) VALUES (${id}, ${"fee3275 artist"}, ${feeCents})`);
  personIds.push(id);
  return id;
}

async function seedStore(opts?: { feeCents?: number | null; personId?: string | null }) {
  const id = uid("store");
  await q(sql`
    INSERT INTO shopify_stores (id, shop_domain, store_name, access_token, digital_unit_fee_cents, person_id)
    VALUES (${id}, ${id + ".myshopify.com"}, ${"Fee Ladder Store"}, ${"plaintext-token"}, ${opts?.feeCents ?? null}, ${opts?.personId ?? null})
  `);
  storeIds.push(id);
  const [store] = await db.select().from(shopifyStores).where(eq(shopifyStores.id, id));
  return store;
}

async function seedAlbum(personId: string | null) {
  const id = uid("album");
  await q(sql`
    INSERT INTO albums (id, title, artist, artwork, sell_mode, primary_artist_id)
    VALUES (${id}, ${"Fee Ladder Album"}, ${"Fee Ladder Artist"}, ${"/album-placeholder.svg"}, ${"shopify"}, ${personId})
  `);
  albumIds.push(id);
  return id;
}

async function seedMapping(storeId: string, albumId: string, productId: string, overrideCents?: number | null) {
  await q(sql`
    INSERT INTO shopify_product_mappings (store_id, shopify_product_id, shopify_variant_id, album_id, unit_fee_override_cents)
    VALUES (${storeId}, ${productId}, ${null}, ${albumId}, ${overrideCents ?? null})
  `);
}

function gqlNode(opts: { id?: number; createdAt: string; productId: string; quantity?: number }) {
  const id = opts.id ?? ++orderSeq;
  return {
    legacyResourceId: String(id),
    name: `#${id}`,
    createdAt: opts.createdAt,
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    email: `fan${id}@${EMAIL_DOMAIN}`,
    currencyCode: "USD",
    totalPriceSet: { shopMoney: { amount: "29.99" } },
    customer: { firstName: "Fan", lastName: "Buyer", phone: null },
    billingAddress: null,
    shippingAddress: null,
    lineItems: {
      nodes: [
        {
          title: "Fee Ladder Vinyl",
          quantity: opts.quantity ?? 1,
          originalUnitPriceSet: { shopMoney: { amount: "29.99" } },
          product: { legacyResourceId: opts.productId },
          variant: null,
        },
      ],
    },
  };
}

let stubOrders: any[] = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (_url: any, init?: any) => {
    const body = typeof init?.body === "string" ? init.body : "";
    if (body.includes("historicalOrders")) {
      return new Response(
        JSON.stringify({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: stubOrders } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: {}, order: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as any;
});

after(async () => {
  globalThis.fetch = realFetch;
  try {
    for (const aid of albumIds) {
      await q(sql`DELETE FROM referral_credits WHERE order_id IN (SELECT id FROM orders WHERE album_id = ${aid})`);
      await q(sql`DELETE FROM shopify_redemption_codes WHERE order_id IN (SELECT id FROM orders WHERE album_id = ${aid})`);
      await q(sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE album_id = ${aid})`);
      await q(sql`DELETE FROM cert_reservations WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM album_press_pool_ledger WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM platform_wholesale_ledger WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM user_albums WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM orders WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM albums WHERE id = ${aid}`);
    }
    for (const sid of storeIds) {
      await q(sql`DELETE FROM shopify_product_mappings WHERE store_id = ${sid}`);
      await q(sql`DELETE FROM shopify_stores WHERE id = ${sid}`);
    }
    for (const pid of personIds) await q(sql`DELETE FROM people WHERE id = ${pid}`);
    await q(sql`DELETE FROM customer_users WHERE email LIKE ${"%@" + EMAIL_DOMAIN}`);
  } finally {
    await pool.end();
  }
});

async function ledgerFor(shopifyOrderId: string) {
  const [row] = await rows(sql`
    SELECT l.unit_fee_cents, l.total_cents FROM platform_wholesale_ledger l
    JOIN orders o ON o.id = l.order_id WHERE o.shopify_order_id = ${shopifyOrderId}
  `);
  return row;
}

test("(a) ladder precedence: override > store > artist default > platform default", async () => {
  const personId = await seedPerson(200);

  // release override wins over everything
  assert.deepEqual(
    await resolveShopifyUnitFee({ digitalUnitFeeCents: 500, personId }, { unitFeeOverrideCents: 125 }),
    { unitFeeCents: 125, source: "release_override" },
  );
  // store explicit fee wins over artist default
  assert.deepEqual(
    await resolveShopifyUnitFee({ digitalUnitFeeCents: 500, personId }, { unitFeeOverrideCents: null }),
    { unitFeeCents: 500, source: "store" },
  );
  // null store fee falls through to artist default
  assert.deepEqual(
    await resolveShopifyUnitFee({ digitalUnitFeeCents: null, personId }, null),
    { unitFeeCents: 200, source: "artist_default" },
  );
  // an explicit $0 store fee is honored (not treated as unset)
  assert.deepEqual(
    await resolveShopifyUnitFee({ digitalUnitFeeCents: 0, personId }, null),
    { unitFeeCents: 0, source: "store" },
  );
  // no override, no store fee, no person → $3.50 platform default
  assert.deepEqual(
    await resolveShopifyUnitFee({ digitalUnitFeeCents: null, personId: null }, null),
    { unitFeeCents: 350, source: "platform_default" },
  );
  // person exists but has no default → platform default
  const bare = await seedPerson(null);
  assert.deepEqual(
    await resolveShopifyUnitFee({ digitalUnitFeeCents: null, personId: bare }, null),
    { unitFeeCents: 350, source: "platform_default" },
  );
});

test("(b) artist default set BEFORE the store exists applies to the first webhook order", async () => {
  // The deal rate is agreed pre-install: person default $1.50 exists first…
  const personId = await seedPerson(150);
  // …then the install lands (store row minted with NO explicit fee).
  const store = await seedStore({ feeCents: null, personId });
  const albumId = await seedAlbum(personId);
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId);

  const webhookId = ++orderSeq;
  const payload = gqlHistoricalOrderToRest(gqlNode({ id: webhookId, createdAt: new Date().toISOString(), productId, quantity: 2 }));
  const r = await materializeOrderFromShopify(store, payload);
  assert.ok(r);
  const fee = await ledgerFor(String(webhookId));
  assert.equal(Number(fee.unit_fee_cents), 150);
  assert.equal(Number(fee.total_cents), 300); // 2 units × $1.50
});

test("(c) backfill resolves through the same ladder — release override wins", async () => {
  const personId = await seedPerson(150);
  const store = await seedStore({ feeCents: 500, personId });
  const albumId = await seedAlbum(personId);
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId, 75); // release override $0.75

  stubOrders = [gqlNode({ createdAt: "2025-05-01T00:00:00Z", productId })];
  const plan = await planHistoricalBackfill(store);
  assert.equal(plan.entries.length, 1);
  const e = plan.entries[0];
  const r = await materializeOrderFromShopify(store, e.payload, {
    backfill: { sourceCreatedAt: new Date(e.createdAt) },
  });
  assert.ok(r);
  const fee = await ledgerFor(e.shopifyOrderId);
  // Override beats BOTH the $5.00 store fee and the $1.50 artist default.
  assert.equal(Number(fee.unit_fee_cents), 75);
});
