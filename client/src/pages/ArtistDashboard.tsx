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
import { useEffect, useMemo, useState } from "react";
import { formatUsd, formatUsdCents } from "@shared/money";
import { Link, useSearch, useRoute, useLocation } from "wouter";
import { SalesMap, type SalesGeoPayload } from "@/components/partner/SalesMap";
import { PartnerDashboard } from "@/components/partner/PartnerDashboard";
import { BreakEvenBar } from "@/components/BreakEvenBar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
// Heart for song-favorite metrics — keeps the artist dashboard's
// favourites column visually paired with the player's heart action.
import {
  Heart, User as UserIcon, Users, Users2, LayoutDashboard, BarChart3, Megaphone,
  Disc3, ShoppingBag, FileBarChart, UserCheck, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AcquisitionTab } from "@/components/operator/AcquisitionTab";
import { RangePicker, CompareToggle } from "@/components/partner/dashboard-controls";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { AdminReports } from "@/pages/AdminReports";
// Task #2524 — an artist opening one of their albums stays INSIDE this portal
// shell; AdminAlbum renders in `embedded` mode (no operator /admin chrome).
import { AdminAlbum } from "@/pages/AdminAlbum";
import { CertRunsSection } from "@/components/partner/cert-runs-section";
import { BuyerReport } from "@/components/partner/BuyerReport";
import { BRAND, SKU_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";
import {
  KpiCard, KpiCardSkeleton, kpiInfoKeyFromTestId, type KpiCardModel,
} from "@/components/admin/KpiCard";
// Task #2495 — reuse the shared super-admin "Add a person" search control
// (internal catalog search → Spotify → create-from-name) for the artist
// Referrals invite, instead of a bespoke name field.
import { PersonPicker, type PersonLite } from "@/components/admin/AddPeopleMenu";

// PersonPicker needs an excludeIds set; the artist invite never excludes
// anyone, so reuse one stable empty set.
const NO_EXCLUDE: Set<string> = new Set();

type Range = { from: string; to: string };
type Kpis = {
  grossCents: number; artistShareCents: number; refundedCents: number;
  units: number; orders: number; buyers: number;
  plays: number; completions: number; completionRate: number; listeners: number;
  excludedPlays?: number;
  topTrack: { song_id: string; title: string; plays: string } | null;
  topAlbum: { album_id: string; title: string; revenue: string } | null;
};
type Lifetime = {
  grossCents: number; units: number; orders: number; buyers: number;
  refundedCents: number; plays: number; listeners: number; excludedPlays?: number;
};
type Summary = { range: Range; compare: Range | null; current: Kpis; previous: Kpis | null; lifetime?: Lifetime | null };
type Timeseries = {
  range: Range;
  revenue: { day: string; skuKind: string; revenueCents: number }[];
  plays: { day: string; starts: number; completes: number; listeners: number }[];
};
type GeoPayload = {
  sales?: SalesGeoPayload;
};
type Tracks = { tracks: { songId: string; title: string; albumTitle: string; plays: number; completes: number; favorites: number; playlistAdds: number; shares: number }[] };
type AlbumsPayload = { albums: { albumId: string; title: string; artist: string; artwork: string | null; revenueCents: number; artistShareCents: number; units: number; buyers: number; plays: number; listeners: number }[] };
type OrdersPayload = { orders: { id: string; createdAt: string; status: string; totalCents: number; artistShareCents: number | null; skuKind: string | null; origin: string; country: string | null; albumTitle: string }[] };
type Audience = {
  newListeners: number; returningListeners: number;
  repeatCohort: { range: string; listeners: number }[];
  topFans: { handle: string; plays: number }[];
  excludedPlays?: number;
};

// Brand palette + per-SKU chart mapping come from the shared token
// module so this dashboard reads from the same source as the CSS vars
// (see client/src/lib/brand-tokens.ts and client/src/index.css).
const C = BRAND;
const SKU_COLOR = SKU_COLORS;

const dollars = (c: number) => formatUsdCents(c, { maximumFractionDigits: 0 });
const dollarsCents = (c: number) => formatUsdCents(c);
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const pct = (x: number) => `${Math.round(x * 100)}%`;
// Task #2525 — comp/preview/operator/internal listens are stripped from every
// fan metric; surface the removed volume so operators still see it wasn't lost.
const excludedNote = (n?: number) => (n && n > 0 ? `${compact(n)} comp/internal excluded` : undefined);
const joinSub = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;

const RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "12mo", label: "Last 12 months", days: 365 },
] as const;
type PresetId = (typeof RANGE_PRESETS)[number]["id"];

// Task #2486 — Dashboard-tab KPI tiles carry the picked window as
// `?range=<preset>` using the shared PartnerDashboard preset vocab
// (today/7d/30d/90d/all); map it into this shell's own preset ids
// (today→7d nearest-narrow, all→12mo nearest-wide) so a drill-down
// lands on the same window.
const RANGE_FROM_DASHBOARD: Record<string, PresetId> = {
  today: "7d", "7d": "7d", "30d": "30d", "90d": "90d", "12mo": "12mo", all: "12mo",
};
function presetFromSearch(search: string): PresetId | null {
  const r = new URLSearchParams(search).get("range");
  return r ? (RANGE_FROM_DASHBOARD[r] ?? null) : null;
}

function toIso(d: Date) { return d.toISOString(); }
function rangeFor(preset: PresetId): Range {
  const to = new Date();
  const from = new Date(to.getTime() - (RANGE_PRESETS.find((p) => p.id === preset)!.days) * 86400_000);
  return { from: toIso(from), to: toIso(to) };
}

