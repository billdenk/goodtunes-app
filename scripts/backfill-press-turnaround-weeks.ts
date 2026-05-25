/**
 * Task #366 — One-shot backfill of `manufacturers.turnaround_weeks_min` /
 * `turnaround_weeks_max` for hand-added presses that still only carry the
 * legacy `turnaround_days` value. Mirrors the math in
 * `client/src/lib/pressTurnaround.ts#deriveWeeksFromDays` so display and
 * backfilled rows agree:
 *   weeks = max(1, round(days / 7))
 *   min   = max(1, weeks - 1)
 *   max   = weeks + 1
 *
 * Idempotent — only touches rows where both week columns are NULL and a
 * day count exists. Safe to re-run.
 *
 * Run against whatever DATABASE_URL is set:
 *   npx tsx scripts/backfill-press-turnaround-weeks.ts
 * Against prod:
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-press-turnaround-weeks.ts
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE manufacturers
       SET turnaround_weeks_min = GREATEST(1, GREATEST(1, ROUND(turnaround_days::numeric / 7))::int - 1),
           turnaround_weeks_max = GREATEST(1, ROUND(turnaround_days::numeric / 7))::int + 1
     WHERE turnaround_weeks_min IS NULL
       AND turnaround_weeks_max IS NULL
       AND turnaround_days IS NOT NULL
     RETURNING id, name, turnaround_days, turnaround_weeks_min, turnaround_weeks_max
  `);
  const rows = (result as any).rows ?? result;
  console.log(`Backfilled ${rows.length} press row(s).`);
  for (const r of rows) {
    console.log(`  ${r.name} (${r.id}): ${r.turnaround_days}d -> ${r.turnaround_weeks_min}-${r.turnaround_weeks_max} wks`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
