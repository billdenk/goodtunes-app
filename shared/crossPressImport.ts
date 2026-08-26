// Task #3394 — Cross-press project import (wired, held OFF).
//
// One customer login works across GoodTunes, MRP, PMP and future presses,
// but each press's pricing and customer data stays walled off. This module
// is the press-NEUTRAL core of the customer-initiated "move my project"
// flow: a canonical spec dictionary, a price-free project snapshot, and a
// translation engine that re-projects a snapshot into a destination press's
// own vocabulary.
//
// Ruling principles (Bill):
// - Customer-initiated only. Nothing here ever names, notifies, or signals
//   a press about another press.
// - SPECS TRAVEL, NEVER COMMERCE. Prices, ladders, negotiated rates, fees,
//   totals — none of it may appear in a spec or a translation. This is
//   enforced structurally (allowlist construction) AND at runtime
//   (findForbiddenPriceKeys deep-scan, used by the serializer, the routes,
//   and the isolation tests).
// - Never name the other press: a CanonicalProjectSpec carries an opaque
//   sourceRef, no press id and no press name.
// - Honest translation: exact match, ranked closest-match (customer must
//   confirm), or an honest "no equivalent" — never a silent swap, never a
//   fabricated price ("Pricing pending" rule lives in quotePricing).

// ── Feature flags ────────────────────────────────────────────────────────
// GoodTunes-side "My projects" cross-press view. Compile-time OFF (house
// pattern: client/src/lib/platform.ts literal-false gates). Turning it on
// is a separate, deliberate decision — see the Ruby brief.
export const CROSS_PRESS_MY_PROJECTS_ENABLED = false;
// The per-press customer import entry point is a DB flag:
// manufacturers.cross_press_import_enabled (default false, operator-set).

// ── Canonical vocabulary ─────────────────────────────────────────────────
export const CANONICAL_EFFECT_FAMILIES = [
  "black",
  "opaque",
  "translucent",
  "splatter",
  "marble",
  "picture",
  "glow",
  "metallic",
  "custom",
] as const;
export type CanonicalEffectFamily = (typeof CANONICAL_EFFECT_FAMILIES)[number];

export const CANONICAL_COLOR_FAMILIES = [
  "black",
  "white",
  "grey",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "brown",
  "clear",
  "gold",
  "silver",
  "multi",
] as const;
export type CanonicalColorFamily = (typeof CANONICAL_COLOR_FAMILIES)[number];

export const CANONICAL_JACKET_CONSTRUCTIONS = [
  "single_pocket",
  "gatefold",
  "trifold",
  "discobag",
  "wide_spine",
  "generic",
] as const;
export type CanonicalJacketConstruction = (typeof CANONICAL_JACKET_CONSTRUCTIONS)[number];

/** Stored operator overrides (press_color_tiers/press_colors/press_jackets
 * .canonical_attrs). `confirmed` marks an operator-reviewed mapping in the
 * god-view surface; absent/derived rows fall back to the name heuristics. */
export type TierCanonicalAttrs = { effectFamily?: CanonicalEffectFamily; confirmed?: boolean };
export type ColorCanonicalAttrs = { colorFamily?: CanonicalColorFamily; confirmed?: boolean };
export type JacketCanonicalAttrs = { construction?: CanonicalJacketConstruction; confirmed?: boolean };

// ── Name → canonical derivation heuristics ──────────────────────────────
// Same family as server/pressComponents.ts kindForTierName, extended. These
// are the SEED mappings for every onboarded press; the god-view surface
// lets an operator confirm or correct them (stored wins over derived).
export function deriveEffectFamily(tierName: string): CanonicalEffectFamily {
  const n = String(tierName ?? "").toLowerCase();
  if (n.includes("splatter") || n.includes("splash")) return "splatter";
  if (n.includes("marble") || n.includes("swirl") || n.includes("galaxy") || n.includes("smoke")) return "marble";
  if (n.includes("picture")) return "picture";
  if (n.includes("glow")) return "glow";
  if (n.includes("metallic") || n.includes("chrome")) return "metallic";
  if (n.includes("translucent") || n.includes("transparent") || n.includes("clear") || n.includes("neon")) return "translucent";
  if (n.includes("custom")) return "custom";
  if (n.includes("black")) return "black";
  return "opaque";
}

