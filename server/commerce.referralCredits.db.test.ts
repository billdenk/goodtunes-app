// Task #1137 — Confirm referral & charity payouts get recorded at checkout.
//
// The entire PAID branch of `materializeOrderFromSession` had no automated
// coverage until Task #1136 added the per-copy snapshot test. The largest
// remaining untested money-path is the referral-credit accrual block
// (server/commerce.ts ~3026–3157): on the FIRST paid sale of an album it
// mints `referral_credits` rows for whoever referred the artist —
//
//   • artist → artist  (people.referred_by_person_id): $perUnit × units,
//     UNLESS a matching `artist_referrals` row has been pre-elected
//     swap_state = 'invitee_keeps_full', in which case the credit is SKIPPED
//     (the invitee keeps the slice) but the row is still frozen.
//
//   • per-album NPO split (album_npo_beneficiaries): ONE non_profit credit
//     per beneficiary, each at its own per-unit rate.
//
// None of these write paths fail loudly — a regression would just silently
// stop paying referrers/charities. This test drives a representative PAID
// checkout through the very same `materializeOrderFromSession` path the
// Stripe webhook uses (Stripe replaced by the same `{ stripe }` stub seam +
// paid-fixture pattern as server/commerce.orderCopiesSnapshots.db.test.ts),
// then reads the inserted `referral_credits` rows back and asserts:
//
//   1. an artist credit is minted with referrer_kind='artist', the right
//      referrer_person_id, amount_cents = perUnit × units, units, and
//      status='pending_payout';
//   2. the 'invitee_keeps_full' swap correctly SKIPS the artist credit;
//   3. a per-album NPO split mints one non_profit credit per beneficiary
//      at the correct per-unit amount.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test server/commerce.referralCredits.db.test.ts
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
  people: new Set<string>(),
  organizations: new Set<string>(),
  artistReferrals: new Set<string>(),
  npoBeneficiaries: new Set<string>(),
};

after(async () => {
  try {
    // referral_credits has no FK to orders, so clear it by order_id first.
    for (const id of created.orders) await exec(sql`DELETE FROM referral_credits WHERE order_id = ${id}`);
    // order_items / order_copies cascade on orders delete (FK onDelete: cascade).
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
    for (const id of created.npoBeneficiaries) await exec(sql`DELETE FROM album_npo_beneficiaries WHERE id = ${id}`);
    for (const id of created.artistReferrals) await exec(sql`DELETE FROM artist_referrals WHERE id = ${id}`);
    // The PAID path unlocks the album for the fan by inserting a user_albums
    // entitlement row, whose album_id FK is NO ACTION — clear it before the album.
    for (const id of created.albums) await exec(sql`DELETE FROM user_albums WHERE album_id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.customers) await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
    for (const id of created.organizations) await exec(sql`DELETE FROM organizations WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});

async function seedCustomer(): Promise<string> {
  const id = randomUUID();
  const uniq = id.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${id}, ${"t1137_" + uniq}, ${"t1137_" + uniq + "@example.test"}, ${"t1137 fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t1137 album"}, ${"t1137 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedPerson(opts: {
  referredByPersonId?: string | null;
  referredByOrgId?: string | null;
  referrerPerUnitCents?: number | null;
} = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, referred_by_person_id, referred_by_org_id, referrer_per_unit_cents)
    VALUES (
      ${id},
      ${"t1137 person " + id.slice(0, 8)},
      ${opts.referredByPersonId ?? null},
      ${opts.referredByOrgId ?? null},
      ${opts.referrerPerUnitCents ?? 100}
    )
  `);
  created.people.add(id);
  return id;
}

async function seedOrganization(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO organizations (id, name, kind)
    VALUES (${id}, ${"t1137 npo " + id.slice(0, 8)}, ${"non_profit"})
  `);
  created.organizations.add(id);
  return id;
}

async function seedArtistReferral(opts: {
  referrerPersonId: string;
  inviteePersonId: string;
  albumId: string | null;
  swapState: string;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO artist_referrals (id, referrer_person_id, invitee_person_id, album_id, swap_state)
    VALUES (${id}, ${opts.referrerPersonId}, ${opts.inviteePersonId}, ${opts.albumId}, ${opts.swapState})
  `);
  created.artistReferrals.add(id);
  return id;
}

async function seedNpoBeneficiary(opts: {
  albumId: string;
  organizationId: string;
  perUnitCents: number;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO album_npo_beneficiaries (id, album_id, organization_id, per_unit_cents)
    VALUES (${id}, ${opts.albumId}, ${opts.organizationId}, ${opts.perUnitCents})
  `);
  created.npoBeneficiaries.add(id);
  return id;
}

