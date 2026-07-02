import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag,
  Users,
  DollarSign,
  Play,
  Heart,
  Headphones,
  Package,
  ChevronDown,
  ChevronRight,
  MapPin,
  Sparkles,
  UserPlus,
  Repeat,
  Download,
} from "lucide-react";
import { Link } from "wouter";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

// Task #1525 — Per-album performance Dashboard (first/default tab). White-
// slate admin chrome (NOT the fan Apple-Music chrome). Visible to artist
// AND label partners for their own album; operators for any album. All
// numbers come from GET /api/admin/albums/:id/dashboard, which reuses the
// same compute path as the catalog /artist dashboard so they can't drift.

type Lifetime = {
  grossCents: number;
  units: number;
  orders: number;
  buyers: number;
  refundedCents: number;
  plays: number;
  listeners: number;
};
type Addon = { sku: string; label: string; count: number; revenueCents: number };
type TopSong = {
  songId: string;
  title: string;
  plays: number;
  completes: number;
  favorites: number;
};
type GeoFan = { id: string; name: string };
type GeoPoint = {
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
  orders: number;
  fans: number;
  // Operator-only: individual fans in this city (each links to
  // /admin/customers/:id). Undefined for partner viewers — see the PII
  // guardrail in server/reports/buyers.ts.
  fanList?: GeoFan[];
};
type DashboardPayload = {
  lifetime: Lifetime;
  addons: Addon[];
  newVsReturning: { newBuyers: number; returningBuyers: number };
  topSongs: TopSong[];
  geo: { points: GeoPoint[]; totalCities: number; geocoded: number };
};

type AddonBuyer = {
  orderId: string;
  name: string;
  quantity: number;
  date: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function locationStr(b: { city: string | null; region: string | null; country: string | null }) {
  return [b.city, b.region, b.country].filter(Boolean).join(", ") || "Location unknown";
}

function StatCard({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  testId?: string;
}) {
  return (
    <div
      className="relative rounded-xl border border-slate-200 bg-white p-4"
      data-testid={testId}
    >
      <Icon className="absolute top-4 right-4 w-4 h-4 text-slate-300" strokeWidth={1.6} />
      <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  testId,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testId?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid={testId}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// Light-chrome CSV download link for the white admin surface. A plain GET <a>
// — the dashboard export endpoints are cookie-authenticated, so the browser
// sends the admin session automatically. `disabled` greys it out when there's
// nothing to export yet.
function CsvDownload({
  albumId,
  dataset,
  testId,
  disabled,
}: {
  albumId: string;
  dataset: "addon-buyers" | "top-songs" | "cities";
  testId: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 whitespace-nowrap cursor-not-allowed"
        data-testid={`button-${testId}-disabled`}
      >
        <Download className="w-3.5 h-3.5" strokeWidth={2} />
        CSV
      </span>
    );
  }
  return (
    <a
      href={`/api/admin/albums/${albumId}/dashboard/export?dataset=${dataset}`}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-blue)] hover:underline underline-offset-2 whitespace-nowrap transition-colors"
      data-testid={`button-${testId}`}
    >
      <Download className="w-3.5 h-3.5" strokeWidth={2} />
      CSV
    </a>
  );
}

