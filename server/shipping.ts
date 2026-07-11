// ─── Shipping & handling pricing ─────────────────────────────────────
// Computes what a fan pays for shipping at checkout from a fulfillment
// partner's rate card (shipping_rates). GoodTunes does not (yet) call a
// carrier API — these are the partner's published band rates plus our
// markup. Spinney Media is the current default partner; see
// scripts/post-merge.sh for the seeded April-2026 card.
//
// Embedded Stripe Checkout collects the shipping address INSIDE the
// iframe, after we create the session, so we can't see the destination
// before pricing. The fan therefore picks their destination country in
// our own Buy sheet; we price from that and lock the Stripe session's
// allowed_countries to it (see server/commerce.ts).
import { db } from "./db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { albumFulfillmentSplits, albums, fulfillmentPartners, shippingRates } from "@shared/schema";

// Spinney's published weight bands, by upper bound in ounces (incl.
// mailer). band1 "up to 8oz (1-2 CDs)", band2 "up to 1lb (4-5 CDs, 1
// LP)", band3 "up to 2lb (6+ CDs, Deluxe or 180g LP)".
const BANDS: Array<{ band: string; maxOz: number }> = [
  { band: "band1", maxOz: 8 },
  { band: "band2", maxOz: 16 },
  { band: "band3", maxOz: 32 },
];
const TOP_BAND = BANDS[BANDS.length - 1];

// Estimated shipped weight (oz) per vinyl format, tuned so a single unit
// lands in the band Bill confirmed: 7" → band1, single 12" LP → band2,
// double LP → band3. Unknown physical formats default to a single LP.
const FORMAT_OZ: Record<string, number> = {
  "7_inch": 6,
  "7": 6,
  "12_lp": 16,
  lp: 16,
  "12_double": 28,
};
const DEFAULT_FORMAT_OZ = 16;
const ADDON_OZ = 1; // signed cert / booklet — paper, near-zero but counted.

// Countries Spinney publishes a specific rate for. Everything else
// resolves to the "INTL" catch-all average row. "UK" → ISO "GB".
const SPECIFIC_DESTINATIONS = new Set(["CA", "GB", "FR", "DE", "JP", "MX", "HN"]);

export function normalizeCountry(country: string | null | undefined): string {
  const c = (country ?? "US").trim().toUpperCase();
  if (c === "UK") return "GB";
  return c || "US";
}

function resolveDestinationKey(country: string): string {
  const c = normalizeCountry(country);
  if (c === "US") return "US";
  if (SPECIFIC_DESTINATIONS.has(c)) return c;
  return "INTL";
}

export function estimateWeightOz(opts: {
  format: string | null | undefined;
  quantity: number;
  signedCertCount?: number;
  bookletCount?: number;
}): number {
  const perUnit = FORMAT_OZ[opts.format ?? ""] ?? DEFAULT_FORMAT_OZ;
  const qty = Math.max(1, opts.quantity || 1);
  const addons = (opts.signedCertCount ?? 0) + (opts.bookletCount ?? 0);
  return perUnit * qty + addons * ADDON_OZ;
}

// Resolve the weight band + how many top-band "chunks" the order weighs.
// Orders within the published bands are chunks=1. Anything heavier than
// the top band is charged ceil(weight / topBandMax) × the top-band base
// rate — this protects GoodTunes from under-collecting on heavy multi-LP
// orders Spinney's chart doesn't cover.
export function resolveBand(weightOz: number): { band: string; chunks: number } {
  for (const b of BANDS) {
    if (weightOz <= b.maxOz) return { band: b.band, chunks: 1 };
  }
  return { band: TOP_BAND.band, chunks: Math.max(1, Math.ceil(weightOz / TOP_BAND.maxOz)) };
}

// The fulfillment partner whose rate card prices checkout shipping. For
// now that's Spinney Media (the single live fulfillment partner). We look
// it up by the active rate-card rows so adding a second partner later is
// a data change, not a code change; if exactly one partner has active
// rates we use it, otherwise we prefer one named "Spinney". Cached for
// the process lifetime since it changes ~never.
let cachedPartnerId: string | null = null;
export async function getShippingPartnerId(): Promise<string | null> {
  if (cachedPartnerId) return cachedPartnerId;
  const rows = await db
    .selectDistinct({ id: shippingRates.fulfillmentPartnerId })
    .from(shippingRates)
    .where(eq(shippingRates.active, true));
  if (rows.length === 1) {
    cachedPartnerId = rows[0].id;
    return cachedPartnerId;
  }
  if (rows.length > 1) {
    const ids = rows.map((r) => r.id);
    const named = await db.select().from(fulfillmentPartners);
    const spinney = named.find((p) => ids.includes(p.id) && /spinney/i.test(p.name));
    cachedPartnerId = spinney?.id ?? ids[0];
    return cachedPartnerId;
  }
  return null;
}

