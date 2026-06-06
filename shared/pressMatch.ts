// Task #1013 — Find-a-press matching + scoring model.
//
// Given a requirement spec (format, color, quantity, optional preferred
// location + max turnaround) this ranks the presses that can actually
// fulfill it. The model is pure (no DB) so it can be unit-tested and so
// the weighting stays explainable: the server gathers each press's
// catalog (via getPressCatalog) + manufacturer metadata, hands plain
// data in here, and renders the breakdown this returns.
//
// ── Hard requirements (filter, never ranked) ─────────────────────────
//   • Format  — the press MUST list the requested format, or it's out.
//   • Color   — when a color is requested, the press MUST have a color
//               that matches (exact name → partial name → color family),
//               or it's out. A press with the format but no matching
//               color is reported as non-matching with a reason, never
//               silently mixed into the ranked list.
//
// ── Soft preferences (rank the survivors) ────────────────────────────
//   • Price (weight 45) — per-unit cost at the requested quantity,
//       snapped UP to the next catalog ladder rung. Cheapest candidate
//       scores 1.0; everyone else scores bestUnit / theirUnit (so 2× the
//       price ≈ 0.5). A press whose matched tier has no confirmed ladder
//       prices as "needs a quote" and takes a fixed low sub-score so it
//       ranks below anything with a real number but isn't excluded.
//   • Color (weight 25) — only active when a color was requested. Exact
//       name 1.0, partial/substring 0.8, same-family (hue) 0.55.
//   • Turnaround (weight 18) — only active when a max is requested.
//       Within the max 1.0; unknown 0.4; over the max scales as
//       max / theirMax (a soft penalty, never an exclusion).
//   • Location (weight 12) — only active when a preferred location is
//       given. City/region/state token hit 1.0; country-only 0.55; weak
//       0.15; press location unknown 0.0.
//
// The total is the weighted average over the *active* factors only
// (price is always active; the other three switch on when the operator
// fills that field), scaled to 0–100. Inactive factors don't dilute the
// score, so a search that only gives format + quantity ranks purely on
// price.

import type { AlbumFormat } from "./schema";
import { ALBUM_FORMAT_LABEL } from "./schema";
import { formatUsdCents } from "./money";

export const PRICE_WEIGHT = 45;
export const COLOR_WEIGHT = 25;
export const TURNAROUND_WEIGHT = 18;
export const LOCATION_WEIGHT = 12;

// Fixed sub-score for a tier that matches on color/format but has no
// confirmed price ladder for the requested quantity. Keeps it visible
// (it can still be the only press that does gold splatter 7") but below
// anything with a real per-unit number.
const NEEDS_QUOTE_PRICE_SUBSCORE = 0.3;

export type PressMatchSpec = {
  format: AlbumFormat;
  // Free-text color or color family ("gold", "translucent blue", "#1f4ec0").
  // Empty / null = no color requirement (color factor goes inactive).
  color?: string | null;
  quantity: number;
  // Free-text region the operator prefers ("Tennessee", "USA", "Nashville").
  preferredLocation?: string | null;
  // Hard cap is NOT enforced — over-cap presses are penalized, not cut.
  maxTurnaroundWeeks?: number | null;
};

export type PressColorInput = {
  id: string;
  name: string;
  swatchHex: string | null;
};

export type PressTierInput = {
  id: string;
  name: string;
  colors: PressColorInput[];
  // The resolved default-jacket ladder for this tier+format.
  ladder: { qty: number; unitCents: number; confirmed?: boolean }[];
};

export type PressCandidateInput = {
  pressId: string;
  name: string;
  logoUrl: string | null;
  location: string | null;
  turnaroundWeeksMin: number | null;
  turnaroundWeeksMax: number | null;
  turnaroundDays: number | null;
  brokerDiscountPct: number;
  // Every format this press lists (used for the hard format filter).
  formats: AlbumFormat[];
  // Tiers for the REQUESTED format only (server pre-filters).
  tiers: PressTierInput[];
};

