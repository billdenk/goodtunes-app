// Task #3259 — Niina Shopify go-live: historical-order backfill + held emails.
//
// Drives the real plan + materializer helpers against live Postgres with a
// stubbed globalThis.fetch (the historical-orders GraphQL page and all
// best-effort Shopify writes never leave the box). Asserts:
//   (a) planHistoricalBackfill sorts by original order date, skips
//       refunded/cancelled/unmapped/no-email, and projects numbers earliest-first
//   (b) backfill mint: earliest purchaser gets #1, orders keep their ORIGINAL
//       Shopify created_at, redemption email is HELD (held_at set, released null)
//   (c) re-running the backfill is idempotent (dedup by shopify order id)
//   (d) a NEW webhook order after the backfill numbers ABOVE the floor and is
//       NOT held
//   (e) release claim is atomic — the conditional UPDATE claims a row exactly
//       once (double-release can't double-send)
//   (f) NPO beneficiary credit mints on a Shopify order (backfilled), $1/unit,
//       idempotent per (order, org)
//
//   GT_TEST=1 npx tsx --test server/shopifyBackfill.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "./db";
import { shopifyStores } from "@shared/schema";
import { __internal } from "./shopify";

const {
  materializeOrderFromShopify,
  planHistoricalBackfill,
  gqlHistoricalOrderToRest,
  releaseHeldEmailsForStore,
  withGoodDeedNumberingLocks,
} = __internal as any;

const q = (query: any) => db.execute(query);
const rows = async (query: any) => ((await q(query)) as any).rows ?? [];

const uid = (p: string) => `bf3259-${p}-${randomUUID().slice(0, 8)}`;
const EMAIL_DOMAIN = "bf3259.test";

const albumIds: string[] = [];
const storeIds: string[] = [];
const orgIds: string[] = [];
const personIds: string[] = [];
let productSeq = 910_000_000;
let orderSeq = 810_000_000;

async function seedStore() {
  const id = uid("store");
  await q(sql`
    INSERT INTO shopify_stores (id, shop_domain, store_name, access_token, digital_unit_fee_cents)
    VALUES (${id}, ${id + ".myshopify.com"}, ${"Backfill Test Store"}, ${"plaintext-token"}, ${150})
  `);
  storeIds.push(id);
  const [store] = await db.select().from(shopifyStores).where(eq(shopifyStores.id, id));
  return store;
}

async function seedAlbum(opts?: { withArtist?: boolean }) {
  const id = uid("album");
  let personId: string | null = null;
  if (opts?.withArtist) {
    personId = uid("person");
    await q(sql`INSERT INTO people (id, name) VALUES (${personId}, ${"bf3259 artist"})`);
    personIds.push(personId);
  }
  await q(sql`
    INSERT INTO albums (id, title, artist, artwork, sell_mode, primary_artist_id)
    VALUES (${id}, ${"Backfill Album"}, ${"Backfill Artist"}, ${"/album-placeholder.svg"}, ${"shopify"}, ${personId})
  `);
  albumIds.push(id);
  return id;
}

async function seedMapping(storeId: string, albumId: string, productId: string) {
  await q(sql`
    INSERT INTO shopify_product_mappings (store_id, shopify_product_id, shopify_variant_id, album_id)
    VALUES (${storeId}, ${productId}, ${null}, ${albumId})
  `);
}

// ── GraphQL historical-orders node builder ──
function gqlNode(opts: {
  id?: number;
  createdAt: string;
  productId: string;
  email?: string | null;
  cancelledAt?: string | null;
  financial?: string;
  quantity?: number;
}) {
  const id = opts.id ?? ++orderSeq;
  return {
    legacyResourceId: String(id),
    name: `#${id}`,
    createdAt: opts.createdAt,
    cancelledAt: opts.cancelledAt ?? null,
    displayFinancialStatus: opts.financial ?? "PAID",
    email: opts.email === undefined ? `fan${id}@${EMAIL_DOMAIN}` : opts.email,
    currencyCode: "USD",
    totalPriceSet: { shopMoney: { amount: "29.99" } },
    customer: { firstName: "Fan", lastName: "Buyer", phone: null },
    billingAddress: null,
    shippingAddress: null,
    lineItems: {
      nodes: [
        {
          title: "CALIFORNIALAND Vinyl",
          quantity: opts.quantity ?? 1,
          originalUnitPriceSet: { shopMoney: { amount: "29.99" } },
          product: { legacyResourceId: opts.productId },
          variant: null,
        },
      ],
    },
  };
}

