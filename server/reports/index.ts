import { db } from "../db";
import {
  albums,
  people,
  organizations,
  orders,
  orderItems,
  customerUsers,
  shopifyRedemptionCodes,
  analyticsEvents,
} from "@shared/schema";
import { and, eq, ne, gte, lte, inArray, sql, desc, isNotNull, or } from "drizzle-orm";
import type { PartnerScope } from "../auth/roles";
import { effectiveScopeFilter, effectiveOrgId, isOrgScope } from "../auth/roles";

/**
 * Task #80 — Partner reporting v1.
 *
 * One module, one shape: every report takes a `ReportContext` and
 * returns plain JSON-safe data. The scope filter is resolved into a
 * concrete `albumId IN (…)` set up-front so every aggregate runs the
 * same way regardless of whether the caller is super_admin, a label,
 * an artist, an NPO referrer, or a person referrer.
 *
 * Date ranges are inclusive on both ends; the client passes ISO strings.
 * All dollar values are integer cents until the CSV/UI step.
 */

export interface ReportContext {
  scope: PartnerScope;
  from: Date;
  to: Date;
  // Optional album drill-down — when present, narrow every aggregate to
  // just this album. Still honours the scope filter so a label can't
  // drill into someone else's album by passing its id.
  albumId?: string | null;
}

interface ScopeResolution {
  /** Album ids the caller is allowed to see. `null` = no filter (super_admin god mode). */
  albumIds: string[] | null;
  /** Cohort of artist People ids that earn the caller money (referral reports only). */
  referredArtistIds: string[];
  /** Per-unit cents the caller earns (referral reports). 0 when N/A. */
  perUnitCents: number;
  /** Human-readable label of who the caller is, for the report header. */
  label: string;
}

async function resolveScope(ctx: ReportContext): Promise<ScopeResolution> {
  // Non-profit scope (real role or super_admin impersonation) doesn't
  // own albums — treat as an empty cohort so album-scoped tabs show
  // empty data rather than a god-view. Referrals tab resolves its own
  // cohort via `resolveOrgScope` below.
  if (isOrgScope(ctx.scope)) {
    const orgId = effectiveOrgId(ctx.scope);
    let orgName: string | null = null;
    if (orgId) {
      const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
      orgName = org?.name ?? null;
    }
    return { albumIds: [], referredArtistIds: [], perUnitCents: 0, label: orgName ? `Non-profit · ${orgName}` : "Non-profit" };
  }
  const eff = effectiveScopeFilter(ctx.scope);
  // super_admin with no impersonation → see everything.
  if (!eff) {
    return { albumIds: null, referredArtistIds: [], perUnitCents: 0, label: "All partners" };
  }
  if (eff.kind === "label") {
    const rows = await db
      .select({ id: albums.id })
      .from(albums)
      .where(eq(albums.labelId, eff.id));
    const lbl = await db
      .select({ name: sql<string>`${sql.identifier("name")}` })
      .from(sql`labels`)
      .where(sql`id = ${eff.id}`)
      .then((r) => (r[0] as any)?.name as string | undefined);
    return {
      albumIds: rows.map((r) => r.id),
      referredArtistIds: [],
      perUnitCents: 0,
      label: lbl ? `Label · ${lbl}` : "Label",
    };
  }
  if (eff.kind === "manager") {
    // Task #1425 — a manager has NO album column. The album cohort is
    // derived: every album whose primary artist is on the manager's
    // roster (people.managerId = manager id). Mirrors the same derivation
    // used by resolveManagerScope in server/managerReports.ts.
    const roster = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.managerId, eff.id));
    const rosterIds = roster.map((r) => r.id);
    const rows = rosterIds.length
      ? await db
          .select({ id: albums.id })
          .from(albums)
          .where(inArray(albums.primaryArtistId, rosterIds))
      : [];
    const mgr = await db
      .select({ name: sql<string>`${sql.identifier("name")}` })
      .from(sql`managers`)
      .where(sql`id = ${eff.id}`)
      .then((r) => (r[0] as any)?.name as string | undefined);
    return {
      albumIds: rows.map((r) => r.id),
      referredArtistIds: [],
      perUnitCents: 0,
      label: mgr ? `Manager · ${mgr}` : "Manager",
    };
  }
  if (eff.kind === "manufacturer") {
    // Task #2075 — a press (manufacturer) has NO album column. Album ⇄
    // press ownership is authoritative off pressing_order_requests: an
    // album belongs to a press iff a non-cancelled pressing-order-request
    // row carries package_snapshot.pressId = this press (the same source
    // assertAlbumBelongsToPress + the press-portal credit rollups use).
    // We DELIBERATELY do not authorize off people/labels.default_press_id
    // — that's the customer's next-album default, not the press the
    // in-flight album was actually assigned to.
    const r = await db.execute<any>(sql`
      SELECT DISTINCT por.album_id AS album_id
      FROM pressing_order_requests por
      JOIN albums a ON a.id = por.album_id AND a.deleted_at IS NULL
      WHERE por.status <> 'cancelled'
        AND por.package_snapshot ->> 'pressId' = ${eff.id}
        AND por.album_id IS NOT NULL
    `);
    const albumIds = ((r as any).rows ?? []).map((row: any) => row.album_id as string);
    const press = await db
      .select({ name: sql<string>`${sql.identifier("name")}` })
      .from(sql`manufacturers`)
      .where(sql`id = ${eff.id}`)
      .then((rows) => (rows[0] as any)?.name as string | undefined);
    return {
      albumIds,
      referredArtistIds: [],
      perUnitCents: 0,
      label: press ? `Press · ${press}` : "Press",
    };
  }
  // kind === "artist" — narrow to albums where this person is primary
  // artist. Also resolve referral cohort (artists THIS person referred)
  // so the same scope drives both their own report and their referrals.
  const ownAlbums = await db
    .select({ id: albums.id })
    .from(albums)
    .where(eq(albums.primaryArtistId, eff.id));
  const referred = await db
    .select({ id: people.id, perUnit: people.referrerPerUnitCents })
    .from(people)
    .where(eq(people.referredByPersonId, eff.id));
  const [self] = await db.select({ name: people.name, perUnit: people.referrerPerUnitCents }).from(people).where(eq(people.id, eff.id));
  return {
    albumIds: ownAlbums.map((r) => r.id),
    referredArtistIds: referred.map((r) => r.id),
    perUnitCents: referred[0]?.perUnit ?? 100,
    label: self?.name ? `Artist · ${self.name}` : "Artist",
  };
}

