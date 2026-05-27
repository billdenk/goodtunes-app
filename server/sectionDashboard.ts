// Task #602 — "God-View" section-level admin dashboards.
//
// Single endpoint `GET /api/admin/section/:section/dashboard?range=…`
// powering the rollup dashboards pinned above the six partner list
// pages in admin (Labels / NPOs / Presses / Makers / Resellers /
// Fulfillment). Returns the same `DashboardPayload` shape the per-
// entity `AdminPartnerDashboard` already consumes so the section
// dashboard and per-entity dashboard render identical chrome.
//
// Aggregation strategy mirrors the per-entity builders in
// `server/partnerDashboard.ts` — wraps/fans-out the same SQL across
// every non-soft-deleted entity in the section rather than reinventing
// metrics. Sections that don't track a metric yet (Makers gear GMV,
// Fulfillment late shipments, …) return `{ value: null, comingSoon:
// true }` per spec instead of inventing data.
//
// Admin-only. Soft-delete (`deleted_at IS NULL`) respected on every
// partner table so deleted entities don't bleed back into the rollup.

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";

type Section =
  | "labels"
  | "npos"
  | "presses"
  | "makers"
  | "resellers"
  | "fulfillment";

const SECTIONS: Section[] = [
  "labels",
  "npos",
  "presses",
  "makers",
  "resellers",
  "fulfillment",
];

type RangePreset = "today" | "7d" | "30d" | "90d" | "all";
type RangeWindow = { from: Date; to: Date; preset: RangePreset };
const PRESETS: RangePreset[] = ["today", "7d", "30d", "90d", "all"];

type KpiFormat = "currency" | "number" | "percent" | "duration";
type Kpi = {
  id: string;
  label: string;
  value: number | null;
  prior?: number | null;
  format: KpiFormat;
  note?: string;
  comingSoon?: boolean;
};
type ChartMetric = { id: string; label: string; format: KpiFormat };
type SeriesPoint = { date: string; [metric: string]: number | string };
type ActivityItem = {
  kind: string;
  ts: string;
  title: string;
  detail?: string;
  href?: string;
};

type SectionPayload = {
  section: Section;
  range: { preset: RangePreset; from: string; to: string };
  prior: { from: string; to: string } | null;
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
};

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
  return {
    from: new Date(r.from.getTime() - len),
    to: new Date(r.from),
    preset: r.preset,
  };
}

