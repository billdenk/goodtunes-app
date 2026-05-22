import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import {
  AdminErrorBoundary,
  ErrorState,
  LoadingState,
  fetchJson,
} from "@/components/admin/AdminErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, MapPin, TrendingUp } from "lucide-react";

const BLUE = "#319ED8";
const MINT = "#4AFFCA";
const PURPLE = "#7F10A7";
const PINK = "#FF5470";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Saved date ranges — persist to URL (?from=…&to=…) so the operator
// can share a link to a specific window, and to localStorage so the
// next visit restores their last view even without query params.
const DATE_LS_KEY = "admin-reports:dateRange";
function useDateRange() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400_000);
  // Single state object so setters always see the latest paired value
  // (avoids the stale-closure bug where setFrom(...) followed by
  // setTo(...) would persist the old `from` from a frozen render).
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const defaults = { from: isoDay(monthAgo), to: isoDay(today) };
    if (typeof window === "undefined") return defaults;
    const url = new URLSearchParams(window.location.search);
    if (url.get("from") && url.get("to")) {
      return { from: url.get("from")!, to: url.get("to")! };
    }
    try {
      const saved = JSON.parse(localStorage.getItem(DATE_LS_KEY) || "null");
      if (saved?.from && saved?.to) return { from: saved.from, to: saved.to };
    } catch {}
    return defaults;
  });
  function persist(next: { from: string; to: string }) {
    try {
      localStorage.setItem(DATE_LS_KEY, JSON.stringify(next));
    } catch {}
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("from", next.from);
      url.searchParams.set("to", next.to);
      window.history.replaceState(null, "", url.toString());
    }
  }
  const setFrom = (v: string) => setRange((prev) => { const next = { ...prev, from: v }; persist(next); return next; });
  const setTo = (v: string) => setRange((prev) => { const next = { ...prev, to: v }; persist(next); return next; });
  return { from: range.from, to: range.to, setFrom, setTo };
}

function buildQs(from: string, to: string, asPartner: string, asKind: string): string {
  const p = new URLSearchParams({ from, to });
  if (asPartner) {
    p.set("asPartner", asPartner);
    p.set("asPartnerKind", asKind || "label");
  }
  return p.toString();
}

interface ScopeInfo {
  role: "super_admin" | "admin" | "label" | "artist" | "org" | "manufacturer" | "fulfillment";
  roleScopeId: string | null;
  viewAs: { kind: "label" | "artist"; id: string } | null;
}

