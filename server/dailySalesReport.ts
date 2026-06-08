// Task #1783 — End-of-day (daily) sales report email digest.
//
// Once a day, the artist (a `person`) and their team (a `label`) receive
// an email summary of the last 24 hours of activity for the releases they
// can see: number of sales, copies, revenue, gifts, and donations
// (e.g. Gift of Hope). This reuses the existing partner-notification
// recipient settings (partner_notification_recipients) — NOT a new
// contact system — so only people the operator has set up as recipients
// for a person/label partner get the digest, subscribed via the
// `daily_sales_digest` event (or the empty-events = all rule).
//
// Scoping mirrors the artist dashboard / buyer-roster album scope exactly
// (see server/artistReports.ts): a person owns an album when they are its
// primaryArtistId OR its payout owner; a label owns the albums released on
// it. `deleted_at IS NULL` keeps soft-deleted releases out, same as those
// surfaces. The digest never duplicates the live admin Orders view or the
// per-sale partner notifications — it's a once-a-day rollup.
//
// Quiet on empty days by default: a partner with zero sales in the window
// is skipped (no email). Set DAILY_SALES_DIGEST_SEND_EMPTY=true to send a
// "no sales" digest anyway.
//
// Restart-safe: each send stamps the UTC calendar day it covers
// (`digestDate`) into the notification-log payload, and before dispatching
// we skip any partner that already has a daily_sales_digest logged for the
// same `digestDate`. This is a stable per-period idempotency key, so a
// restart (whose boot tick fires ~6min in) never double-mails regardless
// of how far the schedule has drifted — at most one digest per partner per
// UTC day. (A plain "sent in the last N hours" window can't guarantee this
// once the schedule drifts past N.)

import { sql } from "drizzle-orm";
import { db } from "./db";
import { pgArray } from "./lib/pgArray";
import { formatUsdCents } from "@shared/money";
import {
  dispatchPartnerNotification,
  partnerEmailHtml,
} from "./partnerNotifications";

const WINDOW_HOURS = 24;