// ── hermetic fetch stub: answers the historical-orders GraphQL query with
// whatever `stubOrders` holds, everything else generically 200s ──
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
      await q(sql`DELETE FROM album_npo_beneficiaries WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM orders WHERE album_id = ${aid}`);
      await q(sql`DELETE FROM albums WHERE id = ${aid}`);
    }
    for (const sid of storeIds) {
      await q(sql`DELETE FROM shopify_product_mappings WHERE store_id = ${sid}`);
      await q(sql`DELETE FROM shopify_stores WHERE id = ${sid}`);
    }
    for (const oid of orgIds) await q(sql`DELETE FROM organizations WHERE id = ${oid}`);
    for (const pid of personIds) await q(sql`DELETE FROM people WHERE id = ${pid}`);
    await q(sql`DELETE FROM customer_users WHERE email LIKE ${"%@" + EMAIL_DOMAIN}`);
  } finally {
    await pool.end();
  }
});

async function orderRow(shopifyOrderId: string) {
  const [row] = await rows(sql`SELECT * FROM orders WHERE shopify_order_id = ${shopifyOrderId}`);
  return row;
}

test("(a) plan sorts by order date, skips refunded/cancelled/unmapped/no-email, projects earliest-first", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum();
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId);

  const later = gqlNode({ createdAt: "2025-06-02T10:00:00Z", productId });
  const earliest = gqlNode({ createdAt: "2025-01-15T08:00:00Z", productId });
  const refunded = gqlNode({ createdAt: "2025-02-01T00:00:00Z", productId, financial: "REFUNDED" });
  const cancelled = gqlNode({ createdAt: "2025-02-02T00:00:00Z", productId, cancelledAt: "2025-02-03T00:00:00Z" });
  const noEmail = gqlNode({ createdAt: "2025-02-04T00:00:00Z", productId, email: null });
  const unmapped = gqlNode({ createdAt: "2025-02-05T00:00:00Z", productId: String(++productSeq) });
  stubOrders = [later, earliest, refunded, cancelled, noEmail, unmapped];

  const plan = await planHistoricalBackfill(store);
  assert.equal(plan.totalFetched, 6);
  assert.equal(plan.skippedRefunded, 1);
  assert.equal(plan.skippedCancelled, 1);
  assert.equal(plan.skippedNoEmail, 1);
  assert.equal(plan.skippedUnmapped, 1);
  assert.equal(plan.entries.length, 2);
  // Earliest first, projected #1 then #2.
  assert.equal(plan.entries[0].shopifyOrderId, earliest.legacyResourceId);
  assert.equal(plan.entries[0].projectedGoodDeedNumber, 1);
  assert.equal(plan.entries[1].shopifyOrderId, later.legacyResourceId);
  assert.equal(plan.entries[1].projectedGoodDeedNumber, 2);
});

