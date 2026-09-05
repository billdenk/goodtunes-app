/**
 * Task #3387 — Seed Memphis Record Pressing's setup-fee RULES (the first
 * configuration of the press-generic setup-fee rules engine).
 *
 * Source of truth: Arian's Day-2 tracker §16 (task 3387 spec):
 *   16.1 Stamper fee — 140g free first 1,000 units on new audio ($0.14/rec
 *        above), 180g free first 500 ($0.24/rec above); reorders pay at all
 *        quantities; picture disc / glitter / manual effects (Ghostly,
 *        Torrent) $0.24 at all quantities; 7" $0.15 at all quantities.
 *   16.2 Color setup — $95 per color per LP; solid = 1, black/EcoMix = 0,
 *        blends / Half / Color In Color = 2, 3-Color Split = 3; splatter =
 *        base color + $35 per splatter color (task spec supersedes the
 *        Tier-3 sheet's $50 "Setup — Splatter Records" line); 2LP doubles.
 *   16.3 Press setup — $95 on orders under 500 units.
 *   16.4 Poly bag — open-top poly 25¢ + 12¢ insertion shown as ONE 37¢
 *        line (insertion folded into the bag price, per 4.11).
 *
 * The rule VOCABULARY lives in shared/pressComponents.ts (setupFeeRulesSchema)
 * and evaluates in shared/quotePricing.ts — these are just MRP's VALUES.
 * Other presses configure the same structure with their own numbers.
 *
 * Idempotent: marker-guarded (mrp_setup_rules_v1); the rules are merged
 * into the pricing component config under their own `setupRules` key
 * without touching rows/componentLadders. Tier matching is substring over
 * MRP's live catalog tier names (Black, EcoMix, …Blends, Half, Color In
 * Color, Ghostly Effect, Torrent Effect, Splatter, …).
 *
 * Dev:  npx tsx scripts/seed-mrp-setup-rules.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-mrp-setup-rules.ts
 * Dry:  add --dry
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { manufacturers, pressComponents } from "../shared/schema";
import { setupFeeRulesSchema, type SetupFeeRules } from "../shared/pressComponents";

const DRY = process.argv.includes("--dry");
// v2: added maxSplatterColors (MRP offers up to 3 splatter colors — counts
// above are refused by the engine, never priced).
const MARKER = "mrp_setup_rules_v2";
const SOURCE = "mrp-day2-tracker-s16";

export const MRP_SETUP_RULES: SetupFeeRules = {
  source: SOURCE,
  codaSource: "mrp-tier3-expanded-2026-09-04",
  stamper: {
    reordersAlwaysPay: true,
    rules: [
      // Manual-effect categories pay at every quantity (16.1). Matched by
      // tier-name substring against MRP's catalog tiers.
      {
        tierMatch: ["picture", "glitter", "ghostly", "torrent", "manual effect", "special effect"],
        perUnitCents: 24,
        label: "Picture disc / glitter / manual effects",
        codaCode: "4021-0003",
      },
      // 7" pays at every quantity.
      { sizes: ["7"], perUnitCents: 15, label: '7" stamper fee', codaCode: "4021-0004" },
      // 180g: free first 500 units on new audio, $0.24/record above.
      { weights: ["180"], perUnitCents: 24, freeUnits: 500, codaCode: "4021-0002" },
      // 140g: free first 1,000 units on new audio, $0.14/record above.
      { weights: ["140"], perUnitCents: 14, freeUnits: 1000, codaCode: "4021-0001" },
    ],
  },
  colorSetup: {
    perColorCents: 9500,
    perDisc: true, // 2LP doubles (16.2)
    categories: [
      // Order matters — first match wins on tier-name substrings.
      { match: ["black"], colors: 0 },
      { match: ["ecomix", "eco-mix", "eco mix"], colors: 0 },
      { match: ["3-color", "3 color", "three-color", "three color", "split"], colors: 3 },
      { match: ["blend", "half", "color in color", "double double", "two-color", "2-color"], colors: 2 },
    ],
    // Splatter = base color ($95) + $35 per splatter color. The task spec's
    // $35 supersedes the Tier-3 sheet's $50 "Setup — Splatter Records" line.
    // MRP offers build-your-own splatter with up to THREE accent colors —
    // higher persisted counts are refused (fall to the manual row), never priced.
    splatter: { match: ["splatter"], baseColors: 1, perSplatterColorCents: 3500, maxSplatterColors: 3, codaCode: "4011A-0014" },
    // Everything else (Opaque, Translucent, Neon, Glow, solid Color) = 1.
    defaultColors: 1,
  },
  // $95 press setup on orders under 500 units (16.3).
  pressSetup: { amountCents: 9500, underQty: 500, codaCode: "4080-0001" },
  // Open-top poly 25¢ + 12¢ insertion = one 37¢/unit line (16.4 / 4.11).
  polyBag: {
    label: "Open-top poly bag",
    bagCents: 25,
    insertionCents: 12,
    bagCodaCode: "4033-0018",
    insertionCodaCode: "4040A-0004",
  },
};

async function main() {
  try {
    // Validate against the shared vocabulary before touching the DB.
    setupFeeRulesSchema.parse(MRP_SETUP_RULES);

    const [marker] = (
      await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`)
    ).rows;
    if (marker) {
      console.log(`Marker '${MARKER}' already set — nothing to do.`);
      return;
    }

    const [press] = await db
      .select()
      .from(manufacturers)
      .where(sql`${manufacturers.name} ILIKE '%memphis%'`);
    if (!press) throw new Error("Memphis Record Pressing manufacturer not found — FATAL, not stamping.");
    console.log(`MRP press: ${press.id} (${press.name})`);

    if (!DRY) {
      const [row] = await db
        .select()
        .from(pressComponents)
        .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")));
      if (row) {
        // Namespaced merge — never touches rows/componentLadders.
        await db
          .update(pressComponents)
          .set({
            config: sql`COALESCE(${pressComponents.config}, '{}'::jsonb) || jsonb_build_object('setupRules', ${JSON.stringify(MRP_SETUP_RULES)}::jsonb)`,
            updatedAt: new Date(),
          } as any)
          .where(eq(pressComponents.id, row.id));
      } else {
        await db.insert(pressComponents).values({
          pressId: press.id,
          componentKey: "pricing",
          config: { rows: [], setupRules: MRP_SETUP_RULES },
        } as any);
      }
      console.log("setupRules written onto MRP's pricing component config.");
      await db.execute(
        sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
      );
      console.log(`marker '${MARKER}' set.`);
    } else {
      console.log("[dry] would write setupRules + set marker.");
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && /seed-mrp-setup-rules/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
