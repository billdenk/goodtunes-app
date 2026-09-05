// Press Components — shared shapes (handoff/press-components, 2026-08-12).
//
// Each component's configuration is one jsonb blob on press_components
// (atomic merge PUT). These zod schemas are the single source of truth for
// both the server validation and the client types. The shapes mirror the
// handoff mocks' MOCK_ consts verbatim so the ported screens wire in with
// no reshaping.
//
// Binding rules (handoff/press-components/README.md):
// - GoodTunes Packages are untouchable — the Vinyl component is seeded from
//   them once, then lives independently.
// - Press identity is data (name/logo ride on the payload, never hardcoded).
// - Pricing rows are seeded from the press's existing types/colors with
//   EMPTY price cells (null) — never fabricate a price.

import { z } from "zod";

// ── Vinyl component ────────────────────────────────────────────────────
// Sizes use the mock's literal ids.
export const VINYL_SIZE_IDS = ['7"', '10"', '12"'] as const;
export const vinylSizeIdSchema = z.enum(VINYL_SIZE_IDS);
export type VinylSizeId = z.infer<typeof vinylSizeIdSchema>;

export const swatchKindSchema = z.enum(["black", "opaque", "translucent", "splatter"]);
export type SwatchKind = z.infer<typeof swatchKindSchema>;

const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "hex color");

export const vinylSwatchSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: swatchKindSchema,
  base: hex,
  s1: hex.optional(),
  s2: hex.optional(),
  s3: hex.optional(),
  sizes: z.array(vinylSizeIdSchema).max(3),
  // Uploaded/imported preview photo (splatter, picture disc, marbled).
  customImg: z.string().max(1024).optional(),
  // An imported image without this flag is in the press's migration queue.
  // `true` means an operator explicitly retained/replaced the image.
  imageReviewed: z.boolean().optional(),
  splatterTranslucent: z.boolean().optional(),
  // Generator-made color (handoff/press-vinyl-styles, Aug 20 2026): style +
  // assigned hexes. Presence means the disc renders through the stencil kit
  // and the swatch stays re-openable in the generator for hex tweaks.
  gen: z
    .object({
      styleId: z.string().min(1).max(64),
      colors: z.array(hex).max(8),
      option: z.string().max(64).optional(),
      splatterCount: z.number().int().min(0).max(12).optional(),
      baseKind: z.enum(["opaque", "translucent"]).optional(),
      // Advanced Gradient (handoff 01282b2, Aug 23 2026): per-stop ramp
      // positions (0–1), one per gradient stop. Absent = style defaults.
      locations: z.array(z.number().min(0).max(1)).max(8).optional(),
    })
    .optional(),
  // Hidden = not offered to artists right now. Never deleted — pressed
  // records keep their history.
  hidden: z.boolean().optional(),
});
export type VinylSwatch = z.infer<typeof vinylSwatchSchema>;

export const vinylCategorySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: swatchKindSchema,
  swatches: z.array(vinylSwatchSchema).max(400),
  sizes: z.array(vinylSizeIdSchema).max(3),
  // Set when the style was created through the generator — locks every color
  // added to this style to one stencil style (handoff/press-vinyl-styles).
  genStyleId: z.string().max(64).optional(),
  // Finish styles only: which finishes this style offers artists.
  // Undefined = all of the style's finishes.
  offeredFinishes: z.array(z.string().max(64)).max(24).optional(),
  // Hidden from the artist-facing picker — stays here for the press.
  hidden: z.boolean().optional(),
  // Optional press-supplied photo shown on the style tile (type editor's
  // "Change image" upload) — an /objects/uploads/... URL.
  customImg: z.string().max(500).optional(),
});
export type VinylCategory = z.infer<typeof vinylCategorySchema>;

export const offerOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  note: z.string().max(160).default(""),
});
export type OfferOption = z.infer<typeof offerOptionSchema>;

export const vinylComponentConfigSchema = z.object({
  categories: z.array(vinylCategorySchema).max(60),
  weights: z.array(offerOptionSchema).max(12),
  sizeOptions: z.array(offerOptionSchema).max(8),
  quantities: z.array(offerOptionSchema).max(12),
  // Per-size offered subsets, keyed by size id ("7"/"10"/"12"). Optional —
  // legacy blobs carry only the flat arrays above, which then apply to every
  // size. Once a press edits a specific size, the maps take over (gogoods'
  // Aug 24 2026 bug: toggling LP-count/weight bled across all sizes).
  weightsBySize: z.record(z.string(), z.array(offerOptionSchema).max(12)).optional(),
  quantitiesBySize: z.record(z.string(), z.array(offerOptionSchema).max(12)).optional(),
});
export type VinylComponentConfig = z.infer<typeof vinylComponentConfigSchema>;

