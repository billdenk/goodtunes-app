/**
 * Task #3232 — READ-ONLY cross-check: Viryl component-based pricing vs the
 * stored all-in package ladders.
 *
 * For Viryl's 7", 12" LP and 12" double LP, across the 50–1000 run-size
 * ladder and both weights (140 g main book / 180 g book), this script:
 *   1. Composes an expected all-in package price from components — the
 *      per-record ladder (TIER_CENTS), the digital-print jacket ladder
 *      (JACKET_CENTS_2026) and jacket insertion (INSERTION_CENTS_2026),
 *      exactly mirroring how the 2026 loader composed them — but ALSO
 *      cross-checks the insertion rate against the live press_service_items
 *      row ("Insertion of Sleeved Record into Jacket") so the component side
 *      is genuinely read from the components tables, not just constants.
 *   2. Diffs the composed price against every stored rung of every
 *      (tier × jacket) package ladder.
 *   3. Flags provenance per rung: rungs stamped `source:"viryl-2026-price-list"`
 *      are the sync's own composition (a match there is expected/trivial);
 *      anything else confirmed (operator-entered, or the old 2024 seed)
 *      is called out separately — those are the valuable comparisons.
 *
 * WRITES NOTHING. Only SELECTs.
 *
 * Dev:  npx tsx scripts/crosscheck-viryl-component-vs-package.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/crosscheck-viryl-component-vs-package.ts
 */

import { eq, sql } from "drizzle-orm";
import {
  manufacturers,
  pressColorTiers,
  pressJackets,
  pressTierJacketLadders,
  pressServiceItems,
} from "../shared/schema";
import {
  composeUnitCents,
  isJacketedJacketName,
  TIER_CENTS,
  JACKET_CENTS_2026,
  INSERTION_CENTS_2026,
  SOURCE as SYNC_SOURCE,
  type Rung,
} from "./load-viryl-2026-pricing";

