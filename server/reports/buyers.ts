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

// ─── Task #1751 — sales-keyed geography (the "where your fans are buying"
// map module on the Artist / Label / Manager dashboards) ───────────────
//
// Same scope-fragment contract as buyerRoster/buyerMap: `scopeFilter`
// references the orders alias `o` and already encodes the surface's status
// set + album scope. We reproduce the dashboards' headline metric math so
// the map reconciles exactly:
//   • Units sold      → SUM(copy-count per order) on non-refunded orders
//                       (COALESCE(cc.cnt,1) — mirrors the KPI + buyer roster)
//   • Revenue (gross) → SUM(total_cents) on non-refunded orders
//   • Customers       → COUNT(DISTINCT customer_id) on non-refunded orders
// Privacy: only city / region (state) / country leave here.

export type SalesMetrics = { units: number; revenueCents: number; customers: number };
export type SalesRegionRow = SalesMetrics & { code: string | null };
export type SalesStateRow = SalesMetrics & { code: string };
export type SalesMapPoint = SalesMetrics & {
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
};
export type SalesSourceRow = SalesMetrics & { key: string; label: string };

export type SalesGeography = {
  regions: SalesRegionRow[];
  states: SalesStateRow[];
  points: SalesMapPoint[];
  totals: SalesMetrics;
  sources: SalesSourceRow[];
  referred: SalesMetrics; // best-effort overlay (orders that minted a referral credit)
  meta: { totalCities: number; geocoded: number };
};

// Per-order copy count, reused everywhere units are summed.
const COPY_COUNT_CTE = sql`
  cc AS (SELECT order_id, COUNT(*)::int AS cnt FROM order_copies GROUP BY order_id)
`;
const M_UNITS = sql`COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN COALESCE(cc.cnt, 1) ELSE 0 END), 0)::text`;
const M_REVENUE = sql`COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::text`;
const M_CUSTOMERS = sql`COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'refunded')::text`;

// Full US state name → USPS code, for the rare row that stores a name
// instead of Stripe's 2-letter code.
const US_STATE_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "puerto rico": "PR",
};
function normalizeStateCode(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.length === 2) return t.toUpperCase();
  return US_STATE_TO_CODE[t.toLowerCase()] ?? t.toUpperCase();
}
const US_COUNTRY_KEYS = new Set(["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"]);

