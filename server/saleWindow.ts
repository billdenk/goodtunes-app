// Task #246 — Signed-cert sale-window batch workflow.
//
// At-a-glance state machine:
//   - Operator sets opens/closes on the album (status = "scheduled").
//   - First fan order in-window mints a `cert_reservations` row with a
//     reserved GoodDeed number (printed variant). Status flips to "open"
//     on first reservation OR when opensAt is reached, whichever first.
//   - At closesAt, `runDueSaleWindows` calls `closeSaleWindow`:
//       count active "reserved" rows
//         <25 → refund the cert add-on line on every order (Shopify or
//               direct), flip rows to "refunded_below_min", album status
//               → "closed_below_min".
//         ≥25 → snapshot pricing onto the addon (`snapshotPricingForAddon`),
//               flip rows to "in_production", album → "in_production",
//               and write a `cert_trueup_ledger` row (status =
//               "pending_no_engine" — Task #4 auto-charge engine is not
//               yet implemented, so the delta is recorded only).
//   - Post-window orders that still pay for the cert variant are recorded
//     as `digital_only` reservations (no print row, no refund — the fan
//     gets the digital provenance page and nothing else).
//
// The scheduler is a simple in-process setInterval (5 min). For a single-
// node deployment that's safe; if/when we scale out, lift this into a
// pg-advisory-lock-guarded job. closeSaleWindow itself is idempotent:
// re-entering with status != "open"/"scheduled" early-returns.

import { eq, and, lt, inArray, sql, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  albums,
  albumAddons,
  certReservations,
  certTrueupLedger,
  orders,
  orderItems,
  type CertReservation,
} from "@shared/schema";
import {
  DEFAULT_SIGNED_CERT_LADDER,
  SIGNED_CERT_MIN_BATCH,
  lookupSignedCertRung,
  type SignedCertLadderRung,
} from "@shared/signedCertLadder";
import { snapshotPricingForAddon } from "./vendorGoodDeedPricing";

const SIGNED_CERT_SKU = "signed_cert";

type RefundFailure = { reservationId: string; orderId: string; reason: string };
type CloseResult =
  | {
      ok: true;
      outcome: "below_min" | "below_min_partial" | "in_production" | "noop";
      reservations: number;
      refundFailures?: RefundFailure[];
    }
  | { ok: false; error: string };

async function readLiveLadder(): Promise<SignedCertLadderRung[]> {
  try {
    const r = await db.execute(sql`
      SELECT signed_cert_ladder FROM payout_settings WHERE id = 'default' LIMIT 1
    `);
    const raw = (r.rows[0] as any)?.signed_cert_ladder;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw as SignedCertLadderRung[];
    }
  } catch (_e) {
    // payout_settings may not exist yet on a brand-new dev DB.
  }
  return DEFAULT_SIGNED_CERT_LADDER;
}

// Refund every "reserved" row's cert add-on line.
//
// Three outcomes:
//   - "shopify_ok"     — money was actually returned via Shopify; safe
//                        to flip the reservation to `refunded_below_min`.
//   - "shopify_failed" — Shopify API errored; LEAVE the reservation as
//                        `reserved` so the next tick retries (and the
//                        album stays in `open` so reconciliation is
//                        visible to ops). Money was NOT returned.
//   - "direct_marker"  — direct Stripe order. The addon-aware Stripe
//                        refund flow lives in commerce.ts; out of scope
//                        for this task (see follow-up #307). We flip
//                        the reservation to `refunded_below_min` with
//                        refundedCents=0 so admin sees an explicit "to
//                        be refunded" worklist row.
//   - "no_charge"      — order had no cert line item priced. Flip the
//                        reservation to `refunded_below_min` (nothing
//                        to refund).
type RefundOutcome =
  | { kind: "shopify_ok"; refundShopifyId: string; refundedCents: number }
  | { kind: "shopify_failed"; reason: string }
  | { kind: "direct_marker" }
  | { kind: "no_charge" };

