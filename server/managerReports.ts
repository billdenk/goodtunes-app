// Task #1425 — Manager rollup reporting dashboard backend.
//
// Mounts the `/api/manager/*` read endpoints powering the dashboard at
// `/manager`. Every route is gated by `requireRole("manager","super_admin")`.
// Manager accounts are admin users with role="manager" and roleScopeId =
// managers.id (see server/auth/roles.ts + ADMIN_ROLES in shared/schema.ts).
// Super-admins can override the scoped manager via `?managerId=`.
//
// This mirrors server/labelReports.ts almost exactly. The one structural
// difference is scope derivation: a manager has NO `albums.managerId`.
// Instead the roster is the set of people carrying `people.managerId =
// managerId`, and the manager's catalog is every album whose primary artist
// is on that roster. Songs in scope = all songs on those albums.
//
// Live-DB drift caveat: mirrors `server/labelReports.ts` — we stick to
// columns that exist in both schema + live DB.

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { pgArray } from "./lib/pgArray";
import { getUserRole } from "./auth/roles";

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
export type ManagerScope = {
  managerId: string;
  albumIds: string[];
  songIds: string[];
  rosterPersonIds: string[];
};

export async function resolveManagerScope(req: Request): Promise<ManagerScope | { error: string; status: number }> {
  const userId = req.session?.userId;
  if (!userId) return { error: "Unauthorized", status: 401 };
  const info = await getUserRole(userId);
  if (!info) return { error: "Unauthorized", status: 401 };
  let managerId: string | null = null;
  if (info.role === "super_admin") {
    managerId = (req.query.managerId as string) || null;
    if (!managerId) return { error: "Super-admin must pass ?managerId=", status: 400 };
  } else if (info.role === "manager") {
    managerId = info.roleScopeId;
    if (!managerId) return { error: "Manager account has no manager scope", status: 403 };
  } else {
    return { error: "Insufficient role", status: 403 };
  }

  // Roster = people carrying this manager's id. A manager has NO album
  // column, so the catalog is derived: every non-deleted album whose
  // primary artist is on the roster.
  const peopleRows = await db.execute<{ id: string }>(sql`
    SELECT id FROM people WHERE manager_id = ${managerId} AND deleted_at IS NULL
  `);
  const rosterPersonIds = ((peopleRows as any).rows || []).map((r: any) => r.id) as string[];

  const albumRows = rosterPersonIds.length
    ? await db.execute<{ id: string; primary_artist_id: string | null }>(sql`
        SELECT id, primary_artist_id FROM albums
        WHERE primary_artist_id = ANY(${pgArray(rosterPersonIds)})
          AND deleted_at IS NULL
      `)
    : ({ rows: [] } as any);
  const albums = ((albumRows as any).rows || []) as Array<{ id: string; primary_artist_id: string | null }>;
  const albumIds = albums.map((r) => r.id);

  const songRows = albumIds.length
    ? await db.execute<{ id: string }>(sql`SELECT id FROM songs WHERE album_id = ANY(${pgArray(albumIds)}) AND deleted_at IS NULL`)
    : ({ rows: [] } as any);
  const songIds = ((songRows as any).rows || []).map((r: any) => r.id);

  return { managerId, albumIds, songIds, rosterPersonIds };
}

// ─── SQL fragments ────────────────────────────────────────────────────
function ordersFilter(scope: ManagerScope) {
  return sql`
    o.status IN ('paid','shipped','refunded')
    AND o.album_id = ANY(${pgArray(scope.albumIds)})
  `;
}
function playsFilter(scope: ManagerScope) {
  return sql`
    e.name IN ('play_start','play_complete')
    AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
  `;
}