const COLOR_NAME_TOKENS: [CanonicalColorFamily, string[]][] = [
  ["multi", ["splatter", "split", "tri-color", "tricolor", "multi", "rainbow", "cornetto", "a/b"]],
  ["clear", ["clear", "crystal", "transparent", "ultra clear"]],
  ["gold", ["gold"]],
  ["silver", ["silver"]],
  ["black", ["black", "onyx", "midnight"]],
  ["white", ["white", "bone", "ivory", "cream"]],
  ["grey", ["grey", "gray", "smoke", "charcoal", "slate"]],
  ["purple", ["purple", "violet", "lavender", "grape", "plum", "orchid", "amethyst"]],
  ["pink", ["pink", "rose", "magenta", "fuchsia", "salmon", "coral"]],
  ["red", ["red", "crimson", "scarlet", "ruby", "blood", "cherry", "maroon", "oxblood", "burgundy"]],
  ["orange", ["orange", "tangerine", "apricot", "peach", "amber", "halloween"]],
  ["yellow", ["yellow", "lemon", "canary", "mustard", "piss", "custard"]],
  ["green", ["green", "olive", "mint", "emerald", "jade", "forest", "lime", "sea glass", "seafoam", "swamp"]],
  ["blue", ["blue", "navy", "cobalt", "royal", "sky", "cyan", "teal", "turquoise", "aqua", "ocean", "curacao"]],
  ["brown", ["brown", "coffee", "chocolate", "tan", "beer", "root beer", "bronze", "copper"]],
];

/** Best-effort colour family from name, falling back to a hue bucket from
 * the swatch hex. Returns null when neither says anything — an honest
 * "unknown" beats a fabricated family. */
export function deriveColorFamily(colorName: string, swatchHex?: string | null): CanonicalColorFamily | null {
  const n = String(colorName ?? "").toLowerCase();
  for (const [family, tokens] of COLOR_NAME_TOKENS) {
    if (tokens.some((t) => n.includes(t))) return family;
  }
  const hex = typeof swatchHex === "string" ? swatchHex.trim() : "";
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.08) {
    if (l < 0.14) return "black";
    if (l > 0.86) return "white";
    return "grey";
  }
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

export function deriveJacketConstruction(jacketName: string): CanonicalJacketConstruction {
  const n = String(jacketName ?? "").toLowerCase();
  if (n.includes("gatefold")) return "gatefold";
  if (n.includes("trifold") || n.includes("tri-fold")) return "trifold";
  if (n.includes("discobag") || n.includes("disco bag")) return "discobag";
  if (n.includes("wide") && n.includes("spine")) return "wide_spine";
  if (n.includes("single") || n.includes("standard") || n.includes("pocket") || n.includes("jacket")) return "single_pocket";
  return "generic";
}

// ── Destination quote-builder vocabulary ─────────────────────────────────
// The quote builder hydrates payload.builderState in ITS OWN vocabulary:
// jacketId is a symbolic style id (never a press_jackets UUID), colorId is a
// press_colors row id, and colorKind is the slug of the tier name. An import
// draft must speak this vocabulary exactly or the builder silently keeps its
// defaults. Mirrors JACKET_CATALOG + slugKind in PressQuoteBuilder.tsx.
export const BUILDER_JACKET_STYLES: Record<string, { id: string; name: string }[]> = {
  "7": [
    { id: "single", name: "Single Jacket" },
    { id: "gatefold", name: "Gatefold Jacket" },
  ],
  "10": [
    { id: "single", name: "Single Jacket" },
    { id: "gatefold", name: "Gatefold Jacket" },
  ],
  "12": [
    { id: "single", name: "Single Jacket" },
    { id: "gatefold", name: "Gatefold Jacket" },
    { id: "trifold", name: "Tri-Fold Gatefold Jacket" },
    { id: "discobag", name: "Discobag" },
  ],
};

/** Canonical construction → the builder's symbolic jacket style id.
 * wide_spine is a VARIANT of single in the builder (jacketVariantId), so it
 * lands on "single"; "generic" has no deterministic style (null → the
 * customer confirms one). */
