// Task #363 — single source of truth for the press turnaround label.
// Labels and artists think in weeks when planning a pressing campaign,
// so every press card renders the range as e.g. "12–14 wks" instead of
// a raw day count like "75d" or "90-day turnaround". Task #366 backfilled
// the week-range columns for every legacy row, so the columns are now the
// only source of truth — no on-the-fly derivation from `turnaroundDays`.

export type PressTurnaroundLike = {
  turnaroundWeeksMin?: number | null;
  turnaroundWeeksMax?: number | null;
};

export type PressTurnaroundRange = {
  min: number | null;
  max: number | null;
};

/** Round a day count to a sensible ±1-week range. Kept exported so the
 * admin edit form (and the one-shot backfill) share the same math. */
export function deriveWeeksFromDays(days: number): PressTurnaroundRange {
  const weeks = Math.max(1, Math.round(days / 7));
  return { min: Math.max(1, weeks - 1), max: weeks + 1 };
}

/** Returns the inclusive week range for a press. Either side can be
 * null; the caller decides how to render. */
export function pressTurnaroundRange(p: PressTurnaroundLike): PressTurnaroundRange {
  return {
    min: p.turnaroundWeeksMin ?? null,
    max: p.turnaroundWeeksMax ?? null,
  };
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
