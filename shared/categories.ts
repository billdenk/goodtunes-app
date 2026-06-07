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

/**
 * Task #1643 — Accessory types per gear category, for the Rig builder.
 *
 * A "Rig" bundles a base instrument with accessory lines (strings, pick,
 * reeds, …). The *type* of accessory that makes sense depends on the base
 * instrument's category — strings/pick/capo for a guitar, reeds/mouthpiece
 * for a woodwind, heads/sticks for drums. This map drives the suggested
 * type chips in the admin Rig builder.
 *
 * It is a convenience list only: the chosen type is stored as free text on
 * `rig_accessories.type`, so the data survives any edit to this list and the
 * operator can always type a custom type. Use `accessoryTypesFor()` to read
 * it with a sensible generic fallback.
 */
export const ACCESSORY_TYPES_BY_CATEGORY: Record<ShortCategory, string[]> = {
  Guitar: ["Strings", "Pick", "Capo", "Strap", "Slide", "Tuning"],
  Bass: ["Strings", "Pick", "Strap", "Tuning"],
  Drums: ["Heads", "Sticks", "Cymbals", "Hardware", "Tuning"],
  Percussion: ["Mallets", "Heads", "Beaters"],
  Keys: ["Pedals", "Bench", "Patch", "Tuning"],
  Violin: ["Strings", "Bow", "Rosin", "Shoulder Rest"],
  Viola: ["Strings", "Bow", "Rosin", "Shoulder Rest"],
  Cello: ["Strings", "Bow", "Rosin", "Endpin"],
  Brass: ["Mouthpiece", "Mute", "Valve Oil"],
  Woodwind: ["Reeds", "Mouthpiece", "Ligature"],
  Amp: ["Tubes", "Cabinet", "Settings"],
  Pedal: ["Settings", "Power"],
  Mic: ["Capsule", "Pad", "Pop Filter"],
};

// Generic fallback used when the base instrument has no shortCategory or an
// unknown one. Keeps the builder usable for any gear.
export const ACCESSORY_TYPES_GENERIC = ["Strings", "Accessory", "Setting", "Other"];

export function accessoryTypesFor(
  shortCategory: string | null | undefined,
): string[] {
  if (
    shortCategory &&
    (SHORT_CATEGORIES as readonly string[]).includes(shortCategory)
  ) {
    return ACCESSORY_TYPES_BY_CATEGORY[shortCategory as ShortCategory];
  }
  return ACCESSORY_TYPES_GENERIC;
}
