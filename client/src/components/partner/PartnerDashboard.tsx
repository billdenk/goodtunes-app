// Task #518 — Shared partner Dashboard primitive.
//
// One component used by Label, NPO, and Vendor shells as their leftmost
// "Dashboard" tab. Renders the operator AdminDashboard layout shape
// (header + range picker + KPI row + Trend card + Recent activity)
// but in the light partner-shell chrome already established by
// `dashboard-controls.tsx` so it sits naturally inside the rest of
// each partner shell. Backend: `GET /api/partner/:scope/dashboard`.

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUsdCents } from "@shared/money";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Clock } from "lucide-react";
import { RangePicker, DashboardPanel, type RangePreset } from "./dashboard-controls";
import { BRAND, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";
import { KpiCard, sparkFromSeries } from "@/components/admin/KpiCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

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

export function PartnerDashboard({
  scope,
  title,
  subtitle,
  sectionTitle,
  scopeIdQs,
  scopeKindQs,
  extraHeader,
  hideTitle,
}: {
  scope: PartnerScopeKind;
  title: string;
  subtitle?: ReactNode;
  /** When set, the header renders in the super-admin section-title treatment
   * — a single bold H1 (`sectionTitle`) with the range picker inline on the
   * right and a bottom hairline — instead of the "Dashboard" eyebrow + entity
   * name. The artist shell passes "Dashboard" here so this tab matches the
   * clean section headers on its other tabs; `title` (the entity name) stays
   * available for the rail. Label/NPO/Vendor omit it → unchanged. */
  sectionTitle?: ReactNode;
  /** Optional `?scopeId=…` for super-admin impersonation. */
  scopeIdQs?: string | null;
  /** Optional `?scopeKind=…` (vendor|manufacturer|fulfillment) for vendor-scope super-admin views. */
  scopeKindQs?: "vendor" | "manufacturer" | "fulfillment" | null;
  /** Slot rendered above the range picker (e.g. brand row). */
  extraHeader?: React.ReactNode;
  /** When true, suppresses every title/eyebrow — use when the portal shell
   * header already shows the org name and a heading would be redundant. */
  hideTitle?: boolean;
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
        {hideTitle ? (
          /* Shell already shows org name — just range picker + optional subtitle */
          <div className="flex flex-wrap items-center justify-between gap-3">
            {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
            <RangePicker
              presets={RANGE_PRESETS}
              value={preset}
              onChange={setPreset}
              testId={`range-picker-${scope}`}
            />
          </div>
        ) : sectionTitle ? (
          /* Section-title header (artist Dashboard tab): the canonical
             super-admin AdminPageHeader treatment so this tab matches the
             clean section headers the shell draws on every other artist tab. */
          <AdminPageHeader
            title={sectionTitle}
            subtitle={subtitle}
            actions={
              <RangePicker
                presets={RANGE_PRESETS}
                value={preset}
                onChange={setPreset}
                testId={`range-picker-${scope}`}
              />
            }
            testId={`heading-partner-dashboard-${scope}`}
          />
        ) : (
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
        )}
        {extraHeader}
      </section>

      <KpiGrid kpis={data?.kpis ?? []} loading={isLoading} scope={scope} series={data?.series ?? []} preset={preset} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DashboardPanel data-testid={`trend-${scope}`} className="lg:col-span-2">
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
    </div>
  );
}

// ─── KPI tiles ──────────────────────────────────────────────────────

// Task #2486 — each real (non-comingSoon) KPI tile drills into the
// closest existing tab of the SAME partner shell, carrying the
// dashboard's currently-selected date range wherever the destination
// supports one. The artist and label report tabs own a range picker
// that now reads a `?range=` seed off the URL, so their tiles append
// `?range=<preset>` (mapped into each shell's own preset vocab on
// arrival) alongside `?tab=<dest>` and the existing scope params
// (`?personId`/`?labelId`/`?scopeId`…). The NPO drill-downs
// (buyers/acquisition/ledger/…) have no range picker, so their tiles
// carry `?tab=` only. Tiles with no matching in-shell tab (and every
// coming-soon tile) stay inert.
function partnerTabDest(scope: PartnerScopeKind, k: DashboardKpi): string | null {
  if (k.comingSoon) return null;
  switch (scope) {
    case "artist":
      // dashboard/overview/audience/acquisition/catalog/orders/buyers/referrals
      if (k.id === "orders") return "orders";
      if (k.id === "units" || k.id === "gross" || k.id === "pricePerUnit" || k.id === "net") return "overview";
      if (k.id === "plays" || k.id === "newFans") return "audience";
      return null;
    case "label":
      // dashboard/overview/acquisition/roster/catalog/orders
      if (k.id === "orders") return "orders";
      if (k.id === "gross" || k.id === "plays" || k.id === "newFans") return "overview";
      return null;
    case "npo":
      // dashboard/artists/acquisition/buyers/invites/ledger(/tree)
      if (k.id === "orders") return "buyers";
      if (k.id === "newFans") return "acquisition";
      if (k.id === "pending" || k.id === "paid") return "artists";
      if (k.id === "donated") return "ledger";
      return null;
    case "vendor":
    default:
      // The vendor/manufacturer/fulfillment shell only has the Dashboard
      // tab and (vendor-only) GoodDeed Services pricing — no sales/jobs
      // report tab — so these tiles have no honest drill-down and stay
      // inert rather than linking into the unrelated pricing surface.
      return null;
  }
}

// Build a same-shell tab href that preserves the current scope query
// params (e.g. super-admin `?personId=`/`?labelId=`/`?scopeId=`),
// swaps `?tab=`, and — when the destination shell supports a range
// picker — carries the dashboard's active `?range=` preset so the
// drill-down lands on the same window. Mirrors each shell's onTabChange.
function tabHref(dest: string, range?: string): string {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const sp = new URLSearchParams(search);
  sp.set("tab", dest);
  if (range) sp.set("range", range);
  return `${path}?${sp.toString()}`;
}

export function KpiGrid({
  kpis,
  loading,
  scope,
  series = [],
  preset,
}: {
  kpis: DashboardKpi[];
  loading: boolean;
  scope: PartnerScopeKind;
  series?: Array<Record<string, number | string>>;
  /** The dashboard's active range preset, carried into range-aware
   * destination tabs (artist + label) via `?range=`. */
  preset?: PartnerRangePreset;
}) {
  if (loading && kpis.length === 0) {
    return (
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid={`kpi-grid-${scope}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <DashboardPanel key={i} className="h-[120px] animate-pulse" />
        ))}
      </section>
    );
  }
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid={`kpi-grid-${scope}`}>
      {kpis.map((k) => {
        const dest = partnerTabDest(scope, k);
        // Only the artist + label report tabs read a `?range=` seed;
        // NPO/vendor drill-downs have no range picker, so they carry
        // `?tab=` only.
        const carriesRange = scope === "artist" || scope === "label";
        // A real, populated KPI is clickable; a card with no value yet
        // (e.g. artist price-per-unit before any units sell) stays inert
        // even though its destination tab exists.
        const clickable = dest != null && k.value != null;
        return (
          <KpiCard
            key={k.id}
            model={k}
            testId={`kpi-${scope}-${k.id}`}
            href={clickable ? tabHref(dest, carriesRange ? preset : undefined) : null}
            spark={sparkFromSeries(series, k.id)}
          />
        );
      })}
    </section>
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