test("(b)(c)(d) backfill mints in date order with held emails + original dates; re-run idempotent; webhook numbers above floor", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum();
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId);

  const n1 = gqlNode({ createdAt: "2025-03-01T00:00:00Z", productId });
  const n2 = gqlNode({ createdAt: "2025-04-01T00:00:00Z", productId });
  const n3 = gqlNode({ createdAt: "2025-05-01T00:00:00Z", productId });
  stubOrders = [n3, n1, n2]; // out of order on purpose

  const plan = await planHistoricalBackfill(store);
  assert.equal(plan.entries.length, 3);
  let minted = 0;
  for (const e of plan.entries) {
    const r = await materializeOrderFromShopify(store, e.payload, {
      backfill: { sourceCreatedAt: new Date(e.createdAt) },
    });
    if (r) minted++;
  }
  assert.equal(minted, 3);

  const o1 = await orderRow(n1.legacyResourceId);
  const o2 = await orderRow(n2.legacyResourceId);
  const o3 = await orderRow(n3.legacyResourceId);
  // Earliest order date got #1.
  assert.equal(o1.good_deed_number, 1);
  assert.equal(o2.good_deed_number, 2);
  assert.equal(o3.good_deed_number, 3);
  // Original Shopify order date preserved.
  assert.equal(new Date(o1.created_at).toISOString(), "2025-03-01T00:00:00.000Z");
  // Emails HELD, not released; no fulfillment.
  assert.ok(o1.redemption_email_held_at, "held stamp set");
  assert.equal(o1.redemption_email_released_at, null);
  assert.equal(o1.fulfillment_status, null);
  assert.equal(o1.status, "paid");

  // (c) re-run: same plan again — everything now alreadyMaterialized.
  const plan2 = await planHistoricalBackfill(store);
  assert.equal(plan2.entries.filter((e: any) => !e.alreadyMaterialized).length, 0);
  const again = await materializeOrderFromShopify(store, plan.entries[0].payload, {
    backfill: { sourceCreatedAt: new Date(plan.entries[0].createdAt) },
  });
  // Existing order short-circuits with the SAME code (no new row/number).
  const [cnt] = await rows(sql`SELECT count(*)::int AS n FROM orders WHERE album_id = ${albumId}`);
  assert.equal(Number(cnt.n), 3);
  assert.ok(again?.code);

  // (d) new webhook order (no backfill opts) numbers above the floor, not held.
  const webhookId = ++orderSeq;
  const webhookPayload = gqlHistoricalOrderToRest(gqlNode({ id: webhookId, createdAt: new Date().toISOString(), productId }));
  const wr = await materializeOrderFromShopify(store, webhookPayload);
  assert.ok(wr);
  const wo = await orderRow(String(webhookId));
  assert.equal(wo.good_deed_number, 4);
  assert.equal(wo.redemption_email_held_at, null);
  assert.equal(wo.redemption_email_released_at, null);

  // Platform fee accrued at the store's $1.50 rate for a backfilled order.
  const [fee] = await rows(sql`SELECT unit_fee_cents, total_cents FROM platform_wholesale_ledger WHERE order_id = ${o1.id}`);
  assert.equal(Number(fee?.unit_fee_cents), 150);
  assert.equal(Number(fee?.total_cents), 150);
});

test("(e) release: failed send stays held (retryable); success stamps; re-release sends nothing new", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum();
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId);
  const n1 = gqlNode({ createdAt: "2025-03-10T00:00:00Z", productId });
  const n2 = gqlNode({ createdAt: "2025-03-11T00:00:00Z", productId });
  stubOrders = [n1, n2];
  const plan = await planHistoricalBackfill(store);
  for (const e of plan.entries) {
    await materializeOrderFromShopify(store, e.payload, { backfill: { sourceCreatedAt: new Date(e.createdAt) } });
  }

  // Run 1: first send fails, second succeeds.
  let calls = 0;
  const flaky = async () => (++calls === 1 ? { ok: false, reason: "provider down" } : { ok: true });
  const r1 = await releaseHeldEmailsForStore(store.id, flaky);
  assert.equal(r1.released, 1);
  assert.equal(r1.failed, 1);
  const o1 = await orderRow(n1.legacyResourceId);
  const o2 = await orderRow(n2.legacyResourceId);
  // Failed one is still held (released stamp NULL) — never stranded.
  assert.equal(o1.redemption_email_released_at, null);
  assert.ok(o2.redemption_email_released_at);

  // Run 2: only the failed one is retried, then everything is released.
  const sent: string[] = [];
  const r2 = await releaseHeldEmailsForStore(store.id, async (o: any) => {
    sent.push(o.id);
    return { ok: true };
  });
  assert.equal(r2.released, 1);
  assert.deepEqual(sent, [o1.id]);

  // Run 3: nothing left to send.
  const r3 = await releaseHeldEmailsForStore(store.id, async () => {
    throw new Error("should not be called");
  });
  assert.equal(r3.released, 0);
  assert.equal(r3.failed, 0);
});

