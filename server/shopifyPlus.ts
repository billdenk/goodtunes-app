// Task #2428 — GoodTunes Shopify+ (prepaid manufacturing) payment ledger.
//
// A `shopify_plus` album runs the full Direct production pipeline (press
// / GoodDeed / optional fulfillment) but the customer sells on their own
// Shopify store, so there is NO GoodTunes fan checkout or fan-sale pool.
// Instead the customer PREPAYS the manufacturing run through a staged
// payment ledger on the album's Payments tab:
//
//   album_manufacturer_quotes   — the plant's quote PDF(s), for records.
//   manufacturer_payment_steps  — an open-ended series of hand-keyed
//                                 steps (setup/test pressing, vinyl run,
//                                 overage & freight, fulfillment, the
//                                 GoodDeed legs). Each step is paid by a
//                                 PUSHED bank transfer (Stripe
//                                 customer_balance / us_bank_transfer —
//                                 virtual account details shown in-app,
//                                 Task #3004) or, as a fallback, a card
//                                 Checkout with the card fee added as a
//                                 disclosed line item. ACH debit
//                                 (us_bank_account) was removed.
//
// When a payment SETTLES into the platform balance we mint a HELD
// `payout_earmarks` row owed to the manufacturer for the step's cost
// (never the optional GoodTunes margin line). Bill releases that earmark
// from the existing /admin/payouts-release queue, which fires the real
// Stripe transfer to the plant's Connect account. This reuses the whole
// held-earmark → release rail rather than transferring inline.
//
// Auth: mirrors payoutEarmarks (Bearer admin token). Scope isolation is
// enforced per-album with checkPartnerVerbForScope("manage_payouts") so
// a partner (label / artist / manager) can only touch albums in their
// own scope; super_admin / admin pass. gateAlbumRoute is deliberately
// NOT used here because it reads req.session while the admin client
// authenticates with a Bearer token.

import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  albumManufacturerQuotes,
  albums,
  fulfillmentPartners,
  manufacturerPaymentSteps,
  payoutEarmarks,
  users,
  type ManufacturerPaymentStep,
} from "@shared/schema";
import { storage } from "./storage";
import { getStripe } from "./stripe";
import { createEarmarkIfAbsent } from "./payoutEarmarks";
import {
  resolveAlbumScope,
  checkPartnerVerbForScope,
} from "./auth/partnerPermissions";
import { absoluteOrigin } from "./certificates";
import { sql } from "drizzle-orm";
import { getUserRole, listSuperAdminEmails } from "./auth/roles";
import { sendPartnerNotificationEmail, notifySuperAdmins } from "./mail";
import { partnerEmailHtml } from "./partnerNotifications";
import { formatUsdCents } from "@shared/money";
import { cardFeeCents } from "@shared/breakEven";

