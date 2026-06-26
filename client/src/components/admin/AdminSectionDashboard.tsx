// Task #602 — "God-View" section-level dashboard pinned above each
// of the six partner list pages (Labels, NPOs, Presses, Makers,
// Resellers, Fulfillment).
//
// Visually mirrors the per-entity `AdminPartnerDashboard` chrome —
// same range picker, KPI grid, Trend card, Recent activity — so a
// future tweak to one updates the other in spirit. We don't share the
// JSX with AdminPartnerDashboard yet to keep the per-entity dashboard
// untouched per task scope; both components stay visually identical.
//
// Talks to GET /api/admin/section/:section/dashboard?range=… (see
// server/sectionDashboard.ts), which returns the same DashboardPayload
// shape minus `scope`. Range persists per section via localStorage
// under `admin-section-dashboard:<section>:range`, mirroring the main
// /admin dashboard's `admin-dashboard:range` pattern.

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatUsdCents } from "@shared/money";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { ArrowUpRight, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND } from "@/lib/brand-tokens";
import { cn } from "@/lib/utils";

export type SectionKind =
  | "labels"
  | "npos"
  | "presses"
  | "makers"
  | "resellers"
  | "fulfillment";

type RangePreset = "today" | "7d" | "30d" | "90d" | "all";

const RANGE_PRESETS: ReadonlyArray<{ id: RangePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

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

type ActivityItem = {
  kind: string;
  ts: string;
  title: string;
  detail?: string;
  href?: string;
};

type Payload = {
  section: SectionKind;
  range: { preset: RangePreset; from: string; to: string };
  prior: { from: string; to: string } | null;
  kpis: Kpi[];
  chartMetrics: ChartMetric[];
  series: Array<Record<string, number | string>>;
  activity: ActivityItem[];
};

const LIGHT_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid rgb(226, 232, 240)",
  borderRadius: 6,
  fontSize: 12,
  color: "rgb(15, 23, 42)",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
} as const;

function formatValue(value: number | null, format: KpiFormat): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "currency":
      return value >= 1_000_000
        ? formatUsdCents(value, { maximumFractionDigits: 0 })
        : formatUsdCents(value);
    case "percent":
      return `${Math.round(value * 100)}%`;
    case "duration":
      return `${value}h`;
    case "number":
    default:
      return value >= 10_000
        ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`
        : value.toLocaleString();
  }
}

function deltaPct(cur: number, prior: number): string {
  if (prior === 0) return cur > 0 ? "+∞" : "—";
  const pct = ((cur - prior) / prior) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function lsKey(section: SectionKind) {
  return `admin-section-dashboard:${section}:range`;
}

const SECTION_TITLES: Record<SectionKind, { title: string; subtitle: string }> = {
  labels: {
    title: "Labels — rollup",
    subtitle: "All non-deleted labels combined.",
  },
  npos: {
    title: "NPOs — rollup",
    subtitle: "All non-profit partners combined.",
  },
  presses: {
    title: "Presses — rollup",
    subtitle: "All pressing plants combined.",
  },
  makers: {
    title: "Makers — rollup",
    subtitle: "All gear builders combined.",
  },
  resellers: {
    title: "Resellers — rollup",
    subtitle: "All gear shops combined.",
  },
  fulfillment: {
    title: "Fulfillment — rollup",
    subtitle: "All fulfillment partners combined.",
  },
};

export function AdminSectionDashboard({ section }: { section: SectionKind }) {
  const [preset, setPreset] = useState<RangePreset>(() => {
    if (typeof window === "undefined") return "30d";
    try {
      const saved = localStorage.getItem(lsKey(section)) as RangePreset | null;
      if (saved && (RANGE_PRESETS.some((p) => p.id === saved))) return saved;
    } catch {}
    return "30d";
  });
  useEffect(() => {
    try {
      localStorage.setItem(lsKey(section), preset);
    } catch {}
  }, [preset, section]);

  const dashUrl = `/api/admin/section/${section}/dashboard?range=${preset}`;
  const { data, isLoading, error } = useQuery<Payload>({ queryKey: [dashUrl] });

  const meta = SECTION_TITLES[section];

  if (error) {
    const msg = (error as any)?.message || "We couldn't load this dashboard.";
    return (
      <Card data-testid={`section-dashboard-${section}-error`}>
        <CardContent className="p-6 text-center">
          <p className="text-slate-500 text-sm">{msg}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-testid={`section-dashboard-${section}`}>
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">
            God-view dashboard
          </p>
          <h2
            className="text-lg sm:text-xl font-semibold text-slate-900 truncate"
            data-testid={`heading-section-dashboard-${section}`}
          >
            {meta.title}
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">{meta.subtitle}</p>
        </div>
        <RangePicker value={preset} onChange={setPreset} section={section} />
      </section>

      <KpiGrid
        kpis={data?.kpis ?? []}
        loading={isLoading}
        section={section}
        range={
          data
            ? { from: data.range.from.slice(0, 10), to: data.range.to.slice(0, 10) }
            : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card data-testid={`section-trend-${section}`} className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Trend</h3>
                <p className="text-xs text-slate-500">
                  Daily activity over the selected window
                </p>
              </div>
            </div>
            <TrendChart
              series={data?.series ?? []}
              metrics={data?.chartMetrics ?? []}
              loading={isLoading}
            />
          </CardContent>
        </Card>

        <Card data-testid={`section-activity-${section}`}>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Recent activity
            </h3>
            <ActivityList items={data?.activity ?? []} loading={isLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Range picker (admin slate-100 segmented control) ───────────────

function RangePicker({
  value,
  onChange,
  section,
}: {
  value: RangePreset;
  onChange: (next: RangePreset) => void;
  section: SectionKind;
}) {
  return (
    <div
      className="inline-flex items-center bg-slate-100 rounded-md p-0.5"
      role="group"
      aria-label="Date range"
      data-testid={`section-range-picker-${section}`}
    >
      {RANGE_PRESETS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={active}
            className={cn(
              "h-8 px-3 inline-flex items-center justify-center rounded text-xs font-semibold transition-colors",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900",
            )}
            data-testid={`button-section-range-${section}-${p.id}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI tiles ──────────────────────────────────────────────────────

