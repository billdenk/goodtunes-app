/**
 * Canonical short-category buckets for instruments / gear.
 *
 * Every Instrument has a free-text `category` (e.g. "Dreadnought",
 * "Hollow and Semi-Hollow Body", "Hand Percussion") for accuracy, plus
 * a `shortCategory` from THIS list for filtering, chips, and vendor
 * cross-linking. Keeping this list closed (admin picks from the
 * dropdown, can't free-type) is what lets fans search "Guitar" or
 * "Bass" and pull every relevant vendor together.
 *
 * If you genuinely need a new bucket, add it here and discuss before
 * shipping — every addition is a new top-level filter in the UI.
 */

export const SHORT_CATEGORIES = [
  "Guitar",
  "Bass",
  "Drums",
  "Percussion",
  "Keys",
  "Violin",
  "Viola",
  "Cello",
  "Brass",
  "Woodwind",
  "Amp",
  "Pedal",
  "Mic",
] as const;

export type ShortCategory = (typeof SHORT_CATEGORIES)[number];
