/**
 * Subtitle-role filtering for the fan-facing credits surfaces.
 *
 * The credits importer snaps any performer it can't classify into generic
 * bucket roles ("Other", "Misc", …). We keep those rows internally so
 * operators can see and fix unclassified credits, but we never show the
 * generic label to fans — it should never appear as a credit subtitle.
 *
 * Real performance roles (instruments + vocals) pass through unmodified.
 */

/** Role strings that are generic placeholder labels, not real performance
 *  roles. Case-insensitive, exact-word match. */
const GENERIC_PLACEHOLDER_RE =
  /^(other|misc|miscellaneous|performer|musician|instruments?)$|^(pick|picks|plectrum|capo)$/i;

/**
 * Returns true when `role` is a real performance label that should appear in
 * fan-facing credit subtitles. Returns false for generic placeholders that
 * should be silently dropped.
 *
 * Keeps all instrument names (Guitar, Bass, Strings, Saxophone, …) and all
 * vocal roles (Lead Vocals, Background Vocals, Choir, …).
 */
export function isDisplayRole(role: string): boolean {
  const r = role.trim();
  if (!r) return false;
  return !GENERIC_PLACEHOLDER_RE.test(r);
}
