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
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  albumManufacturerQuotes,
  albums,
  fulfillmentPartners,
  manufacturerPaymentSteps,
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

  // GET the whole ledger for an album: resolved manufacturer, quotes,
  // steps, and rolled-up totals.
  app.get(
    "/api/admin/albums/:albumId/manufacturing-ledger",
    async (req, res) => {
      const albumId = String(req.params.albumId);
      const userId = await gatePayouts(req, res, albumId);
      if (!userId) return;

      const [manufacturer, quotes, steps] = await Promise.all([
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
      ]);

      const quotedCents = steps.reduce(
        (s, r) => s + r.amountCents + r.marginCents,
        0,
      );
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
        steps,
        totals: { quotedCents, paidCents, processingCents, outstandingCents },
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
      const userId = await gatePayouts(req, res, albumId);
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
      const userId = await gatePayouts(req, res, albumId);
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
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? "Invalid quote" });
      }
      const [row] = await db
        .insert(albumManufacturerQuotes)
        .values({
          albumId,
          fileUrl: parsed.data.fileUrl,
          fileName: parsed.data.fileName ?? null,
          notes: parsed.data.notes ?? null,
          uploadedByUserId: userId,
        })
        .returning();
      res.json({ ok: true, quote: row });
    },
  );

  app.delete(
    "/api/admin/albums/:albumId/manufacturing-ledger/quotes/:quoteId",
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
      const userId = await gatePayouts(req, res, albumId);
      if (!userId) return;

      const schema = z.object({
        description: z.string().trim().min(1).max(200),
        amountCents: z.number().int().min(1),
        marginCents: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
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
        })
        .returning();
      res.json({ ok: true, step: row });
    },
  );

  // Edit a step — only while it is still unpaid (never mutate a settled
  // or in-flight amount).
  app.patch(
    "/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId",
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
      const userId = await gatePayouts(req, res, albumId);
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

  // Start an ACH bank-debit checkout for a step. Returns a hosted Stripe
  // Checkout URL. Allowed only while unpaid (a "failed" attempt is reset
  // to unpaid by the webhook, so this covers retries too).
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

      const manufacturer = await resolveAlbumManufacturer(albumId);
      if (!manufacturer) {
        return res.status(422).json({
          message:
            "No manufacturer is set for this album yet. Assign a press before collecting a manufacturing payment.",
        });
      }

      const album = await storage.getAlbumById(albumId, { includeHidden: true });
      const totalCents = step.amountCents + step.marginCents;
      const origin = absoluteOrigin(req);
      const returnBase = `${origin}/admin/albums/${albumId}?tab=payments`;

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
                  name: `${album?.title ?? "Album"} — ${step.description}`,
                  description: `Manufacturing payment to ${manufacturer.name}`,
                },
              },
              quantity: 1,
            },
          ],
          metadata,
          payment_intent_data: { metadata },
          success_url: `${returnBase}&paid=1`,
          cancel_url: returnBase,
        });

        await db
          .update(manufacturerPaymentSteps)
          .set({
            manufacturerId: manufacturer.id,
            stripeCheckoutSessionId: session.id,
            lastError: null,
          })
          .where(eq(manufacturerPaymentSteps.id, step.id));

        res.json({ url: session.url });
      } catch (e) {
        console.error(
          `[shopify-plus] checkout create failed for step ${step.id}:`,
          (e as Error)?.message ?? e,
        );
        res
          .status(502)
          .json({ message: "Could not start the bank payment. Try again." });
      }
    },
  );
}

export type { ManufacturerPaymentStep };
