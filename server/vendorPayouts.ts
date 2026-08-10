// Task #3005 — Press (vendor) payouts via Stripe Connect.
//
// The Otis brief's "vendors" are presses/plants — the `manufacturers`
// table (NOT gear vendors, NOT GoodDeed print vendors). This module
// owns three super-admin-only surfaces:
//
//   1. Vendor payees — every press joined to its payout_accounts row,
//      with onboarding status derived truthfully (Invited → Onboarding
//      → Active) and a lazy live-retrieve sync while still pending
//      (mirrors the publisher lazy-sync; the account.updated Connect
//      webhook is fragile).
//   2. Invite / resend — create the Express account if absent, mint an
//      accountLink, and email it to the press.
//   3. Pay Vendor — a manual transfer from a project (album
//      manufacturing ledger) context: mints a `vendor_payout` earmark
//      (the per-project ledger row, reusing payout_earmarks) and
//      releases it IMMEDIATELY via the earmark-id-keyed idempotent
//      transfer, recording every attempt — success or failure — in
//      vendor_transfer_attempts with the acting admin.
//
// requireAdmin elsewhere admits ALL partner accounts; every route here
// gates explicitly on role === 'super_admin'.

import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  albums,
  manufacturers,
  manufacturerPaymentSteps,
  payoutAccounts,
  payoutEarmarks,
  vendorTransferAttempts,
  users,
  type PayoutAccount,
} from "@shared/schema";
import { storage } from "./storage";

// ── Onboarding status ladder ──────────────────────────────────────────
// none      → no payout_accounts row yet (press not invited)
// invited   → account exists, press hasn't submitted details
// onboarding→ details submitted, payouts not yet enabled
// active    → payoutsEnabled (only state in which we transfer)
export type VendorOnboardingStatus = "none" | "invited" | "onboarding" | "active";

export function onboardingStatusFor(acct: PayoutAccount | null | undefined): VendorOnboardingStatus {
  if (!acct) return "none";
  if (acct.payoutsEnabled) return "active";
  if (acct.detailsSubmitted) return "onboarding";
  return "invited";
}

// ── Super-admin gate ──────────────────────────────────────────────────
// Bearer-token admin auth (matches payouts.ts) + explicit super_admin
// role check — requireAdmin-style gates admit partners, which must
// never reach a money-movement surface.
export async function resolveSuperAdmin(
  req: Request,
  res: Response,
): Promise<{ userId: string } | null> {
  const auth = req.headers.authorization;
  let userId: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    const a = await storage.getAuthBy(auth.slice(7));
    if (a && a.kind === "admin") userId = a.userId;
  }
  if (!userId && req.session?.userId) userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const { getUserRole } = await import("./auth/roles");
  const info = await getUserRole(userId);
  if (!info || info.role !== "super_admin") {
    res.status(403).json({ message: "Super admin only" });
    return null;
  }
  return { userId };
}

// ── Lazy status sync while pending ────────────────────────────────────
// Live-retrieve any manufacturer account that isn't payouts-enabled yet
// (bounded, best-effort) so the list stays truthful even when the
// account.updated webhook never lands.
async function lazySyncPendingAccounts(accts: PayoutAccount[]): Promise<Map<string, PayoutAccount>> {
  const out = new Map<string, PayoutAccount>();
  const pending = accts.filter((a) => !a.payoutsEnabled).slice(0, 10);
  if (pending.length === 0) return out;
  try {
    const { getStripe } = await import("./stripe");
    const stripe = await getStripe();
    const { syncAccountFromStripe } = await import("./payouts");
    for (const a of pending) {
      try {
        const remote = await stripe.accounts.retrieve(a.stripeAccountId);
        const updated = await syncAccountFromStripe(remote);
        if (updated) out.set(a.id, updated);
      } catch {
        // best-effort: keep the stale local row
      }
    }
  } catch {
    // Stripe unavailable — serve local rows
  }
  return out;
}

// ── Pay Vendor core (testable, injectable Stripe seam) ───────────────
export interface PayVendorInput {
  albumId: string;
  manufacturerId: string;
  amountCents: number;
  actingUserId: string;
  requestId: string; // client-minted uuid for double-submit safety
}