export type ColorMatchKind = "exact" | "partial" | "family" | "none";

export type FactorScore = {
  active: boolean;
  weight: number;
  score: number; // 0–1
  note: string;
};

export type PressMatchResult = {
  pressId: string;
  name: string;
  logoUrl: string | null;
  location: string | null;
  turnaroundWeeksMin: number | null;
  turnaroundWeeksMax: number | null;
  turnaroundDays: number | null;
  matches: boolean;
  failedHard: string[];
  // Resolved best option (null when it failed a hard filter).
  tierId: string | null;
  tierName: string | null;
  colorMatch: {
    id: string;
    name: string;
    swatchHex: string | null;
    kind: ColorMatchKind;
  } | null;
  unitCents: number | null;
  snappedQty: number | null;
  requiresQuote: boolean;
  score: number; // 0–100, only meaningful when matches=true
  factors: {
    price: FactorScore;
    color: FactorScore;
    turnaround: FactorScore;
    location: FactorScore;
  };
};

// ── Color helpers ────────────────────────────────────────────────────

type ColorFamily =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "brown"
  | "black"
  | "white"
  | "gray";

// Common color words → coarse family, so "gold"/"silver"/"natural" and
// other names that won't substring-match still land in a family bucket.
const NAME_TO_FAMILY: Record<string, ColorFamily> = {
  gold: "yellow",
  silver: "gray",
  metallic: "gray",
  natural: "white",
  cream: "white",
  ivory: "white",
  clear: "white",
  smoke: "gray",
  smokey: "gray",
  charcoal: "gray",
  coke: "green",
  jade: "green",
  lime: "green",
  mint: "green",
  teal: "blue",
  turquoise: "blue",
  navy: "blue",
  sky: "blue",
  cobalt: "blue",
  violet: "purple",
  lavender: "purple",
  plum: "purple",
  magenta: "pink",
  rose: "pink",
  salmon: "pink",
  coral: "orange",
  peach: "orange",
  amber: "orange",
  tan: "brown",
  maroon: "red",
  burgundy: "red",
  crimson: "red",
  ruby: "red",
};

function parseHex(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToFamily(rgb: { r: number; g: number; b: number }): ColorFamily {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l >= 0.92 && s < 0.15) return "white";
  if (l <= 0.12) return "black";
  if (s < 0.12) return l > 0.7 ? "white" : "gray";
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  // Brown is a low-lightness orange.
  if (hue >= 15 && hue < 45 && l < 0.35) return "brown";
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 160) return "green";
  if (hue < 255) return "blue";
  if (hue < 295) return "purple";
  return "pink";
}

function familyFromName(name: string): ColorFamily | null {
  const lower = name.toLowerCase();
  for (const [word, fam] of Object.entries(NAME_TO_FAMILY)) {
    if (lower.includes(word)) return fam;
  }
  // Direct family words.
  const direct: ColorFamily[] = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "black", "white", "gray"];
  for (const fam of direct) if (lower.includes(fam)) return fam;
  if (lower.includes("grey")) return "gray";
  return null;
}

// Resolve the requested color string into a family + tokens for matching.
function parseRequestedColor(raw: string): {
  tokens: string[];
  family: ColorFamily | null;
} {
  const trimmed = raw.trim();
  const hexRgb = parseHex(trimmed);
  if (hexRgb) {
    return { tokens: [], family: rgbToFamily(hexRgb) };
  }
  const tokens = trimmed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  return { tokens, family: familyFromName(trimmed) };
}