function mergeDaily(
  groups: Array<{ rows: any[]; [metric: string]: any }>,
): SeriesPoint[] {
  const byDay = new Map<string, SeriesPoint>();
  const ensure = (day: string): SeriesPoint => {
    let p = byDay.get(day);
    if (!p) {
      p = { date: day };
      byDay.set(day, p);
    }
    return p;
  };
  for (const g of groups) {
    const { rows, ...extractors } = g;
    for (const row of rows) {
      const day = String(row.day);
      const p = ensure(day);
      for (const [metricId, fn] of Object.entries(extractors)) {
        if (typeof fn === "function")
          p[metricId] = (fn as (x: any) => number)(row);
      }
    }
  }
  return Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

const rows = <T = any>(r: any): T[] => ((r as any)?.rows ?? []) as T[];

// ─── Labels rollup ───────────────────────────────────────────────────

async function buildLabelsRollup(
  r: RangeWindow,
  prior: RangeWindow | null,
): Promise<{
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
}> {
  // All non-deleted labels — albums attributed to any of them roll up.
  // `albums.label_id IS NOT NULL` plus a join to filter out soft-deleted
  // labels matches the per-entity scope semantics.
  async function rev(w: RangeWindow) {
    const row = await db.execute<any>(sql`
      SELECT
        COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS gross,
        COUNT(*) FILTER (WHERE o.status <> 'refunded')::bigint AS orders
      FROM orders o
      JOIN albums a ON a.id = o.album_id
      JOIN labels l ON l.id = a.label_id AND l.deleted_at IS NULL
      WHERE o.status IN ('paid','shipped','refunded')
        AND o.created_at >= ${w.from} AND o.created_at < ${w.to}
    `).catch(() => ({ rows: [] }) as any);
    const x = rows(row)[0] ?? {};
    return { gross: Number(x.gross ?? 0), orders: Number(x.orders ?? 0) };
  }
  async function plays(w: RangeWindow) {
    const p = await db.execute<any>(sql`
      WITH label_songs AS (
        SELECT s.id
        FROM songs s
        JOIN albums a ON a.id = s.album_id
        JOIN labels l ON l.id = a.label_id AND l.deleted_at IS NULL
      )
      SELECT COUNT(*) FILTER (WHERE name = 'play_start')::bigint AS plays
      FROM analytics_events
      WHERE name IN ('play_start','play_complete')
        AND payload->>'songId' IN (SELECT id FROM label_songs)
        AND ts >= ${w.from} AND ts < ${w.to}
    `).catch(() => ({ rows: [{ plays: 0 }] }) as any);
    const nf = await db.execute<any>(sql`
      WITH label_songs AS (
        SELECT s.id
        FROM songs s
        JOIN albums a ON a.id = s.album_id
        JOIN labels l ON l.id = a.label_id AND l.deleted_at IS NULL
      ),
      first_play AS (
        SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
        FROM analytics_events
        WHERE name = 'play_start'
          AND payload->>'songId' IN (SELECT id FROM label_songs)
          AND COALESCE(user_id, session_id) IS NOT NULL
        GROUP BY 1
      )
      SELECT COUNT(*)::bigint AS new_fans FROM first_play
      WHERE first_ts >= ${w.from} AND first_ts < ${w.to}
    `).catch(() => ({ rows: [{ new_fans: 0 }] }) as any);
    return {
      plays: Number(rows(p)[0]?.plays ?? 0),
      newFans: Number(rows(nf)[0]?.new_fans ?? 0),
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
    { id: "net", label: "Net revenue", value: null, format: "currency", comingSoon: true, note: "Lands with payout-split columns" },
    { id: "orders", label: "Orders", value: cur.orders, prior: prv?.orders ?? null, format: "number" },
    { id: "newFans", label: "New fans", value: curP.newFans, prior: prvP?.newFans ?? null, format: "number" },
    { id: "plays", label: "Plays", value: curP.plays, prior: prvP?.plays ?? null, format: "number" },
  ];

  const revDaily = await db.execute<any>(sql`
    SELECT date_trunc('day', o.created_at)::date::text AS day,
      COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS revenue,
      COUNT(*) FILTER (WHERE o.status <> 'refunded')::bigint AS orders
    FROM orders o
    JOIN albums a ON a.id = o.album_id
    JOIN labels l ON l.id = a.label_id AND l.deleted_at IS NULL
    WHERE o.status IN ('paid','shipped','refunded')
      AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
    GROUP BY 1 ORDER BY 1 ASC
  `).catch(() => ({ rows: [] }) as any);
  const playDaily = await db.execute<any>(sql`
    WITH label_songs AS (
      SELECT s.id FROM songs s
      JOIN albums a ON a.id = s.album_id
      JOIN labels l ON l.id = a.label_id AND l.deleted_at IS NULL
    )
    SELECT date_trunc('day', ts)::date::text AS day,
      COUNT(*) FILTER (WHERE name = 'play_start')::bigint AS plays
    FROM analytics_events
    WHERE name IN ('play_start','play_complete')
      AND payload->>'songId' IN (SELECT id FROM label_songs)
      AND ts >= ${r.from} AND ts < ${r.to}
    GROUP BY 1 ORDER BY 1 ASC
  `).catch(() => ({ rows: [] }) as any);
  const newFansDaily = await db.execute<any>(sql`
    WITH label_songs AS (
      SELECT s.id FROM songs s
      JOIN albums a ON a.id = s.album_id
      JOIN labels l ON l.id = a.label_id AND l.deleted_at IS NULL
    ),
    first_play AS (
      SELECT COALESCE(user_id, session_id) AS listener, MIN(ts) AS first_ts
      FROM analytics_events
      WHERE name = 'play_start'
        AND payload->>'songId' IN (SELECT id FROM label_songs)
        AND COALESCE(user_id, session_id) IS NOT NULL
      GROUP BY 1
    )
    SELECT date_trunc('day', first_ts)::date::text AS day,
      COUNT(*)::bigint AS new_fans
    FROM first_play
    WHERE first_ts >= ${r.from} AND first_ts < ${r.to}
    GROUP BY 1 ORDER BY 1 ASC
  `).catch(() => ({ rows: [] }) as any);

  const series = mergeDaily([
    { rows: rows(revDaily), gross: (x: any) => Number(x.revenue ?? 0), orders: (x: any) => Number(x.orders ?? 0) },
    { rows: rows(playDaily), plays: (x: any) => Number(x.plays ?? 0) },
    { rows: rows(newFansDaily), newFans: (x: any) => Number(x.new_fans ?? 0) },
  ]);

  const chartMetrics: ChartMetric[] = [
    { id: "gross", label: "Gross", format: "currency" },
    { id: "orders", label: "Orders", format: "number" },
    { id: "plays", label: "Plays", format: "number" },
    { id: "newFans", label: "New fans", format: "number" },
  ];

  const activity: ActivityItem[] = [];
  const orderRows = await db.execute<any>(sql`
    SELECT o.id, o.created_at, o.total_cents, a.title AS album_title,
      l.id AS label_id, l.name AS label_name
    FROM orders o
    JOIN albums a ON a.id = o.album_id
    JOIN labels l ON l.id = a.label_id AND l.deleted_at IS NULL
    WHERE o.status IN ('paid','shipped')
      AND o.created_at >= ${r.from} AND o.created_at < ${r.to}
    ORDER BY o.created_at DESC LIMIT 15
  `).catch(() => ({ rows: [] }) as any);
  for (const o of rows(orderRows)) {
    activity.push({
      kind: "order",
      ts: new Date(o.created_at).toISOString(),
      title: `${o.label_name} — order`,
      detail: `${o.album_title} · $${(Number(o.total_cents) / 100).toFixed(2)}`,
      href: `/admin/labels/${o.label_id}`,
    });
  }

  return { kpis, chartMetrics, series, activity: activity.slice(0, 15) };
}

// ─── NPOs rollup ─────────────────────────────────────────────────────

async function buildNposRollup(
  r: RangeWindow,
  prior: RangeWindow | null,
): Promise<{
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
}> {
  async function credits(w: RangeWindow | null) {
    if (!w) return null;
    const row = await db.execute<any>(sql`
      SELECT
        COALESCE(SUM(rc.amount_cents) FILTER (
          WHERE rc.status = 'pending_payout'
            AND rc.created_at >= ${w.from} AND rc.created_at < ${w.to}
        ), 0)::bigint AS pending_cents,
        COALESCE(SUM(rc.amount_cents) FILTER (
          WHERE rc.status = 'paid' AND rc.paid_at IS NOT NULL
            AND rc.paid_at >= ${w.from} AND rc.paid_at < ${w.to}
        ), 0)::bigint AS paid_cents,
        COUNT(DISTINCT rc.referrer_org_id) FILTER (
          WHERE rc.created_at >= ${w.from} AND rc.created_at < ${w.to}
        )::bigint AS active_npos
      FROM referral_credits rc
      JOIN organizations o ON o.id = rc.referrer_org_id AND o.kind = 'non_profit'
    `).catch(() => ({ rows: [{ pending_cents: 0, paid_cents: 0, active_npos: 0 }] }) as any);
    const x = rows(row)[0] ?? {};
    return {
      pending: Number(x.pending_cents ?? 0),
      paid: Number(x.paid_cents ?? 0),
      activeNpos: Number(x.active_npos ?? 0),
    };
  }
  const [cCur, cPrv] = await Promise.all([credits(r), credits(prior)]);
  const t = cCur ?? { pending: 0, paid: 0, activeNpos: 0 };

  async function refCount(w: RangeWindow | null) {
    if (!w) return null;
    const row = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM people p
      JOIN organizations o ON o.id = p.referred_by_org_id AND o.kind = 'non_profit'
      WHERE COALESCE(p.created_at, NOW()) >= ${w.from}
        AND COALESCE(p.created_at, NOW()) < ${w.to}
    `).catch(() => ({ rows: [{ n: 0 }] }) as any);
    return Number(rows(row)[0]?.n ?? 0);
  }
  const [refCur, refPrv] = await Promise.all([refCount(r), refCount(prior)]);

  const kpis: Kpi[] = [
    { id: "pending", label: "Pending payout", value: t.pending, prior: cPrv?.pending ?? null, format: "currency" },
    { id: "paid", label: "Paid out", value: t.paid, prior: cPrv?.paid ?? null, format: "currency" },
    { id: "donors", label: "Active NPOs", value: t.activeNpos, prior: cPrv?.activeNpos ?? null, format: "number" },
    { id: "refArtists", label: "Referred artists", value: refCur ?? 0, prior: refPrv ?? null, format: "number" },
    { id: "copies", label: "GoodDeed copies", value: null, format: "number", comingSoon: true, note: "Lands with GoodDeed per-copy attribution" },
  ];

  const accrual = await db.execute<any>(sql`
    SELECT date_trunc('day', rc.created_at)::date::text AS day,
      COALESCE(SUM(rc.amount_cents), 0)::bigint AS amount
    FROM referral_credits rc
    JOIN organizations o ON o.id = rc.referrer_org_id AND o.kind = 'non_profit'
    WHERE rc.created_at >= ${r.from} AND rc.created_at < ${r.to}
    GROUP BY 1 ORDER BY 1 ASC
  `).catch(() => ({ rows: [] }) as any);
  const series = mergeDaily([
    { rows: rows(accrual), pending: (x: any) => Number(x.amount ?? 0) },
  ]);
  const chartMetrics: ChartMetric[] = [
    { id: "pending", label: "Payout accrual", format: "currency" },
  ];

  const activity: ActivityItem[] = [];
  const payouts = await db.execute<any>(sql`
    SELECT rc.id, rc.amount_cents, rc.status, COALESCE(rc.paid_at, rc.created_at) AS ts,
      o.id AS org_id, o.name AS org_name
    FROM referral_credits rc
    JOIN organizations o ON o.id = rc.referrer_org_id AND o.kind = 'non_profit'
    WHERE COALESCE(rc.paid_at, rc.created_at) >= ${r.from}
      AND COALESCE(rc.paid_at, rc.created_at) < ${r.to}
    ORDER BY ts DESC LIMIT 15
  `).catch(() => ({ rows: [] }) as any);
  for (const p of rows(payouts)) {
    activity.push({
      kind: p.status === "paid" ? "payout" : "credit",
      ts: new Date(p.ts).toISOString(),
      title: p.status === "paid" ? `Payout sent — ${p.org_name}` : `Credit accrued — ${p.org_name}`,
      detail: `$${(Number(p.amount_cents) / 100).toFixed(2)}`,
      href: `/admin/non-profits/${p.org_id}`,
    });
  }

  return { kpis, chartMetrics, series, activity: activity.slice(0, 15) };
}

// ─── Presses rollup ──────────────────────────────────────────────────

async function buildPressesRollup(
  r: RangeWindow,
  prior: RangeWindow | null,
): Promise<{
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
}> {
  // pressing_orders may not be present in every env; wrap each query in
  // try/catch so the dashboard still renders Coming-soon tiles instead
  // of 500'ing the section page.
  let open: number | null = null;
  let inProd: number | null = null;
  let completed: number | null = null;
  let completedPrev: number | null = null;
  try {
    const o = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM pressing_orders
      WHERE status NOT IN ('completed','cancelled','rejected')
    `);
    open = Number(rows(o)[0]?.n ?? 0);
    const ip = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM pressing_orders
      WHERE status = 'in_production'
    `).catch(() => ({ rows: [{ n: 0 }] }) as any);
    inProd = Number(rows(ip)[0]?.n ?? 0);
    const c = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM pressing_orders
      WHERE status = 'completed'
        AND COALESCE(updated_at, created_at) >= ${r.from}
        AND COALESCE(updated_at, created_at) < ${r.to}
    `);
    completed = Number(rows(c)[0]?.n ?? 0);
    if (prior) {
      const cp = await db.execute<any>(sql`
        SELECT COUNT(*)::bigint AS n FROM pressing_orders
        WHERE status = 'completed'
          AND COALESCE(updated_at, created_at) >= ${prior.from}
          AND COALESCE(updated_at, created_at) < ${prior.to}
      `);
      completedPrev = Number(rows(cp)[0]?.n ?? 0);
    }
  } catch {
    open = inProd = completed = completedPrev = null;
  }

  const kpis: Kpi[] = [
    open === null
      ? { id: "open", label: "Open jobs", value: null, format: "number", comingSoon: true }
      : { id: "open", label: "Open jobs", value: open, format: "number" },
    inProd === null
      ? { id: "inProd", label: "In production", value: null, format: "number", comingSoon: true }
      : { id: "inProd", label: "In production", value: inProd, format: "number" },
    completed === null
      ? { id: "completed", label: "Completed", value: null, format: "number", comingSoon: true }
      : { id: "completed", label: "Completed", value: completed, prior: completedPrev, format: "number" },
    { id: "units", label: "Units pressed", value: null, format: "number", comingSoon: true, note: "Lands with per-run unit-count rollup" },
    { id: "turn", label: "Avg turn-time", value: null, format: "duration", comingSoon: true },
  ];

  let series: SeriesPoint[] = [];
  const chartMetrics: ChartMetric[] = [
    { id: "completed", label: "Completed per day", format: "number" },
  ];
  try {
    const daily = await db.execute<any>(sql`
      SELECT date_trunc('day', COALESCE(updated_at, created_at))::date::text AS day,
        COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed,
        COUNT(*) FILTER (WHERE status NOT IN ('cancelled','rejected'))::bigint AS opened
      FROM pressing_orders
      WHERE COALESCE(updated_at, created_at) >= ${r.from}
        AND COALESCE(updated_at, created_at) < ${r.to}
      GROUP BY 1 ORDER BY 1 ASC
    `);
    series = mergeDaily([
      { rows: rows(daily), completed: (x: any) => Number(x.completed ?? 0), opened: (x: any) => Number(x.opened ?? 0) },
    ]);
  } catch {
    series = [];
  }

  const activity: ActivityItem[] = [];
  try {
    const jobs = await db.execute<any>(sql`
      SELECT po.id, po.status, COALESCE(po.updated_at, po.created_at) AS ts,
        m.id AS press_id, m.name AS press_name
      FROM pressing_orders po
      LEFT JOIN manufacturers m ON m.id = po.manufacturer_id AND m.deleted_at IS NULL
      WHERE COALESCE(po.updated_at, po.created_at) >= ${r.from}
        AND COALESCE(po.updated_at, po.created_at) < ${r.to}
      ORDER BY ts DESC LIMIT 15
    `).catch(() => ({ rows: [] }) as any);
    for (const j of rows(jobs)) {
      activity.push({
        kind: "job",
        ts: new Date(j.ts).toISOString(),
        title: `Job ${j.status} — ${j.press_name ?? "—"}`,
        detail: `#${String(j.id).slice(0, 8)}`,
        href: j.press_id ? `/admin/manufacturers/${j.press_id}` : undefined,
      });
    }
  } catch {
    /* no pressing_orders in this env */
  }

  return { kpis, chartMetrics, series, activity };
}