// ─── KPIs ─────────────────────────────────────────────────────────────
async function computeKpis(scope: ManagerScope, r: Range) {
  if (scope.albumIds.length === 0 && scope.songIds.length === 0) return emptyKpis();
  const revRow = scope.albumIds.length ? await db.execute<{
    gross: string; units: string; buyers: string; refunded: string;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS gross,
      COUNT(*) FILTER (WHERE o.status <> 'refunded')::text AS units,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'refunded')::text AS buyers,
      COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS refunded
    FROM orders o
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
  `) : ({ rows: [{ gross: "0", units: "0", buyers: "0", refunded: "0" }] } as any);
  const rev = (revRow as any).rows?.[0] ?? { gross: "0", units: "0", buyers: "0", refunded: "0" };

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

  const newFansRow = scope.songIds.length ? await db.execute<{ new_fans: string }>(sql`
    WITH first_play AS (
      SELECT COALESCE(e.user_id, e.session_id) AS listener, MIN(e.ts) AS first_ts
      FROM analytics_events e
      WHERE e.name = 'play_start'
        AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
        AND COALESCE(e.user_id, e.session_id) IS NOT NULL
      GROUP BY 1
    )
    SELECT COUNT(*)::text AS new_fans FROM first_play
    WHERE first_ts >= ${r.from} AND first_ts < ${r.to}
  `) : ({ rows: [{ new_fans: "0" }] } as any);
  const newFans = Number((newFansRow as any).rows?.[0]?.new_fans ?? 0);

  const starts = Number(p.starts);
  const completes = Number(p.completes);
  const gross = Number(rev.gross);
  return {
    grossCents: gross,
    managerShareCents: gross, // same caveat as label/artist share — true split lands when payout_amount_cents ships
    refundedCents: Number(rev.refunded),
    units: Number(rev.units),
    buyers: Number(rev.buyers),
    plays: starts,
    completions: completes,
    completionRate: starts > 0 ? completes / starts : 0,
    listeners: Number(p.listeners),
    newFans,
    rosterSize: scope.rosterPersonIds.length,
    albumCount: scope.albumIds.length,
  };
}

function emptyKpis() {
  return {
    grossCents: 0, managerShareCents: 0, refundedCents: 0,
    units: 0, buyers: 0, plays: 0, completions: 0, completionRate: 0,
    listeners: 0, newFans: 0, rosterSize: 0, albumCount: 0,
  };
}

// ─── Endpoints ─────────────────────────────────────────────────────────
async function meHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const mgr = await db.execute<{ id: string; name: string; logo_url: string | null; cover_url: string | null; location: string | null }>(sql`
    SELECT id, name, logo_url, cover_url, location FROM managers WHERE id = ${scope.managerId} LIMIT 1
  `);
  const row = ((mgr as any).rows || [])[0];
  if (!row) return res.status(404).json({ message: "Manager not found" });

  return res.json({
    managerId: scope.managerId,
    name: row.name,
    logoUrl: row.logo_url,
    coverUrl: row.cover_url,
    location: row.location,
    albumCount: scope.albumIds.length,
    songCount: scope.songIds.length,
    rosterSize: scope.rosterPersonIds.length,
  });
}

async function summaryHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range, compare } = parseRange(req);
  const current = await computeKpis(scope, range);
  const previous = compare ? await computeKpis(scope, compare) : null;
  return res.json({ range, compare, current, previous });
}

async function timeseriesHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);

  const revDaily = scope.albumIds.length
    ? await db.execute<{ day: string; revenue: string }>(sql`
        SELECT date_trunc('day', o.created_at)::date::text AS day,
          SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END)::text AS revenue
        FROM orders o
        WHERE ${ordersFilter(scope)}
          AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
        GROUP BY 1 ORDER BY 1 ASC
      `)
    : ({ rows: [] } as any);

  const playsDaily = scope.songIds.length
    ? await db.execute<{ day: string; starts: string; completes: string; listeners: string }>(sql`
        SELECT date_trunc('day', e.ts)::date::text AS day,
          COUNT(*) FILTER (WHERE e.name = 'play_start')::text AS starts,
          COUNT(*) FILTER (WHERE e.name = 'play_complete')::text AS completes,
          COUNT(DISTINCT COALESCE(e.user_id, e.session_id))
            FILTER (WHERE e.name = 'play_start')::text AS listeners
        FROM analytics_events e
        WHERE ${playsFilter(scope)}
          AND e.ts >= ${range.from} AND e.ts < ${range.to}
        GROUP BY 1 ORDER BY 1 ASC
      `)
    : ({ rows: [] } as any);

  return res.json({
    range,
    revenue: ((revDaily as any).rows || []).map((r: any) => ({
      day: r.day, skuKind: "all", revenueCents: Number(r.revenue),
    })),
    plays: ((playsDaily as any).rows || []).map((r: any) => ({
      day: r.day, starts: Number(r.starts), completes: Number(r.completes), listeners: Number(r.listeners),
    })),
  });
}

// Per-artist daily revenue — stacked-bar payload. Joins orders → albums →
// primary artist. Albums with no primaryArtistId roll up under "Unattributed".
async function revenueByArtistHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  if (!scope.albumIds.length) return res.json({ range, artists: [], days: [], points: [] });

  const rows = await db.execute<{ day: string; person_id: string | null; person_name: string | null; revenue: string }>(sql`
    SELECT date_trunc('day', o.created_at)::date::text AS day,
      a.primary_artist_id AS person_id,
      p.name AS person_name,
      SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END)::text AS revenue
    FROM orders o
    JOIN albums a ON a.id = o.album_id
    LEFT JOIN people p ON p.id = a.primary_artist_id
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    GROUP BY 1, 2, 3
    ORDER BY 1 ASC
  `);

  const artistMap = new Map<string, string>();
  const days = new Set<string>();
  const buckets: Array<{ day: string; personId: string; revenueCents: number }> = [];
  for (const r of (((rows as any).rows || []) as any[])) {
    const id = r.person_id || "_unattributed";
    const name = r.person_name || "Unattributed";
    artistMap.set(id, name);
    days.add(r.day);
    buckets.push({ day: r.day, personId: id, revenueCents: Number(r.revenue || 0) });
  }

  return res.json({
    range,
    artists: Array.from(artistMap.entries()).map(([id, name]) => ({ personId: id, name })),
    days: Array.from(days).sort(),
    points: buckets,
  });
}

// Roster — one row per artist, headline of the dashboard.
async function rosterHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);

  if (!scope.rosterPersonIds.length) {
    if (req.query.format === "csv") return sendCsv(res, "roster.csv", []);
    return res.json({ range, artists: [] });
  }

  // Revenue + units per primary artist (via the manager's derived albums).
  const rev = scope.albumIds.length ? await db.execute<{
    person_id: string; revenue: string; units: string; buyers: string; album_count: string;
  }>(sql`
    SELECT a.primary_artist_id AS person_id,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS revenue,
      COUNT(o.id) FILTER (WHERE o.status <> 'refunded')::text AS units,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'refunded')::text AS buyers,
      COUNT(DISTINCT a.id)::text AS album_count
    FROM albums a
    LEFT JOIN orders o ON o.album_id = a.id
      AND o.status IN ('paid','shipped','refunded')
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    WHERE a.id = ANY(${pgArray(scope.albumIds)}) AND a.primary_artist_id IS NOT NULL
    GROUP BY a.primary_artist_id
  `) : ({ rows: [] } as any);

  // Plays + listeners per primary artist — join songs → albums → primary.
  const plays = scope.songIds.length ? await db.execute<{
    person_id: string; plays: string; listeners: string;
  }>(sql`
    SELECT a.primary_artist_id AS person_id,
      COUNT(*)::text AS plays,
      COUNT(DISTINCT COALESCE(e.user_id, e.session_id))::text AS listeners
    FROM analytics_events e
    JOIN songs s ON s.id = e.payload->>'songId'
    JOIN albums a ON a.id = s.album_id
    WHERE e.name = 'play_start'
      AND a.id = ANY(${pgArray(scope.albumIds)})
      AND a.primary_artist_id IS NOT NULL
      AND e.ts >= ${range.from} AND e.ts < ${range.to}
    GROUP BY 1
  `) : ({ rows: [] } as any);

  const playMap = new Map<string, { plays: number; listeners: number }>();
  for (const r of (((plays as any).rows || []) as any[])) {
    playMap.set(r.person_id, { plays: Number(r.plays), listeners: Number(r.listeners) });
  }
  const revMap = new Map<string, { revenue: number; units: number; buyers: number; albumCount: number }>();
  for (const r of (((rev as any).rows || []) as any[])) {
    revMap.set(r.person_id, {
      revenue: Number(r.revenue || 0), units: Number(r.units || 0),
      buyers: Number(r.buyers || 0), albumCount: Number(r.album_count || 0),
    });
  }

  const peopleRows = await db.execute<{ id: string; name: string; photo_url: string | null }>(sql`
    SELECT id, name, photo_url FROM people
    WHERE id = ANY(${pgArray(scope.rosterPersonIds)})
  `);
  const artists = (((peopleRows as any).rows || []) as any[]).map((p: any) => {
    const r = revMap.get(p.id);
    const pl = playMap.get(p.id);
    return {
      personId: p.id,
      name: p.name,
      photoUrl: p.photo_url,
      albumCount: r?.albumCount ?? 0,
      revenueCents: r?.revenue ?? 0,
      managerShareCents: r?.revenue ?? 0,
      units: r?.units ?? 0,
      buyers: r?.buyers ?? 0,
      plays: pl?.plays ?? 0,
      listeners: pl?.listeners ?? 0,
    };
  }).sort((a, b) => b.revenueCents - a.revenueCents || b.plays - a.plays);

  if (req.query.format === "csv") return sendCsv(res, "roster.csv", artists);
  return res.json({ range, artists });
}

async function geoHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);

  const buyersByCountry = scope.albumIds.length ? await db.execute<{ country: string | null; buyers: string; revenue: string }>(sql`
    SELECT o.shipping_address->>'country' AS country,
      COUNT(DISTINCT o.customer_id)::text AS buyers,
      SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END)::text AS revenue
    FROM orders o
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    GROUP BY 1 ORDER BY 2 DESC NULLS LAST
  `) : ({ rows: [] } as any);

  const listenersByCountry = scope.songIds.length ? await db.execute<{
    country: string | null; listeners: string; plays: string;
  }>(sql`
    SELECT e.payload->>'_country' AS country,
      COUNT(DISTINCT COALESCE(e.user_id, e.session_id))::text AS listeners,
      COUNT(*)::text AS plays
    FROM analytics_events e
    WHERE e.name = 'play_start'
      AND e.payload->>'songId' = ANY(${pgArray(scope.songIds)})
      AND e.ts >= ${range.from} AND e.ts < ${range.to}
    GROUP BY 1 ORDER BY 2 DESC NULLS LAST
  `) : ({ rows: [] } as any);

  const { salesGeography } = await import("./reports/buyers");
  const sales = scope.albumIds.length
    ? await salesGeography(ordersFilter(scope), range.from, range.to)
    : null;

  return res.json({
    range,
    buyers: (((buyersByCountry as any).rows || []) as any[]).map((r: any) => ({
      country: r.country ?? "Unknown", buyers: Number(r.buyers), revenueCents: Number(r.revenue),
    })),
    listeners: (((listenersByCountry as any).rows || []) as any[]).map((r: any) => ({
      country: r.country ?? "Unknown", listeners: Number(r.listeners), plays: Number(r.plays),
    })),
    sales,
  });
}

async function topAlbumsHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  if (!scope.albumIds.length) {
    if (req.query.format === "csv") return sendCsv(res, "top-albums.csv", []);
    return res.json({ range, albums: [] });
  }

  const rev = await db.execute<{
    album_id: string; title: string; artist: string; artwork: string | null;
    primary_artist_id: string | null;
    revenue: string; units: string; buyers: string;
  }>(sql`
    SELECT a.id AS album_id, a.title, a.artist, a.artwork, a.primary_artist_id,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text AS revenue,
      COUNT(o.id) FILTER (WHERE o.status <> 'refunded')::text AS units,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'refunded')::text AS buyers
    FROM albums a
    LEFT JOIN orders o ON o.album_id = a.id
      AND o.status IN ('paid','shipped','refunded')
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    WHERE a.id = ANY(${pgArray(scope.albumIds)})
    GROUP BY a.id, a.title, a.artist, a.artwork, a.primary_artist_id
  `);

  const plays = scope.songIds.length ? await db.execute<{ album_id: string; plays: string; listeners: string }>(sql`
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
  for (const r of (((plays as any).rows || []) as any[])) {
    playMap.set(r.album_id, { plays: Number(r.plays), listeners: Number(r.listeners) });
  }

  const albums = (((rev as any).rows || []) as any[]).map((r: any) => {
    const revenueCents = Number(r.revenue || 0);
    return {
      albumId: r.album_id,
      title: r.title,
      artist: r.artist,
      artwork: r.artwork,
      primaryArtistId: r.primary_artist_id,
      revenueCents,
      managerShareCents: revenueCents,
      units: Number(r.units || 0),
      buyers: Number(r.buyers || 0),
      plays: playMap.get(r.album_id)?.plays ?? 0,
      listeners: playMap.get(r.album_id)?.listeners ?? 0,
    };
  }).sort((a: any, b: any) => b.revenueCents - a.revenueCents).slice(0, limit);

  if (req.query.format === "csv") return sendCsv(res, "top-albums.csv", albums);
  return res.json({ range, albums });
}