async function refundOneReservation(res: CertReservation): Promise<RefundOutcome> {
  const [order] = await db.select().from(orders).where(eq(orders.id, res.orderId));
  if (!order) return { kind: "no_charge" };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const certItem = items.find((i) => i.kind === "addon" && i.sku === SIGNED_CERT_SKU);
  const refundCents = certItem ? certItem.unitPriceCents * (certItem.quantity ?? 1) : 0;
  if (refundCents <= 0) return { kind: "no_charge" };

  if (order.shopifyStoreId && order.shopifyOrderId) {
    try {
      const { refundShopifyOrder } = await import("./shopify");
      const r = await refundShopifyOrder({
        shopifyStoreId: order.shopifyStoreId,
        shopifyOrderId: order.shopifyOrderId,
        amountCents: refundCents,
        reason: "Signed-cert sale window closed below 25-unit minimum",
      });
      if (!r.refundId) {
        return { kind: "shopify_failed", reason: "Shopify returned no refund id" };
      }
      return { kind: "shopify_ok", refundShopifyId: r.refundId, refundedCents: refundCents };
    } catch (e: any) {
      const reason = e?.message ?? String(e);
      console.error(`[saleWindow] Shopify refund failed for reservation ${res.id}: ${reason}`);
      return { kind: "shopify_failed", reason };
    }
  }
  return { kind: "direct_marker" };
}

export async function closeSaleWindow(albumId: string): Promise<CloseResult> {
  const [album] = await db.select().from(albums).where(eq(albums.id, albumId));
  if (!album) return { ok: false, error: "Album not found" };
  const status = album.signedCertWindowStatus;
  if (status !== "open" && status !== "scheduled" && status !== null) {
    return { ok: true, outcome: "noop", reservations: 0 };
  }

  const reservations = await db
    .select()
    .from(certReservations)
    .where(
      and(
        eq(certReservations.albumId, albumId),
        eq(certReservations.status, "reserved"),
        eq(certReservations.variantKind, "printed"),
      ),
    );
  const count = reservations.length;
  const now = new Date();

  if (count < SIGNED_CERT_MIN_BATCH) {
    // Refund pass — fail-safe per row. We only finalize a reservation
    // (and the album) as "refunded_below_min" when money was actually
    // returned (or there was no charge to begin with). A Shopify API
    // failure leaves the row in "reserved" so the next scheduler tick
    // retries it, and the album stays in "open" so ops sees the
    // unresolved refund work in the admin panel instead of a silently
    // closed window.
    const failures: RefundFailure[] = [];
    for (const res of reservations) {
      const r = await refundOneReservation(res);
      if (r.kind === "shopify_failed") {
        failures.push({ reservationId: res.id, orderId: res.orderId, reason: r.reason });
        // Leave the row as "reserved" — retryable on the next tick.
        continue;
      }
      await db
        .update(certReservations)
        .set({
          status: "refunded_below_min",
          refundedAt: now,
          refundShopifyId: r.kind === "shopify_ok" ? r.refundShopifyId : null,
          refundedCents: r.kind === "shopify_ok" ? r.refundedCents : 0,
          updatedAt: now,
        })
        .where(eq(certReservations.id, res.id));
    }
    if (failures.length > 0) {
      // Partial close: leave window "open" so the next tick retries
      // the failed rows. Do NOT advance album status — ops needs to
      // see the unresolved refunds. The admin panel surfaces the
      // still-reserved rows via the counts response.
      console.warn(
        `[saleWindow] partial close for album ${albumId}: ${failures.length}/${count} refunds failed`,
      );
      return {
        ok: true,
        outcome: "below_min_partial",
        reservations: count,
        refundFailures: failures,
      };
    }
    await db
      .update(albums)
      .set({
        signedCertWindowStatus: "closed_below_min",
        signedCertWindowClosedAt: now,
      })
      .where(eq(albums.id, albumId));
    return { ok: true, outcome: "below_min", reservations: count };
  }

  // ≥25 — snapshot pricing, flip rows, and record true-up.
  const [addon] = await db
    .select()
    .from(albumAddons)
    .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.kind, "signed_cert")));

  const ladder = await readLiveLadder();
  const actualRung = lookupSignedCertRung(count, ladder);
  // The projected rung is whatever rung the label's plannedQty pointed at
  // (if they set one). Falls back to actualRung when not set.
  const plannedQty = (addon as any)?.plannedQuantity ?? null;
  const projectedRung = plannedQty != null ? lookupSignedCertRung(plannedQty, ladder) : actualRung;

  if (addon) {
    const snap = await snapshotPricingForAddon(addon.id, count);
    if (!snap.ok) {
      console.warn(`[saleWindow] snapshotPricingForAddon failed: ${snap.error}`);
    }
  }

  await db
    .update(certReservations)
    .set({ status: "in_production", updatedAt: now })
    .where(
      and(
        eq(certReservations.albumId, albumId),
        eq(certReservations.status, "reserved"),
        eq(certReservations.variantKind, "printed"),
      ),
    );
  await db
    .update(albums)
    .set({
      signedCertWindowStatus: "in_production",
      signedCertWindowClosedAt: now,
    })
    .where(eq(albums.id, albumId));

  // True-up ledger row — recording-only because Task #4 auto-charge
  // engine is not yet wired up.
  const projectedWholesaleCents = projectedRung?.wholesaleCents ?? null;
  const actualWholesaleCents = actualRung?.wholesaleCents ?? null;
  const deltaPerUnit =
    actualWholesaleCents != null && projectedWholesaleCents != null
      ? actualWholesaleCents - projectedWholesaleCents
      : 0;
  await db.insert(certTrueupLedger).values({
    albumId,
    batchSize: count,
    projectedRungLabel: projectedRung?.label ?? null,
    projectedWholesaleCents,
    actualRungLabel: actualRung?.label ?? null,
    actualWholesaleCents,
    deltaCentsPerUnit: deltaPerUnit,
    totalDeltaCents: deltaPerUnit * count,
    ownerKind: album.payoutOwnerKind ?? (album.labelId ? "label" : album.primaryArtistId ? "artist" : null),
    ownerId: album.payoutOwnerId ?? album.labelId ?? album.primaryArtistId ?? null,
    status: "pending_no_engine",
    notes:
      "Auto-charge engine (Task #4) not yet implemented — ledger is recording-only. Settle manually until then.",
  });

  return { ok: true, outcome: "in_production", reservations: count };
}

