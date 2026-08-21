/**
 * Task #3226 — Load Memphis Record Pressing's Tier 3 white-label pricing
 * into the press catalog price ladders, flip Splatter to a SURCHARGE tier,
 * and backfill the named price lists for MRP + Viryl.
 *
 * Source of truth:
 *   attached_assets/GoodTunes___GoGoods-Tier3_1787269499765.xlsx
 *   (TIER 3 PRICING, effective 09.01.2025, REV.08.07.25.)
 *   VISIBLE ROWS ONLY — Brandon: ignore hidden rows entirely.
 *
 * LADDER SEMANTICS ARE ALL-IN, matching the Viryl loads and every ladder
 * consumer (SellPanel manufacturing cost, quote PDFs): a rung on a jacketed
 * combo row = record(s) + that jacket at that qty + jacket insertion
 * ($0.12/record). 12_double = 2 records (+ 2 insertions). 7" rows use the
 * 7" 49g record + 7" jacket prices. 140 g prices live on `priceLadder`,
 * 180 g on `priceLadder180` (12" formats only).
 *
 * Splatter (sheet: "SURCHARGE IN ADDITION TO COLOR VINYL COST ABOVE") is
 * marked pricing_mode='surcharge' with base tier = Opaque (same format) and
 * surcharge ladder +$0.75 @300 / +$0.55 @500+. Its own stale ladders are
 * cleared of our script-seeded rungs so quotes resolve via base + adder.
 *
 * Tier mapping (existing MRP tiers → sheet books). Tiers with no visible-
 * row price ("Color", Ghostly Effect, Torrent Effect) are skipped and
 * logged. New tiers created: Glow-in-the-Dark (12" only), 3-Color Split
 * (12" only), Picture Disc (12"/10"/7").
 *
 * Rung conventions (press-pricing-sources-and-lock):
 *   confirmed:true · source:"mrp-tier3-2025" · syncedAt · lockedFromSync:true
 * Clobber guard: a rung is only (over)written when it is NOT confirmed or
 * was seeded by our own sources. Operator-entered confirmed rungs are
 * NEVER touched. Viryl's ladders are untouched (price-list label only).
 *
 * Marker-guarded (mrp_tier3_pricing_v1). Dev/prod via DATABASE_URL. --dry.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  manufacturers,
  pressColorTiers,
  pressJackets,
  pressPriceLists,
  pressTierJacketLadders,
} from "../shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "mrp_tier3_pricing_v1";
export const SOURCE = "mrp-tier3-2025";
// Earlier script-seeded sources that are safe to overwrite. MRP's existing
// ladders were seeded as "placeholder-estimate" (confirmed+estimated) —
// those are OUR estimates, replaced wholesale by real Tier 3 prices.
// Null-source confirmed rungs (operator-entered) are NEVER touched.
const OWN_SOURCES = new Set([SOURCE, "placeholder-estimate"]);
export const QTYS = [300, 500, 1000, 2000, 3000, 5000, 10000, 25000] as const;

export const PRICE_LIST_LABEL_MRP = "MRP Tier 3 — 09.01.2025";
export const PRICE_LIST_LABEL_VIRYL = "Viryl 2026 USD";

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

const c = (dollars: number) => Math.round(dollars * 100);

// Per-record price books, 8 rungs each (300/500/1000/2000/3000/5000/10000/25000).
// null = the sheet has no price for that weight/format.
type Book = {
  g140: number[] | null; // 12"/10" 140 g
  g180: number[] | null; // 12" 180 g
  g49: number[] | null; // 7" 49 g
};
const flat = (first: number, rest: number) => [first, ...Array(7).fill(rest)] as number[];

export const RECORD_BOOKS: Record<string, Book> = {
  black: {
    g140: flat(1.7, 1.65),
    g180: flat(2.25, 2.2),
    g49: [1.7857142857142858, 1.5571428571428574, 1.4, 1.3714285714285714, 1.342857142857143, 1.2571428571428573, 1.2428571428571429, 1.4285714285714286],
  },
  // Eco-Mix = same price as black vinyl, no setup fee. Sheet prices 12" only.
  ecoMix: { g140: flat(1.7, 1.65), g180: flat(2.25, 2.2), g49: null },
  translucent: {
    g140: flat(2.1, 2.05),
    g180: flat(2.85, 2.8),
    g49: [2.1714285714285717, 1.9428571428571431, 1.7857142857142858, 1.7571428571428573, 1.7285714285714286, 1.6428571428571428, 1.6285714285714286, 1.6285714285714286],
  },
  opaque: {
    g140: flat(2.35, 2.3),
    g180: flat(3.1, 3.05),
    g49: [2.1714285714285717, 1.9428571428571431, 1.7857142857142858, 1.7571428571428573, 1.7285714285714286, 1.6428571428571428, 1.6285714285714286, 1.6285714285714286],
  },
  neon: {
    g140: flat(2.5, 2.45),
    g180: flat(3.25, 3.2),
    g49: [2.3285714285714287, 2.1, 1.9428571428571431, 1.9142857142857146, 1.8857142857142859, 1.8, 1.7857142857142858, 1.4285714285714286],
  },
  glow: { g140: flat(3.75, 3.7), g180: flat(4.6, 4.55), g49: null },
  standardMix: { g140: flat(2.85, 2.55), g180: flat(3.6, 3.3), g49: null },
  deluxeMix: { g140: flat(3.15, 2.85), g180: flat(3.95, 3.65), g49: null },
  split2: {
    g140: flat(3.35, 3.05),
    g180: flat(4.1, 3.8),
    g49: [2.8142857142857145, 2.5857142857142859, 2.4285714285714288, 2.4, 2.3714285714285714, 2.285714285714286, 2.2714285714285718, 2.2714285714285718],
  },
  split3: { g140: flat(3.75, 3.45), g180: flat(4.5, 4.2), g49: null },
  // Picture Discs — 12" is 180 g "only one weight available"; we carry it on
  // the MAIN ladder (the book the SellPanel prices from) and leave 180 empty.
  pictureDisc: {
    g140: [5.8, 5.25, 4.25, 4, 3.95, 3.9, 3.9, 3.9],
    g180: null,
    g49: [3.9712499999999995, 3.2225, 2.9025, 2.805, 2.6937500000000001, 2.5412500000000002, 2.5, 2.5],
  },
};

// Existing MRP tier name → book key. Standard mixes cover the 'CB','DD',
// 'MB','SB' blend families; Deluxe covers 'MD','HB','HG','SHM' (Shimmer =
// SHM, Glitter = HG heavy glitter). Ghostly/Torrent Effects and the generic
// "Color" tier have no visible-row price → skipped (logged).
export const TIER_BOOK: Record<string, keyof typeof RECORD_BOOKS> = {
  "Black": "black",
  "EcoMix": "ecoMix",
  "Translucent": "translucent",
  "Opaque": "opaque",
  "Neon/Glow": "neon",
  "Standard Blends": "standardMix",
  "Smoke Blends": "standardMix",
  "Cream Blends": "standardMix",
  "Metallic Blends": "standardMix",
  "Double Double": "standardMix",
  "Deluxe Blends": "deluxeMix",
  "Shimmer Blends": "deluxeMix",
  "Glitter Blends": "deluxeMix",
  "Half": "split2",
  "Color In Color": "split2",
  // New tiers created by this script:
  "Glow-in-the-Dark": "glow",
  "3-Color Split": "split3",
  "Picture Disc": "pictureDisc",
};

// New tiers this script mints (name → formats).
export const NEW_TIERS: { name: string; formats: string[] }[] = [
  { name: "Glow-in-the-Dark", formats: ["12_lp", "12_double"] },
  { name: "3-Color Split", formats: ["12_lp", "12_double"] },
  { name: "Picture Disc", formats: ["12_lp", "12_double", "7_inch"] },
];

// Splatter surcharge (sheet: +$0.75 @300, +$0.55 @500+, standard/burst/dot).
export const SPLATTER_SURCHARGE: { qty: number; amountCents: number }[] = [
  { qty: 300, amountCents: 75 },
  { qty: 500, amountCents: 55 },
];

// Printed jacket per-unit dollars by qty index (4/0 CMYK, Standard AQ Gloss).
const JACKET_LADDERS: Record<string, number[]> = {
  single12: [2.0709428571428572, 1.2425714285714287, 0.8147428571428572, 0.6456428571428572, 0.6082, 0.5435142857142857, 0.5174142857142857, 0.4924428571428572],
  widespine12: [2.591071428571429, 1.5546428571428572, 1.1268142857142858, 0.9577285714285714, 0.9202714285714287, 0.8555857142857144, 0.8294857142857144, 0.8045285714285714],
  gatefold12: [5.966157142857143, 3.5797, 2.3098285714285716, 1.4587142857142856, 1.3146, 1.1648, 1.0672, 1.0025142857142859],
  trifold12: [8.957142857142857, 5.373457142857143, 3.4226857142857146, 2.367314285714286, 2.041614285714286, 1.7181857142857144, 1.5014428571428573, 1.3505142857142858],
  single7: [1.2142857142857144, 0.7857142857142858, 0.5428571428571429, 0.5, 0.4571428571428572, 0.4, 0.4, 0.4],
};

export const INSERTION_CENTS = 12; // $0.12 per item inserted

// Map an MRP jacket name to its print ladder for a given format. Null =
// jacket has no Tier-3 price (Old-Style Tip-Ons) → combo left untouched.
export function jacketLadderKey(jacketName: string, format: string): string | null {
  const n = jacketName.toLowerCase();
  if (n.includes("tip-on") || n.includes("tip on")) return null;
  if (format === "7_inch") {
    // 7" gatefold/trifold prices exist on the sheet but those jackets are
    // scoped to 12" formats in MRP's catalog; the 7" default is the single.
    if (n.includes("single")) return "single7";
    return null;
  }
  if (n.includes("widespine") || n.includes("wide-spine") || n.includes("wide spine")) return "widespine12";
  if (n.includes("tri-fold") || n.includes("trifold")) return "trifold12";
  if (n.includes("gatefold")) return "gatefold12";
  if (n.includes("single")) return "single12";
  return null;
}

/** All-in per-unit cents for one qty rung of a tier×jacket combo. */
export function composeUnitCents(args: {
  format: string; // 12_lp | 12_double | 7_inch
  bookKey: keyof typeof RECORD_BOOKS;
  jacketName: string;
  heavyweight: boolean; // price the 180 g book?
  qty: number;
}): number | null {
  const book = RECORD_BOOKS[args.bookKey];
  if (!book) return null;
  const qi = QTYS.indexOf(args.qty as (typeof QTYS)[number]);
  if (qi === -1) return null;
  const series = args.format === "7_inch" ? book.g49 : args.heavyweight ? book.g180 : book.g140;
  if (!series) return null;
  const jKey = jacketLadderKey(args.jacketName, args.format);
  if (!jKey) return null;
  const records = args.format === "12_double" ? 2 : 1;
  return c(series[qi]) * records + c(JACKET_LADDERS[jKey][qi]) + INSERTION_CENTS * records;
}

