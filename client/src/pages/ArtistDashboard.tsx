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
// Task #2893 — the merged Dashboard reuses the shared partner activity list
// for its Recent-activity rail (the rest of the old PartnerDashboard tab is
// replaced by the tier-disciplined merged page below).
import { BreakEvenBar } from "@/components/BreakEvenBar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
// Heart for song-favorite metrics — keeps the artist dashboard's
// favourites column visually paired with the player's heart action.
import {
  Heart, User as UserIcon, Users, UserPlus,
  // Apple-canon merged Dashboard (docs/design-reference/code/ArtistDashboard.tsx)
  Banknote, CheckCircle2,
  TrendingUp, Receipt, Disc3, Award, Music2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AcquisitionTab } from "@/components/operator/AcquisitionTab";
import { RangePicker, CompareToggle } from "@/components/partner/dashboard-controls";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { ArtistShopifyTab } from "@/components/operator/ArtistShopifyTab";
import { modulesForRole } from "@/components/operator/registry";
import { AdminReports } from "@/pages/AdminReports";
// Task #2524 — an artist opening one of their albums stays INSIDE this portal
// shell; AdminAlbum renders in `embedded` mode (no operator /admin chrome).
import { AdminAlbum } from "@/pages/AdminAlbum";
import { BuyerReport } from "@/components/partner/BuyerReport";
import { BRAND, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";
import {
  KpiCard, kpiInfoKeyFromTestId, type KpiCardModel,
} from "@/components/admin/KpiCard";
// Task #2495 — reuse the shared super-admin "Add a person" search control
// (internal catalog search → Spotify → create-from-name) for the artist
// Referrals invite, instead of a bespoke name field.
import { PersonPicker, type PersonLite } from "@/components/admin/AddPeopleMenu";
import { PartnerOrdersTable } from "@/components/partner/PartnerOrdersTable";
// Task #2893 — merged Dashboard card builder + shared formatters live in a
// pure module so the nine-card set is unit-testable without the page graph.
import {
  dailyGross, dailyPlays, dailyListeners,
  dollars, dollarsCents, compact, pct, excludedNote, joinSub, fanPlaysSubline,
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

// ─── Apple-canon tokens (docs/apple-canon.md; mirrors the reference
// ArtistDashboard exactly — same values as the AdminDashboard restyle) ──
// Themed via the --apple-* variables (index.css) so the charcoal dark
// theme applies automatically — never hardcode these ladder colors.
const BLUE = "#319ED8";
const INK = "var(--apple-ink)";
const SUBINK = "var(--apple-subink)";
const FAINT = "var(--apple-faint)";
const HAIRLINE = "var(--apple-hairline)";
const PILL_TRACK = "var(--apple-track)";
const PILL_ACTIVE = "var(--apple-pill)";
const TILE = "var(--apple-tile)";
const CARD = "var(--apple-card)";
const PILL_SHADOW = "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)";

// Time-of-day greeting — matches the reference header.
const timeGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function fmtRel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${Math.max(s, 1)}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

// (dollars/compact/pct/excludedNote/joinSub now come from
// ./artistDashboardCards so the card builder and the page share one set.)

const RANGE_PRESETS = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "12mo", label: "Last 12 months", days: 365 },
  // "All" is a 10-year window — wide enough to cover any catalog while the
  // endpoints still get a concrete from/to pair.
  { id: "all", label: "All time", days: 3650 },
] as const;
type PresetId = (typeof RANGE_PRESETS)[number]["id"];

// Short tile-label suffix for the selected window ("Sales · last 30d").
const RANGE_SHORT: Record<PresetId, string> = {
  today: "today", "7d": "last 7d", "30d": "last 30d",
  "90d": "last 90d", "12mo": "last 12mo", all: "all time",
};

