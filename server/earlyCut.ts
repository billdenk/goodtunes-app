// Task #533 — Pool-funded early masters cut.
//
// Central helpers for the "fund the press's minimum-run floor out of a
// per-album sales pool, then start the masters cut early" flow. The flow
// has three consent gates, all checked in `evaluateEarlyCut`:
//   1. The press has switched on its one-time auto-trigger consent
//      (manufacturers.auto_trigger_consent_at — super-admin only).
//   2. The artist has ticked the per-album opt-in for the *currently
//      picked* tier (albums.early_cut_consent_at, scoped to
//      early_cut_consent_for_tier_name + _for_format so re-picking a
//      different format/tier invalidates it).
//   3. An admin approves the resulting Early Cut Review queue row.
//
// GoodTunes fronts NO capital: an early cut can only be staged once the
// per-album pool (`albums.press_pool_accrued_cents` minus
// `press_pool_released_cents`) covers `press_floor_total`.
import { sql } from "drizzle-orm";
import { db } from "./db";

export type AlbumPressTier = {
  pressId: string;
  tierId: string;
  tierName: string;
  format: string;
  // Smallest qty rung in the tier's price ladder — the minimum run the
  // press will cut.
  minRun: number;
  // Per-unit manufacturing cost at the min-run rung, in cents.
  unitPriceCents: number;
  // One-time masters-prep cost for this tier, in cents.
  mastersPrepCents: number;
  // The slice we set aside from each paid unit: the per-unit
  // manufacturing cost plus the masters prep amortized across the
  // minimum run (rounded up so the pool can never under-fund the floor).
  perSaleEarmarkCents: number;
  // What the pool must reach before the cut can be funded:
  // (minRun × unitPriceCents) + mastersPrepCents.
  pressFloorTotalCents: number;
};

