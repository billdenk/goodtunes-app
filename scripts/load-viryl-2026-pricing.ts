/**
 * Task #3220 — Load Viryl Technologies' 2026 USD pricing into the press
 * catalog price ladders.
 *
 * Source of truth:
 *   attached_assets/Viryl_2026_Pressing_Price_List_USD_1787187902259.pdf
 *   (Effective July 1st 2026.)
 *
 * LADDER SEMANTICS ARE ALL-IN, matching the 2024 seed and every ladder
 * consumer (SellPanel manufacturing cost, quote PDFs): a rung on a jacketed
 * combo row = record + digitally-printed jacket at that qty + jacket
 * insertion. Records-only combo rows (paper-sleeve / "Records + …" jackets)
 * = bare record price (white inner sleeve included per the sheet).
 *
 * 2026 per-record USD (140 g 12"/10" · 180 g 12" · 42 g 7"):
 *   Black $1.76·$2.21·$1.42 | Opaque $2.06·$2.59·$1.54 |
 *   Transparent $2.14·$2.70·$1.61 | Multi-colour $2.29·$2.89·$1.72 |
 *   Hand Pour $2.66·$3.07·$2.03 | Splatter $2.81·$3.26·$2.14 |
 *   Metallic/Specialty & Premium = Opaque + $0.15 premium-colour adder.
 * 12" digital-print jacket per unit: 50+ $3.00 · 100+ $2.17 · 200+ $1.80 ·
 *   300+ $1.65 (open-ended — also applies at 500/1000; the offset-print bulk
 *   rows are garbled on the sheet and are deliberately NOT loaded).
 * Jacket insertion: $0.11/record. 7" jackets are Custom Quote → 7" rows
 * carry the bare record price. 12_double = 2 records (+ jacket + 2 insertions
 * on jacketed rows).
 *
 * Rung conventions (press-pricing-sources-and-lock):
 *   confirmed:true · source:"viryl-2026-price-list" · syncedAt · lockedFromSync:true
 *
 * Clobber guard — a rung is only (over)written when it is NOT confirmed, or
 * when it was seeded by our own scripts (source "viryl-catalog-2024" or this
 * script's own source). Operator-entered confirmed rungs are NEVER touched.
 *
 * Marker-guarded (viryl_pricing_2026_v2). Dev/prod via DATABASE_URL. --dry.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  manufacturers,
  pressColorTiers,
  pressJackets,
  pressTierJacketLadders,
} from "../shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_pricing_2026_v4";
export const SOURCE = "viryl-2026-price-list";
const OLD_SCRIPT_SOURCE = "viryl-catalog-2024";
export const QTYS = [50, 100, 200, 300, 500, 1000] as const;

export type Rung = {
  qty: number;
  unitCents: number;
  confirmed?: boolean;
  source?: string;
  syncedAt?: string;
  lockedFromSync?: boolean;
  estimated?: boolean;
  offered?: boolean;
  [k: string]: unknown;
};

// Per-record cents by tier name: [12" 140g, 12" 180g, 7"].
export const TIER_CENTS: Record<string, [number, number, number]> = {
  "Black": [176, 221, 142],
  "Opaque": [206, 259, 154],
  "Transparent": [214, 270, 161],
  "Multi-colour": [229, 289, 172],
  "Hand Pour": [266, 307, 203],
  "Splatter": [281, 326, 214],
  // Premium colours/effects (metallics, neon, glitter…) = base Opaque tier
  // + the flat $0.15 premium-colour adder from the 2026 sheet.
  "Metallic / Specialty": [221, 274, 169],
  "Premium": [221, 274, 169],
};

// 12" digital-print jacket, per unit at each qty rung. The sheet's small-
// quantity digital pricing covers 50–300+. The 500+/1000+ rows switch to
// offset-print BULK pricing whose figures are typo-garbled ($79.500.00 etc.)
// and explicitly not loaded — so jacketed combo rows stay UNQUOTED at the
// 500/1000 rungs rather than substituting an invented rate.
export const JACKET_CENTS_2026: Record<number, number> = {
  50: 300,
  100: 217,
  200: 180,
  300: 165,
};
export const INSERTION_CENTS_2026 = 11; // $0.11/record

/** All-in per-unit cents for one qty rung of a tier×jacket combo. */
export function composeUnitCents(args: {
  format: string; // 12_lp | 12_double | 7_inch
  tierName: string;
  jacketed: boolean; // printed 12" jacket on this combo row?
  heavyweight: boolean; // price the 180 g record?
  qty: number;
}): number | null {
  const cents = TIER_CENTS[args.tierName];
  if (!cents) return null;
  const [c140, c180, c7] = cents;
  if (args.format === "7_inch") {
    // 7" jackets are Custom Quote — bare record price only (paper sleeve
    // included). heavyweight never applies to 7".
    return args.heavyweight ? null : c7;
  }
  const per = args.heavyweight ? c180 : c140;
  const records = args.format === "12_double" ? 2 : 1;
  let unit = per * records;
  if (args.jacketed) {
    const jacket = JACKET_CENTS_2026[args.qty];
    if (jacket == null) return null; // 500/1000 = garbled offset bulk rows → unquoted
    unit += jacket + INSERTION_CENTS_2026 * records;
  }
  return unit;
}

