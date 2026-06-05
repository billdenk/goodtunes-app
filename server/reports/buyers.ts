// Task #938 — Scoped buyer roster + "where they live" map for the
// artist and NPO partner dashboards.
//
// Both surfaces want the same shape: who bought, what they bought
// (per-copy format / add-ons / GoodDeed number), when, and a Fan-Map-
// style city map. The only thing that differs is the WHERE clause that
// scopes orders to the partner:
//   • artist → orders on the artist's own albums
//   • NPO    → orders that minted a referral_credit crediting the NPO
// Callers resolve that scope server-side (resolveArtistScope /
// requireNpoScope) and pass a SQL fragment that references the orders
// alias `o`; this module never widens it.
//
// PII guardrail: partner-facing rows expose only the fan's public
// display name (or a trimmed legal name fallback), avatar, and
// city/region/country. Email, phone, and street address never leave
// here — see docs/roles-and-permissions.md.

import { db } from "../db";
import { sql, type SQL } from "drizzle-orm";
import { pgArray } from "../lib/pgArray";

// First name + last initial only — the same trim the admin Top-Fans
// report uses (server/reports/index.ts). Applied to the Stripe legal
// `buyer_name` fallback; the public display name is shown as-is.
export function trimBuyerName(s?: string | null): string {
  if (!s || !s.trim()) return "Anonymous fan";
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

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
  status: string;
  albumId: string;
  albumTitle: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  quantity: number;
  copies: BuyerCopy[];
};

// `scopeFilter` is a SQL fragment that references the orders alias `o`.
export async function buyerRoster(
  scopeFilter: SQL,
  from: Date,
  to: Date,
  limit = 200,
): Promise<BuyerRow[]> {
  const orderRows = await db.execute<any>(sql`
    SELECT o.id AS order_id, o.created_at, o.status, o.album_id,
      a.title AS album_title,
      o.buyer_name, o.customer_id,
      o.shipping_address->>'city' AS city,
      o.shipping_address->>'state' AS region,
      o.shipping_address->>'country' AS country,
      cu.display_name,
      pp.photo_url, pp.data_url
    FROM orders o
    JOIN albums a ON a.id = o.album_id
    LEFT JOIN customer_users cu ON cu.id = o.customer_id
    LEFT JOIN profile_photos pp ON pp.user_id = o.customer_id
    WHERE ${scopeFilter}
      AND o.status IN ('paid','shipped','complete','completed')
      AND o.created_at >= ${from} AND o.created_at < ${to}
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `);
  const rows = (orderRows as any).rows ?? [];
  const orderIds: string[] = rows.map((r: any) => r.order_id);

  // Per-copy detail (format / add-ons / GoodDeed number) lives in
  // order_copies; one order can fan out into several copies.
  const copyRows = orderIds.length
    ? await db.execute<any>(sql`
        SELECT order_id, format, signed_cert, booklet, vinyl_color, good_deed_number
        FROM order_copies
        WHERE order_id = ANY(${pgArray(orderIds)})
        ORDER BY position ASC
      `)
    : ({ rows: [] } as any);
  const byOrder = new Map<string, BuyerCopy[]>();
  for (const c of (copyRows as any).rows ?? []) {
    const arr = byOrder.get(c.order_id) ?? [];
    arr.push({
      format: c.format,
      signedCert: c.signed_cert === true,
      booklet: c.booklet === true,
      vinylColor: c.vinyl_color ?? null,
      goodDeedNumber: c.good_deed_number ?? null,
    });
    byOrder.set(c.order_id, arr);
  }

  return rows.map((r: any): BuyerRow => {
    const copies = byOrder.get(r.order_id) ?? [];
    return {
      orderId: r.order_id,
      createdAt: r.created_at,
      status: r.status,
      albumId: r.album_id,
      albumTitle: r.album_title,
      name: r.display_name?.trim() ? r.display_name.trim() : trimBuyerName(r.buyer_name),
      avatarUrl: r.photo_url ?? r.data_url ?? null,
      city: r.city ?? null,
      region: r.region ?? null,
      country: r.country ?? null,
      quantity: copies.length || 1,
      copies,
    };
  });
}

export type BuyerMapPoint = {
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
  orders: number;
  fans: number;
};

// City-level geocoded map points for the partner scope. Mirrors the
// admin Fan Map (server/reports/index.ts fanMap): group by
// city|region|country, geocode each group through the cached Nominatim
// helper. Best-effort — unresolvable cities are simply skipped.
export async function buyerMap(
  scopeFilter: SQL,
  from: Date,
  to: Date,
): Promise<{ points: BuyerMapPoint[]; totalCities: number; geocoded: number }> {
  const rows = await db.execute<any>(sql`
    SELECT o.shipping_address AS shipping_address, o.customer_id
    FROM orders o
    WHERE ${scopeFilter}
      AND o.status IN ('paid','shipped','complete','completed')
      AND o.created_at >= ${from} AND o.created_at < ${to}
  `);
  const groups = new Map<
    string,
    { city: string | null; region: string | null; country: string | null; orders: number; fans: Set<string> }
  >();
  for (const r of (rows as any).rows ?? []) {
    const addr: any = r.shipping_address ?? {};
    const city = (addr.city as string | undefined) ?? null;
    const region = ((addr.state ?? addr.region) as string | undefined) ?? null;
    const country = (addr.country as string | undefined) ?? null;
    if (!city && !country) continue;
    const key = `${(city ?? "").toLowerCase()}|${(region ?? "").toLowerCase()}|${(country ?? "").toLowerCase()}`;
    const slot = groups.get(key) ?? { city, region, country, orders: 0, fans: new Set<string>() };
    slot.orders++;
    if (r.customer_id) slot.fans.add(r.customer_id);
    groups.set(key, slot);
  }

  const { geocode } = await import("./geo");
  const points: BuyerMapPoint[] = [];
  for (const g of Array.from(groups.values())) {
    const pt = await geocode({ city: g.city, region: g.region, country: g.country });
    if (!pt) continue;
    points.push({
      city: g.city,
      region: g.region,
      country: g.country,
      lat: pt.lat,
      lon: pt.lon,
      orders: g.orders,
      fans: g.fans.size,
    });
  }
  return { points, totalCities: groups.size, geocoded: points.length };
}
