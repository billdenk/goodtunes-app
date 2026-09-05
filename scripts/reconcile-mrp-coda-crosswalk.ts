/**
 * Task #3462 — persist the reviewed MRP CODA code/semantics crosswalk.
 *
 * Metadata-only reconciliation: no prices or ladders are changed. In
 * particular, all-in ladders and operator-confirmed/locked rungs are outside
 * this script's write set. Marker guarded for dev/prod; use --dry to inspect.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { manufacturers, pressComponents } from "../shared/schema";
import { pricingComponentConfigSchema } from "../shared/pressComponents";
import { MRP_CODA_CROSSWALK, MRP_CODA_SOURCE } from "../shared/mrpCodaPricing";

const DRY = process.argv.includes("--dry");
const MARKER = "mrp_coda_crosswalk_2026_09_v2";
const REVIEWED_WORKBOOK = "GoodTunes___GoGoods-Tier3-2_1788555344172.xlsx";

const ROW_IDENTITIES: Record<string, {
  codaCode?: string;
  codaCodesBySize?: Record<string, string>;
  codaCodesBySizeHeavy?: Record<string, string>;
}> = {
  "type:black": { codaCodesBySize: { '12"': "4011-0001", '10"': "4011-0001", '7"': "4012-0001" }, codaCodesBySizeHeavy: { '12"': "4011-0002" } },
  "type:translucent": { codaCodesBySize: { '12"': "4011A-0004", '10"': "4011A-0004", '7"': "4012A-0001" }, codaCodesBySizeHeavy: { '12"': "4011A-0005" } },
  "type:opaque": { codaCodesBySize: { '12"': "4011A-0006", '10"': "4011A-0006", '7"': "4012A-0002" }, codaCodesBySizeHeavy: { '12"': "4011A-0007" } },
  "type:neon": { codaCodesBySize: { '12"': "4011A-0008", '10"': "4011A-0008", '7"': "4012A-0003" }, codaCodesBySizeHeavy: { '12"': "4011A-0009" } },
  "type:glow-in-the-dark": { codaCodesBySize: { '12"': "4011A-0010", '10"': "4011A-0010" }, codaCodesBySizeHeavy: { '12"': "4011A-0011" } },
  "type:ecomix": { codaCodesBySize: { '12"': "4011A-0001", '10"': "4011A-0001" }, codaCodesBySizeHeavy: { '12"': "4011A-0002" } },
  "type:standard-blends": { codaCodesBySize: { '12"': "4011A-0015", '10"': "4011A-0015" }, codaCodesBySizeHeavy: { '12"': "4011A-0016" } },
  "type:deluxe-blends": { codaCodesBySize: { '12"': "4011A-0017", '10"': "4011A-0017" }, codaCodesBySizeHeavy: { '12"': "4011A-0018" } },
  "type:half": { codaCodesBySize: { '12"': "4011A-0019", '10"': "4011A-0019" }, codaCodesBySizeHeavy: { '12"': "4011A-0020" } },
  "type:3-color-split": { codaCodesBySize: { '12"': "4011A-0025", '10"': "4011A-0025" }, codaCodesBySizeHeavy: { '12"': "4011A-0026" } },
  "type:picture-disc": { codaCodesBySize: { '12"': "4011A-0031", '10"': "4011A-0032", '7"': "4012A-0008" } },
  "type:splatter": { codaCode: "4011A-0012" },
  "labels:bw": { codaCode: "4035-0003" },
  "labels:color": { codaCode: "4035-0004" },
  "sleeves:unprinted": { codaCode: "4033-0003" },
  "jackets:single": { codaCode: "4031-0004" },
  "inserts:12x12-color": { codaCode: "4032-0003" },
  "service:cutting": { codaCode: "4050-0001" },
  "service:plating": { codaCode: "4020-0002" },
  "service:test": { codaCode: "4011B-0001" },
  "service:assembly": { codaCode: "4040A-0004" },
  "service:shrink": { codaCode: "4040E-0002" },
};

function attachVerifiedIdentities(config: Record<string, any>): Record<string, any> {
  const rows = Array.isArray(config.rows)
    ? config.rows.map((row: any) => {
        const identity = ROW_IDENTITIES[String(row?.key)];
        return identity ? { ...row, ...identity, codaSource: MRP_CODA_SOURCE } : row;
      })
    : [];
  const setupRules = config.setupRules ? structuredClone(config.setupRules) : null;
  if (setupRules) setupRules.codaSource = MRP_CODA_SOURCE;
  if (setupRules?.stamper?.rules) {
    for (const rule of setupRules.stamper.rules) {
      if (rule.perUnitCents === 24 && rule.weights?.includes("180")) rule.codaCode = "4021-0002";
      else if (rule.perUnitCents === 14 && rule.weights?.includes("140")) rule.codaCode = "4021-0001";
      else if (rule.perUnitCents === 15 && rule.sizes?.includes("7")) rule.codaCode = "4021-0004";
      else if (rule.perUnitCents === 24 && Array.isArray(rule.tierMatch)) rule.codaCode = "4021-0003";
    }
  }
  if (setupRules?.colorSetup) {
    // General color setup is deliberately linked to the held row so it fails
    // closed. Splatter has its separately verified setup identity.
    setupRules.colorSetup.codaCode = "4011A-0003";
    if (setupRules.colorSetup.splatter) setupRules.colorSetup.splatter.codaCode = "4011A-0014";
  }
  if (setupRules?.pressSetup) setupRules.pressSetup.codaCode = "4080-0001";
  if (setupRules?.polyBag) {
    setupRules.polyBag.bagCodaCode = "4033-0018";
    setupRules.polyBag.insertionCodaCode = "4040A-0004";
  }
  return { ...config, rows, ...(setupRules ? { setupRules } : {}) };
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

    // Do not use a fuzzy/first-row lookup: environments may contain decoys.
    const candidates = await db.select().from(manufacturers);
    const matches = candidates.filter(
      (candidate) => candidate.name?.trim().toLowerCase() === "memphis record pressing",
    );
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one Memphis Record Pressing manufacturer; found ${matches.length}.`);
    }
    const press = matches[0];
    const [pricing] = await db
      .select()
      .from(pressComponents)
      .where(and(eq(pressComponents.pressId, press.id), eq(pressComponents.componentKey, "pricing")));
    if (!pricing) throw new Error("MRP pricing component not found — FATAL, not stamping.");

    const crosswalk = {
      source: MRP_CODA_SOURCE,
      reviewedWorkbook: REVIEWED_WORKBOOK,
      entries: Array.from(MRP_CODA_CROSSWALK.values()),
    } as const;
    // Validate the merged shape before any write. passthrough is not used:
    // malformed metadata must stop the reconciliation.
    const existing = attachVerifiedIdentities((pricing.config as Record<string, any> | null) ?? {});
    const merged = {
      ...existing,
      mrpCodaCrosswalk: crosswalk,
    };
    pricingComponentConfigSchema.parse(merged);

    console.log(
      `${DRY ? "[dry] " : ""}MRP ${press.id}: ${crosswalk.entries.length} unique CODA codes from ${REVIEWED_WORKBOOK}`,
    );
    if (DRY) return;

    await db.transaction(async (tx) => {
      await tx
        .update(pressComponents)
        .set({
          config: merged,
          updatedAt: new Date(),
        } as any)
        .where(eq(pressComponents.id, pricing.id));
      await tx.execute(
        sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
      );
    });
    console.log(`marker '${MARKER}' set.`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && /reconcile-mrp-coda-crosswalk/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}