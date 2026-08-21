/**
 * Task #3243 — Backfill Viryl's per-component pricing rows from the already-
 * imported 2026 price list, so the Components → Pricing page shows real
 * upcharges instead of "0 of 47 priced".
 *
 * Only rows DERIVABLE from the 2026 sheet get a number: vinyl type rows and
 * their color rows take the tier's per-record cents (12"/10" = 140 g column,
 * 7" = 7" column). Everything Viryl only offers as Custom Quote — notably the
 * Wide Spine / Double Gatefold jacket — stays blank on purpose; the quote
 * builder shows those lines as "Pricing pending" (never a demo default).
 *
 * Idempotent: marker-guarded (viryl_component_pricing_2026_v1) AND per-cell
 * guarded — a price cell the press already typed is NEVER overwritten.
 *
 * Dev:  npx tsx scripts/backfill-viryl-component-pricing.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-viryl-component-pricing.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { pressComponents, pressColorTiers } from "../shared/schema";
import { loadPressComponents } from "../server/pressComponents";
import type { PricingRow, PricingComponentConfig } from "../shared/pressComponents";
import { TIER_CENTS } from "./load-viryl-2026-pricing";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_component_pricing_2026_v1";
const SERVICES_MARKER = "viryl_component_pricing_services_v1";

/**
 * Phase 2 — flat (non-vinyl) rows derivable from the same 2026 sheet, so the
 * builder's always-present service/label lines carry real numbers for Viryl:
 *   service:cutting   $487.50  12"/10" Lacquer Cutting (A/B set)
 *   service:plating   $300.00  12"/10" Stampers — 2-Step Plating (A/B set)
 *   service:stampers  $0       stampers ARE the 2-step plating item → Included
 *   service:test      $86.25   12"/10" Test Pressings — 1 LP (5 units)
 *   service:colorfee  $93.75   Setup — Colour (per disc)
 *   service:assembly  $0.11    Insertion of sleeved record into jacket
 *   service:shrink    $0.15    Shrink Wrapping (per unit)
 *   labels:blank      $0.08    Plain White Labels (per pair = per record)
 *   stickers:upc      $0.08    UPC Sticker / Barcode
 * Batch-priced printed labels, per-variant-ambiguous sleeves, and every
 * Custom Quote item (gatefold jackets!) stay blank on purpose.
 */
export const VIRYL_FLAT_CENTS_2026: Record<string, number> = {
  "service:cutting": 48750,
  "service:plating": 30000,
  "service:stampers": 0,
  "service:test": 8625,
  "service:colorfee": 9375,
  "service:assembly": 11,
  "service:shrink": 15,
  "labels:blank": 8,
  "stickers:upc": 8,
};

/** Derive the per-size cents for one pricing row from the 2026 tier table.
 * Returns null when the row's tier is Custom Quote (not on the sheet). */
export function derivedCentsForRow(row: PricingRow): Record<string, number> | null {
  const tierName = (row.kind === "type" ? row.label : row.detail ?? "").trim();
  const cents = TIER_CENTS[tierName];
  if (!cents) return null;
  const [c140, , c7] = cents;
  const sizes = row.sizes?.length ? row.sizes : (['7"', '10"', '12"'] as const);
  const out: Record<string, number> = {};
  for (const s of sizes) out[s] = s === '7"' ? c7 : c140;
  return out;
}

