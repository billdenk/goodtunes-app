// Task #46 — Gifting flow.
// Task #550 — Extended with per-copy gifting, optional gift-card
// message, scheduled delivery (deliverOn date), recipient pre-lookup
// against existing customers, a configurable post-purchase gifting
// window, daily delivery scheduler, sender confirmation on claim, and
// refund-before-claim revert.
//
// Buyer marks a paid order (or one specific copy of a multi-quantity
// order) as a gift, optionally provides a message + a deliver-on date,
// and gets a shareable /gift/:token URL. If the recipient's email or
// phone matches a GoodTunes account we resolve it to a recipientUserId
// at creation so the entitlement can be "reserved" for them. Recipient
// opens the link, signs in, and POSTs /api/gifts/:token/claim. On claim
// we either reassign the parent order.customerId (legacy whole-order
// gift) or move just the matching user_albums row when the order
// retains other copies for the sender. Physical shipping stays on the
// buyer's address (per task — physical fulfillment of a gift box is out
// of scope).
//
// All routes are customer-side (Bearer-token auth). The public GET
// /api/gifts/:token only returns sanitized data (no recipient contact).
import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { grantLltBonusIfEligible } from "./lltBonus";
import {
  gifts,
  orders,
  orderCopies,
  albums,
  customerUsers,
  userAlbums,
  payoutSettings,
  type Gift,
} from "@shared/schema";

const SHARE_BASE_PATH = "/gift/";
const CLAIM_WINDOW_DAYS = 30;
const RECIPIENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MESSAGE_MAX_LEN = 500;

function newToken() {
  return randomBytes(24).toString("base64url");
}