/** Neutralize script-seeded rungs at quantities the 2026 sheet cannot price
 *  (jacketed 500/1000): flip them back to unconfirmed TBD so quotes refuse
 *  rather than use an invented or stale-2024 number. Touches only rungs
 *  sourced by our own scripts (this loader or the 2024 seed); operator-
 *  entered rungs are untouched. Mutates + reports. */
export function neutralizeOwnUnpriceableRungs(
  ladder: Rung[],
  priceable: (qty: number) => boolean,
): boolean {
  let changed = false;
  for (const r of ladder) {
    if ((r.source === SOURCE || r.source === OLD_SCRIPT_SOURCE) && r.confirmed && !priceable(Number(r.qty))) {
      r.unitCents = 0;
      r.confirmed = false;
      delete r.source;
      delete r.syncedAt;
      delete r.lockedFromSync;
      changed = true;
    }
  }
  return changed;
}

function overwritable(r: Rung | undefined): boolean {
  if (!r) return true;
  if (r.source === OLD_SCRIPT_SOURCE || r.source === SOURCE) return true;
  if (r.lockedFromSync) return false;
  return !r.confirmed;
}

/** Merge 2026 pricing into an existing ladder without clobbering
 *  operator-confirmed rungs. Returns null when nothing changed. */
export function mergeLadder(
  existing: Rung[] | null | undefined,
  unitCentsForQty: (qty: number) => number | null,
  syncedAt: string,
): Rung[] | null {
  const ladder: Rung[] = Array.isArray(existing) ? existing.map((r) => ({ ...r })) : [];
  let changed = false;
  for (const qty of QTYS) {
    const unitCents = unitCentsForQty(qty);
    if (unitCents == null) continue;
    const stamp: Rung = { qty, unitCents, confirmed: true, source: SOURCE, syncedAt, lockedFromSync: true };
    const idx = ladder.findIndex((r) => Number(r.qty) === qty);
    if (idx === -1) {
      ladder.push(stamp);
      changed = true;
    } else if (overwritable(ladder[idx])) {
      if (
        ladder[idx].unitCents !== unitCents ||
        ladder[idx].confirmed !== true ||
        ladder[idx].source !== SOURCE ||
        ladder[idx].lockedFromSync !== true
      ) {
        // Preserve any extra operator fields (e.g. offered:false) verbatim.
        ladder[idx] = { ...ladder[idx], ...stamp };
        changed = true;
      }
    }
    // else: operator-confirmed rung — leave untouched.
  }
  if (!changed) return null;
  ladder.sort((a, b) => Number(a.qty) - Number(b.qty));
  return ladder;
}

