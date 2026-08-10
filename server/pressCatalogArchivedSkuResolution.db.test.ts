// Task #3000 — archived types/colors must stay visible on already-sold
// records. Archive (archived_at) hides a tier/color from the catalog
// editor and every new-pick surface (getPressCatalog), while existing
// album SKU snapshots keep resolving identity + unit pricing because
// resolveCatalogIdentity / lookupCatalogUnitCents deliberately query
// press_color_tiers / press_colors directly, UNFILTERED. Nothing else
// guards that boundary — a future "filter archived everywhere" sweep
// would silently break display/pricing on pressed records. This test is
// the guard:
//
//   (1) An album SKU snapshot pins (pressId, pressTierId, pressColorId).
//       After the tier + color are archived, resolveCatalogIdentity still
//       returns the tier/color names and lookupCatalogUnitCents still
//       prices the snapshot off the (tier, default jacket) ladder.
//   (2) getPressCatalog excludes the archived tier entirely, and excludes
//       an archived color from an otherwise-active tier, while active
//       siblings stay listed.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/pressCatalogArchivedSkuResolution.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  getPressCatalog,
  resolveCatalogIdentity,
  lookupCatalogUnitCents,
} from "./pressCatalog";

const exec = (q: any) => db.execute(q);

const FORMAT = "12_lp" as const;
const LADDER = [
  { qty: 100, unitCents: 1235, confirmed: true },
  { qty: 300, unitCents: 910, confirmed: true },
];

let pressId = "";
let jacketId = "";
let soldTierId = ""; // gets archived; referenced by the SKU snapshot
let soldColorId = ""; // gets archived (cascade-style); referenced by the SKU
let activeTierId = ""; // stays active
let activeColorId = ""; // stays active (on activeTier)
let retiredColorId = ""; // archived color on the ACTIVE tier
let albumId = "";
let skuId = "";

