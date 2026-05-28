/**
 * Task #652 — One-shot backfill of `album_skus.cost_snapshot_manufacturing_cents`
 * for catalog-priced vinyl rows that were saved before their press's catalog
 * ladder had a confirmed rung. Those rows persisted `0` and the SellPanel's
 * "locked · catalog" branch kept serving the stale $0 forever (Manufacturing
 * read as $0.00 in the per-unit profit breakdown, so Profit/Total were
 * silently overstated).
 *
 * For every row where `cost_snapshot_manufacturing_cents = 0` AND we can
 * resolve a confirmed catalog rung for the saved tier/color/qty via
 * `lookupCatalogUnitCents`, we update the snapshot (and the discounted
 * mirror column) to the rung's `unitCents`. Rows we can't resolve are
 * left alone — they'll heal lazily the next time the SellPanel opens.
 *
 * Idempotent — only touches rows that still read $0. Safe to re-run.
 *
 * Run against whatever DATABASE_URL is set:
 *   npx tsx scripts/backfill-sellpanel-stale-snapshots.ts
 * Against prod:
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-sellpanel-stale-snapshots.ts
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { lookupCatalogUnitCents } from "../server/pressCatalog";
import type { AlbumFormat } from "@shared/schema";

type Candidate = {
  id: string;
  album_id: string;
  format: AlbumFormat;
  planned_quantity: number | null;
  vinyl_color: string | null;
  vinyl_color_tier: string | null;
  quantity_tier: number | null;
  cost_source: string | null;
  press_id: string | null;
  broker_discount_pct: number | null;
};

async function main() {
  // Resolve press per row via primary_artist → label fallback. Only
  // pull catalog rows (cost_source = 'catalog') with a $0 snapshot; the
  // legacy placeholder/Hellbender rows are off-catalog and the
  // SellPanel routes them to needsQuote, not auto-heal.
  const result = await db.execute(sql`
    SELECT s.id,
           s.album_id,
           s.format,
           s.planned_quantity,
           s.vinyl_color,
           s.vinyl_color_tier,
           s.quantity_tier,
           s.cost_source,
           COALESCE(p.invited_by_press_id, l.invited_by_press_id) AS press_id,
           m.broker_discount_pct
      FROM album_skus s
      JOIN albums a ON a.id = s.album_id
      LEFT JOIN people p ON p.id = a.primary_artist_id
      LEFT JOIN labels l ON l.id = a.label_id
      LEFT JOIN manufacturers m ON m.id = COALESCE(p.invited_by_press_id, l.invited_by_press_id)
     WHERE s.cost_snapshot_manufacturing_cents = 0
       AND s.cost_source = 'catalog'
       AND s.deleted_at IS NULL
  `);
  const rows = ((result as any).rows ?? result) as Candidate[];
  console.log(`Found ${rows.length} candidate row(s) with stale $0 snapshot.`);

  let healed = 0;
  let skippedNoPress = 0;
  let skippedNoTier = 0;
  let skippedNoLookup = 0;
  let skippedZeroRung = 0;

  for (const row of rows) {
    if (!row.press_id) {
      skippedNoPress++;
      continue;
    }
    if (!row.vinyl_color_tier) {
      // Can't resolve catalog tier without the snapshotted tier name.
      skippedNoTier++;
      continue;
    }

    // Resolve the tier id from the snapshotted name (the SKU stores
    // the display name, not the id, mirroring SellPanel's save shape).
    const tierLookup = await db.execute(sql`
      SELECT id FROM press_color_tiers
       WHERE press_id = ${row.press_id}
         AND format = ${row.format}
         AND name = ${row.vinyl_color_tier}
       LIMIT 1
    `);
    const tierRow = ((tierLookup as any).rows ?? tierLookup)[0] as
      | { id: string }
      | undefined;
    if (!tierRow) {
      skippedNoTier++;
      continue;
    }

    let colorId: string | null = null;
    if (row.vinyl_color) {
      const colorLookup = await db.execute(sql`
        SELECT id FROM press_colors
         WHERE tier_id = ${tierRow.id}
           AND name = ${row.vinyl_color}
         LIMIT 1
      `);
      const c = ((colorLookup as any).rows ?? colorLookup)[0] as
        | { id: string }
        | undefined;
      colorId = c?.id ?? null;
    }

    const looked = await lookupCatalogUnitCents({
      pressId: row.press_id,
      format: row.format,
      tierId: tierRow.id,
      colorId,
      quantity: row.quantity_tier ?? row.planned_quantity ?? null,
    });

    if (!looked) {
      skippedNoLookup++;
      continue;
    }
    if (!looked.unitCents || looked.unitCents <= 0) {
      // Live rung is still TBD — nothing to heal to. Leave the row at $0;
      // SellPanel will keep flagging it via the live-snap branch.
      skippedZeroRung++;
      continue;
    }

    const pct = row.broker_discount_pct;
    const discounted =
      pct != null && pct > 0
        ? Math.floor((looked.unitCents * (100 - pct)) / 100)
        : null;

    await db.execute(sql`
      UPDATE album_skus
         SET cost_snapshot_manufacturing_cents = ${looked.unitCents},
             cost_snapshot_manufacturing_discounted_cents = ${discounted}
       WHERE id = ${row.id}
    `);
    healed++;
    console.log(
      `  healed sku ${row.id} (album=${row.album_id}, ${row.format}, ${row.vinyl_color_tier}/${row.vinyl_color ?? "—"} @ ${row.quantity_tier ?? row.planned_quantity ?? "?"}) -> ${looked.unitCents}¢/unit`,
    );
  }

  console.log("");
  console.log(`Healed:            ${healed}`);
  console.log(`Skipped (no press): ${skippedNoPress}`);
  console.log(`Skipped (no tier):  ${skippedNoTier}`);
  console.log(`Skipped (no rung):  ${skippedNoLookup}`);
  console.log(`Skipped (rung $0):  ${skippedZeroRung}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
