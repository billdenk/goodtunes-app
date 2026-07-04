// Task #2439 — ONE shared, Stripe-like KPI metric card used by every
// admin / operator / partner dashboard:
//   • client/src/pages/AdminDashboard.tsx           (operator home)
//   • client/src/components/partner/PartnerDashboard.tsx      (partner shell)
//   • client/src/components/admin/AdminPartnerDashboard.tsx   (per-entity)
//   • client/src/components/admin/AdminSectionDashboard.tsx   (section rollup)
//
// Every box is equal-sized with the same rhythm: label + info-(i)
// popover, big number, "vs prior" delta pill, and a small sparkline
// that omits cleanly when there's no daily trend data. The NET box's
// cost-stack breakdown (Gross / Manufacturing / Publishing / Platform
// fee / Stripe fees) lives INSIDE the info popover, never in the card
// body. Light admin slate theme only — no fan surfaces.

import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Info } from "lucide-react";
import { formatUsdCents } from "@shared/money";
import { BRAND } from "@/lib/brand-tokens";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

export type KpiFormat = "currency" | "number" | "percent" | "duration";

export type KpiBreakdownRow = { label: string; value: number; format: KpiFormat };

export type KpiCardModel = {
  id: string;
  label: string;
  /** Optional glyph rendered just before the label (e.g. the Roster star). */
  labelIcon?: ReactNode;
  value: number | null;
  prior?: number | null;
  format: KpiFormat;
  /**
   * Pre-formatted display string. When set it overrides `formatKpiValue`
   * for the big number — used for non-numeric metrics (a "Top track" title)
   * or when a caller keeps its own bespoke formatting. `value`/`prior` still
   * drive the delta pill, so pass both a numeric `value` and `valueText` when
   * you want a custom display AND a comparison pill.
   */
  valueText?: string;
  note?: string;
  comingSoon?: boolean;
  /**
   * Suppress the "vs prior" row entirely (no pill, no "—" placeholder) for
   * point-in-time or lifetime metrics that have no prior-period comparison.
   */
  hideDelta?: boolean;
  breakdown?: KpiBreakdownRow[];
  /** Plain-language help copy. Falls back to KPI_INFO[id] when omitted. */
  info?: string;
};

// ─── Value + delta formatting (single source of truth) ───────────────