// Best color-match kind for one catalog color against the request.
function colorMatchKind(
  req: { tokens: string[]; family: ColorFamily | null; raw: string },
  color: PressColorInput,
): ColorMatchKind {
  const name = color.name.toLowerCase().trim();
  const rawLower = req.raw.toLowerCase().trim();
  if (rawLower && name === rawLower) return "exact";
  // Partial: a requested token appears in the color name (or vice versa).
  if (req.tokens.length) {
    for (const tok of req.tokens) {
      if (name.includes(tok)) return "partial";
    }
  }
  // Family: classify the catalog color (by name first, then swatch hex)
  // and compare to the requested family.
  if (req.family) {
    const swatchRgb = parseHex(color.swatchHex);
    const colorFam = familyFromName(color.name) ?? (swatchRgb ? rgbToFamily(swatchRgb) : null);
    if (colorFam && colorFam === req.family) return "family";
  }
  return "none";
}

const KIND_SUBSCORE: Record<ColorMatchKind, number> = {
  exact: 1,
  partial: 0.8,
  family: 0.55,
  none: 0,
};

// ── Ladder snapping (mirror of snapToCatalogQuantityTier, pure) ──────

function snapLadder(
  ladder: { qty: number; unitCents: number; confirmed?: boolean }[],
  quantity: number,
): { unitCents: number; snappedQty: number; requiresQuote: boolean } | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  const sorted = ladder.filter((r) => r.confirmed !== false).sort((a, b) => a.qty - b.qty);
  if (sorted.length === 0) return null;
  const n = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
  for (const r of sorted) if (n <= r.qty) return { unitCents: r.unitCents, snappedQty: r.qty, requiresQuote: false };
  const top = sorted[sorted.length - 1];
  return { unitCents: top.unitCents, snappedQty: top.qty, requiresQuote: true };
}

// ── Location helpers ─────────────────────────────────────────────────

const COUNTRY_WORDS = new Set([
  "usa", "us", "united", "states", "america", "uk", "canada", "germany",
  "france", "netherlands", "czech", "republic", "europe", "eu",
]);