function overwritable(r: Rung | undefined): boolean {
  if (!r) return true;
  if (r.source && OWN_SOURCES.has(r.source)) return true;
  if (r.lockedFromSync) return false;
  return !r.confirmed;
}

/** Merge Tier 3 pricing into an existing ladder without clobbering
 *  operator-confirmed rungs. Returns null when nothing changed. */
export function mergeLadder(
  existing: Rung[] | null | undefined,
  unitCentsForQty: (qty: number) => number | null,
  syncedAt: string,
): Rung[] | null {
  let ladder: Rung[] = Array.isArray(existing) ? existing.map((r) => ({ ...r })) : [];
  let changed = false;
  // Drop stale script-seeded estimate rungs at qtys off the Tier 3 grid
  // (old 100/200/… placeholder grid) so quotes can't snap to bogus prices.
  const before = ladder.length;
  ladder = ladder.filter(
    (r) => !(r.source && OWN_SOURCES.has(r.source) && !QTYS.includes(Number(r.qty) as any)),
  );
  if (ladder.length !== before) changed = true;
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

    const [mrp] = await db
      .select()
      .from(manufacturers)
      .where(sql`${manufacturers.name} ILIKE '%memphis%'`);
    if (!mrp) throw new Error("Memphis Record Pressing manufacturer not found — FATAL, not stamping.");
    const [viryl] = await db
      .select()
      .from(manufacturers)
      .where(sql`${manufacturers.domain} ILIKE '%viryl%' OR ${manufacturers.name} ILIKE '%viryl%'`);
    console.log(`MRP press: ${mrp.id} (${mrp.name}); Viryl: ${viryl?.id ?? "absent"}`);

    const syncedAt = new Date().toISOString();

    // ── Named price lists (backfill both presses; idempotent by unique) ──
    if (!DRY) {
      await db
        .insert(pressPriceLists)
        .values({ pressId: mrp.id, label: PRICE_LIST_LABEL_MRP, effectiveDate: "2025-09-01", source: SOURCE })
        .onConflictDoNothing();
      if (viryl) {
        await db
          .insert(pressPriceLists)
          .values({ pressId: viryl.id, label: PRICE_LIST_LABEL_VIRYL, effectiveDate: "2026-07-01", source: "viryl-2026-price-list" })
          .onConflictDoNothing();
      }
      console.log("price lists ensured.");
    }

    let tiers = await db.select().from(pressColorTiers).where(eq(pressColorTiers.pressId, mrp.id));
    const jackets = await db.select().from(pressJackets).where(eq(pressJackets.pressId, mrp.id));

    // ── Mint new tiers (Glow-in-the-Dark / 3-Color Split / Picture Disc) ──
    for (const nt of NEW_TIERS) {
      for (const format of nt.formats) {
        const exists = tiers.find((t) => t.format === format && t.name === nt.name);
        if (exists) continue;
        const position = Math.max(0, ...tiers.filter((t) => t.format === format).map((t) => t.position)) + 1;
        console.log(`  + new tier '${nt.name}' (${format})`);
        if (!DRY) {
          const [row] = await db
            .insert(pressColorTiers)
            .values({ pressId: mrp.id, format, name: nt.name, position, priceLadder: [] } as any)
            .returning();
          tiers = [...tiers, row];
        }
      }
    }

    // ── Splatter → surcharge mode (base = same-format Opaque) ────────────
    for (const t of tiers) {
      if (t.name !== "Splatter") continue;
      const base = tiers.find((x) => x.format === t.format && x.name === "Opaque");
      if (!base) {
        console.log(`  ! no Opaque base tier for Splatter (${t.format}) — left as priced`);
        continue;
      }
      console.log(`  Splatter (${t.format}) → surcharge over '${base.name}'`);
      if (!DRY) {
        await db
          .update(pressColorTiers)
          .set({
            pricingMode: "surcharge",
            surchargeBaseTierId: base.id,
            surchargeLadder: SPLATTER_SURCHARGE,
          } as any)
          .where(eq(pressColorTiers.id, t.id));
      }
    }

    // ── Tier×jacket all-in ladders ───────────────────────────────────────
    let laddersTouched = 0;
    for (const tier of tiers) {
      if (tier.name === "Splatter") continue; // surcharge tier — no own ladder
      const bookKey = TIER_BOOK[tier.name];
      if (!bookKey) {
        console.log(`  skip tier '${tier.name}' (${tier.format}) — no Tier 3 price mapping`);
        continue;
      }
      // Eco-Mix is 12"-only on the sheet.
      if (bookKey === "ecoMix" && tier.format === "7_inch") continue;
      const applicable = jackets.filter(
        (j) => !j.applicableFormats || (j.applicableFormats as string[]).includes(tier.format),
      );
      for (const jacket of applicable) {
        if (!jacketLadderKey(jacket.name, tier.format)) continue; // unpriced jacket
        let [row] = await db
          .select()
          .from(pressTierJacketLadders)
          .where(
            and(eq(pressTierJacketLadders.tierId, tier.id), eq(pressTierJacketLadders.jacketId, jacket.id)),
          );
        if (!row && !DRY) {
          [row] = await db
            .insert(pressTierJacketLadders)
            .values({ tierId: tier.id, jacketId: jacket.id, priceLadder: [] } as any)
            .returning();
        }
        const price = (heavyweight: boolean) => (qty: number) =>
          composeUnitCents({ format: tier.format, bookKey, jacketName: jacket.name, heavyweight, qty });
        const patch: Record<string, unknown> = {};
        const main = mergeLadder((row?.priceLadder as Rung[]) ?? [], price(false), syncedAt);
        if (main) patch.priceLadder = main;
        if (tier.format !== "7_inch") {
          const heavy = mergeLadder(((row as any)?.priceLadder180 as Rung[]) ?? [], price(true), syncedAt);
          if (heavy) patch.priceLadder180 = heavy;
        }
        if (Object.keys(patch).length === 0) continue;
        laddersTouched++;
        console.log(
          `  ${tier.format.padEnd(10)} ${tier.name.padEnd(18)} jacket=${jacket.name.slice(0, 32).padEnd(32)}` +
            ` main@300=${(patch.priceLadder as Rung[] | undefined)?.find((r) => r.qty === 300)?.unitCents ?? "kept"}`,
        );
        if (!DRY && row) {
          await db.update(pressTierJacketLadders).set(patch).where(eq(pressTierJacketLadders.id, row.id));
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
if (process.argv[1] && /load-mrp-tier3-pricing/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