// Task #1456 — mirror the main /admin dashboard: each tile drills into
// the matching detailed list/report with the dashboard's selected date
// range carried through. These rollups are global, so destinations are
// the same global pages the main dashboard uses. Tiles whose only
// "destination" would be the very list page the dashboard is pinned to
// (e.g. Active makers → the makers list), and coming-soon tiles, stay
// non-clickable. /admin/pressing-orders ignores query params, so press
// job tiles link there without a date range.
function sectionKpiHref(
  section: SectionKind,
  k: Kpi,
  from: string,
  to: string,
): string | null {
  if (k.comingSoon) return null;
  const dateQs = `from=${from}&to=${to}`;
  switch (section) {
    case "labels":
      if (k.id === "gross") return `/admin/reports?tab=sales&${dateQs}`;
      if (k.id === "orders") return `/admin/orders?${dateQs}`;
      if (k.id === "newFans") return `/admin/customers?${dateQs}`;
      if (k.id === "plays") return `/admin/reports?tab=plays&${dateQs}`;
      return null;
    case "npos":
      if (k.id === "pending" || k.id === "paid" || k.id === "refArtists")
        return `/admin/reports?tab=referrals&${dateQs}`;
      return null;
    case "presses":
      if (k.id === "open" || k.id === "inProd" || k.id === "completed")
        return `/admin/pressing-orders`;
      return null;
    default:
      return null;
  }
}

function KpiGrid({
  kpis,
  loading,
  section,
  range,
}: {
  kpis: Kpi[];
  loading: boolean;
  section: SectionKind;
  range: { from: string; to: string } | null;
}) {
  if (loading && kpis.length === 0) {
    return (
      <section
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
        data-testid={`section-kpi-grid-${section}`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 h-[96px] animate-pulse" />
          </Card>
        ))}
      </section>
    );
  }
  return (
    <section
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      data-testid={`section-kpi-grid-${section}`}
    >
      {kpis.map((k) => (
        <KpiTile
          key={k.id}
          k={k}
          section={section}
          href={range ? sectionKpiHref(section, k, range.from, range.to) : null}
        />
      ))}
    </section>
  );
}

