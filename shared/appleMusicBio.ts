// One source of truth for stripping Apple Music's boilerplate bio sentence.
//
// The scraper used to capture Apple's "Listen to music by <Artist> on Apple
// Music." sentence as a "bio". We kill it in three layers (import strip,
// one-time backfill, render guard) — and every layer MUST use this exact
// matcher so they can never drift.
//
// Root cause of the earlier leak (Tasks #1710 / #2057): Apple serves the
// phrase with a NON-BREAKING SPACE (U+00A0) between "Apple" and "Music" so it
// never line-wraps. The old pattern used literal ASCII spaces, so it never
// matched those rows and every layer silently no-op'd. Here we match `\s+`
// (JS `\s` already covers U+00A0, narrow-NBSP U+202F, thin space, U+2028/9,
// U+205F, U+3000, ZWNBSP, …) between every word, so a future Apple copy tweak
// to a different Unicode space still can't re-open the hole.
//
// Returns "" when nothing of substance survives (so callers can collapse a
// boilerplate-only bio to empty/null).
export function stripAppleMusicBoilerplate(s: string | null | undefined): string {
  if (!s) return "";
  const out = s
    .replace(/listen\s+to\s+music\s+by\s+.+?\s+on\s+apple\s+music\.?/gi, " ")
    // Collapse runs of horizontal whitespace (incl. NBSP / narrow-NBSP) left
    // behind by the removal so the surviving bio reads cleanly.
    .replace(/[ \t\u00a0\u202f]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Only-punctuation/whitespace left over → treat as empty.
  return /[a-z0-9]/i.test(out) ? out : "";
}