export function ArtistDashboard() {
  const [preset, setPreset] = useState<PresetId>(() => presetFromSearch(window.location.search) ?? "30d");
  const [compare, setCompare] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "overview" | "audience" | "acquisition" | "catalog" | "orders" | "buyers" | "referrals" | "people" | "reports">(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "dashboard" || t === "overview" || t === "audience" || t === "acquisition" || t === "catalog" || t === "orders" || t === "buyers" || t === "referrals" || t === "people" || t === "reports") return t;
    return "dashboard";
  });
  // Task #2486 — Dashboard-tab KPI tiles deep-link via `?tab=…` (wouter
  // pushState). This tab state is seeded once from the URL, so mirror
  // later `?tab=` changes back into it; onTabChange's own replaceState
  // lands here too as an idempotent no-op.
  const search = useSearch();
  useEffect(() => {
    const t = new URLSearchParams(search).get("tab");
    if (t === "dashboard" || t === "overview" || t === "audience" || t === "acquisition" || t === "catalog" || t === "orders" || t === "buyers" || t === "referrals" || t === "people" || t === "reports") {
      setTab(t);
    }
    const p = presetFromSearch(search);
    if (p) setPreset(p);
  }, [search]);
  // Task #2486 — the range picker writes `?range=` back to the URL so it
  // stays the single source of truth: a KPI deep-link and the picker both
  // funnel through the URL, so the `[search]` sync above can never clobber
  // a later picker choice with a stale `?range=` (e.g. on a tab switch).
  const applyPreset = (p: PresetId) => {
    setPreset(p);
    const sp = new URLSearchParams(window.location.search);
    sp.set("range", p);
    history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
  };
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
    queryKey: [`/api/artist/me?${qs}`],
  });

  // Task #2524 — `/artist/albums/:id` opens that album's admin page embedded in
  // this portal shell instead of the operator `/admin/albums/:id` chrome. When
  // matched we force the Catalog tab active, drop the section header/date
  // controls (the album page renders its own), and route tab clicks back out to
  // the portal home so the artist can leave the album view.
  const [isAlbumView, albumRouteParams] = useRoute<{ id: string }>("/artist/albums/:id");
  const [, setLocation] = useLocation();
  const albumViewId = isAlbumView ? (albumRouteParams?.id ?? null) : null;

  // Friendly error surface — artist accounts that aren't fully wired
  // (no person scope) or fans landing here get an actionable message
  // instead of a blank page.
  if (me.error) {
    const msg = (me.error as any)?.message ?? "";
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="artist-dashboard-gate">
          <h1 className="text-2xl font-bold mb-2">Artist dashboard</h1>
          <p className="text-slate-500 text-sm">{msg.includes("Super-admin") ? "Pass ?personId= to inspect a specific artist." : msg.includes("Insufficient") ? "This dashboard is for artist accounts. Ask your label admin to invite you." : msg.includes("Unauthorized") ? "Sign in with your artist account to continue." : "We couldn't load your artist scope. Please try again."}</p>
        </div>
      </main>
    );
  }

  const artistName = me.data?.name ?? "Your dashboard";
  const albumCount = me.data?.albumCount ?? 0;
  const songCount = me.data?.songCount ?? 0;
  // The page header names the CURRENT section (not the artist) so it always
  // agrees with the highlighted nav item.
  const currentTabLabel = ARTIST_TABS.find((t) => t.id === tab)?.label ?? "";

  return (
    <OperatorShell
      testId="artist-shell"
      roleLabel="Artist dashboard"
      name={artistName}
      logoUrl={me.data?.photoUrl ?? null}
      fallbackIcon={UserIcon}
      logoShape="circle"
      // The header names the CURRENT section (Dashboard / Overview / …) in the
      // super-admin AdminPageHeader treatment — big title left, range picker +
      // compare inline right, bottom hairline — so it always agrees with the
      // highlighted nav item. The artist's identity (avatar + name) lives only
      // in the rail + mobile top strip, so it isn't repeated as the page H1.
      //
      // Dashboard renders the shared PartnerDashboard primitive and Reports
      // renders the embedded AdminReports — both carry their OWN section
      // header + date range — so on those two sections we suppress the shell
      // page header entirely (no pageTitle, hideHeaderIdentity, no
      // headerActions) to avoid a duplicate title + duplicate range control.
      pageTitle={albumViewId || tab === "dashboard" || tab === "reports" ? undefined : currentTabLabel}
      hideHeaderIdentity={!!albumViewId || tab === "dashboard" || tab === "reports"}
      headerActions={
        albumViewId || tab === "dashboard" || tab === "reports" ? undefined : (
          <>
            <RangePicker presets={RANGE_PRESETS} value={preset} onChange={applyPreset} />
            <CompareToggle active={compare} onToggle={setCompare} />
          </>
        )
      }
      tabs={ARTIST_TABS}
      activeTab={albumViewId ? "catalog" : tab}
      onTabChange={(newTab) => {
        // In the embedded album view, a tab click leaves the album and lands on
        // the portal home for that tab.
        if (albumViewId) {
          setLocation(`/artist?tab=${newTab}`);
          return;
        }
        setTab(newTab);
        const sp = new URLSearchParams(window.location.search);
        sp.set("tab", newTab);
        history.replaceState(null, "", `${window.location.pathname}?${sp}`);
      }}
      spaceContent
      layout="leftnav"
      navIcons={{
        dashboard: LayoutDashboard,
        overview: BarChart3,
        audience: Users,
        acquisition: Megaphone,
        catalog: Disc3,
        orders: ShoppingBag,
        buyers: UserCheck,
        referrals: UserPlus,
        people: Users2,
        reports: FileBarChart,
      }}
    >
      {/* Task #2524 — embedded album view takes over the content area (Catalog
          tab active), rendering AdminAlbum without the operator /admin chrome.
          Back link returns to the portal catalog list. */}
      {albumViewId ? (
        <AdminAlbum
          embedded
          albumId={albumViewId}
          backHref="/artist?tab=catalog"
        />
      ) : (
        <>
      {tab === "dashboard" && (
        <PartnerDashboard
          scope="artist"
          sectionTitle="Dashboard"
          title={artistName}
          subtitle={
            <>
              {albumCount} album{albumCount === 1 ? "" : "s"} ·{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("catalog");
                  const sp = new URLSearchParams(window.location.search);
                  sp.set("tab", "catalog");
                  history.replaceState(null, "", `${window.location.pathname}?${sp}`);
                }}
                className="underline underline-offset-2 decoration-slate-300 hover:text-slate-700 transition-colors"
                data-testid="link-credited-tracks"
              >
                {songCount} credited track{songCount === 1 ? "" : "s"}
              </button>
            </>
          }
          scopeIdQs={new URLSearchParams(window.location.search).get("personId")}
        />
      )}
      {tab === "overview" && <OverviewTab qs={qs} />}
      {tab === "audience" && <AudienceTab qs={qs} />}
      {tab === "acquisition" && (
        <AcquisitionTab
          kind="artist"
          scopeId={new URLSearchParams(window.location.search).get("personId")}
          rangeQs={qs}
        />
      )}
      {tab === "catalog" && <CatalogTab qs={qs} />}
      {tab === "orders" && <OrdersTab qs={qs} />}
      {tab === "buyers" && <BuyersTab qs={qs} personId={me.data?.personId ?? null} />}
      {tab === "referrals" && <ReferralsTab />}
      {tab === "people" && <ArtistPeoplePanel />}
      {/* Task #2522 — Reports renders the shared AdminReports in `embedded`
          mode so the artist stays inside their own portal shell (no /admin
          chrome). Scope is resolved server-side from the caller (or ?personId=
          for a viewing-as super-admin), exactly as the god-view page does. */}
      {tab === "reports" && <AdminReports embedded />}
        </>
      )}
    </OperatorShell>
  );
}

const ARTIST_TABS = modulesForRole("artist") as ReadonlyArray<{
  id: "dashboard" | "overview" | "audience" | "acquisition" | "catalog" | "orders" | "buyers" | "referrals" | "people" | "reports";
  label: string;
}>;
type ArtistTabId = (typeof ARTIST_TABS)[number]["id"];

