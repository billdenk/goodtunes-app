// Task #77 — Admin & super-admin god-view reporting.
//
// Aggregators here run UNSCOPED — they're called from /api/admin/reports/*
// which is gated to super_admin role. Partner-scoped reports continue
// to live in ./index.ts and are reached via /api/partner/reports/*.
import { db } from "../db";
import {
  albums,
  people,
  labels,
  orders,
  orderItems,
  customerUsers,
  users,
  analyticsEvents,
  songs,
  payoutAccounts,
} from "@shared/schema";
import { isFullAccessEmail } from "@shared/fullAccess";
import { pgArray } from "../lib/pgArray";
import { and, eq, ne, gte, lte, inArray, sql, desc, isNull, isNotNull, or, not } from "drizzle-orm";

export interface AdminReportContext {
  from: Date;
  to: Date;
}

function dateBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Task #153 — coerce any DB/aggregate value to a finite number, falling
// back to 0. SQL aggregates come back as strings ("12") or null when
// the underlying table is empty; without this the dashboard JSON can
// contain NaN or null and the client crashes on `.toLocaleString`.
function safeNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function emptySeries(from: Date, to: Date): Record<string, number> {
  const out: Record<string, number> = {};
  const cur = new Date(from); cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to); end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    out[dateBucket(cur)] = 0;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ─── Platform KPIs ────────────────────────────────────────────────────
// Returns headline GMV/net/orders/buyers/signups, DAU/WAU/MAU, plays +
// unique listeners, conversion, plus a `prior` object containing the
// same headline metrics over the immediately preceding window of equal
// length (so the UI can render Δ vs prior period).
export async function platformKpis(ctx: AdminReportContext) {
  // Compute prior-period bounds: same window length, immediately
  // preceding ctx.from. Used for Δ-vs-prior comparison in the UI.
  const windowMs = ctx.to.getTime() - ctx.from.getTime();
  const priorTo = new Date(ctx.from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - windowMs);

  async function headline(from: Date, to: Date) {
    const paid = await db
      .select({ id: orders.id, totalCents: orders.totalCents, customerId: orders.customerId, platformFeeCents: orders.platformFeeCents })
      .from(orders)
      // Task #2270 — exclude QA test-purchase orders from god-view KPIs.
      .where(and(eq(orders.status, "paid"), ne(orders.origin, "qa:test"), gte(orders.createdAt, from), lte(orders.createdAt, to)));
    let gmv = 0; let net = 0; const buyers = new Set<string>();
    for (const r of paid) {
      gmv += r.totalCents;
      net += r.platformFeeCents ?? r.totalCents;
      buyers.add(r.customerId);
    }
    const signups = await db.execute<{ c: string }>(sql`SELECT COUNT(*) AS c FROM customer_users WHERE created_at >= ${from} AND created_at <= ${to}`);
    const plays = await db.execute<{ plays: string; listeners: string }>(sql`SELECT COUNT(*) AS plays, COUNT(DISTINCT COALESCE(user_id, session_id)) AS listeners FROM analytics_events WHERE name = 'play_start' AND ts >= ${from} AND ts <= ${to}`);
    return {
      gmvCents: safeNum(gmv),
      netCents: safeNum(net),
      orderCount: safeNum(paid.length),
      uniqueBuyers: safeNum(buyers.size),
      avgOrderCents: paid.length ? Math.round(gmv / paid.length) : 0,
      newSignups: safeNum((signups as any).rows?.[0]?.c),
      plays: safeNum((plays as any).rows?.[0]?.plays),
      uniqueListeners: safeNum((plays as any).rows?.[0]?.listeners),
    };
  }

  const paidFilters = [eq(orders.status, "paid"), gte(orders.createdAt, ctx.from), lte(orders.createdAt, ctx.to)];
  const paid = await db.select({ id: orders.id, totalCents: orders.totalCents, customerId: orders.customerId, createdAt: orders.createdAt, platformFeeCents: orders.platformFeeCents, certCostCents: orders.certCostCents, refundedAt: orders.refundedAt }).from(orders).where(and(...paidFilters));

  const refundedRows = await db.select({ id: orders.id }).from(orders).where(and(gte(orders.refundedAt, ctx.from), lte(orders.refundedAt, ctx.to), isNotNull(orders.refundedAt)));

  let gmvCents = 0;
  let netCents = 0;
  const dailyGmv = emptySeries(ctx.from, ctx.to);
  const dailyOrders = emptySeries(ctx.from, ctx.to);
  const buyerSet = new Set<string>();
  for (const r of paid) {
    gmvCents += r.totalCents;
    // "Net" = platform fee retained by GoodTunes (i.e. our cut). When
    // platformFeeCents is null (older orders that never went through
    // payouts), conservatively count the whole order as net so the
    // headline doesn't under-report.
    netCents += r.platformFeeCents ?? r.totalCents;
    buyerSet.add(r.customerId);
    if (r.createdAt) {
      const k = dateBucket(r.createdAt);
      if (k in dailyGmv) { dailyGmv[k] += r.totalCents; dailyOrders[k] += 1; }
    }
  }

  // Plays + unique listeners over current range (in-range, not rolling).
  const playsRow = await db.execute<{ plays: string; listeners: string }>(sql`SELECT COUNT(*) AS plays, COUNT(DISTINCT COALESCE(user_id, session_id)) AS listeners FROM analytics_events WHERE name = 'play_start' AND ts >= ${ctx.from} AND ts <= ${ctx.to}`);
  const plays = Number((playsRow as any).rows?.[0]?.plays ?? 0);
  const uniqueListeners = Number((playsRow as any).rows?.[0]?.listeners ?? 0);

  // Daily plays — same `play_start` definition as the headline, bucketed
  // by UTC day so the dashboard can sparkline/trend-chart it.
  const dailyPlays = emptySeries(ctx.from, ctx.to);
  const dailyPlaysRows = await db.execute<{ d: string; c: string }>(sql`SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, COUNT(*) AS c FROM analytics_events WHERE name = 'play_start' AND ts >= ${ctx.from} AND ts <= ${ctx.to} GROUP BY 1`);
  for (const r of (dailyPlaysRows as any).rows ?? []) {
    if (r.d in dailyPlays) dailyPlays[r.d] = Number(r.c);
  }

  // Prior-period comparison.
  const prior = await headline(priorFrom, priorTo);

  // Signups (customer side).
  const newCustomers = await db.select({ id: customerUsers.id, createdAt: customerUsers.createdAt }).from(customerUsers).where(and(gte(customerUsers.createdAt, ctx.from), lte(customerUsers.createdAt, ctx.to)));
  const dailySignups = emptySeries(ctx.from, ctx.to);
  for (const c of newCustomers) {
    if (!c.createdAt) continue;
    const k = dateBucket(c.createdAt);
    if (k in dailySignups) dailySignups[k] += 1;
  }

  // Active users via analytics events. DAU = distinct sessionIds with
  // ANY event today. WAU/MAU use rolling 7/30 windows ending at ctx.to.
  const toEnd = new Date(ctx.to);
  const dauStart = new Date(toEnd); dauStart.setUTCHours(0, 0, 0, 0);
  const wauStart = new Date(toEnd.getTime() - 7 * 86400_000);
  const mauStart = new Date(toEnd.getTime() - 30 * 86400_000);
  async function distinctSessions(from: Date): Promise<number> {
    const rows = await db.execute<{ c: string }>(sql`SELECT COUNT(DISTINCT session_id) AS c FROM analytics_events WHERE session_id IS NOT NULL AND ts >= ${from} AND ts <= ${toEnd}`);
    return Number((rows as any).rows?.[0]?.c ?? 0);
  }
  const [dau, wau, mau] = await Promise.all([distinctSessions(dauStart), distinctSessions(wauStart), distinctSessions(mauStart)]);

  // Visit → first-purchase conversion. "Visit" = distinct sessions with
  // any event in range. "First purchase" = distinct customers whose
  // first paid order is in range.
  const totalSessionsRow = await db.execute<{ c: string }>(sql`SELECT COUNT(DISTINCT session_id) AS c FROM analytics_events WHERE session_id IS NOT NULL AND ts >= ${ctx.from} AND ts <= ${ctx.to}`);
  const visits = Number((totalSessionsRow as any).rows?.[0]?.c ?? 0);
  // First-purchase customers in range — anyone whose MIN(orders.created_at WHERE status='paid') falls in window.
  const firstPurchaseRow = await db.execute<{ c: string }>(sql`SELECT COUNT(*) AS c FROM (SELECT customer_id, MIN(created_at) AS first_paid FROM orders WHERE status = 'paid' GROUP BY customer_id) f WHERE f.first_paid >= ${ctx.from} AND f.first_paid <= ${ctx.to}`);
  const firstPurchases = Number((firstPurchaseRow as any).rows?.[0]?.c ?? 0);

  // Task #153 — every series entry must contain every numeric field so
  // the dashboard never receives `undefined` for a metric value. Even
  // though emptySeries() pre-fills every day with 0, defensively coerce
  // each lookup in case future code paths build the dicts differently.
  const series = Object.keys(dailyGmv).sort().map((d) => ({
    date: d,
    gmvCents: safeNum(dailyGmv[d]),
    orders: safeNum(dailyOrders[d]),
    signups: safeNum(dailySignups[d]),
    plays: safeNum(dailyPlays[d]),
  }));

  return {
    gmvCents: safeNum(gmvCents),
    netCents: safeNum(netCents),
    orderCount: safeNum(paid.length),
    uniqueBuyers: safeNum(buyerSet.size),
    avgOrderCents: paid.length ? Math.round(gmvCents / paid.length) : 0,
    newSignups: safeNum(newCustomers.length),
    refundedCount: safeNum(refundedRows.length),
    refundRate: paid.length ? refundedRows.length / paid.length : 0,
    dau,
    wau,
    mau,
    plays: safeNum(plays),
    uniqueListeners: safeNum(uniqueListeners),
    visits: safeNum(visits),
    firstPurchases: safeNum(firstPurchases),
    conversionRate: visits ? firstPurchases / visits : 0,
    series,
    prior: {
      from: priorFrom.toISOString(),
      to: priorTo.toISOString(),
      ...prior,
    },
  };
}

