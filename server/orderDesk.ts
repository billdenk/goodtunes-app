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
import { eq, sql, isNull } from "drizzle-orm";
import {
  orders,
  orderItems,
  orderCopies,
  albums,
  customerUsers,
  fulfillmentPartners,
  albumFulfillmentSplits,
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

// Whether a paid physical order should *automatically* hand off to Order
// Desk the moment it's paid. Default OFF: the real GoodTunes flow aggregates
// fan orders, asks the artist to confirm the press run quantity, places ONE
// order with the chosen press, and only THEN does fulfillment routing matter.
// Auto-pushing every individual fan order would make the fulfillment partner
// (e.g. Spinney) think they must fulfill each order before anything is even
// printed. With this off, the integration stays fully wired + credentialed
// and the operator pushes deliberately via the admin retry button; flip
// ORDERDESK_AUTO_PUSH on once the release-level fulfillment workflow exists.
export function orderDeskAutoPushEnabled(): boolean {
  const v = process.env.ORDERDESK_AUTO_PUSH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

// ─── Routing: SKU → fulfillment partner ──────────────────────────────
// Routing rule (deterministic, in priority order):
//   1. Per-order operator override (`fulfillment_partner_id` on the order).
//   2. Task #2670 — per-album split shipments table. When splits exist the
//      first partner-kind split row wins (manufacturer/custom destinations are
//      an operator display concept; OD routing resolves to a partner id only).
//   3. Task #1918 — per-album override (`albums.fulfillment_partner_id`).
//   4. First fulfillment_partner with `is_default = true`.
//   5. First fulfillment_partner row (fallback when no default is set yet).
// Returns ALL live partner-kind split destinations for an album, in sort
// order. Each entry corresponds to one Order Desk routing payload when
// pushing a multi-split order. Non-partner splits (manufacturer self-fulfill,
// custom address) are excluded — they have no OD account to receive.
// Returns an empty array when no partner-kind splits are configured.
// Returns true when the album has ANY fulfillment split rows configured
// (regardless of kind). Used to enforce split precedence: when splits
// exist they take precedence over legacy single-destination routing, even
// if none of them are partner-kind (OD/Odoo can't push to a manufacturer
// or custom address — the operator routes those outside OD/Odoo).
export async function hasAnySplitsForAlbum(albumId: string): Promise<boolean> {
  const row = await db
    .select({ id: albumFulfillmentSplits.id })
    .from(albumFulfillmentSplits)
    .where(sql`${albumFulfillmentSplits.albumId} = ${albumId}`)
    .limit(1);
  return row.length > 0;
}

export async function pickAllFulfillmentPartners(albumId: string): Promise<
  Array<{ partnerId: string; quantity: number | null; notes: string | null }>
> {
  const splits = await db
    .select({
      fulfillmentPartnerId: albumFulfillmentSplits.fulfillmentPartnerId,
      quantity: albumFulfillmentSplits.quantity,
      notes: albumFulfillmentSplits.notes,
    })
    .from(albumFulfillmentSplits)
    .where(
      sql`${albumFulfillmentSplits.albumId} = ${albumId}
        AND ${albumFulfillmentSplits.fulfillmentPartnerId} IS NOT NULL`,
    )
    .orderBy(sql`${albumFulfillmentSplits.sortOrder} ASC, ${albumFulfillmentSplits.createdAt} ASC`);

  const result: Array<{ partnerId: string; quantity: number | null; notes: string | null }> = [];
  for (const split of splits) {
    if (!split.fulfillmentPartnerId) continue;
    const live = await db
      .select({ id: fulfillmentPartners.id })
      .from(fulfillmentPartners)
      .where(
        sql`${fulfillmentPartners.id} = ${split.fulfillmentPartnerId} AND ${fulfillmentPartners.deletedAt} IS NULL`,
      )
      .limit(1);
    if (live[0]?.id) {
      result.push({
        partnerId: live[0].id,
        quantity: split.quantity ?? null,
        notes: split.notes ?? null,
      });
    }
  }
  return result;
}

export async function pickFulfillmentPartner(order: Order): Promise<string | null> {
  if (order.fulfillmentPartnerId) return order.fulfillmentPartnerId;
  if (order.albumId) {
    // Task #2670 — check album_fulfillment_splits first. Only partner-kind
    // splits carry an OD-routable fulfillment_partner_id. Non-partner splits
    // (manufacturer self-fulfill, custom address) are handled outside OD
    // and are skipped here so we fall through to the per-album override or
    // the platform default.
    // Task #2670 — iterate ALL partner-kind splits in sort order and
    // return the first one that resolves to a live fulfillment partner.
    // Manufacturer and custom-address splits are not OD-routable and are
    // skipped here; the caller (operator push UI) handles them separately.
    const splits = await db
      .select({
        fulfillmentPartnerId: albumFulfillmentSplits.fulfillmentPartnerId,
      })
      .from(albumFulfillmentSplits)
      .where(
        sql`${albumFulfillmentSplits.albumId} = ${order.albumId}
          AND ${albumFulfillmentSplits.fulfillmentPartnerId} IS NOT NULL`,
      )
      .orderBy(sql`${albumFulfillmentSplits.sortOrder} ASC, ${albumFulfillmentSplits.createdAt} ASC`);
    for (const split of splits) {
      if (!split.fulfillmentPartnerId) continue;
      const live = await db
        .select({ id: fulfillmentPartners.id })
        .from(fulfillmentPartners)
        .where(
          sql`${fulfillmentPartners.id} = ${split.fulfillmentPartnerId} AND ${fulfillmentPartners.deletedAt} IS NULL`,
        )
        .limit(1);
      if (live[0]?.id) return live[0].id;
    }

    // Task #1918 — per-album single-destination override.
    const albumRows = await db
      .select({ fulfillmentPartnerId: albums.fulfillmentPartnerId })
      .from(albums)
      .where(eq(albums.id, order.albumId))
      .limit(1);
    const albumPartnerId = albumRows[0]?.fulfillmentPartnerId ?? null;
    if (albumPartnerId) {
      const live = await db
        .select({ id: fulfillmentPartners.id })
        .from(fulfillmentPartners)
        .where(
          sql`${fulfillmentPartners.id} = ${albumPartnerId} AND ${fulfillmentPartners.deletedAt} IS NULL`,
        )
        .limit(1);
      if (live[0]?.id) return live[0].id;
    }
  }
  const rows = await db
    .select({ id: fulfillmentPartners.id, isDefault: fulfillmentPartners.isDefault })
    .from(fulfillmentPartners)
    // Never route to a soft-deleted (trashed) partner — only live rows.
    .where(isNull(fulfillmentPartners.deletedAt))
    .orderBy(sql`is_default DESC, created_at ASC`);
  return rows[0]?.id ?? null;
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

// Task #2814 — test-run guard. On June 3–4 2026 the paid-checkout tests
// pushed hundreds of fake "Test Fan" orders into the REAL Order Desk store
// (auto-push was on and the workspace carries live credentials). Auto-push
// is now off by default, but this guard makes the failure structurally
// impossible: any test run — the `test` workflow sets GT_TEST=1, and we
// also detect Node's test runner directly — is refused at the single HTTP
// choke point below, covering auto-push, manual push, and every future
// call site. Operator scripts run outside the test runner (plain `tsx
// script.ts`, no GT_TEST) and are unaffected. Do NOT rely on NODE_ENV:
// it is never set to "test" here.
export function isTestRun(): boolean {
  if (process.env.GT_TEST?.trim()) return true;
  // Node's built-in test runner marks spawned test processes.
  if (process.env.NODE_TEST_CONTEXT) return true;
  if (process.execArgv.some((a) => a === "--test" || a.startsWith("--test-"))) return true;
  return false;
}

async function odFetch(path: string, init: RequestInit = {}): Promise<any> {
  if (isTestRun()) {
    throw new Error(
      "[orderdesk] blocked: refusing to call the live Order Desk API from a test run (GT_TEST / node --test detected)",
    );
  }
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
    const errMsg = "Order Desk credentials not configured";
    console.warn(`[orderdesk] credentials not configured — skipping handoff for order ${orderId}`);
    // Record the error so the most common failure mode (no credentials yet)
    // is visible on the admin order row instead of failing silently.
    await db
      .update(orders)
      .set({ fulfillmentStatus: "pending", fulfillmentError: errMsg })
      .where(eq(orders.id, order.id));
    return { ok: false, error: errMsg };
  }

  const [album] = await db.select().from(albums).where(eq(albums.id, order.albumId));
  if (!album) return { ok: false, error: "Album not found" };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const [customer] = await db.select().from(customerUsers).where(eq(customerUsers.id, order.customerId));

  const mappedItems = items.map((i) => ({
    kind: i.kind,
    sku: i.sku,
    label: i.label,
    unitPriceCents: i.unitPriceCents,
    quantity: i.quantity,
  }));
  const albumInfo = { id: album.id, title: album.title, artist: album.artist };
  const customerInfo = { email: customer?.email ?? null };

  // Task #2670 — multi-split routing: when the album has partner-kind splits,
  // push one Order Desk order per split destination so each warehouse receives
  // its own routable payload (with per-split allocation in the metadata).
  // Non-partner splits (manufacturer self-fulfill, custom address) have no OD
  // account and are skipped here; the operator handles them outside OD.
  // Split precedence: if ANY split rows exist, don't fall back to legacy
  // single-destination routing — even if none are partner-kind (the operator
  // routes manufacturer/custom splits outside OD).
  const hasAnySplits = order.albumId ? await hasAnySplitsForAlbum(order.albumId) : false;
  const splitPartners = order.albumId ? await pickAllFulfillmentPartners(order.albumId) : [];

  if (hasAnySplits && splitPartners.length === 0) {
    // All splits are non-partner (manufacturer/custom). OD has no account for
    // these — the operator routes them outside OD. Return ok so the push
    // isn't retried; the operator sees the reason in the UI.
    log(`[orderdesk] order ${orderId}: splits configured but none are OD-routable (manufacturer/custom only); skipping OD push`);
    await db
      .update(orders)
      .set({ fulfillmentStatus: "pending", fulfillmentError: "Splits are non-OD destinations (manufacturer/custom) — route manually" })
      .where(eq(orders.id, order.id));
    return { ok: true, orderDeskOrderId: undefined };
  }

  if (splitPartners.length > 0) {
    let firstOdId: string | undefined;
    let firstPartnerId: string | undefined;
    const errors: string[] = [];

    for (const split of splitPartners) {
      const splitPayload = buildOdPayload({
        order,
        items: mappedItems,
        album: albumInfo,
        customer: customerInfo,
        partnerId: split.partnerId,
      });
      // Annotate each split's allocation so the warehouse knows its portion.
      if (split.quantity != null) {
        splitPayload.order_metadata.gt_split_quantity = String(split.quantity);
      }
      if (split.notes) {
        splitPayload.order_metadata.gt_split_notes = split.notes;
      }
      try {
        const body = await odFetch("/orders", { method: "POST", body: JSON.stringify(splitPayload) });
        const odId: string | undefined = body?.order?.id
          ? String(body.order.id)
          : body?.id
            ? String(body.id)
            : undefined;
        if (!odId) {
          errors.push(`No OD id returned for partner ${split.partnerId}`);
          continue;
        }
        if (!firstOdId) {
          firstOdId = odId;
          firstPartnerId = split.partnerId;
        }
      } catch (e: any) {
        errors.push(e?.message ?? String(e));
      }
    }

    if (!firstOdId) {
      const errMsg = errors.join("; ") || "All split pushes failed";
      console.error(`[orderdesk] multi-split push failed for order ${orderId}`, errMsg);
      await db
        .update(orders)
        .set({ fulfillmentStatus: "pending", fulfillmentError: errMsg })
        .where(eq(orders.id, order.id));
      return { ok: false, error: errMsg };
    }

    await db
      .update(orders)
      .set({
        orderDeskOrderId: firstOdId,
        fulfillmentPartnerId: firstPartnerId ?? null,
        fulfillmentStatus: "submitted",
        submittedToFulfillmentAt: new Date(),
        fulfillmentError: null,
      })
      .where(eq(orders.id, order.id));
    return { ok: true, orderDeskOrderId: firstOdId };
  }

  // ── Single-destination path (no partner-kind splits configured) ────────────
  const partnerId = await pickFulfillmentPartner(order);
  const payload = buildOdPayload({
    order,
    items: mappedItems,
    album: albumInfo,
    customer: customerInfo,
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
        fulfillmentError: null, // clear any previous error on success
      })
      .where(eq(orders.id, order.id));
    return { ok: true, orderDeskOrderId: odId };
  } catch (e: any) {
    const errMsg: string = e?.message ?? String(e);
    console.error(`[orderdesk] push failed for order ${orderId}`, errMsg);
    // Leave the order in "pending" and record the error so the operator
    // can see exactly why without opening logs (cleared on the next
    // successful push).
    await db
      .update(orders)
      .set({ fulfillmentStatus: "pending", fulfillmentError: errMsg })
      .where(eq(orders.id, order.id));
    return { ok: false, error: errMsg };
  }
}

// ─── Fan shipping-confirmation email ─────────────────────────────────
// Mirrors commerce.ts fanOrigin(): APP_URL wins, else GOODTUNES_HOST,
// else the default app subdomain. Used to build the "Your album" deep
// link in the shipping email.
function fanOrigin(): string {
  const explicit = (process.env.APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = (process.env.GOODTUNES_HOST || "my.goodtunes.music").trim();
  return `https://${host}`;
}

// Gather the recipient + payload and dispatch the single branded
// shipping-confirmation email. Best-effort: resolves a recipient,
// pulls the GoodDeed number(s), and hands off to the shared Resend
// transport (synthetic-recipient guard + failure ring buffer +
// never-throws). The one-time guarantee lives at the call site (only
// invoked on the first transition to shipped). Physical orders only —
// digital-only orders never ship a carton.
export async function dispatchShippingEmail(
  order: Order,
  tracking: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null },
): Promise<void> {
  if (!isPhysicalSkuKind(order.skuKind)) return; // digital — nothing ships
  // Task #2428 — a Shopify+ order sells on the customer's OWN Shopify, which
  // sends its own shipping notification. GoodTunes is not the seller, so we
  // never send a GoodTunes-branded shipping email for these.
  if (order.origin?.startsWith("shopify_plus:")) return;

  // Recipient: prefer the Stripe-collected buyer email, fall back to
  // the customer row's account email (same posture as the receipt).
  let toEmail = (order.buyerEmail || "").trim();
  if (!toEmail) {
    const [cust] = await db
      .select({ email: customerUsers.email })
      .from(customerUsers)
      .where(eq(customerUsers.id, order.customerId));
    toEmail = (cust?.email || "").trim();
  }
  if (!toEmail) {
    console.warn(`[orderdesk-webhook] order ${order.id} has no email for shipping confirmation`);
    return;
  }

  const [album] = await db.select().from(albums).where(eq(albums.id, order.albumId));

  // GoodDeed number(s): prefer the per-copy ledger (multi-quantity
  // orders fan out into order_copies), fall back to the order-level
  // number for legacy single-copy rows.
  const copies = await db
    .select({ goodDeedNumber: orderCopies.goodDeedNumber })
    .from(orderCopies)
    .where(eq(orderCopies.orderId, order.id))
    .orderBy(orderCopies.position);
  let goodDeedNumbers = copies
    .map((c) => c.goodDeedNumber)
    .filter((n): n is number => n != null);
  if (goodDeedNumbers.length === 0 && order.goodDeedNumber != null) {
    goodDeedNumbers = [order.goodDeedNumber];
  }

  const { sendOrderShippedEmail } = await import("./mail");
  await sendOrderShippedEmail(toEmail, {
    albumTitle: album?.title ?? "Your GoodTunes album",
    albumArtist: album?.artist ?? "",
    artworkUrl: album?.artwork ?? null,
    carrier: tracking.carrier,
    trackingNumber: tracking.trackingNumber,
    trackingUrl: tracking.trackingUrl,
    goodDeedNumbers,
    webPlayUrl: `${fanOrigin()}/album/${order.albumId}`,
    // Task #2703 — customer-facing shipper identity. Fans see the album's
    // shipper display name (operator-set), never the real fulfillment
    // company; blank means the platform default, "GoodTunes".
    shippedBy: album?.shipperDisplayName?.trim() || "GoodTunes",
  });
}

// ─── On-demand status pull (Task #2818) ─────────────────────────────
// The webhook stays the primary channel; this GET-based pull is the
// on-demand complement (admin "Refresh from Order Desk" button + a
// best-effort scheduled poll for orders sitting in submitted /
// in_fulfillment). Idempotent with the webhook: both funnel through the
// same status mapping and the same first-ship guards (timestamps only
// stamp when previously null; the shipping email only fires on the
// first transition to shipped).

// Read one order out of Order Desk. Returns the OD order object or null
// when it can't be found / creds unset.
export async function getOrderDeskOrder(odOrderId: string): Promise<any | null> {
  if (!odCreds()) return null;
  try {
    const body = await odFetch(`/orders/${encodeURIComponent(odOrderId)}`, { method: "GET" });
    return body?.order ?? null;
  } catch (e: any) {
    console.warn(`[orderdesk-pull] GET order ${odOrderId} failed: ${e?.message ?? e}`);
    return null;
  }
}

// Reconcile a fresh OD snapshot onto our order row. Mirrors the webhook
// patch logic exactly (status mapping, tracking, legacy status flip,
// payout attempt, first-ship email) so pull and push channels can never
// disagree. Returns true when a status transition was applied.
export async function refreshOrderFromOrderDesk(orderId: string): Promise<{
  ok: boolean;
  changed: boolean;
  error?: string;
  odOrder?: any;
}> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { ok: false, changed: false, error: "Order not found" };
  if (!order.orderDeskOrderId) return { ok: false, changed: false, error: "Order was never pushed to Order Desk" };
  if (!odCreds()) return { ok: false, changed: false, error: "Order Desk credentials not configured" };

  const odOrder = await getOrderDeskOrder(order.orderDeskOrderId);
  if (!odOrder) return { ok: false, changed: false, error: "Order Desk order not found" };

  const folderName: string | null = odOrder?.folder_name ?? odOrder?.folder ?? null;
  // Pull has no event type — the folder is the source of truth for state.
  const mapped = mapOdStatus("", folderName);
  // OD v2 orders carry shipments as an array; accept the webhook's
  // singular `shipment` shape too for safety.
  const shipment =
    (Array.isArray(odOrder?.shipments) && odOrder.shipments.length > 0
      ? odOrder.shipments[odOrder.shipments.length - 1]
      : null) ?? odOrder?.shipment ?? null;
  const carrier: string | null = shipment?.carrier_code ?? odOrder?.carrier ?? null;
  const trackingNumber: string | null = shipment?.tracking_number ?? odOrder?.tracking_number ?? null;
  const trackingUrl: string | null = shipment?.tracking_url ?? odOrder?.tracking_url ?? null;

  const patch: Record<string, any> = {
    fulfillmentRaw: { source: "od-pull", odOrderId: order.orderDeskOrderId, folderName, carrier, trackingNumber, trackingUrl, pulledAt: new Date().toISOString() },
  };
  if (mapped) {
    patch.fulfillmentStatus = mapped.status;
    if (mapped.tsColumn && !(order as any)[mapped.tsColumn]) {
      patch[mapped.tsColumn as string] = new Date();
    }
  }
  if (carrier) patch.carrier = carrier;
  if (trackingNumber) patch.trackingNumber = trackingNumber;
  if (trackingUrl) patch.trackingUrl = trackingUrl;
  if (mapped?.status === "shipped" && order.status === "paid") {
    patch.status = "shipped";
  }
  const isFirstShipTransition = mapped?.status === "shipped" && !order.shippedAt;

  await db.update(orders).set(patch).where(eq(orders.id, order.id));

  if (mapped?.status === "shipped" && order.status === "paid") {
    try {
      const [refreshed] = await db.select().from(orders).where(eq(orders.id, order.id));
      const { attemptTransferForOrder } = await import("./payouts");
      await attemptTransferForOrder(refreshed);
    } catch (e: any) {
      console.error(`[orderdesk-pull] payout attempt failed for ${order.id}`, e?.message);
    }
  }

  if (isFirstShipTransition) {
    try {
      await dispatchShippingEmail(order, {
        carrier: (patch.carrier as string | null) ?? order.carrier ?? null,
        trackingNumber: (patch.trackingNumber as string | null) ?? order.trackingNumber ?? null,
        trackingUrl: (patch.trackingUrl as string | null) ?? order.trackingUrl ?? null,
      });
    } catch (e: any) {
      console.error(`[orderdesk-pull] shipping email failed for ${order.id}`, e?.message);
    }
  }

  const changed = mapped != null && mapped.status !== order.fulfillmentStatus;
  return { ok: true, changed, odOrder };
}

