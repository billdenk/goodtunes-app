// Task #518 — Shared partner Dashboard primitive.
//
// One component used by Label, NPO, and Vendor shells as their leftmost
// "Dashboard" tab. Renders the operator AdminDashboard layout shape
// (header + range picker + KPI row + Trend card + Recent activity)
// but in the dark partner-shell chrome already established by
// `dashboard-controls.tsx` so it sits naturally inside the rest of
// each partner shell. Backend: `GET /api/partner/:scope/dashboard`.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Clock } from "lucide-react";
import { RangePicker, DashboardPanel, type RangePreset } from "./dashboard-controls";
import { BRAND, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";

export type PartnerScopeKind = "label" | "npo" | "vendor";
export type PartnerRangePreset = "today" | "7d" | "30d" | "90d" | "all";

const RANGE_PRESETS: ReadonlyArray<RangePreset<PartnerRangePreset>> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

type KpiFormat = "currency" | "number" | "percent" | "duration";

type DashboardKpi = {
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

type DashboardPayload = {
  scope: { kind: PartnerScopeKind; id: string; name: string; logoUrl: string | null };
  range: { preset: PartnerRangePreset; from: string; to: string };
  prior: { from: string; to: string } | null;
  kpis: DashboardKpi[];
  chartMetrics: ChartMetric[];
  series: Array<Record<string, number | string>>;
  activity: ActivityItem[];
};

function formatValue(value: number | null, format: KpiFormat): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "currency": {
      const dollars = value / 100;
      return dollars >= 10_000
        ? `$${Math.round(dollars).toLocaleString()}`
        : `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
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
        <p className="text-white/70 text-sm">{msg}</p>
      </DashboardPanel>
    );
  }

  return (
    <div className="space-y-6" data-testid={`partner-dashboard-${scope}`}>
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/55 text-[12px] uppercase tracking-wider font-semibold">Dashboard</p>
            <h2 className="text-2xl sm:text-3xl font-bold truncate" data-testid={`heading-partner-dashboard-${scope}`}>
              {title}
            </h2>
            {subtitle && <p className="text-white/55 text-[13px] mt-0.5">{subtitle}</p>}
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
            <h3 className="text-sm font-semibold text-white/85">Trend</h3>
            <p className="text-[11px] text-white/45">Daily activity over the selected window</p>
          </div>
        </div>
        <TrendChart
          series={data?.series ?? []}
          metrics={data?.chartMetrics ?? []}
          loading={isLoading}
        />
      </DashboardPanel>

      <DashboardPanel data-testid={`activity-${scope}`}>
        <h3 className="text-sm font-semibold text-white/85 mb-3">Recent activity</h3>
        <ActivityList items={data?.activity ?? []} loading={isLoading} />
      </DashboardPanel>
    </div>
  );
}

// ─── KPI tiles ──────────────────────────────────────────────────────

function KpiGrid({ kpis, loading, scope }: { kpis: DashboardKpi[]; loading: boolean; scope: PartnerScopeKind }) {
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
    <DashboardPanel data-testid={testId}>
      <p className="text-[11px] uppercase tracking-wider text-white/55 font-semibold">{k.label}</p>
      <p
        className={`mt-1 text-2xl sm:text-[28px] font-bold tabular-nums ${k.comingSoon ? "text-white/40" : ""}`}
        data-testid={`${testId}-value`}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {k.comingSoon ? (
          <span className="px-1.5 py-0.5 rounded-full font-semibold bg-white/5 text-white/55" data-testid={`${testId}-coming-soon`}>
            Coming soon
          </span>
        ) : showDelta ? (
          <>
            <span className="text-white/55">vs prior</span>
            <span
              className={`px-1.5 py-0.5 rounded-full font-semibold ${
                positive
                  ? "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)]"
                  : "bg-rose-500/15 text-rose-300"
              }`}
              data-testid={`${testId}-delta`}
            >
              {delta}
            </span>
          </>
        ) : (
          <span className="text-white/45">vs prior: —</span>
        )}
        {k.note && !k.comingSoon && (
          <span className="text-white/45 truncate">{k.note}</span>
        )}
      </div>
    </DashboardPanel>
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
  if (loading) {
    return <div className="h-[220px] bg-white/[0.02] rounded-lg animate-pulse" />;
  }
  if (!metrics.length || !series.length) {
    return (
      <div className="h-[220px] flex items-center justify-center text-white/45 text-[12px]" data-testid="trend-empty">
        No activity in this window yet.
      </div>
    );
  }
  const colors = [BRAND.blue, BRAND.mint, BRAND.purple, BRAND.pink];
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
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

function ActivityList({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  if (loading) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="h-10 bg-white/[0.03] rounded animate-pulse" />
        ))}
      </ul>
    );
  }
  if (!items.length) {
    return (
      <p className="text-white/45 text-[13px] py-2" data-testid="activity-empty">
        No recent activity in this window.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-white/5" data-testid="activity-list">
      {items.map((it, i) => (
        <li key={i} className="py-2 flex items-center gap-3" data-testid={`activity-item-${i}`}>
          <Clock className="w-3.5 h-3.5 text-white/40 shrink-0" />
          <div className="min-w-0 flex-1">
            {it.href ? (
              <a href={it.href} className="text-[13px] font-semibold text-white hover:text-[color:var(--brand-blue)] hover:underline truncate block">
                {it.title}
              </a>
            ) : (
              <p className="text-[13px] font-semibold text-white truncate">{it.title}</p>
            )}
            {it.detail && <p className="text-[11px] text-white/55 truncate">{it.detail}</p>}
          </div>
          <time className="text-[11px] text-white/45 tabular-nums shrink-0">
            {new Date(it.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </time>
        </li>
      ))}
    </ul>
  );
}