export const CONSTRUCTION_TO_BUILDER_STYLE: Record<CanonicalJacketConstruction, string | null> = {
  single_pocket: "single",
  gatefold: "gatefold",
  trifold: "trifold",
  discobag: "discobag",
  wide_spine: "single",
  generic: null,
};

/** Mirrors the builder's slugKind — colorKind is the slug of the tier name. */
export function slugTierKind(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// ── Price firewall ───────────────────────────────────────────────────────
/** Any key matching this pattern is COMMERCE and must never appear in a
 * spec, a translation, or any import API payload. */
export const FORBIDDEN_PRICE_KEY_RE =
  /price|cents|cost|ladder|rate|total|fee|margin|discount|invoice|payout|dollar|amount/i;

/** Deep-scan an object for commerce keys; returns the offending key paths
 * (empty = clean). Used by the serializer, the routes, and the tests. */
export function findForbiddenPriceKeys(value: unknown, path = ""): string[] {
  const hits: string[] = [];
  if (!value || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findForbiddenPriceKeys(v, `${path}[${i}]`)));
    return hits;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (FORBIDDEN_PRICE_KEY_RE.test(k)) hits.push(p);
    else hits.push(...findForbiddenPriceKeys(v, p));
  }
  return hits;
}

// ── Press-neutral project snapshot (the portable unit) ──────────────────
export type CanonicalSpecSource = { kind: "estimate" | "album_sku"; id: string };