// ── Task #3004 — inbound bank-transfer (push) payments ────────────────
// A transfer that lands a few dollars short (sender bank fees deducted
// in transit) still auto-closes the step when the shortfall is within
// this threshold. Config value; default $15 per the Otis brief.
export function getBankTransferUnderpaymentThresholdCents(): number {
  const raw = Number(process.env.BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1500;
}

// Shape we persist from Stripe's display_bank_transfer_instructions so
// the UI re-renders the virtual account details without a Stripe call.
export type FundingInstructions = {
  bankName: string | null;
  routingNumber: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  accountType: string | null;
  swiftCode: string | null;
  reference: string | null;
  amountCents: number;
  currency: string;
};

export function extractFundingInstructions(
  pi: any,
  amountCents: number,
): FundingInstructions | null {
  const d = pi?.next_action?.display_bank_transfer_instructions;
  if (!d) return null;
  const addrs: any[] = Array.isArray(d.financial_addresses)
    ? d.financial_addresses
    : [];
  const aba = addrs.find((a) => a?.type === "aba")?.aba ?? null;
  const swift = addrs.find((a) => a?.type === "swift")?.swift ?? null;
  return {
    bankName: aba?.bank_name ?? swift?.bank_name ?? null,
    routingNumber: aba?.routing_number ?? null,
    accountNumber: aba?.account_number ?? swift?.account_number ?? null,
    accountHolderName:
      aba?.account_holder_name ?? swift?.account_holder_name ?? null,
    accountType: aba?.account_type ?? null,
    // Note for a later SWIFT build: Stripe already returns a swift_code
    // on the same virtual account; international wires would only need
    // the UI + non-USD presentment work, not a new Stripe mechanism.
    swiftCode: swift?.swift_code ?? null,
    reference: d.reference ?? null,
    amountCents,
    currency: String(d.currency ?? "usd"),
  };
}

// Minimal Stripe surface the bank-transfer webhook logic needs —
// injected so tests drive reconciliation hermetically (mirrors the
// StepResetStripe seam below).
export type BankTransferStripe = {
  customers: {
    retrieve: (
      id: string,
      params?: any,
    ) => Promise<{ cash_balance?: { available?: Record<string, number> | null } | null }>;
    listCashBalanceTransactions: (
      id: string,
      params?: { limit?: number; starting_after?: string },
    ) => Promise<{
      data: Array<{
        id: string;
        type?: string | null;
        net_amount?: number | null;
        currency?: string | null;
        applied_to_payment?: {
          payment_intent?: string | { id?: string | null } | null;
        } | null;
        unapplied_from_payment?: {
          payment_intent?: string | { id?: string | null } | null;
        } | null;
      }>;
      has_more?: boolean;
    }>;
  };
  paymentIntents: {
    update: (id: string, params: any) => Promise<any>;
    confirm: (id: string) => Promise<{ status?: string | null }>;
    /** Authoritative re-read used to reconcile after an indeterminate
     *  (thrown) update/confirm — a network timeout can land AFTER Stripe
     *  applied the mutation. */
    retrieve: (
      id: string,
    ) => Promise<{
      amount?: number | null;
      amount_received?: number | null;
      status?: string | null;
    }>;
  };
};

// ── Quote-PDF total extraction (Task #2697) ───────────────────────────
// Best-effort: pull the dollar total out of an uploaded quote PDF's text.
// Looks for the LAST "total"-labelled dollar amount (quotes usually stack
// subtotal → freight → TOTAL), falling back to the largest dollar amount
// on the page. Returns integer cents or null; never throws.
export function extractQuoteTotalCents(text: string): number | null {
  if (!text) return null;
  const money = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(\.[0-9]{2})\b/g;
  const parse = (m: RegExpMatchArray): number | null => {
    const dollars = Number(m[1].replace(/,/g, ""));
    const cents = Number(m[2].slice(1));
    if (!Number.isFinite(dollars) || !Number.isFinite(cents)) return null;
    const v = dollars * 100 + cents;
    // Sanity band: a manufacturing run quote is between $10 and $1M.
    return v >= 1000 && v <= 100_000_000 ? v : null;
  };
  // Pass 1 — lines that mention "total" (but not "subtotal").
  let best: number | null = null;
  for (const line of text.split(/\n/)) {
    if (!/total/i.test(line) || /sub\s*-?\s*total/i.test(line)) continue;
    // Array.from — tsconfig targets ES5, direct iteration of matchAll fails tsc.
    for (const m of Array.from(line.matchAll(money))) {
      const v = parse(m as RegExpMatchArray);
      if (v != null) best = v; // keep the LAST total-labelled amount
    }
  }
  if (best != null) return best;
  // Pass 2 — largest dollar amount anywhere (requires an explicit $).
  for (const m of Array.from(
    text.matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(\.[0-9]{2})\b/g),
  )) {
    const v = parse(m as RegExpMatchArray);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

// Read an /objects/... quote PDF back out of storage and try to extract
// its total. Best-effort — any failure returns null.
async function tryExtractPdfTotalCents(fileUrl: string): Promise<number | null> {
  try {
    if (!fileUrl.startsWith("/objects/")) return null;
    const mod = await import("./replit_integrations/object_storage/objectStorage");
    const oss = new (mod as any).ObjectStorageService();
    const file = await oss.getObjectEntityFile(fileUrl);
    const [buf] = await file.download();
    // @ts-ignore — direct inner-module import (see import-lyrics handler).
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    return extractQuoteTotalCents(parsed.text || "");
  } catch (e) {
    console.warn(
      "[shopify-plus] quote PDF total extraction failed:",
      (e as Error)?.message ?? e,
    );
    return null;
  }
}

// ── Legacy quote-total recovery (Task #3455) ──────────────────────────
// Historical estimate rows uploaded before automatic total extraction
// carry totalCents NULL and were never activated. Given an album's quote
// rows (newest first, as the ledger read orders them), pick the first
// stored-PDF row missing a total whose PDF yields one. Selection and
// extraction are separated so tests can inject the extractor; the route
// persists the result. Only meaningful when the album has NO active
// estimate — callers must check that first.
export async function recoverLegacyQuoteTotal(
  quotes: { id: string; fileUrl: string; totalCents: number | null }[],
  extract: (fileUrl: string) => Promise<number | null> = tryExtractPdfTotalCents,
): Promise<{ quoteId: string; totalCents: number } | null> {
  const candidates = quotes
    .filter((q) => q.totalCents == null && q.fileUrl.startsWith("/objects/"))
    .slice(0, 3);
  for (const q of candidates) {
    const recovered = await extract(q.fileUrl);
    if (recovered != null && recovered > 0) {
      return { quoteId: q.id, totalCents: recovered };
    }
  }
  return null;
}

// ── System-computed manufacturing cost (Task #2697) ───────────────────
// The same figure the Package (Sell) tab shows for the run: effective
// per-unit manufacturing cost (broker-discounted snapshot when present,
// retail snapshot otherwise) × planned quantity, summed over active SKUs.
// Returns null when no SKU carries both a cost snapshot and a planned
// quantity — the ledger then falls back to summing the payment requests.
export async function computeSystemManufacturingCents(
  albumId: string,
): Promise<number | null> {
  const rows = await db.execute<{ total: string | null }>(sql`
    SELECT SUM(
      COALESCE(cost_snapshot_manufacturing_discounted_cents,
               cost_snapshot_manufacturing_cents) * planned_quantity
    )::bigint AS total
    FROM album_skus
    WHERE album_id = ${albumId}
      AND active = true
      AND planned_quantity IS NOT NULL AND planned_quantity > 0
      AND COALESCE(cost_snapshot_manufacturing_discounted_cents,
                   cost_snapshot_manufacturing_cents) IS NOT NULL
  `);
  const raw = ((rows as any).rows ?? [])[0]?.total;
  const total = raw == null ? null : Number(raw);
  return total != null && Number.isFinite(total) && total > 0 ? total : null;
}

// ── Payment-request notification (artist-direct steps) ────────────────
// When an operator posts an artist_direct payment step, email the album's
// owning artist/label scope members so they know there's something to pay.
// Best-effort: never throws, and a send failure must not break the insert.
async function notifyScopeOfPaymentRequest(opts: {
  req: Request;
  albumId: string;
  description: string;
  totalCents: number;
}): Promise<void> {
  try {
    const resolved = await resolveAlbumScope(opts.albumId);
    const scope = resolved?.scope ?? null;
    if (!scope) return; // unscoped album — operator-only, nobody to notify
    const [album] = await db
      .select({ title: albums.title })
      .from(albums)
      .where(eq(albums.id, opts.albumId));
    const albumTitle = (album as any)?.title ?? "your release";
    // Only notify members who actually hold manage_payouts on this scope:
    //  • scope owner (sub_role IS NULL) always self-serves manage_payouts
    //  • other members: COALESCE(per-user override, scope-wide flag, false)
    const r = await db.execute<{ email: string; username: string | null }>(sql`
      SELECT DISTINCT u.email, u.username
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN partner_permissions pp
             ON pp.scope_kind = m.scope_kind AND pp.scope_id = m.scope_id
      LEFT JOIN partner_permission_overrides ppo
             ON ppo.scope_kind = m.scope_kind AND ppo.scope_id = m.scope_id
            AND ppo.user_id = m.user_id AND ppo.verb = 'manage_payouts'
      WHERE m.scope_kind = ${scope.kind} AND m.scope_id = ${scope.id}
        AND u.email IS NOT NULL AND u.email <> ''
        AND (
          m.sub_role IS NULL
          OR COALESCE(ppo.granted, pp.manage_payouts, false) = true
        )
    `);
    const rows = ((r as any).rows ?? []) as { email: string; username: string | null }[];
    if (rows.length === 0) return;
    const origin = absoluteOrigin(opts.req);
    const portalUrl =
      scope.kind === "artist"
        ? `${origin}/artist/albums/${opts.albumId}?tab=payments`
        : `${origin}/admin/albums/${opts.albumId}?tab=payments`;
    const amount = formatUsdCents(opts.totalCents);
    const subject = `Payment requested: ${amount} for ${albumTitle}`;
    const bodyLines = [
      `GoodTunes has requested a manufacturing payment of ${amount} for ${albumTitle}.`,
      `Reason: ${opts.description}`,
      `Open the release's Payments tab to review and pay by bank transfer (ACH).`,
    ];
    const html = partnerEmailHtml({
      heading: "Payment requested",
      bodyLines,
      partnerName: albumTitle,
      cta: { label: "Review & pay", url: portalUrl },
    });
    const text = [...bodyLines, portalUrl].join("\n\n");
    const seen = new Set<string>();
    for (const row of rows) {
      const addr = row.email.trim().toLowerCase();
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      await sendPartnerNotificationEmail(row.email.trim(), subject, html, text);
    }
  } catch (e) {
    console.error(
      "[shopify-plus] payment-request notification failed:",
      (e as Error)?.message ?? e,
    );
  }
}

// ── Operator notification on ACH settlement (Task #2785) ──────────────
// When an artist_direct step's ACH debit settles, Bill needs to know
// that funds are held and ready to release to the plant. Best-effort.
async function notifyOperatorOfArtistPayment(opts: {
  stepId: string;
  albumId: string;
  description: string;
  amountCents: number;
}): Promise<void> {
  try {
    const r = await db.execute<{ title: string | null }>(sql`
      SELECT title FROM albums WHERE id = ${opts.albumId} LIMIT 1
    `);
    const albumTitle = (((r as any).rows ?? [])[0] as any)?.title ?? "an album";

    // Best-effort: resolve the payer name from the album scope's members.
    const resolved = await resolveAlbumScope(opts.albumId);
    const scope = resolved?.scope ?? null;
    let payerName = "Artist";
    if (scope) {
      const pr = await db.execute<{ name: string | null }>(sql`
        SELECT u.name FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.scope_kind = ${scope.kind} AND m.scope_id = ${scope.id}
          AND u.name IS NOT NULL
        LIMIT 1
      `);
      const pName = (((pr as any).rows ?? [])[0] as any)?.name;
      if (pName) payerName = String(pName);
    }

    const amount = formatUsdCents(opts.amountCents);
    const superEmails = await listSuperAdminEmails();
    const subject = `${payerName} paid ${amount} for ${albumTitle} — funds held`;
    const bodyLines = [
      `${payerName} paid ${amount} for "${opts.description}" on ${albumTitle}.`,
      `Funds are held in the earmark queue — ready to release to the plant.`,
    ];
    const html = partnerEmailHtml({
      heading: "Funds received — held for release",
      bodyLines,
      partnerName: "GoodTunes",
    });
    const text = bodyLines.join("\n\n");
    await notifySuperAdmins({
      template: "shopify-plus-ach-settled",
      recipients: superEmails,
      dedupeKey: `ach-settled:${opts.stepId}`,
      send: async (email) =>
        sendPartnerNotificationEmail(email, subject, html, text),
    });
  } catch (e) {
    console.error(
      "[shopify-plus] operator ACH-settled notification failed:",
      (e as Error)?.message ?? e,
    );
  }
}

// ── Manufacturer resolution ───────────────────────────────────────────
// Which plant this album's manufacturing run pays. Resolved the same way
// the Sell panel / SKU pricing resolve the invited press (artist wins
// over label), falling back to a live pressing-order-request when the
// album is homed but the invite stamp is missing.
export async function resolveAlbumManufacturer(
  albumId: string,
): Promise<{ id: string; name: string } | null> {
  const album = await storage.getAlbumById(albumId, { includeHidden: true });
  if (!album) return null;

  let pressId: string | null = null;
  if (album.primaryArtistId) {
    const p = await storage.getPersonById(album.primaryArtistId);
    if (p && (p as any).invitedByPressId) pressId = String((p as any).invitedByPressId);
  }
  if (!pressId && album.labelId) {
    const l = await storage.getLabelById(album.labelId);
    if (l && (l as any).invitedByPressId) pressId = String((l as any).invitedByPressId);
  }
  if (!pressId) {
    // Last resort: the press on the album's live pressing-order-request.
    const { resolvePressIdForAlbum } = await import("./partnerNotifications");
    pressId = await resolvePressIdForAlbum(albumId);
  }
  if (!pressId) return null;

  const m = await storage.getManufacturerById(pressId);
  if (!m) return null;
  return { id: String((m as any).id), name: String((m as any).name ?? "Manufacturer") };
}

// ── Webhook handling ──────────────────────────────────────────────────
// Marking a step paid + minting its earmark is one idempotent unit keyed
// by the step id, callable from both checkout.session.async_payment_succeeded
// and payment_intent.succeeded (belt-and-suspenders — either can arrive
// first, and both carry gt_kind metadata).
// Task #3004 — artist-facing confirmation when their bank transfer (or
// card payment) reconciles. Best-effort; mirrors notifyScopeOfPaymentRequest
// but without a request context (webhook), so no CTA link is included.
async function notifyScopeOfPaymentReceived(opts: {
  albumId: string;
  description: string;
  totalCents: number;
}): Promise<void> {
  try {
    const resolved = await resolveAlbumScope(opts.albumId);
    const scope = resolved?.scope ?? null;
    if (!scope) return;
    const [album] = await db
      .select({ title: albums.title })
      .from(albums)
      .where(eq(albums.id, opts.albumId));
    const albumTitle = (album as any)?.title ?? "your release";
    const r = await db.execute<{ email: string }>(sql`
      SELECT DISTINCT u.email
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN partner_permissions pp
             ON pp.scope_kind = m.scope_kind AND pp.scope_id = m.scope_id
      LEFT JOIN partner_permission_overrides ppo
             ON ppo.scope_kind = m.scope_kind AND ppo.scope_id = m.scope_id
            AND ppo.user_id = m.user_id AND ppo.verb = 'manage_payouts'
      WHERE m.scope_kind = ${scope.kind} AND m.scope_id = ${scope.id}
        AND u.email IS NOT NULL AND u.email <> ''
        AND (
          m.sub_role IS NULL
          OR COALESCE(ppo.granted, pp.manage_payouts, false) = true
        )
    `);
    const rows = ((r as any).rows ?? []) as { email: string }[];
    if (rows.length === 0) return;
    const amount = formatUsdCents(opts.totalCents);
    const subject = `Payment received: ${amount} for ${albumTitle}`;
    const bodyLines = [
      `We received your payment of ${amount} for "${opts.description}" on ${albumTitle}.`,
      `The payment step is now marked Paid on the release's Payments tab. Nothing else is needed from you.`,
    ];
    const html = partnerEmailHtml({
      heading: "Payment received",
      bodyLines,
      partnerName: albumTitle,
    });
    const text = bodyLines.join("\n\n");
    const seen = new Set<string>();
    for (const row of rows) {
      const addr = row.email.trim().toLowerCase();
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      await sendPartnerNotificationEmail(row.email.trim(), subject, html, text);
    }
  } catch (e) {
    console.error(
      "[shopify-plus] payment-received notification failed:",
      (e as Error)?.message ?? e,
    );
  }
}

async function markStepPaid(
  stepId: string,
  paymentIntentId: string | null,
  opts?: { amountReceivedCents?: number },
) {
  const [step] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, stepId));
  if (!step) {
    console.warn(`[shopify-plus] paid webhook for unknown step ${stepId}`);
    return;
  }
  if (step.status === "paid") return; // idempotent

  const manufacturerId =
    step.manufacturerId ?? (await resolveAlbumManufacturer(step.albumId))?.id ?? null;

  // Mint the held earmark for the amount OWED to the plant only (never
  // the GoodTunes margin line). Idempotent on (sourceKind, sourceRef).
  let earmarkId: string | null = step.earmarkId ?? null;
  if (manufacturerId && step.amountCents > 0) {
    try {
      const earmark = await createEarmarkIfAbsent({
        sourceKind: "shopify_plus_step",
        sourceRef: step.id,
        albumId: step.albumId,
        ownerKind: "manufacturer",
        ownerId: manufacturerId,
        amountCents: step.amountCents,
        notes: `Shopify+ manufacturing: ${step.description}`,
      });
      earmarkId = earmark.id;
    } catch (e) {
      console.error(
        `[shopify-plus] earmark mint failed for step ${step.id}:`,
        (e as Error)?.message ?? e,
      );
    }
  }

  // Task #3004 — record what actually arrived. A full payment records the
  // step total; an under-threshold short transfer records the (smaller)
  // received amount so operators can see the shortfall on the row.
  const receivedCents =
    opts?.amountReceivedCents ??
    (step.amountReceivedCents > 0
      ? step.amountReceivedCents
      : step.amountCents + step.marginCents);

  await db
    .update(manufacturerPaymentSteps)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId ?? step.stripePaymentIntentId,
      manufacturerId: manufacturerId ?? step.manufacturerId,
      amountReceivedCents: receivedCents,
      earmarkId,
      lastError: null,
    })
    .where(eq(manufacturerPaymentSteps.id, step.id));
  console.log(`[shopify-plus] step ${step.id} → paid (earmark ${earmarkId ?? "none"})`);

  // Task #2785 — notify Bill when an artist_direct payment settles so he
  // knows funds are held and ready to release to the plant. Best-effort.
  if ((step as any).fundingSource === "artist_direct") {
    void notifyOperatorOfArtistPayment({
      stepId: step.id,
      albumId: step.albumId,
      description: step.description,
      amountCents: step.amountCents,
    });
    // Task #3004 — and confirm to the artist that we received their funds.
    void notifyScopeOfPaymentReceived({
      albumId: step.albumId,
      description: step.description,
      totalCents: receivedCents,
    });
  }
}

async function markStepProcessing(
  stepId: string,
  sessionId: string | null,
  paymentIntentId: string | null,
) {
  const [step] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, stepId));
  if (!step || step.status === "paid") return;
  await db
    .update(manufacturerPaymentSteps)
    .set({
      status: "processing",
      stripeCheckoutSessionId: sessionId ?? step.stripeCheckoutSessionId,
      stripePaymentIntentId: paymentIntentId ?? step.stripePaymentIntentId,
      lastError: null,
    })
    .where(eq(manufacturerPaymentSteps.id, step.id));
  console.log(`[shopify-plus] step ${step.id} → processing`);
}

async function markStepFailed(stepId: string, reason: string) {
  const [step] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, stepId));
  if (!step || step.status === "paid") return;
  await db
    .update(manufacturerPaymentSteps)
    .set({ status: "unpaid", lastError: reason.slice(0, 500) })
    .where(eq(manufacturerPaymentSteps.id, step.id));
  console.log(`[shopify-plus] step ${step.id} → unpaid (failed: ${reason})`);
}

// Free a step that was claimed for a Checkout attempt the customer then
// abandoned (closed the tab / never submitted the bank debit). Stripe fires
// checkout.session.expired only for sessions that were NEVER completed, so a
// match here is always a dead attempt — but we still guard on the session id
// and a null payment intent so we can never clobber a real in-flight debit.
async function releaseAbandonedStep(stepId: string, sessionId: string) {
  const [step] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, stepId));
  if (!step) return;
  if (
    step.status === "processing" &&
    step.stripeCheckoutSessionId === sessionId &&
    !step.stripePaymentIntentId
  ) {
    await db
      .update(manufacturerPaymentSteps)
      .set({ status: "unpaid", lastError: null })
      .where(eq(manufacturerPaymentSteps.id, step.id));
    console.log(`[shopify-plus] step ${step.id} → unpaid (checkout expired)`);
  }
}