// Resolve the album's currently-picked press tier the same way the
// pipeline sweep does: read the live pressing_order_request snapshot
// (format + colour-tier name + pressId), join the matching
// press_color_tiers row, and derive the min-run rung from its price
// ladder. Returns null when the album has no live POR, the tier no
// longer exists in the press's catalog, or the tier has no priced rungs.
export async function resolveAlbumPressTier(
  albumId: string,
): Promise<AlbumPressTier | null> {
  const r = await db.execute<any>(sql`
    SELECT pct.id            AS tier_id,
           pct.press_id      AS press_id,
           pct.format        AS format,
           pct.name          AS tier_name,
           pct.price_ladder  AS price_ladder,
           pct.masters_prep_cost_cents::int AS masters_prep_cents
    FROM pressing_order_requests por
    JOIN press_color_tiers pct
      ON pct.press_id = (por.package_snapshot ->> 'pressId')
     AND pct.format   = (por.package_snapshot ->> 'format')
     AND pct.name     = (por.package_snapshot ->> 'vinylColorTier')
    WHERE por.album_id = ${albumId}
      AND por.status <> 'cancelled'
    ORDER BY (por.status = 'approved') DESC, por.submitted_at DESC
    LIMIT 1
  `);
  const row = ((r as any).rows ?? [])[0];
  if (!row) return null;

  const ladder: { qty: number; unitCents: number }[] = Array.isArray(row.price_ladder)
    ? row.price_ladder
    : [];
  const rungs = ladder
    .map((l) => ({ qty: Number(l.qty) || 0, unitCents: Number(l.unitCents) || 0 }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => a.qty - b.qty);
  if (rungs.length === 0) return null;

  const minRun = rungs[0].qty;
  const unitPriceCents = rungs[0].unitCents;
  const mastersPrepCents = Number(row.masters_prep_cents) || 0;
  if (minRun <= 0) return null;

  const perSaleEarmarkCents = unitPriceCents + Math.ceil(mastersPrepCents / minRun);
  const pressFloorTotalCents = minRun * unitPriceCents + mastersPrepCents;

  return {
    pressId: String(row.press_id),
    tierId: String(row.tier_id),
    tierName: String(row.tier_name),
    format: String(row.format),
    minRun,
    unitPriceCents,
    mastersPrepCents,
    perSaleEarmarkCents,
    pressFloorTotalCents,
  };
}

// Accrue a paid fan sale's press earmark into the album's pool.
// Idempotent per (albumId, orderId): the partial unique index on
// album_press_pool_ledger collapses a replayed webhook / double
// materialization onto the same row, and we only bump the denormalized
// running total when our INSERT actually wrote a row. `quantity` is the
// number of copies the order bought (per-copy fan-out happens elsewhere;
// the earmark scales linearly with units). Safe to call for every paid
// order — it no-ops when the album has no resolvable press tier.
export async function accruePressPool(
  albumId: string,
  orderId: string,
  quantity: number,
): Promise<{ accruedCents: number } | null> {
  const tier = await resolveAlbumPressTier(albumId);
  if (!tier) return null;
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const cents = tier.perSaleEarmarkCents * qty;
  if (cents <= 0) return null;

  try {
    const ins = await db.execute<any>(sql`
      INSERT INTO album_press_pool_ledger (album_id, kind, cents, source_order_id, note)
      VALUES (${albumId}, 'accrue', ${cents}, ${orderId},
              ${`${qty} × ${tier.perSaleEarmarkCents}c (${tier.format}/${tier.tierName})`})
      ON CONFLICT (album_id, source_order_id) WHERE kind = 'accrue' AND source_order_id IS NOT NULL
      DO NOTHING
      RETURNING id
    `);
    const inserted = ((ins as any).rows ?? []).length > 0;
    if (!inserted) {
      console.log(`[early-cut] accrue album=${albumId} order=${orderId} already counted — skip`);
      return { accruedCents: 0 };
    }
    await db.execute(sql`
      UPDATE albums
      SET press_pool_accrued_cents = press_pool_accrued_cents + ${cents}
      WHERE id = ${albumId}
    `);
    console.log(`[early-cut] accrue album=${albumId} order=${orderId} +${cents}c (qty=${qty} earmark=${tier.perSaleEarmarkCents}c)`);
    // This sale may be the one that pushes the pool over the floor — try to
    // enqueue the album for admin review now instead of waiting for someone
    // to load the press pipeline. No-ops unless every gate is satisfied.
    await syncEarlyCutQueue(albumId).catch((e) =>
      console.log(`[early-cut] post-accrual enqueue failed album=${albumId}: ${(e as Error).message}`),
    );
    return { accruedCents: cents };
  } catch (e) {
    console.log(`[early-cut] accrue threw album=${albumId} order=${orderId}: ${(e as Error).message}`);
    return null;
  }
}

// Reverse an order's accrual when it is refunded so the funding pool can
// never overstate what fans have actually paid in. Idempotent per
// (albumId, orderId): the partial unique index collapses a replayed
// refund webhook onto the same `deaccrue` row, and we only decrement the
// denormalized running total when our INSERT actually wrote a row. The
// reversal mirrors the exact cents recorded at accrual time (read back
// from the ledger) rather than re-deriving the earmark, so a tier/price
// change between sale and refund can't skew the math. Safe to call for
// every refunded order — it no-ops when the order never accrued.
export async function reversePressPoolForOrder(
  albumId: string,
  orderId: string,
): Promise<{ reversedCents: number } | null> {
  try {
    const acc = await db.execute<any>(sql`
      SELECT COALESCE(SUM(cents), 0)::int AS cents
      FROM album_press_pool_ledger
      WHERE album_id = ${albumId} AND source_order_id = ${orderId} AND kind = 'accrue'
    `);
    const cents = Number(((acc as any).rows ?? [])[0]?.cents) || 0;
    if (cents <= 0) return { reversedCents: 0 };

    const ins = await db.execute<any>(sql`
      INSERT INTO album_press_pool_ledger (album_id, kind, cents, source_order_id, note)
      VALUES (${albumId}, 'deaccrue', ${cents}, ${orderId}, 'refund reversal')
      ON CONFLICT (album_id, source_order_id) WHERE kind = 'deaccrue' AND source_order_id IS NOT NULL
      DO NOTHING
      RETURNING id
    `);
    const inserted = ((ins as any).rows ?? []).length > 0;
    if (!inserted) return { reversedCents: 0 };

    await db.execute(sql`
      UPDATE albums
      SET press_pool_accrued_cents = GREATEST(0, press_pool_accrued_cents - ${cents})
      WHERE id = ${albumId}
    `);
    console.log(`[early-cut] deaccrue album=${albumId} order=${orderId} -${cents}c (refund)`);
    return { reversedCents: cents };
  } catch (e) {
    console.log(`[early-cut] deaccrue threw album=${albumId} order=${orderId}: ${(e as Error).message}`);
    return null;
  }
}

export type EarlyCutEligibility = {
  // True only when the pool covers the floor AND all three consents are
  // in place AND the cut hasn't already been triggered.
  eligible: boolean;
  // True when only the pool/funding condition is met (consents aside) —
  // used to surface "pool ready, waiting on consent" copy.
  poolReady: boolean;
  unitsSold: number;
  tierMinRun: number;
  pressFloorTotalCents: number;
  poolAvailableCents: number;
  // Which gates are still missing, in user-facing language.
  missingConsents: ("press" | "artist" | "tier")[];
  tier: AlbumPressTier | null;
};

// Count paid, un-refunded format units sold for an album (the
// denominator for "units_sold vs min_run").
async function unitsSoldForAlbum(albumId: string): Promise<number> {
  const r = await db.execute<{ s: string | null }>(sql`
    SELECT COALESCE(SUM(oi.quantity), 0)::text AS s
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.kind = 'format'
      AND o.album_id = ${albumId}
      AND o.status IN ('paid','shipped')
      AND o.refunded_at IS NULL
  `);
  const s = ((r as any).rows ?? [])[0]?.s ?? "0";
  return parseInt(s, 10) || 0;
}

// Evaluate whether an album qualifies for an early cut right now. Reads
// the live pool totals + the three consent gates. Pure read — never
// mutates; the caller (pipeline sweep) decides whether to enqueue.
export async function evaluateEarlyCut(albumId: string): Promise<EarlyCutEligibility> {
  const tier = await resolveAlbumPressTier(albumId);
  const albumRows = await db.execute<any>(sql`
    SELECT a.press_pool_accrued_cents::int   AS accrued,
           a.press_pool_released_cents::int  AS released,
           a.masters_triggered_at            AS masters_triggered_at,
           a.early_cut_consent_at            AS consent_at,
           a.early_cut_consent_for_tier_name AS consent_tier,
           a.early_cut_consent_for_format    AS consent_format
    FROM albums a
    WHERE a.id = ${albumId}
    LIMIT 1
  `);
  const a = ((albumRows as any).rows ?? [])[0] ?? {};
  const accrued = Number(a.accrued) || 0;
  const released = Number(a.released) || 0;
  const poolAvailableCents = Math.max(0, accrued - released);
  const unitsSold = await unitsSoldForAlbum(albumId);

  const missingConsents: ("press" | "artist" | "tier")[] = [];

  // Gate #1 — press auto-trigger consent.
  let pressConsented = false;
  if (tier) {
    const pr = await db.execute<any>(sql`
      SELECT auto_trigger_consent_at AS at
      FROM manufacturers WHERE id = ${tier.pressId} LIMIT 1
    `);
    pressConsented = !!((pr as any).rows ?? [])[0]?.at;
  }
  if (!pressConsented) missingConsents.push("press");

  // Gate #2 — artist opt-in, scoped to the currently-picked tier/format.
  // A consent recorded against a different tier/format no longer counts.
  const artistConsented =
    !!a.consent_at &&
    !!tier &&
    a.consent_tier === tier.tierName &&
    a.consent_format === tier.format;
  if (!artistConsented) missingConsents.push("artist");

  const poolReady = !!tier && poolAvailableCents >= tier.pressFloorTotalCents;
  const alreadyTriggered = !!a.masters_triggered_at;

  const eligible =
    !!tier && poolReady && !alreadyTriggered && missingConsents.length === 0;

  return {
    eligible,
    poolReady,
    unitsSold,
    tierMinRun: tier?.minRun ?? 0,
    pressFloorTotalCents: tier?.pressFloorTotalCents ?? 0,
    poolAvailableCents,
    missingConsents,
    tier,
  };
}

// Upsert the pending Early Cut Review queue row for an album when it has
// become eligible. Idempotent: the partial unique index keeps at most
// one pending row per album, and we refresh its snapshot numbers so the
// queue card stays current while it waits for an admin. No-ops when the
// album isn't eligible. Returns true when a pending row exists after the
// call.
export async function syncEarlyCutQueue(albumId: string): Promise<boolean> {
  const e = await evaluateEarlyCut(albumId);
  if (!e.eligible || !e.tier) return false;
  await db.execute(sql`
    INSERT INTO press_early_cut_queue
      (album_id, press_id, status, press_floor_total_cents, pool_available_cents,
       units_sold, tier_name, format)
    VALUES
      (${albumId}, ${e.tier.pressId}, 'pending', ${e.pressFloorTotalCents},
       ${e.poolAvailableCents}, ${e.unitsSold}, ${e.tier.tierName}, ${e.tier.format})
    ON CONFLICT (album_id) WHERE status = 'pending'
    DO UPDATE SET
      press_floor_total_cents = EXCLUDED.press_floor_total_cents,
      pool_available_cents    = EXCLUDED.pool_available_cents,
      units_sold              = EXCLUDED.units_sold,
      tier_name               = EXCLUDED.tier_name,
      format                  = EXCLUDED.format
  `);
  return true;
}
