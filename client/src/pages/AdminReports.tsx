import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
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

function useDateRange() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400_000);
  const [from, setFrom] = useState(isoDay(monthAgo));
  const [to, setTo] = useState(isoDay(today));
  return { from, to, setFrom, setTo };
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
  role: "super_admin" | "label" | "artist" | "org" | "manufacturer" | "fulfillment";
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
    queryFn: () =>
      fetch(`/api/partner/reports/scope?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });

  const isSuper = scope?.role === "super_admin" && !scope.viewAs;
  const isOrg = scope?.role === "org";
  const showReferrals = isOrg || scope?.role === "artist" || isSuper;

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
                className="h-9 rounded-md border border-slate-200 px-2 text-sm"
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

        <Tabs defaultValue="sales" className="w-full">
          <TabsList className="bg-white border border-slate-200 p-1 h-auto flex-wrap">
            <TabsTrigger value="sales" data-testid="tab-sales">Sales</TabsTrigger>
            <TabsTrigger value="plays" data-testid="tab-plays">Plays & GoodSync</TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts">Payouts</TabsTrigger>
            <TabsTrigger value="redemption" data-testid="tab-redemption">Shopify redemption</TabsTrigger>
            <TabsTrigger value="fans" data-testid="tab-fans">Top fans</TabsTrigger>
            <TabsTrigger value="map" data-testid="tab-map">Fan map</TabsTrigger>
            {showReferrals && (
              <TabsTrigger value="referrals" data-testid="tab-referrals">Referrals</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="sales"><SalesTab qs={qs} /></TabsContent>
          <TabsContent value="plays"><PlaysTab qs={qs} /></TabsContent>
          <TabsContent value="payouts"><PayoutsTab qs={qs} /></TabsContent>
          <TabsContent value="redemption"><RedemptionTab qs={qs} /></TabsContent>
          <TabsContent value="fans"><TopFansTab qs={qs} /></TabsContent>
          <TabsContent value="map"><FanMapTab qs={qs} /></TabsContent>
          {showReferrals && <TabsContent value="referrals"><ReferralsTab qs={qs} /></TabsContent>}
        </Tabs>
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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/partner/reports/sales", qs],
    queryFn: () => fetch(`/api/partner/reports/sales?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading || !data) return <div className="py-12 text-slate-500 text-sm" data-testid="loading-sales">Loading…</div>;
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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/partner/reports/plays", qs],
    queryFn: () => fetch(`/api/partner/reports/plays?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading || !data) return <div className="py-12 text-slate-500 text-sm">Loading…</div>;
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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/partner/reports/payouts", qs],
    queryFn: () => fetch(`/api/partner/reports/payouts?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading || !data) return <div className="py-12 text-slate-500 text-sm">Loading…</div>;
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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/partner/reports/redemption", qs],
    queryFn: () => fetch(`/api/partner/reports/redemption?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading || !data) return <div className="py-12 text-slate-500 text-sm">Loading…</div>;
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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/partner/reports/top-fans", qs],
    queryFn: () => fetch(`/api/partner/reports/top-fans?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading || !data) return <div className="py-12 text-slate-500 text-sm">Loading…</div>;
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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/partner/reports/fan-map", qs],
    queryFn: () => fetch(`/api/partner/reports/fan-map?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading || !data) return <div className="py-12 text-slate-500 text-sm">Loading map…</div>;
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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/partner/reports/referrals", qs],
    queryFn: () => fetch(`/api/partner/reports/referrals?${qs}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading || !data) return <div className="py-12 text-slate-500 text-sm">Loading…</div>;
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

export default AdminReports;
