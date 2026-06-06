// Task #1425 — Manager rollup reporting dashboard.
//
// Stripe/ElevenLabs-grade overview at `/manager` for accounts with admin
// role="manager" (super_admin can target any manager via ?managerId=).
// Reads /api/manager/* — every endpoint is manager-scoped server-side.
// Drill-through to an individual roster artist routes to
// /artist?personId=… which is also gated server-side.
//
// Mirrors LabelDashboard.tsx in chrome, primitives, palette so the
// partner dashboards feel like one product. Headline view is the roster
// table; catalog/audience/orders match the label layout. Managers carry
// NO press provenance and NO self-serve invites, so the label-only
// PartnerDashboard tab, cert-runs, invited-by-press credit, contacts and
// invite panels are intentionally omitted here.

import { useMemo, useState } from "react";
import { formatUsd, formatUsdCents } from "@shared/money";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer, Legend, Line,
} from "recharts";
// Heart for song-favorite metrics, Star for artist-roster metrics —
// per docs/design-system.md the brand uses these two icons as a quick
// visual cue for what a count means (favorites vs roster size).
import { Heart, Star, Building2 } from "lucide-react";
import { RangePicker, CompareToggle } from "@/components/partner/dashboard-controls";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { BRAND, CHART_STACK_PALETTE, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";

type Range = { from: string; to: string };
type ManagerMe = {
  managerId: string; name: string; logoUrl: string | null; coverUrl: string | null;
  location: string | null; albumCount: number; songCount: number; rosterSize: number;
};
type Kpis = {
  grossCents: number; managerShareCents: number; refundedCents: number;
  units: number; buyers: number;
  plays: number; completions: number; completionRate: number;
  listeners: number; newFans: number;
  rosterSize: number; albumCount: number;
};
type Summary = { range: Range; compare: Range | null; current: Kpis; previous: Kpis | null };
type Timeseries = {
  range: Range;
  revenue: { day: string; skuKind: string; revenueCents: number }[];
  plays: { day: string; starts: number; completes: number; listeners: number }[];
};
type RevByArtist = {
  range: Range;
  artists: { personId: string; name: string }[];
  days: string[];
  points: { day: string; personId: string; revenueCents: number }[];
};
type Roster = {
  range: Range;
  artists: {
    personId: string; name: string; photoUrl: string | null; albumCount: number;
    revenueCents: number; managerShareCents: number; units: number; buyers: number;
    plays: number; listeners: number;
  }[];
};
type GeoPayload = {
  range: Range;
  buyers: { country: string; buyers: number; revenueCents: number }[];
  listeners: { country: string; listeners: number; plays: number }[];
};
type AlbumsPayload = {
  range: Range;
  albums: {
    albumId: string; title: string; artist: string; artwork: string | null;
    primaryArtistId: string | null;
    revenueCents: number; managerShareCents: number; units: number; buyers: number;
    plays: number; listeners: number;
  }[];
};
type Tracks = {
  range: Range;
  tracks: {
    songId: string; title: string; albumTitle: string; albumArtist: string;
    plays: number; completes: number; favorites: number; playlistAdds: number; shares: number;
  }[];
};
type OrdersPayload = {
  range: Range;
  orders: {
    id: string; createdAt: string; status: string; totalCents: number;
    managerShareCents: number; country: string | null;
    albumId: string; albumTitle: string; albumArtist: string;
    primaryArtistId: string | null;
  }[];
};

// Brand palette + chart helpers come from the shared token module so
// ManagerDashboard and ArtistDashboard reach the same hexes the CSS
// vars do (see client/src/lib/brand-tokens.ts).
const C = BRAND;

function colorFor(i: number) { return CHART_STACK_PALETTE[i % CHART_STACK_PALETTE.length]; }

const dollars = (c: number) => formatUsdCents(c, { maximumFractionDigits: 0 });
const dollarsCents = (c: number) => formatUsdCents(c);
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const pct = (x: number) => `${Math.round(x * 100)}%`;

const RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "12mo", label: "Last 12 months", days: 365 },
] as const;
type PresetId = (typeof RANGE_PRESETS)[number]["id"];

