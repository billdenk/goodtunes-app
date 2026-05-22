import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  ShoppingBag,
  UserPlus,
  Banknote,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

/**
 * Task #140 — Stripe-style admin dashboard. Lives at /admin and
 * /admin/dashboard, replaces the old Albums redirect. All data is
 * wired to existing admin-stats endpoints (no new server pipelines):
 *   • /api/admin/reports/kpis  — KPIs + daily series (current + prior)
 *   • /api/admin/reports/ops   — ops health strip
 *   • /api/admin/orders        — recent activity (orders + payouts)
 *   • /api/admin/customers     — recent activity (new fans)
 */

const BLUE = "#319ED8";
const MINT = "#4AFFCA";
const PURPLE = "#7F10A7";
const PINK = "#FF5470";

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";
const RANGE_LS_KEY = "admin-dashboard:range";

function rangeBounds(key: RangeKey): { from: Date; to: Date } {
  const to = new Date();
  let from: Date;
  if (key === "today") {
    from = new Date(to);
    from.setUTCHours(0, 0, 0, 0);
  } else if (key === "7d") {
    from = new Date(to.getTime() - 6 * 86400_000);
  } else if (key === "30d") {
    from = new Date(to.getTime() - 29 * 86400_000);
  } else if (key === "90d") {
    from = new Date(to.getTime() - 89 * 86400_000);
  } else {
    // "All" — anchor to GoodTunes' first full year. Anything earlier
    // predates the catalog so the bound is effectively unconstrained.
    from = new Date(Date.UTC(2024, 0, 1));
  }
  return { from, to };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtUsd(cents: number): string {
  if (Math.abs(cents) >= 100_000_00) {
    return `$${(cents / 100_000).toFixed(1)}k`;
  }
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtRel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

interface KpisData {
  gmvCents: number;
  netCents: number;
  orderCount: number;
  newSignups: number;
  plays: number;
  series: Array<{ date: string; gmvCents: number; orders: number; signups: number; plays: number }>;
  prior?: {
    from?: string;
    to?: string;
    gmvCents?: number;
    netCents?: number;
    orderCount?: number;
    newSignups?: number;
    plays?: number;
  };
}

interface OpsData {
  stuckFulfillments: { count: number };
  failedCheckouts: { last24hCount: number; last7dCount: number };
  stuckPayoutCount: number;
}

interface OrderRow {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string | null;
  shippedAt: string | null;
  payoutStatus: string | null;
  payoutAmountCents: number | null;
  payoutTransferredAt?: string | null;
  albumTitle: string;
  albumArtist: string;
  customerName: string | null;
  customerEmail: string;
  customerId: string;
}

interface CustomerRow {
  id: string;
  displayName: string | null;
  username: string | null;
  realName: string | null;
  email: string;
  createdAt: string | null;
}

interface CustomersResp {
  rows: CustomerRow[];
  total: number;
}

export function AdminDashboard() {
  const [range, setRange] = useState<RangeKey>(() => {
    if (typeof window === "undefined") return "30d";
    try {
      const saved = localStorage.getItem(RANGE_LS_KEY) as RangeKey | null;
      if (saved && ["today", "7d", "30d", "90d", "all"].includes(saved)) return saved;
    } catch {}
    return "30d";
  });
  useEffect(() => {
    try {
      localStorage.setItem(RANGE_LS_KEY, range);
    } catch {}
  }, [range]);

  const { from, to } = useMemo(() => rangeBounds(range), [range]);
  const windowMs = to.getTime() - from.getTime();
  const priorTo = new Date(from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - windowMs);

  const qs = useMemo(
    () => `from=${isoDay(from)}&to=${isoDay(to)}`,
    [from, to],
  );
  const priorQs = useMemo(
    () => `from=${isoDay(priorFrom)}&to=${isoDay(priorTo)}`,
    [priorFrom, priorTo],
  );

  const { data: kpis, isLoading: kpisLoading } = useQuery<KpisData>({
    queryKey: ["/api/admin/reports/kpis", qs],
    queryFn: () =>
      fetch(`/api/admin/reports/kpis?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });

  // Second fetch for the prior-period daily series. The KPIs endpoint
  // already includes prior totals in `data.prior`, but not the prior
  // daily series — so for the comparison line on the primary chart we
  // re-query the same endpoint over the prior window.
  const { data: priorKpis } = useQuery<KpisData>({
    queryKey: ["/api/admin/reports/kpis", priorQs],
    queryFn: () =>
      fetch(`/api/admin/reports/kpis?${priorQs}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: ops } = useQuery<OpsData>({
    queryKey: ["/api/admin/reports/ops", qs],
    queryFn: () =>
      fetch(`/api/admin/reports/ops?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: recentOrders } = useQuery<OrderRow[]>({
    queryKey: ["/api/admin/orders"],
  });

  const { data: recentCustomers } = useQuery<CustomersResp>({
    queryKey: ["/api/admin/customers"],
  });

  return (
    <AdminFrame active="dashboard">
      <div className="space-y-5">
        <AdminPageHeader
          title="Dashboard"
          subtitle="How GoodTunes is doing right now."
          testId="heading-admin-dashboard"
          actions={<RangeSwitcher value={range} onChange={setRange} />}
        />

        {ops && <OpsHealthStrip ops={ops} />}

        <KpiGrid kpis={kpis} loading={kpisLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <PrimaryChart kpis={kpis} prior={priorKpis} loading={kpisLoading} />
          </div>
          <div>
            <ActivityFeed orders={recentOrders ?? []} customers={recentCustomers?.rows ?? []} />
          </div>
        </div>
      </div>
    </AdminFrame>
  );
}

// ─── Range switcher ────────────────────────────────────────────────────

function RangeSwitcher({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const opts: Array<{ v: RangeKey; label: string }> = [
    { v: "today", label: "Today" },
    { v: "7d", label: "7d" },
    { v: "30d", label: "30d" },
    { v: "90d", label: "90d" },
    { v: "all", label: "All" },
  ];
  return (
    <div
      className="inline-flex items-center bg-slate-100 rounded-md p-0.5"
      data-testid="dashboard-range-switcher"
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={active}
            data-testid={`button-range-${o.v}`}
            className={[
              "px-3 h-8 text-[12.5px] font-semibold rounded transition-colors",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI tiles ─────────────────────────────────────────────────────────

function KpiGrid({ kpis, loading }: { kpis?: KpisData; loading: boolean }) {
  const prior = kpis?.prior ?? {};
  const series = kpis?.series ?? [];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="dashboard-kpi-grid">
      <KpiTile
        label="Gross sales"
        value={kpis ? fmtUsd(kpis.gmvCents) : "—"}
        prior={prior.gmvCents}
        current={kpis?.gmvCents}
        format={fmtUsd}
        spark={series.map((s) => s.gmvCents)}
        color={BLUE}
        loading={loading}
        testId="tile-gmv"
      />
      <KpiTile
        label="Net revenue"
        value={kpis ? fmtUsd(kpis.netCents) : "—"}
        prior={prior.netCents}
        current={kpis?.netCents}
        format={fmtUsd}
        spark={null}
        color={MINT}
        loading={loading}
        testId="tile-net"
      />
      <KpiTile
        label="Orders"
        value={kpis ? fmtNum(kpis.orderCount) : "—"}
        prior={prior.orderCount}
        current={kpis?.orderCount}
        format={fmtNum}
        spark={series.map((s) => s.orders)}
        color={PURPLE}
        loading={loading}
        testId="tile-orders"
      />
      <KpiTile
        label="New fans"
        value={kpis ? fmtNum(kpis.newSignups) : "—"}
        prior={prior.newSignups}
        current={kpis?.newSignups}
        format={fmtNum}
        spark={series.map((s) => s.signups)}
        color={PINK}
        loading={loading}
        testId="tile-signups"
      />
      <KpiTile
        label="Plays"
        value={kpis ? fmtNum(kpis.plays ?? 0) : "—"}
        prior={prior.plays}
        current={kpis?.plays}
        format={fmtNum}
        spark={series.map((s) => s.plays ?? 0)}
        color={BLUE}
        loading={loading}
        testId="tile-plays"
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  prior,
  current,
  format,
  spark,
  color,
  loading,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  prior?: number;
  current?: number;
  format: (n: number) => string;
  spark: number[] | null;
  color: string;
  loading: boolean;
  testId: string;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between min-h-[120px]"
      data-testid={testId}
    >
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          {label}
        </div>
        <div className="text-[22px] font-semibold text-slate-900 mt-1 tabular-nums">
          {loading ? <span className="text-slate-300">—</span> : value}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 mt-2">
        <Delta current={current} prior={prior} format={format} />
        {spark && spark.length > 1 && <Sparkline points={spark} color={color} />}
      </div>
    </div>
  );
}

function Delta({
  current,
  prior,
  format,
}: {
  current?: number;
  prior?: number;
  format: (n: number) => string;
}) {
  if (current === undefined || prior === undefined) {
    return <span className="text-[11px] text-slate-400">vs prior: —</span>;
  }
  if (prior === 0 && current === 0) {
    return <span className="text-[11px] text-slate-400">vs prior: —</span>;
  }
  const delta = current - prior;
  const pct = prior === 0 ? null : delta / prior;
  const up = delta > 0;
  const down = delta < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = up
    ? "text-emerald-600"
    : down
      ? "text-rose-600"
      : "text-slate-400";
  const pctStr = pct === null ? "n/a" : `${up ? "+" : ""}${(pct * 100).toFixed(1)}%`;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${tone}`}
      title={`Prior period: ${format(prior)}`}
    >
      <Icon className="w-3 h-3" />
      {pctStr}
    </span>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const W = 80;
  const H = 28;
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const step = W / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = H - ((p - min) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const fillPath = `${path} L${W},${H} L0,${H} Z`;
  return (
    <svg width={W} height={H} className="flex-shrink-0" aria-hidden="true">
      <path d={fillPath} fill={color} fillOpacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

// ─── Ops health strip ──────────────────────────────────────────────────

function OpsHealthStrip({ ops }: { ops: OpsData }) {
  const items: Array<{ label: string; count: number; href: string; testId: string }> = [];
  if (ops.stuckFulfillments.count > 0) {
    items.push({
      label: `${ops.stuckFulfillments.count} stuck fulfillment${ops.stuckFulfillments.count === 1 ? "" : "s"}`,
      count: ops.stuckFulfillments.count,
      href: "/admin/orders",
      testId: "ops-chip-stuck-fulfillments",
    });
  }
  const failed = ops.failedCheckouts.last24hCount ?? 0;
  if (failed > 0) {
    items.push({
      label: `${failed} failed checkout${failed === 1 ? "" : "s"} · 24h`,
      count: failed,
      href: "/admin/reports",
      testId: "ops-chip-failed-checkouts",
    });
  }
  if (ops.stuckPayoutCount > 0) {
    items.push({
      label: `${ops.stuckPayoutCount} stuck payout${ops.stuckPayoutCount === 1 ? "" : "s"}`,
      count: ops.stuckPayoutCount,
      href: "/admin/reports",
      testId: "ops-chip-stuck-payouts",
    });
  }
  if (items.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
      data-testid="ops-health-strip"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className="text-[12px] font-semibold text-amber-900 mr-1">Needs attention</span>
      {items.map((it) => (
        <Link
          key={it.testId}
          href={it.href}
          data-testid={it.testId}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-amber-300 text-[12px] font-medium text-amber-900 hover:bg-amber-100 transition-colors"
        >
          {it.label}
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      ))}
    </div>
  );
}

// ─── Primary chart ─────────────────────────────────────────────────────

type ChartMetric = "gmv" | "orders" | "signups" | "plays";

function PrimaryChart({
  kpis,
  prior,
  loading,
}: {
  kpis?: KpisData;
  prior?: KpisData;
  loading: boolean;
}) {
  const [metric, setMetric] = useState<ChartMetric>("gmv");
  const series = kpis?.series ?? [];
  const priorSeries = prior?.series ?? [];

  // Align prior series by day-offset so it can be drawn alongside the
  // current series in the same chart.
  const merged = useMemo(() => {
    return series.map((s, i) => {
      const p = priorSeries[i];
      const key = metric === "gmv" ? "gmvCents" : metric === "orders" ? "orders" : metric === "signups" ? "signups" : "plays";
      return {
        date: s.date,
        current: (s as any)[key] as number,
        prior: p ? ((p as any)[key] as number) : null,
      };
    });
  }, [series, priorSeries, metric]);

  const isCurrency = metric === "gmv";
  const opts: Array<{ v: ChartMetric; label: string }> = [
    { v: "gmv", label: "GMV" },
    { v: "orders", label: "Orders" },
    { v: "signups", label: "New fans" },
    { v: "plays", label: "Plays" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="dashboard-primary-chart">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Trend</h3>
        <div className="inline-flex items-center bg-slate-100 rounded-md p-0.5">
          {opts.map((o) => {
            const active = metric === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setMetric(o.v)}
                aria-pressed={active}
                data-testid={`button-chart-metric-${o.v}`}
                className={[
                  "px-2.5 h-7 text-[12px] font-semibold rounded transition-colors",
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
                ].join(" ")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">
          Loading…
        </div>
      ) : merged.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">
          No activity in this range yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={merged} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)}
            />
            <Tooltip
              formatter={(v: number) => (isCurrency ? fmtUsd(v) : v.toLocaleString())}
              labelStyle={{ color: "#0f172a" }}
            />
            <Line
              type="monotone"
              dataKey="prior"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              name="Prior period"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke={BLUE}
              strokeWidth={2}
              dot={false}
              name="This period"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Activity feed ─────────────────────────────────────────────────────

interface FeedItem {
  kind: "order" | "signup" | "payout";
  ts: Date;
  title: string;
  detail: string;
  href: string;
}

function ActivityFeed({ orders, customers }: { orders: OrderRow[]; customers: CustomerRow[] }) {
  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    for (const o of orders) {
      if (o.status === "paid" || o.status === "shipped") {
        const ts = o.createdAt ? new Date(o.createdAt) : null;
        if (ts) {
          out.push({
            kind: "order",
            ts,
            title: `${o.customerName || o.customerEmail} bought ${o.albumTitle}`,
            detail: `${o.albumArtist} · ${fmtUsd(o.totalCents)}`,
            href: "/admin/orders",
          });
        }
      }
      if (o.payoutStatus === "transferred" && o.payoutTransferredAt && o.payoutAmountCents) {
        out.push({
          kind: "payout",
          ts: new Date(o.payoutTransferredAt),
          title: `Payout sent · ${fmtUsd(o.payoutAmountCents)}`,
          detail: `${o.albumArtist} — ${o.albumTitle}`,
          href: "/admin/reports",
        });
      }
    }
    for (const c of customers) {
      if (!c.createdAt) continue;
      out.push({
        kind: "signup",
        ts: new Date(c.createdAt),
        title: `${c.displayName || c.username || c.realName || c.email} joined`,
        detail: c.email,
        href: `/admin/customers/${c.id}`,
      });
    }
    out.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    return out.slice(0, 20);
  }, [orders, customers]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 h-full" data-testid="dashboard-activity-feed">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent activity</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">Nothing yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} data-testid={`activity-${it.kind}-${i}`}>
              <Link
                href={it.href}
                className="flex items-start gap-2.5 -mx-2 px-2 py-1.5 rounded-md hover:bg-slate-50 transition-colors"
              >
                <ActivityIcon kind={it.kind} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-900 font-medium truncate">{it.title}</div>
                  <div className="text-[11.5px] text-slate-500 truncate">{it.detail}</div>
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums flex-shrink-0 pt-0.5">
                  {fmtRel(it.ts)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityIcon({ kind }: { kind: FeedItem["kind"] }) {
  const map = {
    order: { Icon: ShoppingBag, bg: "bg-[#319ED8]/10", color: "text-[#319ED8]" },
    signup: { Icon: UserPlus, bg: "bg-[#FF5470]/10", color: "text-[#FF5470]" },
    payout: { Icon: Banknote, bg: "bg-[#4AFFCA]/20", color: "text-emerald-600" },
  }[kind];
  const Icon = map.Icon;
  return (
    <span className={`w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0 ${map.bg}`}>
      <Icon className={`w-3.5 h-3.5 ${map.color}`} />
    </span>
  );
}