export async function salesGeography(
  scopeFilter: SQL,
  from: Date,
  to: Date,
): Promise<SalesGeography> {
  const rangeFilter = sql`o.created_at >= ${from} AND o.created_at < ${to}`;

  // ── Country rollup ──────────────────────────────────────────────────
  const regionRes = await db.execute<any>(sql`
    WITH ${COPY_COUNT_CTE}
    SELECT
      upper(coalesce(nullif(trim(o.shipping_address->>'country'), ''), '')) AS code,
      ${M_UNITS} AS units,
      ${M_REVENUE} AS revenue,
      ${M_CUSTOMERS} AS customers
    FROM orders o
    LEFT JOIN cc ON cc.order_id = o.id
    WHERE ${scopeFilter} AND ${rangeFilter}
    GROUP BY 1
  `);
  const regions: SalesRegionRow[] = ((regionRes as any).rows || []).map((r: any) => ({
    code: r.code ? String(r.code) : null,
    units: Number(r.units),
    revenueCents: Number(r.revenue),
    customers: Number(r.customers),
  }));

  // ── US state rollup (where a shipping state is present) ──────────────
  const stateRes = await db.execute<any>(sql`
    WITH ${COPY_COUNT_CTE}
    SELECT
      trim(o.shipping_address->>'state') AS state_raw,
      ${M_UNITS} AS units,
      ${M_REVENUE} AS revenue,
      ${M_CUSTOMERS} AS customers
    FROM orders o
    LEFT JOIN cc ON cc.order_id = o.id
    WHERE ${scopeFilter} AND ${rangeFilter}
      AND upper(coalesce(o.shipping_address->>'country', '')) IN ('US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA')
      AND nullif(trim(o.shipping_address->>'state'), '') IS NOT NULL
    GROUP BY 1
  `);
  const stateAgg = new Map<string, SalesStateRow>();
  for (const r of (stateRes as any).rows || []) {
    const code = normalizeStateCode(String(r.state_raw ?? ""));
    if (!code) continue;
    const slot = stateAgg.get(code) ?? { code, units: 0, revenueCents: 0, customers: 0 };
    slot.units += Number(r.units);
    slot.revenueCents += Number(r.revenue);
    slot.customers += Number(r.customers);
    stateAgg.set(code, slot);
  }
  const states = Array.from(stateAgg.values());

  // ── Totals (distinct customers measured across the whole scope) ──────
  const totalRes = await db.execute<any>(sql`
    WITH ${COPY_COUNT_CTE}
    SELECT ${M_UNITS} AS units, ${M_REVENUE} AS revenue, ${M_CUSTOMERS} AS customers
    FROM orders o
    LEFT JOIN cc ON cc.order_id = o.id
    WHERE ${scopeFilter} AND ${rangeFilter}
  `);
  const tRow = ((totalRes as any).rows || [])[0] ?? {};
  const totals: SalesMetrics = {
    units: Number(tRow.units ?? 0),
    revenueCents: Number(tRow.revenue ?? 0),
    customers: Number(tRow.customers ?? 0),
  };

  // ── City-level geocoded points (sales-weighted) ─────────────────────
  const cityRes = await db.execute<any>(sql`
    WITH ${COPY_COUNT_CTE}
    SELECT
      o.shipping_address->>'city' AS city,
      o.shipping_address->>'state' AS region,
      o.shipping_address->>'country' AS country,
      ${M_UNITS} AS units,
      ${M_REVENUE} AS revenue,
      ${M_CUSTOMERS} AS customers
    FROM orders o
    LEFT JOIN cc ON cc.order_id = o.id
    WHERE ${scopeFilter} AND ${rangeFilter}
      AND (nullif(trim(o.shipping_address->>'city'), '') IS NOT NULL
           OR nullif(trim(o.shipping_address->>'country'), '') IS NOT NULL)
    GROUP BY 1, 2, 3
    ORDER BY ${M_UNITS}::int DESC
    LIMIT 120
  `);
  const { geocode } = await import("./geo");
  const cityGroups = (cityRes as any).rows || [];
  const points: SalesMapPoint[] = [];
  let geocoded = 0;
  for (const g of cityGroups) {
    const city = (g.city as string | null) ?? null;
    const region = (g.region as string | null) ?? null;
    const country = (g.country as string | null) ?? null;
    const pt = await geocode({ city, region, country });
    if (!pt) continue;
    geocoded++;
    points.push({
      city, region, country,
      lat: pt.lat, lon: pt.lon,
      units: Number(g.units),
      revenueCents: Number(g.revenue),
      customers: Number(g.customers),
    });
  }

  // ── Top sources (best-effort, honest) ───────────────────────────────
  // Mutually-exclusive origin buckets — these sum back to the totals.
  const sourceRes = await db.execute<any>(sql`
    WITH ${COPY_COUNT_CTE}
    SELECT
      CASE
        WHEN o.origin IS NULL OR o.origin = 'direct' THEN 'direct'
        WHEN o.origin LIKE 'shopify:%' THEN 'shopify'
        ELSE o.origin
      END AS key,
      ${M_UNITS} AS units,
      ${M_REVENUE} AS revenue,
      ${M_CUSTOMERS} AS customers
    FROM orders o
    LEFT JOIN cc ON cc.order_id = o.id
    WHERE ${scopeFilter} AND ${rangeFilter}
    GROUP BY 1
  `);
  const SOURCE_LABELS: Record<string, string> = {
    direct: "Direct — goodtunes.music",
    shopify: "Shopify storefront",
  };
  const sources: SalesSourceRow[] = ((sourceRes as any).rows || [])
    .map((r: any) => {
      const key = String(r.key);
      return {
        key,
        label: SOURCE_LABELS[key] ?? key,
        units: Number(r.units),
        revenueCents: Number(r.revenue),
        customers: Number(r.customers),
      };
    })
    .filter((s: SalesSourceRow) => s.units > 0 || s.revenueCents > 0);

  // Referral/affiliate overlay — orders that minted a referral credit.
  // Overlaps the origin buckets, so it's reported as a separate honest
  // figure, never folded into the share bar.
  const referredRes = await db.execute<any>(sql`
    WITH ${COPY_COUNT_CTE}
    SELECT ${M_UNITS} AS units, ${M_REVENUE} AS revenue, ${M_CUSTOMERS} AS customers
    FROM orders o
    LEFT JOIN cc ON cc.order_id = o.id
    WHERE ${scopeFilter} AND ${rangeFilter}
      AND EXISTS (SELECT 1 FROM referral_credits rc WHERE rc.order_id = o.id)
  `);
  const rRow = ((referredRes as any).rows || [])[0] ?? {};
  const referred: SalesMetrics = {
    units: Number(rRow.units ?? 0),
    revenueCents: Number(rRow.revenue ?? 0),
    customers: Number(rRow.customers ?? 0),
  };

  return {
    regions,
    states,
    points,
    totals,
    sources: sources.sort((a, b) => b.units - a.units),
    referred,
    meta: { totalCities: cityGroups.length, geocoded },
  };
}