// ─── Revenue breakdown ─────────────────────────────────────────────────
export async function revenueBreakdown(ctx: AdminReportContext) {
  const paidFilters = [eq(orders.status, "paid"), gte(orders.createdAt, ctx.from), lte(orders.createdAt, ctx.to)];
  const ord = await db
    .select({
      id: orders.id,
      totalCents: orders.totalCents,
      albumId: orders.albumId,
      shippingAddress: orders.shippingAddress,
      billingAddress: orders.billingAddress,
      skuKind: orders.skuKind,
      labelSnapshotId: orders.labelSnapshotId,
      artistSnapshotId: orders.artistSnapshotId,
      albumLabelId: albums.labelId,
      albumPrimaryArtistId: albums.primaryArtistId,
      albumTitle: albums.title,
      albumArtist: albums.artist,
    })
    .from(orders)
    .innerJoin(albums, eq(orders.albumId, albums.id))
    .where(and(...paidFilters));

  const items = ord.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ord.map((o) => o.id)))
    : [];
  const itemsByOrder = new Map<string, typeof items>();
  for (const it of items) {
    const a = itemsByOrder.get(it.orderId) ?? [];
    a.push(it);
    itemsByOrder.set(it.orderId, a as any);
  }

  // SKU-kind buckets: prefer order-items breakdown (line-item granular),
  // fall back to orders.skuKind when no line items.
  const bySku = new Map<string, { cents: number; units: number }>();
  for (const o of ord) {
    const lines = itemsByOrder.get(o.id) ?? [];
    if (lines.length === 0) {
      const k = o.skuKind || "unknown";
      const slot = bySku.get(k) ?? { cents: 0, units: 0 };
      slot.cents += o.totalCents; slot.units += 1;
      bySku.set(k, slot);
    } else {
      for (const it of lines as any[]) {
        const k = it.kind || "unknown";
        const slot = bySku.get(k) ?? { cents: 0, units: 0 };
        slot.cents += it.unitPriceCents * it.quantity;
        slot.units += it.quantity;
        bySku.set(k, slot);
      }
    }
  }

  const byLabel = new Map<string, { cents: number; units: number; name: string }>();
  const byArtist = new Map<string, { cents: number; units: number; name: string }>();
  const byCountry = new Map<string, { cents: number; units: number }>();

  // Resolve label + person names in one go.
  const labelIds = Array.from(new Set(ord.map((o) => o.labelSnapshotId ?? o.albumLabelId).filter(Boolean) as string[]));
  const artistIds = Array.from(new Set(ord.map((o) => o.artistSnapshotId ?? o.albumPrimaryArtistId).filter(Boolean) as string[]));
  const labelNames = new Map<string, string>();
  const artistNames = new Map<string, string>();
  if (labelIds.length) {
    const rows = await db.select({ id: labels.id, name: labels.name }).from(labels).where(inArray(labels.id, labelIds));
    for (const r of rows) labelNames.set(r.id, r.name);
  }
  if (artistIds.length) {
    const rows = await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, artistIds));
    for (const r of rows) artistNames.set(r.id, r.name);
  }

  for (const o of ord) {
    const lid = o.labelSnapshotId ?? o.albumLabelId;
    if (lid) {
      const slot = byLabel.get(lid) ?? { cents: 0, units: 0, name: labelNames.get(lid) ?? "Unknown label" };
      slot.cents += o.totalCents; slot.units += 1;
      byLabel.set(lid, slot);
    }
    const aid = o.artistSnapshotId ?? o.albumPrimaryArtistId;
    const aName = aid ? (artistNames.get(aid) ?? o.albumArtist) : o.albumArtist;
    const aKey = aid ?? `__free__${aName}`;
    const aSlot = byArtist.get(aKey) ?? { cents: 0, units: 0, name: aName };
    aSlot.cents += o.totalCents; aSlot.units += 1;
    byArtist.set(aKey, aSlot);

    const country = (((o.shippingAddress as any)?.country || (o.billingAddress as any)?.country) as string | undefined) || "Unknown";
    const cSlot = byCountry.get(country) ?? { cents: 0, units: 0 };
    cSlot.cents += o.totalCents; cSlot.units += 1;
    byCountry.set(country, cSlot);
  }

  function topN<T extends { cents: number }>(m: Map<string, T>, n: number): Array<{ id: string } & T> {
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, n);
  }

  return {
    bySku: Array.from(bySku.entries()).map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.cents - a.cents),
    byLabel: topN(byLabel, 50),
    byArtist: topN(byArtist, 50),
    byCountry: Array.from(byCountry.entries()).map(([country, v]) => ({ country, ...v })).sort((a, b) => b.cents - a.cents),
  };
}

