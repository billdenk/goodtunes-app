/**
 * Patch Viryl Technologies press catalog: add confirmed 7-inch and 2×LP
 * (12_double) pricing for the record-component costs where Viryl publishes
 * them in the 2024 USD pricing sheet.
 *
 * The initial seed (viryl_catalog_seed_v1) loaded full all-in confirmed
 * pricing only for 12_lp. This patch adds:
 *
 *   7-inch  → jacket "7-inch Paper Sleeve Only (No Jacket)"
 *             Confirmed per-unit cost = record + $0.13 insertion (sleeve
 *             included, no separate jacket charge). Qty breaks are Viryl's
 *             standard 50/100/200/300/500/1000; per-unit cost is constant
 *             across breaks (Viryl only qty-discounts the printed jacket,
 *             not the record itself). Tiers without a published 7" record
 *             price (Premium, Hand Pour, Splatter) remain TBD.
 *
 *   12_double → jacket "Records + Inner Sleeves Only (No Gatefold)"
 *              Confirmed per-unit cost = 2 × record + 2 × $0.13 insertion.
 *              The gatefold jacket is Custom Quote from Viryl and is NOT
 *              included — the existing "Standard Digitally Printed Jacket"
 *              entry for 12_double stays TBD. This lets the Sell panel show
 *              the record-manufacturing component of a 2× LP order.
 *
 * Pricing source (USD, 12" 140g where applicable):
 *   Black:           12" $1.65 · 7" $1.25
 *   Transparent:     12" $1.91 · 7" $1.30
 *   Opaque:          12" $2.16 · 7" $1.49
 *   Metallic:        Opaque + $2.32 specialty → 12" $4.48 · 7" $3.81
 *   Multi-colour:    12" $2.25 · 7" $1.85
 *   Hand Pour base+1: 12" $2.65 · 7" TBD (not listed)
 *   Splatter base+1:  12" $3.25 · 7" TBD (not listed)
 *   Premium (Glow):  Custom Quote all formats
 *
 * Dev:  npx tsx scripts/patch-viryl-pricing.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/patch-viryl-pricing.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  manufacturers,
  pressColorTiers,
  pressJackets,
  pressTierJacketLadders,
} from "@shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_pricing_patch_v1";

type Fmt = "12_lp" | "12_double" | "7_inch";
type RungSpec = { qty: number; unitCents: number; confirmed: boolean; source?: string };

const QTYS = [50, 100, 200, 300, 500, 1000] as const;
const INSERTION_CENTS = 13;
const SOURCE = "viryl-catalog-2024";

/** Constant-rate confirmed ladder (no qty-tiered discount on the record). */
function flatLadder(unitCents: number): RungSpec[] {
  return QTYS.map((qty) => ({ qty, unitCents, confirmed: true, source: SOURCE }));
}

function tbdLadder(): RungSpec[] {
  return QTYS.map((qty) => ({ qty, unitCents: 0, confirmed: false }));
}

// Per-tier record costs (cents, 140g) for 7" and 12_double (×2 records).
// "null" means Custom Quote / no published price → TBD rungs.
const TIER_RECORD_CENTS: Record<string, { r12: number; r7: number | null }> = {
  "Black":               { r12: 165, r7: 125 },
  "Opaque":              { r12: 216, r7: 149 },
  "Metallic / Specialty":{ r12: 448, r7: 381 }, // Opaque + $2.32 specialty
  "Transparent":         { r12: 191, r7: 130 },
  "Premium":             { r12: 0,   r7: null }, // Custom Quote
  "Multi-colour":        { r12: 225, r7: 185 },
  "Hand Pour":           { r12: 265, r7: null }, // 7" not listed
  "Splatter":            { r12: 325, r7: null }, // 7" not listed
};

function ladder7inch(tierName: string): RungSpec[] {
  const costs = TIER_RECORD_CENTS[tierName];
  if (!costs || costs.r7 === null) return tbdLadder();
  return flatLadder(costs.r7 + INSERTION_CENTS);
}

function ladder12double(tierName: string): RungSpec[] {
  const costs = TIER_RECORD_CENTS[tierName];
  if (!costs || costs.r12 === 0) return tbdLadder(); // Premium = custom quote
  // 2 records + 2 insertions per double LP unit
  return flatLadder(2 * costs.r12 + 2 * INSERTION_CENTS);
}