// New-vs-returning split bar. Purchase-based: "new" = this album was the
// fan's first-ever GoodTunes purchase; "returning" = they'd bought before.
function NewVsReturning({ newBuyers, returning }: { newBuyers: number; returning: number }) {
  const total = newBuyers + returning;
  const newPct = total > 0 ? Math.round((newBuyers / total) * 100) : 0;
  const retPct = total > 0 ? 100 - newPct : 0;
  return (
    <div className="p-5 space-y-4" data-testid="section-new-vs-returning-body">
      {total === 0 ? (
        <p className="text-sm text-slate-400" data-testid="nvr-empty">
          No purchases yet — new vs. returning will appear after the first sale.
        </p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-[var(--brand-blue)]"
              style={{ width: `${newPct}%` }}
              data-testid="nvr-bar-new"
            />
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${retPct}%` }}
              data-testid="nvr-bar-returning"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5" data-testid="nvr-new">
              <div className="w-8 h-8 rounded-lg bg-[var(--brand-blue)]/10 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-4 h-4 text-[var(--brand-blue)]" strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {newBuyers.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">
                  New fans <span className="text-slate-400">({newPct}%)</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5" data-testid="nvr-returning">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Repeat className="w-4 h-4 text-emerald-500" strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {returning.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">
                  Returning <span className="text-slate-400">({retPct}%)</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Add-ons sold, each row tappable to reveal who bought it (lazy fetch).
function AddonRow({ albumId, addon }: { albumId: string; addon: Addon }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<{ buyers: AddonBuyer[] }>({
    queryKey: ["/api/admin/albums", albumId, "dashboard", "addon-buyers", addon.sku],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/dashboard/addon-buyers?sku=${encodeURIComponent(addon.sku)}`,
      );
      return (await res.json()) as { buyers: AddonBuyer[] };
    },
    enabled: open,
  });
  return (
    <div data-testid={`addon-${addon.sku}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
        data-testid={`button-addon-${addon.sku}`}
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 truncate">{addon.label}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {addon.count.toLocaleString()}
          </span>
          <span className="text-xs text-slate-400 ml-1">sold</span>
        </div>
        <div className="w-20 text-right tabular-nums text-sm text-slate-500 flex-shrink-0">
          {formatMoney(addon.revenueCents)}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-3 pl-12" data-testid={`addon-buyers-${addon.sku}`}>
          {isLoading ? (
            <p className="text-sm text-slate-400 py-2">Loading buyers…</p>
          ) : isError ? (
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm text-[var(--brand-blue)] hover:underline py-2"
            >
              Couldn't load buyers — retry
            </button>
          ) : !data || data.buyers.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No buyers found.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/50">
              {data.buyers.map((b) => (
                <li
                  key={b.orderId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                  data-testid={`addon-buyer-${b.orderId}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-800 truncate">
                      {b.name}
                      {b.quantity > 1 && (
                        <span className="text-slate-400 font-normal"> ×{b.quantity}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{locationStr(b)}</div>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">{formatDate(b.date)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Real geographic base layer for the "Where fans live" card ───────────
// Draws country (+ US-state) outlines from the vendored Natural Earth
// GeoJSON behind the order dots, styled for the white admin surface (light
// region fills, subtle slate outlines — NOT the dark partner SalesMap
// palette). Reuses the equirectangular world projection and the cos(lat)-
// corrected continental-US window proven in partner/SalesMap.tsx.
type GeoFeature = {
  properties: { id: string | null; name: string };
  geometry: { type: string; coordinates: any };
};
type FeatureCollection = { features: GeoFeature[] };

// Lazy-load (and code-split) the vendored geometry; only the active view's
// set is fetched.
function useGeoData(kind: "world" | "us"): FeatureCollection | null {
  const [fc, setFc] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    let alive = true;
    const p =
      kind === "world"
        ? import("@/assets/geo/world-countries.geo.json")
        : import("@/assets/geo/us-states.geo.json");
    p.then((mod) => {
      if (alive) setFc(((mod as any).default ?? mod) as FeatureCollection);
    }).catch(() => {
      if (alive) setFc(null);
    });
    return () => {
      alive = false;
    };
  }, [kind]);
  return fc;
}

type Projection = (lon: number, lat: number) => [number, number];

function geometryToPath(geometry: GeoFeature["geometry"], proj: Projection): string {
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  let d = "";
  for (const poly of polys as number[][][][]) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = proj(lon, lat);
        d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
      });
      d += "Z";
    }
  }
  return d;
}

// Equirectangular world projection on an 800×400 canvas; the viewBox crops
// the empty polar bands.
const WORLD_W = 800;
const WORLD_H = 400;
const worldProj: Projection = (lon, lat) => [
  ((lon + 180) / 360) * WORLD_W,
  ((90 - lat) / 180) * WORLD_H,
];
const WORLD_VIEWBOX = "0 14 800 312";

