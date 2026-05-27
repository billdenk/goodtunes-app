// Task #46 — Gifting flow.
//
// Buyer marks a paid order as a gift, optionally provides recipient
// name + email/phone, and gets a shareable /gift/:token URL. Recipient
// opens the link, signs in or signs up (handled by the existing
// customer auth flow), and POSTs /api/gifts/:token/claim. On claim we
// reassign the parent order.customerId AND the matching user_albums
// entitlement row to the claimer, so the library + GoodDeed certificate
// follow the gift. Physical shipping stays on the buyer's address (per
// task — physical fulfillment of a gift box is out of scope).
//
// All routes are customer-side (Bearer-token auth). The public GET
// /api/gifts/:token only returns sanitized data (no recipient contact).
import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { gifts, orders, albums, customerUsers, userAlbums, type Gift } from "@shared/schema";

const SHARE_BASE_PATH = "/gift/";
const CLAIM_WINDOW_DAYS = 30;
const RECIPIENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

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
  // Session fallback (admin login bypass also sets session for customers).
  if (req.session?.userId && req.session?.kind === "customer") {
    return { userId: req.session.userId };
  }
  res.status(401).json({ message: "Sign in required" });
  return null;
}

// Validate recipient fields. At least one of email/phone must be present;
// names are trimmed and required.
function parseRecipient(body: any): { ok: true; v: { firstName: string; lastName: string; email: string | null; phone: string | null } } | { ok: false; message: string } {
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
  return { ok: true, v: { firstName, lastName, email, phone } };
}

// Public projection (no recipient contact details).
function publicGift(g: Gift, opts: { album: { id: string; title: string; artist: string; artwork: string }; buyerName: string | null }) {
  const now = Date.now();
  const expired = !g.claimedAt && g.expiresAt.getTime() < now;
  return {
    token: g.claimToken,
    album: opts.album,
    buyerName: opts.buyerName,
    recipientFirstName: g.recipientFirstName,
    recipientLastName: g.recipientLastName,
    claimed: !!g.claimedAt,
    claimedAt: g.claimedAt,
    expired,
    expiresAt: g.expiresAt,
  };
}

// Lightweight admin guard mirroring the one in commerce.ts. Kept inline
// so this module stays self-contained.
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