// Promote `scheduled` → `open` for any album whose opensAt has passed,
// and close any window whose closesAt has passed. Called every 5 min by
// the in-process scheduler in server/index.ts.
export async function runDueSaleWindows(): Promise<{ opened: number; closed: number }> {
  const now = new Date();
  let opened = 0;
  let closed = 0;

  const toOpen = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        eq(albums.signedCertWindowStatus, "scheduled"),
        lt(albums.signedCertWindowOpensAt, now),
      ),
    );
  for (const row of toOpen) {
    await db
      .update(albums)
      .set({ signedCertWindowStatus: "open" })
      .where(eq(albums.id, row.id));
    opened++;
  }

  const toClose = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        inArray(albums.signedCertWindowStatus, ["open", "scheduled"]),
        lt(albums.signedCertWindowClosesAt, now),
      ),
    );
  for (const row of toClose) {
    try {
      await closeSaleWindow(row.id);
      closed++;
    } catch (e: any) {
      console.error(`[saleWindow] close failed for ${row.id}: ${e?.message ?? e}`);
    }
  }
  return { opened, closed };
}

// Resolve the right reservation kind to mint for a fresh order on a
// signed-cert addon line. Centralised here so both Shopify webhook and
// the (future) direct Stripe webhook share the same logic.
//   - status "open"  → printed
//   - status null    → printed (no window configured — legacy behaviour)
//   - everything else (closed_below_min / in_production / shipped /
//     cancelled / scheduled) → digital_only
export function reservationKindForWindowStatus(
  status: string | null,
): "printed" | "digital_only" {
  if (status === null || status === "open") return "printed";
  return "digital_only";
}
