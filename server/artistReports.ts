// Task #75 — Artist reporting dashboard backend.
//
// Mounts the `/api/artist/*` read endpoints powering the dashboard at
// `/artist`. Every route is gated by `requireRole("artist","super_admin")`
// — artist accounts are admin users with role="artist" and roleScopeId =
// people.id (see server/auth/roles.ts + the ADMIN_ROLES comment near the
// bottom of shared/schema.ts). Super-admins can override the scoped
// person via `?personId=` so #53 can reuse these same endpoints later.
//
// Scoping rule (centralized in `resolveArtistScope`):
//   • An artist owns every album where they are `primaryArtistId` OR the
//     album's payoutOwnerKind/Id points at them.
//   • An artist is credited on every song in those albums, plus every
//     song they have a row in `track_performers` or `track_writers` for.
//
// Live-DB drift caveat: the orders table in the schema declares a
// number of payout / fulfillment / SKU-kind columns (added by #48 #49
// #73) that haven't yet landed in the live DB. This module ONLY
// references live-DB columns so the dashboard works today; "artist
// share" surfaces as gross today and will start splitting honestly the
// moment the payout columns ship. See .agents/memory/albums-schema-drift.md.
//
// Aggregation strategy (v1):
//   Direct on-demand queries against `analytics_events` and `orders`
//   with appropriate indexes (added in ensureArtistReportingIndexes).
//   The spec calls for a nightly rollup; with realistic seed sizes the
//   live path is well under a second, and a rollup table can be added
//   later as `artist_daily_rollups` without changing the wire shape.

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { pgArray } from "./lib/pgArray";
import { getUserRole } from "./auth/roles";
import { storage } from "./storage";
import { LOC_CITY, LOC_REGION, LOC_COUNTRY } from "./reports/buyers";

// ─── Date range helpers ─────────────────────────────────────────────────
type Range = { from: Date; to: Date };

function parseRange(req: Request): { range: Range; compare: Range | null } {
  const now = new Date();
  const def = new Date(now.getTime() - 30 * 86400_000);
  const from = req.query.from ? new Date(String(req.query.from)) : def;
  const to = req.query.to ? new Date(String(req.query.to)) : now;
  const lengthMs = to.getTime() - from.getTime();
  const compareFrom = req.query.compareFrom
    ? new Date(String(req.query.compareFrom))
    : new Date(from.getTime() - lengthMs);
  const compareTo = req.query.compareTo
    ? new Date(String(req.query.compareTo))
    : new Date(from.getTime());
  const wantCompare = req.query.compare !== "off";
  return {
    range: { from, to },
    compare: wantCompare ? { from: compareFrom, to: compareTo } : null,
  };
}

// ─── Scope resolution ──────────────────────────────────────────────────
export type ArtistScope = {
  personId: string;
  albumIds: string[];
  songIds: string[];
  ownedSongIds: string[];
};

async function resolveArtistScope(req: Request): Promise<ArtistScope | { error: string; status: number }> {
  const userId = req.session?.userId;
  if (!userId) return { error: "Unauthorized", status: 401 };
  const info = await getUserRole(userId);
  if (!info) return { error: "Unauthorized", status: 401 };
  let personId: string | null = null;
  if (info.role === "super_admin") {
    personId = (req.query.personId as string) || null;
    if (!personId) return { error: "Super-admin must pass ?personId=", status: 400 };
  } else if (info.role === "artist") {
    personId = info.roleScopeId;
    if (!personId) return { error: "Artist account has no person scope", status: 403 };
  } else if (info.role === "label") {
    // Task #76 — label users can drill from the rollup dashboard into a
    // specific artist on their roster (label → artist → album → song).
    // They must pass ?personId=, and the personId must either be tagged
    // with this label OR be the primary artist on an album released by
    // this label. Anything else gets 403 so a label can't read a
    // competitor's numbers by guessing person ids.
    if (!info.roleScopeId) return { error: "Label account has no label scope", status: 403 };
    personId = (req.query.personId as string) || null;
    if (!personId) return { error: "Label must pass ?personId= to drill into a roster artist", status: 400 };
    const okRow = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM people WHERE id = ${personId} AND label_id = ${info.roleScopeId}
        UNION
        SELECT 1 FROM albums WHERE primary_artist_id = ${personId} AND label_id = ${info.roleScopeId}
      ) AS ok
    `);
    const ok = ((okRow as any).rows?.[0]?.ok) === true;
    if (!ok) return { error: "Artist is not on this label", status: 403 };
  } else if (info.role === "manager") {
    // Task #1425 — manager users can drill from the rollup dashboard into a
    // specific artist on their roster (manager → artist → album → song).
    // They must pass ?personId=, and the personId must be tagged with this
    // manager (people.manager_id). There is NO albums.manager_id, so roster
    // membership is the sole gate — anything else gets 403 so a manager can't
    // read another act's numbers by guessing person ids.
    if (!info.roleScopeId) return { error: "Manager account has no manager scope", status: 403 };
    personId = (req.query.personId as string) || null;
    if (!personId) return { error: "Manager must pass ?personId= to drill into a roster artist", status: 400 };
    const okRow = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM people WHERE id = ${personId} AND manager_id = ${info.roleScopeId}
      ) AS ok
    `);
    const ok = ((okRow as any).rows?.[0]?.ok) === true;
    if (!ok) return { error: "Artist is not on this manager's roster", status: 403 };
  } else {
    return { error: "Insufficient role", status: 403 };
  }

  return computeArtistDatasetScope(personId, info.role, info.roleScopeId);
}