// ── MRP "Translucent" group → Standard generator, translucent finish ───
// Task #3451: Memphis Record Pressing's exact "Translucent" category must
// render as generated translucent discs (the Standard style's Translucent
// finish), not as opaque photo tiles. Each color's imported photo is KEPT
// on the swatch (customImg) as the rebuild/compare reference — a swatch
// carrying `gen` renders through the stencil kit, and the editor's compare
// drawer still reads the photo. Scoped to MRP only (callers gate on
// isMemphisPress) and to the EXACT category name "Translucent" — similarly
// named groups ("Translucent Blends", "Ultra Clear", other presses) are
// untouched.

/** Exact-identity match for Memphis Record Pressing — never ILIKE-first-row
    (prod carries decoy manufacturer rows). */
export function isMemphisPress(
  press: { name?: string | null; domain?: string | null } | null | undefined,
): boolean {
  if (!press) return false;
  const name = (press.name ?? "").trim().toLowerCase();
  const domain = (press.domain ?? "").trim().toLowerCase();
  return name === "memphis record pressing" || domain.includes("memphisrecordpressing");
}

const SIX_HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** Normalize a saved swatch hex to the 6-digit form the generator renders
    (GenDisc treats anything else as neutral gray). */
function toSixHex(hexIn: string): string {
  const h = (hexIn ?? "").trim();
  if (SIX_HEX_RE.test(h)) return h;
  const short = /^#([0-9a-fA-F]{3})[0-9a-fA-F]?$/.exec(h); // #rgb / #rgba
  if (short) return "#" + short[1].split("").map((c) => c + c).join("");
  const long = /^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/.exec(h); // #rrggbbaa
  if (long) return "#" + long[1];
  return "#C7C7CC";
}

// MRP's photo-only Translucent imports carry no swatch hex — their saved
// base is the seed fallback below. For those, the generated disc takes the
// canonical name-appropriate hex (mirrors the Task #672 table in
// server/pressCatalog.ts MRP_COLOR_TIERS → "Translucent"; keep in sync).
// A real operator-saved base always wins over this table.
const SEED_PLACEHOLDER_BASE = "#0c0c0c";
const MRP_TRANSLUCENT_HEX: Record<string, string> = {
  "t01 ruby": "#c0566a",
  "t02 ultra clear": "#e8eef2",
  "t03 cobalt": "#5a86c8",
  "t04 emerald": "#5fb98a",
  "t05 grape": "#9a6fc0",
  "t06 light blue": "#a9d2ef",
  "t07 lemonade": "#f2e79a",
  "t08 orange crush": "#f0a866",
  "t09 coke bottle clear": "#8fae93",
  "t10 highlighter yellow": "#e6ee7a",
  "t11 milky clear": "#eae6dd",
  "t12 forest green": "#4f8f63",
  "t13 sea blue": "#79b6c2",
  "t14 tan": "#d8c49a",
  "t15 black ice": "#6b7078",
};

/**
 * Give every gen-less swatch in the exact "Translucent" category a Standard
 * generator spec with the Translucent finish, seeded from its saved swatch
 * color — or, when the saved base is still the import placeholder, from the
 * canonical MRP name table (base is upgraded in step so other surfaces read
 * the real color too). Idempotent: swatches already carrying `gen` are left
 * byte-identical (operator generator edits are never overwritten),
 * photos/sizes/names/ids are untouched, and every other category passes
 * through unchanged.
 */
export function applyMrpTranslucentStandardGen(config: VinylComponentConfig): {
  config: VinylComponentConfig;
  changed: boolean;
} {
  let changed = false;
  const categories = (config.categories ?? []).map((cat) => {
    if ((cat.name ?? "").trim().toLowerCase() !== "translucent") return cat;
    let catChanged = false;
    const swatches = cat.swatches.map((sw) => {
      if (sw.gen) return sw;
      catChanged = true;
      const placeholder = (sw.base ?? "").trim().toLowerCase() === SEED_PLACEHOLDER_BASE;
      const canonical = placeholder
        ? MRP_TRANSLUCENT_HEX[(sw.name ?? "").trim().toLowerCase()]
        : undefined;
      const hex = toSixHex(canonical ?? sw.base);
      return {
        ...sw,
        kind: "translucent" as const,
        base: canonical ?? sw.base,
        gen: { styleId: "standard", colors: [hex], option: "trans" },
      };
    });
    if (!catChanged) return cat;
    changed = true;
    return { ...cat, kind: "translucent" as const, swatches };
  });
  return changed ? { config: { ...config, categories }, changed } : { config, changed: false };
}