async function seedVinylSku(opts: { albumId: string; format: string; priceCents: number }): Promise<void> {
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents)
    VALUES (${randomUUID()}, ${opts.albumId}, ${opts.format}, ${opts.priceCents})
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

// Builds a PAID checkout fixture + stub for `quantity` copies of one vinyl
// format line item. `artistPersonId` rides as gt_artist_id so the referral
// accrual block reads our seeded `people` row (not the album's primary artist).
async function drivePaidCheckout(opts: {
  customerId: string;
  albumId: string;
  artistPersonId: string;
  format: string;
  unitPriceCents: number;
  quantity: number;
}) {
  const sessionId = `cs_test_${randomUUID()}`;
  const session: any = {
    id: sessionId,
    payment_status: "paid",
    amount_total: opts.unitPriceCents * opts.quantity,
    currency: "usd",
    payment_intent: null,
    customer: null,
    customer_details: { email: "fan@example.test", name: "Test Fan", phone: null, address: null },
    metadata: {
      gt_customer_id: opts.customerId,
      gt_album_id: opts.albumId,
      gt_artist_id: opts.artistPersonId,
      gt_sku_format: opts.format,
      gt_quantity: String(opts.quantity),
      gt_sku_kind: "vinyl",
    },
  };
  const lineItems = [
    {
      description: opts.format,
      amount_total: opts.unitPriceCents * opts.quantity,
      quantity: opts.quantity,
      price: {
        unit_amount: opts.unitPriceCents,
        product: { name: opts.format, metadata: { gt_kind: "format", gt_sku: opts.format } },
      },
    },
  ];
  const stripe = makeStripeStub({ session, lineItems });
  const order = await materializeOrderFromSession(session, { stripe });
  created.orders.add(order.id);
  return order;
}

test("mints an artist→artist referral credit on a paid checkout", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();

  const PER_UNIT_CENTS = 100;
  const QUANTITY = 2;
  const FORMAT = "lp";

  // Referrer artist + invitee artist (this album's artist) who carries the
  // `referred_by_person_id` pointer, plus a matching artist_referrals row
  // pre-elected to the default 'referrer_keeps_full'.
  const referrerPersonId = await seedPerson({});
  const inviteePersonId = await seedPerson({
    referredByPersonId: referrerPersonId,
    referrerPerUnitCents: PER_UNIT_CENTS,
  });
  await seedArtistReferral({
    referrerPersonId,
    inviteePersonId,
    albumId: null, // pre-release row; pinned to the album on first paid sale
    swapState: "referrer_keeps_full",
  });
  await seedVinylSku({ albumId, format: FORMAT, priceCents: 3000 });

  const order = await drivePaidCheckout({
    customerId,
    albumId,
    artistPersonId: inviteePersonId,
    format: FORMAT,
    unitPriceCents: 3000,
    quantity: QUANTITY,
  });

  assert.equal(order.status, "paid", "the fixture session is PAID so the order must materialize as paid");

  const credits = rows(await exec(sql`
    SELECT referrer_kind, referrer_person_id, referrer_org_id, amount_cents, units, status
      FROM referral_credits WHERE order_id = ${order.id} AND referrer_kind = 'artist'
  `));

  assert.equal(credits.length, 1, "a referred artist's paid sale must mint exactly one artist referral credit");
  const c = credits[0];
  assert.equal(c.referrer_person_id, referrerPersonId, "the credit must be attributed to the referring artist");
  assert.equal(c.referrer_org_id, null, "an artist credit carries no org");
  assert.equal(c.units, QUANTITY, "`units` must be the paid format units");
  assert.equal(
    c.amount_cents,
    PER_UNIT_CENTS * QUANTITY,
    "`amount_cents` must be per-unit × units",
  );
  assert.equal(c.status, "pending_payout", "a freshly-minted credit must start pending_payout");

  // The pre-release artist_referrals row must be pinned + frozen on first sale.
  const ar = rows(await exec(sql`
    SELECT album_id, frozen_at FROM artist_referrals
      WHERE referrer_person_id = ${referrerPersonId} AND invitee_person_id = ${inviteePersonId}
  `));
  assert.equal(ar.length, 1, "the artist_referrals row must still be present");
  assert.equal(ar[0].album_id, albumId, "first paid sale must pin the referral to this album");
  assert.notEqual(ar[0].frozen_at, null, "first paid sale must freeze the swap state");
});