// ─── Top content (plays-based) ─────────────────────────────────────────
export async function topContent(ctx: AdminReportContext) {
  // Task #587 — "Listeners" must count distinct *people*, not distinct
  // sessions. A signed-in fan playing the same track on phone + laptop
  // is one listener; the prior code keyed on sessionId alone (and
  // collapsed every signed-out play under a single literal "anon"),
  // which inflated some rows and silently merged others. Mirror the
  // pattern used by playsEngagement: identity = COALESCE(user_id,
  // session_id, event_id). Falling back to the event id keeps a truly
  // anonymous (no user, no session) event counted as its own listener
  // instead of crashing every signed-out play together.
  const rows = await db
    .select({
      name: analyticsEvents.name,
      payload: analyticsEvents.payload,
      sessionId: analyticsEvents.sessionId,
      userId: analyticsEvents.userId,
      eventId: analyticsEvents.id,
    })
    .from(analyticsEvents)
    .where(and(
      eq(analyticsEvents.name, "play_start"),
      gte(analyticsEvents.ts, ctx.from),
      lte(analyticsEvents.ts, ctx.to),
    ));

  const songPlays = new Map<string, { plays: number; listeners: Set<string> }>();
  const albumPlays = new Map<string, { plays: number; listeners: Set<string> }>();
  const artistPlays = new Map<string, { plays: number; listeners: Set<string> }>();

  for (const r of rows) {
    const p = (r.payload as any) ?? {};
    const identity = r.userId ?? r.sessionId ?? r.eventId;
    if (p.songId) {
      const s = songPlays.get(p.songId) ?? { plays: 0, listeners: new Set() };
      s.plays += 1; s.listeners.add(identity); songPlays.set(p.songId, s);
    }
    if (p.albumId) {
      const s = albumPlays.get(p.albumId) ?? { plays: 0, listeners: new Set() };
      s.plays += 1; s.listeners.add(identity); albumPlays.set(p.albumId, s);
    }
    if (p.artistId) {
      const s = artistPlays.get(p.artistId) ?? { plays: 0, listeners: new Set() };
      s.plays += 1; s.listeners.add(identity); artistPlays.set(p.artistId, s);
    }
  }

  // Resolve names.
  const songIds = Array.from(songPlays.keys());
  const albumIds = Array.from(albumPlays.keys());
  const artistIds = Array.from(artistPlays.keys());

  const [songRows, albumRows, artistRows] = await Promise.all([
    songIds.length ? db.select({ id: songs.id, title: songs.title, albumId: songs.albumId }).from(songs).where(inArray(songs.id, songIds)) : Promise.resolve([] as any[]),
    albumIds.length ? db.select({ id: albums.id, title: albums.title, artist: albums.artist, labelId: albums.labelId }).from(albums).where(inArray(albums.id, albumIds)) : Promise.resolve([] as any[]),
    artistIds.length ? db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, artistIds)) : Promise.resolve([] as any[]),
  ]);

  const albumById = new Map(albumRows.map((a: any) => [a.id, a]));
  const songOut = songRows.map((s: any) => ({
    songId: s.id, title: s.title,
    albumTitle: albumById.get(s.albumId)?.title ?? "",
    artist: albumById.get(s.albumId)?.artist ?? "",
    plays: songPlays.get(s.id)?.plays ?? 0,
    listeners: songPlays.get(s.id)?.listeners.size ?? 0,
  })).sort((a, b) => b.plays - a.plays).slice(0, 25);

  const albumOut = albumRows.map((a: any) => ({
    albumId: a.id, title: a.title, artist: a.artist,
    plays: albumPlays.get(a.id)?.plays ?? 0,
    listeners: albumPlays.get(a.id)?.listeners.size ?? 0,
  })).sort((a, b) => b.plays - a.plays).slice(0, 25);

  const artistOut = artistRows.map((p: any) => ({
    artistId: p.id, name: p.name,
    plays: artistPlays.get(p.id)?.plays ?? 0,
    listeners: artistPlays.get(p.id)?.listeners.size ?? 0,
  })).sort((a, b) => b.plays - a.plays).slice(0, 25);

  // Labels via album.labelId aggregation.
  const labelPlays = new Map<string, { plays: number; listeners: Set<string> }>();
  Array.from(albumPlays.entries()).forEach(([aid, v]) => {
    const lbl = albumById.get(aid)?.labelId;
    if (!lbl) return;
    const slot = labelPlays.get(lbl) ?? { plays: 0, listeners: new Set<string>() };
    slot.plays += v.plays;
    Array.from(v.listeners).forEach((s) => slot.listeners.add(s));
    labelPlays.set(lbl, slot);
  });
  const labelIds = Array.from(labelPlays.keys());
  const labelRows = labelIds.length
    ? await db.select({ id: labels.id, name: labels.name }).from(labels).where(inArray(labels.id, labelIds))
    : [];
  const labelOut = labelRows.map((l: any) => ({
    labelId: l.id, name: l.name,
    plays: labelPlays.get(l.id)?.plays ?? 0,
    listeners: labelPlays.get(l.id)?.listeners.size ?? 0,
  })).sort((a, b) => b.plays - a.plays).slice(0, 25);

  return { songs: songOut, albums: albumOut, artists: artistOut, labels: labelOut };
}