async function resolveOrgScope(ctx: ReportContext): Promise<{ orgId: string | null; referredArtistIds: string[]; perUnitCents: number; orgName: string | null }> {
  // Honors both a real non-profit role and a super_admin viewing as
  // a non-profit (Task #524).
  const orgId = effectiveOrgId(ctx.scope);
  if (!orgId) {
    return { orgId: null, referredArtistIds: [], perUnitCents: 0, orgName: null };
  }
  const referred = await db
    .select({ id: people.id, perUnit: people.referrerPerUnitCents })
    .from(people)
    .where(eq(people.referredByOrgId, orgId));
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  // Use the highest single per-unit so the report header can show a
  // consistent rate; individual rows still compute their own.
  const perUnit = referred[0]?.perUnit ?? 100;
  return { orgId, referredArtistIds: referred.map((r) => r.id), perUnitCents: perUnit, orgName: org?.name ?? null };
}

function dateBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptySeries(from: Date, to: Date): Record<string, number> {
  const out: Record<string, number> = {};
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    out[dateBucket(cur)] = 0;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function scopedAlbumFilter(albumIds: string[] | null, albumCol: any) {
  // null = super-admin wildcard; empty array = legitimate empty cohort.
  if (albumIds === null) return undefined;
  if (albumIds.length === 0) return sql`1=0`;
  return inArray(albumCol, albumIds);
}

async function getPaidOrders(ctx: ReportContext, albumIds: string[] | null) {
  const filters = [
    inArray(orders.status, ["paid", "shipped", "complete", "completed"]),
    // Task #2270 — exclude QA test-purchase orders from all partner reports.
    ne(orders.origin, "qa:test"),
    gte(orders.createdAt, ctx.from),
    lte(orders.createdAt, ctx.to),
  ];
  if (ctx.albumId) filters.push(eq(orders.albumId, ctx.albumId));
  const scopeF = scopedAlbumFilter(albumIds, orders.albumId);
  if (scopeF) filters.push(scopeF as any);
  return db.select().from(orders).where(and(...filters));
}

/** Sales over time + units sold + headline totals. */
export async function salesOverTime(ctx: ReportContext) {
  const s = await resolveScope(ctx);
  const rows = await getPaidOrders(ctx, s.albumIds);
  const dollars = emptySeries(ctx.from, ctx.to);
  const units = emptySeries(ctx.from, ctx.to);
  let totalCents = 0;
  let totalUnits = 0;
  for (const r of rows) {
    if (!r.createdAt) continue;
    const k = dateBucket(r.createdAt);
    if (!(k in dollars)) continue;
    dollars[k] += r.totalCents;
    units[k] += 1;
    totalCents += r.totalCents;
    totalUnits += 1;
  }
  const series = Object.keys(dollars).sort().map((d) => ({
    date: d,
    dollarsCents: dollars[d],
    units: units[d],
  }));
  return { series, totalCents, totalUnits, scopeLabel: s.label };
}

/** Plays + GoodSync engagement, day-by-day. */
export async function playsEngagement(ctx: ReportContext) {
  const s = await resolveScope(ctx);
  const filters: any[] = [
    gte(analyticsEvents.ts, ctx.from),
    lte(analyticsEvents.ts, ctx.to),
    inArray(analyticsEvents.name, ["play_start", "play_30s", "play_complete", "lyrics_open"]),
  ];
  const rows = await db.select().from(analyticsEvents).where(and(...filters));

  // Filter to scope by reading albumId out of the payload jsonb.
  const allowed = s.albumIds === null ? null : new Set(s.albumIds);
  const playStarts = emptySeries(ctx.from, ctx.to);
  const play30 = emptySeries(ctx.from, ctx.to);
  const playComplete = emptySeries(ctx.from, ctx.to);
  const lyricsOpens = emptySeries(ctx.from, ctx.to);
  let totalPlays = 0, total30 = 0, totalComplete = 0, totalLyrics = 0;
  for (const e of rows) {
    if (!e.ts) continue;
    const albumIdFromPayload = (e.payload as any)?.albumId as string | undefined;
    if (allowed && albumIdFromPayload && !allowed.has(albumIdFromPayload)) continue;
    if (allowed && !albumIdFromPayload) continue; // can't attribute → skip for scoped views
    if (ctx.albumId && albumIdFromPayload !== ctx.albumId) continue;
    const k = dateBucket(e.ts);
    if (!(k in playStarts)) continue;
    if (e.name === "play_start") { playStarts[k]++; totalPlays++; }
    else if (e.name === "play_30s") { play30[k]++; total30++; }
    else if (e.name === "play_complete") { playComplete[k]++; totalComplete++; }
    else if (e.name === "lyrics_open") { lyricsOpens[k]++; totalLyrics++; }
  }
  const series = Object.keys(playStarts).sort().map((d) => ({
    date: d,
    playStarts: playStarts[d],
    play30s: play30[d],
    playCompletes: playComplete[d],
    lyricsOpens: lyricsOpens[d],
  }));
  return {
    series,
    totals: {
      playStarts: totalPlays,
      play30s: total30,
      playCompletes: totalComplete,
      lyricsOpens: totalLyrics,
      completionRate: totalPlays ? totalComplete / totalPlays : 0,
      goodSyncRate: totalPlays ? totalLyrics / totalPlays : 0,
    },
    scopeLabel: s.label,
  };
}

/** Payouts received — sum of payoutAmountCents per day, status filter. */
export async function payoutsReceived(ctx: ReportContext) {
  const s = await resolveScope(ctx);
  const filters: any[] = [
    gte(orders.payoutAt, ctx.from),
    lte(orders.payoutAt, ctx.to),
    inArray(orders.payoutStatus, ["transferred"]),
  ];
  const sf = scopedAlbumFilter(s.albumIds, orders.albumId);
  if (sf) filters.push(sf as any);
  if (ctx.albumId) filters.push(eq(orders.albumId, ctx.albumId));
  const rows = await db.select().from(orders).where(and(...filters));
  const series = emptySeries(ctx.from, ctx.to);
  let totalCents = 0, totalCount = 0;
  for (const r of rows) {
    if (!r.payoutAt || r.payoutAmountCents == null) continue;
    const k = dateBucket(r.payoutAt);
    if (!(k in series)) continue;
    series[k] += r.payoutAmountCents;
    totalCents += r.payoutAmountCents;
    totalCount += 1;
  }
  return {
    series: Object.keys(series).sort().map((d) => ({ date: d, dollarsCents: series[d] })),
    totalCents,
    totalCount,
    scopeLabel: s.label,
  };
}

/** Shopify redemption rate — % of shopify-origin orders whose redeem code has been claimed. */
export async function shopifyRedemption(ctx: ReportContext) {
  const s = await resolveScope(ctx);
  const filters: any[] = [
    sql`${orders.origin} LIKE 'shopify:%'`,
    gte(orders.createdAt, ctx.from),
    lte(orders.createdAt, ctx.to),
  ];
  const sf = scopedAlbumFilter(s.albumIds, orders.albumId);
  if (sf) filters.push(sf as any);
  if (ctx.albumId) filters.push(eq(orders.albumId, ctx.albumId));
  const rows = await db
    .select({
      orderId: orders.id,
      createdAt: orders.createdAt,
      redeemedAt: shopifyRedemptionCodes.redeemedAt,
    })
    .from(orders)
    .leftJoin(shopifyRedemptionCodes, eq(shopifyRedemptionCodes.orderId, orders.id))
    .where(and(...filters));
  const orderedDays = emptySeries(ctx.from, ctx.to);
  const redeemedDays = emptySeries(ctx.from, ctx.to);
  let ordered = 0, redeemed = 0;
  for (const r of rows) {
    if (!r.createdAt) continue;
    const k = dateBucket(r.createdAt);
    if (k in orderedDays) orderedDays[k]++;
    ordered++;
    if (r.redeemedAt) {
      const rk = dateBucket(r.redeemedAt);
      if (rk in redeemedDays) redeemedDays[rk]++;
      redeemed++;
    }
  }
  const series = Object.keys(orderedDays).sort().map((d) => ({
    date: d,
    ordered: orderedDays[d],
    redeemed: redeemedDays[d],
  }));
  return {
    series,
    ordered,
    redeemed,
    rate: ordered ? redeemed / ordered : 0,
    scopeLabel: s.label,
  };
}

/** Top fans by spend — name + city only (no email/phone/address). */
export async function topFans(ctx: ReportContext, limit = 25) {
  const s = await resolveScope(ctx);
  const filters: any[] = [
    inArray(orders.status, ["paid", "shipped", "complete", "completed"]),
    gte(orders.createdAt, ctx.from),
    lte(orders.createdAt, ctx.to),
  ];
  const sf = scopedAlbumFilter(s.albumIds, orders.albumId);
  if (sf) filters.push(sf as any);
  if (ctx.albumId) filters.push(eq(orders.albumId, ctx.albumId));
  const rows = await db
    .select({
      customerId: orders.customerId,
      totalCents: orders.totalCents,
      shippingAddress: orders.shippingAddress,
      billingAddress: orders.billingAddress,
      buyerName: orders.buyerName,
    })
    .from(orders)
    .where(and(...filters));
  const agg = new Map<string, { customerId: string; spendCents: number; units: number; name: string; city: string | null; region: string | null; country: string | null }>();
  for (const r of rows) {
    // Prefer the shipping snapshot, fall back to billing — digital/donation
    // add-ons land an all-null shipping_address (see reports/buyers.ts).
    const ship: any = r.shippingAddress ?? {};
    const bill: any = r.billingAddress ?? {};
    const slot = agg.get(r.customerId) ?? {
      customerId: r.customerId,
      spendCents: 0,
      units: 0,
      name: r.buyerName ?? "Anonymous fan",
      city: ship.city || bill.city || null,
      region: ship.state || ship.region || bill.state || bill.region || null,
      country: ship.country || bill.country || null,
    };
    slot.spendCents += r.totalCents;
    slot.units += 1;
    agg.set(r.customerId, slot);
  }
  // Trim PII: first name + last initial only.
  const trim = (s?: string | null) => {
    if (!s) return "Anonymous fan";
    const parts = s.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
  };
  const out = [...agg.values()]
    .map((v) => ({
      name: trim(v.name),
      city: v.city,
      region: v.region,
      country: v.country,
      spendCents: v.spendCents,
      units: v.units,
    }))
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, limit);
  return { rows: out, scopeLabel: s.label };
}

