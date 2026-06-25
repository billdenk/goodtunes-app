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
import { and, asc, eq, inArray, sql } from "drizzle-orm";
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
import {
  serializeCatalogCsv,
  parseCatalogCsv,
  buildCatalogCsvPlan,
  applyCatalogCsv,
} from "./pressCatalogCsv";

// ─── Public catalog shape ────────────────────────────────────────────

export type CatalogColor = {
  id: string;
  name: string;
  swatchHex: string | null;
  swatchImageUrl: string | null;
  position: number;
  // Task #668 — stamped by the MRP importer with the canonical source
  // URL on memphisrecordpressing.com (null for hand-added swatches).
  importSourceUrl: string | null;
};
// Task #624 — each rung carries an optional `confirmed` flag. False
// (or missing on legacy rows) means the rung was seeded as a placeholder
// and needs a real quote from the press; admin UI renders these yellow
// with a "TBD — awaiting quote" hint. Saving a value through the
// catalog editor marks the rung confirmed=true automatically.
// Task #684 — rungs can additionally carry provenance: `source` /
// `syncedAt` stamp where the number came from (importer or a manual
// site-sourced load), `lockedFromSync` protects an operator/site value
// from being overwritten by a future Hellbender Shopify re-sync, and
// `estimated` flags a Bill-approved interpolated cell (displays like
// any other price; tracked in docs/vendors/hellbender.md).
export type CatalogLadderRung = {
  qty: number;
  unitCents: number;
  confirmed?: boolean;
  source?: string;
  syncedAt?: string;
  lockedFromSync?: boolean;
  estimated?: boolean;
};
export type CatalogTier = {
  id: string;
  name: string;
  position: number;
  // For back-compat: the default jacket's ladder (what /invited-press
  // exposes today). New editor consumers should use `laddersByJacket`.
  priceLadder: CatalogLadderRung[];
  // jacketId → ladder for every (tier, jacket) combo that has one.
  laddersByJacket: Record<string, CatalogLadderRung[]>;
  colors: CatalogColor[];
};
export type CatalogFormat = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
  // Task #1998 — the jacket that is the default for this specific format
  // (i.e. the first applicable jacket with isDefault, else first applicable).
  defaultJacketId: string | null;
};
export type CatalogJacket = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  // Task #1998 — null = applies to all formats (back-compat).
  applicableFormats: string[] | null;
};
export type Catalog = {
  formats: CatalogFormat[];
  jackets: CatalogJacket[];
  defaultJacketId: string | null;
};

// ─── Storage helpers ─────────────────────────────────────────────────

// Task #1998 — smart default: derive applicable formats from a jacket
// name so freshly-created jackets and newly-seeded presses get sensible
// scoping without operator intervention. null = applies to all formats.
export function getJacketDefaultFormats(name: string): AlbumFormat[] | null {
  const n = name.toLowerCase();
  // Wide-spine is a 2LP-only physical product.
  if (n.includes("widespine") || n.includes("wide-spine") || n.includes("wide spine")) {
    return ["12_double"];
  }
  // Gatefolds (any pocket count / tip-on variant) don't fit a 7" sleeve.
  // Exclude negated names like "Records…(No Gatefold)" or "…without gatefold".
  if (
    n.includes("gatefold") &&
    !n.includes("no gatefold") &&
    !n.includes("without gatefold") &&
    !n.includes("(no gatefold")
  ) {
    return ["12_lp", "12_double"];
  }
  return null;
}

// Task #1998 — resolve the default jacket for a specific format from
// the press's jacket list. Prefers the isDefault jacket if it applies
// to that format; otherwise falls back to the lowest-position applicable
// jacket. Returns null only when no jacket applies (empty press).
function getFormatDefaultJacketId(
  jRows: { id: string; isDefault: boolean; applicableFormats: string[] | null }[],
  format: string,
): string | null {
  const applicable = jRows.filter(
    (j) => !j.applicableFormats || j.applicableFormats.includes(format),
  );
  return (applicable.find((j) => j.isDefault) ?? applicable[0])?.id ?? null;
}

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
      importSourceUrl: c.importSourceUrl ?? null,
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
    // Task #1998 — use the format-specific default jacket for the back-compat
    // priceLadder field so a 7" tier's priceLadder never comes from a gatefold.
    const fmtDefaultJacketId = getFormatDefaultJacketId(jRows, t.format);
    const defaultLadder =
      (fmtDefaultJacketId && ladders[fmtDefaultJacketId]) ||
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
      defaultJacketId: getFormatDefaultJacketId(jRows, f.format),
    })),
    jackets: jRows.map((j) => ({
      id: j.id,
      name: j.name,
      position: j.position,
      isDefault: j.isDefault,
      applicableFormats: (j.applicableFormats as string[] | null) ?? null,
    })),
    defaultJacketId,
  };
}

// Snap arbitrary quantity up to the next rung of this combo's ladder.
// Returns the matched rung + `requiresQuote=true` when the typed
// quantity exceeds the top rung. Returns null when the ladder is empty.
export function snapToCatalogQuantityTier(
  ladder: { qty: number; unitCents: number; confirmed?: boolean }[],
  input: number | null | undefined,
): { qty: number; unitCents: number; requiresQuote: boolean } | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  // Task #624 — unconfirmed rungs are TBD placeholders; they MUST
  // never resolve as $0 manufacturing. Filter them out of pricing
  // lookup; the caller bubbles `requiresQuote=true` whenever the
  // remaining (confirmed) ladder can't price the typed quantity.
  const sorted = [...ladder]
    .filter((r) => r.confirmed !== false)
    .sort((a, b) => a.qty - b.qty);
  if (sorted.length === 0) return null;
  const n = typeof input === "number" && Number.isFinite(input) ? Math.max(1, Math.floor(input)) : 1;
  for (const r of sorted) if (n <= r.qty) return { qty: r.qty, unitCents: r.unitCents, requiresQuote: false };
  const top = sorted[sorted.length - 1];
  return { qty: top.qty, unitCents: top.unitCents, requiresQuote: true };
}

// Task #1035 — resolve which press a catalog pick belongs to FROM THE
// CHOSEN TIER ITSELF (every `press_color_tiers` row carries its
// `pressId`), plus the human-readable tier/color names. The SKU save
// path uses this so a pick made against a press selected via the
// Printer chip (god-view / "All Presses") prices against THAT press —
// not the album's invited press, which may be unset or different. The
// names come back even when no priced ladder rung exists, so a
// genuinely unpriceable pick can still be snapshotted instead of being
// silently overwritten with a default color.
export async function resolveCatalogIdentity(args: {
  tierId: string;
  colorId: string | null;
  format: AlbumFormat;
}): Promise<{
  pressId: string;
  tierName: string;
  colorName: string | null;
} | null> {
  const [tier] = await db
    .select()
    .from(pressColorTiers)
    .where(
      and(
        eq(pressColorTiers.id, args.tierId),
        eq(pressColorTiers.format, args.format),
      ),
    );
  if (!tier) return null;
  let colorName: string | null = null;
  if (args.colorId) {
    const [c] = await db
      .select()
      .from(pressColors)
      .where(and(eq(pressColors.id, args.colorId), eq(pressColors.tierId, tier.id)));
    colorName = c?.name ?? null;
  }
  return { pressId: tier.pressId, tierName: tier.name, colorName };
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

  // Task #1998 — resolve jacket: explicit > format-aware press default >
  // legacy tier ladder. Use the first jacket applicable to this format
  // (preferring isDefault) so a 7" never resolves to a gatefold-only jacket.
  let jacketId = args.jacketId ?? null;
  if (!jacketId) {
    const jRows = await db
      .select()
      .from(pressJackets)
      .where(eq(pressJackets.pressId, args.pressId))
      .orderBy(asc(pressJackets.position));
    jacketId = getFormatDefaultJacketId(
      jRows.map((j) => ({ id: j.id, isDefault: j.isDefault, applicableFormats: (j.applicableFormats as string[] | null) ?? null })),
      args.format,
    );
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

// ─── Seed helpers (Task #631) ────────────────────────────────────────
//
// Idempotent, additive primitives every press seed shares. Three rules:
//  1. A re-run never duplicates jackets, tiers, colors, or combos —
//     each helper keys off a stable natural id (`(pressId, name)`,
//     `(pressId, format, name)`, `(tierId, name)`, `(tierId, jacketId)`).
//  2. A re-run never overwrites or downgrades an already-confirmed rung.
//     `addMissingRungs` only inserts qtys that aren't already present;
//     `upgradeRung` only flips an existing placeholder to confirmed (or
//     inserts the rung if missing) and is a no-op when the rung is
//     already confirmed.
//  3. A re-run never clobbers operator-edited press metadata.
//     `ensureManufacturerSummary` only fills bio / turnaround / op-note
//     when the column is still NULL/empty.

/** Standard column shape Bill compares the three presses on. */
const STANDARD_COMPARISON_QUANTITIES: number[] = [100, 200, 300, 500, 1000, 2000];

type LadderRungSpec = { qty: number; unitCents: number; confirmed: boolean };

/** Build an all-placeholder ladder at the standard comparison qtys. */
function placeholderLadder(qtys: number[] = STANDARD_COMPARISON_QUANTITIES): LadderRungSpec[] {
  return qtys.map((qty) => ({ qty, unitCents: 0, confirmed: false }));
}

async function ensureManufacturerSummary(
  pressId: string,
  patch: {
    bio?: string;
    turnaroundWeeksMin?: number;
    turnaroundWeeksMax?: number;
    operationalNote?: string;
  },
): Promise<void> {
  if (patch.bio) {
    await db.execute(sql`
      UPDATE manufacturers SET bio = ${patch.bio}
      WHERE id = ${pressId} AND (bio IS NULL OR bio = '')
    `);
  }
  if (patch.turnaroundWeeksMin != null) {
    await db.execute(sql`
      UPDATE manufacturers SET turnaround_weeks_min = ${patch.turnaroundWeeksMin}
      WHERE id = ${pressId} AND turnaround_weeks_min IS NULL
    `);
  }
  if (patch.turnaroundWeeksMax != null) {
    await db.execute(sql`
      UPDATE manufacturers SET turnaround_weeks_max = ${patch.turnaroundWeeksMax}
      WHERE id = ${pressId} AND turnaround_weeks_max IS NULL
    `);
  }
  if (patch.operationalNote) {
    await db.execute(sql`
      UPDATE manufacturers SET operational_note = ${patch.operationalNote}
      WHERE id = ${pressId} AND (operational_note IS NULL OR operational_note = '')
    `);
  }
}

async function ensureFormat(pressId: string, format: AlbumFormat, position: number): Promise<void> {
  await db
    .insert(pressFormats)
    .values({ pressId, format, position })
    .onConflictDoNothing();
}

async function ensureJacket(
  pressId: string,
  name: string,
  position: number,
  // Task #1998 — added applicableFormats so seed functions can scope jackets
  // on INSERT. Only written at creation time; never overwrites operator edits.
  opts: { isDefault?: boolean; applicableFormats?: string[] | null } = {},
) {
  let [j] = await db
    .select()
    .from(pressJackets)
    .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.name, name)));
  if (!j) {
    [j] = await db
      .insert(pressJackets)
      .values({
        pressId,
        name,
        position,
        isDefault: opts.isDefault ?? false,
        ...(opts.applicableFormats !== undefined ? { applicableFormats: opts.applicableFormats as any } : {}),
      })
      .returning();
  }
  if (opts.isDefault && !j.isDefault) {
    // Promote to default — make sure no other jacket on this press
    // also claims the flag (unique-ish invariant enforced in code).
    await db
      .update(pressJackets)
      .set({ isDefault: false })
      .where(eq(pressJackets.pressId, pressId));
    await db
      .update(pressJackets)
      .set({ isDefault: true })
      .where(eq(pressJackets.id, j.id));
    j = { ...j, isDefault: true };
  }
  return j;
}

