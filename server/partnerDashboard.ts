// Task #518 — Scoped partner Dashboard backend.
//
// Single endpoint `GET /api/partner/:scope/dashboard?range=...` powering
// the leftmost "Dashboard" tab in every partner shell (Label, NPO,
// Vendor). Reuses the operator AdminDashboard layout shape via the
// shared `PartnerDashboard` primitive on the client — this module just
// computes the per-scope KPI / trend / activity payload.
//
// Scope resolution mirrors the existing per-shell endpoints:
//   - label   : caller.role === 'label'  → roleScopeId = labels.id
//   - npo     : caller.role === 'non_profit' → roleScopeId = organizations.id
//   - vendor  : caller.role IN ('vendor','manufacturer','fulfillment')
//               → roleScopeId = vendors.id
// Super-admins can impersonate a specific scope with `?scopeId=<id>`.
//
// Where a metric isn't yet tracked for a role we return
// `{ value: null, comingSoon: true }` so the tile renders in a
// coming-soon state instead of being omitted (per spec).

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { pgArray } from "./lib/pgArray";
import { getUserRole } from "./auth/roles";
import { storage } from "./storage";

type ScopeKind = "label" | "npo" | "vendor" | "artist";
type RangePreset = "today" | "7d" | "30d" | "90d" | "all";

type RangeWindow = { from: Date; to: Date; preset: RangePreset };

type KpiFormat = "currency" | "number" | "percent" | "duration";

type KpiBreakdownRow = { label: string; value: number; format: KpiFormat };

type Kpi = {
  id: string;
  label: string;
  value: number | null;
  prior?: number | null;
  format: KpiFormat;
  note?: string;
  comingSoon?: boolean;
  // Task #1632 — optional line-item breakdown rendered under a tile
  // (e.g. the artist Net tile shows gross → deductions → net so the
  // figure is auditable without leaving the dashboard).
  breakdown?: KpiBreakdownRow[];
};

type SeriesPoint = { date: string; [metric: string]: number | string };
type ChartMetric = { id: string; label: string; format: KpiFormat };
type ActivityItem = {
  kind: string;
  ts: string;
  title: string;
  detail?: string;
  href?: string;
};

type DashboardPayload = {
  scope: { kind: ScopeKind; id: string; name: string; logoUrl: string | null };
  range: { preset: RangePreset; from: string; to: string };
  prior: { from: string; to: string } | null;
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
};

const PRESETS: RangePreset[] = ["today", "7d", "30d", "90d", "all"];

function parsePreset(raw: unknown): RangePreset {
  const s = String(raw ?? "30d").toLowerCase();
  return (PRESETS.includes(s as RangePreset) ? s : "30d") as RangePreset;
}

function rangeFor(preset: RangePreset): RangeWindow {
  const to = new Date();
  let from: Date;
  switch (preset) {
    case "today": {
      from = new Date(to);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case "7d":
      from = new Date(to.getTime() - 7 * 86400_000);
      break;
    case "90d":
      from = new Date(to.getTime() - 90 * 86400_000);
      break;
    case "all":
      from = new Date(2000, 0, 1);
      break;
    case "30d":
    default:
      from = new Date(to.getTime() - 30 * 86400_000);
      break;
  }
  return { from, to, preset };
}

function priorOf(r: RangeWindow): RangeWindow | null {
  if (r.preset === "all") return null;
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: new Date(r.from), preset: r.preset };
}

// ─── Sales cost-stack (Task #1632) ───────────────────────────────────
// Reuse the admin Sell-panel cost-stack math as the single source of
// truth so partner dashboards report the SAME net an artist sees while
// pricing a release. Per-unit deductions (manufacturing + publishing +
// the flat $4.50 platform fee) are read off each copy's format SKU
// snapshot (cost_snapshot_* — the values the Sell panel locks at Save);
// the Stripe processing fee is taken ONCE PER ORDER on the real
// transaction total (incl. shipping + add-ons), per spec. Shipping
// itself is paid by the fan and never deducted from the artist.
const MECH_RATE_CENTS_PER_TRACK = 25.4; // 2 × $0.127 (vinyl + digital mechanicals)
const PLATFORM_FEE_CENTS = 450;
// Physical (pressed) formats — used to scope a press's unit count to the
// copies it actually manufactures (digital copies aren't pressed).
const PHYSICAL_FORMATS = ["7_inch", "12_lp", "12_double", "cassette", "cd"];

export type SalesStack = {
  units: number;
  grossCents: number;
  manufacturingCents: number;
  publishingCents: number;
  platformFeeCents: number;
  stripeFeeCents: number;
  netCents: number;
};

// Exported for the merged artist Dashboard (server/artistReports.ts
// summaryHandler): the Net (artist) card must use the exact same
// cost-stack math as this module's partner payload, so there is ONE
// implementation. The window only needs from/to (RangeWindow satisfies it).
export async function salesStack(
  albumIds: string[],
  window: { from: Date; to: Date } | null,
): Promise<SalesStack> {
  const empty: SalesStack = {
    units: 0, grossCents: 0, manufacturingCents: 0, publishingCents: 0,
    platformFeeCents: 0, stripeFeeCents: 0, netCents: 0,
  };
  if (!window || !albumIds.length) return empty;
  // Per-unit: count paid copies, sum the set price the fan paid, and
  // pull manufacturing + track-count straight off the format's SKU
  // snapshot. Publishing falls back to the album's live track count
  // when a SKU pre-dates the track-count snapshot.
  const copyRow = await db.execute<any>(sql`
    SELECT
      COUNT(*)::bigint AS units,
      COALESCE(SUM(c.format_price_cents), 0)::bigint AS gross,
      COALESCE(SUM(s.cost_snapshot_manufacturing_cents), 0)::bigint AS manufacturing,
      COALESCE(SUM(ROUND(COALESCE(s.cost_snapshot_track_count, sc.n, 0) * ${MECH_RATE_CENTS_PER_TRACK})), 0)::bigint AS publishing
    FROM order_copies c
    JOIN orders o ON o.id = c.order_id
    LEFT JOIN album_skus s ON s.album_id = c.album_id AND s.format = c.format
    LEFT JOIN (
      SELECT album_id, COUNT(*)::int AS n FROM songs WHERE deleted_at IS NULL GROUP BY 1
    ) sc ON sc.album_id = c.album_id
    WHERE o.album_id = ANY(${pgArray(albumIds)})
      AND o.status IN ('paid','shipped')
      AND o.created_at >= ${window.from} AND o.created_at < ${window.to}
  `).catch(() => ({ rows: [] }) as any);
  // Per-order: the Stripe fee is one charge per transaction on the full
  // total (incl. shipping + add-ons), so it can't be derived per copy.
  const feeRow = await db.execute<any>(sql`
    SELECT COALESCE(SUM(ROUND(total_cents * 0.029) + 30), 0)::bigint AS stripe_fee
    FROM orders
    WHERE album_id = ANY(${pgArray(albumIds)})
      AND status IN ('paid','shipped')
      AND created_at >= ${window.from} AND created_at < ${window.to}
  `).catch(() => ({ rows: [] }) as any);
  const c = ((copyRow as any).rows ?? [{}])[0] ?? {};
  const f = ((feeRow as any).rows ?? [{}])[0] ?? {};
  const units = Number(c.units ?? 0);
  const grossCents = Number(c.gross ?? 0);
  const manufacturingCents = Number(c.manufacturing ?? 0);
  const publishingCents = Number(c.publishing ?? 0);
  const platformFeeCents = units * PLATFORM_FEE_CENTS;
  const stripeFeeCents = Number(f.stripe_fee ?? 0);
  const netCents =
    grossCents - manufacturingCents - publishingCents - platformFeeCents - stripeFeeCents;
  return { units, grossCents, manufacturingCents, publishingCents, platformFeeCents, stripeFeeCents, netCents };
}