// Task #2486 — Dashboard-tab KPI tiles carry the picked window as
// `?range=<preset>` using the shared PartnerDashboard preset vocab
// (today/7d/30d/90d/all); map it into this shell's own preset ids
// (today→7d nearest-narrow, all→12mo nearest-wide) so a drill-down
// lands on the same window.
const RANGE_FROM_DASHBOARD: Record<string, PresetId> = {
  today: "today", "7d": "7d", "30d": "30d", "90d": "90d", "12mo": "12mo", all: "all",
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
  const [tab, setTab] = useState<"dashboard" | "audience" | "acquisition" | "catalog" | "orders" | "buyers" | "referrals" | "people" | "shopify" | "reports">(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // Task #2893 — Overview merged into Dashboard. Stale ?tab=overview deep
    // links (bookmarks, old KPI tiles) land on the merged Dashboard; their
    // ?range= param still applies via presetFromSearch below.
    if (t === "overview") return "dashboard";
    if (t === "dashboard" || t === "audience" || t === "acquisition" || t === "catalog" || t === "orders" || t === "buyers" || t === "referrals" || t === "people" || t === "shopify" || t === "reports") return t;
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
    else if (t === "dashboard" || t === "audience" || t === "acquisition" || t === "catalog" || t === "orders" || t === "buyers" || t === "referrals" || t === "people" || t === "shopify" || t === "reports") {
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
      <main className="min-h-screen bg-[color:var(--apple-tile)] text-[color:var(--apple-ink)] flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="artist-dashboard-gate">
          <h1 className="text-2xl font-bold mb-2">Artist dashboard</h1>
          <p className="text-[color:var(--apple-subink)] text-sm">{errorCopy}</p>
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
      // The merged Dashboard renders its OWN Apple-canon header in-content
      // (time-of-day greeting + range pills + View payouts) per the design
      // reference, so the shell page header is suppressed there too.
      pageTitle={albumViewId || tab === "reports" || tab === "dashboard" ? undefined : currentTabLabel}
      hideHeaderIdentity={!!albumViewId || tab === "reports" || tab === "dashboard"}
      headerActions={
        albumViewId || tab === "reports" || tab === "shopify" || tab === "dashboard" ? undefined : (
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
      {tab === "dashboard" && (
        <DashboardTab
          qs={qs}
          artistName={me.data?.name ?? null}
          preset={preset}
          onPresetChange={applyPreset}
        />
      )}
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
      {/* Task #2914 — artists connect their own Shopify store from the
          portal (same connect card as /admin/shopify, artist copy). */}
      {tab === "shopify" && <ArtistShopifyTab />}
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
  id: "dashboard" | "audience" | "acquisition" | "catalog" | "orders" | "buyers" | "referrals" | "people" | "shopify" | "reports";
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

function deltaPct(cur: number, prior: number): { text: string; positive: boolean } {
  if (prior === 0) return { text: cur > 0 ? "+∞" : "—", positive: cur >= 0 };
  const p = ((cur - prior) / prior) * 100;
  const positive = p >= 0;
  return { text: `${positive ? "+" : ""}${p.toFixed(1)}%`, positive };
}

// ─── Compact 5-tile KPI strip (reference KpiStrip, real data) ─────────
// Sales/plays/listeners/buyers follow the picked window; the lifetime
// sales tile never moves. Plays stay tier-disciplined: headline is the
// purchaser tier only, other tiers spelled out in the note (Task #2893).
function KpiStrip({
  cur, prev, lifetime, preset, loading,
}: {
  cur?: Kpis; prev?: Kpis | null; lifetime?: Lifetime | null;
  preset: PresetId; loading?: boolean;
}) {
  const short = RANGE_SHORT[preset];
  type Tile = { id: string; label: string; value: string; cur?: number; prior?: number | null; note?: string };
  const tiles: Tile[] = [
    { id: "sales", label: `Sales · ${short}`, value: cur ? dollars(cur.grossCents) : "—", cur: cur?.grossCents, prior: prev?.grossCents },
    {
      id: "salesLifetime", label: "Sales · lifetime",
      value: lifetime ? dollars(lifetime.grossCents) : "—",
      note: lifetime?.refundedCents ? `${dollars(lifetime.refundedCents)} refunded` : undefined,
    },
    {
      id: "plays", label: `Fan plays · ${short}`, value: cur ? compact(cur.plays) : "—",
      cur: cur?.plays, prior: prev?.plays,
      note: cur ? fanPlaysSubline(cur) : undefined,
    },
    { id: "listeners", label: "Listeners", value: cur ? compact(cur.listeners) : "—", cur: cur?.listeners, prior: prev?.listeners },
    { id: "buyers", label: "Buyers", value: cur ? compact(cur.buyers) : "—", cur: cur?.buyers, prior: prev?.buyers },
  ];
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }} data-testid="kpi-strip">
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-5 animate-pulse" style={{ border: `1px solid ${HAIRLINE}` }} data-testid={`kpi-skeleton-${i}`}>
              <div className="h-3 w-24 rounded bg-[color:var(--apple-tile)]" />
              <div className="mt-4 h-8 w-20 rounded bg-[color:var(--apple-tile)]" />
            </div>
          ))
        : tiles.map((t) => {
            const d = t.cur != null && t.prior != null ? deltaPct(t.cur, t.prior) : null;
            return (
              <div key={t.id} className="rounded-2xl bg-white p-5 flex flex-col" style={{ border: `1px solid ${HAIRLINE}` }} data-testid={`kpi-${t.id}`}>
                <div className="text-[13px] font-medium truncate" style={{ color: SUBINK }}>{t.label}</div>
                <div className="mt-3 tabular-nums truncate" style={{ fontSize: 32, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.03em", color: INK }} title={t.value}>
                  {t.value}
                </div>
                <div className="mt-3 flex items-start flex-wrap gap-x-1.5 gap-y-0.5 text-[13px] min-w-0">
                  {d && (
                    <>
                      <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: d.positive ? "var(--apple-ready)" : "var(--apple-critical)" }}>{d.text}</span>
                      <span className="flex-shrink-0" style={{ color: SUBINK }}>vs prior</span>
                    </>
                  )}
                  {t.note && (
                    <span className="text-[12px] min-w-0 [overflow-wrap:anywhere]" style={{ color: SUBINK }}>
                      {d ? `· ${t.note}` : t.note}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
    </div>
  );
}

// ─── "Where sales come from." (reference SalesChannels card) ──────────
// No per-channel sales aggregation exists yet, so the card keeps the
// reference geometry with an honest empty state instead of invented rows.
function SalesChannelsCard() {
  return (
    <div className="rounded-2xl bg-white p-6 flex flex-col h-full" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="dashboard-sales-channels">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[17px] font-semibold" style={{ color: INK, letterSpacing: "-0.01em" }}>
          Where sales come from.
        </h3>
        <Link href="/artist?tab=acquisition" className="text-[13px] font-medium transition-opacity hover:opacity-70" style={{ color: BLUE }} data-testid="link-channels-view-all">
          View all
        </Link>
      </div>
      <p className="flex-1 flex items-center text-[13px] leading-relaxed" style={{ color: SUBINK }}>
        As orders come in, you'll see the split between your GoodTunes store,
        Shopify, and campaign traffic here.
      </p>
    </div>
  );
}

// ─── "Giving." (reference GivingCard) ─────────────────────────────────
// Honest empty until a cause is attached — never a fabricated stat.
function GivingCard() {
  return (
    <div className="rounded-2xl bg-white p-6" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="dashboard-giving">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[17px] font-semibold" style={{ color: INK, letterSpacing: "-0.01em" }}>
          Giving.
        </h3>
      </div>
      <p className="text-[13px] leading-relaxed" style={{ color: SUBINK }}>
        When a release supports a cause through GoodDeed®, the amount raised
        from your sales shows up here.
      </p>
    </div>
  );
}

// ─── Canon range switcher (reference RangeSwitcher, real presets) ──────
function RangeSwitcher({ value, onChange }: { value: PresetId; onChange: (v: PresetId) => void }) {
  // Reference switcher options exactly: Today · 7d · 30d · 90d · All.
  // (12mo stays available on the other tabs' RangePicker.)
  const opts: { v: PresetId; label: string }[] = [
    { v: "today", label: "Today" },
    { v: "7d", label: "7d" },
    { v: "30d", label: "30d" },
    { v: "90d", label: "90d" },
    { v: "all", label: "All" },
  ];
  return (
    <div
      className="inline-flex items-center p-1 rounded-full"
      style={{ backgroundColor: PILL_TRACK, gap: 2 }}
      data-testid="dashboard-range-switcher"
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={active}
            data-testid={`button-range-${o.v}`}
            className="px-3.5 h-8 text-[13px] rounded-full transition-all"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? INK : SUBINK,
              backgroundColor: active ? PILL_ACTIVE : undefined,
              boxShadow: active ? PILL_SHADOW : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Work queue (reference hero). No artist work-queue data source exists
// yet, so this renders the honest empty state — the component is wired so a
// future feed can drop straight in. ─────────────────────────────────────
function WorkQueueEmpty() {
  // Empty-state rule (Bill, 2026-08-10): the caught-up state is the SAME slim
  // bar as "Needs your attention" — never a large centered box. Good news
  // takes less room than problems.
  return (
    <section
      className="w-full flex items-center justify-between rounded-2xl bg-white px-5 py-3.5"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="work-queue-empty"
    >
      <span className="flex items-center gap-2.5 text-[13px] font-semibold" style={{ color: INK }}>
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--apple-ready)" }} aria-hidden />
        You're all caught up.
      </span>
      <span className="text-[12.5px] truncate" style={{ color: SUBINK }}>
        New work appears here the moment it needs you.
      </span>
    </section>
  );
}

// ─── Canon KPI tile — renders the nine tier-disciplined card models from
// ─── Tabs ─────────────────────────────────────────────────────────────
// Task #2893 — the merged, tier-disciplined Dashboard (old Dashboard tab +
// Overview tab in one). Top to bottom: all-time banner (never affected by
// the date-range picker) → nine date-range cards → trend chart with a
// Plays/Revenue/Orders toggle stacked over the fan map, with Recent
// activity on the right rail (below on narrow) → cert-run status.
function DashboardTab({
  qs, artistName, preset, onPresetChange,
}: {
  qs: string;
  artistName: string | null;
  preset: PresetId;
  onPresetChange: (p: PresetId) => void;
}) {
  const summary = useQuery<Summary>({ queryKey: [`/api/artist/summary?${qs}`] });
  const series = useQuery<Timeseries>({ queryKey: [`/api/artist/timeseries?${qs}`] });
  const albums = useQuery<AlbumsPayload & { range: Range }>({ queryKey: [`/api/artist/top-albums?${qs}`] });
  const cur = summary.data?.current;
  const prev = summary.data?.previous ?? null;
  const lifetime = summary.data?.lifetime ?? null;
  const firstName = artistName ? artistName.split(" ")[0] : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header — greeting + status line + range pills + the one primary action */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1
            className="text-[30px] font-semibold"
            style={{ color: INK, letterSpacing: "-0.02em", lineHeight: 1.12 }}
            data-testid="heading-artist-dashboard"
          >
            {timeGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-[14px] mt-1" style={{ color: SUBINK }}>
            Nothing needs you right now — your catalog is running clean.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <RangeSwitcher value={preset} onChange={onPresetChange} />
          {/* The reference's "View payouts" CTA is renamed until a real
              payouts surface exists — Orders is the closest real destination
              (it reconciles to Stripe payouts) but isn't a payouts page. */}
          <Link
            href="/artist?tab=orders"
            className="inline-flex items-center gap-2 text-[14px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: BLUE }}
            data-testid="button-header-view-orders"
          >
            <Banknote className="w-4 h-4" />
            View orders
          </Link>
        </div>
      </div>

      {/* HERO: the work queue (no artist queue feed yet — honest empty state) */}
      <WorkQueueEmpty />

      {/* Compact five-tile KPI strip (reference order; lifetime tile fixed) */}
      <KpiStrip cur={cur} prev={prev} lifetime={lifetime} preset={preset} loading={summary.isLoading} />

      {/* Trend earns its size once; activity recedes into a narrow rail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <div className="lg:col-span-2 min-h-0 min-w-0">
          <TrendPanel series={series.data} loading={series.isLoading} preset={preset} />
        </div>
        <div className="min-h-0 max-h-[420px]">
          <ActivityFeed items={summary.data?.activity ?? []} loading={summary.isLoading} />
        </div>
      </div>

      {/* Bottom row — top projects (2/3) + channels & giving stack (1/3).
          The fan map and cert-run status moved off this tab to match the
          reference; their data stays live on Audience/Orders. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <div className="lg:col-span-2 min-h-0 min-w-0">
          <TopProjects rows={(albums.data?.albums ?? []).slice(0, 4)} loading={albums.isLoading} />
        </div>
        <div className="min-h-0 flex flex-col gap-5">
          <SalesChannelsCard />
          <GivingCard />
        </div>
      </div>
    </div>
  );
}

// ─── "As it happens." feed (reference ActivityFeed, real activity rows) ──
const ACTIVITY_ICONS: Record<string, typeof TrendingUp> = {
  milestone: TrendingUp,
  invoice: Receipt, payout: Receipt, order: Receipt,
  stage: Disc3, release: Disc3, album: Disc3,
  roster: UserPlus, referral: UserPlus, invite: UserPlus,
  certificate: Award, cert: Award,
};

function ActivityFeed({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  const rows = useMemo(
    () => [...items].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 12),
    [items],
  );
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="panel-activity"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[20px]" style={{ letterSpacing: "-0.01em" }}>
          <span className="font-semibold" style={{ color: INK }}>As it happens.</span>{" "}
          <span className="font-medium" style={{ color: SUBINK }}>Recent activity.</span>
        </h3>
        <Link
          href="/artist?tab=orders"
          className="text-[13px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
          data-testid="link-activity-view-all"
        >
          View all
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 rounded-xl bg-[color:var(--apple-tile)]" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-[13px]" style={{ color: SUBINK }} data-testid="activity-empty">
          Orders and releases in this range will show up here.
        </p>
      ) : (
        <ul className="space-y-0.5 flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {rows.map((it, i) => {
            const Icon = ACTIVITY_ICONS[it.kind] ?? TrendingUp;
            const body = (
              <>
                <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ backgroundColor: TILE }}>
                  <Icon className="w-4 h-4" style={{ color: SUBINK }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] truncate" style={{ color: INK }}>{it.title}</div>
                  {it.detail && <div className="text-[12px] truncate" style={{ color: SUBINK }}>{it.detail}</div>}
                </div>
                <div className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: FAINT }}>
                  {fmtRel(new Date(it.ts))}
                </div>
              </>
            );
            const rowClass = "flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl hover:bg-[color:var(--apple-tile)] transition-colors";
            return (
              <li key={i} data-testid={`activity-${it.kind}-${i}`}>
                {it.href ? (
                  <Link href={it.href} className={rowClass}>{body}</Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Top projects (reference ranked list, real /api/artist/top-albums) ──
function TopProjects({ rows, loading }: { rows: AlbumsPayload["albums"]; loading: boolean }) {
  const top = rows.slice(0, 5);
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-top-projects"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[20px]" style={{ letterSpacing: "-0.01em" }}>
          <span className="font-semibold" style={{ color: INK }}>Top projects.</span>{" "}
          <span className="font-medium" style={{ color: SUBINK }}>Ranked by sales.</span>
        </h3>
        <Link
          href="/artist?tab=catalog"
          className="text-[13px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
          data-testid="link-top-projects-view-all"
        >
          View all
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded-xl bg-[color:var(--apple-tile)]" />)}
        </div>
      ) : top.length === 0 ? (
        <p className="py-8 text-center text-[13px]" style={{ color: SUBINK }} data-testid="top-projects-empty">
          No sales in this window yet.
        </p>
      ) : (
        <ul className="flex-1">
          {top.map((a, i) => (
            <li key={a.albumId} data-testid={`project-${a.albumId}`} style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}>
              <Link
                href={`/artist/albums/${a.albumId}`}
                className="flex items-center gap-3 -mx-2 px-2 py-2.5 rounded-xl hover:bg-[color:var(--apple-tile)] transition-colors"
              >
                <span className="text-[12px] font-semibold tabular-nums w-4 flex-shrink-0 text-center" style={{ color: FAINT }}>
                  {i + 1}
                </span>
                {a.artwork ? (
                  <span className="h-10 w-10 rounded-xl overflow-hidden flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }}>
                    <img src={a.artwork} alt={a.title} className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <span className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: TILE }}>
                    <Music2 className="w-4 h-4" style={{ color: SUBINK }} />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate" style={{ color: INK }}>{a.title}</div>
                  <div className="text-[12px] truncate" style={{ color: SUBINK }}>{a.artist}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: INK }}>
                    {dollars(a.revenueCents)}
                  </div>
                  <div className="text-[11px] tabular-nums" style={{ color: SUBINK }}>
                    {a.units} unit{a.units === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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

// Restyled to the reference TrendChart: white rounded-2xl p-6 card, 20px
// two-tone header, canon metric pills, LineChart with the quiet dashed grid.
// The API has no prior-period series, so a single current line renders (the
// dashed prior line lands with the data when the endpoint grows one).
const TREND_TITLE: Record<PresetId, string> = {
  today: "Today.",
  all: "All time.",
  "7d": "The last 7 days.",
  "30d": "The last 30 days.",
  "90d": "The last 90 days.",
  "12mo": "The last 12 months.",
};

function TrendPanel({ series, loading, preset }: { series?: Timeseries; loading: boolean; preset: PresetId }) {
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
    metric === "plays" ? "Daily fan plays." : metric === "revenue" ? "Daily gross revenue." : "Daily orders.";

  return (
    <div
      className="rounded-2xl bg-white p-6 h-full flex flex-col"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="chart-trend"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-[20px] font-semibold" style={{ color: INK, letterSpacing: "-0.01em" }}>
          <span style={{ color: INK }}>{TREND_TITLE[preset]} </span>
          <span style={{ color: SUBINK, fontWeight: 500 }}>{subtitle}</span>
        </h3>
        <div
          className="inline-flex items-center p-1 rounded-full"
          style={{ backgroundColor: PILL_TRACK, gap: 2 }}
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
                className="px-3 h-7 text-[12.5px] rounded-full transition-all"
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? INK : SUBINK,
                  backgroundColor: active ? PILL_ACTIVE : undefined,
                  boxShadow: active ? PILL_SHADOW : undefined,
                }}
                data-testid={`button-trend-${m.id}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      {loading ? (
        <SkeletonBlock />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: SUBINK }} data-testid="trend-empty">
          {TREND_EMPTY[metric]}
        </p>
      ) : (
        <div className="flex-1 min-h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eeeef0" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#c7c7cc" fontSize={11} />
              <YAxis
                stroke="#c7c7cc"
                fontSize={11}
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
              <Line type="monotone" dataKey="value" stroke={BLUE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
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
        <p className="text-xs text-[color:var(--apple-faint)]" data-testid="text-audience-grant">
          {compact(d.grantPlays!)} grant/comp play{d.grantPlays === 1 ? "" : "s"} ({compact(d.grantListeners ?? 0)} listener{(d.grantListeners ?? 0) === 1 ? "" : "s"}) from comped copies & previews — not counted in fan totals above.
        </p>
      ) : null}
      {d.excludedPlays && d.excludedPlays > 0 ? (
        <p className="text-xs text-[color:var(--apple-faint)]" data-testid="text-audience-excluded">
          {compact(d.excludedPlays)} staff/internal play{d.excludedPlays === 1 ? "" : "s"} also excluded.
        </p>
      ) : null}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Repeat-listener cohort" subtitle="Listeners by play count" testId="chart-cohort">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={d.repeatCohort}>
                <CartesianGrid stroke="var(--apple-grid)" vertical={false} />
                <XAxis dataKey="range" stroke="var(--apple-axis)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--apple-axis)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="listeners" fill="var(--apple-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top fans" subtitle="Anonymized — plays in window" testId="table-top-fans">
          <table className="w-full text-[13px]">
            <thead className="text-[color:var(--apple-faint)] text-[11px] uppercase tracking-wider">
              <tr><th className="text-left font-medium py-2">Fan</th><th className="text-right font-medium">Plays</th></tr>
            </thead>
            <tbody>
              {d.topFans.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-[color:var(--apple-faint)]">No fans yet in this window.</td></tr>}
              {d.topFans.map((f, i) => (
                <tr key={i} className="border-t border-[color:var(--apple-hairline)]" data-testid={`row-fan-${i}`}>
                  <td className="py-2 font-mono text-[color:var(--apple-subink)]">{f.handle}</td>
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
            <thead className="text-[color:var(--apple-faint)] text-[11px] uppercase tracking-wider">
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
              {albums.isLoading && <tr><td colSpan={9} className="py-6 text-center text-[color:var(--apple-faint)]">Loading…</td></tr>}
              {!albums.isLoading && (albums.data?.albums.length ?? 0) === 0 && <tr><td colSpan={9} className="py-6 text-center text-[color:var(--apple-faint)]">No albums in scope.</td></tr>}
              {albums.data?.albums.map((a) => (
                <tr key={a.albumId} className="border-t border-[color:var(--apple-hairline)]" data-testid={`row-album-${a.albumId}`}>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/artist/albums/${a.albumId}`}
                      className="flex items-center gap-2 min-w-0 group"
                      data-testid={`link-manage-album-${a.albumId}`}
                    >
                      {a.artwork && <img src={a.artwork} alt="" className="w-9 h-9 rounded object-cover" />}
                      <div className="min-w-0">
                        <p className="truncate font-semibold transition-colors group-hover:text-[color:var(--brand-blue)] group-hover:underline underline-offset-2">{a.title}</p>
                        <p className="truncate text-[color:var(--apple-faint)] text-[11px]">{a.artist}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-2 align-middle">
                    <BreakEvenBar albumId={a.albumId} tone="light" variant="compact" />
                  </td>
                  <td className="px-2 text-right tabular-nums font-semibold">{dollars(a.revenueCents)}</td>
                  <td className="px-2 text-right tabular-nums text-[color:var(--apple-ready)]">{dollars(a.artistShareCents)}</td>
                  <td className="px-2 text-right tabular-nums">{a.units}</td>
                  <td className="px-2 text-right tabular-nums">{a.buyers}</td>
                  <td className="px-2 text-right tabular-nums">{compact(a.plays)}</td>
                  <td className="px-2 text-right tabular-nums text-[color:var(--apple-subink)]" data-testid={`text-grant-plays-${a.albumId}`}>{compact(a.grantPlays ?? 0)}</td>
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
            <thead className="text-[color:var(--apple-faint)] text-[11px] uppercase tracking-wider">
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
              {tracks.isLoading && <tr><td colSpan={hasStaff ? 8 : 7} className="py-6 text-center text-[color:var(--apple-faint)]">Loading…</td></tr>}
              {!tracks.isLoading && (tracks.data?.tracks.length ?? 0) === 0 && <tr><td colSpan={hasStaff ? 8 : 7} className="py-6 text-center text-[color:var(--apple-faint)]">No plays yet in this window.</td></tr>}
              {tracks.data?.tracks.map((t) => (
                <tr key={t.songId} className="border-t border-[color:var(--apple-hairline)]" data-testid={`row-track-${t.songId}`}>
                  <td className="py-2 pr-3">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-[color:var(--apple-faint)] text-[11px] truncate">{t.albumTitle}</p>
                  </td>
                  <td className="px-2 text-right tabular-nums">{compact(t.plays)}</td>
                  <td className="px-2 text-right tabular-nums text-[color:var(--apple-subink)]" data-testid={`text-grant-plays-track-${t.songId}`}>{compact(t.grantPlays ?? 0)}</td>
                  {hasStaff && (
                    <td className="px-2 text-right tabular-nums text-[color:var(--apple-faint)]" title={`${t.staffCompletes ?? 0} full listens`} data-testid={`text-staff-plays-track-${t.songId}`}>
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
          <p className="mt-2 text-xs text-[color:var(--apple-faint)]" data-testid="text-staff-note">
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
    <div className="rounded-2xl bg-white ring-1 ring-[color:var(--apple-hairline)] p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[color:var(--apple-ink)]">{title}</h2>
          {subtitle && <p className="text-[color:var(--apple-faint)] text-[12px] mt-0.5">{subtitle}</p>}
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
  return <div className="h-48 rounded-2xl bg-white ring-1 ring-[color:var(--apple-hairline)] animate-pulse" />;
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
      <p className="py-10 text-center text-[13px] text-[color:var(--apple-faint)]" data-testid="empty-team">
        Invite a manager or band member — they'll get their own sign-in, and you stay in control.
      </p>

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
                      ? "border-transparent bg-[color:var(--apple-ink)] text-white"
                      : "border-[color:var(--apple-hairline)] bg-white text-[color:var(--apple-subink)] hover:text-[color:var(--apple-ink)]"
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
              className="w-full rounded-md border border-[color:var(--apple-hairline)] bg-white px-3 py-2 text-sm text-[color:var(--apple-ink)] placeholder:text-[color:var(--apple-faint)]"
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

// Canon status = small dot + quiet label (no colored pills).
const INVITE_STATUS_DOT: Record<InviteStatus, string> = {
  Invited: "var(--apple-blue)",
  Joined: "var(--apple-ready)",
  Revoked: "var(--apple-faint)",
  Expired: "var(--apple-faint)",
};

function InviteStatusPill({ status, testId }: { status: InviteStatus; testId?: string }) {
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--apple-subink)]"
      data-testid={testId}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: INVITE_STATUS_DOT[status] }} aria-hidden />
      {status}
    </span>
  );
}

function FunnelStat({ label, value, accent, testId }: { label: string; value: string; accent?: boolean; testId: string }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-[color:var(--apple-hairline)] px-3 py-2.5" data-testid={testId}>
      <p className={`text-lg font-bold tabular-nums leading-none ${accent ? "text-[color:var(--apple-ready)]" : ""}`} data-testid={`${testId}-value`}>{value}</p>
      <p className="mt-1 text-[color:var(--apple-subink)] text-xs">{label}</p>
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
      <p className="text-[color:var(--apple-subink)] text-xs mb-3" data-testid="text-invite-slots">
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
                      ? "border-transparent bg-[color:var(--apple-ink)] text-white"
                      : "border-[color:var(--apple-hairline)] bg-white text-[color:var(--apple-subink)] hover:text-[color:var(--apple-ink)]"
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
                <p className="text-xs text-[color:var(--apple-subink)]">
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
                className="w-full rounded-md border border-[color:var(--apple-hairline)] bg-white px-3 py-2 text-sm text-[color:var(--apple-ink)] placeholder:text-[color:var(--apple-faint)]"
                data-testid="input-label-name"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="artist@example.com"
              required
              className="w-full rounded-md border border-[color:var(--apple-hairline)] bg-white px-3 py-2 text-sm text-[color:var(--apple-ink)] placeholder:text-[color:var(--apple-faint)]"
              data-testid="input-artist-email"
            />
            <textarea
              value={welcomeNote}
              onChange={(e) => setWelcomeNote(e.target.value)}
              placeholder="Optional personal note (1-2 sentences)"
              maxLength={1000}
              rows={2}
              className="w-full rounded-md border border-[color:var(--apple-hairline)] bg-white px-3 py-2 text-sm text-[color:var(--apple-ink)] placeholder:text-[color:var(--apple-faint)]"
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
          <p className="text-xs uppercase tracking-wider text-[color:var(--apple-subink)] mb-2">Suggested by GoodTunes</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSuggestion(s)}
                disabled={atCap}
                title={s.notes ?? s.email}
                className="text-xs px-2.5 py-1.5 rounded-full bg-[color:var(--apple-tile)] hover:bg-[color:var(--apple-track)] border border-[color:var(--apple-hairline)] text-[color:var(--apple-ink)] disabled:opacity-40"
                data-testid={`button-earmarked-${s.id}`}
              >
                <span className="font-semibold">{s.name}</span>
                <span className="text-[color:var(--apple-faint)] ml-1.5">{s.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {invites.length > 0 ? (
        <ul className="mt-4 divide-y divide-[color:var(--apple-hairline)]" data-testid="list-artist-invites">
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
                    <img src={iv.scopeThumbUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-[color:var(--apple-tile)]" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-[color:var(--apple-tile)]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-sm flex items-center gap-1.5" data-testid={`text-artist-invite-name-${iv.id}`}>
                      <span className="truncate min-w-0">{iv.scopeName ?? iv.email}</span>
                      {iv.role === "label" && (
                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-[color:var(--apple-subink)] bg-[color:var(--apple-tile)] rounded px-1.5 py-0.5" data-testid={`tag-artist-invite-role-${iv.id}`}>Label</span>
                      )}
                    </p>
                    <p className="text-xs text-[color:var(--apple-subink)] truncate">{iv.email}</p>
                  </div>
                  <InviteStatusPill status={status} testId={`text-artist-invite-status-${iv.id}`} />
                </div>
                <div className="mt-1.5 pl-14 flex items-start justify-between gap-3">
                  <p className="text-xs text-[color:var(--apple-subink)] min-w-0" data-testid={`text-artist-invite-meta-${iv.id}`}>
                    {metaBits.join(" · ")}
                  </p>
                  {accepted && (
                    <div className="text-right shrink-0" data-testid={`text-artist-invite-units-${iv.id}`}>
                      <p className="text-xs text-[color:var(--apple-ink)] tabular-nums">{stats?.units ?? 0} unit{(stats?.units ?? 0) === 1 ? "" : "s"} sold</p>
                      {stats && stats.pendingCents > 0 && (
                        <p className="text-xs text-[color:var(--apple-ready)] tabular-nums">{fmtMoney(stats.pendingCents)} pending</p>
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
                        className="text-[color:var(--apple-subink)] hover:text-[color:var(--apple-ink)] px-2 py-1"
                        data-testid={`button-copy-artist-invite-${iv.id}`}
                      >
                        {copiedId === iv.id ? "Copied" : "Copy link"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => resend.mutate(iv.id)}
                      disabled={resend.isPending}
                      className="text-[color:var(--apple-subink)] hover:text-[color:var(--apple-ink)] px-2 py-1 disabled:opacity-40"
                      data-testid={`button-resend-artist-invite-${iv.id}`}
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Revoke invite to ${iv.email}? This frees up an invite slot.`)) revoke.mutate(iv.id); }}
                      disabled={revoke.isPending}
                      className="text-[color:var(--apple-critical)] hover:opacity-80 px-2 py-1 disabled:opacity-40"
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
        <div className="mt-4 rounded-xl border border-dashed border-[color:var(--apple-hairline)] px-4 py-8 text-center" data-testid="empty-artist-invites">
          <p className="font-semibold text-sm text-[color:var(--apple-ink)]">Tell other artists about GoodTunes</p>
          <p className="mt-1 text-[color:var(--apple-subink)] text-xs max-w-sm mx-auto">
            Invite the artists and labels you rate. When they join and start selling, you earn $1 on every paid unit they ship — for one year. Use <span className="font-semibold text-[color:var(--apple-ink)]">Invite</span> above to send your first one.
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
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--apple-tile)] ring-1 ring-[color:var(--apple-hairline)] px-3 py-1.5 text-xs font-semibold text-[color:var(--apple-ink)] hover:bg-[color:var(--apple-track)] transition-colors"
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
    return <p className="py-10 text-center text-[color:var(--apple-faint)] text-[13px]">Loading…</p>;
  }
  if (q.isError) {
    return <p className="py-10 text-center text-[color:var(--apple-faint)] text-[13px]">Couldn't load referrals.</p>;
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
          <p className="py-8 text-center text-[color:var(--apple-subink)] text-sm" data-testid="empty-referrals">
            No one's joined yet. Invite an artist or label above — once they accept, they'll
            show up here with the units they've sold and your $1-per-unit payout.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--apple-hairline)]">
            {d.partners.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3" data-testid={`row-referred-${p.id}`}>
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-[color:var(--apple-tile)]" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-[color:var(--apple-tile)]" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-[color:var(--apple-subink)]">
                    {p.units} unit{p.units === 1 ? "" : "s"} attributed
                    {p.earningWindowActive === false ? (
                      <span className="ml-2 text-[color:var(--apple-faint)]" data-testid={`status-window-ended-${p.id}`}>· Earning ended</span>
                    ) : p.earningWindowEndsAt ? (
                      <span className="ml-2 text-[color:var(--apple-faint)]" data-testid={`status-window-active-${p.id}`}>
                        · Earning through {new Date(p.earningWindowEndsAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="text-[color:var(--apple-ready)] tabular-nums font-semibold text-sm">{fmt(p.pendingCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {/* Task #350 — pending swaps. Renders only when the artist has
          active per-album referral rows. */}
      {swapRows.length > 0 && (
        <Card title="Project swaps" subtitle="Artist-to-artist referrals — one project each, until a swap is set." testId="table-swaps">
          <ul className="divide-y divide-[color:var(--apple-hairline)]">
            {swapRows.map((s) => {
              const frozen = !!s.frozenAt;
              return (
                <li key={s.id} className="py-3" data-testid={`row-swap-${s.id}`}>
                  <div className="flex items-center gap-3">
                    {s.otherPhotoUrl ? (
                      <img src={s.otherPhotoUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-[color:var(--apple-tile)]" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-[color:var(--apple-tile)]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{s.otherName}</p>
                      <p className="text-xs text-[color:var(--apple-subink)]">
                        {s.role === "referrer" ? "You referred them" : "They referred you"}
                        {s.albumId ? <> · <span className="text-[color:var(--apple-subink)]">project bound</span></> : <> · <span className="text-[color:var(--apple-subink)]">not yet bound to a project</span></>}
                        {frozen && <span className="ml-2 text-[color:var(--apple-ready)]">· Frozen (first sale shipped)</span>}
                      </p>
                    </div>
                  </div>
                  {!frozen && (
                    <div className="mt-2 pl-14 flex flex-wrap items-center gap-2 text-xs">
                      {s.role === "invitee" ? (
                        <>
                          <span className="text-[color:var(--apple-subink)]">Keep the per-unit credit on this project?</span>
                          <button
                            type="button"
                            onClick={() => preElect.mutate({ id: s.id, state: "invitee_keeps_full" })}
                            disabled={preElect.isPending || s.swapState === "invitee_keeps_full"}
                            className={`px-2.5 py-1 rounded-md font-semibold ${
                              s.swapState === "invitee_keeps_full"
                                ? "bg-[color:var(--apple-ready-wash)] text-[color:var(--apple-ready)]"
                                : "bg-[color:var(--apple-tile)] hover:bg-[color:var(--apple-track)] text-[color:var(--apple-ink)]"
                            }`}
                            data-testid={`button-swap-keep-${s.id}`}
                          >
                            {s.swapState === "invitee_keeps_full" ? "✓ I keep it" : "I keep it"}
                          </button>
                          <button
                            type="button"
                            onClick={() => preElect.mutate({ id: s.id, state: "referrer_keeps_full" })}
                            disabled={preElect.isPending || s.swapState !== "invitee_keeps_full"}
                            className="px-2.5 py-1 rounded-md font-semibold bg-[color:var(--apple-tile)] hover:bg-[color:var(--apple-track)] text-[color:var(--apple-subink)]"
                            data-testid={`button-swap-default-${s.id}`}
                          >
                            Let them keep it
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-[color:var(--apple-subink)]">Pre-elect this artist for a project of yours:</span>
                          <button
                            type="button"
                            onClick={() => preElect.mutate({ id: s.id, state: "invitee_keeps_full" })}
                            disabled={preElect.isPending || s.swapState === "invitee_keeps_full"}
                            className={`px-2.5 py-1 rounded-md font-semibold ${
                              s.swapState === "invitee_keeps_full"
                                ? "bg-[color:var(--apple-chip)] text-[color:var(--apple-ink)]"
                                : "bg-[color:var(--apple-tile)] hover:bg-[color:var(--apple-track)] text-[color:var(--apple-ink)]"
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
          <ul className="divide-y divide-[color:var(--apple-hairline)]" data-testid="list-referred-npos">
            {d.nonProfits.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3" data-testid={`row-referred-npo-${o.id}`}>
                {o.logoUrl ? (
                  <img src={o.logoUrl} alt="" className="w-10 h-10 rounded object-cover bg-[color:var(--apple-tile)]" />
                ) : (
                  <div className="w-10 h-10 rounded bg-[color:var(--apple-tile)]" />
                )}
                <p className="flex-1 min-w-0 font-semibold truncate">{o.name}</p>
                <span className="text-[11px] text-[color:var(--apple-subink)] uppercase tracking-wider">Non-profit</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
