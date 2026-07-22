// Task #2428 — GoodTunes Shopify+ (prepaid manufacturing) payment ledger.
//
// A `shopify_plus` album runs the full Direct production pipeline (press
// / GoodDeed / optional fulfillment) but the customer sells on their own
// Shopify store, so there is NO GoodTunes fan checkout or fan-sale pool.
// Instead the customer PREPAYS the manufacturing run through a staged
// ACH ledger on the album's Payments tab:
//
//   album_manufacturer_quotes   — the plant's quote PDF(s), for records.
//   manufacturer_payment_steps  — an open-ended series of hand-keyed
//                                 steps (setup/test pressing, vinyl run,
//                                 overage & freight, fulfillment, the
//                                 GoodDeed legs). Each step is paid via a
//                                 hosted Stripe Checkout using a US bank
//                                 debit (us_bank_account / ACH).
//
// When an ACH debit SETTLES into the platform balance we mint a HELD
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
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  albumManufacturerQuotes,
  albums,
  fulfillmentPartners,
  manufacturerPaymentSteps,
  payoutEarmarks,
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
async function markStepPaid(stepId: string, paymentIntentId: string | null) {
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

  await db
    .update(manufacturerPaymentSteps)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId ?? step.stripePaymentIntentId,
      manufacturerId: manufacturerId ?? step.manufacturerId,
      earmarkId,
      lastError: null,
    })
    .where(eq(manufacturerPaymentSteps.id, step.id));
  console.log(`[shopify-plus] step ${step.id} → paid (earmark ${earmarkId ?? "none"})`);

  // Task #2785 — notify Bill when an artist_direct ACH settles so he knows
  // funds are held and ready to release to the plant. Best-effort.
  if ((step as any).fundingSource === "artist_direct") {
    void notifyOperatorOfArtistPayment({
      stepId: step.id,
      albumId: step.albumId,
      description: step.description,
      amountCents: step.amountCents,
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

// Called from the commerce.ts Stripe webhook BEFORE materializeOrderFromSession.
// Returns true when the event was a Shopify+ step event and was handled
// (so the caller skips the fan-order materialization path). ACH is always
// async: checkout.session.completed lands with payment_status "processing",
// then funds settle via async_payment_succeeded / payment_intent.succeeded.
export async function handleShopifyPlusWebhookEvent(event: {
  type: string;
  data: { object: any };
}): Promise<boolean> {
  const obj = event.data?.object ?? {};
  const meta = obj?.metadata ?? {};
  const isStep = meta?.gt_kind === "shopify_plus_step";

  switch (event.type) {
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
      const activeQuote = quotes.find((q) => q.isActive) ?? null;
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
        .filter((r) => r.status === "processing")
        .reduce((s, r) => s + r.amountCents + r.marginCents, 0);
      const outstandingCents = quotedCents - paidCents;

      res.json({
        manufacturer,
        quotes,
        steps: stepsWithEarmark,
        totals: {
          quotedCents,
          quotedSource,
          systemCents,
          paidCents,
          processingCents,
          outstandingCents,
        },
        runClosedAt: albumRow?.runClosedAt ?? null,
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
  // artist_direct step. Operator-only (gateEditMetadata). Best-effort.
  app.post(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/remind",
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
      if ((step as any).fundingSource !== "artist_direct") {
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
      };

      try {
        const stripe = await getStripe();
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["us_bank_account"],
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
          ],
          payment_intent_data: { metadata },
          metadata,
          success_url: `${returnBase}&payment=success`,
          cancel_url: `${returnBase}&payment=cancelled`,
          // 30-minute session window — plenty of time for the customer to
          // add/verify a bank account; the step is reset by session.expired.
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        });

        // Persist the session ID so releaseAbandonedStep() can validate it on
        // checkout.session.expired — without this, any expired session could
        // reset ANY processing step for this album, not just the right one.
        await db
          .update(manufacturerPaymentSteps)
          .set({ stripeCheckoutSessionId: session.id })
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
}
