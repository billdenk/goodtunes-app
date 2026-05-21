// Task #73 — Order Desk integration. The physical-goods path of every
// paid order (Stripe direct or Shopify-bundled) hands off to Order Desk,
// which routes the carton to one of our fulfillment_partners warehouses.
// Status flips back into our DB via a signed inbound webhook so the
// admin + (later) fan-side tracking surface stays current without
// polling.
//
// Credentials live in env vars (no Replit connector exists for OD):
//   ORDERDESK_STORE_ID         — numeric store id from app.orderdesk.me
//   ORDERDESK_API_KEY          — API key for that store
//   ORDERDESK_WEBHOOK_SECRET   — shared secret OD signs inbound payloads with
//
// When any of these are unset (dev / not-yet-configured), the client
// no-ops with a console.warn so the rest of the checkout path still
// completes. The order keeps `fulfillment_status = "pending"` and the
// operator can retry once OD is connected.

import type { Express } from "express";
import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import {
  orders,
  orderItems,
  albums,
  customerUsers,
  fulfillmentPartners,
  orderDeskWebhookEvents,
  type Order,
  type StripeAddressSnapshot,
} from "@shared/schema";

// ─── Env / config ────────────────────────────────────────────────────
function odCreds():
  | { storeId: string; apiKey: string }
  | null {
  const storeId = process.env.ORDERDESK_STORE_ID?.trim();
  const apiKey = process.env.ORDERDESK_API_KEY?.trim();
  if (!storeId || !apiKey) return null;
  return { storeId, apiKey };
}

function odWebhookSecret(): string | null {
  return process.env.ORDERDESK_WEBHOOK_SECRET?.trim() || null;
}

// ─── Routing: SKU → fulfillment partner ──────────────────────────────
// Today's rule is simple: every physical SKU routes to the *first*
// active fulfillment_partner unless the order already has an operator
// override (admin set `fulfillment_partner_id` from the orders detail
// view). When multiple partners exist we leave choosing the right one
// to the operator — the foundation is here for an album→partner map.
async function pickFulfillmentPartner(order: Order): Promise<string | null> {
  if (order.fulfillmentPartnerId) return order.fulfillmentPartnerId;
  const [first] = await db.select().from(fulfillmentPartners).limit(1);
  return first?.id ?? null;
}

// ─── SKU classification ──────────────────────────────────────────────
// Coarse skuKind values surfaced to Stripe's dashboard + reporting.
// Album SKU formats currently: 7_inch / 12_lp / 12_double / cassette / cd.
export function classifySkuKind(format: string | null | undefined): string {
  if (!format) return "digital";
  if (format === "cassette") return "cassette";
  if (format === "cd") return "cd";
  if (format.startsWith("7_") || format.startsWith("12_")) return "vinyl";
  // Shopify-bundled physical SKUs come in as "shopify:<id>" — treat as vinyl
  // by default (labels overwhelmingly use Shopify for vinyl).
  if (format.startsWith("shopify:")) return "vinyl";
  return format;
}

export function isPhysicalSkuKind(kind: string | null | undefined): boolean {
  return kind === "vinyl" || kind === "cassette" || kind === "cd" || kind === "bundle";
}

// ─── Order Desk API client ───────────────────────────────────────────
// Thin wrapper around POST/PUT to app.orderdesk.me/api/v2/. We only
// hit POST /orders today — refunds and re-submits land in a later task.
const OD_BASE = "https://app.orderdesk.me/api/v2";