// Dataset narrowing for an already-resolved (role, personId). Split out from
// resolveArtistScope so the cross-tenant scoping rules can be unit-tested
// directly (see server/artistReports.scope.db.test.ts) without standing up a
// session + membership row. The role-resolution / roster-membership gate
// stays in resolveArtistScope; this function trusts that the caller is
// allowed to see `personId` and only decides WHICH albums/songs that implies.
export async function computeArtistDatasetScope(
  personId: string,
  role: string,
  roleScopeId: string | null,
): Promise<ArtistScope> {
  // Tenant isolation for label drill-through: when the caller is a label
  // user, narrow album scope to albums released on THIS label. Without
  // this clause an artist with a cross-label catalog (signed to label A
  // for one record, label B for another) would leak label B's revenue
  // and orders to a label A operator. The roster-membership check above
  // gates entry; this clause gates the data set.
  const isLabelCaller = role === "label";
  const labelClause = isLabelCaller
    ? sql`AND label_id = ${roleScopeId}`
    : sql``;
  // Roster-partner callers (label OR manager) must never see a roster
  // artist's guest credits on OTHER artists' albums — that would leak
  // off-roster catalog/play metrics. There is no albums.manager_id, so a
  // manager can't get a labelClause-style album narrowing; instead we drop
  // the credited-song union for them too (see below). Self-view artists and
  // super-admins keep the full credited union.
  const isRosterPartnerCaller = role === "label" || role === "manager";
  // Canonical artist album scope (shared with the buyer-roster page
  // GET /api/admin/people/:id/buyers — see server/routes.ts). An artist
  // owns an album when they are its primaryArtistId OR its payout owner,
  // and the album has NOT been soft-deleted. The `deleted_at IS NULL`
  // clause is the one that previously diverged: the dashboard counted
  // deleted-but-sold albums while the roster filtered them out, so a
  // soft-deleted release with sales made the dashboard headline drift
  // above the roster. Keep these two queries in lock-step.
  const albumRows = await db.execute<{ id: string }>(sql`
    SELECT id FROM albums
    WHERE (primary_artist_id = ${personId}
           OR (payout_owner_kind = 'person' AND payout_owner_id = ${personId}))
      AND deleted_at IS NULL
    ${labelClause}
  `);
  const albumIds = ((albumRows as any).rows || []).map((r: any) => r.id);

  const ownedSongRows = albumIds.length
    ? await db.execute<{ id: string }>(sql`
        SELECT id FROM songs WHERE album_id = ANY(${pgArray(albumIds)}) AND deleted_at IS NULL
      `)
    : ({ rows: [] } as any);
  const ownedSongIds = ((ownedSongRows as any).rows || []).map((r: any) => r.id);

  // Credits union pulls in performer/writer guest appearances on other
  // artists' albums. For roster-partner callers (label OR manager) we drop
  // the union so the song scope can never include a song from an album the
  // partner doesn't own / isn't on their roster.
  let credited: string[] = [];
  if (!isRosterPartnerCaller) {
    const creditRows = await db.execute<{ song_id: string }>(sql`
      SELECT DISTINCT song_id FROM track_performers WHERE person_id = ${personId}
      UNION
      SELECT DISTINCT song_id FROM track_writers WHERE person_id = ${personId}
    `);
    credited = ((creditRows as any).rows || []).map((r: any) => r.song_id);
  }

  const songIds = Array.from(new Set([...ownedSongIds, ...credited]));
  return { personId, albumIds, songIds, ownedSongIds };
}

// ─── SQL fragments ────────────────────────────────────────────────────
// Orders scope: album-id only. The `payout_owner_kind/id` columns from
// the orders schema haven't shipped to the live DB yet (#48 forward-
// declared them); when they land, the scope widens to honor per-order
// payout-owner overrides without changing this filter's call sites.
//
// Revenue statuses: 'paid','shipped','complete','completed' all represent
// a successful transaction. 'refunded' is included so the CASE WHEN
// deduction in KPI queries works correctly. The former filter omitted
// 'complete'/'completed' causing all gogoods-origin orders to be silently
// excluded from Nick's and other artists' totals.
function ordersFilter(scope: ArtistScope) {
  return sql`
    o.status IN ('paid','shipped','complete','completed','refunded')
    AND o.album_id = ANY(${pgArray(scope.albumIds)})
  `;
}

function playsFilter(scope: ArtistScope) {
  return sql`
    e.name IN ('play_start','play_complete')
    AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
  `;
}

// ─── KPIs ─────────────────────────────────────────────────────────────
async function computeKpis(scope: ArtistScope, r: Range) {
  if (scope.albumIds.length === 0 && scope.songIds.length === 0) {
    return emptyKpis();
  }
  const revRow = scope.albumIds.length ? await db.execute<{
    gross: string; units: string; orders: string; buyers: string; refunded: string;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS gross,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN COALESCE(cc.cnt, 1) ELSE 0 END), 0)::text AS units,
      COUNT(*) FILTER (WHERE o.status <> 'refunded')::text AS orders,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'refunded')::text AS buyers,
      COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS refunded
    FROM orders o
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS cnt FROM order_copies GROUP BY order_id
    ) cc ON cc.order_id = o.id
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
  `) : ({ rows: [{ gross: "0", units: "0", orders: "0", buyers: "0", refunded: "0" }] } as any);
  const rev = (revRow as any).rows?.[0] ?? { gross: "0", units: "0", orders: "0", buyers: "0", refunded: "0" };

  const playRow = scope.songIds.length ? await db.execute<{
    starts: string; completes: string; listeners: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE e.name = 'play_start')::text AS starts,
      COUNT(*) FILTER (WHERE e.name = 'play_complete')::text AS completes,
      COUNT(DISTINCT COALESCE(e.user_id, e.session_id))
        FILTER (WHERE e.name = 'play_start')::text AS listeners
    FROM analytics_events e
    WHERE ${playsFilter(scope)}
      AND e.ts >= ${r.from} AND e.ts < ${r.to}
  `) : ({ rows: [{ starts: "0", completes: "0", listeners: "0" }] } as any);
  const p = (playRow as any).rows?.[0] ?? { starts: "0", completes: "0", listeners: "0" };

  const topTrack = scope.songIds.length ? await db.execute<{
    song_id: string; title: string; plays: string;
  }>(sql`
    SELECT s.id AS song_id, s.title, COUNT(*)::text AS plays
    FROM analytics_events e
    JOIN songs s ON s.id = e.payload->>'songId'
    WHERE e.name = 'play_start'
      AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
      AND e.ts >= ${r.from} AND e.ts < ${r.to}
    GROUP BY s.id, s.title
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `) : ({ rows: [] } as any);

  const topAlbum = scope.albumIds.length ? await db.execute<{
    album_id: string; title: string; revenue: string;
  }>(sql`
    SELECT o.album_id, a.title,
      SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END)::text AS revenue
    FROM orders o
    JOIN albums a ON a.id = o.album_id
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
    GROUP BY o.album_id, a.title
    ORDER BY SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END) DESC NULLS LAST
    LIMIT 1
  `) : ({ rows: [] } as any);

  const starts = Number(p.starts);
  const completes = Number(p.completes);
  // Artist share == gross today (no payout split in live DB yet — see
  // module header). UI labels it "Artist share" and renders matching
  // value so the column is wired the moment payout_amount_cents ships.
  const gross = Number(rev.gross);
  return {
    grossCents: gross,
    artistShareCents: gross,
    refundedCents: Number(rev.refunded),
    units: Number(rev.units),
    orders: Number(rev.orders),
    buyers: Number(rev.buyers),
    plays: starts,
    completions: completes,
    completionRate: starts > 0 ? completes / starts : 0,
    listeners: Number(p.listeners),
    topTrack: ((topTrack as any).rows?.[0]) ?? null,
    topAlbum: ((topAlbum as any).rows?.[0]) ?? null,
  };
}