async function ensureTier(
  pressId: string,
  format: AlbumFormat,
  name: string,
  position: number,
): Promise<PressColorTier> {
  let [t] = await db
    .select()
    .from(pressColorTiers)
    .where(
      and(
        eq(pressColorTiers.pressId, pressId),
        eq(pressColorTiers.format, format),
        eq(pressColorTiers.name, name),
      ),
    );
  if (!t) {
    [t] = await db
      .insert(pressColorTiers)
      .values({ pressId, format, name, position, priceLadder: [] })
      .returning();
  }
  return t;
}

async function ensureColor(
  tierId: string,
  name: string,
  swatchHex: string | null,
  position: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pressColors)
    .where(and(eq(pressColors.tierId, tierId), eq(pressColors.name, name)));
  if (existing) return;
  await db.insert(pressColors).values({
    tierId,
    name,
    swatchHex,
    swatchImageUrl: null,
    position,
  });
}

/**
 * Task #672 — idempotently backfill `swatchHex` on color rows that were
 * seeded before they carried a value (e.g. MRP's name-only import).
 * Matches existing rows by tier name + color name across every format
 * the press presses, and only fills a row whose swatch is still blank —
 * `swatchHex IS NULL AND swatchImageUrl IS NULL` — so an operator's
 * hand-picked hex or an imported per-color photo is never clobbered.
 * `hexByTier` keys are tier names (case-insensitive); inner keys are the
 * exact stored color names.
 */
async function backfillColorHexes(
  pressId: string,
  hexByTier: Record<string, Record<string, string>>,
): Promise<void> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wantByTier = new Map<string, Map<string, string>>();
  for (const [tierName, colors] of Object.entries(hexByTier)) {
    const inner = new Map<string, string>();
    for (const [colorName, hex] of Object.entries(colors)) inner.set(norm(colorName), hex);
    wantByTier.set(norm(tierName), inner);
  }
  const tiers = await db
    .select()
    .from(pressColorTiers)
    .where(eq(pressColorTiers.pressId, pressId));
  for (const tier of tiers) {
    const want = wantByTier.get(norm(tier.name));
    if (!want) continue;
    const colors = await db.select().from(pressColors).where(eq(pressColors.tierId, tier.id));
    for (const c of colors) {
      if (c.swatchHex != null || c.swatchImageUrl != null) continue;
      const hex = want.get(norm(c.name));
      if (!hex) continue;
      await db.update(pressColors).set({ swatchHex: hex }).where(eq(pressColors.id, c.id));
    }
  }
}

/**
 * Task #672 — flat (tier-agnostic) variant of {@link backfillColorHexes}
 * for presses whose same color name appears under more than one tier
 * (e.g. Hellbender's "Gold" lives under both its 7" Metallic tier and
 * the 12" Color tier). Same blank-only guard so operator edits and
 * imported photos are never clobbered.
 */
async function backfillColorHexesByName(
  pressId: string,
  hexByName: Record<string, string>,
): Promise<void> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const want = new Map<string, string>();
  for (const [name, hex] of Object.entries(hexByName)) want.set(norm(name), hex);
  const tiers = await db
    .select()
    .from(pressColorTiers)
    .where(eq(pressColorTiers.pressId, pressId));
  for (const tier of tiers) {
    const colors = await db.select().from(pressColors).where(eq(pressColors.tierId, tier.id));
    for (const c of colors) {
      if (c.swatchHex != null || c.swatchImageUrl != null) continue;
      const hex = want.get(norm(c.name));
      if (!hex) continue;
      await db.update(pressColors).set({ swatchHex: hex }).where(eq(pressColors.id, c.id));
    }
  }
}

/**
 * Task #672 — collapse a swatch CSS value to a single representative
 * solid hex for DB storage. Plain hex passes through; gradient swatches
 * (smokey / metallic / house-mix stocks defined as `linear-gradient`)
 * return their middle color stop so the picker chip + VinylPreview disc
 * read as a distinct, name-appropriate solid instead of falling back to
 * grey. Returns null when no hex stop is present (genuinely unknown).
 */
function representativeHex(swatch: string): string | null {
  if (swatch.startsWith("#")) return swatch;
  const stops = swatch.match(/#[0-9a-fA-F]{6}/g);
  if (!stops || stops.length === 0) return null;
  return stops[Math.floor(stops.length / 2)] ?? stops[0];
}

/** Insert a (tier, jacket) combo with the given initial ladder if it
 *  doesn't already exist. Returns whether a row was created. */
async function ensureCombo(
  tierId: string,
  jacketId: string,
  initialLadder: LadderRungSpec[],
): Promise<{ created: boolean }> {
  const [existing] = await db
    .select()
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (existing) return { created: false };
  await db
    .insert(pressTierJacketLadders)
    .values({ tierId, jacketId, priceLadder: initialLadder })
    .onConflictDoNothing();
  return { created: true };
}

/** Add `{qty:N, unitCents:0, confirmed:false}` placeholder rungs for
 *  any qty in `qtys` that the combo's ladder doesn't already carry.
 *  Existing rungs (confirmed or not) are left untouched. No-op if the
 *  combo row doesn't exist (caller is expected to ensureCombo first). */
async function addMissingRungs(
  tierId: string,
  jacketId: string,
  qtys: number[],
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (!existing) return;
  const ladder: CatalogLadderRung[] = Array.isArray(existing.priceLadder)
    ? [...(existing.priceLadder as CatalogLadderRung[])]
    : [];
  const have = new Set(ladder.map((r) => r.qty));
  let changed = false;
  for (const qty of qtys) {
    if (!have.has(qty)) {
      ladder.push({ qty, unitCents: 0, confirmed: false });
      changed = true;
    }
  }
  if (!changed) return;
  ladder.sort((a, b) => a.qty - b.qty);
  await db
    .update(pressTierJacketLadders)
    .set({ priceLadder: ladder })
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
}

/** Overwrite a rung's price + confirmed flag unconditionally. Used to
 *  repair seeded rungs whose stored `unitCents` was the wrong unit
 *  (e.g. Task #638 fix where MRP/Hellbender seeds had stored
 *  total-dollars in a field labelled `unitCents`). Inserts the rung
 *  confirmed if it isn't present. No-op if the combo row is missing. */
async function forceRungPrice(
  tierId: string,
  jacketId: string,
  qty: number,
  unitCents: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (!existing) return;
  const ladder: CatalogLadderRung[] = Array.isArray(existing.priceLadder)
    ? [...(existing.priceLadder as CatalogLadderRung[])]
    : [];
  const idx = ladder.findIndex((r) => r.qty === qty);
  const next = { qty, unitCents, confirmed: true };
  if (idx >= 0) {
    if (
      ladder[idx].confirmed === true &&
      ladder[idx].unitCents === unitCents
    ) {
      return;
    }
    ladder[idx] = next;
  } else {
    ladder.push(next);
    ladder.sort((a, b) => a.qty - b.qty);
  }
  await db
    .update(pressTierJacketLadders)
    .set({ priceLadder: ladder })
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
}

/** Flip a placeholder rung to confirmed at the given price, or insert
 *  it confirmed if missing. Never overwrites or downgrades a rung that
 *  is already `confirmed:true`. */
async function upgradeRung(
  tierId: string,
  jacketId: string,
  qty: number,
  unitCents: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (!existing) return;
  const ladder: CatalogLadderRung[] = Array.isArray(existing.priceLadder)
    ? [...(existing.priceLadder as CatalogLadderRung[])]
    : [];
  const idx = ladder.findIndex((r) => r.qty === qty);
  if (idx >= 0) {
    if (ladder[idx].confirmed === true) return; // never downgrade or overwrite
    ladder[idx] = { qty, unitCents, confirmed: true };
  } else {
    ladder.push({ qty, unitCents, confirmed: true });
    ladder.sort((a, b) => a.qty - b.qty);
  }
  await db
    .update(pressTierJacketLadders)
    .set({ priceLadder: ladder })
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
}

/** Task #684 — write a confirmed rung carrying provenance: a `source` +
 *  `syncedAt` stamp, `lockedFromSync:true` so a future Hellbender
 *  Shopify re-sync can't clobber the operator/site value, and an
 *  optional `estimated` flag for Bill-approved interpolated cells.
 *  Overwrites unconditionally (like {@link forceRungPrice}) but is
 *  idempotent — a rung that already matches on value + provenance is
 *  left as-is so its original `syncedAt` survives restarts. No-op if the
 *  combo row is missing. */
async function setSiteRung(
  tierId: string,
  jacketId: string,
  rung: { qty: number; unitCents: number; estimated?: boolean },
  source: string,
  syncedAt: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (!existing) return;
  const ladder: CatalogLadderRung[] = Array.isArray(existing.priceLadder)
    ? [...(existing.priceLadder as CatalogLadderRung[])]
    : [];
  const estimated = rung.estimated ?? false;
  const idx = ladder.findIndex((r) => r.qty === rung.qty);
  if (idx >= 0) {
    const cur = ladder[idx];
    if (
      cur.confirmed === true &&
      cur.unitCents === rung.unitCents &&
      cur.lockedFromSync === true &&
      (cur.estimated ?? false) === estimated &&
      cur.source === source
    ) {
      return;
    }
    ladder[idx] = {
      qty: rung.qty,
      unitCents: rung.unitCents,
      confirmed: true,
      source,
      syncedAt,
      lockedFromSync: true,
      estimated,
    };
  } else {
    ladder.push({
      qty: rung.qty,
      unitCents: rung.unitCents,
      confirmed: true,
      source,
      syncedAt,
      lockedFromSync: true,
      estimated,
    });
    ladder.sort((a, b) => a.qty - b.qty);
  }
  await db
    .update(pressTierJacketLadders)
    .set({ priceLadder: ladder })
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
}

/** Task #684 — demote an existing rung back to an unconfirmed "awaiting
 *  quote" placeholder ({unitCents:0, confirmed:false}). Used to drop the
 *  legacy 7" 2,000 + 3,000 rungs the old matrix seed pinned to the 1,000
 *  value as confirmed — Hellbender doesn't actually quote those runs.
 *  Idempotent; no-op if the rung is already a placeholder or absent. */
async function demoteRungToPlaceholder(
  tierId: string,
  jacketId: string,
  qty: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pressTierJacketLadders)
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
  if (!existing) return;
  const ladder: CatalogLadderRung[] = Array.isArray(existing.priceLadder)
    ? [...(existing.priceLadder as CatalogLadderRung[])]
    : [];
  const idx = ladder.findIndex((r) => r.qty === qty);
  if (idx < 0) return;
  if (ladder[idx].confirmed === false && ladder[idx].unitCents === 0) return;
  ladder[idx] = { qty, unitCents: 0, confirmed: false };
  await db
    .update(pressTierJacketLadders)
    .set({ priceLadder: ladder })
    .where(
      and(
        eq(pressTierJacketLadders.tierId, tierId),
        eq(pressTierJacketLadders.jacketId, jacketId),
      ),
    );
}

// ─── Hellbender seed ─────────────────────────────────────────────────

export const HELLBENDER_DOMAIN = "hellbendervinyl.com";
const HELLBENDER_STANDARD_JACKET = "Standard Full-Color Jacket";
let hellbenderSeedRan = false;