function KpiTile({
  k,
  section,
  href,
}: {
  k: Kpi;
  section: SectionKind;
  href: string | null;
}) {
  const testId = `section-kpi-${section}-${k.id}`;
  const value = formatValue(k.value, k.format);
  const showDelta =
    !k.comingSoon && k.value !== null && k.prior !== null && k.prior !== undefined;
  const delta = showDelta ? deltaPct(k.value as number, k.prior as number) : null;
  const positive = showDelta && (k.value as number) >= (k.prior as number);
  const card = (
    <Card
      data-testid={testId}
      className={cn(
        href && "transition-shadow duration-200 hover:shadow-md hover:border-slate-300",
      )}
    >
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
          {k.label}
          {href && (
            <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-[color:var(--brand-blue)] transition-colors" />
          )}
        </p>
        <p
          className={cn(
            "mt-1 text-[22px] font-semibold tabular-nums text-slate-900",
            k.comingSoon && "text-slate-400",
          )}
          data-testid={`${testId}-value`}
        >
          {value}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {showDelta ? (
            <>
              <span className="text-slate-500">vs prior</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full font-semibold",
                  positive
                    ? "bg-[color:var(--brand-mint)]/20 text-emerald-700"
                    : "bg-rose-100 text-rose-700",
                )}
                data-testid={`${testId}-delta`}
              >
                {delta}
              </span>
            </>
          ) : (
            <span className="text-slate-400">vs prior: —</span>
          )}
          {k.note && !k.comingSoon && (
            <span className="text-slate-400 truncate">{k.note}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
  if (!href) return card;
  return (
    <Link href={href} className="group block cursor-pointer" data-testid={`${testId}-link`}>
      {card}
    </Link>
  );
}

// ─── Trend chart ────────────────────────────────────────────────────

function TrendChart({
  series,
  metrics,
  loading,
}: {
  series: Array<Record<string, number | string>>;
  metrics: ChartMetric[];
  loading: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => {
    if (!metrics.length) return null;
    return metrics.find((m) => m.id === activeId) ?? metrics[0];
  }, [metrics, activeId]);

  if (loading) {
    return <div className="h-[220px] bg-slate-50 rounded-lg animate-pulse" />;
  }
  if (!metrics.length || !series.length) {
    // Render a real (empty) chart frame — grid + axes — rather than a
    // bare "no activity" string, so every role dashboard keeps the same
    // three-section silhouette even before any data lands.
    return (
      <div className="h-[220px] relative" data-testid="section-trend-empty">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "rgb(100, 116, 139)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "rgb(100, 116, 139)", fontSize: 11 }} axisLine={false} tickLine={false} width={42} domain={[0, 1]} />
          </LineChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-slate-400 text-xs">No activity in this window yet.</span>
        </div>
      </div>
    );
  }
  const colors = [BRAND.blue, BRAND.mint, BRAND.purple, BRAND.pink];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 flex-wrap" role="tablist">
        {metrics.map((m, i) => {
          const isActive = active?.id === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveId(m.id)}
              aria-pressed={isActive}
              className={cn(
                "h-7 px-2.5 rounded text-xs font-semibold transition-colors",
                isActive
                  ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
              )}
              data-testid={`button-section-trend-tab-${m.id}`}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                style={{ background: colors[i % colors.length] }}
              />
              {m.label}
            </button>
          );
        })}
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgb(100, 116, 139)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgb(100, 116, 139)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip contentStyle={LIGHT_TOOLTIP_STYLE} />
            {active && (
              <Line
                type="monotone"
                dataKey={active.id}
                name={active.label}
                stroke={
                  colors[
                    Math.max(0, metrics.findIndex((m) => m.id === active.id)) %
                      colors.length
                  ]
                }
                strokeWidth={2}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────

function ActivityList({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  if (loading) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
        ))}
      </ul>
    );
  }
  if (!items.length) {
    return (
      <p
        className="text-slate-400 text-sm py-2"
        data-testid="section-activity-empty"
      >
        No recent activity in this window.
      </p>
    );
  }
  return (
    <ul
      className="divide-y divide-slate-100"
      data-testid="section-activity-list"
    >
      {items.map((it, i) => (
        <li
          key={i}
          className="py-2 flex items-center gap-3"
          data-testid={`section-activity-item-${i}`}
        >
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0 flex-1">
            {it.href ? (
              <a
                href={it.href}
                className="text-sm font-semibold text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 truncate block transition-colors"
              >
                {it.title}
              </a>
            ) : (
              <p className="text-sm font-semibold text-slate-900 truncate">
                {it.title}
              </p>
            )}
            {it.detail && (
              <p className="text-xs text-slate-500 truncate">{it.detail}</p>
            )}
          </div>
          <time className="text-xs text-slate-400 tabular-nums shrink-0">
            {new Date(it.ts).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </time>
        </li>
      ))}
    </ul>
  );
}
