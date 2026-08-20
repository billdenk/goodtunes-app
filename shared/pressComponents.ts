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
});
export type VinylComponentConfig = z.infer<typeof vinylComponentConfigSchema>;

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
export const pricingRowSchema = z.object({
  // Stable row identity: "type:<categoryId>" or "color:<categoryId>:<swatchId>"
  // or a component row like "labels:bw" / "stickers:circle:3x3".
  key: z.string().min(1).max(160),
  label: z.string().min(1).max(160),
  detail: z.string().max(160).default(""),
  kind: z.enum(["type", "color", "labels", "stickers"]),
  // Sizes this row's type/color is pressed in (drives the size-chip filter).
  // Empty = not size-scoped (labels/stickers/orphan rows show under every size).
  sizes: z.array(vinylSizeIdSchema).max(3).default([]),
  // Legacy single price (pre size-chips). Kept parseable so stored configs
  // still validate; merged into pricesBySize on read and nulled thereafter.
  priceCents: priceCentsSchema.optional().default(null),
  // Per-size prices — a price typed under 7" never shows under 12".
  pricesBySize: z.record(vinylSizeIdSchema, priceCentsSchema).default({}),
});
export type PricingRow = z.infer<typeof pricingRowSchema>;

export const pricingComponentConfigSchema = z.object({
  rows: z.array(pricingRowSchema).max(2000),
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
  press: { id: string; name: string; logoUrl: string | null; identityIconUrl: string | null };
  vinyl: VinylComponentConfig;
  jackets: JacketsComponentConfig;
  sleeves: SleevesComponentConfig;
  labels: LabelsComponentConfig;
  inserts: InsertsComponentConfig;
  stickers: StickersComponentConfig;
  pricing: PricingComponentConfig;
};