// Task #624 — Hellbender's May 2026 quote consolidated their tier menu
// down to Black / Color / Splatter for the 1LP and 2LP runs they care
// about. Color + Splatter ship with confirmed rungs at 500 / 1000 /
// 2000 (the only quantities Hellbender priced). Black is materialised
// at the same three rungs as `confirmed:false` placeholders so the
// catalog editor renders the cells in yellow with a "TBD — awaiting
// quote" hint until Hellbender comes back with Black numbers. Every
// other rung is intentionally absent — admins fill them in via the
// editor and the rung gets confirmed=true on save.
//
// 7" is left on the older multi-tier seed for back-compat (the new
// quote doesn't touch 7"), so the per-format desired-tier maps drive
// which tiers each format is allowed to carry.
const HELLBENDER_LEGACY_7_TIER_NAMES: string[] = VINYL_COLOR_TIER_ORDER.map(
  (k) => VINYL_COLOR_TIER_LABEL[k],
);
const HELLBENDER_NEW_12_TIER_NAMES = ["Black", "Color", "Splatter"] as const;
type HellbenderRungSpec = { qty: number; unitCents: number; confirmed: boolean };
// Task #638 — values are per-unit cents (undiscounted) derived from
// the May-2026 Hellbender PDF quotes (`GoodTunes_1LP-Samples` and
// `GoodTunes_2LP-Samples`). Undiscounted because `brokerDiscountPct`
// on the manufacturer row is 10 and the runtime applies it. Earlier
// seed stored vendor TOTAL dollars in this field, which made the
// catalog UI render ~$40+/record for $4-ish vinyl — see the lesson in
// `.agents/memory/press-catalog-units.md`.
//
// 1LP has confirmed rungs at every standard qty (100/200/300/500/
// 1000/2000) from the 1LP quote PDF. 2LP only has 500/1000/2000 (the
// 2LP quote didn't quote short-run). Black stays as placeholders
// across the board — Hellbender hasn't quoted Black.
const HELLBENDER_NEW_12_LADDERS: Record<"12_lp" | "12_double", Record<string, HellbenderRungSpec[]>> = {
  "12_lp": {
    Black: [
      { qty: 100, unitCents: 0, confirmed: false },
      { qty: 200, unitCents: 0, confirmed: false },
      { qty: 300, unitCents: 0, confirmed: false },
      { qty: 500, unitCents: 0, confirmed: false },
      { qty: 1000, unitCents: 0, confirmed: false },
      { qty: 2000, unitCents: 0, confirmed: false },
    ],
    Color: [
      { qty: 100, unitCents: 1931, confirmed: true },   // $1,931 / 100
      { qty: 200, unitCents: 1256, confirmed: true },   // $2,512 / 200
      { qty: 300, unitCents: 1032, confirmed: true },   // $3,096 / 300
      { qty: 500, unitCents: 812, confirmed: true },    // $4,060 / 500
      { qty: 1000, unitCents: 626, confirmed: true },   // $6,260 / 1000
      { qty: 2000, unitCents: 533, confirmed: true },   // $10,655 / 2000
    ],
    Splatter: [
      { qty: 100, unitCents: 2015, confirmed: true },   // $2,015 / 100
      { qty: 200, unitCents: 1340, confirmed: true },   // $2,680 / 200
      { qty: 300, unitCents: 1116, confirmed: true },   // $3,348 / 300
      { qty: 500, unitCents: 891, confirmed: true },    // $4,455 / 500
      { qty: 1000, unitCents: 701, confirmed: true },   // $7,010 / 1000
      { qty: 2000, unitCents: 608, confirmed: true },   // $12,155 / 2000
    ],
  },
  "12_double": {
    Black: [
      { qty: 500, unitCents: 0, confirmed: false },
      { qty: 1000, unitCents: 0, confirmed: false },
      { qty: 2000, unitCents: 0, confirmed: false },
    ],
    Color: [
      { qty: 500, unitCents: 1406, confirmed: true },   // $7,030 / 500
      { qty: 1000, unitCents: 1098, confirmed: true },  // $10,975 / 1000
      { qty: 2000, unitCents: 929, confirmed: true },   // $18,585 / 2000
    ],
    Splatter: [
      { qty: 500, unitCents: 1404, confirmed: true },   // $7,020 / 500
      { qty: 1000, unitCents: 1248, confirmed: true },  // $12,475 / 1000
      { qty: 2000, unitCents: 1089, confirmed: true },  // $21,785 / 2000
    ],
  },
};

// Task #684 — Bill's upgrade-inclusive Hellbender pricing, sourced from
// Hellbender's public per-record builder (screenshot-confirmed) plus a
// handful of Bill-approved interpolated fills. Values are UNDISCOUNTED
// per-unit cents — the manufacturer row's 10% broker discount applies at
// lookup, never stored (same convention as Task #638; see
// `.agents/memory/press-catalog-units.md`).
//
// Per-size upgrade basis (what each "Black"/color-group price already
// bundles, so Manufacturing reads as a complete record cost):
//   • 12″ Black            → Double-Sided Insert
//   • 7″  Black            → Gatefold Jacket (Hellbender has no single-
//                            pocket 7″ sleeve)
//   • all color groups     → Double-Sided Insert, at both sizes
//
// `estimated:true` marks a Bill-approved interpolation from the shared
// color ladder / Hellbender's own single→double ratio (it displays like
// any other confirmed price but stays flagged in the rung metadata and
// is listed in docs/vendors/hellbender.md). Everything else is screenshot
// -confirmed. 2,000 isn't published by Hellbender for either size, so it
// stays an unconfirmed "awaiting quote" placeholder (handled in the
// loader, not listed here). These rungs are written with a
// `lockedFromSync` stamp so a future Hellbender Shopify re-sync leaves
// them intact instead of replacing them with the base "no-upgrade" price.
const HELLBENDER_SITE_SOURCE = "hellbender-site-2026";
type SiteRungSpec = { qty: number; unitCents: number; estimated?: boolean };
// 12″ color groups beyond Black/Color/Splatter that Task #684 adds so
// the 12″ catalog carries the same House Mix / Translucent / Clear /
// Metallic / Opaque tiers 7″ already has.
const HELLBENDER_12_COLOR_GROUP_TIER_KEYS: VinylColorTier[] = [
  "house_mix",
  "translucent",
  "clear",
  "metallic",
  "opaque",
];
const HELLBENDER_SITE_LADDERS: Record<
  "12_lp" | "7_inch" | "12_double",
  Record<string, SiteRungSpec[]>
> = {
  "12_lp": {
    Black: [
      { qty: 50, unitCents: 3049 },
      { qty: 100, unitCents: 1769 },
      { qty: 200, unitCents: 1132 },
      { qty: 300, unitCents: 918 },
      { qty: 500, unitCents: 690 },
      { qty: 1000, unitCents: 522 },
    ],
    "House Mix": [
      { qty: 50, unitCents: 3026 },
      { qty: 100, unitCents: 1746 },
      { qty: 200, unitCents: 1109 },
      { qty: 300, unitCents: 895 },
      { qty: 500, unitCents: 658 },
      { qty: 1000, unitCents: 494 },
    ],
    "Translucent Colors": [
      { qty: 50, unitCents: 3202 },
      { qty: 100, unitCents: 1873 },
      { qty: 200, unitCents: 1210 },
      { qty: 300, unitCents: 989 },
      { qty: 500, unitCents: 771 },
      { qty: 1000, unitCents: 583 },
    ],
    "Clear Colors": [
      { qty: 50, unitCents: 3202 },
      { qty: 100, unitCents: 1873, estimated: true },
      { qty: 200, unitCents: 1210 },
      { qty: 300, unitCents: 989 },
      { qty: 500, unitCents: 771 },
      { qty: 1000, unitCents: 583 },
    ],
    "Metallic Colors": [
      { qty: 50, unitCents: 3202 },
      { qty: 100, unitCents: 1873 },
      { qty: 200, unitCents: 1210 },
      { qty: 300, unitCents: 989 },
      { qty: 500, unitCents: 771 },
      { qty: 1000, unitCents: 583 },
    ],
    "Opaque Colors": [
      { qty: 50, unitCents: 3202 },
      { qty: 100, unitCents: 1873 },
      { qty: 200, unitCents: 1210, estimated: true },
      { qty: 300, unitCents: 989, estimated: true },
      { qty: 500, unitCents: 771, estimated: true },
      { qty: 1000, unitCents: 583, estimated: true },
    ],
  },
  "7_inch": {
    Black: [
      { qty: 50, unitCents: 2594 },
      { qty: 100, unitCents: 1429 },
      { qty: 200, unitCents: 857 },
      { qty: 300, unitCents: 665 },
      { qty: 500, unitCents: 472 },
      { qty: 1000, unitCents: 381 },
    ],
    "House Mix": [
      { qty: 50, unitCents: 2276 },
      { qty: 100, unitCents: 1313 },
      { qty: 200, unitCents: 834 },
      { qty: 300, unitCents: 673 },
      { qty: 500, unitCents: 495 },
      { qty: 1000, unitCents: 380 },
    ],
    "Translucent Colors": [
      { qty: 50, unitCents: 2420 },
      { qty: 100, unitCents: 1407 },
      { qty: 200, unitCents: 903 },
      { qty: 300, unitCents: 734 },
      { qty: 500, unitCents: 577 },
      { qty: 1000, unitCents: 440 },
    ],
    "Clear Colors": [
      { qty: 50, unitCents: 2420 },
      { qty: 100, unitCents: 1407 },
      { qty: 200, unitCents: 903 },
      { qty: 300, unitCents: 734 },
      { qty: 500, unitCents: 577 },
      { qty: 1000, unitCents: 440 },
    ],
    "Metallic Colors": [
      { qty: 50, unitCents: 2420 },
      { qty: 100, unitCents: 1407 },
      { qty: 200, unitCents: 903, estimated: true },
      { qty: 300, unitCents: 734, estimated: true },
      { qty: 500, unitCents: 577, estimated: true },
      { qty: 1000, unitCents: 440, estimated: true },
    ],
    "Opaque Colors": [
      { qty: 50, unitCents: 2420 },
      { qty: 100, unitCents: 1407 },
      { qty: 200, unitCents: 903, estimated: true },
      { qty: 300, unitCents: 734, estimated: true },
      { qty: 500, unitCents: 577, estimated: true },
      { qty: 1000, unitCents: 440, estimated: true },
    ],
  },
  // 2LP short-run estimates: Hellbender's 1LP→2LP ratio applied to the
  // confirmed 1LP color/splatter rungs (Bill-approved). 500/1000/2000
  // stay on the confirmed PDF quote already seeded by Task #638.
  "12_double": {
    Color: [
      { qty: 100, unitCents: 3365, estimated: true },
      { qty: 200, unitCents: 2189, estimated: true },
      { qty: 300, unitCents: 1799, estimated: true },
    ],
    Splatter: [
      { qty: 100, unitCents: 3598, estimated: true },
      { qty: 200, unitCents: 2393, estimated: true },
      { qty: 300, unitCents: 1993, estimated: true },
    ],
  },
};

// Task #631 — additional Hellbender jacket SKUs published on their
// templates page. Wide-spine is 2×LP-only; gatefolds apply to 12"
// formats only (not 7"). `formats` drives pricing-combo seeding;
// `applicableFormats` (Task #1998) drives admin-UI visibility — kept
// in sync by getJacketDefaultFormats so they always agree.
const HELLBENDER_EXTRA_JACKETS: ReadonlyArray<{
  name: string;
  formats: AlbumFormat[];
}> = [
  { name: "Gatefold Jacket (1 pocket)", formats: ["12_lp", "12_double"] },
  { name: "Gatefold Jacket (2 pocket)", formats: ["12_lp", "12_double"] },
  { name: "Single Pocket Wide-Spine Jacket", formats: ["12_double"] },
];