export type CanonicalProjectSpec = {
  specVersion: 1;
  /** Opaque pointer back to the customer's own record. NO press id, NO
   * press name — a spec must be presentable inside any press portal
   * without leaking where it came from. */
  sourceRef: CanonicalSpecSource;
  title: string | null;
  savedAt: string | null;
  /** AlbumFormat key when known (7_inch / 12_lp / 12_double / …). */
  format: string | null;
  /** Builder vocabulary: "7" | "10" | "12". */
  sizeId: string | null;
  discs: number | null;
  /** Builder vocabulary: "140" | "180". */
  weightId: string | null;
  color: {
    name: string | null;
    tierName: string | null;
    effectFamily: CanonicalEffectFamily | null;
    colorFamily: CanonicalColorFamily | null;
  };
  jacket: { name: string | null; construction: CanonicalJacketConstruction | null };
  /** Shared component-style ids carried verbatim (destination re-validates). */
  sleeveId: string | null;
  labelId: string | null;
  insertId: string | null;
  stickerShapeId: string | null;
  /** songs.vinylSide-derived side breaks, when the source is an album. */
  sideBreaks: { side: string; tracks: number }[] | null;
  lastQuantity: number | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** Build a spec from a saved quote-builder state (press_estimates
 * payload.builderState). ALLOWLIST construction: unknown keys — including
 * every price/total field the payload also carries — can never travel. */
export function specFromBuilderState(input: {
  sourceRef: CanonicalSpecSource;
  title?: string | null;
  savedAt?: string | null;
  builderState: Record<string, unknown> | null | undefined;
  /** Canonical attrs of the SOURCE tier/jacket when the caller resolved
   * them; falls back to name-derivation. */
  tierAttrs?: TierCanonicalAttrs | null;
  colorAttrs?: ColorCanonicalAttrs | null;
}): CanonicalProjectSpec {
  const bs = (input.builderState ?? {}) as Record<string, unknown>;
  const colorName = str(bs.colorName);
  const tierName = str(bs.colorTierName);
  const jacketName = str(bs.jacketId); // builder jacket ids are style names
  const spec: CanonicalProjectSpec = {
    specVersion: 1,
    sourceRef: { kind: input.sourceRef.kind, id: String(input.sourceRef.id) },
    title: str(input.title) ?? null,
    savedAt: str(input.savedAt) ?? null,
    format: null,
    sizeId: str(bs.sizeId),
    discs: num(bs.discs),
    weightId: str(bs.weightId),
    color: {
      name: colorName,
      tierName,
      effectFamily:
        input.tierAttrs?.effectFamily ?? (tierName ? deriveEffectFamily(tierName) : null),
      colorFamily:
        input.colorAttrs?.colorFamily ?? (colorName ? deriveColorFamily(colorName) : null),
    },
    jacket: {
      name: jacketName,
      construction: jacketName ? deriveJacketConstruction(jacketName) : null,
    },
    sleeveId: str(bs.sleeveId),
    labelId: str(bs.labelId),
    insertId: str(bs.insertId),
    stickerShapeId: str(bs.stickerShapeId),
    sideBreaks: null,
    lastQuantity: num(bs.qty) ?? num(bs.quantity),
  };
  assertSpecPriceFree(spec);
  return spec;
}

/** Build a spec from an album's pressing snapshot (album_skus). The row
 * carries costSnapshot* columns — none are read here (allowlist). */
export function specFromSkuSnapshot(input: {
  sourceRef: CanonicalSpecSource;
  title?: string | null;
  savedAt?: string | null;
  format?: string | null; // album_skus.format / albums.vinylFormat
  vinylColor?: string | null;
  vinylColorTier?: string | null;
  jacketUpgrade?: string | null;
  quantityTier?: number | string | null;
  sideBreaks?: { side: string; tracks: number }[] | null;
  tierAttrs?: TierCanonicalAttrs | null;
  colorAttrs?: ColorCanonicalAttrs | null;
  jacketAttrs?: JacketCanonicalAttrs | null;
}): CanonicalProjectSpec {
  const format = str(input.format);
  const colorName = str(input.vinylColor);
  const tierName = str(input.vinylColorTier);
  const jacketName = str(input.jacketUpgrade);
  const qty =
    typeof input.quantityTier === "number"
      ? num(input.quantityTier)
      : num(Number.parseInt(String(input.quantityTier ?? ""), 10));
  const spec: CanonicalProjectSpec = {
    specVersion: 1,
    sourceRef: { kind: input.sourceRef.kind, id: String(input.sourceRef.id) },
    title: str(input.title) ?? null,
    savedAt: str(input.savedAt) ?? null,
    format,
    sizeId: format === "7_inch" ? "7" : format?.startsWith("10") ? "10" : format ? "12" : null,
    discs: format === "12_double" ? 2 : format ? 1 : null,
    weightId: null,
    color: {
      name: colorName,
      tierName,
      effectFamily:
        input.tierAttrs?.effectFamily ?? (tierName ? deriveEffectFamily(tierName) : null),
      colorFamily:
        input.colorAttrs?.colorFamily ?? (colorName ? deriveColorFamily(colorName) : null),
    },
    jacket: {
      name: jacketName,
      construction:
        input.jacketAttrs?.construction ?? (jacketName ? deriveJacketConstruction(jacketName) : null),
    },
    sleeveId: null,
    labelId: null,
    insertId: null,
    stickerShapeId: null,
    sideBreaks: Array.isArray(input.sideBreaks) && input.sideBreaks.length ? input.sideBreaks : null,
    lastQuantity: qty,
  };
  assertSpecPriceFree(spec);
  return spec;
}

/** Hard runtime firewall — throws rather than let a commerce key travel. */
export function assertSpecPriceFree(value: unknown): void {
  const hits = findForbiddenPriceKeys(value);
  if (hits.length) {
    throw new Error(`cross-press spec must be price-free; forbidden keys: ${hits.join(", ")}`);
  }
}

/** True when a spec carries enough to be worth offering for import. */
export function specIsEligible(spec: CanonicalProjectSpec): boolean {
  return !!(spec.color.name || spec.color.tierName || spec.sizeId || spec.format);
}

// ── Translation engine ───────────────────────────────────────────────────
// The destination catalog input type deliberately has NO price fields — the
// server builds it from the destination press's catalog, dropping ladders on
// the floor. Destination pricing only ever comes from the destination
// press's own ladders once the customer confirms options in the builder.
export type DestinationCatalog = {
  /** Builder size ids the destination offers ("7"/"10"/"12"). */
  sizes: string[];
  /** Builder weight ids ("140"/"180"); empty = unknown (carry, confirm later). */
  weights: string[];
  tiers: {
    id: string;
    name: string;
    formats: string[]; // AlbumFormat keys this tier appears under
    effectFamily: CanonicalEffectFamily;
  }[];
  colors: {
    id: string;
    tierId: string;
    name: string;
    colorFamily: CanonicalColorFamily | null;
    /** AlbumFormat keys this color row is actually sold under (its own tier
     * ROW's format — merged tiers keep per-format color rows distinct);
     * empty/absent = unscoped, offered for every format. */
    formats?: string[];
  }[];
  jackets: {
    id: string;
    name: string;
    construction: CanonicalJacketConstruction;
    /** AlbumFormat keys this jacket applies to (press_jackets.applicableFormats);
     * empty/absent = unscoped, offered for every format. */
    formats?: string[];
  }[];
};

export type FieldMatchStatus = "exact" | "closest" | "none" | "copied";
export type FieldMatch = {
  field:
    | "size"
    | "discs"
    | "weight"
    | "colorTier"
    | "color"
    | "jacket"
    | "sleeve"
    | "label"
    | "insert"
    | "sticker"
    | "quantity";
  sourceValue: string | number | null;
  status: FieldMatchStatus;
  /** Ranked candidates in the DESTINATION press's own vocabulary. For
   * "closest" the customer must pick one; for "exact" the single entry is
   * the resolved option. */
  candidates: { id: string; name: string }[];
  note?: string;
};

export type TranslationProposal = {
  fields: FieldMatch[];
  /** Partial QuoteBuilderState in the destination vocabulary — only fields
   * that resolved exactly or were carried verbatim. Closest-match fields
   * land here ONLY after the customer confirms (the route merges their
   * confirmed picks). Never contains a price key. */
  proposedBuilderState: Record<string, unknown>;
  needsConfirmation: boolean;
};

/** AlbumFormat key → builder size id ("7"/"10"/"12"). Single source of the
 * format↔size bridge so gating and spec-building can never disagree. */
export function sizeIdForFormat(format: string): string {
  if (format === "7_inch") return "7";
  if (format.startsWith("10")) return "10";
  return "12";
}

/** Is a destination option, offered under `formats` (AlbumFormat keys),
 * honestly available for this spec's record? Empty/unknown formats = the
 * press didn't scope it, treat as offered everywhere. When the spec knows
 * its exact format, that wins; a builder-state spec only knows its size, so
 * gate on the size the formats map to. */
function formatsCompatible(formats: string[] | undefined, spec: CanonicalProjectSpec): boolean {
  if (!formats || !formats.length) return true;
  if (spec.format) return formats.includes(spec.format);
  if (spec.sizeId) return formats.some((f) => sizeIdForFormat(f) === spec.sizeId);
  return true;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function nameScore(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let overlap = 0;
  ta.forEach((t) => {
    if (tb.has(t)) overlap++;
  });
  return overlap / Math.max(ta.size, tb.size);
}

export function translateSpec(
  spec: CanonicalProjectSpec,
  dest: DestinationCatalog,
  opts?: {
    /** When the customer has confirmed a specific closest-match tier, the
     * color candidates are regenerated against THAT tier (never the
     * top-ranked guess), so every displayed choice stays coherent. */
    confirmedTierId?: string | null;
  },
): TranslationProposal {
  const fields: FieldMatch[] = [];
  const proposed: Record<string, unknown> = {};

  // Size — canonical vocabulary already; exact when offered, none otherwise.
  if (spec.sizeId) {
    if (dest.sizes.includes(spec.sizeId)) {
      fields.push({ field: "size", sourceValue: spec.sizeId, status: "exact", candidates: [{ id: spec.sizeId, name: `${spec.sizeId}"` }] });
      proposed.sizeId = spec.sizeId;
    } else {
      fields.push({ field: "size", sourceValue: spec.sizeId, status: "none", candidates: [], note: "This size isn't offered here." });
    }
  }
  if (spec.discs) {
    fields.push({ field: "discs", sourceValue: spec.discs, status: "copied", candidates: [] });
    proposed.discs = spec.discs;
  }
  if (spec.weightId) {
    if (!dest.weights.length || dest.weights.includes(spec.weightId)) {
      fields.push({ field: "weight", sourceValue: spec.weightId, status: dest.weights.includes(spec.weightId) ? "exact" : "copied", candidates: [{ id: spec.weightId, name: `${spec.weightId}g` }] });
      proposed.weightId = spec.weightId;
    } else {
      fields.push({ field: "weight", sourceValue: spec.weightId, status: "none", candidates: [], note: "This weight isn't offered here." });
    }
  }

  // Colour tier — canonical effect family drives matching; names differ per
  // press by design. Exact = same family AND (near-)same name; closest =
  // same family, different name (customer confirms the destination tier).
  let matchedTier: DestinationCatalog["tiers"][number] | null = null;
  if (spec.color.tierName || spec.color.effectFamily) {
    const family = spec.color.effectFamily ?? deriveEffectFamily(spec.color.tierName ?? "");
    // Format gating works for BOTH spec shapes: an album-derived spec knows
    // its AlbumFormat; a builder-state spec only knows its size, so tiers
    // scoped to formats of a different size are excluded via the shared
    // format↔size bridge (never offered, never hydrated).
    const formatOk = (t: DestinationCatalog["tiers"][number]) => formatsCompatible(t.formats, spec);
    const sameFamily = dest.tiers.filter((t) => t.effectFamily === family && formatOk(t));
    const ranked = [...sameFamily].sort(
      (a, b) => nameScore(b.name, spec.color.tierName ?? "") - nameScore(a.name, spec.color.tierName ?? ""),
    );
    const exact = ranked.find((t) => spec.color.tierName && nameScore(t.name, spec.color.tierName) >= 0.99);
    if (exact) {
      matchedTier = exact;
      fields.push({ field: "colorTier", sourceValue: spec.color.tierName, status: "exact", candidates: [{ id: exact.id, name: exact.name }] });
      proposed.colorTierName = exact.name;
    } else if (ranked.length) {
      // Colour candidates follow the tier the CUSTOMER confirmed when one is
      // given (and it is a legitimate same-family candidate); only before any
      // confirmation do they preview against the top-ranked guess.
      const confirmed = opts?.confirmedTierId
        ? ranked.find((t) => t.id === opts.confirmedTierId) ?? null
        : null;
      matchedTier = confirmed ?? ranked[0];
      fields.push({
        field: "colorTier",
        sourceValue: spec.color.tierName ?? family,
        status: "closest",
        candidates: ranked.slice(0, 4).map((t) => ({ id: t.id, name: t.name })),
        note: "Closest match here — please confirm.",
      });
    } else {
      fields.push({ field: "colorTier", sourceValue: spec.color.tierName ?? family, status: "none", candidates: [], note: "No equivalent finish offered here." });
    }
  }

  // Colour — exact name inside the matched tier, else same colour family
  // (ranked), else honest none. Never a silent swap.
  if (spec.color.name) {
    // The pool is format-gated too: a color sold only on another size's
    // copy of the tier is not on offer for this record, so it is never a
    // candidate and can never be confirmed (/start validates against these
    // same candidates).
    const pool = (matchedTier ? dest.colors.filter((c) => c.tierId === matchedTier!.id) : dest.colors).filter((c) =>
      formatsCompatible(c.formats, spec),
    );
    const exact = pool.find((c) => nameScore(c.name, spec.color.name!) >= 0.99);
    if (exact && matchedTier && fields.find((f) => f.field === "colorTier")?.status === "exact") {
      fields.push({ field: "color", sourceValue: spec.color.name, status: "exact", candidates: [{ id: exact.id, name: exact.name }] });
      // The builder hydrates colorId (press_colors row id) + colorKind (tier
      // slug); the names ride along for the server /send pricing gate.
      proposed.colorId = exact.id;
      proposed.colorKind = slugTierKind(matchedTier.name);
      proposed.colorName = exact.name;
      proposed.colorTierName = matchedTier.name;
    } else {
      const family = spec.color.colorFamily ?? deriveColorFamily(spec.color.name);
      const ranked = pool
        .map((c) => ({
          c,
          score:
            (exact && c.id === exact.id ? 2 : 0) +
            (family && c.colorFamily === family ? 1 : 0) +
            nameScore(c.name, spec.color.name!),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (ranked.length) {
        // Same-named rows can survive under two compatible formats of one
        // size (e.g. 12_lp + 12_double); show the name once.
        const seenNames = new Set<string>();
        const deduped = ranked.filter((x) => {
          const key = norm(x.c.name);
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        });
        fields.push({
          field: "color",
          sourceValue: spec.color.name,
          status: "closest",
          candidates: deduped.slice(0, 6).map((x) => ({ id: x.c.id, name: x.c.name })),
          note: "Closest colors here — please confirm.",
        });
      } else {
        fields.push({ field: "color", sourceValue: spec.color.name, status: "none", candidates: [], note: "No equivalent color offered here." });
      }
    }
  }

  // Jacket — canonical construction drives matching, but the DESTINATION
  // vocabulary is the quote builder's own symbolic style list (per size),
  // never a press_jackets row id: the builder can only hydrate
  // single/gatefold/trifold/discobag.
  if (spec.jacket.name) {
    const construction = spec.jacket.construction ?? deriveJacketConstruction(spec.jacket.name);
    const size = spec.sizeId && BUILDER_JACKET_STYLES[spec.sizeId] ? spec.sizeId : "12";
    const sizeStyles = BUILDER_JACKET_STYLES[size];
    // The destination's press_jackets rows gate WHICH builder styles are
    // honestly on offer there: map each destination jacket's canonical
    // construction (stored attrs win, name-derivation as fallback) to its
    // symbolic builder style, then intersect with the styles this size
    // supports. A style the destination doesn't represent must never be
    // proposed — not even as a candidate.
    // …and only jackets the destination offers FOR THIS RECORD count: a
    // gatefold sold only for another format must not make gatefold look
    // available here (press_jackets.applicableFormats gates each row).
    const destStyleIds = new Set<string>();
    for (const j of dest.jackets) {
      if (!formatsCompatible(j.formats, spec)) continue;
      const c = j.construction ?? deriveJacketConstruction(j.name);
      const s = CONSTRUCTION_TO_BUILDER_STYLE[c];
      if (s) destStyleIds.add(s);
    }
    const offered = sizeStyles.filter((s) => destStyleIds.has(s.id));
    const mapped = CONSTRUCTION_TO_BUILDER_STYLE[construction];
    const style = mapped ? offered.find((s) => s.id === mapped) ?? null : null;
    if (style) {
      fields.push({ field: "jacket", sourceValue: spec.jacket.name, status: "exact", candidates: [{ id: style.id, name: style.name }] });
      proposed.jacketId = style.id;
    } else if (offered.length === 0) {
      // The destination offers no jacket this size can hydrate — say so.
      fields.push({ field: "jacket", sourceValue: spec.jacket.name, status: "none", candidates: [], note: "No equivalent jacket offered here." });
    } else {
      // The source construction isn't offered here (or is unrecognisable) —
      // the customer explicitly confirms one of the destination's own
      // jackets, or walks away. Never a silent swap.
      fields.push({
        field: "jacket",
        sourceValue: spec.jacket.name,
        status: "closest",
        candidates: offered.map((s) => ({ id: s.id, name: s.name })),
        note: "Closest jackets here — please confirm.",
      });
    }
  }

  // Shared-style component ids travel verbatim; the destination builder
  // re-validates them (an unoffered style simply reads as not-done there).
  const carry: [FieldMatch["field"], string | null, string][] = [
    ["sleeve", spec.sleeveId, "sleeveId"],
    ["label", spec.labelId, "labelId"],
    ["insert", spec.insertId, "insertId"],
    ["sticker", spec.stickerShapeId, "stickerShapeId"],
  ];
  for (const [field, value, key] of carry) {
    if (!value) continue;
    fields.push({ field, sourceValue: value, status: "copied", candidates: [], note: "Carried over — confirm in the builder." });
    proposed[key] = value;
  }

  if (spec.lastQuantity) {
    fields.push({ field: "quantity", sourceValue: spec.lastQuantity, status: "copied", candidates: [] });
    proposed.qty = spec.lastQuantity;
  }

  const proposal: TranslationProposal = {
    fields,
    proposedBuilderState: proposed,
    needsConfirmation: fields.some((f) => f.status === "closest"),
  };
  // Firewall: a translation may never carry commerce either.
  assertSpecPriceFree(proposal);
  return proposal;
}

// ── Masters-release request vocabulary ──────────────────────────────────
export const MASTERS_RELEASE_STATUSES = ["requested", "acknowledged", "released", "declined"] as const;
export type MastersReleaseStatus = (typeof MASTERS_RELEASE_STATUSES)[number];
