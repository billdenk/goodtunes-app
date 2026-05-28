// Task #654 — Carry-over helper for the "Change the physical format"
// flow on a SkuRow. When the artist swaps a saved (or draft) SKU's
// format from the overlay icon on the album jacket, we keep as much
// of their existing picks as the target format can actually press,
// then snap the rest to sensible defaults so the new row never lands
// in an invalid state.
//
// Two paths, mirrored from SellPanel's SkuRow:
//   • Catalog (invited press): per-format tiers/colors/qty ladders.
//   • Legacy (no invited press / format not in catalog): shared
//     VINYL_COLORS list + shared VINYL_QUANTITY_TIERS ladder.
//
// The helper is pure — it returns the next picks plus a `changes`
// list the caller renders as a toast (e.g. "Color → Black", "Qty → 100").

import {
  DEFAULT_JACKET_UPGRADE,
  DEFAULT_VINYL_COLOR_ID,
  DEFAULT_VINYL_QUANTITY,
  VINYL_COLOR_BY_ID,
  VINYL_COLORS,
  VINYL_QUANTITY_TIERS,
  isVinylFormat,
  type JacketUpgrade,
  type VinylColorOption,
} from "@shared/pressing";
import type { AlbumFormat } from "@shared/schema";

type CatalogColor = {
  id: string;
  name: string;
  swatchHex: string | null;
};
type CatalogTier = {
  id: string;
  name: string;
  priceLadder: { qty: number; unitCents: number; confirmed?: boolean }[];
  colors: CatalogColor[];
};
export type CatalogFormatRow = {
  format: AlbumFormat;
  tiers: CatalogTier[];
};

export type SkuPicks = {
  // Legacy picks
  vinylColorId: string | null;
  jacketUpgrade: JacketUpgrade;
  // Catalog picks (resolved by id on the *current* format's catalog)
  pressTierId: string | null;
  pressColorId: string | null;
  // Common
  plannedQuantity: number;
  priceCents: number | null;
};

export type SkuAdaptResult = {
  next: SkuPicks;
  changes: string[];
};

// "Standard / Black" canonical defaults the post-snap path falls back
// to whenever a matching tier/color isn't found on the new format.
const DEFAULT_TIER_NAME = "Standard";

// Normalize a color name for fuzzy matching across catalogs that
// disagree on punctuation, capitalization, or trailing modifiers like
// "(Coke Bottle)". Strips non-alphanumerics and lowercases.
function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Convert a CSS hex (#aabbcc) into RGB tuple. Returns null for any
// non-hex value (gradients, named colors, swatch images) — those skip
// the distance heuristic and only match by name.
function hexToRgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Best-effort color match: exact-normalized name → shared significant
// tokens (e.g. "Transparent Blue Coral" and "Steampunk Azul" share
// "blue") → closest swatch RGB (≤ 90 distance). Returns null when no
// candidate is close enough — caller falls back to the tier's first
// color so the row stays valid.
function pickClosestCatalogColor(
  candidates: CatalogColor[],
  fromName: string | null,
  fromSwatchHex: string | null,
): CatalogColor | null {
  if (candidates.length === 0) return null;
  const wantName = fromName ? normaliseName(fromName) : "";
  if (wantName) {
    const exact = candidates.find((c) => normaliseName(c.name) === wantName);
    if (exact) return exact;
    const wantTokens = new Set(wantName.split(" ").filter((t) => t.length > 2));
    if (wantTokens.size > 0) {
      const tokenMatch = candidates.find((c) =>
        normaliseName(c.name)
          .split(" ")
          .some((t) => t.length > 2 && wantTokens.has(t)),
      );
      if (tokenMatch) return tokenMatch;
    }
  }
  const wantRgb = hexToRgb(fromSwatchHex);
  if (wantRgb) {
    let best: { c: CatalogColor; d: number } | null = null;
    for (const c of candidates) {
      const rgb = hexToRgb(c.swatchHex);
      if (!rgb) continue;
      const d = rgbDistance(wantRgb, rgb);
      if (!best || d < best.d) best = { c, d };
    }
    if (best && best.d <= 90) return best.c;
  }
  return null;
}

function pickClosestLegacyColor(
  fromId: string,
): VinylColorOption {
  const from = VINYL_COLOR_BY_ID[fromId];
  if (from) return from;
  return VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];
}

