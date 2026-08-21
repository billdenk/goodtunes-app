// Guard for the match-from-photo auto-suggestion (Task 3281 / Ruby handoff).
// The suggestion may be applied ONCE, and only into a sheet the press has
// not touched — never over work already started. "Touched" covers ANY
// operator interaction after the sheet opened (style/option/name clicks,
// typing — including a partial, not-yet-valid hex), because the photo
// decode is async and can land mid-edit.
export function canApplyPhotoSuggestion(args: {
  /** Operator interacted with the sheet since it opened (pointer or key). */
  touched: boolean;
  /** The one-shot suggestion already fired for this sheet. */
  alreadyApplied: boolean;
  /** Sheet opened locked to a specific style (edit of a gen color). */
  lockedStyleId?: string | null;
  /** Current color inputs — ANY non-empty entry (even partial) blocks. */
  colors: string[];
}): boolean {
  if (args.alreadyApplied) return false;
  if (args.lockedStyleId) return false;
  if (args.touched) return false;
  if (args.colors.some((c) => (c ?? '').trim() !== '')) return false;
  return true;
}
