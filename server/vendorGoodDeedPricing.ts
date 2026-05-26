// Task #245 — Vendor-managed GoodDeed pricing portal.
//
// Backing module for /api/admin/vendors/:id/gooddeed-services and the
// per-album leg assignment + per-release snapshot helpers.
//
// Service kinds:
//   "printing"   tiered ladder (qty floor → per-unit cents)
//   "hologram"   flat per-unit cents
//   "insertion"  flat per-unit cents (press only)

import { sql, and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  vendorGoodDeedServices,
  albumAddons,
  vendors,
  payoutSettings,
  type VendorGoodDeedService,
  VENDOR_GOODDEED_SERVICES,
} from "@shared/schema";

export type Tier = { qty: number; perUnitCents: number };
// Task #471 — fixed quantity rungs for Quickprinter ladders. The
// AdminPlatformPricing editor renders one input per rung; missing
// rungs walk to the next-lower rung at price-resolution time.
export const QUICKPRINTER_LADDER_RUNGS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;
export type PaperSize = "letter" | "12x18";
export const DEFAULT_PAPER_SIZE: PaperSize = "letter";
export type SizeLadders = Partial<Record<PaperSize, Tier[]>>;

export interface PricingRow {
  id: string;
  vendorId: string;
  service: VendorGoodDeedService;
  active: boolean;
  tiers: Tier[] | null;
  sizeLadders: SizeLadders | null;
  flatPerUnitCents: number | null;
  setupFeeCents: number;
  minBatch: number;
  leadTimeDays: number;
  shipToDefault: string | null;
  notes: string | null;
  updatedAt: string;
}

function shape(row: any): PricingRow {
  const sizeLaddersRaw = (row.sizeLaddersJson ?? null) as SizeLadders | null;
  const sizeLadders: SizeLadders | null = sizeLaddersRaw
    ? Object.fromEntries(
        Object.entries(sizeLaddersRaw).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.map((t: any) => ({ qty: Number(t.qty), perUnitCents: Number(t.perUnitCents) })) : [],
        ]),
      )
    : null;
  return {
    id: row.id,
    vendorId: row.vendorId,
    service: row.service,
    active: !!row.active,
    tiers: Array.isArray(row.tiersJson)
      ? (row.tiersJson as Tier[]).map((t) => ({ qty: Number(t.qty), perUnitCents: Number(t.perUnitCents) }))
      : null,
    sizeLadders,
    flatPerUnitCents: row.flatPerUnitCents ?? null,
    setupFeeCents: row.setupFeeCents ?? 0,
    minBatch: row.minBatch ?? 25,
    leadTimeDays: row.leadTimeDays ?? 14,
    shipToDefault: row.shipToDefault ?? null,
    notes: row.notes ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
  };
}

export async function listVendorGoodDeedServices(vendorId: string): Promise<PricingRow[]> {
  const rows = await db
    .select()
    .from(vendorGoodDeedServices)
    .where(eq(vendorGoodDeedServices.vendorId, vendorId));
  return rows.map(shape);
}

export interface UpsertInput {
  service: VendorGoodDeedService;
  active: boolean;
  tiers?: Tier[] | null;
  // Task #471 — optional per-size ladders for Quickprinter rows.
  // When supplied, takes precedence over `tiers` at write time.
  sizeLadders?: SizeLadders | null;
  flatPerUnitCents?: number | null;
  setupFeeCents?: number;
  minBatch?: number;
  leadTimeDays?: number;
  shipToDefault?: string | null;
  notes?: string | null;
}

export function validateUpsert(input: UpsertInput): string | null {
  if (!VENDOR_GOODDEED_SERVICES.includes(input.service)) return "Unknown service";
  if (input.service === "printing") {
    const hasSizeLadders = input.sizeLadders && Object.keys(input.sizeLadders).length > 0;
    if (!hasSizeLadders && (!Array.isArray(input.tiers) || input.tiers.length === 0)) {
      return "Printing requires at least one tier";
    }
    const seen = new Set<number>();
    for (const t of input.tiers ?? []) {
      if (!Number.isFinite(t.qty) || t.qty <= 0) return "Tier qty must be a positive integer";
      if (!Number.isFinite(t.perUnitCents) || t.perUnitCents < 0) return "Tier price must be ≥ $0";
      if (seen.has(t.qty)) return "Duplicate tier quantity";
      seen.add(t.qty);
    }
    if (input.sizeLadders) {
      for (const [size, ladder] of Object.entries(input.sizeLadders)) {
        if (!Array.isArray(ladder)) return `Ladder for ${size} must be an array`;
        const s = new Set<number>();
        for (const t of ladder) {
          if (!Number.isFinite(t.qty) || t.qty <= 0) return "Tier qty must be a positive integer";
          if (!Number.isFinite(t.perUnitCents) || t.perUnitCents < 0) return "Tier price must be ≥ $0";
          if (s.has(t.qty)) return `Duplicate qty in ${size} ladder`;
          s.add(t.qty);
        }
      }
    }
  } else {
    if (input.flatPerUnitCents == null || !Number.isFinite(input.flatPerUnitCents) || input.flatPerUnitCents < 0) {
      return "Flat per-unit price required";
    }
  }
  if (input.minBatch != null && input.minBatch < 1) return "Min batch must be at least 1";
  if (input.setupFeeCents != null && input.setupFeeCents < 0) return "Setup fee must be ≥ 0";
  return null;
}

