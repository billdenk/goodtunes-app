// Task #1976 — Odoo printer integration. A second, deliberate fulfillment
// path that mirrors the Order Desk connector (server/orderDesk.ts): a paid
// physical order can be handed off to an Odoo ERP instance as a `sale.order`,
// and an in-process poll scheduler reads production/shipping status back out
// of Odoo, maps it onto our `fulfillment_status`, and fires the same fan
// shipping-confirmation email Order Desk does on the first "shipped".
//
// Unlike Order Desk (which pushes inbound webhooks), Odoo's webhook story is
// uneven across versions/editions, so we PULL status on a timer instead — the
// poll scheduler is the Odoo analogue of OD's webhook handler.
//
// Transport: Odoo JSON-RPC at `POST {ODOO_URL}/jsonrpc` (no extra dependency
// vs. the XML-RPC client — plain fetch + JSON). Two service calls:
//   - service "common", method "login"      → uid (authenticate)
//   - service "object", method "execute_kw" → ORM read/write/create
//
// Credentials live in env vars (no Replit connector exists for Odoo):
//   ODOO_URL      — base URL of the Odoo instance (e.g. https://acme.odoo.com)
//   ODOO_DB       — database name
//   ODOO_LOGIN    — user login (email)
//   ODOO_API_KEY  — API key (or password) for that login
//
// When ANY of these is unset (dev / not-yet-configured) the connector no-ops
// cleanly: pushes record a visible error on the order, the poll scheduler
// arms but every tick is a no-op. Live credentials are out of scope for this
// task — the integration is fully wired + documented and waits for the
// operator to provision them.

import type { Express } from "express";
import { db } from "./db";
import { eq, sql, isNull, and, isNotNull } from "drizzle-orm";
import {
  orders,
  orderItems,
  albums,
  customerUsers,
  fulfillmentPartners,
  type Order,
} from "@shared/schema";
import {
  pickFulfillmentPartner,
  dispatchShippingEmail,
  isPhysicalSkuKind,
} from "./orderDesk";
import { log } from "./log";

// ─── Env / config ────────────────────────────────────────────────────
type OdooCreds = { url: string; dbName: string; login: string; apiKey: string };

function odooCreds(): OdooCreds | null {
  const url = process.env.ODOO_URL?.trim().replace(/\/+$/, "");
  const dbName = process.env.ODOO_DB?.trim();
  const login = process.env.ODOO_LOGIN?.trim();
  const apiKey = process.env.ODOO_API_KEY?.trim();
  if (!url || !dbName || !login || !apiKey) return null;
  return { url, dbName, login, apiKey };
}

