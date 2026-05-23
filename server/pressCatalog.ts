// Task #218 — Press catalog (formats → tiers → colors → quantity ladders).
//
// Per-press source of truth for what the SellPanel "Add Physical" picker
// walks through. Replaces the per-press cost overrides from #204 (which
// only edited one number per format).
//
// Catalog shape:
//   press_formats:      which AlbumFormats this press offers (toggle)
//   press_color_tiers:  price-tiers within a format (e.g. Black /
//                       Standard color / Regrind for Hellbender). Each
//                       carries an ordered jsonb `priceLadder`
//                       [{qty, unitCents}] keyed by quantity tier.
//   press_colors:       individual colors inside a tier; the SellPanel
//                       picker shows these as swatches/photos.
//
// Lookup: `lookupCatalogUnitCents` snaps the artist's typed quantity up
// to the next rung of the picked tier's ladder. Returns null when the
// tier has no ladder yet or the format isn't offered.
//
// Seeding: `seedHellbenderCatalog` materializes the legacy
// HELLBENDER_MATRIX (jacket="none" rows only) into the new tables so
// the Hellbender press has a working catalog the moment T218 ships.
// Idempotent — keyed by (pressId, format, tier name).

import type { Express, Request, Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import {
  pressFormats,
  pressColorTiers,
  pressColors,
  ALBUM_FORMATS,
  type AlbumFormat,
  type PressColorTier,
  type PressColor,
} from "@shared/schema";
import {
  HELLBENDER_MATRIX,
  VINYL_COLORS,
  VINYL_COLOR_TIER_LABEL,
  VINYL_QUANTITY_TIERS,
  pressingSizeForFormat,
  type VinylColorTier,
} from "@shared/pressing";

// ─── Public catalog shape (returned by GET /catalog and embedded into
//     the invited-press response so the SellPanel can drive its picker
//     without a second roundtrip per format) ──────────────────────────

export type CatalogColor = {
  id: string;
  name: string;
  swatchHex: string | null;
  swatchImageUrl: string | null;
  position: number;
};
export type CatalogTier = {
  id: string;
  name: string;
  position: number;
  priceLadder: { qty: number; unitCents: number }[];
  colors: CatalogColor[];
};
export type CatalogFormat = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
};
export type Catalog = { formats: CatalogFormat[] };

// ─── Storage helpers ─────────────────────────────────────────────────

export async function getPressCatalog(pressId: string): Promise<Catalog> {
  const fRows = await db
    .select()
    .from(pressFormats)
    .where(eq(pressFormats.pressId, pressId))
    .orderBy(asc(pressFormats.position), asc(pressFormats.format));
  if (fRows.length === 0) return { formats: [] };
  const tRows = await db
    .select()
    .from(pressColorTiers)
    .where(eq(pressColorTiers.pressId, pressId))
    .orderBy(asc(pressColorTiers.position));
  const tierIds = tRows.map((t) => t.id);
  const cRows: PressColor[] = tierIds.length
    ? await db
        .select()
        .from(pressColors)
        .where(inArray(pressColors.tierId, tierIds))
        .orderBy(asc(pressColors.position))
    : [];
  const colorsByTier = new Map<string, CatalogColor[]>();
  for (const c of cRows) {
    const arr = colorsByTier.get(c.tierId) ?? [];
    arr.push({
      id: c.id,
      name: c.name,
      swatchHex: c.swatchHex,
      swatchImageUrl: c.swatchImageUrl,
      position: c.position,
    });
    colorsByTier.set(c.tierId, arr);
  }
  const tiersByFormat = new Map<string, CatalogTier[]>();
  for (const t of tRows) {
    const arr = tiersByFormat.get(t.format) ?? [];
    arr.push({
      id: t.id,
      name: t.name,
      position: t.position,
      priceLadder: (t.priceLadder ?? []) as { qty: number; unitCents: number }[],
      colors: colorsByTier.get(t.id) ?? [],
    });
    tiersByFormat.set(t.format, arr);
  }
  return {
    formats: fRows.map((f) => ({
      format: f.format as AlbumFormat,
      position: f.position,
      tiers: tiersByFormat.get(f.format) ?? [],
    })),
  };
}