export function formatKpiValue(value: number | null, format: KpiFormat): string {
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

// ─── Sparkline series derivation ─────────────────────────────────────

// Pull a per-KPI daily series out of the dashboard's merged `series`
// array by matching the KPI id to a metric key. Returns null (→ no
// sparkline) when the metric has no daily data, so boxes without trend
// data omit the sparkline cleanly instead of drawing a flat zero line.
export function sparkFromSeries(
  series: Array<Record<string, number | string>> | undefined,
  id: string,
): number[] | null {
  if (!series || series.length < 2) return null;
  let hasKey = false;
  const pts = series.map((p) => {
    const v = p[id];
    if (v !== undefined && v !== null) hasKey = true;
    return typeof v === "number" ? v : Number(v ?? 0) || 0;
  });
  if (!hasKey) return null;
  if (Math.max(...pts) <= 0) return null;
  return pts;
}

// ─── Plain-language info copy, keyed by shared KPI id ─────────────────

export const KPI_INFO: Record<string, string> = {
  gross: "Total money customers paid, before any costs are taken out.",
  net: "What's left after manufacturing, publishing, the platform fee, and Stripe's processing fees.",
  revenue: "Your share of sales after the platform split.",
  orders: "Completed purchases in this period (refunds excluded).",
  units: "Paid physical copies sold in this period (refunds excluded).",
  pricePerUnit: "Average amount paid per unit — gross sales divided by units sold.",
  newFans: "First-time listeners who played a track for the very first time in this period.",
  plays: "Total track plays started in this period.",
  completion: "Share of plays that reached the end of the track.",
  topTrack: "Your most-played track in this period.",
  donated: "Total raised for this cause — the $1-per-unit earmark plus any Gift of Hope add-ons.",
  pending: "Money owed to this partner but not yet paid out.",
  paid: "Money already paid out to this partner in this period.",
  donors: "Non-profits that drove at least one sale in this period.",
  refArtists: "Artists referred by this cause.",
  copies: "GoodDeed signed copies attributed to this cause.",
  turn: "Average time from order to completion.",
  avgTime: "Average time from order to shipment.",
  open: "Jobs currently in progress and not yet completed.",
  inProd: "Jobs currently in production.",
  done: "Jobs completed in this period.",
  completed: "Jobs completed in this period.",
  shipped: "Shipments sent in this period.",
  late: "Shipments that missed their target window.",
  partners: "Fulfillment partners active in this period.",
  active: "Partners with at least one active listing.",
  skus: "Distinct gear items listed.",
  gmv: "Total value of gear sold.",
  newGear: "New gear items added in this period.",
  listings: "Live gear listings.",
  referrals: "Clicks or referrals this reseller drove to the store.",
  // Press-portal summary boxes
  "revenue-30d": "Money customers paid for this press's releases in the last 30 days.",
  "revenue-lifetime": "All money customers have ever paid for this press's releases.",
  "units-30d": "Paid copies sold across this press's releases in the last 30 days.",
  customers: "Distinct fans who have bought at least one of this press's releases.",
  pipeline: "Releases assigned to this press that are somewhere in the manufacturing pipeline.",
  // Artist all-time headline strip
  fans: "Unique fans who bought one of your releases in this period.",
  openOrders: "Paid orders that haven't shipped yet.",
  // Artist / Label / Manager reporting dashboards
  artistShare: "Your share of sales after the platform split.",
  listeners: "Distinct people who played at least one track in this period.",
  topAlbum: "Your highest-earning release in this period.",
  roster: "Artists on your roster.",
  arpa: "Average gross revenue per roster artist in this period.",
  newListeners: "Listeners playing this music for the first time in this period.",
  returningListeners: "Listeners who had played this music before this period.",
  engaged: "Listeners with two or more plays in this period.",
  // Non-profit dashboard
  npoPending: "Money owed to this cause but not yet paid out.",
  npoPaid: "Money already paid out to this cause.",
  npoArtists: "Artists referred by this cause.",
};

// Shown when a KPI id has no specific entry above, so every box always
// carries an info-(i) with at least a plain-language explanation.
export const DEFAULT_KPI_INFO = "A summary metric for this dashboard.";

// Normalize a dashboard test-id ("kpi-top-track", "lifetime-gross") into a
// camelCase KPI_INFO key ("topTrack", "gross") so a migrated card picks up
// real help copy instead of the generic fallback.
export function kpiInfoKeyFromTestId(testId: string): string {
  return testId
    .replace(/^(kpi|lifetime)-/, "")
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ─── Sparkline ───────────────────────────────────────────────────────

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

// ─── The card ────────────────────────────────────────────────────────

export function KpiCard({
  model,
  testId,
  href,
  spark,
  color = BRAND.blue,
}: {
  model: KpiCardModel;
  /** Base data-testid; sub-ids (`-value`, `-delta`, `-info`, `-link`) derive from it. */
  testId: string;
  href?: string | null;
  spark?: number[] | null;
  color?: string;
}) {
  const value = model.valueText ?? formatKpiValue(model.value, model.format);
  // A genuine no-data metric (null number, no forced display string, or an
  // explicit "—" placeholder) renders as a quiet, muted, label-weight dash
  // rather than a heavy 22px headline — so an empty grid reads calm, not alarming.
  const isEmpty =
    !model.comingSoon &&
    model.value === null &&
    (model.valueText === undefined || model.valueText === "" || model.valueText === "—");
  const showDelta =
    !model.comingSoon &&
    model.value !== null &&
    model.prior !== null &&
    model.prior !== undefined;
  const delta = showDelta
    ? deltaPct(model.value as number, model.prior as number)
    : null;
  const positive = showDelta && (model.value as number) >= (model.prior as number);
  const showSpark =
    !model.comingSoon && !!spark && spark.length > 1 && Math.max(...spark) > 0;

  const info = model.info ?? KPI_INFO[model.id] ?? DEFAULT_KPI_INFO;
  const hasBreakdown = !!model.breakdown && model.breakdown.length > 0 && !model.comingSoon;
  const showInfo = !!info || hasBreakdown;

  const linked = !!href;

  return (
    <div
      data-testid={testId}
      className={cn(
        "relative rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between min-h-[120px]",
        linked &&
          "group transition-all duration-200 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5",
      )}
    >
      {linked && (
        <Link
          href={href as string}
          className="absolute inset-0 z-[1] rounded-xl"
          aria-label={model.label}
          data-testid={`${testId}-link`}
        />
      )}

      {/* Content sits above the stretched link but lets clicks fall through
          to it, except on the interactive info button (pointer-events-auto). */}
      <div className={cn("relative z-[2]", linked && "pointer-events-none")}>
        <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          {model.labelIcon}
          <span className="truncate">{model.label}</span>
          {showInfo && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${model.label}`}
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto inline-flex items-center justify-center text-slate-300 hover:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded transition-colors"
                  data-testid={`${testId}-info`}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 text-left"
                data-testid={`${testId}-info-content`}
              >
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold normal-case">
                  {model.label}
                </p>
                {info && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{info}</p>
                )}
                {hasBreakdown && (
                  <dl
                    className={cn(
                      "space-y-1",
                      info ? "mt-3 border-t border-slate-100 pt-3" : "mt-2",
                    )}
                    data-testid={`${testId}-breakdown`}
                  >
                    {model.breakdown!.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs gap-4"
                      >
                        <dt className="text-slate-500">{b.label}</dt>
                        <dd
                          className={cn(
                            "tabular-nums font-medium",
                            b.value < 0 ? "text-rose-600" : "text-slate-900",
                          )}
                        >
                          {formatKpiValue(b.value, b.format)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </PopoverContent>
            </Popover>
          )}
          {linked && (
            <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-[color:var(--brand-blue)] transition-colors" />
          )}
        </div>

        {isEmpty ? (
          <p
            className="mt-1 text-lg font-normal text-slate-300 tabular-nums"
            data-testid={`${testId}-value`}
          >
            —
          </p>
        ) : (
          <p
            className={cn(
              "mt-1 text-[22px] font-semibold tabular-nums",
              model.comingSoon ? "text-slate-400" : "text-slate-900",
            )}
            data-testid={`${testId}-value`}
          >
            {value}
          </p>
        )}
      </div>

      <div
        className={cn(
          "relative z-[2] mt-2 flex items-end justify-between gap-2",
          linked && "pointer-events-none",
        )}
      >
        <div className="flex items-center gap-2 text-[11px] min-w-0">
          {model.hideDelta ? null : showDelta ? (
            <>
              <span className="text-slate-500">vs prior</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full font-semibold",
                  positive
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700",
                )}
                data-testid={`${testId}-delta`}
              >
                {delta}
              </span>
            </>
          ) : (
            <span className="text-slate-400">vs prior: —</span>
          )}
          {model.note && !model.comingSoon && (
            <span className="text-slate-400 truncate">{model.note}</span>
          )}
        </div>
        {showSpark && <Sparkline points={spark as number[]} color={color} />}
      </div>
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────
// Same frame + rhythm as KpiCard so a metric grid can render placeholder
// cards while its query is in flight — a quiet shimmer instead of a grid
// full of "—" bars.
export function KpiCardSkeleton({ testId }: { testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between min-h-[120px]"
    >
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
        <div className="h-6 w-24 rounded bg-slate-200 animate-pulse" />
      </div>
      <div className="mt-2 h-3 w-20 rounded bg-slate-100 animate-pulse" />
    </div>
  );
}
