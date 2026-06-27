// Canonical avatar/initials derivation used everywhere a name is shown as
// initials (person avatars, profile avatar, credits, vendor/label/maker tiles).
//
// Rule (set by Bill):
//   - Two or more words  -> first word's initial + LAST word's initial, both
//     uppercase. "Aaron Wagner" -> "AW", "Alan Roy Scott" -> "AS".
//   - A single word      -> first letter uppercase + second letter lowercase.
//     "Adele" -> "Ad", "Activ8te" -> "Ac". (Single-letter names stay one char.)
//
// Never returns the first two letters of a single name uppercased ("BI"); a
// one-word name is Title-case initials ("Bi"), and a real first/last name is
// the two distinct initials ("BD").
export function getInitials(
  name?: string | null,
  fallback = "?",
): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return fallback;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0][0] ?? "";
    const last = words[words.length - 1][0] ?? "";
    return (first + last).toUpperCase();
  }
  const w = words[0];
  return w.length >= 2
    ? w[0].toUpperCase() + w[1].toLowerCase()
    : w[0].toUpperCase();
}