test("skips the artist credit when the swap is invitee_keeps_full", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();

  const FORMAT = "lp";
  const referrerPersonId = await seedPerson({});
  const inviteePersonId = await seedPerson({
    referredByPersonId: referrerPersonId,
    referrerPerUnitCents: 100,
  });
  // Invitee keeps the full slice — no credit should be minted for the referrer.
  await seedArtistReferral({
    referrerPersonId,
    inviteePersonId,
    albumId: null,
    swapState: "invitee_keeps_full",
  });
  await seedVinylSku({ albumId, format: FORMAT, priceCents: 3000 });

  const order = await drivePaidCheckout({
    customerId,
    albumId,
    artistPersonId: inviteePersonId,
    format: FORMAT,
    unitPriceCents: 3000,
    quantity: 2,
  });

  assert.equal(order.status, "paid", "the fixture session is PAID so the order must materialize as paid");

  const credits = rows(await exec(sql`
    SELECT id FROM referral_credits WHERE order_id = ${order.id} AND referrer_kind = 'artist'
  `));
  assert.equal(
    credits.length,
    0,
    "the 'invitee_keeps_full' swap must SKIP minting the artist credit",
  );

  // The swap row is still frozen even though no credit was paid.
  const ar = rows(await exec(sql`
    SELECT frozen_at FROM artist_referrals
      WHERE referrer_person_id = ${referrerPersonId} AND invitee_person_id = ${inviteePersonId}
  `));
  assert.equal(ar.length, 1, "the artist_referrals row must still be present");
  assert.notEqual(ar[0].frozen_at, null, "first paid sale must freeze the swap even when no credit is minted");
});

test("mints one non_profit credit per album NPO beneficiary", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();

  const FORMAT = "lp";
  const QUANTITY = 3;
  const ORG_A_PER_UNIT = 60;
  const ORG_B_PER_UNIT = 40;

  // Artist with NO artist/NPO referral pointer — the NPO split is a property
  // of the ALBUM, so the credits must mint purely from album_npo_beneficiaries.
  const artistPersonId = await seedPerson({});
  const orgA = await seedOrganization();
  const orgB = await seedOrganization();
  await seedNpoBeneficiary({ albumId, organizationId: orgA, perUnitCents: ORG_A_PER_UNIT });
  await seedNpoBeneficiary({ albumId, organizationId: orgB, perUnitCents: ORG_B_PER_UNIT });
  await seedVinylSku({ albumId, format: FORMAT, priceCents: 3000 });

  const order = await drivePaidCheckout({
    customerId,
    albumId,
    artistPersonId,
    format: FORMAT,
    unitPriceCents: 3000,
    quantity: QUANTITY,
  });

  assert.equal(order.status, "paid", "the fixture session is PAID so the order must materialize as paid");

  const credits = rows(await exec(sql`
    SELECT referrer_kind, referrer_org_id, amount_cents, units, status
      FROM referral_credits WHERE order_id = ${order.id} AND referrer_kind = 'non_profit'
      ORDER BY amount_cents DESC
  `));

  assert.equal(credits.length, 2, "each album NPO beneficiary must mint its own non_profit credit");

  const byOrg = new Map(credits.map((c) => [c.referrer_org_id, c]));
  const a = byOrg.get(orgA);
  const b = byOrg.get(orgB);
  assert.ok(a, "beneficiary org A must receive a credit");
  assert.ok(b, "beneficiary org B must receive a credit");

  assert.equal(a.amount_cents, ORG_A_PER_UNIT * QUANTITY, "org A credit must be its per-unit × units");
  assert.equal(b.amount_cents, ORG_B_PER_UNIT * QUANTITY, "org B credit must be its per-unit × units");
  assert.equal(a.units, QUANTITY, "org A credit units must be the paid format units");
  assert.equal(b.units, QUANTITY, "org B credit units must be the paid format units");
  assert.equal(a.status, "pending_payout", "org A credit must start pending_payout");
  assert.equal(b.status, "pending_payout", "org B credit must start pending_payout");
});