// Continental-US window with a cos(lat) longitude correction so the map
// isn't vertically stretched. AK / HI / territories fall outside this
// window and are clipped from the map (they remain in the city list).
const US_BOUNDS = { minLon: -125, maxLon: -66, minLat: 24, maxLat: 50 };
const US_LAT_MID = (US_BOUNDS.minLat + US_BOUNDS.maxLat) / 2;
const US_LON_SCALE = Math.cos((US_LAT_MID * Math.PI) / 180);
const US_GEO_W = (US_BOUNDS.maxLon - US_BOUNDS.minLon) * US_LON_SCALE;
const US_GEO_H = US_BOUNDS.maxLat - US_BOUNDS.minLat;
const US_VB_H = 420;
const US_VB_W = Math.round((US_VB_H * US_GEO_W) / US_GEO_H);
const usProj: Projection = (lon, lat) => [
  (((lon - US_BOUNDS.minLon) * US_LON_SCALE) / US_GEO_W) * US_VB_W,
  ((US_BOUNDS.maxLat - lat) / US_GEO_H) * US_VB_H,
];

// Loose continental-US test for the auto-focus decision and dot clipping.
function pointInUs(p: GeoPoint): boolean {
  const c = (p.country ?? "").toUpperCase();
  const countryOk =
    c === "" || c === "US" || c === "USA" || c.startsWith("UNITED STATES");
  return (
    countryOk && p.lon >= -130 && p.lon <= -60 && p.lat >= 20 && p.lat <= 55
  );
}