// Snap arbitrary quantity up to the next rung of this tier's ladder.
// Returns the matched rung + `requiresQuote=true` when the typed
// quantity exceeds the top rung (UI shows "request a custom quote").
// Returns null when the ladder is empty.
export function snapToCatalogQuantityTier(
  ladder: { qty: number; unitCents: number }[],
  input: number | null | undefined,
): { qty: number; unitCents: number; requiresQuote: boolean } | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  const sorted = [...ladder].sort((a, b) => a.qty - b.qty);
  const n = typeof input === "number" && Number.isFinite(input) ? Math.max(1, Math.floor(input)) : 1;
  for (const r of sorted) if (n <= r.qty) return { qty: r.qty, unitCents: r.unitCents, requiresQuote: false };
  const top = sorted[sorted.length - 1];
  return { qty: top.qty, unitCents: top.unitCents, requiresQuote: true };
}

// Save-time lookup for a vinyl SKU. Walks the catalog rooted at this
// press, finds the tier (by id), snaps `quantity` to the ladder, and
// returns { unitCents, snappedQty, tierName, colorName, requiresQuote }.
// Returns null when the tier/color isn't found or the ladder is empty.
export async function lookupCatalogUnitCents(args: {
  pressId: string;
  format: AlbumFormat;
  tierId: string;
  colorId: string | null;
  quantity: number | null;
}): Promise<{
  unitCents: number;
  snappedQty: number;
  tierName: string;
  colorName: string | null;
  requiresQuote: boolean;
} | null> {
  const [tier] = await db
    .select()
    .from(pressColorTiers)
    .where(and(eq(pressColorTiers.id, args.tierId), eq(pressColorTiers.pressId, args.pressId), eq(pressColorTiers.format, args.format)));
  if (!tier) return null;
  const snap = snapToCatalogQuantityTier(
    (tier.priceLadder ?? []) as { qty: number; unitCents: number }[],
    args.quantity,
  );
  if (!snap) return null;
  let colorName: string | null = null;
  if (args.colorId) {
    const [c] = await db.select().from(pressColors).where(and(eq(pressColors.id, args.colorId), eq(pressColors.tierId, tier.id)));
    colorName = c?.name ?? null;
  }
  return {
    unitCents: snap.unitCents,
    snappedQty: snap.qty,
    tierName: tier.name,
    colorName,
    requiresQuote: snap.requiresQuote,
  };
}

// ─── Hellbender seed ─────────────────────────────────────────────────

const HELLBENDER_DOMAIN = "hellbendervinyl.com";
let hellbenderSeedRan = false;