async function ensureJacket(pressId: string, name: string, position: number): Promise<string> {
  const [ex] = await db
    .select({ id: pressJackets.id })
    .from(pressJackets)
    .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.name, name)));
  if (ex) return ex.id;
  if (DRY) {
    console.log(`  [dry] would create jacket: "${name}"`);
    return `dry-${name}`;
  }
  const [row] = await db
    .insert(pressJackets)
    .values({ pressId, name, position, isDefault: false })
    .returning({ id: pressJackets.id });
  return row.id;
}

async function ensureComboLadder(
  tierId: string,
  jacketId: string,
  ladder: RungSpec[],
  label: string,
): Promise<void> {
  const [ex] = await db
    .select({ id: pressTierJacketLadders.id })
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (ex) {
    console.log(`  [skip] ${label} — ladder already exists`);
    return;
  }
  const conf = ladder.filter((r) => r.confirmed).length;
  if (DRY) {
    console.log(`  [dry]  ${label} — ${conf}/${ladder.length} confirmed rungs`);
    return;
  }
  await db.insert(pressTierJacketLadders).values({ tierId, jacketId, priceLadder: ladder });
  console.log(`  [ok]   ${label} — ${conf}/${ladder.length} confirmed rungs`);
}

async function main() {
  const label = DRY ? " (DRY RUN)" : "";
  console.log(`patch-viryl-pricing${label} — ${new Date().toISOString()}`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);

  const [markerRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}
    ) AS exists
  `).then((r) => r.rows);
  if (markerRow?.exists) {
    console.log(`Marker '${MARKER}' already set — nothing to do.`);
    return;
  }

  // Find Viryl press
  const [mfr] = await db
    .select({ id: manufacturers.id, name: manufacturers.name })
    .from(manufacturers)
    .where(eq(manufacturers.domain, "viryl.ca"));
  if (!mfr) {
    console.error("Viryl manufacturer not found — run seed-viryl-catalog.ts first.");
    process.exit(1);
  }
  console.log(`  press: ${mfr.name} (${mfr.id})`);

  // Create new jackets
  const JACKET_7INCH = "7-inch Paper Sleeve Only (No Jacket)";
  const JACKET_2LP_RECORDS = "Records + Inner Sleeves Only (No Gatefold)";

  const jacket7Id = await ensureJacket(mfr.id, JACKET_7INCH, 1);
  const jacket2lpId = await ensureJacket(mfr.id, JACKET_2LP_RECORDS, 2);

  if (!DRY) {
    console.log(`  jacket (7"): "${JACKET_7INCH}" (${jacket7Id})`);
    console.log(`  jacket (2LP): "${JACKET_2LP_RECORDS}" (${jacket2lpId})`);
  }

  // Load all tiers for Viryl
  const tiers = await db
    .select({ id: pressColorTiers.id, format: pressColorTiers.format, name: pressColorTiers.name })
    .from(pressColorTiers)
    .where(eq(pressColorTiers.pressId, mfr.id));

  // Add ladders for 7_inch → JACKET_7INCH and 12_double → JACKET_2LP_RECORDS
  const formats: Array<{ fmt: Fmt; jacketId: string; ladderFn: (t: string) => RungSpec[] }> = [
    { fmt: "7_inch", jacketId: jacket7Id, ladderFn: ladder7inch },
    { fmt: "12_double", jacketId: jacket2lpId, ladderFn: ladder12double },
  ];

  for (const { fmt, jacketId, ladderFn } of formats) {
    const fmtTiers = tiers.filter((t) => t.format === fmt);
    for (const tier of fmtTiers) {
      const ladder = ladderFn(tier.name);
      const lbl = `${fmt.padEnd(12)} ${tier.name.padEnd(22)}`;
      if (DRY) {
        const conf = ladder.filter((r) => r.confirmed).length;
        console.log(`  [dry]  ${lbl} — ${conf}/${ladder.length} confirmed rungs`);
        continue;
      }
      await ensureComboLadder(tier.id, jacketId, ladder, lbl);
    }
  }

  if (!DRY) {
    await db.execute(sql`
      INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING
    `);
    console.log(`  marker '${MARKER}' set.`);
  }
  console.log("Done.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