function toIso(d: Date) { return d.toISOString(); }
function rangeFor(preset: PresetId): Range {
  const to = new Date();
  const from = new Date(to.getTime() - (RANGE_PRESETS.find((p) => p.id === preset)!.days) * 86400_000);
  return { from: toIso(from), to: toIso(to) };
}

type SortKey = "revenue" | "units" | "plays" | "listeners" | "buyers" | "albumCount" | "name";

export function ManagerDashboard() {
  const [preset, setPreset] = useState<PresetId>("30d");
  const [compare, setCompare] = useState(true);
  const [tab, setTab] = useState<"overview" | "roster" | "catalog" | "orders">("overview");
  const range = useMemo(() => rangeFor(preset), [preset]);
  const qs = useMemo(() => {
    const u = new URLSearchParams({ from: range.from, to: range.to });
    if (!compare) u.set("compare", "off");
    const params = new URLSearchParams(window.location.search);
    const managerId = params.get("managerId");
    if (managerId) u.set("managerId", managerId);
    return u.toString();
  }, [range, compare]);
  const managerIdParam = useMemo(() => new URLSearchParams(window.location.search).get("managerId"), []);

  const me = useQuery<ManagerMe>({ queryKey: [`/api/manager/me?${qs}`] });

  if (me.error) {
    const msg = (me.error as any)?.message ?? "";
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="manager-dashboard-gate">
          <h1 className="text-2xl font-bold mb-2">Manager dashboard</h1>
          <p className="text-white/60 text-sm">
            {msg.includes("Super-admin") ? "Pass ?managerId= to inspect a specific manager."
              : msg.includes("Insufficient") ? "This dashboard is for manager accounts. Ask a super-admin to invite you."
              : msg.includes("Unauthorized") ? "Sign in with your manager account to continue."
              : "We couldn't load your manager scope. Please try again."}
          </p>
        </div>
      </main>
    );
  }

  const managerName = me.data?.name ?? "Your dashboard";
  const rosterSize = me.data?.rosterSize ?? 0;
  const albumCount = me.data?.albumCount ?? 0;

  return (
    <OperatorShell
      testId="manager-shell"
      roleLabel="Manager dashboard"
      name={managerName}
      logoUrl={me.data?.logoUrl ?? null}
      fallbackIcon={Building2}
      subtitle={`${rosterSize} artist${rosterSize === 1 ? "" : "s"} · ${albumCount} album${albumCount === 1 ? "" : "s"}`}
      headerActions={
        <>
          <RangePicker presets={RANGE_PRESETS} value={preset} onChange={setPreset} />
          <CompareToggle active={compare} onToggle={setCompare} />
        </>
      }
      tabs={MANAGER_TABS}
      activeTab={tab}
      onTabChange={setTab}
      spaceContent
    >
      {tab === "overview" && <OverviewTab qs={qs} />}
      {tab === "roster" && <RosterTab qs={qs} managerIdParam={managerIdParam} />}
      {tab === "catalog" && <CatalogTab qs={qs} />}
      {tab === "orders" && <OrdersTab qs={qs} managerIdParam={managerIdParam} />}
    </OperatorShell>
  );
}

const MANAGER_TABS = modulesForRole("manager") as ReadonlyArray<{
  id: "overview" | "roster" | "catalog" | "orders";
  label: string;
}>;
type ManagerTabId = (typeof MANAGER_TABS)[number]["id"];