/** Fan map raw data — city-level groupings with lat/lon (geocoded lazily). */
export async function fanMap(ctx: ReportContext) {
  const s = await resolveScope(ctx);
  const filters: any[] = [
    inArray(orders.status, ["paid", "shipped", "complete", "completed"]),
    gte(orders.createdAt, ctx.from),
    lte(orders.createdAt, ctx.to),
  ];
  const sf = scopedAlbumFilter(s.albumIds, orders.albumId);
  if (sf) filters.push(sf as any);
  if (ctx.albumId) filters.push(eq(orders.albumId, ctx.albumId));
  const rows = await db
    .select({ shippingAddress: orders.shippingAddress, billingAddress: orders.billingAddress, customerId: orders.customerId })
    .from(orders)
    .where(and(...filters));
  const groups = new Map<string, { city: string | null; region: string | null; country: string | null; orders: number; fans: Set<string> }>();
  for (const r of rows) {
    // Prefer shipping, fall back to billing — digital/donation add-ons land an
    // all-null shipping_address (see reports/buyers.ts).
    const ship: any = r.shippingAddress ?? {};
    const bill: any = r.billingAddress ?? {};
    const city = (ship.city || bill.city) as string | undefined ?? null;
    const region = (ship.state || ship.region || bill.state || bill.region) as string | undefined ?? null;
    const country = (ship.country || bill.country) as string | undefined ?? null;
    if (!city && !country) continue;
    const key = `${(city ?? "").toLowerCase()}|${(region ?? "").toLowerCase()}|${(country ?? "").toLowerCase()}`;
    const slot = groups.get(key) ?? { city, region, country, orders: 0, fans: new Set<string>() };
    slot.orders++;
    slot.fans.add(r.customerId);
    groups.set(key, slot);
  }
  // Resolve geocodes in parallel, but cap concurrency by awaiting each
  // sequentially after the first batch so we don't hammer Nominatim.
  const { geocode } = await import("./geo");
  const points: Array<{ city: string | null; region: string | null; country: string | null; lat: number; lon: number; orders: number; fans: number }> = [];
  const list = [...groups.values()];
  for (const g of list) {
    const pt = await geocode({ city: g.city, region: g.region, country: g.country });
    if (!pt) continue;
    points.push({
      city: g.city,
      region: g.region,
      country: g.country,
      lat: pt.lat,
      lon: pt.lon,
      orders: g.orders,
      fans: g.fans.size,
    });
  }
  return { points, totalCities: groups.size, geocoded: points.length, scopeLabel: s.label };
}

