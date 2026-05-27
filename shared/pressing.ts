// Task #200 + Task #375 — Pressing-plant pricing reference matrix
// (Hellbender Vinyl).
//
// Source of truth for the per-format Cost on every vinyl SKU. Lives in
// /shared/ so the admin SellPanel can recompute Cost as the artist
// changes color/quantity/jacket picks BEFORE saving, and the server can
// re-validate + snapshot the same number on save.
//
// Color tiers mirror Hellbender's own six groups (Black / House Mix /
// Translucent / Clear / Metallic / Opaque) as published on
// hellbendervinyl.com/pages/custom-vinyl. The captured group → colors
// list lives at `.local/tasks/hellbender-color-groups.json` so the seed
// reads from one reviewable file.
//
// Pricing today covers four of the six tiers with real Hellbender
// numbers — Black, House Mix, Translucent, Clear. Metallic and Opaque
// are seeded with the Translucent ladder as a placeholder until
// Hellbender confirms; admins (or Hellbender itself, with access) can
// override the per-rung prices from the catalog editor without a code
// change.
//
// Quantity rungs follow Hellbender's current published ladder
// (50/100/300/500/1000/2000/3000). The 200 rung was retired upstream;
// 2000 and 3000 are new and seed at the 1000 price as a placeholder
// (the catalog editor lets an admin re-key the top of the ladder).
//
// Non-vinyl formats (12" double, cassette, CD) keep the placeholder
// Cost from `payout_format_costs` until we wire in real per-format
// matrices for those plants.

import type { AlbumFormat } from "./schema";

export type VinylColorTier =
  | "black"
  | "house_mix"
  | "translucent"
  | "clear"
  | "metallic"
  | "opaque";

export type JacketUpgrade =
  | "none"
  | "insert"
  | "gatefold"
  | "gatefold_insert";

// Published Hellbender quantity rungs as of May 2026. 200 was retired
// upstream; 2000 and 3000 are new. Order matters: the snap helper
// walks left-to-right and the seed materializes ladders in this order.
export const VINYL_QUANTITY_TIERS = [50, 100, 300, 500, 1000, 2000, 3000] as const;
export type VinylQuantityTier = (typeof VINYL_QUANTITY_TIERS)[number];

export const JACKET_UPGRADE_LABEL: Record<JacketUpgrade, string> = {
  none: "Standard jacket",
  insert: "+ Double-sided insert",
  gatefold: "Gatefold jacket",
  gatefold_insert: "Gatefold + insert",
};

// Tier order matches Hellbender's published page (Black → House Mix →
// Translucent → Clear → Metallic → Opaque). Seed + catalog renderer
// preserve this order.
export const VINYL_COLOR_TIER_ORDER: VinylColorTier[] = [
  "black",
  "house_mix",
  "translucent",
  "clear",
  "metallic",
  "opaque",
];

export const VINYL_COLOR_TIER_LABEL: Record<VinylColorTier, string> = {
  black: "Black",
  house_mix: "House Mix",
  translucent: "Translucent Colors",
  clear: "Clear Colors",
  metallic: "Metallic Colors",
  opaque: "Opaque Colors",
};

// Tiers whose seeded ladder is a placeholder copied from the closest
// known tier (Translucent). Admin UI annotates these so it's clear the
// per-rung prices need Hellbender confirmation.
export const VINYL_COLOR_TIER_PLACEHOLDER: Record<VinylColorTier, boolean> = {
  black: false,
  house_mix: false,
  translucent: false,
  clear: false,
  metallic: true,
  opaque: true,
};

// Each vinyl color the artist can pick. `swatch` is the CSS color we
// render in the swatch circle until real photo thumbnails are uploaded
// (`thumbnailUrl`, future). Order within each tier mirrors the
// Hellbender page (top-to-bottom in each group's swatch list).
export type VinylColorOption = {
  id: string; // stable key (snake_case)
  name: string; // display name, matches the Hellbender page
  tier: VinylColorTier;
  swatch: string; // CSS color for the placeholder circle
  thumbnailUrl?: string | null; // future: real photo of the color
};