function emptyKpis() {
  return {
    grossCents: 0, artistShareCents: 0, refundedCents: 0,
    units: 0, orders: 0, buyers: 0, plays: 0, completions: 0, completionRate: 0,
    listeners: 0, topTrack: null, topAlbum: null,
  };
}

// ─── Lifetime (all-time) totals ────────────────────────────────────────
// Task #1334 — the windowed KPIs above are scoped to the selected date
// range (default Last 30 days), so an artist never sees a single "since
// launch" headline on the dashboard itself; the all-time figures only
// surfaced once they drilled into the buyer roster
// (`/admin/people/:id/buyers`, which is unbounded). This returns the same
// metrics with NO date bound so the Overview tab can show a lifetime
// banner alongside the range window.
//
// Reconciliation: the buyer-roster page (server/reports/buyers.ts) lists
// non-refunded orders and, per order, the physical copies it fanned out
// into via `order_copies` (falling back to a single copy when an order
// has no copy rows — `copies.length || 1`). We mirror that exactly:
//   • `orders` = COUNT of non-refunded orders (matches the roster's row count)
//   • `units`  = SUM of per-order COALESCE(copy_count, 1) (matches the
//     roster's summed per-order `quantity`)
// so the lifetime orders / units / fans / gross reconcile with that page.
export type LifetimeTotals = {
  grossCents: number;
  units: number;
  orders: number;
  buyers: number;
  refundedCents: number;
  plays: number;
  listeners: number;
};

async function computeLifetime(scope: ArtistScope): Promise<LifetimeTotals> {
  const empty: LifetimeTotals = {
    grossCents: 0, units: 0, orders: 0, buyers: 0,
    refundedCents: 0, plays: 0, listeners: 0,
  };
  if (scope.albumIds.length === 0 && scope.songIds.length === 0) return empty;

  const revRow = scope.albumIds.length ? await db.execute<{
    gross: string; units: string; orders: string; buyers: string; refunded: string;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS gross,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN COALESCE(cc.cnt, 1) ELSE 0 END), 0)::text AS units,
      COUNT(*) FILTER (WHERE o.status <> 'refunded')::text AS orders,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'refunded')::text AS buyers,
      COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS refunded
    FROM orders o
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS cnt FROM order_copies GROUP BY order_id
    ) cc ON cc.order_id = o.id
    WHERE ${ordersFilter(scope)}
  `) : ({ rows: [{ gross: "0", units: "0", orders: "0", buyers: "0", refunded: "0" }] } as any);
  const rev = (revRow as any).rows?.[0] ?? { gross: "0", units: "0", orders: "0", buyers: "0", refunded: "0" };

  const playRow = scope.songIds.length ? await db.execute<{
    starts: string; listeners: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE e.name = 'play_start')::text AS starts,
      COUNT(DISTINCT COALESCE(e.user_id, e.session_id))
        FILTER (WHERE e.name = 'play_start')::text AS listeners
    FROM analytics_events e
    WHERE ${playsFilter(scope)}
  `) : ({ rows: [{ starts: "0", listeners: "0" }] } as any);
  const p = (playRow as any).rows?.[0] ?? { starts: "0", listeners: "0" };

  return {
    grossCents: Number(rev.gross),
    units: Number(rev.units),
    orders: Number(rev.orders),
    buyers: Number(rev.buyers),
    refundedCents: Number(rev.refunded),
    plays: Number(p.starts),
    listeners: Number(p.listeners),
  };
}

// ─── Endpoints ─────────────────────────────────────────────────────────
async function meHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const person = await storage.getPersonById(scope.personId);
  if (!person) return res.status(404).json({ message: "Person not found" });

  // Task #205 — surface the inviting press on the artist dashboard so a
  // partner landing here knows who brought them on. Softens to
  // "Originally invited by …" once they've shipped their first run.
  let invitedPress: { id: string; name: string; logoUrl: string | null } | null = null;
  let hasShippedFirst = false;
  const pressId = (person as any).invitedByPressId ?? null;
  if (pressId) {
    const press = await storage.getManufacturerById(String(pressId));
    if (press) {
      invitedPress = { id: press.id, name: press.name, logoUrl: (press as any).logoUrl ?? null };
      try {
        const r: any = await db.execute(sql`
          SELECT 1 FROM orders o
          JOIN albums a ON a.id = o.album_id
          WHERE a.primary_artist_id = ${scope.personId}
            AND o.fulfillment_status = 'shipped'
          LIMIT 1
        `);
        hasShippedFirst = ((r as any).rows ?? []).length > 0;
      } catch {}
    }
  }

  return res.json({
    personId: scope.personId,
    name: person.name,
    slug: (person as any).slug ?? null,
    photoUrl: (person as any).photoUrl ?? null,
    albumCount: scope.albumIds.length,
    songCount: scope.songIds.length,
    invitedPress,
    hasShippedFirst,
  });
}