// ─── JSON-RPC client ─────────────────────────────────────────────────
// Thin wrapper around POST {url}/jsonrpc. Odoo wraps every response in a
// JSON-RPC envelope: `{ result }` on success, `{ error: { data: {...} } }`
// on failure (HTTP is 200 even for ORM errors), so we surface the inner
// error message rather than the HTTP status.
async function odooJsonRpc(
  creds: OdooCreds,
  service: string,
  method: string,
  args: any[],
): Promise<any> {
  const res = await fetch(`${creds.url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(`Odoo ${service}.${method} failed: HTTP ${res.status}`);
  }
  if (body?.error) {
    const msg =
      body.error?.data?.message ||
      body.error?.message ||
      `Odoo ${service}.${method} returned an error`;
    throw new Error(msg);
  }
  return body?.result;
}

// Authenticate and return the numeric uid. Odoo's `common.login` returns
// the uid (or false on bad credentials).
async function odooAuthenticate(creds: OdooCreds): Promise<number> {
  const uid = await odooJsonRpc(creds, "common", "login", [
    creds.dbName,
    creds.login,
    creds.apiKey,
  ]);
  if (!uid || typeof uid !== "number") {
    throw new Error("Odoo authentication failed (check ODOO_DB / ODOO_LOGIN / ODOO_API_KEY)");
  }
  return uid;
}

// Run an ORM call (create / read / search_read / write …) as the
// authenticated user. `object.execute_kw` args are positional:
//   [db, uid, password, model, method, args[], kwargs{}]
async function odooExecuteKw(
  creds: OdooCreds,
  uid: number,
  model: string,
  method: string,
  args: any[] = [],
  kwargs: Record<string, any> = {},
): Promise<any> {
  return odooJsonRpc(creds, "object", "execute_kw", [
    creds.dbName,
    uid,
    creds.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

// ─── Odoo printer designation ────────────────────────────────────────
// The single live fulfillment partner flagged `is_odoo_printer`. The PUT
// endpoint enforces at-most-one, but we still `limit(1)` defensively and
// only ever consider non-trashed rows (mirrors pickFulfillmentPartner).
export async function pickOdooPrinter(): Promise<string | null> {
  const rows = await db
    .select({ id: fulfillmentPartners.id })
    .from(fulfillmentPartners)
    .where(
      and(
        eq(fulfillmentPartners.isOdooPrinter, true),
        isNull(fulfillmentPartners.deletedAt),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

// ─── res.partner resolution ──────────────────────────────────────────
// Find an existing res.partner by email, else create a minimal one. The
// catalog/customer sync is out of scope, so we only carry enough to label
// the carton: name, email, and a flat shipping address.
async function resolveOdooPartner(
  creds: OdooCreds,
  uid: number,
  args: { email: string; name: string; order: Order },
): Promise<number> {
  if (args.email) {
    const found = await odooExecuteKw(
      creds,
      uid,
      "res.partner",
      "search",
      [[["email", "=", args.email]]],
      { limit: 1 },
    );
    if (Array.isArray(found) && found.length > 0) return found[0];
  }
  const ship = (args.order.shippingAddress ?? null) as any;
  const created = await odooExecuteKw(creds, uid, "res.partner", "create", [
    {
      name: args.name || args.email || "GoodTunes customer",
      email: args.email || false,
      phone: args.order.buyerPhone ?? false,
      street: ship?.line1 ?? false,
      street2: ship?.line2 ?? false,
      city: ship?.city ?? false,
      zip: ship?.postalCode ?? false,
      country_code: ship?.country ?? false,
    },
  ]);
  if (!created || typeof created !== "number") {
    throw new Error("Odoo res.partner create returned no id");
  }
  return created;
}

// ─── Push: create an Odoo sale.order ─────────────────────────────────
// Public entry point: hand a paid physical order off to Odoo. Idempotent
// on `odooOrderId` — a second call no-ops with the stored Odoo id.
// Failure leaves the order in `pending` and records the error (cleared on
// the next successful push) so the operator can see why without logs.
//
// Catalog/inventory sync is out of scope, so each order line is written as
// an Odoo "note" line (display_type:"line_note") carrying the human label —
// no product_id lookup, no stock movement. The carton's identity rides in
// `client_order_ref` (our order id) so the operator can reconcile.
export async function pushOrderToOdoo(orderId: string): Promise<{
  ok: boolean;
  odooOrderId?: string;
  error?: string;
}> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { ok: false, error: "Order not found" };
  if (order.odooOrderId) return { ok: true, odooOrderId: order.odooOrderId };
  if (!isPhysicalSkuKind(order.skuKind)) return { ok: true }; // digital — no handoff

  const creds = odooCreds();
  if (!creds) {
    const errMsg = "Odoo credentials not configured";
    console.warn(`[odoo] credentials not configured — skipping handoff for order ${orderId}`);
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

  // Routing: honor the precedence chain (per-order override → per-album →
  // default → first), then fall back to the designated Odoo printer when
  // nothing else resolves. Operational routing stays editable post-sale
  // (only fan-facing metadata respects the partner-permissions lock), so a
  // push can re-route even after the first sale.
  const partnerId = (await pickFulfillmentPartner(order)) ?? (await pickOdooPrinter());

  const shipName =
    (order.shippingAddress as any)?.name ||
    customer?.realName ||
    customer?.displayName ||
    "";
  const email = customer?.email ?? order.buyerEmail ?? "";

  try {
    const uid = await odooAuthenticate(creds);
    const odooPartnerId = await resolveOdooPartner(creds, uid, {
      email,
      name: shipName,
      order,
    });

    // Header note line carrying the GoodTunes back-reference, then one
    // note line per ordered item (label · qty · unit price).
    const orderLines: any[] = [
      [
        0,
        0,
        {
          display_type: "line_note",
          name: `GoodTunes order ${order.id} — ${album.artist} · ${album.title}`,
        },
      ],
      ...items.map((it) => [
        0,
        0,
        {
          display_type: "line_note",
          name: `${it.label} ×${it.quantity} — $${(it.unitPriceCents / 100).toFixed(2)} ea`,
        },
      ]),
    ];

    const created = await odooExecuteKw(creds, uid, "sale.order", "create", [
      {
        partner_id: odooPartnerId,
        client_order_ref: order.id,
        order_line: orderLines,
        note: `GoodDeed #${order.goodDeedNumber ?? "—"} · ${album.artist} — ${album.title}`,
      },
    ]);
    const odooId: string | undefined =
      created != null ? String(Array.isArray(created) ? created[0] : created) : undefined;
    if (!odooId) throw new Error("Odoo sale.order create returned no id");

    await db
      .update(orders)
      .set({
        odooOrderId: odooId,
        fulfillmentPartnerId: partnerId,
        fulfillmentStatus: "submitted",
        submittedToFulfillmentAt: new Date(),
        odooLastSyncedAt: new Date(),
        fulfillmentError: null, // clear any previous error on success
      })
      .where(eq(orders.id, order.id));
    return { ok: true, odooOrderId: odooId };
  } catch (e: any) {
    const errMsg: string = e?.message ?? String(e);
    console.error(`[odoo] push failed for order ${orderId}`, errMsg);
    await db
      .update(orders)
      .set({ fulfillmentStatus: "pending", fulfillmentError: errMsg })
      .where(eq(orders.id, order.id));
    return { ok: false, error: errMsg };
  }
}