export type PayVendorResult =
  | { ok: true; transferId: string; earmarkId: string }
  | { ok: false; status: number; message: string };

export async function payVendor(
  input: PayVendorInput,
  deps?: { stripe?: { transfers: { create: (params: any, opts: any) => Promise<{ id: string }> } } },
): Promise<PayVendorResult> {
  const { albumId, manufacturerId, amountCents, actingUserId, requestId } = input;

  const logAttempt = async (fields: {
    earmarkId?: string | null;
    status: "succeeded" | "failed";
    stripeTransferId?: string | null;
    errorMessage?: string | null;
  }) => {
    try {
      await db.insert(vendorTransferAttempts).values({
        albumId,
        manufacturerId,
        earmarkId: fields.earmarkId ?? null,
        amountCents,
        status: fields.status,
        stripeTransferId: fields.stripeTransferId ?? null,
        errorMessage: fields.errorMessage ?? null,
        actingUserId,
      });
    } catch (e) {
      console.error("[vendor-payout] attempt log failed:", (e as Error).message);
    }
  };

  // Server-side validation: album + press must exist, amount sane.
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 50_000_00) {
    return { ok: false, status: 400, message: "Amount must be between $0.01 and $50,000" };
  }
  const [album] = await db.select({ id: albums.id, title: albums.title }).from(albums).where(eq(albums.id, albumId));
  if (!album) return { ok: false, status: 404, message: "Album not found" };
  const [press] = await db
    .select({ id: manufacturers.id, name: manufacturers.name })
    .from(manufacturers)
    .where(and(eq(manufacturers.id, manufacturerId), isNull(manufacturers.deletedAt)));
  if (!press) return { ok: false, status: 404, message: "Press not found" };

  // Not-Active blocking: the press must have a payouts-enabled account.
  const [acct] = await db
    .select()
    .from(payoutAccounts)
    .where(and(eq(payoutAccounts.ownerKind, "manufacturer"), eq(payoutAccounts.ownerId, manufacturerId)));
  const status = onboardingStatusFor(acct);
  if (status !== "active") {
    await logAttempt({ status: "failed", errorMessage: `Press not payable — onboarding status is '${status}'` });
    return {
      ok: false,
      status: 409,
      message:
        status === "none"
          ? "This press has not been invited to Stripe onboarding yet"
          : "This press hasn't finished Stripe onboarding — payouts aren't enabled yet",
    };
  }

  // Double-submit safety: sourceRef keyed on the client requestId. A
  // retry of the same request returns the already-released earmark; a
  // held/failed one from a crashed earlier attempt is reused.
  const sourceRef = `manual_${requestId}`;
  const [prior] = await db
    .select()
    .from(payoutEarmarks)
    .where(
      and(
        eq(payoutEarmarks.sourceKind, "vendor_payout"),
        eq(payoutEarmarks.sourceRef, sourceRef),
        eq(payoutEarmarks.status, "released"),
      ),
    );
  if (prior) return { ok: true, transferId: prior.stripeTransferId ?? "(unknown)", earmarkId: prior.id };

  // Inbound payments this transfer draws from: paid manufacturing steps
  // for the same album (best-effort linkage for reconciliation).
  const paidSteps = await db
    .select({ id: manufacturerPaymentSteps.id })
    .from(manufacturerPaymentSteps)
    .where(and(eq(manufacturerPaymentSteps.albumId, albumId), eq(manufacturerPaymentSteps.status, "paid")));
  const inboundRefs = paidSteps.map((s) => s.id);

  // Mint (or reuse) the ledger earmark.
  const { createEarmarkIfAbsent } = await import("./payoutEarmarks");
  const earmark = await createEarmarkIfAbsent({
    sourceKind: "vendor_payout",
    sourceRef,
    albumId,
    ownerKind: "manufacturer",
    ownerId: manufacturerId,
    amountCents,
    notes: `Manual vendor payout by super admin`,
  });
  // Stamp audit fields the generic helper doesn't know about.
  await db
    .update(payoutEarmarks)
    .set({ createdByUserId: actingUserId, inboundRefs })
    .where(eq(payoutEarmarks.id, earmark.id));

  // Fire the transfer immediately, idempotency-keyed on the earmark id.
  try {
    let stripe = deps?.stripe;
    if (!stripe) {
      const { getStripe } = await import("./stripe");
      stripe = await getStripe();
    }
    const transfer = await stripe!.transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination: acct!.stripeAccountId,
        transfer_group: `vendor_payout_${albumId}`,
        metadata: {
          gt_earmark_id: earmark.id,
          gt_album_id: albumId,
          gt_manufacturer_id: manufacturerId,
          gt_acting_admin: actingUserId,
        },
      },
      { idempotencyKey: `earmark_${earmark.id}` },
    );
    await db
      .update(payoutEarmarks)
      .set({
        status: "released",
        releasedAt: new Date(),
        releasedByUserId: actingUserId,
        stripeTransferId: transfer.id,
        transferError: null,
      })
      .where(eq(payoutEarmarks.id, earmark.id));
    await logAttempt({ earmarkId: earmark.id, status: "succeeded", stripeTransferId: transfer.id });
    console.log(
      `[vendor-payout] released earmark=${earmark.id} transfer=${transfer.id} press=${manufacturerId} album=${albumId} amount=${amountCents}c by=${actingUserId}`,
    );
    return { ok: true, transferId: transfer.id, earmarkId: earmark.id };
  } catch (e: any) {
    // Surface the Stripe error cleanly (insufficient balance etc.) —
    // never a raw 500. Leave the earmark 'failed' so a retry can reuse it.
    const message = e?.message ?? "Stripe transfer failed";
    await db
      .update(payoutEarmarks)
      .set({ status: "failed", transferError: message })
      .where(eq(payoutEarmarks.id, earmark.id));
    await logAttempt({ earmarkId: earmark.id, status: "failed", errorMessage: message });
    console.log(`[vendor-payout] transfer FAILED earmark=${earmark.id} reason=${JSON.stringify(message)}`);
    return { ok: false, status: 502, message: `Stripe error: ${message}` };
  }
}

