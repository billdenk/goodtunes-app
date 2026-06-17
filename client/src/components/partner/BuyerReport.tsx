// Task #938 — Shared buyer report for the artist (`/artist`) and NPO
// (`/non-profit`) dashboards: a scope-filtered roster (who bought what,
// newest first) plus a Fan-Map-style "where they live" city map.
//
// Both dashboards are light admin surfaces, so this renders light panels
// (matching the light admin Fan Map). Server-side scoping guarantees no
// cross-partner leakage; this component only ever shows display name,
// avatar, and city/region/country — never address / email / phone.
//
// Query keys are SINGLE-element full URLs on purpose: the default
// queryFn does `queryKey.join("/")`, so a 2-element `[path, qs]` key
// would build `/path/from=…` (no `?`) and fall through to the SPA HTML.
// See client/src/pages/AdminVendors.tsx for the same pattern.

import { useQuery } from "@tanstack/react-query";
import { MapPin, User as UserIcon, Award } from "lucide-react";
import { BRAND } from "@/lib/brand-tokens";

export type BuyerCopy = {
  format: string;
  signedCert: boolean;
  booklet: boolean;
  vinylColor: string | null;
  goodDeedNumber: number | null;
};
export type BuyerRow = {
  orderId: string;
  createdAt: string;
  albumTitle: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  quantity: number;
  copies: BuyerCopy[];
};
type MapPoint = {
  lat: number;
  lon: number;
  orders: number;
  fans: number;
  city: string | null;
  region: string | null;
  country: string | null;
};
type MapPayload = { points: MapPoint[]; totalCities: number; geocoded: number };

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
function fmtFormat(f: string): string {
  return f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function locLabel(b: { city: string | null; region: string | null; country: string | null }): string {
  return [b.city, b.region, b.country].filter(Boolean).join(", ") || "Location unknown";
}
function copyLabel(c: BuyerCopy): string {
  const parts = [fmtFormat(c.format)];
  if (c.vinylColor) parts.push(c.vinylColor);
  if (c.signedCert) parts.push("Signed");
  if (c.booklet) parts.push("Booklet");
  return parts.join(" · ");
}

export function BuyerReport({
  buyersUrl,
  mapUrl,
  showAlbum = true,
  emptyHint = "No buyers to show yet.",
}: {
  buyersUrl: string;
  mapUrl: string;
  showAlbum?: boolean;
  emptyHint?: string;
}) {
  const buyersQ = useQuery<{ buyers: BuyerRow[] }>({ queryKey: [buyersUrl] });
  const mapQ = useQuery<MapPayload>({ queryKey: [mapUrl] });

  const buyers = buyersQ.data?.buyers ?? [];

  return (
    <div className="space-y-4" data-testid="buyer-report">
      {/* Where they live */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid="buyer-map">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4" style={{ color: BRAND.blue }} />
            Where your buyers live
          </h3>
          {mapQ.data && (
            <span className="text-xs text-slate-400" data-testid="text-map-coverage">
              {mapQ.data.geocoded} of {mapQ.data.totalCities} cities mapped
            </span>
          )}
        </div>
        {mapQ.isError ? (
          <p className="text-sm text-slate-500 py-6 text-center">Couldn't load the map.</p>
        ) : mapQ.isLoading || !mapQ.data ? (
          <div className="h-40 rounded-md bg-slate-100 animate-pulse" />
        ) : mapQ.data.points.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No mappable buyers yet.</p>
        ) : (
          <WorldMap points={mapQ.data.points} />
        )}
        <p className="text-xs text-slate-400 mt-3">
          Dots are city-level. Geocoding is cached via OpenStreetMap (Nominatim).
        </p>
      </div>

      {/* Roster */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid="buyer-roster">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <UserIcon className="w-4 h-4" style={{ color: BRAND.blue }} />
            Buyers
          </h3>
          {!buyersQ.isLoading && !buyersQ.isError && (
            <span className="text-xs text-slate-400" data-testid="text-buyer-count">
              {buyers.length} {buyers.length === 1 ? "order" : "orders"}
            </span>
          )}
        </div>

        {buyersQ.isError ? (
          <p className="text-sm text-slate-500 py-6 text-center">Couldn't load buyers.</p>
        ) : buyersQ.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : buyers.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center" data-testid="text-buyers-empty">
            {emptyHint}
          </p>
        ) : (
          <ul className="space-y-2">
            {buyers.map((b) => (
              <li
                key={b.orderId}
                className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3"
                data-testid={`buyer-row-${b.orderId}`}
              >
                <div className="flex items-start gap-3">
                  {b.avatarUrl ? (
                    <img
                      src={b.avatarUrl}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200"
                      data-testid={`img-buyer-avatar-${b.orderId}`}
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <UserIcon className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className="font-semibold text-slate-900 truncate"
                        data-testid={`text-buyer-name-${b.orderId}`}
                      >
                        {b.name}
                      </p>
                      <span className="text-xs text-slate-400 whitespace-nowrap" data-testid={`text-buyer-date-${b.orderId}`}>
                        {fmtDate(b.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {locLabel(b)}
                    </p>
                    {showAlbum && (
                      <p className="text-xs text-slate-600 mt-0.5 truncate" data-testid={`text-buyer-album-${b.orderId}`}>
                        {b.albumTitle}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.copies.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          {b.quantity} {b.quantity === 1 ? "copy" : "copies"}
                        </span>
                      ) : (
                        b.copies.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                            data-testid={`chip-buyer-copy-${b.orderId}-${i}`}
                          >
                            {copyLabel(c)}
                            {c.goodDeedNumber != null && (
                              <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700">
                                <Award className="w-3 h-3" />#{c.goodDeedNumber}
                              </span>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WorldMap({ points }: { points: MapPoint[] }) {
  // Equirectangular projection — simple, good enough for a city-dot map.
  const W = 960;
  const H = 480;
  function proj(lat: number, lon: number): [number, number] {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [x, y];
  }
  const maxOrders = Math.max(1, ...points.map((p) => p.orders));
  return (
    <div className="relative w-full overflow-hidden rounded-md ring-1 ring-slate-200 bg-slate-50">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" data-testid="svg-buyer-map">
        {[-60, -30, 0, 30, 60].map((lat) => {
          const [, y] = proj(lat, 0);
          return <line key={`la${lat}`} x1={0} x2={W} y1={y} y2={y} stroke="rgba(15,23,42,0.08)" strokeWidth={0.5} />;
        })}
        {[-120, -60, 0, 60, 120].map((lon) => {
          const [x] = proj(0, lon);
          return <line key={`lo${lon}`} x1={x} x2={x} y1={0} y2={H} stroke="rgba(15,23,42,0.08)" strokeWidth={0.5} />;
        })}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(15,23,42,0.14)" strokeWidth={0.5} />
        {points.map((p, i) => {
          const [x, y] = proj(p.lat, p.lon);
          const r = 3 + 8 * Math.sqrt(p.orders / maxOrders);
          return (
            <g key={i} data-testid={`map-dot-${i}`}>
              <circle cx={x} cy={y} r={r} fill={BRAND.blue} fillOpacity={0.4} stroke={BRAND.blue} strokeWidth={1} />
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
