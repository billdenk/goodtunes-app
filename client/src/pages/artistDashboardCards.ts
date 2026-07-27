// Task #2893 — the merged artist Dashboard's nine date-range cards, built as
// a PURE function so the exact card set (and its tier discipline) is unit-
// testable without rendering the page. The page maps these specs straight
// onto the shared KpiCard primitive.
//
// Tier discipline (decided with Bill):
//   • Fan plays headline = purchaser plays ONLY; grant plays, anonymous
//     previews, and staff/internal are broken out on the secondary line and
//     never summed into any headline.
//   • Unique listeners = DISTINCT fan + grant listeners (no anon sessions).
//   • New fans = listeners whose first-ever fan-or-grant play landed in the
//     window.
//   • Top-line Gross stays order-total inclusive (tax + shipping); Net keeps
//     the per-copy product-price cost stack. Price/unit lives in the Gross
//     card's breakdown, not as its own card.
//   • No "Artist share" card — it was a placeholder mirroring Gross.
import { formatUsdCents } from "@shared/money";
import type { KpiCardModel } from "@/components/admin/KpiCard";

// ─── Shared display formatters (also used across the portal tabs) ──────
export const dollars = (c: number) => formatUsdCents(c, { maximumFractionDigits: 0 });
export const dollarsCents = (c: number) => formatUsdCents(c);
export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
export const pct = (x: number) => `${Math.round(x * 100)}%`;
// Task #2525 — staff/operator/internal listens are stripped from every fan
// metric; surface the removed volume so operators still see it wasn't lost.
export const excludedNote = (n?: number) => (n && n > 0 ? `${compact(n)} staff/internal excluded` : undefined);
export const joinSub = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;

// ─── Wire types (mirror /api/artist/summary + /timeseries) ────────────
export type ArtistKpis = {
  grossCents: number; refundedCents: number;
  units: number; orders: number; buyers: number;
  plays: number; completions: number; completionRate: number;
  fanListeners?: number; listeners: number;
  previewPlays?: number; excludedPlays?: number;
  grantPlays?: number; grantCompletes?: number; grantListeners?: number;
  newFans?: number;
  topTrack: { song_id: string; title: string; plays: string } | null;
  topAlbum: { album_id: string; title: string; revenue: string } | null;
};

export type ArtistSalesStack = {
  units: number; grossCents: number; manufacturingCents: number;
  publishingCents: number; platformFeeCents: number; stripeFeeCents: number;
  netCents: number; pricePerUnitCents: number | null;
};

export type ArtistTimeseries = {
  range: { from: string; to: string };
  revenue: { day: string; skuKind: string; revenueCents: number }[];
  orders?: { day: string; orders: number }[];
  plays: { day: string; starts: number; completes: number; listeners: number }[];
};

// Daily series → sparkline points for the range-windowed KPIs. Gross rolls
// per-SKU revenue rows up by day; plays/listeners ride the daily plays rows
// (fan-tier starts / fan+grant listeners — same tiers as their cards).
// Empty series returns [] so KpiCard simply omits the spark.
export function dailyGross(series?: ArtistTimeseries | null): number[] {
  if (!series?.revenue?.length) return [];
  const byDay = new Map<string, number>();
  for (const r of series.revenue) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenueCents);
  return Array.from(byDay.keys()).sort().map((d) => byDay.get(d)!);
}
export function dailyPlays(series?: ArtistTimeseries | null): number[] {
  if (!series?.plays?.length) return [];
  return [...series.plays].sort((a, b) => (a.day < b.day ? -1 : 1)).map((p) => p.starts);
}
export function dailyListeners(series?: ArtistTimeseries | null): number[] {
  if (!series?.plays?.length) return [];
  return [...series.plays].sort((a, b) => (a.day < b.day ? -1 : 1)).map((p) => p.listeners);
}

export type ArtistCardSpec = {
  testId: string;
  model: KpiCardModel;
  spark?: number[] | null;
};

// The Fan-plays secondary line — the single place the other tiers are shown,
// always spelled out (zeros included) so it's explicit nothing was summed.
export function fanPlaysSubline(k: ArtistKpis): string {
  const listeners = k.fanListeners ?? 0;
  return `${compact(listeners)} listener${listeners === 1 ? "" : "s"} · ${compact(k.grantPlays ?? 0)} grant plays · ${compact(k.previewPlays ?? 0)} previews · internal excluded`;
}

