/**
 * Task #3226 — Seed Memphis Record Pressing's Setup & Services line items
 * AND the per-press print-component price ladders from the Tier 3 sheet.
 *
 * Source of truth:
 *   attached_assets/GoodTunes___GoGoods-Tier3_1787269499765.xlsx
 *   (TIER 3 PRICING, effective 09.01.2025.) VISIBLE ROWS ONLY.
 *
 * Two payloads:
 *   1. press_service_items — MRP-scoped one-time / per-order rows
 *      (metalwork, test pressings, setup fees, stamper surcharges, centre
 *      labels, inner sleeves, packaging & assembly, bar codes, UPC/PMS
 *      stickers). Qty-conditional stamper rungs are captured in notes —
 *      the item model is flat by design.
 *   2. press_components componentKey='pricing' — full quantity-break
 *      ladders for print components (printed sleeves, single/wide-spine/
 *      gatefold/trifold jackets, inserts, download cards, finish
 *      surcharges, sticker permutation grids VERBATIM — MRP will simplify
 *      the sticker options later). Stored under config.componentLadders
 *      so the follow-up component→price association task has real data.
 *
 * Idempotent: marker-guarded (mrp_services_tier3_v1) AND per-item guarded
 * on (pressId, category, label); the component blob is written under its
 * own namespaced key without touching the rest of the pricing config.
 *
 * Dev:  npx tsx scripts/seed-mrp-services-tier3.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-mrp-services-tier3.ts
 * Dry:  add --dry
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  manufacturers,
  pressComponents,
  pressServiceItems,
  type PressServiceCategory,
  type PressServiceUnitBasis,
} from "../shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "mrp_services_tier3_v1";
export const SOURCE = "mrp-tier3-2025";
export const QTYS = [300, 500, 1000, 2000, 3000, 5000, 10000, 25000] as const;

const c = (dollars: number) => Math.round(dollars * 100);

type Item = {
  category: PressServiceCategory;
  label: string;
  amountCents: number;
  unitBasis: PressServiceUnitBasis;
  note?: string;
};

export const ITEMS: Item[] = [
  // ── Metalwork ──────────────────────────────────────────────────────
  { category: "metalwork", label: '12"/10" DMM Cutting', amountCents: 40000, unitBasis: "per_side" },
  { category: "metalwork", label: '12"/10" DMM Plating', amountCents: 30000, unitBasis: "per_side" },
  { category: "metalwork", label: '7" DMM Cutting', amountCents: 29000, unitBasis: "per_side" },
  { category: "metalwork", label: '7" DMM Plating', amountCents: 16000, unitBasis: "per_side" },
  // ── Test Pressings ─────────────────────────────────────────────────
  { category: "test_pressings", label: "Test Pressings (5 units)", amountCents: 12500, unitBasis: "per_order" },
  {
    category: "test_pressings",
    label: "2-Day Shipping of 5 TPs (US destination)",
    amountCents: 5000,
    unitBasis: "per_order",
    note: "Int'l shipping requires additional charges",
  },
  // ── Setup Fees ─────────────────────────────────────────────────────
  {
    category: "setup_fees",
    label: "Press Setup (orders under 500 units)",
    amountCents: 9500,
    unitBasis: "per_order",
    note: "Applies to runs of less than 500 units",
  },
  {
    category: "setup_fees",
    label: "Press Setup — Color Vinyl (per color)",
    amountCents: 9500,
    unitBasis: "per_order",
    note: "Multi-color LPs subject to 1x/2x/3x setups",
  },
  {
    category: "setup_fees",
    label: "Setup — Splatter Records (per color)",
    amountCents: 5000,
    unitBasis: "per_order",
  },
  // ── Surcharges (stamper fees; qty-conditional rungs live in notes) ──
  {
    category: "surcharges",
    label: '12"/10" Stamper Fee — 140g',
    amountCents: 14,
    unitBasis: "per_record",
    note: "For all qtys on reorders AND all records over the initial 1K ($0 at 300/500 on first runs)",
  },
  {
    category: "surcharges",
    label: '12"/10" Stamper Fee — 180g',
    amountCents: 24,
    unitBasis: "per_record",
    note: "For all qtys on reorders AND all records over the initial 500 ($0 at 300 on first runs)",
  },
  {
    category: "surcharges",
    label: '12"/10" Stamper Fee — Picture Discs / Glitter / Special (Manual) Effects',
    amountCents: 24,
    unitBasis: "per_record",
    note: "Applies to all qtys",
  },
  { category: "surcharges", label: '7" Stamper Fee', amountCents: 15, unitBasis: "per_record" },
  // ── Centre Labels (per pair; ladder captured in note) ──────────────
  {
    category: "centre_labels",
    label: "Center Labels — B&W",
    amountCents: 60,
    unitBasis: "per_pair",
    note: "Ladder: $0.60 @300 · $0.37 @500 · $0.20 @1K · $0.18 @2K/3K · $0.17 @5K · $0.16 @10K · $0.15 @25K",
  },
  {
    category: "centre_labels",
    label: "Center Labels — CMYK / Full-Color",
    amountCents: 74,
    unitBasis: "per_pair",
    note: "Ladder: $0.74 @300 · $0.51 @500 · $0.25 @1K · $0.23 @2K · $0.22 @3K · $0.21 @5K · $0.18 @10K · $0.17 @25K",
  },
  // ── Inner Sleeves ──────────────────────────────────────────────────
  {
    category: "inner_sleeves",
    label: '12"/10" Poly-Lined White Inner Sleeve',
    amountCents: 0,
    unitBasis: "per_unit",
    note: "Included in pressing price",
  },
  { category: "inner_sleeves", label: '12"/10" Black Paper Inner Sleeve', amountCents: 10, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: '12"/10" Poly-Lined Black Inner Sleeve', amountCents: 15, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: '12" Anti-Static Clear Inner Sleeve (3 mil)', amountCents: 20, unitBasis: "per_unit" },
  { category: "inner_sleeves", label: '12" Rice Paper Inner Sleeve', amountCents: 25, unitBasis: "per_unit" },
  {
    category: "inner_sleeves",
    label: '7" White Paper Inner Sleeve',
    amountCents: 0,
    unitBasis: "per_unit",
    note: "Included in pressing price",
  },
  { category: "inner_sleeves", label: '7" Black Paper Inner Sleeve', amountCents: 20, unitBasis: "per_unit" },
  // ── Packaging & Assembly ───────────────────────────────────────────
  {
    category: "packaging_assembly",
    label: "Insertion (per item assembled)",
    amountCents: 12,
    unitBasis: "per_unit",
    note: "LP > supplied sleeve, sleeve > jacket, insert > jacket, DL card, etc. Six-item max $0.24",
  },
  {
    category: "packaging_assembly",
    label: "Sticker Application — standard location",
    amountCents: 10,
    unitBasis: "per_unit",
    note: 'For standard stickers < 16 sq/in.',
  },
  { category: "packaging_assembly", label: "Shrink-Wrap (standard product)", amountCents: 17, unitBasis: "per_unit" },
  {
    category: "packaging_assembly",
    label: '12"/10" 3.0 mil Open-Top Poly-Bag',
    amountCents: 25,
    unitBasis: "per_unit",
    note: "Requires insertion fee",
  },
  {
    category: "packaging_assembly",
    label: '12"/10" 3.0 mil Resealable Poly-Bag',
    amountCents: 35,
    unitBasis: "per_unit",
    note: "Requires insertion fee",
  },
  {
    category: "packaging_assembly",
    label: '12"/10" Deluxe PVC Sleeve with Flap',
    amountCents: 101,
    unitBasis: "per_unit",
    note: "Requires insertion fee ($1.0125)",
  },
  {
    category: "packaging_assembly",
    label: '7" Open-Top Poly-Bag',
    amountCents: 10,
    unitBasis: "per_unit",
    note: "Requires insertion fee",
  },
  {
    category: "packaging_assembly",
    label: '7" Deluxe PVC Sleeve with Flap',
    amountCents: 51,
    unitBasis: "per_unit",
    note: "Requires insertion fee ($0.5125)",
  },
  // ── Stickers / bar codes ───────────────────────────────────────────
  { category: "stickers", label: "Bar Codes (Generation)", amountCents: 3500, unitBasis: "per_order" },
  {
    category: "stickers",
    label: 'UPC Sticker (1.75" x .75" or 2.25" x 1.25", 1-color black, white stock)',
    amountCents: 5,
    unitBasis: "per_unit",
  },
  {
    category: "stickers",
    label: "PMS Colors (per color, up to 4, for standard stickers)",
    amountCents: 5000,
    unitBasis: "per_order",
  },
];

const LEGACY_DMM_LABELS = [
  '12"/10" Master Cutting',
  '12"/10" Master Plating',
  '7" Master Cutting',
  '7" Master Plating',
] as const;

// ── Print-component ladders (full 8-rung quantity breaks) ─────────────
type ComponentItem = { label: string; unitCents: number[]; note?: string };
type ComponentGroup = { key: string; label: string; items: ComponentItem[] };

const L = (dollars: number[]) => dollars.map(c);

export const COMPONENT_GROUPS: ComponentGroup[] = [
  {
    key: "printed_sleeves",
    label: "Printed Sleeves",
    items: [
      { label: '12"/10" Paper Sleeve / 100# coated or 70# offset (uncoated) / 1/0 (Black)', unitCents: L([1.2142571428571429, 0.728557142857143, 0.4448571428571429, 0.3302285714285715, 0.29505714285714285, 0.25532857142857146, 0.23037142857142856, 0.23037142857142856]) },
      { label: '12"/10" Paper Sleeve / 100# coated or 70# offset (uncoated) / 4/0 (CMYK)', unitCents: L([2.443642857142857, 1.4661857142857144, 0.8136714285714286, 0.5469857142857143, 0.48684285714285713, 0.39605714285714285, 0.34918571428571434, 0.34918571428571434]) },
      { label: '12"/10" Board (Euro) Sleeve / 12pt board / 1/0 (Black)', unitCents: L([1.8288428571428572, 1.0973142857142859, 0.6751571428571429, 0.5242285714285715, 0.5049285714285714, 0.47882857142857144, 0.46181428571428573, 0.46181428571428573]) },
      { label: '12"/10" Board (Euro) Sleeve / 12pt board / 4/0 (CMYK)', unitCents: L([2.328171428571429, 1.3969, 1.1188714285714285, 0.6944428571428571, 0.6604000000000001, 0.5945857142857144, 0.5389714285714287, 0.5389714285714287]) },
      { label: '7" / 100# coated or 80# offset (uncoated) / 1/0 (Black)', unitCents: L([0.8428571428571429, 0.5428571428571429, 0.4285714285714286, 0.35714285714285715, 0.3, 0.3, 0.28571428571428575, 0.28571428571428575]) },
      { label: '7" / 100# coated or #80 offset (uncoated) / 4/0 (CMYK)', unitCents: L([0.9714285714285715, 0.6285714285714287, 0.5142857142857143, 0.4285714285714286, 0.37142857142857144, 0.34285714285714286, 0.3285714285714286, 0.3285714285714286]) },
    ],
  },
  {
    key: "single_jackets",
    label: "Printed Single Jackets — Standard AQ Gloss",
    items: [
      { label: '12"/10" / 20pt Board / 1/0 (Black)', unitCents: L([1.6321428571428573, 0.9792857142857143, 0.6467857142857143, 0.5026571428571429, 0.48450000000000004, 0.4595428571428572, 0.4436571428571429, 0.4323]) },
      { label: '12"/10" / 20pt Board / 4/0 (CMYK)', unitCents: L([2.0709428571428572, 1.2425714285714287, 0.8147428571428572, 0.6456428571428572, 0.6082, 0.5435142857142857, 0.5174142857142857, 0.4924428571428572]) },
      { label: '12"/10" / 20pt Board / wide spine (5mm or 7mm) / 1/0 (Black)', unitCents: L([2.152271428571429, 1.291357142857143, 0.958857142857143, 0.8147428571428572, 0.7965857142857145, 0.7716142857142858, 0.7557285714285714, 0.7443714285714286]) },
      { label: '12"/10" / 20pt Board / wide spine (5mm or 7mm) / 4/0 (CMYK)', unitCents: L([2.591071428571429, 1.5546428571428572, 1.1268142857142858, 0.9577285714285714, 0.9202714285714287, 0.8555857142857144, 0.8294857142857144, 0.8045285714285714]) },
      { label: '7" jacket / 12pt Board / 1/0 (Black)', unitCents: L([1.0142857142857142, 0.7000000000000001, 0.5, 0.4285714285714286, 0.4000000000000001, 0.3857142857142858, 0.37142857142857144, 0.37142857142857144]) },
      { label: '7" jacket / 12pt Board / 4/0 (CMYK)', unitCents: L([1.2142857142857144, 0.7857142857142858, 0.5428571428571429, 0.5, 0.4571428571428572, 0.4000000000000001, 0.4000000000000001, 0.4000000000000001]) },
    ],
  },
  {
    key: "gatefold_jackets",
    label: "Printed Gatefold Jackets — Standard AQ Gloss",
    items: [
      { label: '12"/10" / 20pt Board / 1/0 (Black)', unitCents: L([5.966157142857143, 3.5797, 2.3098285714285716, 1.4587142857142856, 1.3146, 1.1648, 1.0672, 1.0025142857142859]) },
      { label: '12"/10" / 20pt Board / 4/0 (CMYK)', unitCents: L([5.966157142857143, 3.5797, 2.3098285714285716, 1.4587142857142856, 1.3146, 1.1648, 1.0672, 1.0025142857142859]) },
      { label: '7" / 20pt Board / 1/0 (Black)', unitCents: L([2.857142857142857, 1.657142857142857, 1.3714285714285714, 1.2571428571428573, 1.1142857142857143, 1.0857142857142859, 1.0428571428571429, 1.0428571428571429]) },
      { label: '7" / 20pt Board / 4/0 (CMYK)', unitCents: L([3.4571428571428573, 1.842857142857143, 1.4571428571428573, 1.3, 1.142857142857143, 1.0857142857142859, 1.0571428571428572, 1.0571428571428572]) },
    ],
  },
  {
    key: "trifold_jackets",
    label: "Printed Trifold Jackets — Standard AQ Gloss",
    items: [
      { label: '12"/10" / 20pt Board / 4/0 (CMYK) (INSIDE SPINES/GUTTERS DO NOT PRINT!)', unitCents: L([8.957142857142857, 5.373457142857143, 3.4226857142857146, 2.367314285714286, 2.041614285714286, 1.7181857142857144, 1.5014428571428573, 1.3505142857142858]) },
      { label: '7" / 20pt Board / 4/0 (CMYK / 0) (INSIDE SPINES/GUTTERS DO NOT PRINT!)', unitCents: L([4.185714285714286, 2.285714285714286, 1.842857142857143, 1.7714285714285716, 1.4714285714285715, 1.4000000000000001, 1.3571428571428572, 1.3571428571428572]) },
    ],
  },
  {
    key: "inserts",
    label: "Inserts — 100# gloss text or 70# uncoated offset",
    items: [
      { label: '12" x 12" 1/0 K', unitCents: L([0.5571428571428572, 0.3285714285714286, 0.25714285714285717, 0.2285714285714286, 0.2142857142857143, 0.20000000000000004, 0.18571428571428572, 0.18571428571428572]) },
      { label: '12" x 12" 1/1 K/K', unitCents: L([0.8571428571428572, 0.5142857142857143, 0.34285714285714286, 0.27142857142857146, 0.25714285714285717, 0.2285714285714286, 0.2285714285714286, 0.2285714285714286]) },
      { label: '12" x 12" 4/0 CMYK', unitCents: L([1.6142857142857143, 0.9714285714285715, 0.5428571428571429, 0.35714285714285715, 0.27142857142857146, 0.2285714285714286, 0.2285714285714286, 0.2285714285714286]) },
      { label: '12" x 12" 4/4 CMYK', unitCents: L([2.5142857142857147, 1.5142857142857145, 0.8285714285714285, 0.5714285714285715, 0.4428571428571429, 0.3285714285714286, 0.25714285714285717, 0.25714285714285717]) },
      { label: "Add'l cost to upgrade to 100# (12pt) gloss/uncoated board (single inserts only)", unitCents: L([0.25714285714285717, 0.25714285714285717, 0.12857142857142859, 0.12857142857142859, 0.12857142857142859, 0.12857142857142859, 0.12857142857142859, 0.12857142857142859]) },
      { label: '24" x 12" (Gatefold Insert) 1/1 K', unitCents: L([1.6142857142857143, 0.9714285714285715, 0.5714285714285715, 0.5571428571428572, 0.4428571428571429, 0.4000000000000001, 0.4000000000000001, 0.4000000000000001]) },
      { label: '24" x 12" (Gatefold Insert) 4/4 CMYK/CMYK', unitCents: L([3.257142857142857, 1.9571428571428575, 1.1571428571428573, 0.942857142857143, 0.7285714285714286, 0.5285714285714286, 0.48571428571428577, 0.48571428571428577]) },
      { label: '7" x 7" 1/1 K/K', unitCents: L([0.3857142857142858, 0.27142857142857146, 0.2142857142857143, 0.18571428571428572, 0.17142857142857143, 0.15714285714285717, 0.15714285714285717, 0.15714285714285717]) },
      { label: '7" x 7" 4/0 CMYK', unitCents: L([0.37142857142857144, 0.27142857142857146, 0.2142857142857143, 0.18571428571428572, 0.17142857142857143, 0.17142857142857143, 0.17142857142857143, 0.17142857142857143]) },
      { label: '7" x 7" 4/4 CMYK', unitCents: L([0.48571428571428577, 0.34285714285714286, 0.27142857142857146, 0.2285714285714286, 0.2142857142857143, 0.2142857142857143, 0.20000000000000004, 0.20000000000000004]) },
      { label: '14" x 7" (Gatefold) 1/1 K/K', unitCents: L([1.0285714285714287, 0.6142857142857143, 0.4000000000000001, 0.3, 0.25714285714285717, 0.2285714285714286, 0.20000000000000004, 0.20000000000000004]) },
      { label: '14" x 7" (Gatefold) 4/0 CMYK', unitCents: L([1.2857142857142858, 0.7285714285714286, 0.4428571428571429, 0.3, 0.25714285714285717, 0.2285714285714286, 0.18571428571428572, 0.18571428571428572]) },
      { label: '14" x 7" (Gatefold) 4/4 CMYK', unitCents: L([2.3000000000000003, 1.2428571428571429, 0.7142857142857143, 0.4571428571428572, 0.35714285714285715, 0.3, 0.24285714285714288, 0.24285714285714288]) },
    ],
  },
  {
    key: "download_cards",
    label: 'Download Cards — 2" x 3-1/2" / up to 3.5"x3.5" (includes MRP hosting + code generation)',
    items: [
      { label: 'Generic MRP-BRANDED download cards, no custom art (B&W, 3.5"x2", 100# Uncoated Cover)', unitCents: L([0.28000000000000003, 0.23, 0.18, 0.14, 0.12, 0.09, 0.08, 0.08]) },
      { label: "Custom Art - 1/0 K", unitCents: L([0.33, 0.28000000000000003, 0.24, 0.19, 0.17, 0.15, 0.13, 0.13]) },
      { label: "Custom Art - 4/0 CMYK", unitCents: L([0.41, 0.34, 0.29, 0.24, 0.21, 0.19, 0.15, 0.15]) },
    ],
  },
  {
    key: "finish_surcharges",
    label: "Other Print Options (surcharges to prices above)",
    items: [
      { label: '12" / AQ Matte / AQ Satin / UV Matte/High Gloss / Jacket or Sleeve (2x for gatefold, 3x trifold)', unitCents: L([0.25, 0.15, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07]) },
      { label: '7" / Matte AQ on 7" inner paper/board sleeve, single jacket (2x for gatefold or trifold)', unitCents: L([0.1, 0.1, 0.08, 0.07, 0.06, 0.06, 0.06, 0.06]) },
      { label: '7" / Gloss UV on 7" inner paper/board sleeve, single jacket (2x for gatefold or trifold)', unitCents: L([0.25, 0.12, 0.1, 0.1, 0.08, 0.08, 0.08, 0.08]) },
    ],
  },
  // Sticker permutation grids loaded VERBATIM from visible rows only — no
  // simplification attempted (MRP will simplify after their Monday call).
  {
    key: "stickers_1color_circles",
    label: "Stickers — 1-Color Circles",
    items: [
      { label: 'Circle (1"-2") / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.4307692307692308, 0.26153846153846155, 0.16923076923076921, 0.13846153846153844, 0.1076923076923077, 0.0923076923076923, 0.06153846153846154, 0.06153846153846154]) },
      { label: 'Circle (2-1/4"-3") / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.5076923076923077, 0.3076923076923077, 0.2, 0.15384615384615385, 0.13846153846153844, 0.12307692307692307, 0.0923076923076923, 0.0923076923076923]) },
      { label: 'Circle (3-1/4"-4") / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.6, 0.3692307692307692, 0.23076923076923075, 0.1846153846153846, 0.15384615384615385, 0.13846153846153844, 0.1076923076923077, 0.1076923076923077]) },
      { label: 'Circle (1"-2") / 1-Color (Black) / Clear/Transparent Sticker Stock', unitCents: L([0.5692307692307692, 0.33846153846153842, 0.2153846153846154, 0.16923076923076921, 0.13846153846153844, 0.1076923076923077, 0.07692307692307693, 0.07692307692307693]) },
      { label: 'Circle (2-1/4"-3") / 1-Color (Black) / Clear/Transparent Sticker Stock', unitCents: L([0.6615384615384615, 0.4, 0.24615384615384614, 0.2, 0.1846153846153846, 0.15384615384615385, 0.1076923076923077, 0.1076923076923077]) },
      { label: 'Circle (3-1/4"-4") / 1-Color (Black) / Clear/Transparent Sticker Stock', unitCents: L([0.7692307692307692, 0.4615384615384615, 0.29230769230769232, 0.23076923076923075, 0.2, 0.16923076923076921, 0.13846153846153844, 0.13846153846153844]) },
    ],
  },
  {
    key: "stickers_1color_rectangles",
    label: "Stickers — 1-Color Rectangles (rounded-corner die-cut + square-corner)",
    items: [
      { label: 'Rectangle (up to 3 sq/in.) / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.6938461538461539, 0.4215384615384616, 0.26, 0.19230769230769229, 0.15384615384615385, 0.1076923076923077, 0.07384615384615384, 0.07384615384615384]) },
      { label: 'Rectangle (3.1 to 6 sq/in.) / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.7415384615384615, 0.4507692307692307, 0.27846153846153843, 0.20461538461538462, 0.1646153846153846, 0.11538461538461538, 0.08153846153846153, 0.08153846153846153]) },
      { label: 'Rectangle (6.1 to 9 sq/in.) / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.7892307692307692, 0.48, 0.29538461538461536, 0.21999999999999997, 0.17692307692307693, 0.13384615384615384, 0.09846153846153846, 0.09846153846153846]) },
      { label: 'Rectangle (9.1 to 12 sq/in.) / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.8353846153846154, 0.5076923076923077, 0.31384615384615383, 0.23384615384615384, 0.18923076923076923, 0.14769230769230768, 0.11076923076923076, 0.11076923076923076]) },
      { label: 'Rectangle (12.1 to 16 sq/in.) / 1-Color (Black) / White, Silver or Gold Foil Paper Stocks', unitCents: L([0.8876923076923076, 0.5384615384615384, 0.3323076923076923, 0.2523076923076923, 0.20307692307692307, 0.15846153846153846, 0.12923076923076923, 0.12923076923076923]) },
      { label: 'Rectangle (up to 3 sq/in.) / 1-Color (Black) / Clear/Transparent Sticker Stock', unitCents: L([0.8969230769230768, 0.5446153846153846, 0.33384615384615385, 0.24615384615384614, 0.19692307692307692, 0.13384615384615384, 0.0923076923076923, 0.0923076923076923]) },
      { label: 'Rectangle (3.1 to 6 sq/in.) / 1-Color (Black) / Clear/Transparent Sticker Stock', unitCents: L([0.96, 0.5815384615384616, 0.35692307692307695, 0.26, 0.20923076923076925, 0.14615384615384616, 0.10153846153846154, 0.10153846153846154]) },
      { label: 'Rectangle (6.1 to 9 sq/in.) / 1-Color (Black) / Clear/Transparent Sticker Stock', unitCents: L([1.0215384615384615, 0.62, 0.38, 0.28153846153846152, 0.22615384615384612, 0.16923076923076921, 0.12307692307692307, 0.12307692307692307]) },
    ],
  },
  {
    key: "stickers_fullcolor_circles",
    label: "Stickers — Full-Color (CMYK) Circles",
    items: [
      { label: 'Circle (1", 1.25", 1.5", 1.75", 2", 2.25") / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.2461538461538462, 0.7538461538461538, 0.49230769230769228, 0.26153846153846155, 0.2153846153846154, 0.16923076923076921, 0.12307692307692307, 0.12307692307692307]) },
      { label: 'Circle (2-1/2") / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.4461538461538461, 0.8769230769230768, 0.5692307692307692, 0.3692307692307692, 0.29230769230769232, 0.2, 0.12307692307692307, 0.12307692307692307]) },
      { label: 'Circle (3-1/4"-4") / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.8615384615384614, 1.123076923076923, 0.7230769230769231, 0.4461538461538461, 0.33846153846153842, 0.24615384615384614, 0.15384615384615385, 0.15384615384615385]) },
    ],
  },
  {
    key: "stickers_fullcolor_rectangles",
    label: "Stickers — Full-Color (CMYK) Rectangles (die-cut rounded / square-cut / custom shapes, no die/setup charges)",
    items: [
      { label: 'Rectangle (up to 5 sq/in.) / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.2461538461538462, 0.7538461538461538, 0.49230769230769228, 0.26153846153846155, 0.2153846153846154, 0.15384615384615385, 0.12307692307692307, 0.12307692307692307]) },
      { label: 'Rectangle (5.1 to 7 sq/in.) / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.4461538461538461, 0.8769230769230768, 0.5692307692307692, 0.3692307692307692, 0.29230769230769232, 0.2, 0.12307692307692307, 0.12307692307692307]) },
      { label: 'Rectangle (7.1 to 9 sq/in.) / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.5538461538461539, 0.9384615384615385, 0.6153846153846154, 0.4, 0.3076923076923077, 0.2, 0.13846153846153844, 0.13846153846153844]) },
      { label: 'Rectangle (9.1 to 18 sq/in.) / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.8615384615384614, 1.123076923076923, 0.7230769230769231, 0.4461538461538461, 0.33846153846153842, 0.23076923076923075, 0.15384615384615385, 0.15384615384615385]) },
      { label: 'Rectangle (18.1 to 20 sq/in.) / Full-Color (CMYK) / White or Clear Stock / Gloss Lam.', unitCents: L([1.9538461538461538, 1.1692307692307693, 0.7692307692307692, 0.4769230769230769, 0.35384615384615387, 0.24615384615384614, 0.16923076923076921, 0.16923076923076921]) },
    ],
  },
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

    const [press] = await db
      .select()
      .from(manufacturers)
      .where(
        and(
          eq(manufacturers.name, "Memphis Record Pressing"),
          eq(manufacturers.domain, "memphisrecordpressing.com"),
        ),
      )
      .limit(1);
    if (!press) throw new Error("Canonical Memphis Record Pressing manufacturer not found — FATAL, not stamping.");
    console.log(`MRP press: ${press.id} (${press.name})`);

    // An existing/partial legacy seed must be reconciled transactionally by
    // update-mrp-tier3-2-dmm-labels.ts before this seed can insert anything.
    const legacyRows = await db
      .select({ label: pressServiceItems.label })
      .from(pressServiceItems)
      .where(
        and(
          eq(pressServiceItems.pressId, press.id),
          inArray(pressServiceItems.label, [...LEGACY_DMM_LABELS]),
          isNull(pressServiceItems.archivedAt),
        ),
      );
    if (legacyRows.length > 0) {
      throw new Error(
        `Legacy MRP metalwork labels require transactional reconciliation first: ${legacyRows.map((r) => r.label).join(", ")}`,
      );
    }

    // ── Service items (per-item guard on pressId+category+label) ────────
    let inserted = 0;
    let position = 0;
    for (const item of ITEMS) {
      position += 1;
      const [existing] = await db
        .select()
        .from(pressServiceItems)
        .where(
          and(
            eq(pressServiceItems.pressId, press.id),
            eq(pressServiceItems.category, item.category),
            eq(pressServiceItems.label, item.label),
          ),
        );
      if (existing) continue;
      inserted++;
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
    console.log(`${DRY ? "[dry] " : ""}service items inserted: ${inserted}/${ITEMS.length}`);

    // ── Component ladders → press_components 'pricing' config ──────────
    const blob = {
      source: SOURCE,
      priceList: "MRP Tier 3 — 09.01.2025",
      loadedAt: new Date().toISOString(),
      quantities: [...QTYS],
      groups: COMPONENT_GROUPS,
    };
    if (!DRY) {
      const [row] = await db
        .select()
        .from(pressComponents)
        .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")));
      if (row) {
        // Namespaced merge — never touches the rest of the pricing config.
        await db
          .update(pressComponents)
          .set({ config: sql`COALESCE(${pressComponents.config}, '{}'::jsonb) || jsonb_build_object('componentLadders', ${JSON.stringify(blob)}::jsonb)`, updatedAt: new Date() } as any)
          .where(eq(pressComponents.id, row.id));
      } else {
        await db.insert(pressComponents).values({
          pressId: press.id,
          componentKey: "pricing",
          config: { componentLadders: blob },
        } as any);
      }
      console.log(`component ladders written (${COMPONENT_GROUPS.reduce((n, g) => n + g.items.length, 0)} rows across ${COMPONENT_GROUPS.length} groups).`);
    }

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

if (process.argv[1] && /seed-mrp-services-tier3/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