test("(g) shopify_plus fulfillment-only order is a full no-op in backfill mode", async () => {
  const store = await seedStore();
  const id = uid("album");
  await q(sql`
    INSERT INTO albums (id, title, artist, artwork, sell_mode, shopify_plus_fulfillment)
    VALUES (${id}, ${"SP+ Backfill Album"}, ${"SP+ Artist"}, ${"/album-placeholder.svg"}, ${"shopify_plus"}, ${true})
  `);
  albumIds.push(id);
  const productId = String(++productSeq);
  await q(sql`
    INSERT INTO shopify_product_mappings (store_id, shopify_product_id, shopify_variant_id, album_id, offers_digital_unlock)
    VALUES (${store.id}, ${productId}, ${null}, ${id}, ${false})
  `);
  const n = gqlNode({ createdAt: "2025-03-15T00:00:00Z", productId });
  const payload = gqlHistoricalOrderToRest(n);
  const r = await materializeOrderFromShopify(store, payload, {
    backfill: { sourceCreatedAt: new Date(n.createdAt) },
  });
  assert.equal(r, null);
  const o = await orderRow(n.legacyResourceId);
  assert.equal(o, undefined, "no order row minted for a historical fulfillment-only order");
});

test("(i) partial materialize (order row, no code) is resumed by a backfill rerun and becomes releasable", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum();
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId);
  const n = gqlNode({ createdAt: "2025-05-01T00:00:00Z", productId });
  stubOrders = [n];

  // Simulate a crash between the order insert and the code mint: the order
  // row exists (held, numbered) but has NO redemption code and NO items.
  const partialId = uid("order");
  await q(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, buyer_email,
                        good_deed_number, origin, shopify_store_id, shopify_order_id,
                        created_at, redemption_email_held_at)
    SELECT ${partialId}, id, ${albumId}, ${2500}, ${"paid"}, ${"partial@example.com"},
           ${1}, ${`shopify:${store.id}`}, ${store.id}, ${String(n.legacyResourceId)},
           ${"2025-05-01T00:00:00Z"}, now()
    FROM customer_users LIMIT 1
  `);
  const seededCustomer = await rows(sql`SELECT customer_id FROM orders WHERE id = ${partialId}`);
  assert.ok(seededCustomer.length === 1);

  // Plan must NOT count the codeless row as materialized.
  const plan = await planHistoricalBackfill(store);
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].alreadyMaterialized, false);

  // Rerun resumes the tail: same single order, code minted, items written.
  const r = await materializeOrderFromShopify(store, plan.entries[0].payload, {
    backfill: { sourceCreatedAt: new Date(plan.entries[0].createdAt) },
  });
  assert.ok(r?.code);
  assert.equal(r!.orderId, partialId);
  const allOrders = await rows(sql`SELECT id FROM orders WHERE shopify_order_id = ${String(n.legacyResourceId)}`);
  assert.equal(allOrders.length, 1, "exactly one order after the resume");
  const codes = await rows(sql`SELECT code FROM shopify_redemption_codes WHERE order_id = ${partialId}`);
  assert.equal(codes.length, 1, "exactly one redemption code minted");
  const items = await rows(sql`SELECT id FROM order_items WHERE order_id = ${partialId}`);
  assert.ok(items.length >= 1, "order items written by the resume");

  // A second rerun is a no-op (now alreadyMaterialized).
  const plan2 = await planHistoricalBackfill(store);
  assert.equal(plan2.entries[0].alreadyMaterialized, true);

  // The resumed order is releasable.
  const sent: string[] = [];
  const rel = await releaseHeldEmailsForStore(store.id, async (o: any) => { sent.push(o.id); return { ok: true }; });
  assert.equal(rel.released, 1);
  assert.deepEqual(sent, [partialId]);
});

test("(h) webhook mint waits on the backfill's numbering lock and numbers above the floor", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum();
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId);
  const n1 = gqlNode({ createdAt: "2025-03-01T00:00:00Z", productId });
  const n2 = gqlNode({ createdAt: "2025-04-01T00:00:00Z", productId });
  stubOrders = [n1, n2];
  const plan = await planHistoricalBackfill(store);

  const webhookId = ++orderSeq;
  const webhookPayload = gqlHistoricalOrderToRest(gqlNode({ id: webhookId, createdAt: new Date().toISOString(), productId }));
  let webhookDone = false;
  let webhookPromise: Promise<any> | null = null;

  await withGoodDeedNumberingLocks([albumId], async () => {
    // Fire the live webhook mint while the backfill holds the lock…
    webhookPromise = materializeOrderFromShopify(store, webhookPayload).then((r: any) => {
      webhookDone = true;
      return r;
    });
    // …mint the historical orders chronologically…
    for (const e of plan.entries) {
      await materializeOrderFromShopify(store, e.payload, { backfill: { sourceCreatedAt: new Date(e.createdAt) } });
    }
    // …and assert the webhook is still parked on the lock.
    await new Promise((res) => setTimeout(res, 300));
    assert.equal(webhookDone, false, "webhook mint must wait for the backfill lock");
  });

  const wr = await webhookPromise!;
  assert.ok(wr);
  const o1 = await orderRow(n1.legacyResourceId);
  const o2 = await orderRow(n2.legacyResourceId);
  const wo = await orderRow(String(webhookId));
  // Historical sequence intact, webhook strictly above the floor.
  assert.equal(o1.good_deed_number, 1);
  assert.equal(o2.good_deed_number, 2);
  assert.equal(wo.good_deed_number, 3);
  assert.equal(wo.redemption_email_held_at, null);
});

test("(f) NPO beneficiary credit mints on a backfilled Shopify order, $1/unit, idempotent", async () => {
  const store = await seedStore();
  const albumId = await seedAlbum({ withArtist: true });
  const productId = String(++productSeq);
  await seedMapping(store.id, albumId, productId);
  const orgId = uid("org");
  await q(sql`INSERT INTO organizations (id, name, kind) VALUES (${orgId}, ${"EndoFound Test"}, 'non_profit')`);
  orgIds.push(orgId);
  await q(sql`
    INSERT INTO album_npo_beneficiaries (album_id, organization_id, per_unit_cents)
    VALUES (${albumId}, ${orgId}, ${100})
  `);

  const n = gqlNode({ createdAt: "2025-03-20T00:00:00Z", productId, quantity: 2 });
  stubOrders = [n];
  const plan = await planHistoricalBackfill(store);
  await materializeOrderFromShopify(store, plan.entries[0].payload, {
    backfill: { sourceCreatedAt: new Date(plan.entries[0].createdAt) },
  });
  const o = await orderRow(n.legacyResourceId);
  const credits = await rows(sql`
    SELECT amount_cents, units, referrer_kind, referrer_org_id FROM referral_credits WHERE order_id = ${o.id}
  `);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].referrer_kind, "non_profit");
  assert.equal(credits[0].referrer_org_id, orgId);
  assert.equal(Number(credits[0].units), 2);
  assert.equal(Number(credits[0].amount_cents), 200); // $1/unit × 2

  // Idempotent: calling the helper again mints nothing new.
  const { mintAlbumNpoCreditsForOrder } = await import("./commerce");
  await mintAlbumNpoCreditsForOrder(
    { id: o.id, artistSnapshotId: o.artist_snapshot_id, currency: o.currency },
    albumId,
  );
  const credits2 = await rows(sql`SELECT count(*)::int AS n FROM referral_credits WHERE order_id = ${o.id}`);
  assert.equal(Number(credits2[0].n), 1);
});