export const VINYL_COLORS: VinylColorOption[] = [
  // Black
  { id: "black", name: "Black", tier: "black", swatch: "#0c0c0c" },
  // House Mix (random/recycled)
  { id: "house_mix", name: "House Mix", tier: "house_mix", swatch: "linear-gradient(135deg,#5b5b5b 0%,#2c2c2c 50%,#7a7a7a 100%)" },
  // Translucent Colors
  { id: "natural", name: "Natural", tier: "translucent", swatch: "#ece2c8" },
  { id: "hazy_orange", name: "Hazy Orange", tier: "translucent", swatch: "linear-gradient(135deg,#f7b06a 0%,#d97a2e 100%)" },
  { id: "seaglass_blue", name: "Seaglass Blue", tier: "translucent", swatch: "#9ec9c0" },
  { id: "violet", name: "Violet", tier: "translucent", swatch: "#7a3aa8" },
  // Clear Colors
  { id: "clear_pink", name: "Clear Pink", tier: "clear", swatch: "#f7c7d6" },
  { id: "clear_red", name: "Clear Red", tier: "clear", swatch: "#e69aa0" },
  { id: "clear_orange", name: "Clear Orange", tier: "clear", swatch: "#f6b48b" },
  { id: "clear_yellow", name: "Clear Yellow", tier: "clear", swatch: "#f4ec9c" },
  { id: "coke_bottle", name: "Coke Bottle", tier: "clear", swatch: "#5e8a72" },
  { id: "clear_green", name: "Clear Green", tier: "clear", swatch: "#9fe0b0" },
  { id: "clear_blue", name: "Clear Blue", tier: "clear", swatch: "#9fc7ef" },
  { id: "smokey_clear", name: "Smokey Clear", tier: "clear", swatch: "linear-gradient(135deg,#cfcfcf 0%,#8c8c8c 100%)" },
  { id: "ultra_clear", name: "Ultra Clear", tier: "clear", swatch: "linear-gradient(135deg,#eef3f7 0%,#cfd8df 100%)" },
  // Metallic Colors
  { id: "gold", name: "Gold", tier: "metallic", swatch: "linear-gradient(135deg,#f3d57a 0%,#b9892a 100%)" },
  { id: "silver", name: "Silver", tier: "metallic", swatch: "linear-gradient(135deg,#dfe2e6 0%,#a8aeb5 100%)" },
  // Opaque Colors
  { id: "pink", name: "Pink", tier: "opaque", swatch: "#f08fb4" },
  { id: "maroon", name: "Maroon", tier: "opaque", swatch: "#641826" },
  { id: "red", name: "Red", tier: "opaque", swatch: "#c8242b" },
  { id: "orange", name: "Orange", tier: "opaque", swatch: "#ee7726" },
  { id: "peach", name: "Peach", tier: "opaque", swatch: "#f8b58a" },
  { id: "yellow", name: "Yellow", tier: "opaque", swatch: "#f7e23a" },
  { id: "duckie_yellow", name: "Duckie Yellow", tier: "opaque", swatch: "#f6c83a" },
  { id: "lime_green", name: "Lime Green", tier: "opaque", swatch: "#a8d83a" },
  { id: "green", name: "Green", tier: "opaque", swatch: "#2c8a3a" },
  { id: "dark_green", name: "Dark Green", tier: "opaque", swatch: "#0f4c2a" },
  { id: "jade", name: "Jade", tier: "opaque", swatch: "#3aa57a" },
  { id: "sky_blue", name: "Sky Blue", tier: "opaque", swatch: "#79c8ee" },
  { id: "turquoise", name: "Turquoise", tier: "opaque", swatch: "#2bb6a8" },
  { id: "blue", name: "Blue", tier: "opaque", swatch: "#1f4ec0" },
  { id: "deep_purple", name: "Deep Purple", tier: "opaque", swatch: "#2e1346" },
  { id: "tan", name: "Tan", tier: "opaque", swatch: "#c9a878" },
  { id: "brown", name: "Brown", tier: "opaque", swatch: "#5b3a1e" },
  { id: "white", name: "White", tier: "opaque", swatch: "#f7f7f5" },
];

// Legacy SKU rows saved before Task #375 stored a handful of color ids
// that have since been renamed to match Hellbender's published group
// list. Aliased here so re-opening an old non-catalog vinyl SKU still
// renders + prices against the right swatch / tier instead of silently
// snapping to Black via DEFAULT_VINYL_COLOR_ID. Keep this list short
// and stable — only legacy ids that historically shipped go here.
const LEGACY_VINYL_COLOR_ID_ALIASES: Record<string, string> = {
  regrind_mix: "house_mix",
  coke_bottle_clear: "coke_bottle",
};

export const VINYL_COLOR_BY_ID: Record<string, VinylColorOption> = (() => {
  const map: Record<string, VinylColorOption> = Object.fromEntries(
    VINYL_COLORS.map((c) => [c.id, c]),
  );
  for (const [legacyId, currentId] of Object.entries(LEGACY_VINYL_COLOR_ID_ALIASES)) {
    const target = map[currentId];
    if (target) map[legacyId] = target;
  }
  return map;
})();

// Default picks for a fresh vinyl draft row — black, 100 units,
// standard jacket. Hellbender's cheapest mainstream entry point.
export const DEFAULT_VINYL_COLOR_ID = "black";
export const DEFAULT_VINYL_QUANTITY: VinylQuantityTier = 100;
export const DEFAULT_JACKET_UPGRADE: JacketUpgrade = "none";