// ─── Makers rollup ───────────────────────────────────────────────────

async function buildMakersRollup(
  _r: RangeWindow,
  _prior: RangeWindow | null,
): Promise<{
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
}> {
  // Active makers (is_maker = true, not soft-deleted) + gear SKUs.
  // Gear orders/GMV aren't tracked end-to-end yet — coming-soon per
  // spec rather than inventing data.
  let activeMakers: number | null = null;
  let gearSkus: number | null = null;
  try {
    const m = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM vendors
      WHERE is_maker = true AND deleted_at IS NULL
    `);
    activeMakers = Number(rows(m)[0]?.n ?? 0);
    const g = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM instruments i
      JOIN vendors v ON v.id = i.maker_vendor_id AND v.is_maker = true AND v.deleted_at IS NULL
      WHERE i.deleted_at IS NULL
    `).catch(() => ({ rows: [{ n: 0 }] }) as any);
    gearSkus = Number(rows(g)[0]?.n ?? 0);
  } catch {
    activeMakers = gearSkus = null;
  }

  const kpis: Kpi[] = [
    activeMakers === null
      ? { id: "active", label: "Active makers", value: null, format: "number", comingSoon: true }
      : { id: "active", label: "Active makers", value: activeMakers, format: "number" },
    gearSkus === null
      ? { id: "skus", label: "Gear SKUs", value: null, format: "number", comingSoon: true }
      : { id: "skus", label: "Gear SKUs", value: gearSkus, format: "number" },
    { id: "orders", label: "Gear orders", value: null, format: "number", comingSoon: true, note: "Lands with gear-storefront orders pipeline" },
    { id: "gmv", label: "Gear GMV", value: null, format: "currency", comingSoon: true, note: "Lands with gear-storefront orders pipeline" },
    { id: "newGear", label: "New gear added", value: null, format: "number", comingSoon: true, note: "Lands with instruments.created_at backfill" },
  ];

  return {
    kpis,
    chartMetrics: [{ id: "gmv", label: "Gear GMV", format: "currency" }],
    series: [],
    activity: [],
  };
}