// ─── KPI card ─────────────────────────────────────────────────────────
// Thin adapter onto the shared house KPI primitive (KpiCard). Callers keep
// their pre-formatted display strings (dollars()/compact()/pct()) via
// `valueText`; the raw numeric `prev.cur`/`prev.prev` drive the delta pill.
// A KPI with no `prev` is a point-in-time figure → suppress the "vs prior"
// row entirely (hideDelta) so it reads as a clean headline.
function Kpi({
  label, value, sub, prev, testId, spark,
}: {
  label: string; value: string; sub?: string;
  prev?: { cur: number; prev: number | null } | null;
  testId: string; spark?: number[] | null;
}) {
  const model: KpiCardModel = {
    id: kpiInfoKeyFromTestId(testId),
    label,
    value: prev ? prev.cur : null,
    prior: prev ? prev.prev : null,
    valueText: value === "—" ? undefined : value,
    format: "number",
    note: sub,
    hideDelta: !prev,
  };
  return <KpiCard model={model} testId={testId} spark={spark ?? null} />;
}

// Daily series → sparkline points for the range-windowed KPIs. Gross rolls
// per-SKU revenue rows up by day; plays/listeners ride the daily plays rows.
// Empty series returns [] so KpiCard simply omits the spark.
function dailyGross(series?: Timeseries): number[] {
  if (!series?.revenue?.length) return [];
  const byDay = new Map<string, number>();
  for (const r of series.revenue) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenueCents);
  return Array.from(byDay.keys()).sort().map((d) => byDay.get(d)!);
}
function dailyPlays(series?: Timeseries): number[] {
  if (!series?.plays?.length) return [];
  return [...series.plays].sort((a, b) => (a.day < b.day ? -1 : 1)).map((p) => p.starts);
}
function dailyListeners(series?: Timeseries): number[] {
  if (!series?.plays?.length) return [];
  return [...series.plays].sort((a, b) => (a.day < b.day ? -1 : 1)).map((p) => p.listeners);
}

