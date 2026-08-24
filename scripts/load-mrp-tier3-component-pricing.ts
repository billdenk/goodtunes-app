/**
 * Task #3325 — Connect MRP Tier 3 pricing to components.
 *
 * Loads Memphis Record Pressing's Tier 3 price sheet
 * (attached_assets/GoodTunes___GoGoods-Tier3_1787532284515.xlsx, "GoodTunes"
 * sheet, REV 08.07.25, VISIBLE ROWS ONLY — Bill's standing rule) into the
 * press_components 'pricing' config as quantity-break ladders:
 *
 *   - Vinyl STYLE (type) rows get rungsBySize (140g / 7" 49g) and
 *     rungsBySizeHeavy (180g) — colors inherit their style's price at
 *     resolution time; per-color operator overrides still win.
 *   - Splatter becomes a surcharge-over-style row (surchargeOver =
 *     "type:opaque", adder rungs +$0.75@300 / +$0.55@500+).
 *   - Flat component rows (labels/jackets/sleeves/inserts/stickers,
 *     assembly/shrink) get per-unit ladders; setup services (cutting,
 *     plating, test, stampers, colorfee) get oneTime ladders (totals).
 *   - Also splits the seeded "neon-glow" vinyl category into "neon" +
 *     "glow" (their sheet prices differ): G-coded swatches → glow,
 *     N-coded → neon; operator prices on the old rows are preserved.
 *
 * Operator edits ALWAYS win: this script never touches pricesBySize /
 * priceCents — imported ladders live in separate fields and lose to any
 * operator cell at resolution (shared/quotePricing.ts resolveRowUnit).
 * Re-runnable: marker-guarded (mrp_tier3_component_pricing_v1); provenance
 * pricingSource="mrp-tier3-2025" stamped per row.
 *
 * Dev:  npx tsx scripts/load-mrp-tier3-component-pricing.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/load-mrp-tier3-component-pricing.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { manufacturers, pressComponents } from "../shared/schema";
import { loadPressComponents } from "../server/pressComponents";
import type {
  PricingComponentConfig,
  PricingRow,
  PricingRung,
  VinylComponentConfig,
  VinylSizeId,
} from "../shared/pressComponents";
import { RECORD_BOOKS, SPLATTER_SURCHARGE, QTYS, SOURCE } from "./load-mrp-tier3-pricing";

const DRY = process.argv.includes("--dry");
const MARKER = "mrp_tier3_component_pricing_v1";

const c = (dollars: number) => Math.round(dollars * 100);
const rungs = (dollars: readonly number[]): PricingRung[] =>
  dollars.map((d, i) => ({ qty: QTYS[i], unitCents: c(d) }));
const flatLadder = (dollars: number): PricingRung[] => rungs(QTYS.map(() => dollars));
const oneTimeFlat = (dollars: number): PricingRung[] => rungs(QTYS.map(() => dollars));

// ── Vinyl style → RECORD_BOOKS key (no new styles minted; unmapped reported).
const CATEGORY_BOOK: Record<string, keyof typeof RECORD_BOOKS> = {
  black: "black",
  ecomix: "ecoMix",
  translucent: "translucent",
  opaque: "opaque",
  neon: "neon",
  glow: "glow",
  "standard-blends": "standardMix",
  "smoke-blends": "standardMix",
  "cream-blends": "standardMix",
  "metallic-blends": "standardMix",
  "double-double": "standardMix",
  "deluxe-blends": "deluxeMix",
  "shimmer-blends": "deluxeMix",
  "glitter-blends": "deluxeMix",
  half: "split2",
  "color-in-color": "split2",
};
// Categories the sheet has NO visible price for — left honestly unpriced.
const KNOWN_UNPRICED_CATEGORIES = new Set(["color", "ghostly-effect", "torrent-effect"]);

// ── Flat component ladders (per-unit dollars, sheet visible rows). Where a
// pricing row spans sizes, identical ladders are written under each size key
// the sheet prices (resolution is strict per-size for sized lookups).
const L = {
  labelBw: [0.6, 0.37, 0.2, 0.18, 0.18, 0.17, 0.16, 0.15],
  labelCmyk: [0.74, 0.51, 0.25, 0.23, 0.22, 0.21, 0.18, 0.17],
  // Printed sleeves: 12"/10" paper 4/0 CMYK (row 134); 7" 4/0 CMYK (row 138).
  printedSleeve12: [2.4436428571428572, 1.4661857142857144, 0.8136714285714286, 0.5469857142857143, 0.48684285714285713, 0.3968714285714286, 0.3565571428571429, 0.31834285714285716],
  printedSleeve7: [0.9714285714285715, 0.6285714285714287, 0.5142857142857143, 0.4285714285714286, 0.37142857142857144, 0.34285714285714286, 0.34285714285714286, 0.34285714285714286],
  // Unprinted: 12"/10" black paper (row 120); 7" black paper (row 126).
  unprintedSleeve12: 0.1,
  unprintedSleeve7: 0.2,
  // Poly-lined white inner sleeve — included in pressing price (genuine $0).
  polylined: 0,
  // Jackets, 4/0 CMYK Standard AQ Gloss.
  jacketSingle12: [2.0709428571428572, 1.2425714285714287, 0.8147428571428572, 0.6456428571428572, 0.6082, 0.5435142857142857, 0.5174142857142857, 0.4924428571428572],
  jacketSingle7: [1.2142857142857144, 0.7857142857142858, 0.5428571428571429, 0.5, 0.4571428571428572, 0.4, 0.4, 0.4],
  jacketGatefold12: [5.966157142857143, 3.5797, 2.3098285714285716, 1.4587142857142856, 1.3146, 1.1648, 1.0672, 1.0025142857142859],
  jacketGatefold7: [3.4571428571428573, 1.842857142857143, 1.4571428571428573, 1.3, 1.142857142857143, 1.0857142857142859, 1.0571428571428572, 1.0571428571428572],
  jacketTrifold12: [8.957142857142857, 5.373457142857143, 3.4226857142857146, 2.367314285714286, 2.041614285714286, 1.7181857142857144, 1.5014428571428573, 1.3505142857142858],
  jacketTrifold7: [4.185714285714286, 2.285714285714286, 1.842857142857143, 1.7714285714285716, 1.4714285714285715, 1.4, 1.4, 1.4],
  // Inserts: 12"x12" 4/0 CMYK (row 167); 7"x7" 4/0 CMYK (row 179).
  insertSheet12: [1.6142857142857143, 0.9714285714285715, 0.5428571428571429, 0.35714285714285715, 0.27142857142857146, 0.22857142857142859, 0.22857142857142859, 0.22857142857142859],
  insertSheet7: [0.37142857142857144, 0.27142857142857146, 0.2142857142857143, 0.18571428571428572, 0.17142857142857143, 0.17142857142857143, 0.17142857142857143, 0.17142857142857143],
  // Gatefold inserts: 24"x12" 4/4 (row 174); 14"x7" 4/4 (row 186).
  insertGatefold12: [3.257142857142857, 1.9571428571428575, 1.1571428571428573, 0.942857142857143, 0.7285714285714286, 0.5285714285714286, 0.4857142857142857, 0.4857142857142857],
  insertGatefold7: [2.3000000000000003, 1.2428571428571429, 0.7142857142857143, 0.45714285714285718, 0.35714285714285715, 0.3, 0.24285714285714288, 0.24285714285714288],
  // Stickers — representative sizes (reported): circle 3" (row 309),
  // square = rect 7.1–9 sq/in (row 314), rect 5.1–7 sq/in (row 313), all
  // full-color CMYK gloss-lam; UPC (row 269).
  stickerCircle: [1.5538461538461539, 0.9384615384615385, 0.6153846153846154, 0.4, 0.3076923076923077, 0.2153846153846154, 0.2153846153846154, 0.2153846153846154],
  stickerSquare: [1.5538461538461539, 0.9384615384615385, 0.6153846153846154, 0.4, 0.3076923076923077, 0.2, 0.2, 0.2],
  stickerRect: [1.4461538461538461, 0.8769230769230768, 0.5692307692307692, 0.3692307692307692, 0.29230769230769232, 0.2153846153846154, 0.2153846153846154, 0.2153846153846154],
  stickerUpc: 0.05,
  assembly: 0.12,
  shrink: 0.17,
} as const;

// One-time setups (totals at each qty; sheet: cutting/plating are per side —
// a standard LP is 2 sides). 12"/10": cutting $400/side, plating $300/side.
// 7": cutting $290/side, plating $160/side. Test pressing $125 + $50 2-day
// ship = $175. Color setup fee $95/color.
const SETUP = {
  cutting12: 800,
  cutting7: 580,
  plating12: 600,
  plating7: 320,
  test: 175,
  colorfee: 95,
};
// Stampers: 140g $0.14/unit over the initial 1,000; 180g $0.24 over 500;
// 7" $0.15/unit all quantities. We ladder the 140g rule per size (the
// builder's stampers line is size-scoped, weight is not available there —
// 140g is the dominant/default weight; 180g stamper delta reported as a gap).
const stamperTotals = (perUnit: number, over: number) =>
  rungs(QTYS.map((q) => Math.max(0, q - over) * perUnit));

type SizeLadders = Partial<Record<VinylSizeId, PricingRung[]>>;

function sized(entries: [VinylSizeId, readonly number[] | number][]): SizeLadders {
  const out: SizeLadders = {};
  for (const [size, v] of entries) {
    out[size] = typeof v === "number" ? flatLadder(v) : rungs(v);
  }
  return out;
}

// key → { rungsBySize?, rungsBySizeHeavy?, oneTime?, surchargeOver? }
const FLAT_IMPORTS: Record<
  string,
  { rungsBySize?: SizeLadders; oneTime?: boolean }
> = {
  "labels:bw": { rungsBySize: sized([['12"', L.labelBw], ['10"', L.labelBw], ['7"', L.labelBw]]) },
  "labels:color": { rungsBySize: sized([['12"', L.labelCmyk], ['10"', L.labelCmyk], ['7"', L.labelCmyk]]) },
  "jackets:single": { rungsBySize: sized([['12"', L.jacketSingle12], ['10"', L.jacketSingle12], ['7"', L.jacketSingle7]]) },
  "jackets:gatefold": { rungsBySize: sized([['12"', L.jacketGatefold12], ['10"', L.jacketGatefold12], ['7"', L.jacketGatefold7]]) },
  "jackets:trifold": { rungsBySize: sized([['12"', L.jacketTrifold12], ['10"', L.jacketTrifold12], ['7"', L.jacketTrifold7]]) },
  // jackets:discobag — no sheet row → honestly pending (reported).
  "sleeves:printed": { rungsBySize: sized([['12"', L.printedSleeve12], ['10"', L.printedSleeve12], ['7"', L.printedSleeve7]]) },
  "sleeves:unprinted": { rungsBySize: sized([['12"', L.unprintedSleeve12], ['10"', L.unprintedSleeve12], ['7"', L.unprintedSleeve7]]) },
  "sleeves:polylined": { rungsBySize: sized([['12"', L.polylined], ['10"', L.polylined], ['7"', L.polylined]]) },
  "inserts:sheet": { rungsBySize: sized([['12"', L.insertSheet12], ['10"', L.insertSheet12], ['7"', L.insertSheet7]]) },
  "inserts:gatefold": { rungsBySize: sized([['12"', L.insertGatefold12], ['10"', L.insertGatefold12], ['7"', L.insertGatefold7]]) },
  // inserts:booklet / inserts:poster — sheet rows hidden → pending (reported).
  "stickers:circle": { rungsBySize: sized([['12"', L.stickerCircle], ['10"', L.stickerCircle], ['7"', L.stickerCircle]]) },
  "stickers:square": { rungsBySize: sized([['12"', L.stickerSquare], ['10"', L.stickerSquare], ['7"', L.stickerSquare]]) },
  "stickers:rect": { rungsBySize: sized([['12"', L.stickerRect], ['10"', L.stickerRect], ['7"', L.stickerRect]]) },
  "stickers:upc": { rungsBySize: sized([['12"', L.stickerUpc], ['10"', L.stickerUpc], ['7"', L.stickerUpc]]) },
  "service:assembly": { rungsBySize: sized([['12"', L.assembly], ['10"', L.assembly], ['7"', L.assembly]]) },
  "service:shrink": { rungsBySize: sized([['12"', L.shrink], ['10"', L.shrink], ['7"', L.shrink]]) },
  "service:cutting": { rungsBySize: sized([['12"', SETUP.cutting12], ['10"', SETUP.cutting12], ['7"', SETUP.cutting7]]), oneTime: true },
  "service:plating": { rungsBySize: sized([['12"', SETUP.plating12], ['10"', SETUP.plating12], ['7"', SETUP.plating7]]), oneTime: true },
  "service:test": { rungsBySize: sized([['12"', SETUP.test], ['10"', SETUP.test], ['7"', SETUP.test]]), oneTime: true },
  "service:colorfee": { rungsBySize: sized([['12"', SETUP.colorfee], ['10"', SETUP.colorfee], ['7"', SETUP.colorfee]]), oneTime: true },
  "service:stampers": {
    rungsBySize: {
      '12"': stamperTotals(0.14, 1000),
      '10"': stamperTotals(0.14, 1000),
      '7"': rungs(QTYS.map((q) => q * 0.15)),
    },
    oneTime: true,
  },
};

// ── Split the seeded neon-glow category (sheet prices Neon and Glow apart).
function splitNeonGlow(vinyl: VinylComponentConfig): { changed: boolean; vinyl: VinylComponentConfig; movedToGlow: string[] } {
  const idx = vinyl.categories.findIndex((cat) => cat.id === "neon-glow");
  if (idx === -1) return { changed: false, vinyl, movedToGlow: [] };
  const cat = vinyl.categories[idx];
  const isGlow = (sw: { id: string; name: string }) =>
    /^g\d/i.test(sw.id) || /^g\d/i.test(sw.name) || /glow/i.test(sw.name);
  const glowSw = cat.swatches.filter(isGlow);
  const neonSw = cat.swatches.filter((sw) => !isGlow(sw));
  const categories = [...vinyl.categories];
  const next: typeof categories = [];
  for (let i = 0; i < categories.length; i++) {
    if (i !== idx) {
      next.push(categories[i]);
      continue;
    }
    next.push({ ...cat, id: "neon", name: "Neon", swatches: neonSw });
    next.push({ ...cat, id: "glow", name: "Glow", swatches: glowSw });
  }
  return { changed: true, vinyl: { ...vinyl, categories: next }, movedToGlow: glowSw.map((s) => s.id) };
}

/** Remap pricing rows for the neon-glow split, preserving operator prices. */
function remapNeonGlowRows(rows: PricingRow[], glowSwatchIds: Set<string>): PricingRow[] {
  const out: PricingRow[] = [];
  let typeRow: PricingRow | null = null;
  for (const r of rows) {
    if (r.key === "type:neon-glow") {
      typeRow = r;
      out.push({ ...r, key: "type:neon", label: "Neon" });
      out.push({ ...r, key: "type:glow", label: "Glow", pricesBySize: {} });
      continue;
    }
    if (r.key.startsWith("color:neon-glow:")) {
      const swId = r.key.slice("color:neon-glow:".length);
      const catId = glowSwatchIds.has(swId) ? "glow" : "neon";
      out.push({ ...r, key: `color:${catId}:${swId}`, detail: catId === "glow" ? "Glow" : "Neon" });
      continue;
    }
    out.push(r);
  }
  void typeRow;
  return out;
}