async function summaryHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range, compare } = parseRange(req);
  const [kpis, previous, lifetime, topFansRows, npoCents] = await Promise.all([
    computeKpis(scope, range),
    compare ? computeKpis(scope, compare) : Promise.resolve(null),
    computeLifetime(scope),
    scope.albumIds.length
      ? db.execute<{ email: string; total_cents: string }>(sql`
          SELECT cu.email,
                 SUM(o.total_cents)::text AS total_cents
          FROM orders o
          JOIN customer_users cu ON cu.id = o.customer_id
          WHERE o.album_id = ANY(${pgArray(scope.albumIds)}::text[])
            AND o.status IN ('paid','shipped','complete','completed')
            AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
          GROUP BY cu.id, cu.email
          ORDER BY SUM(o.total_cents) DESC
          LIMIT 3
        `)
      : Promise.resolve({ rows: [] } as any),
    scope.albumIds.length
      ? db.execute<{ total: string }>(sql`
          SELECT COALESCE(SUM(rc.amount_cents), 0)::text AS total
          FROM referral_credits rc
          JOIN orders o ON o.id = rc.order_id
          WHERE rc.kind = 'npo'
            AND o.album_id = ANY(${pgArray(scope.albumIds)}::text[])
            AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
        `)
      : Promise.resolve({ rows: [{ total: "0" }] } as any),
  ]);
  const topFans = ((topFansRows as any).rows ?? []).map((r: any) => ({
    email: String(r.email).replace(/(?<=.{2}).+(?=@)/, "***"),
    totalCents: Number(r.total_cents),
  }));
  const npoPayout = Number(((npoCents as any).rows?.[0]?.total) ?? 0);
  return res.json({ range, compare, current: kpis, previous, lifetime, topFans, npoPayout });
}

async function timeseriesHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);

  // Single revenue series today (no sku_kind in live orders table yet —
  // UI bucket-labels it "All formats"; once #73 columns ship, swap to
  // the per-skuKind GROUP BY without changing the wire shape).
  const revDaily = scope.albumIds.length
    ? await db.execute<{ day: string; revenue: string }>(sql`
        SELECT
          date_trunc('day', o.created_at)::date::text AS day,
          SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END)::text AS revenue
        FROM orders o
        WHERE ${ordersFilter(scope)}
          AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
        GROUP BY 1
        ORDER BY 1 ASC
      `)
    : ({ rows: [] } as any);

  const playsDaily = scope.songIds.length
    ? await db.execute<{ day: string; starts: string; completes: string; listeners: string }>(sql`
        SELECT
          date_trunc('day', e.ts)::date::text AS day,
          COUNT(*) FILTER (WHERE e.name = 'play_start')::text AS starts,
          COUNT(*) FILTER (WHERE e.name = 'play_complete')::text AS completes,
          COUNT(DISTINCT COALESCE(e.user_id, e.session_id))
            FILTER (WHERE e.name = 'play_start')::text AS listeners
        FROM analytics_events e
        WHERE ${playsFilter(scope)}
          AND e.ts >= ${range.from} AND e.ts < ${range.to}
        GROUP BY 1
        ORDER BY 1 ASC
      `)
    : ({ rows: [] } as any);

  return res.json({
    range,
    revenue: ((revDaily as any).rows || []).map((r: any) => ({
      day: r.day, skuKind: "all", revenueCents: Number(r.revenue),
    })),
    plays: ((playsDaily as any).rows || []).map((r: any) => ({
      day: r.day,
      starts: Number(r.starts),
      completes: Number(r.completes),
      listeners: Number(r.listeners),
    })),
  });
}

async function geoHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);

  const buyersByCountry = scope.albumIds.length ? await db.execute<{ country: string | null; buyers: string; revenue: string }>(sql`
    SELECT
      ${LOC_COUNTRY} AS country,
      COUNT(DISTINCT o.customer_id)::text AS buyers,
      SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END)::text AS revenue
    FROM orders o
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    GROUP BY 1
    ORDER BY 2 DESC NULLS LAST
  `) : ({ rows: [] } as any);

  const listenersByCountry = scope.songIds.length ? await db.execute<{
    country: string | null; listeners: string; plays: string;
  }>(sql`
    SELECT
      e.payload->>'_country' AS country,
      COUNT(DISTINCT COALESCE(e.user_id, e.session_id))::text AS listeners,
      COUNT(*)::text AS plays
    FROM analytics_events e
    WHERE e.name = 'play_start'
      AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
      AND e.ts >= ${range.from} AND e.ts < ${range.to}
    GROUP BY 1
    ORDER BY 2 DESC NULLS LAST
  `) : ({ rows: [] } as any);

  const { salesGeography } = await import("./reports/buyers");
  const sales = scope.albumIds.length
    ? await salesGeography(ordersFilter(scope), range.from, range.to)
    : null;

  return res.json({
    range,
    buyers: ((buyersByCountry as any).rows || []).map((r: any) => ({
      country: r.country ?? "Unknown",
      buyers: Number(r.buyers),
      revenueCents: Number(r.revenue),
    })),
    listeners: ((listenersByCountry as any).rows || []).map((r: any) => ({
      country: r.country ?? "Unknown",
      listeners: Number(r.listeners),
      plays: Number(r.plays),
    })),
    sales,
  });
}

async function topTracksHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  if (!scope.songIds.length) {
    if (req.query.format === "csv") return sendCsv(res, "top-tracks.csv", []);
    return res.json({ range, tracks: [] });
  }

  const rows = await db.execute<{
    song_id: string; title: string; album_id: string; album_title: string;
    plays: string; completes: string; favorites: string; playlist_adds: string; shares: string;
  }>(sql`
    SELECT
      s.id AS song_id, s.title, s.album_id, a.title AS album_title,
      COUNT(*) FILTER (WHERE e.name = 'play_start')::text AS plays,
      COUNT(*) FILTER (WHERE e.name = 'play_complete')::text AS completes,
      COUNT(*) FILTER (WHERE e.name = 'favorite_song')::text AS favorites,
      COUNT(*) FILTER (WHERE e.name = 'song_added_to_playlist')::text AS playlist_adds,
      COUNT(*) FILTER (WHERE e.name = 'share_completed')::text AS shares
    FROM analytics_events e
    JOIN songs s ON s.id = e.payload->>'songId'
    LEFT JOIN albums a ON a.id = s.album_id
    WHERE e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
      AND e.name IN ('play_start','play_complete','favorite_song','song_added_to_playlist','share_completed')
      AND e.ts >= ${range.from} AND e.ts < ${range.to}
    GROUP BY s.id, s.title, s.album_id, a.title
    ORDER BY COUNT(*) FILTER (WHERE e.name = 'play_start') DESC
    LIMIT ${limit}
  `);

  const tracks = ((rows as any).rows || []).map((r: any) => ({
    songId: r.song_id, title: r.title, albumId: r.album_id, albumTitle: r.album_title,
    plays: Number(r.plays), completes: Number(r.completes),
    favorites: Number(r.favorites), playlistAdds: Number(r.playlist_adds),
    shares: Number(r.shares),
  }));

  if (req.query.format === "csv") return sendCsv(res, "top-tracks.csv", tracks);
  return res.json({ range, tracks });
}

