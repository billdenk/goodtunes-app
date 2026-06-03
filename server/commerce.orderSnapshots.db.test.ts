// Task #1135 — Verify order snapshot fields at checkout.
//
// `order_items` rows stamp several point-in-time snapshots at
// materialize-time so a fan's receipt stays correct even after the SKU or
// add-on it references later changes: `kind` / `sku` / `label` /
// `unitPriceCents` / `quantity` on every row, plus `vinylColor` /
// `jacketUpgrade` on a vinyl `format` row and `fulfiller` on a
// `custom_addon` row.
//
// The schema-drift guard only proves those columns *exist* — it can't catch
// a write path that stops *populating* one. This test drives a representative
// checkout (one vinyl `format` line item + one `custom_addon` line item)
// through the very same `materializeOrderFromSession` path the Stripe webhook
// uses, then reads the inserted rows back and asserts every snapshot field is
// populated and matches the fixture. If `materializeOrderFromSession` ever
// stops stamping one of these, the matching assertion fails loudly naming the
// field — before a fan gets a silently-broken receipt.
//
// Stripe is never called: `materializeOrderFromSession` takes an injectable
// `{ stripe }` seam and we hand it a stub that returns our fixture session +
// line items. The session is left UNPAID so the heavy paid-only side effects
// (GoodDeed numbering, stock, referral credits, receipt email, Order Desk)
// are skipped — the `order_items` insert happens regardless of paid status,
// which is exactly the surface under test.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/commerce.orderSnapshots.db.test.ts
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
    // album_skus cascade on albums delete.
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
    VALUES (${id}, ${"t1135_" + uniq}, ${"t1135_" + uniq + "@example.test"}, ${"t1135 fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t1135 album"}, ${"t1135 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedVinylSku(opts: {
  albumId: string;
  format: string;
  vinylColor: string;
  jacketUpgrade: string;
}): Promise<void> {
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents, vinyl_color, jacket_upgrade)
    VALUES (${randomUUID()}, ${opts.albumId}, ${opts.format}, ${3500}, ${opts.vinylColor}, ${opts.jacketUpgrade})
  `);
}

// A minimal Stripe stub exposing only what materializeOrderFromSession reads:
// checkout.sessions.retrieve (the expanded session) and listLineItems.
function makeStripeStub(opts: {
  session: any;
  lineItems: any[];
}) {
  return {
    checkout: {
      sessions: {
        retrieve: async (_id: string, _params?: any) => opts.session,
        listLineItems: async (_id: string, _params?: any) => ({ data: opts.lineItems }),
      },
    },
  } as any;
}

test("materializeOrderFromSession stamps every order_items snapshot field", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();

  const VINYL_FORMAT = "12_lp";
  const VINYL_COLOR = "translucent_mint";
  const JACKET_UPGRADE = "gatefold";
  const ADDON_ID = randomUUID();
  const FULFILLER = "Nightbirde Foundation";

  await seedVinylSku({
    albumId,
    format: VINYL_FORMAT,
    vinylColor: VINYL_COLOR,
    jacketUpgrade: JACKET_UPGRADE,
  });

  const sessionId = `cs_test_${randomUUID()}`;
  // UNPAID — exercises the order_items insert without firing paid-only side
  // effects. `metadata` carries what materialize reads off the session.
  const session: any = {
    id: sessionId,
    payment_status: "unpaid",
    amount_total: 6000,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    metadata: {
      gt_customer_id: customerId,
      gt_album_id: albumId,
      gt_sku_format: VINYL_FORMAT,
      gt_quantity: "1",
      gt_sku_kind: "vinyl",
    },
  };

  // One vinyl `format` line item + one `custom_addon` line item, each with the
  // product metadata the snapshot path reads (gt_kind / gt_sku / gt_fulfiller).
  const lineItems = [
    {
      description: "12\" LP — translucent mint",
      amount_total: 3500,
      quantity: 1,
      price: {
        unit_amount: 3500,
        product: { name: "12\" LP", metadata: { gt_kind: "format", gt_sku: VINYL_FORMAT } },
      },
    },
    {
      description: "Gift of Hope",
      amount_total: 2500,
      quantity: 1,
      price: {
        unit_amount: 2500,
        product: {
          name: "Gift of Hope",
          metadata: { gt_kind: "custom_addon", gt_sku: ADDON_ID, gt_fulfiller: FULFILLER },
        },
      },
    },
  ];

  const stripe = makeStripeStub({ session, lineItems });
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);

  const items = rows(await exec(sql`
    SELECT kind, sku, label, unit_price_cents, quantity, vinyl_color, jacket_upgrade, fulfiller
      FROM order_items WHERE order_id = ${order.id}
  `));

  assert.equal(items.length, 2, "both line items should materialize into order_items rows");

  const formatRow = items.find((i) => i.kind === "format");
  const addonRow = items.find((i) => i.kind === "custom_addon");
  assert.ok(formatRow, "a `format` order item should exist");
  assert.ok(addonRow, "a `custom_addon` order item should exist");

  // Snapshots common to every row.
  for (const [labelName, row] of [["format", formatRow], ["custom_addon", addonRow]] as const) {
    assert.ok(row.sku && row.sku !== "unknown", `${labelName} row: \`sku\` snapshot must be populated`);
    assert.ok(row.label && String(row.label).length > 0, `${labelName} row: \`label\` snapshot must be populated`);
    assert.ok(
      typeof row.unit_price_cents === "number" && row.unit_price_cents > 0,
      `${labelName} row: \`unitPriceCents\` snapshot must be populated`,
    );
    assert.ok(
      typeof row.quantity === "number" && row.quantity >= 1,
      `${labelName} row: \`quantity\` snapshot must be populated`,
    );
  }

  // Format-row pressing snapshot — copied off album_skus at materialize time.
  assert.equal(formatRow.sku, VINYL_FORMAT, "format row `sku` should snapshot the chosen format");
  assert.equal(
    formatRow.vinyl_color,
    VINYL_COLOR,
    "format row `vinylColor` must be snapshotted from the album SKU",
  );
  assert.equal(
    formatRow.jacket_upgrade,
    JACKET_UPGRADE,
    "format row `jacketUpgrade` must be snapshotted from the album SKU",
  );

  // Custom-addon-row fulfiller snapshot — copied off the line item product.
  assert.equal(addonRow.sku, ADDON_ID, "custom_addon row `sku` should snapshot the custom_addons id");
  assert.equal(
    addonRow.fulfiller,
    FULFILLER,
    "custom_addon row `fulfiller` must be snapshotted from the add-on",
  );
});
