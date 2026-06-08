import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "@/lib/brand-tokens";
import { formatUsdCents } from "@shared/money";

// ─── Task #1751 — "Where your fans are buying" sales map ────────────────
// Shared across the Artist / Label / Manager partner dashboards. Renders a
// muted choropleth world map shaded by sales intensity, a ranked location
// list with share bars, a metric toggle, a US-state drill, geocoded city
// points, an expandable full-regions table with CSV export, and a
// best-effort "Top sources" panel.
//
// The map data ships from `salesGeography()` in server/reports/buyers.ts —
// only city / region / country leave the server, and revenue is gross.

type Metric = "units" | "revenue" | "customers";

type SalesMetrics = { units: number; revenueCents: number; customers: number };
export type SalesGeoPayload =
  | (SalesMetrics extends never ? never : {
      regions: (SalesMetrics & { code: string | null })[];
      states: (SalesMetrics & { code: string })[];
      points: (SalesMetrics & {
        city: string | null;
        region: string | null;
        country: string | null;
        lat: number;
        lon: number;
      })[];
      totals: SalesMetrics;
      sources: (SalesMetrics & { key: string; label: string })[];
      referred: SalesMetrics;
      meta: { totalCities: number; geocoded: number };
    })
  | null
  | undefined;

type GeoFeature = {
  properties: { id: string | null; name: string };
  geometry: { type: string; coordinates: any };
};
type FeatureCollection = { features: GeoFeature[] };

const METRICS: { key: Metric; label: string }[] = [
  { key: "units", label: "Units sold" },
  { key: "revenue", label: "Revenue (gross)" },
  { key: "customers", label: "Customers" },
];

const DOT_COLORS = [
  BRAND.blue,
  BRAND.mint,
  BRAND.purple,
  BRAND.amber,
  BRAND.heart,
  "#7BD8FF",
  "#A4F0C8",
  "#9BA8FF",
  "#F2B6FF",
  "#FFD590",
];

function metricValue(m: SalesMetrics, metric: Metric): number {
  return metric === "units" ? m.units : metric === "revenue" ? m.revenueCents : m.customers;
}
function formatMetric(value: number, metric: Metric): string {
  if (metric === "revenue") return formatUsdCents(value);
  return value.toLocaleString();
}

// Lazy-load (and code-split) the vendored Natural Earth geometry.
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

// Continental-US window with a cos(lat) longitude correction so the drill
// map isn't vertically stretched. Alaska / Hawaii / territories fall
// outside this window and are clipped from the map (they remain in the list).
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
  // Cheap centroid test on the first ring keeps AK/HI/PR off the map.
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

function shadeFor(intensity: number): string {
  // Muted base → brand blue ramp. 0 keeps a faint graticule fill.
  if (intensity <= 0) return "rgba(255,255,255,0.05)";
  const alpha = 0.18 + Math.min(1, intensity) * 0.72;
  return `rgba(49,158,216,${alpha.toFixed(3)})`;
}

type HoverState = { name: string; value: string; x: number; y: number } | null;

type RankedRow = {
  key: string;
  name: string;
  value: number;
  color: string;
};

