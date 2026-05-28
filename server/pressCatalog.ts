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

// ─── Public catalog shape ────────────────────────────────────────────

export type CatalogColor = {
  id: string;
  name: string;
  swatchHex: string | null;
  swatchImageUrl: string | null;
  position: number;
};
// Task #624 — each rung carries an optional `confirmed` flag. False
// (or missing on legacy rows) means the rung was seeded as a placeholder
// and needs a real quote from the press; admin UI renders these yellow
// with a "TBD — awaiting quote" hint. Saving a value through the
// catalog editor marks the rung confirmed=true automatically.
export type CatalogLadderRung = { qty: number; unitCents: number; confirmed?: boolean };
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
  opts: { isDefault?: boolean } = {},
) {
  let [j] = await db
    .select()
    .from(pressJackets)
    .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.name, name)));
  if (!j) {
    [j] = await db
      .insert(pressJackets)
      .values({ pressId, name, position, isDefault: opts.isDefault ?? false })
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

// ─── Hellbender seed ─────────────────────────────────────────────────

const HELLBENDER_DOMAIN = "hellbendervinyl.com";
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

// Task #631 — additional Hellbender jacket SKUs published on their
// templates page. Wide-spine is 2×LP-only; the two gatefolds apply to
// every format Hellbender presses (7"/1LP/2LP).
const HELLBENDER_EXTRA_JACKETS: ReadonlyArray<{
  name: string;
  formats: AlbumFormat[];
}> = [
  { name: "Gatefold Jacket (1 pocket)", formats: ["7_inch", "12_lp", "12_double"] },
  { name: "Gatefold Jacket (2 pocket)", formats: ["7_inch", "12_lp", "12_double"] },
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
      const j = await ensureJacket(press.id, spec.name, i + 1);
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
            hex: c.swatch.startsWith("#") ? c.swatch : null,
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
          hex: c.swatch.startsWith("#") ? c.swatch : null,
        }));
        for (const name of HELLBENDER_NEW_12_TIER_NAMES) {
          const ladder = HELLBENDER_NEW_12_LADDERS[key]?.[name] ?? [];
          let colors: { name: string; hex: string | null }[] = [];
          if (name === "Black") colors = [{ name: "Black", hex: "#0c0c0c" }];
          else if (name === "Color") colors = color12Swatches;
          tierBuilds.push({ name, ladder, colors });
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
  // Task #631 — 100/200/300 added as unconfirmed placeholders so the
  // booklet ladder reads with the same six-column shape as the per-
  // tier vinyl ladders. snap/lookup filter `confirmed:false` so they
  // never resolve as $0.
  rungs: [
    { qty: 100, unitCents: 0, confirmed: false },
    { qty: 200, unitCents: 0, confirmed: false },
    { qty: 300, unitCents: 0, confirmed: false },
    { qty: 500, unitCents: 224, confirmed: true },   // $1121.43 / 500  ≈ $2.24 ea
    { qty: 1000, unitCents: 144, confirmed: true },  // $1441.43 / 1000 ≈ $1.44 ea
    { qty: 2000, unitCents: 133, confirmed: true },  // $2654.29 / 2000 ≈ $1.33 ea
  ],
  runTotalsCents: { 500: 112143, 1000: 144143, 2000: 265429 },
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
// the MRP code-prefixed swatch names from `docs/vendors/mrp.md`. Hex
// is unknown for these — every chip seeds with `swatchHex = null`.
const MRP_COLOR_TIERS: ReadonlyArray<{ name: string; swatches: string[] }> = [
  { name: "EcoMix", swatches: ["ECO1 Blues", "ECO2 Greens", "ECO3 Magentas", "ECO4 Yellows", "ECO5 Reds", "ECO6 Grays", "ECO7 Metallic"] },
  { name: "Translucent", swatches: ["T01 Ruby", "T02 Ultra Clear", "T03 Cobalt", "T04 Emerald", "T05 Grape", "T06 Light Blue", "T07 Lemonade", "T08 Orange Crush", "T09 Coke Bottle Clear", "T10 Highlighter Yellow", "T11 Milky Clear", "T12 Forest Green", "T13 Sea Blue", "T14 Tan", "T15 Black Ice"] },
  { name: "Opaque", swatches: ["O01 Brown", "O02 White", "O03 Apple Red", "O04 Orchid", "O05 Sky Blue", "O06 Baby Blue", "O07 Tangerine", "O08 Baby Pink", "O09 Canary Yellow", "O10 Magenta", "O11 Silver", "O12 Spring Green", "O13 Gray", "O14 Bone", "O15 Hot Pink", "O16 Gold", "O17 Fruit Punch", "O18 Olive Green", "O19 Aqua", "O20 Custard", "O21 Lemon", "O22 Bluejay", "O23 Evergreen", "O24 Violet"] },
  { name: "Neon/Glow", swatches: ["G01 Glow Green", "N01 Neon Violet", "N02 Neon Green", "N03 Neon Yellow", "N04 Neon Orange", "N05 Neon Coral", "N06 Neon Pink"] },
  { name: "Smoke Blends", swatches: ["SB01 Clear", "SB02 Red", "SB03 Green", "SB04 Purple", "SB05 Silver", "SB06 Electric", "SB07 Blue", "SB08 Yellow", "SB09 Orange", "SB10 Coke Bottle Clear", "SB11 Highlighter", "SB12 Sea Blue", "SB13 Tan"] },
  { name: "Cream Blends", swatches: ["CB Cocoa", "CB Blueberry", "CB Sea Salt", "CB Fig", "CB Mushroom", "CB Honey Dew Melon", "CB Earl Gray", "CB Watermelon", "CB Caramel", "CB Guava"] },
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
      const j = await ensureJacket(press.id, spec.name, i + 1);
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
          await ensureColor(tier.id, colorTier.swatches[sx], null, sx);
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
  } catch (e) {
    console.warn("[pressCatalog] MRP seed failed:", (e as Error).message);
    mrpSeedRan = false;
  }
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

// Per-tier, per-format confirmed PMP rungs. Per-unit cents = quoted
// total ÷ qty rounded to nearest cent (per scratchpad — see task
// spec). retail = cost on every rung (markup model not yet confirmed;
// captured as an operational note on the press record).
//
// Task #638 — PMP's 2LP Color/Splatter run ~40-65% higher per record
// than MRP or Hellbender at the same qty. Bill thinks PMP may have
// quoted each LP separately (i.e. doubled the per-unit), but cross-
// vendor pricing differences are plausible for a premium boutique
// press. Numbers stand until PMP re-confirms.
const PMP_CONFIRMED: Record<"12_double", Record<string, LadderRungSpec[]>> = {
  "12_double": {
    Color: [
      { qty: 500, unitCents: 2315, confirmed: true },   // $11,575 / 500
      { qty: 1000, unitCents: 1654, confirmed: true },  // $16,542 / 1000
      { qty: 2000, unitCents: 1374, confirmed: true },  // $27,477 / 2000
    ],
    Splatter: [
      { qty: 500, unitCents: 3265, confirmed: true },   // $16,325 / 500
      { qty: 1000, unitCents: 2514, confirmed: true },  // $25,142 / 1000
      { qty: 2000, unitCents: 2274, confirmed: true },  // $45,477 / 2000
    ],
  },
};

export async function seedPmpCatalog() {
  if (pmpSeedRan) return;
  pmpSeedRan = true;
  try {
    const press = await storage.getManufacturerByDomain(PMP_DOMAIN);
    if (!press) {
      pmpSeedRan = false;
      return;
    }

    await ensureManufacturerSummary(press.id, {
      bio: "Premium handcrafted / custom-effect specialist.",
      operationalNote: "Markup model not yet confirmed — treating retail = cost on confirmed rungs until PMP states otherwise.",
      // Turnaround intentionally left null — surfaces as "Not stated"
      // until Bill confirms PMP's window.
    });

    const defaultJacket = await ensureJacket(press.id, PMP_DEFAULT_JACKET, 0, { isDefault: true });

    // Today's PMP catalog: 12" LP + 12" Double LP only.
    const formats: AlbumFormat[] = ["12_lp", "12_double"];
    for (let fi = 0; fi < formats.length; fi++) {
      const fmt = formats[fi];
      await ensureFormat(press.id, fmt, fi);

      for (let ti = 0; ti < PMP_TIER_NAMES.length; ti++) {
        const name = PMP_TIER_NAMES[ti];
        const tier = await ensureTier(press.id, fmt, name, ti);

        // Build the initial ladder: placeholder rungs at the standard
        // comparison qtys, then merge in any confirmed rungs we have
        // for this format/tier (currently 12_double × Color/Splatter
        // at 500/1000/2000).
        const initial = placeholderLadder();
        const confirmed = fmt === "12_double" ? PMP_CONFIRMED["12_double"]?.[name] : undefined;
        if (confirmed) {
          for (const c of confirmed) {
            const idx = initial.findIndex((r) => r.qty === c.qty);
            if (idx >= 0) initial[idx] = c;
            else initial.push(c);
          }
          initial.sort((a, b) => a.qty - b.qty);
        }

        await ensureCombo(tier.id, defaultJacket.id, initial);
        await addMissingRungs(tier.id, defaultJacket.id, STANDARD_COMPARISON_QUANTITIES);
        if (confirmed) {
          for (const c of confirmed) {
            await upgradeRung(tier.id, defaultJacket.id, c.qty, c.unitCents);
          }
        }
      }
    }
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