/** Referral earnings — for artist-referrer and NPO-referrer scopes. */
export async function referralEarnings(ctx: ReportContext) {
  let cohort: string[] = [];
  let perUnit = 100;
  let scopeLabel = "Referrals";

  if (isOrgScope(ctx.scope)) {
    const o = await resolveOrgScope(ctx);
    cohort = o.referredArtistIds;
    perUnit = o.perUnitCents;
    scopeLabel = o.orgName ? `NPO · ${o.orgName}` : "NPO";
  } else {
    const s = await resolveScope(ctx);
    cohort = s.referredArtistIds;
    perUnit = s.perUnitCents;
    scopeLabel = `${s.label} · Referrals`;
  }

  if (cohort.length === 0) {
    return { artists: [], totalUnits: 0, perUnitCents: perUnit, earningsCents: 0, scopeLabel };
  }

  // Pull albums for cohort artists.
  const albumRows = await db
    .select({ id: albums.id, primaryArtistId: albums.primaryArtistId, title: albums.title })
    .from(albums)
    .where(inArray(albums.primaryArtistId, cohort));
  const albumIds = albumRows.map((a) => a.id);
  if (albumIds.length === 0) {
    return { artists: [], totalUnits: 0, perUnitCents: perUnit, earningsCents: 0, scopeLabel };
  }

  const orderRows = await db
    .select({ albumId: orders.albumId })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, ctx.from),
        lte(orders.createdAt, ctx.to),
        inArray(orders.albumId, albumIds),
      ),
    );

  const peopleRows = await db
    .select({ id: people.id, name: people.name, perUnit: people.referrerPerUnitCents })
    .from(people)
    .where(inArray(people.id, cohort));
  const personById = new Map(peopleRows.map((p) => [p.id, p]));
  const albumById = new Map(albumRows.map((a) => [a.id, a]));

  const byArtist = new Map<string, { artistId: string; artistName: string; units: number; perUnitCents: number }>();
  let totalUnits = 0;
  for (const o of orderRows) {
    const alb = albumById.get(o.albumId);
    if (!alb?.primaryArtistId) continue;
    const slot = byArtist.get(alb.primaryArtistId) ?? {
      artistId: alb.primaryArtistId,
      artistName: personById.get(alb.primaryArtistId)?.name ?? "Unknown artist",
      units: 0,
      perUnitCents: personById.get(alb.primaryArtistId)?.perUnit ?? 100,
    };
    slot.units += 1;
    byArtist.set(alb.primaryArtistId, slot);
    totalUnits += 1;
  }
  const artists = [...byArtist.values()].map((a) => ({
    ...a,
    earningsCents: a.units * a.perUnitCents,
  })).sort((a, b) => b.units - a.units);
  const earningsCents = artists.reduce((s, a) => s + a.earningsCents, 0);
  return { artists, totalUnits, perUnitCents: perUnit, earningsCents, scopeLabel };
}