export function registerGiftRoutes(app: Express) {
  // ─── Admin-side resend (no buyer-ownership check) ──────────────────
  // Surfaces on AdminOrders so support can recover for a confused fan.
  // Like the buyer-side resend, this rotates the token and pushes the
  // expiry out — so support can recover an *expired* gift too without
  // the buyer having to start over.
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
  // Mirrors PATCH /api/orders/:id/gift but skips the buyer-ownership
  // check so support can fix typos for a fan who can't open the app.
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
    const token = newToken();
    const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(gifts)
      .set({
        recipientFirstName: parsed.v.firstName,
        recipientLastName: parsed.v.lastName,
        recipientEmail: parsed.v.email,
        recipientPhone: parsed.v.phone,
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


  // ─── Create a gift for a paid order ────────────────────────────────
  app.post("/api/orders/:id/gift", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    // Task #538 — gating: we don't email a stranger on the buyer's say-so
    // until the buyer's own phone is verified. Sheet pops on the client.
    const { requirePhoneVerified } = await import("./auth/phoneOtp");
    if (await requirePhoneVerified(req, res, "gifting")) return;
    const orderId = String(req.params.id);
    const parsed = parseRecipient(req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customerId !== me.userId) return res.status(403).json({ message: "Not your order" });
    if (order.status !== "paid") return res.status(400).json({ message: "Only paid orders can be gifted" });
    if (order.giftId) return res.status(409).json({ message: "This order has already been marked as a gift" });

    const token = newToken();
    const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [gift] = await db
      .insert(gifts)
      .values({
        orderId: order.id,
        buyerUserId: me.userId,
        recipientFirstName: parsed.v.firstName,
        recipientLastName: parsed.v.lastName,
        recipientEmail: parsed.v.email,
        recipientPhone: parsed.v.phone,
        claimToken: token,
        expiresAt,
        lastSentAt: new Date(),
      })
      .returning();
    await db.update(orders).set({ giftId: gift.id }).where(eq(orders.id, order.id));

    // No email/SMS infra yet — log a synthetic "send" so the operator
    // can grab it from server logs in dev, exactly like email-verification
    // codes today. The buyer always gets the share link in the UI too.
    const url = shareUrlFor(req, token);
    if (parsed.v.email) console.log(`[gift] notify email=${parsed.v.email} url=${url}`);
    if (parsed.v.phone) console.log(`[gift] notify sms=${parsed.v.phone} url=${url}`);

    res.json({ gift, shareUrl: url });
  });

  // ─── Update gift recipient (within 24h, pre-claim) ─────────────────
  app.patch("/api/orders/:id/gift", async (req, res) => {
    const me = await requireCustomer(req, res);
    if (!me) return;
    // Task #538 — same gating as the create path: a recipient swap
    // re-sends a fresh share link to the new contact, so we still need
    // a verified buyer phone.
    const { requirePhoneVerified } = await import("./auth/phoneOtp");
    if (await requirePhoneVerified(req, res, "gifting")) return;
    const orderId = String(req.params.id);
    const parsed = parseRecipient(req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !order.giftId) return res.status(404).json({ message: "Order not found" });

    const [gift] = await db.select().from(gifts).where(eq(gifts.id, order.giftId));
    if (!gift) return res.status(404).json({ message: "Gift not found" });
    // Authorize on gifts.buyerUserId so the buyer can still patch after
    // a previous (rolled-back) claim moved orders.customerId.
    if (gift.buyerUserId !== me.userId) return res.status(403).json({ message: "Not your gift" });
    if (gift.claimedAt) return res.status(400).json({ message: "Already claimed — can't change recipient" });
    if (Date.now() - gift.createdAt.getTime() > RECIPIENT_EDIT_WINDOW_MS) {
      return res.status(400).json({ message: "Recipient can only be changed within 24h of creating the gift" });
    }

    // Rotate token so the previous one (which may have been shared with
    // the wrong person) can't be redeemed anymore. Also extend expiry so
    // the new recipient gets a fresh 30-day claim window.
    const token = newToken();
    const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(gifts)
      .set({
        recipientFirstName: parsed.v.firstName,
        recipientLastName: parsed.v.lastName,
        recipientEmail: parsed.v.email,
        recipientPhone: parsed.v.phone,
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

  // ─── Resend (rotate token + push expiry, bump counter) ─────────────
  // Resend recovers expired gifts too — it rotates the token and resets
  // the 30-day claim window, so a buyer who realizes weeks later that
  // the recipient never opened the link doesn't have to start over. The
  // *only* terminal state is "claimed". The old token is invalidated by
  // rotation, so anyone who saw the previous link can no longer redeem.
  // Authorization: buyer of record on `gifts.buyerUserId` (this still
  // works after a previous claim was, hypothetically, rolled back —
  // unlike checking `order.customerId`).
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
    // Resolve buyer from gifts.buyerUserId (NOT orders.customerId) — the
    // claim flow rewrites orders.customerId to the claimer, so after
    // claim the "From {buyer}" line would otherwise flip to show the
    // claimer's own name back at them.
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
    if (gift.claimedAt) return res.status(400).json({ message: "This gift has already been claimed." });
    if (gift.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "This gift link has expired. Ask the buyer to resend." });
    }
    if (gift.buyerUserId === me.userId) {
      return res.status(400).json({ message: "You can't claim your own gift — share the link with the recipient." });
    }

    // Atomic transfer: order → claimer, user_albums → claimer, gift →
    // claimed. Wrapped in a single PG transaction so any failure rolls
    // back the whole thing — without this, a unique-constraint hit on
    // user_albums (recipient somehow already owns the album) could leave
    // orders.customerId reassigned while gifts.claimedAt stays null,
    // producing a half-transferred order that the buyer no longer sees
    // and the claimer can't re-claim.
    let albumIdOut: string | null = null;
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, gift.orderId));
        if (!order) throw new Error("Order not found for this gift");
        albumIdOut = order.albumId;

        // Re-check claim state inside the tx to avoid a race where two
        // tabs both pass the outer guard and try to claim simultaneously.
        const [fresh] = await tx.select().from(gifts).where(eq(gifts.id, gift.id));
        if (!fresh || fresh.claimedAt) throw new Error("ALREADY_CLAIMED");

        await tx.update(orders).set({ customerId: me.userId }).where(eq(orders.id, gift.orderId));

        // Move the buyer's existing user_albums row to the claimer. If
        // the claimer already owns this album (rare — they bought it
        // for themselves earlier), drop the buyer's row instead of
        // moving it so we don't trip the (userId, albumId) unique index.
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

        // Seed the claimer's realName from the gift recipient name if
        // they haven't set one — the GoodDeed cert reads from
        // customerUsers.realName, so without this a brand-new claimer
        // gets their email local-part on the cert. Existing realName
        // values are never overwritten.
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
    const [updated] = await db.select().from(gifts).where(eq(gifts.id, gift.id));
    res.json({ gift: updated, albumId: albumIdOut });
  });
}

// Helper used by /api/orders + /api/admin/orders to enrich rows with
// gift status. Keeps the join logic out of the route bodies.
export async function loadGiftForOrders(orderIds: string[]): Promise<Map<string, Gift>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db.select().from(gifts).where(or(...orderIds.map((id) => eq(gifts.orderId, id))) as any);
  return new Map(rows.map((g) => [g.orderId, g]));
}
