// Task #543 — Held payout earmarks + Bill-only release queue.
//
// Every existing path that previously called `stripe.transfers.create`
// now mints a HELD `payout_earmarks` row instead and exits without
// touching Stripe. Bill (and only Bill) walks the queue at
// `/admin/payouts-release` and clicks Release on each row; that action
// is where the real Stripe transfer fires, with the earmark id as the
// idempotency key so a double-click can never double-pay.
//
// "Bill" is identified by env var `BILL_USER_ID` when set (preferred —
// avoids depending on email being lowercased the same way everywhere),
// falling back to the founder safety-net email `bill@gogoods.com` which
// the bootstrap guard in server/index.ts already uses. All other admins
// (including other super_admins) see the queue read-only.

import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { formatUsdCents } from "@shared/money";
import { db } from "./db";
import { pgArray } from "./lib/pgArray";
import {
  PAYOUT_EARMARK_OWNER_KINDS,
  PAYOUT_EARMARK_SOURCE_KINDS,
  albums,
  customerUsers,
  fulfillmentPartners,
  labels,
  manufacturers,
  organizations,
  orders,
  payoutEarmarks,
  people,
  users,
  vendors,
  type PayoutEarmark,
  type PayoutEarmarkOwnerKind,
  type PayoutEarmarkSourceKind,
} from "@shared/schema";
import { storage } from "./storage";

const BILL_FALLBACK_EMAIL = "bill@gogoods.com";

export function billUserIdEnv(): string | null {
  const v = (process.env.BILL_USER_ID || "").trim();
  return v.length > 0 ? v : null;
}

// Returns the user row for Bill (or null if neither the env var nor the
// founder-safety-net email lookup matches a user). Used by the release
// queue + daily digest so we always know which user id is authoritative.
export async function getBillUser(): Promise<{ id: string; email: string } | null> {
  const envId = billUserIdEnv();
  if (envId) {
    const [r] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, envId));
    if (r?.email) return r;
  }
  const r = await db.execute<any>(sql`
    SELECT id, email FROM users
     WHERE lower(email) = ${BILL_FALLBACK_EMAIL}
     LIMIT 1
  `);
  const row = ((r as any).rows ?? [])[0];
  if (!row) return null;
  return { id: row.id, email: row.email };
}

export async function isBill(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const envId = billUserIdEnv();
  if (envId && envId === userId) return true;
  const bill = await getBillUser();
  return bill?.id === userId;
}

// ── Earmark write helper ──────────────────────────────────────────────
//
// Every caller passes a per-source idempotency hint via `sourceRef`.
// We never INSERT twice for the same (sourceKind, sourceRef) in a
// non-terminal status — if one already exists we return it untouched.
// Terminal earmarks (released/rejected) for the *same* sourceRef can
// co-exist (e.g. a press invoice was rejected and re-submitted under
// a new invoiceKey → fresh held row).
export async function createEarmarkIfAbsent(
  input: {
    sourceKind: PayoutEarmarkSourceKind;
    sourceRef: string;
    albumId?: string | null;
    ownerKind: PayoutEarmarkOwnerKind;
    ownerId: string;
    amountCents: number;
    currency?: string;
    notes?: string | null;
  },
  // Optional transaction client. Pass a drizzle `tx` to make the
  // idempotent check + insert run inside the caller's transaction, so a
  // later failure in that transaction rolls the earmark back too. Defaults
  // to the module-level connection for standalone callers.
  exec: Pick<typeof db, "select" | "insert"> = db,
): Promise<PayoutEarmark> {
  // Short-circuit: a held earmark for this exact source already exists.
  const [existing] = await exec
    .select()
    .from(payoutEarmarks)
    .where(
      and(
        eq(payoutEarmarks.sourceKind, input.sourceKind),
        eq(payoutEarmarks.sourceRef, input.sourceRef),
        inArray(payoutEarmarks.status, ["held", "failed"]),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await exec
    .insert(payoutEarmarks)
    .values({
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      albumId: input.albumId ?? null,
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      amountCents: input.amountCents,
      currency: input.currency ?? "usd",
      status: "held",
      notes: input.notes ?? null,
    })
    .returning();
  console.log(
    `[earmark] held kind=${input.sourceKind} ref=${input.sourceRef} owner=${input.ownerKind}:${input.ownerId} amount=${input.amountCents}c id=${row.id}`,
  );
  return row;
}

// ── Cancel a held earmark (refund / supersession) ─────────────────────
//
// Marks the row rejected with a system-generated reason. Used by the
// commerce refund path and by `mintPressInvoiceTransfer` when a new
// invoice supersedes a still-held earlier one. No-op if the row is
// already terminal.
export async function cancelHeldEarmarksForSource(
  sourceKind: PayoutEarmarkSourceKind,
  sourceRef: string,
  reason: string,
): Promise<number> {
  const rows = await db
    .update(payoutEarmarks)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectionReason: reason,
    })
    .where(
      and(
        eq(payoutEarmarks.sourceKind, sourceKind),
        eq(payoutEarmarks.sourceRef, sourceRef),
        inArray(payoutEarmarks.status, ["held", "failed"]),
      ),
    )
    .returning({ id: payoutEarmarks.id });
  if (rows.length > 0) {
    console.log(
      `[earmark] auto-cancel kind=${sourceKind} ref=${sourceRef} n=${rows.length} reason=${JSON.stringify(reason)}`,
    );
  }
  return rows.length;
}