// Light-chrome geographic city-dot map. Mirrors the partner SalesMap base
// layer but tuned for the white admin surface, and auto-focuses the
// continental US when (nearly) all geocoded points fall inside it.
function FanMap({
  points,
  onSelect,
}: {
  points: GeoPoint[];
  onSelect?: (p: GeoPoint) => void;
}) {
  const useUs = useMemo(() => {
    if (points.length === 0) return false;
    const inUs = points.filter(pointInUs).length;
    return inUs / points.length >= 0.9;
  }, [points]);

  const geo = useGeoData(useUs ? "us" : "world");

  const proj = useUs ? usProj : worldProj;
  const viewBox = useUs ? `0 0 ${US_VB_W} ${US_VB_H}` : WORLD_VIEWBOX;
  const maxOrders = Math.max(1, ...points.map((p) => p.orders));

  // In the US view, clip the few outliers off the map (they stay in the
  // city list below). The world view shows every point.
  const dots = useUs ? points.filter(pointInUs) : points;

  return (
    <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-slate-200 bg-slate-50">
      <svg viewBox={viewBox} className="w-full h-auto" data-testid="svg-fan-map">
        {geo?.features.map((f, i) => (
          <path
            key={f.properties.id ?? i}
            d={geometryToPath(f.geometry, proj)}
            fill="rgba(15,23,42,0.05)"
            stroke="rgba(15,23,42,0.18)"
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
        ))}
        {dots.map((p, i) => {
          const [x, y] = proj(p.lon, p.lat);
          const r = 2 + 6 * Math.sqrt(p.orders / maxOrders);
          return (
            <g
              key={i}
              data-testid={`map-dot-${i}`}
              onClick={onSelect ? () => onSelect(p) : undefined}
              style={onSelect ? { cursor: "pointer" } : undefined}
            >
              <circle
                cx={x}
                cy={y}
                r={r}
                fill="var(--brand-blue)"
                fillOpacity={0.35}
                stroke="var(--brand-blue)"
                strokeWidth={1}
              />
              {/* Larger transparent hit target so tiny city dots stay tappable. */}
              {onSelect && (
                <circle cx={x} cy={y} r={Math.max(r + 6, 11)} fill="transparent" />
              )}
              <title>
                {locationStr(p)} — {p.orders} order{p.orders === 1 ? "" : "s"}, {p.fans} fan
                {p.fans === 1 ? "" : "s"}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AlbumDashboardPanel({
  albumId,
  pressMode = false,
}: {
  albumId: string;
  // Press partners see commerce numbers only — engagement/play analytics
  // (Plays, Listeners, New-vs-returning, Most-popular-songs) are hidden so a
  // press never gets the artist's listening telemetry, just what they pressed.
  pressMode?: boolean;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery<DashboardPayload>({
    queryKey: ["/api/admin/albums", albumId, "dashboard"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/albums/${albumId}/dashboard`);
      return (await res.json()) as DashboardPayload;
    },
  });
  // Operator-only "Where fans live" drill-down: which city the operator
  // tapped (dot or list row). Hook stays above the loading/error guards so
  // render order never changes between states (React #310).
  const [selectedCity, setSelectedCity] = useState<GeoPoint | null>(null);

  if (isLoading) {
    return (
      <div className="py-10 text-slate-500 text-sm" data-testid="dashboard-loading">
        Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        error={error}
        onRetry={() => refetch()}
        title="Couldn't load dashboard"
        testId="album-dashboard-error"
      />
    );
  }
  if (!data) return null;

  const { lifetime, addons, newVsReturning, topSongs, geo } = data;
  const completionRate =
    lifetime.plays > 0
      ? Math.round(
          (topSongs.reduce((s, t) => s + t.completes, 0) /
            Math.max(1, topSongs.reduce((s, t) => s + t.plays, 0))) *
            100,
        )
      : 0;
  const maxPlays = Math.max(1, ...topSongs.map((t) => t.plays));
  const sortedCities = [...geo.points].sort((a, b) => b.orders - a.orders);
  // The server attaches `fanList` only for operators (super_admin/admin);
  // partners never receive customer ids. So its presence is the signal that
  // the map and city list should be drill-down-able into /admin/customers/:id.
  const fansClickable = geo.points.some((p) => Array.isArray(p.fanList));

  return (
    <div className="space-y-5" data-testid="panel-dashboard">
      {/* (1) Headline totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="kpi-grid-dashboard">
        <StatCard
          label="Units sold"
          value={lifetime.units.toLocaleString()}
          icon={ShoppingBag}
          testId="kpi-units"
        />
        <StatCard
          label="Gross revenue"
          value={formatMoney(lifetime.grossCents)}
          icon={DollarSign}
          testId="kpi-gross"
        />
        <StatCard
          label="Fans"
          value={lifetime.buyers.toLocaleString()}
          icon={Users}
          testId="kpi-buyers"
        />
        <StatCard
          label="Orders"
          value={lifetime.orders.toLocaleString()}
          icon={Package}
          testId="kpi-orders"
        />
        {!pressMode && (
          <StatCard
            label="Plays"
            value={lifetime.plays.toLocaleString()}
            icon={Play}
            testId="kpi-plays"
          />
        )}
        {!pressMode && (
          <StatCard
            label="Listeners"
            value={lifetime.listeners.toLocaleString()}
            icon={Headphones}
            testId="kpi-listeners"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* (3) New vs. returning fans — hidden for press partners. */}
        {!pressMode && (
          <SectionCard
            title="New vs. returning fans"
            subtitle="Based on purchases — was this album a fan's first GoodTunes buy?"
            testId="section-new-vs-returning"
          >
            <NewVsReturning
              newBuyers={newVsReturning.newBuyers}
              returning={newVsReturning.returningBuyers}
            />
          </SectionCard>
        )}

        {/* (2) Add-ons sold with drill-down */}
        <SectionCard
          title="Add-ons sold"
          subtitle="Tap an add-on to see who bought it"
          testId="section-addons"
          action={
            <CsvDownload
              albumId={albumId}
              dataset="addon-buyers"
              testId="export-addon-buyers"
              disabled={addons.length === 0}
            />
          }
        >
          {addons.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400" data-testid="addons-empty">
              No add-ons sold yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {addons.map((a) => (
                <AddonRow key={a.sku} albumId={albumId} addon={a} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* (4) Most popular songs — play-ranked, hidden for press partners. */}
      {!pressMode && (
      <SectionCard
        title="Most popular songs"
        subtitle={
          completionRate > 0
            ? `Ranked by plays · ${completionRate}% average completion`
            : "Ranked by plays"
        }
        testId="section-top-songs"
        action={
          <CsvDownload
            albumId={albumId}
            dataset="top-songs"
            testId="export-top-songs"
            disabled={topSongs.length === 0}
          />
        }
      >
        {topSongs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400" data-testid="top-songs-empty">
            No tracks on this album yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {topSongs.map((t, i) => (
              <li
                key={t.songId}
                className="flex items-center gap-3 px-5 py-3"
                data-testid={`top-song-${t.songId}`}
              >
                <span className="w-5 text-sm font-semibold text-slate-400 tabular-nums text-right flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{t.title}</div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--brand-blue)]"
                      style={{ width: `${Math.round((t.plays / maxPlays) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-sm tabular-nums">
                  <span className="inline-flex items-center gap-1 text-slate-600" title="Plays">
                    <Play className="w-3.5 h-3.5 text-slate-400" />
                    {t.plays.toLocaleString()}
                  </span>
                  {t.favorites > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-slate-600 hidden sm:inline-flex"
                      title="Favorites"
                    >
                      <Heart className="w-3.5 h-3.5 text-[color:var(--brand-heart)]" />
                      {t.favorites.toLocaleString()}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      )}

      {/* (5) Where fans live */}
      <SectionCard
        title="Where fans live"
        subtitle={
          geo.totalCities > 0
            ? `${geo.geocoded} of ${geo.totalCities} cities mapped`
            : "City-level, from shipping addresses"
        }
        testId="section-geo"
        action={
          <CsvDownload
            albumId={albumId}
            dataset="cities"
            testId="export-cities"
            disabled={geo.points.length === 0}
          />
        }
      >
        <div className="p-5 space-y-4">
          {geo.points.length === 0 ? (
            <p className="text-sm text-slate-400 flex items-center gap-2" data-testid="geo-empty">
              <MapPin className="w-4 h-4 text-slate-300" />
              No mapped locations yet — physical orders with a shipping address appear here.
            </p>
          ) : (
            <>
              <FanMap
                points={geo.points}
                onSelect={fansClickable ? setSelectedCity : undefined}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {sortedCities.slice(0, 8).map((c, i) => {
                  const inner = (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-slate-700 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate transition-colors group-hover:text-[color:var(--brand-blue)] group-hover:underline underline-offset-2">
                          {locationStr(c)}
                        </span>
                      </span>
                      <span className="text-slate-500 tabular-nums whitespace-nowrap">
                        {c.orders.toLocaleString()} order{c.orders === 1 ? "" : "s"}
                      </span>
                    </>
                  );
                  return fansClickable ? (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedCity(c)}
                      className="group flex w-full items-center justify-between gap-3 text-left text-sm rounded-md -mx-1.5 px-1.5 py-1 hover:bg-slate-50 transition-colors"
                      data-testid={`geo-city-${i}`}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 text-sm"
                      data-testid={`geo-city-${i}`}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Dots are city-level. Geocoding is cached via OpenStreetMap (Nominatim).
              </p>
            </>
          )}
        </div>
      </SectionCard>

      {/* Operator-only drill-down: who the fans in a tapped city are. */}
      <Dialog
        open={!!selectedCity}
        onOpenChange={(open) => {
          if (!open) setSelectedCity(null);
        }}
      >
        <DialogContent className="max-w-sm" data-testid="dialog-city-fans">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-4 h-4 text-[color:var(--brand-blue)]" />
              {selectedCity ? locationStr(selectedCity) : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedCity && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500" data-testid="text-city-summary">
                {selectedCity.fans.toLocaleString()} fan{selectedCity.fans === 1 ? "" : "s"} ·{" "}
                {selectedCity.orders.toLocaleString()} order{selectedCity.orders === 1 ? "" : "s"}
              </p>
              {(selectedCity.fanList ?? []).length === 0 ? (
                <p className="text-sm text-slate-500 py-2" data-testid="text-city-fans-empty">
                  No linked fan accounts in this city yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(selectedCity.fanList ?? []).map((f) => (
                    <li key={f.id}>
                      <Link className="group flex items-center justify-between gap-3 py-2 text-sm text-slate-700 transition-colors hover:text-[color:var(--brand-blue)]"
                        href={`/admin/customers/${f.id}`}
                        onClick={() => setSelectedCity(null)}
                        data-testid={`link-city-fan-${f.id}`}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate underline-offset-2 group-hover:underline">
                            {f.name}
                          </span>
                        </span>
                        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-slate-400 transition-colors group-hover:text-[color:var(--brand-blue)]">
                          More detail
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {selectedCity.fanList && selectedCity.fans > selectedCity.fanList.length && (
                <p className="text-xs text-slate-400 pt-1" data-testid="text-city-fans-clipped">
                  Showing {selectedCity.fanList.length} of {selectedCity.fans.toLocaleString()} fans.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