// ─── Status mapping ──────────────────────────────────────────────────
// Map an Odoo sale.order state + delivery_status + picking state onto our
// fulfillment_status + the timestamp column to set. Mirrors mapOdStatus in
// orderDesk.ts. Odoo fields:
//   - sale.order.state:           draft / sent / sale / done / cancel
//   - sale.order.delivery_status: pending / partial / full (v16+) — may be
//                                 absent on older instances
//   - stock.picking.state:        done (= shipped) is the reliable signal
function mapOdooStatus(args: {
  state?: string | null;
  deliveryStatus?: string | null;
  pickingDone?: boolean;
}): { status: string; tsColumn: keyof typeof orders.$inferSelect | null } | null {
  const state = (args.state || "").toLowerCase();
  const delivery = (args.deliveryStatus || "").toLowerCase();
  if (state === "cancel") return { status: "cancelled", tsColumn: "cancelledAt" };
  if (args.pickingDone || delivery === "full") {
    return { status: "shipped", tsColumn: "shippedAt" };
  }
  if (state === "sale" || state === "done") {
    return { status: "in_fulfillment", tsColumn: "inFulfillmentAt" };
  }
  return null;
}

// Read one order's current status out of Odoo and reconcile it onto our row.
// Returns true if a status transition was applied. Best-effort: callers wrap
// it so one bad row never aborts the whole tick.
async function syncOneOrderFromOdoo(
  creds: OdooCreds,
  uid: number,
  order: Order,
): Promise<boolean> {
  if (!order.odooOrderId) return false;
  const odooId = Number(order.odooOrderId);
  if (!Number.isFinite(odooId)) return false;

  const saleRows = await odooExecuteKw(
    creds,
    uid,
    "sale.order",
    "read",
    [[odooId]],
    { fields: ["state", "delivery_status"] },
  );
  const sale = Array.isArray(saleRows) ? saleRows[0] : null;
  if (!sale) {
    // Order vanished in Odoo — record the sync attempt, leave status alone.
    await db.update(orders).set({ odooLastSyncedAt: new Date() }).where(eq(orders.id, order.id));
    return false;
  }

  // Pull the linked delivery pickings for a hard "done" + carrier/tracking.
  let pickingDone = false;
  let carrier: string | null = null;
  let trackingNumber: string | null = null;
  try {
    const pickings = await odooExecuteKw(
      creds,
      uid,
      "stock.picking",
      "search_read",
      [[["sale_id", "=", odooId], ["picking_type_code", "=", "outgoing"]]],
      { fields: ["state", "carrier_tracking_ref"], limit: 10 },
    );
    if (Array.isArray(pickings) && pickings.length > 0) {
      pickingDone = pickings.every((p: any) => (p.state || "").toLowerCase() === "done");
      const withTrack = pickings.find((p: any) => p.carrier_tracking_ref);
      if (withTrack) trackingNumber = String(withTrack.carrier_tracking_ref);
    }
  } catch {
    // stock module may be absent on a sale-only instance — sale.order
    // state + delivery_status still drive the mapping.
  }

  const mapped = mapOdooStatus({
    state: sale.state,
    deliveryStatus: sale.delivery_status,
    pickingDone,
  });

  const patch: Record<string, any> = {
    odooLastSyncedAt: new Date(),
    fulfillmentRaw: { source: "odoo", odooOrderId: order.odooOrderId, state: sale.state, deliveryStatus: sale.delivery_status, pickingDone, trackingNumber },
  };
  if (mapped) {
    patch.fulfillmentStatus = mapped.status;
    if (mapped.tsColumn && !(order as any)[mapped.tsColumn]) {
      patch[mapped.tsColumn as string] = new Date();
    }
  }
  if (carrier) patch.carrier = carrier;
  if (trackingNumber) patch.trackingNumber = trackingNumber;
  // Flip the legacy `status` to "shipped" so the existing admin payout/ship
  // pipeline triggers, exactly like the OD webhook does.
  if (mapped?.status === "shipped" && order.status === "paid") {
    patch.status = "shipped";
  }

  // `order` was read before this update, so `!order.shippedAt` means the row
  // had no ship timestamp until now; the patch only sets shippedAt when it
  // was null, so the two stay in lock-step. A later poll sees a populated
  // shippedAt and skips the email.
  const isFirstShipTransition = mapped?.status === "shipped" && !order.shippedAt;

  await db.update(orders).set(patch).where(eq(orders.id, order.id));

  // Best-effort: when Odoo reports shipped, trigger the Connect payout the
  // legacy admin /ship endpoint runs (mirrors the OD webhook).
  if (mapped?.status === "shipped" && order.status === "paid") {
    try {
      const [refreshed] = await db.select().from(orders).where(eq(orders.id, order.id));
      const { attemptTransferForOrder } = await import("./payouts");
      await attemptTransferForOrder(refreshed);
    } catch (e: any) {
      console.error(`[odoo-poll] payout attempt failed for ${order.id}`, e?.message);
    }
  }

  // Best-effort: email the fan a shipping confirmation the first time the
  // order transitions to shipped. Physical only; never blocks the tick.
  if (isFirstShipTransition) {
    try {
      await dispatchShippingEmail(order, {
        carrier: (patch.carrier as string | null) ?? order.carrier ?? null,
        trackingNumber: (patch.trackingNumber as string | null) ?? order.trackingNumber ?? null,
        trackingUrl: (patch.trackingUrl as string | null) ?? order.trackingUrl ?? null,
      });
    } catch (e: any) {
      console.error(`[odoo-poll] shipping email failed for ${order.id}`, e?.message);
    }
  }

  return mapped != null;
}

