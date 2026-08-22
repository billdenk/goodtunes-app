// Tasks #3306/#3307 — shared GT-layer eligibility predicate.
//
// ONE definition of "is this Illustrator layer (PDF optional-content group) a
// GoodTunes guide layer?" used by:
//   - the client viewers (press live-test + artist template test filter
//     extracted layers into toggle chips with exactly this predicate —
//     re-exported from gtOverlayEngine.ts),
//   - the server's clean artist template download (server/pdf/hideGtLayers.ts),
//     which flips exactly these groups to hidden in the PDF's default
//     optional-content configuration.
//
// Grammar (press template authoring canon): GT-prefixed names ("GT CUT LINE",
// "GT BLEED AREA") or LINE/AREA overlay layers. Case-insensitive, contains-
// match on LINE/AREA — the same net the viewers have always cast.

export function isGtEligibleLayer(name: string): boolean {
  const n = name.toUpperCase();
  return n.includes('LINE') || n.includes('AREA') || n.startsWith('GT');
}
