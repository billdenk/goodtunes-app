import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BRAND } from "@/lib/brand-tokens";
import { MapPin } from "lucide-react";

// ─── Admin · Customers map ──────────────────────────────────────────────
// Light-themed, *clickable* sibling of the partner SalesMap. Plots geocoded
// customer cities on a choropleth and lists them as tappable rows beneath.
// Tapping a point OR a city row hands the (city, region, country) up to the
// Customers page, which filters the list in place — "tap a city → see those
// customers." Locations come from order shipping/billing addresses, so only
// customers who have purchased can appear here.
//
// Map data ships from GET /api/admin/customers/geo → salesGeography(); only
// city / region / country leave the server.

type GeoMetrics = { units: number; revenueCents: number; customers: number };
type GeoPoint = GeoMetrics & {
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
};
type GeoPayload = {
  regions: (GeoMetrics & { code: string | null })[];
  states: (GeoMetrics & { code: string })[];
  points: GeoPoint[];
  totals: GeoMetrics;
  meta: { totalCities: number; geocoded: number };
};

export type CitySelection = { city: string; region: string | null; country: string | null };

type GeoFeature = {
  properties: { id: string | null; name: string };
  geometry: { type: string; coordinates: any };
};
type FeatureCollection = { features: GeoFeature[] };

// Lazy-load (code-split) the vendored Natural Earth geometry.
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

const WORLD_W = 800;
const WORLD_H = 400;
const worldProj: Projection = (lon, lat) => [
  ((lon + 180) / 360) * WORLD_W,
  ((90 - lat) / 180) * WORLD_H,
];
const WORLD_VIEWBOX = "0 14 800 312";

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
function featureInUsWindow(f: GeoFeature): boolean {
  const g = f.geometry;
  const ring =
    g.type === "Polygon"
      ? g.coordinates[0]
      : g.type === "MultiPolygon"
        ? g.coordinates[0]?.[0]
        : null;
  if (!ring || !ring.length) return false;
  let sx = 0;
  let sy = 0;
  for (const [lon, lat] of ring as number[][]) {
    sx += lon;
    sy += lat;
  }
  const lon = sx / ring.length;
  const lat = sy / ring.length;
  return lon >= -130 && lon <= -60 && lat >= 20 && lat <= 55;
}

// Light slate → brand-blue land ramp on a near-white page.
function shadeFor(intensity: number): string {
  if (intensity <= 0) return "#e2e8f0"; // slate-200
  const alpha = 0.18 + Math.min(1, intensity) * 0.72;
  return `rgba(49,158,216,${alpha.toFixed(3)})`;
}

function isUsCountry(country: string | null): boolean {
  const c = (country ?? "").toUpperCase();
  return c === "US" || c === "USA" || c.startsWith("UNITED STATES");
}

function cityLabel(p: { city: string | null; region: string | null; country: string | null }): string {
  return [p.city, p.region, isUsCountry(p.country) ? null : p.country].filter(Boolean).join(", ") || "Unknown";
}

function sameCity(a: CitySelection | null | undefined, p: GeoPoint): boolean {
  if (!a) return false;
  const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
  return norm(a.city) === norm(p.city) && norm(a.region) === norm(p.region);
}