export async function upsertVendorGoodDeedService(
  vendorId: string,
  input: UpsertInput,
  userId: string | null,
): Promise<PricingRow> {
  const tiersJson = input.service === "printing"
    ? [...(input.tiers ?? [])].sort((a, b) => a.qty - b.qty)
    : null;
  const sizeLaddersJson = input.service === "printing" && input.sizeLadders
    ? Object.fromEntries(
        Object.entries(input.sizeLadders).map(([size, ladder]) => [
          size,
          [...(ladder ?? [])].sort((a, b) => a.qty - b.qty),
        ]),
      )
    : null;
  const flat = input.service === "printing" ? null : (input.flatPerUnitCents ?? 0);
  const existing = await db
    .select()
    .from(vendorGoodDeedServices)
    .where(and(
      eq(vendorGoodDeedServices.vendorId, vendorId),
      eq(vendorGoodDeedServices.service, input.service),
    ));
  if (existing[0]) {
    const [row] = await db
      .update(vendorGoodDeedServices)
      .set({
        active: input.active,
        tiersJson,
        sizeLaddersJson: sizeLaddersJson as any,
        flatPerUnitCents: flat,
        setupFeeCents: input.setupFeeCents ?? 0,
        minBatch: input.minBatch ?? 25,
        leadTimeDays: input.leadTimeDays ?? 14,
        shipToDefault: input.shipToDefault ?? null,
        notes: input.notes ?? null,
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(vendorGoodDeedServices.id, existing[0].id))
      .returning();
    return shape(row);
  }
  const [row] = await db
    .insert(vendorGoodDeedServices)
    .values({
      vendorId,
      service: input.service,
      active: input.active,
      tiersJson,
      sizeLaddersJson: sizeLaddersJson as any,
      flatPerUnitCents: flat,
      setupFeeCents: input.setupFeeCents ?? 0,
      minBatch: input.minBatch ?? 25,
      leadTimeDays: input.leadTimeDays ?? 14,
      shipToDefault: input.shipToDefault ?? null,
      notes: input.notes ?? null,
      updatedByUserId: userId,
    })
    .returning();
  return shape(row);
}

// Walk a tier ladder for a given run quantity. Returns the highest tier
// whose qty floor is <= runQty, or the first tier when runQty falls
// below the smallest break (the vendor decides what their floor charge
// looks like — we don't invent a fall-through).
export function priceFromTiers(tiers: Tier[], runQty: number): number {
  if (!tiers.length) return 0;
  const sorted = [...tiers].sort((a, b) => a.qty - b.qty);
  let pick = sorted[0];
  for (const t of sorted) if (runQty >= t.qty) pick = t;
  return pick.perUnitCents;
}

export interface ServicePrice {
  vendorId: string;
  service: VendorGoodDeedService;
  perUnitCents: number;
  setupFeeCents: number;
}

// Resolve live (un-snapshotted) per-unit pricing for an album's three
// signed-cert legs at a given run quantity. Returns null entries for
// legs that aren't assigned or whose vendor has no active row.
//
// Task #471 — `paperSize` selects which Quickprinter ladder to walk for
// the printing leg (default "letter"). When a row has both `tiersJson`
// (legacy press shape) and `sizeLaddersJson` (Quickprinter shape), the
// per-size ladder wins; missing sizes fall back to `tiersJson` so old
// press rows keep working.
export async function resolveLivePricing(
  legs: { printVendorId: string | null; hologramVendorId: string | null; insertionVendorId: string | null },
  runQty: number,
  paperSize: PaperSize = DEFAULT_PAPER_SIZE,
): Promise<{
  printing: ServicePrice | null;
  hologram: ServicePrice | null;
  insertion: ServicePrice | null;
  totalPerUnitCents: number;
  totalRunCents: number;
}> {
  const ids = [legs.printVendorId, legs.hologramVendorId, legs.insertionVendorId].filter(Boolean) as string[];
  if (ids.length === 0) {
    return { printing: null, hologram: null, insertion: null, totalPerUnitCents: 0, totalRunCents: 0 };
  }
  const rows = await db
    .select()
    .from(vendorGoodDeedServices)
    .where(and(
      inArray(vendorGoodDeedServices.vendorId, ids),
      eq(vendorGoodDeedServices.active, true),
    ));
  const idx = new Map<string, any>();
  for (const r of rows) idx.set(`${r.vendorId}:${r.service}`, r);

  function priceFor(vendorId: string | null, service: VendorGoodDeedService): ServicePrice | null {
    if (!vendorId) return null;
    const row = idx.get(`${vendorId}:${service}`);
    if (!row) return null;
    let perUnitCents = 0;
    if (service === "printing") {
      const sizeLadder = (row.sizeLaddersJson as SizeLadders | null)?.[paperSize];
      if (sizeLadder && sizeLadder.length) {
        perUnitCents = priceFromTiers(sizeLadder, runQty);
      } else if (Array.isArray(row.tiersJson) && row.tiersJson.length) {
        perUnitCents = priceFromTiers(row.tiersJson as Tier[], runQty);
      } else {
        return null;
      }
    } else {
      perUnitCents = row.flatPerUnitCents ?? 0;
    }
    return { vendorId, service, perUnitCents, setupFeeCents: row.setupFeeCents ?? 0 };
  }

  const printing = priceFor(legs.printVendorId, "printing");
  const hologram = priceFor(legs.hologramVendorId, "hologram");
  const insertion = priceFor(legs.insertionVendorId, "insertion");
  const perUnit = (printing?.perUnitCents ?? 0) + (hologram?.perUnitCents ?? 0) + (insertion?.perUnitCents ?? 0);
  const setup = (printing?.setupFeeCents ?? 0) + (hologram?.setupFeeCents ?? 0) + (insertion?.setupFeeCents ?? 0);
  return {
    printing,
    hologram,
    insertion,
    totalPerUnitCents: perUnit,
    totalRunCents: perUnit * Math.max(runQty, 0) + setup,
  };
}

// Snapshot pricing onto the album_addons row. Called from the sale-
// window close path so a later vendor-price edit can't rewrite history.
// Idempotent: re-stamping is allowed (it overwrites) — the caller
// guards against re-snapshot when it shouldn't happen.
export async function snapshotPricingForAddon(addonId: string, runQty: number): Promise<{
  ok: true;
  snapshot: any;
} | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(albumAddons)
    .where(eq(albumAddons.id, addonId));
  if (!row) return { ok: false, error: "Addon not found" };
  if (row.kind !== "signed_cert") return { ok: false, error: "Not a signed_cert addon" };
  const defaults = await getDefaultGoodDeedLegs();
  const live = await resolveLivePricing(
    {
      printVendorId: row.printVendorId ?? defaults.printVendorId,
      hologramVendorId: row.hologramVendorId ?? defaults.hologramVendorId,
      insertionVendorId: row.insertionVendorId ?? defaults.insertionVendorId,
    },
    runQty,
  );
  const snapshot = {
    runQty,
    printing: live.printing,
    hologram: live.hologram,
    insertion: live.insertion,
    totalPerUnitCents: live.totalPerUnitCents,
    totalRunCents: live.totalRunCents,
  };
  await db
    .update(albumAddons)
    .set({ pricingSnapshot: snapshot as any, pricingSnapshotAt: new Date() })
    .where(eq(albumAddons.id, addonId));
  return { ok: true, snapshot };
}

