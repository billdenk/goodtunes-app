/**
 * Task #3220 — Seed Viryl Technologies' Setup & Services line items from the
 * 2026 USD price list.
 *
 * Source of truth:
 *   attached_assets/Viryl_2026_Pressing_Price_List_USD_1787187902259.pdf
 *
 * Only concrete-priced rows are seeded — every "Custom Quote" line on the
 * sheet (mastering, engraving, locked groove, etching, glow-in-the-dark,
 * custom inner sleeves, plain jackets, finishing/embossing, OBI strips,
 * download cards, posters/booklets, promo stickers, resealable bags, rush,
 * 1000+ bulk, graphics services) is deliberately skipped.
 *
 * Idempotent: marker-guarded (viryl_services_2026_v1) AND per-item guarded on
 * (pressId, category, label) so a partial run never duplicates rows.
 *
 * Dev:  npx tsx scripts/seed-viryl-services-2026.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-viryl-services-2026.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { resolveSeedPress } from "./seed-component-price-links";
import {
  manufacturers,
  pressServiceItems,
  type PressServiceCategory,
  type PressServiceUnitBasis,
} from "../shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_services_2026_v3";
const SOURCE = "viryl-2026-price-list";

type Item = {
  category: PressServiceCategory;
  label: string;
  amountCents: number;
  unitBasis: PressServiceUnitBasis;
  note?: string;
};

const ITEMS: Item[] = [
  // ── Metalwork ──────────────────────────────────────────────────────
  { category: "metalwork", label: '12"/10" Lacquer Cutting (A/B Set)', amountCents: 48750, unitBasis: "per_pair" },
  { category: "metalwork", label: '12"/10" Stampers — 2-Step Plating (A/B Set)', amountCents: 30000, unitBasis: "per_pair" },
  { category: "metalwork", label: '7" Lacquer Cutting (A/B Set)', amountCents: 30000, unitBasis: "per_pair" },
  { category: "metalwork", label: '7" Stampers — 2-Step Plating (A/B Set)', amountCents: 26250, unitBasis: "per_pair" },
  { category: "metalwork", label: '12"/10" Extra Stampers / Re-Orders', amountCents: 13125, unitBasis: "per_side" },
  { category: "metalwork", label: '7" Extra Stampers / Re-Orders', amountCents: 11250, unitBasis: "per_side" },
  // ── Test Pressings ─────────────────────────────────────────────────
  { category: "test_pressings", label: '12"/10" Test Pressings — 1 LP (5 units)', amountCents: 8625, unitBasis: "per_order" },
  { category: "test_pressings", label: '12"/10" Test Pressings — 2 LP (5 units)', amountCents: 17250, unitBasis: "per_order" },
  { category: "test_pressings", label: '12"/10" Extra Test Pressing', amountCents: 412, unitBasis: "per_unit" },
  { category: "test_pressings", label: '7" Test Pressings (5 units)', amountCents: 6375, unitBasis: "per_order" },
  { category: "test_pressings", label: '7" Extra Test Pressing', amountCents: 262, unitBasis: "per_unit" },
  // ── Setup Fees ─────────────────────────────────────────────────────
  { category: "setup_fees", label: "Setup — Standard Black", amountCents: 8625, unitBasis: "per_disc" },
  { category: "setup_fees", label: "Setup — Colour", amountCents: 9375, unitBasis: "per_disc" },
  { category: "setup_fees", label: "Colour Change", amountCents: 3750, unitBasis: "per_disc" },
  { category: "setup_fees", label: "Setup — Splatter (Base + 1 Colour)", amountCents: 9750, unitBasis: "per_disc" },
  { category: "setup_fees", label: "Setup — Each Additional Splatter Colour", amountCents: 1875, unitBasis: "per_disc" },
  // ── Surcharges ─────────────────────────────────────────────────────
  {
    category: "surcharges",
    label: "Bulk Surcharge — Orders Under 1000 Records",
    amountCents: 15,
    unitBasis: "per_record",
  },
  // Per-record colour adders from the pressing pages (mix/marble/smoke and
  // splatter "each additional colour", plus the flat premium-colour adder
  // already baked into the Premium / Metallic tier ladders).
  { category: "surcharges", label: 'Each Additional Colour — 12"/10" (140g) Mix/Marble/Smoke/Splatter', amountCents: 15, unitBasis: "per_record" },
  { category: "surcharges", label: 'Each Additional Colour — 12" (180g) Mix/Marble/Smoke/Splatter', amountCents: 19, unitBasis: "per_record" },
  { category: "surcharges", label: 'Each Additional Colour — 7" (42g) Mix/Marble/Smoke/Splatter', amountCents: 11, unitBasis: "per_record" },
  {
    category: "surcharges",
    label: "Premium Colours/Effects — Metallics, Neon, Glitter",
    amountCents: 15,
    unitBasis: "per_record",
    note: "Already included in the Premium and Metallic / Specialty tier ladders",
  },
  // ── Centre Labels ──────────────────────────────────────────────────
  { category: "centre_labels", label: "Plain White Labels", amountCents: 8, unitBasis: "per_pair" },
  { category: "centre_labels", label: "Plain Black Labels", amountCents: 9, unitBasis: "per_pair" },
  // Printed labels are BATCH-priced: $165/$225 covers the first 1,000 pairs,
  // then $112.50/$131.25 per additional 1,000 pairs.
  { category: "centre_labels", label: "B&W Printed Labels — First 1,000 Pairs (Batch)", amountCents: 16500, unitBasis: "per_1000_pairs" },
  { category: "centre_labels", label: "B&W Printed Labels — Each Additional 1,000 Pairs (Batch)", amountCents: 11250, unitBasis: "per_1000_pairs" },
  { category: "centre_labels", label: "Full Colour CMYK Printed Labels — First 1,000 Pairs (Batch)", amountCents: 22500, unitBasis: "per_1000_pairs" },
  { category: "centre_labels", label: "Full Colour CMYK Printed Labels — Each Additional 1,000 Pairs (Batch)", amountCents: 13125, unitBasis: "per_1000_pairs" },
  // ── Inner Sleeves ──────────────────────────────────────────────────
  {
    category: "inner_sleeves",
    label: 'Standard White Paper Inner Sleeves (12"/10"/7")',
    amountCents: 0,
    unitBasis: "per_unit",
    note: "Included in pressing price",
  },
  { category: "inner_sleeves", label: 'Standard Black Paper Inner Sleeves (12"/10"/7")', amountCents: 26, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: '12" Poly-Lined White Inner Sleeves', amountCents: 19, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: '12" Poly-Lined Black Inner Sleeves', amountCents: 38, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: "Translucent Polyethylene Inner Sleeves", amountCents: 26, unitBasis: "per_unit" },
  // ── Stickers ───────────────────────────────────────────────────────
  { category: "stickers", label: "UPC Sticker / Barcode", amountCents: 8, unitBasis: "per_unit" },
  {
    category: "stickers",
    label: 'Country of Origin Sticker — "Made in Canada"',
    amountCents: 8,
    unitBasis: "per_unit",
    note: "Required if not printed on jacket",
  },
  // ── Packaging & Assembly ───────────────────────────────────────────
  { category: "packaging_assembly", label: "Insertion of Sleeved Record into Jacket", amountCents: 11, unitBasis: "per_record" },
  { category: "packaging_assembly", label: "Insertion of Items into Jacket", amountCents: 11, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: "Affixing OBI Strip to Jacket", amountCents: 26, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: '12"/10" Open-Top Poly Bag (Over-Jacket)', amountCents: 15, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: '7" Open-Top Poly Bag (Over-Jacket)', amountCents: 11, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: "Shrink Wrapping", amountCents: 15, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: "Sticker Application", amountCents: 15, unitBasis: "per_unit" },
  // ── Storage (for future re-pressings) ──────────────────────────────
  { category: "storage", label: "6-Month Storage — Stampers", amountCents: 1500, unitBasis: "per_pair" },
  { category: "storage", label: "6-Month Storage — Centre Labels", amountCents: 750, unitBasis: "per_pair" },
  { category: "storage", label: '6-Month Storage — Print (14" × 14" × 18" box)', amountCents: 1500, unitBasis: "per_box" },
  {
    category: "storage",
    label: "6-Month Storage — Bundle (Stampers, Labels & Print)",
    amountCents: 3000,
    unitBasis: "per_order",
    note: "Includes one box of print; additional boxes subject to charges",
  },
  { category: "storage", label: "1-Year Storage — Stampers", amountCents: 2775, unitBasis: "per_pair" },
  { category: "storage", label: "1-Year Storage — Centre Labels", amountCents: 1350, unitBasis: "per_pair" },
  { category: "storage", label: '1-Year Storage — Print (14" × 14" × 18" box)', amountCents: 2775, unitBasis: "per_box" },
  {
    category: "storage",
    label: "1-Year Storage — Bundle (Stampers, Labels & Print)",
    amountCents: 5625,
    unitBasis: "per_order",
    note: "Includes one box of print; additional boxes subject to charges",
  },
];

async function main() {
  const [marker] = (
    await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`)
  ).rows;
  if (marker) {
    console.log(`Marker '${MARKER}' already set — nothing to do.`);
    return;
  }

  // Decoy-shell trap: prod has an empty VIRYL/viryltech.com shell beside
  // the real Viryl Technologies/viryl.ca — never take a fuzzy first match.
  const candidates = await db
    .select()
    .from(manufacturers)
    .where(sql`${manufacturers.domain} ILIKE '%viryl%' OR ${manufacturers.name} ILIKE '%viryl%'`);
  const press = await resolveSeedPress(
    "Viryl",
    candidates.map((c) => ({ id: c.id, name: c.name, domain: (c as any).domain ?? null })),
    "viryl.ca",
    async (pressId) => {
      const r = await db.execute(
        sql`SELECT count(*)::int AS n FROM press_color_tiers WHERE press_id = ${pressId}`,
      );
      return Number((r.rows[0] as any)?.n ?? 0);
    },
  );
  console.log(`Viryl press: ${press.id} (${press.name} / ${(press as any).domain ?? "no domain"})`);

  // Repair rows an earlier (v2) run seeded with the wrong unit semantics:
  // printed centre labels were stored as per-pair costs though the sheet's
  // $165/$225 figures are per-1,000-pair batch prices.
  if (!DRY) {
    await db.execute(sql`
      DELETE FROM press_service_items
      WHERE press_id = ${press.id} AND source = ${SOURCE}
        AND category = 'centre_labels' AND unit_basis = 'per_pair'
        AND label ILIKE '%printed labels%'
    `);
  }

  let inserted = 0;
  let kept = 0;
  const posByCategory = new Map<string, number>();
  for (const item of ITEMS) {
    const pos = posByCategory.get(item.category) ?? 0;
    posByCategory.set(item.category, pos + 1);
    const [existing] = await db
      .select({ id: pressServiceItems.id })
      .from(pressServiceItems)
      .where(
        and(
          eq(pressServiceItems.pressId, press.id),
          eq(pressServiceItems.category, item.category),
          eq(pressServiceItems.label, item.label),
        ),
      );
    if (existing) {
      kept++;
      continue;
    }
    inserted++;
    if (DRY) continue;
    await db.insert(pressServiceItems).values({
      pressId: press.id,
      category: item.category,
      label: item.label,
      amountCents: item.amountCents,
      unitBasis: item.unitBasis,
      note: item.note ?? null,
      position: pos,
      source: SOURCE,
    });
  }
  console.log(`${DRY ? "[dry] " : ""}service items inserted: ${inserted}, already present: ${kept}`);

  if (!DRY) {
    await db.execute(
      sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
    );
    console.log(`marker '${MARKER}' set.`);
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