// Task #2670 — split-aware shipping partner lookup. When an album has
// fulfillment splits, fans should be quoted from the first partner-kind
// split's rate card (matching the warehouse their copy will ship from).
// Falls back to the per-album fulfillment_partner_id, then the global
// getShippingPartnerId() default. Call this anywhere you have an albumId.
export async function getAlbumShippingPartnerId(albumId: string): Promise<string | null> {
  // Check partner-kind splits first — sorted by sort_order so the "primary"
  // warehouse wins (same priority as pickFulfillmentPartner in orderDesk.ts).
  const splits = await db
    .select({ fpId: albumFulfillmentSplits.fulfillmentPartnerId })
    .from(albumFulfillmentSplits)
    .where(
      sql`${albumFulfillmentSplits.albumId} = ${albumId}
        AND ${albumFulfillmentSplits.fulfillmentPartnerId} IS NOT NULL`,
    )
    .orderBy(sql`${albumFulfillmentSplits.sortOrder} ASC, ${albumFulfillmentSplits.createdAt} ASC`);
  for (const s of splits) {
    if (!s.fpId) continue;
    // Confirm the partner is live and has active shipping rates.
    const [live] = await db
      .select({ id: fulfillmentPartners.id })
      .from(fulfillmentPartners)
      .where(and(eq(fulfillmentPartners.id, s.fpId), isNull(fulfillmentPartners.deletedAt)))
      .limit(1);
    if (live?.id) return live.id;
  }
  // Task #2670 — honor the album's per-album single-destination override
  // (fulfillment_partner_id) before falling back to the platform default.
  // This mirrors the precedence chain in pickFulfillmentPartner (orderDesk.ts):
  //   splits (partner-kind) → per-album fulfillmentPartnerId → global default.
  const [albumRow] = await db
    .select({ fulfillmentPartnerId: albums.fulfillmentPartnerId })
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);
  if (albumRow?.fulfillmentPartnerId) {
    const [live] = await db
      .select({ id: fulfillmentPartners.id })
      .from(fulfillmentPartners)
      .where(and(eq(fulfillmentPartners.id, albumRow.fulfillmentPartnerId), isNull(fulfillmentPartners.deletedAt)))
      .limit(1);
    if (live?.id) return live.id;
  }
  // Fall back to the global default (Spinney today).
  return getShippingPartnerId();
}

export interface ShippingQuote {
  partnerId: string;
  destinationKey: string;
  country: string;
  band: string;
  chunks: number;
  baseCents: number;
  markupCents: number;
  chargedCents: number;
  currency: string;
}

// Compute the shipping charge for an order. Returns null when shipping is
// not applicable (no partner / no rate found / digital handled by caller).
export async function quoteShipping(opts: {
  format: string | null | undefined;
  quantity: number;
  signedCertCount?: number;
  bookletCount?: number;
  country: string | null | undefined;
  partnerId?: string | null;
}): Promise<ShippingQuote | null> {
  const partnerId = opts.partnerId ?? (await getShippingPartnerId());
  if (!partnerId) return null;

  const country = normalizeCountry(opts.country);
  const destKey = resolveDestinationKey(country);
  const weightOz = estimateWeightOz(opts);
  const { band, chunks } = resolveBand(weightOz);

  // Try the resolved destination, then fall back to INTL, so a country we
  // have no specific row for still prices off the international average.
  let [rate] = await db
    .select()
    .from(shippingRates)
    .where(
      and(
        eq(shippingRates.fulfillmentPartnerId, partnerId),
        eq(shippingRates.destination, destKey),
        eq(shippingRates.band, band),
        eq(shippingRates.active, true),
      ),
    );
  if (!rate && destKey !== "INTL" && destKey !== "US") {
    [rate] = await db
      .select()
      .from(shippingRates)
      .where(
        and(
          eq(shippingRates.fulfillmentPartnerId, partnerId),
          eq(shippingRates.destination, "INTL"),
          eq(shippingRates.band, band),
          eq(shippingRates.active, true),
        ),
      );
  }
  if (!rate) return null;

  const baseCents = rate.baseCents * chunks;
  const markupCents = rate.markupCents; // applied once per order
  return {
    partnerId,
    destinationKey: destKey,
    country,
    band,
    chunks,
    baseCents,
    markupCents,
    chargedCents: baseCents + markupCents,
    currency: rate.currency,
  };
}