async function topTracksHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  if (!scope.songIds.length) {
    if (req.query.format === "csv") return sendCsv(res, "top-tracks.csv", []);
    return res.json({ range, tracks: [] });
  }

  const rows = await db.execute<{
    song_id: string; title: string; album_id: string; album_title: string; album_artist: string;
    plays: string; completes: string; favorites: string; playlist_adds: string; shares: string;
  }>(sql`
    SELECT s.id AS song_id, s.title, s.album_id, a.title AS album_title, a.artist AS album_artist,
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
    GROUP BY s.id, s.title, s.album_id, a.title, a.artist
    ORDER BY COUNT(*) FILTER (WHERE e.name = 'play_start') DESC
    LIMIT ${limit}
  `);

  const tracks = (((rows as any).rows || []) as any[]).map((r: any) => ({
    songId: r.song_id, title: r.title, albumId: r.album_id, albumTitle: r.album_title, albumArtist: r.album_artist,
    plays: Number(r.plays), completes: Number(r.completes),
    favorites: Number(r.favorites), playlistAdds: Number(r.playlist_adds), shares: Number(r.shares),
  }));

  if (req.query.format === "csv") return sendCsv(res, "top-tracks.csv", tracks);
  return res.json({ range, tracks });
}

async function ordersHandler(req: Request, res: Response) {
  const scope = await resolveManagerScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const { range } = parseRange(req);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  if (!scope.albumIds.length) {
    if (req.query.format === "csv") return sendCsv(res, "orders.csv", []);
    return res.json({ range, orders: [] });
  }

  const rows = await db.execute<any>(sql`
    SELECT o.id, o.created_at, o.status, o.total_cents,
      o.shipping_address->>'country' AS country,
      o.album_id, a.title AS album_title, a.artist AS album_artist, a.primary_artist_id
    FROM orders o
    JOIN albums a ON a.id = o.album_id
    WHERE ${ordersFilter(scope)}
      AND o.created_at >= ${range.from} AND o.created_at < ${range.to}
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `);

  const orders = (((rows as any).rows || []) as any[]).map((r: any) => ({
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    totalCents: Number(r.total_cents),
    managerShareCents: Number(r.total_cents),
    country: r.country,
    albumId: r.album_id,
    albumTitle: r.album_title,
    albumArtist: r.album_artist,
    primaryArtistId: r.primary_artist_id,
  }));

  if (req.query.format === "csv") return sendCsv(res, "orders.csv", orders);
  return res.json({ range, orders });
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

// ─── Registration ─────────────────────────────────────────────────────
export async function registerManagerReportRoutes(app: Express): Promise<void> {
  const { requireRole } = await import("./auth/roles");
  const gate = requireRole("manager", "super_admin");

  app.get("/api/manager/me", gate, meHandler);
  app.get("/api/manager/summary", gate, summaryHandler);
  app.get("/api/manager/timeseries", gate, timeseriesHandler);
  app.get("/api/manager/revenue-by-artist", gate, revenueByArtistHandler);
  app.get("/api/manager/roster", gate, rosterHandler);
  app.get("/api/manager/geo", gate, geoHandler);
  app.get("/api/manager/top-albums", gate, topAlbumsHandler);
  app.get("/api/manager/top-tracks", gate, topTracksHandler);
  app.get("/api/manager/orders", gate, ordersHandler);
}