// ── Center labels component ────────────────────────────────────────────
export const LABEL_STYLE_IDS = ["blank", "bw", "color"] as const;
export const labelStyleSchema = z.object({
  id: z.enum(LABEL_STYLE_IDS),
  name: z.string().min(1).max(80),
  note: z.string().max(200),
  offered: z.boolean(),
});
export type LabelStyle = z.infer<typeof labelStyleSchema>;

export const labelsComponentConfigSchema = z.object({
  styles: z.array(labelStyleSchema).max(8),
});
export type LabelsComponentConfig = z.infer<typeof labelsComponentConfigSchema>;

// ── Stickers component ─────────────────────────────────────────────────
export const STICKER_SHAPE_IDS = ["rect", "square", "circle", "upc"] as const;
export const stickerShapeOfferSchema = z.object({
  id: z.enum(STICKER_SHAPE_IDS),
  // Which size ids within the shape's fixed size list the press offers.
  offeredSizeIds: z.array(z.string().max(24)).max(24),
  // Task #3049 — shape-level offer flag (absent = offered, keeps existing
  // configs valid). A not-offered shape is excluded wherever artists pick
  // sticker options regardless of its offeredSizeIds.
  offered: z.boolean().optional(),
  // Task #3049 — die-cut template attachments (attach + store only; no
  // validation/preflight here). Shape-level template plus optional
  // per-size templates keyed by size id.
  // Templates are stored via the admin doc-upload sign flow, which mints
  // /objects/uploads/<id> paths — constrain persisted values to exactly that
  // shape so a javascript:/https: string can never land in the config and be
  // rendered as a link to other privileged users.
  templateUrl: z
    .string()
    .regex(/^\/objects\/uploads\/[a-zA-Z0-9._-]+$/, "Template must be an uploaded file path")
    .max(1024)
    .nullable()
    .optional(),
  sizeTemplates: z
    .record(
      z.string().max(24),
      z
        .string()
        .regex(/^\/objects\/uploads\/[a-zA-Z0-9._-]+$/, "Template must be an uploaded file path")
        .max(1024),
    )
    .optional(),
});
export type StickerShapeOffer = z.infer<typeof stickerShapeOfferSchema>;

export const stickersComponentConfigSchema = z.object({
  shapes: z.array(stickerShapeOfferSchema).max(8),
});
export type StickersComponentConfig = z.infer<typeof stickersComponentConfigSchema>;

export const packagingOfferOptionSchema = z.object({
  id: z.string().min(1).max(64),
  offered: z.boolean(),
  // Press-supplied print template. Uploads mint /objects/uploads/<id> paths —
  // constrain persisted values to exactly that shape (same allowlist as the
  // sticker templates) so a javascript:/https: string can never land in the
  // config and be rendered as a link to other privileged users.
  templateUrl: z
    .string()
    .regex(/^\/objects\/uploads\/[a-zA-Z0-9._-]+$/, "Template must be an uploaded file path")
    .max(1024)
    .nullable()
    .default(null),
});
export type PackagingOfferOption = z.infer<typeof packagingOfferOptionSchema>;

// One generic config per packaging page (Jackets / Inner Sleeves / Inserts):
// the style vocabulary (names, notes, variants, visuals) stays client-side;
// only per-style offered/template state persists.
const packagingConfigSchema = z.object({
  options: z.array(packagingOfferOptionSchema).max(24),
});

export const JACKET_STYLE_IDS = ["single", "gatefold", "trifold", "discobag", "pvc"] as const;
export const SLEEVE_STYLE_IDS = [
  "printed-paper",
  "printed-board",
  "white",
  "black",
  "white-poly",
  "black-poly",
] as const;
export const INSERT_STYLE_IDS = ["sheet", "gatefold", "booklet", "poster"] as const;

export const jacketsComponentConfigSchema = packagingConfigSchema;
export type JacketsComponentConfig = z.infer<typeof jacketsComponentConfigSchema>;
export const sleevesComponentConfigSchema = packagingConfigSchema;
export type SleevesComponentConfig = z.infer<typeof sleevesComponentConfigSchema>;
export const insertsComponentConfigSchema = packagingConfigSchema;
export type InsertsComponentConfig = z.infer<typeof insertsComponentConfigSchema>;

