// Combined super-admin Press Dashboard — real aggregate data summed across
// all presses, laid out per Bill's approved handoff
// (handoff/press-dashboard/PressDashboardAllDark.tsx):
//   • 6 KPI cards in a strict 3-col grid (Gross, Orders, Units pressed,
//     Open jobs w/ "N in production now" note, Completed, Avg turn-time)
//   • stacked per-press daily-gross AreaChart
//   • "As it happens" press-attributed activity feed with filter chips
//   • per-press leaderboard with share-of-max bars, linking to each
//     press's own dashboard (/admin/manufacturers/:id).
//
// Scale rules (Bill, Aug 2026 — must hold at 10-20+ presses):
//   • Chart: only the top 5 presses by gross get their own colored band;
//     everything else folds into ONE neutral grey "Everything else" band.
//     The stacked total still equals ALL presses.
//   • Chips: All + up to 5 press chips; the rest collapse into "More".
//   • Leaderboard: top 10 rows + a quiet "Show all N presses" expander.
//   • Colors are STABLE — each press carries its onboard-assigned
//     manufacturers.chart_color; never re-derived per page load.
//
// Data: GET /api/admin/section/presses/dashboard?range=… (see
// server/sectionDashboard.ts buildPressesRollup). Light admin slate theme;
// dark comes free via the gt-admin-dark remaps. Never color-only signals —
// every band/bar/chip also carries the press name, deltas carry +/- signs.

import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  ShoppingBag, Cog, PackageCheck, ChevronRight, ChevronDown, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KpiCard, sparkFromSeries } from "@/components/admin/KpiCard";
import { useAdminDark, useDarkMarkLogo } from "@/lib/adminAppearance";
import { formatUsdCents } from "@shared/money";
import { PRESS_OTHER_COLOR, PRESS_CHART_PALETTE } from "@shared/pressChartPalette";
import { cn } from "@/lib/utils";

type RangePreset = "today" | "7d" | "30d" | "90d" | "all";
const RANGE_PRESETS: ReadonlyArray<{ id: RangePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];
const LS_KEY = "admin-section-dashboard:presses:range";

type Kpi = {
  id: string;
  label: string;
  value: number | null;
  prior?: number | null;
  format: "currency" | "number" | "percent" | "duration";
  note?: string;
  comingSoon?: boolean;
  hideDelta?: boolean;
};
type PressRow = {
  id: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
  color: string | null;
  grossCents: number;
  orders: number;
  unitsPressed: number | null;
  openJobs: number;
  inProduction: number;
  turnDays: number | null;
  deltaGrossPct: number | null;
};
type ActivityItem = {
  kind: string;
  ts: string;
  title: string;
  detail?: string;
  href?: string;
  pressId?: string;
  pressName?: string;
  pressLogoUrl?: string | null;
};
type Payload = {
  range: { preset: RangePreset; from: string; to: string };
  prior: { from: string; to: string } | null;
  kpis: Kpi[];
  series: Array<Record<string, number | string>>;
  activity: ActivityItem[];
  presses?: PressRow[];
  pressSeries?: Array<Record<string, number | string>>;
};

/** Stable color for a press: its onboard-assigned chart_color, with a
 *  deterministic palette fallback (by leaderboard order) for legacy rows
 *  the backfill hasn't stamped yet. */
function pressColor(p: PressRow, idx: number): string {
  return p.color || PRESS_CHART_PALETTE[idx % PRESS_CHART_PALETTE.length];
}

const OTHER_KEY = "__other__";
const TOP_N_CHART = 5;
const TOP_N_CHIPS = 5;
const TOP_N_ROWS = 10;

// ─── Small shared pieces ─────────────────────────────────────────────

