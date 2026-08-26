/**
 * Seed PMP's component pricing from Jonathan's 2026 pricing sheet
 * (docs/vendors/pmp-pricing-2026.csv, filed Aug 26 2026).
 *
 * What this seeds (client Price column only — the Cost column is PMP's
 * internal cost and is never surfaced):
 *   • componentLadders blob on PMP's press_components 'pricing' config
 *     (jackets, inserts, printed sleeves, 7" center labels, download cards,
 *     booklets, stickers) — namespaced merge, never touches rows/setupRules.
 *   • press_service_items for flat-rate lines (paper/poly sleeves, poly
 *     bags, shrink wrap, 12" center-label runs, setup fees, lacquer/plating,
 *     labor, surcharges).
 *   • press_component_price_links mapping the package component options to
 *     PMP's OWN ladders/services (no cross-press blending); genuinely
 *     unpriced options are explicit custom_quote, never a silent gap or $0.
 *
 * PMP block semantics (Jonathan, Aug 26 2026 — docs/vendors/pmp.md): a price
 * break belongs to the NAMED quantity block, not the typed quantity — a
 * customer on the "250" block keeps the 250 rate if quantity drifts up, and
 * the CSR may deliberately choose a bigger block. Rungs here still store
 * qty/unitCents (snap-up resolver); explicit-block selection is estimate-
 * builder UX to come, so nothing here may auto-reprice a chosen block.
 *
 * DELIBERATELY NOT SEEDED (ambiguous — awaiting gogoods):
 *   • Record pricing (Black/Color/Mixed/Handmade + 7") — lives in the
 *     press_color_tiers catalog world; the Mixed/Handmade ↔ catalog swatch
 *     family mapping (and the brief's "Splatter = Color × 1.41" rule, which
 *     does NOT match the sheet's Mixed prices) needs confirmation.
 *   • setupRules engine values — PMP's "Color Setup 1 Color $300 / 2-3
 *     Color $200 / 4 Color $150" reads as flat-vs-per-color ambiguous; the
 *     three lines are seeded verbatim as setup-fee service items instead.
 *
 * Idempotent: marker-guarded (pmp_component_pricing_2026_v1) AND per-row
 * guarded (service items by pressId+category+label; links by
 * pressId+componentKey+optionId) — operator edits are never overwritten.
 * Missing press or missing prereq = FATAL, marker never stamped on a
 * partial run.
 *
 * Dev:  npx tsx scripts/seed-pmp-component-pricing.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-pmp-component-pricing.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  manufacturers,
  pressComponents,
  pressComponentPriceLinks,
  pressServiceItems,
  type PressServiceCategory,
  type PressServiceUnitBasis,
} from "../shared/schema";
import {
  ladderItemToRungs,
  type ComponentLadderCatalog,
  type PackageComponentKey,
  type PriceLinkMode,
} from "../shared/pressComponentPricing";

const DRY = process.argv.includes("--dry");
const MARKER = "pmp_component_pricing_2026_v1";
const SOURCE = "pmp-pricing-2026";
// Verified present in BOTH dev and prod DBs (Aug 2026).
const PMP_PRESS_ID = "97f5c812-63f0-4f51-ada2-092f06663856";

// ── Component ladders (client Price, dollars) ──────────────────────────
const QTYS = [50, 100, 250, 300, 500, 1000, 1500, 2000, 5000, 7500, 10000] as const;

type LadderDef = { label: string; rungs: [number, number][]; note?: string };

// Zip [qty, dollars] pairs into the blob's positional unitCents array
// (fractional cents preserved like the MRP blob; 0 = no rung, dropped by
// ladderItemToRungs).
function toUnitCents(rungs: [number, number][]): number[] {
  const byQty = new Map(rungs.map(([q, d]) => [q, d * 100] as const));
  return QTYS.map((q) => byQty.get(q) ?? 0);
}

const GROUPS: { key: string; label: string; items: LadderDef[] }[] = [
  {
    key: "single_jackets",
    label: 'Single-Pocket Jackets (12")',
    items: [
      { label: "Standard Digital Jacket", rungs: [[100, 3.64]], note: "Digital print short run" },
      {
        label: "Standard Jacket",
        rungs: [[250, 2.8], [300, 2.41], [500, 1.54], [1000, 1.05], [1500, 0.9], [2000, 0.7], [5000, 0.59], [7500, 0.55], [10000, 0.55]],
      },
      {
        label: "Wide Spine Standard Jacket",
        rungs: [[250, 3.5], [500, 2.24], [1000, 1.71], [2000, 1.22], [5000, 1.02], [10000, 0.97]],
      },
    ],
  },
  {
    key: "gatefold_jackets",
    label: "Gatefold Jackets",
    items: [
      { label: "Gatefold Jacket", rungs: [[250, 5.56], [500, 4.0], [1000, 2.6], [2000, 1.6], [5000, 1.22]] },
    ],
  },
  {
    key: "jackets_7in",
    label: '7" Jackets',
    items: [
      { label: 'Digital 7" Jacket', rungs: [[100, 4.44]], note: "Digital print short run" },
      { label: '7" Jacket', rungs: [[250, 3.78], [500, 1.58], [1000, 0.88], [2000, 0.63]] },
    ],
  },
  {
    key: "inserts",
    label: "Inserts",
    items: [
      { label: "1 sided inserts", rungs: [[250, 0.92]] },
      { label: "2 sided inserts", rungs: [[250, 2.86], [500, 1.44], [1000, 0.91], [5000, 0.35]] },
      {
        label: "Recycled paper, matte insert 1/1 black",
        rungs: [[250, 0.69], [500, 0.69], [1000, 0.69], [5000, 0.69]],
      },
      {
        label: "Recycled paper, matte insert 4/4 color",
        rungs: [[250, 0.95], [500, 0.95], [1000, 0.95], [5000, 0.95]],
      },
      { label: "Foldover insert 4 panel", rungs: [[250, 3.78], [500, 1.86], [1000, 1.26]] },
      { label: '7" 2 sided insert', rungs: [[500, 0.81], [1000, 0.62]] },
    ],
  },
  {
    key: "printed_sleeves",
    label: "Printed Inner Sleeves",
    items: [
      {
        label: "Printed Inner Sleeve",
        rungs: [[250, 2.65], [500, 1.46], [1000, 1.16], [5000, 0.39], [10000, 0.36]],
      },
    ],
  },
  {
    key: "center_labels_7in",
    label: '7" Center Labels',
    items: [{ label: '7" Center Labels', rungs: [[250, 0.72], [500, 0.38], [1000, 0.19]] }],
  },
  {
    key: "download_cards",
    label: "Download Cards",
    items: [
      { label: "3x3", rungs: [[500, 0.49], [1000, 0.35]] },
      { label: "2.5x3", rungs: [[500, 0.49], [1000, 0.35]] },
    ],
  },
  {
    key: "booklets",
    label: "Booklets",
    items: [
      { label: "8 page Booklet", rungs: [[50, 20.36], [100, 10.25], [250, 4.27], [500, 2.56], [1000, 1.68], [2000, 1.32], [5000, 1.06], [10000, 0.87]] },
      { label: "12 page Booklet", rungs: [[50, 23.03], [100, 11.58], [250, 4.8], [500, 2.74], [1000, 1.85], [2000, 1.47], [5000, 1.22], [10000, 1.08]] },
      { label: "16 page Booklet", rungs: [[50, 32.65], [100, 16.32], [250, 6.52], [500, 3.74], [1000, 2.48], [2000, 2.0], [5000, 1.55], [10000, 1.36]] },
      { label: "20 page Booklet", rungs: [[50, 26.88], [100, 13.51], [250, 5.88], [500, 3.61], [1000, 2.74], [2000, 2.44], [5000, 2.23], [10000, 2.02]] },
      { label: "24 page Booklet", rungs: [[50, 26.95], [100, 13.58], [250, 5.95], [500, 3.68], [1000, 2.8], [2000, 2.51], [5000, 2.3], [10000, 2.09]] },
    ],
  },
  {
    key: "stickers",
    label: "Stickers",
    items: [
      {
        label: "2x3 rectangle or 2.5 circle sticker",
        rungs: [[250, 0.8], [500, 0.52], [1000, 0.32], [2000, 0.2], [5000, 0.14]],
      },
    ],
  },
];

// ── Flat-rate service items (verbatim sheet labels) ────────────────────
type ItemDef = {
  category: PressServiceCategory;
  label: string;
  amountCents: number;
  unitBasis: PressServiceUnitBasis;
  note?: string;
};

const ITEMS: ItemDef[] = [
  // Inner sleeves (flat per-unit at every block on the sheet).
  { category: "inner_sleeves", label: "Black Paper Sleeve", amountCents: 45, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: "White Paper Sleeve", amountCents: 25, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: "Black Poly Sleeve", amountCents: 50, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: "White Poly Sleeve", amountCents: 50, unitBasis: "per_unit" },
  // Center labels — 12" runs are flat per run on the sheet.
  { category: "centre_labels", label: "Center Labels — run of 1,000", amountCents: 21000, unitBasis: "per_order", note: '12" center labels, flat per 1,000-unit run' },
  { category: "centre_labels", label: "Center Labels — run of 2,000", amountCents: 35000, unitBasis: "per_order", note: '12" center labels, flat per 2,000-unit run' },
  { category: "centre_labels", label: "Center Labels — run of 5,000", amountCents: 77000, unitBasis: "per_order", note: '12" center labels, flat per 5,000-unit run' },
  { category: "centre_labels", label: "Center Labels — run of 10,000", amountCents: 147000, unitBasis: "per_order", note: '12" center labels, flat per 10,000-unit run' },
  // Bags / shrink wrap.
  { category: "packaging_assembly", label: "Poly Bags (Non Resealable)", amountCents: 50, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: "Poly Bags (Resealable)", amountCents: 65, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: '7" Poly Bags (Resealable)', amountCents: 65, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: '7" Poly Bags (Non Resealable)', amountCents: 40, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: "Shrink Wrap", amountCents: 30, unitBasis: "per_unit" },
  // Labor / assembly.
  { category: "packaging_assembly", label: "Boxing and Palletizing", amountCents: 50, unitBasis: "per_unit" },
  { category: "packaging_assembly", label: "Insertion Fee", amountCents: 10, unitBasis: "per_unit", note: "Per item inserted" },
  { category: "packaging_assembly", label: "Packaging Provided", amountCents: 10, unitBasis: "per_unit", note: "Handling for client-supplied packaging" },
  { category: "packaging_assembly", label: "Obi Application", amountCents: 25, unitBasis: "per_unit" },
  // Setup fees — the 3 color-setup lines are seeded VERBATIM (flat vs
  // per-color semantics unconfirmed; no setupRules engine values yet).
  { category: "setup_fees", label: "Color Setup - 1 Color", amountCents: 30000, unitBasis: "per_order" },
  { category: "setup_fees", label: "Color Setup - 2 to 3 Color", amountCents: 20000, unitBasis: "per_order" },
  { category: "setup_fees", label: "Color Setup - 4 Color", amountCents: 15000, unitBasis: "per_order" },
  { category: "setup_fees", label: "Press / Stamper Setup", amountCents: 15000, unitBasis: "per_order" },
  { category: "setup_fees", label: "Reverse Board Setup", amountCents: 15000, unitBasis: "per_order" },
  // Metalwork.
  { category: "metalwork", label: "Lacquer Cutting (1 side)", amountCents: 30000, unitBasis: "per_side" },
  { category: "metalwork", label: '7" Lacquer Cutting', amountCents: 25000, unitBasis: "per_side" },
  { category: "metalwork", label: "Plating - 2 Step (1 side)", amountCents: 23800, unitBasis: "per_side" },
  { category: "metalwork", label: "Plating - 3 Step (1 side)", amountCents: 27800, unitBasis: "per_side" },
  { category: "metalwork", label: "Plating - Additional Stamper (1 side)", amountCents: 16500, unitBasis: "per_side" },
  { category: "metalwork", label: '7" Plating - 3 Step (1 side)', amountCents: 27800, unitBasis: "per_side" },
  // Test pressings.
  { category: "test_pressings", label: "Test Presses (5)", amountCents: 5000, unitBasis: "per_order" },
  // Surcharges / add-ons.
  { category: "surcharges", label: "180 Gram", amountCents: 75, unitBasis: "per_record" },
  { category: "surcharges", label: "Big Hole Punch", amountCents: 25, unitBasis: "per_record", note: '7" jukebox center hole' },
  { category: "surcharges", label: "Embossing", amountCents: 560, unitBasis: "per_unit" },
  { category: "surcharges", label: "Matte Finish Upcharge", amountCents: 25000, unitBasis: "per_order", note: "Per 1,000 units" },
  { category: "surcharges", label: "PMS Metallic/Fluorescent", amountCents: 33600, unitBasis: "per_order", note: "Per 1,000 units" },
  { category: "stickers", label: "Barcode stickers", amountCents: 30, unitBasis: "per_unit" },
  { category: "surcharges", label: "PMP XTP", amountCents: 150000, unitBasis: "per_order", note: "Flat-rate 100-unit XTP run" },
];

// ── Component → price links ────────────────────────────────────────────
type SeedLink = {
  componentKey: PackageComponentKey;
  optionId: string;
  priceMode: PriceLinkMode;
  serviceLabel?: string;
  ladder?: { groupKey: string; itemLabel: string };
};

const LINKS: SeedLink[] = [
  // Jackets — PMP prices records and jackets separately (unlike MRP's
  // tier×jacket all-in ladders), so single links to its own print ladder.
  { componentKey: "jacket", optionId: "single", priceMode: "ladder", ladder: { groupKey: "single_jackets", itemLabel: "Standard Jacket" } },
  { componentKey: "jacket", optionId: "gatefold", priceMode: "ladder", ladder: { groupKey: "gatefold_jackets", itemLabel: "Gatefold Jacket" } },
  { componentKey: "jacket", optionId: "trifold", priceMode: "custom_quote" },
  { componentKey: "jacket", optionId: "discobag", priceMode: "custom_quote" },
  { componentKey: "jacket", optionId: "pvc", priceMode: "custom_quote" },
  // Inner sleeves.
  { componentKey: "inner_sleeve", optionId: "printed-paper", priceMode: "ladder", ladder: { groupKey: "printed_sleeves", itemLabel: "Printed Inner Sleeve" } },
  { componentKey: "inner_sleeve", optionId: "printed-board", priceMode: "custom_quote" },
  { componentKey: "inner_sleeve", optionId: "white", priceMode: "service", serviceLabel: "White Paper Sleeve" },
  { componentKey: "inner_sleeve", optionId: "black", priceMode: "service", serviceLabel: "Black Paper Sleeve" },
  { componentKey: "inner_sleeve", optionId: "white-poly", priceMode: "service", serviceLabel: "White Poly Sleeve" },
  { componentKey: "inner_sleeve", optionId: "black-poly", priceMode: "service", serviceLabel: "Black Poly Sleeve" },
  // Inserts — "sheet" maps to the 2-sided ladder (full quantity coverage;
  // provenance shows the exact sheet line).
  { componentKey: "insert", optionId: "sheet", priceMode: "ladder", ladder: { groupKey: "inserts", itemLabel: "2 sided inserts" } },
  { componentKey: "insert", optionId: "gatefold", priceMode: "ladder", ladder: { groupKey: "inserts", itemLabel: "Foldover insert 4 panel" } },
  // Booklet page counts vary — ladders live in the blob, link stays honest.
  { componentKey: "insert", optionId: "booklet", priceMode: "custom_quote" },
  { componentKey: "insert", optionId: "poster", priceMode: "custom_quote" },
  // Extras.
  { componentKey: "extras", optionId: "download_card", priceMode: "ladder", ladder: { groupKey: "download_cards", itemLabel: "3x3" } },
  { componentKey: "extras", optionId: "sticker", priceMode: "ladder", ladder: { groupKey: "stickers", itemLabel: "2x3 rectangle or 2.5 circle sticker" } },
  { componentKey: "extras", optionId: "poly_bag", priceMode: "service", serviceLabel: "Poly Bags (Non Resealable)" },
  { componentKey: "extras", optionId: "shrink_wrap", priceMode: "service", serviceLabel: "Shrink Wrap" },
  { componentKey: "extras", optionId: "insertion", priceMode: "service", serviceLabel: "Insertion Fee" },
];

async function main() {
  try {
    const [marker] = (
      await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`)
    ).rows;
    if (marker) {
      console.log(`Marker '${MARKER}' already set — nothing to do.`);
      return;
    }

    const [press] = await db.select().from(manufacturers).where(eq(manufacturers.id, PMP_PRESS_ID));
    if (!press) throw new Error(`PMP manufacturer ${PMP_PRESS_ID} not found — FATAL, not stamping.`);
    console.log(`PMP press: ${press.id} (${press.name})`);

    // ── Service items (per-item guard) ──────────────────────────────────
    let itemsInserted = 0;
    let position = 0;
    for (const item of ITEMS) {
      position += 1;
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
      if (existing) continue;
      itemsInserted++;
      if (!DRY) {
        await db.insert(pressServiceItems).values({
          pressId: press.id,
          category: item.category,
          label: item.label,
          amountCents: item.amountCents,
          unitBasis: item.unitBasis,
          note: item.note ?? null,
          position,
          source: SOURCE,
        } as any);
      }
    }
    console.log(`${DRY ? "[dry] " : ""}service items inserted: ${itemsInserted}/${ITEMS.length}`);

    // ── componentLadders blob (namespaced merge) ────────────────────────
    const blob: ComponentLadderCatalog = {
      source: SOURCE,
      priceList: "PMP 2026 Pricing Sheet (Jonathan, Aug 2026)",
      quantities: [...QTYS],
      groups: GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        items: g.items.map((i) => ({ label: i.label, unitCents: toUnitCents(i.rungs), ...(i.note ? { note: i.note } : {}) })),
      })),
    };
    (blob as any).loadedAt = new Date().toISOString();
    if (!DRY) {
      const [row] = await db
        .select()
        .from(pressComponents)
        .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")));
      if (row) {
        await db
          .update(pressComponents)
          .set({
            config: sql`COALESCE(${pressComponents.config}, '{}'::jsonb) || jsonb_build_object('componentLadders', ${JSON.stringify(blob)}::jsonb)`,
            updatedAt: new Date(),
          } as any)
          .where(eq(pressComponents.id, row.id));
      } else {
        await db.insert(pressComponents).values({
          pressId: press.id,
          componentKey: "pricing",
          config: { componentLadders: blob },
        } as any);
      }
      console.log(
        `component ladders written (${GROUPS.reduce((n, g) => n + g.items.length, 0)} items across ${GROUPS.length} groups).`,
      );
    }

    // ── Price links (per-link guard; missing prereq = FATAL) ────────────
    const services = await db
      .select()
      .from(pressServiceItems)
      .where(eq(pressServiceItems.pressId, press.id));
    const serviceByLabel = new Map(
      services.filter((s) => !s.archivedAt).map((s) => [s.label, s] as const),
    );

    let linksInserted = 0;
    let linksSkipped = 0;
    for (const link of LINKS) {
      const [existing] = await db
        .select({ id: pressComponentPriceLinks.id })
        .from(pressComponentPriceLinks)
        .where(
          and(
            eq(pressComponentPriceLinks.pressId, press.id),
            eq(pressComponentPriceLinks.componentKey, link.componentKey),
            eq(pressComponentPriceLinks.optionId, link.optionId),
          ),
        );
      if (existing) {
        linksSkipped++;
        continue; // operator-edited or previously seeded — never overwrite
      }

      let serviceItemId: string | null = null;
      let ladderSource: { groupKey: string; itemLabel: string } | null = null;
      let ladderRungs: { qty: number; unitCents: number }[] | null = null;
      if (link.priceMode === "service") {
        const item = serviceByLabel.get(link.serviceLabel!);
        if (!item && DRY) {
          console.log(`[dry] ${link.componentKey}:${link.optionId} → service '${link.serviceLabel}' (would be inserted above)`);
        } else if (!item) {
          throw new Error(
            `PMP ${link.componentKey}:${link.optionId} — service '${link.serviceLabel}' not found; FATAL, not stamping.`,
          );
        } else {
          serviceItemId = item.id;
        }
      } else if (link.priceMode === "ladder") {
        const rungs = ladderItemToRungs(blob, link.ladder!.groupKey, link.ladder!.itemLabel);
        if (!rungs) {
          throw new Error(
            `PMP ${link.componentKey}:${link.optionId} — ladder '${link.ladder!.groupKey}/${link.ladder!.itemLabel}' has no rungs; FATAL, not stamping.`,
          );
        }
        ladderSource = link.ladder!;
        // Snapshot integer cents on links (display/total math), while the
        // blob keeps the sheet's raw values.
        ladderRungs = rungs.map((r) => ({ qty: r.qty, unitCents: Math.round(r.unitCents) }));
      }

      linksInserted++;
      if (!DRY) {
        await db.insert(pressComponentPriceLinks).values({
          pressId: press.id,
          componentKey: link.componentKey,
          optionId: link.optionId,
          priceMode: link.priceMode,
          serviceItemId,
          ladderSource,
          ladderRungs,
        } as any);
      }
    }
    console.log(`${DRY ? "[dry] " : ""}links inserted: ${linksInserted}, skipped ${linksSkipped} existing`);

    if (!DRY) {
      await db.execute(
        sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
      );
      console.log(`marker '${MARKER}' set.`);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && /seed-pmp-component-pricing/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