// ─── Ops health ────────────────────────────────────────────────────────
export async function opsHealth(ctx: AdminReportContext) {
  // Failed fulfillment pushes — a paid physical order whose last hand-off to
  // the press/printer (Order Desk or the Odoo printer) actually errored and
  // hasn't recovered. Both push paths write the failure message to
  // `orders.fulfillment_error` and clear it back to null on a successful push
  // (server/orderDesk.ts, server/odoo.ts), so a non-null error == an
  // unresolved push failure that needs a retry.
  //
  // This deliberately does NOT use a "days since purchase" heuristic: in
  // GoodTunes' pre-order model vinyl isn't pressed until the sales window
  // sunsets (~2 weeks out) and nothing ships until manufacturing finishes, so
  // every healthy pre-order would otherwise trip a time-based alarm. We gate
  // on a real recorded error instead, scoped to paid physical orders that
  // haven't reached a terminal fulfillment state.
  const PHYSICAL_SKU_KINDS = ["vinyl", "cassette", "cd", "bundle"];
  const TERMINAL_FULFILLMENT = ["shipped", "delivered", "cancelled", "returned"];
  const stuckRows = await db
    .select({
      id: orders.id,
      albumId: orders.albumId,
      fulfillmentStatus: orders.fulfillmentStatus,
      fulfillmentError: orders.fulfillmentError,
      submittedToFulfillmentAt: orders.submittedToFulfillmentAt,
      inFulfillmentAt: orders.inFulfillmentAt,
      createdAt: orders.createdAt,
      totalCents: orders.totalCents,
      buyerEmail: orders.buyerEmail,
      buyerName: orders.buyerName,
      orderDeskOrderId: orders.orderDeskOrderId,
    })
    .from(orders)
    .where(and(
      eq(orders.status, "paid"),
      inArray(orders.skuKind, PHYSICAL_SKU_KINDS),
      isNotNull(orders.fulfillmentError),
      ne(orders.fulfillmentError, ""),
      or(
        isNull(orders.fulfillmentStatus),
        not(inArray(orders.fulfillmentStatus, TERMINAL_FULFILLMENT)),
      ),
    ))
    .orderBy(desc(orders.createdAt));

  // Refund rate in window.
  const paidInRange = await db
    .select({ id: orders.id, refundedAt: orders.refundedAt })
    .from(orders)
    .where(and(eq(orders.status, "paid"), gte(orders.createdAt, ctx.from), lte(orders.createdAt, ctx.to)));
  const refundedInRange = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(gte(orders.refundedAt, ctx.from), lte(orders.refundedAt, ctx.to), isNotNull(orders.refundedAt)));

  // Failed Stripe payments — Stripe doesn't write a row to `orders` when
  // a PaymentIntent fails (we only insert on session.completed). The
  // best proxy we have today is orders with status='pending' that were
  // created in-range and never advanced. Surface them in the selected
  // window + explicit last-24h and last-7d cuts so the operator can
  // spot a recent spike independent of the date filter. Full ingestion
  // of `payment_intent.payment_failed` and `charge.dispute.*` webhooks
  // is tracked as a follow-up (see ops Tab footer).
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600_000);
  const last7d = new Date(now.getTime() - 7 * 86400_000);
  async function pendingCount(from: Date, to: Date): Promise<number> {
    const r = await db.execute<{ c: string }>(sql`SELECT COUNT(*) AS c FROM orders WHERE status = 'pending' AND created_at >= ${from} AND created_at <= ${to}`);
    return Number((r as any).rows?.[0]?.c ?? 0);
  }
  const [failed24h, failed7d] = await Promise.all([
    pendingCount(last24h, now),
    pendingCount(last7d, now),
  ]);
  const failedRows = await db
    .select({ id: orders.id, createdAt: orders.createdAt, totalCents: orders.totalCents, albumId: orders.albumId, buyerEmail: orders.buyerEmail })
    .from(orders)
    .where(and(
      eq(orders.status, "pending"),
      gte(orders.createdAt, ctx.from),
      lte(orders.createdAt, ctx.to),
    ))
    .orderBy(desc(orders.createdAt));

  // Chargeback rate proxy — we don't ingest `charge.dispute.*` webhooks
  // yet, but Stripe records the dispute as a refund on the underlying
  // PaymentIntent. Until we have a dedicated disputes table this is
  // surfaced as `null` (UI renders "—") rather than a misleading 0%.
  // Follow-up: ingest dispute webhooks and persist on order row.
  const chargebackRate: number | null = null;

  // Payouts stuck — shipped orders without a clean transfer.
  const stuckPayouts = await db.execute<{ c: string }>(sql`SELECT COUNT(*) AS c FROM orders WHERE status = 'shipped' AND (payout_status IS NULL OR payout_status IN ('skipped','failed'))`);

  return {
    stuckFulfillments: {
      // Kept the key name for back-compat with existing consumers, but the
      // meaning is now "failed fulfillment pushes" (unresolved
      // fulfillment_error), not a time-based "stuck" heuristic.
      threshold: "failed push",
      count: stuckRows.length,
      rows: stuckRows.slice(0, 100),
    },
    failedCheckouts: {
      count: failedRows.length,
      last24hCount: failed24h,
      last7dCount: failed7d,
      rows: failedRows.slice(0, 100),
      proxyNote: "Counts include abandoned Checkout Sessions that never advanced to paid. Real PaymentIntent failures and chargebacks require Stripe webhook ingestion (follow-up).",
    },
    refunds: {
      paidInRange: paidInRange.length,
      refundedInRange: refundedInRange.length,
      rate: paidInRange.length ? refundedInRange.length / paidInRange.length : 0,
    },
    chargebackRate,
    stuckPayoutCount: Number((stuckPayouts as any).rows?.[0]?.c ?? 0),
  };
}