// Paid physical copies for every release a press manufactures. A press's
// albums are resolved the same way the Sell panel resolves the invited
// press: the SKU's press_id snapshot, the sale-time press_invited_albums
// stamp, or the artist/label invited_by_press_id provenance column.
async function pressUnits(
  pressId: string,
  window: RangeWindow | null,
): Promise<number | null> {
  if (!window) return null;
  const row = await db.execute<any>(sql`
    WITH press_albums AS (
      SELECT DISTINCT a.id
      FROM albums a
      LEFT JOIN people pe ON pe.id = a.primary_artist_id
      LEFT JOIN labels l ON l.id = a.label_id
      WHERE a.id IN (SELECT album_id FROM album_skus WHERE press_id = ${pressId})
         OR a.id IN (SELECT album_id FROM press_invited_albums WHERE press_id = ${pressId})
         OR pe.invited_by_press_id = ${pressId}
         OR l.invited_by_press_id = ${pressId}
    )
    SELECT COUNT(*)::bigint AS units
    FROM order_copies c
    JOIN orders o ON o.id = c.order_id
    WHERE o.album_id IN (SELECT id FROM press_albums)
      AND c.format = ANY(${pgArray(PHYSICAL_FORMATS)})
      AND o.status IN ('paid','shipped')
      AND o.created_at >= ${window.from} AND o.created_at < ${window.to}
  `).catch(() => ({ rows: [] }) as any);
  return Number(((row as any).rows ?? [{}])[0]?.units ?? 0);
}

// Every album a press manufactures, resolved the same way pressUnits
// scopes its CTE (SKU press_id snapshot, sale-time press_invited_albums
// stamp, or artist/label invited_by_press_id provenance). Used by the
// press dashboard to roll up gross sales + orders across those releases.
async function pressAlbumIds(pressId: string): Promise<string[]> {
  const row = await db.execute<any>(sql`
    SELECT DISTINCT a.id
    FROM albums a
    LEFT JOIN people pe ON pe.id = a.primary_artist_id
    LEFT JOIN labels l ON l.id = a.label_id
    WHERE a.id IN (SELECT album_id FROM album_skus WHERE press_id = ${pressId})
       OR a.id IN (SELECT album_id FROM press_invited_albums WHERE press_id = ${pressId})
       OR pe.invited_by_press_id = ${pressId}
       OR l.invited_by_press_id = ${pressId}
  `).catch(() => ({ rows: [] }) as any);
  return (((row as any).rows ?? []) as any[]).map((x) => x.id) as string[];
}

// ─── Per-scope resolution ────────────────────────────────────────────

type ResolvedScope =
  | { kind: ScopeKind; id: string; name: string; logoUrl: string | null; subKind?: "vendor" | "manufacturer" | "fulfillment" }
  | { error: string; status: number };

async function resolveScope(kind: ScopeKind, req: Request): Promise<ResolvedScope> {
  const userId = req.session?.userId;
  if (!userId) return { error: "Unauthorized", status: 401 };
  const info = await getUserRole(userId);
  if (!info) return { error: "Unauthorized", status: 401 };

  const impersonate = typeof req.query.scopeId === "string" ? req.query.scopeId.trim() : "";

  if (kind === "label") {
    let id: string | null = null;
    if (info.role === "super_admin") id = impersonate || null;
    else if (info.role === "label") id = info.roleScopeId;
    else return { error: "Insufficient role", status: 403 };
    if (!id) return { error: "Label scope required", status: info.role === "super_admin" ? 400 : 403 };
    const r = await db.execute<any>(sql`SELECT id, name, logo_url FROM labels WHERE id = ${id} LIMIT 1`);
    const row = ((r as any).rows ?? [])[0];
    if (!row) return { error: "Label not found", status: 404 };
    return { kind, id: row.id, name: row.name, logoUrl: row.logo_url ?? null };
  }

  if (kind === "artist") {
    let id: string | null = null;
    if (info.role === "super_admin") id = impersonate || null;
    else if (info.role === "artist") id = info.roleScopeId;
    else if (info.role === "label") {
      // A label may drill into any artist on their roster. They MUST pass
      // ?scopeId=<personId> and the person must either be tagged with this
      // label (people.label_id) or be the primary artist on an album released
      // by this label. Mirrors the gate in artistReports.ts resolveArtistScope.
      if (!info.roleScopeId) return { error: "Label account has no label scope", status: 403 };
      if (!impersonate) return { error: "Label must pass ?scopeId= to drill into a roster artist", status: 400 };
      const okRow = await db.execute<{ ok: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM people WHERE id = ${impersonate} AND label_id = ${info.roleScopeId}
          UNION
          SELECT 1 FROM albums WHERE primary_artist_id = ${impersonate} AND label_id = ${info.roleScopeId}
        ) AS ok
      `);
      const ok = ((okRow as any).rows?.[0]?.ok) === true;
      if (!ok) return { error: "Artist is not on this label's roster", status: 403 };
      id = impersonate;
    } else if (info.role === "manager") {
      // A manager may drill into any artist on their roster. They MUST pass
      // ?scopeId=<personId> and the person must be tagged with this manager
      // (people.manager_id = manager's roleScopeId). Same gate as artistReports.ts.
      if (!info.roleScopeId) return { error: "Manager account has no manager scope", status: 403 };
      if (!impersonate) return { error: "Manager must pass ?scopeId= to drill into a roster artist", status: 400 };
      const okRow = await db.execute<{ ok: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM people WHERE id = ${impersonate} AND manager_id = ${info.roleScopeId}
        ) AS ok
      `);
      const ok = ((okRow as any).rows?.[0]?.ok) === true;
      if (!ok) return { error: "Artist is not on this manager's roster", status: 403 };
      id = impersonate;
    } else {
      return { error: "Insufficient role", status: 403 };
    }
    if (!id) return { error: "Artist scope required", status: info.role === "super_admin" ? 400 : 403 };
    const r = await db.execute<any>(sql`SELECT id, name, photo_url FROM people WHERE id = ${id} LIMIT 1`);
    const row = ((r as any).rows ?? [])[0];
    if (!row) return { error: "Artist not found", status: 404 };
    return { kind, id: row.id, name: row.name, logoUrl: row.photo_url ?? null };
  }

  if (kind === "npo") {
    let id: string | null = null;
    if (info.role === "super_admin") id = impersonate || null;
    else if (info.role === "non_profit") id = info.roleScopeId;
    else return { error: "Insufficient role", status: 403 };
    if (!id) return { error: "Non-profit scope required", status: info.role === "super_admin" ? 400 : 403 };
    const r = await db.execute<any>(
      sql`SELECT id, name, logo_url FROM organizations WHERE id = ${id} AND kind = 'non_profit' LIMIT 1`,
    );
    const row = ((r as any).rows ?? [])[0];
    if (!row) return { error: "Non-profit not found", status: 404 };
    return { kind, id: row.id, name: row.name, logoUrl: row.logo_url ?? null };
  }

  // kind === "vendor" — covers vendor / manufacturer / fulfillment.
  // Each role is scoped to a *different* table; resolve against the
  // right one per role so manufacturer + fulfillment users get a real
  // scope row instead of a "Vendor not found" 404 from the vendors
  // table. Super-admin impersonation accepts an explicit `?scopeKind=`
  // (vendor|manufacturer|fulfillment, default vendor).
  let id: string | null = null;
  let table: "vendors" | "manufacturers" | "fulfillment_partners" = "vendors";
  if (info.role === "super_admin") {
    id = impersonate || null;
    const sk = String(req.query.scopeKind ?? "vendor").toLowerCase();
    table = sk === "manufacturer" ? "manufacturers" : sk === "fulfillment" ? "fulfillment_partners" : "vendors";
  } else if (info.role === "vendor") {
    id = info.roleScopeId; table = "vendors";
  } else if (info.role === "manufacturer") {
    id = info.roleScopeId; table = "manufacturers";
  } else if (info.role === "fulfillment") {
    id = info.roleScopeId; table = "fulfillment_partners";
  } else {
    return { error: "Insufficient role", status: 403 };
  }
  if (!id) return { error: "Vendor scope required", status: info.role === "super_admin" ? 400 : 403 };
  const tableSql =
    table === "manufacturers" ? sql`manufacturers` :
    table === "fulfillment_partners" ? sql`fulfillment_partners` :
    sql`vendors`;
  const r = await db.execute<any>(sql`SELECT id, name, logo_url FROM ${tableSql} WHERE id = ${id} LIMIT 1`);
  const row = ((r as any).rows ?? [])[0];
  if (!row) return { error: "Scope not found", status: 404 };
  const subKind = table === "manufacturers" ? "manufacturer" : table === "fulfillment_partners" ? "fulfillment" : "vendor";
  return { kind, id: row.id, name: row.name, logoUrl: row.logo_url ?? null, subKind };
}

