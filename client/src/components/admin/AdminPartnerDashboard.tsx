import { useMemo, useState } from "react";
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

type KpiBreakdownRow = { label: string; value: number; format: KpiFormat };

type DashboardKpi = {
  id: string;
  label: string;
  value: number | null;
  prior?: number | null;
  format: KpiFormat;
  note?: string;
  comingSoon?: boolean;
  breakdown?: KpiBreakdownRow[];
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

      <KpiGrid
        kpis={data?.kpis ?? []}
        loading={isLoading}
        scope={scope}
        ctx={
          data
            ? {
                from: data.range.from.slice(0, 10),
                to: data.range.to.slice(0, 10),
                partnerId: data.scope.id,
                partnerName: data.scope.name,
                reportsKind:
                  data.scope.kind === "label"
                    ? "label"
                    : data.scope.kind === "artist"
                      ? "artist"
                      : data.scope.kind === "npo"
                        ? "non_profit"
                        : null,
              }
            : null
        }
      />

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

// Task #1456 — like the main /admin dashboard, each tile drills into the
// matching detailed report carrying the dashboard's selected date range.
// On the per-partner view we also scope the destination to this partner
// where the target page supports it — only `/admin/reports` reads
// `?asPartner=…` today, so we only wire tiles whose drill-down can be
// scoped (reports tabs). Orders/customers have no partner filter, so
// those tiles stay non-clickable here rather than drilling into a
// misleading global list. Coming-soon tiles never link.
type PartnerLinkCtx = {
  from: string;
  to: string;
  partnerId: string;
  partnerName: string;
  reportsKind: "label" | "artist" | "non_profit" | null;
};

function reportsHref(tab: string, ctx: PartnerLinkCtx): string {
  const p = new URLSearchParams({ tab, from: ctx.from, to: ctx.to });
  if (ctx.partnerId && ctx.reportsKind) {
    p.set("asPartner", ctx.partnerId);
    p.set("asPartnerKind", ctx.reportsKind);
    if (ctx.partnerName) p.set("asPartnerName", ctx.partnerName);
  }
  return `/admin/reports?${p.toString()}`;
}

function partnerKpiHref(
  scope: PartnerScopeKind,
  k: DashboardKpi,
  ctx: PartnerLinkCtx | null,
): string | null {
  if (k.comingSoon || !ctx) return null;
  switch (scope) {
    case "label":
      if (k.id === "gross" || k.id === "orders") return reportsHref("sales", ctx);
      if (k.id === "newFans") return reportsHref("fans", ctx);
      if (k.id === "plays") return reportsHref("plays", ctx);
      return null;
    case "artist":
      if (k.id === "orders") return reportsHref("sales", ctx);
      if (k.id === "newFans") return reportsHref("fans", ctx);
      if (k.id === "plays") return reportsHref("plays", ctx);
      return null;
    case "npo":
      if (k.id === "pending" || k.id === "paid" || k.id === "refArtists")
        return reportsHref("referrals", ctx);
      return null;
    case "vendor":
    default:
      return null;
  }
}

function KpiGrid({
  kpis,
  loading,
  scope,
  ctx,
}: {
  kpis: DashboardKpi[];
  loading: boolean;
  scope: PartnerScopeKind;
  ctx: PartnerLinkCtx | null;
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
        <KpiTile key={k.id} k={k} scope={scope} href={partnerKpiHref(scope, k, ctx)} />
      ))}
    </section>
  );
}

function KpiTile({
  k,
  scope,
  href,
}: {
  k: DashboardKpi;
  scope: PartnerScopeKind;
  href: string | null;
}) {
  const testId = `kpi-${scope}-${k.id}`;
  const value = formatValue(k.value, k.format);
  const showDelta =
    !k.comingSoon && k.value !== null && k.prior !== null && k.prior !== undefined;
  const delta = showDelta ? deltaPct(k.value as number, k.prior as number) : null;
  const positive = showDelta && (k.value as number) >= (k.prior as number);
  const card = (
    <Card
      data-testid={testId}
      className="transition-shadow duration-200 hover:shadow-md hover:border-slate-300"
    >
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
          {k.label}
          {href && (
            <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-[color:var(--brand-blue)] transition-colors" />
          )}
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
        {k.breakdown && k.breakdown.length > 0 && !k.comingSoon && (
          <dl
            className="mt-3 space-y-1 border-t border-slate-100 pt-2"
            data-testid={`${testId}-breakdown`}
          >
            {k.breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <dt className="text-slate-500">{b.label}</dt>
                <dd
                  className={cn(
                    "tabular-nums font-medium",
                    b.value < 0 ? "text-rose-600" : "text-slate-700",
                  )}
                >
                  {formatValue(b.value, b.format)}
                </dd>
              </div>
            ))}
          </dl>
        )}
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
        Nothing here yet — your latest activity will show up as it comes in.
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
