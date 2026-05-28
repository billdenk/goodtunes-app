// Task #670 — Hellbender Shopify pricing scraper.
//
// Pulls live per-color pricing from Hellbender's public Shopify storefront
// (https://hellbendervinyl.com/pages/custom-vinyl) and rewrites the
// matching rungs in this press's `press_tier_jacket_ladders` so the
// SellPanel quotes always read the same numbers fans see on Hellbender's
// own site. Per Task #624 the broker arrangement is a 10% discount applied
// at lookup, not stored — so the rungs we land here are Hellbender's
// undiscounted retail (variant price ÷ quantity).
//
// Variant decoding: each product's `/products/<handle>.js` returns a
// variants array whose `option1/option2/option3` map to Hellbender's
// three Shopify options: Size (12"/7"), Quantity (50/100/200/300/500/
// 1000), Upgrade (None / Insert / Gatefold / Gatefold + Insert). We only
// write the `None` upgrade rungs onto the default-jacket combo today;
// gatefold + insert combinations land on their own jacket rows in a
// follow-up. Quantities 750/2000/3000 are skipped per spec — Hellbender
// doesn't publish those, and the existing seeded #624 private-quote
// rungs at 2000 stay untouched. 2LP (12_double) is left alone entirely
// (Shopify doesn't price doubles; the private quote stays in place).
// Splatter rungs likewise stay on their seeded private-quote values.
//
// Tier mapping: handle prefix → tier name. For 7" Hellbender carries
// the full 6-tier legacy set (Black/House Mix/Translucent/Clear/
// Metallic/Opaque); for 12_lp Hellbender's catalog only has Black /
// Color / Splatter today, so every non-Black, non-Splatter handle
// rolls up into the Color tier. Unmapped handles are surfaced to the
// admin in the preview/commit response.

import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "./db";
import {
  pressColorTiers,
  pressJackets,
  pressTierJacketLadders,
  pressPricingSyncs,
  type AlbumFormat,
} from "@shared/schema";

export const HELLBENDER_PRICING_SOURCE = "hellbender-shopify";
const HELLBENDER_INDEX_URL = "https://hellbendervinyl.com/pages/custom-vinyl";
const HELLBENDER_UA =
  "Mozilla/5.0 (compatible; GoodTunes-importer/1.0; +https://goodtunes.music)";

// Quantities we WILL write when a Shopify variant exposes them. 50 is
// included even though the default catalog comparison columns start at
// 100 — the addMissingRungs seed already added it on past runs, so
// writing it keeps idempotency tidy. 750/2000/3000 explicitly skipped
// per spec.
const WRITE_QUANTITIES = new Set<number>([50, 100, 200, 300, 500, 1000]);
const SKIP_QUANTITIES = new Set<number>([750, 2000, 3000]);

// Sizes we write today. 12_double (2LP) is intentionally absent —
// Hellbender's Shopify doesn't price doubles, and the per-album #624
// private quote rungs stay live.
const SIZE_TO_FORMAT: Record<string, AlbumFormat> = {
  '12"': "12_lp",
  "12in": "12_lp",
  '7"': "7_inch",
  "7in": "7_inch",
};

type Upgrade = "none" | "insert" | "gatefold" | "gatefold_insert";

function parseUpgrade(s: string | null | undefined): Upgrade | null {
  if (!s) return "none";
  const k = s.toLowerCase().replace(/\s+/g, "");
  if (k === "none" || k === "" || k === "standard") return "none";
  if (k === "insert" || k === "+insert") return "insert";
  if (k === "gatefold") return "gatefold";
  if (k.startsWith("gatefold") && k.includes("insert")) return "gatefold_insert";
  return null;
}

