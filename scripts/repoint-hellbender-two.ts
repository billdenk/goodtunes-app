/**
 * Targeted re-point: update Black and House Mix Hellbender press_colors rows
 * to their new hand-cropped transparent disc images (already in Object Storage).
 * Run on dev then prod:
 *   npx tsx scripts/repoint-hellbender-two.ts
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/repoint-hellbender-two.ts
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

const UPDATES = [
  {
    name: "Black",
    publicUrl: "/objects/uploads/5b2ab691-2bba-412c-be88-de514d8599d3.png",
    importSourceUrl:
      "https://cdn.shopify.com/s/files/1/0593/3137/9286/files/solid-black-vinyl-record-buscrates.jpg?v=1774533860&width=600",
  },
  {
    name: "House Mix",
    publicUrl: "/objects/uploads/c2fe6626-d1f8-4312-b41f-125046a986a0.png",
    importSourceUrl:
      "https://cdn.shopify.com/s/files/1/0593/3137/9286/files/IMG_3826.jpg?v=1770692254&width=600",
  },
];

async function main() {
  const pressRes = await db.execute<{ id: string }>(
    sql`SELECT id FROM manufacturers WHERE name ILIKE '%hellbender%' LIMIT 1`,
  );
  const pressId = pressRes.rows[0]?.id;
  if (!pressId) {
    console.log("Hellbender not found — nothing to do.");
    return;
  }
  const envLabel =
    process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "prod" : "dev";
  console.log(`Target: ${envLabel} DB · press ${pressId}`);

  await db.transaction(async (tx) => {
    for (const u of UPDATES) {
      const res = await tx.execute(sql`
        UPDATE press_colors c
        SET swatch_image_url = ${u.publicUrl},
            import_source_url = ${u.importSourceUrl}
        FROM press_color_tiers t
        WHERE c.tier_id = t.id
          AND t.press_id = ${pressId}
          AND t.name NOT ILIKE '%splatter%'
          AND c.name = ${u.name}`);
      console.log(`  ${u.name}: ${res.rowCount} row(s) → ${u.publicUrl}`);
    }
  });

  const check = await db.execute<{ name: string; swatch_image_url: string | null }>(sql`
    SELECT c.name, c.swatch_image_url
    FROM press_colors c
    JOIN press_color_tiers t ON t.id = c.tier_id
    WHERE t.press_id = ${pressId}
      AND c.name IN ('Black', 'House Mix')
    ORDER BY c.name`);
  console.log("\nVerify:");
  for (const r of check.rows) console.log(`  ${r.name}: ${r.swatch_image_url}`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
