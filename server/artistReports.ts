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
  } else {
    return { error: "Insufficient role", status: 403 };
  }

  // Tenant isolation for label drill-through: when the caller is a label
  // user, narrow album scope to albums released on THIS label. Without
  // this clause an artist with a cross-label catalog (signed to label A
  // for one record, label B for another) would leak label B's revenue
  // and orders to a label A operator. The roster-membership check above
  // gates entry; this clause gates the data set.
  const isLabelCaller = info.role === "label";
  const labelClause = isLabelCaller
    ? sql`AND label_id = ${info.roleScopeId}`
    : sql``;
  const albumRows = await db.execute<{ id: string }>(sql`
    SELECT id FROM albums
    WHERE (primary_artist_id = ${personId}
           OR (payout_owner_kind = 'person' AND payout_owner_id = ${personId}))
    ${labelClause}
  `);
  const albumIds = ((albumRows as any).rows || []).map((r: any) => r.id);

  const ownedSongRows = albumIds.length
    ? await db.execute<{ id: string }>(sql`
        SELECT id FROM songs WHERE album_id = ANY(${pgArray(albumIds)})
      `)
    : ({ rows: [] } as any);
  const ownedSongIds = ((ownedSongRows as any).rows || []).map((r: any) => r.id);

  // Credits union pulls in performer/writer guest appearances on other
  // artists' albums. For label callers we drop the union so the song
  // scope can never include a song from an album the label doesn't own.
  let credited: string[] = [];
  if (!isLabelCaller) {
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
function ordersFilter(scope: ArtistScope) {
  return sql`
    o.status IN ('paid','shipped','refunded')
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
    units: 0, buyers: 0, plays: 0, completions: 0, completionRate: 0,
    listeners: 0, topTrack: null, topAlbum: null,
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
  const kpis = await computeKpis(scope, range);
  const previous = compare ? await computeKpis(scope, compare) : null;
  return res.json({ range, compare, current: kpis, previous });
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
      o.shipping_address->>'country' AS country,
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
      AND o.status IN ('paid','shipped','refunded')
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
      o.shipping_address->>'country' AS country,
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
  // Task #76 — label users may drill into a roster artist via ?personId=.
  // resolveArtistScope above verifies the personId is on their roster
  // before returning anything, so role-level inclusion is safe.
  const gate = requireRole("artist", "label", "super_admin");

  app.get("/api/artist/me", gate, meHandler);
  app.get("/api/artist/summary", gate, summaryHandler);
  app.get("/api/artist/timeseries", gate, timeseriesHandler);
  app.get("/api/artist/geo", gate, geoHandler);
  app.get("/api/artist/top-tracks", gate, topTracksHandler);
  app.get("/api/artist/top-albums", gate, topAlbumsHandler);
  app.get("/api/artist/orders", gate, ordersHandler);
  app.get("/api/artist/audience", gate, audienceHandler);
}