function parseSizeToFormat(s: string | null | undefined): AlbumFormat | null {
  if (!s) return null;
  const k = s.toLowerCase().replace(/\s+/g, "").replace(/”|"/g, '"');
  for (const key of Object.keys(SIZE_TO_FORMAT)) {
    if (k.includes(key.toLowerCase())) return SIZE_TO_FORMAT[key];
  }
  // Fall back to a digit match.
  if (/^12/.test(k)) return "12_lp";
  if (/^7/.test(k)) return "7_inch";
  return null;
}

function parseQty(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export type ShopifyVariant = {
  id: number;
  title: string;
  price: number; // Shopify .js endpoint returns integer cents
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

export type ShopifyProductJs = {
  id: number;
  title: string;
  handle: string;
  variants: ShopifyVariant[];
  options?: string[];
};

// Handle prefix → tier-name resolver. Returns the tier name we want
// the prices to land under for the given format. Null means the
// importer should leave the color in the "unmapped" bucket.
export function resolveTierForHandle(
  handle: string,
  format: AlbumFormat,
): string | null {
  // Strip the shared product-family prefix Hellbender's handles all
  // share so we can match the actual color word.
  const raw = handle
    .replace(/^custom-vinyl-records-/, "")
    .replace(/^custom-vinyl-/, "")
    .toLowerCase();
  const isSplatter = /splatter|splat/.test(raw);
  const isBlack = /^black(\b|-)/.test(raw) || raw === "black";

  if (format === "7_inch") {
    if (isBlack) return "Black";
    if (isSplatter) return null; // splatter rungs stay on #624 private-quote values
    if (/^house[-_]?mix/.test(raw)) return "House Mix";
    if (/^(translucent|transparent|trans)/.test(raw)) return "Translucent";
    if (/^clear/.test(raw)) return "Clear";
    if (/^metallic/.test(raw)) return "Metallic";
    if (/^(opaque|solid)/.test(raw)) return "Opaque";
    return null;
  }
  // 12_lp — only Black + Color tiers are written. Splatter stays on
  // its private-quote seed values.
  if (format === "12_lp") {
    if (isBlack) return "Black";
    if (isSplatter) return null;
    return "Color";
  }
  return null;
}

export function shopifyProductHandleFromUrl(url: string): string | null {
  const m = url.match(/\/products\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

// ─── Index + product fetch ───────────────────────────────────────────

function parseIndexHandles(html: string): { handle: string; name: string }[] {
  const re =
    /href="(https:\/\/hellbendervinyl\.com\/products\/custom-vinyl-records-[a-z0-9-]+)"[^>]*class="kt-image-link"[^>]*>([^<]+)</gi;
  const seen = new Set<string>();
  const out: { handle: string; name: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const handle = shopifyProductHandleFromUrl(m[1]);
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    const name = m[2].replace(/&amp;/g, "&").trim();
    if (!name) continue;
    if (/random[\s-]*color/i.test(name)) continue;
    out.push({ handle, name });
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": HELLBENDER_UA } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
}

async function fetchProductJs(handle: string): Promise<ShopifyProductJs> {
  const url = `https://hellbendervinyl.com/products/${handle}.js`;
  const r = await fetch(url, { headers: { "user-agent": HELLBENDER_UA } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as ShopifyProductJs;
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  politeMs = 100,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
      if (politeMs > 0 && next < items.length) {
        await new Promise((res) => setTimeout(res, politeMs));
      }
    }
  });
  await Promise.all(workers);
  return out;
}

// ─── Variant decode ──────────────────────────────────────────────────

export type DecodedRung = {
  format: AlbumFormat;
  qty: number;
  upgrade: Upgrade;
  unitCents: number;
  variantId: number;
};

export function decodeVariants(p: ShopifyProductJs): DecodedRung[] {
  const out: DecodedRung[] = [];
  for (const v of p.variants ?? []) {
    const format = parseSizeToFormat(v.option1);
    const qty = parseQty(v.option2);
    const upgrade = parseUpgrade(v.option3);
    if (!format || !qty || !upgrade) continue;
    if (SKIP_QUANTITIES.has(qty)) continue;
    if (!WRITE_QUANTITIES.has(qty)) continue;
    if (!Number.isFinite(v.price) || v.price <= 0) continue;
    const unitCents = Math.round(v.price / qty);
    out.push({ format, qty, upgrade, unitCents, variantId: v.id });
  }
  return out;
}

// ─── Proposal + apply ────────────────────────────────────────────────

export type ProposalRung = {
  format: AlbumFormat;
  tierName: string;
  qty: number;
  unitCents: number;
};
export type ProposalProduct = {
  handle: string;
  name: string;
  mappedTiersByFormat: Record<string, string>; // format → tierName
  rungs: ProposalRung[];
  error?: string;
};
export type Proposal = {
  source: typeof HELLBENDER_PRICING_SOURCE;
  fetchedAt: string;
  products: ProposalProduct[];
  unmapped: { handle: string; name: string; reason: string }[];
  // Aggregated rungs to be written. Multiple colors in the same tier
  // collapse here; if they disagree on price we keep the median.
  writes: ProposalRung[];
};

function medianUnit(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export async function buildHellbenderPricingProposal(): Promise<Proposal> {
  const indexHtml = await fetchText(HELLBENDER_INDEX_URL);
  const tiles = parseIndexHandles(indexHtml);
  if (tiles.length === 0) {
    throw new Error("Couldn't parse any product handles from Hellbender index");
  }

  const products: ProposalProduct[] = await withConcurrency(tiles, 3, async (t) => {
    try {
      const p = await fetchProductJs(t.handle);
      const rungs: ProposalRung[] = [];
      const mappedTiersByFormat: Record<string, string> = {};
      const decoded = decodeVariants(p).filter((d) => d.upgrade === "none");
      for (const d of decoded) {
        const tierName = resolveTierForHandle(t.handle, d.format);
        if (!tierName) continue;
        mappedTiersByFormat[d.format] = tierName;
        rungs.push({ format: d.format, tierName, qty: d.qty, unitCents: d.unitCents });
      }
      return { handle: t.handle, name: t.name, mappedTiersByFormat, rungs };
    } catch (e: any) {
      return {
        handle: t.handle,
        name: t.name,
        mappedTiersByFormat: {},
        rungs: [],
        error: e?.message || String(e),
      };
    }
  });

  const unmapped: Proposal["unmapped"] = [];
  for (const p of products) {
    if (p.error) {
      unmapped.push({ handle: p.handle, name: p.name, reason: p.error });
      continue;
    }
    if (Object.keys(p.mappedTiersByFormat).length === 0) {
      unmapped.push({
        handle: p.handle,
        name: p.name,
        reason: "No tier matched the handle prefix (Black/Color/Splatter/Translucent/Clear/Metallic/Opaque/House Mix).",
      });
    }
  }

  // Aggregate to one rung per (format, tier, qty).
  const bucket = new Map<string, number[]>();
  for (const p of products) {
    if (p.error) continue;
    for (const r of p.rungs) {
      const key = `${r.format}|${r.tierName}|${r.qty}`;
      const arr = bucket.get(key) ?? [];
      arr.push(r.unitCents);
      bucket.set(key, arr);
    }
  }
  const writes: ProposalRung[] = [];
  for (const [key, values] of Array.from(bucket.entries())) {
    const [format, tierName, qtyStr] = key.split("|");
    writes.push({
      format: format as AlbumFormat,
      tierName,
      qty: parseInt(qtyStr, 10),
      unitCents: medianUnit(values),
    });
  }
  writes.sort((a, b) =>
    a.format.localeCompare(b.format) ||
    a.tierName.localeCompare(b.tierName) ||
    a.qty - b.qty,
  );

  return {
    source: HELLBENDER_PRICING_SOURCE,
    fetchedAt: new Date().toISOString(),
    products,
    unmapped,
    writes,
  };
}

export type ApplyResult = {
  syncId: string;
  rungsWritten: number;
  rungsSkipped: number;
  tiersMissing: string[];
};

// Idempotently write the proposal's aggregated rungs onto the press's
// default-jacket combos. Existing rungs are overwritten with the new
// value + `source` + `syncedAt` so a re-run with unchanged Hellbender
// prices is a no-op (same shape lands; `synced_at` advances). Tiers we
// expected to find but don't are returned so the admin can decide
// whether to create them.
export async function applyHellbenderPricingProposal(
  pressId: string,
  triggeredByUserId: string | null,
  proposal: Proposal,
): Promise<ApplyResult> {
  const [syncRow] = await db
    .insert(pressPricingSyncs)
    .values({
      pressId,
      source: HELLBENDER_PRICING_SOURCE,
      status: "running",
      triggeredByUserId,
      productsFetched: proposal.products.length,
      colorsMapped: proposal.products.filter((p) => !p.error && Object.keys(p.mappedTiersByFormat).length > 0).length,
      colorsUnmapped: proposal.unmapped.length,
      unmappedHandles: proposal.unmapped.map((u) => u.handle),
      proposal: proposal as any,
    })
    .returning();

  try {
    const [defaultJacket] = await db
      .select()
      .from(pressJackets)
      .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.isDefault, true)));
    if (!defaultJacket) {
      throw new Error("Press has no default jacket — set one before syncing pricing.");
    }
    const tiers = await db
      .select()
      .from(pressColorTiers)
      .where(eq(pressColorTiers.pressId, pressId));
    const tierKey = (format: string, name: string) => `${format}|${name}`;
    const tierByKey = new Map<string, (typeof tiers)[number]>();
    for (const t of tiers) tierByKey.set(tierKey(t.format, t.name), t);

    const ladderRows = tiers.length
      ? await db
          .select()
          .from(pressTierJacketLadders)
          .where(inArray(pressTierJacketLadders.tierId, tiers.map((t) => t.id)))
      : [];
    const ladderByCombo = new Map<string, (typeof ladderRows)[number]>();
    for (const r of ladderRows) {
      ladderByCombo.set(`${r.tierId}|${r.jacketId}`, r);
    }

    // Group writes by (format, tierName) so we update each ladder once.
    type Group = { format: AlbumFormat; tierName: string; rungs: ProposalRung[] };
    const groups = new Map<string, Group>();
    for (const w of proposal.writes) {
      const k = tierKey(w.format, w.tierName);
      const g = groups.get(k) ?? { format: w.format, tierName: w.tierName, rungs: [] };
      g.rungs.push(w);
      groups.set(k, g);
    }

    let rungsWritten = 0;
    let rungsSkipped = 0;
    const tiersMissing: string[] = [];
    const syncedAt = new Date().toISOString();

    for (const g of Array.from(groups.values())) {
      const tier = tierByKey.get(tierKey(g.format, g.tierName));
      if (!tier) {
        tiersMissing.push(`${g.format}/${g.tierName}`);
        rungsSkipped += g.rungs.length;
        continue;
      }
      const comboKey = `${tier.id}|${defaultJacket.id}`;
      const existing = ladderByCombo.get(comboKey);
      const existingLadder = (existing?.priceLadder ?? []) as Array<{
        qty: number;
        unitCents: number;
        confirmed?: boolean;
        source?: string;
        syncedAt?: string;
      }>;
      const byQty = new Map<number, (typeof existingLadder)[number]>();
      for (const r of existingLadder) byQty.set(r.qty, { ...r });
      for (const r of g.rungs) {
        byQty.set(r.qty, {
          qty: r.qty,
          unitCents: r.unitCents,
          confirmed: true,
          source: HELLBENDER_PRICING_SOURCE,
          syncedAt,
        });
        rungsWritten++;
      }
      const merged = Array.from(byQty.values()).sort((a, b) => a.qty - b.qty);
      if (existing) {
        await db
          .update(pressTierJacketLadders)
          .set({ priceLadder: merged as any })
          .where(eq(pressTierJacketLadders.id, existing.id));
      } else {
        await db.insert(pressTierJacketLadders).values({
          tierId: tier.id,
          jacketId: defaultJacket.id,
          priceLadder: merged as any,
        });
      }
    }

    await db
      .update(pressPricingSyncs)
      .set({
        status: "ok",
        finishedAt: new Date(),
        rungsWritten,
      })
      .where(eq(pressPricingSyncs.id, syncRow.id));

    return { syncId: syncRow.id, rungsWritten, rungsSkipped, tiersMissing };
  } catch (err: any) {
    await db
      .update(pressPricingSyncs)
      .set({ status: "error", finishedAt: new Date(), error: err?.message || String(err) })
      .where(eq(pressPricingSyncs.id, syncRow.id));
    throw err;
  }
}

export async function listPricingSyncs(pressId: string, limit = 20) {
  return db
    .select()
    .from(pressPricingSyncs)
    .where(eq(pressPricingSyncs.pressId, pressId))
    .orderBy(desc(pressPricingSyncs.startedAt))
    .limit(limit);
}
