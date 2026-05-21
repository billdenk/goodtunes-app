import { db } from "../db";
import { geoCache } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Lightweight geocoder for the Fan Map. We cache lookups in `geo_cache`
 * keyed by a normalized "city|region|country" string so a fan order from
 * "Brooklyn, NY, US" only hits Nominatim once. Misses are cached too —
 * Nominatim's terms forbid hammering and an unresolvable string is
 * equally unresolvable on the next call.
 *
 * Latitude/longitude are stored as integer micro-degrees (× 1e6) so we
 * stay on the existing `integer` column type without dragging in a
 * Postgres `numeric` migration. Range fits comfortably in int32
 * (±90_000_000 / ±180_000_000).
 */

export interface GeoPoint {
  lat: number;
  lon: number;
  displayName: string | null;
  countryCode: string | null;
}

function normalize(parts: { city?: string | null; region?: string | null; country?: string | null }): string {
  const c = (s?: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [c(parts.city), c(parts.region), c(parts.country)].filter(Boolean).join("|");
}

const inflight = new Map<string, Promise<GeoPoint | null>>();

async function nominatimLookup(parts: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): Promise<GeoPoint | null> {
  // Build a URL Nominatim accepts. Their structured search needs at
  // least country; we pass whatever we have and trust the matcher.
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "1");
  if (parts.city) u.searchParams.set("city", parts.city);
  if (parts.region) u.searchParams.set("state", parts.region);
  if (parts.country) u.searchParams.set("country", parts.country);
  u.searchParams.set("addressdetails", "1");
  try {
    const r = await fetch(u.toString(), {
      headers: {
        "User-Agent": "GoodTunes Partner Reports (admin@goodtunes.music)",
        "Accept-Language": "en",
      },
    });
    if (!r.ok) return null;
    const arr = (await r.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
      address?: { country_code?: string };
    }>;
    const hit = arr?.[0];
    if (!hit) return null;
    return {
      lat: parseFloat(hit.lat),
      lon: parseFloat(hit.lon),
      displayName: hit.display_name ?? null,
      countryCode: (hit.address?.country_code ?? "").toUpperCase() || null,
    };
  } catch {
    return null;
  }
}

export async function geocode(parts: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): Promise<GeoPoint | null> {
  const key = normalize(parts);
  if (!key) return null;
  const [row] = await db.select().from(geoCache).where(eq(geoCache.query, key));
  if (row) {
    if (row.lat == null || row.lon == null) return null;
    return {
      lat: row.lat / 1_000_000,
      lon: row.lon / 1_000_000,
      displayName: row.displayName,
      countryCode: row.countryCode,
    };
  }
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    const hit = await nominatimLookup(parts);
    try {
      await db
        .insert(geoCache)
        .values({
          query: key,
          lat: hit ? Math.round(hit.lat * 1_000_000) : null,
          lon: hit ? Math.round(hit.lon * 1_000_000) : null,
          displayName: hit?.displayName ?? null,
          countryCode: hit?.countryCode ?? null,
          source: "nominatim",
        })
        .onConflictDoNothing();
    } catch {}
    return hit;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}
