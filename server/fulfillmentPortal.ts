// Task #2818 — Fulfillment-partner portal endpoints (Spinney Media et al).
// Scoped, read-mostly feeds for the invited fulfillment partner:
//   GET /api/fulfillment/:id/me       — identity header (name/logo/flags)
//   GET /api/fulfillment/:id/orders   — fan orders routed to this warehouse
//   GET /api/fulfillment/:id/inbound  — approved press runs headed here
// Gate mirrors printerPortal.ts: platform staff (super_admin/admin) pass,
// otherwise the caller needs a membership row scoped to THIS fulfillment
// partner (scope_kind = "fulfillment"). Fail-closed: no membership → 403.
// No fan PII crosses the wire — the partner sees the shipping destination
// (city/region/country, what a warehouse genuinely needs) but never buyer
// name or email.

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { eq, sql, isNull, desc } from "drizzle-orm";
import {
  orders,
  orderItems,
  albums,
  fulfillmentPartners,
  albumFulfillmentSplits,
  pressingOrderRequests,
  manufacturers,
  type StripeAddressSnapshot,
} from "@shared/schema";
import { storage } from "./storage";

// ─── Expected-arrival derivation ─────────────────────────────────────
// Stored override (pressing_order_requests.expected_arrival_at) always
// wins. Otherwise derive from the producing press's turn time anchored
// on the approval date: turnaround_days first, else the midpoint of the
// turnaround week range, else a conservative 8-week default.
export function deriveExpectedArrival(args: {
  expectedArrivalAt: Date | string | null;
  decidedAt: Date | string | null;
  turnaroundDays: number | null;
  turnaroundWeeksMin: number | null;
  turnaroundWeeksMax: number | null;
}): { date: string | null; source: "override" | "press_turn_time" | "default" | null } {
  if (args.expectedArrivalAt) {
    return { date: new Date(args.expectedArrivalAt).toISOString(), source: "override" };
  }
  if (!args.decidedAt) return { date: null, source: null };
  const anchor = new Date(args.decidedAt).getTime();
  let days: number | null = null;
  let source: "press_turn_time" | "default" = "press_turn_time";
  if (args.turnaroundDays != null && args.turnaroundDays > 0) {
    days = args.turnaroundDays;
  } else if (args.turnaroundWeeksMin != null || args.turnaroundWeeksMax != null) {
    const min = args.turnaroundWeeksMin ?? args.turnaroundWeeksMax ?? 0;
    const max = args.turnaroundWeeksMax ?? args.turnaroundWeeksMin ?? 0;
    days = Math.round(((min + max) / 2) * 7);
  } else {
    days = 8 * 7;
    source = "default";
  }
  return { date: new Date(anchor + days * 24 * 60 * 60 * 1000).toISOString(), source };
}

// Does an approved press run for `albumId` land at fulfillment partner
// `partnerId`? Mirrors pickFulfillmentPartner in orderDesk.ts:
//   1. partner-kind album_fulfillment_splits (any split naming us → yes)
//   2. albums.fulfillment_partner_id override
//   3. platform default partner (is_default) when nothing else routes it
export async function albumRoutesToPartner(albumId: string, partnerId: string, partnerIsDefault: boolean): Promise<boolean> {
  const splits = await db
    .select({ fulfillmentPartnerId: albumFulfillmentSplits.fulfillmentPartnerId })
    .from(albumFulfillmentSplits)
    .where(eq(albumFulfillmentSplits.albumId, albumId));
  if (splits.length > 0) {
    // Split precedence — when splits exist they alone decide routing.
    return splits.some((s) => s.fulfillmentPartnerId === partnerId);
  }
  const [album] = await db
    .select({ fulfillmentPartnerId: albums.fulfillmentPartnerId })
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);
  if (album?.fulfillmentPartnerId) return album.fulfillmentPartnerId === partnerId;
  return partnerIsDefault;
}

