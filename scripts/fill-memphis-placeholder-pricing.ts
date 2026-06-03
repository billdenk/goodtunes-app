/**
 * Fill Memphis Record Pressing's EMPTY color price ladders with best-guess
 * placeholder pricing so Bill can demo quantity-based pricing for every
 * color tier (not just the handful MRP has actually quoted). MRP refines
 * these later with real numbers; until then they are clearly flagged
 * `estimated:true` (the same provenance shape Hellbender's interpolated
 * cells use) so the audit trail stays honest.
 *
 * THE PROBLEM
 *   On Memphis' DEFAULT jacket (Single Jacket — the ladder /invited-press
 *   exposes and the SellPanel prices against), only a few tiers carry real
 *   confirmed rungs: Color (all formats), Splatter (12" LP + 12" double),
 *   and Black (12" LP, partial). Every other tier (EcoMix, Translucent,
 *   Opaque, Neon/Glow, Smoke/Cream/Metallic Blends, plus most 7" tiers) is
 *   all `confirmed:false, unitCents:0`, so `snapToCatalogQuantityTier`
 *   filters every rung out and the pick prices as "free". You can't demo
 *   quantity breaks on those colors.
 *
 * THE FIX (data only — no schema, no code)
 *   For each DEFAULT-jacket ladder that has ZERO confirmed rungs, synthesise
 *   a 6-rung ladder [100,200,300,500,1000,2000] derived from the SAME
 *   FORMAT's Color ladder (the most complete real ladder) times a per-tier
 *   multiplier grounded in the real data:
 *     - Splatter ≈ 1.10 x Color   (observed in 12"LP + 12"double)
 *     - Black    ≈ 0.63 x Color   (observed: 12"LP Black 300 = 695 vs
 *                                  Color 300 = 1112)
 *   The 300/500/1000/2000 rungs scale the matching Color rung; the low-qty
 *   100/200 rungs use Black's own observed 100/200/300 shape
 *   (200 ≈ 1.26x, 100 ≈ 1.94x the 300 price). Every generated rung is
 *   {confirmed:true, estimated:true, source:'placeholder-estimate',
 *   syncedAt:<now>} so it prices + displays like a normal number but is
 *   tagged as an estimate. `lockedFromSync` is intentionally NOT set so a
 *   future MRP quote (typed in the catalog editor or a sync) overwrites it
 *   freely.
 *
 * SAFETY / IDEMPOTENCY
 *   - Skips any tier that already has ANY confirmed rung, so real MRP
 *     numbers are never diluted and a re-run is a no-op once filled.
 *   - Only writes the DEFAULT jacket's ladder (what the demo reads); the
 *     non-default jacket ladders are left as-is.
 *   - Backs up every Memphis default-jacket ladder to
 *     scripts/backups/memphis-pricing-<env>-<ts>.json before any write.
 *   - unitCents stays PER-UNIT cents (scaled from per-unit Color rungs) —
 *     no vendor-total / 100x trap.
 *
 * Dev:   npx tsx scripts/fill-memphis-placeholder-pricing.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/fill-memphis-placeholder-pricing.ts
 * Dry run (no writes, prints the plan): add --dry
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  manufacturers,
  pressColorTiers,
  pressJackets,
  pressTierJacketLadders,
} from "@shared/schema";
import type { CatalogLadderRung } from "../server/pressCatalog";

const DRY = process.argv.includes("--dry");
const PRESS_NAME = "Memphis Record Pressing";
const SOURCE = "placeholder-estimate";
const ENV =
  process.env.DATABASE_URL && process.env.DATABASE_URL === process.env.PROD_DATABASE_URL
    ? "prod"
    : "dev";

// The tier whose real, confirmed ladder every placeholder is derived from.
const BASELINE_TIER = "Color";
// Quantity rungs we materialise (matches the existing empty placeholder rungs).
const QTYS = [100, 200, 300, 500, 1000, 2000] as const;
// Rungs the baseline Color ladder is sampled at for the >=300 tail.
const TAIL_QTYS = [300, 500, 1000, 2000] as const;
// Low-qty shape from MRP's real Black 100/200/300 ladder (1350/875/695).
const F200 = 1.26;
const F100 = 1.94;

// Per-tier multiplier vs the same-format Color baseline. Anything not listed
// (a hypothetical future tier) defaults to 1.00 (priced like standard color).
const MULT: Record<string, number> = {
  Black: 0.63,
  EcoMix: 0.9,
  Translucent: 1.0,
  Opaque: 1.0,
  "Neon/Glow": 1.12,
  "Smoke Blends": 1.08,
  "Cream Blends": 1.08,
  "Metallic Blends": 1.15,
  Splatter: 1.1,
  Color: 1.0,
};

type Rung = CatalogLadderRung;

function hasConfirmed(ladder: Rung[] | null | undefined): boolean {
  return Array.isArray(ladder) && ladder.some((r) => r.confirmed === true);
}

async function main() {
  console.log(`[${ENV}] fill-memphis-placeholder-pricing${DRY ? " (DRY RUN)" : ""}`);

  const [press] = await db
    .select()
    .from(manufacturers)
    .where(eq(manufacturers.name, PRESS_NAME));
  if (!press) throw new Error(`press not found: ${PRESS_NAME}`);
  const pressId = press.id;

  const [defJacket] = await db
    .select()
    .from(pressJackets)
    .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.isDefault, true)));
  if (!defJacket) throw new Error(`no default jacket for press ${pressId}`);
  const jacketId = defJacket.id;
  console.log(`press ${pressId} · default jacket "${defJacket.name}" (${jacketId})`);

  // Load every tier and its default-jacket ladder.
  const tiers = await db
    .select()
    .from(pressColorTiers)
    .where(eq(pressColorTiers.pressId, pressId))
    .orderBy(asc(pressColorTiers.format), asc(pressColorTiers.position));
  const ladders = await db
    .select()
    .from(pressTierJacketLadders)
    .where(eq(pressTierJacketLadders.jacketId, jacketId));
  const ladderByTier = new Map<string, Rung[]>();
  for (const l of ladders) ladderByTier.set(l.tierId, (l.priceLadder ?? []) as Rung[]);

  // ── Backup ────────────────────────────────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("scripts/backups", { recursive: true });
  const backupPath = `scripts/backups/memphis-pricing-${ENV}-${ts}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        pressId,
        jacketId,
        jacketName: defJacket.name,
        tiers: tiers.map((t) => ({
          id: t.id,
          format: t.format,
          name: t.name,
          priceLadder: ladderByTier.get(t.id) ?? [],
        })),
      },
      null,
      2,
    ),
  );
  console.log(`backup → ${backupPath}`);

  // Build per-format Color baseline { qty -> confirmed unitCents }.
  const baselineByFormat = new Map<string, Map<number, number>>();
  for (const t of tiers) {
    if (t.name !== BASELINE_TIER) continue;
    const map = new Map<number, number>();
    for (const r of ladderByTier.get(t.id) ?? []) {
      if (r.confirmed === true && r.unitCents > 0) map.set(r.qty, r.unitCents);
    }
    baselineByFormat.set(t.format, map);
  }

  const syncedAt = new Date().toISOString();
  const plan: { format: string; tier: string; ladder: Rung[] }[] = [];
  const skipped: { format: string; tier: string; why: string }[] = [];

  for (const t of tiers) {
    if (t.name === BASELINE_TIER) {
      skipped.push({ format: t.format, tier: t.name, why: "baseline tier" });
      continue;
    }
    const cur = ladderByTier.get(t.id);
    if (hasConfirmed(cur)) {
      skipped.push({ format: t.format, tier: t.name, why: "already has confirmed rung(s)" });
      continue;
    }
    const baseline = baselineByFormat.get(t.format);
    if (!baseline || TAIL_QTYS.some((q) => !baseline.has(q))) {
      skipped.push({
        format: t.format,
        tier: t.name,
        why: `no complete Color baseline for ${t.format}`,
      });
      continue;
    }
    const mult = MULT[t.name] ?? 1.0;
    const tail = new Map<number, number>();
    for (const q of TAIL_QTYS) tail.set(q, Math.round(baseline.get(q)! * mult));
    const v300 = tail.get(300)!;
    const unitFor = (qty: number): number => {
      if (qty === 100) return Math.round(v300 * F100);
      if (qty === 200) return Math.round(v300 * F200);
      return tail.get(qty)!;
    };
    const ladder: Rung[] = QTYS.map((qty) => ({
      qty,
      unitCents: unitFor(qty),
      confirmed: true,
      estimated: true,
      source: SOURCE,
      syncedAt,
    }));
    plan.push({ format: t.format, tier: t.name, ladder });
  }

  // ── Report ──────────────────────────────────────────────────────────
  console.log(`\nWILL FILL ${plan.length} tier ladder(s):`);
  for (const p of plan) {
    const pretty = p.ladder.map((r) => `${r.qty}:$${(r.unitCents / 100).toFixed(2)}`).join("  ");
    console.log(`  ${p.format.padEnd(10)} ${p.tier.padEnd(16)} ${pretty}`);
  }
  console.log(`\nSKIPPED ${skipped.length}:`);
  for (const s of skipped) console.log(`  ${s.format.padEnd(10)} ${s.tier.padEnd(16)} — ${s.why}`);

  if (DRY) {
    console.log("\n--dry: no writes.");
    return;
  }
  if (plan.length === 0) {
    console.log("\nNothing to fill (all empty tiers already priced or no baseline).");
    return;
  }

  // ── Write (one transaction) ──────────────────────────────────────────
  const tierIdByKey = new Map<string, string>();
  for (const t of tiers) tierIdByKey.set(`${t.format}\u0000${t.name}`, t.id);
  await db.transaction(async (tx) => {
    for (const p of plan) {
      const tierId = tierIdByKey.get(`${p.format}\u0000${p.tier}`)!;
      await tx
        .update(pressTierJacketLadders)
        .set({ priceLadder: p.ladder })
        .where(
          and(
            eq(pressTierJacketLadders.tierId, tierId),
            eq(pressTierJacketLadders.jacketId, jacketId),
          ),
        );
    }
  });
  console.log(`\n[${ENV}] wrote ${plan.length} ladder(s).`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