// ── Owner-name resolver for queue rendering / digest emails ───────────
//
// One row at a time keeps the join graph honest — the queue is a
// human review surface, not a hot fan-side path; per-row cost here
// is dominated by the Stripe round-trip on release anyway.
async function resolveOwnerName(
  kind: PayoutEarmarkOwnerKind,
  id: string,
): Promise<string | null> {
  try {
    if (kind === "person") {
      const [r] = await db.select({ name: people.name }).from(people).where(eq(people.id, id));
      return r?.name ?? null;
    }
    if (kind === "label") {
      const [r] = await db.select({ name: labels.name }).from(labels).where(eq(labels.id, id));
      return r?.name ?? null;
    }
    if (kind === "organization") {
      const [r] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, id));
      return r?.name ?? null;
    }
    if (kind === "manufacturer") {
      const [r] = await db.select({ name: manufacturers.name }).from(manufacturers).where(eq(manufacturers.id, id));
      return r?.name ?? null;
    }
    if (kind === "vendor") {
      const [r] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, id));
      return r?.name ?? null;
    }
    if (kind === "fulfillment") {
      const [r] = await db.select({ name: fulfillmentPartners.name }).from(fulfillmentPartners).where(eq(fulfillmentPartners.id, id));
      return r?.name ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveStripeAccountForOwner(
  kind: PayoutEarmarkOwnerKind,
  id: string,
): Promise<{ stripeAccountId: string; payoutsEnabled: boolean } | null> {
  const r = await db.execute<any>(sql`
    SELECT stripe_account_id, payouts_enabled
      FROM payout_accounts
     WHERE owner_kind = ${kind} AND owner_id = ${id}
     LIMIT 1
  `);
  const row = ((r as any).rows ?? [])[0];
  if (!row?.stripe_account_id) return null;
  return {
    stripeAccountId: row.stripe_account_id,
    payoutsEnabled: !!row.payouts_enabled,
  };
}

// ── Release one earmark (fires the actual Stripe transfer) ────────────
async function releaseEarmark(
  earmark: PayoutEarmark,
  releasedByUserId: string,
): Promise<{ ok: true; transferId: string } | { ok: false; reason: string }> {
  if (earmark.status === "released") {
    return { ok: true, transferId: earmark.stripeTransferId ?? "(unknown)" };
  }
  if (earmark.status === "rejected") {
    return { ok: false, reason: "Earmark was already rejected" };
  }
  const acct = await resolveStripeAccountForOwner(
    earmark.ownerKind as PayoutEarmarkOwnerKind,
    earmark.ownerId,
  );
  if (!acct) {
    const reason = "No Stripe Connect account on partner";
    await db.update(payoutEarmarks).set({ status: "failed", transferError: reason }).where(eq(payoutEarmarks.id, earmark.id));
    return { ok: false, reason };
  }
  if (!acct.payoutsEnabled) {
    const reason = "Stripe Connect account not yet payouts-enabled";
    await db.update(payoutEarmarks).set({ status: "failed", transferError: reason }).where(eq(payoutEarmarks.id, earmark.id));
    return { ok: false, reason };
  }
  try {
    const { getStripe } = await import("./stripe");
    const stripe = await getStripe();
    const transfer = await stripe.transfers.create(
      {
        amount: earmark.amountCents,
        currency: earmark.currency || "usd",
        destination: acct.stripeAccountId,
        transfer_group: `earmark_${earmark.sourceKind}_${earmark.sourceRef}`,
        metadata: {
          gt_earmark_id: earmark.id,
          gt_source_kind: earmark.sourceKind,
          gt_source_ref: earmark.sourceRef,
          gt_owner_kind: earmark.ownerKind,
          gt_owner_id: earmark.ownerId,
          gt_released_by: releasedByUserId,
        },
      },
      { idempotencyKey: `earmark_${earmark.id}` },
    );
    await db
      .update(payoutEarmarks)
      .set({
        status: "released",
        releasedAt: new Date(),
        releasedByUserId,
        stripeTransferId: transfer.id,
        transferError: null,
      })
      .where(eq(payoutEarmarks.id, earmark.id));
    await applySourceSideEffectsOnRelease(earmark, transfer.id);
    console.log(
      `[earmark] released id=${earmark.id} transfer=${transfer.id} amount=${earmark.amountCents}c by=${releasedByUserId}`,
    );
    return { ok: true, transferId: transfer.id };
  } catch (e: any) {
    const reason = e?.message ?? "Stripe transfer failed";
    await db
      .update(payoutEarmarks)
      .set({ status: "failed", transferError: reason })
      .where(eq(payoutEarmarks.id, earmark.id));
    console.log(`[earmark] release FAILED id=${earmark.id} reason=${JSON.stringify(reason)}`);
    return { ok: false, reason };
  }
}

// Per-sourceKind follow-up writes so the originating record reflects
// the just-released earmark. Keeps the legacy bookkeeping fields
// (orders.payoutTransferId, albums.press_invoice_transfer_id, etc.)
// in sync with the earmark queue.
async function applySourceSideEffectsOnRelease(earmark: PayoutEarmark, transferId: string): Promise<void> {
  if (earmark.sourceKind === "order_royalty") {
    await db
      .update(orders)
      .set({
        payoutStatus: "transferred",
        payoutTransferId: transferId,
        payoutAt: new Date(),
        payoutError: null,
      })
      .where(eq(orders.id, earmark.sourceRef));
    return;
  }
  if (earmark.sourceKind === "press_invoice" && earmark.albumId) {
    await db.execute(sql`
      UPDATE albums
         SET press_invoice_transfer_id           = ${transferId},
             press_invoice_transferred_at        = NOW(),
             press_invoice_transfer_amount_cents = ${earmark.amountCents},
             press_invoice_transfer_invoice_key  = ${earmark.sourceRef},
             press_invoice_transfer_error        = NULL
       WHERE id = ${earmark.albumId}
    `);
    // Task #534 — the press's captured invoice just got paid out, so
    // notify its configured recipients (invoice_paid). Best-effort; a
    // notification failure must never roll back the transfer bookkeeping.
    try {
      const { resolvePressIdForAlbum, dispatchPartnerNotification, partnerEmailHtml } =
        await import("./partnerNotifications");
      const pressId = await resolvePressIdForAlbum(earmark.albumId);
      if (pressId) {
        const r = await db.execute<any>(sql`
          SELECT a.title AS album_title, m.name AS press_name
          FROM albums a LEFT JOIN manufacturers m ON m.id = ${pressId}
          WHERE a.id = ${earmark.albumId} LIMIT 1
        `);
        const row = ((r as any).rows ?? [])[0];
        const albumTitle = row?.album_title ?? "an album";
        const pressName = row?.press_name ?? "your account";
        const dollars = formatUsdCents(earmark.amountCents, { noSymbol: true });
        const subject = `Payment sent: $${dollars} for ${albumTitle}`;
        const bodyLines = [
          `GoodTunes has transferred payment for your invoice on ${albumTitle}.`,
          `Amount: $${dollars}.`,
          "Funds settle to your connected payout account on the usual schedule.",
        ];
        await dispatchPartnerNotification({
          partnerKind: "manufacturer",
          partnerId: pressId,
          eventType: "invoice_paid",
          subject,
          html: partnerEmailHtml({ heading: "Invoice paid", bodyLines, partnerName: pressName }),
          text: bodyLines.join("\n\n"),
          payloadSnapshot: {
            albumId: earmark.albumId,
            pressId,
            albumTitle,
            amountCents: earmark.amountCents,
            transferId,
          },
        });
      }
    } catch (e) {
      console.log(`[notify] invoice-paid threw: ${(e as Error).message}`);
    }
    return;
  }
  if (earmark.sourceKind === "referral_credit") {
    // sourceRef is a comma-joined list of referral_credit ids the
    // payout cycle CLAIMed for this owner. FINALIZE them now.
    const ids = earmark.sourceRef.split(",").filter(Boolean);
    if (ids.length > 0) {
      await db.execute(sql`
        UPDATE referral_credits
           SET status            = 'paid',
               paid_at           = NOW(),
               payout_transfer_id = ${transferId},
               payout_error      = NULL
         WHERE id = ANY(${pgArray(ids, "varchar")})
           AND status = 'processing'
      `);
    }
    return;
  }
}

async function applySourceSideEffectsOnReject(earmark: PayoutEarmark, reason: string): Promise<void> {
  if (earmark.sourceKind === "order_royalty") {
    await db
      .update(orders)
      .set({ payoutStatus: "skipped", payoutError: `Rejected by Bill: ${reason}` })
      .where(eq(orders.id, earmark.sourceRef));
    return;
  }
  if (earmark.sourceKind === "press_invoice" && earmark.albumId) {
    await db.execute(sql`
      UPDATE albums
         SET press_invoice_transfer_error = ${`Rejected by Bill: ${reason}`}
       WHERE id = ${earmark.albumId}
    `);
    return;
  }
  if (earmark.sourceKind === "referral_credit") {
    // Hand the claimed rows back to the pending pool so the next
    // payout run re-batches them (mirrors the REVERT path in
    // server/referralPayouts.ts).
    const ids = earmark.sourceRef.split(",").filter(Boolean);
    if (ids.length > 0) {
      await db.execute(sql`
        UPDATE referral_credits
           SET status        = 'pending_payout',
               payout_run_id = NULL,
               payout_error  = ${`Rejected by Bill: ${reason}`}
         WHERE id = ANY(${pgArray(ids, "varchar")})
           AND status = 'processing'
      `);
    }
    return;
  }
}

// ── Daily digest email to Bill ────────────────────────────────────────
// Sends a single mail summarising every still-HELD earmark. Skipped if
// there are none (Bill doesn't need a daily "no work today" mail). The
// in-process tick that calls this is armed in server/index.ts.
let lastDigestSentAtMs = 0;

export async function sendBillDailyDigest(options?: { force?: boolean }): Promise<{ sent: boolean; reason?: string; count?: number; totalCents?: number }> {
  const bill = await getBillUser();
  if (!bill?.email) return { sent: false, reason: "Bill user not found" };
  const rows = await db
    .select()
    .from(payoutEarmarks)
    .where(eq(payoutEarmarks.status, "held"))
    .orderBy(payoutEarmarks.heldAt);
  if (rows.length === 0) return { sent: false, reason: "Nothing held — no digest" };
  // De-dupe runs within ~20h so a server restart doesn't double-mail.
  const now = Date.now();
  if (!options?.force && now - lastDigestSentAtMs < 20 * 60 * 60 * 1000) {
    return { sent: false, reason: "Digest already sent in the last 20h" };
  }
  const lines: string[] = [];
  let totalCents = 0;
  for (const r of rows) {
    const owner = await resolveOwnerName(r.ownerKind as PayoutEarmarkOwnerKind, r.ownerId);
    totalCents += r.amountCents;
    lines.push(
      `  $${(r.amountCents / 100).toFixed(2)} — ${r.sourceKind} → ${owner ?? `${r.ownerKind}:${r.ownerId.slice(0, 8)}`} (held ${r.heldAt.toISOString().slice(0, 10)})`,
    );
  }
  const { sendPayoutDigestToBill } = await import("./mail");
  const result = await sendPayoutDigestToBill(bill.email, rows.length, totalCents, lines);
  if (result.ok) {
    lastDigestSentAtMs = now;
    console.log(`[earmark-digest] sent to ${bill.email} count=${rows.length} total=${totalCents}c`);
    return { sent: true, count: rows.length, totalCents };
  }
  return { sent: false, reason: result.reason, count: rows.length, totalCents };
}

// ── HTTP routes ───────────────────────────────────────────────────────
const rejectBodySchema = z.object({
  reason: z.string().trim().min(3, "Reason is required").max(500),
});
const noteBodySchema = z.object({
  notes: z.string().trim().max(500),
});

export function registerPayoutEarmarkRoutes(app: Express) {
  const resolveAdmin = async (
    req: Request,
    res: Response,
  ): Promise<{ userId: string; isBill: boolean } | null> => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") {
      res.status(403).json({ message: "Admin only" });
      return null;
    }
    return { userId: a.userId, isBill: await isBill(a.userId) };
  };

  // List queue + summary. Anyone with an admin token can read; the
  // mutating endpoints below gate on Bill specifically.
  app.get("/api/admin/payout-earmarks", async (req, res) => {
    const ctx = await resolveAdmin(req, res);
    if (!ctx) return;
    const statusParam = String(req.query.status ?? "held").toLowerCase();
    const allowed = new Set(["held", "released", "rejected", "failed", "all"]);
    const status = allowed.has(statusParam) ? statusParam : "held";
    const rows = await db
      .select()
      .from(payoutEarmarks)
      .where(status === "all" ? sql`TRUE` : eq(payoutEarmarks.status, status))
      .orderBy(desc(payoutEarmarks.heldAt))
      .limit(500);
    const enriched = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        ownerName: await resolveOwnerName(r.ownerKind as PayoutEarmarkOwnerKind, r.ownerId),
        albumTitle: r.albumId
          ? (await db.select({ title: albums.title }).from(albums).where(eq(albums.id, r.albumId)))[0]?.title ?? null
          : null,
      })),
    );
    // Summary counts the *still-held* queue regardless of the filter so
    // the page header always shows the actionable backlog.
    const heldRows = await db
      .select({ amountCents: payoutEarmarks.amountCents })
      .from(payoutEarmarks)
      .where(eq(payoutEarmarks.status, "held"));
    const heldTotal = heldRows.reduce((s, r) => s + r.amountCents, 0);
    res.json({
      earmarks: enriched,
      heldCount: heldRows.length,
      heldTotalCents: heldTotal,
      viewerIsBill: ctx.isBill,
    });
  });

  // Release one. Bill only.
  app.post("/api/admin/payout-earmarks/:id/release", async (req, res) => {
    const ctx = await resolveAdmin(req, res);
    if (!ctx) return;
    if (!ctx.isBill) return res.status(403).json({ message: "Only Bill can release payouts" });
    const [row] = await db.select().from(payoutEarmarks).where(eq(payoutEarmarks.id, String(req.params.id)));
    if (!row) return res.status(404).json({ message: "Earmark not found" });
    if (row.status === "released") return res.json({ ok: true, earmark: row, alreadyReleased: true });
    const result = await releaseEarmark(row, ctx.userId);
    const [refreshed] = await db.select().from(payoutEarmarks).where(eq(payoutEarmarks.id, row.id));
    if (!result.ok) return res.status(502).json({ message: result.reason, earmark: refreshed });
    res.json({ ok: true, earmark: refreshed, transferId: result.transferId });
  });

  // Reject (held → rejected with reason). Bill only.
  app.post("/api/admin/payout-earmarks/:id/reject", async (req, res) => {
    const ctx = await resolveAdmin(req, res);
    if (!ctx) return;
    if (!ctx.isBill) return res.status(403).json({ message: "Only Bill can reject payouts" });
    const parsed = rejectBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid reason" });
    const [row] = await db.select().from(payoutEarmarks).where(eq(payoutEarmarks.id, String(req.params.id)));
    if (!row) return res.status(404).json({ message: "Earmark not found" });
    if (row.status !== "held" && row.status !== "failed") {
      return res.status(409).json({ message: `Cannot reject earmark in status=${row.status}` });
    }
    const [updated] = await db
      .update(payoutEarmarks)
      .set({
        status: "rejected",
        rejectedAt: new Date(),
        rejectedByUserId: ctx.userId,
        rejectionReason: parsed.data.reason,
      })
      .where(eq(payoutEarmarks.id, row.id))
      .returning();
    await applySourceSideEffectsOnReject(updated, parsed.data.reason);
    console.log(`[earmark] rejected id=${row.id} by=${ctx.userId} reason=${JSON.stringify(parsed.data.reason)}`);
    res.json({ ok: true, earmark: updated });
  });

  // Hold-longer = annotate the row with a note. Stays in held status.
  // Audit-friendly: the notes column is timestamped server-side via
  // the existing heldAt and the action shows up in the structured log.
  app.post("/api/admin/payout-earmarks/:id/hold-longer", async (req, res) => {
    const ctx = await resolveAdmin(req, res);
    if (!ctx) return;
    if (!ctx.isBill) return res.status(403).json({ message: "Only Bill can edit hold notes" });
    const parsed = noteBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid note" });
    const [row] = await db.select().from(payoutEarmarks).where(eq(payoutEarmarks.id, String(req.params.id)));
    if (!row) return res.status(404).json({ message: "Earmark not found" });
    if (row.status !== "held" && row.status !== "failed") {
      return res.status(409).json({ message: `Cannot annotate earmark in status=${row.status}` });
    }
    const [updated] = await db
      .update(payoutEarmarks)
      .set({ notes: parsed.data.notes.length > 0 ? parsed.data.notes : null })
      .where(eq(payoutEarmarks.id, row.id))
      .returning();
    console.log(`[earmark] hold-longer id=${row.id} by=${ctx.userId}`);
    res.json({ ok: true, earmark: updated });
  });

  // Manual digest fire (Bill only). Mostly for "did the email actually
  // go out today?" verification — the scheduler runs on its own daily
  // tick from server/index.ts.
  app.post("/api/admin/payout-earmarks/send-digest", async (req, res) => {
    const ctx = await resolveAdmin(req, res);
    if (!ctx) return;
    if (!ctx.isBill) return res.status(403).json({ message: "Only Bill can send the digest" });
    const result = await sendBillDailyDigest({ force: true });
    res.json(result);
  });
}

// Re-export the constant arrays so consumers don't need a second import.
export { PAYOUT_EARMARK_OWNER_KINDS, PAYOUT_EARMARK_SOURCE_KINDS };
// Silence unused-import warning for customer_users — referenced for
// potential future per-recipient surfaces and kept for parity with the
// owner-resolver expansion list.
void customerUsers;
