/**
 * Seed Viryl Technologies Corp. as a press in the catalog system.
 *
 * Source of truth:
 *   attached_assets/Catalogue_2024_1781121947631.pdf          (colours + codes)
 *   attached_assets/USD_Viryl_Pressing_Pricing_2024__1781121952903.pdf (pricing)
 *
 * What this script does (all idempotent, marker-guarded):
 *   1. Creates the Viryl manufacturer record (name/domain conflict guard).
 *   2. Creates 3 formats: 12_lp, 12_double, 7_inch.
 *   3. Creates one default jacket: "Standard Digitally Printed Jacket (12")".
 *   4. Creates 8 colour tiers per format:
 *        Black · Opaque · Metallic/Specialty · Transparent · Premium ·
 *        Multi-colour · Hand Pour · Splatter
 *   5. Seeds every named colour from the 2024 catalogue with hex swatch and Viryl
 *      colour code stored in import_source_url as `viryl-catalog-2024:<code>`.
 *   6. Loads real per-unit-cents ladders for 12_lp tiers (record + standard
 *      jacket + insertion combined; jacket varies by qty → qty breaks).
 *      7_inch and 12_double ladders stay TBD (jacket is Custom Quote for both).
 *      Premium tier is TBD across all formats (Custom Quote from Viryl).
 *   7. Sets the `viryl_catalog_seed_v1` marker so re-runs are no-ops.
 *
 * Pricing baked in (all 12" 140g, includes $0.13 insertion, jacket at each
 * qty rung from the Digitally-Printed 12" jacket ladder):
 *   qty rungs: 50 / 100 / 200 / 300 / 500 / 1000
 *   Jacket cost per unit: $1.70 / $1.45 / $1.32 / $1.27 / $1.22 / $0.90
 *   Record costs (confirmed, no broker discount — retail = cost):
 *     Black: $1.65  |  Transparent: $1.91  |  Opaque: $2.16
 *     Metallic (Opaque + $2.32 specialty): $4.48
 *     Multi-colour mix/marble/smoke: $2.25
 *     Hand Pour (base+1): $2.65  |  Splatter (base+1): $3.25
 *   Premium / 7" / 12_double jacket: Custom Quote → TBD rungs.
 *
 * Dev:   npx tsx scripts/seed-viryl-catalog.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-viryl-catalog.ts
 * Dry:   add --dry (no writes)
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  manufacturers,
  pressFormats,
  pressColorTiers,
  pressColors,
  pressJackets,
  pressTierJacketLadders,
} from "../shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_catalog_seed_v1";
const SOURCE = "viryl-catalog-2024";

type Fmt = "12_lp" | "12_double" | "7_inch";
const FORMATS: Fmt[] = ["12_lp", "12_double", "7_inch"];

type RungSpec = { qty: number; unitCents: number; confirmed: boolean; source?: string };
type ColorSpec = { name: string; hex: string | null; code: string | null };
type TierSpec = {
  name: string;
  position: number;
  colors: ColorSpec[];
  ladder12lp: RungSpec[];
  ladder12double: RungSpec[];
  ladder7inch: RungSpec[];
};

// Jacket price per unit at each Viryl qty rung for 12" digitally-printed jacket.
const JACKET_CENTS: Record<number, number> = {
  50: 170,
  100: 145,
  200: 132,
  300: 127,
  500: 122,
  1000: 90,
};
const INSERTION_CENTS = 13; // $0.13/record
const QTYS = [50, 100, 200, 300, 500, 1000] as const;

/** Build a confirmed 12_lp rung ladder bundling record + jacket + insertion. */
function lpLadder(recordCents: number): RungSpec[] {
  return QTYS.map((qty) => ({
    qty,
    unitCents: recordCents + JACKET_CENTS[qty] + INSERTION_CENTS,
    confirmed: true,
    source: SOURCE,
  }));
}

/** All-TBD placeholder rungs at the standard Viryl quantity breaks. */
function tbdLadder(): RungSpec[] {
  return QTYS.map((qty) => ({ qty, unitCents: 0, confirmed: false }));
}