// ─── Payout reconciliation (super-admin only) ──────────────────────────
export async function payoutReconciliation(ctx: AdminReportContext) {
  // Per-owner: shipped orders count, computed payout cents (from order
  // snapshot), actually transferred cents (sum of payoutAmountCents
  // where payoutStatus='transferred'). Delta surfaces any drift.
  const rows = await db
    .select({
      ownerKind: orders.payoutOwnerKind,
      ownerId: orders.payoutOwnerId,
      payoutAmountCents: orders.payoutAmountCents,
      payoutStatus: orders.payoutStatus,
      totalCents: orders.totalCents,
      shippedAt: orders.shippedAt,
    })
    .from(orders)
    .where(and(
      eq(orders.status, "shipped"),
      gte(orders.shippedAt, ctx.from),
      lte(orders.shippedAt, ctx.to),
    ));

  type Agg = { kind: string; id: string; ownerName: string; shippedCount: number; transferredCount: number; computedCents: number; transferredCents: number; pendingCents: number; failedCount: number };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const kind = r.ownerKind ?? "unknown";
    const id = r.ownerId ?? "unknown";
    const key = `${kind}:${id}`;
    const slot = map.get(key) ?? { kind, id, ownerName: "", shippedCount: 0, transferredCount: 0, computedCents: 0, transferredCents: 0, pendingCents: 0, failedCount: 0 };
    slot.shippedCount += 1;
    slot.computedCents += r.payoutAmountCents ?? 0;
    if (r.payoutStatus === "transferred") {
      slot.transferredCount += 1;
      slot.transferredCents += r.payoutAmountCents ?? 0;
    } else if (r.payoutStatus === "skipped" || r.payoutStatus === "failed") {
      slot.failedCount += 1;
      slot.pendingCents += r.payoutAmountCents ?? 0;
    } else if (r.payoutStatus == null) {
      slot.pendingCents += r.payoutAmountCents ?? 0;
    }
    map.set(key, slot);
  }

  // Resolve names.
  const personIds = Array.from(map.values()).filter((a) => a.kind === "person").map((a) => a.id);
  const labelIds = Array.from(map.values()).filter((a) => a.kind === "label").map((a) => a.id);
  if (personIds.length) {
    const prs = await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, personIds));
    for (const p of prs) {
      const key = `person:${p.id}`;
      const slot = map.get(key); if (slot) slot.ownerName = p.name;
    }
  }
  if (labelIds.length) {
    const lrs = await db.select({ id: labels.id, name: labels.name }).from(labels).where(inArray(labels.id, labelIds));
    for (const l of lrs) {
      const key = `label:${l.id}`;
      const slot = map.get(key); if (slot) slot.ownerName = l.name;
    }
  }

  // Also surface connected-account status so the operator can see who's
  // ready to receive money.
  const accounts = await db.select().from(payoutAccounts);
  const acctByOwner = new Map<string, typeof accounts[number]>();
  for (const a of accounts) acctByOwner.set(`${a.ownerKind}:${a.ownerId}`, a);

  const out = Array.from(map.values())
    .map((a) => ({
      ...a,
      ownerName: a.ownerName || `${a.kind} · ${a.id.slice(0, 8)}`,
      deltaCents: a.computedCents - a.transferredCents,
      payoutsEnabled: acctByOwner.get(`${a.kind}:${a.id}`)?.payoutsEnabled ?? false,
      stripeAccountId: acctByOwner.get(`${a.kind}:${a.id}`)?.stripeAccountId ?? null,
    }))
    .sort((a, b) => b.computedCents - a.computedCents);

  return { rows: out };
}

// ─── Incomplete-albums audit ("Needs attention") ───────────────────────
// Task #1967 — operator audit of every GoodTunes-release album that's
// short of complete in at least one production dimension, across ALL
// lifecycle stages (prepping/staged/released/sunset — stage is a column,
// not a filter). Aggregated entirely in SQL so the client just renders.
//
// The per-track completeness rules MUST mirror the album-editor Tracks
// tab so the two never drift:
//   - Masters ready  → `songs.mux_status = 'ready'`
//                      (client/src/lib/sectionCompleteness.ts).
//   - Lyrics satisfied → plain `lyrics` OR `synced_lyrics` present, with
//                      instrumentals counting as satisfied by design
//                      (AdminAlbum trackSectionStatuses + the task's
//                      instrumental exemption).
//   - Credits complete → the song has BOTH a writer (track_writers) AND a
//                      performer (track_performers) row, soft-deletes
//                      excluded (AdminAlbum trackSectionStatuses).
//
// "Incomplete" (the row qualifies for the audit) = zero tracks OR any
// track missing a ready master OR any non-instrumental track missing
// lyrics OR any track missing credits. Soft-deleted albums, songs, and
// credit rows are all filtered out so the counts match what the editor
// shows.
export interface IncompleteAlbumRow {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  primaryArtistId: string | null;
  labelId: string | null;
  // Raw lifecycle inputs so the client can reuse the shared `albumStage`
  // helper rather than re-deriving the bucket server-side.
  isPrepping: boolean;
  isHidden: boolean;
  goodTunesReleaseDate: string | null;
  streamingReleaseDate: string | null;
  trackCount: number;
  mastersReady: number;
  lyricsSatisfied: number;
  creditsComplete: number;
  // Task #2372 — admin-only effective press placeholder (logo + jacket art),
  // populated in the route handler via batchEnrichWithPressPlaceholders so the
  // Attention tab shows the press placeholder for art-less albums, matching
  // the grid/list views. Never sent to fan-facing surfaces.
  pressLogoUrl?: string | null;
  pressJacketUrl?: string | null;
}

export async function incompleteAlbums(): Promise<{ rows: IncompleteAlbumRow[] }> {
  const result = await db.execute<{
    id: string;
    title: string;
    artist: string;
    artwork: string;
    primary_artist_id: string | null;
    label_id: string | null;
    is_prepping: boolean;
    is_hidden: boolean;
    good_tunes_release_date: string | null;
    streaming_release_date: string | null;
    track_count: string;
    masters_ready: string;
    lyrics_satisfied: string;
    credits_complete: string;
  }>(sql`
    SELECT
      a.id,
      a.title,
      a.artist,
      a.artwork,
      a.primary_artist_id,
      a.label_id,
      a.is_prepping,
      a.is_hidden,
      a.good_tunes_release_date,
      a.streaming_release_date,
      COUNT(s.id) AS track_count,
      COUNT(s.id) FILTER (WHERE s.mux_status = 'ready') AS masters_ready,
      COUNT(s.id) FILTER (
        WHERE s.instrumental = true
          OR (s.lyrics IS NOT NULL AND s.lyrics <> '')
          OR s.synced_lyrics IS NOT NULL
      ) AS lyrics_satisfied,
      COUNT(s.id) FILTER (
        WHERE EXISTS (
            SELECT 1 FROM track_writers tw
            WHERE tw.song_id = s.id AND tw.deleted_at IS NULL
          )
          AND EXISTS (
            SELECT 1 FROM track_performers tp
            WHERE tp.song_id = s.id AND tp.deleted_at IS NULL
          )
      ) AS credits_complete
    FROM albums a
    LEFT JOIN songs s ON s.album_id = a.id AND s.deleted_at IS NULL
    WHERE a.is_goodtunes_release = true AND a.deleted_at IS NULL
    GROUP BY a.id
    HAVING
      COUNT(s.id) = 0
      OR COUNT(s.id) FILTER (WHERE s.mux_status = 'ready') < COUNT(s.id)
      OR COUNT(s.id) FILTER (
           WHERE s.instrumental = true
             OR (s.lyrics IS NOT NULL AND s.lyrics <> '')
             OR s.synced_lyrics IS NOT NULL
         ) < COUNT(s.id)
      OR COUNT(s.id) FILTER (
           WHERE EXISTS (
               SELECT 1 FROM track_writers tw
               WHERE tw.song_id = s.id AND tw.deleted_at IS NULL
             )
             AND EXISTS (
               SELECT 1 FROM track_performers tp
               WHERE tp.song_id = s.id AND tp.deleted_at IS NULL
             )
         ) < COUNT(s.id)
    ORDER BY lower(a.artist), lower(a.title)
  `);

  const rows: IncompleteAlbumRow[] = (result.rows as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    artwork: r.artwork,
    primaryArtistId: r.primary_artist_id ?? null,
    labelId: r.label_id ?? null,
    isPrepping: r.is_prepping === true,
    isHidden: r.is_hidden === true,
    goodTunesReleaseDate: r.good_tunes_release_date ?? null,
    streamingReleaseDate: r.streaming_release_date ?? null,
    trackCount: safeNum(r.track_count),
    mastersReady: safeNum(r.masters_ready),
    lyricsSatisfied: safeNum(r.lyrics_satisfied),
    creditsComplete: safeNum(r.credits_complete),
  }));

  return { rows };
}

