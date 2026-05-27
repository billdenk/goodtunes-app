// Task #48 — Stripe Connect payouts for artists & labels.
//
// One module owning: Connect Express account create + onboarding link,
// payout-settings CRUD (platform fee % + cert cost off the top),
// payout-target resolution (album → per-album override / labelId /
// primaryArtistId), the transfer triggered on "Mark shipped", refund
// reversal, and the stuck-cases dashboard read.
//
// Express accounts in test mode only today; once a real platform onboards
// to live mode, swap the connector environment and these endpoints
// continue to work unchanged.
import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  orders,
  albums,
  organizations,
  payoutAccounts,
  payoutSettings,
  people,
  labels,
  customerUsers,
  type PayoutAccount,
  type PayoutSettings,
  type PayoutOwnerKind,
  type Order,
  type Album,
  PAYOUT_OWNER_KINDS,
} from "@shared/schema";
import { and, desc, eq, sql, or, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { storage } from "./storage";
import {
  DEFAULT_SIGNED_CERT_LADDER,
  validateSignedCertLadder,
} from "@shared/signedCertLadder";
import { getStripe } from "./stripe";
import type Stripe from "stripe";

// ─── Settings ─────────────────────────────────────────────────────────

// Singleton row keyed by id='default'. Seeded lazily on first read so
// fresh DBs don't need a separate migration step.
export async function getPayoutSettings(): Promise<PayoutSettings> {
  const [row] = await db.select().from(payoutSettings).where(eq(payoutSettings.id, "default"));
  if (row) return row;
  const [inserted] = await db
    .insert(payoutSettings)
    .values({
      id: "default",
      platformFeePct: 10,
      certCostCents: 1200,
      shopifyFeeCents: 350,
      signedCertLadder: DEFAULT_SIGNED_CERT_LADDER,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;
  const [again] = await db.select().from(payoutSettings).where(eq(payoutSettings.id, "default"));
  return again!;
}

// ─── Account helpers ──────────────────────────────────────────────────

async function getAccountByOwner(ownerKind: PayoutOwnerKind, ownerId: string): Promise<PayoutAccount | undefined> {
  const [row] = await db
    .select()
    .from(payoutAccounts)
    .where(and(eq(payoutAccounts.ownerKind, ownerKind), eq(payoutAccounts.ownerId, ownerId)));
  return row;
}

async function getAccountByStripeId(stripeAccountId: string): Promise<PayoutAccount | undefined> {
  const [row] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.stripeAccountId, stripeAccountId));
  return row;
}

// Syncs the local row from a Stripe Account object. Idempotent —
// safe to call from the webhook and the on-demand refresh endpoint.
export async function syncAccountFromStripe(stripeAcct: Stripe.Account): Promise<PayoutAccount | undefined> {
  const existing = await getAccountByStripeId(stripeAcct.id);
  if (!existing) return undefined;
  const requirementsDue = [
    ...(stripeAcct.requirements?.currently_due ?? []),
    ...(stripeAcct.requirements?.past_due ?? []),
  ];
  const [updated] = await db
    .update(payoutAccounts)
    .set({
      payoutsEnabled: !!stripeAcct.payouts_enabled,
      chargesEnabled: !!stripeAcct.charges_enabled,
      detailsSubmitted: !!stripeAcct.details_submitted,
      requirementsDue: Array.from(new Set(requirementsDue)),
      disabledReason: stripeAcct.requirements?.disabled_reason ?? null,
      email: stripeAcct.email ?? existing.email,
      lastSyncedAt: new Date(),
    })
    .where(eq(payoutAccounts.id, existing.id))
    .returning();
  return updated;
}

// Partner-permission gate for a payout-account owner. `organization`
// owners (added by Task #354 for NPO referral payouts) aren't a partner
// scope kind, so they're super-admin-only — anything else maps to the
// usual artist/label scope check.
async function gatePayoutOwner(
  userId: string,
  ownerKind: PayoutOwnerKind,
  ownerId: string,
): Promise<{ status: number; body: any } | null> {
  if (ownerKind === "organization") {
    const { getUserRole } = await import("./auth/roles");
    const info = await getUserRole(userId);
    if (!info || info.role !== "super_admin") {
      return { status: 403, body: { message: "Super admin only" } };
    }
    return null;
  }
  const { checkPartnerVerbForScope } = await import("./auth/partnerPermissions");
  // Task #527 — manufacturer (press) Connect accounts route through
  // the same partner-permissions gate as artist/label accounts; the
  // `manufacturer` scope kind is already in PARTNER_SCOPE_KINDS, so
  // any manufacturer-role admin with `managePayouts` may connect /
  // refresh their press's Stripe account.
  const scopeKind =
    ownerKind === "person" ? "artist"
    : ownerKind === "manufacturer" ? "manufacturer"
    : "label";
  const scope = { kind: scopeKind as any, id: ownerId };
  return checkPartnerVerbForScope(userId, "manage_payouts", scope);
}

// ─── Resolve who gets paid for a given album ──────────────────────────
// Priority:
//   1. album.payoutOwnerKind + album.payoutOwnerId (explicit override)
//   2. album.labelId → ("label", labelId)
//   3. album.primaryArtistId → ("person", primaryArtistId)
//   4. null → operator must reconcile manually ("skipped")
export async function resolvePayoutTarget(album: Album): Promise<PayoutAccount | null> {
  const candidates: Array<{ kind: PayoutOwnerKind; id: string }> = [];
  if (album.payoutOwnerKind === "person" || album.payoutOwnerKind === "label") {
    if (album.payoutOwnerId) candidates.push({ kind: album.payoutOwnerKind, id: album.payoutOwnerId });
  }
  if (album.labelId) candidates.push({ kind: "label", id: album.labelId });
  if (album.primaryArtistId) candidates.push({ kind: "person", id: album.primaryArtistId });
  for (const c of candidates) {
    const acct = await getAccountByOwner(c.kind, c.id);
    if (acct && acct.payoutsEnabled) return acct;
  }
  return null;
}

// ─── Compute the split ────────────────────────────────────────────────
export interface PayoutSplit {
  totalCents: number;
  platformFeeCents: number;
  certCostCents: number;
  payoutAmountCents: number;
  platformFeePct: number;
}

export async function computeSplit(order: Order, album: Album): Promise<PayoutSplit> {
  const s = await getPayoutSettings();
  const feePct = album.payoutFeePctOverride ?? s.platformFeePct;
  const certCfg = album.payoutCertCentsOverride ?? s.certCostCents;
  // Only deduct the per-cert cost if the buyer actually added the cert
  // add-on. We snapshot in `order_items` but the cheapest signal is
  // `totalCents > sku price` — easier: deduct certCfg whenever the
  // order has a signed_cert line. We re-read items inline.
  const items = await db.select().from((await import("@shared/schema")).orderItems).where(eq((await import("@shared/schema")).orderItems.orderId, order.id));
  const hasCert = items.some((i: any) => i.kind === "addon" && i.sku === "signed_cert");
  const certCostCents = hasCert ? certCfg : 0;
  const remainder = Math.max(order.totalCents - certCostCents, 0);
  const platformFeeCents = Math.max(Math.floor((remainder * feePct) / 100), 0);
  const payoutAmountCents = Math.max(remainder - platformFeeCents, 0);
  return {
    totalCents: order.totalCents,
    platformFeeCents,
    certCostCents,
    payoutAmountCents,
    platformFeePct: feePct,
  };
}

// ─── Transfer on "Mark shipped" ───────────────────────────────────────
// Idempotent: re-running on a transferred order short-circuits. We
// pass `transfer_group` keyed on the order id so the operator can find
// the matching transfer in the Stripe dashboard.
export async function attemptTransferForOrder(order: Order): Promise<{
  status: "transferred" | "skipped" | "failed";
  error?: string;
  transferId?: string;
  amount?: number;
}> {
  if (order.payoutStatus === "transferred") {
    return { status: "transferred", transferId: order.payoutTransferId ?? undefined, amount: order.payoutAmountCents ?? undefined };
  }
  const album = await storage.getAlbumById(order.albumId, { includeHidden: true });
  if (!album) return { status: "failed", error: "Album not found" };
  const split = await computeSplit(order, album);
  const target = await resolvePayoutTarget(album);
  if (!target) {
    await db
      .update(orders)
      .set({
        payoutStatus: "skipped",
        platformFeeCents: split.platformFeeCents,
        certCostCents: split.certCostCents,
        payoutAmountCents: split.payoutAmountCents,
        payoutError: "No connected account with payouts enabled",
      })
      .where(eq(orders.id, order.id));
    return { status: "skipped", error: "No connected account" };
  }
  if (split.payoutAmountCents <= 0) {
    await db
      .update(orders)
      .set({
        payoutStatus: "skipped",
        platformFeeCents: split.platformFeeCents,
        certCostCents: split.certCostCents,
        payoutAmountCents: 0,
        payoutOwnerKind: target.ownerKind,
        payoutOwnerId: target.ownerId,
        payoutError: "Computed payout amount was zero",
      })
      .where(eq(orders.id, order.id));
    return { status: "skipped", error: "Zero payout" };
  }
  // Task #543 — Earmark instead of transferring. Bill releases from
  // /admin/payouts-release; that endpoint calls stripe.transfers.create
  // keyed on the earmark id so a re-press of Release can never
  // double-pay. The order row records `payoutStatus='earmarked'` so the
  // stuck-cases dashboard doesn't keep re-trying this row.
  try {
    const { createEarmarkIfAbsent } = await import("./payoutEarmarks");
    const earmark = await createEarmarkIfAbsent({
      sourceKind: "order_royalty",
      sourceRef: order.id,
      albumId: order.albumId,
      // PayoutOwnerKind ⊂ PayoutEarmarkOwnerKind (vendor + fulfillment
      // are reserved for future owner types). Cast is safe today.
      ownerKind: target.ownerKind as any,
      ownerId: target.ownerId,
      amountCents: split.payoutAmountCents,
      currency: order.currency || "usd",
    });
    await db
      .update(orders)
      .set({
        payoutStatus: "earmarked",
        payoutAmountCents: split.payoutAmountCents,
        platformFeeCents: split.platformFeeCents,
        certCostCents: split.certCostCents,
        payoutOwnerKind: target.ownerKind,
        payoutOwnerId: target.ownerId,
        payoutError: null,
      })
      .where(eq(orders.id, order.id));
    return { status: "skipped", amount: split.payoutAmountCents, transferId: earmark.id, error: "Earmarked — pending Bill release" };
  } catch (e: any) {
    const msg = e?.message || "Earmark failed";
    await db
      .update(orders)
      .set({
        payoutStatus: "failed",
        platformFeeCents: split.platformFeeCents,
        certCostCents: split.certCostCents,
        payoutAmountCents: split.payoutAmountCents,
        payoutOwnerKind: target.ownerKind,
        payoutOwnerId: target.ownerId,
        payoutError: msg,
      })
      .where(eq(orders.id, order.id));
    return { status: "failed", error: msg };
  }
}

// ─── Reverse a transfer on refund ─────────────────────────────────────
export async function reverseTransferForOrder(order: Order): Promise<void> {
  if (order.payoutStatus !== "transferred" || !order.payoutTransferId) return;
  try {
    const stripe = await getStripe();
    await stripe.transfers.createReversal(
      order.payoutTransferId,
      { refund_application_fee: false, metadata: { gt_order_id: order.id } },
      { idempotencyKey: `reversal_${order.id}` },
    );
    await db
      .update(orders)
      .set({ payoutStatus: "reversed", payoutError: null })
      .where(eq(orders.id, order.id));
  } catch (e: any) {
    await db
      .update(orders)
      .set({ payoutError: `Reversal failed: ${e?.message || "unknown error"}` })
      .where(eq(orders.id, order.id));
  }
}

// ─── Route registrar ──────────────────────────────────────────────────
export function registerPayoutRoutes(app: Express) {
  const requireAdmin = async (req: Request, res: Response, next: () => void) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") return res.status(401).json({ message: "Unauthorized" });
    const u = await storage.getUser(a.userId);
    if (!u?.isAdmin) return res.status(403).json({ message: "Forbidden" });
    (req as any).adminUserId = a.userId;
    next();
  };

  // ─── Settings ────────────────────────────────────────────────────
  app.get("/api/admin/payout-settings", requireAdmin, async (_req, res) => {
    try {
      res.json(await getPayoutSettings());
    } catch (err: any) {
      const message = err?.message || "Failed to load payout settings";
      console.error("[GET /api/admin/payout-settings]", message, err);
      res.status(500).json({ message });
    }
  });
  // Task #119 — write gating for platform pricing. The cert + Shopify
  // fee are platform-wide cost knobs; only super_admin can change them.
  // Other admin roles still GET so the SellPanel can render the
  // "You earn $X.XX per unit" readout against the live platform cost.
  const settingsSchema = z.object({
    platformFeePct: z.number().int().min(0).max(50).optional(),
    certCostCents: z.number().int().min(0).max(10000).optional(),
    shopifyFeeCents: z.number().int().min(0).max(10000).optional(),
    // Signed-cert wholesale ladder — array shape validated by
    // `validateSignedCertLadder` after zod (label/order/floor checks
    // are easier to express imperatively than in a zod schema).
    signedCertLadder: z.array(z.unknown()).optional(),
    // Task #471 — platform default GoodDeed vendor routing. Null
    // clears the assignment; the Shopify Sell panel then shows the
    // "no default" hint and falls back to its current Cost-(live) 0.
    defaultPrintVendorId: z.string().nullable().optional(),
    defaultHologramVendorId: z.string().nullable().optional(),
    defaultInsertionVendorId: z.string().nullable().optional(),
  });
  app.put("/api/admin/payout-settings", requireAdmin, async (req, res) => {
    const { getUserRole } = await import("./auth/roles");
    const info = await getUserRole((req as any).adminUserId);
    if (info && info.role !== "super_admin") {
      return res.status(403).json({ message: "Super admin only" });
    }
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid settings" });
    await getPayoutSettings(); // ensure seeded
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.platformFeePct !== undefined) patch.platformFeePct = parsed.data.platformFeePct;
    if (parsed.data.certCostCents !== undefined) patch.certCostCents = parsed.data.certCostCents;
    if (parsed.data.shopifyFeeCents !== undefined) patch.shopifyFeeCents = parsed.data.shopifyFeeCents;
    if (parsed.data.signedCertLadder !== undefined) {
      const v = validateSignedCertLadder(parsed.data.signedCertLadder);
      if (!v.ok) return res.status(400).json({ message: v.message });
      patch.signedCertLadder = v.rungs;
    }
    if (parsed.data.defaultPrintVendorId !== undefined) patch.defaultPrintVendorId = parsed.data.defaultPrintVendorId;
    if (parsed.data.defaultHologramVendorId !== undefined) patch.defaultHologramVendorId = parsed.data.defaultHologramVendorId;
    if (parsed.data.defaultInsertionVendorId !== undefined) patch.defaultInsertionVendorId = parsed.data.defaultInsertionVendorId;
    const [row] = await db
      .update(payoutSettings)
      .set(patch as any)
      .where(eq(payoutSettings.id, "default"))
      .returning();
    res.json(row);
  });

  // ─── Account list + read ─────────────────────────────────────────
  app.get("/api/admin/payouts/accounts", requireAdmin, async (req, res) => {
    const ownerKind = (req.query.ownerKind as string | undefined) || null;
    const ownerId = (req.query.ownerId as string | undefined) || null;
    if (ownerKind && ownerId) {
      const row = await getAccountByOwner(ownerKind as PayoutOwnerKind, ownerId);
      return res.json(row ?? null);
    }
    const rows = await db.select().from(payoutAccounts).orderBy(desc(payoutAccounts.createdAt));
    res.json(rows);
  });

  // ─── Create a Connect Express account ────────────────────────────
  const createAccountSchema = z.object({
    ownerKind: z.enum(PAYOUT_OWNER_KINDS),
    ownerId: z.string().min(1),
    country: z.string().length(2).optional(),
    email: z.string().email().optional(),
  });
  app.post("/api/admin/payouts/accounts", requireAdmin, async (req, res) => {
    // Task #538 — Phone verification gate. A partner only sees the
    // payout settings sheet after their phone is verified, so withdrawal
    // changes always trail an SMS-confirmed identity check. Skipped
    // for super_admins acting on behalf of a partner (they're already
    // on the platform-trust ladder and we don't want them blocked from
    // bulk operational fix-ups).
    {
      const { getUserRole } = await import("./auth/roles");
      const info = await getUserRole((req as any).adminUserId);
      if (!info || info.role !== "super_admin") {
        const { requirePhoneVerified } = await import("./auth/phoneOtp");
        if (await requirePhoneVerified(req, res, "payouts")) return;
      }
    }
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    const { ownerKind, ownerId } = parsed.data;
    // Task #79 — payouts gated by `manage_payouts` against the owner's
    // scope (person → artist scope; label → label scope).
    {
      const err = await gatePayoutOwner(req.session!.userId!, ownerKind, ownerId);
      if (err) return res.status(err.status).json(err.body);
    }
    // Validate owner exists.
    if (ownerKind === "person") {
      const [p] = await db.select({ id: people.id, name: people.name }).from(people).where(eq(people.id, ownerId));
      if (!p) return res.status(404).json({ message: "Person not found" });
    } else if (ownerKind === "label") {
      const [l] = await db.select({ id: labels.id, name: labels.name }).from(labels).where(eq(labels.id, ownerId));
      if (!l) return res.status(404).json({ message: "Label not found" });
    } else if (ownerKind === "manufacturer") {
      const { manufacturers } = await import("@shared/schema");
      const [m] = await db.select({ id: manufacturers.id, name: manufacturers.name }).from(manufacturers).where(eq(manufacturers.id, ownerId));
      if (!m) return res.status(404).json({ message: "Press not found" });
    } else {
      const [o] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, ownerId));
      if (!o) return res.status(404).json({ message: "Organization not found" });
    }
    const existing = await getAccountByOwner(ownerKind, ownerId);
    if (existing) return res.status(409).json({ message: "Account already exists", account: existing });

    try {
      const stripe = await getStripe();
      const acct = await stripe.accounts.create({
        type: "express",
        country: parsed.data.country ?? "US",
        email: parsed.data.email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        metadata: { gt_owner_kind: ownerKind, gt_owner_id: ownerId },
      });
      const requirementsDue = [
        ...(acct.requirements?.currently_due ?? []),
        ...(acct.requirements?.past_due ?? []),
      ];
      const [row] = await db
        .insert(payoutAccounts)
        .values({
          ownerKind,
          ownerId,
          stripeAccountId: acct.id,
          country: parsed.data.country ?? "US",
          email: parsed.data.email ?? null,
          payoutsEnabled: !!acct.payouts_enabled,
          chargesEnabled: !!acct.charges_enabled,
          detailsSubmitted: !!acct.details_submitted,
          requirementsDue: Array.from(new Set(requirementsDue)),
          disabledReason: acct.requirements?.disabled_reason ?? null,
          lastSyncedAt: new Date(),
        })
        .returning();
      res.status(201).json(row);
    } catch (e: any) {
      res.status(502).json({ message: `Stripe error: ${e?.message ?? "create failed"}` });
    }
  });

  // ─── Create an onboarding link ───────────────────────────────────
  app.post("/api/admin/payouts/accounts/:id/onboard", requireAdmin, async (req, res) => {
    const [row] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.id, String(req.params.id)));
    if (!row) return res.status(404).json({ message: "Account not found" });
    {
      const err = await gatePayoutOwner(req.session!.userId!, row.ownerKind as PayoutOwnerKind, row.ownerId);
      if (err) return res.status(err.status).json(err.body);
    }
    try {
      const stripe = await getStripe();
      const origin = absoluteOrigin(req);
      const link = await stripe.accountLinks.create({
        account: row.stripeAccountId,
        refresh_url: `${origin}/admin/payouts?refresh=${row.id}`,
        return_url: `${origin}/admin/payouts?return=${row.id}`,
        type: "account_onboarding",
      });
      res.json({ url: link.url, expiresAt: link.expires_at });
    } catch (e: any) {
      res.status(502).json({ message: `Stripe error: ${e?.message ?? "onboarding link failed"}` });
    }
  });

  // ─── Sync from Stripe on demand ──────────────────────────────────
  app.post("/api/admin/payouts/accounts/:id/refresh", requireAdmin, async (req, res) => {
    const [row] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.id, String(req.params.id)));
    if (!row) return res.status(404).json({ message: "Account not found" });
    {
      const err = await gatePayoutOwner(req.session!.userId!, row.ownerKind as PayoutOwnerKind, row.ownerId);
      if (err) return res.status(err.status).json(err.body);
    }
    try {
      const stripe = await getStripe();
      const acct = await stripe.accounts.retrieve(row.stripeAccountId);
      const updated = await syncAccountFromStripe(acct);
      res.json(updated ?? row);
    } catch (e: any) {
      res.status(502).json({ message: `Stripe error: ${e?.message ?? "refresh failed"}` });
    }
  });

  // ─── Delete (test-mode cleanup) ──────────────────────────────────
  app.delete("/api/admin/payouts/accounts/:id", requireAdmin, async (req, res) => {
    const [row] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.id, String(req.params.id)));
    if (!row) return res.json({ ok: true });
    {
      const err = await gatePayoutOwner(req.session!.userId!, row.ownerKind as PayoutOwnerKind, row.ownerId);
      if (err) return res.status(err.status).json(err.body);
    }
    try {
      const stripe = await getStripe();
      // Stripe rejects deletes against live accounts that have completed
      // onboarding. Best-effort — swallow the error and remove the
      // local row either way so the operator can re-link from scratch.
      await stripe.accounts.del(row.stripeAccountId).catch(() => null);
    } catch {}
    await db.delete(payoutAccounts).where(eq(payoutAccounts.id, row.id));
    res.json({ ok: true });
  });

  // ─── Stuck-cases dashboard ───────────────────────────────────────
  // Anything shipped where the payout didn't cleanly land. Includes
  // skipped (no connected account at ship time) and failed (Stripe
  // rejected the transfer).
  app.get("/api/admin/payouts/stuck", requireAdmin, async (_req, res) => {
    const rows = await db
      .select({ order: orders, album: albums, customer: customerUsers })
      .from(orders)
      .innerJoin(albums, eq(orders.albumId, albums.id))
      .innerJoin(customerUsers, eq(orders.customerId, customerUsers.id))
      .where(
        and(
          eq(orders.status, "shipped"),
          or(
            eq(orders.payoutStatus, "skipped"),
            eq(orders.payoutStatus, "failed"),
            isNull(orders.payoutStatus),
          ),
        ),
      )
      .orderBy(desc(orders.shippedAt));
    const out = rows.map((r) => ({
      ...r.order,
      albumTitle: r.album.title,
      albumArtist: r.album.artist,
      customerEmail: r.customer.email,
      customerName: r.customer.realName ?? r.customer.displayName ?? null,
    }));
    res.json(out);
  });

  // ─── Retry a stuck transfer ──────────────────────────────────────
  app.post("/api/admin/payouts/orders/:id/retry", requireAdmin, async (req, res) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, String(req.params.id)));
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "shipped") return res.status(400).json({ message: "Only shipped orders can be paid out" });
    if (order.payoutStatus === "transferred") {
      return res.status(409).json({ message: "Already transferred" });
    }
    const result = await attemptTransferForOrder(order);
    const [refreshed] = await db.select().from(orders).where(eq(orders.id, order.id));
    res.json({ result, order: refreshed });
  });

  // ─── Album-level payout overrides ────────────────────────────────
  // Mirror the EditablePanel `{ field: value }` body shape used elsewhere.
  const albumOverrideSchema = z.object({
    payoutFeePctOverride: z.number().int().min(0).max(50).nullable().optional(),
    payoutCertCentsOverride: z.number().int().min(0).max(10000).nullable().optional(),
    payoutOwnerKind: z.enum(PAYOUT_OWNER_KINDS).nullable().optional(),
    payoutOwnerId: z.string().nullable().optional(),
  });
  app.put("/api/admin/albums/:id/payout-overrides", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const parsed = albumOverrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid override" });
    const [row] = await db
      .update(albums)
      .set(parsed.data as any)
      .where(eq(albums.id, album.id))
      .returning();
    res.json(row);
  });

  // ─── Read a single order's payout target preview ─────────────────
  // Used by the AdminOrders / album-level UI to show "Who gets paid"
  // before the order ships.
  app.get("/api/admin/albums/:id/payout-preview", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const target = await resolvePayoutTarget(album);
    let ownerName: string | null = null;
    if (target) {
      if (target.ownerKind === "person") {
        const [p] = await db.select({ name: people.name }).from(people).where(eq(people.id, target.ownerId));
        ownerName = p?.name ?? null;
      } else if (target.ownerKind === "label") {
        const [l] = await db.select({ name: labels.name }).from(labels).where(eq(labels.id, target.ownerId));
        ownerName = l?.name ?? null;
      } else {
        const [o] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, target.ownerId));
        ownerName = o?.name ?? null;
      }
    }
    const settings = await getPayoutSettings();
    res.json({
      target,
      ownerName,
      settings,
      effective: {
        platformFeePct: album.payoutFeePctOverride ?? settings.platformFeePct,
        certCostCents: album.payoutCertCentsOverride ?? settings.certCostCents,
      },
      override: {
        payoutFeePctOverride: album.payoutFeePctOverride,
        payoutCertCentsOverride: album.payoutCertCentsOverride,
        payoutOwnerKind: album.payoutOwnerKind,
        payoutOwnerId: album.payoutOwnerId,
      },
    });
  });
}

function absoluteOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}`;
}