// ─── Label payload ───────────────────────────────────────────────────

async function buildLabelPayload(
  scope: { id: string; name: string; logoUrl: string | null },
  r: RangeWindow,
  prior: RangeWindow | null,
): Promise<{ kpis: Kpi[]; chartMetrics: ChartMetric[]; series: SeriesPoint[]; activity: ActivityItem[] }> {
  // Scope: all albums + songs under the label.
  const albumRows = await db.execute<any>(sql`
    SELECT id, primary_artist_id, title, good_tunes_release_date FROM albums WHERE label_id = ${scope.id}
  `);
  const albums = ((albumRows as any).rows ?? []) as any[];
  const albumIds = albums.map((a) => a.id);

  const songRows = albumIds.length
    ? await db.execute<any>(sql`SELECT id FROM songs WHERE album_id = ANY(${pgArray(albumIds)}) AND deleted_at IS NULL`)
    : ({ rows: [] } as any);
  const songIds = ((songRows as any).rows ?? []).map((s: any) => s.id);

  async function rev(window: RangeWindow) {
    if (!albumIds.length) return { gross: 0, orders: 0 };
    const row = await db.execute<any>(sql`
      SELECT
        COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_cents ELSE 0 END), 0)::bigint AS gross,
        COUNT(*) FILTER (WHERE status <> 'refunded')::bigint AS orders
      FROM orders
      WHERE status IN ('paid','shipped','refunded')
        AND album_id = ANY(${pgArray(albumIds)})
        AND created_at >= ${window.from} AND created_at < ${window.to}
    `);
    const x = ((row as any).rows ?? [])[0] ?? { gross: 0, orders: 0 };
    return { gross: Number(x.gross), orders: Number(x.orders) };
  }
  async function plays(window: RangeWindow) {
    if (!songIds.length) return { plays: 0, newFans: 0 };
    const p = await db.execute<any>(sql`
      SELECT COUNT(*) FILTER (WHERE name = 'play_start')::bigint AS plays
      FROM analytics_events
      WHERE name IN ('play_start','play_complete')
        AND payload->>'songId' = ANY(${pgArray(songIds)})
        AND ts >= ${window.from} AND ts < ${window.to}
    `);
    const nf = await db.execute<any>(sql`
      WITH first_play AS (
        SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
        FROM analytics_events
        WHERE name = 'play_start'
          AND payload->>'songId' = ANY(${pgArray(songIds)})
          AND COALESCE(user_id, session_id) IS NOT NULL
        GROUP BY 1
      )
      SELECT COUNT(*)::bigint AS new_fans FROM first_play
      WHERE first_ts >= ${window.from} AND first_ts < ${window.to}
    `);
    return {
      plays: Number(((p as any).rows ?? [{}])[0]?.plays ?? 0),
      newFans: Number(((nf as any).rows ?? [{}])[0]?.new_fans ?? 0),
    };
  }

  const [cur, curP, prv, prvP] = await Promise.all([
    rev(r),
    plays(r),
    prior ? rev(prior) : Promise.resolve(null),
    prior ? plays(prior) : Promise.resolve(null),
  ]);

  const kpis: Kpi[] = [
    { id: "gross", label: "Gross sales", value: cur.gross, prior: prv?.gross ?? null, format: "currency" },
    // Net revenue (label share) requires the per-order payout-split
    // columns the payouts pipeline writes; until that lands the honest
    // thing to show is a coming-soon tile rather than mirroring gross.
    { id: "net", label: "Net revenue", value: null, format: "currency", comingSoon: true, note: "Label share lands with payout-split columns" },
    { id: "orders", label: "Orders", value: cur.orders, prior: prv?.orders ?? null, format: "number" },
    { id: "newFans", label: "New fans", value: curP.newFans, prior: prvP?.newFans ?? null, format: "number" },
    { id: "plays", label: "Plays", value: curP.plays, prior: prvP?.plays ?? null, format: "number" },
  ];

  // Daily series — revenue + plays.
  const revDaily = albumIds.length
    ? await db.execute<any>(sql`
        SELECT date_trunc('day', created_at)::date::text AS day,
          COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_cents ELSE 0 END), 0)::bigint AS revenue,
          COUNT(*) FILTER (WHERE status <> 'refunded')::bigint AS orders
        FROM orders
        WHERE status IN ('paid','shipped','refunded')
          AND album_id = ANY(${pgArray(albumIds)})
          AND created_at >= ${r.from} AND created_at < ${r.to}
        GROUP BY 1 ORDER BY 1 ASC
      `)
    : ({ rows: [] } as any);
  const playDaily = songIds.length
    ? await db.execute<any>(sql`
        SELECT date_trunc('day', ts)::date::text AS day,
          COUNT(*) FILTER (WHERE name = 'play_start')::bigint AS plays
        FROM analytics_events
        WHERE name IN ('play_start','play_complete')
          AND payload->>'songId' = ANY(${pgArray(songIds)})
          AND ts >= ${r.from} AND ts < ${r.to}
        GROUP BY 1 ORDER BY 1 ASC
      `)
    : ({ rows: [] } as any);

  // Daily new-fan curve — first-play-per-listener bucketed by day.
  const newFansDaily = songIds.length
    ? await db.execute<any>(sql`
        WITH first_play AS (
          SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
          FROM analytics_events
          WHERE name = 'play_start'
            AND payload->>'songId' = ANY(${pgArray(songIds)})
            AND COALESCE(user_id, session_id) IS NOT NULL
          GROUP BY 1
        )
        SELECT date_trunc('day', first_ts)::date::text AS day,
          COUNT(*)::bigint AS new_fans
        FROM first_play
        WHERE first_ts >= ${r.from} AND first_ts < ${r.to}
        GROUP BY 1 ORDER BY 1 ASC
      `)
    : ({ rows: [] } as any);

  const series = mergeDaily(r, [
    { rows: ((revDaily as any).rows ?? []) as any[], gross: (x: any) => Number(x.revenue ?? 0), orders: (x: any) => Number(x.orders ?? 0) },
    { rows: ((playDaily as any).rows ?? []) as any[], plays: (x: any) => Number(x.plays ?? 0) },
    { rows: ((newFansDaily as any).rows ?? []) as any[], newFans: (x: any) => Number(x.new_fans ?? 0) },
  ]);

  const chartMetrics: ChartMetric[] = [
    { id: "gross", label: "Gross", format: "currency" },
    { id: "orders", label: "Orders", format: "number" },
    { id: "plays", label: "Plays", format: "number" },
    { id: "newFans", label: "New fans", format: "number" },
  ];

  // Activity — recent orders, recent album additions, recent roster additions.
  const activity: ActivityItem[] = [];
  if (albumIds.length) {
    const orderRows = await db.execute<any>(sql`
      SELECT o.id, o.created_at, o.total_cents, a.title AS album_title, a.id AS album_id
      FROM orders o
      JOIN albums a ON a.id = o.album_id
      WHERE o.status IN ('paid','shipped')
        AND o.album_id = ANY(${pgArray(albumIds)})
        AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
      ORDER BY o.created_at DESC LIMIT 10
    `);
    for (const o of ((orderRows as any).rows ?? []) as any[]) {
      activity.push({
        kind: "order",
        ts: new Date(o.created_at).toISOString(),
        title: `Order — ${o.album_title}`,
        detail: `$${(Number(o.total_cents) / 100).toFixed(2)}`,
        href: `/admin/albums/${o.album_id}`,
      });
    }
  }
  for (const a of albums) {
    const rd = a.good_tunes_release_date;
    if (rd && new Date(rd) >= r.from && new Date(rd) < r.to) {
      activity.push({
        kind: "release",
        ts: new Date(rd).toISOString(),
        title: `Album released — ${a.title}`,
        href: `/admin/albums/${a.id}`,
      });
    }
  }
  activity.sort((x, y) => (y.ts < x.ts ? -1 : 1));

  return { kpis, chartMetrics, series, activity: activity.slice(0, 15) };
}