function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}
function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SalesMap({
  data,
  loading,
  title = "Where your fans are buying",
}: {
  data: SalesGeoPayload;
  loading?: boolean;
  title?: string;
}) {
  const [metric, setMetric] = useState<Metric>("units");
  const [drillUs, setDrillUs] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [hover, setHover] = useState<HoverState>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  const world = useGeoData("world");
  const usGeo = useGeoData(drillUs ? "us" : "world");

  const hasUsStates = !!data && data.states.length > 0;

  // Reset the drill if a metric/scope change leaves no state data.
  useEffect(() => {
    if (drillUs && !hasUsStates) setDrillUs(false);
  }, [drillUs, hasUsStates]);

  // ── Name lookups derived from the GeoJSON feature labels ──────────────
  const worldNames = useMemo(() => {
    const m = new Map<string, string>();
    world?.features.forEach((f) => {
      if (f.properties.id) m.set(f.properties.id.toUpperCase(), f.properties.name);
    });
    return m;
  }, [world]);
  const usNames = useMemo(() => {
    const m = new Map<string, string>();
    (drillUs ? usGeo : null)?.features.forEach((f) => {
      if (f.properties.id) m.set(f.properties.id.toUpperCase(), f.properties.name);
    });
    return m;
  }, [usGeo, drillUs]);

  // ── Value maps keyed by region/state code ─────────────────────────────
  const regionValues = useMemo(() => {
    const m = new Map<string, number>();
    data?.regions.forEach((r) => {
      if (r.code) m.set(r.code.toUpperCase(), metricValue(r, metric));
    });
    return m;
  }, [data, metric]);
  const stateValues = useMemo(() => {
    const m = new Map<string, number>();
    data?.states.forEach((s) => m.set(s.code.toUpperCase(), metricValue(s, metric)));
    return m;
  }, [data, metric]);

  const activeValues = drillUs ? stateValues : regionValues;
  const maxValue = useMemo(() => {
    let mx = 0;
    activeValues.forEach((v) => {
      if (v > mx) mx = v;
    });
    return mx;
  }, [activeValues]);

  // ── Ranked list rows ──────────────────────────────────────────────────
  const ranked: RankedRow[] = useMemo(() => {
    if (!data) return [];
    if (drillUs) {
      return data.states
        .map((s) => ({
          key: s.code,
          name: usNames.get(s.code.toUpperCase()) ?? s.code,
          value: metricValue(s, metric),
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((r, i) => ({ ...r, color: DOT_COLORS[i % DOT_COLORS.length] }));
    }
    return data.regions
      .map((r) => ({
        key: r.code ?? "unknown",
        name: r.code ? worldNames.get(r.code.toUpperCase()) ?? r.code : "Unknown",
        value: metricValue(r, metric),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((r, i) => ({ ...r, color: DOT_COLORS[i % DOT_COLORS.length] }));
  }, [data, drillUs, metric, worldNames, usNames]);

  const rankedTotal = useMemo(() => ranked.reduce((s, r) => s + r.value, 0), [ranked]);

  // ── City points for the active view ───────────────────────────────────
  const cityPoints = useMemo(() => {
    if (!data) return [];
    const proj = drillUs ? usProj : worldProj;
    return data.points
      .map((p) => ({ ...p, value: metricValue(p, metric) }))
      .filter((p) => {
        if (p.value <= 0) return false;
        if (drillUs) {
          const c = (p.country ?? "").toUpperCase();
          if (!(c === "US" || c === "USA" || c.startsWith("UNITED STATES"))) return false;
          if (p.lon < -130 || p.lon > -60 || p.lat < 20 || p.lat > 55) return false;
        }
        return true;
      })
      .map((p) => {
        const [x, y] = proj(p.lon, p.lat);
        return { ...p, x, y };
      });
  }, [data, drillUs, metric]);
  const maxCityValue = useMemo(
    () => cityPoints.reduce((mx, p) => Math.max(mx, p.value), 0),
    [cityPoints],
  );

  const features = drillUs ? usGeo?.features ?? [] : world?.features ?? [];
  const viewBox = drillUs ? `0 0 ${US_VB_W} ${US_VB_H}` : WORLD_VIEWBOX;
  const proj = drillUs ? usProj : worldProj;

  function moveHover(e: React.MouseEvent, name: string, value: number) {
    const wrap = mapWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setHover({
      name,
      value: formatMetric(value, metric),
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  const totals = data?.totals;
  const referredUnits = data?.referred.units ?? 0;
  const sourcesTotal = useMemo(
    () => (data?.sources ?? []).reduce((s, r) => s + metricValue(r, metric), 0),
    [data, metric],
  );

  const isEmpty = !loading && data && ranked.length === 0;

  return (
    <div data-testid="sales-map" className="space-y-4">
      {/* Header: title + metric toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {totals && (
            <p className="mt-0.5 text-xs text-fan-secondary" data-testid="sales-map-summary">
              {totals.units.toLocaleString()} units · {formatUsdCents(totals.revenueCents)} gross ·{" "}
              {totals.customers.toLocaleString()} customers
            </p>
          )}
        </div>
        <div
          className="inline-flex rounded-lg bg-white/5 p-0.5 text-xs"
          role="tablist"
          aria-label="Map metric"
        >
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              data-testid={`metric-${m.key}`}
              className={
                "rounded-md px-2.5 py-1 font-medium transition-colors " +
                (metric === m.key ? "bg-white/15 text-white" : "text-fan-secondary hover:text-fan-primary")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drill breadcrumb */}
      {(drillUs || hasUsStates) && (
        <div className="flex items-center gap-2 text-xs text-fan-secondary">
          {drillUs ? (
            <>
              <button
                type="button"
                onClick={() => setDrillUs(false)}
                data-testid="drill-back"
                className="rounded-md bg-white/5 px-2 py-1 font-medium text-fan-secondary hover:bg-white/10"
              >
                ← World
              </button>
              <span className="text-fan-faint">/</span>
              <span className="text-fan-secondary">United States — by state</span>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setDrillUs(true)}
              data-testid="drill-us"
              className="rounded-md bg-white/5 px-2 py-1 font-medium text-fan-secondary hover:bg-white/10"
            >
              Drill into U.S. states →
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Choropleth */}
        <div ref={mapWrapRef} className="relative lg:col-span-3">
          {loading ? (
            <div className="aspect-[2/1] w-full animate-pulse rounded-xl bg-white/5" />
          ) : (
            <svg
              viewBox={viewBox}
              className="w-full rounded-xl bg-white/[0.02] ring-1 ring-white/10"
              role="img"
              aria-label={title}
              onMouseLeave={() => setHover(null)}
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
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={0.5}
                    onMouseMove={(e) => v > 0 && moveHover(e, f.properties.name, v)}
                    style={{ cursor: v > 0 ? "pointer" : "default" }}
                  />
                );
              })}
              {/* Geocoded city points */}
              {cityPoints.map((p, i) => {
                const r = 1.5 + (maxCityValue > 0 ? (p.value / maxCityValue) * 5 : 0);
                const label = [p.city, p.region, p.country].filter(Boolean).join(", ");
                return (
                  <circle
                    key={`pt-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={BRAND.mint}
                    fillOpacity={0.55}
                    stroke={BRAND.mint}
                    strokeOpacity={0.9}
                    strokeWidth={0.4}
                    onMouseMove={(e) => moveHover(e, label || "City", p.value)}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
            </svg>
          )}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md px-2 py-1 text-xs text-white shadow-lg"
              style={{
                left: hover.x,
                top: hover.y - 8,
                background: BRAND.headerGradientTop,
                border: "1px solid rgba(255,255,255,0.15)",
              }}
              data-testid="map-tooltip"
            >
              <span className="font-medium">{hover.name}</span>
              <span className="ml-2 text-fan-secondary">{hover.value}</span>
            </div>
          )}
        </div>

        {/* Ranked list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-white/5" />
              ))}
            </div>
          ) : isEmpty ? (
            <p className="py-8 text-center text-sm text-fan-secondary" data-testid="sales-map-empty">
              No sales with location data in this range yet.
            </p>
          ) : (
            <ul className="space-y-1.5" data-testid="ranked-list">
              {ranked.slice(0, showFull ? ranked.length : 8).map((r) => {
                const share = rankedTotal > 0 ? (r.value / rankedTotal) * 100 : 0;
                return (
                  <li
                    key={r.key}
                    data-testid={`ranked-row-${r.key}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-[9999px]"
                      style={{ background: r.color }}
                    />
                    <span className="w-28 flex-shrink-0 truncate text-fan-primary">{r.name}</span>
                    <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${share}%`, background: r.color, opacity: 0.7 }}
                      />
                    </span>
                    <span className="w-16 flex-shrink-0 text-right tabular-nums text-fan-secondary">
                      {formatMetric(r.value, metric)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && ranked.length > 8 && (
            <button
              type="button"
              onClick={() => setShowFull((s) => !s)}
              data-testid="toggle-full-regions"
              className="mt-3 text-xs font-medium text-[color:var(--brand-blue)] hover:underline"
            >
              {showFull ? "Show top 8" : `Show all ${ranked.length}`}
            </button>
          )}
        </div>
      </div>

      {/* Full breakdown table + export */}
      {!loading && data && ranked.length > 0 && (
        <details
          className="rounded-xl bg-white/[0.02] ring-1 ring-white/10"
          data-testid="full-breakdown"
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fan-secondary">
            Full breakdown ({ranked.length} {drillUs ? "states" : "regions"})
          </summary>
          <div className="border-t border-white/10 px-4 py-3">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                data-testid="export-csv"
                onClick={() => {
                  const rows: string[][] = [[drillUs ? "State" : "Country", "Units", "Revenue (gross)", "Customers"]];
                  const list = drillUs ? data.states : data.regions;
                  const nameOf = (code: string | null) =>
                    code
                      ? (drillUs ? usNames : worldNames).get(code.toUpperCase()) ?? code
                      : "Unknown";
                  [...list]
                    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
                    .forEach((row) => {
                      rows.push([
                        nameOf((row as any).code),
                        String(row.units),
                        (row.revenueCents / 100).toFixed(2),
                        String(row.customers),
                      ]);
                    });
                  downloadCsv(
                    `sales-by-${drillUs ? "state" : "country"}.csv`,
                    toCsv(rows),
                  );
                }}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-fan-secondary hover:bg-white/10"
              >
                Export CSV
              </button>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0B1457] text-left text-xs text-fan-secondary">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">{drillUs ? "State" : "Country"}</th>
                    <th className="py-1.5 px-2 text-right font-medium">Units</th>
                    <th className="py-1.5 px-2 text-right font-medium">Revenue</th>
                    <th className="py-1.5 pl-2 text-right font-medium">Customers</th>
                  </tr>
                </thead>
                <tbody className="text-fan-secondary">
                  {[...(drillUs ? data.states : data.regions)]
                    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
                    .map((row, i) => {
                      const code = (row as any).code as string | null;
                      const name = code
                        ? (drillUs ? usNames : worldNames).get(code.toUpperCase()) ?? code
                        : "Unknown";
                      return (
                        <tr key={code ?? i} className="border-t border-white/5">
                          <td className="py-1.5 pr-2">{name}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {row.units.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {formatUsdCents(row.revenueCents)}
                          </td>
                          <td className="py-1.5 pl-2 text-right tabular-nums">
                            {row.customers.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {/* Top sources (best-effort) */}
      {!loading && data && data.sources.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/10" data-testid="top-sources">
          <h4 className="text-sm font-semibold text-white">Top sources</h4>
          <p className="mt-0.5 text-xs text-fan-secondary">
            Where these orders originated. Best-effort, based on checkout origin.
          </p>
          <ul className="mt-3 space-y-1.5">
            {[...data.sources]
              .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
              .map((s, i) => {
                const v = metricValue(s, metric);
                const share = sourcesTotal > 0 ? (v / sourcesTotal) * 100 : 0;
                const color = DOT_COLORS[i % DOT_COLORS.length];
                return (
                  <li
                    key={s.key}
                    data-testid={`source-row-${s.key}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-[9999px]"
                      style={{ background: color }}
                    />
                    <span className="w-40 flex-shrink-0 truncate text-fan-primary">{s.label}</span>
                    <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${share}%`, background: color, opacity: 0.7 }}
                      />
                    </span>
                    <span className="w-16 flex-shrink-0 text-right tabular-nums text-fan-secondary">
                      {formatMetric(v, metric)}
                    </span>
                  </li>
                );
              })}
          </ul>
          {referredUnits > 0 && (
            <p className="mt-3 text-xs text-fan-secondary" data-testid="referred-note">
              {referredUnits.toLocaleString()} of these units came through a referral or affiliate
              link ({formatUsdCents(data.referred.revenueCents)} gross).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
