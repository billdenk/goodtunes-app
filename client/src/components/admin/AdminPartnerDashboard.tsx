import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND } from "@/lib/brand-tokens";
import { cn } from "@/lib/utils";

export type PartnerScopeKind = "label" | "npo" | "vendor" | "artist";
export type PartnerRangePreset = "today" | "7d" | "30d" | "90d" | "all";

const RANGE_PRESETS: ReadonlyArray<{ id: PartnerRangePreset; label: string }> = [
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

const LIGHT_TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid rgb(226, 232, 240)",
  borderRadius: 6,
  fontSize: 12,
  color: "rgb(15, 23, 42)",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
} as const;

export function AdminPartnerDashboard({
  scope,
  title,
  subtitle,
  scopeIdQs,
  scopeKindQs,
}: {
  scope: PartnerScopeKind;
  title: string;
  subtitle?: string;
  scopeIdQs?: string | null;
  scopeKindQs?: "vendor" | "manufacturer" | "fulfillment" | null;
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
    const msg = (error as any)?.message || "We couldn't load this dashboard.";
    return (
      <Card data-testid={`partner-dashboard-${scope}-error`}>
        <CardContent className="p-6 text-center">
          <p className="text-slate-500 text-sm">{msg}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid={`partner-dashboard-${scope}`}>
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">
            Dashboard
          </p>
          <h2
            className="text-xl sm:text-2xl font-semibold text-slate-900 truncate"
            data-testid={`heading-partner-dashboard-${scope}`}
          >
            {title}
          </h2>
          {subtitle && <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>}
        </div>
        <RangePicker value={preset} onChange={setPreset} testId={`range-picker-${scope}`} />
      </section>

      <KpiGrid kpis={data?.kpis ?? []} loading={isLoading} scope={scope} />

      <Card data-testid={`trend-${scope}`}>
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

      <Card data-testid={`activity-${scope}`}>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent activity</h3>
          <ActivityList items={data?.activity ?? []} loading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Range picker (admin slate-100 segmented control) ───────────────

function RangePicker({
  value,
  onChange,
  testId,
}: {
  value: PartnerRangePreset;
  onChange: (next: PartnerRangePreset) => void;
  testId: string;
}) {
  return (
    <div
      className="inline-flex items-center bg-slate-100 rounded-md p-0.5"
      role="group"
      aria-label="Date range"
      data-testid={testId}
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
            data-testid={`button-range-${p.id}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI tiles ──────────────────────────────────────────────────────

function KpiGrid({
  kpis,
  loading,
  scope,
}: {
  kpis: DashboardKpi[];
  loading: boolean;
  scope: PartnerScopeKind;
}) {
  if (loading && kpis.length === 0) {
    return (
      <section
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
        data-testid={`kpi-grid-${scope}`}
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
      data-testid={`kpi-grid-${scope}`}
    >
      {kpis.map((k) => (
        <KpiTile key={k.id} k={k} scope={scope} />
      ))}
    </section>
  );
}

function KpiTile({ k, scope }: { k: DashboardKpi; scope: PartnerScopeKind }) {
  const testId = `kpi-${scope}-${k.id}`;
  const value = formatValue(k.value, k.format);
  const showDelta =
    !k.comingSoon && k.value !== null && k.prior !== null && k.prior !== undefined;
  const delta = showDelta ? deltaPct(k.value as number, k.prior as number) : null;
  const positive = showDelta && (k.value as number) >= (k.prior as number);
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
          {k.label}
        </p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums text-slate-900",
            k.comingSoon && "text-slate-400",
          )}
          data-testid={`${testId}-value`}
        >
          {value}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {k.comingSoon ? (
            <span
              className="px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600"
              data-testid={`${testId}-coming-soon`}
            >
              Coming soon
            </span>
          ) : showDelta ? (
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
    return <div className="h-[220px] bg-slate-50 rounded-lg animate-pulse" />;
  }
  if (!metrics.length || !series.length) {
    return (
      <div
        className="h-[220px] flex items-center justify-center text-slate-400 text-xs"
        data-testid="trend-empty"
      >
        No activity in this window yet.
      </div>
    );
  }
  const colors = [BRAND.blue, BRAND.mint, BRAND.purple, BRAND.pink];
  return (
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
          <li key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
        ))}
      </ul>
    );
  }
  if (!items.length) {
    return (
      <p className="text-slate-400 text-sm py-2" data-testid="activity-empty">
        No recent activity in this window.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100" data-testid="activity-list">
      {items.map((it, i) => (
        <li
          key={i}
          className="py-2 flex items-center gap-3"
          data-testid={`activity-item-${i}`}
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
