// Task #354 — Batched payout of accrued referral_credits to the
// artists / ambassadors / NPOs they were minted for.
//
// Splitter (server/commerce.ts) writes `referral_credits` rows in
// status='pending_payout' with `referrer_kind` + (referrer_person_id |
// referrer_org_id) but never moves them anywhere. This module groups
// pending rows by their resolved PayoutAccount and fires one Stripe
// Transfer per payee, marking the credits paid with the transfer id +
// timestamp so dashboard KPIs (Pending / Paid out) flip honestly.
//
// Resolution:
//   referrer_kind = 'artist'      → PayoutAccount(person,  referrer_person_id)
//   referrer_kind = 'non_profit'  → PayoutAccount(organization, referrer_org_id)
//
// An ambassador's credit lives on `people.id` (the splitter writes
// referrer_person_id) so it pays through the person → Stripe Express
// account on AdminPerson, same as any other artist referrer. NPOs gain
// an "organization" PayoutAccount via the panel added to AdminNonProfit.
//
// Idempotent under concurrency. Each run gets a unique run_id and
// claims rows in one atomic UPDATE that flips pending_payout →
// processing (stamping payout_run_id) so two overlapping runs can
// never see the same row as still-pending. The Stripe idempotency
// key is keyed on (run_id, owner_kind, owner_id) — overlapping runs
// claim disjoint row sets and so produce different transfers, never
// duplicate money for the same credit. On transfer success, claimed
// rows finalize to 'paid' filtered on (payout_run_id = run AND
// status = 'processing'); on transfer failure they revert to
// 'pending_payout' with payout_error and payout_run_id cleared so a
// later run can retry.
import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { getStripe } from "./stripe";
import { storage } from "./storage";

export type ReferralPayoutBatch = {
  ownerKind: "person" | "organization";
  ownerId: string;
  ownerName: string | null;
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
  currency: string;
  creditIds: string[];
  totalCents: number;
  units: number;
};

// ── Read pending credits + their resolved payout target ───────────────
// Returns one row per payee with the credit ids that would be batched.
// A NULL stripeAccountId means the partner doesn't have an account yet
// (or it isn't payouts_enabled) — these rows stay pending until the
// partner connects a Stripe Express account through PayoutAccountPanel.
export async function getPendingReferralBatches(): Promise<ReferralPayoutBatch[]> {
  const r = await db.execute<any>(sql`
    WITH pending AS (
      SELECT
        rc.id,
        rc.amount_cents,
        rc.units,
        rc.currency,
        CASE WHEN rc.referrer_kind = 'artist' THEN 'person'
             WHEN rc.referrer_kind = 'non_profit' THEN 'organization'
             ELSE NULL END                       AS owner_kind,
        COALESCE(rc.referrer_person_id, rc.referrer_org_id) AS owner_id
      FROM referral_credits rc
      WHERE rc.status = 'pending_payout'
    )
    SELECT
      p.owner_kind,
      p.owner_id,
      p.currency,
      SUM(p.amount_cents)::int AS total_cents,
      SUM(p.units)::int AS units,
      array_agg(p.id ORDER BY p.id) AS credit_ids,
      pa.stripe_account_id,
      pa.payouts_enabled,
      CASE p.owner_kind
        WHEN 'person'       THEN (SELECT name FROM people        WHERE id = p.owner_id)
        WHEN 'organization' THEN (SELECT name FROM organizations WHERE id = p.owner_id)
      END AS owner_name
    FROM pending p
    LEFT JOIN payout_accounts pa
      ON pa.owner_kind = p.owner_kind AND pa.owner_id = p.owner_id
    WHERE p.owner_kind IS NOT NULL AND p.owner_id IS NOT NULL
    GROUP BY p.owner_kind, p.owner_id, p.currency, pa.stripe_account_id, pa.payouts_enabled
    ORDER BY total_cents DESC
  `);
  const rows = (r as any).rows ?? [];
  return rows.map((row: any) => ({
    ownerKind: row.owner_kind,
    ownerId: row.owner_id,
    ownerName: row.owner_name ?? null,
    stripeAccountId: row.stripe_account_id ?? null,
    payoutsEnabled: !!row.payouts_enabled,
    currency: row.currency || "usd",
    creditIds: row.credit_ids ?? [],
    totalCents: row.total_cents ?? 0,
    units: row.units ?? 0,
  }));
}

export type RunReferralPayoutsResult = {
  attempted: number;
  paid: number;
  skipped: number;
  failed: number;
  totalCents: number;
  batches: Array<{
    ownerKind: string;
    ownerId: string;
    ownerName: string | null;
    status: "paid" | "skipped" | "failed";
    amountCents: number;
    creditCount: number;
    transferId?: string;
    error?: string;
  }>;
};

