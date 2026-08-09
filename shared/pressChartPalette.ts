// Stable per-press series colors for cross-press charts (combined Press
// Dashboard stacked trend, legends, leaderboard bars).
//
// Rules (Bill, Aug 2026):
//   • A press gets its color ONCE, when it's onboarded (next unused palette
//     slot, stamped onto manufacturers.chart_color) — never re-derived per
//     page load, so charts stay consistent across visits.
//   • Color is never the only signal — names/labels always ride alongside.
//   • Presses beyond the chart's top 5 are combined into one neutral grey
//     "Everything else" band (PRESS_OTHER_COLOR).
//
// The first four slots pin the founding presses' established mock colors
// (Memphis blue, Hellbender violet, PMP green, Viryl amber) so the live
// dashboard matches the approved handoff.

export const PRESS_CHART_PALETTE = [
  "#319ED8", // GoodTunes blue (Memphis Record Pressing)
  "#8B5CF6", // violet (Hellbender Vinyl)
  "#4cc98a", // green (Physical Music Products)
  "#e8b04b", // amber (Viryl Technologies)
  "#e46a9f", // pink
  "#5ad0c6", // teal
  "#7f8bf5", // periwinkle
  "#d98a5f", // terracotta
  "#a4b45e", // olive
  "#b06fd6", // orchid
  "#66a8e8", // sky
  "#8fa3ad", // slate
] as const;

/** Neutral band for presses beyond the chart's top 5. */
export const PRESS_OTHER_COLOR = "#6e6e73";

/**
 * Pick the next palette color not yet in use. Cycles when every slot is
 * taken (13th press reuses slot 1 — still stable, since it's stamped once).
 */
export function nextPressChartColor(inUse: ReadonlyArray<string | null | undefined>): string {
  const used = new Set(
    inUse.filter((c): c is string => typeof c === "string" && c.length > 0).map((c) => c.toLowerCase()),
  );
  for (const c of PRESS_CHART_PALETTE) {
    if (!used.has(c.toLowerCase())) return c;
  }
  return PRESS_CHART_PALETTE[used.size % PRESS_CHART_PALETTE.length];
}