export async function seedHellbenderCatalog() {
  if (hellbenderSeedRan) return;
  hellbenderSeedRan = true;
  try {
    const press = await storage.getManufacturerByDomain(HELLBENDER_DOMAIN);
    if (!press) {
      hellbenderSeedRan = false;
      return;
    }

    // Task #624 — Hellbender's quoted broker arrangement is a 10%
    // discount off the catalog price. Seed it once (only when the
    // column is still at the schema default of 0) so an admin can
    // edit the number later without the seed clobbering them.
    if (Number((press as any).brokerDiscountPct ?? 0) === 0) {
      await db.execute(sql`
        UPDATE manufacturers SET broker_discount_pct = 10
        WHERE id = ${press.id} AND broker_discount_pct = 0
      `);
    }

    // Task #631 — investor-matrix summary + turnaround. Only fills
    // empty columns; never clobbers operator edits.
    await ensureManufacturerSummary(press.id, {
      bio: "Boutique / custom collectible-focused pressing plant based in Pittsburgh, PA.",
      turnaroundWeeksMin: 10,
      turnaroundWeeksMax: 12,
    });

    // Ensure the standard jacket exists + is flagged default, plus the
    // additional published Hellbender SKUs (gatefold 1/2-pocket; the
    // wide-spine SKU is materialised only under 12_double further down).
    const defaultJacket = await ensureJacket(press.id, HELLBENDER_STANDARD_JACKET, 0, { isDefault: true });
    const extraJackets: Record<string, { id: string; formats: AlbumFormat[] }> = {};
    for (let i = 0; i < HELLBENDER_EXTRA_JACKETS.length; i++) {
      const spec = HELLBENDER_EXTRA_JACKETS[i];
      const j = await ensureJacket(press.id, spec.name, i + 1, {
        applicableFormats: getJacketDefaultFormats(spec.name),
      });
      extraJackets[spec.name] = { id: j.id, formats: spec.formats };
    }

    // Hellbender presses 7", 1LP, and 2LP. 7" keeps the legacy multi-
    // tier seed (Hellbender's May-2026 quote didn't touch 7"); 12_lp +
    // 12_double use the Black/Color/Splatter set with confirmed 500/
    // 1000/2000 rungs (Color + Splatter) and Black-as-placeholder.
    // Task #631 — every default-jacket ladder gets 100/200/300 added
    // as unconfirmed placeholders so the six-column comparison shape
    // reads consistently across all three presses.
    const formats: AlbumFormat[] = ["7_inch", "12_lp", "12_double"];

    for (let fi = 0; fi < formats.length; fi++) {
      const fmt = formats[fi];
      await ensureFormat(press.id, fmt, fi);

      type TierBuild = { name: string; ladder: LadderRungSpec[]; colors: { name: string; hex: string | null }[] };
      const tierBuilds: TierBuild[] = [];

      if (fmt === "7_inch") {
        const size = pressingSizeForFormat(fmt);
        for (const tierKey of VINYL_COLOR_TIER_ORDER) {
          const name = VINYL_COLOR_TIER_LABEL[tierKey];
          const ladder: LadderRungSpec[] = size
            ? VINYL_QUANTITY_TIERS.map((q) => ({
                qty: q as number,
                unitCents: HELLBENDER_MATRIX[tierKey][size][q].none,
                confirmed: true,
              }))
            : [];
          const colors = VINYL_COLORS.filter((c) => c.tier === tierKey).map((c) => ({
            name: c.name,
            hex: representativeHex(c.swatch),
          }));
          tierBuilds.push({ name, ladder, colors });
        }
      } else {
        const key = fmt as "12_lp" | "12_double";
        // Task #631 — seed Hellbender's published color groups onto
        // the 12" Color tier (every published swatch except Black,
        // which lives on its own tier). Splatter stays empty —
        // Hellbender hasn't published splatter colors.
        const color12Swatches = VINYL_COLORS.filter((c) => c.tier !== "black").map((c) => ({
          name: c.name,
          hex: representativeHex(c.swatch),
        }));
        for (const name of HELLBENDER_NEW_12_TIER_NAMES) {
          const ladder = HELLBENDER_NEW_12_LADDERS[key]?.[name] ?? [];
          let colors: { name: string; hex: string | null }[] = [];
          if (name === "Black") colors = [{ name: "Black", hex: "#0c0c0c" }];
          else if (name === "Color") colors = color12Swatches;
          tierBuilds.push({ name, ladder, colors });
        }
        // Task #684 — give the 12" catalog the same color-group tiers
        // 7" already carries (House Mix / Translucent / Clear / Metallic
        // / Opaque) so Bill's site-sourced 12" color pricing has a home.
        // 12_double keeps only Black/Color/Splatter — Hellbender doesn't
        // publish per-group 2LP pricing. Ladders are force-written in the
        // post-loop block; here we only scaffold the tier + its colors so
        // the combo + placeholder rungs exist to be overwritten.
        if (key === "12_lp") {
          for (const tierKey of HELLBENDER_12_COLOR_GROUP_TIER_KEYS) {
            const name = VINYL_COLOR_TIER_LABEL[tierKey];
            const colors = VINYL_COLORS.filter((c) => c.tier === tierKey).map((c) => ({
              name: c.name,
              hex: representativeHex(c.swatch),
            }));
            tierBuilds.push({ name, ladder: [], colors });
          }
        }
      }

      // Ensure tiers + their default-jacket combo + the standard
      // comparison rungs. Existing confirmed rungs stay untouched;
      // missing rungs (100/200/300 across the board, plus any quantity
      // the legacy 7" seed doesn't cover) are added as placeholders.
      for (let ti = 0; ti < tierBuilds.length; ti++) {
        const build = tierBuilds[ti];
        const tier = await ensureTier(press.id, fmt, build.name, ti);
        for (let ci = 0; ci < build.colors.length; ci++) {
          await ensureColor(tier.id, build.colors[ci].name, build.colors[ci].hex, ci);
        }
        await ensureCombo(tier.id, defaultJacket.id, build.ladder);
        await addMissingRungs(tier.id, defaultJacket.id, STANDARD_COMPARISON_QUANTITIES);
        // Task #638 — repair stale rungs from the old seed that stored
        // total-dollars in the `unitCents` field. Idempotent: no-op
        // when the rung already matches.
        for (const r of build.ladder) {
          if (r.confirmed && r.unitCents > 0) {
            await forceRungPrice(tier.id, defaultJacket.id, r.qty, r.unitCents);
          }
        }

        // Each tier × every applicable extra jacket gets an all-
        // unconfirmed comparison ladder so the matrix reads with the
        // same shape across jackets.
        for (const spec of HELLBENDER_EXTRA_JACKETS) {
          if (!spec.formats.includes(fmt)) continue;
          const extra = extraJackets[spec.name];
          if (!extra) continue;
          await ensureCombo(tier.id, extra.id, placeholderLadder());
          await addMissingRungs(tier.id, extra.id, STANDARD_COMPARISON_QUANTITIES);
        }
      }
    }

    // Task #684 — load Bill's upgrade-inclusive Hellbender site pricing
    // onto every loaded tier's default-jacket ladder. These overwrite
    // the legacy 7" `.none` matrix values + the 12" placeholders, carry a
    // `source`/`lockedFromSync` stamp so the Shopify importer leaves them
    // alone, and flag interpolated cells via `estimated`. 2,000 (+ the
    // legacy 7" 3,000 the old seed pinned to the 1,000 value) drop back
    // to "awaiting quote" — Hellbender doesn't publish those runs.
    {
      const syncedAt = new Date().toISOString();
      const allTiers = await db
        .select()
        .from(pressColorTiers)
        .where(eq(pressColorTiers.pressId, press.id));
      const tierByFmtName = new Map<string, PressColorTier>();
      for (const t of allTiers) tierByFmtName.set(`${t.format}|${t.name}`, t);
      for (const [fmt, byTier] of Object.entries(HELLBENDER_SITE_LADDERS)) {
        for (const [tierName, rungs] of Object.entries(byTier)) {
          const tier = tierByFmtName.get(`${fmt}|${tierName}`);
          if (!tier) continue;
          for (const rung of rungs) {
            await setSiteRung(tier.id, defaultJacket.id, rung, HELLBENDER_SITE_SOURCE, syncedAt);
          }
          if (fmt === "7_inch") {
            await demoteRungToPlaceholder(tier.id, defaultJacket.id, 2000);
            await demoteRungToPlaceholder(tier.id, defaultJacket.id, 3000);
          }
        }
      }
    }

    // Task #672 — repair existing dev/prod rows that an earlier seed
    // inserted with a NULL swatchHex for gradient stocks (smokey /
    // metallic / house-mix). Derive a representative solid from each
    // VINYL_COLORS swatch and fill only blank, never-imported rows so
    // the picker chip + VinylPreview disc stop reading grey for colors
    // we actually know. Tier-agnostic because the same color name
    // appears under both the 7" tier and the 12" Color tier.
    const hellbenderHexByName: Record<string, string> = {};
    for (const c of VINYL_COLORS) {
      const hex = representativeHex(c.swatch);
      if (hex) hellbenderHexByName[c.name] = hex;
    }
    await backfillColorHexesByName(press.id, hellbenderHexByName);
  } catch (e) {
    console.warn("[pressCatalog] Hellbender seed failed:", (e as Error).message);
    hellbenderSeedRan = false;
  }
}

// ─── Booklet add-on (Task #579, opened to MRP in Task #625) ──────────
//
// PMP was the only press quoting booklets when the add-on shipped; MRP
// added their own 7" booklet quote in May 2026. The trim varies by
// vendor (PMP: 7.125"×7.125", 16pp, 4/4 on 100# gloss; MRP: 16pp CMYK
// 4/4 on 150gsm art paper, open-top poly bag + assembly, standalone —
// not auto-bundled into 7" vinyl). Both vendors share the same per-rung
// shape (totals in dollars; per-unit cents = total ÷ qty, rounded to
// nearest cent).
//
// The ladders live in code rather than a `press_booklet_ladders` table
// because only two vendors quote booklets today and the rungs change
// once a year. Lift to a DB table when a third vendor joins or the
// admin wants to edit rungs without a deploy.
export const PMP_DOMAIN = "physicalmusicproducts.com";
export const MRP_DOMAIN = "memphisrecordpressing.com";

type BookletLadderRung = { qty: number; unitCents: number; confirmed?: boolean };
type BookletLadder = {
  domain: string;
  label: string;
  rungs: ReadonlyArray<BookletLadderRung>;
  runTotalsCents: Readonly<Record<number, number>>;
  /** Free-text spec captured on the ladder so admin tooltips/docs can
   *  read the booklet config without re-parsing the vendor doc. */
  spec: string;
};