// ─── KPI card ─────────────────────────────────────────────────────────
function delta(cur: number, prev: number | null | undefined): { val: string; positive: boolean } | null {
  if (prev == null || prev === 0) return null;
  const change = (cur - prev) / prev;
  if (!isFinite(change)) return null;
  return { val: `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`, positive: change >= 0 };
}
function Kpi({ label, value, sub, prev, testId }: { label: React.ReactNode; value: string; sub?: string; prev?: { cur: number; prev: number | null } | null; testId: string }) {
  const d = prev ? delta(prev.cur, prev.prev) : null;
  return (
    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4" data-testid={testId}>
      <p className="text-[11px] uppercase tracking-wider text-white/55 font-semibold">{label}</p>
      <p className="mt-1 text-2xl sm:text-[28px] font-bold tabular-nums" data-testid={`${testId}-value`}>{value}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {sub && <span className="text-white/55">{sub}</span>}
        {d && (
          <span className={`px-1.5 py-0.5 rounded-full font-semibold ${d.positive ? "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)]" : "bg-rose-500/15 text-rose-300"}`} data-testid={`${testId}-delta`}>
            {d.val}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────
function OverviewTab({ qs }: { qs: string }) {
  const summary = useQuery<Summary>({ queryKey: [`/api/manager/summary?${qs}`] });
  const series = useQuery<Timeseries>({ queryKey: [`/api/manager/timeseries?${qs}`] });
  const byArtist = useQuery<RevByArtist>({ queryKey: [`/api/manager/revenue-by-artist?${qs}`] });
  const geo = useQuery<GeoPayload>({ queryKey: [`/api/manager/geo?${qs}`] });
  const cur = summary.data?.current;
  const prev = summary.data?.previous ?? null;

  return (
    <>
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="kpi-grid">
        <Kpi label="Gross revenue" value={cur ? dollars(cur.grossCents) : "—"} sub={cur && cur.refundedCents ? `${dollars(cur.refundedCents)} refunded` : undefined} prev={cur ? { cur: cur.grossCents, prev: prev?.grossCents ?? null } : null} testId="kpi-gross" />
        <Kpi label="Units sold" value={cur ? compact(cur.units) : "—"} sub={cur ? `${cur.buyers} unique buyer${cur.buyers === 1 ? "" : "s"}` : undefined} prev={cur ? { cur: cur.units, prev: prev?.units ?? null } : null} testId="kpi-units" />
        <Kpi label="Total plays" value={cur ? compact(cur.plays) : "—"} sub={cur ? `${pct(cur.completionRate)} complete` : undefined} prev={cur ? { cur: cur.plays, prev: prev?.plays ?? null } : null} testId="kpi-plays" />
        <Kpi label="Unique listeners" value={cur ? compact(cur.listeners) : "—"} prev={cur ? { cur: cur.listeners, prev: prev?.listeners ?? null } : null} testId="kpi-listeners" />
        <Kpi label="New fans" value={cur ? compact(cur.newFans) : "—"} sub="First-ever play in window" prev={cur ? { cur: cur.newFans, prev: prev?.newFans ?? null } : null} testId="kpi-new-fans" />
        <Kpi label={<><Star className="w-3 h-3 inline -mt-0.5 mr-1 text-[color:var(--brand-mint)] fill-[color:var(--brand-mint)]" />Roster</>} value={cur ? compact(cur.rosterSize) : "—"} sub={cur ? `${cur.albumCount} album${cur.albumCount === 1 ? "" : "s"}` : undefined} testId="kpi-roster" />
        <Kpi label="Completion rate" value={cur ? pct(cur.completionRate) : "—"} sub={cur ? `${compact(cur.completions)} completions` : undefined} testId="kpi-completion" />
        <Kpi label="Avg. revenue / artist" value={cur && cur.rosterSize ? dollars(cur.grossCents / cur.rosterSize) : "—"} testId="kpi-arpa" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Daily revenue" subtitle="Across the entire roster" testId="chart-revenue">
          <RevenueChart data={series.data?.revenue ?? []} loading={series.isLoading} />
        </Card>
        <Card title="Daily plays" subtitle="Starts & unique listeners" testId="chart-plays">
          <PlaysChart data={series.data?.plays ?? []} loading={series.isLoading} />
        </Card>
        <Card title="Geography" subtitle="Buyers & listeners by country" testId="chart-geo">
          <GeoTable buyers={geo.data?.buyers ?? []} listeners={geo.data?.listeners ?? []} loading={geo.isLoading} />
        </Card>
      </section>

      <Card title="Revenue by artist" subtitle="Stacked daily revenue across the roster" testId="chart-rev-by-artist">
        <RevByArtistChart data={byArtist.data} loading={byArtist.isLoading} />
      </Card>
    </>
  );
}

// ─── Roster tab ───────────────────────────────────────────────────────
function RosterTab({ qs, managerIdParam }: { qs: string; managerIdParam: string | null }) {
  const roster = useQuery<Roster>({ queryKey: [`/api/manager/roster?${qs}`] });
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const rows = useMemo(() => {
    const list = [...(roster.data?.artists ?? [])];
    const get = (a: any): number | string => {
      switch (sortKey) {
        case "name": return a.name.toLowerCase();
        case "revenue": return a.revenueCents;
        case "units": return a.units;
        case "plays": return a.plays;
        case "listeners": return a.listeners;
        case "buyers": return a.buyers;
        case "albumCount": return a.albumCount;
      }
    };
    list.sort((a, b) => {
      const va = get(a); const vb = get(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [roster.data, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };

  const drillHref = (personId: string) => {
    const u = new URLSearchParams();
    u.set("personId", personId);
    if (managerIdParam) u.set("managerId", managerIdParam);
    return `/artist?${u.toString()}`;
  };

  return (
    <Card
      title="Roster"
      subtitle="Tap an artist to drill into their dashboard"
      testId="table-roster"
      action={<CsvButton href={`/api/manager/roster?${qs}&format=csv`} label="roster.csv" testId="export-roster" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-white/45 text-[11px] uppercase tracking-wider">
            <tr>
              <SortableTh label="Artist" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-left pr-3" />
              <SortableTh label="Albums" k="albumCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Revenue" k="revenue" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Units" k="units" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Buyers" k="buyers" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Plays" k="plays" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Listeners" k="listeners" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right pl-2" />
            </tr>
          </thead>
          <tbody>
            {roster.isLoading && <tr><td colSpan={7} className="py-6 text-center text-white/45">Loading…</td></tr>}
            {!roster.isLoading && rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-white/45">No artists on the roster yet.</td></tr>}
            {rows.map((a) => (
              <tr key={a.personId} className="border-t border-white/5 hover:bg-white/[0.02] transition" data-testid={`row-artist-${a.personId}`}>
                <td className="py-2 pr-3">
                  <Link href={drillHref(a.personId)}>
                    <a className="flex items-center gap-2 min-w-0 group" data-testid={`link-artist-${a.personId}`}>
                      {a.photoUrl ? (
                        <img src={a.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-[color:var(--brand-blue)]/20 flex items-center justify-center text-xs font-bold">{a.name.slice(0, 1).toUpperCase()}</div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold transition-colors group-hover:text-[color:var(--brand-blue)] group-hover:underline underline-offset-2">{a.name}</p>
                        <p className="truncate text-white/45 text-[11px]">{a.albumCount} album{a.albumCount === 1 ? "" : "s"}</p>
                      </div>
                    </a>
                  </Link>
                </td>
                <td className="px-2 text-right tabular-nums text-white/70">{a.albumCount}</td>
                <td className="px-2 text-right tabular-nums font-semibold">{dollars(a.revenueCents)}</td>
                <td className="px-2 text-right tabular-nums">{a.units}</td>
                <td className="px-2 text-right tabular-nums">{a.buyers}</td>
                <td className="px-2 text-right tabular-nums">{compact(a.plays)}</td>
                <td className="pl-2 text-right tabular-nums">{compact(a.listeners)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SortableTh({ label, k, sortKey, sortDir, onSort, className }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`${className ?? ""} font-medium py-2`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider ${active ? "text-white" : "text-white/45 hover:text-white/75"}`}
        data-testid={`sort-${k}`}
      >
        {label}
        <span className="text-[9px] w-2">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

// ─── Catalog tab ──────────────────────────────────────────────────────
function CatalogTab({ qs }: { qs: string }) {
  const tracks = useQuery<Tracks>({ queryKey: [`/api/manager/top-tracks?${qs}`] });
  const albums = useQuery<AlbumsPayload>({ queryKey: [`/api/manager/top-albums?${qs}`] });
  return (
    <>
      <Card
        title="Top albums"
        subtitle="Revenue, units, and plays in window"
        testId="table-top-albums"
        action={<CsvButton href={`/api/manager/top-albums?${qs}&format=csv`} label="albums.csv" testId="export-albums" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-white/45 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-2 pr-3">Album</th>
                <th className="text-right font-medium px-2">Revenue</th>
                <th className="text-right font-medium px-2">Units</th>
                <th className="text-right font-medium px-2">Buyers</th>
                <th className="text-right font-medium px-2">Plays</th>
                <th className="text-right font-medium pl-2">Listeners</th>
              </tr>
            </thead>
            <tbody>
              {albums.isLoading && <tr><td colSpan={6} className="py-6 text-center text-white/45">Loading…</td></tr>}
              {!albums.isLoading && (albums.data?.albums.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-white/45">No albums in scope.</td></tr>}
              {albums.data?.albums.map((a) => (
                <tr key={a.albumId} className="border-t border-white/5" data-testid={`row-album-${a.albumId}`}>
                  <td className="py-2 pr-3">
                    <Link href={`/album/${a.albumId}`}>
                      <a className="flex items-center gap-2 min-w-0 group" data-testid={`link-album-${a.albumId}`}>
                        {a.artwork && <img src={a.artwork} alt="" className="w-9 h-9 rounded object-cover" />}
                        <div className="min-w-0">
                          <p className="truncate font-semibold transition-colors group-hover:text-[color:var(--brand-blue)] group-hover:underline underline-offset-2">{a.title}</p>
                          <p className="truncate text-white/45 text-[11px]">{a.artist}</p>
                        </div>
                      </a>
                    </Link>
                  </td>
                  <td className="px-2 text-right tabular-nums font-semibold">{dollars(a.revenueCents)}</td>
                  <td className="px-2 text-right tabular-nums">{a.units}</td>
                  <td className="px-2 text-right tabular-nums">{a.buyers}</td>
                  <td className="px-2 text-right tabular-nums">{compact(a.plays)}</td>
                  <td className="pl-2 text-right tabular-nums">{compact(a.listeners)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Top tracks"
        subtitle="Plays, completions, favorites, playlist adds, shares"
        testId="table-top-tracks"
        action={<CsvButton href={`/api/manager/top-tracks?${qs}&format=csv`} label="tracks.csv" testId="export-tracks" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-white/45 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-2 pr-3">Track</th>
                <th className="text-right font-medium px-2">Plays</th>
                <th className="text-right font-medium px-2">Completes</th>
                <th className="text-right font-medium px-2">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Heart className="w-3 h-3 text-[color:var(--brand-pink)]" /> Favorites
                  </span>
                </th>
                <th className="text-right font-medium px-2">Playlist adds</th>
                <th className="text-right font-medium pl-2">Shares</th>
              </tr>
            </thead>
            <tbody>
              {tracks.isLoading && <tr><td colSpan={6} className="py-6 text-center text-white/45">Loading…</td></tr>}
              {!tracks.isLoading && (tracks.data?.tracks.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-white/45">No plays yet in this window.</td></tr>}
              {tracks.data?.tracks.map((t) => (
                <tr key={t.songId} className="border-t border-white/5" data-testid={`row-track-${t.songId}`}>
                  <td className="py-2 pr-3">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-white/45 text-[11px] truncate">{t.albumTitle} · {t.albumArtist}</p>
                  </td>
                  <td className="px-2 text-right tabular-nums">{compact(t.plays)}</td>
                  <td className="px-2 text-right tabular-nums">{compact(t.completes)}</td>
                  <td className="px-2 text-right tabular-nums text-[color:var(--brand-pink)]">{compact(t.favorites)}</td>
                  <td className="px-2 text-right tabular-nums">{compact(t.playlistAdds)}</td>
                  <td className="pl-2 text-right tabular-nums">{compact(t.shares)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ─── Orders tab ───────────────────────────────────────────────────────
function OrdersTab({ qs, managerIdParam }: { qs: string; managerIdParam: string | null }) {
  const orders = useQuery<OrdersPayload>({ queryKey: [`/api/manager/orders?${qs}`] });
  const drillHref = (personId: string) => {
    const u = new URLSearchParams();
    u.set("personId", personId);
    if (managerIdParam) u.set("managerId", managerIdParam);
    return `/artist?${u.toString()}`;
  };
  return (
    <Card
      title="Recent orders"
      subtitle="Across the entire roster"
      testId="table-orders"
      action={<CsvButton href={`/api/manager/orders?${qs}&format=csv`} label="orders.csv" testId="export-orders" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-white/45 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left font-medium py-2 pr-3">Date</th>
              <th className="text-left font-medium px-2">Album</th>
              <th className="text-left font-medium px-2">Artist</th>
              <th className="text-left font-medium px-2">Country</th>
              <th className="text-left font-medium px-2">Status</th>
              <th className="text-right font-medium pl-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.isLoading && <tr><td colSpan={6} className="py-6 text-center text-white/45">Loading…</td></tr>}
            {!orders.isLoading && (orders.data?.orders.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-white/45">No orders in this window.</td></tr>}
            {orders.data?.orders.map((o) => (
              <tr key={o.id} className="border-t border-white/5" data-testid={`row-order-${o.id}`}>
                <td className="py-2 pr-3 whitespace-nowrap text-white/75">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="px-2 truncate max-w-[200px]">
                  <Link href={`/album/${o.albumId}`}><a className="transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">{o.albumTitle}</a></Link>
                </td>
                <td className="px-2 truncate max-w-[160px] text-white/75">
                  {o.primaryArtistId ? (
                    <Link href={drillHref(o.primaryArtistId)}><a className="transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">{o.albumArtist}</a></Link>
                  ) : o.albumArtist}
                </td>
                <td className="px-2 text-white/65">{o.country ?? "—"}</td>
                <td className="px-2"><StatusPill status={o.status} /></td>
                <td className="pl-2 text-right tabular-nums font-semibold">{dollarsCents(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Charts & shared primitives ───────────────────────────────────────
const tooltipStyle = CHART_TOOLTIP_STYLE;

function Card({ title, subtitle, children, testId, action }: { title: string; subtitle?: string; children: React.ReactNode; testId: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {subtitle && <p className="text-white/45 text-[12px] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function CsvButton({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <a href={href} className="text-xs font-semibold text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors whitespace-nowrap" data-testid={`button-${testId}`}>
      ↓ {label}
    </a>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)]",
    shipped: "bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)]",
    refunded: "bg-rose-500/15 text-rose-300",
    pending: "bg-white/10 text-white/55",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] ?? "bg-white/10 text-white/55"}`}>{status}</span>;
}

function SkeletonBlock() {
  return <div className="h-48 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 animate-pulse" />;
}

function RevenueChart({ data, loading }: { data: Timeseries["revenue"]; loading: boolean }) {
  const rows = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of data) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenueCents / 100);
    return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day: day.slice(5), total }));
  }, [data]);
  if (loading) return <SkeletonBlock />;
  if (rows.length === 0) return <p className="py-10 text-center text-white/45 text-[13px]">No revenue in this window.</p>;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="day" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
          <YAxis stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatUsd(Number(v), { maximumFractionDigits: 0 })} />
          <Bar dataKey="total" fill={C.blue} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlaysChart({ data, loading }: { data: Timeseries["plays"]; loading: boolean }) {
  const rows = useMemo(() => data.map((r) => ({ day: r.day.slice(5), plays: r.starts, listeners: r.listeners })), [data]);
  if (loading) return <SkeletonBlock />;
  if (rows.length === 0) return <p className="py-10 text-center text-white/45 text-[13px]">No plays in this window.</p>;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <AreaChart data={rows}>
          <defs>
            <linearGradient id="playsFillLabel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.blue} stopOpacity={0.7} />
              <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="day" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
          <YAxis stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }} />
          <Area type="monotone" dataKey="plays" stroke={C.blue} fill="url(#playsFillLabel)" strokeWidth={2} />
          <Line type="monotone" dataKey="listeners" stroke={C.mint} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RevByArtistChart({ data, loading }: { data: RevByArtist | undefined; loading: boolean }) {
  // Pivot points → rows-by-day with one column per artist. Top N artists
  // by total revenue render individually; the long tail rolls up under
  // "Others" so the legend stays readable.
  const { rows, top, hasOthers } = useMemo(() => {
    if (!data) return { rows: [] as any[], top: [] as { personId: string; name: string }[], hasOthers: false };
    const totalByArtist = new Map<string, number>();
    for (const p of data.points) totalByArtist.set(p.personId, (totalByArtist.get(p.personId) ?? 0) + p.revenueCents);
    const ranked = Array.from(totalByArtist.entries()).sort((a, b) => b[1] - a[1]);
    const TOP = 8;
    const topIds = new Set(ranked.slice(0, TOP).map(([id]) => id));
    const top = data.artists.filter((a) => topIds.has(a.personId));
    const hasOthers = ranked.length > TOP;

    const byDay = new Map<string, Record<string, number>>();
    for (const p of data.points) {
      const day = p.day;
      if (!byDay.has(day)) byDay.set(day, {});
      const bucket = byDay.get(day)!;
      const key = topIds.has(p.personId) ? p.personId : "_others";
      bucket[key] = (bucket[key] ?? 0) + p.revenueCents / 100;
    }
    const rows = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, vals]) => ({ day: day.slice(5), ...vals }));
    return { rows, top, hasOthers };
  }, [data]);

  if (loading) return <SkeletonBlock />;
  if (rows.length === 0) return <p className="py-10 text-center text-white/45 text-[13px]">No revenue in this window.</p>;
  const nameById = new Map(top.map((a) => [a.personId, a.name] as const));

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="day" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
          <YAxis stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: any, key: any) => [formatUsd(Number(v), { maximumFractionDigits: 0 }), key === "_others" ? "Others" : (nameById.get(String(key)) ?? key)]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }} formatter={(v) => v === "_others" ? "Others" : (nameById.get(String(v)) ?? v)} />
          {top.map((a, i) => (
            <Bar key={a.personId} dataKey={a.personId} stackId="rev" fill={colorFor(i)} />
          ))}
          {hasOthers && <Bar dataKey="_others" stackId="rev" fill="rgba(255,255,255,0.25)" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GeoTable({ buyers, listeners, loading }: { buyers: GeoPayload["buyers"]; listeners: GeoPayload["listeners"]; loading: boolean }) {
  const merged = useMemo(() => {
    const m = new Map<string, { country: string; buyers: number; revenueCents: number; listeners: number; plays: number }>();
    for (const r of buyers) m.set(r.country, { country: r.country, buyers: r.buyers, revenueCents: r.revenueCents, listeners: 0, plays: 0 });
    for (const r of listeners) {
      const existing = m.get(r.country) ?? { country: r.country, buyers: 0, revenueCents: 0, listeners: 0, plays: 0 };
      existing.listeners = r.listeners; existing.plays = r.plays;
      m.set(r.country, existing);
    }
    return Array.from(m.values()).sort((a, b) => (b.buyers + b.listeners) - (a.buyers + a.listeners)).slice(0, 12);
  }, [buyers, listeners]);
  if (loading) return <SkeletonBlock />;
  if (merged.length === 0) return <p className="py-10 text-center text-white/45 text-[13px]">No geo data yet.</p>;
  const maxBuyers = Math.max(1, ...merged.map((r) => r.buyers));
  const maxListeners = Math.max(1, ...merged.map((r) => r.listeners));
  return (
    <div className="space-y-1.5" data-testid="geo-list">
      <div className="grid grid-cols-[1fr_60px_60px] gap-2 text-[10px] uppercase tracking-wider text-white/45 font-semibold px-1">
        <span>Country</span><span className="text-right">Buyers</span><span className="text-right">Listeners</span>
      </div>
      {merged.map((r) => (
        <div key={r.country} className="grid grid-cols-[1fr_60px_60px] gap-2 items-center text-[13px]" data-testid={`geo-row-${r.country}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-white/65 text-[11px] w-7">{r.country}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-[color:var(--brand-blue)]" style={{ width: `${(r.buyers / maxBuyers) * 100}%` }} />
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-[color:var(--brand-mint)]" style={{ width: `${(r.listeners / maxListeners) * 100}%` }} />
            </div>
          </div>
          <span className="text-right tabular-nums">{r.buyers}</span>
          <span className="text-right tabular-nums">{compact(r.listeners)}</span>
        </div>
      ))}
    </div>
  );
}