async function markerSet(name: string): Promise<boolean> {
  const [row] = (
    await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${name}`)
  ).rows as unknown[];
  return !!row;
}

async function main() {
  const doVinyl = !(await markerSet(MARKER));
  const doServices = !(await markerSet(SERVICES_MARKER));
  if (!doVinyl && !doServices) {
    console.log(`markers '${MARKER}' + '${SERVICES_MARKER}' already set — nothing to do.`);
    return;
  }

  // Resolve the REAL Viryl press. Prod carries a decoy "VIRYL" (viryltech.com)
  // beside the real viryl.ca press — never take the first ILIKE row blind.
  const matches = (
    await db.execute<{ id: string; name: string; domain: string | null }>(sql`
      SELECT id, name, domain FROM manufacturers
      WHERE domain ILIKE '%viryl%' OR name ILIKE '%viryl%'
    `)
  ).rows;
  let press = matches.find((m) => (m.domain ?? "").toLowerCase().includes("viryl.ca"));
  if (!press && matches.length === 1) press = matches[0];
  if (!press) {
    // Disambiguate by which candidate actually carries the 2026 tier ladders.
    const withTiers: typeof matches = [];
    for (const m of matches) {
      const [t] = (
        await db.select({ id: pressColorTiers.id }).from(pressColorTiers).where(eq(pressColorTiers.pressId, m.id)).limit(1)
      );
      if (t) withTiers.push(m);
    }
    if (withTiers.length === 1) press = withTiers[0];
  }
  if (!press) {
    // FATAL, marker NOT stamped — a fresh clone retries after the press exists.
    throw new Error(`could not unambiguously resolve the real Viryl press (matches: ${matches.map((m) => `${m.name}/${m.domain}`).join(", ") || "none"})`);
  }
  console.log(`Viryl press: ${press.name} (${press.domain ?? "no domain"}) ${press.id}`);

  // Ensure the pricing component exists (seeds from vinyl if never opened).
  await loadPressComponents(press.id);
  const [row] = await db
    .select()
    .from(pressComponents)
    .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")))
    .limit(1);
  if (!row) throw new Error("pricing component row missing after seed — aborting (marker not stamped)");

  const config = (row.config ?? { rows: [] }) as PricingComponentConfig;
  const rows: PricingRow[] = Array.isArray(config.rows) ? config.rows : [];

  if (doVinyl) {
    let filled = 0;
    let skippedCustom = 0;
    let keptExisting = 0;
    for (const r of rows) {
      if (r.kind !== "type" && r.kind !== "color") continue;
      const derived = derivedCentsForRow(r);
      if (!derived) {
        skippedCustom++;
        continue;
      }
      r.pricesBySize = { ...(r.pricesBySize ?? {}) };
      for (const [size, cents] of Object.entries(derived)) {
        const cur = (r.pricesBySize as Record<string, number | null>)[size];
        if (cur != null) {
          keptExisting++;
          continue; // never clobber a press-typed price
        }
        (r.pricesBySize as Record<string, number | null>)[size] = cents;
        filled++;
      }
    }
    console.log(`vinyl cells filled: ${filled} · custom-quote rows left blank: ${skippedCustom} · existing cells kept: ${keptExisting}`);
  }

  if (doServices) {
    let filled = 0;
    let keptExisting = 0;
    let missingRows = 0;
    for (const [key, cents] of Object.entries(VIRYL_FLAT_CENTS_2026)) {
      const r = rows.find((x) => x.key === key);
      if (!r) {
        // Row should exist (seedQuoteFlatRows runs in loadPressComponents
        // above) — a miss means the seed vocabulary changed; fail loud so
        // the marker is withheld and this retries after a fix.
        missingRows++;
        console.error(`  MISSING pricing row for ${key}`);
        continue;
      }
      const has =
        r.priceCents != null || Object.values(r.pricesBySize ?? {}).some((v) => v != null);
      if (has) {
        keptExisting++; // never clobber a press-typed price
        continue;
      }
      r.priceCents = cents;
      filled++;
    }
    if (missingRows > 0) throw new Error(`${missingRows} expected flat pricing rows missing — aborting (services marker not stamped)`);
    console.log(`service/flat cells filled: ${filled} · existing kept: ${keptExisting}`);
  }

  if (DRY) {
    console.log("--dry: no writes.");
    return;
  }
  await db
    .update(pressComponents)
    .set({ config: { ...config, rows }, updatedAt: new Date() })
    .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")));
  if (doVinyl) {
    await db.execute(sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`);
    console.log(`marker '${MARKER}' set.`);
  }
  if (doServices) {
    await db.execute(sql`INSERT INTO post_merge_data_backfills (name) VALUES (${SERVICES_MARKER}) ON CONFLICT DO NOTHING`);
    console.log(`marker '${SERVICES_MARKER}' set.`);
  }
}

// Only execute when run directly (tests import derivedCentsForRow).
if (process.argv[1] && /backfill-viryl-component-pricing/.test(process.argv[1])) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
