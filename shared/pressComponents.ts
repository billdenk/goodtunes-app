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
});
export type VinylSwatch = z.infer<typeof vinylSwatchSchema>;

export const vinylCategorySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: swatchKindSchema,
  swatches: z.array(vinylSwatchSchema).max(400),
  sizes: z.array(vinylSizeIdSchema).max(3),
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
});
export type StickerShapeOffer = z.infer<typeof stickerShapeOfferSchema>;

export const stickersComponentConfigSchema = z.object({
  shapes: z.array(stickerShapeOfferSchema).max(8),
});
export type StickersComponentConfig = z.infer<typeof stickersComponentConfigSchema>;

// ── Component-level pricing ────────────────────────────────────────────
// Rows are seeded from the press's existing vinyl types/colors; price cells
// start EMPTY (null). Package pricing is untouchable — these prices are a
// separate component-level surface and are not read by the SellPanel.
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
export const PRESS_COMPONENT_KEYS = ["vinyl", "labels", "stickers", "pricing"] as const;
export type PressComponentKey = (typeof PRESS_COMPONENT_KEYS)[number];

export const componentConfigSchemaByKey: Record<PressComponentKey, z.ZodTypeAny> = {
  vinyl: vinylComponentConfigSchema,
  labels: labelsComponentConfigSchema,
  stickers: stickersComponentConfigSchema,
  pricing: pricingComponentConfigSchema,
};

export type PressComponentsPayload = {
  canEdit: boolean;
  press: { id: string; name: string; logoUrl: string | null; identityIconUrl: string | null };
  vinyl: VinylComponentConfig;
  labels: LabelsComponentConfig;
  stickers: StickersComponentConfig;
  pricing: PricingComponentConfig;
};
