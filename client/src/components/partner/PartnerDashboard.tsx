// Task #518 — Shared partner Dashboard primitive.
//
// One component used by Label, NPO, and Vendor shells as their leftmost
// "Dashboard" tab. Renders the operator AdminDashboard layout shape
// (header + range picker + KPI row + Trend card + Recent activity)
// but in the light partner-shell chrome already established by
// `dashboard-controls.tsx` so it sits naturally inside the rest of
// each partner shell. Backend: `GET /api/partner/:scope/dashboard`.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUsdCents } from "@shared/money";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Clock } from "lucide-react";
import { RangePicker, DashboardPanel, type RangePreset } from "./dashboard-controls";
import { BRAND, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";

export type PartnerScopeKind = "label" | "npo" | "vendor" | "artist";
export type PartnerRangePreset = "today" | "7d" | "30d" | "90d" | "all";

export const RANGE_PRESETS: ReadonlyArray<RangePreset<PartnerRangePreset>> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

export type KpiFormat = "currency" | "number" | "percent" | "duration";

type KpiBreakdownRow = { label: string; value: number; format: KpiFormat };

export type DashboardKpi = {
  id: string;
  label: string;
  value: number | null;
  prior?: number | null;
  format: KpiFormat;
  note?: string;
  comingSoon?: boolean;
  breakdown?: KpiBreakdownRow[];
};

export type ChartMetric = { id: string; label: string; format: KpiFormat };

export type ActivityItem = {
  kind: string;
  ts: string;
  title: string;
  detail?: string;
  href?: string;
};

export type DashboardPayload = {
  scope: { kind: PartnerScopeKind; id: string; name: string; logoUrl: string | null };
  range: { preset: PartnerRangePreset; from: string; to: string };
  prior: { from: string; to: string } | null;
  kpis: DashboardKpi[];
  chartMetrics: ChartMetric[];
  series: Array<Record<string, number | string>>;
  activity: ActivityItem[];
};

export function formatValue(value: number | null, format: KpiFormat): string {
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

export function PartnerDashboard({
  scope,
  title,
  subtitle,
  scopeIdQs,
  scopeKindQs,
  extraHeader,
}: {
  scope: PartnerScopeKind;
  title: string;
  subtitle?: string;
  /** Optional `?scopeId=…` for super-admin impersonation. */
  scopeIdQs?: string | null;
  /** Optional `?scopeKind=…` (vendor|manufacturer|fulfillment) for vendor-scope super-admin views. */
  scopeKindQs?: "vendor" | "manufacturer" | "fulfillment" | null;
  /** Slot rendered above the range picker (e.g. brand row). */
  extraHeader?: React.ReactNode;
}) {
  const [preset, setPreset] = useState<PartnerRangePreset>("30d");
  const qs = useMemo(() => {
    const u = new URLSearchParams({ range: preset });
    if (scopeIdQs) u.set("scopeId", scopeIdQs);
    if (scopeKindQs) u.set("scopeKind", scopeKindQs);
    return u.toString();
  }, [preset, scopeIdQs, scopeKindQs]);

  const dashUrl = `/api/partner/${scope}/dashboard?${qs}`;
  const { data, isLoading, error } = useQuery<DashboardPayload>({ queryKey: [dashUrl] });

  if (error) {
    const msg = (error as any)?.message || "We couldn't load your dashboard.";
    return (
      <DashboardPanel className="p-6 text-center" padding="none" data-testid={`partner-dashboard-${scope}-error`}>
        <p className="text-slate-600 text-sm">{msg}</p>
      </DashboardPanel>
    );
  }

  return (
    <div className="space-y-6" data-testid={`partner-dashboard-${scope}`}>
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-slate-500 text-[12px] uppercase tracking-wider font-semibold">Dashboard</p>
            <h2 className="text-2xl sm:text-3xl font-bold truncate" data-testid={`heading-partner-dashboard-${scope}`}>
              {title}
            </h2>
            {subtitle && <p className="text-slate-500 text-[13px] mt-0.5">{subtitle}</p>}
          </div>
          <RangePicker
            presets={RANGE_PRESETS}
            value={preset}
            onChange={setPreset}
            testId={`range-picker-${scope}`}
          />
        </div>
        {extraHeader}
      </section>

      <KpiGrid kpis={data?.kpis ?? []} loading={isLoading} scope={scope} />

      <DashboardPanel data-testid={`trend-${scope}`}>
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Trend</h3>
            <p className="text-[11px] text-slate-400">Daily activity over the selected window</p>
          </div>
        </div>
        <TrendChart
          series={data?.series ?? []}
          metrics={data?.chartMetrics ?? []}
          loading={isLoading}
        />
      </DashboardPanel>

      <DashboardPanel data-testid={`activity-${scope}`}>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent activity</h3>
        <ActivityList items={data?.activity ?? []} loading={isLoading} />
      </DashboardPanel>
    </div>
  );
}

// ─── KPI tiles ──────────────────────────────────────────────────────

export function KpiGrid({ kpis, loading, scope }: { kpis: DashboardKpi[]; loading: boolean; scope: PartnerScopeKind }) {
  if (loading && kpis.length === 0) {
    return (
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid={`kpi-grid-${scope}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <DashboardPanel key={i} className="h-[96px] animate-pulse" />
        ))}
      </section>
    );
  }
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid={`kpi-grid-${scope}`}>
      {kpis.map((k) => <KpiTile key={k.id} k={k} scope={scope} />)}
    </section>
  );
}

function KpiTile({ k, scope }: { k: DashboardKpi; scope: PartnerScopeKind }) {
  const testId = `kpi-${scope}-${k.id}`;
  const value = formatValue(k.value, k.format);
  const showDelta = !k.comingSoon && k.value !== null && k.prior !== null && k.prior !== undefined;
  const delta = showDelta ? deltaPct(k.value as number, k.prior as number) : null;
  const positive = showDelta && (k.value as number) >= (k.prior as number);
  return (
    <DashboardPanel
      data-testid={testId}
      className="transition-colors duration-200 hover:ring-slate-300 hover:bg-slate-50"
    >
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{k.label}</p>
      <p
        className={`mt-1 text-2xl sm:text-[28px] font-bold tabular-nums ${k.comingSoon ? "text-slate-400" : ""}`}
        data-testid={`${testId}-value`}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {showDelta ? (
          <>
            <span className="text-slate-500">vs prior</span>
            <span
              className={`px-1.5 py-0.5 rounded-full font-semibold ${
                positive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
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
      {k.breakdown && k.breakdown.length > 0 && !k.comingSoon && (
        <dl
          className="mt-3 space-y-1 border-t border-slate-200 pt-2"
          data-testid={`${testId}-breakdown`}
        >
          {k.breakdown.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <dt className="text-slate-600">{b.label}</dt>
              <dd
                className={`tabular-nums font-medium ${
                  b.value < 0 ? "text-rose-600" : "text-slate-900"
                }`}
              >
                {formatValue(b.value, b.format)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </DashboardPanel>
  );
}

// ─── Trend chart ────────────────────────────────────────────────────

export function TrendChart({
  series,
  metrics,
  loading,
}: {
  series: Array<Record<string, number | string>>;
  metrics: ChartMetric[];
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-[220px] bg-slate-100 rounded-lg animate-pulse" />;
  }
  if (!metrics.length || !series.length) {
    // Render a real (empty) chart frame — grid + axes — rather than a
    // bare "no activity" string, so every role dashboard keeps the same
    // three-section silhouette even before any data lands.
    return (
      <div className="h-[220px] relative" data-testid="trend-empty">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={42} domain={[0, 1]} />
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
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          {metrics.map((m, i) => (
            <Line
              key={m.id}
              type="monotone"
              dataKey={m.id}
              name={m.label}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────

export function ActivityList({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  if (loading) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
        ))}
      </ul>
    );
  }
  if (!items.length) {
    return (
      <p className="text-slate-400 text-[13px] py-2" data-testid="activity-empty">
        Nothing here yet — your latest activity will show up as it comes in.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100" data-testid="activity-list">
      {items.map((it, i) => (
        <li key={i} className="py-2 flex items-center gap-3" data-testid={`activity-item-${i}`}>
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0 flex-1">
            {it.href ? (
              <a href={it.href} className="text-[13px] font-semibold text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline truncate block">
                {it.title}
              </a>
            ) : (
              <p className="text-[13px] font-semibold text-slate-900 truncate">{it.title}</p>
            )}
            {it.detail && <p className="text-[11px] text-slate-500 truncate">{it.detail}</p>}
          </div>
          <time className="text-[11px] text-slate-400 tabular-nums shrink-0">
            {new Date(it.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </time>
        </li>
      ))}
    </ul>
  );
}
