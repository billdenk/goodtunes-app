// Task #218 + Task #467 — Press catalog
// (formats → tiers → colors → (tier×jacket) quantity ladders).
//
// Per-press source of truth for what the SellPanel "Add Physical" picker
// walks through. As of #467 each price ladder lives on the
// (tier, jacket) combo in `press_tier_jacket_ladders` instead of on
// the tier row itself, and there's a per-press jacket catalog so Bill
// can price the same color tier differently across jacket SKUs.
//
// Catalog shape:
//   press_formats:              which AlbumFormats this press offers (toggle)
//   press_color_tiers:          price tiers within a format (Black / House Mix /
//                               Translucent / Clear / Metallic / Opaque, etc).
//                               The legacy `priceLadder` jsonb on this row is
//                               kept for read-back-compat but no longer the
//                               source of truth.
//   press_colors:               individual colors inside a tier (swatch chips).
//   press_jackets:              per-press jacket SKUs. Exactly one carries
//                               `isDefault=true` — that jacket's ladder is
//                               what /invited-press surfaces as the tier's
//                               public `priceLadder` since the SellPanel
//                               doesn't pick a jacket today.
//   press_tier_jacket_ladders:  one row per (tier, jacket) combo, carrying
//                               the jsonb `priceLadder` rungs.
//
// Lookup: `lookupCatalogUnitCents` resolves to the press's default jacket
// when no jacketId is given (which is the case from the SellPanel today)
// and snaps the typed quantity up to the next rung. Returns null when no
// ladder exists for the combo.
//
// Seeding: `seedHellbenderCatalog` materializes Hellbender's tiers/colors
// AND a "Standard Full-Color Jacket" jacket row, then rehomes the
// VINYL_QUANTITY_TIERS ladder onto (tier, standardJacket) combos.
// Idempotent — keyed by (pressId, format, tier name) and (pressId,
// jacket name).

import type { Express, Request, Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import {
  pressFormats,
  pressColorTiers,
  pressColors,
  pressJackets,
  pressTierJacketLadders,
  ALBUM_FORMATS,
  type AlbumFormat,
  type PressColorTier,
  type PressColor,
} from "@shared/schema";
import {
  HELLBENDER_MATRIX,
  VINYL_COLORS,
  VINYL_COLOR_TIER_LABEL,
  VINYL_COLOR_TIER_ORDER,
  VINYL_QUANTITY_TIERS,
  pressingSizeForFormat,
  type VinylColorTier,
} from "@shared/pressing";

// ─── Public catalog shape ────────────────────────────────────────────

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
  // For back-compat: the default jacket's ladder (what /invited-press
  // exposes today). New editor consumers should use `laddersByJacket`.
  priceLadder: { qty: number; unitCents: number }[];
  // jacketId → ladder for every (tier, jacket) combo that has one.
  laddersByJacket: Record<string, { qty: number; unitCents: number }[]>;
  colors: CatalogColor[];
};
export type CatalogFormat = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
};
export type CatalogJacket = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
};
export type Catalog = {
  formats: CatalogFormat[];
  jackets: CatalogJacket[];
  defaultJacketId: string | null;
};

// ─── Storage helpers ─────────────────────────────────────────────────

