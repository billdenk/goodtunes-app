/**
 * Patch Viryl Technologies press catalog: add 12" 180g jacket pricing and a
 * records-only (no printed jacket) option for the standard 12_lp format.
 *
 * Source of truth:
 *   attached_assets/USD_Viryl_Pressing_Pricing_2024__1781121952903.pdf
 *
 * What this script adds (all idempotent, marker-guarded):
 *
 *   1. "Standard Digitally Printed Jacket (12" 180g)" jacket
 *      – Same qty-tiered jacket cost as the 140g ladder; different per-tier
 *        record costs (published in the 2024 USD pricing sheet).
 *      – Confirmed for: Black · Opaque · Metallic/Specialty · Transparent ·
 *        Multi-colour · Hand Pour · Splatter.
 *      – Premium = Custom Quote → TBD rungs.
 *
 *   2. "Records + White Inner Sleeve Only (No Printed Jacket)" for 12_lp
 *      – Flat per-unit cost = record (140g) + $0.13 insertion (sleeve
 *        included; Viryl only qty-discounts the printed jacket, not the record
 *        itself, so this ladder is constant across qty breaks).
 *      – Confirmed for all tiers except Premium (Custom Quote).
 *
 * 180g record costs (USD, from the 2024 pricing sheet):
 *   Black:              $2.36
 *   Transparent:        $2.70
 *   Opaque:             $2.95
 *   Metallic/Specialty: $5.27  (Opaque $2.95 + $2.32 specialty)
 *   Multi-colour:       $3.00
 *   Hand Pour (base+1): $3.65
 *   Splatter (base+1):  $4.10
 *   Premium:            Custom Quote
 *
 * Dev:  npx tsx scripts/patch-viryl-180g.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/patch-viryl-180g.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { manufacturers, pressColorTiers, pressJackets, pressTierJacketLadders } from "@shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_180g_patch_v1";
const SOURCE = "viryl-catalog-2024";

type RungSpec = { qty: number; unitCents: number; confirmed: boolean; source?: string };

const QTYS = [50, 100, 200, 300, 500, 1000] as const;
const INSERTION_CENTS = 13;

// Jacket cost per unit at each Viryl qty rung (same for 140g and 180g —
// the jacket material doesn't change with vinyl weight).
const JACKET_CENTS: Record<number, number> = {
  50: 170,
  100: 145,
  200: 132,
  300: 127,
  500: 122,
  1000: 90,
};

/** Qty-tiered ladder: record + jacket (per-qty) + insertion. */
function jacketedLadder(recordCents: number): RungSpec[] {
  return QTYS.map((qty) => ({
    qty,
    unitCents: recordCents + JACKET_CENTS[qty] + INSERTION_CENTS,
    confirmed: true,
    source: SOURCE,
  }));
}

/** Flat ladder: record + insertion only (no printed jacket). */
function flatLadder(recordCents: number): RungSpec[] {
  return QTYS.map((qty) => ({
    qty,
    unitCents: recordCents + INSERTION_CENTS,
    confirmed: true,
    source: SOURCE,
  }));
}

function tbdLadder(): RungSpec[] {
  return QTYS.map((qty) => ({ qty, unitCents: 0, confirmed: false }));
}

// 180g record costs per tier name → cents.
const RECORD_180G: Record<string, number | null> = {
  "Black":                236,
  "Opaque":               295,
  "Metallic / Specialty": 527, // Opaque $2.95 + $2.32 specialty
  "Transparent":          270,
  "Premium":              null, // Custom Quote
  "Multi-colour":         300,
  "Hand Pour":            365,
  "Splatter":             410,
};

// 140g record costs per tier name → cents (for records-only jacket option).
const RECORD_140G: Record<string, number | null> = {
  "Black":                165,
  "Opaque":               216,
  "Metallic / Specialty": 448, // Opaque $2.16 + $2.32 specialty
  "Transparent":          191,
  "Premium":              null, // Custom Quote
  "Multi-colour":         225,
  "Hand Pour":            265,
  "Splatter":             325,
};

async function ensureJacket(pressId: string, name: string, position: number): Promise<string> {
  const [ex] = await db
    .select({ id: pressJackets.id })
    .from(pressJackets)
    .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.name, name)));
  if (ex) return ex.id;
  if (DRY) return `dry-${name}`;
  const [row] = await db
    .insert(pressJackets)
    .values({ pressId, name, position, isDefault: false })
    .returning({ id: pressJackets.id });
  return row.id;
}

async function ensureLadder(
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
    console.log(`  [skip] ${label} — already exists`);
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
  console.log(`patch-viryl-180g${label} — ${new Date().toISOString()}`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);

  const [markerRow] = await db
    .execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}
      ) AS exists
    `)
    .then((r) => r.rows);
  if (markerRow?.exists) {
    console.log(`Marker '${MARKER}' already set — nothing to do.`);
    return;
  }

  // Find Viryl press (domain OR name, same guard as seed script).
  const [mfr] = await db.execute<{ id: string; name: string }>(sql`
    SELECT id, name FROM manufacturers
    WHERE domain = 'viryl.ca' OR lower(name) = 'viryl technologies'
    LIMIT 1
  `).then((r) => r.rows);
  if (!mfr) {
    console.error("Viryl manufacturer not found — run seed-viryl-catalog.ts first.");
    process.exit(1);
  }
  console.log(`  press: ${mfr.name} (${mfr.id})`);

  // Create the two new jacket options.
  const JACKET_180G = 'Standard Digitally Printed Jacket (12" 180g)';
  const JACKET_RECORDS_ONLY = "Records + White Inner Sleeve Only (No Printed Jacket)";
  const jacket180gId = await ensureJacket(mfr.id, JACKET_180G, 3);
  const jacketRecordsOnlyId = await ensureJacket(mfr.id, JACKET_RECORDS_ONLY, 4);
  if (!DRY) {
    console.log(`  jacket: "${JACKET_180G}" (${jacket180gId})`);
    console.log(`  jacket: "${JACKET_RECORDS_ONLY}" (${jacketRecordsOnlyId})`);
  }

  // Load all 12_lp tiers for Viryl.
  const lp12Tiers = await db
    .select({ id: pressColorTiers.id, name: pressColorTiers.name })
    .from(pressColorTiers)
    .where(
      and(
        eq(pressColorTiers.pressId, mfr.id),
        eq(pressColorTiers.format, "12_lp"),
      ),
    );

  console.log(`  found ${lp12Tiers.length} 12_lp tiers`);

  for (const tier of lp12Tiers) {
    const r180 = RECORD_180G[tier.name] ?? null;
    const r140 = RECORD_140G[tier.name] ?? null;

    const lbl180 = `12_lp/180g   ${tier.name.padEnd(22)}`;
    const lblRec  = `12_lp/no-jkt ${tier.name.padEnd(22)}`;

    // 180g jacket ladder
    await ensureLadder(
      tier.id,
      jacket180gId,
      r180 !== null ? jacketedLadder(r180) : tbdLadder(),
      lbl180,
    );

    // Records-only (140g) ladder
    await ensureLadder(
      tier.id,
      jacketRecordsOnlyId,
      r140 !== null ? flatLadder(r140) : tbdLadder(),
      lblRec,
    );
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