export function CustomerMap({
  activeCity,
  onSelectCity,
}: {
  activeCity?: CitySelection | null;
  onSelectCity: (sel: CitySelection) => void;
}) {
  const { data, isLoading } = useQuery<GeoPayload>({
    queryKey: ["/api/admin/customers/geo"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/customers/geo");
      return (await res.json()) as GeoPayload;
    },
  });

  const hasUsStates = !!data && data.states.length > 0;
  const [view, setView] = useState<"us" | "world">("us");
  // Fall back to the world view if there's no US state data to drill into.
  useEffect(() => {
    if (data && !hasUsStates) setView("world");
  }, [data, hasUsStates]);
  const drillUs = view === "us" && hasUsStates;

  const world = useGeoData("world");
  const usGeo = useGeoData(drillUs ? "us" : "world");

  const worldNames = useMemo(() => {
    const m = new Map<string, string>();
    world?.features.forEach((f) => {
      if (f.properties.id) m.set(f.properties.id.toUpperCase(), f.properties.name);
    });
    return m;
  }, [world]);

  // Region/state choropleth values (customers).
  const regionValues = useMemo(() => {
    const m = new Map<string, number>();
    data?.regions.forEach((r) => {
      if (r.code) m.set(r.code.toUpperCase(), r.customers);
    });
    return m;
  }, [data]);
  const stateValues = useMemo(() => {
    const m = new Map<string, number>();
    data?.states.forEach((s) => m.set(s.code.toUpperCase(), s.customers));
    return m;
  }, [data]);
  const activeValues = drillUs ? stateValues : regionValues;
  const maxValue = useMemo(() => {
    let mx = 0;
    activeValues.forEach((v) => {
      if (v > mx) mx = v;
    });
    return mx;
  }, [activeValues]);

  // City points for the active view.
  const cityPoints = useMemo(() => {
    if (!data) return [];
    const proj = drillUs ? usProj : worldProj;
    return data.points
      .filter((p) => {
        if (p.customers <= 0) return false;
        if (drillUs) {
          if (!isUsCountry(p.country)) return false;
          if (p.lon < -130 || p.lon > -60 || p.lat < 20 || p.lat > 55) return false;
        }
        return true;
      })
      .map((p) => {
        const [x, y] = proj(p.lon, p.lat);
        return { ...p, x, y };
      });
  }, [data, drillUs]);
  const maxCityValue = useMemo(
    () => cityPoints.reduce((mx, p) => Math.max(mx, p.customers), 0),
    [cityPoints],
  );

  // Ranked city list (all geocoded cities, every view). This is the primary
  // "tap the text" affordance and is never hidden by the US/World toggle.
  const rankedCities = useMemo(() => {
    if (!data) return [];
    return [...data.points]
      .filter((p) => p.customers > 0)
      .sort((a, b) => b.customers - a.customers);
  }, [data]);
  const maxRanked = rankedCities[0]?.customers ?? 0;
  const [showAll, setShowAll] = useState(false);

  const features = drillUs ? usGeo?.features ?? [] : world?.features ?? [];
  const viewBox = drillUs ? `0 0 ${US_VB_W} ${US_VB_H}` : WORLD_VIEWBOX;
  const proj = drillUs ? usProj : worldProj;

  const totals = data?.totals;
  const isEmpty = !isLoading && data && rankedCities.length === 0;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="customer-map"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[var(--brand-blue)]" strokeWidth={2} />
            Where your customers are
          </h3>
          <p className="mt-0.5 text-xs text-slate-500" data-testid="customer-map-summary">
            {totals
              ? `${rankedCities.length.toLocaleString()} ${rankedCities.length === 1 ? "city" : "cities"} · ${totals.customers.toLocaleString()} ${totals.customers === 1 ? "customer" : "customers"} with a known location`
              : "Locations come from order shipping & billing addresses"}
          </p>
        </div>
        {hasUsStates && (
          <div
            className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs"
            role="tablist"
            aria-label="Map region"
          >
            {(["us", "world"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                data-testid={`map-view-${v}`}
                className={
                  "rounded px-2.5 py-1 font-medium transition-colors " +
                  (view === v
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800")
                }
              >
                {v === "us" ? "U.S." : "World"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-5">
        {/* Choropleth + points */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="aspect-[2/1] w-full animate-pulse rounded-lg bg-slate-100" />
          ) : isEmpty ? (
            <div
              className="flex aspect-[2/1] w-full items-center justify-center rounded-lg bg-slate-50 text-center text-sm text-slate-500"
              data-testid="customer-map-empty"
            >
              No customers with location data yet.
            </div>
          ) : (
            <svg
              viewBox={viewBox}
              className="w-full rounded-lg bg-slate-50 ring-1 ring-slate-200"
              role="img"
              aria-label="Customer locations map"
            >
              {(drillUs ? features.filter(featureInUsWindow) : features).map((f, i) => {
                const code = f.properties.id?.toUpperCase() ?? "";
                const v = activeValues.get(code) ?? 0;
                const intensity = maxValue > 0 ? v / maxValue : 0;
                return (
                  <path
                    key={f.properties.id ?? i}
                    d={geometryToPath(f.geometry, proj)}
                    fill={shadeFor(intensity)}
                    stroke="#ffffff"
                    strokeWidth={0.5}
                  />
                );
              })}
              {cityPoints.map((p, i) => {
                const r = 2.5 + (maxCityValue > 0 ? (p.customers / maxCityValue) * 6 : 0);
                const active = sameCity(activeCity, p);
                return (
                  <g key={`pt-${i}`}>
                    {active && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={r + 3}
                        fill="none"
                        stroke={BRAND.purple}
                        strokeWidth={1.5}
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={active ? BRAND.purple : BRAND.blue}
                      fillOpacity={0.7}
                      stroke="#ffffff"
                      strokeWidth={0.8}
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        onSelectCity({ city: p.city ?? "", region: p.region, country: p.country })
                      }
                      data-testid={`map-point-${(p.city ?? "city").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      <title>{`${cityLabel(p)} — ${p.customers.toLocaleString()} ${p.customers === 1 ? "customer" : "customers"}`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Ranked, tappable city list */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : isEmpty ? (
            <p className="py-6 text-sm text-slate-500">
              Once customers buy with a shipping or billing address, their cities show up here.
            </p>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                Top cities · tap to filter
              </div>
              <ul className="space-y-1" data-testid="customer-map-city-list">
                {rankedCities.slice(0, showAll ? rankedCities.length : 10).map((p, i) => {
                  const active = sameCity(activeCity, p);
                  const share = maxRanked > 0 ? (p.customers / maxRanked) * 100 : 0;
                  return (
                    <li key={`${p.city}-${p.region}-${i}`}>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectCity({ city: p.city ?? "", region: p.region, country: p.country })
                        }
                        data-testid={`city-row-${(p.city ?? "city").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        className={
                          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                          (active ? "bg-[var(--brand-blue)]/10" : "hover:bg-slate-50")
                        }
                      >
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ background: active ? BRAND.purple : BRAND.blue }}
                        />
                        <span
                          className={
                            "min-w-0 flex-1 truncate " +
                            (active ? "font-semibold text-slate-900" : "text-slate-700")
                          }
                        >
                          {cityLabel(p)}
                        </span>
                        <span className="relative hidden h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-full bg-slate-100 sm:block">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${share}%`, background: BRAND.blue, opacity: 0.55 }}
                          />
                        </span>
                        <span className="w-8 flex-shrink-0 text-right tabular-nums text-slate-500">
                          {p.customers.toLocaleString()}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {rankedCities.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAll((s) => !s)}
                  data-testid="toggle-all-cities"
                  className="mt-2 text-xs font-medium text-[var(--brand-blue)] hover:underline"
                >
                  {showAll ? "Show top 10" : `Show all ${rankedCities.length} cities`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