async function topAlbumsHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  if (!scope.albumIds.length) {
    if (req.query.format === "csv") return sendCsv(res, "top-albums.csv", []);
    return res.json({ range, albums: [] });
  }

  const rev = await db.execute<{
    album_id: string; title: string; artist: string; artwork: string | null;
    revenue: string; units: string; buyers: string;
  }>(sql`
    SELECT a.id AS album_id, a.title, a.artist, a.artwork,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS revenue,
      COUNT(o.id) FILTER (WHERE o.status <> 'refunded')::text AS units,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'refunded')::text AS buyers
    FROM albums a
    LEFT JOIN orders o ON o.album_id = a.id
      AND o.status IN ('paid','shipped','complete','completed','refunded')
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    WHERE a.id = ANY(${pgArray(scope.albumIds)})
    GROUP BY a.id, a.title, a.artist, a.artwork
  `);

  const plays = scope.songIds.length ? await db.execute<{
    album_id: string; plays: string; listeners: string;
  }>(sql`
    SELECT s.album_id, COUNT(*)::text AS plays,
      COUNT(DISTINCT COALESCE(e.user_id, e.session_id))::text AS listeners
    FROM analytics_events e
    JOIN songs s ON s.id = e.payload->>'songId'
    WHERE e.name = 'play_start'
      AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
      AND s.album_id = ANY(${pgArray(scope.albumIds)})
      AND e.ts >= ${range.from} AND e.ts < ${range.to}
    GROUP BY 1
  `) : ({ rows: [] } as any);
  const playMap = new Map<string, { plays: number; listeners: number }>();
  for (const r of ((plays as any).rows || [])) {
    playMap.set(r.album_id, { plays: Number(r.plays), listeners: Number(r.listeners) });
  }

  const albums = ((rev as any).rows || []).map((r: any) => {
    const revenueCents = Number(r.revenue || 0);
    return {
      albumId: r.album_id,
      title: r.title,
      artist: r.artist,
      artwork: r.artwork,
      revenueCents,
      artistShareCents: revenueCents,
      units: Number(r.units || 0),
      buyers: Number(r.buyers || 0),
      plays: playMap.get(r.album_id)?.plays ?? 0,
      listeners: playMap.get(r.album_id)?.listeners ?? 0,
    };
  }).sort((a: any, b: any) => b.revenueCents - a.revenueCents).slice(0, limit);

  if (req.query.format === "csv") return sendCsv(res, "top-albums.csv", albums);
  return res.json({ range, albums });
}

async function ordersHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  if (!scope.albumIds.length) {
    if (req.query.format === "csv") return sendCsv(res, "orders.csv", []);
    return res.json({ range, orders: [] });
  }

  // sku_kind / origin / fulfillment_status / payout_amount_cents are
  // schema columns from #48 #49 #73 that haven't landed in the live DB
  // yet. We only SELECT live columns so the query stays valid; the
  // UI shows the missing ones as "—" until they ship.
  const rows = await db.execute<any>(sql`
    SELECT o.id, o.created_at, o.status, o.total_cents,
      ${LOC_COUNTRY} AS country,
      o.album_id, a.title AS album_title, a.artist AS album_artist
    FROM orders o
    JOIN albums a ON a.id = o.album_id
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `);

  const orders = ((rows as any).rows || []).map((r: any) => ({
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    totalCents: Number(r.total_cents),
    artistShareCents: Number(r.total_cents),
    skuKind: null,
    origin: "direct",
    fulfillmentStatus: null,
    country: r.country,
    albumId: r.album_id,
    albumTitle: r.album_title,
    albumArtist: r.album_artist,
  }));

  if (req.query.format === "csv") return sendCsv(res, "orders.csv", orders);
  return res.json({ range, orders });
}

// Task #938 — scoped buyer roster + map. Reuses resolveArtistScope so
// an artist only ever sees buyers of their own releases (label callers
// are narrowed to this-label albums by the same resolver).
async function buyersHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  if (!scope.albumIds.length) return res.json({ range, buyers: [] });
  const { buyerRoster } = await import("./reports/buyers");
  const filter = sql`o.album_id = ANY(${pgArray(scope.albumIds)})`;
  const buyers = await buyerRoster(filter, range.from, range.to);
  return res.json({ range, buyers });
}

async function buyerMapHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  if (!scope.albumIds.length) return res.json({ range, points: [], totalCities: 0, geocoded: 0 });
  const { buyerMap } = await import("./reports/buyers");
  const filter = sql`o.album_id = ANY(${pgArray(scope.albumIds)})`;
  const map = await buyerMap(filter, range.from, range.to);
  return res.json({ range, ...map });
}

async function audienceHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  if (!scope.songIds.length) {
    return res.json({ range, newListeners: 0, returningListeners: 0, repeatCohort: [], topFans: [] });
  }

  const cohort = await db.execute<{ first_seen: string; listener: string; plays: string }>(sql`
    WITH listener_plays AS (
      SELECT COALESCE(e.user_id, e.session_id) AS listener,
             MIN(e.ts) AS first_ever,
             COUNT(*) FILTER (WHERE e.ts >= ${range.from} AND e.ts < ${range.to}) AS plays_in_window
      FROM analytics_events e
      WHERE e.name = 'play_start'
        AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
        AND COALESCE(e.user_id, e.session_id) IS NOT NULL
      GROUP BY 1
    )
    SELECT first_ever::text AS first_seen, listener, plays_in_window::text AS plays
    FROM listener_plays
    WHERE plays_in_window > 0
  `);

  const rows = (cohort as any).rows || [];
  let newCount = 0, retCount = 0;
  const playsByListener: number[] = [];
  for (const r of rows) {
    const firstSeen = new Date(r.first_seen);
    if (firstSeen >= range.from) newCount++; else retCount++;
    playsByListener.push(Number(r.plays));
  }

  const buckets = { "1": 0, "2-5": 0, "6-20": 0, "21+": 0 };
  for (const n of playsByListener) {
    if (n === 1) buckets["1"]++;
    else if (n <= 5) buckets["2-5"]++;
    else if (n <= 20) buckets["6-20"]++;
    else buckets["21+"]++;
  }
  const repeatCohort = Object.entries(buckets).map(([range, listeners]) => ({ range, listeners }));

  const topFans = rows
    .slice()
    .sort((a: any, b: any) => Number(b.plays) - Number(a.plays))
    .slice(0, 10)
    .map((r: any) => ({
      handle: `Fan ${String(r.listener).slice(0, 6)}`,
      plays: Number(r.plays),
    }));

  return res.json({
    range,
    newListeners: newCount,
    returningListeners: retCount,
    repeatCohort,
    topFans,
  });
}