const priceCentsSchema = z.number().int().min(0).max(10_000_000).nullable();
// One rung of an imported quantity ladder: per-unit cents (or a one-time
// total, on `oneTime` rows) at a quantity break. Sheet-genuine 0 = "Included".
export const pricingRungSchema = z.object({
  qty: z.number().int().min(1).max(1_000_000),
  unitCents: z.number().int().min(0).max(100_000_000),
});
export type PricingRung = z.infer<typeof pricingRungSchema>;
export const pricingRowSchema = z.object({
  // Stable row identity: "type:<categoryId>" or "color:<categoryId>:<swatchId>"
  // or a component row like "labels:bw" / "stickers:circle:3x3".
  key: z.string().min(1).max(160),
  label: z.string().min(1).max(160),
  detail: z.string().max(160).default(""),
  // "jackets"/"sleeves"/"inserts"/"service" rows are not seeded today — they
  // exist so a later pricing load (e.g. Viryl's gatefold component price,
  // Task #3235) can land as a row and flow into the quote builder with no
  // further code changes. Unpriced components show "Pricing pending" there.
  kind: z.enum(["type", "color", "labels", "stickers", "jackets", "sleeves", "inserts", "service"]),
  // Sizes this row's type/color is pressed in (drives the size-chip filter).
  // Empty = not size-scoped (labels/stickers/orphan rows show under every size).
  sizes: z.array(vinylSizeIdSchema).max(3).default([]),
  // Legacy single price (pre size-chips). Kept parseable so stored configs
  // still validate; merged into pricesBySize on read and nulled thereafter.
  priceCents: priceCentsSchema.optional().default(null),
  // Per-size prices — a price typed under 7" never shows under 12".
  pricesBySize: z.record(vinylSizeIdSchema, priceCentsSchema).default({}),
  // ── Imported quantity ladders (Task #3325, MRP Tier 3) ──────────────────
  // Per-size quantity breaks loaded from a press's price sheet. An operator
  // price typed into pricesBySize ALWAYS wins over these at resolution time;
  // the ladder is the imported fallback, so re-running an import never
  // clobbers operator edits (they live in a different field entirely).
  // For vinyl rows these are the standard-weight (140g / 7" 49g) per-unit
  // cents; rungsBySizeHeavy carries the 180g ladder.
  rungsBySize: z.record(vinylSizeIdSchema, z.array(pricingRungSchema).max(12)).optional(),
  rungsBySizeHeavy: z.record(vinylSizeIdSchema, z.array(pricingRungSchema).max(12)).optional(),
  // Service rows: rung values are ONE-TIME totals at that quantity (e.g.
  // stamper fees over the included first 1K), not per-unit prices. A 0 total
  // renders "Included".
  oneTime: z.boolean().optional(),
  // Surcharge rows (Splatter): this row's rungs are a per-unit ADDER on top
  // of the referenced base row's resolved price ("type:opaque"), never a
  // standalone price.
  surchargeOver: z.string().max(160).optional(),
  // Provenance stamp for imported ladders (e.g. "mrp-tier3-2025").
  pricingSource: z.string().max(120).optional(),
});
export type PricingRow = z.infer<typeof pricingRowSchema>;

// ── Per-press setup-fee rules engine (Task #3387) ───────────────────────
// A press-generic rule vocabulary for the one-time setup lines the quote
// builder shows (stampers, color setup, press setup) plus the poly-bag
// packaging line. MRP's Day-2 numbers are the FIRST configuration of these
// rules — never hardcoded logic. A press with no `setupRules` on its pricing
// config keeps today's manual row-based behavior byte-for-byte (honest
// pricing: no invented defaults). Values are cents; matching is
// case-insensitive substring over the build's color tier/kind names.
const centsSchema = z.number().int().min(0).max(100_000_000);
const matchListSchema = z.array(z.string().min(1).max(64)).max(24);

// One stamper pricing rule. Rules are evaluated IN ORDER; the first rule
// whose present matchers all match the build wins. `freeUnits` is the
// new-audio allowance (units of the run that pay nothing); absent = every
// unit pays. Reorders pay at all quantities when the group's
// `reordersAlwaysPay` is on (MRP 16.1).
export const stamperRuleSchema = z.object({
  /** Match record sizes ("7" | "10" | "12"). Absent = any size. */
  sizes: z.array(z.string().max(8)).max(8).optional(),
  /** Match vinyl weights ("140" | "180"). Absent = any weight. */
  weights: z.array(z.string().max(8)).max(8).optional(),
  /** Substring match against the color tier + kind (e.g. "picture",
   * "glitter"). Absent = any color. */
  tierMatch: matchListSchema.optional(),
  /** Per-record fee in cents on chargeable units. */
  perUnitCents: centsSchema,
  /** New-audio free allowance in units; absent = pays at all quantities. */
  freeUnits: z.number().int().min(0).max(1_000_000).optional(),
  /** Optional human label for the derivation note. */
  label: z.string().max(120).optional(),
});
export type StamperRule = z.infer<typeof stamperRuleSchema>;

