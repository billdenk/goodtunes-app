// Task #534 — Partner notifications dispatcher + storage helpers.
//
// One place that knows how to: (a) read/write recipient rows for a
// partner, (b) fan an event out to every active EMAIL recipient who
// subscribed to it, composing the email per event type, and (c) log
// every delivery attempt to partner_notification_log so the admin card
// can show "Last notified:" lines.
//
// Only the email channel is delivered in v1 (see DELIVERABLE_CHANNELS).
// Non-email recipients are stored but skipped at dispatch — logged with
// status="skipped" so the operator can see they were intentionally not
// contacted rather than silently dropped.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  partnerNotificationRecipients,
  partnerNotificationLog,
  type PartnerNotificationRecipient,
} from "@shared/schema";
import {
  recipientWantsEvent,
  type PartnerNotificationKind,
  type PartnerNotificationEvent,
} from "@shared/partnerNotifications";
import { sendPartnerNotificationEmail } from "./mail";

// ---- Storage helpers -----------------------------------------------------

export type RecipientWithMeta = PartnerNotificationRecipient & {
  lastNotifiedAt: string | null;
};

// Active (not soft-deleted) recipients for a partner, newest first, each
// annotated with the most recent successful send time from the log.
export async function listRecipients(
  partnerKind: PartnerNotificationKind,
  partnerId: string,
): Promise<RecipientWithMeta[]> {
  const rows = await db
    .select()
    .from(partnerNotificationRecipients)
    .where(
      and(
        eq(partnerNotificationRecipients.partnerKind, partnerKind),
        eq(partnerNotificationRecipients.partnerId, partnerId),
        isNull(partnerNotificationRecipients.deletedAt),
      ),
    )
    .orderBy(desc(partnerNotificationRecipients.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const last = await db
    .select({
      recipientId: partnerNotificationLog.recipientId,
      lastAt: sql<string | null>`MAX(${partnerNotificationLog.sentAt})`,
    })
    .from(partnerNotificationLog)
    .where(
      and(
        eq(partnerNotificationLog.status, "sent"),
        sql`${partnerNotificationLog.recipientId} = ANY(${ids})`,
      ),
    )
    .groupBy(partnerNotificationLog.recipientId);
  const lastById = new Map(last.map((l) => [l.recipientId, l.lastAt]));
  return rows.map((r) => ({ ...r, lastNotifiedAt: lastById.get(r.id) ?? null }));
}

export async function createRecipient(input: {
  partnerKind: PartnerNotificationKind;
  partnerId: string;
  name: string;
  channel: string;
  address: string;
  role: string;
  events: string[];
}): Promise<PartnerNotificationRecipient> {
  const [row] = await db
    .insert(partnerNotificationRecipients)
    .values({
      partnerKind: input.partnerKind,
      partnerId: input.partnerId,
      name: input.name,
      channel: input.channel,
      address: input.address,
      role: input.role,
      events: input.events,
    })
    .returning();
  return row;
}

// Soft-delete — keeps the log rows (and their FK) intact so the audit
// trail survives a removed recipient. Returns the row id when something
// was actually flipped, null when nothing matched (already gone).
export async function softDeleteRecipient(
  recipientId: string,
): Promise<string | null> {
  const [row] = await db
    .update(partnerNotificationRecipients)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(partnerNotificationRecipients.id, recipientId),
        isNull(partnerNotificationRecipients.deletedAt),
      ),
    )
    .returning({ id: partnerNotificationRecipients.id });
  return row?.id ?? null;
}

// ---- Dispatch ------------------------------------------------------------

export type DispatchResult = { sent: number; failed: number; skipped: number };