function locationSubScore(preferred: string, pressLocation: string | null): { score: number; note: string } {
  if (!pressLocation || !pressLocation.trim()) {
    return { score: 0, note: "Location not on file" };
  }
  const reqTokens = preferred.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const locLower = pressLocation.toLowerCase();
  const locTokens = new Set(locLower.split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  const cityRegionHit = reqTokens.some((t) => !COUNTRY_WORDS.has(t) && locTokens.has(t));
  if (cityRegionHit) return { score: 1, note: `Matches “${pressLocation}”` };
  const countryHit = reqTokens.some((t) => COUNTRY_WORDS.has(t) && locTokens.has(t));
  if (countryHit) return { score: 0.55, note: `Same country (${pressLocation})` };
  return { score: 0.15, note: `Different region (${pressLocation})` };
}

// ── Turnaround helpers ───────────────────────────────────────────────

function effectiveMaxWeeks(c: PressCandidateInput): number | null {
  if (c.turnaroundWeeksMax != null) return c.turnaroundWeeksMax;
  if (c.turnaroundWeeksMin != null) return c.turnaroundWeeksMin;
  if (c.turnaroundDays != null) return Math.ceil(c.turnaroundDays / 7);
  return null;
}

// ── Main scorer ──────────────────────────────────────────────────────

export function scorePressMatches(
  spec: PressMatchSpec,
  candidates: PressCandidateInput[],
): PressMatchResult[] {
  const wantColor = !!(spec.color && spec.color.trim());
  const wantLocation = !!(spec.preferredLocation && spec.preferredLocation.trim());
  const wantTurnaround = spec.maxTurnaroundWeeks != null && spec.maxTurnaroundWeeks > 0;
  const reqColor = wantColor
    ? { ...parseRequestedColor(spec.color!.trim()), raw: spec.color!.trim() }
    : null;

  // First pass: resolve each candidate's best option + hard fails.
  type Resolved = {
    candidate: PressCandidateInput;
    failedHard: string[];
    tierId: string | null;
    tierName: string | null;
    colorMatch: PressMatchResult["colorMatch"];
    colorKind: ColorMatchKind;
    unitCents: number | null;
    snappedQty: number | null;
    requiresQuote: boolean;
  };

  const resolved: Resolved[] = candidates.map((c) => {
    const failedHard: string[] = [];
    const offersFormat = c.formats.includes(spec.format);
    if (!offersFormat) {
      failedHard.push(`Doesn't press ${ALBUM_FORMAT_LABEL[spec.format]}`);
      return {
        candidate: c, failedHard, tierId: null, tierName: null,
        colorMatch: null, colorKind: "none", unitCents: null,
        snappedQty: null, requiresQuote: false,
      };
    }

    // Pick the best tier. With a color request we want the best color
    // match (then cheapest among equally-good matches). Without one we
    // just want the cheapest tier.
    let best: {
      tierId: string; tierName: string;
      colorMatch: PressMatchResult["colorMatch"]; colorKind: ColorMatchKind;
      unitCents: number | null; snappedQty: number | null; requiresQuote: boolean;
    } | null = null;

    for (const tier of c.tiers) {
      const snap = snapLadder(tier.ladder, spec.quantity);
      const unitCents = snap?.unitCents ?? null;
      const snappedQty = snap?.snappedQty ?? null;
      const requiresQuote = snap ? snap.requiresQuote : true;

      if (reqColor) {
        // Best color in this tier.
        let tierBestKind: ColorMatchKind = "none";
        let tierBestColor: PressColorInput | null = null;
        for (const color of tier.colors) {
          const kind = colorMatchKind(reqColor, color);
          if (KIND_SUBSCORE[kind] > KIND_SUBSCORE[tierBestKind]) {
            tierBestKind = kind;
            tierBestColor = color;
          }
        }
        if (tierBestKind === "none" || !tierBestColor) continue; // tier has no matching color
        const candidateOption = {
          tierId: tier.id, tierName: tier.name,
          colorMatch: {
            id: tierBestColor.id, name: tierBestColor.name,
            swatchHex: tierBestColor.swatchHex, kind: tierBestKind,
          },
          colorKind: tierBestKind, unitCents, snappedQty, requiresQuote,
        };
        if (!best) { best = candidateOption; continue; }
        // Prefer better color kind; tie-break on lower known price.
        const better =
          KIND_SUBSCORE[tierBestKind] > KIND_SUBSCORE[best.colorKind] ||
          (KIND_SUBSCORE[tierBestKind] === KIND_SUBSCORE[best.colorKind] &&
            (unitCents ?? Infinity) < (best.unitCents ?? Infinity));
        if (better) best = candidateOption;
      } else {
        // No color request → cheapest priceable tier.
        const candidateOption = {
          tierId: tier.id, tierName: tier.name,
          colorMatch: null, colorKind: "none" as ColorMatchKind,
          unitCents, snappedQty, requiresQuote,
        };
        if (!best || (unitCents ?? Infinity) < (best.unitCents ?? Infinity)) best = candidateOption;
      }
    }

    if (reqColor && !best) {
      failedHard.push(`No ${spec.color!.trim()} option in ${ALBUM_FORMAT_LABEL[spec.format]}`);
    }
    if (!reqColor && !best) {
      // Format listed but no priceable tier at all.
      failedHard.push("No catalog pricing on file");
    }

    return {
      candidate: c, failedHard,
      tierId: best?.tierId ?? null,
      tierName: best?.tierName ?? null,
      colorMatch: best?.colorMatch ?? null,
      colorKind: best?.colorKind ?? "none",
      unitCents: best?.unitCents ?? null,
      snappedQty: best?.snappedQty ?? null,
      requiresQuote: best?.requiresQuote ?? false,
    };
  });

  const matching = resolved.filter((r) => r.failedHard.length === 0);
  const knownPrices = matching.map((r) => r.unitCents).filter((u): u is number => u != null && u > 0);
  const bestUnit = knownPrices.length ? Math.min(...knownPrices) : null;

  const results: PressMatchResult[] = resolved.map((r) => {
    const c = r.candidate;
    const isMatch = r.failedHard.length === 0;

    // Price factor.
    let priceScore = 0;
    let priceNote = "—";
    if (isMatch) {
      if (r.unitCents != null && r.unitCents > 0 && bestUnit != null) {
        priceScore = Math.max(0, Math.min(1, bestUnit / r.unitCents));
        priceNote = `${formatUsdCents(r.unitCents)}/unit at ${r.snappedQty}`;
        if (r.requiresQuote) priceNote += " (above top rung — custom quote)";
      } else {
        priceScore = NEEDS_QUOTE_PRICE_SUBSCORE;
        priceNote = "No confirmed ladder — needs a quote";
      }
    }

    // Color factor.
    const colorScore = r.colorMatch ? KIND_SUBSCORE[r.colorMatch.kind] : 0;
    const colorNote = !wantColor
      ? "No color requested"
      : r.colorMatch
        ? `${r.colorMatch.name} (${r.colorMatch.kind} match)`
        : "No matching color";

    // Turnaround factor.
    let turnScore = 0;
    let turnNote = "—";
    if (wantTurnaround) {
      const effMax = effectiveMaxWeeks(c);
      if (effMax == null) {
        turnScore = 0.4;
        turnNote = "Turnaround not on file";
      } else if (effMax <= (spec.maxTurnaroundWeeks as number)) {
        turnScore = 1;
        turnNote = `~${effMax} wks — within ${spec.maxTurnaroundWeeks}`;
      } else {
        turnScore = Math.max(0.05, Math.min(0.95, (spec.maxTurnaroundWeeks as number) / effMax));
        turnNote = `~${effMax} wks — over ${spec.maxTurnaroundWeeks}`;
      }
    } else {
      const effMax = effectiveMaxWeeks(c);
      turnNote = effMax != null ? `~${effMax} wks` : "Turnaround not on file";
    }

    // Location factor.
    let locScore = 0;
    let locNote = c.location ?? "Location not on file";
    if (wantLocation) {
      const ls = locationSubScore(spec.preferredLocation!.trim(), c.location);
      locScore = ls.score;
      locNote = ls.note;
    }

    const factors = {
      price: { active: true, weight: PRICE_WEIGHT, score: priceScore, note: priceNote },
      color: { active: wantColor, weight: COLOR_WEIGHT, score: colorScore, note: colorNote },
      turnaround: { active: wantTurnaround, weight: TURNAROUND_WEIGHT, score: turnScore, note: turnNote },
      location: { active: wantLocation, weight: LOCATION_WEIGHT, score: locScore, note: locNote },
    };

    // Weighted average over active factors only.
    let weightSum = 0;
    let weighted = 0;
    for (const f of Object.values(factors)) {
      if (!f.active) continue;
      weightSum += f.weight;
      weighted += f.weight * f.score;
    }
    const score = isMatch && weightSum > 0 ? Math.round((weighted / weightSum) * 100) : 0;

    return {
      pressId: c.pressId,
      name: c.name,
      logoUrl: c.logoUrl,
      location: c.location,
      turnaroundWeeksMin: c.turnaroundWeeksMin,
      turnaroundWeeksMax: c.turnaroundWeeksMax,
      turnaroundDays: c.turnaroundDays,
      matches: isMatch,
      failedHard: r.failedHard,
      tierId: r.tierId,
      tierName: r.tierName,
      colorMatch: r.colorMatch,
      unitCents: r.unitCents,
      snappedQty: r.snappedQty,
      requiresQuote: r.requiresQuote,
      score,
      factors,
    };
  });

  // Matching first (by score desc, then price asc), then non-matching.
  results.sort((a, b) => {
    if (a.matches !== b.matches) return a.matches ? -1 : 1;
    if (a.matches) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.unitCents ?? Infinity) - (b.unitCents ?? Infinity);
    }
    return 0;
  });

  return results;
}