// One poll pass: read every pushed-but-not-terminal order's status back out
// of Odoo. Exported so a debug admin endpoint can flush without waiting for
// the timer. No-ops cleanly (returns 0) when credentials are unset.
export async function runOdooStatusPoll(): Promise<number> {
  const creds = odooCreds();
  if (!creds) return 0;

  // Pushed orders that haven't reached a terminal status yet. Terminal =
  // delivered / cancelled / returned (no further Odoo movement matters).
  const open = await db
    .select()
    .from(orders)
    .where(
      and(
        isNotNull(orders.odooOrderId),
        sql`(${orders.fulfillmentStatus} IS NULL OR ${orders.fulfillmentStatus} NOT IN ('delivered','cancelled','returned'))`,
      ),
    )
    .limit(200);
  if (open.length === 0) return 0;

  let uid: number;
  try {
    uid = await odooAuthenticate(creds);
  } catch (e: any) {
    log(`odoo poll auth failed: ${e?.message ?? e}`, "odoo-poll");
    return 0;
  }

  let transitions = 0;
  for (const order of open) {
    try {
      const changed = await syncOneOrderFromOdoo(creds, uid, order);
      if (changed) transitions++;
    } catch (e: any) {
      console.error(`[odoo-poll] sync failed for order ${order.id}`, e?.message);
    }
  }
  return transitions;
}