function idempotencyKeyFor(runId: string, ownerKind: string, ownerId: string): string {
  // Run-scoped key: same (runId, owner) retried after a transient
  // network error reuses Stripe's first transfer; a different run
  // (different runId) is, by construction, transferring a different
  // claimed credit set so it must get a fresh key.
  const h = crypto.createHash("sha256");
  h.update(runId).update("|").update(ownerKind).update("|").update(ownerId);
  return `refpayout_${h.digest("hex").slice(0, 40)}`;
}

// ── Run the payout cycle ──────────────────────────────────────────────
// Three-phase per payee:
//   1. CLAIM   — atomic UPDATE flips pending_payout → processing for
//                the still-pending rows belonging to this owner, stamps
//                payout_run_id, and RETURNS the actual claimed ids +
//                cents. Two concurrent runs cannot both claim the same
//                row (the WHERE status='pending_payout' loses for the
//                second writer; PG row locks serialize them).
//   2. TRANSFER— stripe.transfers.create against the claimed total,
//                keyed by (run_id, owner) so a retry of the *same* run
//                is idempotent on Stripe's side.
//   3. FINALIZE— success: processing → paid (filtered on run_id +
//                processing). Failure: revert processing → pending_payout
//                with payout_error stamped, payout_run_id cleared.
export async function runReferralPayouts(options?: {
  dryRun?: boolean;
}): Promise<RunReferralPayoutsResult> {
  const dryRun = !!options?.dryRun;
  const batches = await getPendingReferralBatches();
  const out: RunReferralPayoutsResult = {
    attempted: 0,
    paid: 0,
    skipped: 0,
    failed: 0,
    totalCents: 0,
    batches: [],
  };
  if (batches.length === 0) return out;
  const stripe = dryRun ? null : await getStripe();
  const runId = crypto.randomUUID();
  for (const b of batches) {
    out.attempted += 1;
    // Skip-without-claim paths: partner has no usable Stripe account.
    // Stamp the reason so operators can see it without re-querying.
    if (!b.stripeAccountId || !b.payoutsEnabled) {
      const reason = b.stripeAccountId
        ? "Stripe account exists but payouts are not enabled yet"
        : "No connected Stripe account";
      out.skipped += 1;
      out.batches.push({
        ownerKind: b.ownerKind,
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        status: "skipped",
        amountCents: b.totalCents,
        creditCount: b.creditIds.length,
        error: reason,
      });
      if (!dryRun) {
        await db.execute(sql`
          UPDATE referral_credits
             SET payout_error = ${reason}
           WHERE id = ANY(${b.creditIds}::varchar[])
             AND status = 'pending_payout'
        `);
      }
      continue;
    }
    if (dryRun) {
      // No claim, no transfer, no DB writes — just report the plan.
      out.batches.push({
        ownerKind: b.ownerKind,
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        status: b.totalCents > 0 ? "paid" : "skipped",
        amountCents: b.totalCents,
        creditCount: b.creditIds.length,
        transferId: b.totalCents > 0 ? "(dry-run)" : undefined,
        error: b.totalCents > 0 ? undefined : "Zero total — nothing to transfer",
      });
      if (b.totalCents <= 0) out.skipped += 1;
      continue;
    }
    // 1. CLAIM — atomically move this owner's still-pending rows into
    //    'processing' under this run_id, returning what we actually got.
    //    Two concurrent runs racing on the same payee both try the
    //    UPDATE; the later one finds 0 still-pending rows and gets an
    //    empty RETURNING set (treated as nothing-to-do, which is the
    //    correct, non-double-paying outcome).
    const claimed = await db.execute<any>(sql`
      UPDATE referral_credits
         SET status            = 'processing',
             payout_run_id     = ${runId},
             payout_owner_kind = ${b.ownerKind},
             payout_owner_id   = ${b.ownerId}
       WHERE status = 'pending_payout'
         AND id = ANY(${b.creditIds}::varchar[])
      RETURNING id, amount_cents
    `);
    const claimedRows = (claimed as any).rows ?? [];
    if (claimedRows.length === 0) {
      // Another run got there first — not an error, just no-op.
      out.skipped += 1;
      out.batches.push({
        ownerKind: b.ownerKind,
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        status: "skipped",
        amountCents: 0,
        creditCount: 0,
        error: "No rows claimed (concurrent run or already paid)",
      });
      continue;
    }
    const claimedIds: string[] = claimedRows.map((r: any) => r.id);
    const claimedCents: number = claimedRows.reduce(
      (s: number, r: any) => s + Number(r.amount_cents ?? 0),
      0,
    );
    if (claimedCents <= 0) {
      // Zero-value batch (e.g. press-style $0 credits) — mark paid
      // without a Stripe transfer; nothing to send.
      await db.execute(sql`
        UPDATE referral_credits
           SET status = 'paid', paid_at = now(), payout_error = NULL
         WHERE payout_run_id = ${runId}
           AND status        = 'processing'
           AND id = ANY(${claimedIds}::varchar[])
      `);
      out.skipped += 1;
      out.batches.push({
        ownerKind: b.ownerKind,
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        status: "skipped",
        amountCents: 0,
        creditCount: claimedIds.length,
        error: "Zero total — nothing to transfer",
      });
      continue;
    }
    // 2. EARMARK — Task #543. Instead of firing the Stripe transfer
    //    here, we leave the claimed referral_credits rows in
    //    'processing' status and mint a held earmark referencing them.
    //    Bill releases each owner's earmark from /admin/payouts-release;
    //    that endpoint fires the actual transfer and FINALIZEs the
    //    rows. Reject sends them back to 'pending_payout' (mirrors the
    //    legacy REVERT path).
    try {
      const { createEarmarkIfAbsent } = await import("./payoutEarmarks");
      const earmark = await createEarmarkIfAbsent({
        sourceKind: "referral_credit",
        sourceRef: claimedIds.join(","),
        ownerKind: b.ownerKind as any,
        ownerId: b.ownerId,
        amountCents: claimedCents,
        currency: b.currency,
        notes: `Run ${runId.slice(0, 8)} · ${claimedIds.length} credit(s)`,
      });
      void idempotencyKeyFor; // legacy Stripe-side idempotency helper; release path keys on earmark.id instead.
      void stripe; // unused now — release path resolves Stripe lazily
      out.paid += 1;
      out.totalCents += claimedCents;
      out.batches.push({
        ownerKind: b.ownerKind,
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        status: "paid",
        amountCents: claimedCents,
        creditCount: claimedIds.length,
        transferId: earmark.id,
      });
    } catch (e: any) {
      const msg = e?.message || "Earmark failed";
      // REVERT — give the claimed rows back so a later run retries.
      await db.execute(sql`
        UPDATE referral_credits
           SET status        = 'pending_payout',
               payout_run_id = NULL,
               payout_error  = ${msg}
         WHERE payout_run_id = ${runId}
           AND status        = 'processing'
           AND id = ANY(${claimedIds}::varchar[])
      `);
      out.failed += 1;
      out.batches.push({
        ownerKind: b.ownerKind,
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        status: "failed",
        amountCents: claimedCents,
        creditCount: claimedIds.length,
        error: msg,
      });
    }
  }
  return out;
}