// ── Task #2929 — operator reset for a stuck "Paying" step ─────────────
// Clicking Pay flips a step to `processing` the moment the Stripe ACH
// Checkout Session is minted; if the payer abandons the checkout the step
// is stuck on "Paying" until checkout.session.expired fires (and forever
// if that webhook is missed). This lets an operator expire the session and
// return the step to payable — but it REFUSES whenever the session has
// completed or a payment intent is actually moving money, so a real
// in-flight ACH debit is never silently orphaned.
//
// The Stripe surface is injected so tests can drive it hermetically
// (mirrors the materializeOrderFromSession {stripe} seam).
export type StepResetStripe = {
  checkout: {
    sessions: {
      retrieve: (id: string) => Promise<{
        status?: string | null;
        payment_status?: string | null;
        payment_intent?: string | { id: string; status?: string } | null;
      }>;
      expire: (id: string) => Promise<unknown>;
    };
  };
  paymentIntents: {
    retrieve: (id: string) => Promise<{ status?: string | null }>;
  };
};

export type StepResetResult =
  | { ok: true; step: ManufacturerPaymentStep }
  | { ok: false; status: number; message: string };

// Payment-intent states where real money is (or already has been) moving.
const PI_IN_FLIGHT = new Set(["processing", "succeeded", "requires_capture"]);

export async function resetStuckPaymentStep(opts: {
  albumId: string;
  stepId: string;
  /** Caller's resolved primary role — only operators may reset. */
  callerRole: string | null;
  stripe: StepResetStripe;
}): Promise<StepResetResult> {
  const { albumId, stepId, callerRole, stripe } = opts;
  if (callerRole !== "super_admin" && callerRole !== "admin") {
    return {
      ok: false,
      status: 403,
      message: "Only GoodTunes operators can cancel a payment link.",
    };
  }

  const [step] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, stepId));
  if (!step || step.albumId !== albumId) {
    return { ok: false, status: 404, message: "Step not found" };
  }
  if (step.status !== "processing") {
    return {
      ok: false,
      status: 409,
      message: `Only a step that's currently Paying can be reset (this one is ${step.status}).`,
    };
  }

  // 1) A payment intent stored on the step means the webhook saw money
  //    moving — check its live state before touching anything.
  let intentId: string | null = step.stripePaymentIntentId ?? null;

  // 2) Check the checkout session itself.
  if (step.stripeCheckoutSessionId) {
    let session: Awaited<
      ReturnType<StepResetStripe["checkout"]["sessions"]["retrieve"]>
    > | null = null;
    try {
      session = await stripe.checkout.sessions.retrieve(
        step.stripeCheckoutSessionId,
      );
    } catch (e: any) {
      // FAIL CLOSED unless Stripe positively says the session doesn't
      // exist (resource_missing — e.g. test/live key drift on a dev
      // clone). A transient network/auth error means we can't prove the
      // payment isn't completing, so we must not reset.
      const missing =
        e?.code === "resource_missing" ||
        (e?.statusCode === 404 && e?.type === "StripeInvalidRequestError");
      if (!missing) {
        return {
          ok: false,
          status: 502,
          message: `Couldn't verify the checkout session's state at Stripe (${e?.message ?? "error"}) — not resetting.`,
        };
      }
      console.warn(
        `[shopify-plus] reset: session ${step.stripeCheckoutSessionId} unknown to Stripe (resource_missing) — treating as dead`,
      );
    }
    if (session) {
      if (session.status === "complete" || session.payment_status === "paid") {
        return {
          ok: false,
          status: 409,
          message:
            "This payment was actually completed at Stripe — it can't be reset. If the step hasn't flipped to Paid yet, the webhook is still catching up.",
        };
      }
      const sessionIntent =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      if (sessionIntent) intentId = sessionIntent;
    }
    // Verify any known payment intent isn't mid-debit before expiring.
    if (intentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(intentId);
        if (pi?.status && PI_IN_FLIGHT.has(pi.status)) {
          return {
            ok: false,
            status: 409,
            message: `A bank debit for this step is ${pi.status === "succeeded" ? "already settled" : "in flight"} at Stripe — it can't be reset. Wait for the webhook to finish it.`,
          };
        }
      } catch (e: any) {
        return {
          ok: false,
          status: 502,
          message: `Couldn't verify the payment's state at Stripe (${e?.message ?? "error"}) — not resetting.`,
        };
      }
    }
    if (session && session.status === "open") {
      try {
        await stripe.checkout.sessions.expire(step.stripeCheckoutSessionId);
      } catch (e: any) {
        // Expire refuses on a session that is no longer open — which
        // includes one that COMPLETED between our retrieve and now. Fail
        // closed: re-retrieve and only proceed if the session is now
        // positively expired (or gone); anything else refuses the reset.
        let recheck: typeof session | null = null;
        try {
          recheck = await stripe.checkout.sessions.retrieve(
            step.stripeCheckoutSessionId,
          );
        } catch (re: any) {
          if (re?.code !== "resource_missing") {
            return {
              ok: false,
              status: 502,
              message: `Couldn't expire or re-verify the checkout session at Stripe (${e?.message ?? "error"}) — not resetting.`,
            };
          }
        }
        if (recheck && recheck.status !== "expired") {
          return {
            ok: false,
            status: 409,
            message:
              "The checkout session changed state while cancelling (it may have just been completed) — not resetting. Refresh to see the step's status.",
          };
        }
      }
    }
  } else if (intentId) {
    // No session id but an intent — same in-flight guard.
    try {
      const pi = await stripe.paymentIntents.retrieve(intentId);
      if (pi?.status && PI_IN_FLIGHT.has(pi.status)) {
        return {
          ok: false,
          status: 409,
          message:
            "A bank debit for this step is in flight at Stripe — it can't be reset.",
        };
      }
    } catch (e: any) {
      return {
        ok: false,
        status: 502,
        message: `Couldn't verify the payment's state at Stripe (${e?.message ?? "error"}) — not resetting.`,
      };
    }
  }

  // Guarded flip: only while the step is EXACTLY as we verified it —
  // still processing, still pointing at the same checkout session, and
  // with the payment-intent column unchanged. A webhook that raced us
  // (marked it paid, or attached a fresh payment intent) changes one of
  // those and wins; we bail instead of clobbering live Stripe IDs.
  const [reset] = await db
    .update(manufacturerPaymentSteps)
    .set({
      status: "unpaid",
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      lastError: null,
    })
    .where(
      and(
        eq(manufacturerPaymentSteps.id, step.id),
        eq(manufacturerPaymentSteps.status, "processing"),
        step.stripeCheckoutSessionId
          ? eq(
              manufacturerPaymentSteps.stripeCheckoutSessionId,
              step.stripeCheckoutSessionId,
            )
          : isNull(manufacturerPaymentSteps.stripeCheckoutSessionId),
        step.stripePaymentIntentId
          ? eq(
              manufacturerPaymentSteps.stripePaymentIntentId,
              step.stripePaymentIntentId,
            )
          : isNull(manufacturerPaymentSteps.stripePaymentIntentId),
      ),
    )
    .returning();
  if (!reset) {
    return {
      ok: false,
      status: 409,
      message:
        "The step's status changed while resetting (likely the payment just settled) — refresh to see it.",
    };
  }
  console.log(
    `[shopify-plus] step ${step.id} → unpaid (operator reset, session ${step.stripeCheckoutSessionId ?? "none"})`,
  );
  return { ok: true, step: reset };
}

// ── Task #3380 — operator accepts a partial bank transfer as paid ─────
// A pushed transfer that lands short by MORE than the automatic
// underpayment threshold leaves the step stuck on "Awaiting transfer"
// forever (Stripe auto-returns unapplied cash-balance funds after ~75
// days). When the shortfall is deliberate and legitimate (e.g. the payer
// deducted an already-paid deposit because the request over-asked), an
// OPERATOR can accept what actually arrived as payment in full: shrink
// the PaymentIntent to the received amount, confirm it from the
// customer's cash balance (the same mechanics as the under-threshold
// auto-close), and settle the step via the idempotent paid path.
//
// The step's recorded total is adjusted DOWN to the accepted amount so
// the ledger's Paid/Outstanding math reconciles with what was actually
// collected — the GoodTunes margin line is preserved when the received
// funds cover it; the plant leg absorbs the reduction (the over-ask was
// plant money counted twice, and the held earmark must only ever hold
// what we really collected for the plant).
//
// Fails closed on any Stripe error; never marks paid unless Stripe
// positively confirms the payment succeeded. The Stripe surface is
// injected for hermetic tests (same shape as the webhook's
// BankTransferStripe seam).
export type AcceptPartialResult =
  | {
      ok: true;
      step: ManufacturerPaymentStep;
      acceptedCents: number;
      forgivenCents: number;
    }
  | { ok: false; status: number; message: string };