const PMP_BOOKLET: BookletLadder = {
  domain: PMP_DOMAIN,
  label: "PMP",
  // Task #631 — the booklet ladder shares the comparison-matrix
  // column shape (100/200/300/500/1000/2000+) with the per-tier
  // vinyl ladders. The 100/200/300 rungs are unconfirmed placeholders
  // until PMP quotes them; snapBookletQty / lookupBookletUnitCents
  // filter `confirmed:false` out so we never resolve a $0 booklet.
  rungs: [
    { qty: 100, unitCents: 0, confirmed: false },
    { qty: 200, unitCents: 0, confirmed: false },
    { qty: 300, unitCents: 0, confirmed: false },
    { qty: 500, unitCents: 407, confirmed: true },   // $2036.27 / 500  ≈ $4.07 ea
    { qty: 1000, unitCents: 271, confirmed: true },  // $2711.90 / 1000 ≈ $2.71 ea
    { qty: 2000, unitCents: 202, confirmed: true },  // $4036.06 / 2000 ≈ $2.02 ea
    { qty: 5000, unitCents: 159, confirmed: true },  // $7965.47 / 5000 ≈ $1.59 ea
  ],
  runTotalsCents: { 500: 203627, 1000: 271190, 2000: 403606, 5000: 796547 },
  spec: "16pp, 4/4 on 100# gloss text, 7.125\" × 7.125\".",
};

// Task #625 — MRP's 7" booklet quote (May 2026, valid through 6/26/26).
// retailCents = costCents on every rung (MRP doesn't give a broker
// discount, GoodTunes doesn't add markup). Per-unit cents are total ÷
// qty rounded to nearest cent (e.g. $1121.43 / 500 ≈ $2.24/ea).
const MRP_BOOKLET: BookletLadder = {
  domain: MRP_DOMAIN,
  label: "MRP",
  // Task #631 — 100/200 added as unconfirmed placeholders so the
  // booklet ladder reads with the same six-column shape as the per-
  // tier vinyl ladders. snap/lookup filter `confirmed:false` so they
  // never resolve as $0. Task #1310 — MRP quoted the 300 + 3000 rungs
  // (May 2026, valid 6/26/26), so both are now confirmed.
  rungs: [
    { qty: 100, unitCents: 0, confirmed: false },
    { qty: 200, unitCents: 0, confirmed: false },
    { qty: 300, unitCents: 331, confirmed: true },   // $993.43 / 300   ≈ $3.31 ea
    { qty: 500, unitCents: 224, confirmed: true },   // $1121.43 / 500  ≈ $2.24 ea
    { qty: 1000, unitCents: 144, confirmed: true },  // $1441.43 / 1000 ≈ $1.44 ea
    { qty: 2000, unitCents: 133, confirmed: true },  // $2654.29 / 2000 ≈ $1.33 ea
    { qty: 3000, unitCents: 121, confirmed: true },  // $3638.57 / 3000 ≈ $1.21 ea
  ],
  runTotalsCents: { 300: 99343, 500: 112143, 1000: 144143, 2000: 265429, 3000: 363857 },
  spec: "16pp, CMYK 4/4, 150gsm art paper, open-top poly bag + assembly. Standalone add-on — not auto-bundled into 7\" vinyl.",
};

const BOOKLET_LADDERS_BY_DOMAIN: Readonly<Record<string, BookletLadder>> = {
  [PMP_DOMAIN]: PMP_BOOKLET,
  [MRP_DOMAIN]: MRP_BOOKLET,
};

/** Resolve which vendor's booklet ladder applies. Falls back to PMP
 *  when the routed press doesn't quote a booklet (or isn't supplied)
 *  so artists on Hellbender / unassigned still see a price. */
export function resolveBookletLadder(pressDomain: string | null | undefined): BookletLadder {
  if (pressDomain && BOOKLET_LADDERS_BY_DOMAIN[pressDomain]) {
    return BOOKLET_LADDERS_BY_DOMAIN[pressDomain];
  }
  return PMP_BOOKLET;
}

// Back-compat exports — these were the names other modules imported
// before the per-vendor refactor.
export const PMP_BOOKLET_LADDER: ReadonlyArray<BookletLadderRung> = PMP_BOOKLET.rungs;
export const PMP_BOOKLET_RUN_TOTALS_CENTS: Readonly<Record<number, number>> = PMP_BOOKLET.runTotalsCents;

/** Snap a planned quantity *up* to the nearest configured rung for
 *  this vendor's ladder. Task #631 — unconfirmed placeholder rungs
 *  (e.g. seeded 100/200/300 before the press quotes them) are filtered
 *  out so a fan-side booklet planned at 200 doesn't snap to a $0 rung. */
export function snapBookletQty(
  plannedQty: number | null,
  pressDomain: string | null = null,
): number {
  const ladder = resolveBookletLadder(pressDomain).rungs
    .filter((r) => r.confirmed !== false)
    .sort((a, b) => a.qty - b.qty);
  if (ladder.length === 0) return 0;
  if (!plannedQty || plannedQty <= 0) return ladder[0].qty;
  for (const r of ladder) if (plannedQty <= r.qty) return r.qty;
  return ladder[ladder.length - 1].qty;
}

/** Look up the per-unit booklet wholesale for a planned quantity. */
export function lookupBookletUnitCents(
  plannedQty: number | null,
  pressDomain: string | null = null,
): number {
  const ladder = resolveBookletLadder(pressDomain);
  const confirmed = ladder.rungs.filter((r) => r.confirmed !== false);
  if (confirmed.length === 0) return 0;
  const snapped = snapBookletQty(plannedQty, pressDomain);
  const row = confirmed.find((r) => r.qty === snapped);
  return row?.unitCents ?? confirmed[confirmed.length - 1].unitCents;
}

// ─── MRP seed (Task #625) ────────────────────────────────────────────

const MRP_STANDARD_JACKET = "Standard Full-Color Jacket";
let mrpSeedRan = false;

// MRP's May 2026 quote (valid through 6/26/26): 1LP + 2LP each get a
// Black / Color / Splatter tier and 7" gets the same three. Color and
// Splatter on 1LP/2LP and Color on 7" carry confirmed rungs at 500 /
// 1000 / 2000; every other rung is seeded as `confirmed: false` so
// the catalog editor renders them yellow with a "TBD — awaiting quote"
// hint. Per MRP's CEO: retail = cost on every rung (GoodTunes does not
// mark up; MRP gives no broker discount).
const MRP_TIER_NAMES = ["Black", "Color", "Splatter"] as const;
type MrpRungSpec = { qty: number; unitCents: number; confirmed: boolean };
// Task #638 — values are per-unit cents derived from the May-2026 MRP
// PDF estimate (`MRP_ESTIMATE-GoGoods-Generic-052726`). retail = cost
// on every rung (MRP gives no broker discount; GoodTunes adds no
// markup). Earlier seed stored vendor TOTAL dollars in this field
// labelled `unitCents`, which made the catalog UI render $82+/record
// for $16-ish vinyl — see `.agents/memory/press-catalog-units.md`.
// MRP's PDF prices five qtys (300/500/1000/2000/3000); all five are
// confirmed here. The catalog comparison matrix only renders 100–2000
// by default, but the 300/3000 rungs persist so the editor reads them.
const MRP_LADDERS: Record<"7_inch" | "12_lp" | "12_double", Record<string, MrpRungSpec[]>> = {
  "12_lp": {
    Black: [
      { qty: 500, unitCents: 0, confirmed: false },
      { qty: 1000, unitCents: 0, confirmed: false },
      { qty: 2000, unitCents: 0, confirmed: false },
    ],
    Color: [
      { qty: 300, unitCents: 1112, confirmed: true },   // $3,337 / 300
      { qty: 500, unitCents: 775, confirmed: true },    // $3,875 / 500
      { qty: 1000, unitCents: 543, confirmed: true },   // $5,430 / 1000
      { qty: 2000, unitCents: 458, confirmed: true },   // $9,150 / 2000
      { qty: 3000, unitCents: 434, confirmed: true },   // $13,010 / 3000
    ],
    Splatter: [
      { qty: 300, unitCents: 1221, confirmed: true },   // $3,664 / 300
      { qty: 500, unitCents: 850, confirmed: true },    // $4,250 / 500
      { qty: 1000, unitCents: 608, confirmed: true },   // $6,075 / 1000
      { qty: 2000, unitCents: 510, confirmed: true },   // $10,195 / 2000
      { qty: 3000, unitCents: 482, confirmed: true },   // $14,455 / 3000
    ],
  },
  "12_double": {
    Black: [
      { qty: 500, unitCents: 0, confirmed: false },
      { qty: 1000, unitCents: 0, confirmed: false },
      { qty: 2000, unitCents: 0, confirmed: false },
    ],
    Color: [
      { qty: 300, unitCents: 2391, confirmed: true },   // $7,172 / 300
      { qty: 500, unitCents: 1643, confirmed: true },   // $8,215 / 500
      { qty: 1000, unitCents: 1138, confirmed: true },  // $11,380 / 1000
      { qty: 2000, unitCents: 914, confirmed: true },   // $18,280 / 2000
      { qty: 3000, unitCents: 859, confirmed: true },   // $25,780 / 3000
    ],
    Splatter: [
      { qty: 300, unitCents: 2609, confirmed: true },   // $7,826 / 300
      { qty: 500, unitCents: 1793, confirmed: true },   // $8,965 / 500
      { qty: 1000, unitCents: 1267, confirmed: true },  // $12,670 / 1000
      { qty: 2000, unitCents: 1019, confirmed: true },  // $20,370 / 2000
      { qty: 3000, unitCents: 956, confirmed: true },   // $28,670 / 3000
    ],
  },
  "7_inch": {
    Black: [
      { qty: 500, unitCents: 0, confirmed: false },
      { qty: 1000, unitCents: 0, confirmed: false },
      { qty: 2000, unitCents: 0, confirmed: false },
    ],
    Color: [
      { qty: 300, unitCents: 753, confirmed: true },    // $2,259 / 300
      { qty: 500, unitCents: 568, confirmed: true },    // $2,840 / 500
      { qty: 1000, unitCents: 431, confirmed: true },   // $4,310 / 1000
      { qty: 2000, unitCents: 385, confirmed: true },   // $7,700 / 2000
      { qty: 3000, unitCents: 365, confirmed: true },   // $10,950 / 3000
    ],
    Splatter: [
      { qty: 500, unitCents: 0, confirmed: false },
      { qty: 1000, unitCents: 0, confirmed: false },
      { qty: 2000, unitCents: 0, confirmed: false },
    ],
  },
};