// ── Routes ────────────────────────────────────────────────────────────
export function registerVendorPayoutRoutes(app: Express) {
  // Vendor payees list — every (non-deleted) press joined to its payout
  // account + derived onboarding status, pending accounts lazily synced.
  app.get("/api/admin/vendor-payees", async (req, res) => {
    const ctx = await resolveSuperAdmin(req, res);
    if (!ctx) return;
    try {
      const presses = await db
        .select({ id: manufacturers.id, name: manufacturers.name, contactEmail: manufacturers.contactEmail })
        .from(manufacturers)
        .where(isNull(manufacturers.deletedAt))
        .orderBy(manufacturers.name);
      const accts = await db
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.ownerKind, "manufacturer"));
      const synced = await lazySyncPendingAccounts(accts);
      const byOwner = new Map<string, PayoutAccount>();
      for (const a of accts) byOwner.set(a.ownerId, synced.get(a.id) ?? a);
      res.json(
        presses.map((p) => {
          const acct = byOwner.get(p.id) ?? null;
          return {
            manufacturerId: p.id,
            name: p.name,
            contactEmail: p.contactEmail ?? null,
            account: acct
              ? {
                  id: acct.id,
                  email: acct.email,
                  payoutsEnabled: acct.payoutsEnabled,
                  detailsSubmitted: acct.detailsSubmitted,
                  disabledReason: acct.disabledReason,
                  requirementsDue: acct.requirementsDue ?? [],
                  onboardingEmailSentAt: acct.onboardingEmailSentAt,
                  onboardingEmailCount: acct.onboardingEmailCount,
                  lastSyncedAt: acct.lastSyncedAt,
                }
              : null,
            onboardingStatus: onboardingStatusFor(acct),
          };
        }),
      );
    } catch (e: any) {
      console.error("[GET /api/admin/vendor-payees]", e?.message, e);
      res.status(500).json({ message: e?.message ?? "Failed to load vendor payees" });
    }
  });

  // Invite / resend: create the Express account if absent, mint an
  // onboarding accountLink and email it to the press.
  const inviteSchema = z.object({ email: z.string().email().optional() });
  app.post("/api/admin/vendor-payees/:manufacturerId/invite", async (req, res) => {
    const ctx = await resolveSuperAdmin(req, res);
    if (!ctx) return;
    const parsed = inviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Invalid email" });
    const manufacturerId = String(req.params.manufacturerId);
    const [press] = await db
      .select({ id: manufacturers.id, name: manufacturers.name, contactEmail: manufacturers.contactEmail })
      .from(manufacturers)
      .where(and(eq(manufacturers.id, manufacturerId), isNull(manufacturers.deletedAt)));
    if (!press) return res.status(404).json({ message: "Press not found" });

    let [acct] = await db
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.ownerKind, "manufacturer"), eq(payoutAccounts.ownerId, manufacturerId)));
    const email = parsed.data.email ?? acct?.email ?? press.contactEmail ?? null;
    if (!email) {
      return res.status(400).json({ message: "No email on file for this press — provide one to send the onboarding link" });
    }
    try {
      const { getStripe } = await import("./stripe");
      const stripe = await getStripe();
      if (!acct) {
        const remote = await stripe.accounts.create({
          type: "express",
          country: "US",
          email,
          capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
          metadata: { gt_owner_kind: "manufacturer", gt_owner_id: manufacturerId },
        });
        const requirementsDue = [
          ...(remote.requirements?.currently_due ?? []),
          ...(remote.requirements?.past_due ?? []),
        ];
        [acct] = await db
          .insert(payoutAccounts)
          .values({
            ownerKind: "manufacturer",
            ownerId: manufacturerId,
            stripeAccountId: remote.id,
            country: "US",
            email,
            payoutsEnabled: !!remote.payouts_enabled,
            chargesEnabled: !!remote.charges_enabled,
            detailsSubmitted: !!remote.details_submitted,
            requirementsDue: Array.from(new Set(requirementsDue)),
            disabledReason: remote.requirements?.disabled_reason ?? null,
            lastSyncedAt: new Date(),
          })
          .returning();
      }
      if (acct!.payoutsEnabled) {
        return res.status(409).json({ message: "This press is already active — payouts are enabled" });
      }
      const origin = absoluteOrigin(req);
      const link = await stripe.accountLinks.create({
        account: acct!.stripeAccountId,
        refresh_url: `${origin}/admin/vendor-payees?refresh=${acct!.id}`,
        return_url: `${origin}/admin/vendor-payees?return=${acct!.id}`,
        type: "account_onboarding",
      });
      const { sendVendorOnboardingEmail } = await import("./mail");
      const sent = await sendVendorOnboardingEmail(email, press.name, link.url);
      if (!sent.ok) {
        return res.status(502).json({ message: `Onboarding link created but email failed: ${sent.reason ?? "unknown"}` });
      }
      const [updated] = await db
        .update(payoutAccounts)
        .set({
          email,
          onboardingEmailSentAt: new Date(),
          onboardingEmailCount: sql`${payoutAccounts.onboardingEmailCount} + 1`,
        })
        .where(eq(payoutAccounts.id, acct!.id))
        .returning();
      console.log(`[vendor-payout] onboarding email sent press=${manufacturerId} to=${email} by=${ctx.userId}`);
      res.json({ ok: true, account: updated, onboardingStatus: onboardingStatusFor(updated) });
    } catch (e: any) {
      res.status(502).json({ message: `Stripe error: ${e?.message ?? "invite failed"}` });
    }
  });

  // Pay Vendor — manual transfer from the album/project context.
  const paySchema = z.object({
    manufacturerId: z.string().min(1),
    amountCents: z.number().int().positive(),
    requestId: z.string().uuid(),
  });
  app.post("/api/admin/albums/:albumId/pay-vendor", async (req, res) => {
    const ctx = await resolveSuperAdmin(req, res);
    if (!ctx) return;
    const parsed = paySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const result = await payVendor({
      albumId: String(req.params.albumId),
      manufacturerId: parsed.data.manufacturerId,
      amountCents: parsed.data.amountCents,
      actingUserId: ctx.userId,
      requestId: parsed.data.requestId,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.json({ ok: true, transferId: result.transferId, earmarkId: result.earmarkId });
  });

  // Per-project vendor ledger — money in (paid manufacturing steps),
  // money out (manufacturer-owned earmarks for this album), and the
  // attempt-by-attempt audit trail.
  app.get("/api/admin/albums/:albumId/vendor-ledger", async (req, res) => {
    const ctx = await resolveSuperAdmin(req, res);
    if (!ctx) return;
    const albumId = String(req.params.albumId);
    try {
      const moneyIn = await db
        .select({
          id: manufacturerPaymentSteps.id,
          description: manufacturerPaymentSteps.description,
          amountCents: manufacturerPaymentSteps.amountCents,
          marginCents: manufacturerPaymentSteps.marginCents,
          status: manufacturerPaymentSteps.status,
          paymentMethod: manufacturerPaymentSteps.paymentMethod,
        })
        .from(manufacturerPaymentSteps)
        .where(and(eq(manufacturerPaymentSteps.albumId, albumId), eq(manufacturerPaymentSteps.status, "paid")))
        .orderBy(manufacturerPaymentSteps.sortOrder);
      const outRows = await db
        .select()
        .from(payoutEarmarks)
        .where(and(eq(payoutEarmarks.albumId, albumId), eq(payoutEarmarks.ownerKind, "manufacturer")))
        .orderBy(desc(payoutEarmarks.heldAt));
      const attempts = await db
        .select()
        .from(vendorTransferAttempts)
        .where(eq(vendorTransferAttempts.albumId, albumId))
        .orderBy(desc(vendorTransferAttempts.createdAt));
      // Resolve names for rendering (press + acting admin).
      const pressIds = Array.from(new Set([...outRows.map((r) => r.ownerId), ...attempts.map((a) => a.manufacturerId)]));
      const pressRows = pressIds.length
        ? await db.select({ id: manufacturers.id, name: manufacturers.name }).from(manufacturers).where(inArray(manufacturers.id, pressIds))
        : [];
      const pressName = new Map(pressRows.map((p) => [p.id, p.name]));
      const adminIds = Array.from(
        new Set(
          [...outRows.map((r) => r.createdByUserId), ...attempts.map((a) => a.actingUserId)].filter(Boolean) as string[],
        ),
      );
      const adminRows = adminIds.length
        ? await db.select({ id: users.id, email: users.email, username: users.username }).from(users).where(inArray(users.id, adminIds))
        : [];
      const adminName = new Map(adminRows.map((u) => [u.id, u.username || u.email || u.id]));
      const moneyInTotal = moneyIn.reduce((s, r) => s + r.amountCents + (r.marginCents ?? 0), 0);
      const moneyOut = outRows.map((r) => ({
        id: r.id,
        sourceKind: r.sourceKind,
        vendorName: pressName.get(r.ownerId) ?? r.ownerId,
        manufacturerId: r.ownerId,
        amountCents: r.amountCents,
        status: r.status,
        stripeTransferId: r.stripeTransferId,
        transferError: r.transferError,
        date: r.releasedAt ?? r.heldAt,
        initiatedBy: r.createdByUserId ? adminName.get(r.createdByUserId) ?? r.createdByUserId : null,
        inboundRefs: r.inboundRefs ?? [],
      }));
      const moneyOutTotal = moneyOut.filter((r) => r.status === "released").reduce((s, r) => s + r.amountCents, 0);
      res.json({
        moneyIn,
        moneyInTotalCents: moneyInTotal,
        moneyOut,
        moneyOutTotalCents: moneyOutTotal,
        attempts: attempts.map((a) => ({
          id: a.id,
          vendorName: pressName.get(a.manufacturerId) ?? a.manufacturerId,
          amountCents: a.amountCents,
          status: a.status,
          stripeTransferId: a.stripeTransferId,
          errorMessage: a.errorMessage,
          actingAdmin: adminName.get(a.actingUserId) ?? a.actingUserId,
          createdAt: a.createdAt,
        })),
      });
    } catch (e: any) {
      console.error("[GET vendor-ledger]", e?.message, e);
      res.status(500).json({ message: e?.message ?? "Failed to load vendor ledger" });
    }
  });
}

function absoluteOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}`;
}