export async function acceptPartialTransferAsPaid(opts: {
  albumId: string;
  stepId: string;
  /** Caller's resolved primary role — operators only, never partners. */
  callerRole: string | null;
  stripe: BankTransferStripe;
  /** Hermetic-test-only DB failure injection; ignored outside GT_TEST. */
  testFailpoint?: "totals-restore" | "mark-paid";
}): Promise<AcceptPartialResult> {
  const { albumId, stepId, callerRole, stripe, testFailpoint } = opts;
  if (callerRole !== "super_admin" && callerRole !== "admin") {
    return {
      ok: false,
      status: 403,
      message:
        "Only GoodTunes operators can accept a partial transfer as payment in full.",
    };
  }

  const [step] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, stepId));
  if (!step || step.albumId !== albumId) {
    return { ok: false, status: 404, message: "Step not found" };
  }
  if (step.status === "paid") {
    return { ok: false, status: 409, message: "This step is already paid." };
  }
  if (step.status !== "awaiting_transfer") {
    return {
      ok: false,
      status: 409,
      message: `Only a step that's Awaiting transfer can be settled this way (this one is ${step.status}).`,
    };
  }
  const piId = step.stripePaymentIntentId;
  if (!piId) {
    return {
      ok: false,
      status: 409,
      message: "This step has no Stripe payment to settle.",
    };
  }

  const dueCents = step.amountCents + step.marginCents;

  // What's actually received comes from Stripe LIVE:
  //   1. amount_received on THIS partially-funded PaymentIntent (Stripe has
  //      sometimes already allocated the transfer);
  //   2. the net customer-cash transactions Stripe explicitly binds to THIS PI;
  //   3. otherwise the customer's unallocated USD cash balance, but only when
  //      this is the customer's sole awaiting-transfer step.
  // payerDetails is display/audit data only: its webhook lacks PI metadata and
  // matches by newest open step, so it is never authoritative for settlement.
  if (!step.stripeCustomerId) {
    return {
      ok: false,
      status: 409,
      message: "This step has no Stripe customer to read funds from.",
    };
  }
  let receivedCents = 0;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    const piReceived = pi?.amount_received;
    if (
      typeof piReceived !== "number" ||
      !Number.isSafeInteger(piReceived) ||
      piReceived < 0
    ) {
      return {
        ok: false,
        status: 502,
        message:
          "Stripe returned an incomplete payment balance — nothing was changed. Retry once Stripe is reachable.",
      };
    }
    receivedCents = piReceived;
  } catch (e: any) {
    return {
      ok: false,
      status: 502,
      message: `Couldn't read the payment at Stripe (${e?.message ?? "error"}) — nothing was changed. Retry once Stripe is reachable.`,
    };
  }

  if (receivedCents <= 0) {
    try {
      let startingAfter: string | undefined;
      let piAppliedCents = 0;
      const seenTransactionIds = new Set<string>();
      for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
        const page = await stripe.customers.listCashBalanceTransactions(
          step.stripeCustomerId,
          {
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          },
        );
        if (
          !Array.isArray(page?.data) ||
          typeof page.has_more !== "boolean"
        ) {
          throw new Error("Stripe returned an incomplete transaction list");
        }
        for (const txn of page.data) {
          if (typeof txn?.id !== "string" || !txn.id) {
            throw new Error("Stripe returned a transaction without an ID");
          }
          if (seenTransactionIds.has(txn.id)) {
            throw new Error("Stripe returned a duplicate transaction");
          }
          seenTransactionIds.add(txn.id);
          if (
            txn.type !== "applied_to_payment" &&
            txn.type !== "unapplied_from_payment"
          ) {
            continue;
          }
          const relation =
            txn.type === "applied_to_payment"
              ? txn.applied_to_payment?.payment_intent
              : txn.unapplied_from_payment?.payment_intent;
          const relatedPi =
            typeof relation === "string" ? relation : relation?.id ?? null;
          if (typeof relatedPi !== "string" || !relatedPi) {
            throw new Error(
              "Stripe returned an allocation without a PaymentIntent",
            );
          }
          if (relatedPi !== piId) continue;
          if (
            typeof txn.currency !== "string" ||
            !txn.currency ||
            typeof txn.net_amount !== "number" ||
            !Number.isSafeInteger(txn.net_amount)
          ) {
            throw new Error(
              "Stripe returned an incomplete payment allocation",
            );
          }
          if (txn.currency.toLowerCase() !== "usd") continue;
          const netAmount = txn.net_amount;
          if (
            (txn.type === "applied_to_payment" && netAmount > 0) ||
            (txn.type === "unapplied_from_payment" && netAmount < 0)
          ) {
            throw new Error(
              "Stripe returned an allocation with an invalid amount",
            );
          }
          if (txn.type === "applied_to_payment") {
            piAppliedCents += Math.max(0, -netAmount);
          } else if (txn.type === "unapplied_from_payment") {
            piAppliedCents -= Math.max(0, netAmount);
          }
          if (!Number.isSafeInteger(piAppliedCents)) {
            throw new Error("Stripe allocation total was outside the safe range");
          }
        }
        if (page.has_more === false) {
          receivedCents = Math.max(0, piAppliedCents);
          break;
        }
        const lastId = page.data.at(-1)?.id;
        if (!lastId) {
          throw new Error("Stripe transaction pagination was incomplete");
        }
        startingAfter = lastId;
        if (pageNumber === 99) {
          throw new Error("Stripe transaction history was too large to verify");
        }
      }
    } catch (e: any) {
      return {
        ok: false,
        status: 502,
        message: `Couldn't verify payment allocations at Stripe (${e?.message ?? "error"}) — nothing was changed. Retry once Stripe is reachable.`,
      };
    }
  }

  if (receivedCents <= 0) {
    try {
      const cust = await stripe.customers.retrieve(step.stripeCustomerId, {
        expand: ["cash_balance"],
      });
      const usd = cust?.cash_balance?.available?.usd;
      if (
        typeof usd !== "number" ||
        !Number.isSafeInteger(usd) ||
        usd < 0
      ) {
        return {
          ok: false,
          status: 502,
          message:
            "Stripe returned an incomplete customer cash balance — nothing was changed. Retry once Stripe is reachable.",
        };
      }
      if (usd > 0) {
        const [otherOpenStep] = await db
          .select({ id: manufacturerPaymentSteps.id })
          .from(manufacturerPaymentSteps)
          .where(
            and(
              eq(
                manufacturerPaymentSteps.stripeCustomerId,
                step.stripeCustomerId,
              ),
              eq(manufacturerPaymentSteps.status, "awaiting_transfer"),
              ne(manufacturerPaymentSteps.id, step.id),
            ),
          )
          .limit(1);
        if (otherOpenStep) {
          return {
            ok: false,
            status: 409,
            message:
              "Stripe has unallocated funds, but this customer has more than one open payment request. Nothing was changed; reconcile the transfer in Stripe first.",
          };
        }
      }
      receivedCents = usd;
    } catch (e: any) {
      return {
        ok: false,
        status: 502,
        message: `Couldn't read the customer's cash balance at Stripe (${e?.message ?? "error"}) — nothing was changed. Retry once Stripe is reachable.`,
      };
    }
  }
  if (receivedCents <= 0) {
    return {
      ok: false,
      status: 409,
      message:
        "No funds have been received for this step yet — there's nothing to accept.",
    };
  }

  // Never charge more than what was requested; a cash-balance surplus
  // stays on the Stripe customer (surfaced via the ledger's cashBalances).
  const acceptedCents = Math.min(receivedCents, dueCents);
  const forgivenCents = dueCents - acceptedCents;

  // 1) Record the accepted total on the step FIRST, before any Stripe
  //    mutation. Ordering is the race guard: once the PI is shrunk at
  //    Stripe, a webhook that settles it concurrently runs markStepPaid
  //    against ALREADY-adjusted totals (markStepPaid never rewrites
  //    amount/margin), so the earmark and ledger math stay honest no
  //    matter which path wins. Guarded flip: only while the step is
  //    EXACTLY as we verified it — zero rows means a webhook settled the
  //    (still full-amount) PI first; nothing at Stripe was touched, so we
  //    just bail.
  const newMarginCents = Math.min(step.marginCents, acceptedCents);
  const newAmountCents = acceptedCents - newMarginCents;
  let adjusted: ManufacturerPaymentStep | undefined;
  try {
    [adjusted] = await db
      .update(manufacturerPaymentSteps)
      .set({
        amountCents: newAmountCents,
        marginCents: newMarginCents,
        amountReceivedCents: Math.max(
          acceptedCents,
          step.amountReceivedCents ?? 0,
        ),
      })
      .where(
        and(
          eq(manufacturerPaymentSteps.id, step.id),
          eq(manufacturerPaymentSteps.status, "awaiting_transfer"),
          eq(manufacturerPaymentSteps.stripePaymentIntentId, piId),
        ),
      )
      .returning();
  } catch (e: any) {
    return {
      ok: false,
      status: 502,
      message: `Couldn't record the accepted amount (${e?.message ?? "database error"}) — nothing was changed at Stripe. Retry.`,
    };
  }
  if (!adjusted) {
    return {
      ok: false,
      status: 409,
      message:
        "The step changed while accepting (the transfer may have just settled) — nothing was changed at Stripe. Refresh to see it.",
    };
  }

  // Failure-safe helper: mirror the ledger totals back to the ORIGINAL
  // request (id+PI keyed; optionally only while still awaiting). A DB
  // failure here is caught, loudly tagged for ops (the route's 5xx also
  // trips the ops-alert hook), and reported — never thrown. Returns
  // whether the restore is known-applied.
  const restoreTotals = async (opts2: {
    onlyWhileAwaiting: boolean;
  }): Promise<boolean> => {
    try {
      if (process.env.GT_TEST && testFailpoint === "totals-restore") {
        throw new Error("injected totals-restore failure");
      }
      const where = opts2.onlyWhileAwaiting
        ? and(
            eq(manufacturerPaymentSteps.id, step.id),
            eq(manufacturerPaymentSteps.status, "awaiting_transfer"),
            eq(manufacturerPaymentSteps.stripePaymentIntentId, piId),
          )
        : and(
            eq(manufacturerPaymentSteps.id, step.id),
            eq(manufacturerPaymentSteps.stripePaymentIntentId, piId),
          );
      await db
        .update(manufacturerPaymentSteps)
        .set({ amountCents: step.amountCents, marginCents: step.marginCents })
        .where(where);
      return true;
    } catch (restoreErr: any) {
      console.error(
        `[shopify-plus] ACCEPT-PARTIAL-RECONCILE-NEEDED step=${step.id} pi=${piId}: ledger totals restore failed (${restoreErr?.message ?? restoreErr}) — recorded totals may not match Stripe; retrying the accept converges.`,
      );
      return false;
    }
  };

  // Authoritative PI re-read for indeterminate (thrown) Stripe mutations —
  // a network timeout can land AFTER Stripe applied the change, so a
  // thrown update/confirm proves nothing either way.
  const readPi = async (): Promise<{
    amount: number | null;
    status: string | null;
  } | null> => {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      return {
        amount: typeof pi?.amount === "number" ? pi.amount : null,
        status: pi?.status ?? null,
      };
    } catch {
      return null;
    }
  };

  // Shared settlement tail: Stripe positively settled the PI for
  // settledCents (the accepted amount, or the ORIGINAL amount when a
  // racing full settlement won during an indeterminate window). The
  // recorded totals are made to mirror the settled amount — never the
  // amount we merely intended — then the idempotent paid path runs.
  // Money has already moved at Stripe here, so a DB failure must NOT
  // read as "not settled": the payment_intent.succeeded webhook re-runs
  // the same idempotent markStepPaid, which is the durable recovery.
  const settleAt = async (
    settledCents: number,
  ): Promise<AcceptPartialResult> => {
    if (settledCents !== acceptedCents) {
      const settledMargin = Math.min(step.marginCents, settledCents);
      try {
        await db
          .update(manufacturerPaymentSteps)
          .set({
            amountCents: settledCents - settledMargin,
            marginCents: settledMargin,
            amountReceivedCents: settledCents,
          })
          .where(
            and(
              eq(manufacturerPaymentSteps.id, step.id),
              eq(manufacturerPaymentSteps.stripePaymentIntentId, piId),
            ),
          );
      } catch (e: any) {
        console.error(
          `[shopify-plus] ACCEPT-PARTIAL-RECONCILE-NEEDED step=${step.id} pi=${piId}: settled at ${settledCents}¢ but totals write failed (${e?.message ?? e}).`,
        );
        return {
          ok: false,
          status: 502,
          message: `The payment settled at Stripe for ${(settledCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}, but recording the settled total failed — refresh and retry to reconcile.`,
        };
      }
    }
    try {
      if (process.env.GT_TEST && testFailpoint === "mark-paid") {
        throw new Error("injected mark-paid failure");
      }
      await markStepPaid(step.id, piId, { amountReceivedCents: settledCents });
    } catch (e: any) {
      console.error(
        `[shopify-plus] ACCEPT-PARTIAL-RECONCILE-NEEDED step=${step.id} pi=${piId}: payment settled at Stripe but marking paid failed (${e?.message ?? e}); the succeeded webhook or a retry completes it.`,
      );
      return {
        ok: false,
        status: 502,
        message:
          "The payment settled at Stripe, but recording it here failed — refresh in a moment (the transfer webhook completes it) or retry.",
      };
    }
    console.log(
      `[shopify-plus] step ${step.id} partial transfer accepted as paid in full: ${settledCents}¢ of ${dueCents}¢ requested (${dueCents - settledCents}¢ forgiven) by operator`,
    );
    const [freshRow] = await db
      .select()
      .from(manufacturerPaymentSteps)
      .where(eq(manufacturerPaymentSteps.id, step.id));
    return {
      ok: true,
      step: freshRow ?? adjusted,
      acceptedCents: settledCents,
      forgivenCents: dueCents - settledCents,
    };
  };

  // 2) Shrink the PaymentIntent at Stripe to the accepted amount. A throw
  //    is INDETERMINATE: re-read the PI to learn what Stripe actually did.
  try {
    await stripe.paymentIntents.update(piId, { amount: acceptedCents });
  } catch (e: any) {
    const pi = await readPi();
    if (pi?.status === "succeeded") {
      // A racing settlement won during the indeterminate window. Trust
      // Stripe's settled AMOUNT — a full settlement of the original PI
      // must be recorded at the full amount, never at what we intended
      // to accept.
      return settleAt(
        typeof pi.amount === "number" ? pi.amount : acceptedCents,
      );
    }
    if (pi?.amount === acceptedCents) {
      // The shrink actually applied despite the throw — proceed.
    } else if (pi) {
      // Stripe positively shows the ORIGINAL amount — the shrink never
      // applied, so restore the ledger totals unconditionally by id+PI:
      // whether still awaiting or a webhook settled the full PI meanwhile,
      // the FULL totals mirror Stripe.
      const restored = await restoreTotals({ onlyWhileAwaiting: false });
      return {
        ok: false,
        status: 502,
        message: restored
          ? `Couldn't adjust the payment at Stripe (${e?.message ?? "error"}) — nothing was changed.`
          : `Couldn't adjust the payment at Stripe (${e?.message ?? "error"}) and the request total could not be restored — refresh and retry (retrying reconciles the totals).`,
      };
    } else {
      // PI unreadable — leave the shrunk recorded totals in place and
      // direct a retry: the accept re-derives everything from the current
      // step + Stripe state, so retrying converges either way.
      return {
        ok: false,
        status: 502,
        message: `Stripe was unreachable while adjusting the payment (${e?.message ?? "error"}) and its state couldn't be verified — retry to reconcile.`,
      };
    }
  }

  // 3) Confirm the shrunk PaymentIntent from the customer's cash balance.
  //    A throw is INDETERMINATE (the confirm may have applied): re-read
  //    the PI. Only when Stripe positively shows an UNCONFIRMED shrunk PI
  //    do we compensate: restore the PI to the original amount first, and
  //    only if that succeeds restore the recorded totals (guarded — a
  //    webhook that settled meanwhile wins and keeps the shrunk, honest
  //    total). If the PI restore fails, the PI is still shrunk at Stripe,
  //    so the shrunk recorded total remains the truthful mirror.
  const compensate = async (): Promise<string> => {
    try {
      await stripe.paymentIntents.update(piId, { amount: dueCents });
    } catch {
      return " The request total was adjusted to the received amount to match Stripe — retry, or check the Stripe Dashboard.";
    }
    const restored = await restoreTotals({ onlyWhileAwaiting: true });
    return restored
      ? " Nothing was changed — retry, or check the Stripe Dashboard."
      : " The request total could not be restored to the original amount — refresh and retry (retrying reconciles the totals).";
  };
  let confirmedStatus: string | null = null;
  try {
    const confirmed = await stripe.paymentIntents.confirm(piId);
    confirmedStatus = confirmed?.status ?? null;
  } catch (e: any) {
    const pi = await readPi();
    if (pi?.status === "succeeded") {
      // The settle actually applied despite the throw (our confirm, or a
      // racing webhook). Record Stripe's authoritative settled AMOUNT —
      // normally the shrunk amount, but never assume it.
      return settleAt(
        typeof pi.amount === "number" ? pi.amount : acceptedCents,
      );
    } else if (pi) {
      const note = await compensate();
      return {
        ok: false,
        status: 502,
        message: `Couldn't confirm the payment at Stripe (${e?.message ?? "error"}).${note}`,
      };
    } else {
      // PI unreadable — indeterminate. Do NOT touch the PI (it may have
      // settled); the shrunk recorded totals stay as the consistent
      // mirror. A retry (or the succeeded webhook) completes either way.
      return {
        ok: false,
        status: 502,
        message: `Stripe was unreachable while confirming the payment (${e?.message ?? "error"}) — retry to reconcile; if it settled, the transfer webhook will complete it.`,
      };
    }
  }
  if (confirmedStatus !== "succeeded") {
    const note = await compensate();
    return {
      ok: false,
      status: 502,
      message: `Stripe did not settle the payment (status ${confirmedStatus ?? "unknown"}).${note}`,
    };
  }

  // 4) Settle via the existing idempotent paid path (earmark mint for the
  //    ADJUSTED plant amount, paid timestamps, notifications) — the shared
  //    settlement tail records exactly what Stripe confirmed.
  return settleAt(acceptedCents);
}

