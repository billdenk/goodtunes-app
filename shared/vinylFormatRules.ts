// Task #541 — Per-vinyl-format side count and safe-length thresholds.
//
// These are plausible industry defaults so the UI can warn the artist
// before they cut a side that physically won't fit (or won't cut at
// acceptable fidelity). The numbers below are conservative — Bill
// needs to confirm the GoodTunes-house thresholds with the pressing
// vendors before we treat the warning as ground truth.
//
// TODO(bill): confirm safe-length thresholds with MRP / PMP / Hellbender.

export const VINYL_FORMATS = [
  "12_33_single",
  "12_33_double",
  "12_45",
  "7_45",
] as const;
export type VinylFormat = (typeof VINYL_FORMATS)[number];

export type VinylSide = "A" | "B" | "C" | "D";

export interface VinylFormatRule {
  label: string;
  // Sides this format physically has, in cut order.
  sides: VinylSide[];
  // Max safe minutes per side. Above this the cut starts to lose
  // amplitude / bass response. Source: industry-default guidance —
  // confirm with the actual press before treating as ground truth.
  maxMinutesPerSide: number;
}

export const VINYL_FORMAT_RULES: Record<VinylFormat, VinylFormatRule> = {
  // 12" 33⅓ single LP — the default record format.
  "12_33_single": {
    label: "12\" 33⅓ Single LP",
    sides: ["A", "B"],
    maxMinutesPerSide: 22,
  },
  // 12" 33⅓ double LP — four sides at the same RPM.
  "12_33_double": {
    label: "12\" 33⅓ Double LP",
    sides: ["A", "B", "C", "D"],
    maxMinutesPerSide: 22,
  },
  // 12" 45 RPM — louder cut, shorter sides. Audiophile single/EP.
  "12_45": {
    label: "12\" 45 RPM",
    sides: ["A", "B"],
    maxMinutesPerSide: 15,
  },
  // 7" 45 RPM — classic single.
  "7_45": {
    label: "7\" 45 RPM",
    sides: ["A", "B"],
    maxMinutesPerSide: 5,
  },
};

export function isVinylFormat(v: unknown): v is VinylFormat {
  return typeof v === "string" && (VINYL_FORMATS as readonly string[]).includes(v);
}

export function isVinylSide(v: unknown): v is VinylSide {
  return v === "A" || v === "B" || v === "C" || v === "D";
}