// Fan `eventType` out to every active recipient of (partnerKind,
// partnerId) that wants it. `subject`/`html`/`text` are the composed
// email; `payloadSnapshot` is frozen into each log row. Best-effort:
// never throws — a notification failure must not break the business
// action that triggered it.
export async function dispatchPartnerNotification(opts: {
  partnerKind: PartnerNotificationKind;
  partnerId: string;
  eventType: PartnerNotificationEvent;
  subject: string;
  html: string;
  text: string;
  payloadSnapshot: Record<string, unknown>;
}): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0 };
  try {
    const recipients = await db
      .select()
      .from(partnerNotificationRecipients)
      .where(
        and(
          eq(partnerNotificationRecipients.partnerKind, opts.partnerKind),
          eq(partnerNotificationRecipients.partnerId, opts.partnerId),
          isNull(partnerNotificationRecipients.deletedAt),
        ),
      );
    for (const r of recipients) {
      if (!recipientWantsEvent(r.events, opts.eventType)) continue;
      // v1 only delivers email; other channels are stored but skipped.
      if (r.channel !== "email") {
        await logSend(r.id, opts.eventType, opts.payloadSnapshot, "skipped", `channel ${r.channel} not delivered in v1`);
        result.skipped += 1;
        continue;
      }
      const addr = (r.address ?? "").trim();
      if (!addr) {
        await logSend(r.id, opts.eventType, opts.payloadSnapshot, "skipped", "no address");
        result.skipped += 1;
        continue;
      }
      const send = await sendPartnerNotificationEmail(addr, opts.subject, opts.html, opts.text);
      if (send.ok) {
        await logSend(r.id, opts.eventType, opts.payloadSnapshot, "sent", null);
        result.sent += 1;
      } else {
        await logSend(r.id, opts.eventType, opts.payloadSnapshot, "failed", send.reason);
        result.failed += 1;
      }
    }
  } catch (e) {
    console.error(
      `[partner-notif] dispatch failed kind=${opts.partnerKind} id=${opts.partnerId} event=${opts.eventType}:`,
      (e as Error)?.message ?? e,
    );
  }
  return result;
}

async function logSend(
  recipientId: string,
  eventType: string,
  payloadSnapshot: Record<string, unknown>,
  status: string,
  error: string | null,
): Promise<void> {
  try {
    await db.insert(partnerNotificationLog).values({
      recipientId,
      eventType,
      payloadSnapshot,
      status,
      error,
    });
  } catch (e) {
    console.error("[partner-notif] log insert failed:", (e as Error)?.message ?? e);
  }
}

// ---- Helpers used by event sites -----------------------------------------

// Resolve the press (manufacturer) currently pressing an album via the
// live pressing-order-request, mirroring the pipeline query. Returns
// null when no live POR points at a press (e.g. outside-system runs).
export async function resolvePressIdForAlbum(albumId: string): Promise<string | null> {
  const r = await db.execute<any>(sql`
    SELECT por.package_snapshot ->> 'pressId' AS press_id
    FROM pressing_order_requests por
    WHERE por.album_id = ${albumId}
      AND por.status <> 'cancelled'
      AND por.package_snapshot ->> 'pressId' IS NOT NULL
    ORDER BY (por.status = 'approved') DESC, por.submitted_at DESC
    LIMIT 1
  `);
  const row = ((r as any).rows ?? [])[0];
  return row?.press_id ?? null;
}

const BRAND = "#319ED8";

// Shared email chrome so every partner notification reads like the
// other GoodTunes transactional mail (uppercase wordmark, 480px column).
export function partnerEmailHtml(opts: {
  heading: string;
  bodyLines: string[];
  partnerName: string;
  cta?: { label: string; url: string };
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = opts.bodyLines
    .map(
      (l) =>
        `<p style="font-size: 15px; line-height: 1.5; color: #333; margin: 0 0 12px;">${esc(l)}</p>`,
    )
    .join("\n");
  const cta = opts.cta
    ? `<p style="margin: 20px 0 8px;"><a href="${esc(opts.cta.url)}" style="display: inline-block; background: ${BRAND}; color: #fff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 11px 20px; border-radius: 8px;">${esc(opts.cta.label)}</a></p>`
    : "";
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      <div style="font-size: 14px; color: #666; letter-spacing: 0.5px; text-transform: uppercase;">GoodTunes</div>
      <h1 style="font-size: 26px; margin: 12px 0 16px; font-weight: 700;">${esc(opts.heading)}</h1>
      ${paras}
      ${cta}
      <p style="font-size: 12px; color: #999; margin-top: 28px; border-top: 1px solid #eee; padding-top: 16px;">
        You're receiving this because <strong>${esc(opts.partnerName)}</strong> is set up to get GoodTunes partner notifications. Reply to this email to reach the GoodTunes team.
      </p>
    </div>
  `;
}

export { BRAND as PARTNER_EMAIL_BRAND };
