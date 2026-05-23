// Task #200 — Pressing-plant pricing reference matrix (Hellbender Vinyl).
//
// Source of truth for the per-format Cost on every vinyl SKU. Lives in
// /shared/ so the admin SellPanel can recompute Cost as the artist
// changes color/quantity/jacket picks BEFORE saving, and the server can
// re-validate + snapshot the same number on save.
//
// Pricing collapses 35 colors to 3 tiers (Hellbender prices every
// "standard" color identically); 6 quantity tiers; 4 jacket upgrades;
// 2 sizes (7" + 12"). Source: Hellbender Vinyl public price sheet,
// captured in `.local/tasks/hellbender-pricing-matrix.json`.
//
// Non-vinyl formats (12" double, cassette, CD) keep the placeholder
// Cost from `payout_format_costs` until we wire in real per-format
// matrices for those plants.

import type { AlbumFormat } from "./schema";

export type VinylColorTier = "black" | "standard" | "regrind";
export type JacketUpgrade =
  | "none"
  | "insert"
  | "gatefold"
  | "gatefold_insert";

export const VINYL_QUANTITY_TIERS = [50, 100, 200, 300, 500, 1000] as const;
export type VinylQuantityTier = (typeof VINYL_QUANTITY_TIERS)[number];

export const JACKET_UPGRADE_LABEL: Record<JacketUpgrade, string> = {
  none: "Standard jacket",
  insert: "+ Double-sided insert",
  gatefold: "Gatefold jacket",
  gatefold_insert: "Gatefold + insert",
};

export const VINYL_COLOR_TIER_LABEL: Record<VinylColorTier, string> = {
  black: "Black",
  standard: "Standard color",
  regrind: "Regrind mix",
};

// Each vinyl color the artist can pick. `swatch` is the CSS color we
// render in the swatch circle until real photo thumbnails are uploaded
// (`thumbnailUrl`, future). Order roughly mirrors the Hellbender sheet:
// black + regrind first (the cheap tiers), then the standard rainbow.
export type VinylColorOption = {
  id: string; // stable key (snake_case)
  name: string; // display name, matches the Hellbender sheet
  tier: VinylColorTier;
  swatch: string; // CSS color for the placeholder circle
  thumbnailUrl?: string | null; // future: real photo of the color
};

export const VINYL_COLORS: VinylColorOption[] = [
  { id: "black", name: "Black", tier: "black", swatch: "#0c0c0c" },
  { id: "regrind_mix", name: "Regrind Mix", tier: "regrind", swatch: "linear-gradient(135deg,#5b5b5b 0%,#2c2c2c 50%,#7a7a7a 100%)" },
  { id: "white", name: "White", tier: "standard", swatch: "#f7f7f5" },
  { id: "brown", name: "Brown", tier: "standard", swatch: "#5b3a1e" },
  { id: "tan", name: "Tan", tier: "standard", swatch: "#c9a878" },
  { id: "deep_purple", name: "Deep Purple", tier: "standard", swatch: "#2e1346" },
  { id: "blue", name: "Blue", tier: "standard", swatch: "#1f4ec0" },
  { id: "turquoise", name: "Turquoise", tier: "standard", swatch: "#2bb6a8" },
  { id: "sky_blue", name: "Sky Blue", tier: "standard", swatch: "#79c8ee" },
  { id: "jade", name: "Jade", tier: "standard", swatch: "#3aa57a" },
  { id: "dark_green", name: "Dark Green", tier: "standard", swatch: "#0f4c2a" },
  { id: "green", name: "Green", tier: "standard", swatch: "#2c8a3a" },
  { id: "lime_green", name: "Lime Green", tier: "standard", swatch: "#a8d83a" },
  { id: "duckie_yellow", name: "Duckie Yellow", tier: "standard", swatch: "#f6c83a" },
  { id: "yellow", name: "Yellow", tier: "standard", swatch: "#f7e23a" },
  { id: "peach", name: "Peach", tier: "standard", swatch: "#f8b58a" },
  { id: "orange", name: "Orange", tier: "standard", swatch: "#ee7726" },
  { id: "red", name: "Red", tier: "standard", swatch: "#c8242b" },
  { id: "maroon", name: "Maroon", tier: "standard", swatch: "#641826" },
  { id: "pink", name: "Pink", tier: "standard", swatch: "#f08fb4" },
  { id: "ultra_clear", name: "Ultra Clear", tier: "standard", swatch: "linear-gradient(135deg,#eef3f7 0%,#cfd8df 100%)" },
  { id: "smokey_clear", name: "Smokey Clear", tier: "standard", swatch: "linear-gradient(135deg,#cfcfcf 0%,#8c8c8c 100%)" },
  { id: "clear_blue", name: "Clear Blue", tier: "standard", swatch: "#9fc7ef" },
  { id: "clear_green", name: "Clear Green", tier: "standard", swatch: "#9fe0b0" },
  { id: "coke_bottle_clear", name: "Coke Bottle Clear", tier: "standard", swatch: "#5e8a72" },
  { id: "clear_yellow", name: "Clear Yellow", tier: "standard", swatch: "#f4ec9c" },
  { id: "clear_orange", name: "Clear Orange", tier: "standard", swatch: "#f6b48b" },
  { id: "clear_red", name: "Clear Red", tier: "standard", swatch: "#e69aa0" },
  { id: "clear_pink", name: "Clear Pink", tier: "standard", swatch: "#f7c7d6" },
  { id: "natural", name: "Natural", tier: "standard", swatch: "#ece2c8" },
  { id: "violet", name: "Violet", tier: "standard", swatch: "#7a3aa8" },
  { id: "hazy_orange", name: "Hazy Orange", tier: "standard", swatch: "linear-gradient(135deg,#f7b06a 0%,#d97a2e 100%)" },
  { id: "seaglass_blue", name: "Seaglass Blue", tier: "standard", swatch: "#9ec9c0" },
  { id: "silver", name: "Silver", tier: "standard", swatch: "linear-gradient(135deg,#dfe2e6 0%,#a8aeb5 100%)" },
  { id: "gold", name: "Gold", tier: "standard", swatch: "linear-gradient(135deg,#f3d57a 0%,#b9892a 100%)" },
];