// Task #631 — MRP's full published color library, keyed by tier with
// the MRP code-prefixed swatch names from `docs/vendors/mrp.md`.
// Task #672 — each swatch now carries a best-guess `hex` so the Sell
// panel picker + VinylPreview disc render a distinct, name-appropriate
// color even before a real per-color photo is imported (the MRP
// importer overwrites `swatchImageUrl` with the masked photo when run).
// Translucent / Smoke / Glow families are biased light/desaturated so
// they read as semi-transparent next to the solid Opaque tier.
type MrpSwatch = { name: string; hex: string };
const MRP_COLOR_TIERS: ReadonlyArray<{ name: string; swatches: MrpSwatch[] }> = [
  { name: "EcoMix", swatches: [
    { name: "ECO1 Blues", hex: "#3a6ea5" },
    { name: "ECO2 Greens", hex: "#3f8f57" },
    { name: "ECO3 Magentas", hex: "#b13a86" },
    { name: "ECO4 Yellows", hex: "#d9b13a" },
    { name: "ECO5 Reds", hex: "#b13a3a" },
    { name: "ECO6 Grays", hex: "#6f6f6f" },
    { name: "ECO7 Metallic", hex: "#9a9aa2" },
  ] },
  { name: "Translucent", swatches: [
    { name: "T01 Ruby", hex: "#c0566a" },
    { name: "T02 Ultra Clear", hex: "#e8eef2" },
    { name: "T03 Cobalt", hex: "#5a86c8" },
    { name: "T04 Emerald", hex: "#5fb98a" },
    { name: "T05 Grape", hex: "#9a6fc0" },
    { name: "T06 Light Blue", hex: "#a9d2ef" },
    { name: "T07 Lemonade", hex: "#f2e79a" },
    { name: "T08 Orange Crush", hex: "#f0a866" },
    { name: "T09 Coke Bottle Clear", hex: "#8fae93" },
    { name: "T10 Highlighter Yellow", hex: "#e6ee7a" },
    { name: "T11 Milky Clear", hex: "#eae6dd" },
    { name: "T12 Forest Green", hex: "#4f8f63" },
    { name: "T13 Sea Blue", hex: "#79b6c2" },
    { name: "T14 Tan", hex: "#d8c49a" },
    { name: "T15 Black Ice", hex: "#6b7078" },
  ] },
  { name: "Opaque", swatches: [
    { name: "O01 Brown", hex: "#5b3a1e" },
    { name: "O02 White", hex: "#f5f5f2" },
    { name: "O03 Apple Red", hex: "#c8242b" },
    { name: "O04 Orchid", hex: "#c97fc0" },
    { name: "O05 Sky Blue", hex: "#5fb0e6" },
    { name: "O06 Baby Blue", hex: "#a9d2ef" },
    { name: "O07 Tangerine", hex: "#ef8b3a" },
    { name: "O08 Baby Pink", hex: "#f4b8cc" },
    { name: "O09 Canary Yellow", hex: "#f5e23a" },
    { name: "O10 Magenta", hex: "#c01f76" },
    { name: "O11 Silver", hex: "#c2c6cc" },
    { name: "O12 Spring Green", hex: "#7ec850" },
    { name: "O13 Gray", hex: "#8a8a8a" },
    { name: "O14 Bone", hex: "#e8e0cf" },
    { name: "O15 Hot Pink", hex: "#f0468f" },
    { name: "O16 Gold", hex: "#c9a44a" },
    { name: "O17 Fruit Punch", hex: "#e23a5e" },
    { name: "O18 Olive Green", hex: "#6f7a33" },
    { name: "O19 Aqua", hex: "#4fc3c0" },
    { name: "O20 Custard", hex: "#f3df9a" },
    { name: "O21 Lemon", hex: "#eee44a" },
    { name: "O22 Bluejay", hex: "#2f63c0" },
    { name: "O23 Evergreen", hex: "#1f5c39" },
    { name: "O24 Violet", hex: "#7a3aa8" },
  ] },
  { name: "Neon/Glow", swatches: [
    { name: "G01 Glow Green", hex: "#b6f5c0" },
    { name: "N01 Neon Violet", hex: "#9a4dff" },
    { name: "N02 Neon Green", hex: "#5cff6a" },
    { name: "N03 Neon Yellow", hex: "#eaff3a" },
    { name: "N04 Neon Orange", hex: "#ff7a1a" },
    { name: "N05 Neon Coral", hex: "#ff5a6a" },
    { name: "N06 Neon Pink", hex: "#ff4da6" },
  ] },
  { name: "Smoke Blends", swatches: [
    { name: "SB01 Clear", hex: "#d8dde0" },
    { name: "SB02 Red", hex: "#a8606a" },
    { name: "SB03 Green", hex: "#6f9a78" },
    { name: "SB04 Purple", hex: "#8a6f9a" },
    { name: "SB05 Silver", hex: "#b7bcc2" },
    { name: "SB06 Electric", hex: "#6f8fb0" },
    { name: "SB07 Blue", hex: "#6f8fc0" },
    { name: "SB08 Yellow", hex: "#cfc98a" },
    { name: "SB09 Orange", hex: "#cf9a6a" },
    { name: "SB10 Coke Bottle Clear", hex: "#8fae93" },
    { name: "SB11 Highlighter", hex: "#c8d27a" },
    { name: "SB12 Sea Blue", hex: "#7fa8b6" },
    { name: "SB13 Tan", hex: "#c4b394" },
  ] },
  { name: "Cream Blends", swatches: [
    { name: "CB Cocoa", hex: "#6b4a32" },
    { name: "CB Blueberry", hex: "#6a7ab0" },
    { name: "CB Sea Salt", hex: "#e6e7e2" },
    { name: "CB Fig", hex: "#7a5a6a" },
    { name: "CB Mushroom", hex: "#c2b29a" },
    { name: "CB Honey Dew Melon", hex: "#c5e0a0" },
    { name: "CB Earl Gray", hex: "#9a9a96" },
    { name: "CB Watermelon", hex: "#e88a96" },
    { name: "CB Caramel", hex: "#c79a5a" },
    { name: "CB Guava", hex: "#e8a48a" },
  ] },
];

// Task #631 — MRP jacket SKUs from the templates page. The default
// "Single Jacket" matches the published Center Label + Single Jacket
// template (and the existing seed renames any legacy
// "Standard Full-Color Jacket" row up to it). Wide-spine is 2×LP-only;
// gatefolds + tip-on variants are 1LP/2LP only (7" has its own jacket
// lineup and isn't part of the new SKU list).
const MRP_DEFAULT_JACKET = "Single Jacket";
const MRP_EXTRA_JACKETS: ReadonlyArray<{ name: string; formats: AlbumFormat[] }> = [
  { name: "Widespine Jacket", formats: ["12_double"] },
  { name: "Gatefold Jacket", formats: ["12_lp", "12_double"] },
  { name: "Tri-Fold Gatefold", formats: ["12_lp", "12_double"] },
  { name: "Old-Style Tip-On Single", formats: ["12_lp", "12_double"] },
  { name: "Old-Style Tip-On Gatefold", formats: ["12_lp", "12_double"] },
];

// Task #1310 — MRP's cassette quote (May 2026, valid 6/26/26). Cassette
// is a single one-color imprint with a J-card printed both sides (=
// the album cover), so it has NO color/splatter axis — a single tier on
// the default jacket carries the whole ladder. Per-unit cents are the
// all-in MRP total (flat $3.20/unit production + per-run setup fee) ÷
// qty, so the per-run setup amortises into the rung. retail = cost
// (MRP gives no broker discount; GoodTunes adds no markup).
//   300  → $1,140   ($960 + $180 setup)  ≈ $3.80 ea
//   500  → $1,800   ($1,600 + $200 setup) ≈ $3.60 ea
//   1000 → $3,450   ($3,200 + $250 setup) ≈ $3.45 ea
//   2000 → $6,750   ($6,400 + $350 setup) ≈ $3.38 ea
//   3000 → $10,050  ($9,600 + $450 setup) ≈ $3.35 ea
const MRP_CASSETTE_TIER = "Cassette";
const MRP_CASSETTE_LADDER: MrpRungSpec[] = [
  { qty: 300, unitCents: 380, confirmed: true },
  { qty: 500, unitCents: 360, confirmed: true },
  { qty: 1000, unitCents: 345, confirmed: true },
  { qty: 2000, unitCents: 338, confirmed: true },
  { qty: 3000, unitCents: 335, confirmed: true },
];

export async function seedMrpCatalog() {
  if (mrpSeedRan) return;
  mrpSeedRan = true;
  try {
    const press = await storage.getManufacturerByDomain(MRP_DOMAIN);
    if (!press) {
      mrpSeedRan = false;
      return;
    }

    // Task #631 — investor-matrix summary + 8–10-week turnaround.
    await ensureManufacturerSummary(press.id, {
      bio: "Large-scale established pressing operation based in Memphis, TN.",
      turnaroundWeeksMin: 8,
      turnaroundWeeksMax: 10,
    });

    // One-time rename of the legacy "Standard Full-Color Jacket" row
    // up to the published "Single Jacket" name. Guarded so it's a
    // no-op if "Single Jacket" already exists (no unique conflict).
    await db.execute(sql`
      UPDATE press_jackets SET name = ${MRP_DEFAULT_JACKET}
      WHERE press_id = ${press.id}
        AND name = ${MRP_STANDARD_JACKET}
        AND NOT EXISTS (
          SELECT 1 FROM press_jackets j2
          WHERE j2.press_id = ${press.id} AND j2.name = ${MRP_DEFAULT_JACKET}
        )
    `);

    const defaultJacket = await ensureJacket(press.id, MRP_DEFAULT_JACKET, 0, { isDefault: true });
    const extraJacketRows: Record<string, { id: string; formats: AlbumFormat[] }> = {};
    for (let i = 0; i < MRP_EXTRA_JACKETS.length; i++) {
      const spec = MRP_EXTRA_JACKETS[i];
      const j = await ensureJacket(press.id, spec.name, i + 1, {
        applicableFormats: getJacketDefaultFormats(spec.name),
      });
      extraJacketRows[spec.name] = { id: j.id, formats: spec.formats };
    }

    const formats: AlbumFormat[] = ["7_inch", "12_lp", "12_double"];
    const allTierNames: string[] = [...MRP_TIER_NAMES, ...MRP_COLOR_TIERS.map((t) => t.name)];

    for (let fi = 0; fi < formats.length; fi++) {
      const fmt = formats[fi];
      await ensureFormat(press.id, fmt, fi);
      const key = fmt as "7_inch" | "12_lp" | "12_double";

      // Base Black/Color/Splatter tiers — confirmed 500/1000/2000 from
      // #625's quote; Task #631 adds 100/200/300 placeholders.
      for (let ti = 0; ti < MRP_TIER_NAMES.length; ti++) {
        const name = MRP_TIER_NAMES[ti];
        const tier = await ensureTier(press.id, fmt, name, ti);
        const initial = MRP_LADDERS[key]?.[name] ?? placeholderLadder();
        await ensureCombo(tier.id, defaultJacket.id, initial as LadderRungSpec[]);
        await addMissingRungs(tier.id, defaultJacket.id, STANDARD_COMPARISON_QUANTITIES);
        // Task #638 — repair stale rungs from the old seed that stored
        // MRP's TOTAL dollars in the `unitCents` field. Idempotent.
        for (const r of initial) {
          if (r.confirmed && r.unitCents > 0) {
            await forceRungPrice(tier.id, defaultJacket.id, r.qty, r.unitCents);
          }
        }

        // Extra jackets get an all-placeholder comparison ladder.
        for (const spec of MRP_EXTRA_JACKETS) {
          if (!spec.formats.includes(fmt)) continue;
          const extra = extraJacketRows[spec.name];
          if (!extra) continue;
          await ensureCombo(tier.id, extra.id, placeholderLadder());
          await addMissingRungs(tier.id, extra.id, STANDARD_COMPARISON_QUANTITIES);
        }
      }

      // Task #631 — additional MRP color-library tiers (EcoMix /
      // Translucent / Opaque / Neon-Glow / Smoke Blends / Cream Blends).
      // Every (tier × jacket) combo seeded all-placeholder until MRP
      // quotes the rungs.
      for (let ci = 0; ci < MRP_COLOR_TIERS.length; ci++) {
        const colorTier = MRP_COLOR_TIERS[ci];
        const tier = await ensureTier(press.id, fmt, colorTier.name, MRP_TIER_NAMES.length + ci);
        for (let sx = 0; sx < colorTier.swatches.length; sx++) {
          await ensureColor(tier.id, colorTier.swatches[sx].name, colorTier.swatches[sx].hex, sx);
        }
        await ensureCombo(tier.id, defaultJacket.id, placeholderLadder());
        await addMissingRungs(tier.id, defaultJacket.id, STANDARD_COMPARISON_QUANTITIES);
        for (const spec of MRP_EXTRA_JACKETS) {
          if (!spec.formats.includes(fmt)) continue;
          const extra = extraJacketRows[spec.name];
          if (!extra) continue;
          await ensureCombo(tier.id, extra.id, placeholderLadder());
          await addMissingRungs(tier.id, extra.id, STANDARD_COMPARISON_QUANTITIES);
        }
      }
    }

    // Task #1310 — cassette. Single one-color tier on the default
    // jacket (J-card = album cover), no color rows. Confirmed ladder
    // at every rung MRP quoted; addMissingRungs fills the comparison
    // matrix's 100/200 columns with placeholders so the editor reads
    // with the same shape as the vinyl formats.
    await ensureFormat(press.id, "cassette", formats.length);
    const cassetteTier = await ensureTier(press.id, "cassette", MRP_CASSETTE_TIER, 0);
    await ensureCombo(cassetteTier.id, defaultJacket.id, MRP_CASSETTE_LADDER as LadderRungSpec[]);
    await addMissingRungs(cassetteTier.id, defaultJacket.id, STANDARD_COMPARISON_QUANTITIES);
    for (const r of MRP_CASSETTE_LADDER) {
      if (r.confirmed && r.unitCents > 0) {
        await forceRungPrice(cassetteTier.id, defaultJacket.id, r.qty, r.unitCents);
      }
    }

    // Task #631 — short-run package: 12" LP × Single Jacket × Black at
    // 100/200/300 (retail = cost, per MRP's "no markup" rule). These
    // upgrade three otherwise-placeholder rungs to confirmed.
    const [blackLp] = await db
      .select()
      .from(pressColorTiers)
      .where(
        and(
          eq(pressColorTiers.pressId, press.id),
          eq(pressColorTiers.format, "12_lp"),
          eq(pressColorTiers.name, "Black"),
        ),
      );
    if (blackLp) {
      // $1350 / 100 = 1350 ¢/unit; $1750 / 200 = 875 ¢; $2085 / 300 ≈ 695 ¢.
      await upgradeRung(blackLp.id, defaultJacket.id, 100, 1350);
      await upgradeRung(blackLp.id, defaultJacket.id, 200, 875);
      await upgradeRung(blackLp.id, defaultJacket.id, 300, 695);
    }

    // Task #672 — backfill best-guess hex onto rows seeded name-only by
    // earlier runs (every format's copy of each color-library tier).
    await backfillColorHexes(press.id, mrpColorHexByTier());
  } catch (e) {
    console.warn("[pressCatalog] MRP seed failed:", (e as Error).message);
    mrpSeedRan = false;
  }
}