// Called from the commerce.ts Stripe webhook BEFORE materializeOrderFromSession.
// Returns true when the event was a Shopify+ step event and was handled
// (so the caller skips the fan-order materialization path). ACH is always
// async: checkout.session.completed lands with payment_status "processing",
// then funds settle via async_payment_succeeded / payment_intent.succeeded.
export async function handleShopifyPlusWebhookEvent(
  event: {
    type: string;
    data: { object: any };
  },
  // Task #3004 — injectable Stripe surface for hermetic tests. Production
  // callers omit it; the partial-funding path lazily builds the real client.
  deps?: { stripe?: BankTransferStripe },
): Promise<boolean> {
  const obj = event.data?.object ?? {};
  const meta = obj?.metadata ?? {};
  const isStep = meta?.gt_kind === "shopify_plus_step";

  switch (event.type) {
    // Task #3004 — a pushed bank transfer arrived but didn't fully fund
    // the PaymentIntent (bank fees deducted in transit, or a deliberate
    // partial payment). Record what arrived; when the shortfall is within
    // the configured underpayment threshold, shrink the PI to the funds
    // on hand and confirm it so the step still auto-closes.
    case "payment_intent.partially_funded": {
      if (!isStep) return false;
      const stepId = String(meta.gt_step_id ?? "");
      if (!stepId) return true;
      const [step] = await db
        .select()
        .from(manufacturerPaymentSteps)
        .where(eq(manufacturerPaymentSteps.id, stepId));
      if (!step || step.status === "paid") return true;

      const piId = String(obj.id ?? "") || null;
      const dueCents = Number(obj.amount ?? step.amountCents + step.marginCents);
      const customerId =
        (typeof obj.customer === "string" ? obj.customer : obj.customer?.id) ??
        step.stripeCustomerId ??
        null;

      let stripe = deps?.stripe ?? null;
      if (!stripe) {
        try {
          stripe = (await getStripe()) as unknown as BankTransferStripe;
        } catch (e) {
          console.error(
            "[shopify-plus] partial funding: Stripe client unavailable:",
            (e as Error)?.message ?? e,
          );
        }
      }

      // How much has actually landed = the customer's USD cash balance.
      let availableCents: number | null = null;
      if (stripe && customerId) {
        try {
          const cust = await stripe.customers.retrieve(customerId, {
            expand: ["cash_balance"],
          });
          const usd = cust?.cash_balance?.available?.usd;
          if (typeof usd === "number") availableCents = usd;
        } catch (e) {
          console.error(
            "[shopify-plus] partial funding: cash balance read failed:",
            (e as Error)?.message ?? e,
          );
        }
      }
      const receivedCents = availableCents ?? step.amountReceivedCents;

      await db
        .update(manufacturerPaymentSteps)
        .set({
          amountReceivedCents: Math.max(receivedCents, step.amountReceivedCents),
          stripePaymentIntentId: piId ?? step.stripePaymentIntentId,
        })
        .where(eq(manufacturerPaymentSteps.id, step.id));
      console.log(
        `[shopify-plus] step ${step.id} partial funding: ${receivedCents}¢ of ${dueCents}¢`,
      );

      const shortfall = dueCents - receivedCents;
      const threshold = getBankTransferUnderpaymentThresholdCents();
      if (
        stripe &&
        piId &&
        receivedCents > 0 &&
        shortfall > 0 &&
        shortfall <= threshold
      ) {
        // Within the underpayment threshold — accept what arrived: shrink
        // the PI to the funds on hand and confirm so it succeeds from the
        // cash balance. payment_intent.succeeded then flips the step Paid
        // (markStepPaid is idempotent, so a direct flip here is also safe).
        try {
          await stripe.paymentIntents.update(piId, { amount: receivedCents });
          const confirmed = await stripe.paymentIntents.confirm(piId);
          console.log(
            `[shopify-plus] step ${step.id} under-threshold shortfall ${shortfall}¢ (≤${threshold}¢) — PI shrunk to ${receivedCents}¢, confirm → ${confirmed?.status}`,
          );
          if (confirmed?.status === "succeeded") {
            await markStepPaid(step.id, piId, {
              amountReceivedCents: receivedCents,
            });
          }
        } catch (e) {
          console.error(
            `[shopify-plus] step ${step.id} under-threshold auto-close failed:`,
            (e as Error)?.message ?? e,
          );
        }
      }
      return true;
    }
    // Task #3004 — an incoming bank transfer credited a customer's cash
    // balance. This event has no PI metadata, so match by the Stripe
    // customer on an awaiting-transfer step and LOG the payer details we
    // received — even when the sender's account name differs from the
    // expected one, Stripe reconciles by virtual account number.
    case "customer_cash_balance_transaction.created": {
      const customerId =
        typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (!customerId || obj.type !== "funded") return false;
      const [step] = await db
        .select()
        .from(manufacturerPaymentSteps)
        .where(
          and(
            eq(manufacturerPaymentSteps.stripeCustomerId, customerId),
            eq(manufacturerPaymentSteps.status, "awaiting_transfer"),
          ),
        )
        .orderBy(desc(manufacturerPaymentSteps.createdAt));
      if (!step) return false;
      const funded = obj.funded?.bank_transfer ?? null;
      const entry = {
        at: new Date().toISOString(),
        amountCents: Number(obj.net_amount ?? obj.amount ?? 0) || null,
        currency: obj.currency ?? "usd",
        bankTransfer: funded,
      };
      const existing = Array.isArray(step.payerDetails)
        ? (step.payerDetails as any[])
        : [];
      await db
        .update(manufacturerPaymentSteps)
        .set({ payerDetails: [...existing, entry] })
        .where(eq(manufacturerPaymentSteps.id, step.id));
      console.log(
        `[shopify-plus] step ${step.id} incoming transfer logged (payer details recorded):`,
        JSON.stringify(entry.bankTransfer ?? {}),
      );
      return true;
    }
    case "checkout.session.completed": {
      if (!isStep) return false;
      const stepId = String(meta.gt_step_id ?? "");
      if (!stepId) return true;
      const piId =
        typeof obj.payment_intent === "string" ? obj.payment_intent : null;
      // Card-style immediate success is possible in theory; ACH is not.
      if (obj.payment_status === "paid") {
        await markStepPaid(stepId, piId);
      } else {
        await markStepProcessing(stepId, String(obj.id ?? "") || null, piId);
      }
      return true;
    }
    case "checkout.session.async_payment_succeeded": {
      if (!isStep) return false;
      const stepId = String(meta.gt_step_id ?? "");
      const piId =
        typeof obj.payment_intent === "string" ? obj.payment_intent : null;
      if (stepId) await markStepPaid(stepId, piId);
      return true;
    }
    case "payment_intent.succeeded": {
      if (!isStep) return false;
      const stepId = String(meta.gt_step_id ?? "");
      if (stepId) await markStepPaid(stepId, String(obj.id ?? "") || null);
      return true;
    }
    case "checkout.session.async_payment_failed": {
      if (!isStep) return false;
      const stepId = String(meta.gt_step_id ?? "");
      if (stepId) {
        await markStepFailed(
          stepId,
          "The bank debit failed. Ask the customer to retry or use a different account.",
        );
      }
      return true;
    }
    case "checkout.session.expired": {
      if (!isStep) return false;
      const stepId = String(meta.gt_step_id ?? "");
      if (stepId) await releaseAbandonedStep(stepId, String(obj.id ?? ""));
      return true;
    }
    default:
      return false;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────
export function registerShopifyPlusRoutes(app: Express) {
  // Bearer-admin auth (mirrors payoutEarmarks — the admin client always
  // sends a Bearer token for /api/admin/*).
  const resolveAdmin = async (
    req: Request,
    res: Response,
  ): Promise<{ userId: string } | null> => {
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
    return { userId: a.userId };
  };

  // Enforce that the caller may manage payouts on this album's scope.
  // Returns the userId on success, or null after writing the error.
  const gatePayouts = async (
    req: Request,
    res: Response,
    albumId: string,
  ): Promise<string | null> => {
    const ctx = await resolveAdmin(req, res);
    if (!ctx) return null;
    const scope = await resolveAlbumScope(albumId);
    if (!scope) {
      res.status(404).json({ message: "Album not found" });
      return null;
    }
    if (scope.scope) {
      const err = await checkPartnerVerbForScope(
        ctx.userId,
        "manage_payouts",
        scope.scope,
        { req },
      );
      if (err) {
        res.status(err.status).json(err.body);
        return null;
      }
    }
    // Unscoped album → the album has no partner owner; the Bearer admin
    // check above already confirmed operator access.
    return ctx.userId;
  };

  // Enforce that the caller may EDIT this album's metadata. The ledger
  // STRUCTURE — quotes and staged step amounts — is operator territory:
  // it's hand-keyed against the manufacturer's real quote, so mutating it
  // must require `edit_metadata`, NOT `manage_payouts`. A payer-only
  // partner (manage_payouts but not edit_metadata) can pay a step but must
  // not be able to alter what's owed. Mirrors getAlbumEditAccess.canEdit,
  // including the post-sale lock (inert for shopify_plus, which has no
  // GoodTunes sale to lock on, but kept for correctness/consistency).
  const gateEditMetadata = async (
    req: Request,
    res: Response,
    albumId: string,
  ): Promise<string | null> => {
    const ctx = await resolveAdmin(req, res);
    if (!ctx) return null;
    const scope = await resolveAlbumScope(albumId);
    if (!scope) {
      res.status(404).json({ message: "Album not found" });
      return null;
    }
    if (scope.scope) {
      const err = await checkPartnerVerbForScope(
        ctx.userId,
        "edit_metadata",
        scope.scope,
        { req, albumIdForLock: albumId },
      );
      if (err) {
        res.status(err.status).json(err.body);
        return null;
      }
    }
    // Unscoped album → no partner owner; Bearer admin check above already
    // confirmed operator access.
    return ctx.userId;
  };

  // GET the whole ledger for an album: resolved manufacturer, quotes,
  // steps (with earmark status joined), and rolled-up totals.
  app.get(
    "/api/admin/albums/:albumId/manufacturing-ledger",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const userId = await gatePayouts(req, res, albumId);
      if (!userId) return;

      const [manufacturer, quotes, steps, systemCents, albumRow] =
        await Promise.all([
          resolveAlbumManufacturer(albumId),
          db
            .select()
            .from(albumManufacturerQuotes)
            .where(eq(albumManufacturerQuotes.albumId, albumId))
            .orderBy(desc(albumManufacturerQuotes.createdAt)),
          db
            .select()
            .from(manufacturerPaymentSteps)
            .where(eq(manufacturerPaymentSteps.albumId, albumId))
            .orderBy(
              asc(manufacturerPaymentSteps.sortOrder),
              asc(manufacturerPaymentSteps.createdAt),
            ),
          computeSystemManufacturingCents(albumId),
          db
            .select({
              runClosedAt: albums.shopifyPlusRunClosedAt,
            })
            .from(albums)
            .where(eq(albums.id, albumId))
            .then((r) => r[0] ?? null),
        ]);

      // Task #2785 — join earmark status for paid steps so the UI can show
      // "Held — release pending" or "Released to plant" inline without
      // the user hunting in a separate queue.
      const stepIds = steps.map((s) => s.id);
      let earmarksByStepId: Record<string, { id: string; status: string }> = {};
      if (stepIds.length > 0) {
        const earmarkRows = await db
          .select({
            sourceRef: payoutEarmarks.sourceRef,
            id: payoutEarmarks.id,
            status: payoutEarmarks.status,
          })
          .from(payoutEarmarks)
          .where(
            and(
              eq(payoutEarmarks.sourceKind, "shopify_plus_step"),
              inArray(payoutEarmarks.sourceRef, stepIds),
            ),
          );
        // When multiple earmarks exist for the same sourceRef (e.g. a
        // rejected + a new held), prefer the most recent non-rejected one.
        for (const row of earmarkRows) {
          const existing = earmarksByStepId[row.sourceRef];
          if (
            !existing ||
            row.status !== "rejected" ||
            existing.status === "rejected"
          ) {
            earmarksByStepId[row.sourceRef] = { id: row.id, status: row.status };
          }
        }
      }

      const stepsWithEarmark = steps.map((s) => ({
        ...s,
        earmark: earmarksByStepId[s.id] ?? null,
      }));

      // Task #2697 — Quoted resolves in priority order:
      //   1. the ACTIVE quote's captured total,
      //   2. the system-computed manufacturing cost (same source as the
      //      Package tab: effective per-unit cost × planned quantity),
      //   3. legacy fallback — the sum of the payment requests.
      let activeQuote = quotes.find((q) => q.isActive) ?? null;

      // Task #3455 — historical estimates uploaded before automatic total
      // extraction (Task #2697) carry totalCents NULL and were never
      // activated, so the ledger silently fell back to the system-computed
      // cost even though the plant's authoritative PDF total exists in
      // storage. Recover it lazily on read: when the album has NO active
      // estimate, parse the stored PDFs (newest first, bounded) for a
      // total, PERSIST it on the row, and activate that row so subsequent
      // reads never re-parse. Never touches an album that already has an
      // active estimate, and a parse failure just leaves the old fallback.
      if (!activeQuote) {
        const recovered = await recoverLegacyQuoteTotal(quotes);
        if (recovered) {
          const [updated] = await db
            .update(albumManufacturerQuotes)
            .set({ totalCents: recovered.totalCents, isActive: true })
            .where(
              and(
                eq(albumManufacturerQuotes.id, recovered.quoteId),
                isNull(albumManufacturerQuotes.totalCents),
                // Atomic re-check: an operator may have activated another
                // estimate between our read and this write. Never mint a
                // second active row — the operator's choice wins and this
                // request just falls through to the old fallback.
                sql`NOT EXISTS (
                  SELECT 1 FROM ${albumManufacturerQuotes} amq2
                  WHERE amq2.album_id = ${albumId} AND amq2.is_active = true
                )`,
              ),
            )
            .returning();
          if (updated) {
            const q = quotes.find((x) => x.id === updated.id);
            if (q) {
              q.totalCents = updated.totalCents;
              q.isActive = updated.isActive;
              activeQuote = q;
            }
          }
        }
      }
      const stepsSumCents = steps.reduce(
        (s, r) => s + r.amountCents + r.marginCents,
        0,
      );
      let quotedCents: number;
      let quotedSource: "quote" | "system" | "steps";
      if (activeQuote?.totalCents != null && activeQuote.totalCents > 0) {
        quotedCents = activeQuote.totalCents;
        quotedSource = "quote";
      } else if (systemCents != null) {
        quotedCents = systemCents;
        quotedSource = "system";
      } else {
        quotedCents = stepsSumCents;
        quotedSource = "steps";
      }
      const paidCents = steps
        .filter((r) => r.status === "paid")
        .reduce((s, r) => s + r.amountCents + r.marginCents, 0);
      const processingCents = steps
        .filter((r) => r.status === "processing" || r.status === "awaiting_transfer")
        .reduce((s, r) => s + r.amountCents + r.marginCents, 0);
      const outstandingCents = quotedCents - paidCents;

      // Task #3004 — surface nonzero Stripe customer cash balances to
      // OPERATORS so leftover/over-paid transfer funds don't sit silently
      // (Stripe auto-returns unreconciled funds after 75 days). Best-effort:
      // a Stripe hiccup must never break the ledger read.
      const callerRole = await getUserRole(userId);
      const callerIsOperator =
        callerRole?.role === "admin" || callerRole?.role === "super_admin";

      let cashBalances:
        | { stripeCustomerId: string; availableUsdCents: number }[]
        | null = null;
      try {
        const customerIds = Array.from(
          new Set(
            steps
              .map((s) => (s as any).stripeCustomerId as string | null)
              .filter((c): c is string => !!c),
          ),
        );
        if (callerIsOperator && customerIds.length > 0) {
          const stripe = await getStripe();
          const found: { stripeCustomerId: string; availableUsdCents: number }[] =
            [];
          for (const cid of customerIds.slice(0, 10)) {
            try {
              const cust: any = await stripe.customers.retrieve(cid, {
                expand: ["cash_balance"],
              });
              const usd = cust?.cash_balance?.available?.usd;
              if (typeof usd === "number" && usd > 0) {
                found.push({ stripeCustomerId: cid, availableUsdCents: usd });
              }
            } catch {
              // skip unknown/deleted customers
            }
          }
          cashBalances = found;
        }
      } catch {
        cashBalances = null;
      }

      // Partners (non-operators) get a sanitized step DTO: no Stripe
      // identifiers, payment errors, or payer details, and bank-transfer
      // funding instructions ONLY for the artist-direct steps they are
      // authorized to pay. Operator-funded steps' virtual-account details
      // must never reach an artist.
      const stepsForCaller = callerIsOperator
        ? stepsWithEarmark
        : stepsWithEarmark.map((s) => ({
            id: s.id,
            albumId: s.albumId,
            manufacturerId: s.manufacturerId,
            description: s.description,
            amountCents: s.amountCents,
            marginCents: s.marginCents,
            sortOrder: s.sortOrder,
            status: s.status,
            fundingSource: s.fundingSource,
            paymentMethod: s.paymentMethod,
            cardFeeCents: s.cardFeeCents,
            amountReceivedCents: s.amountReceivedCents,
            paidAt: s.paidAt,
            createdAt: s.createdAt,
            earmark: s.earmark,
            fundingInstructions:
              s.fundingSource === "artist_direct" ? s.fundingInstructions : null,
          }));

      res.json({
        manufacturer,
        quotes,
        steps: stepsForCaller,
        totals: {
          quotedCents,
          quotedSource,
          systemCents,
          paidCents,
          processingCents,
          outstandingCents,
        },
        runClosedAt: albumRow?.runClosedAt ?? null,
        // Operator-only (null for partners): nonzero customer cash balances
        // from bank-transfer payers — apply to the next invoice via Stripe
        // Dashboard or refund; don't let them sit (75-day auto-return).
        cashBalances,
      });
    },
  );

  // Per-unit fulfillment price to load into the customer's Shopify pricing:
  // the assigned partner's US single-unit rate (partner base + markup) when
  // GoodTunes fulfills. Display-only. Returns { perUnitCents: null, reason }
  // when fulfillment is off, no partner is assigned, or the partner has no
  // rate on file yet.
  app.get(
    "/api/admin/albums/:albumId/shopify-plus/fulfillment-price",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const userId = await gatePayouts(req, res, albumId);
      if (!userId) return;

      const [album] = await db.select().from(albums).where(eq(albums.id, albumId));
      if (!album) return res.status(404).json({ message: "Album not found" });
      if (album.sellMode !== "shopify_plus" || !album.shopifyPlusFulfillment) {
        return res.json({ perUnitCents: null, reason: "fulfillment-off" });
      }
      const partnerId = album.fulfillmentPartnerId ?? null;
      if (!partnerId) {
        return res.json({ perUnitCents: null, reason: "no-partner" });
      }

      const [partner] = await db
        .select({ name: fulfillmentPartners.name })
        .from(fulfillmentPartners)
        .where(eq(fulfillmentPartners.id, partnerId));
      // albums.physicalFormat uses a different keyspace (seven_inch/single_lp/
      // double_lp) than the shipping rate card's weight bands (7_inch/12_lp/
      // 12_double, same keys the SKU catalog uses). Map before quoting or every
      // format silently misses and falls to the 16oz default band — which would
      // over-charge a 7" and under-charge a double LP on the very number the
      // customer loads into their Shopify pricing.
      const SHIP_FORMAT: Record<string, string> = {
        seven_inch: "7_inch",
        single_lp: "12_lp",
        double_lp: "12_double",
      };
      const shipFormat = SHIP_FORMAT[album.physicalFormat ?? ""] ?? album.physicalFormat ?? "12_lp";
      const { quoteShipping } = await import("./shipping");
      const quote = await quoteShipping({
        format: shipFormat,
        quantity: 1,
        country: "US",
        partnerId,
      });
      return res.json({
        perUnitCents: quote ? quote.chargedCents : null,
        baseCents: quote?.baseCents ?? null,
        markupCents: quote?.markupCents ?? null,
        partnerId,
        partnerName: partner?.name ?? null,
        reason: quote ? null : "no-rate",
      });
    },
  );

  // Mint a signed PUT URL for a quote PDF under manufacturer-quotes/.
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/quotes/upload-url",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const userId = await gateEditMetadata(req, res, albumId);
      if (!userId) return;

      const crypto = await import("crypto");
      const objectId = `${albumId}-${crypto.randomUUID()}.pdf`;
      const objectKey = `manufacturer-quotes/${objectId}`;
      const mod = await import(
        "./replit_integrations/object_storage/objectStorage"
      );
      const { ObjectStorageService } = mod as any;
      const oss = new ObjectStorageService();
      let entityDir = oss.getPrivateObjectDir();
      if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
      const fullPath = `${entityDir}${objectKey}`;
      const parseObjectPath = (mod as any).parseObjectPath as
        | ((p: string) => { bucketName: string; objectName: string })
        | undefined;
      const signObjectURL = (mod as any).signObjectURL as
        | ((args: {
            bucketName: string;
            objectName: string;
            method: string;
            ttlSec: number;
          }) => Promise<string>)
        | undefined;
      if (parseObjectPath && signObjectURL) {
        const { bucketName, objectName } = parseObjectPath(fullPath);
        const uploadUrl = await signObjectURL({
          bucketName,
          objectName,
          method: "PUT",
          ttlSec: 900,
        });
        return res.json({ uploadUrl, publicUrl: `/objects/${objectKey}` });
      }
      const uploadUrl = await oss.getObjectEntityUploadURL();
      res.json({ uploadUrl });
    },
  );

  // Record a quote (after the client PUTs the file to the signed URL, or
  // when the operator pastes an https:// link).
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/quotes",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const userId = await gateEditMetadata(req, res, albumId);
      if (!userId) return;

      const schema = z.object({
        fileUrl: z
          .string()
          .min(1)
          .refine(
            (s) => /^https?:\/\//.test(s) || s.startsWith("/objects/"),
            "Quote URL must be an https:// link or an /objects/... path",
          ),
        fileName: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(1000).optional(),
        totalCents: z.number().int().min(1).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Invalid quote" });
      }
      // Task #2697 — best-effort auto-extract the quote total from the
      // uploaded PDF when the caller didn't supply one. Never blocks the
      // insert; a null just means the operator types it in later.
      let totalCents = parsed.data.totalCents ?? null;
      let totalExtracted = false;
      if (totalCents == null && parsed.data.fileUrl.startsWith("/objects/")) {
        const extracted = await tryExtractPdfTotalCents(parsed.data.fileUrl);
        if (extracted != null) {
          totalCents = extracted;
          totalExtracted = true;
        }
      }
      // First quote with a usable total auto-activates when the album has
      // no active quote yet.
      const [existingActive] = await db
        .select({ id: albumManufacturerQuotes.id })
        .from(albumManufacturerQuotes)
        .where(
          and(
            eq(albumManufacturerQuotes.albumId, albumId),
            eq(albumManufacturerQuotes.isActive, true),
          ),
        );
      const [row] = await db
        .insert(albumManufacturerQuotes)
        .values({
          albumId,
          fileUrl: parsed.data.fileUrl,
          fileName: parsed.data.fileName ?? null,
          notes: parsed.data.notes ?? null,
          totalCents,
          isActive: !existingActive && totalCents != null,
          uploadedByUserId: userId,
        })
        .returning();
      res.json({ ok: true, quote: row, totalExtracted });
    },
  );

  // Task #2697 — edit a quote's captured total / notes, or flip which
  // quote is the ACTIVE one (at most one active per album; activating a
  // quote clears the flag on the others in the same transaction).
  app.patch(
    "/api/admin/albums/:albumId/manufacturing-ledger/quotes/:quoteId",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const quoteId = String(req.params.quoteId);
      const userId = await gateEditMetadata(req, res, albumId);
      if (!userId) return;

      const [row] = await db
        .select()
        .from(albumManufacturerQuotes)
        .where(eq(albumManufacturerQuotes.id, quoteId));
      if (!row || row.albumId !== albumId) {
        return res.status(404).json({ message: "Quote not found" });
      }
      const schema = z.object({
        totalCents: z.number().int().min(1).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Invalid quote" });
      }
      const updated = await db.transaction(async (tx) => {
        if (parsed.data.isActive === true) {
          await tx
            .update(albumManufacturerQuotes)
            .set({ isActive: false })
            .where(eq(albumManufacturerQuotes.albumId, albumId));
        }
        const [u] = await tx
          .update(albumManufacturerQuotes)
          .set({
            ...(parsed.data.totalCents !== undefined && {
              totalCents: parsed.data.totalCents,
            }),
            ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
            ...(parsed.data.isActive !== undefined && {
              isActive: parsed.data.isActive,
            }),
          })
          .where(eq(albumManufacturerQuotes.id, quoteId))
          .returning();
        return u;
      });
      res.json({ ok: true, quote: updated });
    },
  );

  app.delete(
    "/api/admin/albums/:albumId/manufacturing-ledger/quotes/:quoteId",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const quoteId = String(req.params.quoteId);
      const userId = await gateEditMetadata(req, res, albumId);
      if (!userId) return;
      const [row] = await db
        .select()
        .from(albumManufacturerQuotes)
        .where(eq(albumManufacturerQuotes.id, quoteId));
      if (!row || row.albumId !== albumId) {
        return res.status(404).json({ message: "Quote not found" });
      }
      await db
        .delete(albumManufacturerQuotes)
        .where(eq(albumManufacturerQuotes.id, quoteId));
      res.json({ ok: true });
    },
  );

  // Stream an uploaded manufacturer quote PDF back to the client.
  // The file lives in private object storage under manufacturer-quotes/,
  // so there is no public /objects/ route for it — callers must hit this
  // authenticated endpoint instead.
  //
  // Task #3455 — this is a READ: anyone who can read the ledger (the
  // manage_payouts tier, incl. the artist-scope owner) may download the
  // estimate they're being asked to pay against. It previously demanded
  // edit_metadata, which 403'd the paying artist. Mutations (upload,
  // total edits, activation, delete) stay on gateEditMetadata.
  app.get(
    "/api/admin/albums/:albumId/manufacturing-ledger/quotes/:quoteId/download",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const quoteId = String(req.params.quoteId);
      const userId = await gatePayouts(req, res, albumId);
      if (!userId) return;

      const [row] = await db
        .select()
        .from(albumManufacturerQuotes)
        .where(eq(albumManufacturerQuotes.id, quoteId));
      if (!row || row.albumId !== albumId) {
        return res.status(404).json({ message: "Quote not found" });
      }
      const { fileUrl, fileName } = row;
      if (!fileUrl.startsWith("/objects/")) {
        // External link — redirect; the browser will follow it directly.
        return res.redirect(302, fileUrl);
      }
      try {
        const mod = await import(
          "./replit_integrations/object_storage/objectStorage"
        );
        const oss = new (mod as any).ObjectStorageService();
        const file = await oss.getObjectEntityFile(fileUrl);
        const [buf] = await file.download();
        const safeName = (fileName || "Quote.pdf").replace(/[^\w.\- ]/g, "_");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${safeName}"`,
        );
        res.setHeader("Content-Length", String(buf.length));
        res.end(buf);
      } catch (e) {
        console.error("[quote-download] failed to stream quote PDF:", e);
        res.status(500).json({ message: "Failed to retrieve quote file" });
      }
    },
  );

  // Add a payment step.
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const userId = await gateEditMetadata(req, res, albumId);
      if (!userId) return;

      // Task #2697 — no new payment requests once the run is closed out.
      // Paying an already-requested step stays allowed (the pay route is
      // deliberately not gated on this).
      const [album] = await db
        .select({ runClosedAt: albums.shopifyPlusRunClosedAt })
        .from(albums)
        .where(eq(albums.id, albumId));
      if (album?.runClosedAt) {
        return res.status(409).json({
          message:
            "This run has been closed out — reopen it before adding a new payment request.",
        });
      }

      const schema = z.object({
        description: z.string().trim().min(1).max(200),
        amountCents: z.number().int().min(1),
        marginCents: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
        // Task #2785 — who funds this step.
        fundingSource: z
          .enum(["goodtunes_sales", "artist_direct"])
          .optional()
          .default("artist_direct"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Invalid step" });
      }
      const [row] = await db
        .insert(manufacturerPaymentSteps)
        .values({
          albumId,
          description: parsed.data.description,
          amountCents: parsed.data.amountCents,
          marginCents: parsed.data.marginCents ?? 0,
          sortOrder: parsed.data.sortOrder ?? 0,
          fundingSource: parsed.data.fundingSource,
        })
        .returning();

      // Task #2785 — notify the artist/label scope only for artist_direct steps.
      // goodtunes_sales steps are funded by Bill from platform balance; no need
      // to bother the artist with a "you owe us" email for those.
      if (parsed.data.fundingSource === "artist_direct") {
        void notifyScopeOfPaymentRequest({
          req,
          albumId,
          description: parsed.data.description,
          totalCents:
            parsed.data.amountCents + (parsed.data.marginCents ?? 0),
        });
      }
      res.json({ ok: true, step: row });
    },
  );

  // Edit a step — only while it is still unpaid (never mutate a settled
  // or in-flight amount). fundingSource can be changed while unpaid.
  app.patch(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const stepId = String(req.params.stepId);
      const userId = await gateEditMetadata(req, res, albumId);
      if (!userId) return;

      const [step] = await db
        .select()
        .from(manufacturerPaymentSteps)
        .where(eq(manufacturerPaymentSteps.id, stepId));
      if (!step || step.albumId !== albumId) {
        return res.status(404).json({ message: "Step not found" });
      }
      if (step.status !== "unpaid") {
        return res
          .status(409)
          .json({ message: "Only unpaid steps can be edited" });
      }
      const schema = z.object({
        description: z.string().trim().min(1).max(200).optional(),
        amountCents: z.number().int().min(1).optional(),
        marginCents: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
        fundingSource: z.enum(["goodtunes_sales", "artist_direct"]).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Invalid step" });
      }
      const [row] = await db
        .update(manufacturerPaymentSteps)
        .set({
          ...(parsed.data.description !== undefined && {
            description: parsed.data.description,
          }),
          ...(parsed.data.amountCents !== undefined && {
            amountCents: parsed.data.amountCents,
          }),
          ...(parsed.data.marginCents !== undefined && {
            marginCents: parsed.data.marginCents,
          }),
          ...(parsed.data.sortOrder !== undefined && {
            sortOrder: parsed.data.sortOrder,
          }),
          ...(parsed.data.fundingSource !== undefined && {
            fundingSource: parsed.data.fundingSource,
          }),
        })
        .where(eq(manufacturerPaymentSteps.id, stepId))
        .returning();
      res.json({ ok: true, step: row });
    },
  );

  app.delete(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const stepId = String(req.params.stepId);
      const userId = await gateEditMetadata(req, res, albumId);
      if (!userId) return;
      const [step] = await db
        .select()
        .from(manufacturerPaymentSteps)
        .where(eq(manufacturerPaymentSteps.id, stepId));
      if (!step || step.albumId !== albumId) {
        return res.status(404).json({ message: "Step not found" });
      }
      if (step.status !== "unpaid") {
        return res
          .status(409)
          .json({ message: "Only unpaid steps can be deleted" });
      }
      await db
        .delete(manufacturerPaymentSteps)
        .where(eq(manufacturerPaymentSteps.id, stepId));
      res.json({ ok: true });
    },
  );

  // Task #2785 — Re-send the artist payment request email for an unpaid
  // artist_direct step. Gated on manage_payouts (not edit_metadata) because
  // sending a reminder is a payout-management action; it must work even when
  // the album is post-sale locked.
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/remind",
    async (req, res) => {
      try {
        const albumId = String(req.params.albumId);
        const stepId = String(req.params.stepId);
        const userId = await gatePayouts(req, res, albumId);
        if (!userId) return;

        const [step] = await db
          .select()
          .from(manufacturerPaymentSteps)
          .where(eq(manufacturerPaymentSteps.id, stepId));
        if (!step || step.albumId !== albumId) {
          return res.status(404).json({ message: "Step not found" });
        }
        if (step.fundingSource !== "artist_direct") {
          return res
            .status(400)
            .json({ message: "Reminders only apply to artist-pays steps." });
        }
        if (step.status === "paid") {
          return res.status(409).json({ message: "Step is already paid." });
        }
        void notifyScopeOfPaymentRequest({
          req,
          albumId,
          description: step.description,
          totalCents: step.amountCents + step.marginCents,
        });
        res.json({ ok: true });
      } catch (e) {
        console.error("[shopify-plus] remind step error:", (e as Error)?.message ?? e);
        res.status(500).json({ message: "Failed to send reminder." });
      }
    },
  );

  // Task #2697 — reversible close-out of the manufacturing run. Super-
  // admin only (an operator-of-operators call, not a partner verb).
  // Closing blocks NEW payment requests; existing steps — including
  // paying an already-requested one — are untouched. Reopen reverses it.
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/close",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const ctx = await resolveAdmin(req, res);
      if (!ctx) return;
      const role = await getUserRole(ctx.userId);
      if (role?.role !== "super_admin") {
        return res.status(403).json({ message: "Super admin only" });
      }
      const [row] = await db
        .update(albums)
        .set({
          shopifyPlusRunClosedAt: new Date(),
          shopifyPlusRunClosedByUserId: ctx.userId,
        })
        .where(eq(albums.id, albumId))
        .returning({ runClosedAt: albums.shopifyPlusRunClosedAt });
      if (!row) return res.status(404).json({ message: "Album not found" });
      res.json({ ok: true, runClosedAt: row.runClosedAt });
    },
  );

  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/reopen",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const ctx = await resolveAdmin(req, res);
      if (!ctx) return;
      const role = await getUserRole(ctx.userId);
      if (role?.role !== "super_admin") {
        return res.status(403).json({ message: "Super admin only" });
      }
      const [row] = await db
        .update(albums)
        .set({
          shopifyPlusRunClosedAt: null,
          shopifyPlusRunClosedByUserId: null,
        })
        .where(eq(albums.id, albumId))
        .returning({ id: albums.id });
      if (!row) return res.status(404).json({ message: "Album not found" });
      res.json({ ok: true, runClosedAt: null });
    },
  );

  // Start an ACH bank-debit checkout for a step. Returns a hosted Stripe
  // Checkout URL. Allowed only while unpaid (a "failed" attempt is reset
  // to unpaid by the webhook, so this covers retries too).
  //
  // Task #2785 — gating: artist_direct steps can only be paid by the
  // artist (manage_payouts scope, isOperatorView=false path). goodtunes_sales
  // steps are paid by the operator (gateEditMetadata). We don't enforce
  // the distinction server-side beyond the existing gatePayouts gate here
  // because the UI already hides the Pay button from the wrong party and
  // the gatePayouts check covers both (operator passes as super_admin/admin,
  // partner passes as the album's scope member with manage_payouts).
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/pay",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const stepId = String(req.params.stepId);
      const userId = await gatePayouts(req, res, albumId);
      if (!userId) return;

      const [step] = await db
        .select()
        .from(manufacturerPaymentSteps)
        .where(eq(manufacturerPaymentSteps.id, stepId));
      if (!step || step.albumId !== albumId) {
        return res.status(404).json({ message: "Step not found" });
      }
      if (step.status === "paid" || step.status === "processing") {
        return res
          .status(409)
          .json({ message: `This step is already ${step.status}.` });
      }
      // Task #3004 — once bank-transfer instructions are issued, the same
      // virtual account keeps working (including for a second transfer on a
      // partial payment); re-open the saved instructions instead of minting
      // a new PaymentIntent.
      if (step.status === "awaiting_transfer") {
        return res.status(409).json({
          message:
            "Bank transfer instructions were already issued for this step. Re-open them from the step row — a follow-up transfer to the same account details also works.",
        });
      }

      // Task #3004 — payment method choice. ACH debit (us_bank_account) is
      // REMOVED from this flow entirely: bank transfer (push) is the default,
      // card remains the fallback with the card fee added and disclosed.
      const method =
        String((req.body as any)?.method ?? "bank_transfer") === "card"
          ? "card"
          : "bank_transfer";

      // Task #2785 — enforce funding-source authorization server-side.
      // goodtunes_sales steps are operator-funded (only admin/super_admin may pay).
      // artist_direct steps must be paid by the artist/partner (operators are blocked).
      const callerRole = await getUserRole(userId);
      const callerIsOperator =
        callerRole?.role === "admin" || callerRole?.role === "super_admin";
      const fs = (step as any).fundingSource ?? "artist_direct";
      if (fs === "goodtunes_sales" && !callerIsOperator) {
        return res
          .status(403)
          .json({ message: "Only GoodTunes operators can pay this step." });
      }
      if (fs === "artist_direct" && callerIsOperator) {
        return res
          .status(403)
          .json({ message: "This step must be paid by the artist." });
      }

      const manufacturer = await resolveAlbumManufacturer(albumId);
      if (!manufacturer) {
        return res.status(422).json({
          message:
            "No manufacturer is set for this album yet. Assign a press before collecting a manufacturing payment.",
        });
      }

      const album = await storage.getAlbumById(albumId, { includeHidden: true });
      const totalCents = step.amountCents + step.marginCents;

      // Atomically claim the step before minting a Checkout Session. Only ONE
      // in-flight ACH attempt is allowed per step: a second concurrent (or
      // double-clicked) POST finds the status already flipped off "unpaid" and
      // is rejected, so we never hand out two live bank-debit URLs for the same
      // money (webhook idempotency stops a double earmark, but NOT two real
      // debits settling). An abandoned attempt is released back to "unpaid" by
      // checkout.session.expired (the padded 30-min expires_at below bounds
      // that), and a failed debit is reset by async_payment_failed — so a
      // legitimate retry still works. The fast-path 409 above covers the common
      // sequential case; this closes the true concurrent race.
      const [claimed] = await db
        .update(manufacturerPaymentSteps)
        .set({
          status: "processing",
          manufacturerId: manufacturer.id,
          paidByUserId: userId,
          lastError: null,
        })
        .where(
          and(
            eq(manufacturerPaymentSteps.id, step.id),
            eq(manufacturerPaymentSteps.status, "unpaid"),
          ),
        )
        .returning();
      if (!claimed) {
        return res.status(409).json({
          message:
            "A payment for this step is already in progress. Refresh to see its status.",
        });
      }

      const origin = absoluteOrigin(req);
      // Route the Stripe success/cancel URL back to the correct portal shell:
      // operator → admin album view; partner (artist/label) → artist portal.
      const albumBasePath = callerIsOperator
        ? `/admin/albums/${albumId}`
        : `/artist/albums/${albumId}`;
      const returnBase = `${origin}${albumBasePath}?tab=payments`;

      const metadata = {
        gt_kind: "shopify_plus_step",
        gt_step_id: step.id,
        gt_album_id: albumId,
        gt_manufacturer_id: manufacturer.id,
        gt_amount_owed: String(step.amountCents),
        gt_margin: String(step.marginCents),
        gt_payment_method: method,
      };

      if (method === "bank_transfer") {
        // ── Task #3004 — push bank transfer via Stripe customer balance ──
        // Mint a customer_balance PaymentIntent and persist Stripe's
        // virtual-account funding instructions on the step; the artist
        // pushes a wire/ACH-credit from their bank and the webhook
        // reconciles it. No Checkout Session is involved.
        try {
          const stripe = await getStripe();

          // Reuse the payer's Stripe customer when a prior bank-transfer
          // step already created one (same virtual account details);
          // otherwise create one keyed to the payer.
          let customerId: string | null = null;
          const [prior] = await db
            .select({ cid: manufacturerPaymentSteps.stripeCustomerId })
            .from(manufacturerPaymentSteps)
            .where(
              and(
                eq(manufacturerPaymentSteps.paidByUserId, userId),
                sql`${manufacturerPaymentSteps.stripeCustomerId} IS NOT NULL`,
              ),
            )
            .orderBy(desc(manufacturerPaymentSteps.createdAt))
            .limit(1);
          customerId = (prior?.cid as string | null) ?? null;
          if (customerId) {
            // Make sure the customer still exists in THIS Stripe mode.
            try {
              const c: any = await stripe.customers.retrieve(customerId);
              if (c?.deleted) customerId = null;
            } catch {
              customerId = null;
            }
          }
          if (!customerId) {
            const [payer] = await db
              .select({ email: users.email, username: users.username })
              .from(users)
              .where(eq(users.id, userId));
            const customer = await stripe.customers.create({
              email: (payer as any)?.email ?? undefined,
              name: (payer as any)?.username ?? undefined,
              metadata: { gt_user_id: userId, gt_kind: "shopify_plus_payer" },
            });
            customerId = customer.id;
          }

          const pi = await stripe.paymentIntents.create({
            amount: totalCents,
            currency: "usd",
            customer: customerId,
            payment_method_types: ["customer_balance"],
            payment_method_data: { type: "customer_balance" } as any,
            payment_method_options: {
              customer_balance: {
                funding_type: "bank_transfer",
                bank_transfer: { type: "us_bank_transfer" },
              },
            } as any,
            confirm: true,
            description: `${step.description} — ${(album as any)?.title ?? albumId}`,
            metadata,
          });

          const instructions = extractFundingInstructions(pi, totalCents);
          if (!instructions) {
            throw new Error(
              "Stripe did not return bank transfer instructions for this payment.",
            );
          }

          await db
            .update(manufacturerPaymentSteps)
            .set({
              status: "awaiting_transfer",
              paymentMethod: "bank_transfer",
              stripeCustomerId: customerId,
              stripePaymentIntentId: pi.id,
              stripeCheckoutSessionId: null,
              fundingInstructions: instructions,
              cardFeeCents: null,
            })
            .where(eq(manufacturerPaymentSteps.id, step.id));

          return res.json({ status: "awaiting_transfer", instructions });
        } catch (e: any) {
          await db
            .update(manufacturerPaymentSteps)
            .set({
              status: "unpaid",
              lastError: e?.message?.slice(0, 500) ?? "Stripe error",
            })
            .where(eq(manufacturerPaymentSteps.id, step.id));
          console.error(
            `[shopify-plus] bank-transfer PI create failed: ${e?.message}`,
          );
          return res.status(502).json({
            message:
              e?.message ??
              "Failed to set up the bank transfer. Try again or pay by card.",
          });
        }
      }

      // ── Card fallback — hosted Checkout with the card fee added on top,
      // disclosed as its own line item (the client shows it before confirm).
      const feeCents = cardFeeCents(totalCents);
      try {
        const stripe = await getStripe();
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: totalCents,
                product_data: {
                  name: step.description,
                  description: `Manufacturing payment for ${(album as any)?.title ?? albumId}`,
                },
              },
              quantity: 1,
            },
            {
              price_data: {
                currency: "usd",
                unit_amount: feeCents,
                product_data: {
                  name: "Card processing fee",
                  description:
                    "Added when paying by card. Pay by bank transfer to avoid this fee.",
                },
              },
              quantity: 1,
            },
          ],
          payment_intent_data: { metadata },
          metadata,
          success_url: `${returnBase}&payment=success`,
          cancel_url: `${returnBase}&payment=cancelled`,
          // 30-minute session window; the step is reset by session.expired.
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        });

        // Persist the session ID so releaseAbandonedStep() can validate it on
        // checkout.session.expired — without this, any expired session could
        // reset ANY processing step for this album, not just the right one.
        await db
          .update(manufacturerPaymentSteps)
          .set({
            stripeCheckoutSessionId: session.id,
            paymentMethod: "card",
            cardFeeCents: feeCents,
          })
          .where(eq(manufacturerPaymentSteps.id, step.id));

        res.json({ url: session.url });
      } catch (e: any) {
        // Release the step back to unpaid so it can be retried.
        await db
          .update(manufacturerPaymentSteps)
          .set({ status: "unpaid", lastError: e?.message?.slice(0, 500) ?? "Stripe error" })
          .where(eq(manufacturerPaymentSteps.id, step.id));
        console.error(`[shopify-plus] checkout session create failed: ${e?.message}`);
        res.status(502).json({ message: e?.message ?? "Failed to create checkout session" });
      }
    },
  );

  // Task #2929 — operator-only reset for a step stuck on "Paying" after an
  // abandoned checkout. Expires the Stripe session and returns the step to
  // payable; refuses when the payment actually completed / is mid-debit.
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/reset-payment",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const stepId = String(req.params.stepId);
      const ctx = await resolveAdmin(req, res);
      if (!ctx) return;
      // resolveAdmin admits ALL partner accounts (kind "admin" covers
      // partners too) — the reset is operator-only, so check the primary
      // role explicitly. resetStuckPaymentStep re-checks it as the
      // authority; this is just the early HTTP shape.
      const callerRole = (await getUserRole(ctx.userId))?.role ?? null;
      const stripe = await getStripe();
      const result = await resetStuckPaymentStep({
        albumId,
        stepId,
        callerRole,
        stripe,
      });
      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }
      res.json({ ok: true, step: result.step });
    },
  );

  // Task #3380 — operator-only: accept a partial bank transfer as payment
  // in full on an awaiting-transfer step. Shrinks the PaymentIntent to the
  // received amount, confirms it from the customer's cash balance, and
  // settles the step via the idempotent paid path with the accepted total
  // recorded so ledger math stays honest. Never partners.
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/accept-partial",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const stepId = String(req.params.stepId);
      const ctx = await resolveAdmin(req, res);
      if (!ctx) return;
      // resolveAdmin admits ALL partner accounts — this action is
      // operator-only, so check the primary role explicitly.
      // acceptPartialTransferAsPaid re-checks it as the authority.
      const callerRole = (await getUserRole(ctx.userId))?.role ?? null;
      const stripe = (await getStripe()) as unknown as BankTransferStripe;
      const result = await acceptPartialTransferAsPaid({
        albumId,
        stepId,
        callerRole,
        stripe,
      });
      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }
      res.json({
        ok: true,
        step: result.step,
        acceptedCents: result.acceptedCents,
        forgivenCents: result.forgivenCents,
      });
    },
  );
}