export const VINYL_COLOR_BY_ID: Record<string, VinylColorOption> =
  Object.fromEntries(VINYL_COLORS.map((c) => [c.id, c]));

// Default picks for a fresh vinyl draft row — black, 100 units,
// standard jacket. Hellbender's cheapest mainstream entry point.
export const DEFAULT_VINYL_COLOR_ID = "black";
export const DEFAULT_VINYL_QUANTITY: VinylQuantityTier = 100;
export const DEFAULT_JACKET_UPGRADE: JacketUpgrade = "none";

// Snap an arbitrary positive integer to the next published Hellbender
// quantity tier. Anything > 1000 stays at 1000 but flips
// `requiresQuote` so the UI can surface a "1000+ — request a custom
// quote" caveat. Zero/non-numeric is treated as 50 (smallest tier).
export function snapToQuantityTier(
  input: number | null | undefined,
): { tier: VinylQuantityTier; requiresQuote: boolean } {
  const n = typeof input === "number" && Number.isFinite(input) ? Math.max(1, Math.floor(input)) : 1;
  if (n > 1000) return { tier: 1000, requiresQuote: true };
  for (const t of VINYL_QUANTITY_TIERS) {
    if (n <= t) return { tier: t, requiresQuote: false };
  }
  return { tier: 1000, requiresQuote: false };
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
// (tier, size, qtyTier, jacketUpgrade). Standard-color prices are the
// reference White row; all 33 standard colors match it identically.
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

export const HELLBENDER_MATRIX: Matrix = {
  black: {
    "7": {
      50: M(2166, 2306, 2594, 2732),
      100: M(1235, 1343, 1429, 1536),
      200: M(769, 863, 857, 950),
      300: M(615, 703, 665, 753),
      500: M(439, 523, 472, 556),
      1000: M(333, 407, 381, 455),
    },
    "12": {
      50: M(2896, 3049, 4853, 5004),
      100: M(1651, 1769, 2606, 2723),
      200: M(1030, 1132, 1554, 1655),
      300: M(823, 918, 1236, 1331),
      500: M(599, 690, 819, 910),
      1000: M(442, 522, 561, 641),
    },
  },
  standard: {
    "7": {
      50: M(2280, 2420, 2708, 2846),
      100: M(1299, 1407, 1493, 1600),
      200: M(809, 903, 896, 990),
      300: M(646, 734, 696, 784),
      500: M(493, 577, 526, 610),
      1000: M(365, 440, 414, 488),
    },
    "12": {
      50: M(3049, 3202, 5007, 5158),
      100: M(1755, 1873, 2710, 2827),
      200: M(1109, 1210, 1632, 1734),
      300: M(893, 989, 1306, 1401),
      500: M(680, 771, 900, 991),
      1000: M(503, 583, 622, 702),
    },
  },
  regrind: {
    "7": {
      50: M(2136, 2276, 2564, 2702),
      100: M(1205, 1313, 1399, 1506),
      200: M(740, 834, 827, 921),
      300: M(585, 673, 635, 723),
      500: M(411, 495, 444, 528),
      1000: M(306, 380, 354, 428),
    },
    "12": {
      50: M(2873, 3026, 4830, 4981),
      100: M(1628, 1746, 2583, 2700),
      200: M(1007, 1109, 1531, 1632),
      300: M(800, 895, 1213, 1308),
      500: M(568, 658, 788, 878),
      1000: M(414, 494, 533, 613),
    },
  },
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

export function isVinylFormat(format: AlbumFormat): boolean {
  return pressingSizeForFormat(format) !== null;
}