export function buildArtistDashboardCards(args: {
  cur: ArtistKpis | null | undefined;
  prev: ArtistKpis | null | undefined;
  stack: ArtistSalesStack | null | undefined;
  stackPrevious: ArtistSalesStack | null | undefined;
  series?: ArtistTimeseries | null;
}): ArtistCardSpec[] {
  const { cur, prev, stack, stackPrevious, series } = args;
  return [
    {
      testId: "kpi-units",
      model: {
        id: "units", label: "Units sold", format: "number",
        value: cur ? cur.units : null, prior: prev?.units ?? null,
        valueText: cur ? compact(cur.units) : undefined,
        note: cur ? `${cur.buyers} unique buyer${cur.buyers === 1 ? "" : "s"}` : undefined,
        hideDelta: !cur,
      },
    },
    {
      testId: "kpi-gross",
      model: {
        id: "gross", label: "Gross revenue", format: "currency",
        value: cur ? cur.grossCents : null, prior: prev?.grossCents ?? null,
        valueText: cur ? dollars(cur.grossCents) : undefined,
        note: cur && cur.refundedCents ? `${dollars(cur.refundedCents)} refunded` : undefined,
        hideDelta: !cur,
        info: "Order totals for this window, including tax and shipping. Price per unit is the average product price per copy, before tax and shipping.",
        breakdown: stack && stack.pricePerUnitCents != null
          ? [{ label: "Price / unit", value: stack.pricePerUnitCents, format: "currency" }]
          : undefined,
      },
      spark: dailyGross(series),
    },
    {
      testId: "kpi-net",
      model: {
        id: "net", label: "Net (artist)", format: "currency",
        value: stack ? stack.netCents : null, prior: stackPrevious?.netCents ?? null,
        valueText: stack ? dollars(stack.netCents) : undefined,
        note: "After manufacturing, publishing & fees",
        hideDelta: !stack,
        // "Product revenue" (per-copy product price), not the order-total
        // Gross card figure — the two bases differ by tax + shipping.
        breakdown: stack ? [
          { label: "Product revenue", value: stack.grossCents, format: "currency" },
          { label: "Manufacturing", value: -stack.manufacturingCents, format: "currency" },
          { label: "Publishing", value: -stack.publishingCents, format: "currency" },
          { label: "Platform fee", value: -stack.platformFeeCents, format: "currency" },
          { label: "Stripe fees", value: -stack.stripeFeeCents, format: "currency" },
        ] : undefined,
      },
    },
    {
      testId: "kpi-orders",
      model: {
        id: "orders", label: "Orders", format: "number",
        value: cur ? cur.orders : null, prior: prev?.orders ?? null,
        valueText: cur ? compact(cur.orders) : undefined,
        note: cur ? `${compact(cur.units)} cop${cur.units === 1 ? "y" : "ies"}` : undefined,
        hideDelta: !cur,
      },
    },
    {
      testId: "kpi-plays",
      model: {
        id: "plays", label: "Fan plays", format: "number",
        value: cur ? cur.plays : null, prior: prev?.plays ?? null,
        valueText: cur ? compact(cur.plays) : undefined,
        note: cur ? fanPlaysSubline(cur) : undefined,
        hideDelta: !cur,
        info: "Plays by fans who bought the album. Grant plays, anonymous previews, and staff listening are broken out on the line below — they're never added into this number.",
      },
      spark: dailyPlays(series),
    },
    {
      testId: "kpi-listeners",
      model: {
        id: "listeners", label: "Unique listeners", format: "number",
        value: cur ? cur.listeners : null, prior: prev?.listeners ?? null,
        valueText: cur ? compact(cur.listeners) : undefined,
        note: "Fans + grant listeners",
        hideDelta: !cur,
        info: "Distinct fans and grant holders who played at least one track in this window. Anonymous previews and staff never count.",
      },
      spark: dailyListeners(series),
    },
    {
      testId: "kpi-completion",
      model: {
        id: "completion", label: "Completion rate", format: "percent",
        value: null,
        valueText: cur ? pct(cur.completionRate) : undefined,
        note: cur ? `${compact(cur.completions)} completions` : undefined,
        hideDelta: true,
        info: "Share of fan plays that reached the end of the track. Measured on purchaser plays only, same tier as the Fan plays card.",
      },
    },
    {
      testId: "kpi-top-track",
      model: {
        id: "topTrack", label: "Top track", format: "number",
        value: null,
        valueText: cur?.topTrack?.title,
        note: cur?.topTrack ? `${Number(cur.topTrack.plays).toLocaleString()} plays` : undefined,
        hideDelta: true,
        info: "Your most-played track this window, ranked by fan (purchaser) plays.",
      },
    },
    {
      testId: "kpi-new-fans",
      model: {
        id: "newFans", label: "New fans", format: "number",
        value: cur ? (cur.newFans ?? 0) : null, prior: prev ? (prev.newFans ?? 0) : null,
        valueText: cur ? compact(cur.newFans ?? 0) : undefined,
        note: "First fan or grant play in this window",
        hideDelta: !cur,
        info: "Listeners whose first-ever fan or grant play landed in this window. Anonymous previews and staff plays don't count.",
      },
    },
  ];
}