// ─── Poll scheduler ──────────────────────────────────────────────────
// In-process timer mirroring the giftScheduler pattern: a delayed first
// tick after boot so logs settle, then a fixed interval, with an in-process
// guard against overlap. Arms unconditionally (so the operator only has to
// set the env vars to light it up) — each tick is a clean no-op while
// credentials are unset.
export function armOdooPollScheduler() {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const n = await runOdooStatusPoll();
      if (n > 0) log(`reconciled ${n} order(s) from Odoo`, "odoo-poll");
    } catch (e: any) {
      log(`odoo poll tick failed: ${e?.message ?? e}`, "odoo-poll");
    } finally {
      ticking = false;
    }
  };
  // First tick ~2min after boot, then every 10 minutes.
  setTimeout(tick, 120 * 1000);
  setInterval(tick, 10 * 60 * 1000);
  log(
    odooCreds()
      ? "odoo poll scheduler armed (10min tick)"
      : "odoo poll scheduler armed (10min tick, idle — credentials unset)",
    "odoo-poll",
  );
}

// ─── Admin routes ────────────────────────────────────────────────────
export function registerOdooRoutes(app: Express) {
  const storagePromise = import("./storage").then((m) => m.storage);

  async function requireAdminInline(req: any, res: any): Promise<boolean> {
    const storage = await storagePromise;
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Sign in required" });
      return false;
    }
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") {
      res.status(401).json({ message: "Admin only" });
      return false;
    }
    return true;
  }

  // POST /api/admin/orders/:id/odoo-push — deliberate operator handoff to
  // Odoo (parallel to /orderdesk-push). No auto-push exists; this is the
  // only path an order reaches Odoo.
  app.post("/api/admin/orders/:id/odoo-push", async (req, res) => {
    if (!(await requireAdminInline(req, res))) return;
    const result = await pushOrderToOdoo(String(req.params.id));
    if (!result.ok) return res.status(502).json(result);
    res.json(result);
  });

  // POST /api/admin/odoo/poll — debug flush of the poll without waiting for
  // the timer (mirrors the gift-scheduler debug hook).
  app.post("/api/admin/odoo/poll", async (req, res) => {
    if (!(await requireAdminInline(req, res))) return;
    const n = await runOdooStatusPoll();
    res.json({ reconciled: n });
  });
}