// ─── Raw event explorer (super-admin only) ─────────────────────────────
export async function rawEvents(ctx: AdminReportContext, opts: { name?: string; userId?: string; sessionId?: string; limit?: number }) {
  const filters: any[] = [gte(analyticsEvents.ts, ctx.from), lte(analyticsEvents.ts, ctx.to)];
  if (opts.name) filters.push(eq(analyticsEvents.name, opts.name));
  if (opts.userId) filters.push(eq(analyticsEvents.userId, opts.userId));
  if (opts.sessionId) filters.push(eq(analyticsEvents.sessionId, opts.sessionId));
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const rows = await db
    .select()
    .from(analyticsEvents)
    .where(and(...filters))
    .orderBy(desc(analyticsEvents.ts))
    .limit(limit);
  return { rows, limit };
}

// ─── Release acquisition funnel (Task #2127) ───────────────────────────
// Compute a PostHog-independent, release-scoped acquisition funnel from
// our own analytics_events table:
//
//   landed (album_viewed) → viewed offer (bundle_viewed)
//     → started checkout (checkout_started) → completed (checkout_completed)
//
// We count DISTINCT sessions reaching each step, treated as a strict
// funnel — a session only counts at step N if it also reached every prior
// step. Step-to-step conversion is computed from those subset counts.
//
// `groupBy: "source"` breaks the same funnel down by acquisition source,
// derived first-touch from the campaign params mirrored into the payload
// (`_utm_source`/`_utm_campaign`), falling back to the referrer host
// (`_referrer_host`), then "direct". The client persists first-touch UTMs
// for the whole session, so every event in a session carries the same
// source — we just read the first non-empty one.

const FUNNEL_EVENT_NAMES = [
  "album_viewed",
  "bundle_viewed",
  "checkout_started",
  "checkout_completed",
] as const;

const FUNNEL_STEPS: { key: string; label: string; event: (typeof FUNNEL_EVENT_NAMES)[number] }[] = [
  { key: "landed", label: "Landed on the release", event: "album_viewed" },
  { key: "viewed_offer", label: "Viewed the offer", event: "bundle_viewed" },
  { key: "started_checkout", label: "Started checkout", event: "checkout_started" },
  { key: "completed", label: "Completed purchase", event: "checkout_completed" },
];

type SourceBucket = { key: string; label: string };

function deriveSource(p: Record<string, any>): SourceBucket {
  const utmSource = typeof p._utm_source === "string" ? p._utm_source.trim() : "";
  const utmCampaign = typeof p._utm_campaign === "string" ? p._utm_campaign.trim() : "";
  if (utmSource) {
    return {
      key: `utm:${utmSource.toLowerCase()}|${utmCampaign.toLowerCase()}`,
      label: utmCampaign ? `${utmSource} · ${utmCampaign}` : utmSource,
    };
  }
  const refHost = typeof p._referrer_host === "string" ? p._referrer_host.trim() : "";
  if (refHost) return { key: `ref:${refHost.toLowerCase()}`, label: refHost };
  return { key: "direct", label: "Direct / unknown" };
}

// Releases that have ANY funnel event ever — powers the Reports release
// picker. Not date-bounded so the picker stays stable as the operator
// changes the window. Sorted by landing volume so the busiest releases
// surface first. `proving-ground` releases with zero traffic won't appear
// here — that's honest (nothing to show yet).
export async function funnelReleases(restrictAlbumIds?: readonly string[] | null) {
  // Partner-scoped callers pass the partner's own album ids. `null`/undefined
  // = god-view (super_admin) — every release. An empty array = a partner with
  // no releases — return nothing rather than leaking the global list.
  if (restrictAlbumIds && restrictAlbumIds.length === 0) {
    return { releases: [] as { albumId: string; title: string; artist: string; landed: number; shareSlug: string | null }[] };
  }
  const restrict =
    restrictAlbumIds && restrictAlbumIds.length > 0
      ? sql` AND payload->>'albumId' = ANY(${pgArray(restrictAlbumIds as string[])})`
      : sql``;
  const rows = await db.execute<{ album_id: string; landed: string }>(sql`
    SELECT payload->>'albumId' AS album_id,
           COUNT(DISTINCT COALESCE(session_id, user_id, id)) AS landed
      FROM analytics_events
     WHERE name = 'album_viewed'
       AND payload->>'albumId' IS NOT NULL${restrict}
     GROUP BY 1
     ORDER BY landed DESC
     LIMIT 200
  `);
  const ids = (rows.rows as any[]).map((r) => r.album_id).filter(Boolean);
  if (ids.length === 0) return { releases: [] as { albumId: string; title: string; artist: string; landed: number; shareSlug: string | null }[] };
  const albumRows = await db
    .select({ id: albums.id, title: albums.title, artist: albums.artist, shareSlug: albums.shareSlug })
    .from(albums)
    .where(inArray(albums.id, ids));
  const byId = new Map(albumRows.map((a) => [a.id, a]));
  const landedById = new Map((rows.rows as any[]).map((r) => [r.album_id, safeNum(r.landed)]));
  const releases = ids
    .filter((id) => byId.has(id))
    .map((id) => ({
      albumId: id,
      title: byId.get(id)!.title,
      artist: byId.get(id)!.artist,
      landed: landedById.get(id) ?? 0,
      shareSlug: byId.get(id)!.shareSlug ?? null,
    }))
    .sort((a, b) => b.landed - a.landed);
  return { releases };
}