/** A combo row counts as jacketed when its jacket is a printed jacket —
 *  i.e. NOT a records-only / sleeve-only pseudo-jacket. */
export function isJacketedJacketName(name: string): boolean {
  return !/sleeve only|records \+/i.test(name);
}

async function main() {
  const { db, pool } = await import("../server/db");
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
      .where(sql`${manufacturers.domain} ILIKE '%viryl%' OR ${manufacturers.name} ILIKE '%viryl%'`);
    if (!press) {
      // Viryl must exist (seed_viryl_catalog runs earlier in post-merge). A
      // missing press means the prereq seed failed — FATAL, never stamp.
      throw new Error("Viryl manufacturer not found — run seed-viryl-catalog first.");
    }
    console.log(`Viryl press: ${press.id} (${press.name})`);

    const tiers = await db.select().from(pressColorTiers).where(eq(pressColorTiers.pressId, press.id));
    const jackets = await db.select().from(pressJackets).where(eq(pressJackets.pressId, press.id));
    const jacketById = new Map(jackets.map((j) => [j.id, j]));
    const syncedAt = new Date().toISOString();

    let laddersTouched = 0;
    for (const tier of tiers) {
      if (!TIER_CENTS[tier.name]) {
        console.log(`  skip tier '${tier.name}' (${tier.format}) — no 2026 price mapping`);
        continue;
      }
      const rows = await db
        .select()
        .from(pressTierJacketLadders)
        .where(eq(pressTierJacketLadders.tierId, tier.id));
      for (const row of rows) {
        const jacket = jacketById.get(row.jacketId);
        if (!jacket) continue;
        const jacketed = isJacketedJacketName(jacket.name);
        // The dedicated "…180g" jacket row prices heavyweight on its MAIN
        // ladder; every other row takes 140 g main + 180 g book.
        const is180Jacket = /180\s*g/i.test(jacket.name);
        const patch: Record<string, unknown> = {};
        const rework = (existing: Rung[] | null | undefined, heavyweight: boolean): Rung[] | null => {
          const price = (qty: number) =>
            composeUnitCents({ format: tier.format, tierName: tier.name, jacketed, heavyweight, qty });
          const merged = mergeLadder(existing, price, syncedAt);
          // Repair rungs an earlier run of this script stamped at now-
          // unpriceable quantities (jacketed 500/1000) — back to honest
          // unconfirmed TBD so nothing quotes off an invented number.
          const working = merged ?? (Array.isArray(existing) ? existing.map((r) => ({ ...r })) : []);
          const neutralized = neutralizeOwnUnpriceableRungs(working, (qty) => price(qty) != null);
          return merged || neutralized ? working : null;
        };
        const main = rework(row.priceLadder as Rung[], is180Jacket);
        if (main) patch.priceLadder = main;
        if (!is180Jacket && tier.format !== "7_inch") {
          const heavy = rework(row.priceLadder180 as Rung[], true);
          if (heavy) patch.priceLadder180 = heavy;
        }
        if (Object.keys(patch).length === 0) continue;
        laddersTouched++;
        console.log(
          `  ${tier.format.padEnd(10)} ${tier.name.padEnd(22)} jacket=${jacket.name.slice(0, 42)}` +
            ` main@100=${(patch.priceLadder as Rung[] | undefined)?.find((r) => r.qty === 100)?.unitCents ?? "kept"}`,
        );
        if (!DRY) {
          await db
            .update(pressTierJacketLadders)
            .set(patch)
            .where(and(eq(pressTierJacketLadders.id, row.id)));
        }
      }
    }
    console.log(`${DRY ? "[dry] " : ""}ladders updated: ${laddersTouched}`);

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

// Only execute when run directly (tests import the composition helpers).
if (process.argv[1] && /load-viryl-2026-pricing/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