// ─── NPO payload ─────────────────────────────────────────────────────

async function buildNpoPayload(
  scope: { id: string; name: string; logoUrl: string | null },
  r: RangeWindow,
  prior: RangeWindow | null,
): Promise<{ kpis: Kpi[]; chartMetrics: ChartMetric[]; series: SeriesPoint[]; activity: ActivityItem[] }> {
  // Pending + paid totals from referral_credits — range-windowed so
  // every tile follows the range picker. "Pending" buckets by accrual
  // (created_at); "Paid" buckets by payout date (paid_at) so a tile
  // labelled "Paid out" reflects what cleared inside the window.
  async function credits(window: RangeWindow | null) {
    if (!window) return null;
    const row = await db.execute<any>(sql`
      SELECT
        COALESCE(SUM(amount_cents) FILTER (
          WHERE status = 'pending_payout'
            AND created_at >= ${window.from} AND created_at < ${window.to}
        ), 0)::bigint AS pending_cents,
        COALESCE(SUM(amount_cents) FILTER (
          WHERE status = 'paid'
            AND paid_at IS NOT NULL
            AND paid_at >= ${window.from} AND paid_at < ${window.to}
        ), 0)::bigint AS paid_cents
      FROM referral_credits WHERE referrer_org_id = ${scope.id}
    `).catch(() => ({ rows: [{ pending_cents: 0, paid_cents: 0 }] }) as any);
    const x = ((row as any).rows ?? [{}])[0] ?? { pending_cents: 0, paid_cents: 0 };
    return { pending: Number(x.pending_cents), paid: Number(x.paid_cents) };
  }
  const [cCur, cPrv] = await Promise.all([credits(r), credits(prior)]);
  const t = cCur ?? { pending: 0, paid: 0 };

  // Orders that earned this NPO a donation in-window — one referral
  // credit is written per qualifying sale, so DISTINCT order_id over the
  // ledger is the honest order count (no double-count across per-copy
  // credits on a multi-quantity order).
  async function npoOrders(window: RangeWindow | null) {
    if (!window) return null;
    const row = await db.execute<any>(sql`
      SELECT COUNT(DISTINCT order_id)::bigint AS n
      FROM referral_credits
      WHERE referrer_org_id = ${scope.id}
        AND referrer_kind = 'non_profit'
        AND created_at >= ${window.from} AND created_at < ${window.to}
    `).catch(() => ({ rows: [{ n: 0 }] }) as any);
    return Number(((row as any).rows ?? [{}])[0]?.n ?? 0);
  }
  const [ordCur, ordPrv] = await Promise.all([npoOrders(r), npoOrders(prior)]);

  // New fans = first-ever listeners of the songs released by artists this
  // NPO referred (first-play-per-listener, bucketed into the window) —
  // mirrors the artist/label new-fan definition, scoped to NPO songs.
  const referredArtistIdsRow = await db.execute<any>(
    sql`SELECT id FROM people WHERE referred_by_org_id = ${scope.id}`,
  ).catch(() => ({ rows: [] }) as any);
  const referredArtistIds = (((referredArtistIdsRow as any).rows ?? []) as any[]).map((x) => x.id) as string[];
  let npoSongIds: string[] = [];
  if (referredArtistIds.length) {
    const songRows = await db.execute<any>(sql`
      SELECT s.id
      FROM songs s
      JOIN albums a ON a.id = s.album_id
      WHERE a.primary_artist_id = ANY(${pgArray(referredArtistIds)})
    `).catch(() => ({ rows: [] }) as any);
    npoSongIds = (((songRows as any).rows ?? []) as any[]).map((x) => x.id) as string[];
  }
  async function npoNewFans(window: RangeWindow | null) {
    if (!window) return null;
    if (!npoSongIds.length) return 0;
    const nf = await db.execute<any>(sql`
      WITH first_play AS (
        SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
        FROM analytics_events
        WHERE name = 'play_start'
          AND payload->>'songId' = ANY(${pgArray(npoSongIds)})
          AND COALESCE(user_id, session_id) IS NOT NULL
        GROUP BY 1
      )
      SELECT COUNT(*)::bigint AS new_fans FROM first_play
      WHERE first_ts >= ${window.from} AND first_ts < ${window.to}
    `).catch(() => ({ rows: [{ new_fans: 0 }] }) as any);
    return Number(((nf as any).rows ?? [{}])[0]?.new_fans ?? 0);
  }
  const [fansCur, fansPrv] = await Promise.all([npoNewFans(r), npoNewFans(prior)]);

  // Task #1632 — live donation reporting. Units attributable to this
  // NPO's earmark come straight off the referral_credits ledger (one
  // credit per sale, $1/unit earmark); dollars donated = that earmark
  // total PLUS any "Gift of Hope"-style custom add-on revenue routed to
  // this org. Windowed by accrual (created_at), refunds follow existing
  // referral-credit behaviour (not reversed).
  async function donations(window: RangeWindow | null) {
    if (!window) return null;
    const er = await db.execute<any>(sql`
      SELECT
        COALESCE(SUM(units), 0)::bigint AS units,
        COALESCE(SUM(amount_cents), 0)::bigint AS earmark
      FROM referral_credits
      WHERE referrer_org_id = ${scope.id}
        AND referrer_kind = 'non_profit'
        AND created_at >= ${window.from} AND created_at < ${window.to}
    `).catch(() => ({ rows: [] }) as any);
    const gr = await db.execute<any>(sql`
      SELECT COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::bigint AS goh
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN custom_addons ca ON ca.id = oi.sku
      WHERE oi.kind = 'custom_addon'
        AND ca.organization_id = ${scope.id}
        AND o.status IN ('paid','shipped')
        AND o.created_at >= ${window.from} AND o.created_at < ${window.to}
    `).catch(() => ({ rows: [] }) as any);
    const e = ((er as any).rows ?? [{}])[0] ?? {};
    const g = ((gr as any).rows ?? [{}])[0] ?? {};
    const units = Number(e.units ?? 0);
    const earmark = Number(e.earmark ?? 0);
    const goh = Number(g.goh ?? 0);
    return { units, earmark, goh, donated: earmark + goh };
  }
  const [dCur, dPrv] = await Promise.all([donations(r), donations(prior)]);
  const d = dCur ?? { units: 0, earmark: 0, goh: 0, donated: 0 };

  // NPO metric set leads with orders + new fans (mission reach), then
  // the money that follows: donated / pending / paid. Gross/net, units,
  // referred-artist counts and album counts are intentionally dropped —
  // an NPO cares about reach and dollars raised, not catalog volume.
  const kpis: Kpi[] = [
    { id: "orders", label: "Orders", value: ordCur ?? 0, prior: ordPrv ?? null, format: "number", note: "$1/order earmark to this cause" },
    { id: "newFans", label: "New fans", value: fansCur ?? 0, prior: fansPrv ?? null, format: "number", note: "First-time listeners of referred artists" },
    {
      id: "donated",
      label: "Dollars donated",
      value: d.donated,
      prior: dPrv?.donated ?? null,
      format: "currency",
      note: "$1/unit earmark + Gift of Hope",
      breakdown: [
        { label: "$1/unit earmark", value: d.earmark, format: "currency" },
        { label: "Gift of Hope", value: d.goh, format: "currency" },
      ],
    },
    { id: "pending", label: "Pending payout", value: t.pending, prior: cPrv?.pending ?? null, format: "currency" },
    { id: "paid", label: "Paid out", value: t.paid, prior: cPrv?.paid ?? null, format: "currency" },
  ];

  // Daily series — orders, new fans, and payout accrual.
  const accrual = await db.execute<any>(sql`
    SELECT date_trunc('day', created_at)::date::text AS day,
      COUNT(DISTINCT order_id)::bigint AS orders,
      COALESCE(SUM(amount_cents), 0)::bigint AS amount
    FROM referral_credits
    WHERE referrer_org_id = ${scope.id}
      AND created_at >= ${r.from} AND created_at < ${r.to}
    GROUP BY 1 ORDER BY 1 ASC
  `).catch(() => ({ rows: [] }) as any);

  const newFansDaily = npoSongIds.length
    ? await db.execute<any>(sql`
        WITH first_play AS (
          SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
          FROM analytics_events
          WHERE name = 'play_start'
            AND payload->>'songId' = ANY(${pgArray(npoSongIds)})
            AND COALESCE(user_id, session_id) IS NOT NULL
          GROUP BY 1
        )
        SELECT date_trunc('day', first_ts)::date::text AS day, COUNT(*)::bigint AS new_fans
        FROM first_play
        WHERE first_ts >= ${r.from} AND first_ts < ${r.to}
        GROUP BY 1 ORDER BY 1 ASC
      `).catch(() => ({ rows: [] }) as any)
    : ({ rows: [] } as any);

  const series = mergeDaily(r, [
    { rows: ((accrual as any).rows ?? []) as any[], orders: (x: any) => Number(x.orders ?? 0), pending: (x: any) => Number(x.amount ?? 0) },
    { rows: ((newFansDaily as any).rows ?? []) as any[], newFans: (x: any) => Number(x.new_fans ?? 0) },
  ]);
  const chartMetrics: ChartMetric[] = [
    { id: "orders", label: "Orders", format: "number" },
    { id: "newFans", label: "New fans", format: "number" },
    { id: "pending", label: "Payout accrual", format: "currency" },
  ];

  // Activity — recent invites accepted, artist sign-ups (referred
  // People that landed in the window), recent referral payouts.
  const activity: ActivityItem[] = [];
  const signups = await db.execute<any>(sql`
    SELECT id, name, created_at
    FROM people
    WHERE referred_by_org_id = ${scope.id}
      AND created_at IS NOT NULL
      AND created_at >= ${r.from} AND created_at < ${r.to}
    ORDER BY created_at DESC LIMIT 10
  `).catch(() => ({ rows: [] }) as any);
  for (const p of ((signups as any).rows ?? []) as any[]) {
    activity.push({
      kind: "artist_signup",
      ts: new Date(p.created_at).toISOString(),
      title: `Artist signed up — ${p.name ?? "Unnamed"}`,
      href: `/artist/${p.id}`,
    });
  }
  const acceptedInvites = await db.execute<any>(sql`
    SELECT id, email, role, used_at
    FROM admin_invites
    WHERE referrer_kind = 'non_profit' AND referrer_scope_id = ${scope.id}
      AND used_at IS NOT NULL
      AND used_at >= ${r.from} AND used_at < ${r.to}
    ORDER BY used_at DESC LIMIT 10
  `).catch(() => ({ rows: [] }) as any);
  for (const i of ((acceptedInvites as any).rows ?? []) as any[]) {
    activity.push({
      kind: "invite_accepted",
      ts: new Date(i.used_at).toISOString(),
      title: `Invite accepted — ${i.email}`,
      detail: `Role: ${i.role}`,
    });
  }
  const payouts = await db.execute<any>(sql`
    SELECT id, amount_cents, status, COALESCE(paid_at, created_at) AS ts
    FROM referral_credits
    WHERE referrer_org_id = ${scope.id}
      AND COALESCE(paid_at, created_at) >= ${r.from}
      AND COALESCE(paid_at, created_at) < ${r.to}
    ORDER BY ts DESC LIMIT 10
  `).catch(() => ({ rows: [] }) as any);
  for (const p of ((payouts as any).rows ?? []) as any[]) {
    activity.push({
      kind: p.status === "paid" ? "payout" : "credit",
      ts: new Date(p.ts).toISOString(),
      title: p.status === "paid" ? `Payout sent` : `Credit accrued`,
      detail: `$${(Number(p.amount_cents) / 100).toFixed(2)}`,
    });
  }
  activity.sort((x, y) => (y.ts < x.ts ? -1 : 1));

  return { kpis, chartMetrics, series, activity: activity.slice(0, 15) };
}