// All releases a partner OWNS — including ones with ZERO funnel traffic — so the
// campaign link-builder can mint tagged links for a brand-new release before any
// fan has landed on it (the exact moment a partner needs the link). Distinct from
// funnelReleases(), which lists only releases that already have album_viewed
// traffic (the funnel picker's honest "nothing to show yet" set). Soft-deleted
// albums are excluded. Sorted busiest-first, then by title for the zero-traffic tail.
export async function ownedReleasesWithFunnel(albumIds: readonly string[]) {
  const empty = {
    releases: [] as { albumId: string; title: string; artist: string; landed: number; shareSlug: string | null }[],
  };
  if (albumIds.length === 0) return empty;
  // Only GoodTunes storefront releases belong in the acquisition picker /
  // campaign link-builder — streaming-imported discography rows have no
  // storefront page or share link, so a funnel/UTM link for them is
  // meaningless (see docs/admin-conventions.md, streaming-row vs GoodTunes
  // release rule).
  const albumRows = await db
    .select({ id: albums.id, title: albums.title, artist: albums.artist, shareSlug: albums.shareSlug })
    .from(albums)
    .where(and(inArray(albums.id, albumIds as string[]), isNull(albums.deletedAt), eq(albums.isGoodTunesRelease, true)));
  if (albumRows.length === 0) return empty;
  const liveIds = albumRows.map((a) => a.id);
  const counts = await db.execute<{ album_id: string; landed: string }>(sql`
    SELECT payload->>'albumId' AS album_id,
           COUNT(DISTINCT COALESCE(session_id, user_id, id)) AS landed
      FROM analytics_events
     WHERE name = 'album_viewed'
       AND payload->>'albumId' = ANY(${pgArray(liveIds)})
     GROUP BY 1
  `);
  const landedById = new Map((counts.rows as any[]).map((r) => [r.album_id, safeNum(r.landed)]));
  const releases = albumRows
    .map((a) => ({
      albumId: a.id,
      title: a.title,
      artist: a.artist,
      landed: landedById.get(a.id) ?? 0,
      shareSlug: a.shareSlug ?? null,
    }))
    .sort((a, b) => b.landed - a.landed || a.title.localeCompare(b.title));
  return { releases };
}