// ─── Single-album dashboard (Task #1525) ───────────────────────────────
// Powers the per-album "Dashboard" tab on /admin/albums/:id. Reuses the
// exact same compute path as the catalog /artist dashboard by building an
// ArtistScope whose albumIds is a single element — there is NO forked SQL
// here, so the per-album numbers can never drift from the artist rollup.
//
// Access: visible to the album's artist AND label (and manager) partners
// for their OWN album, plus operators for any album. This is deliberately
// wider than the operator-only Customers/Physical tabs. The album-scoped
// ownership check below mirrors `computeArtistDatasetScope`'s ownership
// rule (primaryArtistId OR payout owner; label_id for labels; people.
// manager_id for managers) so a partner can never read another act's
// numbers by guessing an album id.
const ALBUM_REVENUE_STATUSES = sql.raw(`'paid','shipped','complete','completed'`);

type AlbumScopeResult =
  | { scope: ArtistScope; albumTitle: string }
  | { error: string; status: number };

async function resolveAlbumScope(req: Request, albumId: string): Promise<AlbumScopeResult> {
  const userId = req.session?.userId;
  if (!userId) return { error: "Unauthorized", status: 401 };
  const info = await getUserRole(userId);
  if (!info) return { error: "Unauthorized", status: 401 };

  const albRow = await db.execute<{
    id: string;
    primary_artist_id: string | null;
    payout_owner_kind: string | null;
    payout_owner_id: string | null;
    label_id: string | null;
    title: string;
  }>(sql`
    SELECT id, primary_artist_id, payout_owner_kind, payout_owner_id, label_id, title
    FROM albums WHERE id = ${albumId} AND deleted_at IS NULL LIMIT 1
  `);
  const album = (albRow as any).rows?.[0];
  if (!album) return { error: "Album not found", status: 404 };

  let allowed = false;
  if (info.role === "super_admin" || info.role === "admin") {
    allowed = true; // operators see any album
  } else if (info.role === "artist") {
    allowed =
      !!info.roleScopeId &&
      (album.primary_artist_id === info.roleScopeId ||
        (album.payout_owner_kind === "person" && album.payout_owner_id === info.roleScopeId));
  } else if (info.role === "label") {
    allowed = !!info.roleScopeId && album.label_id === info.roleScopeId;
  } else if (info.role === "manager") {
    if (info.roleScopeId && album.primary_artist_id) {
      const r = await db.execute<{ ok: boolean }>(sql`
        SELECT EXISTS(
          SELECT 1 FROM people WHERE id = ${album.primary_artist_id} AND manager_id = ${info.roleScopeId}
        ) AS ok
      `);
      allowed = ((r as any).rows?.[0]?.ok) === true;
    }
  }
  if (!allowed) return { error: "You don't have access to this album", status: 403 };

  const songRows = await db.execute<{ id: string }>(sql`
    SELECT id FROM songs WHERE album_id = ${albumId} AND deleted_at IS NULL
  `);
  const songIds = ((songRows as any).rows || []).map((r: any) => r.id);
  return {
    scope: { personId: album.primary_artist_id ?? "", albumIds: [albumId], songIds, ownedSongIds: songIds },
    albumTitle: album.title,
  };
}

