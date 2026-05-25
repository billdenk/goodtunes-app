// Task #363 — single source of truth for the press turnaround label.
// Labels and artists think in weeks when planning a pressing campaign,
// so every press card renders the range as e.g. "12–14 wks" instead of
// a raw day count like "75d" or "90-day turnaround". Rows that only
// carry the legacy `turnaroundDays` value (presses added before the
// week-range pair shipped) auto-derive a ±1-week range from the day
// count so they keep showing something useful until the operator
// edits the row.

export type PressTurnaroundLike = {
  turnaroundDays?: number | null;
  turnaroundWeeksMin?: number | null;
  turnaroundWeeksMax?: number | null;
};

export type PressTurnaroundRange = {
  min: number | null;
  max: number | null;
};

/** Round a day count to a sensible ±1-week range. Used both for
 * display fallback on legacy rows and for pre-filling the admin form
 * inputs so the operator isn't staring at empty fields. */
export function deriveWeeksFromDays(days: number): PressTurnaroundRange {
  const weeks = Math.max(1, Math.round(days / 7));
  return { min: Math.max(1, weeks - 1), max: weeks + 1 };
}

/** Returns the inclusive week range for a press, deriving from the
 * legacy day count when min/max aren't explicitly set. Either side
 * can be null; the caller decides how to render. */
export function pressTurnaroundRange(p: PressTurnaroundLike): PressTurnaroundRange {
  const min = p.turnaroundWeeksMin ?? null;
  const max = p.turnaroundWeeksMax ?? null;
  if (min != null || max != null) return { min, max };
  if (p.turnaroundDays != null) return deriveWeeksFromDays(p.turnaroundDays);
  return { min: null, max: null };
}

/** Human label: "12–14 wks" / "12 wks" / null. */
export function pressTurnaroundLabel(p: PressTurnaroundLike): string | null {
  const { min, max } = pressTurnaroundRange(p);
  if (min != null && max != null) {
    if (min === max) return `${min} wks`;
    return `${min}\u2013${max} wks`;
  }
  if (min != null) return `${min} wks`;
  if (max != null) return `${max} wks`;
  return null;
}