// ─── Vendor payload ──────────────────────────────────────────────────

async function buildVendorPayload(
  scope: { id: string; name: string; logoUrl: string | null },
  r: RangeWindow,
  prior: RangeWindow | null,
  subKind: "vendor" | "manufacturer" | "fulfillment" = "vendor",
): Promise<{ kpis: Kpi[]; chartMetrics: ChartMetric[]; series: SeriesPoint[]; activity: ActivityItem[] }> {
  // Press / manufacturer scope gets a sales-oriented metric set —
  // gross sales, orders, and units across the releases it manufactures —
  // instead of the vendor pipeline tiles. Fans/plays are intentionally
  // omitted (a press doesn't own listening); "Revenue (your cut)" and
  // "Avg turn-time" stay honest coming-soon until the per-press payout
  // split and pressing-pipeline turn events ship.
  if (subKind === "manufacturer") {
    const albumIds = await pressAlbumIds(scope.id);
    async function pSales(window: RangeWindow | null) {
      if (!window) return null;
      if (!albumIds.length) return { gross: 0, orders: 0 };
      const row = await db.execute<any>(sql`
        SELECT
          COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_cents ELSE 0 END), 0)::bigint AS gross,
          COUNT(*) FILTER (WHERE status <> 'refunded')::bigint AS orders
        FROM orders
        WHERE status IN ('paid','shipped','refunded')
          AND album_id = ANY(${pgArray(albumIds)})
          AND created_at >= ${window.from} AND created_at < ${window.to}
      `).catch(() => ({ rows: [] }) as any);
      const x = (((row as any).rows ?? [])[0]) ?? { gross: 0, orders: 0 };
      return { gross: Number(x.gross ?? 0), orders: Number(x.orders ?? 0) };
    }
    const [salesCur, salesPrv, unitsCur, unitsPrv] = await Promise.all([
      pSales(r),
      pSales(prior),
      pressUnits(scope.id, r),
      prior ? pressUnits(scope.id, prior) : Promise.resolve(null),
    ]);
    const kpis: Kpi[] = [
      { id: "gross", label: "Gross sales", value: salesCur?.gross ?? 0, prior: salesPrv?.gross ?? null, format: "currency", note: "Across this press's releases" },
      { id: "revenue", label: "Revenue (your cut)", value: null, format: "currency", comingSoon: true, note: "Per-press payout split lands with the payouts pipeline" },
      { id: "orders", label: "Orders", value: salesCur?.orders ?? 0, prior: salesPrv?.orders ?? null, format: "number" },
      { id: "units", label: "Units sold", value: unitsCur ?? 0, prior: unitsPrv, format: "number", note: "Paid physical copies pressed" },
      { id: "turn", label: "Avg turn-time", value: null, format: "duration", comingSoon: true, note: "Turn-time tracking lands with the pressing pipeline" },
    ];
    const salesDaily = albumIds.length
      ? await db.execute<any>(sql`
          SELECT date_trunc('day', created_at)::date::text AS day,
            COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_cents ELSE 0 END), 0)::bigint AS gross,
            COUNT(*) FILTER (WHERE status <> 'refunded')::bigint AS orders
          FROM orders
          WHERE status IN ('paid','shipped','refunded')
            AND album_id = ANY(${pgArray(albumIds)})
            AND created_at >= ${r.from} AND created_at < ${r.to}
          GROUP BY 1 ORDER BY 1 ASC
        `).catch(() => ({ rows: [] }) as any)
      : ({ rows: [] } as any);
    const series = mergeDaily(r, [
      { rows: ((salesDaily as any).rows ?? []) as any[], gross: (x: any) => Number(x.gross ?? 0), orders: (x: any) => Number(x.orders ?? 0) },
    ]);
    const chartMetrics: ChartMetric[] = [
      { id: "gross", label: "Gross", format: "currency" },
      { id: "orders", label: "Orders", format: "number" },
    ];
    const activity: ActivityItem[] = [];
    if (albumIds.length) {
      const orderRows = await db.execute<any>(sql`
        SELECT o.id, o.created_at, o.total_cents, a.title AS album_title, a.id AS album_id
        FROM orders o
        JOIN albums a ON a.id = o.album_id
        WHERE o.status IN ('paid','shipped')
          AND o.album_id = ANY(${pgArray(albumIds)})
          AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
        ORDER BY o.created_at DESC LIMIT 10
      `).catch(() => ({ rows: [] }) as any);
      for (const o of ((orderRows as any).rows ?? []) as any[]) {
        activity.push({
          kind: "order",
          ts: new Date(o.created_at).toISOString(),
          title: `Order — ${o.album_title}`,
          detail: `$${(Number(o.total_cents) / 100).toFixed(2)}`,
          href: `/admin/albums/${o.album_id}`,
        });
      }
    }
    return { kpis, chartMetrics, series, activity };
  }

  // Task #2818 — fulfillment-partner scope gets real warehouse KPIs off
  // orders.fulfillment_partner_id: routed orders, shipped, open pipeline
  // (submitted / in_fulfillment), plus approved press runs inbound.
  if (subKind === "fulfillment") {
    async function fWindow(window: RangeWindow | null) {
      if (!window) return null;
      const row = await db.execute<any>(sql`
        SELECT
          COUNT(*)::bigint AS routed,
          COUNT(*) FILTER (WHERE fulfillment_status IN ('shipped','delivered'))::bigint AS shipped
        FROM orders
        WHERE fulfillment_partner_id = ${scope.id}
          AND origin <> 'qa:test'
          AND created_at >= ${window.from} AND created_at < ${window.to}
      `).catch(() => ({ rows: [] }) as any);
      const x = (((row as any).rows ?? [])[0]) ?? {};
      return { routed: Number(x.routed ?? 0), shipped: Number(x.shipped ?? 0) };
    }
    // Open pipeline + inbound are point-in-time (not windowed).
    const openRow = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM orders
      WHERE fulfillment_partner_id = ${scope.id}
        AND origin <> 'qa:test'
        AND fulfillment_status IN ('submitted','in_fulfillment')
    `).catch(() => ({ rows: [] }) as any);
    const openPipeline = Number((((openRow as any).rows ?? [])[0])?.n ?? 0);
    // Inbound press runs: approved runs whose album routes here (splits /
    // album override / platform default). Mirrors the portal Inbound feed.
    let inbound: number | null = null;
    try {
      const { albumRoutesToPartner } = await import("./fulfillmentPortal");
      const partnerRow = await db.execute<any>(sql`
        SELECT is_default FROM fulfillment_partners WHERE id = ${scope.id} AND deleted_at IS NULL
      `);
      const isDefault = !!(((partnerRow as any).rows ?? [])[0]?.is_default);
      const runRows = await db.execute<any>(sql`
        SELECT por.album_id FROM pressing_order_requests por
        JOIN albums a ON a.id = por.album_id AND a.deleted_at IS NULL
        WHERE por.status = 'approved'
        LIMIT 200
      `);
      let n = 0;
      for (const rr of ((runRows as any).rows ?? []) as any[]) {
        if (await albumRoutesToPartner(String(rr.album_id), scope.id, isDefault)) n++;
      }
      inbound = n;
    } catch {
      inbound = null;
    }
    const [cur, prv] = await Promise.all([fWindow(r), fWindow(prior)]);
    const kpis: Kpi[] = [
      { id: "routed", label: "Orders routed", value: cur?.routed ?? 0, prior: prv?.routed ?? null, format: "number", note: "Fan orders routed to your warehouse" },
      { id: "open", label: "Open pipeline", value: openPipeline, format: "number", note: "Submitted or in fulfillment right now" },
      { id: "shipped", label: "Shipped", value: cur?.shipped ?? 0, prior: prv?.shipped ?? null, format: "number" },
      inbound === null
        ? { id: "inbound", label: "Inbound press runs", value: null, format: "number", comingSoon: true }
        : { id: "inbound", label: "Inbound press runs", value: inbound, format: "number", note: "Approved runs headed to your dock" },
      { id: "turn", label: "Avg turn-time", value: null, format: "duration", comingSoon: true, note: "Turn-time lands with per-order pick/pack events" },
    ];
    const daily = await db.execute<any>(sql`
      SELECT date_trunc('day', created_at)::date::text AS day,
        COUNT(*)::bigint AS routed,
        COUNT(*) FILTER (WHERE fulfillment_status IN ('shipped','delivered'))::bigint AS shipped
      FROM orders
      WHERE fulfillment_partner_id = ${scope.id}
        AND origin <> 'qa:test'
        AND created_at >= ${r.from} AND created_at < ${r.to}
      GROUP BY 1 ORDER BY 1 ASC
    `).catch(() => ({ rows: [] }) as any);
    const series = mergeDaily(r, [
      { rows: ((daily as any).rows ?? []) as any[], routed: (x: any) => Number(x.routed ?? 0), shipped: (x: any) => Number(x.shipped ?? 0) },
    ]);
    const chartMetrics: ChartMetric[] = [
      { id: "routed", label: "Routed", format: "number" },
      { id: "shipped", label: "Shipped", format: "number" },
    ];
    const activity: ActivityItem[] = [];
    const recent = await db.execute<any>(sql`
      SELECT o.id, o.created_at, o.fulfillment_status, a.title AS album_title
      FROM orders o JOIN albums a ON a.id = o.album_id
      WHERE o.fulfillment_partner_id = ${scope.id}
        AND o.origin <> 'qa:test'
        AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
      ORDER BY o.created_at DESC LIMIT 10
    `).catch(() => ({ rows: [] }) as any);
    for (const o of ((recent as any).rows ?? []) as any[]) {
      activity.push({
        kind: "order",
        ts: new Date(o.created_at).toISOString(),
        title: `Order routed — ${o.album_title}`,
        detail: o.fulfillment_status ? String(o.fulfillment_status).replace(/_/g, " ") : "pending",
      });
    }
    return { kpis, chartMetrics, series, activity };
  }

  // Most vendor-pipeline metrics aren't tracked end-to-end yet — render
  // as coming-soon tiles so the shell still feels populated and the
  // operator can see *where* the numbers will land once the pipeline
  // events ship. The few we can compute from existing data:
  //   - Open jobs / completed: derived from pressing_orders.vendor_id
  //     and only meaningful for true vendor rows. For manufacturer /
  //     fulfillment scopes (different tables, different join keys)
  //     return null so the tile renders coming-soon instead of a
  //     misleading "0 open" when there's no data path at all.
  let openJobs: number | null = null;
  let completed: number | null = null;
  try {
    if (subKind !== "vendor") throw new Error("non-vendor scope");
    const open = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM pressing_orders
      WHERE vendor_id = ${scope.id} AND status NOT IN ('completed','cancelled','rejected')
    `);
    openJobs = Number(((open as any).rows ?? [{}])[0]?.n ?? 0);
    const done = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM pressing_orders
      WHERE vendor_id = ${scope.id} AND status = 'completed'
        AND COALESCE(updated_at, created_at) >= ${r.from}
        AND COALESCE(updated_at, created_at) < ${r.to}
    `);
    completed = Number(((done as any).rows ?? [{}])[0]?.n ?? 0);
  } catch {
    // pressing_orders table may not be present in every env / role
    openJobs = null;
    completed = null;
  }

  // Press (manufacturer) scope returns its own sales-oriented payload
  // above; this path now only serves vendor + fulfillment rows, which
  // aren't the pressing party, so units stay coming-soon.
  const kpis: Kpi[] = [
    openJobs === null
      ? { id: "open", label: "Open jobs", value: null, format: "number", comingSoon: true }
      : { id: "open", label: "Open jobs", value: openJobs, format: "number" },
    completed === null
      ? { id: "done", label: "Completed", value: null, format: "number", comingSoon: true }
      : { id: "done", label: "Completed", value: completed, format: "number" },
    { id: "units", label: "Units shipped", value: null, format: "number", comingSoon: true, note: "Unit ship events land with fulfillment status hookup" },
    { id: "revenue", label: "Revenue (your cut)", value: null, format: "currency", comingSoon: true, note: "Per-vendor payout split ships with Task #245 follow-up" },
    { id: "turn", label: "Avg turn-time", value: null, format: "duration", comingSoon: true },
  ];

  const series: SeriesPoint[] = [];
  const chartMetrics: ChartMetric[] = [
    { id: "open", label: "Open jobs", format: "number" },
  ];

  const activity: ActivityItem[] = [];
  try {
    if (subKind !== "vendor") throw new Error("non-vendor scope");
    const jobs = await db.execute<any>(sql`
      SELECT id, status, COALESCE(updated_at, created_at) AS ts
      FROM pressing_orders
      WHERE vendor_id = ${scope.id}
        AND COALESCE(updated_at, created_at) >= ${r.from}
        AND COALESCE(updated_at, created_at) < ${r.to}
      ORDER BY ts DESC LIMIT 10
    `);
    for (const j of ((jobs as any).rows ?? []) as any[]) {
      activity.push({
        kind: "job",
        ts: new Date(j.ts).toISOString(),
        title: `Job ${j.status}`,
        detail: `#${String(j.id).slice(0, 8)}`,
      });
    }
  } catch { /* coming-soon */ }

  return { kpis, chartMetrics, series, activity };
}