async function albumDashboardHandler(req: Request, res: Response) {
  const resolved = await resolveAlbumScope(req, String(req.params.id));
  if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
  const { scope } = resolved;
  const albumId = scope.albumIds[0];

  // (1) Headline totals — reuse the artist rollup's lifetime compute so the
  // album's units (multi-quantity correct via order_copies), revenue,
  // orders, buyers, plays and listeners match the catalog dashboard exactly.
  const lifetime = await computeLifetime(scope);

  // (2) Add-ons sold — receipt-aligned (order_items kind addon|custom_addon),
  // grouped by sku with the snapshot label, multi-quantity correct via
  // SUM(quantity). `revenueCents` sums the per-line totals already stored.
  const addonRows = await db.execute<{ sku: string; label: string; count: string; revenue: string }>(sql`
    SELECT oi.sku, MIN(oi.label) AS label,
           COALESCE(SUM(oi.quantity), 0)::text AS count,
           COALESCE(SUM(oi.unit_price_cents), 0)::text AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.album_id = ${albumId}
      AND o.status IN (${ALBUM_REVENUE_STATUSES})
      AND oi.kind IN ('addon', 'custom_addon')
    GROUP BY oi.sku
    ORDER BY SUM(oi.quantity) DESC, MIN(oi.label) ASC
  `);
  const addons = ((addonRows as any).rows || []).map((r: any) => ({
    sku: r.sku,
    label: r.label,
    count: Number(r.count),
    revenueCents: Number(r.revenue),
  }));

  // (3) New vs. returning BUYERS (purchase-based, distinct from the play-
  // based audience cohort). For each customer who bought THIS album, was
  // this their first-ever GoodTunes purchase (new) or did they already buy
  // something earlier (returning)?
  const nvrRow = await db.execute<{ new_buyers: string; returning_buyers: string }>(sql`
    WITH album_buyers AS (
      SELECT o.customer_id, MIN(o.created_at) AS first_album_purchase
      FROM orders o
      WHERE o.album_id = ${albumId}
        AND o.status IN (${ALBUM_REVENUE_STATUSES})
        AND o.customer_id IS NOT NULL
      GROUP BY o.customer_id
    ),
    first_ever AS (
      SELECT o.customer_id, MIN(o.created_at) AS first_ever_purchase
      FROM orders o
      WHERE o.customer_id IN (SELECT customer_id FROM album_buyers)
        AND o.status IN (${ALBUM_REVENUE_STATUSES})
      GROUP BY o.customer_id
    )
    SELECT
      COUNT(*) FILTER (WHERE fe.first_ever_purchase >= ab.first_album_purchase)::text AS new_buyers,
      COUNT(*) FILTER (WHERE fe.first_ever_purchase <  ab.first_album_purchase)::text AS returning_buyers
    FROM album_buyers ab
    JOIN first_ever fe ON fe.customer_id = ab.customer_id
  `);
  const nvr = (nvrRow as any).rows?.[0] ?? { new_buyers: "0", returning_buyers: "0" };

  // (4) Most popular songs — every track on the album ranked by plays, with
  // completions + favorites alongside. LEFT JOIN keeps 0-play tracks in the
  // ranking so the list reads as a complete tracklist leaderboard.
  const songRows = scope.songIds.length
    ? await db.execute<{ song_id: string; title: string; plays: string; completes: string; favorites: string }>(sql`
        SELECT s.id AS song_id, s.title,
          COUNT(*) FILTER (WHERE e.name = 'play_start')::text AS plays,
          COUNT(*) FILTER (WHERE e.name = 'play_complete')::text AS completes,
          COUNT(*) FILTER (WHERE e.name = 'favorite_song')::text AS favorites
        FROM songs s
        LEFT JOIN analytics_events e
          ON e.payload->>'songId' = s.id
          AND e.name IN ('play_start', 'play_complete', 'favorite_song')
        WHERE s.id = ANY(${pgArray(scope.songIds)})
        GROUP BY s.id, s.title
        ORDER BY COUNT(*) FILTER (WHERE e.name = 'play_start') DESC, s.title ASC
      `)
    : ({ rows: [] } as any);
  const topSongs = ((songRows as any).rows || []).map((r: any) => ({
    songId: r.song_id,
    title: r.title,
    plays: Number(r.plays),
    completes: Number(r.completes),
    favorites: Number(r.favorites),
  }));

  // (5) Fan locations — reuse the partner buyer-map (city-level geocode) with
  // a single-album scope filter so the viz matches the artist dashboard.
  const { buyerMap } = await import("./reports/buyers");
  const geo = await buyerMap(sql`o.album_id = ${albumId}`, new Date(0), new Date(Date.now() + 86400_000));

  return res.json({
    lifetime,
    addons,
    newVsReturning: { newBuyers: Number(nvr.new_buyers), returningBuyers: Number(nvr.returning_buyers) },
    topSongs,
    geo,
  });
}

// Drill-down for a single add-on: who bought it. PII guardrail mirrors the
// buyer roster — only public display name (or trimmed legal-name fallback)
// and city/region/country leave here; email/phone/street never do.
async function albumAddonBuyersHandler(req: Request, res: Response) {
  const resolved = await resolveAlbumScope(req, String(req.params.id));
  if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
  const albumId = resolved.scope.albumIds[0];
  const skuRaw = String(req.query.sku ?? "").trim();
  if (!skuRaw) return res.status(400).json({ message: "sku is required" });

  const rows = await db.execute<any>(sql`
    SELECT o.id AS order_id, o.created_at, oi.quantity,
      ${LOC_CITY} AS city,
      ${LOC_REGION} AS region,
      ${LOC_COUNTRY} AS country,
      cu.display_name, o.buyer_name
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN customer_users cu ON cu.id = o.customer_id
    WHERE o.album_id = ${albumId}
      AND o.status IN (${ALBUM_REVENUE_STATUSES})
      AND oi.kind IN ('addon', 'custom_addon')
      AND oi.sku = ${skuRaw}
    ORDER BY o.created_at DESC
    LIMIT 500
  `);
  const { trimBuyerName } = await import("./reports/buyers");
  const buyers = ((rows as any).rows || []).map((r: any) => ({
    orderId: r.order_id,
    name: r.display_name?.trim() ? r.display_name.trim() : trimBuyerName(r.buyer_name),
    quantity: Number(r.quantity) || 1,
    date: r.created_at,
    city: r.city ?? null,
    region: r.region ?? null,
    country: r.country ?? null,
  }));
  return res.json({ buyers });
}