async function odFetch(path: string, init: RequestInit = {}): Promise<any> {
  const creds = odCreds();
  if (!creds) throw new Error("Order Desk credentials not configured");
  const res = await fetch(`${OD_BASE}${path}`, {
    ...init,
    headers: {
      "ORDERDESK-STORE-ID": creds.storeId,
      "ORDERDESK-API-KEY": creds.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok || (body && body.status === "error")) {
    const msg = body?.message ?? `Order Desk ${path} failed: HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

// Build the OD order payload from our internal order row + items.
function buildOdPayload(args: {
  order: Order;
  items: { kind: string; sku: string; label: string; unitPriceCents: number; quantity: number }[];
  album: { id: string; title: string; artist: string };
  customer: { email: string | null };
  partnerId: string | null;
}) {
  const ship = (args.order.shippingAddress ?? null) as StripeAddressSnapshot | null;
  return {
    // OD treats source_id as the merchant's own order id — the back-
    // reference investors / operators look for when reconciling.
    source_name: args.order.origin?.startsWith("shopify:") ? "Shopify" : "GoodTunes",
    source_id: args.order.id,
    email: args.customer.email ?? args.order.buyerEmail ?? "",
    shipping: {
      first_name: ship?.name?.split(" ").slice(0, -1).join(" ") || ship?.name || "",
      last_name: ship?.name?.split(" ").slice(-1).join(" ") || "",
      address1: ship?.line1 ?? "",
      address2: ship?.line2 ?? "",
      city: ship?.city ?? "",
      state: ship?.state ?? "",
      postal_code: ship?.postalCode ?? "",
      country: ship?.country ?? "US",
      phone: args.order.buyerPhone ?? "",
    },
    order_items: args.items.map((it) => ({
      name: it.label,
      code: it.sku,
      price: it.unitPriceCents / 100,
      quantity: it.quantity,
      metadata: { gt_kind: it.kind },
    })),
    order_metadata: {
      gt_order_id: args.order.id,
      gt_album_id: args.album.id,
      gt_album_title: args.album.title,
      gt_artist: args.album.artist,
      gt_artist_id: args.order.artistSnapshotId ?? "",
      gt_label_id: args.order.labelSnapshotId ?? "",
      gt_sku_kind: args.order.skuKind ?? "",
      gt_good_deed_number: args.order.goodDeedNumber != null ? String(args.order.goodDeedNumber) : "",
      gt_fulfillment_partner_id: args.partnerId ?? "",
      gt_origin: args.order.origin ?? "direct",
    },
  };
}

// Public entry point: hand a paid physical order off to Order Desk.
// Idempotent on `orderDeskOrderId` — a second call no-ops with the
// stored OD id. Failure leaves the order in `pending` state so the
// admin can retry from the operator dashboard.
export async function pushOrderToOrderDesk(orderId: string): Promise<{
  ok: boolean;
  orderDeskOrderId?: string;
  error?: string;
}> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { ok: false, error: "Order not found" };
  if (order.orderDeskOrderId) return { ok: true, orderDeskOrderId: order.orderDeskOrderId };
  if (!isPhysicalSkuKind(order.skuKind)) return { ok: true }; // digital — no handoff

  if (!odCreds()) {
    console.warn(`[orderdesk] credentials not configured — skipping handoff for order ${orderId}`);
    return { ok: false, error: "Order Desk credentials not configured" };
  }

  const [album] = await db.select().from(albums).where(eq(albums.id, order.albumId));
  if (!album) return { ok: false, error: "Album not found" };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const [customer] = await db.select().from(customerUsers).where(eq(customerUsers.id, order.customerId));

  const partnerId = await pickFulfillmentPartner(order);
  const payload = buildOdPayload({
    order,
    items: items.map((i) => ({ kind: i.kind, sku: i.sku, label: i.label, unitPriceCents: i.unitPriceCents, quantity: i.quantity })),
    album: { id: album.id, title: album.title, artist: album.artist },
    customer: { email: customer?.email ?? null },
    partnerId,
  });

  try {
    const body = await odFetch("/orders", { method: "POST", body: JSON.stringify(payload) });
    const odId: string | undefined = body?.order?.id ? String(body.order.id) : body?.id ? String(body.id) : undefined;
    if (!odId) throw new Error("Order Desk returned no order id");
    await db
      .update(orders)
      .set({
        orderDeskOrderId: odId,
        fulfillmentPartnerId: partnerId,
        fulfillmentStatus: "submitted",
        submittedToFulfillmentAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    return { ok: true, orderDeskOrderId: odId };
  } catch (e: any) {
    console.error(`[orderdesk] push failed for order ${orderId}`, e?.message);
    // Leave the order in "pending" so the admin retry button surfaces.
    await db
      .update(orders)
      .set({ fulfillmentStatus: "pending" })
      .where(eq(orders.id, order.id));
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ─── Webhook handler ─────────────────────────────────────────────────
// Mounted in server/routes.ts on POST /api/webhooks/orderdesk. Body is
// raw bytes (express.raw in server/index.ts) so we can HMAC-verify the
// X-Orderdesk-Signature header before parsing. Idempotent via the
// order_desk_webhook_events table (PK on event id).

function verifyOdSignature(rawBody: Buffer, headerSig: string | undefined): boolean {
  const secret = odWebhookSecret();
  if (!secret) {
    // Dev fallback only — match the Stripe webhook posture.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[orderdesk-webhook] DEV: accepting unsigned payload (no secret configured)");
      return true;
    }
    return false;
  }
  if (!headerSig) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const sig = headerSig.replace(/^sha256=/, "").trim();
  let b: Buffer;
  try {
    b = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Map an OD status / event_type into our fulfillment_status + the
// timestamp column to set.
function mapOdStatus(eventType: string, folderName?: string | null): {
  status: string;
  tsColumn: keyof typeof orders.$inferSelect | null;
} | null {
  const t = (eventType || "").toLowerCase();
  const f = (folderName || "").toLowerCase();
  if (t.includes("ship") || f.includes("shipped")) return { status: "shipped", tsColumn: "shippedAt" };
  if (t.includes("deliver") || f.includes("delivered")) return { status: "delivered", tsColumn: "deliveredAt" };
  if (t.includes("cancel") || f.includes("cancel")) return { status: "cancelled", tsColumn: "cancelledAt" };
  if (t.includes("return") || f.includes("return")) return { status: "returned", tsColumn: "returnedAt" };
  if (t.includes("fulfill") || f.includes("processing") || f.includes("printed") || f.includes("picking")) {
    return { status: "in_fulfillment", tsColumn: "inFulfillmentAt" };
  }
  return null;
}

export function registerOrderDeskRoutes(app: Express) {
  // POST /api/webhooks/orderdesk — Order Desk's outbound webhook.
  // The raw-body parser is mounted in server/index.ts.
  app.post("/api/webhooks/orderdesk", async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from("");
    const sig =
      (req.headers["x-orderdesk-signature"] as string | undefined) ??
      (req.headers["x-order-desk-signature"] as string | undefined);
    if (!verifyOdSignature(raw, sig)) {
      console.error("[orderdesk-webhook] signature verification failed");
      return res.status(400).json({ message: "Invalid signature" });
    }

    let payload: any;
    try {
      payload = JSON.parse(raw.toString("utf8") || "{}");
    } catch (e: any) {
      return res.status(400).json({ message: "Invalid JSON" });
    }

    // OD's webhook payload varies by version but always carries some
    // identifier for the event and the order. Accept several shapes.
    const eventId: string | undefined =
      payload?.event_id || payload?.id || payload?.event?.id || payload?.webhook_id;
    const eventType: string =
      payload?.event_type || payload?.event || payload?.action || "update";
    const odOrder = payload?.order ?? payload?.data ?? payload;
    const odOrderId: string | undefined =
      odOrder?.id ? String(odOrder.id) : payload?.order_id ? String(payload.order_id) : undefined;
    const sourceId: string | undefined = odOrder?.source_id || odOrder?.order_metadata?.gt_order_id;

    if (!eventId) {
      // OD sometimes posts test pings without an event id — accept but no-op.
      return res.json({ received: true, skipped: "no event id" });
    }

    // Idempotency: insert; if event already seen, return early.
    const inserted = await db
      .insert(orderDeskWebhookEvents)
      .values({ eventId, eventType, orderId: null })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      return res.json({ received: true, deduped: true });
    }

    // Locate our internal order row. Prefer the OD order id (we wrote
    // it on push); fall back to source_id (which is our order.id).
    let order: Order | undefined;
    if (odOrderId) {
      [order] = await db.select().from(orders).where(eq(orders.orderDeskOrderId, odOrderId));
    }
    if (!order && sourceId) {
      [order] = await db.select().from(orders).where(eq(orders.id, sourceId));
    }
    if (!order) {
      console.warn(`[orderdesk-webhook] event ${eventId} matched no order (od=${odOrderId}, src=${sourceId})`);
      return res.json({ received: true, unmatched: true });
    }

    // Backfill the event-to-order link now that we know the order id.
    await db
      .update(orderDeskWebhookEvents)
      .set({ orderId: order.id })
      .where(eq(orderDeskWebhookEvents.eventId, eventId));

    const folderName: string | null = odOrder?.folder_name ?? odOrder?.folder ?? null;
    const mapped = mapOdStatus(eventType, folderName);
    const carrier: string | null = odOrder?.shipment?.carrier_code ?? odOrder?.carrier ?? null;
    const trackingNumber: string | null =
      odOrder?.shipment?.tracking_number ?? odOrder?.tracking_number ?? null;
    const trackingUrl: string | null =
      odOrder?.shipment?.tracking_url ?? odOrder?.tracking_url ?? null;

    const patch: Record<string, any> = { fulfillmentRaw: { eventId, eventType, folderName, carrier, trackingNumber, trackingUrl } };
    if (mapped) {
      patch.fulfillmentStatus = mapped.status;
      if (mapped.tsColumn && !(order as any)[mapped.tsColumn]) {
        patch[mapped.tsColumn as string] = new Date();
      }
    }
    if (carrier) patch.carrier = carrier;
    if (trackingNumber) patch.trackingNumber = trackingNumber;
    if (trackingUrl) patch.trackingUrl = trackingUrl;
    // OD's `shipped` event is also where we flip the legacy `status` to
    // "shipped" so the existing admin payout/ship pipeline triggers.
    if (mapped?.status === "shipped" && order.status === "paid") {
      patch.status = "shipped";
    }

    await db.update(orders).set(patch).where(eq(orders.id, order.id));

    // Best-effort: when OD reports shipped, trigger the Connect payout
    // attempt the legacy admin /ship endpoint runs. Failure is logged
    // but never blocks the webhook response — Order Desk retries
    // non-2xx responses indefinitely.
    if (mapped?.status === "shipped" && order.status === "paid") {
      try {
        const [refreshed] = await db.select().from(orders).where(eq(orders.id, order.id));
        const { attemptTransferForOrder } = await import("./payouts");
        await attemptTransferForOrder(refreshed);
      } catch (e: any) {
        console.error(`[orderdesk-webhook] payout attempt failed for ${order.id}`, e?.message);
      }
    }

    res.json({ received: true });
  });

  // ─── Admin order detail (Task #73, step 6) ──────────────────────
  // GET /api/admin/orders/:id — full lifecycle for the operator
  // dashboard. Returns the order row, items, gift row (if any), the
  // matched fulfillment partner, and the dedupe ledger so the admin
  // can see every OD event we've received for this order.
  // Admin gate is applied via the same requireAdmin pattern commerce.ts
  // uses — storage is imported lazily-via-Promise so this module stays
  // free of a top-level dep on storage's transitive imports.
  const storagePromise = import("./storage").then((m) => m.storage);
  app.get("/api/admin/orders/:id", async (req, res, next) => {
    const storage = await storagePromise;
    // Mirror the commerce.ts requireAdmin posture inline so we don't
    // have to refactor route registration order.
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") return res.status(401).json({ message: "Admin only" });
    next();
  }, async (req, res) => {
    const id = String(req.params.id);
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return res.status(404).json({ message: "Order not found" });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const [album] = await db.select().from(albums).where(eq(albums.id, order.albumId));
    const [customer] = await db.select().from(customerUsers).where(eq(customerUsers.id, order.customerId));
    let partner = null as any;
    if (order.fulfillmentPartnerId) {
      const [p] = await db.select().from(fulfillmentPartners).where(eq(fulfillmentPartners.id, order.fulfillmentPartnerId));
      partner = p ?? null;
    }
    const events = await db
      .select()
      .from(orderDeskWebhookEvents)
      .where(eq(orderDeskWebhookEvents.orderId, id))
      .orderBy(sql`received_at desc`);
    res.json({
      order,
      items,
      album: album ? { id: album.id, title: album.title, artist: album.artist, artwork: album.artwork } : null,
      customer: customer ? { id: customer.id, email: customer.email, displayName: customer.displayName, realName: customer.realName } : null,
      fulfillmentPartner: partner,
      orderDeskEvents: events,
    });
  });

  // PATCH /api/admin/orders/:id/fulfillment-partner — operator override
  // for the warehouse on a single order. Required when the default
  // routing rule doesn't fit (rush ship, regional partner, etc.).
  app.patch("/api/admin/orders/:id/fulfillment-partner", async (req, res) => {
    const storage = await storagePromise;
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") return res.status(401).json({ message: "Admin only" });
    const id = String(req.params.id);
    const partnerId: string | null = req.body?.fulfillmentPartnerId ?? null;
    if (partnerId !== null) {
      const [p] = await db.select().from(fulfillmentPartners).where(eq(fulfillmentPartners.id, partnerId));
      if (!p) return res.status(400).json({ message: "Unknown fulfillment partner" });
    }
    const [updated] = await db
      .update(orders)
      .set({ fulfillmentPartnerId: partnerId })
      .where(eq(orders.id, id))
      .returning();
    res.json(updated);
  });

  // POST /api/admin/orders/:id/orderdesk-push — manual retry button
  // when an earlier handoff failed (creds missing, OD 5xx, etc).
  app.post("/api/admin/orders/:id/orderdesk-push", async (req, res) => {
    const storage = await storagePromise;
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") return res.status(401).json({ message: "Admin only" });
    const result = await pushOrderToOrderDesk(String(req.params.id));
    if (!result.ok) return res.status(502).json(result);
    res.json(result);
  });
}