const TIERS: TierSpec[] = [
  {
    name: "Black",
    position: 0,
    colors: [{ name: "Black", hex: "#0c0c0c", code: "VR100BK1" }],
    ladder12lp: lpLadder(165), // $1.65/record
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
  {
    name: "Opaque",
    position: 1,
    colors: [
      { name: "White", hex: "#f5f5f0", code: "VR100WH1" },
      { name: "Hot Pink", hex: "#ff3d8a", code: "VR100PK1" },
      { name: "Orange", hex: "#f97316", code: "VR100OR2" },
      { name: "Apple Red", hex: "#dc2626", code: "VR100RD1" },
      { name: "Maroon", hex: "#6b1c2a", code: "VR100RD2" },
      { name: "School Bus", hex: "#fbbf24", code: "VR100YL1" },
      { name: "Evergreen", hex: "#14532d", code: "VR101GN1" },
      { name: "Spring Green", hex: "#4ade80", code: "VR201GN2" },
      { name: "Blue Jay", hex: "#1e40af", code: "VR100BL2" },
    ],
    ladder12lp: lpLadder(216), // $2.16/record
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
  {
    name: "Metallic / Specialty",
    position: 2,
    colors: [
      { name: "Gold", hex: "#d4af37", code: "VR100GD1" },
      { name: "Silver", hex: "#c0c0c0", code: "VR201SL1" },
    ],
    // Opaque $2.16 + $2.32 specialty charge per record = $4.48
    ladder12lp: lpLadder(448),
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
  {
    name: "Transparent",
    position: 3,
    colors: [
      { name: "Ultra Clear", hex: "#e8f4fd", code: "VR800CL1" },
      { name: "Coke Bottle", hex: "#2d6a4a", code: "VR800GN2" },
      { name: "Ruby", hex: "#9b1c3a", code: "VR800D1" },
      { name: "Orange (clear)", hex: "#f5843d", code: "VR100OR1" },
      { name: "Cobalt", hex: "#003087", code: "VR800BL1" },
      { name: "Emerald", hex: "#046c4e", code: "VR800GN1" },
      { name: "Natural", hex: "#d4c5a0", code: "VR100NT1" },
      { name: "Orange Crush", hex: "#f4621a", code: "VR100OC1" },
      { name: "Violet", hex: "#7c3aed", code: "VR100VL1" },
    ],
    ladder12lp: lpLadder(191), // $1.91/record
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
  {
    name: "Premium",
    position: 4,
    colors: [
      // Glow-in-the-dark; neon variants fall in this tier on request.
      { name: "Glow in the Dark", hex: "#ccff44", code: "VR800GDG1" },
    ],
    // Glow / Neon = Custom Quote from Viryl.
    ladder12lp: tbdLadder(),
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
  {
    name: "Multi-colour",
    position: 5,
    colors: [
      // Smoke effects
      { name: "Ultra Clear + Black Smoke", hex: "#6b7280", code: null },
      { name: "White + Blue Jay Smoke", hex: "#93c5fd", code: null },
      { name: "Natural + Black Smoke", hex: "#57534e", code: null },
      // Smoke / Wooden
      { name: "Natural + Brown Smoke/Wooden", hex: "#78613e", code: null },
      // Marble
      { name: "White + Silver Marble", hex: "#c0c8d4", code: null },
      // Ecomix — random; exact hue varies
      { name: "Random Colours (Ecomix)", hex: "#9ca3af", code: null },
    ],
    // Multi-colour mixes/marbles/smoke, 12" 140g = $2.25/record
    ladder12lp: lpLadder(225),
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
  {
    name: "Hand Pour",
    position: 6,
    colors: [
      { name: "Ruby + Cobalt", hex: "#6b21a8", code: null },
      { name: "Orange Crush + Canary Yellow", hex: "#f97316", code: null },
      { name: "Canary Yellow + Black + White", hex: "#eab308", code: null },
      { name: "Black + School Bus", hex: "#1c1917", code: null },
      { name: "Apple Red + School Bus", hex: "#dc2626", code: null },
      { name: "Ever Green + White", hex: "#15803d", code: null },
      { name: "Hot Pink + Blue Jay", hex: "#db2777", code: null },
      { name: "Apple Red + School Bus + Black", hex: "#7f1d1d", code: null },
    ],
    // Hand pour base+1, 12" 140g = $2.65/record
    ladder12lp: lpLadder(265),
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
  {
    name: "Splatter",
    position: 7,
    colors: [
      { name: "Silver + Apple Red + Neon Splatter", hex: "#b91c1c", code: null },
      { name: "White + Black Clear Center Splatter", hex: "#9ca3af", code: null },
      { name: "Ultra Clear + Apple Red Splatter", hex: "#dc2626", code: null },
    ],
    // Splatter base+1, 12" 140g = $3.25/record
    ladder12lp: lpLadder(325),
    ladder12double: tbdLadder(),
    ladder7inch: tbdLadder(),
  },
];

function ladderForTier(t: TierSpec, fmt: Fmt): RungSpec[] {
  if (fmt === "12_lp") return t.ladder12lp;
  if (fmt === "12_double") return t.ladder12double;
  return t.ladder7inch;
}

// ── Drizzle SELECT-then-INSERT helpers (mirrors pressCatalog.ts pattern) ──────

async function ensureManufacturer(): Promise<string> {
  // Guard by domain OR normalised name so an operator-created row with a
  // missing/alternate domain isn't duplicated.
  const [existing] = await db.execute<{ id: string }>(sql`
    SELECT id FROM manufacturers
    WHERE domain = 'viryl.ca' OR lower(name) = 'viryl technologies'
    LIMIT 1
  `).then((r) => r.rows);
  if (existing) {
    console.log(`  manufacturer already exists (${existing.id}), skipping create.`);
    return existing.id;
  }
  const [row] = await db
    .insert(manufacturers)
    .values({
      name: "Viryl Technologies",
      domain: "viryl.ca",
      bio: "Viryl Technologies Corp. is a Canadian pressing plant based in Toronto, Ontario. Known for an extensive colour catalogue, digitally-printed jacket production, and a wide range of hand-pour and splatter effects.",
      websiteUrl: "https://viryl.ca",
      doesVinyl: true,
      doesGoodDeed: false,
      doesFulfillment: false,
      turnaroundWeeksMin: 12,
      turnaroundWeeksMax: 16,
      locationAddress: { city: "Toronto", province: "Ontario", country: "Canada" } as Record<string, string>,
      brokerDiscountPct: 0,
      operationalNote:
        "Pricing is retail = cost (no broker discount). FOB Toronto, USD. " +
        "Standard lead time 12–16 weeks after art/audio approved. " +
        "Below-1000 bulk surcharge: +$0.15/record. Rush (≤4 weeks): +$0.24/record. " +
        "Metallic/Specialty price = Opaque rate + $2.32/record specialty charge.",
      specialties: [] as string[],
    })
    .returning({ id: manufacturers.id });
  console.log(`  manufacturer created: Viryl Technologies (${row.id})`);
  return row.id;
}

async function ensureFormat(pressId: string, format: Fmt, position: number): Promise<void> {
  const [ex] = await db
    .select({ id: pressFormats.id })
    .from(pressFormats)
    .where(and(eq(pressFormats.pressId, pressId), eq(pressFormats.format, format)));
  if (ex) return;
  await db.insert(pressFormats).values({ pressId, format, position });
}

async function ensureJacket(pressId: string, name: string): Promise<string> {
  const [ex] = await db
    .select({ id: pressJackets.id })
    .from(pressJackets)
    .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.name, name)));
  if (ex) return ex.id;
  const [row] = await db
    .insert(pressJackets)
    .values({ pressId, name, position: 0, isDefault: true })
    .returning({ id: pressJackets.id });
  return row.id;
}

async function ensureTier(
  pressId: string,
  format: Fmt,
  name: string,
  position: number,
): Promise<string> {
  const [ex] = await db
    .select({ id: pressColorTiers.id })
    .from(pressColorTiers)
    .where(
      and(
        eq(pressColorTiers.pressId, pressId),
        eq(pressColorTiers.format, format),
        eq(pressColorTiers.name, name),
      ),
    );
  if (ex) return ex.id;
  const [row] = await db
    .insert(pressColorTiers)
    .values({ pressId, format, name, position, priceLadder: [] })
    .returning({ id: pressColorTiers.id });
  return row.id;
}

async function ensureColor(
  tierId: string,
  colorSpec: ColorSpec,
  position: number,
): Promise<void> {
  const [ex] = await db
    .select({ id: pressColors.id, swatchHex: pressColors.swatchHex, importSourceUrl: pressColors.importSourceUrl })
    .from(pressColors)
    .where(and(eq(pressColors.tierId, tierId), eq(pressColors.name, colorSpec.name)));
  if (ex) {
    // Back-fill hex/code if the row was operator-created with null values.
    const needsHex = !ex.swatchHex && colorSpec.hex;
    const wantCode = colorSpec.code ? `${SOURCE}:${colorSpec.code}` : null;
    const needsCode = !ex.importSourceUrl && wantCode;
    if (needsHex || needsCode) {
      await db
        .update(pressColors)
        .set({
          ...(needsHex ? { swatchHex: colorSpec.hex } : {}),
          ...(needsCode ? { importSourceUrl: wantCode } : {}),
        })
        .where(eq(pressColors.id, ex.id));
    }
    return;
  }
  await db.insert(pressColors).values({
    tierId,
    name: colorSpec.name,
    swatchHex: colorSpec.hex,
    swatchImageUrl: null,
    position,
    importSourceUrl: colorSpec.code ? `${SOURCE}:${colorSpec.code}` : null,
  });
}

async function ensureComboLadder(tierId: string, jacketId: string, ladder: RungSpec[]): Promise<void> {
  const [ex] = await db
    .select({ id: pressTierJacketLadders.id })
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (ex) return;
  await db
    .insert(pressTierJacketLadders)
    .values({ tierId, jacketId, priceLadder: ladder })
    .onConflictDoNothing();
}

async function main() {
  console.log(`seed-viryl-catalog${DRY ? " (DRY RUN)" : ""} — ${new Date().toISOString()}`);

  // ── Ensure post_merge_data_backfills table ────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);

  // ── Marker guard ──────────────────────────────────────────────────────
  const [markerRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}
    ) AS exists
  `).then((r) => r.rows);
  if (markerRow?.exists) {
    console.log(`Marker '${MARKER}' already set — nothing to do.`);
    return;
  }

  if (DRY) {
    console.log("[DRY] Would seed:");
    for (const fmt of FORMATS) {
      for (const t of TIERS) {
        const ladder = ladderForTier(t, fmt);
        const conf = ladder.filter((r) => r.confirmed).length;
        console.log(`  ${fmt.padEnd(12)} ${t.name.padEnd(22)} ${t.colors.length} colours  ${conf}/${ladder.length} confirmed rungs`);
      }
    }
    console.log("[DRY] No writes.");
    return;
  }

  // ── 1. Manufacturer ───────────────────────────────────────────────────
  const pressId = await ensureManufacturer();

  // ── 2. Formats ────────────────────────────────────────────────────────
  for (let fi = 0; fi < FORMATS.length; fi++) {
    await ensureFormat(pressId, FORMATS[fi], fi);
  }
  console.log(`  formats: ${FORMATS.join(", ")}`);

  // ── 3. Jacket ─────────────────────────────────────────────────────────
  const JACKET_NAME = 'Standard Digitally Printed Jacket (12")';
  const jacketId = await ensureJacket(pressId, JACKET_NAME);
  console.log(`  jacket: ${JACKET_NAME} (${jacketId})`);

  // ── 4–6. Tiers + colours + ladders ───────────────────────────────────
  for (const fmt of FORMATS) {
    for (const tierSpec of TIERS) {
      const tierId = await ensureTier(pressId, fmt, tierSpec.name, tierSpec.position);

      for (let ci = 0; ci < tierSpec.colors.length; ci++) {
        await ensureColor(tierId, tierSpec.colors[ci], ci);
      }

      const ladder = ladderForTier(tierSpec, fmt);
      await ensureComboLadder(tierId, jacketId, ladder);

      const conf = ladder.filter((r) => r.confirmed).length;
      console.log(
        `  ${fmt.padEnd(12)} ${tierSpec.name.padEnd(22)} ${tierSpec.colors.length} colours  ${conf}/${ladder.length} confirmed rungs`,
      );
    }
  }

  // ── 7. Marker ─────────────────────────────────────────────────────────
  await db.execute(sql`
    INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING
  `);
  console.log(`  marker '${MARKER}' set.`);
  console.log("Done.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