// Task #1528 — Download an album's Dashboard data as CSV. One endpoint keyed
// on ?dataset= so all three on-screen tables (add-on buyers, top songs, city
// breakdown) share the same resolveAlbumScope auth + sendCsv writer and can
// never drift from what the dashboard renders. PII guardrail is identical to
// the on-screen drill-down: only the public display name (or trimmed legal-
// name fallback) and city/region/country leave here — email/phone/street
// never do.
async function albumExportHandler(req: Request, res: Response) {
  const resolved = await resolveAlbumScope(req, String(req.params.id));
  if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });
  const { scope, albumTitle } = resolved;
  const albumId = scope.albumIds[0];
  const dataset = String(req.query.dataset ?? "").trim();

  // Filename-safe slug of the album title so the download is self-describing.
  const slug = (albumTitle || "album").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "album";

  if (dataset === "addon-buyers") {
    // Every add-on buyer on the album, flattened one row per order-line, so a
    // label can pull the whole add-on roster in a single download (the on-
    // screen view drills one add-on at a time). Mirrors albumAddonBuyersHandler.
    const rows = await db.execute<any>(sql`
      SELECT o.id AS order_id, o.created_at, oi.quantity, oi.sku, oi.label AS addon,
        ${LOC_CITY} AS city,
        ${LOC_REGION} AS region,
        ${LOC_COUNTRY} AS country,
        cu.display_name, o.buyer_name
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customer_users cu ON cu.id = o.customer_id
      WHERE o.album_id = ${albumId}
        AND o.status IN (${ALBUM_REVENUE_STATUSES})
        AND oi.kind IN ('addon', 'custom_addon')
      ORDER BY oi.label ASC, o.created_at DESC
      LIMIT 5000
    `);
    const { trimBuyerName } = await import("./reports/buyers");
    const out = ((rows as any).rows || []).map((r: any) => ({
      addon: r.addon ?? "",
      buyer: r.display_name?.trim() ? r.display_name.trim() : trimBuyerName(r.buyer_name),
      quantity: Number(r.quantity) || 1,
      date: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
      city: r.city ?? "",
      region: r.region ?? "",
      country: r.country ?? "",
    }));
    return sendCsv(res, `${slug}-addon-buyers.csv`, out);
  }

  if (dataset === "top-songs") {
    // Same compute as the dashboard's "Most popular songs" table.
    const songRows = scope.songIds.length
      ? await db.execute<{ song_id: string; title: string; plays: string; completes: string; favorites: string }>(sql`
          SELECT s.id AS song_id, s.title,
            COUNT(*) FILTER (WHERE e.name = 'play_start')::text AS plays,
            COUNT(*) FILTER (WHERE e.name = 'play_complete')::text AS completes,
            COUNT(*) FILTER (WHERE e.name = 'favorite_song')::text AS favorites
          FROM songs s
          LEFT JOIN analytics_events e
            ON e.payload->>'songId' = s.id
            AND e.name IN ('play_start', 'play_complete', 'favorite_song')
          WHERE s.id = ANY(${pgArray(scope.songIds)})
          GROUP BY s.id, s.title
          ORDER BY COUNT(*) FILTER (WHERE e.name = 'play_start') DESC, s.title ASC
        `)
      : ({ rows: [] } as any);
    const out = ((songRows as any).rows || []).map((r: any, i: number) => ({
      rank: i + 1,
      title: r.title ?? "",
      plays: Number(r.plays),
      completes: Number(r.completes),
      favorites: Number(r.favorites),
    }));
    return sendCsv(res, `${slug}-top-songs.csv`, out);
  }

  if (dataset === "cities") {
    // Same compute as the dashboard's "Where fans live" table (city-level,
    // from shipping addresses). Ordered by orders DESC to match the on-screen
    // list. Coordinates are dropped — the CSV is for spreadsheets, not maps.
    const { buyerMap } = await import("./reports/buyers");
    const geo = await buyerMap(sql`o.album_id = ${albumId}`, new Date(0), new Date(Date.now() + 86400_000));
    const out = (geo.points || [])
      .slice()
      .sort((a: any, b: any) => b.orders - a.orders)
      .map((p: any) => ({
        city: p.city ?? "",
        region: p.region ?? "",
        country: p.country ?? "",
        orders: p.orders,
        fans: p.fans,
      }));
    return sendCsv(res, `${slug}-cities.csv`, out);
  }

  return res.status(400).json({ message: "Unknown dataset. Use dataset=addon-buyers|top-songs|cities" });
}

// ─── CSV ───────────────────────────────────────────────────────────────
function sendCsv(res: Response, filename: string, rows: any[]): Response {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (rows.length === 0) return res.send("");
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  return res.send(body);
}

// ─── Runtime migration: indexes for the on-demand reporting path ──────
// Per-index try/catch so a single failure (e.g. a column that lives on
// the schema but not yet in the live DB) doesn't break the rest. The
// payout_owner index is intentionally guarded behind a column-exists
// probe — see `albums-schema-drift.md` in `.agents/memory/`.
export async function ensureArtistReportingIndexes(): Promise<void> {
  const stmts: { name: string; q: ReturnType<typeof sql> }[] = [
    { name: "analytics_events(name,ts)", q: sql`CREATE INDEX IF NOT EXISTS idx_analytics_events_name_ts ON analytics_events (name, ts)` },
    { name: "analytics_events(songId)", q: sql`CREATE INDEX IF NOT EXISTS idx_analytics_events_song ON analytics_events ((payload->>'songId'))` },
    { name: "analytics_events(albumId)", q: sql`CREATE INDEX IF NOT EXISTS idx_analytics_events_album ON analytics_events ((payload->>'albumId'))` },
    { name: "orders(album,status,created)", q: sql`CREATE INDEX IF NOT EXISTS idx_orders_album_status_created ON orders (album_id, status, created_at)` },
    { name: "track_performers(person)", q: sql`CREATE INDEX IF NOT EXISTS idx_track_performers_person ON track_performers (person_id)` },
    { name: "track_writers(person)", q: sql`CREATE INDEX IF NOT EXISTS idx_track_writers_person ON track_writers (person_id)` },
  ];
  for (const { name, q } of stmts) {
    try {
      await db.execute(q);
    } catch (e: any) {
      console.error(`[migrations] artist-reporting index ${name} failed:`, e?.message || e);
    }
  }
}

// ─── Registration ─────────────────────────────────────────────────────
export async function registerArtistReportRoutes(app: Express): Promise<void> {
  const { requireRole } = await import("./auth/roles");
  // requireRole already 401s without a session and 403s non-admin
  // users (it checks isAdmin via storage.getUser) before evaluating
  // the role, so no separate requireAdmin is needed.
  // Task #76 / #1425 — label and manager users may drill into a roster
  // artist via ?personId=. resolveArtistScope above verifies the personId
  // is on their roster before returning anything, so role-level inclusion
  // is safe.
  const gate = requireRole("artist", "label", "manager", "super_admin");

  app.get("/api/artist/me", gate, meHandler);
  app.get("/api/artist/summary", gate, summaryHandler);
  app.get("/api/artist/timeseries", gate, timeseriesHandler);
  app.get("/api/artist/geo", gate, geoHandler);
  app.get("/api/artist/top-tracks", gate, topTracksHandler);
  app.get("/api/artist/top-albums", gate, topAlbumsHandler);
  app.get("/api/artist/orders", gate, ordersHandler);
  app.get("/api/artist/buyers", gate, buyersHandler);
  app.get("/api/artist/buyer-map", gate, buyerMapHandler);
  app.get("/api/artist/audience", gate, audienceHandler);

  // Task #1525 — per-album dashboard tab. Wider role gate than the artist
  // rollup (operators with role "admin" land here too); the per-album
  // ownership check in resolveAlbumScope does the real authorization.
  const albumGate = requireRole("artist", "label", "manager", "super_admin", "admin");
  app.get("/api/admin/albums/:id/dashboard", albumGate, albumDashboardHandler);
  app.get("/api/admin/albums/:id/dashboard/addon-buyers", albumGate, albumAddonBuyersHandler);
  // Task #1528 — CSV downloads for the dashboard tables (addon-buyers|top-songs|cities).
  app.get("/api/admin/albums/:id/dashboard/export", albumGate, albumExportHandler);
}