export function registerFulfillmentPortalRoutes(app: Express, requireAdmin: any) {
  // Scope gate — platform staff OR a fulfillment-scoped membership for
  // this partner. Asserts the partner exists and is not trashed.
  const requireFulfillmentScope = async (req: Request, res: Response, next: () => void) => {
    const userId = (req as any).adminUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const partnerId = String(req.params.id);
    const partner = await storage.getFulfillmentPartnerById(partnerId);
    if (!partner || (partner as any).deletedAt) {
      return res.status(404).json({ message: "Fulfillment partner not found" });
    }
    (req as any).fulfillmentPartner = partner;
    const { getUserRole, findMembershipForScope } = await import("./auth/roles");
    const info = await getUserRole(userId);
    if (!info) return res.status(403).json({ message: "Forbidden" });
    if (info.role === "super_admin" || info.role === "admin") return next();
    if (await findMembershipForScope(userId, "fulfillment", partnerId)) return next();
    return res.status(403).json({ message: "Forbidden" });
  };

  // GET /api/fulfillment/:id/me — identity header for the portal shell.
  app.get("/api/fulfillment/:id/me", requireAdmin, requireFulfillmentScope, async (req, res) => {
    const partner = (req as any).fulfillmentPartner;
    res.json({
      id: partner.id,
      name: partner.name,
      logoUrl: partner.logoUrl ?? null,
      isDefault: !!partner.isDefault,
      canEdit: true,
    });
  });

  // GET /api/fulfillment/:id/orders — fan orders routed to this warehouse.
  // Only orders explicitly stamped with this partner id (set at OD push or
  // by the operator) appear; un-routed orders never leak cross-partner.
  app.get("/api/fulfillment/:id/orders", requireAdmin, requireFulfillmentScope, async (req, res) => {
    const partnerId = String(req.params.id);
    const rows = await db
      .select({ order: orders, album: albums })
      .from(orders)
      .innerJoin(albums, eq(albums.id, orders.albumId))
      .where(sql`${orders.fulfillmentPartnerId} = ${partnerId} AND ${orders.origin} != 'qa:test'`)
      .orderBy(desc(orders.createdAt))
      .limit(500);

    // Per-order physical quantity (orders have no quantity column; the
    // per-line quantities live on order_items).
    const ids = rows.map((r) => r.order.id);
    const qtyByOrder = new Map<string, number>();
    if (ids.length > 0) {
      const qtyRows = await db
        .select({
          orderId: orderItems.orderId,
          qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
        })
        .from(orderItems)
        .where(sql`${orderItems.orderId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
        .groupBy(orderItems.orderId);
      for (const q of qtyRows) qtyByOrder.set(q.orderId, Number(q.qty) || 0);
    }

    res.json(
      rows.map(({ order, album }) => {
        const ship = (order.shippingAddress ?? null) as StripeAddressSnapshot | null;
        return {
          id: order.id,
          albumId: album.id,
          albumTitle: album.title,
          albumArtist: album.artist,
          albumArtwork: album.artwork,
          skuKind: order.skuKind ?? null,
          quantity: qtyByOrder.get(order.id) ?? 1,
          fulfillmentStatus: order.fulfillmentStatus ?? null,
          orderDeskOrderId: order.orderDeskOrderId ?? null,
          carrier: order.carrier ?? null,
          trackingNumber: order.trackingNumber ?? null,
          trackingUrl: order.trackingUrl ?? null,
          // Destination only — no buyer name/email (warehouse needs the
          // where, not the who).
          shipCity: ship?.city ?? null,
          shipState: ship?.state ?? null,
          shipCountry: ship?.country ?? null,
          createdAt: order.createdAt ? new Date(order.createdAt as any).toISOString() : null,
          submittedToFulfillmentAt: order.submittedToFulfillmentAt
            ? new Date(order.submittedToFulfillmentAt as any).toISOString()
            : null,
          shippedAt: order.shippedAt ? new Date(order.shippedAt as any).toISOString() : null,
          deliveredAt: order.deliveredAt ? new Date(order.deliveredAt as any).toISOString() : null,
        };
      }),
    );
  });

  // GET /api/fulfillment/:id/inbound — approved press runs whose finished
  // goods land at this warehouse. Routed via album splits / album override /
  // platform default, mirroring the OD routing rules exactly.
  app.get("/api/fulfillment/:id/inbound", requireAdmin, requireFulfillmentScope, async (req, res) => {
    const partner = (req as any).fulfillmentPartner;
    const partnerId = String(req.params.id);
    const runs = await db
      .select({ run: pressingOrderRequests, album: albums })
      .from(pressingOrderRequests)
      .innerJoin(albums, eq(albums.id, pressingOrderRequests.albumId))
      .where(sql`${pressingOrderRequests.status} = 'approved' AND ${albums.deletedAt} IS NULL`)
      .orderBy(desc(pressingOrderRequests.decidedAt))
      .limit(200);

    const out: any[] = [];
    for (const { run, album } of runs) {
      if (!(await albumRoutesToPartner(album.id, partnerId, !!partner.isDefault))) continue;
      const snap = run.packageSnapshot as any;
      // Producing press turn time (for the derived arrival estimate).
      let press: { turnaroundDays: number | null; turnaroundWeeksMin: number | null; turnaroundWeeksMax: number | null } | null = null;
      if (snap?.pressId) {
        const [m] = await db
          .select({
            turnaroundDays: manufacturers.turnaroundDays,
            turnaroundWeeksMin: manufacturers.turnaroundWeeksMin,
            turnaroundWeeksMax: manufacturers.turnaroundWeeksMax,
          })
          .from(manufacturers)
          .where(sql`${manufacturers.id} = ${snap.pressId} AND ${manufacturers.deletedAt} IS NULL`)
          .limit(1);
        press = m ?? null;
      }
      const arrival = deriveExpectedArrival({
        expectedArrivalAt: run.expectedArrivalAt as any,
        decidedAt: run.decidedAt as any,
        turnaroundDays: press?.turnaroundDays ?? null,
        turnaroundWeeksMin: press?.turnaroundWeeksMin ?? null,
        turnaroundWeeksMax: press?.turnaroundWeeksMax ?? null,
      });
      out.push({
        id: run.id,
        albumId: album.id,
        albumTitle: album.title,
        albumArtist: album.artist,
        albumArtwork: album.artwork,
        format: snap?.format ?? null,
        pressName: snap?.pressName ?? null,
        vinylColor: snap?.vinylColor ?? null,
        quantity: run.quantity,
        approvedAt: run.decidedAt ? new Date(run.decidedAt as any).toISOString() : null,
        expectedArrivalAt: arrival.date,
        expectedArrivalSource: arrival.source,
      });
    }
    res.json(out);
  });
}
