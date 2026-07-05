// Task #2564 — regression coverage for break-even resolving off the
// saved vinyl SKU, WITHOUT a submitted pressing_order_request. A POR is
// only created at "Go to Press!", so a Prepping album that has merely
// saved a priced package used to show the hourglass placeholder forever
// even though its SKU carried the exact tier identity the Sell panel
// prices the run from. This locks in that:
//
//   - resolveAlbumSkuPressTier resolves the tier from press_tier_id with
//     NO POR present, and the number is byte-for-byte identical to the
//     POR-derived tier for the same catalog tier (they share one ladder
//     derivation, so break-even / the start-the-press floor can't drift).
//   - the (press_id + format + vinyl_color_tier name) fallback resolves
//     a legacy SKU saved before press_tier_id was snapshotted.
//   - computeAlbumBreakEven returns hasPressTier:true + a computed
//     vinylBreakEvenUnits for a Prepping album, and still shows the
//     placeholder (hasPressTier:false) when no priced tier exists.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/breakEvenSkuTier.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  resolveAlbumSkuPressTier,
  resolveAlbumPressTier,
} from "./earlyCut";
import { computeAlbumBreakEven } from "./breakEven";

const exec = (q: any) => db.execute(q);

const created = {
  manufacturers: new Set<string>(),
  tiers: new Set<string>(),
  albums: new Set<string>(),
  skus: new Set<string>(),
  pors: new Set<string>(),
};

let pressId = "";
let tierId = "";
const TIER_NAME = "T2564 Opaque";
const FORMAT = "12_lp";
// Two-rung ladder: min run is the smallest priced qty (100 @ $12.35).
const LADDER = [
  { qty: 100, unitCents: 1235 },
  { qty: 200, unitCents: 889 },
];
const MASTERS_PREP_CENTS = 20000;

async function seedAlbumWithSku(opts: {
  prepping: boolean;
  priceCents: number;
  pinTierId: boolean; // true → snapshot press_tier_id; false → name-only fallback
}): Promise<string> {
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, is_prepping)
    VALUES (${albumId}, ${"BE Test " + albumId.slice(0, 8)}, ${"T2564 Artist"}, ${""}, ${opts.prepping})
  `);
  created.albums.add(albumId);
  const skuId = randomUUID();
  await exec(sql`
    INSERT INTO album_skus
      (id, album_id, format, price_cents, active, press_id, press_tier_id, vinyl_color_tier)
    VALUES (${skuId}, ${albumId}, ${FORMAT}, ${opts.priceCents}, ${true},
            ${pressId}, ${opts.pinTierId ? tierId : null}, ${TIER_NAME})
  `);
  created.skus.add(skuId);
  return albumId;
}

before(async () => {
  pressId = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"T2564 Press"})
  `);
  created.manufacturers.add(pressId);

  tierId = randomUUID();
  await exec(sql`
    INSERT INTO press_color_tiers
      (id, press_id, format, name, position, price_ladder, masters_prep_cost_cents)
    VALUES (${tierId}, ${pressId}, ${FORMAT}, ${TIER_NAME}, ${0},
            ${JSON.stringify(LADDER)}::jsonb, ${MASTERS_PREP_CENTS})
  `);
  created.tiers.add(tierId);
});

after(async () => {
  for (const id of created.pors) await exec(sql`DELETE FROM pressing_order_requests WHERE id = ${id}`).catch(() => {});
  for (const id of created.skus) await exec(sql`DELETE FROM album_skus WHERE id = ${id}`).catch(() => {});
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`).catch(() => {});
  for (const id of created.tiers) await exec(sql`DELETE FROM press_color_tiers WHERE id = ${id}`).catch(() => {});
  for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`).catch(() => {});
});

test("SKU tier resolves off press_tier_id with no POR present", async () => {
  const albumId = await seedAlbumWithSku({ prepping: true, priceCents: 3500, pinTierId: true });
  // No pressing_order_request seeded → the POR path resolves null.
  assert.equal(await resolveAlbumPressTier(albumId), null);

  const tier = await resolveAlbumSkuPressTier(albumId);
  assert.ok(tier, "SKU path should resolve a tier with no POR");
  assert.equal(tier!.tierId, tierId);
  assert.equal(tier!.pressId, pressId);
  assert.equal(tier!.tierName, TIER_NAME);
  assert.equal(tier!.format, FORMAT);
  // Min-run rung = smallest priced qty (100 @ 1235¢), masters-prep carried.
  assert.equal(tier!.minRun, 100);
  assert.equal(tier!.unitPriceCents, 1235);
  assert.equal(tier!.mastersPrepCents, MASTERS_PREP_CENTS);
  assert.equal(tier!.pressFloorTotalCents, 100 * 1235 + MASTERS_PREP_CENTS);
});

