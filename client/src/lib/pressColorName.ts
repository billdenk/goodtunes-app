// Bill's ruling (Aug 23 2026, Pricing walk): MRP-facing surfaces never show
// raw internal color codes. Imported MRP splatter colors have names that ARE
// the vendor codes ("O15 w/ O08 O09 O22", "T08 w/ black"), so any name
// containing a code token is hidden — the swatch image alone identifies the
// color. The name shows again only once an operator renames it to something
// human ("Blood moon splatter" has no code token).
//
// A code token is 1–3 capital letters glued to 2–3 digits (O02, T08, GT150).
// Ordinary names ("Red", "180g Black", "7-inch clear") never match: plain
// numbers, lowercase units, and hyphenated words all lack the glued
// CAPITALS+digits shape.
const CODE_TOKEN = /\b[A-Z]{1,3}\d{2,3}\b/;

/** The name to display for a press color, or null when it's a raw code
 *  that must stay hidden (show only the swatch). */
export function displayPressColorName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  return CODE_TOKEN.test(n) ? null : n;
}
