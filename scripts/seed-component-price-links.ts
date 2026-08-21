/**
 * Task #3227 — Seed the obvious component→price linkages for MRP + Viryl.
 *
 * One-time idempotent mapping of each press's package component options to
 * that press's OWN price rows (no cross-press blending):
 *   • MRP: print components link to the Tier 3 component ladders
 *     (press_components 'pricing' config.componentLadders, seeded by
 *     seed-mrp-services-tier3.ts); assembly/sleeve/poly-bag extras link to
 *     MRP press_service_items by exact label.
 *   • Viryl: sleeves/assembly extras link to Viryl press_service_items
 *     (2026 price list); jackets are "included" (Viryl's tier×jacket record
 *     ladder already prices the jacket dimension).
 *   • Genuinely unpriced options are seeded as explicit "custom_quote" so
 *     operators see an honest state rather than a silent gap.
 *
 * Idempotent: marker-guarded (component_price_links_seed_v1) AND per-link
 * guarded on (pressId, componentKey, optionId) — an operator-edited link is
 * never overwritten. Missing press = FATAL (never stamp the marker on a
 * partial run). A missing ladder/service ref downgrades that ONE link to
 * custom_quote with a console warning (still honest, never $0).
 *
 * Dev:  npx tsx scripts/seed-component-price-links.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-component-price-links.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  manufacturers,
  pressComponents,
  pressComponentPriceLinks,
  pressServiceItems,
} from "../shared/schema";
import {
  ladderItemToRungs,
  type ComponentLadderCatalog,
  type PackageComponentKey,
  type PriceLinkMode,
} from "../shared/pressComponentPricing";

const DRY = process.argv.includes("--dry");
const MARKER = "component_price_links_seed_v1";

type SeedLink = {
  componentKey: PackageComponentKey;
  optionId: string;
  priceMode: PriceLinkMode;
  serviceLabel?: string; // exact press_service_items.label
  ladder?: { groupKey: string; itemLabel: string }; // componentLadders ref
};

// ── MRP (Tier 3 sheet, 09.01.2025) ─────────────────────────────────────
const MRP_LINKS: SeedLink[] = [
  // Jackets — single is what the tier×jacket record ladder already carries;
  // upgrades itemize from MRP's own print ladders.
  { componentKey: "jacket", optionId: "single", priceMode: "included" },
  { componentKey: "jacket", optionId: "gatefold", priceMode: "ladder", ladder: { groupKey: "gatefold_jackets", itemLabel: '12"/10" / 20pt Board / 4/0 (CMYK)' } },
  { componentKey: "jacket", optionId: "trifold", priceMode: "ladder", ladder: { groupKey: "trifold_jackets", itemLabel: '12"/10" / 20pt Board / 4/0 (CMYK) (INSIDE SPINES/GUTTERS DO NOT PRINT!)' } },
  { componentKey: "jacket", optionId: "discobag", priceMode: "custom_quote" },
  { componentKey: "jacket", optionId: "pvc", priceMode: "service", serviceLabel: '12"/10" Deluxe PVC Sleeve with Flap' },
  // Inner sleeves
  { componentKey: "inner_sleeve", optionId: "printed-paper", priceMode: "ladder", ladder: { groupKey: "printed_sleeves", itemLabel: '12"/10" Paper Sleeve / 100# coated or 70# offset (uncoated) / 4/0 (CMYK)' } },
  { componentKey: "inner_sleeve", optionId: "printed-board", priceMode: "ladder", ladder: { groupKey: "printed_sleeves", itemLabel: '12"/10" Board (Euro) Sleeve / 12pt board / 4/0 (CMYK)' } },
  { componentKey: "inner_sleeve", optionId: "white", priceMode: "custom_quote" }, // MRP lists no plain-white 12" paper sleeve
  { componentKey: "inner_sleeve", optionId: "black", priceMode: "service", serviceLabel: '12"/10" Black Paper Inner Sleeve' },
  // MRP's own sheet lists this at $0 with "Included in pressing price".
  { componentKey: "inner_sleeve", optionId: "white-poly", priceMode: "included" },
  { componentKey: "inner_sleeve", optionId: "black-poly", priceMode: "service", serviceLabel: '12"/10" Poly-Lined Black Inner Sleeve' },
  // Inserts
  { componentKey: "insert", optionId: "sheet", priceMode: "ladder", ladder: { groupKey: "inserts", itemLabel: '12" x 12" 4/0 CMYK' } },
  { componentKey: "insert", optionId: "gatefold", priceMode: "ladder", ladder: { groupKey: "inserts", itemLabel: '24" x 12" (Gatefold Insert) 4/4 CMYK/CMYK' } },
  { componentKey: "insert", optionId: "booklet", priceMode: "custom_quote" },
  { componentKey: "insert", optionId: "poster", priceMode: "custom_quote" },
  // Extras
  { componentKey: "extras", optionId: "download_card", priceMode: "ladder", ladder: { groupKey: "download_cards", itemLabel: "Custom Art - 4/0 CMYK" } },
  { componentKey: "extras", optionId: "sticker", priceMode: "custom_quote" }, // sticker grids stay verbatim/uncurated (out of scope)
  { componentKey: "extras", optionId: "poly_bag", priceMode: "service", serviceLabel: '12"/10" 3.0 mil Open-Top Poly-Bag' },
  { componentKey: "extras", optionId: "shrink_wrap", priceMode: "service", serviceLabel: "Shrink-Wrap (standard product)" },
  { componentKey: "extras", optionId: "insertion", priceMode: "service", serviceLabel: "Insertion (per item assembled)" },
];

// ── Viryl (2026 USD price list — setup & services rows) ────────────────
const VIRYL_LINKS: SeedLink[] = [
  // Viryl's record ladders are tier×jacket all-in — the jacket dimension is
  // priced inside the record line, not as a separate component row.
  { componentKey: "jacket", optionId: "single", priceMode: "included" },
  // Viryl has NO gatefold jacket ladder (no gatefold row in its catalog) —
  // honest custom quote, never "included".
  { componentKey: "jacket", optionId: "gatefold", priceMode: "custom_quote" },
  { componentKey: "jacket", optionId: "trifold", priceMode: "custom_quote" },
  { componentKey: "jacket", optionId: "discobag", priceMode: "custom_quote" },
  { componentKey: "jacket", optionId: "pvc", priceMode: "custom_quote" },
  // Inner sleeves
  { componentKey: "inner_sleeve", optionId: "printed-paper", priceMode: "custom_quote" },
  { componentKey: "inner_sleeve", optionId: "printed-board", priceMode: "custom_quote" },
  // Viryl's sheet lists standard white sleeves at $0 ("Included in pressing
  // price") — represent as included, never a $0 priced service line.
  { componentKey: "inner_sleeve", optionId: "white", priceMode: "included" },
  { componentKey: "inner_sleeve", optionId: "black", priceMode: "service", serviceLabel: 'Standard Black Paper Inner Sleeves (12"/10"/7")' },
  { componentKey: "inner_sleeve", optionId: "white-poly", priceMode: "service", serviceLabel: '12" Poly-Lined White Inner Sleeves' },
  { componentKey: "inner_sleeve", optionId: "black-poly", priceMode: "service", serviceLabel: '12" Poly-Lined Black Inner Sleeves' },
  // Inserts — no insert print rows on the 2026 services list.
  { componentKey: "insert", optionId: "sheet", priceMode: "custom_quote" },
  { componentKey: "insert", optionId: "gatefold", priceMode: "custom_quote" },
  { componentKey: "insert", optionId: "booklet", priceMode: "custom_quote" },
  { componentKey: "insert", optionId: "poster", priceMode: "custom_quote" },
  // Extras
  { componentKey: "extras", optionId: "download_card", priceMode: "custom_quote" },
  { componentKey: "extras", optionId: "sticker", priceMode: "service", serviceLabel: "Sticker Application" },
  { componentKey: "extras", optionId: "poly_bag", priceMode: "service", serviceLabel: '12"/10" Open-Top Poly Bag (Over-Jacket)' },
  { componentKey: "extras", optionId: "shrink_wrap", priceMode: "service", serviceLabel: "Shrink Wrapping" },
  { componentKey: "extras", optionId: "insertion", priceMode: "service", serviceLabel: "Insertion of Sleeved Record into Jacket" },
];

async function loadLadderCatalog(pressId: string): Promise<ComponentLadderCatalog | null> {
  const [row] = await db
    .select()
    .from(pressComponents)
    .where(and(eq(pressComponents.pressId, pressId), eq(pressComponents.componentKey, "pricing")));
  const blob = (row?.config as any)?.componentLadders;
  if (!blob || !Array.isArray(blob.groups) || !Array.isArray(blob.quantities)) return null;
  return blob as ComponentLadderCatalog;
}

// Decoy-shell trap (prod has an empty VIRYL/viryltech.com shell beside the
// real Viryl Technologies/viryl.ca): never take a fuzzy first name match.
// Prefer an exact-domain match; otherwise require exactly ONE candidate
// with actual catalog tiers. Ambiguity or an empty shell = FATAL, no stamp.
export async function resolveSeedPress(
  pressName: string,
  candidates: { id: string; name: string; domain: string | null }[],
  preferredDomain: string | null,
  tierCountFor: (pressId: string) => Promise<number>,
): Promise<{ id: string; name: string; domain: string | null }> {
  if (candidates.length === 0) throw new Error(`${pressName} manufacturer not found — FATAL, not stamping.`);
  if (preferredDomain) {
    const exact = candidates.filter(
      (c) => (c.domain ?? "").toLowerCase().replace(/^www\./, "") === preferredDomain,
    );
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Error(`${pressName}: multiple rows with domain ${preferredDomain} — FATAL, not stamping.`);
  }
  const withTiers: typeof candidates = [];
  for (const c of candidates) {
    if ((await tierCountFor(c.id)) > 0) withTiers.push(c);
  }
  if (withTiers.length === 1) return withTiers[0];
  throw new Error(
    `${pressName}: ${withTiers.length} candidates carry catalog tiers (${candidates
      .map((c) => `${c.name}/${c.domain}`)
      .join(", ")}) — ambiguous, FATAL, not stamping.`,
  );
}

async function seedPress(
  pressName: string,
  pressWhere: any,
  links: SeedLink[],
  preferredDomain: string | null = null,
) {
  const candidates = await db.select().from(manufacturers).where(pressWhere);
  const press = await resolveSeedPress(
    pressName,
    candidates.map((c) => ({ id: c.id, name: c.name, domain: (c as any).domain ?? null })),
    preferredDomain,
    async (pressId) => {
      const r = await db.execute(sql`SELECT count(*)::int AS n FROM press_color_tiers WHERE press_id = ${pressId}`);
      return Number((r.rows[0] as any)?.n ?? 0);
    },
  );
  console.log(`${pressName}: ${press.id} (${press.name} / ${press.domain ?? "no domain"})`);

  const catalog = await loadLadderCatalog(press.id);
  const services = await db
    .select()
    .from(pressServiceItems)
    .where(eq(pressServiceItems.pressId, press.id));
  const serviceByLabel = new Map(services.filter((s) => !s.archivedAt).map((s) => [s.label, s] as const));

  let inserted = 0;
  let skipped = 0;
  for (const link of links) {
    const [existing] = await db
      .select({ id: pressComponentPriceLinks.id })
      .from(pressComponentPriceLinks)
      .where(
        and(
          eq(pressComponentPriceLinks.pressId, press.id),
          eq(pressComponentPriceLinks.componentKey, link.componentKey),
          eq(pressComponentPriceLinks.optionId, link.optionId),
        ),
      );
    if (existing) {
      skipped++;
      continue; // operator-edited or previously seeded — never overwrite
    }

    let priceMode: PriceLinkMode = link.priceMode;
    let serviceItemId: string | null = null;
    let ladderSource: { groupKey: string; itemLabel: string } | null = null;
    let ladderRungs: { qty: number; unitCents: number }[] | null = null;

    // Missing-prereq rule (one-time backfills): a source this seed EXPECTS
    // (service item / ladder from the press's own loaders) being absent is
    // a FATAL prereq failure, never a silent custom_quote downgrade — the
    // per-link guard + marker would lock the downgrade in permanently.
    if (link.priceMode === "service") {
      const item = serviceByLabel.get(link.serviceLabel!);
      if (!item) {
        throw new Error(
          `${pressName} ${link.componentKey}:${link.optionId} — service '${link.serviceLabel}' not found; FATAL, run the press's service loader first (not stamping).`,
        );
      }
      serviceItemId = item.id;
    } else if (link.priceMode === "ladder") {
      const rungs = catalog ? ladderItemToRungs(catalog, link.ladder!.groupKey, link.ladder!.itemLabel) : null;
      if (!rungs) {
        throw new Error(
          `${pressName} ${link.componentKey}:${link.optionId} — ladder '${link.ladder!.groupKey}/${link.ladder!.itemLabel}' not found; FATAL, componentLadders catalog missing (not stamping).`,
        );
      }
      ladderSource = link.ladder!;
      ladderRungs = rungs;
    }

    inserted++;
    if (!DRY) {
      await db.insert(pressComponentPriceLinks).values({
        pressId: press.id,
        componentKey: link.componentKey,
        optionId: link.optionId,
        priceMode,
        serviceItemId,
        ladderSource,
        ladderRungs,
      } as any);
    }
  }
  console.log(`${DRY ? "[dry] " : ""}${pressName}: inserted ${inserted}, skipped ${skipped} existing`);
}

async function main() {
  try {
    const [marker] = (
      await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`)
    ).rows;
    if (marker) {
      console.log(`Marker '${MARKER}' already set — nothing to do.`);
      return;
    }

    await seedPress("MRP", sql`${manufacturers.name} ILIKE '%memphis%'`, MRP_LINKS, "memphisrecordpressing.com");
    await seedPress(
      "Viryl",
      sql`${manufacturers.domain} ILIKE '%viryl%' OR ${manufacturers.name} ILIKE '%viryl%'`,
      VIRYL_LINKS,
      "viryl.ca",
    );

    if (!DRY) {
      await db.execute(
        sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
      );
      console.log(`Marker '${MARKER}' stamped.`);
    }
  } finally {
    await pool.end();
  }
}

// Only run when executed directly (tests import resolveSeedPress).
const isDirectRun = process.argv[1]?.includes("seed-component-price-links");
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