/** Tier name → { color name → hex } derived from MRP_COLOR_TIERS, used
 *  to backfill existing rows. */
function mrpColorHexByTier(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const t of MRP_COLOR_TIERS) {
    out[t.name] = Object.fromEntries(t.swatches.map((s) => [s.name, s.hex]));
  }
  return out;
}

// ─── PMP seed (Task #631) ────────────────────────────────────────────
//
// PMP just sent Bill confirmed 2LP Color + Splatter ladders at
// 500/1000/2000. Everything else (1LP entire, 2LP Black, every
// 100/200/300 cell) ships as `confirmed:false` placeholders so the
// catalog reads with the same six-column matrix the other two presses
// use. PMP's 7" formats are "coming soon" per their site and aren't
// seeded yet. The booklet add-on lives in its own code path and is
// untouched here.

const PMP_DEFAULT_JACKET = "Standard Full-Color Jacket";
const PMP_TIER_NAMES = ["Black", "Color", "Splatter"] as const;
let pmpSeedRan = false;

// Task #685 — PMP's confirmed quotes price the *records* separately
// from jackets / inserts / booklets, so every per-unit cent below is
// the bare record line only (the add-ons live in their own code paths).
// Stored UNDISCOUNTED — a 10% GoodTunes broker discount applies at
// lookup (broker_discount_pct=10), mirroring Hellbender's pattern.
//
// Real PMP anchors (record line, 500 + 1000): 7" and 12" single,
// Black + Color. Everything else is a Bill-approved estimate so demos
// show a complete PMP range, and every estimated cell is logged in
// docs/vendors/pmp.md:
//   • 100/200/300/2000 — interpolated by borrowing a single-LP per-unit
//     curve shape (blended MRP + Hellbender single-LP ladders), scaled
//     so the 500 & 1000 rungs land exactly on PMP's real anchors.
//   • Splatter — same-format Color × PMP's own Color→Splatter premium
//     (~1.41, read off the 2LP quote).
//   • 12" Double — ~2× the same-qty 12" single record price. This
//     re-bases the prior whole-quote÷qty 2LP rungs (Color
//     $23.15/$16.54/$13.74, Splatter $32.65/$25.14/$22.74 at
//     500/1000/2000) down to the record line only.
// No 50 and no 750 rungs — standard qtys are 100/200/300/500/1000/2000.
const PMP_ANCHOR_SYNCED_AT = "2026-05-29T00:00:00.000Z";
const PMP_QUOTE_SOURCE = "pmp-quote-2026";
const PMP_ESTIMATE_SOURCE = "pmp-record-interp-2026";

// The original Task #631 note we restate; only this exact default (or
// an empty note) is overwritten so a later operator edit survives.
const PMP_OPERATIONAL_NOTE_LEGACY =
  "Markup model not yet confirmed — treating retail = cost on confirmed rungs until PMP states otherwise.";
const PMP_OPERATIONAL_NOTE =
  "Record-line pricing only — jackets, inserts and booklets are quoted as separate add-ons. Stored undiscounted; a 10% GoodTunes broker discount applies at lookup. Real anchors are 7\"/12\" single Black+Color at 500/1000; every other cell is a Bill-approved estimate (see docs/vendors/pmp.md).";

// Real record-line anchors (undiscounted per-unit cents) at 500 / 1000.
const PMP_RECORD_ANCHORS: Record<
  "7_inch" | "12_lp",
  Record<"Black" | "Color", { c500: number; c1000: number }>
> = {
  "7_inch": { Black: { c500: 250, c1000: 200 }, Color: { c500: 350, c1000: 300 } },
  "12_lp": { Black: { c500: 275, c1000: 250 }, Color: { c500: 425, c1000: 350 } },
};

// Single-LP per-unit curve shape (ratio vs the 500 rung) for the
// sub-500 rungs, blended from MRP + Hellbender single-LP ladders; plus
// the 2000-vs-1000 ratio for the top rung. Applied so 500 & 1000 stay
// exactly on PMP's real anchors.
const PMP_CURVE_VS_500: Record<number, number> = { 100: 2.65, 200: 1.78, 300: 1.4 };
const PMP_2000_VS_1000 = 0.84;
const PMP_SPLATTER_PREMIUM = 1.41; // Color → Splatter (~3265/2315 on the 2LP quote)
const PMP_DOUBLE_MULTIPLIER = 2; // 2LP record-only ≈ 2× the same-qty 1LP record

type PmpRung = { qty: number; unitCents: number; estimated: boolean };

function pmpLadderFromAnchors(c500: number, c1000: number): PmpRung[] {
  return [
    { qty: 100, unitCents: Math.round(c500 * PMP_CURVE_VS_500[100]), estimated: true },
    { qty: 200, unitCents: Math.round(c500 * PMP_CURVE_VS_500[200]), estimated: true },
    { qty: 300, unitCents: Math.round(c500 * PMP_CURVE_VS_500[300]), estimated: true },
    { qty: 500, unitCents: c500, estimated: false },
    { qty: 1000, unitCents: c1000, estimated: false },
    { qty: 2000, unitCents: Math.round(c1000 * PMP_2000_VS_1000), estimated: true },
  ];
}
function pmpSplatterFromColor(color: PmpRung[]): PmpRung[] {
  return color.map((r) => ({
    qty: r.qty,
    unitCents: Math.round(r.unitCents * PMP_SPLATTER_PREMIUM),
    estimated: true,
  }));
}
function pmpDoubleFromSingle(single: PmpRung[]): PmpRung[] {
  return single.map((r) => ({
    qty: r.qty,
    unitCents: r.unitCents * PMP_DOUBLE_MULTIPLIER,
    estimated: true,
  }));
}

// Full record-line ladder set keyed by format → tier.
type PmpFormat = "7_inch" | "12_lp" | "12_double";
type PmpTier = "Black" | "Color" | "Splatter";
function pmpLadders(): Record<PmpFormat, Record<PmpTier, PmpRung[]>> {
  const out = {} as Record<PmpFormat, Record<PmpTier, PmpRung[]>>;
  for (const fmt of ["7_inch", "12_lp"] as const) {
    const black = pmpLadderFromAnchors(
      PMP_RECORD_ANCHORS[fmt].Black.c500,
      PMP_RECORD_ANCHORS[fmt].Black.c1000,
    );
    const color = pmpLadderFromAnchors(
      PMP_RECORD_ANCHORS[fmt].Color.c500,
      PMP_RECORD_ANCHORS[fmt].Color.c1000,
    );
    out[fmt] = { Black: black, Color: color, Splatter: pmpSplatterFromColor(color) };
  }
  out["12_double"] = {
    Black: pmpDoubleFromSingle(out["12_lp"].Black),
    Color: pmpDoubleFromSingle(out["12_lp"].Color),
    Splatter: pmpDoubleFromSingle(out["12_lp"].Splatter),
  };
  return out;
}

// Task #672 — PMP publishes its color library only as five combined
// JPGs (PMP_Vinyl-colors_1..5.jpg) with no machine-readable per-color
// names or per-color images, so a per-color photo scrape isn't feasible
// and the upstream names can't be parsed. We seed PMP a standard vinyl
// palette — the common Translucent + Opaque families PMP confirms it
// presses ("specialty mixes, splatters, marble, half and half") — with
// best-guess hex so the Sell-panel picker has distinct, name-appropriate
// swatches instead of an empty list. Operators can refine names/colors
// per the published images; the backfill never clobbers their edits.
type PmpSwatch = { name: string; hex: string };
const PMP_COLOR_TIERS: ReadonlyArray<{ name: string; swatches: PmpSwatch[] }> = [
  { name: "Translucent", swatches: [
    { name: "Clear", hex: "#e8eef2" },
    { name: "Ruby Red", hex: "#c0566a" },
    { name: "Orange", hex: "#f0a866" },
    { name: "Gold", hex: "#e6c66a" },
    { name: "Yellow", hex: "#f2e79a" },
    { name: "Green", hex: "#5fb98a" },
    { name: "Blue", hex: "#5a86c8" },
    { name: "Violet", hex: "#9a6fc0" },
    { name: "Smoke", hex: "#8a8f96" },
  ] },
  { name: "Opaque", swatches: [
    { name: "White", hex: "#f5f5f2" },
    { name: "Cream", hex: "#efe7d2" },
    { name: "Red", hex: "#c8242b" },
    { name: "Orange", hex: "#ef8b3a" },
    { name: "Yellow", hex: "#f5e23a" },
    { name: "Green", hex: "#3f8f57" },
    { name: "Blue", hex: "#2f63c0" },
    { name: "Purple", hex: "#7a3aa8" },
    { name: "Pink", hex: "#f0468f" },
    { name: "Brown", hex: "#5b3a1e" },
    { name: "Grey", hex: "#8a8a8a" },
    { name: "Silver", hex: "#c2c6cc" },
    { name: "Gold", hex: "#c9a44a" },
  ] },
];

/** Tier name → { color name → hex } derived from PMP_COLOR_TIERS. */
function pmpColorHexByTier(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const t of PMP_COLOR_TIERS) {
    out[t.name] = Object.fromEntries(t.swatches.map((s) => [s.name, s.hex]));
  }
  return out;
}

