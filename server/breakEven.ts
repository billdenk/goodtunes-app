// Task #1963 — Break-even calculator (server inputs).
//
// Gathers the DB inputs the pure `computeBreakEven` (shared/breakEven.ts)
// needs and returns a read-only payload for the operator Sell panel, the
// artist dashboard, and the shared quote. Reconciles with the existing
// early-cut press-floor: the run quantity, per-unit manufacturing, and
// masters-prep all come from `resolveAlbumPressTier` so the break-even
// and the start-the-press floor can never disagree. Pure read — never
// writes anything back.
import { sql } from "drizzle-orm";
import { db } from "./db";
import { resolveAlbumPressTier, resolveAlbumSkuPressTier, sqlUnitsSoldForAlbum } from "./earlyCut";
import { resolveLivePricing, getDefaultGoodDeedLegs } from "./vendorGoodDeedPricing";
import { computeBreakEven, type AlbumBreakEven } from "@shared/breakEven";

export type { AlbumBreakEven };

function emptyBreakEven(albumId: string, unitsSold: number): AlbumBreakEven {
  return {
    albumId,
    hasPressTier: false,
    format: null,
    tierName: null,
    unitsSold,
    vinylRetailCents: null,
    pressFloorUnits: 0,
    pressFloorTotalCents: 0,
    goodDeedActive: false,
    computable: false,
    runQty: 0,
    fixedRunCostCents: 0,
    vinylNetCents: 0,
    vinylBreakEvenUnits: null,
    goodDeed: null,
  };
}

async function unitsSoldForAlbum(albumId: string): Promise<number> {
  const r = await db.execute<{ s: string | null }>(sqlUnitsSoldForAlbum(albumId));
  const s = ((r as any).rows ?? [])[0]?.s ?? "0";
  return parseInt(s, 10) || 0;
}

// Resolve the album-level break-even readout. `albumId` is trusted —
// the route mounting this is responsible for authorizing the caller
// against the album (operator via requireAdmin, artist via scope).
export async function computeAlbumBreakEven(albumId: string): Promise<AlbumBreakEven> {
  const unitsSold = await unitsSoldForAlbum(albumId);
  // Task #2564 — prefer the saved SKU's tier so a Prepping album (no
  // submitted pressing_order_request yet) breaks even the instant a
  // priced tier + retail are saved. Fall back to the POR-derived tier
  // for submitted / legacy rows. Both resolvers share the same ladder
  // derivation, so the number never shifts when an album later gets a
  // POR for the same tier.
  const tier =
    (await resolveAlbumSkuPressTier(albumId)) ?? (await resolveAlbumPressTier(albumId));
  if (!tier) return emptyBreakEven(albumId, unitsSold);

  // Vinyl SKU for the picked tier's format — retail price + the track
  // count snapshot locked at last save (falls back to the live song
  // count so a pre-snapshot row still computes).
  const skuRow = await db.execute<{
    price_cents: number | null;
    cost_snapshot_track_count: number | null;
  }>(sql`
    SELECT price_cents, cost_snapshot_track_count
    FROM album_skus
    WHERE album_id = ${albumId} AND format = ${tier.format}
    LIMIT 1
  `);
  const sku = ((skuRow as any).rows ?? [])[0] ?? null;

  const liveTrackRow = await db.execute<{ c: string }>(sql`
    SELECT COUNT(*)::text AS c FROM songs WHERE album_id = ${albumId} AND deleted_at IS NULL
  `);
  const liveTrackCount = parseInt(((liveTrackRow as any).rows ?? [])[0]?.c ?? "0", 10) || 0;
  const trackCount = sku?.cost_snapshot_track_count ?? liveTrackCount;

  const vinylRetailCents = sku?.price_cents ?? null;

  // Per-unit NPO donation carve-out (sum across beneficiaries).
  const donRow = await db.execute<{ c: number | null }>(sql`
    SELECT COALESCE(SUM(per_unit_cents), 0)::int AS c
    FROM album_npo_beneficiaries WHERE album_id = ${albumId}
  `);
  const donationPerUnitCents = Number(((donRow as any).rows ?? [])[0]?.c) || 0;

  // Active signed-certificate add-on with a planned quantity drives the
  // with-GoodDeeds break-even. No active/planned add-on ⇒ vinyl-only.
  const gdRow = await db.execute<{
    price_cents: number;
    planned_quantity: number | null;
    print_vendor_id: string | null;
    hologram_vendor_id: string | null;
    insertion_vendor_id: string | null;
  }>(sql`
    SELECT price_cents, planned_quantity,
           print_vendor_id, hologram_vendor_id, insertion_vendor_id
    FROM album_addons
    WHERE album_id = ${albumId} AND kind = 'signed_cert' AND active = true
    LIMIT 1
  `);
  const gd = ((gdRow as any).rows ?? [])[0] ?? null;

  let goodDeed = null as Parameters<typeof computeBreakEven>[0]["goodDeed"];
  if (gd && (gd.planned_quantity ?? 0) > 0) {
    const plannedCertQty = Number(gd.planned_quantity) || 0;
    // Per-cert wholesale = the tiered ladder rung at the planned cert
    // quantity, using the add-on's per-leg vendors (defaults fill any
    // unassigned leg) — the same resolution the snapshot path uses.
    const defaults = await getDefaultGoodDeedLegs();
    const live = await resolveLivePricing(
      {
        printVendorId: gd.print_vendor_id ?? defaults.printVendorId,
        hologramVendorId: gd.hologram_vendor_id ?? defaults.hologramVendorId,
        insertionVendorId: gd.insertion_vendor_id ?? defaults.insertionVendorId,
      },
      plannedCertQty,
    );
    goodDeed = {
      certRetailCents: Number(gd.price_cents) || 0,
      certWholesalePerUnitCents: live.totalPerUnitCents,
      plannedCertQty,
    };
  }

  const result = computeBreakEven({
    runQty: tier.minRun,
    unitMfgCents: tier.unitPriceCents,
    mastersPrepCents: tier.mastersPrepCents,
    trackCount,
    vinylRetailCents: vinylRetailCents ?? 0,
    donationPerUnitCents,
    goodDeed,
  });

  return {
    albumId,
    hasPressTier: true,
    format: tier.format,
    tierName: tier.tierName,
    unitsSold,
    vinylRetailCents,
    pressFloorUnits: tier.minRun,
    pressFloorTotalCents: tier.pressFloorTotalCents,
    goodDeedActive: !!result.goodDeed,
    ...result,
  };
}
