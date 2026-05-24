/**
 * Canonical GoodTunes brand palette for non-CSS consumers.
 *
 * Most surfaces should reach the brand through CSS vars
 * (`var(--brand-blue)` etc. — see client/src/index.css). This file
 * exists for the handful of places that need a plain string color at
 * JS runtime — most notably recharts, which only accepts hex/rgb
 * strings for `fill`/`stroke`/`background`.
 *
 * Keep these in sync with the `--brand-*` vars in client/src/index.css.
 * Adding a new shade? Add the CSS var first, then mirror it here.
 */
export const BRAND = {
  bg: "#00062B",
  headerGradientTop: "#0B1457",
  blue: "#319ED8",
  purple: "#7F10A7",
  mint: "#4AFFCA",
  pink: "#FF5470",
  heart: "#FF5470",
  amber: "#F5B14C",
} as const;

/**
 * Extended chart palette — brand colors first, then the soft pastel
 * fillers used to stack >5 series on the same chart without two
 * adjacent bars sharing a hue.
 */
export const CHART_STACK_PALETTE: readonly string[] = [
  BRAND.blue,
  BRAND.purple,
  BRAND.mint,
  BRAND.pink,
  BRAND.amber,
  "#9BA8FF",
  "#7BD8FF",
  "#FFA1C7",
  "#A4F0C8",
  "#F2B6FF",
  "#FFD590",
];

/** Default SKU → brand-color mapping for the per-SKU revenue chart. */
export const SKU_COLORS: Record<string, string> = {
  digital: BRAND.blue,
  vinyl: BRAND.purple,
  cassette: BRAND.amber,
  cd: BRAND.mint,
  bundle: BRAND.pink,
  gift: "#9BA8FF",
  gooddeed: "#7BD8FF",
  other: "rgba(255,255,255,0.4)",
};

/** Recharts <Tooltip> contentStyle that matches the dark partner dashboards. */
export const CHART_TOOLTIP_STYLE = {
  background: BRAND.headerGradientTop,
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  fontSize: 12,
  color: "white",
} as const;
