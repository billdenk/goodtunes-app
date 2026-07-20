import type { Express } from "express";
import Stripe from "stripe";
import { db } from "./db";
import { paymentRequests, people, albums } from "@shared/schema";
import { eq, desc, ilike, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { sendPaymentRequestEmail } from "./mail";
import { getUserRole } from "./auth/roles";
import { getAuthFromRequest } from "./auth/host";
import { z } from "zod";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2025-04-30.basil" as any });
}

async function requireOperator(req: any, res: any): Promise<string | null> {
  const userId: string | undefined = req.session?.userId;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
  const roleInfo = await getUserRole(userId);
  if (roleInfo?.role !== "super_admin" && roleInfo?.role !== "admin") {
    res.status(403).json({ message: "Operator access required" });
    return null;
  }
  return userId;
}

const createSchema = z.object({
  recipientPersonId: z.string().min(1),
  amountCents: z.number().int().positive().max(10_000_00),
  description: z.string().min(1).max(500),
  albumId: z.string().optional().nullable(),
});

export function registerPaymentRequestRoutes(
  app: Express,
  requireAdmin: (req: any, res: any, next: any) => Promise<void>,
) {
  // ── Album search (for the create form picker) ─────────────────────────
  app.get("/api/admin/payment-requests/albums-search", requireAdmin, async (req, res) => {
    try {
      const userId = await requireOperator(req, res);
      if (!userId) return;
      const q = String(req.query.q ?? "").trim();
      const rows = await db
        .select({ id: albums.id, title: albums.title })
        .from(albums)
        .where(q ? ilike(albums.title, `%${q}%`) : undefined)
        .orderBy(albums.title)
        .limit(20);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── Create ────────────────────────────────────────────────────────────
  app.post("/api/admin/payment-requests", requireAdmin, async (req, res) => {
    try {
      const userId = await requireOperator(req, res);
      if (!userId) return;

      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
      }
      const { recipientPersonId, amountCents, description, albumId } = parsed.data;

      // Resolve recipient email + name from the people table.
      // Fallback: if contactEmail is null, try the linked admin users row
      // (artists have a users row where role_scope_id = people.id).
      const [person] = await db
        .select({ id: people.id, name: people.name, contactEmail: people.contactEmail })
        .from(people)
        .where(eq(people.id, recipientPersonId))
        .limit(1);
      if (!person) return res.status(404).json({ message: "Person not found" });

      let recipientEmail = person.contactEmail ?? null;

      if (!recipientEmail) {
        // Try admin users row (role_scope_id is a raw-SQL column, not in drizzle schema)
        const fallback = await db.execute(
          sql`SELECT email FROM users WHERE role_scope_id = ${recipientPersonId} LIMIT 1`
        );
        const row = (fallback as any).rows?.[0] ?? (Array.isArray(fallback) ? fallback[0] : null);
        recipientEmail = row?.email ?? null;
      }

      if (!recipientEmail) {
        return res.status(422).json({
          message: `${person.name} has no contact email on file. Add one on their People page first.`,
        });
      }

      // Insert a provisional row first so we have an ID for Stripe metadata.
      const [row] = await db
        .insert(paymentRequests)
        .values({
          createdByUserId: userId,
          recipientPersonId,
          recipientEmail,
          amountCents,
          currency: "usd",
          description,
          albumId: albumId ?? null,
        })
        .returning();

      // Mint a one-off Stripe Price and Payment Link.
      // The link is deactivated by the webhook after first payment, enforcing one-use.
      let linkId: string | null = null;
      let linkUrl: string | null = null;
      try {
        const stripe = getStripe();
        const price = await stripe.prices.create({
          unit_amount: amountCents,
          currency: "usd",
          product_data: {
            name: description,
            metadata: { payment_request_id: row.id },
          },
        });
        const afterUrl = `${process.env.REPLIT_DEPLOYMENT_URL ?? "https://admin.goodtunes.music"}/admin/payment-requests?paid=${row.id}`;
        const link = await stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }],
          metadata: { payment_request_id: row.id },
          after_completion: {
            type: "redirect",
            redirect: { url: afterUrl },
          },
        });
        linkId = link.id;
        linkUrl = link.url;
      } catch (stripeErr: any) {
        await db.delete(paymentRequests).where(eq(paymentRequests.id, row.id));
        console.error("[payment-requests] Stripe link creation failed", stripeErr?.message);
        return res.status(502).json({ message: `Stripe error: ${stripeErr?.message ?? "unknown"}` });
      }

      // Stamp the Stripe IDs onto the row.
      const [updated] = await db
        .update(paymentRequests)
        .set({ stripePaymentLinkId: linkId, stripePaymentLinkUrl: linkUrl })
        .where(eq(paymentRequests.id, row.id))
        .returning();

      // Send the email (best-effort).
      try {
        const mailResult = await sendPaymentRequestEmail(
          recipientEmail,
          person.name,
          amountCents,
          description,
          linkUrl!,
        );
        if (!mailResult.ok) {
          console.warn("[payment-requests] email send failed:", mailResult.reason);
        }
      } catch (mailErr: any) {
        console.warn("[payment-requests] email threw:", mailErr?.message);
      }

      return res.status(201).json({ ...updated, paymentUrl: linkUrl });
    } catch (err: any) {
      console.error("[payment-requests] create error", err?.message);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── List ──────────────────────────────────────────────────────────────
  app.get("/api/admin/payment-requests", requireAdmin, async (req, res) => {
    try {
      const userId = await requireOperator(req, res);
      if (!userId) return;

      const rows = await db
        .select({
          pr: paymentRequests,
          personName: people.name,
          personPhotoUrl: people.photoUrl,
          albumTitle: albums.title,
        })
        .from(paymentRequests)
        .leftJoin(people, eq(paymentRequests.recipientPersonId, people.id))
        .leftJoin(albums, eq(paymentRequests.albumId, albums.id))
        .orderBy(desc(paymentRequests.createdAt));

      return res.json(
        rows.map((r) => ({
          ...r.pr,
          recipientName: r.personName ?? "(unknown)",
          recipientPhotoUrl: r.personPhotoUrl ?? null,
          albumTitle: r.albumTitle ?? null,
        })),
      );
    } catch (err: any) {
      console.error("[payment-requests] list error", err?.message);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── Cancel ────────────────────────────────────────────────────────────
  // Stripe deactivation is atomic with the DB update: if Stripe fails we
  // return the error and do NOT mark the row as cancelled, so the link
  // stays active and the operator can retry.
  app.delete("/api/admin/payment-requests/:id", requireAdmin, async (req, res) => {
    try {
      const userId = await requireOperator(req, res);
      if (!userId) return;

      const [row] = await db
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.id, req.params.id))
        .limit(1);
      if (!row) return res.status(404).json({ message: "Not found" });
      if (row.status === "paid") {
        return res.status(409).json({ message: "Cannot cancel a paid request" });
      }
      if (row.status === "cancelled") {
        return res.status(409).json({ message: "Already cancelled" });
      }

      // Deactivate the Stripe Payment Link first.
      // If this fails, abort — leave the row pending so it can be retried.
      if (row.stripePaymentLinkId) {
        const stripe = getStripe();
        await stripe.paymentLinks.update(row.stripePaymentLinkId, { active: false });
      }

      const [updated] = await db
        .update(paymentRequests)
        .set({ status: "cancelled" })
        .where(eq(paymentRequests.id, row.id))
        .returning();

      return res.json(updated);
    } catch (err: any) {
      console.error("[payment-requests] cancel error", err?.message);
      return res.status(500).json({ message: err?.message ?? "Server error" });
    }
  });

  // ── Resend email ──────────────────────────────────────────────────────
  app.post("/api/admin/payment-requests/:id/resend", requireAdmin, async (req, res) => {
    try {
      const userId = await requireOperator(req, res);
      if (!userId) return;

      const [row] = await db
        .select({ pr: paymentRequests, personName: people.name })
        .from(paymentRequests)
        .leftJoin(people, eq(paymentRequests.recipientPersonId, people.id))
        .where(eq(paymentRequests.id, req.params.id))
        .limit(1);
      if (!row) return res.status(404).json({ message: "Not found" });
      if (row.pr.status !== "pending") {
        return res.status(409).json({ message: "Can only resend pending requests" });
      }
      if (!row.pr.stripePaymentLinkUrl) {
        return res.status(409).json({ message: "No payment link on this request" });
      }

      const result = await sendPaymentRequestEmail(
        row.pr.recipientEmail,
        row.personName ?? row.pr.recipientEmail,
        row.pr.amountCents,
        row.pr.description,
        row.pr.stripePaymentLinkUrl,
      );
      if (!result.ok) {
        return res.status(502).json({ message: result.reason ?? "Email send failed" });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[payment-requests] resend error", err?.message);
      return res.status(500).json({ message: "Server error" });
    }
  });
}

// Called from the Stripe webhook when checkout.session.completed fires
// for a payment-link session that carries a payment_request_id in metadata.
// Marks the row paid and immediately deactivates the link (one-off enforcement).
export async function handlePaymentRequestCheckout(
  sessionId: string,
  paymentRequestId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.id, paymentRequestId))
    .limit(1);
  if (!row) {
    console.warn(`[payment-requests] webhook: no row for id ${paymentRequestId}`);
    return;
  }
  if (row.status === "paid") return; // idempotent — safe on webhook replay

  await db
    .update(paymentRequests)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripeCheckoutSessionId: sessionId,
    })
    .where(eq(paymentRequests.id, paymentRequestId));

  // Deactivate the Stripe Payment Link so it cannot be reused (one-off enforcement).
  if (row.stripePaymentLinkId) {
    try {
      const key = process.env.STRIPE_SECRET_KEY;
      if (key) {
        const stripe = new Stripe(key, { apiVersion: "2025-04-30.basil" as any });
        await stripe.paymentLinks.update(row.stripePaymentLinkId, { active: false });
      }
    } catch (e: any) {
      // Non-blocking: the row is already paid; the link deactivation is best-effort here
      // because a Stripe error at this point would bubble up and prevent the webhook 200.
      console.warn(`[payment-requests] could not deactivate link after payment:`, e?.message);
    }
  }

  console.log(`[payment-requests] marked paid + link deactivated: ${paymentRequestId}`);
}