export async function seedHellbenderCatalog() {
  if (hellbenderSeedRan) return;
  hellbenderSeedRan = true;
  try {
    const press = await storage.getManufacturerByDomain(HELLBENDER_DOMAIN);
    if (!press) {
      hellbenderSeedRan = false;
      return;
    }
    const existing = await db.select().from(pressFormats).where(eq(pressFormats.pressId, press.id));
    if (existing.length > 0) return; // already seeded

    // Hellbender presses 7" and 12" LP only (per pressingSizeForFormat).
    const formats: AlbumFormat[] = ["7_inch", "12_lp"];
    const tierOrder: VinylColorTier[] = ["black", "standard", "regrind"];

    for (let fi = 0; fi < formats.length; fi++) {
      const fmt = formats[fi];
      const size = pressingSizeForFormat(fmt);
      if (!size) continue;
      await db.insert(pressFormats).values({ pressId: press.id, format: fmt, position: fi }).onConflictDoNothing();
      for (let ti = 0; ti < tierOrder.length; ti++) {
        const tierKey = tierOrder[ti];
        const sizeMatrix = HELLBENDER_MATRIX[tierKey][size];
        // Ladder uses the "none" jacket price (standard jacket). Jacket
        // upgrades aren't part of the catalog model in T218 — defer.
        const priceLadder = VINYL_QUANTITY_TIERS.map((q) => ({
          qty: q as number,
          unitCents: sizeMatrix[q].none,
        }));
        const [tierRow] = await db
          .insert(pressColorTiers)
          .values({
            pressId: press.id,
            format: fmt,
            name: VINYL_COLOR_TIER_LABEL[tierKey],
            position: ti,
            priceLadder,
          })
          .returning();
        // Materialize colors that belong to this tier.
        const colors = VINYL_COLORS.filter((c) => c.tier === tierKey);
        if (colors.length === 0) continue;
        await db.insert(pressColors).values(
          colors.map((c, ci) => ({
            tierId: tierRow.id,
            name: c.name,
            // VINYL_COLORS swatches are sometimes CSS gradients; only
            // store flat #hex here so the swatch renders consistently.
            // Gradient/photo colors can be edited via the catalog UI.
            swatchHex: c.swatch.startsWith("#") ? c.swatch : null,
            swatchImageUrl: null,
            position: ci,
          })),
        );
      }
    }
  } catch (e) {
    console.warn("[pressCatalog] Hellbender seed failed:", (e as Error).message);
    hellbenderSeedRan = false;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────

const tierBodySchema = z.object({
  name: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
  priceLadder: z
    .array(z.object({ qty: z.number().int().min(1), unitCents: z.number().int().min(0) }))
    .optional(),
});
const colorBodySchema = z.object({
  name: z.string().min(1).max(80),
  swatchHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  swatchImageUrl: z.string().url().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export function registerPressCatalogRoutes(
  app: Express,
  requireAdmin: any,
  requirePressScope: any,
) {
  // GET full catalog for a press.
  app.get("/api/admin/manufacturers/:id/catalog", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Manufacturer not found" });
    res.json(await getPressCatalog(pressId));
  });

  // Toggle a format on/off for this press.
  app.put("/api/admin/manufacturers/:id/catalog/formats/:format", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const format = String(req.params.format);
    if (!ALBUM_FORMATS.includes(format as AlbumFormat)) return res.status(400).json({ message: "Unknown format" });
    const enabled = !!(req.body && req.body.enabled);
    if (enabled) {
      await db.insert(pressFormats).values({ pressId, format }).onConflictDoNothing();
    } else {
      // Delete the format row + cascade tiers/colors. Tier deletion
      // cascades colors via FK; we delete tiers explicitly because
      // press_color_tiers has no FK on pressId (composite shape).
      const tiers = await db.select().from(pressColorTiers).where(and(eq(pressColorTiers.pressId, pressId), eq(pressColorTiers.format, format)));
      if (tiers.length) await db.delete(pressColorTiers).where(inArray(pressColorTiers.id, tiers.map((t) => t.id)));
      await db.delete(pressFormats).where(and(eq(pressFormats.pressId, pressId), eq(pressFormats.format, format)));
    }
    res.json(await getPressCatalog(pressId));
  });

  // Create tier.
  app.post("/api/admin/manufacturers/:id/catalog/formats/:format/tiers", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const format = String(req.params.format);
    if (!ALBUM_FORMATS.includes(format as AlbumFormat)) return res.status(400).json({ message: "Unknown format" });
    const parsed = tierBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid tier" });
    // Position defaults to last.
    const siblings = await db.select().from(pressColorTiers).where(and(eq(pressColorTiers.pressId, pressId), eq(pressColorTiers.format, format)));
    const position = parsed.data.position ?? siblings.length;
    const [row] = await db
      .insert(pressColorTiers)
      .values({
        pressId,
        format,
        name: parsed.data.name,
        position,
        priceLadder: parsed.data.priceLadder ?? [],
      })
      .returning();
    res.json(row);
  });

  // Update tier (name/position/priceLadder).
  app.patch("/api/admin/manufacturers/:id/catalog/tiers/:tierId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const tierId = String(req.params.tierId);
    const parsed = tierBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid tier" });
    const patch: Partial<PressColorTier> = {};
    if (parsed.data.name !== undefined) (patch as any).name = parsed.data.name;
    if (parsed.data.position !== undefined) (patch as any).position = parsed.data.position;
    if (parsed.data.priceLadder !== undefined) (patch as any).priceLadder = parsed.data.priceLadder;
    if (Object.keys(patch).length === 0) {
      const [row] = await db.select().from(pressColorTiers).where(and(eq(pressColorTiers.id, tierId), eq(pressColorTiers.pressId, pressId)));
      return res.json(row);
    }
    const [row] = await db
      .update(pressColorTiers)
      .set(patch as any)
      .where(and(eq(pressColorTiers.id, tierId), eq(pressColorTiers.pressId, pressId)))
      .returning();
    res.json(row);
  });

  // Delete tier.
  app.delete("/api/admin/manufacturers/:id/catalog/tiers/:tierId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const tierId = String(req.params.tierId);
    await db.delete(pressColorTiers).where(and(eq(pressColorTiers.id, tierId), eq(pressColorTiers.pressId, pressId)));
    res.json({ ok: true });
  });

  // Create color under a tier.
  app.post("/api/admin/manufacturers/:id/catalog/tiers/:tierId/colors", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const tierId = String(req.params.tierId);
    const [tier] = await db.select().from(pressColorTiers).where(and(eq(pressColorTiers.id, tierId), eq(pressColorTiers.pressId, pressId)));
    if (!tier) return res.status(404).json({ message: "Tier not found" });
    const parsed = colorBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid color" });
    const siblings = await db.select().from(pressColors).where(eq(pressColors.tierId, tierId));
    const position = parsed.data.position ?? siblings.length;
    const [row] = await db
      .insert(pressColors)
      .values({
        tierId,
        name: parsed.data.name,
        swatchHex: parsed.data.swatchHex ?? null,
        swatchImageUrl: parsed.data.swatchImageUrl ?? null,
        position,
      })
      .returning();
    res.json(row);
  });

  // Update color.
  app.patch("/api/admin/manufacturers/:id/catalog/colors/:colorId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const colorId = String(req.params.colorId);
    // Verify the color's tier belongs to this press.
    const [color] = await db.select().from(pressColors).where(eq(pressColors.id, colorId));
    if (!color) return res.status(404).json({ message: "Color not found" });
    const [tier] = await db.select().from(pressColorTiers).where(eq(pressColorTiers.id, color.tierId));
    if (!tier || tier.pressId !== pressId) return res.status(403).json({ message: "Forbidden" });
    const parsed = colorBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid color" });
    const patch: Partial<PressColor> = {};
    if (parsed.data.name !== undefined) (patch as any).name = parsed.data.name;
    if (parsed.data.swatchHex !== undefined) (patch as any).swatchHex = parsed.data.swatchHex;
    if (parsed.data.swatchImageUrl !== undefined) (patch as any).swatchImageUrl = parsed.data.swatchImageUrl;
    if (parsed.data.position !== undefined) (patch as any).position = parsed.data.position;
    const [row] = await db.update(pressColors).set(patch as any).where(eq(pressColors.id, colorId)).returning();
    res.json(row);
  });

  // Delete color.
  app.delete("/api/admin/manufacturers/:id/catalog/colors/:colorId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const colorId = String(req.params.colorId);
    const [color] = await db.select().from(pressColors).where(eq(pressColors.id, colorId));
    if (!color) return res.json({ ok: true });
    const [tier] = await db.select().from(pressColorTiers).where(eq(pressColorTiers.id, color.tierId));
    if (!tier || tier.pressId !== pressId) return res.status(403).json({ message: "Forbidden" });
    await db.delete(pressColors).where(eq(pressColors.id, colorId));
    res.json({ ok: true });
  });
}