export async function acquisitionFunnel(
  ctx: AdminReportContext,
  opts: { albumId: string; groupBy?: "source" | null; excludeInternal?: boolean },
) {
  const albumId = String(opts.albumId || "");
  if (!albumId) {
    return { album: null, steps: [], overallConversion: 0, bySource: [], excludedInternal: 0 };
  }

  const albumRow = (
    await db.select({ id: albums.id, title: albums.title, artist: albums.artist }).from(albums).where(eq(albums.id, albumId)).limit(1)
  )[0];

  const rows = await db
    .select({
      name: analyticsEvents.name,
      payload: analyticsEvents.payload,
      sessionId: analyticsEvents.sessionId,
      userId: analyticsEvents.userId,
      eventId: analyticsEvents.id,
    })
    .from(analyticsEvents)
    .where(and(
      inArray(analyticsEvents.name, FUNNEL_EVENT_NAMES as unknown as string[]),
      gte(analyticsEvents.ts, ctx.from),
      lte(analyticsEvents.ts, ctx.to),
      // Bound row volume DB-side — a wide date range across all releases would
      // otherwise load every funnel event into memory just to discard most of
      // them. The defensive in-JS `p.albumId !== albumId` check stays as a
      // belt-and-suspenders guard.
      sql`${analyticsEvents.payload}->>'albumId' = ${albumId}`,
    ));

  // Task #2257 — opt-in internal/test-traffic exclusion. We treat a session
  // as internal if ANY of its events is flagged at the source (the client
  // stamps `_internal: true` on operator/staff devices) OR its userId belongs
  // to a known operator/staff account: an admin (`users` row) or a full-access
  // operator fan account. We resolve the userId set up front from just the
  // userIds present in this funnel's rows so the lookup stays bounded.
  const internalUserIds = new Set<string>();
  if (opts.excludeInternal) {
    const userIds = Array.from(
      new Set(rows.map((r) => r.userId).filter((id): id is string => !!id)),
    );
    if (userIds.length > 0) {
      // Any analytics userId that matches an admin `users` row is staff.
      const adminRows = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const a of adminRows) internalUserIds.add(a.id);
      // Full-access operator fan accounts (e.g. Bill's @billy) — match by email.
      const fanRows = await db
        .select({ id: customerUsers.id, email: customerUsers.email })
        .from(customerUsers)
        .where(inArray(customerUsers.id, userIds));
      for (const f of fanRows) {
        if (isFullAccessEmail(f.email)) internalUserIds.add(f.id);
      }
    }
  }

  // Retroactive internal-DEVICE denylist. The forward-looking `_internal` stamp
  // only marks events AFTER an operator/staff member signs in on a device, so
  // OLD logged-out QA/test sessions on that same device predate the stamp and
  // would otherwise inflate the top of the funnel. We therefore treat a whole
  // device as internal if ANY of its events is internal (stamped OR a staff
  // userId — derived from the rows below), and also honor an explicitly
  // server-maintained denylist (`GT_INTERNAL_DEVICE_IDS`, comma-separated) for
  // devices we know are internal but that never produced a stamped/staff event.
  // Both are applied at session-classification time so historical sessions are
  // excluded immediately, not only future stamped ones.
  const internalDeviceIds = new Set<string>(
    (process.env.GT_INTERNAL_DEVICE_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Per session: which of the TOP-OF-FUNNEL events it hit (for THIS album) +
  // its source. The completion step is NOT counted from analytics events here
  // (see the order-derived reconciliation below) — instead the stitched
  // `checkout_completed` event is used only as an attribution BRIDGE so we can
  // map a paid order back to the source of the session that originally landed.
  type Sess = { hit: Set<string>; source: SourceBucket; internal: boolean; devices: Set<string> };
  const sessions = new Map<string, Sess>();
  // orderId → landing session identity, taken ONLY from the server-side
  // stitched completion (`_stitched: true`), which carries the original
  // landing session id. The client `/welcome` `checkout_completed` also carries
  // an orderId but fires on the NEW purchase-host session, so it must never win
  // the bridge.
  const orderToSession = new Map<string, string>();
  // userId → the landing sessions it appears in (fallback attribution for
  // historical orders with no stitch, e.g. a fan who browsed while signed in).
  const userToSessions = new Map<string, Set<string>>();
  for (const r of rows) {
    const p = (r.payload as any) ?? {};
    if (p.albumId !== albumId) continue;
    const identity = r.sessionId ?? r.userId ?? r.eventId;
    let s = sessions.get(identity);
    if (!s) {
      s = { hit: new Set(), source: deriveSource(p), internal: false, devices: new Set() };
      sessions.set(identity, s);
    } else if (s.source.key === "direct") {
      // First-touch should be consistent, but if an earlier event landed
      // before attribution was captured, prefer a real source when one of
      // this session's events carries it.
      const cand = deriveSource(p);
      if (cand.key !== "direct") s.source = cand;
    }
    // Internal if any event carries the device marker or a staff/operator
    // userId. Sticky once set — the whole session is internal.
    const eventInternal = p._internal === true || (r.userId && internalUserIds.has(r.userId));
    if (eventInternal) s.internal = true;
    // Track this session's device(s) and grow the internal-device denylist:
    // a device that ever produced an internal event is internal forever, which
    // retroactively taints its older logged-out sessions in the pass below.
    const deviceId = p._device_id ? String(p._device_id) : null;
    if (deviceId) {
      s.devices.add(deviceId);
      if (eventInternal) internalDeviceIds.add(deviceId);
    }
    if (r.userId) {
      let set = userToSessions.get(r.userId);
      if (!set) { set = new Set(); userToSessions.set(r.userId, set); }
      set.add(identity);
    }
    if (r.name === "checkout_completed") {
      // Bridge only — never a counted step (completions come from orders).
      if (p._stitched === true && p.orderId) orderToSession.set(String(p.orderId), identity);
      continue;
    }
    s.hit.add(r.name);
  }

  // Retroactive device denylist pass: any session that shares a device with a
  // known-internal device is internal too — even if its OWN events carry no
  // marker and no staff userId (the historical logged-out QA session case).
  // This is what makes the exclude-internal toggle deflate top-of-funnel
  // inflation from past internal testing, not just future stamped traffic.
  if (opts.excludeInternal && internalDeviceIds.size > 0) {
    for (const s of Array.from(sessions.values())) {
      if (s.internal) continue;
      for (const d of Array.from(s.devices)) {
        if (internalDeviceIds.has(d)) { s.internal = true; break; }
      }
    }
  }

  // Depth = how far a session got through the TOP three steps (landed →
  // viewed offer → started checkout). Completion is handled separately.
  const TOP_STEPS = FUNNEL_STEPS.length - 1; // 3 — drop the completed step
  const topDepth = (s: Sess) => {
    let depth = 0;
    for (let i = 0; i < TOP_STEPS; i++) {
      if (s.hit.has(FUNNEL_STEPS[i].event)) depth = i + 1;
      else break;
    }
    return depth;
  };

  // Strict funnel for the top three steps: a session counts at step N only if
  // it reached every prior step. Aggregate overall + per-source in one pass.
  let excludedInternal = 0;
  const overall = [0, 0, 0, 0];
  const sourceAgg = new Map<string, { label: string; counts: number[] }>();
  const getBucket = (src: SourceBucket) => {
    let b = sourceAgg.get(src.key);
    if (!b) { b = { label: src.label, counts: [0, 0, 0, 0] }; sourceAgg.set(src.key, b); }
    return b;
  };
  for (const s of Array.from(sessions.values())) {
    // Drop internal/test sessions entirely before counting so every step
    // and the per-source breakdown stay consistent (the conversion math is
    // recomputed from the reduced counts below).
    if (opts.excludeInternal && s.internal) {
      excludedInternal += 1;
      continue;
    }
    const depth = topDepth(s);
    if (depth === 0) continue;
    for (let i = 0; i < depth; i++) overall[i] += 1;
    const bucket = getBucket(s.source);
    for (let i = 0; i < depth; i++) bucket.counts[i] += 1;
  }

  // ─── Completion step is order-derived (ground truth) ───────────────────
  // The purchase finishes on a different host with a brand-new analytics
  // session, so counting `checkout_completed` events would miss every
  // historical purchase (and mislabel new ones). Instead we count actual paid
  // orders for this release in the window, and attribute each to a source:
  //   1) the server-stitched completion bridge (precise — carries the original
  //      landing session id captured at checkout via Stripe metadata),
  //   2) else the buyer's own landing session (signed-in browsing),
  //   3) else "Direct / unknown" (honest fallback when we can't attribute it).
  const paidOrders = await db
    .select({ id: orders.id, customerId: orders.customerId })
    .from(orders)
    .where(and(
      eq(orders.albumId, albumId),
      inArray(orders.status, ["paid", "shipped", "complete", "completed"]),
      gte(orders.createdAt, ctx.from),
      lte(orders.createdAt, ctx.to),
    ));

  // Extend the internal set with buyer accounts so internal/test PURCHASES are
  // dropped from the completed step too (a staff member's own test buy).
  if (opts.excludeInternal && paidOrders.length > 0) {
    const buyerIds = Array.from(
      new Set(paidOrders.map((o) => o.customerId).filter((id): id is string => !!id)),
    ).filter((id) => !internalUserIds.has(id));
    if (buyerIds.length > 0) {
      const fanRows = await db
        .select({ id: customerUsers.id, email: customerUsers.email })
        .from(customerUsers)
        .where(inArray(customerUsers.id, buyerIds));
      for (const f of fanRows) if (isFullAccessEmail(f.email)) internalUserIds.add(f.id);
      const adminBuyerRows = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, buyerIds));
      for (const a of adminBuyerRows) internalUserIds.add(a.id);
    }
  }

  const DIRECT: SourceBucket = { key: "direct", label: "Direct / unknown" };
  const pickDeepestSession = (ids?: Set<string>): Sess | null => {
    if (!ids) return null;
    let best: Sess | null = null;
    let bestDepth = -1;
    for (const id of Array.from(ids)) {
      const s = sessions.get(id);
      if (!s) continue;
      const d = topDepth(s);
      if (d > bestDepth) { bestDepth = d; best = s; }
    }
    return best;
  };
  for (const o of paidOrders) {
    const bridged = orderToSession.get(o.id);
    const bridgedSess = bridged ? sessions.get(bridged) : undefined;
    const fallbackSess = !bridgedSess && o.customerId ? pickDeepestSession(userToSessions.get(o.customerId)) : null;
    const linked = bridgedSess ?? fallbackSess;
    // Drop internal/test purchases when excluding: a staff/full-access buyer,
    // or a purchase attributed to an internal (e.g. flagged-device) session.
    if (
      opts.excludeInternal &&
      ((o.customerId && internalUserIds.has(o.customerId)) || linked?.internal === true)
    ) {
      excludedInternal += 1;
      continue;
    }
    overall[3] += 1;
    getBucket(linked?.source ?? DIRECT).counts[3] += 1;
  }

  const steps = FUNNEL_STEPS.map((st, i) => ({
    key: st.key,
    label: st.label,
    sessions: overall[i],
    // Conversion from the previous step (step 0 has no prior → 1).
    stepConversion: i === 0 ? 1 : overall[i - 1] ? overall[i] / overall[i - 1] : 0,
  }));
  const overallConversion = overall[0] ? overall[3] / overall[0] : 0;

  const bySource =
    opts.groupBy === "source"
      ? Array.from(sourceAgg.entries())
          .map(([key, v]) => ({
            key,
            source: v.label,
            landed: v.counts[0],
            viewedOffer: v.counts[1],
            startedCheckout: v.counts[2],
            completed: v.counts[3],
            conversion: v.counts[0] ? v.counts[3] / v.counts[0] : 0,
          }))
          .sort((a, b) => b.landed - a.landed)
      : [];

  return {
    album: albumRow ? { id: albumRow.id, title: albumRow.title, artist: albumRow.artist } : { id: albumId, title: "Unknown release", artist: "" },
    steps,
    overallConversion,
    bySource,
    excludedInternal,
  };
}

// ─── PostHog embeds — surface configured iframe URLs ───────────────────
export function posthogEmbeds() {
  return {
    funnelUrl: process.env.POSTHOG_FUNNEL_EMBED_URL || null,
    retentionUrl: process.env.POSTHOG_RETENTION_EMBED_URL || null,
    host: process.env.POSTHOG_HOST || "https://us.posthog.com",
  };
}