before(async () => {
  pressId = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t3000 Press"})`);
  await exec(sql`INSERT INTO press_formats (press_id, format) VALUES (${pressId}, ${FORMAT}) ON CONFLICT DO NOTHING`);

  jacketId = randomUUID();
  await exec(sql`
    INSERT INTO press_jackets (id, press_id, name, position, is_default)
    VALUES (${jacketId}, ${pressId}, ${"t3000 Standard Jacket"}, 0, true)
  `);

  const mkTier = async (name: string, position: number) => {
    const id = randomUUID();
    await exec(sql`
      INSERT INTO press_color_tiers (id, press_id, format, name, position, price_ladder)
      VALUES (${id}, ${pressId}, ${FORMAT}, ${name}, ${position}, '[]'::jsonb)
    `);
    return id;
  };
  const mkColor = async (tierId: string, name: string, position: number) => {
    const id = randomUUID();
    await exec(sql`
      INSERT INTO press_colors (id, tier_id, name, position)
      VALUES (${id}, ${tierId}, ${name}, ${position})
    `);
    return id;
  };

  soldTierId = await mkTier("t3000 Splatter", 0);
  activeTierId = await mkTier("t3000 Opaque", 1);
  soldColorId = await mkColor(soldTierId, "Lava Red", 0);
  activeColorId = await mkColor(activeTierId, "Sky Blue", 0);
  retiredColorId = await mkColor(activeTierId, "Retired Green", 1);

  // Ladder lives on the (tier, jacket) combo — the shape
  // lookupCatalogUnitCents resolves through the default jacket.
  await exec(sql`
    INSERT INTO press_tier_jacket_ladders (tier_id, jacket_id, price_ladder)
    VALUES (${soldTierId}, ${jacketId}, ${JSON.stringify(LADDER)}::jsonb)
  `);

  // The already-sold record: an album whose SKU snapshot pins the exact
  // catalog identity (press + tier + color ids) plus the display names.
  albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"t3000 Sold Album"}, ${"t3000 Artist"}, ${""})
  `);
  skuId = randomUUID();
  await exec(sql`
    INSERT INTO album_skus
      (id, album_id, format, price_cents, active,
       press_id, press_tier_id, press_color_id, vinyl_color_tier, vinyl_color, quantity_tier)
    VALUES (${skuId}, ${albumId}, ${FORMAT}, ${4500}, true,
            ${pressId}, ${soldTierId}, ${soldColorId}, ${"t3000 Splatter"}, ${"Lava Red"}, ${100})
  `);

  // Archive: soft-retire the sold tier + its color (mirrors what
  // POST .../tiers/:id/archive stamps) and one color on the active tier.
  await exec(sql`UPDATE press_color_tiers SET archived_at = now() WHERE id = ${soldTierId}`);
  await exec(sql`UPDATE press_colors SET archived_at = now() WHERE id IN (${soldColorId}, ${retiredColorId})`);
});

test("SKU snapshot still resolves identity for an archived tier + color", async () => {
  const sku = (
    await exec(sql`SELECT press_tier_id, press_color_id FROM album_skus WHERE id = ${skuId}`)
  ).rows[0] as any;
  const identity = await resolveCatalogIdentity({
    tierId: sku.press_tier_id,
    colorId: sku.press_color_id,
    format: FORMAT as any,
  });
  assert.ok(identity, "archived tier still resolves for the historical SKU");
  assert.equal(identity!.pressId, pressId);
  assert.equal(identity!.tierName, "t3000 Splatter");
  assert.equal(identity!.colorName, "Lava Red");
});

test("SKU snapshot still resolves unit pricing for an archived tier + color", async () => {
  const priced = await lookupCatalogUnitCents({
    pressId,
    format: FORMAT as any,
    tierId: soldTierId,
    colorId: soldColorId,
    quantity: 100,
  });
  assert.ok(priced, "archived tier still prices the historical SKU");
  assert.equal(priced!.unitCents, 1235);
  assert.equal(priced!.snappedQty, 100);
  assert.equal(priced!.tierName, "t3000 Splatter");
  assert.equal(priced!.colorName, "Lava Red");
  assert.equal(priced!.requiresQuote, false);
  // Snapping still walks the archived tier's full ladder.
  const upper = await lookupCatalogUnitCents({
    pressId,
    format: FORMAT as any,
    tierId: soldTierId,
    colorId: null,
    quantity: 250,
  });
  assert.ok(upper);
  assert.equal(upper!.unitCents, 910);
  assert.equal(upper!.snappedQty, 300);
});

test("getPressCatalog excludes archived tiers and colors (editor + SellPanel source)", async () => {
  const catalog = await getPressCatalog(pressId);
  const fmt = catalog.formats.find((f) => f.format === FORMAT);
  assert.ok(fmt, "format present");
  const tierIds = fmt!.tiers.map((t) => t.id);
  assert.ok(!tierIds.includes(soldTierId), "archived tier hidden from catalog");
  assert.ok(tierIds.includes(activeTierId), "active tier still listed");
  const active = fmt!.tiers.find((t) => t.id === activeTierId)!;
  const colorIds = active.colors.map((c) => c.id);
  assert.ok(colorIds.includes(activeColorId), "active color still listed");
  assert.ok(!colorIds.includes(retiredColorId), "archived color hidden from its active tier");
});

after(async () => {
  try {
    await exec(sql`DELETE FROM album_skus WHERE id = ${skuId}`);
    await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
    await exec(sql`DELETE FROM press_tier_jacket_ladders WHERE tier_id IN (${soldTierId}, ${activeTierId})`);
    await exec(sql`DELETE FROM press_colors WHERE tier_id IN (${soldTierId}, ${activeTierId})`);
    await exec(sql`DELETE FROM press_color_tiers WHERE press_id = ${pressId}`);
    await exec(sql`DELETE FROM press_jackets WHERE press_id = ${pressId}`);
    await exec(sql`DELETE FROM press_formats WHERE press_id = ${pressId}`);
    await exec(sql`DELETE FROM manufacturers WHERE id = ${pressId}`);
  } finally {
    await pool.end();
  }
});