export async function seedPmpCatalog() {
  if (pmpSeedRan) return;
  pmpSeedRan = true;
  try {
    const press = await storage.getManufacturerByDomain(PMP_DOMAIN);
    if (!press) {
      pmpSeedRan = false;
      return;
    }

    // Task #685 — PMP's broker arrangement is a 10% GoodTunes discount
    // off the catalog price (same as Hellbender). Seed once, only when
    // the column is still at the schema default of 0, so a later admin
    // edit isn't clobbered.
    if (Number((press as any).brokerDiscountPct ?? 0) === 0) {
      await db.execute(sql`
        UPDATE manufacturers SET broker_discount_pct = 10
        WHERE id = ${press.id} AND broker_discount_pct = 0
      `);
    }

    await ensureManufacturerSummary(press.id, {
      bio: "Premium handcrafted / custom-effect specialist.",
      // Turnaround intentionally left null — surfaces as "Not stated"
      // until Bill confirms PMP's window.
    });

    // Task #685 — restate the operational note for the record-line +
    // broker-discount model. Only the original Task #631 default (or an
    // empty note) is overwritten so a later operator edit survives.
    await db.execute(sql`
      UPDATE manufacturers SET operational_note = ${PMP_OPERATIONAL_NOTE}
      WHERE id = ${press.id}
        AND (operational_note IS NULL OR operational_note = ''
             OR operational_note = ${PMP_OPERATIONAL_NOTE_LEGACY})
    `);

    const defaultJacket = await ensureJacket(press.id, PMP_DEFAULT_JACKET, 0, { isDefault: true });

    const ladders = pmpLadders();

    // Task #685 — PMP now carries 7" single alongside 12" LP + 12"
    // Double LP.
    const formats: PmpFormat[] = ["7_inch", "12_lp", "12_double"];
    for (let fi = 0; fi < formats.length; fi++) {
      const fmt = formats[fi];
      await ensureFormat(press.id, fmt, fi);

      for (let ti = 0; ti < PMP_TIER_NAMES.length; ti++) {
        const name = PMP_TIER_NAMES[ti];
        const tier = await ensureTier(press.id, fmt, name, ti);

        // Materialise the six standard rungs, then write the record-line
        // ladder. Anchors carry the quote source; interpolated /
        // re-based cells carry the estimate source + `estimated:true`
        // (renders like any other price; logged in docs/vendors/pmp.md).
        await ensureCombo(tier.id, defaultJacket.id, placeholderLadder());
        await addMissingRungs(tier.id, defaultJacket.id, STANDARD_COMPARISON_QUANTITIES);
        for (const rung of ladders[fmt][name]) {
          await setSiteRung(
            tier.id,
            defaultJacket.id,
            { qty: rung.qty, unitCents: rung.unitCents, estimated: rung.estimated },
            rung.estimated ? PMP_ESTIMATE_SOURCE : PMP_QUOTE_SOURCE,
            PMP_ANCHOR_SYNCED_AT,
          );
        }
      }

      // Task #672 — color-library tiers (separate from the Black/Color/
      // Splatter pricing tiers, mirroring MRP's layout). Ladders seed as
      // all-placeholder; pricing is out of scope for this task.
      for (let ci = 0; ci < PMP_COLOR_TIERS.length; ci++) {
        const colorTier = PMP_COLOR_TIERS[ci];
        const tier = await ensureTier(press.id, fmt, colorTier.name, PMP_TIER_NAMES.length + ci);
        for (let sx = 0; sx < colorTier.swatches.length; sx++) {
          await ensureColor(tier.id, colorTier.swatches[sx].name, colorTier.swatches[sx].hex, sx);
        }
        await ensureCombo(tier.id, defaultJacket.id, placeholderLadder());
        await addMissingRungs(tier.id, defaultJacket.id, STANDARD_COMPARISON_QUANTITIES);
      }
    }

    // Task #672 — backfill best-guess hex onto any blank rows from an
    // earlier seed run (never clobbers operator edits / imported photos).
    await backfillColorHexes(press.id, pmpColorHexByTier());
  } catch (e) {
    console.warn("[pressCatalog] PMP seed failed:", (e as Error).message);
    pmpSeedRan = false;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────

const tierBodySchema = z.object({
  name: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
});
// Accept either an absolute http(s) URL or the app's relative upload path
// (`/objects/uploads/<id>`). The shared `/api/admin/upload` endpoint returns
// the relative path, so a stricter `z.string().url()` validator 400s every
// swatch photo save with "Invalid URL" — see task #667.
const swatchImageUrlString = z
  .string()
  .trim()
  .min(1)
  .refine(
    (s) => /^https?:\/\/\S+$/i.test(s) || /^\/objects\/uploads\/[A-Za-z0-9._-]+$/.test(s),
    { message: "Must be an absolute http(s) URL or /objects/uploads/<id>" },
  );
const colorBodySchema = z.object({
  name: z.string().min(1).max(80),
  swatchHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  swatchImageUrl: swatchImageUrlString.nullable().optional(),
  position: z.number().int().min(0).optional(),
});
const jacketBodySchema = z.object({
  name: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  // Task #1998 — null = applies to all formats.
  applicableFormats: z.array(z.string()).nullable().optional(),
});
const ladderBodySchema = z.object({
  priceLadder: z.array(
    z.object({
      qty: z.number().int().min(1),
      unitCents: z.number().int().min(0),
      // Task #624 — optional per-rung "this is a real quote" flag.
      // Defaults to true on save so any rung the admin actually keys
      // is treated as confirmed. Pass `false` explicitly to keep a
      // rung marked as a placeholder (e.g. seeded Black rungs).
      confirmed: z.boolean().optional(),
    }),
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
    // Task #625 — cold-start safety. Each founding press carries a
    // hand-curated quote ladder that we ship in code (see
    // seedHellbenderCatalog / seedMrpCatalog). Both seeds are guarded
    // by a module-level "did we run" flag, so calling them on every
    // catalog read costs one boolean check after the first hit — but
    // it guarantees that opening Presses → Hellbender or Presses → MRP
    // on a fresh deploy always shows the seeded formats / tiers /
    // ladders without waiting for an album-specific invited-press call
    // to fire the seed first.
    if (press.domain === HELLBENDER_DOMAIN) {
      await seedHellbenderCatalog();
    } else if (press.domain === MRP_DOMAIN) {
      await seedMrpCatalog();
    } else if (press.domain === PMP_DOMAIN) {
      await seedPmpCatalog();
    }
    res.json(await getPressCatalog(pressId));
  });

  // ─── Task #2116 — Catalog CSV: Upload & Export ─────────────────────

  // Export the whole catalog as a single editable CSV.
  app.get("/api/admin/manufacturers/:id/catalog/csv/export", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Manufacturer not found" });
    const csv = await serializeCatalogCsv(pressId);
    const safeName = (press.name || "press").replace(/[^A-Za-z0-9_-]+/g, "-").toLowerCase();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="catalog-${safeName}.csv"`);
    res.send(csv);
  });

  // Dry-run: parse + validate + diff an uploaded CSV without writing.
  app.post("/api/admin/manufacturers/:id/catalog/csv/preview", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Manufacturer not found" });
    const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csv.trim()) return res.status(400).json({ message: "No CSV content provided." });
    const parsed = parseCatalogCsv(csv);
    const plan = await buildCatalogCsvPlan(pressId, parsed);
    res.json(plan);
  });

  // Apply an uploaded CSV transactionally. Refuses if any row failed
  // validation so a bad file is never partially applied.
  app.post("/api/admin/manufacturers/:id/catalog/csv/apply", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Manufacturer not found" });
    const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csv.trim()) return res.status(400).json({ message: "No CSV content provided." });
    const parsed = parseCatalogCsv(csv);
    if (parsed.errors.length > 0) {
      return res.status(400).json({ message: "The CSV has validation errors. Fix them and re-upload.", errors: parsed.errors });
    }
    const userId = (req as any).adminUserId ?? (req as any).session?.userId ?? null;
    const result = await applyCatalogCsv(pressId, parsed, userId);
    res.json({ ok: true, result, catalog: await getPressCatalog(pressId) });
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
    // Task #1998 — auto-fill applicable_formats from the name when the
    // client doesn't send an explicit value. The smart-default rule
    // (gatefold→12s, wide-spine→2LP, otherwise null=all) keeps new
    // jackets sensibly scoped without any operator action.
    const trimmedName = parsed.data.name.trim();
    const autoFormats =
      parsed.data.applicableFormats !== undefined
        ? parsed.data.applicableFormats
        : getJacketDefaultFormats(trimmedName);
    const [row] = await db
      .insert(pressJackets)
      .values({
        pressId,
        name: trimmedName,
        position,
        isDefault,
        ...(autoFormats !== null ? { applicableFormats: autoFormats as any } : {}),
      })
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
    // Task #1998 — allow the operator to override applicable formats.
    // Passing `null` means "all formats" (back-compat default).
    if ("applicableFormats" in parsed.data) {
      patch.applicableFormats = parsed.data.applicableFormats ?? null;
    }
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

  // ─── Task #670 — Hellbender Shopify pricing sync ──────────────────
  app.post(
    "/api/admin/manufacturers/:id/pricing-sync/hellbender/preview",
    requireAdmin,
    requirePressScope,
    async (req, res) => {
      const pressId = String(req.params.id);
      const press = await storage.getManufacturerById(pressId);
      if (!press) return res.status(404).json({ message: "Manufacturer not found" });
      if (press.domain !== HELLBENDER_DOMAIN) {
        return res.status(400).json({ message: "This sync only runs on Hellbender." });
      }
      try {
        const { buildHellbenderPricingProposal } = await import("./hellbenderPricingSync");
        const proposal = await buildHellbenderPricingProposal();
        return res.json({ proposal });
      } catch (err: any) {
        console.error("[hellbender-pricing-sync] preview failed:", err);
        return res.status(502).json({ message: err?.message || "Preview failed" });
      }
    },
  );

  app.post(
    "/api/admin/manufacturers/:id/pricing-sync/hellbender/commit",
    requireAdmin,
    requirePressScope,
    async (req, res) => {
      const pressId = String(req.params.id);
      const press = await storage.getManufacturerById(pressId);
      if (!press) return res.status(404).json({ message: "Manufacturer not found" });
      if (press.domain !== HELLBENDER_DOMAIN) {
        return res.status(400).json({ message: "This sync only runs on Hellbender." });
      }
      try {
        const { buildHellbenderPricingProposal, applyHellbenderPricingProposal } =
          await import("./hellbenderPricingSync");
        // Re-fetch on commit so we never write a stale preview the
        // admin may have left sitting open.
        const proposal = await buildHellbenderPricingProposal();
        const userId = (req as any).adminUserId ?? null;
        const result = await applyHellbenderPricingProposal(pressId, userId, proposal);
        console.log(
          `[hellbender-pricing-sync] commit by user=${userId} press=${pressId} ` +
            `written=${result.rungsWritten} skipped=${result.rungsSkipped} missing=${result.tiersMissing.join(",")}`,
        );
        return res.json({ ...result, proposal });
      } catch (err: any) {
        console.error("[hellbender-pricing-sync] commit failed:", err);
        return res.status(500).json({ message: err?.message || "Commit failed" });
      }
    },
  );

  app.get(
    "/api/admin/manufacturers/:id/pricing-syncs",
    requireAdmin,
    requirePressScope,
    async (req, res) => {
      const pressId = String(req.params.id);
      const { listPricingSyncs } = await import("./hellbenderPricingSync");
      const rows = await listPricingSyncs(pressId);
      return res.json(rows);
    },
  );

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