const FORMATS = new Set(["7_inch", "12_lp", "12_double"]);

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const { db, pool } = await import("../server/db");
  try {
    const env = process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "PROD" : "DEV";
    console.log(`\n${"=".repeat(72)}`);
    console.log(`Viryl component-vs-package cross-check — DB: ${env}`);
    console.log("=".repeat(72));

    // Prod carries an empty decoy "VIRYL" (viryltech.com) shell beside the
    // real "Viryl Technologies" (viryl.ca) — pick the candidate that actually
    // has catalog tiers, never trust the first name-match.
    const candidates = await db
      .select()
      .from(manufacturers)
      .where(sql`${manufacturers.domain} ILIKE '%viryl%' OR ${manufacturers.name} ILIKE '%viryl%'`);
    if (candidates.length === 0) {
      console.log("Viryl manufacturer not found in this DB — nothing to compare.");
      return;
    }
    let press = candidates[0];
    if (candidates.length > 1) {
      let best = -1;
      for (const c of candidates) {
        const [{ n }] = (
          await db.execute<{ n: number }>(
            sql`SELECT count(*)::int AS n FROM press_color_tiers WHERE press_id = ${c.id}`,
          )
        ).rows;
        console.log(`Candidate: ${c.name} (${c.domain}) — ${n} tiers`);
        if (Number(n) > best) {
          best = Number(n);
          press = c;
        }
      }
    }
    console.log(`Press: ${press.name} (${press.domain}, ${press.id})\n`);

    // ── Component side sanity: live insertion service item vs the constant ──
    // In prod the 2026 service items were seeded onto the decoy "VIRYL"
    // (viryltech.com) row while the ladders live on "Viryl Technologies"
    // (viryl.ca) — merge service items across ALL Viryl candidates, preferring
    // the selected press's own rows.
    const svcRows = await db
      .select()
      .from(pressServiceItems)
      .where(sql`${pressServiceItems.pressId} IN (${sql.join(candidates.map((c) => sql`${c.id}`), sql`, `)})`);
    const services = [
      ...svcRows.filter((s) => s.pressId === press.id),
      ...svcRows.filter((s) => s.pressId !== press.id),
    ];
    const svcSplit = candidates.length > 1 && svcRows.some((s) => s.pressId !== press.id);
    if (svcSplit) {
      console.log(
        "NOTE: service items found on a DIFFERENT Viryl manufacturer row than the ladders " +
          "(2026 seed landed on the decoy shell) — merged for composition.",
      );
    }
    const insertion = services.find((s) =>
      /insertion of sleeved record/i.test(s.label) && !s.archivedAt,
    );
    if (!insertion) {
      console.log(
        "NOTE: no 'Insertion of Sleeved Record into Jacket' service item found — " +
          `composing with the loader constant ${usd(INSERTION_CENTS_2026)}/record.`,
      );
    } else if (insertion.amountCents !== INSERTION_CENTS_2026) {
      console.log(
        `WARNING: live insertion service item is ${usd(insertion.amountCents)} but the 2026 ` +
          `loader composed with ${usd(INSERTION_CENTS_2026)} — component tables and loader disagree.`,
      );
    } else {
      console.log(
        `Component check: insertion service item present at ${usd(insertion.amountCents)}/record (matches loader).`,
      );
    }
    console.log(
      `Component inputs: record ladder = TIER_CENTS (${Object.keys(TIER_CENTS).length} tiers), ` +
        `12" digital jacket = ${Object.entries(JACKET_CENTS_2026)
          .map(([q, c]) => `${q}+ ${usd(c)}`)
          .join(" · ")} (500/1000 unquoted — offset bulk rows garbled on the sheet).\n`,
    );

    // ── Amortized setup stack from live service items ──────────────────
    // Hand-entered "GoodTunes Packages" ladders are all-in per-unit prices
    // that visibly amortize one-time setup over the run. For those rungs we
    // also compose an all-in estimate: marginal component price + (lacquer
    // cutting + stampers + test pressings + full-colour CMYK labels + setup
    // fee × discs) / qty + the <1000-unit bulk surcharge per record.
    const svc = (re: RegExp) => services.find((s) => re.test(s.label) && !s.archivedAt)?.amountCents ?? null;
    const setup = {
      lacquer12: svc(/12"\/10" Lacquer/i),
      stampers12: svc(/12"\/10" Stampers/i),
      test1lp: svc(/12"\/10" Test Pressings — 1 LP/i),
      test2lp: svc(/12"\/10" Test Pressings — 2 LP/i),
      lacquer7: svc(/^7" Lacquer/i),
      stampers7: svc(/^7" Stampers/i),
      test7: svc(/^7" Test Pressings/i),
      setupBlack: svc(/Setup — Standard Black/i),
      setupColour: svc(/Setup — Colour/i),
      labelsCmyk: svc(/Full Colour CMYK Printed Labels — First/i),
      bulkSurcharge: svc(/Bulk Surcharge — Orders Under 1000/i),
    };
    /** Per-unit amortized setup cents, or null when the stack is incomplete. */
    function amortizedSetupCents(format: string, tierName: string, qty: number): number | null {
      const records = format === "12_double" ? 2 : 1;
      const colour = tierName !== "Black";
      const setupFee = colour ? setup.setupColour : setup.setupBlack;
      let fixed: number | null = null;
      if (format === "7_inch") {
        if (setup.lacquer7 == null || setup.stampers7 == null || setup.test7 == null || setupFee == null) return null;
        fixed = setup.lacquer7 + setup.stampers7 + setup.test7 + setupFee;
      } else {
        const test = format === "12_double" ? setup.test2lp : setup.test1lp;
        if (setup.lacquer12 == null || setup.stampers12 == null || test == null || setupFee == null || setup.labelsCmyk == null)
          return null;
        fixed = (setup.lacquer12 + setup.stampers12 + setup.labelsCmyk) * records + test + setupFee * records;
      }
      const surcharge = qty < 1000 && setup.bulkSurcharge != null ? setup.bulkSurcharge * records : 0;
      return Math.round(fixed / qty) + surcharge;
    }

    const tiers = await db.select().from(pressColorTiers).where(eq(pressColorTiers.pressId, press.id));
    const jackets = await db.select().from(pressJackets).where(eq(pressJackets.pressId, press.id));
    const jacketById = new Map(jackets.map((j) => [j.id, j]));

    type Row = {
      format: string;
      tier: string;
      jacket: string;
      weight: "140g" | "180g";
      qty: number;
      stored: number;
      composed: number | null;
      confirmed: boolean;
      source: string | undefined;
      synced: boolean;
    };
    const rows: Row[] = [];
    let skippedTiers: string[] = [];

    for (const tier of tiers) {
      if (!FORMATS.has(tier.format)) continue;
      if ((tier as any).archivedAt) continue;
      if (!TIER_CENTS[tier.name]) {
        skippedTiers.push(`${tier.format}/${tier.name}`);
        continue;
      }
      const combos = await db
        .select()
        .from(pressTierJacketLadders)
        .where(eq(pressTierJacketLadders.tierId, tier.id));
      for (const combo of combos) {
        const jacket = jacketById.get(combo.jacketId);
        if (!jacket) continue;
        const jacketed = isJacketedJacketName(jacket.name);
        const is180Jacket = /180\s*g/i.test(jacket.name);
        const books: Array<{ ladder: Rung[]; heavy: boolean; label: "140g" | "180g" }> = [
          {
            ladder: (combo.priceLadder ?? []) as Rung[],
            heavy: is180Jacket,
            label: is180Jacket ? "180g" : "140g",
          },
        ];
        if (!is180Jacket && tier.format !== "7_inch") {
          books.push({
            ladder: ((combo as any).priceLadder180 ?? []) as Rung[],
            heavy: true,
            label: "180g",
          });
        }
        for (const book of books) {
          for (const r of book.ladder) {
            if (!r || typeof r.qty !== "number") continue;
            if (!r.confirmed) continue; // TBD placeholders — nothing to compare
            const composed = composeUnitCents({
              format: tier.format,
              tierName: tier.name,
              jacketed,
              heavyweight: book.heavy,
              qty: Number(r.qty),
            });
            rows.push({
              format: tier.format,
              tier: tier.name,
              jacket: jacket.name,
              weight: book.label,
              qty: Number(r.qty),
              stored: Number(r.unitCents),
              composed,
              confirmed: true,
              source: r.source as string | undefined,
              synced: r.source === SYNC_SOURCE,
            });
          }
        }
      }
    }

    if (skippedTiers.length) {
      console.log(
        `Tiers with NO 2026 component price mapping (not comparable — per Bill, acceptable):\n  ` +
          skippedTiers.join(", ") + "\n",
      );
    }

    const syncedRows = rows.filter((r) => r.synced);
    const handRows = rows.filter((r) => !r.synced);

    const syncedMismatch = syncedRows.filter((r) => r.composed !== null && r.composed !== r.stored);
    const syncedUncomposable = syncedRows.filter((r) => r.composed === null);

    console.log(`── Synced rungs (source=${SYNC_SOURCE}) — expected to match trivially ──`);
    console.log(
      `  ${syncedRows.length} confirmed synced rungs; ` +
        `${syncedRows.length - syncedMismatch.length - syncedUncomposable.length} match, ` +
        `${syncedMismatch.length} MISMATCH, ${syncedUncomposable.length} uncomposable.`,
    );
    for (const r of syncedMismatch) {
      console.log(
        `  MISMATCH ${r.format} ${r.tier} × ${r.jacket} [${r.weight}] qty ${r.qty}: ` +
          `stored ${usd(r.stored)} vs composed ${usd(r.composed!)}`,
      );
    }
    for (const r of syncedUncomposable) {
      console.log(
        `  UNCOMPOSABLE (synced rung at a qty components can't price) ${r.format} ${r.tier} × ${r.jacket} [${r.weight}] qty ${r.qty}: stored ${usd(r.stored)}`,
      );
    }

    console.log(`\n── HAND-ENTERED / non-sync confirmed rungs — the valuable comparison ──`);
    if (handRows.length === 0) {
      console.log("  None survive in this DB: every confirmed rung on Viryl package ladders carries the 2026 sync stamp.");
    } else {
      for (const r of handRows.sort((a, b) => a.format.localeCompare(b.format) || a.tier.localeCompare(b.tier) || a.qty - b.qty)) {
        const src = r.source ?? "(no source — operator-entered)";
        if (r.composed === null) {
          console.log(
            `  ${r.format.padEnd(10)} ${r.tier.padEnd(22)} × ${r.jacket.slice(0, 40).padEnd(40)} [${r.weight}] qty ${String(r.qty).padStart(4)}: ` +
              `stored ${usd(r.stored)} — components CANNOT price this rung (no comparison possible). src=${src}`,
          );
        } else {
          const delta = r.stored - r.composed;
          const amort = amortizedSetupCents(r.format, r.tier, r.qty);
          const allIn = amort != null ? r.composed + amort : null;
          const allInNote =
            allIn != null
              ? ` | all-in (marginal+amortized setup) ${usd(allIn)} → residual ${r.stored - allIn > 0 ? "+" : ""}${usd(r.stored - allIn)}`
              : "";
          const verdict =
            delta === 0
              ? "MATCHES components"
              : `DIFFERS by ${delta > 0 ? "+" : ""}${usd(delta)} (stored ${usd(r.stored)} vs composed marginal ${usd(r.composed)}${allInNote})`;
          console.log(
            `  ${r.format.padEnd(10)} ${r.tier.padEnd(22)} × ${r.jacket.slice(0, 40).padEnd(40)} [${r.weight}] qty ${String(r.qty).padStart(4)}: ${verdict}. src=${src}`,
          );
        }
      }
    }

    // ── Verdict ──
    console.log(`\n── VERDICT (${env}) ──`);
    const handMismatch = handRows.filter((r) => r.composed !== null && r.composed !== r.stored);
    const handUncomparable = handRows.filter((r) => r.composed === null);
    if (syncedMismatch.length === 0 && handMismatch.length === 0) {
      console.log(
        "  MATCHES. Component-composed prices reproduce every comparable stored package rung." +
          (handRows.length === 0
            ? " (Caveat: all confirmed rungs are the 2026 sync's own composition, so this match is structural, not independent evidence.)"
            : ` Including ${handRows.length - handUncomparable.length} hand-entered/legacy rungs compared independently.`),
      );
    } else {
      console.log(`  MISMATCHES FOUND: ${syncedMismatch.length} synced + ${handMismatch.length} hand-entered rungs differ (listed above).`);
    }
    if (handUncomparable.length || skippedTiers.length || syncedUncomposable.length) {
      console.log(
        `  Not comparable: ${skippedTiers.length} tiers lack 2026 component prices; ` +
          `${handUncomparable.length + syncedUncomposable.length} confirmed rungs sit at quantities/weights components can't price ` +
          `(e.g. jacketed 500/1000 — offset bulk rows garbled on the sheet; 7" 180 g doesn't exist). Per Bill: acceptable.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