// The UTC calendar day a run covers — the stable idempotency key. Two runs
// on the same UTC day (e.g. a scheduled tick and a post-restart boot tick)
// resolve to the same key and so collapse to a single send.
function digestDateKey(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

type DigestPartner = { partnerKind: "person" | "label"; partnerId: string };

type DigestMetrics = {
  orders: number;
  copies: number;
  grossCents: number;
  gifts: number;
  donationCents: number;
  refundedCents: number;
};

export type DailyDigestRunResult = {
  partnersConsidered: number;
  sent: number;
  skippedEmpty: number;
  skippedRecent: number;
  skippedNoRecipients: number;
};

function sendEmptyDigests(): boolean {
  return String(process.env.DAILY_SALES_DIGEST_SEND_EMPTY ?? "")
    .trim()
    .toLowerCase() === "true";
}

// Distinct person/label partners that have at least one active recipient.
// We only ever consider partners someone configured — the digest is opt-in
// through the existing recipient settings, never a broadcast. `only`
// narrows to a single partner (used by tests to keep the blast radius off
// every other configured recipient).
async function listDigestPartners(only?: DigestPartner): Promise<DigestPartner[]> {
  const r = await db.execute<{ partner_kind: string; partner_id: string }>(sql`
    SELECT DISTINCT partner_kind, partner_id
    FROM partner_notification_recipients
    WHERE partner_kind IN ('person','label')
      AND deleted_at IS NULL
      ${only ? sql`AND partner_kind = ${only.partnerKind} AND partner_id = ${only.partnerId}` : sql``}
  `);
  return ((r as any).rows ?? []).map((row: any) => ({
    partnerKind: row.partner_kind as "person" | "label",
    partnerId: String(row.partner_id),
  }));
}

// True when a daily_sales_digest for this exact UTC day already went out
// (or failed) for this partner — persisted in the log payload so it
// survives a restart. Empty-activity days log nothing, so they never block
// a later real send for the same day.
async function alreadySentForDay(
  p: DigestPartner,
  digestDate: string,
): Promise<boolean> {
  const r = await db.execute<{ ok: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM partner_notification_log l
      JOIN partner_notification_recipients r ON r.id = l.recipient_id
      WHERE r.partner_kind = ${p.partnerKind}
        AND r.partner_id = ${p.partnerId}
        AND l.event_type = 'daily_sales_digest'
        AND l.status IN ('sent','failed')
        AND l.payload_snapshot ->> 'digestDate' = ${digestDate}
    ) AS ok
  `);
  return ((r as any).rows?.[0]?.ok) === true;
}

async function resolvePartnerName(p: DigestPartner): Promise<string | null> {
  const table = p.partnerKind === "person" ? sql`people` : sql`labels`;
  const r = await db.execute<{ name: string }>(sql`
    SELECT name FROM ${table} WHERE id = ${p.partnerId} LIMIT 1
  `);
  const name = (r as any).rows?.[0]?.name;
  return name ? String(name) : null;
}

// Album scope, mirroring computeArtistDatasetScope in artistReports.ts.
async function resolveAlbumIds(p: DigestPartner): Promise<string[]> {
  const rows =
    p.partnerKind === "person"
      ? await db.execute<{ id: string }>(sql`
          SELECT id FROM albums
          WHERE (primary_artist_id = ${p.partnerId}
                 OR (payout_owner_kind = 'person' AND payout_owner_id = ${p.partnerId}))
            AND deleted_at IS NULL
        `)
      : await db.execute<{ id: string }>(sql`
          SELECT id FROM albums
          WHERE label_id = ${p.partnerId}
            AND deleted_at IS NULL
        `);
  return ((rows as any).rows ?? []).map((r: any) => String(r.id));
}

// Window metrics over the partner's albums. Mirrors the revenue/units math
// in artistReports.computeKpis (revenue statuses, order_copies fan-out)
// and adds gift + donation counts for the digest.
async function computeMetrics(
  albumIds: string[],
  from: Date,
  to: Date,
): Promise<DigestMetrics> {
  const empty: DigestMetrics = {
    orders: 0,
    copies: 0,
    grossCents: 0,
    gifts: 0,
    donationCents: 0,
    refundedCents: 0,
  };
  if (albumIds.length === 0) return empty;

  const main = await db.execute<{
    orders: string;
    copies: string;
    gross: string;
    gifts: string;
    refunded: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE o.status <> 'refunded')::text AS orders,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN COALESCE(cc.cnt, 1) ELSE 0 END), 0)::text AS copies,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS gross,
      COUNT(*) FILTER (WHERE o.status <> 'refunded' AND o.gift_id IS NOT NULL)::text AS gifts,
      COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS refunded
    FROM orders o
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS cnt FROM order_copies GROUP BY order_id
    ) cc ON cc.order_id = o.id
    WHERE o.status IN ('paid','shipped','complete','completed','refunded')
      AND o.album_id = ANY(${pgArray(albumIds)})
      AND o.created_at >= ${from} AND o.created_at < ${to}
  `);
  const m = (main as any).rows?.[0] ?? {};

  const don = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(rc.amount_cents), 0)::text AS total
    FROM referral_credits rc
    JOIN orders o ON o.id = rc.order_id
    WHERE rc.referrer_kind = 'non_profit'
      AND o.album_id = ANY(${pgArray(albumIds)})
      AND o.created_at >= ${from} AND o.created_at < ${to}
  `);
  const donationCents = Number((don as any).rows?.[0]?.total ?? 0);

  return {
    orders: Number(m.orders ?? 0),
    copies: Number(m.copies ?? 0),
    grossCents: Number(m.gross ?? 0),
    gifts: Number(m.gifts ?? 0),
    donationCents,
    refundedCents: Number(m.refunded ?? 0),
  };
}

function buildBodyLines(metrics: DigestMetrics, sendEmpty: boolean): string[] {
  if (metrics.orders === 0) {
    return [
      "No sales in the last 24 hours. We'll only email this report on days with activity (this one was sent because empty-day reports are switched on).",
    ];
  }
  const lines: string[] = [];
  const saleWord = metrics.orders === 1 ? "sale" : "sales";
  const copyWord = metrics.copies === 1 ? "copy" : "copies";
  lines.push(
    `${metrics.orders} ${saleWord} · ${metrics.copies} ${copyWord} · ${formatUsdCents(metrics.grossCents)} in revenue.`,
  );
  if (metrics.gifts > 0) {
    lines.push(
      `${metrics.gifts} of those ${metrics.gifts === 1 ? "was a gift" : "were gifts"}.`,
    );
  }
  if (metrics.donationCents > 0) {
    lines.push(
      `${formatUsdCents(metrics.donationCents)} raised in donations (e.g. Gift of Hope).`,
    );
  }
  if (metrics.refundedCents > 0) {
    lines.push(`${formatUsdCents(metrics.refundedCents)} refunded.`);
  }
  return lines;
}

function buildText(heading: string, lines: string[]): string {
  return [heading, "", ...lines].join("\n");
}

// Run a digest pass. Returns counters for the scheduler log. `force`
// bypasses the recent-send dedup (used by the debug route / tests).
export async function runDailySalesDigests(
  opts?: { force?: boolean; only?: DigestPartner },
): Promise<DailyDigestRunResult> {
  const force = opts?.force === true;
  const sendEmpty = sendEmptyDigests();
  const out: DailyDigestRunResult = {
    partnersConsidered: 0,
    sent: 0,
    skippedEmpty: 0,
    skippedRecent: 0,
    skippedNoRecipients: 0,
  };

  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_HOURS * 3600_000);
  const digestDate = digestDateKey(to);

  let partners: DigestPartner[];
  try {
    partners = await listDigestPartners(opts?.only);
  } catch (e) {
    console.error("[daily-digest] failed to list partners:", (e as Error)?.message ?? e);
    return out;
  }
  out.partnersConsidered = partners.length;

  for (const p of partners) {
    try {
      if (!force && (await alreadySentForDay(p, digestDate))) {
        out.skippedRecent += 1;
        continue;
      }
      const name = await resolvePartnerName(p);
      if (!name) {
        // Recipient points at a deleted person/label — nothing to send.
        out.skippedNoRecipients += 1;
        continue;
      }
      const albumIds = await resolveAlbumIds(p);
      const metrics = await computeMetrics(albumIds, from, to);

      if (metrics.orders === 0 && !sendEmpty) {
        out.skippedEmpty += 1;
        continue;
      }

      const heading = "Your daily sales report";
      const lines = buildBodyLines(metrics, sendEmpty);
      const html = partnerEmailHtml({
        heading,
        bodyLines: lines,
        partnerName: name,
      });
      const subject =
        metrics.orders === 0
          ? `GoodTunes daily report — no sales in the last 24h`
          : `GoodTunes daily report — ${metrics.orders} ${metrics.orders === 1 ? "sale" : "sales"}, ${formatUsdCents(metrics.grossCents)}`;

      const res = await dispatchPartnerNotification({
        partnerKind: p.partnerKind,
        partnerId: p.partnerId,
        eventType: "daily_sales_digest",
        subject,
        html,
        text: buildText(heading, lines),
        payloadSnapshot: {
          digestDate,
          windowFrom: from.toISOString(),
          windowTo: to.toISOString(),
          albumCount: albumIds.length,
          ...metrics,
        },
      });
      if (res.sent > 0) out.sent += 1;
    } catch (e) {
      console.error(
        `[daily-digest] partner ${p.partnerKind}/${p.partnerId} failed:`,
        (e as Error)?.message ?? e,
      );
    }
  }
  return out;
}