// Snap an arbitrary positive integer to the next published Hellbender
// quantity tier. Anything > 3000 stays at 3000 but flips
// `requiresQuote` so the UI can surface a "3000+ — request a custom
// quote" caveat. Zero/non-numeric is treated as 50 (smallest tier).
export function snapToQuantityTier(
  input: number | null | undefined,
): { tier: VinylQuantityTier; requiresQuote: boolean } {
  const n = typeof input === "number" && Number.isFinite(input) ? Math.max(1, Math.floor(input)) : 1;
  const top = VINYL_QUANTITY_TIERS[VINYL_QUANTITY_TIERS.length - 1];
  if (n > top) return { tier: top, requiresQuote: true };
  for (const t of VINYL_QUANTITY_TIERS) {
    if (n <= t) return { tier: t, requiresQuote: false };
  }
  return { tier: top, requiresQuote: false };
}

// AlbumFormat → Hellbender size key. Only 7_inch + 12_lp are priced;
// every other format falls back to the placeholder Cost row in
// `payout_format_costs`.
export function pressingSizeForFormat(
  format: AlbumFormat,
): "7" | "12" | null {
  if (format === "7_inch") return "7";
  if (format === "12_lp") return "12";
  return null;
}

// Generated from `.local/tasks/hellbender-pricing-matrix.json` — see
// the dump script in the task notes. Cents (integer). Keyed by
// (tier, size, qtyTier, jacketUpgrade).
//
// Real Hellbender pricing is only known for Black / House Mix and the
// flat "standard color" row (which now splits into Translucent and
// Clear with the same prices). Metallic and Opaque seed with the same
// Translucent ladder as a placeholder; the catalog editor annotates
// them as "placeholder — confirm with Hellbender" so admins can
// override per-rung values without a code change.
//
// The 2000 and 3000 rungs are seeded from the 1000 row as a
// placeholder too — Hellbender publishes them as available quantities
// but we don't have public per-unit numbers, so the catalog editor
// owns the real values once they land.
type Matrix = Record<
  VinylColorTier,
  Record<
    "7" | "12",
    Record<VinylQuantityTier, Record<JacketUpgrade, number>>
  >
>;

const M = (none: number, insert: number, gatefold: number, gi: number) => ({
  none,
  insert,
  gatefold,
  gatefold_insert: gi,
});

// Real Hellbender ladders (Black, House Mix, Translucent/Clear "standard"),
// keyed by size. The 200 rung from the legacy matrix is dropped; 2000
// and 3000 are placeholders pinned to the 1000 value.
const HB_BLACK_7  = { 50: M(2166, 2306, 2594, 2732), 100: M(1235, 1343, 1429, 1536), 300: M(615, 703, 665, 753), 500: M(439, 523, 472, 556), 1000: M(333, 407, 381, 455), 2000: M(333, 407, 381, 455), 3000: M(333, 407, 381, 455) };
const HB_BLACK_12 = { 50: M(2896, 3049, 4853, 5004), 100: M(1651, 1769, 2606, 2723), 300: M(823, 918, 1236, 1331), 500: M(599, 690, 819, 910),  1000: M(442, 522, 561, 641),  2000: M(442, 522, 561, 641),  3000: M(442, 522, 561, 641) };
const HB_HOUSE_7  = { 50: M(2136, 2276, 2564, 2702), 100: M(1205, 1313, 1399, 1506), 300: M(585, 673, 635, 723), 500: M(411, 495, 444, 528), 1000: M(306, 380, 354, 428), 2000: M(306, 380, 354, 428), 3000: M(306, 380, 354, 428) };
const HB_HOUSE_12 = { 50: M(2873, 3026, 4830, 4981), 100: M(1628, 1746, 2583, 2700), 300: M(800, 895, 1213, 1308), 500: M(568, 658, 788, 878),  1000: M(414, 494, 533, 613),  2000: M(414, 494, 533, 613),  3000: M(414, 494, 533, 613) };
const HB_STD_7    = { 50: M(2280, 2420, 2708, 2846), 100: M(1299, 1407, 1493, 1600), 300: M(646, 734, 696, 784), 500: M(493, 577, 526, 610), 1000: M(365, 440, 414, 488), 2000: M(365, 440, 414, 488), 3000: M(365, 440, 414, 488) };
const HB_STD_12   = { 50: M(3049, 3202, 5007, 5158), 100: M(1755, 1873, 2710, 2827), 300: M(893, 989, 1306, 1401), 500: M(680, 771, 900, 991),  1000: M(503, 583, 622, 702),  2000: M(503, 583, 622, 702),  3000: M(503, 583, 622, 702) };