export function AdminReports() {
  const { from, to, setFrom, setTo } = useDateRange();
  const [asPartner, setAsPartner] = useState("");
  const [asKind, setAsKind] = useState<"label" | "artist">("label");
  const qs = useMemo(() => buildQs(from, to, asPartner, asKind), [from, to, asPartner, asKind]);

  const { data: scope } = useQuery<ScopeInfo>({
    queryKey: ["/api/partner/reports/scope", asPartner, asKind],
    queryFn: () => fetchJson(`/api/partner/reports/scope?${qs}`),
  });

  const isSuper = scope?.role === "super_admin" && !scope.viewAs;
  // Admin tier (non-sensitive god-view): super_admin + plain admin, both
  // when not impersonating a partner. Sees KPIs, revenue, engagement,
  // funnels, ops health, PostHog embeds — but NOT payout reconciliation
  // or the raw event explorer (super_admin only).
  const isAdmin = (scope?.role === "super_admin" || scope?.role === "admin") && !scope.viewAs;
  const isOrg = scope?.role === "org";
  const showReferrals = isOrg || scope?.role === "artist" || isSuper;

  // Task #145 — Dashboard KPI tiles deep-link here as
  // `/admin/reports?tab=<name>&from=…&to=…`. We read `tab` once on
  // mount to pick the initial active tab; the date range is already
  // picked up by useDateRange() above.
  const initialTab = useMemo(() => {
    if (typeof window === "undefined") return "sales";
    const t = new URLSearchParams(window.location.search).get("tab");
    const allowed = new Set([
      "sales", "plays", "payouts", "redemption", "fans", "map",
      "referrals", "overview", "revenue", "engagement", "funnels",
      "ops", "recon", "events",
    ]);
    return t && allowed.has(t) ? t : "sales";
  }, []);

  return (
    <AdminFrame active="reports">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900" data-testid="text-reports-title">
              Reports
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Sales, plays, payouts, and fan reach across your catalogue.
            </p>
          </div>
          <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
        </header>

        {isSuper && (
          <div
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-end gap-3"
            data-testid="impersonation-bar"
          >
            <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mr-2">
              View as partner
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="as-kind" className="text-[11px] text-slate-500">
                Kind
              </Label>
              <select
                id="as-kind"
                value={asKind}
                onChange={(e) => setAsKind(e.target.value as any)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-[var(--brand-blue)]"
                data-testid="select-as-partner-kind"
              >
                <option value="label">Label</option>
                <option value="artist">Artist</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
              <Label htmlFor="as-id" className="text-[11px] text-slate-500">
                Partner ID
              </Label>
              <Input
                id="as-id"
                value={asPartner}
                onChange={(e) => setAsPartner(e.target.value)}
                placeholder="Paste label or artist ID"
                className="h-9"
                data-testid="input-as-partner-id"
              />
            </div>
            {asPartner && (
              <Button variant="ghost" onClick={() => setAsPartner("")} data-testid="button-clear-as-partner">
                Clear
              </Button>
            )}
          </div>
        )}

        <AdminErrorBoundary title="Reports failed to render">
        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="bg-slate-100 border border-slate-200 p-1 h-auto flex-wrap">
            <TabsTrigger value="sales" data-testid="tab-sales">Sales</TabsTrigger>
            <TabsTrigger value="plays" data-testid="tab-plays">Plays & GoodSync</TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts">Payouts</TabsTrigger>
            <TabsTrigger value="redemption" data-testid="tab-redemption">Shopify redemption</TabsTrigger>
            <TabsTrigger value="fans" data-testid="tab-fans">Top fans</TabsTrigger>
            <TabsTrigger value="map" data-testid="tab-map">Fan map</TabsTrigger>
            {showReferrals && (
              <TabsTrigger value="referrals" data-testid="tab-referrals">Referrals</TabsTrigger>
            )}
            {isAdmin && <TabsTrigger value="overview" data-testid="tab-overview">Overview (god-view)</TabsTrigger>}
            {isAdmin && <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue breakdown</TabsTrigger>}
            {isAdmin && <TabsTrigger value="engagement" data-testid="tab-engagement">Engagement</TabsTrigger>}
            {isAdmin && <TabsTrigger value="funnels" data-testid="tab-funnels">Funnels & cohorts</TabsTrigger>}
            {isAdmin && <TabsTrigger value="ops" data-testid="tab-ops">Ops health</TabsTrigger>}
            {isSuper && <TabsTrigger value="recon" data-testid="tab-reconciliation">Payout reconciliation</TabsTrigger>}
            {isSuper && <TabsTrigger value="events" data-testid="tab-events">Raw events</TabsTrigger>}
          </TabsList>

          <TabsContent value="sales"><SalesTab qs={qs} /></TabsContent>
          <TabsContent value="plays"><PlaysTab qs={qs} /></TabsContent>
          <TabsContent value="payouts"><PayoutsTab qs={qs} /></TabsContent>
          <TabsContent value="redemption"><RedemptionTab qs={qs} /></TabsContent>
          <TabsContent value="fans"><TopFansTab qs={qs} /></TabsContent>
          <TabsContent value="map"><FanMapTab qs={qs} /></TabsContent>
          {showReferrals && <TabsContent value="referrals"><ReferralsTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="overview"><OverviewTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="revenue"><RevenueTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="engagement"><EngagementTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="funnels"><FunnelsTab /></TabsContent>}
          {isAdmin && <TabsContent value="ops"><OpsTab qs={qs} /></TabsContent>}
          {isSuper && <TabsContent value="recon"><ReconciliationTab qs={qs} /></TabsContent>}
          {isSuper && <TabsContent value="events"><RawEventsTab qs={qs} /></TabsContent>}
        </Tabs>
        </AdminErrorBoundary>
      </div>
    </AdminFrame>
  );
}

function DateRangePicker({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void }) {
  const presets: Array<{ label: string; days: number }> = [
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
    { label: "YTD", days: -1 },
  ];
  function setPreset(days: number) {
    const today = new Date();
    if (days === -1) {
      const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      setFrom(isoDay(jan1));
    } else {
      const start = new Date(today.getTime() - (days - 1) * 86400_000);
      setFrom(isoDay(start));
    }
    setTo(isoDay(today));
  }
  return (
    <div className="flex items-end gap-2" data-testid="date-range-picker">
      <div className="flex flex-col gap-1">
        <Label htmlFor="date-from" className="text-[11px] text-slate-500">From</Label>
        <Input id="date-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[140px]" data-testid="input-date-from" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="date-to" className="text-[11px] text-slate-500">To</Label>
        <Input id="date-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[140px]" data-testid="input-date-to" />
      </div>
      <div className="flex gap-1">
        {presets.map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPreset(p.days)}
            className="h-9"
            data-testid={`button-preset-${p.label.toLowerCase()}`}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-[#319ED8] hover:underline font-medium"
      data-testid="link-export-csv"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </a>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-slate-500 text-sm" data-testid="empty-state">
      {message}
    </div>
  );
}

function SalesTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/sales", qs],
    queryFn: () => fetchJson(`/api/partner/reports/sales?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState testId="loading-sales" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Units sold" value={data.totalUnits.toLocaleString()} sub={data.scopeLabel} /></Card>
        <Card><Stat label="Gross sales" value={fmtUsd(data.totalCents)} /></Card>
        <Card className="flex items-center justify-end"><ExportLink href={`/api/partner/reports/sales.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Sales over time</h3>
          <TrendingUp className="w-4 h-4 text-slate-400" />
        </div>
        {data.totalUnits === 0 ? (
          <EmptyState message="No paid orders in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.series}>
              <defs>
                <linearGradient id="g-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} labelStyle={{ color: "#0f172a" }} />
              <Area type="monotone" dataKey="dollarsCents" stroke={BLUE} fill="url(#g-sales)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function PlaysTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/plays", qs],
    queryFn: () => fetchJson(`/api/partner/reports/plays?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="Play starts" value={t.playStarts.toLocaleString()} /></Card>
        <Card><Stat label="Completions" value={t.playCompletes.toLocaleString()} sub={`${fmtPct(t.completionRate)} of starts`} /></Card>
        <Card><Stat label="GoodSync opens" value={t.lyricsOpens.toLocaleString()} sub={`${fmtPct(t.goodSyncRate)} of starts`} /></Card>
        <Card><Stat label="30s holds" value={t.play30s.toLocaleString()} /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Plays & engagement</h3>
          <ExportLink href={`/api/partner/reports/plays.csv?${qs}`} label="CSV" />
        </div>
        {t.playStarts === 0 ? (
          <EmptyState message="No plays in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="playStarts" stroke={BLUE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="playCompletes" stroke={MINT} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="lyricsOpens" stroke={PURPLE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function PayoutsTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/payouts", qs],
    queryFn: () => fetchJson(`/api/partner/reports/payouts?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Payouts" value={fmtUsd(data.totalCents)} sub={`${data.totalCount} transfers`} /></Card>
        <Card className="sm:col-span-2 flex items-center justify-end"><ExportLink href={`/api/partner/reports/payouts.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Payouts received</h3>
        {data.totalCount === 0 ? (
          <EmptyState message="No payouts yet for this range." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.series}>
              <defs>
                <linearGradient id="g-payouts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MINT} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={MINT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} />
              <Area type="monotone" dataKey="dollarsCents" stroke={MINT} fill="url(#g-payouts)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function RedemptionTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/redemption", qs],
    queryFn: () => fetchJson(`/api/partner/reports/redemption?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Shopify orders" value={data.ordered.toLocaleString()} /></Card>
        <Card><Stat label="Redeemed" value={data.redeemed.toLocaleString()} sub={`${fmtPct(data.rate)} redemption rate`} /></Card>
        <Card className="flex items-center justify-end"><ExportLink href={`/api/partner/reports/redemption.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Orders vs. redemptions</h3>
        {data.ordered === 0 ? (
          <EmptyState message="No Shopify-origin orders in this range." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="ordered" stroke={BLUE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="redeemed" stroke={MINT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function TopFansTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/top-fans", qs],
    queryFn: () => fetchJson(`/api/partner/reports/top-fans?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Top fans by spend</h3>
        <ExportLink href={`/api/partner/reports/top-fans.csv?${qs}`} label="CSV" />
      </div>
      {data.rows.length === 0 ? (
        <EmptyState message="No paying fans in this range yet." />
      ) : (
        <table className="w-full text-sm" data-testid="table-top-fans">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 font-bold">Fan</th>
              <th className="py-2 font-bold">Location</th>
              <th className="py-2 font-bold text-right">Units</th>
              <th className="py-2 font-bold text-right">Spend</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r: any, i: number) => (
              <tr key={i} className="border-b border-slate-100" data-testid={`row-fan-${i}`}>
                <td className="py-2.5 text-slate-900 font-medium">{r.name}</td>
                <td className="py-2.5 text-slate-500">{[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.units}</td>
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.spendCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Name is first name + last initial only. No email, phone, or street address is ever included.
      </p>
    </Card>
  );
}

/**
 * SVG world map with dots projected from lat/lon. Avoids the Leaflet
 * tile-server question for v1. Outline is a single simplified path of
 * world land masses; dots scale by `orders` count.
 */
function FanMapTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/fan-map", qs],
    queryFn: () => fetchJson(`/api/partner/reports/fan-map?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#319ED8]" />
          Where your fans are
        </h3>
        <div className="text-xs text-slate-500">
          {data.geocoded} of {data.totalCities} cities mapped
        </div>
      </div>
      {data.points.length === 0 ? (
        <EmptyState message="No fans to map in this range yet." />
      ) : (
        <WorldMap points={data.points} />
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Dots are city-level. Geocoding is cached via OpenStreetMap (Nominatim).
      </p>
    </Card>
  );
}

function WorldMap({ points }: { points: Array<{ lat: number; lon: number; orders: number; city: string | null; region: string | null; country: string | null; fans: number }> }) {
  // Equirectangular projection — simple, good enough for a city-dot map.
  const W = 960, H = 480;
  function proj(lat: number, lon: number): [number, number] {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [x, y];
  }
  const maxOrders = Math.max(1, ...points.map((p) => p.orders));
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-slate-200 bg-[#f8fafc]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" data-testid="svg-fan-map">
        {/* Latitude/longitude graticule for orientation */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const [, y] = proj(lat, 0);
          return <line key={`la${lat}`} x1={0} x2={W} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />;
        })}
        {[-120, -60, 0, 60, 120].map((lon) => {
          const [x] = proj(0, lon);
          return <line key={`lo${lon}`} x1={x} x2={x} y1={0} y2={H} stroke="#e2e8f0" strokeWidth={0.5} />;
        })}
        {/* Equator highlight */}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#cbd5e1" strokeWidth={0.5} />
        {/* Fan dots */}
        {points.map((p, i) => {
          const [x, y] = proj(p.lat, p.lon);
          const r = 3 + 8 * Math.sqrt(p.orders / maxOrders);
          return (
            <g key={i} data-testid={`map-dot-${i}`}>
              <circle cx={x} cy={y} r={r} fill={BLUE} fillOpacity={0.35} stroke={BLUE} strokeWidth={1} />
              <title>
                {[p.city, p.region, p.country].filter(Boolean).join(", ")} — {p.orders} order{p.orders === 1 ? "" : "s"}, {p.fans} fan{p.fans === 1 ? "" : "s"}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ReferralsTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/referrals", qs],
    queryFn: () => fetchJson(`/api/partner/reports/referrals?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Referred units" value={data.totalUnits.toLocaleString()} sub={data.scopeLabel} /></Card>
        <Card><Stat label="Earnings" value={fmtUsd(data.earningsCents)} sub={`${fmtUsd(data.perUnitCents)} per unit · default`} /></Card>
        <Card className="flex items-center justify-end"><ExportLink href={`/api/partner/reports/referrals.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Artists you referred</h3>
        {data.artists.length === 0 ? (
          <EmptyState message="No referred artists with sales in this range yet." />
        ) : (
          <table className="w-full text-sm" data-testid="table-referrals">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Artist</th>
                <th className="py-2 font-bold text-right">Units</th>
                <th className="py-2 font-bold text-right">Rate</th>
                <th className="py-2 font-bold text-right">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {data.artists.map((a: any) => (
                <tr key={a.artistId} className="border-b border-slate-100" data-testid={`row-referral-${a.artistId}`}>
                  <td className="py-2.5 text-slate-900 font-medium">{a.artistName}</td>
                  <td className="py-2.5 text-slate-700 text-right tabular-nums">{a.units}</td>
                  <td className="py-2.5 text-slate-500 text-right tabular-nums">{fmtUsd(a.perUnitCents)}</td>
                  <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(a.earningsCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Per-unit rate is set per referred artist (default $1.00). NPO and person referrers both earn the same way; GoodTunes funds the kickback from platform fees.
        </p>
      </Card>
    </div>
  );
}

// ─── Task #77 — Super-admin god-view tabs ─────────────────────────────

function deltaSub(curr: number, prior: number, formatter: (n: number) => string = (n) => n.toLocaleString()): string {
  if (prior === 0 && curr === 0) return "vs prior: —";
  const delta = curr - prior;
  const pct = prior === 0 ? null : delta / prior;
  const sign = delta > 0 ? "+" : "";
  const pctStr = pct === null ? "n/a" : `${sign}${(pct * 100).toFixed(1)}%`;
  return `vs prior ${formatter(prior)} (${pctStr})`;
}

function OverviewTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/kpis", qs],
    queryFn: () => fetchJson(`/api/admin/reports/kpis?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState testId="loading-overview" />;
  const p = data.prior ?? {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="GMV" value={fmtUsd(data.gmvCents)} sub={deltaSub(data.gmvCents, p.gmvCents ?? 0, fmtUsd)} /></Card>
        <Card><Stat label="Net (platform)" value={fmtUsd(data.netCents)} sub={deltaSub(data.netCents, p.netCents ?? 0, fmtUsd)} /></Card>
        <Card><Stat label="Paid orders" value={data.orderCount.toLocaleString()} sub={deltaSub(data.orderCount, p.orderCount ?? 0)} /></Card>
        <Card><Stat label="Unique buyers" value={data.uniqueBuyers.toLocaleString()} sub={deltaSub(data.uniqueBuyers, p.uniqueBuyers ?? 0)} /></Card>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="New signups" value={data.newSignups.toLocaleString()} sub={deltaSub(data.newSignups, p.newSignups ?? 0)} /></Card>
        <Card><Stat label="Plays" value={(data.plays ?? 0).toLocaleString()} sub={deltaSub(data.plays ?? 0, p.plays ?? 0)} /></Card>
        <Card><Stat label="Unique listeners" value={(data.uniqueListeners ?? 0).toLocaleString()} sub={deltaSub(data.uniqueListeners ?? 0, p.uniqueListeners ?? 0)} /></Card>
        <Card><Stat label="Conversion" value={fmtPct(data.conversionRate)} sub={`${data.firstPurchases} of ${data.visits} visitor sessions`} /></Card>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="DAU" value={data.dau.toLocaleString()} sub="last 24h sessions" /></Card>
        <Card><Stat label="WAU" value={data.wau.toLocaleString()} sub="last 7d sessions" /></Card>
        <Card><Stat label="MAU" value={data.mau.toLocaleString()} sub="last 30d sessions" /></Card>
        <Card><Stat label="Refund rate" value={fmtPct(data.refundRate)} sub={`${data.refundedCount} refunded`} /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">GMV & signups over time</h3>
          <ExportLink href={`/api/admin/reports/kpis.csv?${qs}`} label="CSV" />
        </div>
        {data.orderCount === 0 && data.newSignups === 0 ? (
          <EmptyState message="No activity in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} />
              <Tooltip formatter={(v: number, name: string) => name === "gmvCents" ? fmtUsd(v) : v.toLocaleString()} />
              <Line yAxisId="left" type="monotone" dataKey="gmvCents" stroke={BLUE} strokeWidth={2} dot={false} name="GMV" />
              <Line yAxisId="right" type="monotone" dataKey="signups" stroke={MINT} strokeWidth={2} dot={false} name="Signups" />
              <Line yAxisId="right" type="monotone" dataKey="orders" stroke={PURPLE} strokeWidth={2} dot={false} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function RevenueTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/revenue", qs],
    queryFn: () => fetchJson(`/api/admin/reports/revenue?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <BreakdownTable title="Revenue by SKU kind" rows={data.bySku.map((r: any) => ({ key: r.kind, name: r.kind, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=sku&${qs}`} />
      <BreakdownTable title="Top labels by revenue" rows={data.byLabel.map((r: any) => ({ key: r.id, name: r.name, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=label&${qs}`} />
      <BreakdownTable title="Top artists by revenue" rows={data.byArtist.map((r: any) => ({ key: r.id, name: r.name, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=artist&${qs}`} />
      <BreakdownTable title="Revenue by country" rows={data.byCountry.map((r: any) => ({ key: r.country, name: r.country, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=country&${qs}`} />
    </div>
  );
}

function BreakdownTable({ title, rows, csv }: { title: string; rows: Array<{ key: string; name: string; units: number; cents: number }>; csv: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <ExportLink href={csv} label="CSV" />
      </div>
      {rows.length === 0 ? (
        <EmptyState message="No data in this range." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 font-bold">Name</th>
              <th className="py-2 font-bold text-right">Units</th>
              <th className="py-2 font-bold text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-100" data-testid={`row-breakdown-${r.key}`}>
                <td className="py-2.5 text-slate-900 font-medium">{r.name || "—"}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.units.toLocaleString()}</td>
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function EngagementTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/top-content", qs],
    queryFn: () => fetchJson(`/api/admin/reports/top-content?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <TopList title="Top tracks" rows={data.songs} columns={[{ label: "Title", key: "title" }, { label: "Artist", key: "artist" }]} csv={`/api/admin/reports/top-content.csv?dim=songs&${qs}`} testIdPrefix="row-track" idKey="songId" />
      <TopList title="Top albums" rows={data.albums} columns={[{ label: "Album", key: "title" }, { label: "Artist", key: "artist" }]} csv={`/api/admin/reports/top-content.csv?dim=albums&${qs}`} testIdPrefix="row-album" idKey="albumId" />
      <TopList title="Top artists" rows={data.artists} columns={[{ label: "Artist", key: "name" }]} csv={`/api/admin/reports/top-content.csv?dim=artists&${qs}`} testIdPrefix="row-artist" idKey="artistId" />
      <TopList title="Top labels" rows={data.labels} columns={[{ label: "Label", key: "name" }]} csv={`/api/admin/reports/top-content.csv?dim=labels&${qs}`} testIdPrefix="row-label" idKey="labelId" />
    </div>
  );
}

function TopList({ title, rows, columns, csv, testIdPrefix, idKey }: { title: string; rows: any[]; columns: Array<{ label: string; key: string }>; csv: string; testIdPrefix: string; idKey: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <ExportLink href={csv} label="CSV" />
      </div>
      {rows.length === 0 ? (
        <EmptyState message="No plays in this range." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              {columns.map((c) => <th key={c.key} className="py-2 font-bold">{c.label}</th>)}
              <th className="py-2 font-bold text-right">Plays</th>
              <th className="py-2 font-bold text-right">Listeners</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[idKey]} className="border-b border-slate-100" data-testid={`${testIdPrefix}-${r[idKey]}`}>
                {columns.map((c) => <td key={c.key} className="py-2.5 text-slate-900 font-medium">{r[c.key] || "—"}</td>)}
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{r.plays.toLocaleString()}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.listeners.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function FunnelsTab() {
  const { data } = useQuery<{ funnelUrl: string | null; retentionUrl: string | null; host: string }>({
    queryKey: ["/api/admin/reports/posthog"],
    queryFn: () => fetchJson(`/api/admin/reports/posthog`),
  });
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Funnel — visit → play → checkout</h3>
        {data?.funnelUrl ? (
          <iframe
            src={data.funnelUrl}
            className="w-full h-[520px] rounded-md border border-slate-200 bg-slate-50"
            data-testid="iframe-posthog-funnel"
            title="PostHog funnel"
          />
        ) : (
          <PosthogPlaceholder envVar="POSTHOG_FUNNEL_EMBED_URL" host={data?.host} />
        )}
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Cohort retention</h3>
        {data?.retentionUrl ? (
          <iframe
            src={data.retentionUrl}
            className="w-full h-[520px] rounded-md border border-slate-200 bg-slate-50"
            data-testid="iframe-posthog-retention"
            title="PostHog retention"
          />
        ) : (
          <PosthogPlaceholder envVar="POSTHOG_RETENTION_EMBED_URL" host={data?.host} />
        )}
      </Card>
    </div>
  );
}

function PosthogPlaceholder({ envVar, host }: { envVar: string; host?: string }) {
  return (
    <div className="py-10 text-center text-sm text-slate-500 bg-slate-50 rounded-md border border-dashed border-slate-200" data-testid={`empty-${envVar.toLowerCase()}`}>
      <p className="font-medium text-slate-700">PostHog embed not configured.</p>
      <p className="mt-2">Set <code className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[12px]">{envVar}</code> to a PostHog shared-dashboard iframe URL.</p>
      {host && <p className="text-[11px] text-slate-400 mt-1">Detected host: {host}</p>}
    </div>
  );
}

function OpsTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/ops", qs],
    queryFn: () => fetchJson(`/api/admin/reports/ops?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card><Stat label="Stuck fulfillments" value={data.stuckFulfillments.count.toLocaleString()} sub={`older than ${data.stuckFulfillments.threshold}`} /></Card>
        <Card><Stat label="Failed checkouts · 24h" value={(data.failedCheckouts.last24hCount ?? 0).toLocaleString()} sub="abandoned / never paid" /></Card>
        <Card><Stat label="Failed checkouts · 7d" value={(data.failedCheckouts.last7dCount ?? 0).toLocaleString()} sub="abandoned / never paid" /></Card>
        <Card><Stat label="Refund rate" value={fmtPct(data.refunds.rate)} sub={`${data.refunds.refundedInRange} of ${data.refunds.paidInRange}`} /></Card>
        <Card><Stat label="Chargeback rate" value={data.chargebackRate == null ? "—" : fmtPct(data.chargebackRate)} sub={data.chargebackRate == null ? "dispute webhook not ingested" : "from Stripe disputes"} /></Card>
        <Card><Stat label="Stuck payouts" value={data.stuckPayoutCount.toLocaleString()} sub="shipped, not transferred" /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Stuck OD fulfillments</h3>
          <ExportLink href={`/api/admin/reports/ops/stuck.csv?${qs}`} label="CSV" />
        </div>
        {data.stuckFulfillments.rows.length === 0 ? (
          <EmptyState message="No stuck fulfillments — Order Desk is keeping up." />
        ) : (
          <table className="w-full text-sm" data-testid="table-stuck-fulfillments">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Order</th>
                <th className="py-2 font-bold">Buyer</th>
                <th className="py-2 font-bold">Status</th>
                <th className="py-2 font-bold">OD id</th>
                <th className="py-2 font-bold text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.stuckFulfillments.rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100" data-testid={`row-stuck-${r.id}`}>
                  <td className="py-2.5 text-slate-900 font-mono text-[12px]">{r.id.slice(0, 8)}</td>
                  <td className="py-2.5 text-slate-700">{r.buyerName || r.buyerEmail || "—"}</td>
                  <td className="py-2.5 text-slate-700">{r.fulfillmentStatus}</td>
                  <td className="py-2.5 text-slate-500 font-mono text-[12px]">{r.orderDeskOrderId || "—"}</td>
                  <td className="py-2.5 text-slate-500 text-right tabular-nums">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Pending checkouts (never advanced)</h3>
          <ExportLink href={`/api/admin/reports/ops/failed.csv?${qs}`} label="CSV" />
        </div>
        {data.failedCheckouts.rows.length === 0 ? (
          <EmptyState message="No abandoned checkouts in this range." />
        ) : (
          <table className="w-full text-sm" data-testid="table-failed-checkouts">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Order</th>
                <th className="py-2 font-bold">Buyer</th>
                <th className="py-2 font-bold text-right">Amount</th>
                <th className="py-2 font-bold text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.failedCheckouts.rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100" data-testid={`row-failed-${r.id}`}>
                  <td className="py-2.5 text-slate-900 font-mono text-[12px]">{r.id.slice(0, 8)}</td>
                  <td className="py-2.5 text-slate-700">{r.buyerEmail || "—"}</td>
                  <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.totalCents)}</td>
                  <td className="py-2.5 text-slate-500 text-right tabular-nums">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          {data.failedCheckouts.proxyNote || "Counts include abandoned Checkout Sessions that never advanced to paid."} Cross-check disputes at <code className="px-1 py-0.5 bg-slate-50 border border-slate-200 rounded">stripe.com/dashboard/payments/disputes</code>.
        </p>
      </Card>
    </div>
  );
}

function ReconciliationTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/reconciliation", qs],
    queryFn: () => fetchJson(`/api/admin/reports/reconciliation?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Payout reconciliation by owner</h3>
        <ExportLink href={`/api/admin/reports/reconciliation.csv?${qs}`} label="CSV" />
      </div>
      {data.rows.length === 0 ? (
        <EmptyState message="No shipped orders in this range." />
      ) : (
        <table className="w-full text-sm" data-testid="table-reconciliation">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 font-bold">Owner</th>
              <th className="py-2 font-bold">Stripe acct</th>
              <th className="py-2 font-bold text-right">Shipped</th>
              <th className="py-2 font-bold text-right">Transferred</th>
              <th className="py-2 font-bold text-right">Computed</th>
              <th className="py-2 font-bold text-right">Δ Delta</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r: any) => (
              <tr key={`${r.kind}:${r.id}`} className="border-b border-slate-100" data-testid={`row-recon-${r.id}`}>
                <td className="py-2.5">
                  <div className="text-slate-900 font-medium">{r.ownerName}</div>
                  <div className="text-[11px] text-slate-400">{r.kind}</div>
                </td>
                <td className="py-2.5 text-slate-500 font-mono text-[12px]">
                  {r.stripeAccountId || <span className="text-[#FF5470]">not connected</span>}
                  {r.stripeAccountId && !r.payoutsEnabled && <div className="text-[10px] text-[#FF5470]">payouts disabled</div>}
                </td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.shippedCount}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.transferredCount} · {fmtUsd(r.transferredCents)}</td>
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.computedCents)}</td>
                <td className={`py-2.5 text-right tabular-nums font-medium ${r.deltaCents > 0 ? "text-[#FF5470]" : "text-slate-500"}`}>{fmtUsd(r.deltaCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Δ Delta = computed (snapshot at ship) − transferred via Stripe Connect. Non-zero deltas surface owners with skipped/failed transfers that need a retry from the Payouts admin.
      </p>
    </Card>
  );
}

function RawEventsTab({ qs }: { qs: string }) {
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const filterQs = useMemo(() => {
    const p = new URLSearchParams(qs);
    if (name) p.set("name", name);
    if (userId) p.set("userId", userId);
    if (sessionId) p.set("sessionId", sessionId);
    return p.toString();
  }, [qs, name, userId, sessionId]);
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/events", filterQs],
    queryFn: () => fetchJson(`/api/admin/reports/events?${filterQs}`),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ev-name" className="text-[11px] text-slate-500">Event name</Label>
          <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="play_start" className="h-9 w-[180px]" data-testid="input-event-name" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ev-user" className="text-[11px] text-slate-500">User id</Label>
          <Input id="ev-user" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid…" className="h-9 w-[220px]" data-testid="input-event-user" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ev-session" className="text-[11px] text-slate-500">Session id</Label>
          <Input id="ev-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="session…" className="h-9 w-[220px]" data-testid="input-event-session" />
        </div>
        <ExportLink href={`/api/admin/reports/events.csv?${filterQs}`} label="CSV" />
      </div>
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : data.rows.length === 0 ? (
        <EmptyState message="No events match these filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-raw-events">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Time</th>
                <th className="py-2 font-bold">Event</th>
                <th className="py-2 font-bold">User</th>
                <th className="py-2 font-bold">Session</th>
                <th className="py-2 font-bold">Payload</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 align-top" data-testid={`row-event-${r.id}`}>
                  <td className="py-2 text-slate-500 text-[12px] whitespace-nowrap">{r.ts ? new Date(r.ts).toLocaleString() : ""}</td>
                  <td className="py-2 text-slate-900 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="py-2 text-slate-500 font-mono text-[11px]">{r.userId ? r.userId.slice(0, 8) : "—"}</td>
                  <td className="py-2 text-slate-500 font-mono text-[11px]">{r.sessionId ? r.sessionId.slice(0, 10) : "—"}</td>
                  <td className="py-2 text-slate-600 font-mono text-[11px] max-w-[400px] truncate">{r.payload ? JSON.stringify(r.payload) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Showing up to {data?.limit ?? 200} most-recent matching events. Use filters to drill down; download a 1,000-row CSV for analysis in a spreadsheet.
      </p>
    </Card>
  );
}

export default AdminReports;