// ─── Artist payload ──────────────────────────────────────────────────

async function buildArtistPayload(
  scope: { id: string; name: string; logoUrl: string | null },
  r: RangeWindow,
  prior: RangeWindow | null,
): Promise<{ kpis: Kpi[]; chartMetrics: ChartMetric[]; series: SeriesPoint[]; activity: ActivityItem[] }> {
  // Songs the artist owns the primary credit on (via their albums).
  // Doesn't yet include side-musician credits — that's a follow-up.
  const albumRows = await db.execute<any>(sql`
    SELECT id, title, good_tunes_release_date FROM albums WHERE primary_artist_id = ${scope.id}
  `);
  const albums = ((albumRows as any).rows ?? []) as any[];
  const albumIds = albums.map((a) => a.id);
  const songRows = albumIds.length
    ? await db.execute<any>(sql`SELECT id FROM songs WHERE album_id = ANY(${pgArray(albumIds)}) AND deleted_at IS NULL`)
    : ({ rows: [] } as any);
  const songIds = ((songRows as any).rows ?? []).map((s: any) => s.id);

  async function plays(window: RangeWindow) {
    if (!songIds.length) return { plays: 0, newFans: 0 };
    const p = await db.execute<any>(sql`
      SELECT COUNT(*) FILTER (WHERE name = 'play_start')::bigint AS plays
      FROM analytics_events
      WHERE name IN ('play_start','play_complete')
        AND payload->>'songId' = ANY(${pgArray(songIds)})
        AND ts >= ${window.from} AND ts < ${window.to}
    `).catch(() => ({ rows: [{ plays: 0 }] }) as any);
    const nf = await db.execute<any>(sql`
      WITH first_play AS (
        SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
        FROM analytics_events
        WHERE name = 'play_start'
          AND payload->>'songId' = ANY(${pgArray(songIds)})
          AND COALESCE(user_id, session_id) IS NOT NULL
        GROUP BY 1
      )
      SELECT COUNT(*)::bigint AS new_fans FROM first_play
      WHERE first_ts >= ${window.from} AND first_ts < ${window.to}
    `).catch(() => ({ rows: [{ new_fans: 0 }] }) as any);
    return {
      plays: Number(((p as any).rows ?? [{}])[0]?.plays ?? 0),
      newFans: Number(((nf as any).rows ?? [{}])[0]?.new_fans ?? 0),
    };
  }
  async function orders(window: RangeWindow) {
    if (!albumIds.length) return 0;
    const row = await db.execute<any>(sql`
      SELECT COUNT(*) FILTER (WHERE status <> 'refunded')::bigint AS n
      FROM orders
      WHERE status IN ('paid','shipped','refunded')
        AND album_id = ANY(${pgArray(albumIds)})
        AND created_at >= ${window.from} AND created_at < ${window.to}
    `).catch(() => ({ rows: [{ n: 0 }] }) as any);
    return Number(((row as any).rows ?? [{}])[0]?.n ?? 0);
  }
  const [pCur, pPrv, oCur, oPrv, stackCur, stackPrv] = await Promise.all([
    plays(r),
    prior ? plays(prior) : Promise.resolve(null),
    orders(r),
    prior ? orders(prior) : Promise.resolve(null),
    salesStack(albumIds, r),
    prior ? salesStack(albumIds, prior) : Promise.resolve(null),
  ]);

  // Task #1632 — live release reporting. The old "Revenue (artist
  // share)" coming-soon tile is replaced by the real units / gross /
  // price-per-unit / net stack, reconciled against paid orders (refunds
  // excluded) and computed off each format's locked SKU cost snapshot.
  const ppuCur = stackCur.units > 0 ? Math.round(stackCur.grossCents / stackCur.units) : null;
  const ppuPrv =
    stackPrv && stackPrv.units > 0 ? Math.round(stackPrv.grossCents / stackPrv.units) : null;

  const kpis: Kpi[] = [
    { id: "units", label: "Units sold", value: stackCur.units, prior: stackPrv?.units ?? null, format: "number" },
    { id: "gross", label: "Gross revenue", value: stackCur.grossCents, prior: stackPrv?.grossCents ?? null, format: "currency" },
    { id: "pricePerUnit", label: "Price / unit", value: ppuCur, prior: ppuPrv, format: "currency" },
    {
      id: "net",
      label: "Net (artist)",
      value: stackCur.netCents,
      prior: stackPrv?.netCents ?? null,
      format: "currency",
      note: "After manufacturing, publishing & fees",
      breakdown: [
        { label: "Gross", value: stackCur.grossCents, format: "currency" },
        { label: "Manufacturing", value: -stackCur.manufacturingCents, format: "currency" },
        { label: "Publishing", value: -stackCur.publishingCents, format: "currency" },
        { label: "Platform fee", value: -stackCur.platformFeeCents, format: "currency" },
        { label: "Stripe fees", value: -stackCur.stripeFeeCents, format: "currency" },
      ],
    },
    { id: "plays", label: "Plays", value: pCur.plays, prior: pPrv?.plays ?? null, format: "number" },
    { id: "newFans", label: "New fans", value: pCur.newFans, prior: pPrv?.newFans ?? null, format: "number" },
    { id: "orders", label: "Orders", value: oCur, prior: oPrv ?? null, format: "number" },
    { id: "completion", label: "Completion %", value: null, format: "percent", comingSoon: true, note: "Play-complete ratio lands with listening insights" },
    { id: "topTrack", label: "Top track", value: null, format: "number", comingSoon: true },
  ];

  const playDaily = songIds.length
    ? await db.execute<any>(sql`
        SELECT date_trunc('day', ts)::date::text AS day,
          COUNT(*) FILTER (WHERE name = 'play_start')::bigint AS plays
        FROM analytics_events
        WHERE name IN ('play_start','play_complete')
          AND payload->>'songId' = ANY(${pgArray(songIds)})
          AND ts >= ${r.from} AND ts < ${r.to}
        GROUP BY 1 ORDER BY 1 ASC
      `).catch(() => ({ rows: [] }) as any)
    : ({ rows: [] } as any);
  const newFansDaily = songIds.length
    ? await db.execute<any>(sql`
        WITH first_play AS (
          SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
          FROM analytics_events
          WHERE name = 'play_start'
            AND payload->>'songId' = ANY(${pgArray(songIds)})
            AND COALESCE(user_id, session_id) IS NOT NULL
          GROUP BY 1
        )
        SELECT date_trunc('day', first_ts)::date::text AS day,
          COUNT(*)::bigint AS new_fans
        FROM first_play
        WHERE first_ts >= ${r.from} AND first_ts < ${r.to}
        GROUP BY 1 ORDER BY 1 ASC
      `).catch(() => ({ rows: [] }) as any)
    : ({ rows: [] } as any);
  const orderDaily = albumIds.length
    ? await db.execute<any>(sql`
        SELECT date_trunc('day', created_at)::date::text AS day,
          COUNT(*) FILTER (WHERE status <> 'refunded')::bigint AS orders
        FROM orders
        WHERE status IN ('paid','shipped','refunded')
          AND album_id = ANY(${pgArray(albumIds)})
          AND created_at >= ${r.from} AND created_at < ${r.to}
        GROUP BY 1 ORDER BY 1 ASC
      `).catch(() => ({ rows: [] }) as any)
    : ({ rows: [] } as any);

  const series = mergeDaily(r, [
    { rows: ((playDaily as any).rows ?? []) as any[], plays: (x: any) => Number(x.plays ?? 0) },
    { rows: ((newFansDaily as any).rows ?? []) as any[], newFans: (x: any) => Number(x.new_fans ?? 0) },
    { rows: ((orderDaily as any).rows ?? []) as any[], orders: (x: any) => Number(x.orders ?? 0) },
  ]);
  const chartMetrics: ChartMetric[] = [
    { id: "plays", label: "Plays", format: "number" },
    { id: "newFans", label: "New fans", format: "number" },
    { id: "orders", label: "Orders", format: "number" },
  ];

  const activity: ActivityItem[] = [];
  if (albumIds.length) {
    const ordersRows = await db.execute<any>(sql`
      SELECT o.id, o.created_at, o.total_cents, a.title AS album_title, a.id AS album_id
      FROM orders o
      JOIN albums a ON a.id = o.album_id
      WHERE o.status IN ('paid','shipped')
        AND o.album_id = ANY(${pgArray(albumIds)})
        AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
      ORDER BY o.created_at DESC LIMIT 10
    `).catch(() => ({ rows: [] }) as any);
    for (const o of ((ordersRows as any).rows ?? []) as any[]) {
      activity.push({
        kind: "order",
        ts: new Date(o.created_at).toISOString(),
        title: `Order — ${o.album_title}`,
        detail: `$${(Number(o.total_cents) / 100).toFixed(2)}`,
        href: `/admin/albums/${o.album_id}`,
      });
    }
  }
  for (const a of albums) {
    const rd = a.good_tunes_release_date;
    if (rd && new Date(rd) >= r.from && new Date(rd) < r.to) {
      activity.push({
        kind: "release",
        ts: new Date(rd).toISOString(),
        title: `Album released — ${a.title}`,
        href: `/admin/albums/${a.id}`,
      });
    }
  }
  activity.sort((x, y) => (y.ts < x.ts ? -1 : 1));

  return { kpis, chartMetrics, series, activity: activity.slice(0, 15) };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function mergeDaily(
  r: RangeWindow,
  groups: Array<{ rows: any[]; [metric: string]: any }>,
): SeriesPoint[] {
  const byDay = new Map<string, SeriesPoint>();
  const ensure = (day: string): SeriesPoint => {
    let p = byDay.get(day);
    if (!p) { p = { date: day }; byDay.set(day, p); }
    return p;
  };
  for (const g of groups) {
    const { rows, ...extractors } = g;
    for (const row of rows) {
      const day = String(row.day);
      const p = ensure(day);
      for (const [metricId, fn] of Object.entries(extractors)) {
        if (typeof fn === "function") p[metricId] = (fn as (x: any) => number)(row);
      }
    }
  }
  return Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ─── Storage-style entrypoint ────────────────────────────────────────

export async function getPartnerDashboard(
  kind: ScopeKind,
  scope: { id: string; name: string; logoUrl: string | null; subKind?: "vendor" | "manufacturer" | "fulfillment" },
  preset: RangePreset,
): Promise<Omit<DashboardPayload, "scope">> {
  const r = rangeFor(preset);
  const prior = priorOf(r);
  const built =
    kind === "label"  ? await buildLabelPayload(scope, r, prior) :
    kind === "npo"    ? await buildNpoPayload(scope, r, prior) :
    kind === "artist" ? await buildArtistPayload(scope, r, prior) :
                        await buildVendorPayload(scope, r, prior, scope.subKind ?? "vendor");
  return {
    range: { preset: r.preset, from: r.from.toISOString(), to: r.to.toISOString() },
    prior: prior ? { from: prior.from.toISOString(), to: prior.to.toISOString() } : null,
    ...built,
  };
}

// ─── Route registration ──────────────────────────────────────────────

export async function registerPartnerDashboardRoutes(app: Express) {
  app.get("/api/partner/:scope/dashboard", async (req: Request, res: Response) => {
    const kindRaw = String(req.params.scope || "").toLowerCase();
    if (kindRaw !== "label" && kindRaw !== "npo" && kindRaw !== "vendor" && kindRaw !== "artist") {
      return res.status(400).json({ message: "Unknown scope" });
    }
    const kind = kindRaw as ScopeKind;
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user?.isAdmin) return res.status(403).json({ message: "Admin only" });

    const resolved = await resolveScope(kind, req);
    if ("error" in resolved) return res.status(resolved.status).json({ message: resolved.error });

    const preset = parsePreset(req.query.range);
    const payload = await getPartnerDashboard(kind, resolved, preset);
    return res.json({
      scope: { kind: resolved.kind, id: resolved.id, name: resolved.name, logoUrl: resolved.logoUrl },
      ...payload,
    });
  });
}
