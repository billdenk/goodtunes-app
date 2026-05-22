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
  analyticsEvents,
  songs,
  payoutAccounts,
} from "@shared/schema";
import { and, eq, gte, lte, inArray, sql, desc, isNull, isNotNull, or, not } from "drizzle-orm";

export interface AdminReportContext {
  from: Date;
  to: Date;
}

function dateBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
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
      .where(and(eq(orders.status, "paid"), gte(orders.createdAt, from), lte(orders.createdAt, to)));
    let gmv = 0; let net = 0; const buyers = new Set<string>();
    for (const r of paid) {
      gmv += r.totalCents;
      net += r.platformFeeCents ?? r.totalCents;
      buyers.add(r.customerId);
    }
    const signups = await db.execute<{ c: string }>(sql`SELECT COUNT(*) AS c FROM customer_users WHERE created_at >= ${from} AND created_at <= ${to}`);
    const plays = await db.execute<{ plays: string; listeners: string }>(sql`SELECT COUNT(*) AS plays, COUNT(DISTINCT COALESCE(user_id, session_id)) AS listeners FROM analytics_events WHERE name = 'play_start' AND ts >= ${from} AND ts <= ${to}`);
    return {
      gmvCents: gmv,
      netCents: net,
      orderCount: paid.length,
      uniqueBuyers: buyers.size,
      avgOrderCents: paid.length ? Math.round(gmv / paid.length) : 0,
      newSignups: Number((signups as any).rows?.[0]?.c ?? 0),
      plays: Number((plays as any).rows?.[0]?.plays ?? 0),
      uniqueListeners: Number((plays as any).rows?.[0]?.listeners ?? 0),
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

  const series = Object.keys(dailyGmv).sort().map((d) => ({
    date: d,
    gmvCents: dailyGmv[d],
    orders: dailyOrders[d],
    signups: dailySignups[d],
  }));

  return {
    gmvCents,
    netCents,
    orderCount: paid.length,
    uniqueBuyers: buyerSet.size,
    avgOrderCents: paid.length ? Math.round(gmvCents / paid.length) : 0,
    newSignups: newCustomers.length,
    refundedCount: refundedRows.length,
    refundRate: paid.length ? refundedRows.length / paid.length : 0,
    dau,
    wau,
    mau,
    plays,
    uniqueListeners,
    visits,
    firstPurchases,
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

    const country = ((o.shippingAddress as any)?.country as string | undefined) || "Unknown";
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
  const rows = await db
    .select({ name: analyticsEvents.name, payload: analyticsEvents.payload, sessionId: analyticsEvents.sessionId })
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
    const sid = r.sessionId ?? "anon";
    if (p.songId) {
      const s = songPlays.get(p.songId) ?? { plays: 0, listeners: new Set() };
      s.plays += 1; s.listeners.add(sid); songPlays.set(p.songId, s);
    }
    if (p.albumId) {
      const s = albumPlays.get(p.albumId) ?? { plays: 0, listeners: new Set() };
      s.plays += 1; s.listeners.add(sid); albumPlays.set(p.albumId, s);
    }
    if (p.artistId) {
      const s = artistPlays.get(p.artistId) ?? { plays: 0, listeners: new Set() };
      s.plays += 1; s.listeners.add(sid); artistPlays.set(p.artistId, s);
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
  // Stuck OD fulfillments — sitting in submitted/in_fulfillment for >N days.
  const thresholdDays = 3;
  const thresholdMs = thresholdDays * 86400_000;
  const cutoff = new Date(Date.now() - thresholdMs);
  const stuckRows = await db
    .select({
      id: orders.id,
      albumId: orders.albumId,
      fulfillmentStatus: orders.fulfillmentStatus,
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
      inArray(orders.fulfillmentStatus, ["pending", "submitted", "in_fulfillment"]),
      eq(orders.status, "paid"),
      lte(orders.createdAt, cutoff),
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
      threshold: `${thresholdDays}d`,
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

// ─── PostHog embeds — surface configured iframe URLs ───────────────────
export function posthogEmbeds() {
  return {
    funnelUrl: process.env.POSTHOG_FUNNEL_EMBED_URL || null,
    retentionUrl: process.env.POSTHOG_RETENTION_EMBED_URL || null,
    host: process.env.POSTHOG_HOST || "https://us.posthog.com",
  };
}
