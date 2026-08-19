// Task #3191 — strong-identity matching for the Apple Music enrichment on
// the "Who's the artist?" confirm step.
//
// The old behavior treated a punctuation-stripped normalized name match as
// "exact" and, when no exact hit existed, silently fell back to iTunes'
// FIRST result. That imported the wrong artist: "How???" and "$how" both
// normalize to "how", so a Spotify pick of "How???" got "$how"'s Apple
// profile — whose name and photo then overwrote the Spotify identity.
//
// New contract:
//   • "exact"  — raw names match case/diacritic-insensitively with
//                punctuation PRESERVED ("How???" ≠ "$how", but
//                "Beyoncé" == "beyonce"). Safe to link automatically.
//   • "loose"  — only the punctuation-stripped keys match. NOT safe on its
//                own; requires corroborating evidence (a shared release
//                title between the Spotify candidate's releases and the
//                Apple artist's discography) before linking.
//   • "none"   — different artists; never link, never fall back.
//
// Pure functions so they're unit-testable under node's test runner.

export type AppleNameMatch = "exact" | "loose" | "none";

/** Case-insensitive, diacritic-folding, whitespace-collapsing key that
 *  KEEPS punctuation and symbols. */
export function rawNameKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Punctuation-stripped variant of {@link rawNameKey}. Two distinct
 *  artists ("How???" vs "$how") can collide here — treat a loose match as
 *  a hint that needs corroboration, never as an identity. */
export function looseNameKey(s: string): string {
  return rawNameKey(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyAppleNameMatch(spotifyName: string, appleName: string): AppleNameMatch {
  if (rawNameKey(spotifyName) === rawNameKey(appleName)) return "exact";
  const a = looseNameKey(spotifyName);
  if (a && a === looseNameKey(appleName)) return "loose";
  return "none";
}

/** True when the Spotify candidate's known release title appears in the
 *  Apple artist's discography (punctuation/case-insensitive title compare).
 *  Used to upgrade a "loose" name match into a confident link. */
export function releasesCorroborate(
  spotifyRelease: string | null | undefined,
  appleAlbumNames: Array<string | null | undefined>,
): boolean {
  const want = spotifyRelease ? looseNameKey(spotifyRelease) : "";
  if (!want) return false;
  return appleAlbumNames.some((n) => !!n && looseNameKey(n) === want);
}

/**
 * Pick the Apple candidate to (maybe) link for a Spotify pick. Returns the
 * first exact raw-name match, else the first loose match (caller must then
 * corroborate via {@link releasesCorroborate} before accepting), else null.
 * There is deliberately NO fall-back-to-first-result path.
 */
export function pickAppleCandidate<T extends { name: string }>(
  spotifyName: string,
  candidates: T[],
): { candidate: T; level: "exact" | "loose" } | null {
  const exact = candidates.find((c) => classifyAppleNameMatch(spotifyName, c.name) === "exact");
  if (exact) return { candidate: exact, level: "exact" };
  const loose = candidates.find((c) => classifyAppleNameMatch(spotifyName, c.name) === "loose");
  if (loose) return { candidate: loose, level: "loose" };
  return null;
}

/**
 * Merge the picked streaming identity with an (already strong-matched)
 * Apple scrape result into the name/photo that will be persisted.
 *
 * Rules:
 *  • Apple-sourced picks keep preferring Apple's canonical data (that IS
 *    the picked identity).
 *  • Spotify picks keep the Spotify name unless the Apple match was an
 *    EXACT raw-name match (in which case Apple's canonical casing is
 *    fine); a loose/corroborated match must never rewrite the name.
 *  • Spotify's portrait wins whenever present; Apple's only fills a gap.
 *  • With no linked Apple result the Spotify identity passes through
 *    untouched.
 */
export function mergeArtistIdentity(opts: {
  pickedName: string;
  pickedPhotoUrl: string | null;
  pickedSource: "spotify" | "apple";
  apple: { name: string | null; photoUrl: string | null } | null;
  appleMatchLevel: "exact" | "corroborated" | null;
}): { name: string; photoUrl: string | null } {
  const { pickedName, pickedPhotoUrl, pickedSource, apple, appleMatchLevel } = opts;
  if (!apple) return { name: pickedName, photoUrl: pickedPhotoUrl ?? null };
  if (pickedSource === "apple") {
    return {
      name: apple.name || pickedName,
      photoUrl: apple.photoUrl || pickedPhotoUrl || null,
    };
  }
  const name =
    appleMatchLevel === "exact" && apple.name ? apple.name : pickedName;
  return { name, photoUrl: pickedPhotoUrl || apple.photoUrl || null };
}
