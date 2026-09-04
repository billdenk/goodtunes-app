/**
 * Align the four MRP metalwork service labels with the authoritative Tier3-2
 * workbook. Numeric prices are unchanged; this is a source-owned label update.
 *
 * Existing operator rows fail closed: only exact mrp-tier3-2025 rows with the
 * expected category, amount, unit basis, and active state may be renamed.
 *
 * Dry run:
 *   npx tsx scripts/update-mrp-tier3-2-dmm-labels.ts --dry
 * Apply:
 *   npx tsx scripts/update-mrp-tier3-2-dmm-labels.ts
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { manufacturers, pressServiceItems } from "../shared/schema";

const DRY = process.argv.includes("--dry");
const MARKER = "mrp_tier3_2_dmm_labels_v1";
const SOURCE = "mrp-tier3-2025";

export const MRP_DMM_LABEL_RENAMES = [
  {
    oldLabel: '12"/10" Master Cutting',
    newLabel: '12"/10" DMM Cutting',
    amountCents: 40000,
  },
  {
    oldLabel: '12"/10" Master Plating',
    newLabel: '12"/10" DMM Plating',
    amountCents: 30000,
  },
  {
    oldLabel: '7" Master Cutting',
    newLabel: '7" DMM Cutting',
    amountCents: 29000,
  },
  {
    oldLabel: '7" Master Plating',
    newLabel: '7" DMM Plating',
    amountCents: 16000,
  },
] as const;

type ServiceRow = typeof pressServiceItems.$inferSelect;

function assertSourceOwned(row: ServiceRow, expectedLabel: string, amountCents: number): void {
  if (
    row.label !== expectedLabel ||
    row.category !== "metalwork" ||
    row.amountCents !== amountCents ||
    row.unitBasis !== "per_side" ||
    row.source !== SOURCE ||
    row.archivedAt != null
  ) {
    throw new Error(`MRP service '${expectedLabel}' differs from the Tier 3 source-owned shape; refusing to overwrite`);
  }
}

async function main() {
  try {
    const [press] = await db
      .select()
      .from(manufacturers)
      .where(
        and(
          eq(manufacturers.name, "Memphis Record Pressing"),
          eq(manufacturers.domain, "memphisrecordpressing.com"),
        ),
      )
      .limit(1);
    if (!press) throw new Error("Canonical Memphis Record Pressing manufacturer not found");

    const apply = async (tx: typeof db) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${MARKER}, 0))`);
      const [marker] = (
        await tx.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`)
      ).rows;
      if (marker) {
        console.log(`Marker '${MARKER}' already set — nothing to do.`);
        return;
      }

      const candidateLabels = MRP_DMM_LABEL_RENAMES.flatMap(({ oldLabel, newLabel }) => [oldLabel, newLabel]);
      const candidates = await tx
        .select({ id: pressServiceItems.id })
        .from(pressServiceItems)
        .where(
          and(
            eq(pressServiceItems.pressId, press.id),
            inArray(pressServiceItems.label, candidateLabels),
            isNull(pressServiceItems.archivedAt),
          ),
        );
      if (candidates.length === 0) {
        console.log("MRP Tier 3 service rows are not seeded yet — deferring DMM label marker.");
        return;
      }

      for (const rename of MRP_DMM_LABEL_RENAMES) {
        const [oldRow] = await tx
          .select()
          .from(pressServiceItems)
          .where(
            and(
              eq(pressServiceItems.pressId, press.id),
              eq(pressServiceItems.label, rename.oldLabel),
              isNull(pressServiceItems.archivedAt),
            ),
          )
          .limit(1);
        const [newRow] = await tx
          .select()
          .from(pressServiceItems)
          .where(
            and(
              eq(pressServiceItems.pressId, press.id),
              eq(pressServiceItems.label, rename.newLabel),
              isNull(pressServiceItems.archivedAt),
            ),
          )
          .limit(1);

        if (oldRow && newRow) {
          throw new Error(`Both old and new MRP service labels exist for '${rename.newLabel}'; refusing to duplicate`);
        }
        if (newRow) {
          assertSourceOwned(newRow, rename.newLabel, rename.amountCents);
          console.log(`already aligned: ${rename.newLabel}`);
          continue;
        }
        if (!oldRow) {
          throw new Error(`Expected source-owned MRP service '${rename.oldLabel}' was not found`);
        }
        assertSourceOwned(oldRow, rename.oldLabel, rename.amountCents);
        console.log(`${DRY ? "[dry] " : ""}${rename.oldLabel} -> ${rename.newLabel}`);
        if (!DRY) {
          await tx
            .update(pressServiceItems)
            .set({ label: rename.newLabel, updatedAt: new Date() })
            .where(eq(pressServiceItems.id, oldRow.id));
        }
      }

      if (!DRY) {
        await tx.execute(
          sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
        );
        console.log(`marker '${MARKER}' set.`);
      }
    };

    if (DRY) {
      await apply(db);
    } else {
      await db.transaction(async (tx) => apply(tx as typeof db));
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && /update-mrp-tier3-2-dmm-labels/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}