test("SKU path == POR path for the same catalog tier (no drift)", async () => {
  const albumId = await seedAlbumWithSku({ prepping: false, priceCents: 3500, pinTierId: true });
  // Seed a submitted POR pointing at the same tier by (pressId/format/name).
  const porId = randomUUID();
  await exec(sql`
    INSERT INTO pressing_order_requests
      (id, album_id, status, package_snapshot, quantity, unit_cents, total_cents, submitted_at)
    VALUES (${porId}, ${albumId}, ${"submitted"},
            ${JSON.stringify({ pressId, format: FORMAT, vinylColorTier: TIER_NAME })}::jsonb,
            ${100}, ${1235}, ${100 * 1235}, now())
  `);
  created.pors.add(porId);

  const sku = await resolveAlbumSkuPressTier(albumId);
  const por = await resolveAlbumPressTier(albumId);
  assert.ok(sku && por, "both paths should resolve for a submitted album");
  assert.deepEqual(sku, por, "the two resolution paths must agree byte-for-byte");
});

test("legacy SKU (no press_tier_id) falls back to name match", async () => {
  const albumId = await seedAlbumWithSku({ prepping: true, priceCents: 3500, pinTierId: false });
  const tier = await resolveAlbumSkuPressTier(albumId);
  assert.ok(tier, "name-fallback should resolve the tier");
  assert.equal(tier!.tierId, tierId);
  assert.equal(tier!.minRun, 100);
});

test("Prepping album with a priced tier + retail computes break-even", async () => {
  const albumId = await seedAlbumWithSku({ prepping: true, priceCents: 3500, pinTierId: true });
  const be = await computeAlbumBreakEven(albumId);
  assert.equal(be.hasPressTier, true);
  assert.equal(be.computable, true);
  assert.ok((be.vinylBreakEvenUnits ?? 0) > 0, "should return a real copies-to-break-even count");
  assert.equal(be.vinylRetailCents, 3500);
  assert.equal(be.pressFloorUnits, 100);
});

test("multi-format album: only the priced-tier format resolves + prices", async () => {
  // album_skus is UNIQUE per (album_id, format), so multiple same-format SKUs
  // can't exist — the real multi-row case is an album with several FORMAT
  // SKUs. The resolver must pick a priced tier deterministically, and the
  // retail read filters by that same format (one row, by the unique index),
  // so tier + retail can never come from different rows.
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, is_prepping)
    VALUES (${albumId}, ${"BE MultiFmt"}, ${"T2564 Artist"}, ${""}, ${true})
  `);
  created.albums.add(albumId);
  // A 7" SKU with NO press tier (unpriced tier) + the 12" SKU carrying the tier.
  const sevenId = randomUUID();
  const twelveId = randomUUID();
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents, active)
    VALUES (${sevenId}, ${albumId}, ${"7_inch"}, ${1800}, ${true})
  `);
  created.skus.add(sevenId);
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents, active, press_id, press_tier_id, vinyl_color_tier)
    VALUES (${twelveId}, ${albumId}, ${FORMAT}, ${3500}, ${true}, ${pressId}, ${tierId}, ${TIER_NAME})
  `);
  created.skus.add(twelveId);

  const tier = await resolveAlbumSkuPressTier(albumId);
  assert.ok(tier, "should resolve the priced 12\" tier over the un-tiered 7\"");
  assert.equal(tier!.format, FORMAT);

  const be = await computeAlbumBreakEven(albumId);
  assert.equal(be.hasPressTier, true);
  // Retail is the 12" (tier's format) price, never the 7" row.
  assert.equal(be.vinylRetailCents, 3500);
});

test("no priced tier ⇒ hasPressTier false (placeholder still shows)", async () => {
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, is_prepping)
    VALUES (${albumId}, ${"BE NoTier"}, ${"T2564 Artist"}, ${""}, ${true})
  `);
  created.albums.add(albumId);
  // A vinyl SKU priced but with no press tier at all.
  const skuId = randomUUID();
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents, active)
    VALUES (${skuId}, ${albumId}, ${FORMAT}, ${3500}, ${true})
  `);
  created.skus.add(skuId);
  const be = await computeAlbumBreakEven(albumId);
  assert.equal(be.hasPressTier, false);
  assert.equal(be.computable, false);
  assert.equal(be.vinylBreakEvenUnits, null);
});