function shareUrlFor(req: Request, token: string): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}${SHARE_BASE_PATH}${token}`;
}

async function requireCustomer(req: Request, res: Response): Promise<{ userId: string } | null> {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const a = await storage.getAuthBy(auth.slice(7));
    if (a?.kind === "customer") return { userId: a.userId };
  }
  if (req.session?.userId && req.session?.kind === "customer") {
    return { userId: req.session.userId };
  }
  res.status(401).json({ message: "Sign in required" });
  return null;
}

// Validate recipient fields. At least one of email/phone must be present;
// names are trimmed and required. Also validates the optional message
// (≤500 chars) and the optional deliverOn date (YYYY-MM-DD, today-or-
// later in UTC).
type ParsedRecipient = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  deliverOn: string | null;
};
function parseRecipient(body: any): { ok: true; v: ParsedRecipient } | { ok: false; message: string } {
  const firstName = String(body?.firstName ?? "").trim();
  const lastName = String(body?.lastName ?? "").trim();
  const emailRaw = String(body?.email ?? "").trim().toLowerCase();
  const phoneRaw = String(body?.phone ?? "").trim();
  if (!firstName) return { ok: false, message: "Recipient first name is required" };
  if (!lastName) return { ok: false, message: "Recipient last name is required" };
  const email = emailRaw || null;
  const phone = phoneRaw || null;
  if (!email && !phone) return { ok: false, message: "Add an email or phone so the recipient can be notified" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "That email doesn't look right" };
  }
  const messageRaw = body?.message == null ? "" : String(body.message);
  const message = messageRaw.trim() || null;
  if (message && message.length > MESSAGE_MAX_LEN) {
    return { ok: false, message: `Message must be ${MESSAGE_MAX_LEN} characters or fewer` };
  }
  let deliverOn: string | null = null;
  if (body?.deliverOn) {
    const raw = String(body.deliverOn).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { ok: false, message: "Delivery date must be YYYY-MM-DD" };
    }
    const today = new Date();
    const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    if (raw < todayKey) {
      return { ok: false, message: "Delivery date can't be in the past" };
    }
    deliverOn = raw;
  }
  return { ok: true, v: { firstName, lastName, email, phone, message, deliverOn } };
}

// Look up an existing customer_users row for an email/phone so a gift
// to an account-holder can have their entitlement reserved. Email is
// matched case-insensitively; phone is matched literally (callers pass
// the same E.164 they collected from the recipient form).
async function lookupRecipientUserId(email: string | null, phone: string | null): Promise<string | null> {
  if (email) {
    const [u] = await db
      .select({ id: customerUsers.id })
      .from(customerUsers)
      .where(sql`lower(${customerUsers.email}) = ${email}`)
      .limit(1);
    if (u) return u.id;
  }
  if (phone) {
    const [u] = await db
      .select({ id: customerUsers.id })
      .from(customerUsers)
      .where(eq(customerUsers.phoneE164, phone))
      .limit(1);
    if (u) return u.id;
  }
  return null;
}

async function getGiftingWindowDays(): Promise<number> {
  try {
    const [row] = await db.select().from(payoutSettings).where(eq(payoutSettings.id, "default")).limit(1);
    const v = (row as any)?.giftingWindowDays;
    if (typeof v === "number" && v > 0) return v;
  } catch {}
  return 30;
}

// Returns the UTC YYYY-MM-DD for "today".
function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// A scheduled gift is "delivered" once the daily scheduler stamps
// deliveredAt OR once its deliverOn date is today/past (we treat the
// claim path as a fall-through delivery the first time a recipient
// arrives, so they're never blocked by a missed scheduler tick).
function isDelivered(g: Gift): boolean {
  if (!g.deliverOn) return true; // no schedule = deliver-now
  if (g.deliveredAt) return true;
  return g.deliverOn <= todayKey();
}

// Public projection (no recipient contact details).
function publicGift(
  g: Gift,
  opts: { album: { id: string; title: string; artist: string; artwork: string }; buyerName: string | null },
) {
  const now = Date.now();
  const delivered = isDelivered(g);
  const expired = !g.claimedAt && g.expiresAt.getTime() < now;
  return {
    token: g.claimToken,
    album: opts.album,
    buyerName: opts.buyerName,
    recipientFirstName: g.recipientFirstName,
    recipientLastName: g.recipientLastName,
    message: g.message,
    deliverOn: g.deliverOn,
    delivered,
    deliveredAt: g.deliveredAt,
    claimed: !!g.claimedAt,
    claimedAt: g.claimedAt,
    expired,
    reverted: !!g.revertedAt,
    // Task #1938 — buyer-initiated revoke (distinct from refund revert).
    revoked: !!g.buyerRevokedAt,
    expiresAt: g.expiresAt,
  };
}

// Lightweight admin guard.
async function requireAdminLocal(req: Request, res: Response): Promise<boolean> {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const a = await storage.getAuthBy(auth.slice(7));
    if (a?.kind === "admin") return true;
  }
  if (req.session?.userId && req.session?.kind === "admin") return true;
  res.status(401).json({ message: "Admin only" });
  return false;
}

// ─── Shared create helper (whole-order or per-copy) ─────────────────
// Returns 4xx via res on validation/auth/state failure, otherwise the
// newly-inserted gift row.
async function createGiftRecord(
  req: Request,
  res: Response,
  opts: { orderId: string; copyId: string | null; userId: string },
): Promise<Gift | null> {
  const parsed = parseRecipient(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return null;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, opts.orderId));
  if (!order) { res.status(404).json({ message: "Order not found" }); return null; }
  if (order.customerId !== opts.userId) { res.status(403).json({ message: "Not your order" }); return null; }
  if (order.status !== "paid") { res.status(400).json({ message: "Only paid orders can be gifted" }); return null; }

  // Post-purchase gifting window (configurable). Always allow if the
  // order was placed within the window; the at-checkout path on
  // Welcome.tsx falls inside the window by construction.
  const windowDays = await getGiftingWindowDays();
  const ageMs = Date.now() - new Date(order.createdAt).getTime();
  if (ageMs > windowDays * 24 * 60 * 60 * 1000) {
    res.status(400).json({ message: `Gifts can only be sent within ${windowDays} days of purchase` });
    return null;
  }

  // Per-copy: validate the copy belongs to this order and isn't
  // already gifted. Whole-order: refuse if the order already has any
  // gift attached (legacy single-gift contract).
  if (opts.copyId) {
    const [copy] = await db.select().from(orderCopies).where(eq(orderCopies.id, opts.copyId));
    if (!copy || copy.orderId !== order.id) {
      res.status(404).json({ message: "Copy not found on this order" });
      return null;
    }
    const [existing] = await db
      .select({ id: gifts.id })
      .from(gifts)
      .where(and(eq(gifts.orderId, order.id), eq(gifts.copyId, opts.copyId)))
      .limit(1);
    if (existing) {
      res.status(409).json({ message: "This copy has already been marked as a gift" });
      return null;
    }
  } else {
    if (order.giftId) {
      res.status(409).json({ message: "This order has already been marked as a gift" });
      return null;
    }
    // Also refuse if any per-copy gift exists on this order — would
    // collide with the "whole order" semantics.
    const [anyCopyGift] = await db
      .select({ id: gifts.id })
      .from(gifts)
      .where(and(eq(gifts.orderId, order.id), sql`${gifts.copyId} IS NOT NULL`))
      .limit(1);
    if (anyCopyGift) {
      res.status(409).json({ message: "This order already has per-copy gifts — pick a copy instead" });
      return null;
    }
  }

  const recipientUserId = await lookupRecipientUserId(parsed.v.email, parsed.v.phone);
  const token = newToken();
  const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [gift] = await db
    .insert(gifts)
    .values({
      orderId: order.id,
      copyId: opts.copyId,
      buyerUserId: opts.userId,
      recipientFirstName: parsed.v.firstName,
      recipientLastName: parsed.v.lastName,
      recipientEmail: parsed.v.email,
      recipientPhone: parsed.v.phone,
      recipientUserId,
      message: parsed.v.message,
      deliverOn: parsed.v.deliverOn,
      claimToken: token,
      expiresAt,
      lastSentAt: new Date(),
    })
    .returning();

  // Legacy bookkeeping: orders.giftId still tracks whole-order gifts
  // so the existing /api/orders + /api/admin/orders join keeps lighting
  // up the order-level gift pill. Per-copy gifts surface via the new
  // copyGifts[] field added alongside.
  if (!opts.copyId) {
    await db.update(orders).set({ giftId: gift.id }).where(eq(orders.id, order.id));
  }

  // Notification stub — log only until SMS/email infra lands. A
  // scheduled (deliverOn set) gift logs "scheduled" so the operator
  // can see we deliberately didn't send the share link yet.
  const url = shareUrlFor(req, token);
  const scheduledTag = parsed.v.deliverOn && parsed.v.deliverOn > todayKey() ? " scheduled" : "";
  const reservedTag = recipientUserId ? ` reserved_for=${recipientUserId}` : "";
  if (parsed.v.email) console.log(`[gift] notify${scheduledTag} email=${parsed.v.email} url=${url}${reservedTag}`);
  if (parsed.v.phone) console.log(`[gift] notify${scheduledTag} sms=${parsed.v.phone} url=${url}${reservedTag}`);

  return gift;
}

export function registerGiftRoutes(app: Express) {
  // ─── Admin-side resend (no buyer-ownership check) ──────────────────
  app.post("/api/admin/orders/:id/gift/resend-as-admin", async (req, res) => {
    if (!(await requireAdminLocal(req, res))) return;
    const orderId = String(req.params.id);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !order.giftId) return res.status(404).json({ message: "Order isn't a gift" });
    const [gift] = await db.select().from(gifts).where(eq(gifts.id, order.giftId));
    if (!gift) return res.status(404).json({ message: "Gift not found" });
    if (gift.claimedAt) return res.status(400).json({ message: "Already claimed" });
    const token = newToken();
    const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(gifts)
      .set({ claimToken: token, expiresAt, resendCount: gift.resendCount + 1, lastSentAt: new Date() })
      .where(eq(gifts.id, gift.id))
      .returning();
    const url = shareUrlFor(req, updated.claimToken);
    if (updated.recipientEmail) console.log(`[gift admin-resend] email=${updated.recipientEmail} url=${url}`);
    if (updated.recipientPhone) console.log(`[gift admin-resend] sms=${updated.recipientPhone} url=${url}`);
    res.json({ gift: updated, shareUrl: url });
  });

  // ─── Admin recipient change (within 24h, pre-claim) ────────────────
  app.patch("/api/admin/orders/:id/gift", async (req, res) => {
    if (!(await requireAdminLocal(req, res))) return;
    const orderId = String(req.params.id);
    const parsed = parseRecipient(req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !order.giftId) return res.status(404).json({ message: "Order isn't a gift" });
    const [gift] = await db.select().from(gifts).where(eq(gifts.id, order.giftId));
    if (!gift) return res.status(404).json({ message: "Gift not found" });
    if (gift.claimedAt) return res.status(400).json({ message: "Already claimed — can't change recipient" });
    if (Date.now() - gift.createdAt.getTime() > RECIPIENT_EDIT_WINDOW_MS) {
      return res.status(400).json({ message: "Recipient can only be changed within 24h of creating the gift" });
    }
    const recipientUserId = await lookupRecipientUserId(parsed.v.email, parsed.v.phone);
    const token = newToken();
    const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(gifts)
      .set({
        recipientFirstName: parsed.v.firstName,
        recipientLastName: parsed.v.lastName,
        recipientEmail: parsed.v.email,
        recipientPhone: parsed.v.phone,
        recipientUserId,
        message: parsed.v.message,
        deliverOn: parsed.v.deliverOn,
        // A schedule change wipes a previously-stamped delivery so the
        // recipient doesn't see "delivered" while the new date is in
        // the future.
        deliveredAt: null,
        claimToken: token,
        expiresAt,
        lastSentAt: new Date(),
      })
      .where(eq(gifts.id, gift.id))
      .returning();
    const url = shareUrlFor(req, token);
    if (parsed.v.email) console.log(`[gift admin-patch] email=${parsed.v.email} url=${url}`);
    if (parsed.v.phone) console.log(`[gift admin-patch] sms=${parsed.v.phone} url=${url}`);
    res.json({ gift: updated, shareUrl: url });
  });

  // ─── Create a gift for a paid order (whole order) ──────────────────
  app.post("/api/orders/:id/gift", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    const { requirePhoneVerified } = await import("./auth/phoneOtp");
    if (await requirePhoneVerified(req, res, "gifting")) return;
    const gift = await createGiftRecord(req, res, {
      orderId: String(req.params.id),
      copyId: null,
      userId: me.userId,
    });
    if (!gift) return;
    res.json({ gift, shareUrl: shareUrlFor(req, gift.claimToken) });
  });

  // ─── Create a gift for a single copy on a multi-quantity order ─────
  app.post("/api/orders/:id/copies/:copyId/gift", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    const { requirePhoneVerified } = await import("./auth/phoneOtp");
    if (await requirePhoneVerified(req, res, "gifting")) return;
    const gift = await createGiftRecord(req, res, {
      orderId: String(req.params.id),
      copyId: String(req.params.copyId),
      userId: me.userId,
    });
    if (!gift) return;
    res.json({ gift, shareUrl: shareUrlFor(req, gift.claimToken) });
  });

  // ─── Update gift recipient (within 24h, pre-claim) ─────────────────
  app.patch("/api/orders/:id/gift", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    const { requirePhoneVerified } = await import("./auth/phoneOtp");
    if (await requirePhoneVerified(req, res, "gifting")) return;
    const orderId = String(req.params.id);
    const parsed = parseRecipient(req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !order.giftId) return res.status(404).json({ message: "Order not found" });

    const [gift] = await db.select().from(gifts).where(eq(gifts.id, order.giftId));
    if (!gift) return res.status(404).json({ message: "Gift not found" });
    if (gift.buyerUserId !== me.userId) return res.status(403).json({ message: "Not your gift" });
    if (gift.claimedAt) return res.status(400).json({ message: "Already claimed — can't change recipient" });
    if (Date.now() - gift.createdAt.getTime() > RECIPIENT_EDIT_WINDOW_MS) {
      return res.status(400).json({ message: "Recipient can only be changed within 24h of creating the gift" });
    }

    const recipientUserId = await lookupRecipientUserId(parsed.v.email, parsed.v.phone);
    const token = newToken();
    const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(gifts)
      .set({
        recipientFirstName: parsed.v.firstName,
        recipientLastName: parsed.v.lastName,
        recipientEmail: parsed.v.email,
        recipientPhone: parsed.v.phone,
        recipientUserId,
        message: parsed.v.message,
        deliverOn: parsed.v.deliverOn,
        deliveredAt: null,
        claimToken: token,
        expiresAt,
        lastSentAt: new Date(),
      })
      .where(eq(gifts.id, gift.id))
      .returning();

    const url = shareUrlFor(req, token);
    if (parsed.v.email) console.log(`[gift] notify email=${parsed.v.email} url=${url}`);
    if (parsed.v.phone) console.log(`[gift] notify sms=${parsed.v.phone} url=${url}`);
    res.json({ gift: updated, shareUrl: url });
  });

  // ─── Buyer-initiated revoke (pre-claim, pre-fulfillment only) ────────
  // Distinct from revertedAt (system-stamped on refund). The buyer can
  // cancel a pending gift at any time before the recipient has claimed,
  // provided the vinyl hasn't entered the fulfillment pipeline yet.
  // The entitlement stays with the buyer; no order transfer is needed.
  app.post("/api/orders/:id/gift/revoke", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    const orderId = String(req.params.id);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !order.giftId) return res.status(404).json({ message: "No gift on this order" });
    const [gift] = await db.select().from(gifts).where(eq(gifts.id, order.giftId));
    if (!gift) return res.status(404).json({ message: "Gift not found" });
    if (gift.buyerUserId !== me.userId) return res.status(403).json({ message: "Not your gift" });
    if (gift.claimedAt) return res.status(400).json({ message: "Already claimed — can't revoke" });
    if (gift.buyerRevokedAt) return res.status(400).json({ message: "Already revoked" });
    // Block once physical fulfillment is underway (vinyl can't be re-routed).
    const LOCKED_STATUSES = new Set(["in_fulfillment", "shipped", "delivered"]);
    if (order.fulfillmentStatus && LOCKED_STATUSES.has(order.fulfillmentStatus)) {
      return res.status(400).json({
        message: "Can't revoke — fulfillment of the physical record has already started.",
      });
    }
    const [updated] = await db
      .update(gifts)
      .set({ buyerRevokedAt: new Date() })
      .where(eq(gifts.id, gift.id))
      .returning();
    console.log(`[gift revoke] buyer=${me.userId} gift=${gift.id} order=${orderId}`);
    res.json({ gift: updated });
  });

  // ─── Mark order as "decide later" (7-day reminder window) ──────────
  // Stamped immediately after the post-checkout hub so the scheduler can
  // send a reminder email/SMS before the gifting window closes.
  app.post("/api/orders/:id/gift/pending", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    const orderId = String(req.params.id);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customerId !== me.userId) return res.status(403).json({ message: "Not your order" });
    if (order.status !== "paid") {
      return res.status(400).json({ message: "Only paid orders can be flagged as pending" });
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db
      .update(orders)
      .set({ pendingGiftDecision: true, pendingGiftDecisionExpiresAt: expiresAt })
      .where(eq(orders.id, orderId));
    console.log(`[gift pending] buyer=${me.userId} order=${orderId} expires=${expiresAt.toISOString()}`);
    res.json({ ok: true, expiresAt });
  });

  // ─── Resend (rotate token + push expiry, bump counter) ─────────────
  app.post("/api/orders/:id/gift/resend", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    const orderId = String(req.params.id);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !order.giftId) return res.status(404).json({ message: "Order not found" });
    const [gift] = await db.select().from(gifts).where(eq(gifts.id, order.giftId));
    if (!gift) return res.status(404).json({ message: "Gift not found" });
    if (gift.buyerUserId !== me.userId) return res.status(403).json({ message: "Not your gift" });
    if (gift.claimedAt) return res.status(400).json({ message: "Already claimed" });

    const token = newToken();
    const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(gifts)
      .set({ claimToken: token, expiresAt, resendCount: gift.resendCount + 1, lastSentAt: new Date() })
      .where(eq(gifts.id, gift.id))
      .returning();
    const url = shareUrlFor(req, updated.claimToken);
    if (updated.recipientEmail) console.log(`[gift] resend email=${updated.recipientEmail} url=${url}`);
    if (updated.recipientPhone) console.log(`[gift] resend sms=${updated.recipientPhone} url=${url}`);
    res.json({ gift: updated, shareUrl: url });
  });

  // ─── Public claim-page data ────────────────────────────────────────
  app.get("/api/gifts/:token", async (req, res) => {
    const token = String(req.params.token);
    const [gift] = await db.select().from(gifts).where(eq(gifts.claimToken, token));
    if (!gift) return res.status(404).json({ message: "This gift link is invalid or has been replaced." });
    if (gift.revertedAt) return res.status(404).json({ message: "This gift was cancelled because the order was refunded." });
    const [order] = await db.select().from(orders).where(eq(orders.id, gift.orderId));
    if (!order) return res.status(404).json({ message: "Gift not found" });
    const [album] = await db.select().from(albums).where(eq(albums.id, order.albumId));
    if (!album) return res.status(404).json({ message: "Gift not found" });
    const [buyer] = await db.select().from(customerUsers).where(eq(customerUsers.id, gift.buyerUserId));
    const buyerName = buyer ? (buyer.realName || buyer.displayName || null) : null;
    res.json(
      publicGift(gift, {
        album: { id: album.id, title: album.title, artist: album.artist, artwork: album.artwork },
        buyerName,
      }),
    );
  });

  // ─── Claim a gift (auth required — caller becomes owner) ───────────
  app.post("/api/gifts/:token/claim", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    const token = String(req.params.token);
    const [gift] = await db.select().from(gifts).where(eq(gifts.claimToken, token));
    if (!gift) return res.status(404).json({ message: "This gift link is invalid or has been replaced." });
    if (gift.revertedAt) return res.status(400).json({ message: "This gift was cancelled because the order was refunded." });
    if (gift.buyerRevokedAt) return res.status(400).json({ message: "The buyer cancelled this gift." });
    if (gift.claimedAt) return res.status(400).json({ message: "This gift has already been claimed." });
    if (gift.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "This gift link has expired. Ask the buyer to resend." });
    }
    if (gift.buyerUserId === me.userId) {
      return res.status(400).json({ message: "You can't claim your own gift — share the link with the recipient." });
    }
    if (!isDelivered(gift)) {
      return res.status(400).json({ message: `This gift unlocks on ${gift.deliverOn}.` });
    }
    // If the sender reserved this gift for a specific GoodTunes
    // account, only that account can claim — otherwise a stranger who
    // got the URL could grab a gift the sender meant for a specific
    // friend.
    if (gift.recipientUserId && gift.recipientUserId !== me.userId) {
      return res.status(403).json({ message: "This gift was reserved for a different account. Sign in with the address the sender used." });
    }

    let albumIdOut: string | null = null;
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, gift.orderId));
        if (!order) throw new Error("Order not found for this gift");
        albumIdOut = order.albumId;

        const [fresh] = await tx.select().from(gifts).where(eq(gifts.id, gift.id));
        if (!fresh || fresh.claimedAt) throw new Error("ALREADY_CLAIMED");

        if (gift.copyId) {
          // Per-copy: the order stays with the sender, only this one
          // copy moves. We model that by reassigning the copy row's
          // bookkeeping (best we have today is to stamp gift_id) and
          // inserting a user_albums row for the claimer. The sender
          // keeps their user_albums row because their other copies
          // still entitle them.
          await tx.update(orderCopies).set({ giftId: gift.id }).where(eq(orderCopies.id, gift.copyId));
          const [claimerRow] = await tx
            .select()
            .from(userAlbums)
            .where(and(eq(userAlbums.albumId, order.albumId), eq(userAlbums.userId, me.userId)));
          if (!claimerRow) {
            await tx.insert(userAlbums).values({ userId: me.userId, albumId: order.albumId });
          }
        } else {
          // Whole-order legacy path: reassign order + move user_albums.
          await tx.update(orders).set({ customerId: me.userId }).where(eq(orders.id, gift.orderId));
          const [buyerRow] = await tx
            .select()
            .from(userAlbums)
            .where(and(eq(userAlbums.albumId, order.albumId), eq(userAlbums.userId, gift.buyerUserId)));
          const [claimerRow] = await tx
            .select()
            .from(userAlbums)
            .where(and(eq(userAlbums.albumId, order.albumId), eq(userAlbums.userId, me.userId)));
          if (buyerRow && claimerRow) {
            await tx.delete(userAlbums).where(eq(userAlbums.id, buyerRow.id));
          } else if (buyerRow) {
            await tx.update(userAlbums).set({ userId: me.userId }).where(eq(userAlbums.id, buyerRow.id));
          } else if (!claimerRow) {
            await tx.insert(userAlbums).values({ userId: me.userId, albumId: order.albumId });
          }
        }

        // Task #1460 — the claimer now owns this album; if it's a
        // qualifying LLT release, unlock the bonus album for them too.
        await grantLltBonusIfEligible(tx, me.userId, order.albumId);

        const [claimer] = await tx.select().from(customerUsers).where(eq(customerUsers.id, me.userId));
        if (claimer && !claimer.realName) {
          const seeded = `${gift.recipientFirstName} ${gift.recipientLastName}`.trim();
          if (seeded) {
            await tx.update(customerUsers).set({ realName: seeded }).where(eq(customerUsers.id, me.userId));
          }
        }

        await tx
          .update(gifts)
          .set({ claimedByUserId: me.userId, claimedAt: new Date() })
          .where(eq(gifts.id, gift.id));
      });
    } catch (e: any) {
      if (e?.message === "ALREADY_CLAIMED") {
        return res.status(400).json({ message: "This gift has already been claimed." });
      }
      console.error("[gift claim] transfer failed", e);
      return res.status(500).json({ message: "Could not complete the claim. Please try again." });
    }

    // Sender confirmation (notification stub — log only until email/SMS
    // infra lands). Pulls the sender's preferred contact off the buyer
    // customer_users row.
    try {
      const [sender] = await db.select().from(customerUsers).where(eq(customerUsers.id, gift.buyerUserId));
      const contact = sender?.email || sender?.phoneE164 || gift.buyerUserId;
      console.log(`[gift claimed] sender=${contact} recipient=${me.userId} gift=${gift.id} album=${albumIdOut}`);
    } catch (e: any) {
      console.warn(`[gift claimed] sender notify lookup failed: ${e?.message}`);
    }

    const [updated] = await db.select().from(gifts).where(eq(gifts.id, gift.id));
    res.json({ gift: updated, albumId: albumIdOut });
  });
}

// Helper used by /api/orders + /api/admin/orders to enrich rows with
// the *legacy whole-order* gift (one per order). Per-copy gifts are
// loaded separately via loadCopyGiftsForOrders.
export async function loadGiftForOrders(orderIds: string[]): Promise<Map<string, Gift>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(gifts)
    .where(and(inArray(gifts.orderId, orderIds), isNull(gifts.copyId)));
  return new Map(rows.map((g) => [g.orderId, g]));
}

// Task #550 — per-copy gifts grouped by orderId so the Orders page can
// render a "n of m copies gifted" pill alongside the legacy gift block.
export async function loadCopyGiftsForOrders(orderIds: string[]): Promise<Map<string, Gift[]>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(gifts)
    .where(and(inArray(gifts.orderId, orderIds), sql`${gifts.copyId} IS NOT NULL`));
  const out = new Map<string, Gift[]>();
  for (const g of rows) {
    const arr = out.get(g.orderId) ?? [];
    arr.push(g);
    out.set(g.orderId, arr);
  }
  return out;
}

// Task #550 — refund-revert. Called from server/commerce.ts handleRefund
// when an order is refunded. Stamps revertedAt on any unclaimed gift
// (whole-order or per-copy) so the share link stops working and the
// entitlement stays with the sender. Already-claimed gifts are left
// alone — the standard refund unwind in commerce.ts removes the
// album from whoever currently owns it (sender on per-copy, claimer
// on whole-order).
export async function revertGiftsForRefundedOrder(orderId: string): Promise<number> {
  const rows = await db
    .update(gifts)
    .set({ revertedAt: new Date() })
    .where(and(eq(gifts.orderId, orderId), isNull(gifts.claimedAt), isNull(gifts.revertedAt), isNull(gifts.buyerRevokedAt)))
    .returning({ id: gifts.id });
  if (rows.length > 0) {
    console.log(`[gift revert] order=${orderId} reverted ${rows.length} unclaimed gift(s)`);
  }
  return rows.length;
}

// Task #550 — daily delivery tick. Stamps deliveredAt on any pending
// gift whose deliver_on date has arrived, and logs a notification
// stub for each. Returns the count delivered. Idempotent — gifts
// already delivered/claimed/reverted are skipped via the WHERE.
export async function runDueGiftDeliveries(): Promise<number> {
  const today = todayKey();
  const due = await db
    .select()
    .from(gifts)
    .where(
      and(
        sql`${gifts.deliverOn} IS NOT NULL`,
        sql`${gifts.deliverOn} <= ${today}`,
        isNull(gifts.deliveredAt),
        isNull(gifts.claimedAt),
        isNull(gifts.revertedAt),
      ),
    );
  if (due.length === 0) return 0;
  for (const g of due) {
    await db.update(gifts).set({ deliveredAt: new Date() }).where(eq(gifts.id, g.id));
    if (g.recipientEmail) console.log(`[gift deliver] email=${g.recipientEmail} gift=${g.id}`);
    if (g.recipientPhone) console.log(`[gift deliver] sms=${g.recipientPhone} gift=${g.id}`);
  }
  return due.length;
}