export async function getPressCatalog(pressId: string): Promise<Catalog> {
  const [fRows, jRows, tRows] = await Promise.all([
    db
      .select()
      .from(pressFormats)
      .where(eq(pressFormats.pressId, pressId))
      .orderBy(asc(pressFormats.position), asc(pressFormats.format)),
    db
      .select()
      .from(pressJackets)
      .where(eq(pressJackets.pressId, pressId))
      .orderBy(asc(pressJackets.position), asc(pressJackets.name)),
    db
      .select()
      .from(pressColorTiers)
      .where(eq(pressColorTiers.pressId, pressId))
      .orderBy(asc(pressColorTiers.position)),
  ]);
  const defaultJacket = jRows.find((j) => j.isDefault) ?? jRows[0] ?? null;
  const defaultJacketId = defaultJacket?.id ?? null;
  const tierIds = tRows.map((t) => t.id);
  const [cRows, lRows] = await Promise.all([
    tierIds.length
      ? db
          .select()
          .from(pressColors)
          .where(inArray(pressColors.tierId, tierIds))
          .orderBy(asc(pressColors.position))
      : Promise.resolve([] as PressColor[]),
    tierIds.length
      ? db
          .select()
          .from(pressTierJacketLadders)
          .where(inArray(pressTierJacketLadders.tierId, tierIds))
      : Promise.resolve([] as { tierId: string; jacketId: string; priceLadder: { qty: number; unitCents: number }[] }[]),
  ]);
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
  const laddersByTier = new Map<string, Record<string, { qty: number; unitCents: number }[]>>();
  for (const l of lRows) {
    const map = laddersByTier.get(l.tierId) ?? {};
    map[l.jacketId] = (l.priceLadder ?? []) as { qty: number; unitCents: number }[];
    laddersByTier.set(l.tierId, map);
  }
  const tiersByFormat = new Map<string, CatalogTier[]>();
  for (const t of tRows) {
    const arr = tiersByFormat.get(t.format) ?? [];
    const ladders = laddersByTier.get(t.id) ?? {};
    const defaultLadder =
      (defaultJacketId && ladders[defaultJacketId]) ||
      // Fallback to the legacy tier-level ladder so a press that
      // hasn't been rehomed yet still answers /invited-press.
      ((t.priceLadder ?? []) as { qty: number; unitCents: number }[]);
    arr.push({
      id: t.id,
      name: t.name,
      position: t.position,
      priceLadder: defaultLadder,
      laddersByJacket: ladders,
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
    jackets: jRows.map((j) => ({
      id: j.id,
      name: j.name,
      position: j.position,
      isDefault: j.isDefault,
    })),
    defaultJacketId,
  };
}

// Snap arbitrary quantity up to the next rung of this combo's ladder.
// Returns the matched rung + `requiresQuote=true` when the typed
// quantity exceeds the top rung. Returns null when the ladder is empty.
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

// Save-time lookup for a vinyl SKU. The SellPanel doesn't pick a jacket
// today, so when `jacketId` is omitted we use the press's default
// jacket (the seeded "Standard Full-Color Jacket" for Hellbender).
export async function lookupCatalogUnitCents(args: {
  pressId: string;
  format: AlbumFormat;
  tierId: string;
  colorId: string | null;
  quantity: number | null;
  jacketId?: string | null;
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
    .where(
      and(
        eq(pressColorTiers.id, args.tierId),
        eq(pressColorTiers.pressId, args.pressId),
        eq(pressColorTiers.format, args.format),
      ),
    );
  if (!tier) return null;

  // Resolve jacket: explicit > press default > legacy tier ladder.
  let jacketId = args.jacketId ?? null;
  if (!jacketId) {
    const [defJacket] = await db
      .select()
      .from(pressJackets)
      .where(and(eq(pressJackets.pressId, args.pressId), eq(pressJackets.isDefault, true)));
    jacketId = defJacket?.id ?? null;
  }
  let ladder: { qty: number; unitCents: number }[] = [];
  if (jacketId) {
    const [combo] = await db
      .select()
      .from(pressTierJacketLadders)
      .where(
        and(
          eq(pressTierJacketLadders.tierId, tier.id),
          eq(pressTierJacketLadders.jacketId, jacketId),
        ),
      );
    ladder = (combo?.priceLadder ?? []) as { qty: number; unitCents: number }[];
  }
  if (ladder.length === 0) {
    // Legacy fallback for presses not yet rehomed onto the new shape.
    ladder = (tier.priceLadder ?? []) as { qty: number; unitCents: number }[];
  }
  const snap = snapToCatalogQuantityTier(ladder, args.quantity);
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
const HELLBENDER_STANDARD_JACKET = "Standard Full-Color Jacket";
let hellbenderSeedRan = false;

const HELLBENDER_DESIRED_TIER_NAMES: string[] = VINYL_COLOR_TIER_ORDER.map(
  (k) => VINYL_COLOR_TIER_LABEL[k],
);

export async function seedHellbenderCatalog() {
  if (hellbenderSeedRan) return;
  hellbenderSeedRan = true;
  try {
    const press = await storage.getManufacturerByDomain(HELLBENDER_DOMAIN);
    if (!press) {
      hellbenderSeedRan = false;
      return;
    }

    // Ensure the standard jacket exists + is flagged default.
    let [jacket] = await db
      .select()
      .from(pressJackets)
      .where(and(eq(pressJackets.pressId, press.id), eq(pressJackets.name, HELLBENDER_STANDARD_JACKET)));
    if (!jacket) {
      [jacket] = await db
        .insert(pressJackets)
        .values({
          pressId: press.id,
          name: HELLBENDER_STANDARD_JACKET,
          position: 0,
          isDefault: true,
        })
        .returning();
    } else if (!jacket.isDefault) {
      await db.update(pressJackets).set({ isDefault: true }).where(eq(pressJackets.id, jacket.id));
    }

    // Hellbender presses 7" and 12" LP only.
    const formats: AlbumFormat[] = ["7_inch", "12_lp"];

    for (let fi = 0; fi < formats.length; fi++) {
      const fmt = formats[fi];
      const size = pressingSizeForFormat(fmt);
      if (!size) continue;
      await db.insert(pressFormats).values({ pressId: press.id, format: fmt, position: fi }).onConflictDoNothing();

      const existingTiers = await db
        .select()
        .from(pressColorTiers)
        .where(and(eq(pressColorTiers.pressId, press.id), eq(pressColorTiers.format, fmt)))
        .orderBy(asc(pressColorTiers.position));
      const existingNames = existingTiers.map((t) => t.name);
      const matches =
        existingNames.length === HELLBENDER_DESIRED_TIER_NAMES.length &&
        existingNames.every((n, i) => n === HELLBENDER_DESIRED_TIER_NAMES[i]);

      let tiersForFormat = existingTiers;
      if (!matches) {
        if (existingTiers.length > 0) {
          await db
            .delete(pressColorTiers)
            .where(inArray(pressColorTiers.id, existingTiers.map((t) => t.id)));
        }
        tiersForFormat = [];
        for (let ti = 0; ti < VINYL_COLOR_TIER_ORDER.length; ti++) {
          const tierKey = VINYL_COLOR_TIER_ORDER[ti];
          const sizeMatrix = HELLBENDER_MATRIX[tierKey][size];
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
          tiersForFormat.push(tierRow);
          const colors = VINYL_COLORS.filter((c) => c.tier === tierKey);
          if (colors.length > 0) {
            await db.insert(pressColors).values(
              colors.map((c, ci) => ({
                tierId: tierRow.id,
                name: c.name,
                swatchHex: c.swatch.startsWith("#") ? c.swatch : null,
                swatchImageUrl: null,
                position: ci,
              })),
            );
          }
        }
      }

      // Materialize a (tier, standardJacket) ladder for each tier that
      // doesn't have one yet. Idempotent — only inserts where missing.
      const existingCombos = await db
        .select()
        .from(pressTierJacketLadders)
        .where(
          and(
            inArray(
              pressTierJacketLadders.tierId,
              tiersForFormat.map((t) => t.id),
            ),
            eq(pressTierJacketLadders.jacketId, jacket.id),
          ),
        );
      const haveCombo = new Set(existingCombos.map((r) => r.tierId));
      for (const tierRow of tiersForFormat) {
        if (haveCombo.has(tierRow.id)) continue;
        // Rehome rule (Task #467 migration): prefer the legacy
        // tier-level `price_ladder` jsonb if it's non-empty, so any
        // pricing Bill (or Hellbender) had already edited in place
        // carries forward into the new combo table. Only fall back to
        // the HELLBENDER_MATRIX defaults for tier rows whose legacy
        // ladder is empty (e.g. tiers we just created above).
        const legacy = Array.isArray(tierRow.priceLadder)
          ? (tierRow.priceLadder as { qty: number; unitCents: number }[])
          : [];
        let ladder: { qty: number; unitCents: number }[] = legacy;
        if (ladder.length === 0) {
          const tierKey = VINYL_COLOR_TIER_ORDER.find(
            (k) => VINYL_COLOR_TIER_LABEL[k] === tierRow.name,
          );
          if (tierKey) {
            const sizeMatrix = HELLBENDER_MATRIX[tierKey][size];
            ladder = VINYL_QUANTITY_TIERS.map((q) => ({
              qty: q as number,
              unitCents: sizeMatrix[q].none,
            }));
          }
        }
        await db
          .insert(pressTierJacketLadders)
          .values({ tierId: tierRow.id, jacketId: jacket.id, priceLadder: ladder })
          .onConflictDoNothing();
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
});
const colorBodySchema = z.object({
  name: z.string().min(1).max(80),
  swatchHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  swatchImageUrl: z.string().url().nullable().optional(),
  position: z.number().int().min(0).optional(),
});
const jacketBodySchema = z.object({
  name: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});
const ladderBodySchema = z.object({
  priceLadder: z.array(
    z.object({ qty: z.number().int().min(1), unitCents: z.number().int().min(0) }),
  ),
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
    const siblings = await db.select().from(pressColorTiers).where(and(eq(pressColorTiers.pressId, pressId), eq(pressColorTiers.format, format)));
    const position = parsed.data.position ?? siblings.length;
    const [row] = await db
      .insert(pressColorTiers)
      .values({ pressId, format, name: parsed.data.name, position, priceLadder: [] })
      .returning();
    res.json(row);
  });

  // Update tier (name/position only — ladders live on combo rows now).
  app.patch("/api/admin/manufacturers/:id/catalog/tiers/:tierId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const tierId = String(req.params.tierId);
    const parsed = tierBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid tier" });
    const patch: Partial<PressColorTier> = {};
    if (parsed.data.name !== undefined) (patch as any).name = parsed.data.name;
    if (parsed.data.position !== undefined) (patch as any).position = parsed.data.position;
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

  // Update color (name / hex / thumbnail URL / position). The
  // thumbnail upload itself goes through the shared
  // /api/admin/upload endpoint; this PATCH just stores the URL.
  app.patch("/api/admin/manufacturers/:id/catalog/colors/:colorId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const colorId = String(req.params.colorId);
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

  // ─── Jackets ───────────────────────────────────────────────────────

  app.post("/api/admin/manufacturers/:id/catalog/jackets", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const parsed = jacketBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid jacket" });
    const siblings = await db.select().from(pressJackets).where(eq(pressJackets.pressId, pressId));
    // Reject a duplicate name within this press up front so the error
    // shows up as a friendly 409 instead of the raw unique-violation.
    if (siblings.some((j) => j.name.toLowerCase() === parsed.data.name.trim().toLowerCase())) {
      return res.status(409).json({ message: "A jacket with that name already exists." });
    }
    const position = parsed.data.position ?? siblings.length;
    const isDefault = parsed.data.isDefault ?? siblings.length === 0;
    if (isDefault && siblings.some((j) => j.isDefault)) {
      await db.update(pressJackets).set({ isDefault: false }).where(eq(pressJackets.pressId, pressId));
    }
    const [row] = await db
      .insert(pressJackets)
      .values({ pressId, name: parsed.data.name.trim(), position, isDefault })
      .returning();
    res.json(row);
  });

  app.patch("/api/admin/manufacturers/:id/catalog/jackets/:jacketId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const jacketId = String(req.params.jacketId);
    const [existing] = await db.select().from(pressJackets).where(and(eq(pressJackets.id, jacketId), eq(pressJackets.pressId, pressId)));
    if (!existing) return res.status(404).json({ message: "Jacket not found" });
    const parsed = jacketBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid jacket" });
    if (parsed.data.isDefault === true) {
      await db.update(pressJackets).set({ isDefault: false }).where(eq(pressJackets.pressId, pressId));
    }
    const patch: any = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
    if (parsed.data.position !== undefined) patch.position = parsed.data.position;
    if (parsed.data.isDefault !== undefined) patch.isDefault = parsed.data.isDefault;
    if (Object.keys(patch).length === 0) return res.json(existing);
    const [row] = await db.update(pressJackets).set(patch).where(eq(pressJackets.id, jacketId)).returning();
    res.json(row);
  });

  app.delete("/api/admin/manufacturers/:id/catalog/jackets/:jacketId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const jacketId = String(req.params.jacketId);
    const [existing] = await db.select().from(pressJackets).where(and(eq(pressJackets.id, jacketId), eq(pressJackets.pressId, pressId)));
    if (!existing) return res.json({ ok: true });
    await db.delete(pressJackets).where(eq(pressJackets.id, jacketId));
    // Ensure the press still has a default jacket if any remain.
    if (existing.isDefault) {
      const [next] = await db
        .select()
        .from(pressJackets)
        .where(eq(pressJackets.pressId, pressId))
        .orderBy(asc(pressJackets.position));
      if (next) await db.update(pressJackets).set({ isDefault: true }).where(eq(pressJackets.id, next.id));
    }
    res.json({ ok: true });
  });

  // ─── (Tier × Jacket) ladder ────────────────────────────────────────

  app.put("/api/admin/manufacturers/:id/catalog/tiers/:tierId/jackets/:jacketId/ladder", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const tierId = String(req.params.tierId);
    const jacketId = String(req.params.jacketId);
    const [tier] = await db.select().from(pressColorTiers).where(and(eq(pressColorTiers.id, tierId), eq(pressColorTiers.pressId, pressId)));
    if (!tier) return res.status(404).json({ message: "Tier not found" });
    const [jacket] = await db.select().from(pressJackets).where(and(eq(pressJackets.id, jacketId), eq(pressJackets.pressId, pressId)));
    if (!jacket) return res.status(404).json({ message: "Jacket not found" });
    const parsed = ladderBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid ladder" });
    const ladder = [...parsed.data.priceLadder].sort((a, b) => a.qty - b.qty);
    const [existing] = await db
      .select()
      .from(pressTierJacketLadders)
      .where(and(eq(pressTierJacketLadders.tierId, tierId), eq(pressTierJacketLadders.jacketId, jacketId)));
    if (existing) {
      const [row] = await db
        .update(pressTierJacketLadders)
        .set({ priceLadder: ladder })
        .where(eq(pressTierJacketLadders.id, existing.id))
        .returning();
      return res.json(row);
    }
    const [row] = await db
      .insert(pressTierJacketLadders)
      .values({ tierId, jacketId, priceLadder: ladder })
      .returning();
    res.json(row);
  });
}