// ─── Resellers rollup ────────────────────────────────────────────────

async function buildResellersRollup(
  _r: RangeWindow,
  _prior: RangeWindow | null,
): Promise<{
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
}> {
  let activeResellers: number | null = null;
  let listings: number | null = null;
  try {
    const r1 = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM vendors
      WHERE is_reseller = true AND deleted_at IS NULL
    `);
    activeResellers = Number(rows(r1)[0]?.n ?? 0);
    const l = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM instrument_vendors iv
      JOIN vendors v ON v.id = iv.vendor_id AND v.is_reseller = true AND v.deleted_at IS NULL
      JOIN instruments i ON i.id = iv.instrument_id AND i.deleted_at IS NULL
      WHERE iv.is_hidden = false
    `).catch(() => ({ rows: [{ n: 0 }] }) as any);
    listings = Number(rows(l)[0]?.n ?? 0);
  } catch {
    activeResellers = listings = null;
  }

  const kpis: Kpi[] = [
    activeResellers === null
      ? { id: "active", label: "Active resellers", value: null, format: "number", comingSoon: true }
      : { id: "active", label: "Active resellers", value: activeResellers, format: "number" },
    listings === null
      ? { id: "listings", label: "Live listings", value: null, format: "number", comingSoon: true }
      : { id: "listings", label: "Live listings", value: listings, format: "number" },
    { id: "referrals", label: "Vendor referrals", value: null, format: "number", comingSoon: true, note: "Lands with reseller click-tracking" },
    { id: "orders", label: "Attributed orders", value: null, format: "number", comingSoon: true, note: "Lands with reseller attribution pipeline" },
    { id: "gmv", label: "Attributed GMV", value: null, format: "currency", comingSoon: true, note: "Lands with reseller attribution pipeline" },
  ];

  return {
    kpis,
    chartMetrics: [{ id: "gmv", label: "Attributed GMV", format: "currency" }],
    series: [],
    activity: [],
  };
}