export const setupFeeRulesSchema = z.object({
  /** Provenance stamp (e.g. "mrp-day2-2026"). */
  source: z.string().max(120).optional(),
  stamper: z
    .object({
      rules: z.array(stamperRuleSchema).max(24),
      /** Reorders lose the free allowance and pay at all quantities. */
      reordersAlwaysPay: z.boolean().optional(),
    })
    .optional(),
  colorSetup: z
    .object({
      /** Fee per counted color per LP, cents (MRP: 9500). */
      perColorCents: centsSchema,
      /** Multiply by disc count (2LP doubles). Default true. */
      perDisc: z.boolean().optional(),
      /** Ordered category matchers → color counts (first match wins),
       * matched as substrings against the tier + kind names. colors: 0 is a
       * genuine "no setup fee" (black vinyl). */
      categories: z
        .array(z.object({ match: matchListSchema, colors: z.number().int().min(0).max(12) }))
        .max(24),
      /** Splatter composes base colors + a per-splatter-color fee.
       * maxSplatterColors bounds what the press actually offers (MRP: 3);
       * counts above it are refused (fall back to the manual row — honest),
       * never priced. Absent = no configured maximum. */
      splatter: z
        .object({
          match: matchListSchema.optional(),
          baseColors: z.number().int().min(0).max(12).optional(),
          perSplatterColorCents: centsSchema,
          maxSplatterColors: z.number().int().min(1).max(12).optional(),
        })
        .optional(),
      /** Count when no category matches; absent = can't derive (falls back
       * to the manual pricing row — honest, never guessed). */
      defaultColors: z.number().int().min(0).max(12).optional(),
    })
    .optional(),
  /** Flat press-setup fee on runs under `underQty` units (MRP: $95 < 500). */
  pressSetup: z
    .object({
      amountCents: centsSchema,
      underQty: z.number().int().min(1).max(1_000_000),
    })
    .optional(),
  /** Open-top poly bag priced as ONE per-unit line with the insertion fee
   * folded in (MRP 16.4 / 4.11: 25¢ bag + 12¢ insertion = one 37¢ line). */
  polyBag: z
    .object({
      label: z.string().max(120).optional(),
      bagCents: centsSchema,
      insertionCents: centsSchema,
    })
    .optional(),
});
export type SetupFeeRules = z.infer<typeof setupFeeRulesSchema>;

export const pricingComponentConfigSchema = z.object({
  rows: z.array(pricingRowSchema).max(2000),
  // Optional per-press setup-fee rules (Task #3387). Lives alongside the
  // rows in the same pricing config blob; absent = manual behavior.
  setupRules: setupFeeRulesSchema.optional(),
});
export type PricingComponentConfig = z.infer<typeof pricingComponentConfigSchema>;

// ── Component keys + payload ───────────────────────────────────────────
export const PRESS_COMPONENT_KEYS = [
  "vinyl",
  "jackets",
  "sleeves",
  "labels",
  "inserts",
  "stickers",
  "pricing",
] as const;
export type PressComponentKey = (typeof PRESS_COMPONENT_KEYS)[number];

export const componentConfigSchemaByKey: Record<PressComponentKey, z.ZodTypeAny> = {
  vinyl: vinylComponentConfigSchema,
  jackets: jacketsComponentConfigSchema,
  sleeves: sleevesComponentConfigSchema,
  labels: labelsComponentConfigSchema,
  inserts: insertsComponentConfigSchema,
  stickers: stickersComponentConfigSchema,
  pricing: pricingComponentConfigSchema,
};

export type PressComponentsPayload = {
  canEdit: boolean;
  press: {
    id: string;
    name: string;
    logoUrl: string | null;
    identityIconUrl: string | null;
    // Uploaded logo variants (Task #3446) — light-background uploads let
    // white product surfaces pick a mark that reads on white stock.
    lightLogoUrl?: string | null;
    squareLogoUrl?: string | null;
    lightSquareLogoUrl?: string | null;
    labelLogoUrl?: string | null;
    labelBgColor?: string | null;
  };
  vinyl: VinylComponentConfig;
  jackets: JacketsComponentConfig;
  sleeves: SleevesComponentConfig;
  labels: LabelsComponentConfig;
  inserts: InsertsComponentConfig;
  stickers: StickersComponentConfig;
  pricing: PricingComponentConfig;
};