// Lightweight vendor lookup with the active-service set folded in,
// for the platform-defaults picker on AdminPlatformPricing. Task #471 —
// pass `quickprintersOnly` for the Printing default so only print-only
// partners (Hoover etc.) show up.
export async function listVendorsWithService(
  service: VendorGoodDeedService,
  opts: { quickprintersOnly?: boolean } = {},
): Promise<Array<{ id: string; name: string; logoUrl: string | null }>> {
  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      logoUrl: vendors.logoUrl,
      isQuickprinter: vendors.isQuickprinter,
    })
    .from(vendors)
    .innerJoin(vendorGoodDeedServices, eq(vendorGoodDeedServices.vendorId, vendors.id))
    .where(and(
      eq(vendorGoodDeedServices.service, service),
      eq(vendorGoodDeedServices.active, true),
    ))
    .orderBy(vendors.name);
  const filtered = opts.quickprintersOnly ? rows.filter((r) => r.isQuickprinter) : rows;
  return filtered.map(({ id, name, logoUrl }) => ({ id, name, logoUrl }));
}

// Task #471 — read the singleton's default GoodDeed routing. The
// Shopify Sell panel's Cost (live) preview resolves against these IDs
// when the album_addons row has no per-leg overrides (which is now
// always the case for albums created post-#471).
export async function getDefaultGoodDeedLegs(): Promise<{
  printVendorId: string | null;
  hologramVendorId: string | null;
  insertionVendorId: string | null;
}> {
  const [row] = await db
    .select({
      printVendorId: payoutSettings.defaultPrintVendorId,
      hologramVendorId: payoutSettings.defaultHologramVendorId,
      insertionVendorId: payoutSettings.defaultInsertionVendorId,
    })
    .from(payoutSettings)
    .where(eq(payoutSettings.id, "default"));
  return {
    printVendorId: row?.printVendorId ?? null,
    hologramVendorId: row?.hologramVendorId ?? null,
    insertionVendorId: row?.insertionVendorId ?? null,
  };
}