// ─── Fulfillment rollup ──────────────────────────────────────────────

async function buildFulfillmentRollup(
  r: RangeWindow,
  prior: RangeWindow | null,
): Promise<{
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: SeriesPoint[];
  activity: ActivityItem[];
}> {
  // Per-partner shipment attribution isn't on `orders` directly today
  // — we know an order shipped, not who shipped it. Compute platform-
  // wide ship volume in window so the section dashboard isn't fully
  // blank, and mark per-partner attribution + late shipments as
  // coming-soon per spec.
  let activePartners: number | null = null;
  let shipped: number | null = null;
  let shippedPrior: number | null = null;
  let open: number | null = null;
  try {
    const ap = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM fulfillment_partners WHERE deleted_at IS NULL
    `);
    activePartners = Number(rows(ap)[0]?.n ?? 0);
    const s = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM orders
      WHERE shipped_at IS NOT NULL
        AND shipped_at >= ${r.from} AND shipped_at < ${r.to}
    `);
    shipped = Number(rows(s)[0]?.n ?? 0);
    if (prior) {
      const sp = await db.execute<any>(sql`
        SELECT COUNT(*)::bigint AS n FROM orders
        WHERE shipped_at IS NOT NULL
          AND shipped_at >= ${prior.from} AND shipped_at < ${prior.to}
      `);
      shippedPrior = Number(rows(sp)[0]?.n ?? 0);
    }
    const o = await db.execute<any>(sql`
      SELECT COUNT(*)::bigint AS n FROM orders
      WHERE status = 'paid' AND shipped_at IS NULL
    `);
    open = Number(rows(o)[0]?.n ?? 0);
  } catch {
    activePartners = shipped = shippedPrior = open = null;
  }

  const kpis: Kpi[] = [
    activePartners === null
      ? { id: "partners", label: "Active partners", value: null, format: "number", comingSoon: true }
      : { id: "partners", label: "Active partners", value: activePartners, format: "number" },
    open === null
      ? { id: "open", label: "Open shipments", value: null, format: "number", comingSoon: true }
      : { id: "open", label: "Open shipments", value: open, format: "number" },
    shipped === null
      ? { id: "shipped", label: "Shipped", value: null, format: "number", comingSoon: true }
      : { id: "shipped", label: "Shipped", value: shipped, prior: shippedPrior, format: "number" },
    { id: "avgTime", label: "Avg fulfillment time", value: null, format: "duration", comingSoon: true, note: "Lands with per-partner attribution" },
    { id: "late", label: "Late shipments", value: null, format: "number", comingSoon: true, note: "Lands with SLA tracking" },
  ];

  let series: SeriesPoint[] = [];
  try {
    const daily = await db.execute<any>(sql`
      SELECT date_trunc('day', shipped_at)::date::text AS day,
        COUNT(*)::bigint AS shipped
      FROM orders
      WHERE shipped_at IS NOT NULL
        AND shipped_at >= ${r.from} AND shipped_at < ${r.to}
      GROUP BY 1 ORDER BY 1 ASC
    `);
    series = mergeDaily([
      { rows: rows(daily), shipped: (x: any) => Number(x.shipped ?? 0) },
    ]);
  } catch {
    series = [];
  }

  const activity: ActivityItem[] = [];
  try {
    const recent = await db.execute<any>(sql`
      SELECT o.id, o.shipped_at, o.total_cents, a.title AS album_title
      FROM orders o
      LEFT JOIN albums a ON a.id = o.album_id
      WHERE o.shipped_at IS NOT NULL
        AND o.shipped_at >= ${r.from} AND o.shipped_at < ${r.to}
      ORDER BY o.shipped_at DESC LIMIT 15
    `);
    for (const o of rows(recent)) {
      // No per-partner attribution on `orders` yet (see follow-up #606),
      // so we can't link this row at a specific fulfillment partner.
      // Omit the href rather than misdirect into the album page.
      activity.push({
        kind: "shipped",
        ts: new Date(o.shipped_at).toISOString(),
        title: `Shipped — ${o.album_title ?? "Order"}`,
        detail: `$${(Number(o.total_cents) / 100).toFixed(2)}`,
      });
    }
  } catch {
    /* no orders table in this env */
  }

  return {
    kpis,
    chartMetrics: [{ id: "shipped", label: "Shipped per day", format: "number" }],
    series,
    activity,
  };
}