async function main() {
  try {
    const [marker] = (
      await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`)
    ).rows;
    if (marker) {
      console.log(`Marker '${MARKER}' already set — nothing to do.`);
      return;
    }

    const [press] = await db
      .select()
      .from(manufacturers)
      .where(sql`${manufacturers.name} ILIKE '%memphis%'`);
    if (!press) throw new Error("Memphis Record Pressing manufacturer not found — FATAL, not stamping.");
    console.log(`MRP press: ${press.id} (${press.name})`);

    // Ensure configs exist/seeded.
    const comps = await loadPressComponents(press.id);

    // 1. Split neon-glow in the vinyl config.
    const split = splitNeonGlow(comps.vinyl);
    if (split.changed) {
      console.log(`${DRY ? "[dry] " : ""}splitting neon-glow → neon + glow (glow swatches: ${split.movedToGlow.join(", ") || "none"})`);
      if (!DRY) {
        await db
          .update(pressComponents)
          .set({ config: split.vinyl as any, updatedAt: new Date() })
          .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "vinyl")));
      }
    }

    // 2. Rewrite the pricing rows.
    const [pricingRow] = await db
      .select()
      .from(pressComponents)
      .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")));
    if (!pricingRow) throw new Error("pricing component row missing after loadPressComponents — FATAL.");
    const config = pricingRow.config as PricingComponentConfig & Record<string, unknown>;
    let rows = [...(config.rows ?? [])];
    if (split.changed) rows = remapNeonGlowRows(rows, new Set(split.movedToGlow));

    const unmappedCategories: string[] = [];
    const importedKeys: string[] = [];
    rows = rows.map((r) => {
      // Vinyl style ladders on type rows.
      if (r.kind === "type") {
        const catId = r.key.slice("type:".length);
        if (catId === "splatter") {
          const adder = SPLATTER_SURCHARGE; // {qty,amountCents}: 300→75, 500+→55
          const adderRungs: PricingRung[] = QTYS.map((q) => ({
            qty: q,
            unitCents: q < 500 ? adder[0].amountCents : adder[1].amountCents,
          }));
          importedKeys.push(r.key);
          return {
            ...r,
            surchargeOver: "type:opaque",
            rungsBySize: { '12"': adderRungs, '10"': adderRungs },
            pricingSource: SOURCE,
          };
        }
        const bookKey = CATEGORY_BOOK[catId];
        if (!bookKey) {
          if (!KNOWN_UNPRICED_CATEGORIES.has(catId)) unmappedCategories.push(catId);
          return r;
        }
        const book = RECORD_BOOKS[bookKey];
        const rungsBySize: SizeLadders = {};
        if (book.g140) {
          rungsBySize['12"'] = rungs(book.g140);
          rungsBySize['10"'] = rungs(book.g140);
        }
        if (book.g49) rungsBySize['7"'] = rungs(book.g49);
        const heavy: SizeLadders = book.g180 ? { '12"': rungs(book.g180) } : {};
        importedKeys.push(r.key);
        return {
          ...r,
          rungsBySize,
          ...(book.g180 ? { rungsBySizeHeavy: heavy } : {}),
          pricingSource: SOURCE,
        };
      }
      // Flat rows.
      const imp = FLAT_IMPORTS[r.key];
      if (!imp) return r;
      importedKeys.push(r.key);
      return {
        ...r,
        ...(imp.rungsBySize ? { rungsBySize: imp.rungsBySize } : {}),
        ...(imp.oneTime ? { oneTime: true } : {}),
        pricingSource: SOURCE,
      };
    });

    // Report: FLAT_IMPORTS keys with no matching row (sheet → app misses).
    const rowKeys = new Set(rows.map((r) => r.key));
    const missingRows = Object.keys(FLAT_IMPORTS).filter((k) => !rowKeys.has(k));

    console.log(`${DRY ? "[dry] " : ""}rows imported: ${importedKeys.length}`);
    console.log(`  keys: ${importedKeys.join(", ")}`);
    if (unmappedCategories.length) console.log(`  UNMAPPED vinyl categories (left unpriced): ${unmappedCategories.join(", ")}`);
    console.log(`  known-unpriced categories (no visible sheet row): ${[...KNOWN_UNPRICED_CATEGORIES].join(", ")}`);
    if (missingRows.length) console.log(`  sheet-priced keys with NO pricing row (skipped): ${missingRows.join(", ")}`);
    console.log(
      "  honestly pending (no visible sheet price): jackets:discobag, inserts:booklet, inserts:poster, labels:blank" +
        " — plus 180g stamper delta ($0.24/unit over 500) not laddered (builder stampers line is size-scoped only).",
    );

    if (!DRY) {
      await db
        .update(pressComponents)
        .set({ config: { ...config, rows } as any, updatedAt: new Date() })
        .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")));
      await db.execute(
        sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
      );
      console.log(`marker '${MARKER}' set.`);
    } else {
      console.log("[dry] no writes.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
