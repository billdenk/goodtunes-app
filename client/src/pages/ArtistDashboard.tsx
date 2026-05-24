// Task #75 — Artist reporting dashboard.
//
// Stripe/ElevenLabs-grade overview at `/artist` for accounts with admin
// role="artist" (super_admin can target any person via ?personId=).
// Reads /api/artist/* — every endpoint is artist-scoped server-side.
//
// Layout: brand-dark page header, KPI strip, tabs (Overview / Audience /
// Catalog / Orders), date-range picker, comparison toggle, CSV export
// per table. Mobile-first single column at <640px, three-column dense
// layout at desktop breakpoints.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
// Heart for song-favorite metrics — keeps the artist dashboard's
// favourites column visually paired with the player's heart action.
import { Heart } from "lucide-react";
import { RangePicker, CompareToggle, DashboardTabs } from "@/components/partner/dashboard-controls";
import { BRAND, SKU_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";

type Range = { from: string; to: string };
type Kpis = {
  grossCents: number; artistShareCents: number; refundedCents: number;
  units: number; buyers: number;
  plays: number; completions: number; completionRate: number; listeners: number;
  topTrack: { song_id: string; title: string; plays: string } | null;
  topAlbum: { album_id: string; title: string; revenue: string } | null;
};
type Summary = { range: Range; compare: Range | null; current: Kpis; previous: Kpis | null };
type Timeseries = {
  range: Range;
  revenue: { day: string; skuKind: string; revenueCents: number }[];
  plays: { day: string; starts: number; completes: number; listeners: number }[];
};
type GeoPayload = {
  buyers: { country: string; buyers: number; revenueCents: number }[];
  listeners: { country: string; listeners: number; plays: number }[];
};
type Tracks = { tracks: { songId: string; title: string; albumTitle: string; plays: number; completes: number; favorites: number; playlistAdds: number; shares: number }[] };
type AlbumsPayload = { albums: { albumId: string; title: string; artist: string; artwork: string | null; revenueCents: number; artistShareCents: number; units: number; buyers: number; plays: number; listeners: number }[] };
type OrdersPayload = { orders: { id: string; createdAt: string; status: string; totalCents: number; artistShareCents: number | null; skuKind: string | null; origin: string; country: string | null; albumTitle: string }[] };
type Audience = {
  newListeners: number; returningListeners: number;
  repeatCohort: { range: string; listeners: number }[];
  topFans: { handle: string; plays: number }[];
};

// Brand palette + per-SKU chart mapping come from the shared token
// module so this dashboard reads from the same source as the CSS vars
// (see client/src/lib/brand-tokens.ts and client/src/index.css).
const C = BRAND;
const SKU_COLOR = SKU_COLORS;

const dollars = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const dollarsCents = (c: number) => `$${(c / 100).toFixed(2)}`;
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

export function ArtistDashboard() {
  const [preset, setPreset] = useState<PresetId>("30d");
  const [compare, setCompare] = useState(true);
  const [tab, setTab] = useState<"overview" | "audience" | "catalog" | "orders" | "referrals">("overview");
  const range = useMemo(() => rangeFor(preset), [preset]);
  const qs = useMemo(() => {
    const u = new URLSearchParams({ from: range.from, to: range.to });
    if (!compare) u.set("compare", "off");
    // Super-admin override: pass through ?personId= if the URL has it.
    const params = new URLSearchParams(window.location.search);
    const personId = params.get("personId");
    if (personId) u.set("personId", personId);
    return u.toString();
  }, [range, compare]);

  const me = useQuery<{
    personId: string; name: string; albumCount: number; songCount: number; photoUrl?: string | null;
    invitedPress?: { id: string; name: string; logoUrl: string | null } | null;
    hasShippedFirst?: boolean;
  }>({
    queryKey: ["/api/artist/me", qs],
  });

  // Friendly error surface — artist accounts that aren't fully wired
  // (no person scope) or fans landing here get an actionable message
  // instead of a blank page.
  if (me.error) {
    const msg = (me.error as any)?.message ?? "";
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="artist-dashboard-gate">
          <h1 className="text-2xl font-bold mb-2">Artist dashboard</h1>
          <p className="text-white/60 text-sm">{msg.includes("Super-admin") ? "Pass ?personId= to inspect a specific artist." : msg.includes("Insufficient") ? "This dashboard is for artist accounts. Ask your label admin to invite you." : msg.includes("Unauthorized") ? "Sign in with your artist account to continue." : "We couldn't load your artist scope. Please try again."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--brand-bg)] text-white pb-20">
      <Header
        artistName={me.data?.name ?? "Your dashboard"}
        photoUrl={me.data?.photoUrl ?? null}
        albumCount={me.data?.albumCount ?? 0}
        songCount={me.data?.songCount ?? 0}
        invitedPress={me.data?.invitedPress ?? null}
        hasShippedFirst={!!me.data?.hasShippedFirst}
        preset={preset}
        onPreset={setPreset}
        compare={compare}
        onCompare={setCompare}
      />

      <Tabs tab={tab} onTab={setTab} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 space-y-6">
        {tab === "overview" && <OverviewTab qs={qs} />}
        {tab === "audience" && <AudienceTab qs={qs} />}
        {tab === "catalog" && <CatalogTab qs={qs} />}
        {tab === "orders" && <OrdersTab qs={qs} />}
        {tab === "referrals" && <ReferralsTab />}
      </div>
    </main>
  );
}