// ── Admin route registrar ─────────────────────────────────────────────
// super-admin-only — preview pending groups and trigger a run. Cron
// integration is deliberately out of scope here; an external scheduler
// (or a future in-process tick like saleWindow.ts) POSTs the run
// endpoint on the monthly cycle.
export function registerReferralPayoutRoutes(app: Express) {
  const requireSuperAdmin = async (req: Request, res: Response, next: () => void) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") return res.status(401).json({ message: "Unauthorized" });
    const { getUserRole } = await import("./auth/roles");
    const info = await getUserRole(a.userId);
    if (!info || info.role !== "super_admin") return res.status(403).json({ message: "Super admin only" });
    next();
  };

  // GET — preview what a run would do (no Stripe calls).
  app.get("/api/admin/referral-payouts/pending", requireSuperAdmin, async (_req, res) => {
    try {
      const batches = await getPendingReferralBatches();
      res.json({
        batches,
        totalCents: batches.reduce((s, b) => s + b.totalCents, 0),
        payableCount: batches.filter((b) => b.stripeAccountId && b.payoutsEnabled && b.totalCents > 0).length,
        blockedCount: batches.filter((b) => !b.stripeAccountId || !b.payoutsEnabled).length,
      });
    } catch (err: any) {
      console.error("[GET /api/admin/referral-payouts/pending]", err);
      res.status(500).json({ message: err?.message || "Failed to load pending batches" });
    }
  });

  // POST — actually run the cycle. `dryRun` returns the plan without
  // hitting Stripe and without flipping any rows.
  app.post("/api/admin/referral-payouts/run", requireSuperAdmin, async (req, res) => {
    const dryRun = req.body?.dryRun === true;
    try {
      const result = await runReferralPayouts({ dryRun });
      res.json({ dryRun, ...result });
    } catch (err: any) {
      console.error("[POST /api/admin/referral-payouts/run]", err);
      res.status(500).json({ message: err?.message || "Run failed" });
    }
  });
}
