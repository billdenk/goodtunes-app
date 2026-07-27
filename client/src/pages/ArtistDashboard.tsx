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
// Task #2893 — the merged Dashboard reuses the shared partner activity list
// for its Recent-activity rail (the rest of the old PartnerDashboard tab is
// replaced by the tier-disciplined merged page below).
import { ActivityList } from "@/components/partner/PartnerDashboard";
import { BreakEvenBar } from "@/components/BreakEvenBar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
// Heart for song-favorite metrics — keeps the artist dashboard's
// favourites column visually paired with the player's heart action.
import {
  Heart, User as UserIcon, Users, UserPlus,
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
import { BRAND, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";
import {
  KpiCard, KpiCardSkeleton, kpiInfoKeyFromTestId, type KpiCardModel,
} from "@/components/admin/KpiCard";
// Task #2495 — reuse the shared super-admin "Add a person" search control
// (internal catalog search → Spotify → create-from-name) for the artist
// Referrals invite, instead of a bespoke name field.
import { PersonPicker, type PersonLite } from "@/components/admin/AddPeopleMenu";
import { PartnerOrdersTable } from "@/components/partner/PartnerOrdersTable";
// Task #2893 — merged Dashboard card builder + shared formatters live in a
// pure module so the nine-card set is unit-testable without the page graph.
import {
  buildArtistDashboardCards, dailyGross, dailyPlays, dailyListeners,
  dollars, compact, pct, excludedNote, joinSub,
  type ArtistKpis, type ArtistSalesStack, type ArtistTimeseries,
} from "@/pages/artistDashboardCards";

// PersonPicker needs an excludeIds set; the artist invite never excludes
// anyone, so reuse one stable empty set.
const NO_EXCLUDE: Set<string> = new Set();

type Range = { from: string; to: string };
type Kpis = ArtistKpis;
type Lifetime = {
  grossCents: number; units: number; orders: number; buyers: number;
  refundedCents: number; plays: number; listeners: number; excludedPlays?: number;
  grantPlays?: number; grantListeners?: number;
  // Task #2673/#2893 — owner-vs-preview split (banner headline = ownerPlays)
  ownerPlays?: number; uniqueOwners?: number; ownerCompletes?: number;
  previewPlays?: number; uniquePreviewSessions?: number;
};
type ActivityItem = { kind: string; ts: string; title: string; detail?: string; href?: string };
type Summary = {
  range: Range; compare: Range | null; current: Kpis; previous: Kpis | null; lifetime?: Lifetime | null;
  stack?: ArtistSalesStack | null; stackPrevious?: ArtistSalesStack | null;
  activity?: ActivityItem[];
};
type Timeseries = ArtistTimeseries;
type GeoPayload = {
  sales?: SalesGeoPayload;
};
type Tracks = { tracks: { songId: string; title: string; albumTitle: string; plays: number; completes: number; favorites: number; playlistAdds: number; shares: number; grantPlays?: number; staffPlays?: number; staffCompletes?: number }[] };
type AlbumsPayload = { albums: { albumId: string; title: string; artist: string; artwork: string | null; revenueCents: number; artistShareCents: number; units: number; buyers: number; plays: number; listeners: number; grantPlays?: number; grantListeners?: number }[] };
type Audience = {
  newListeners: number; returningListeners: number;
  repeatCohort: { range: string; listeners: number }[];
  topFans: { handle: string; plays: number }[];
  excludedPlays?: number;
  // Task #2870 — grant/comp bucket surfaced separately on the Audience tab
  grantPlays?: number;
  grantListeners?: number;
};

// Brand palette + per-SKU chart mapping come from the shared token
// module so this dashboard reads from the same source as the CSS vars
// (see client/src/lib/brand-tokens.ts and client/src/index.css).
const C = BRAND;

// (dollars/compact/pct/excludedNote/joinSub now come from
// ./artistDashboardCards so the card builder and the page share one set.)

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
  const [tab, setTab] = useState<"dashboard" | "audience" | "acquisition" | "catalog" | "orders" | "buyers" | "referrals" | "people" | "reports">(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // Task #2893 — Overview merged into Dashboard. Stale ?tab=overview deep
    // links (bookmarks, old KPI tiles) land on the merged Dashboard; their
    // ?range= param still applies via presetFromSearch below.
    if (t === "overview") return "dashboard";
    if (t === "dashboard" || t === "audience" || t === "acquisition" || t === "catalog" || t === "orders" || t === "buyers" || t === "referrals" || t === "people" || t === "reports") return t;
    return "dashboard";
  });
  // Task #2486 — Dashboard-tab KPI tiles deep-link via `?tab=…` (wouter
  // pushState). This tab state is seeded once from the URL, so mirror
  // later `?tab=` changes back into it; onTabChange's own replaceState
  // lands here too as an idempotent no-op.
  const search = useSearch();
  useEffect(() => {
    const t = new URLSearchParams(search).get("tab");
    if (t === "overview") setTab("dashboard"); // merged — Task #2893
    else if (t === "dashboard" || t === "audience" || t === "acquisition" || t === "catalog" || t === "orders" || t === "buyers" || t === "referrals" || t === "people" || t === "reports") {
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
    // Determine the most actionable error copy for this error class.
    const errorCopy = msg.includes("Super-admin")
      ? "Pass ?personId= to inspect a specific artist."
      : msg.includes("no person scope") || msg.includes("no artist scope") || msg.includes("no scope")
      // Task #2865 — scope-less partner account: account exists but was
      // granted artist role without a person scope ID (DB data defect).
      // Shown instead of a blank page so the artist knows to contact support.
      ? "Your artist account isn't fully set up yet — our team has been notified. Please contact GoodTunes support to get access to your dashboard."
      : msg.includes("Insufficient")
      ? "This dashboard is for artist accounts. Ask your label admin to invite you."
      : msg.includes("Unauthorized")
      ? "Sign in with your artist account to continue."
      : "We couldn't load your artist scope. Please try again.";
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="artist-dashboard-gate">
          <h1 className="text-2xl font-bold mb-2">Artist dashboard</h1>
          <p className="text-slate-500 text-sm">{errorCopy}</p>
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
      // Reports renders the embedded AdminReports — it carries its OWN
      // section header + date range — so there we suppress the shell page
      // header entirely (no pageTitle, hideHeaderIdentity, no headerActions)
      // to avoid a duplicate title + duplicate range control. The merged
      // Dashboard (Task #2893) uses THIS header's range picker + compare
      // toggle like every other section — no second picker variant.
      pageTitle={albumViewId || tab === "reports" ? undefined : currentTabLabel}
      hideHeaderIdentity={!!albumViewId || tab === "reports"}
      headerActions={
        albumViewId || tab === "reports" ? undefined : (
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
      {/* Task #2893 — single merged, tier-disciplined Dashboard (the old
          shared PartnerDashboard tab + Overview tab are one page now). */}
      {tab === "dashboard" && <DashboardTab qs={qs} />}
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
  id: "dashboard" | "audience" | "acquisition" | "catalog" | "orders" | "buyers" | "referrals" | "people" | "reports";
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

// (dailyGross/dailyPlays/dailyListeners moved to ./artistDashboardCards.)

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
            {/* Task #2893 — tier-disciplined headline: purchaser plays only,
                with the other tiers spelled out (never summed in). */}
            <Kpi
              label="Fan plays"
              value={data ? compact(data.ownerPlays ?? data.plays) : "—"}
              sub={data ? `${compact(data.uniqueOwners ?? data.listeners)} listener${(data.uniqueOwners ?? data.listeners) === 1 ? "" : "s"} · ${compact(data.grantPlays ?? 0)} grant plays · ${compact(data.previewPlays ?? 0)} previews · internal excluded` : undefined}
              testId="lifetime-plays"
            />
          </>
        )}
      </section>
    </section>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────
// Task #2893 — the merged, tier-disciplined Dashboard (old Dashboard tab +
// Overview tab in one). Top to bottom: all-time banner (never affected by
// the date-range picker) → nine date-range cards → trend chart with a
// Plays/Revenue/Orders toggle stacked over the fan map, with Recent
// activity on the right rail (below on narrow) → cert-run status.
function DashboardTab({ qs }: { qs: string }) {
  const summary = useQuery<Summary>({ queryKey: [`/api/artist/summary?${qs}`] });
  const series = useQuery<Timeseries>({ queryKey: [`/api/artist/timeseries?${qs}`] });
  const geo = useQuery<GeoPayload & { range: Range }>({ queryKey: [`/api/artist/geo?${qs}`] });
  const cur = summary.data?.current;
  const prev = summary.data?.previous ?? null;
  const lifetime = summary.data?.lifetime ?? null;
  const cards = buildArtistDashboardCards({
    cur,
    prev,
    stack: summary.data?.stack ?? null,
    stackPrevious: summary.data?.stackPrevious ?? null,
    series: series.data,
  });

  return (
    <>
      <LifetimeBanner data={lifetime} loading={summary.isLoading} />

      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wider font-semibold text-slate-400" data-testid="kpi-range-label">
          Selected date range
        </p>
      </div>
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="kpi-grid">
        {summary.isLoading ? (
          Array.from({ length: 9 }).map((_, i) => (
            <KpiCardSkeleton key={i} testId={`kpi-skeleton-${i}`} />
          ))
        ) : (
          cards.map((c) => (
            <KpiCard key={c.testId} model={c.model} testId={c.testId} spark={c.spark ?? null} />
          ))
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <TrendPanel series={series.data} loading={series.isLoading} />
          <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid="chart-geo">
            <SalesMap
              data={geo.data?.sales}
              loading={geo.isLoading}
              emptyCopy="Once orders come in, you'll see where your fans are buying on this map."
            />
          </section>
        </div>
        <Card title="Recent activity" subtitle="Orders & releases in this range" testId="panel-activity">
          <ActivityList items={summary.data?.activity ?? []} loading={summary.isLoading} />
        </Card>
      </section>

      <CertRunsSection kind="artist" qs={qs} />
    </>
  );
}

// One trend chart with a Plays / Revenue / Orders toggle (default Plays) —
// replaces the old side-by-side Daily-revenue + Daily-plays pair. Series are
// tier-disciplined upstream: plays/day counts fan (purchaser) starts only.
const TREND_METRICS = [
  { id: "plays", label: "Plays" },
  { id: "revenue", label: "Revenue" },
  { id: "orders", label: "Orders" },
] as const;
type TrendMetricId = (typeof TREND_METRICS)[number]["id"];
const TREND_EMPTY: Record<TrendMetricId, string> = {
  plays: "No fan plays in this window yet.",
  revenue: "No revenue in this window yet.",
  orders: "No orders in this window yet.",
};

function TrendPanel({ series, loading }: { series?: Timeseries; loading: boolean }) {
  const [metric, setMetric] = useState<TrendMetricId>("plays");
  const rows = useMemo(() => {
    if (!series) return [] as { day: string; value: number }[];
    if (metric === "plays") {
      return [...series.plays]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((p) => ({ day: p.day.slice(5), value: p.starts }));
    }
    if (metric === "orders") {
      return [...(series.orders ?? [])]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((o) => ({ day: o.day.slice(5), value: o.orders }));
    }
    const byDay = new Map<string, number>();
    for (const r of series.revenue) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenueCents);
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, cents]) => ({ day: day.slice(5), value: cents / 100 }));
  }, [series, metric]);

  const subtitle =
    metric === "plays" ? "Daily fan plays" : metric === "revenue" ? "Daily gross revenue" : "Daily orders";

  return (
    <Card
      title="Trends"
      subtitle={subtitle}
      testId="chart-trend"
      action={
        <div
          className="inline-flex items-center bg-slate-100 rounded-md p-0.5"
          role="group"
          aria-label="Trend metric"
          data-testid="trend-toggle"
        >
          {TREND_METRICS.map((m) => {
            const active = metric === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                aria-pressed={active}
                className={`h-8 px-3 inline-flex items-center justify-center rounded text-xs font-semibold transition-colors ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                data-testid={`button-trend-${m.id}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      }
    >
      {loading ? (
        <SkeletonBlock />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-slate-400 text-sm" data-testid="trend-empty">
          {TREND_EMPTY[metric]}
        </p>
      ) : (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={rows}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.blue} stopOpacity={0.7} />
                  <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
              <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (metric === "revenue" ? `$${v}` : compact(Number(v)))}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: any) =>
                  metric === "revenue"
                    ? [formatUsd(Number(v), { maximumFractionDigits: 0 }), "Revenue"]
                    : [Number(v).toLocaleString(), metric === "plays" ? "Plays" : "Orders"]
                }
              />
              <Area type="monotone" dataKey="value" stroke={C.blue} strokeWidth={2} fill="url(#trendFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
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
      {/* Task #2870 — two separate footnote lines: one for grant/comp plays,
          one for staff/internal. Either can be zero independently. */}
      {(d.grantPlays ?? 0) > 0 ? (
        <p className="text-xs text-slate-400" data-testid="text-audience-grant">
          {compact(d.grantPlays!)} grant/comp play{d.grantPlays === 1 ? "" : "s"} ({compact(d.grantListeners ?? 0)} listener{(d.grantListeners ?? 0) === 1 ? "" : "s"}) from comped copies & previews — not counted in fan totals above.
        </p>
      ) : null}
      {d.excludedPlays && d.excludedPlays > 0 ? (
        <p className="text-xs text-slate-400" data-testid="text-audience-excluded">
          {compact(d.excludedPlays)} staff/internal play{d.excludedPlays === 1 ? "" : "s"} also excluded.
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
  // Server sends staffPlays only on operator (super_admin) responses;
  // partners never get the field, so the column doesn't exist for them.
  const hasStaff = (tracks.data?.tracks ?? []).some((t) => t.staffPlays !== undefined);
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
                <th className="text-right font-medium px-2">Fan plays</th>
                <th className="text-right font-medium px-2">Grant plays</th>
                <th className="text-right font-medium pl-2">Listeners</th>
              </tr>
            </thead>
            <tbody>
              {albums.isLoading && <tr><td colSpan={9} className="py-6 text-center text-slate-400">Loading…</td></tr>}
              {!albums.isLoading && (albums.data?.albums.length ?? 0) === 0 && <tr><td colSpan={9} className="py-6 text-center text-slate-400">No albums in scope.</td></tr>}
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
                  <td className="px-2 text-right tabular-nums text-slate-500" data-testid={`text-grant-plays-${a.albumId}`}>{compact(a.grantPlays ?? 0)}</td>
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
                <th className="text-right font-medium px-2">Fan plays</th>
                <th className="text-right font-medium px-2">Grant plays</th>
                {hasStaff && <th className="text-right font-medium px-2">Staff plays</th>}
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
              {tracks.isLoading && <tr><td colSpan={hasStaff ? 8 : 7} className="py-6 text-center text-slate-400">Loading…</td></tr>}
              {!tracks.isLoading && (tracks.data?.tracks.length ?? 0) === 0 && <tr><td colSpan={hasStaff ? 8 : 7} className="py-6 text-center text-slate-400">No plays yet in this window.</td></tr>}
              {tracks.data?.tracks.map((t) => (
                <tr key={t.songId} className="border-t border-slate-100" data-testid={`row-track-${t.songId}`}>
                  <td className="py-2 pr-3">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-slate-400 text-[11px] truncate">{t.albumTitle}</p>
                  </td>
                  <td className="px-2 text-right tabular-nums">{compact(t.plays)}</td>
                  <td className="px-2 text-right tabular-nums text-slate-500" data-testid={`text-grant-plays-track-${t.songId}`}>{compact(t.grantPlays ?? 0)}</td>
                  {hasStaff && (
                    <td className="px-2 text-right tabular-nums text-slate-400" title={`${t.staffCompletes ?? 0} full listens`} data-testid={`text-staff-plays-track-${t.songId}`}>
                      {compact(t.staffPlays ?? 0)}
                    </td>
                  )}
                  <td className="px-2 text-right tabular-nums">{compact(t.completes)}</td>
                  <td className="px-2 text-right tabular-nums text-rose-500">{compact(t.favorites)}</td>
                  <td className="px-2 text-right tabular-nums">{compact(t.playlistAdds)}</td>
                  <td className="pl-2 text-right tabular-nums">{compact(t.shares)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasStaff && (
          <p className="mt-2 text-xs text-slate-400" data-testid="text-staff-note">
            Staff/internal listening is visible to operators only — partners never see this column, and it is never added to fan or grant totals.
          </p>
        )}
      </Card>
    </>
  );
}

// Task #2643 — Orders tab now renders the shared PartnerOrdersTable
// (sortable headers, album filter, authenticated Export CSV).
function OrdersTab({ qs }: { qs: string }) {
  return <PartnerOrdersTable base="artist" qs={qs} subtitle="Reconciles to your Stripe payouts" />;
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

function SkeletonBlock() {
  return <div className="h-48 rounded-2xl bg-white ring-1 ring-slate-200 animate-pulse" />;
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