export const HELLBENDER_MATRIX: Matrix = {
  black:       { "7": HB_BLACK_7, "12": HB_BLACK_12 },
  house_mix:   { "7": HB_HOUSE_7, "12": HB_HOUSE_12 },
  translucent: { "7": HB_STD_7,   "12": HB_STD_12 },
  clear:       { "7": HB_STD_7,   "12": HB_STD_12 },
  // Placeholder — same ladder as Translucent until Hellbender confirms.
  metallic:    { "7": HB_STD_7,   "12": HB_STD_12 },
  opaque:      { "7": HB_STD_7,   "12": HB_STD_12 },
};

// Look up the Hellbender per-unit manufacturing cost for a vinyl SKU.
// Returns null for non-vinyl formats (caller falls back to the
// platform placeholder Cost row).
export function lookupHellbenderUnitCents(args: {
  format: AlbumFormat;
  colorTier: VinylColorTier;
  qtyTier: VinylQuantityTier;
  jacketUpgrade: JacketUpgrade;
}): number | null {
  const size = pressingSizeForFormat(args.format);
  if (!size) return null;
  return HELLBENDER_MATRIX[args.colorTier][size][args.qtyTier][args.jacketUpgrade];
}

// Vinyl rendering set — these formats render the rich vinyl card in
// the Sell panel (color picker, jacket, ladder qty, GoodDeed pill).
// Intentionally broader than `pressingSizeForFormat`, because 12"
// Double LP is real vinyl Hellbender presses, even though we don't
// carry a per-rung legacy matrix for it (the catalog flow or a
// manual quote covers the cost). Keep this as the single source of
// truth for "is this a vinyl SKU" in the UI; reach for
// `pressingSizeForFormat` only when you actually need a Hellbender
// matrix lookup.
export const VINYL_FORMATS: ReadonlyArray<AlbumFormat> = [
  "7_inch",
  "12_lp",
  "12_double",
];

export function isVinylFormat(format: AlbumFormat): boolean {
  return VINYL_FORMATS.includes(format);
}

// Task #619 — per-side audio capacity (seconds) for each vinyl format
// at its standard playback speed. Defaults are deliberately
// conservative so a 22-min side of a 33⅓ rpm 12" stays inside the
// safe-cut window cited by Hellbender + most US plants; a 7" at 45 rpm
// holds about 4½ min/side. Press-specific overrides can come later.
export const VINYL_PER_SIDE_MAX_SECONDS: Partial<Record<AlbumFormat, number>> = {
  "7_inch": 270,      // 4 min 30 sec
  "12_lp": 22 * 60,   // 22 min
  "12_double": 22 * 60,
};

// Number of usable sides per vinyl format. 12" Double LP is the only
// multi-disc product we currently sell, so it gets 4 sides; everything
// else is the standard 2.
export const VINYL_SIDE_COUNT: Partial<Record<AlbumFormat, number>> = {
  "7_inch": 2,
  "12_lp": 2,
  "12_double": 4,
};

// The bump ladder: when a format's total capacity is exceeded, what
// vinyl format should we suggest next? `null` = no further bump
// available, so the warning shows without a "View Suggestion" CTA.
const VINYL_BUMP_LADDER: Partial<Record<AlbumFormat, AlbumFormat>> = {
  "7_inch": "12_lp",
  "12_lp": "12_double",
};

export type FormatFitReport = {
  fits: boolean;
  perSideMaxSec: number | null;
  totalCapSec: number | null;
  suggestedFormat: AlbumFormat | null;
};

// Returns whether the album's total runtime fits the selected vinyl
// format, and (if not) the next-up format the SellPanel should
// suggest. Non-vinyl formats return { fits: true } unconditionally —
// CD / cassette fit logic is out of scope for #619.
export function fitForFormat(args: {
  totalSeconds: number;
  format: AlbumFormat;
}): FormatFitReport {
  const { totalSeconds, format } = args;
  if (!isVinylFormat(format)) {
    return { fits: true, perSideMaxSec: null, totalCapSec: null, suggestedFormat: null };
  }
  const perSide = VINYL_PER_SIDE_MAX_SECONDS[format] ?? null;
  const sides = VINYL_SIDE_COUNT[format] ?? null;
  if (perSide == null || sides == null || totalSeconds <= 0) {
    return { fits: true, perSideMaxSec: perSide, totalCapSec: perSide && sides ? perSide * sides : null, suggestedFormat: null };
  }
  const totalCap = perSide * sides;
  const fits = totalSeconds <= totalCap;
  return {
    fits,
    perSideMaxSec: perSide,
    totalCapSec: totalCap,
    suggestedFormat: fits ? null : VINYL_BUMP_LADDER[format] ?? null,
  };
}