// Snap a quantity onto a ladder (catalog or legacy). Picks the
// CLOSEST rung (up or down) — on an exact tie the lower rung wins
// so we never silently push the artist into a more expensive run.
function snapLadder(rungs: number[], input: number): number {
  if (rungs.length === 0) return input;
  const sorted = [...rungs].sort((a, b) => a - b);
  let best = sorted[0];
  let bestDist = Math.abs(sorted[0] - input);
  for (let i = 1; i < sorted.length; i += 1) {
    const r = sorted[i];
    const d = Math.abs(r - input);
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}

// Resolve the *current* picks on the row into their human-readable
// names + swatch so the adapter can match them onto the target
// format. The catalog path uses the current catalog row to look up
// the picked tier/color by id; the legacy path uses VINYL_COLORS.
function resolveCurrentNames(opts: {
  fromCatalog: CatalogFormatRow | null;
  picks: SkuPicks;
}): { tierName: string | null; colorName: string | null; colorSwatchHex: string | null } {
  const { fromCatalog, picks } = opts;
  if (fromCatalog && picks.pressTierId) {
    const tier = fromCatalog.tiers.find((t) => t.id === picks.pressTierId);
    const color = tier?.colors.find((c) => c.id === picks.pressColorId) ?? null;
    return {
      tierName: tier?.name ?? null,
      colorName: color?.name ?? null,
      colorSwatchHex: color?.swatchHex ?? null,
    };
  }
  if (picks.vinylColorId) {
    const c = pickClosestLegacyColor(picks.vinylColorId);
    return { tierName: null, colorName: c.name, colorSwatchHex: c.swatch.startsWith("#") ? c.swatch : null };
  }
  return { tierName: null, colorName: null, colorSwatchHex: null };
}

export function adaptSkuToFormat(input: {
  currentFormat: AlbumFormat;
  targetFormat: AlbumFormat;
  picks: SkuPicks;
  fromCatalog: CatalogFormatRow | null;
  toCatalog: CatalogFormatRow | null;
}): SkuAdaptResult {
  const { currentFormat, targetFormat, picks, fromCatalog, toCatalog } = input;
  if (currentFormat === targetFormat) {
    return { next: picks, changes: [] };
  }
  const targetIsVinyl = isVinylFormat(targetFormat);
  const changes: string[] = [];

  // Jacket upgrade only applies to 12_double on the current model
  // (12_lp and 7_inch are locked to standard; non-vinyl has no jacket
  // upgrade at all). Snap to none whenever the target doesn't support it.
  const jacketAllowedOnTarget =
    targetIsVinyl && targetFormat !== "12_lp" && targetFormat !== "7_inch";
  let nextJacket: JacketUpgrade = picks.jacketUpgrade;
  if (!jacketAllowedOnTarget && nextJacket !== DEFAULT_JACKET_UPGRADE) {
    const fromJacket = picks.jacketUpgrade;
    nextJacket = DEFAULT_JACKET_UPGRADE;
    changes.push(`Jacket: ${fromJacket} → Standard`);
  }

  // Catalog path on the target — every format has its own tiers and
  // colors, so we look up the current pick by NAME (ids don't cross
  // formats) on the new format's catalog.
  if (toCatalog && toCatalog.tiers.length > 0) {
    const current = resolveCurrentNames({ fromCatalog, picks });
    const tiersSortedByCheapest = [...toCatalog.tiers].sort((a, b) => {
      const aMin = Math.min(...a.priceLadder.filter((r) => r.confirmed !== false).map((r) => r.unitCents), Number.POSITIVE_INFINITY);
      const bMin = Math.min(...b.priceLadder.filter((r) => r.confirmed !== false).map((r) => r.unitCents), Number.POSITIVE_INFINITY);
      return aMin - bMin;
    });
    let matchedTier =
      (current.tierName
        ? toCatalog.tiers.find((t) => normaliseName(t.name) === normaliseName(current.tierName!))
        : null) ?? null;
    if (!matchedTier) {
      const standard = toCatalog.tiers.find(
        (t) => normaliseName(t.name) === normaliseName(DEFAULT_TIER_NAME),
      );
      matchedTier = standard ?? tiersSortedByCheapest[0] ?? toCatalog.tiers[0];
      if (current.tierName)
        changes.push(`Tier: ${current.tierName} → ${matchedTier.name}`);
    }
    const matchedColor =
      pickClosestCatalogColor(matchedTier.colors, current.colorName, current.colorSwatchHex) ??
      matchedTier.colors[0] ??
      null;
    if (current.colorName && matchedColor && normaliseName(matchedColor.name) !== normaliseName(current.colorName)) {
      changes.push(`Color: ${current.colorName} → ${matchedColor.name}`);
    }
    // Quantity: snap onto target tier's ladder rungs (confirmed only).
    const rungs = matchedTier.priceLadder
      .filter((r) => r.confirmed !== false)
      .map((r) => r.qty);
    const snappedQty = snapLadder(rungs, picks.plannedQuantity);
    if (snappedQty !== picks.plannedQuantity) {
      changes.push(
        `Qty: ${picks.plannedQuantity.toLocaleString()} → ${snappedQty.toLocaleString()}`,
      );
    }
    return {
      next: {
        vinylColorId: null,
        jacketUpgrade: nextJacket,
        pressTierId: matchedTier.id,
        pressColorId: matchedColor?.id ?? null,
        plannedQuantity: snappedQty,
        priceCents: picks.priceCents,
      },
      changes,
    };
  }

  // Legacy path on the target — no per-format catalog. Color carries
  // over from VINYL_COLORS *only* if the id resolves to a known
  // option AND the option's tier is allowed on the target format
  // (mirrors SEVEN_INCH_VISIBLE_TIERS in SellPanel: 7" only shows
  // black + opaque, every other format shows the full grid).
  // Anything unsupported snaps to the platform default (Black).
  // Quantity snaps to the closest rung on the shared
  // VINYL_QUANTITY_TIERS ladder so we don't bias the artist down off
  // their planned run.
  if (targetIsVinyl) {
    const fromColorId = picks.vinylColorId ?? "";
    const resolved = fromColorId ? VINYL_COLOR_BY_ID[fromColorId] : null;
    const allowedTiers: ReadonlyArray<string> | null =
      targetFormat === "7_inch" ? ["black", "opaque"] : null;
    const tierAllowed = resolved
      ? allowedTiers === null || allowedTiers.includes(resolved.tier)
      : false;
    const colorOpt =
      resolved && tierAllowed
        ? resolved
        : VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];
    if (fromColorId && (!resolved || !tierAllowed)) {
      changes.push(`Color: ${resolved?.name ?? fromColorId} → ${colorOpt.name}`);
    }
    const snappedQty = snapLadder(
      VINYL_QUANTITY_TIERS as unknown as number[],
      picks.plannedQuantity,
    );
    if (snappedQty !== picks.plannedQuantity) {
      changes.push(
        `Qty: ${picks.plannedQuantity.toLocaleString()} → ${snappedQty.toLocaleString()}`,
      );
    }
    return {
      next: {
        vinylColorId: colorOpt.id,
        jacketUpgrade: nextJacket,
        pressTierId: null,
        pressColorId: null,
        plannedQuantity: snappedQty,
        priceCents: picks.priceCents,
      },
      changes,
    };
  }

  // Non-vinyl target (cassette / CD) — color + jacket drop entirely;
  // quantity carries over as-is (legacy non-vinyl rows use a number
  // input, not a rung snap).
  if (picks.vinylColorId || picks.pressTierId) {
    changes.push("Color / tier dropped (cassette/CD)");
  }
  return {
    next: {
      vinylColorId: null,
      jacketUpgrade: DEFAULT_JACKET_UPGRADE,
      pressTierId: null,
      pressColorId: null,
      plannedQuantity: picks.plannedQuantity,
      priceCents: picks.priceCents,
    },
    changes,
  };
}

// Re-exports for callers that already have these from shared/pressing.
export { VINYL_COLORS, VINYL_QUANTITY_TIERS, DEFAULT_VINYL_QUANTITY };