// One poll pass: pull current OD state for every pushed-but-in-flight
// order (submitted / in_fulfillment). Terminal statuses are skipped —
// no further OD movement matters. No-ops cleanly when creds are unset.
export async function runOrderDeskStatusPoll(): Promise<number> {
  if (!odCreds()) return 0;
  const open = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      sql`${orders.orderDeskOrderId} IS NOT NULL
        AND (${orders.fulfillmentStatus} IS NULL OR ${orders.fulfillmentStatus} IN ('submitted','in_fulfillment'))`,
    )
    .limit(200);
  if (open.length === 0) return 0;
  let transitions = 0;
  for (const row of open) {
    try {
      const r = await refreshOrderFromOrderDesk(row.id);
      if (r.ok && r.changed) transitions++;
    } catch (e: any) {
      console.error(`[orderdesk-pull] poll sync failed for order ${row.id}`, e?.message);
    }
  }
  return transitions;
}

// In-process poll scheduler mirroring armOdooPollScheduler: delayed first
// tick, fixed interval, overlap guard. Arms unconditionally — every tick
// is a clean no-op while ORDERDESK_* creds are unset.
export function armOrderDeskPollScheduler() {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const n = await runOrderDeskStatusPoll();
      if (n > 0) console.log(`[orderdesk-pull] reconciled ${n} order(s) from Order Desk`);
    } catch (e: any) {
      console.error(`[orderdesk-pull] poll tick failed: ${e?.message ?? e}`);
    } finally {
      ticking = false;
    }
  };
  // First tick ~3min after boot (offset from the Odoo poll), then every 15min.
  setTimeout(tick, 180 * 1000);
  setInterval(tick, 15 * 60 * 1000);
  console.log(
    odCreds()
      ? "[orderdesk-pull] poll scheduler armed (15min tick)"
      : "[orderdesk-pull] poll scheduler armed (15min tick, idle — credentials unset)",
  );
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

    // Capture whether this webhook is the one that first stamps
    // `shipped_at` — the idempotent guard for the fan shipping email.
    // `order` was read before this update, so `!order.shippedAt` here
    // means the row had no ship timestamp until this event; the patch
    // above only sets shippedAt when it was previously null, so the two
    // stay in lock-step. A replayed/duplicate shipped event sees a
    // populated shippedAt and skips the send.
    const isFirstShipTransition = mapped?.status === "shipped" && !order.shippedAt;

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

    // Best-effort: email the fan a shipping confirmation the first time
    // an order transitions to shipped. Physical orders only; never blocks
    // the webhook response. Carrier/tracking come from `patch` (this
    // event) falling back to whatever was already on the row.
    if (isFirstShipTransition) {
      try {
        await dispatchShippingEmail(order, {
          carrier: (patch.carrier as string | null) ?? order.carrier ?? null,
          trackingNumber: (patch.trackingNumber as string | null) ?? order.trackingNumber ?? null,
          trackingUrl: (patch.trackingUrl as string | null) ?? order.trackingUrl ?? null,
        });
      } catch (e: any) {
        console.error(`[orderdesk-webhook] shipping email failed for ${order.id}`, e?.message);
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

  // POST /api/admin/orders/:id/orderdesk-refresh — Task #2818 on-demand
  // status pull. Idempotent with the webhook (same mapping + first-ship
  // guards); useful when a webhook was missed or the operator wants the
  // freshest OD state right now.
  app.post("/api/admin/orders/:id/orderdesk-refresh", async (req, res) => {
    const storage = await storagePromise;
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") return res.status(401).json({ message: "Admin only" });
    // Operator-only: partner accounts (fulfillment, press, label, …) also
    // authenticate as kind "admin", so gate on the resolved role. Fail
    // closed on a role-lookup error.
    try {
      const { getUserRole } = await import("./auth/roles");
      const info = await getUserRole(a.userId);
      if (!info || (info.role !== "super_admin" && info.role !== "admin")) {
        return res.status(403).json({ message: "Operator only" });
      }
    } catch {
      return res.status(403).json({ message: "Operator only" });
    }
    const result = await refreshOrderFromOrderDesk(String(req.params.id));
    if (!result.ok) return res.status(422).json({ message: result.error ?? "Refresh failed" });
    res.json({ ok: true, changed: result.changed });
  });
}