// ─── Page chrome ──────────────────────────────────────────────────────
function Header({ artistName, photoUrl, albumCount, songCount, invitedPress, hasShippedFirst, preset, onPreset, compare, onCompare }: {
  artistName: string; photoUrl: string | null; albumCount: number; songCount: number;
  invitedPress: { id: string; name: string; logoUrl: string | null } | null;
  hasShippedFirst: boolean;
  preset: PresetId; onPreset: (p: PresetId) => void;
  compare: boolean; onCompare: (c: boolean) => void;
}) {
  return (
    <header className="border-b border-white/10 bg-gradient-to-b from-[color:var(--brand-header-gradient-top)] to-[color:var(--brand-bg)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-4 mb-6">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-14 h-14 rounded-full object-cover ring-1 ring-white/15" data-testid="img-artist-photo" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[color:var(--brand-blue)]/20 ring-1 ring-white/15 flex items-center justify-center text-xl font-bold">
              {artistName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white/55 text-[12px] uppercase tracking-wider font-semibold">Artist dashboard</p>
            <h1 className="text-2xl sm:text-3xl font-bold truncate" data-testid="text-artist-name">{artistName}</h1>
            <p className="text-white/55 text-[12px] mt-0.5">{albumCount} album{albumCount === 1 ? "" : "s"} · {songCount} credited track{songCount === 1 ? "" : "s"}</p>
          </div>
        </div>
        {invitedPress && <InvitedByPressRow press={invitedPress} hasShippedFirst={hasShippedFirst} />}
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker presets={RANGE_PRESETS} value={preset} onChange={onPreset} />
          <CompareToggle active={compare} onToggle={onCompare} />
        </div>
      </div>
    </header>
  );
}

// Task #205 — Read-only "Invited by {Press}" credit. Quietly fades to
// "Originally invited by …" once the partner has shipped their first
// physical run; the contact link routes to the in-app GoodTunes chat so
// they can request a switch without an unlock button on this page.
function InvitedByPressRow({ press, hasShippedFirst }: {
  press: { id: string; name: string; logoUrl: string | null };
  hasShippedFirst: boolean;
}) {
  const prefix = hasShippedFirst ? "Originally invited by" : "Invited by";
  return (
    <div
      className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 ring-1 ${hasShippedFirst ? "bg-white/[0.03] ring-white/10 text-white/55" : "bg-white/[0.05] ring-white/15 text-white/75"}`}
      data-testid="row-invited-by-press"
    >
      {press.logoUrl ? (
        <img src={press.logoUrl} alt="" className="w-5 h-5 rounded-sm object-cover" />
      ) : (
        <div className="w-5 h-5 rounded-sm bg-white/10" />
      )}
      <span className="text-[12px]">
        {prefix}{" "}
        <span className="font-semibold text-white/90" data-testid="text-invited-press-name">{press.name}</span>
      </span>
      {!hasShippedFirst && (
        <>
          <span className="text-white/25">·</span>
          <a
            href="/chat"
            className="text-xs font-semibold text-[color:var(--brand-blue)] hover:underline"
            data-testid="link-message-goodtunes"
          >
            Message GoodTunes to switch
          </a>
        </>
      )}
    </div>
  );
}

const ARTIST_TABS = [
  { id: "overview", label: "Overview" },
  { id: "audience", label: "Audience" },
  { id: "catalog", label: "Catalog" },
  { id: "orders", label: "Orders" },
  { id: "referrals", label: "Referrals" },
] as const;
type ArtistTabId = (typeof ARTIST_TABS)[number]["id"];

function Tabs({ tab, onTab }: { tab: ArtistTabId; onTab: (t: ArtistTabId) => void }) {
  return <DashboardTabs tabs={ARTIST_TABS} value={tab} onChange={onTab} />;
}

// ─── KPI card ─────────────────────────────────────────────────────────
function delta(cur: number, prev: number | null | undefined): { val: string; positive: boolean } | null {
  if (prev == null || prev === 0) return null;
  const change = (cur - prev) / prev;
  if (!isFinite(change)) return null;
  return { val: `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`, positive: change >= 0 };
}

function Kpi({ label, value, sub, prev, testId }: { label: string; value: string; sub?: string; prev?: { cur: number; prev: number | null } | null; testId: string }) {
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

// ─── Tabs ─────────────────────────────────────────────────────────────
function OverviewTab({ qs }: { qs: string }) {
  const summary = useQuery<Summary>({ queryKey: ["/api/artist/summary", qs] });
  const series = useQuery<Timeseries>({ queryKey: ["/api/artist/timeseries", qs] });
  const geo = useQuery<GeoPayload & { range: Range }>({ queryKey: ["/api/artist/geo", qs] });
  const cur = summary.data?.current;
  const prev = summary.data?.previous ?? null;

  return (
    <>
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="kpi-grid">
        <Kpi label="Gross revenue" value={cur ? dollars(cur.grossCents) : "—"} sub={cur && cur.refundedCents ? `${dollars(cur.refundedCents)} refunded` : undefined} prev={cur ? { cur: cur.grossCents, prev: prev?.grossCents ?? null } : null} testId="kpi-gross" />
        <Kpi label="Artist share" value={cur ? dollars(cur.artistShareCents) : "—"} prev={cur ? { cur: cur.artistShareCents, prev: prev?.artistShareCents ?? null } : null} testId="kpi-artist-share" />
        <Kpi label="Units sold" value={cur ? compact(cur.units) : "—"} sub={cur ? `${cur.buyers} unique buyer${cur.buyers === 1 ? "" : "s"}` : undefined} prev={cur ? { cur: cur.units, prev: prev?.units ?? null } : null} testId="kpi-units" />
        <Kpi label="Total plays" value={cur ? compact(cur.plays) : "—"} sub={cur ? `${compact(cur.listeners)} listeners · ${pct(cur.completionRate)} complete` : undefined} prev={cur ? { cur: cur.plays, prev: prev?.plays ?? null } : null} testId="kpi-plays" />
        <Kpi label="Unique listeners" value={cur ? compact(cur.listeners) : "—"} prev={cur ? { cur: cur.listeners, prev: prev?.listeners ?? null } : null} testId="kpi-listeners" />
        <Kpi label="Top track" value={cur?.topTrack?.title ?? "—"} sub={cur?.topTrack ? `${Number(cur.topTrack.plays).toLocaleString()} plays` : undefined} testId="kpi-top-track" />
        <Kpi label="Top album" value={cur?.topAlbum?.title ?? "—"} sub={cur?.topAlbum ? dollars(Number(cur.topAlbum.revenue)) : undefined} testId="kpi-top-album" />
        <Kpi label="Completion rate" value={cur ? pct(cur.completionRate) : "—"} sub={cur ? `${compact(cur.completions)} completions` : undefined} testId="kpi-completion" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Daily revenue" subtitle="By SKU type" testId="chart-revenue">
          <RevenueChart data={series.data?.revenue ?? []} loading={series.isLoading} />
        </Card>
        <Card title="Daily plays" subtitle="Starts & unique listeners" testId="chart-plays">
          <PlaysChart data={series.data?.plays ?? []} loading={series.isLoading} />
        </Card>
        <Card title="Geography" subtitle="Buyers & listeners by country" testId="chart-geo">
          <GeoTable buyers={geo.data?.buyers ?? []} listeners={geo.data?.listeners ?? []} loading={geo.isLoading} />
        </Card>
      </section>
    </>
  );
}

function AudienceTab({ qs }: { qs: string }) {
  const aud = useQuery<Audience & { range: Range }>({ queryKey: ["/api/artist/audience", qs] });
  if (aud.isLoading) return <SkeletonBlock />;
  const d = aud.data;
  if (!d) return null;
  const total = d.newListeners + d.returningListeners;
  return (
    <>
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="New listeners" value={compact(d.newListeners)} sub={total ? `${pct(d.newListeners / total)} of total` : undefined} testId="kpi-new-listeners" />
        <Kpi label="Returning listeners" value={compact(d.returningListeners)} sub={total ? `${pct(d.returningListeners / total)} of total` : undefined} testId="kpi-returning-listeners" />
        <Kpi label="Engaged fans" value={compact(d.repeatCohort.filter((b) => b.range !== "1").reduce((s, b) => s + b.listeners, 0))} sub="2+ plays in window" testId="kpi-engaged" />
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Repeat-listener cohort" subtitle="Listeners by play count" testId="chart-cohort">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={d.repeatCohort}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="range" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="listeners" fill={C.mint} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top fans" subtitle="Anonymized — plays in window" testId="table-top-fans">
          <table className="w-full text-[13px]">
            <thead className="text-white/45 text-[11px] uppercase tracking-wider">
              <tr><th className="text-left font-medium py-2">Fan</th><th className="text-right font-medium">Plays</th></tr>
            </thead>
            <tbody>
              {d.topFans.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-white/45">No fans yet in this window.</td></tr>}
              {d.topFans.map((f, i) => (
                <tr key={i} className="border-t border-white/5" data-testid={`row-fan-${i}`}>
                  <td className="py-2 font-mono text-white/75">{f.handle}</td>
                  <td className="py-2 text-right tabular-nums">{compact(f.plays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </>
  );
}

function CatalogTab({ qs }: { qs: string }) {
  const tracks = useQuery<Tracks & { range: Range }>({ queryKey: ["/api/artist/top-tracks", qs] });
  const albums = useQuery<AlbumsPayload & { range: Range }>({ queryKey: ["/api/artist/top-albums", qs] });
  return (
    <>
      <Card
        title="Top albums"
        subtitle="Revenue, units, and plays in window"
        testId="table-top-albums"
        action={<CsvButton href={`/api/artist/top-albums?${qs}&format=csv`} label="albums.csv" testId="export-albums" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-white/45 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-2 pr-3">Album</th>
                <th className="text-right font-medium px-2">Revenue</th>
                <th className="text-right font-medium px-2">Artist share</th>
                <th className="text-right font-medium px-2">Units</th>
                <th className="text-right font-medium px-2">Buyers</th>
                <th className="text-right font-medium px-2">Plays</th>
                <th className="text-right font-medium pl-2">Listeners</th>
              </tr>
            </thead>
            <tbody>
              {albums.isLoading && <tr><td colSpan={7} className="py-6 text-center text-white/45">Loading…</td></tr>}
              {!albums.isLoading && (albums.data?.albums.length ?? 0) === 0 && <tr><td colSpan={7} className="py-6 text-center text-white/45">No albums in scope.</td></tr>}
              {albums.data?.albums.map((a) => (
                <tr key={a.albumId} className="border-t border-white/5" data-testid={`row-album-${a.albumId}`}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {a.artwork && <img src={a.artwork} alt="" className="w-9 h-9 rounded object-cover" />}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.title}</p>
                        <p className="truncate text-white/45 text-[11px]">{a.artist}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 text-right tabular-nums font-semibold">{dollars(a.revenueCents)}</td>
                  <td className="px-2 text-right tabular-nums text-[color:var(--brand-mint)]">{dollars(a.artistShareCents)}</td>
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
        action={<CsvButton href={`/api/artist/top-tracks?${qs}&format=csv`} label="tracks.csv" testId="export-tracks" />}
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
                    <p className="text-white/45 text-[11px] truncate">{t.albumTitle}</p>
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

function OrdersTab({ qs }: { qs: string }) {
  const orders = useQuery<OrdersPayload & { range: Range }>({ queryKey: ["/api/artist/orders", qs] });
  return (
    <Card
      title="Recent orders"
      subtitle="Reconciles to your Stripe payouts"
      testId="table-orders"
      action={<CsvButton href={`/api/artist/orders?${qs}&format=csv`} label="orders.csv" testId="export-orders" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-white/45 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left font-medium py-2 pr-3">Date</th>
              <th className="text-left font-medium px-2">Album</th>
              <th className="text-left font-medium px-2">SKU</th>
              <th className="text-left font-medium px-2">Origin</th>
              <th className="text-left font-medium px-2">Country</th>
              <th className="text-left font-medium px-2">Status</th>
              <th className="text-right font-medium px-2">Total</th>
              <th className="text-right font-medium pl-2">Your share</th>
            </tr>
          </thead>
          <tbody>
            {orders.isLoading && <tr><td colSpan={8} className="py-6 text-center text-white/45">Loading…</td></tr>}
            {!orders.isLoading && (orders.data?.orders.length ?? 0) === 0 && <tr><td colSpan={8} className="py-6 text-center text-white/45">No orders in this window.</td></tr>}
            {orders.data?.orders.map((o) => (
              <tr key={o.id} className="border-t border-white/5" data-testid={`row-order-${o.id}`}>
                <td className="py-2 pr-3 whitespace-nowrap text-white/75">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="px-2 truncate max-w-[200px]">{o.albumTitle}</td>
                <td className="px-2 text-white/65">{o.skuKind ?? "—"}</td>
                <td className="px-2 text-white/65">{o.origin?.startsWith("shopify:") ? "Shopify" : "Direct"}</td>
                <td className="px-2 text-white/65">{o.country ?? "—"}</td>
                <td className="px-2"><StatusPill status={o.status} /></td>
                <td className="px-2 text-right tabular-nums font-semibold">{dollarsCents(o.totalCents)}</td>
                <td className="pl-2 text-right tabular-nums text-[color:var(--brand-mint)]">{o.artistShareCents != null ? dollarsCents(o.artistShareCents) : "—"}</td>
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
  // Pivot from rows-per-day-per-sku → wide rows for stacked bars.
  const { rows, skuKinds } = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>();
    const skus = new Set<string>();
    for (const r of data) {
      if (!byDay.has(r.day)) byDay.set(r.day, {});
      const row = byDay.get(r.day)!;
      row[r.skuKind] = (row[r.skuKind] || 0) + r.revenueCents / 100;
      skus.add(r.skuKind);
    }
    const rows = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, vals]) => ({ day: day.slice(5), ...vals }));
    return { rows, skuKinds: Array.from(skus) };
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
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `$${Number(v).toFixed(0)}`} />
          <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }} />
          {skuKinds.map((sku) => (
            <Bar key={sku} dataKey={sku} stackId="rev" fill={SKU_COLOR[sku] || "rgba(255,255,255,0.4)"} />
          ))}
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
            <linearGradient id="playsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.blue} stopOpacity={0.7} />
              <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="day" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
          <YAxis stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }} />
          <Area type="monotone" dataKey="plays" stroke={C.blue} fill="url(#playsFill)" strokeWidth={2} />
          <Line type="monotone" dataKey="listeners" stroke={C.mint} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function GeoTable({ buyers, listeners, loading }: { buyers: GeoPayload["buyers"]; listeners: GeoPayload["listeners"]; loading: boolean }) {
  // Merge by country code so we get one row per country with both
  // dimensions side-by-side. A real map ships in a follow-up.
  const merged = useMemo(() => {
    const m = new Map<string, { country: string; buyers: number; revenueCents: number; listeners: number; plays: number }>();
    for (const r of buyers) m.set(r.country, { country: r.country, buyers: r.buyers, revenueCents: r.revenueCents, listeners: 0, plays: 0 });
    for (const r of listeners) {
      const existing = m.get(r.country) ?? { country: r.country, buyers: 0, revenueCents: 0, listeners: 0, plays: 0 };
      existing.listeners = r.listeners;
      existing.plays = r.plays;
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

// ─── Referrals tab (Task #78) ─────────────────────────────────────────
// Surfaces $1/unit credits the artist has accrued by referring other
// artists onto the platform. Tab is always visible — empty state nudges
// the artist to reach out to the GoodTunes team to refer a peer.
function ReferralsTab() {
  const q = useQuery<{
    pendingCents: number;
    pendingCount: number;
    paidCents: number;
    partners: { id: string; name: string; photoUrl: string | null; units: number; pendingCents: number }[];
    nonProfits: { id: string; name: string; logoUrl: string | null }[];
  }>({ queryKey: ["/api/artist/referrals"] });
  if (q.isLoading) {
    return <p className="py-10 text-center text-white/45 text-[13px]">Loading…</p>;
  }
  if (q.isError) {
    return <p className="py-10 text-center text-white/45 text-[13px]">Couldn't load referrals.</p>;
  }
  const d = q.data!;
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="referrals-kpis">
        <Kpi label="Pending payout" value={fmt(d.pendingCents)} sub={`${d.pendingCount} unit${d.pendingCount === 1 ? "" : "s"} this period`} testId="kpi-ref-pending" />
        <Kpi label="Paid out" value={fmt(d.paidCents)} testId="kpi-ref-paid" />
        <Kpi label="Referred artists" value={String(d.partners.length)} testId="kpi-ref-count" />
      </section>
      <Card title="Artists you've referred" subtitle="$1 per paid unit, for life" testId="table-referred-artists">
        {d.partners.length === 0 ? (
          <p className="py-8 text-center text-white/55 text-[13px]" data-testid="empty-referrals">
            You haven't referred anyone yet. Email <a className="underline" href="mailto:nick@goodtunes.fm">nick@goodtunes.fm</a> to refer an artist —
            you'll earn $1 on every paid unit they ship.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {d.partners.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3" data-testid={`row-referred-${p.id}`}>
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-white/5" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-[11px] text-white/55">{p.units} unit{p.units === 1 ? "" : "s"} attributed</p>
                </div>
                <span className="text-[color:var(--brand-mint)] tabular-nums font-semibold text-sm">{fmt(p.pendingCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {d.nonProfits.length > 0 && (
        <Card title="Non-profits you've referred" testId="table-referred-npos">
          <ul className="divide-y divide-white/5" data-testid="list-referred-npos">
            {d.nonProfits.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3" data-testid={`row-referred-npo-${o.id}`}>
                {o.logoUrl ? (
                  <img src={o.logoUrl} alt="" className="w-10 h-10 rounded object-cover bg-white/5" />
                ) : (
                  <div className="w-10 h-10 rounded bg-white/5" />
                )}
                <p className="flex-1 min-w-0 font-semibold truncate">{o.name}</p>
                <span className="text-[11px] text-white/55 uppercase tracking-wider">Non-profit</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