// ─── Dispatch + route ────────────────────────────────────────────────

async function buildSection(
  section: Section,
  r: RangeWindow,
  prior: RangeWindow | null,
) {
  switch (section) {
    case "labels":
      return buildLabelsRollup(r, prior);
    case "npos":
      return buildNposRollup(r, prior);
    case "presses":
      return buildPressesRollup(r, prior);
    case "makers":
      return buildMakersRollup(r, prior);
    case "resellers":
      return buildResellersRollup(r, prior);
    case "fulfillment":
      return buildFulfillmentRollup(r, prior);
  }
}

export async function registerSectionDashboardRoutes(app: Express) {
  app.get(
    "/api/admin/section/:section/dashboard",
    async (req: Request, res: Response) => {
      const raw = String(req.params.section || "").toLowerCase();
      if (!SECTIONS.includes(raw as Section)) {
        return res.status(400).json({ message: "Unknown section" });
      }
      const section = raw as Section;
      const userId = (req as any).session?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(userId);
      if (!user?.isAdmin)
        return res.status(403).json({ message: "Admin only" });

      const preset = parsePreset(req.query.range);
      const r = rangeFor(preset);
      const prior = priorOf(r);
      const built = await buildSection(section, r, prior);
      const payload: SectionPayload = {
        section,
        range: {
          preset: r.preset,
          from: r.from.toISOString(),
          to: r.to.toISOString(),
        },
        prior: prior
          ? { from: prior.from.toISOString(), to: prior.to.toISOString() }
          : null,
        ...built,
      };
      return res.json(payload);
    },
  );
}