/** White circle with the press's own mark, object-contain, never recolored. */
function PressAvatar({
  logoUrl, name, size,
}: { logoUrl: string | null; name: string; size: number }) {
  // Dark mode remaps the white circle to charcoal, so a near-black mark
  // disappears — invert it to white there (same heuristic as the press
  // detail header). Colored logos are untouched.
  const dark = useAdminDark();
  const darkMark = useDarkMarkLogo(logoUrl);
  const invertLogo = dark && darkMark;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-white border border-slate-200 overflow-hidden shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="object-contain"
          style={{
            width: size - Math.max(4, Math.round(size * 0.18)),
            height: size - Math.max(4, Math.round(size * 0.18)),
            ...(invertLogo ? { filter: "invert(1) brightness(1.7)" } : {}),
          }}
        />
      ) : (
        <span className="text-[10px] font-bold text-slate-400">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/** Translucent-wash delta chip — always signed, never color-only. */
function DeltaChip({ pct, testId }: { pct: number | null; testId?: string }) {
  if (pct === null || !Number.isFinite(pct)) {
    return <span className="text-[11px] text-slate-400 tabular-nums" data-testid={testId}>—</span>;
  }
  const pos = pct >= 0;
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums",
        pos ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
      data-testid={testId}
    >
      {pos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────

export function AdminPressesDashboard() {
  const [preset, setPreset] = useState<RangePreset>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as RangePreset | null;
      if (saved && RANGE_PRESETS.some((p) => p.id === saved)) return saved;
    } catch {}
    return "30d";
  });
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, preset); } catch {}
  }, [preset]);

  const dashUrl = `/api/admin/section/presses/dashboard?range=${preset}`;
  const { data, isLoading, error } = useQuery<Payload>({ queryKey: [dashUrl] });

  const presses = data?.presses ?? [];
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    presses.forEach((p, i) => m.set(p.id, pressColor(p, i)));
    return m;
  }, [presses]);

  if (error) {
    return (
      <Card data-testid="presses-dashboard-error">
        <CardContent className="p-6 text-center">
          <p className="text-slate-500 text-sm">
            {(error as any)?.message || "We couldn't load the press dashboard."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-testid="presses-dashboard">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-[var(--apple-ink)] text-[30px] font-semibold tracking-[-0.02em] leading-tight truncate"
            data-testid="heading-presses-dashboard"
          >
            Every press. One pulse.
          </h2>
          <p className="text-[var(--apple-subink)] text-[13px] font-medium mt-0.5">
            All pressing plants combined.
          </p>
        </div>
        <div
          className="inline-flex items-center rounded-full p-1 gap-2 bg-[var(--apple-track)]"
          role="group"
          aria-label="Date range"
          data-testid="presses-range-picker"
        >
          {RANGE_PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                aria-pressed={active}
                className={cn(
                  "px-3.5 h-8 text-[13px] rounded-full transition-all",
                  active
                    ? "bg-white text-[var(--apple-ink)] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[var(--apple-subink)] font-medium hover:text-[var(--apple-ink)]",
                )}
                data-testid={`button-presses-range-${p.id}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* KPI cards — strict 3-col grid on desktop */}
      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        data-testid="presses-kpi-grid"
      >
        {(isLoading && !data ? [] : data?.kpis ?? []).map((k) => (
          <KpiCard
            key={k.id}
            model={k}
            testId={`presses-kpi-${k.id}`}
            spark={sparkFromSeries(data?.series, k.id === "gross" ? "gross" : k.id)}
          />
        ))}
        {isLoading && !data &&
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 h-[150px] animate-pulse" /></Card>
          ))}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2" data-testid="presses-trend-card">
          <CardContent className="p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                The story. Every plant, one chart.
              </h3>
              <p className="text-xs text-slate-500">Daily gross, stacked by press</p>
            </div>
            <StackedTrend
              presses={presses}
              pressSeries={data?.pressSeries ?? []}
              colorOf={colorOf}
              loading={isLoading}
            />
          </CardContent>
        </Card>

        <Card data-testid="presses-activity-card">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">As it happens</h3>
            <ActivityFeed
              items={data?.activity ?? []}
              presses={presses}
              loading={isLoading}
            />
          </CardContent>
        </Card>
      </div>

      <Card data-testid="presses-leaderboard-card">
        <CardContent className="p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Press by press. Tap one for its full dashboard.
            </h3>
          </div>
          <Leaderboard presses={presses} colorOf={colorOf} loading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Stacked area trend: top 5 + "Everything else" ──────────────────

function StackedTrend({
  presses, pressSeries, colorOf, loading,
}: {
  presses: PressRow[];
  pressSeries: Array<Record<string, number | string>>;
  colorOf: Map<string, string>;
  loading: boolean;
}) {
  // presses arrive gross-desc from the server; take the top 5, fold the rest.
  const top = presses.slice(0, TOP_N_CHART);
  const restIds = useMemo(
    () => new Set(presses.slice(TOP_N_CHART).map((p) => p.id)),
    [presses],
  );
  const chartData = useMemo(() => {
    return pressSeries.map((pt) => {
      const out: Record<string, number | string> = { date: pt.date };
      for (const p of top) out[p.id] = Number(pt[p.id] ?? 0) / 100;
      if (restIds.size) {
        let other = 0;
        restIds.forEach((id) => { other += Number(pt[id] ?? 0); });
        out[OTHER_KEY] = other / 100;
      }
      return out;
    });
  }, [pressSeries, top, restIds]);

  if (loading && !pressSeries.length) {
    return <div className="h-[260px] bg-slate-50 rounded-lg animate-pulse" />;
  }
  if (!chartData.length) {
    return (
      <div className="h-[260px] flex items-center justify-center" data-testid="presses-trend-empty">
        <span className="text-slate-400 text-xs">No sales in this window yet.</span>
      </div>
    );
  }
  const nameOf = new Map(top.map((p) => [p.id, p.name]));
  if (restIds.size) nameOf.set(OTHER_KEY, "Everything else");
  return (
    <div className="space-y-3">
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "rgb(100,116,139)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "rgb(100,116,139)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
            <Tooltip
              contentStyle={{
                background: "#ffffff",
                border: "1px solid rgb(226,232,240)",
                borderRadius: 6,
                fontSize: 12,
                color: "rgb(15,23,42)",
              }}
              formatter={(v: number, key: string) => [`$${Number(v).toFixed(2)}`, nameOf.get(key) ?? key]}
            />
            {top.map((p) => (
              <Area
                key={p.id}
                type="monotone"
                dataKey={p.id}
                name={p.name}
                stackId="1"
                stroke={colorOf.get(p.id)}
                fill={colorOf.get(p.id)}
                fillOpacity={0.18}
                strokeWidth={1.5}
              />
            ))}
            {restIds.size > 0 && (
              <Area
                type="monotone"
                dataKey={OTHER_KEY}
                name="Everything else"
                stackId="1"
                stroke={PRESS_OTHER_COLOR}
                fill={PRESS_OTHER_COLOR}
                fillOpacity={0.18}
                strokeWidth={1.5}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Legend — dot + name, top 5 + "Everything else" */}
      <div className="flex items-center gap-4 flex-wrap" data-testid="presses-trend-legend">
        {top.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: colorOf.get(p.id) }} />
            {p.name}
          </span>
        ))}
        {restIds.size > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: PRESS_OTHER_COLOR }} />
            Everything else
          </span>
        )}
      </div>
    </div>
  );
}

// ─── "As it happens" feed ────────────────────────────────────────────

function activityIcon(kind: string) {
  if (kind === "sale") return { Icon: ShoppingBag, cls: "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]" };
  if (kind === "complete") return { Icon: PackageCheck, cls: "bg-emerald-50 text-emerald-600" };
  return { Icon: Cog, cls: "bg-slate-100 text-slate-500" };
}

function ActivityFeed({
  items, presses, loading,
}: {
  items: ActivityItem[];
  presses: PressRow[];
  loading: boolean;
}) {
  const [filter, setFilter] = useState<string | null>(null); // null = All
  // Chips: All + up to 5 presses that actually appear in the feed (ordered
  // by leaderboard rank); the rest collapse into a "More" dropdown.
  const feedPressIds = useMemo(() => new Set(items.map((i) => i.pressId).filter(Boolean)), [items]);
  const chipPresses = presses.filter((p) => feedPressIds.has(p.id));
  const visible = chipPresses.slice(0, TOP_N_CHIPS);
  const overflow = chipPresses.slice(TOP_N_CHIPS);
  const shown = filter ? items.filter((i) => i.pressId === filter) : items;

  if (loading && !items.length) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="h-11 bg-slate-50 rounded animate-pulse" />
        ))}
      </ul>
    );
  }
  if (!items.length) {
    return <p className="text-slate-400 text-sm py-2" data-testid="presses-activity-empty">Quiet in this window.</p>;
  }
  const overflowActive = overflow.find((p) => p.id === filter);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap" data-testid="presses-activity-chips">
        <FeedChip label="All" active={filter === null} onClick={() => setFilter(null)} />
        {visible.map((p) => (
          <FeedChip key={p.id} label={p.name} active={filter === p.id} onClick={() => setFilter(p.id)} />
        ))}
        {overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "h-7 px-2.5 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1",
                  overflowActive
                    ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
                )}
                data-testid="button-presses-activity-more"
              >
                {overflowActive ? overflowActive.name : "More"}
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {overflow.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setFilter(p.id)}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <ul className="divide-y divide-slate-100" data-testid="presses-activity-list">
        {shown.length === 0 && (
          <li className="py-2 text-slate-400 text-sm">Nothing from this press in the window.</li>
        )}
        {shown.map((it, i) => {
          const { Icon, cls } = activityIcon(it.kind);
          return (
            <li key={i} className="py-2 flex items-center gap-3" data-testid={`presses-activity-item-${i}`}>
              <span className="relative shrink-0">
                <span className={cn("w-9 h-9 rounded-lg inline-flex items-center justify-center", cls)}>
                  <Icon className="w-4 h-4" />
                </span>
                {it.pressLogoUrl != null || it.pressName ? (
                  <span className="absolute -bottom-1 -right-1">
                    <PressAvatar logoUrl={it.pressLogoUrl ?? null} name={it.pressName ?? "?"} size={18} />
                  </span>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                {it.href ? (
                  <Link href={it.href} className="text-sm font-semibold text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 truncate block transition-colors">
                    {it.title}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-slate-900 truncate">{it.title}</p>
                )}
                <p className="text-xs text-slate-500 truncate">
                  {[it.pressName, it.detail].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <time className="text-xs text-slate-400 tabular-nums shrink-0">
                {new Date(it.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FeedChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 px-2.5 rounded-full text-xs font-semibold transition-colors",
        active
          ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
          : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
      )}
    >
      {label}
    </button>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────

function Leaderboard({
  presses, colorOf, loading,
}: {
  presses: PressRow[];
  colorOf: Map<string, string>;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (loading && !presses.length) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="h-14 bg-slate-50 rounded animate-pulse" />
        ))}
      </ul>
    );
  }
  if (!presses.length) {
    return <p className="text-slate-400 text-sm py-2">No presses reporting yet.</p>;
  }
  const maxGross = Math.max(1, ...presses.map((p) => p.grossCents));
  const shown = expanded ? presses : presses.slice(0, TOP_N_ROWS);
  return (
    <div>
      {/* Column header */}
      <div className="hidden md:grid grid-cols-[28px_minmax(0,2fr)_minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))_minmax(0,0.9fr)_72px_20px] items-center gap-3 px-2 pb-2 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
        <span>#</span>
        <span>Press</span>
        <span>Share of top</span>
        <span className="text-right">Units pressed</span>
        <span className="text-right">Open jobs</span>
        <span className="text-right">Turn</span>
        <span className="text-right">Gross</span>
        <span className="text-right">Δ</span>
        <span />
      </div>
      <ul className="divide-y divide-slate-100" data-testid="presses-leaderboard">
        {shown.map((p, i) => {
          const pct = Math.round((p.grossCents / maxGross) * 100);
          return (
            <li key={p.id}>
              <Link
                href={`/admin/manufacturers/${p.id}`}
                className="grid grid-cols-[28px_minmax(0,2fr)_minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))_minmax(0,0.9fr)_72px_20px] items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                data-testid={`presses-leaderboard-row-${i}`}
              >
                <span className="text-sm text-slate-400 tabular-nums font-semibold">{i + 1}</span>
                <span className="flex items-center gap-2.5 min-w-0">
                  <PressAvatar logoUrl={p.logoUrl} name={p.name} size={40} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{p.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{p.city ?? "—"}</span>
                  </span>
                </span>
                <span className="hidden md:block">
                  <span className="block h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(4, pct)}%`, background: colorOf.get(p.id) }}
                    />
                  </span>
                </span>
                <span className="hidden md:block text-right text-sm text-slate-700 tabular-nums">
                  {p.unitsPressed === null ? "—" : p.unitsPressed.toLocaleString()}
                </span>
                <span className="hidden md:block text-right text-sm text-slate-700 tabular-nums">{p.openJobs}</span>
                <span className="hidden md:block text-right text-sm text-slate-700 tabular-nums">
                  {p.turnDays === null ? "—" : `${p.turnDays}d`}
                </span>
                <span className="text-right text-sm font-semibold text-slate-900 tabular-nums">
                  {formatUsdCents(p.grossCents)}
                </span>
                <span className="text-right">
                  <DeltaChip pct={p.deltaGrossPct} testId={`presses-leaderboard-delta-${i}`} />
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors justify-self-end" />
              </Link>
            </li>
          );
        })}
      </ul>
      {presses.length > TOP_N_ROWS && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-900 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          data-testid="button-presses-leaderboard-expand"
        >
          Show all {presses.length} presses
        </button>
      )}
    </div>
  );
}