// Task #1334 — All-time "since launch" headline. Lives ABOVE the
// range-windowed KPI grid and is visually distinct (mint accent, "All
// time" eyebrow) so the lifetime figures are never confused with the
// date-range numbers below. Reconciles with the buyer-roster totals at
// /admin/people/:id/buyers.
function LifetimeBanner({ data, loading }: { data?: Lifetime | null; loading?: boolean }) {
  return (
    <section
      className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-4 sm:p-5"
      data-testid="lifetime-banner"
    >
      <p className="text-xs uppercase tracking-wider font-semibold text-emerald-700 mb-3" data-testid="lifetime-label">
        All time · since launch
      </p>
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? (
          <>
            <KpiCardSkeleton testId="lifetime-gross-skeleton" />
            <KpiCardSkeleton testId="lifetime-orders-skeleton" />
            <KpiCardSkeleton testId="lifetime-units-skeleton" />
            <KpiCardSkeleton testId="lifetime-plays-skeleton" />
          </>
        ) : (
          <>
            <Kpi label="Gross revenue" value={data ? dollars(data.grossCents) : "—"} sub={data && data.refundedCents ? `${dollars(data.refundedCents)} refunded` : undefined} testId="lifetime-gross" />
            <Kpi label="Orders" value={data ? compact(data.orders) : "—"} sub={data ? `${compact(data.buyers)} unique fan${data.buyers === 1 ? "" : "s"}` : undefined} testId="lifetime-orders" />
            <Kpi label="Units sold" value={data ? compact(data.units) : "—"} testId="lifetime-units" />
            <Kpi label="Total plays" value={data ? compact(data.plays) : "—"} sub={data ? joinSub(`${compact(data.listeners)} listeners`, excludedNote(data.excludedPlays)) : undefined} testId="lifetime-plays" />
          </>
        )}
      </section>
    </section>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────
function OverviewTab({ qs }: { qs: string }) {
  const summary = useQuery<Summary>({ queryKey: [`/api/artist/summary?${qs}`] });
  const series = useQuery<Timeseries>({ queryKey: [`/api/artist/timeseries?${qs}`] });
  const geo = useQuery<GeoPayload & { range: Range }>({ queryKey: [`/api/artist/geo?${qs}`] });
  const cur = summary.data?.current;
  const prev = summary.data?.previous ?? null;
  const lifetime = summary.data?.lifetime ?? null;

  return (
    <>
      <LifetimeBanner data={lifetime} loading={summary.isLoading} />

      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wider font-semibold text-slate-400" data-testid="kpi-range-label">
          Selected date range
        </p>
      </div>
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="kpi-grid">
        {summary.isLoading ? (
          Array.from({ length: 9 }).map((_, i) => (
            <KpiCardSkeleton key={i} testId={`kpi-skeleton-${i}`} />
          ))
        ) : (
          <>
            <Kpi label="Gross revenue" value={cur ? dollars(cur.grossCents) : "—"} sub={cur && cur.refundedCents ? `${dollars(cur.refundedCents)} refunded` : undefined} prev={cur ? { cur: cur.grossCents, prev: prev?.grossCents ?? null } : null} spark={dailyGross(series.data)} testId="kpi-gross" />
            <Kpi label="Artist share" value={cur ? dollars(cur.artistShareCents) : "—"} prev={cur ? { cur: cur.artistShareCents, prev: prev?.artistShareCents ?? null } : null} testId="kpi-artist-share" />
            <Kpi label="Units sold" value={cur ? compact(cur.units) : "—"} sub={cur ? `${cur.buyers} unique buyer${cur.buyers === 1 ? "" : "s"}` : undefined} prev={cur ? { cur: cur.units, prev: prev?.units ?? null } : null} testId="kpi-units" />
            <Kpi label="Orders" value={cur ? compact(cur.orders) : "—"} sub={cur ? `${compact(cur.units)} cop${cur.units === 1 ? "y" : "ies"}` : undefined} prev={cur ? { cur: cur.orders, prev: prev?.orders ?? null } : null} testId="kpi-orders" />
            <Kpi label="Total plays" value={cur ? compact(cur.plays) : "—"} sub={cur ? joinSub(`${compact(cur.listeners)} listeners · ${pct(cur.completionRate)} complete`, excludedNote(cur.excludedPlays)) : undefined} prev={cur ? { cur: cur.plays, prev: prev?.plays ?? null } : null} spark={dailyPlays(series.data)} testId="kpi-plays" />
            <Kpi label="Unique listeners" value={cur ? compact(cur.listeners) : "—"} prev={cur ? { cur: cur.listeners, prev: prev?.listeners ?? null } : null} spark={dailyListeners(series.data)} testId="kpi-listeners" />
            <Kpi label="Top track" value={cur?.topTrack?.title ?? "—"} sub={cur?.topTrack ? `${Number(cur.topTrack.plays).toLocaleString()} plays` : undefined} testId="kpi-top-track" />
            <Kpi label="Top album" value={cur?.topAlbum?.title ?? "—"} sub={cur?.topAlbum ? dollars(Number(cur.topAlbum.revenue)) : undefined} testId="kpi-top-album" />
            <Kpi label="Completion rate" value={cur ? pct(cur.completionRate) : "—"} sub={cur ? `${compact(cur.completions)} completions` : undefined} testId="kpi-completion" />
          </>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Daily revenue" subtitle="By SKU type" testId="chart-revenue">
          <RevenueChart data={series.data?.revenue ?? []} loading={series.isLoading} />
        </Card>
        <Card title="Daily plays" subtitle="Starts & unique listeners" testId="chart-plays">
          <PlaysChart data={series.data?.plays ?? []} loading={series.isLoading} />
        </Card>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid="chart-geo">
        <SalesMap data={geo.data?.sales} loading={geo.isLoading} />
      </section>

      <CertRunsSection kind="artist" qs={qs} />
    </>
  );
}

function AudienceTab({ qs }: { qs: string }) {
  const aud = useQuery<Audience & { range: Range }>({ queryKey: [`/api/artist/audience?${qs}`] });
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
      {d.excludedPlays && d.excludedPlays > 0 ? (
        <p className="text-xs text-slate-400" data-testid="text-audience-excluded">
          Excludes {compact(d.excludedPlays)} comp/preview, operator & internal play{d.excludedPlays === 1 ? "" : "s"} from these fan counts.
        </p>
      ) : null}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Repeat-listener cohort" subtitle="Listeners by play count" testId="chart-cohort">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={d.repeatCohort}>
                <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
                <XAxis dataKey="range" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="listeners" fill={C.mint} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top fans" subtitle="Anonymized — plays in window" testId="table-top-fans">
          <table className="w-full text-[13px]">
            <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
              <tr><th className="text-left font-medium py-2">Fan</th><th className="text-right font-medium">Plays</th></tr>
            </thead>
            <tbody>
              {d.topFans.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-slate-400">No fans yet in this window.</td></tr>}
              {d.topFans.map((f, i) => (
                <tr key={i} className="border-t border-slate-100" data-testid={`row-fan-${i}`}>
                  <td className="py-2 font-mono text-slate-600">{f.handle}</td>
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
  const tracks = useQuery<Tracks & { range: Range }>({ queryKey: [`/api/artist/top-tracks?${qs}`] });
  const albums = useQuery<AlbumsPayload & { range: Range }>({ queryKey: [`/api/artist/top-albums?${qs}`] });
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
            <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-2 pr-3">Album</th>
                <th className="text-left font-medium px-2 w-36">Break-even</th>
                <th className="text-right font-medium px-2">Revenue</th>
                <th className="text-right font-medium px-2">Artist share</th>
                <th className="text-right font-medium px-2">Units</th>
                <th className="text-right font-medium px-2">Buyers</th>
                <th className="text-right font-medium px-2">Plays</th>
                <th className="text-right font-medium pl-2">Listeners</th>
              </tr>
            </thead>
            <tbody>
              {albums.isLoading && <tr><td colSpan={8} className="py-6 text-center text-slate-400">Loading…</td></tr>}
              {!albums.isLoading && (albums.data?.albums.length ?? 0) === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">No albums in scope.</td></tr>}
              {albums.data?.albums.map((a) => (
                <tr key={a.albumId} className="border-t border-slate-100" data-testid={`row-album-${a.albumId}`}>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/artist/albums/${a.albumId}`}
                      className="flex items-center gap-2 min-w-0 group"
                      data-testid={`link-manage-album-${a.albumId}`}
                    >
                      {a.artwork && <img src={a.artwork} alt="" className="w-9 h-9 rounded object-cover" />}
                      <div className="min-w-0">
                        <p className="truncate font-semibold transition-colors group-hover:text-[color:var(--brand-blue)] group-hover:underline underline-offset-2">{a.title}</p>
                        <p className="truncate text-slate-400 text-[11px]">{a.artist}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-2 align-middle">
                    <BreakEvenBar albumId={a.albumId} tone="light" variant="compact" />
                  </td>
                  <td className="px-2 text-right tabular-nums font-semibold">{dollars(a.revenueCents)}</td>
                  <td className="px-2 text-right tabular-nums text-emerald-600">{dollars(a.artistShareCents)}</td>
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
            <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-2 pr-3">Track</th>
                <th className="text-right font-medium px-2">Plays</th>
                <th className="text-right font-medium px-2">Completes</th>
                <th className="text-right font-medium px-2">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Heart className="w-3 h-3 text-rose-500" /> Favorites
                  </span>
                </th>
                <th className="text-right font-medium px-2">Playlist adds</th>
                <th className="text-right font-medium pl-2">Shares</th>
              </tr>
            </thead>
            <tbody>
              {tracks.isLoading && <tr><td colSpan={6} className="py-6 text-center text-slate-400">Loading…</td></tr>}
              {!tracks.isLoading && (tracks.data?.tracks.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No plays yet in this window.</td></tr>}
              {tracks.data?.tracks.map((t) => (
                <tr key={t.songId} className="border-t border-slate-100" data-testid={`row-track-${t.songId}`}>
                  <td className="py-2 pr-3">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-slate-400 text-[11px] truncate">{t.albumTitle}</p>
                  </td>
                  <td className="px-2 text-right tabular-nums">{compact(t.plays)}</td>
                  <td className="px-2 text-right tabular-nums">{compact(t.completes)}</td>
                  <td className="px-2 text-right tabular-nums text-rose-500">{compact(t.favorites)}</td>
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
  const orders = useQuery<OrdersPayload & { range: Range }>({ queryKey: [`/api/artist/orders?${qs}`] });
  return (
    <Card
      title="Recent orders"
      subtitle="Reconciles to your Stripe payouts"
      testId="table-orders"
      action={<CsvButton href={`/api/artist/orders?${qs}&format=csv`} label="orders.csv" testId="export-orders" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
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
            {orders.isLoading && <tr><td colSpan={8} className="py-6 text-center text-slate-400">Loading…</td></tr>}
            {!orders.isLoading && (orders.data?.orders.length ?? 0) === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">No orders in this window.</td></tr>}
            {orders.data?.orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100" data-testid={`row-order-${o.id}`}>
                <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="px-2 truncate max-w-[200px]">{o.albumTitle}</td>
                <td className="px-2 text-slate-600">{o.skuKind ?? "—"}</td>
                <td className="px-2 text-slate-600">{o.origin?.startsWith("shopify:") ? "Shopify" : "Direct"}</td>
                <td className="px-2 text-slate-600">{o.country ?? "—"}</td>
                <td className="px-2"><StatusPill status={o.status} /></td>
                <td className="px-2 text-right tabular-nums font-semibold">{dollarsCents(o.totalCents)}</td>
                <td className="pl-2 text-right tabular-nums text-emerald-600">{o.artistShareCents != null ? dollarsCents(o.artistShareCents) : "—"}</td>
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
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {subtitle && <p className="text-slate-400 text-[12px] mt-0.5">{subtitle}</p>}
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
    paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    shipped: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    refunded: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] ?? "bg-slate-100 text-slate-700"}`}>{status}</span>;
}

function SkeletonBlock() {
  return <div className="h-48 rounded-2xl bg-white ring-1 ring-slate-200 animate-pulse" />;
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
  if (rows.length === 0) return <p className="py-10 text-center text-slate-400 text-[13px]">No revenue in this window.</p>;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatUsd(Number(v), { maximumFractionDigits: 0 })} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
          {skuKinds.map((sku) => (
            <Bar key={sku} dataKey={sku} stackId="rev" fill={SKU_COLOR[sku] || "rgba(15,23,42,0.25)"} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlaysChart({ data, loading }: { data: Timeseries["plays"]; loading: boolean }) {
  const rows = useMemo(() => data.map((r) => ({ day: r.day.slice(5), plays: r.starts, listeners: r.listeners })), [data]);
  if (loading) return <SkeletonBlock />;
  if (rows.length === 0) return <p className="py-10 text-center text-slate-400 text-[13px]">No plays in this window.</p>;
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
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
          <Area type="monotone" dataKey="plays" stroke={C.blue} fill="url(#playsFill)" strokeWidth={2} />
          <Line type="monotone" dataKey="listeners" stroke={C.mint} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Referrals tab (Task #78) ─────────────────────────────────────────
// Surfaces $1/unit credits the artist has accrued by referring other
// artists onto the platform. Tab is always visible — empty state nudges
// the artist to reach out to the GoodTunes team to refer a peer.
// Task #350 — Swap surface. Artist-to-artist invites are one-project
// only, with a "swap" rule: the original referrer can pre-elect the
// invitee for one of *their* projects in return, and the invitee can
// also pre-elect this referrer for one of theirs. Until either side
// commits, the credit on the inviter's project follows the default
// (referrer keeps it). After the album's first paid sale the swap is
// frozen — no more changes.
type SwapApiRow = {
  id: string;
  otherId: string;
  otherName: string;
  otherPhotoUrl: string | null;
  albumId: string | null;
  swapState: "referrer_keeps_full" | "invitee_keeps_full";
  preElectedAt: string | null;
  frozenAt: string | null;
};
type SwapRow = SwapApiRow & { role: "referrer" | "invitee" };

// Task #351 — Artist-portal teammate invite. Calls /api/artist/invites
// which is a server-side wrapper around the super-admin invite create
// path, locked to the caller's own artist scope. Manager/Team invites
// flow into the claimed-Person review queue if the target Person is
// claimed and the caller's email isn't on file.
// Task #2495 — "People" tab. Mirrors the super-admin People surface (Card +
// header primary + Add-in-a-modal), differing only in voice and the
// permission-scoped affordance set: an artist can invite managers/band
// members onto their OWN scope, but there is no roster read endpoint for
// artist teammates (team invites are excluded from the referral list on the
// server), so this stays create-only — no fabricated list.
function ArtistPeoplePanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "team">("team");
  // Task #351 — Resolve the caller's Person so the panel can show whose
  // team this is. The server-side wrapper hardcodes the caller's own scope;
  // we surface the name so the artist can confirm.
  const meQ = useQuery<{ person?: { name: string } | null } | null>({
    queryKey: ["/api/artist/me"],
  });
  const targetName = (meQ.data as any)?.person?.name ?? null;
  const m = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/artist/invites", { email: email.trim(), inviteRole });
      return r.json() as Promise<{ email: string; emailDelivered: boolean; reviewStatus?: string }>;
    },
    onSuccess: (data) => {
      setEmail("");
      setOpen(false);
      toast({
        title: data.reviewStatus === "pending_review" ? "Held for review" : data.emailDelivered ? "Invite sent" : "Invite created",
        description: data.reviewStatus === "pending_review"
          ? "GoodTunes will review and notify you when approved."
          : `Emailed ${data.email}.`,
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't invite", description: e.message, variant: "destructive" }),
  });
  return (
    <Card
      title="Your team"
      subtitle={targetName ? `People who help run ${targetName}` : "Managers and band members"}
      testId="artist-people-panel"
      action={
        <Button size="sm" onClick={() => setOpen(true)} data-testid="button-open-invite-teammate">
          <UserPlus className="w-4 h-4" /> Add teammate
        </Button>
      }
    >
      <div
        className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center"
        data-testid="empty-team"
      >
        <p className="font-semibold text-sm text-slate-900">Bring your team onboard</p>
        <p className="mx-auto mt-1 max-w-sm text-slate-500 text-xs">
          Invite a manager or band member to help run your presence on GoodTunes.
          They'll get their own sign-in — you stay in control of what they can do.
        </p>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEmail(""); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-invite-teammate">
          <DialogHeader>
            <DialogTitle>Add a teammate</DialogTitle>
            <DialogDescription>
              {targetName ? `They'll join ${targetName}'s team.` : "They'll join your team."} We'll email them an invite to accept.
            </DialogDescription>
          </DialogHeader>
          <form
            id="form-invite-teammate"
            onSubmit={(e) => { e.preventDefault(); if (email.trim()) m.mutate(); }}
            className="space-y-3"
            data-testid="form-invite-teammate"
          >
            <div className="flex gap-2">
              {(["team", "manager"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    inviteRole === r
                      ? "border-transparent bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                  }`}
                  data-testid={`button-teammate-role-${r}`}
                >
                  {r === "team" ? "Band / team member" : "Manager"}
                </button>
              ))}
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              required
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              data-testid="input-teammate-email"
            />
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="button-cancel-teammate-invite">
              Cancel
            </Button>
            <Button
              type="submit"
              form="form-invite-teammate"
              disabled={m.isPending}
              data-testid="button-send-teammate-invite"
            >
              {m.isPending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Task #546 — Artist-to-artist invites. Verified artists invite other
// artists onto GoodTunes (no public signup exists). Capped at 5
// outstanding/artist. Pre-seeded "earmarked folks" list surfaces here
// as one-tap suggestions.
type ArtistInviteRow = {
  id: string;
  email: string;
  role: string;
  roleScopeId: string | null;
  scopeName: string | null;
  scopeThumbUrl: string | null;
  welcomeNote: string | null;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  resentAt: string | null;
  acceptUrl: string | null;
};
type EarmarkedSuggestion = { id: string; name: string; email: string; notes: string | null };

// Referral funnel + invite-status primitives (Task #1199). Keep the
// per-invitee status vocabulary and the sent → joined → units → pending
// rollup styled consistently in one place.
type InviteStatus = "Invited" | "Joined" | "Revoked" | "Expired";

const INVITE_STATUS_STYLE: Record<InviteStatus, string> = {
  Invited: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  Joined: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Revoked: "bg-slate-100 text-slate-500",
  Expired: "bg-slate-100 text-slate-500",
};

function InviteStatusPill({ status, testId }: { status: InviteStatus; testId?: string }) {
  return (
    <span
      className={`shrink-0 text-xs font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${INVITE_STATUS_STYLE[status]}`}
      data-testid={testId}
    >
      {status}
    </span>
  );
}

function FunnelStat({ label, value, accent, testId }: { label: string; value: string; accent?: boolean; testId: string }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 px-3 py-2.5" data-testid={testId}>
      <p className={`text-lg font-bold tabular-nums leading-none ${accent ? "text-emerald-600" : ""}`} data-testid={`${testId}-value`}>{value}</p>
      <p className="mt-1 text-slate-500 text-xs">{label}</p>
    </div>
  );
}

export function InviteArtistPanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [welcomeNote, setWelcomeNote] = useState("");
  // Task #952 — an artist can invite a fresh artist OR a fresh label.
  const [inviteeRole, setInviteeRole] = useState<"artist" | "label">("artist");
  // Task #2495 — the artist invitee is chosen through the SHARED PersonPicker
  // (catalog search → Spotify → create-from-name), the same "Add a person"
  // control the super-admin Invite Artist flow uses. We mirror the picked
  // name into `name` so the existing referral submit path is unchanged.
  const [picked, setPicked] = useState<PersonLite | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const list = useQuery<{ invites: ArtistInviteRow[]; outstanding: number; cap: number }>({
    queryKey: ["/api/artist/invites"],
  });
  const sugg = useQuery<{ suggestions: EarmarkedSuggestion[] }>({
    queryKey: ["/api/artist/earmarked"],
  });
  // Task #546 — Join per-invitee units sold + pending payout onto the
  // invite rows. Match key is the placeholder Person id we minted at
  // invite time, which equals invite.roleScopeId and partner.id from
  // /api/artist/referrals.
  const refs = useQuery<{ partners: { id: string; units: number; pendingCents: number }[] }>({
    queryKey: ["/api/artist/referrals"],
  });
  const partnerByScope = new Map<string, { units: number; pendingCents: number }>();
  for (const p of refs.data?.partners ?? []) partnerByScope.set(p.id, { units: p.units, pendingCents: p.pendingCents });

  const send = useMutation({
    mutationFn: async () => {
      // Artist invites hit the per-unit-referral path; label invites
      // (Task #952) hit the sibling endpoint that mints a placeholder
      // Label instead of a Person.
      const url = inviteeRole === "label" ? "/api/artist/invites/label" : "/api/artist/invites/artist";
      const r = await apiRequest("POST", url, {
        email: email.trim(),
        name: name.trim(),
        welcomeNote: welcomeNote.trim() || undefined,
      });
      return r.json();
    },
    onSuccess: (data: any) => {
      const kind = inviteeRole;
      setEmail(""); setName(""); setWelcomeNote(""); setInviteeRole("artist"); setPicked(null); setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/artist/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artist/earmarked"] });
      toast({
        title: data?.reviewStatus === "pending_review" ? "Held for review" : data?.emailDelivered ? "Invite sent" : "Invite created",
        description: data?.reviewStatus === "pending_review"
          ? "GoodTunes will review and notify you when approved."
          : `Emailed ${data?.email ?? `the ${kind}`}.`,
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't invite", description: e.message, variant: "destructive" }),
  });

  const copyLink = async (iv: ArtistInviteRow) => {
    if (!iv.acceptUrl) return;
    try {
      await navigator.clipboard.writeText(iv.acceptUrl);
      setCopiedId(iv.id);
      setTimeout(() => setCopiedId((c) => (c === iv.id ? null : c)), 1500);
      toast({ title: "Invite link copied" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  };

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/artist/invites/${id}/resend`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artist/invites"] });
      toast({ title: "Invite re-sent" });
    },
    onError: (e: Error) => toast({ title: "Couldn't resend", description: e.message, variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/artist/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artist/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artist/earmarked"] });
      toast({ title: "Invite revoked" });
    },
    onError: (e: Error) => toast({ title: "Couldn't revoke", description: e.message, variant: "destructive" }),
  });

  const cap = list.data?.cap ?? 5;
  const outstanding = list.data?.outstanding ?? 0;
  const atCap = outstanding >= cap;
  const slotsLeft = Math.max(0, cap - outstanding);
  const invites = list.data?.invites ?? [];
  const suggestions = sugg.data?.suggestions ?? [];
  // Funnel rollup: sent → joined → units sold → pending payout. "Sent"
  // counts every invite still on the list (incl. revoked/expired);
  // joined/units/pending only count accepted invitees, matching the
  // per-row numbers below.
  const sentCount = invites.length;
  const joinedCount = invites.filter((iv) => iv.usedAt).length;
  let totalUnits = 0;
  let totalPendingCents = 0;
  for (const iv of invites) {
    if (!iv.usedAt) continue;
    const stats = iv.roleScopeId ? partnerByScope.get(iv.roleScopeId) : undefined;
    if (stats) { totalUnits += stats.units; totalPendingCents += stats.pendingCents; }
  }
  const fmtMoney = (c: number) => formatUsdCents(c);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const pickSuggestion = (s: EarmarkedSuggestion) => {
    setInviteeRole("artist");
    setPicked({ id: s.id, name: s.name, photoUrl: null });
    setName(s.name);
    setEmail(s.email);
    setOpen(true);
  };

  const closeInvite = () => { setOpen(false); setEmail(""); setName(""); setWelcomeNote(""); setInviteeRole("artist"); setPicked(null); };

  return (
    <Card
      title="Invite an artist or label"
      subtitle="Invite verified artists & labels — you earn $1 on every paid unit they ship, for one year."
      testId="invite-artist-panel"
      action={
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={atCap}
          data-testid="button-open-invite-artist"
        >
          <UserPlus className="w-4 h-4" /> Invite
        </Button>
      }
    >
      <p className="text-slate-500 text-xs mb-3" data-testid="text-invite-slots">
        {atCap
          ? "All invite slots used — revoke one below to free a slot"
          : `${slotsLeft} of ${cap} invite slot${cap === 1 ? "" : "s"} left`}
      </p>

      {sentCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4" data-testid="referral-funnel">
          <FunnelStat label="Invites sent" value={String(sentCount)} testId="funnel-sent" />
          <FunnelStat label="Joined" value={String(joinedCount)} testId="funnel-joined" />
          <FunnelStat label={`Unit${totalUnits === 1 ? "" : "s"} sold`} value={String(totalUnits)} testId="funnel-units" />
          <FunnelStat label="Pending payout" value={fmtMoney(totalPendingCents)} accent testId="funnel-pending" />
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (o) setOpen(true); else closeInvite(); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-invite-artist">
          <DialogHeader>
            <DialogTitle>Invite an artist or label</DialogTitle>
            <DialogDescription>
              We'll email them an invite to join GoodTunes. You earn $1 on every paid unit they ship, for one year.
            </DialogDescription>
          </DialogHeader>
          <form
            id="form-invite-artist"
            onSubmit={(e) => { e.preventDefault(); if (email.trim() && name.trim() && !atCap) send.mutate(); }}
            className="space-y-3"
            data-testid="form-invite-artist"
          >
            <div className="flex gap-2" data-testid="toggle-invitee-role">
              {(["artist", "label"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteeRole(r)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    inviteeRole === r
                      ? "border-transparent bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                  }`}
                  data-testid={`button-invitee-role-${r}`}
                >
                  {r === "artist" ? "Artist" : "Label"}
                </button>
              ))}
            </div>
            {inviteeRole === "artist" ? (
              <div className="space-y-1.5" data-testid="picker-artist-invite">
                <PersonPicker
                  value={picked}
                  onChange={(p) => { setPicked(p); setName(p?.name ?? ""); }}
                  excludeIds={NO_EXCLUDE}
                  testIdPrefix="artist-invite"
                  enableSpotify
                  hidePaste
                />
                <p className="text-xs text-slate-500">
                  Search GoodTunes, then Spotify. New to us? Create them from the name.
                </p>
              </div>
            ) : (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Label name"
                required
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                data-testid="input-label-name"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="artist@example.com"
              required
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              data-testid="input-artist-email"
            />
            <textarea
              value={welcomeNote}
              onChange={(e) => setWelcomeNote(e.target.value)}
              placeholder="Optional personal note (1-2 sentences)"
              maxLength={1000}
              rows={2}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              data-testid="input-artist-welcome-note"
            />
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={closeInvite} data-testid="button-cancel-artist-invite">
              Cancel
            </Button>
            <Button
              type="submit"
              form="form-invite-artist"
              disabled={
                send.isPending ||
                atCap ||
                !email.trim() ||
                (inviteeRole === "artist" ? !picked : !name.trim())
              }
              data-testid="button-send-artist-invite"
            >
              {send.isPending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {suggestions.length > 0 && (
        <div className="mt-4" data-testid="earmarked-suggestions">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Suggested by GoodTunes</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSuggestion(s)}
                disabled={atCap}
                title={s.notes ?? s.email}
                className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 disabled:opacity-40"
                data-testid={`button-earmarked-${s.id}`}
              >
                <span className="font-semibold">{s.name}</span>
                <span className="text-slate-400 ml-1.5">{s.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {invites.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100" data-testid="list-artist-invites">
          {invites.map((iv) => {
            const accepted = !!iv.usedAt;
            const revoked = !!iv.revokedAt;
            const expired = !accepted && !revoked && new Date(iv.expiresAt) <= new Date();
            const status: InviteStatus = accepted ? "Joined" : revoked ? "Revoked" : expired ? "Expired" : "Invited";
            const stats = accepted && iv.roleScopeId ? partnerByScope.get(iv.roleScopeId) : undefined;
            const pending = !accepted && !revoked;
            // Per-row timeline: invited date → joined date (if accepted),
            // plus resend / expiry markers on still-pending rows. Units
            // sold + pending payout sit on the right for joined invitees.
            const metaBits: string[] = [];
            metaBits.push(`Invited ${fmtDate(iv.createdAt)}`);
            if (accepted && iv.usedAt) metaBits.push(`Joined ${fmtDate(iv.usedAt)}`);
            if (pending && iv.resentAt) metaBits.push(`Resent ${fmtDate(iv.resentAt)}`);
            if (pending && expired) metaBits.push(`Expired ${fmtDate(iv.expiresAt)}`);
            return (
              <li key={iv.id} className="py-2.5" data-testid={`row-artist-invite-${iv.id}`}>
                <div className="flex items-center gap-3">
                  {iv.scopeThumbUrl ? (
                    <img src={iv.scopeThumbUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-slate-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-sm flex items-center gap-1.5" data-testid={`text-artist-invite-name-${iv.id}`}>
                      <span className="truncate min-w-0">{iv.scopeName ?? iv.email}</span>
                      {iv.role === "label" && (
                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 rounded px-1.5 py-0.5" data-testid={`tag-artist-invite-role-${iv.id}`}>Label</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{iv.email}</p>
                  </div>
                  <InviteStatusPill status={status} testId={`text-artist-invite-status-${iv.id}`} />
                </div>
                <div className="mt-1.5 pl-14 flex items-start justify-between gap-3">
                  <p className="text-xs text-slate-500 min-w-0" data-testid={`text-artist-invite-meta-${iv.id}`}>
                    {metaBits.join(" · ")}
                  </p>
                  {accepted && (
                    <div className="text-right shrink-0" data-testid={`text-artist-invite-units-${iv.id}`}>
                      <p className="text-xs text-slate-700 tabular-nums">{stats?.units ?? 0} unit{(stats?.units ?? 0) === 1 ? "" : "s"} sold</p>
                      {stats && stats.pendingCents > 0 && (
                        <p className="text-xs text-emerald-600 tabular-nums">{fmtMoney(stats.pendingCents)} pending</p>
                      )}
                    </div>
                  )}
                </div>
                {pending && (
                  <div className="mt-2 pl-14 flex flex-wrap items-center gap-2 text-xs">
                    {iv.acceptUrl && (
                      <button
                        type="button"
                        onClick={() => copyLink(iv)}
                        className="text-slate-500 hover:text-slate-900 px-2 py-1"
                        data-testid={`button-copy-artist-invite-${iv.id}`}
                      >
                        {copiedId === iv.id ? "Copied" : "Copy link"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => resend.mutate(iv.id)}
                      disabled={resend.isPending}
                      className="text-slate-500 hover:text-slate-900 px-2 py-1 disabled:opacity-40"
                      data-testid={`button-resend-artist-invite-${iv.id}`}
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Revoke invite to ${iv.email}? This frees up an invite slot.`)) revoke.mutate(iv.id); }}
                      disabled={revoke.isPending}
                      className="text-rose-600 hover:text-rose-700 px-2 py-1 disabled:opacity-40"
                      data-testid={`button-revoke-artist-invite-${iv.id}`}
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center" data-testid="empty-artist-invites">
          <p className="font-semibold text-sm text-slate-900">Tell other artists about GoodTunes</p>
          <p className="mt-1 text-slate-500 text-xs max-w-sm mx-auto">
            Invite the artists and labels you rate. When they join and start selling, you earn $1 on every paid unit they ship — for one year. Use <span className="font-semibold text-slate-700">Invite</span> above to send your first one.
          </p>
        </div>
      )}
    </Card>
  );
}

// Task #938 — scoped buyer roster + "where they live" map, range-aware.
function BuyersTab({ qs, personId }: { qs: string; personId: string | null }) {
  return (
    <>
      {personId && (
        <div className="flex justify-end">
          <Link
            href={`/admin/people/${personId}/buyers`}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 ring-1 ring-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
            data-testid="link-buyer-roster"
          >
            <Users className="w-3.5 h-3.5" />
            View buyer roster
          </Link>
        </div>
      )}
      <BuyerReport
        buyersUrl={`/api/artist/buyers?${qs}`}
        mapUrl={`/api/artist/buyer-map?${qs}`}
        emptyHint="No buyers of your releases in this range yet."
      />
    </>
  );
}

function ReferralsTab() {
  const swaps = useQuery<{ asReferrer: SwapApiRow[]; asInvitee: SwapApiRow[] }>({
    queryKey: ["/api/artist/referrals/swaps"],
  });
  const swapRows: SwapRow[] = [
    ...(swaps.data?.asReferrer ?? []).map((r) => ({ ...r, role: "referrer" as const })),
    ...(swaps.data?.asInvitee ?? []).map((r) => ({ ...r, role: "invitee" as const })),
  ];
  const { toast } = useToast();
  const preElect = useMutation({
    mutationFn: async ({ id, state }: { id: string; state: "referrer_keeps_full" | "invitee_keeps_full" }) => {
      await apiRequest("POST", `/api/artist/referrals/${id}/pre-elect`, { swapState: state });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artist/referrals/swaps"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    },
  });

  const q = useQuery<{
    pendingCents: number;
    pendingCount: number;
    paidCents: number;
    partners: { id: string; name: string; photoUrl: string | null; units: number; pendingCents: number; referralStartedAt: string | null; earningWindowActive: boolean; earningWindowEndsAt: string | null }[];
    nonProfits: { id: string; name: string; logoUrl: string | null }[];
  }>({ queryKey: ["/api/artist/referrals"] });
  if (q.isLoading) {
    return <p className="py-10 text-center text-slate-400 text-[13px]">Loading…</p>;
  }
  if (q.isError) {
    return <p className="py-10 text-center text-slate-400 text-[13px]">Couldn't load referrals.</p>;
  }
  const d = q.data!;
  const fmt = (c: number) => formatUsdCents(c);
  return (
    <>
      <InviteArtistPanel />
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="referrals-kpis">
        <Kpi label="Pending payout" value={fmt(d.pendingCents)} sub={`${d.pendingCount} unit${d.pendingCount === 1 ? "" : "s"} this period`} testId="kpi-ref-pending" />
        <Kpi label="Paid out" value={fmt(d.paidCents)} testId="kpi-ref-paid" />
        <Kpi label="Referred artists" value={String(d.partners.length)} testId="kpi-ref-count" />
      </section>
      <Card title="Artists you've referred" subtitle="$1 per paid unit, for one year" testId="table-referred-artists">
        {d.partners.length === 0 ? (
          <p className="py-8 text-center text-slate-500 text-sm" data-testid="empty-referrals">
            No one's joined yet. Invite an artist or label above — once they accept, they'll
            show up here with the units they've sold and your $1-per-unit payout.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.partners.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3" data-testid={`row-referred-${p.id}`}>
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-100" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.units} unit{p.units === 1 ? "" : "s"} attributed
                    {p.earningWindowActive === false ? (
                      <span className="ml-2 text-slate-400" data-testid={`status-window-ended-${p.id}`}>· Earning ended</span>
                    ) : p.earningWindowEndsAt ? (
                      <span className="ml-2 text-slate-400" data-testid={`status-window-active-${p.id}`}>
                        · Earning through {new Date(p.earningWindowEndsAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="text-emerald-600 tabular-nums font-semibold text-sm">{fmt(p.pendingCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {/* Task #350 — pending swaps. Renders only when the artist has
          active per-album referral rows. */}
      {swapRows.length > 0 && (
        <Card title="Project swaps" subtitle="Artist-to-artist referrals — one project each, until a swap is set." testId="table-swaps">
          <ul className="divide-y divide-slate-100">
            {swapRows.map((s) => {
              const frozen = !!s.frozenAt;
              return (
                <li key={s.id} className="py-3" data-testid={`row-swap-${s.id}`}>
                  <div className="flex items-center gap-3">
                    {s.otherPhotoUrl ? (
                      <img src={s.otherPhotoUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-slate-100" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{s.otherName}</p>
                      <p className="text-xs text-slate-500">
                        {s.role === "referrer" ? "You referred them" : "They referred you"}
                        {s.albumId ? <> · <span className="text-slate-600">project bound</span></> : <> · <span className="text-slate-600">not yet bound to a project</span></>}
                        {frozen && <span className="ml-2 text-emerald-600">· Frozen (first sale shipped)</span>}
                      </p>
                    </div>
                  </div>
                  {!frozen && (
                    <div className="mt-2 pl-14 flex flex-wrap items-center gap-2 text-xs">
                      {s.role === "invitee" ? (
                        <>
                          <span className="text-slate-500">Keep the per-unit credit on this project?</span>
                          <button
                            type="button"
                            onClick={() => preElect.mutate({ id: s.id, state: "invitee_keeps_full" })}
                            disabled={preElect.isPending || s.swapState === "invitee_keeps_full"}
                            className={`px-2.5 py-1 rounded-md font-semibold ${
                              s.swapState === "invitee_keeps_full"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            }`}
                            data-testid={`button-swap-keep-${s.id}`}
                          >
                            {s.swapState === "invitee_keeps_full" ? "✓ I keep it" : "I keep it"}
                          </button>
                          <button
                            type="button"
                            onClick={() => preElect.mutate({ id: s.id, state: "referrer_keeps_full" })}
                            disabled={preElect.isPending || s.swapState !== "invitee_keeps_full"}
                            className="px-2.5 py-1 rounded-md font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600"
                            data-testid={`button-swap-default-${s.id}`}
                          >
                            Let them keep it
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-slate-500">Pre-elect this artist for a project of yours:</span>
                          <button
                            type="button"
                            onClick={() => preElect.mutate({ id: s.id, state: "invitee_keeps_full" })}
                            disabled={preElect.isPending || s.swapState === "invitee_keeps_full"}
                            className={`px-2.5 py-1 rounded-md font-semibold ${
                              s.swapState === "invitee_keeps_full"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            }`}
                            data-testid={`button-swap-pre-elect-${s.id}`}
                          >
                            {s.swapState === "invitee_keeps_full" ? "✓ Pre-elected" : "Pre-elect"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {d.nonProfits.length > 0 && (
        <Card title="Non-profits you've referred" testId="table-referred-npos">
          <ul className="divide-y divide-slate-100" data-testid="list-referred-npos">
            {d.nonProfits.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3" data-testid={`row-referred-npo-${o.id}`}>
                {o.logoUrl ? (
                  <img src={o.logoUrl} alt="" className="w-10 h-10 rounded object-cover bg-slate-100" />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-100" />
                )}
                <p className="flex-1 min-w-0 font-semibold truncate">{o.name}</p>
                <span className="text-[11px] text-slate-500 uppercase tracking-wider">Non-profit</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
