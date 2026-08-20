/**
 * Task #3215 — audit stored swatch photo resolution across all presses.
 *
 * For every non-archived press_colors row (and tier previewImageUrl) that
 * carries an /objects/uploads/... image, download the object and measure its
 * pixel dimensions. Flag anything whose shorter side is below FLOOR px —
 * the big disc preview renders at 340 CSS px, so a retina display needs
 * ~680 px of source to avoid visible upscaling.
 *
 * Read-only: prints a report, writes nothing.
 *   npx tsx scripts/audit-swatch-resolution.ts
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";

const FLOOR = 680; // px shorter-side floor for a crisp 340px retina disc

function bucketFile(publicUrl: string) {
  const id = publicUrl.replace(/^\/objects\/uploads\//, "");
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  return objectStorageClient.bucket(bucketName).file(`${prefix ? `${prefix}/` : ""}uploads/${id}`);
}

async function measure(publicUrl: string): Promise<{ w: number; h: number } | { error: string }> {
  try {
    const [buf] = await bucketFile(publicUrl).download();
    const { loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(buf);
    return { w: img.width, h: img.height };
  } catch (e: any) {
    return { error: e?.message?.slice(0, 80) ?? "download failed" };
  }
}

async function main() {
  const rows = (
    await db.execute(sql`
      SELECT m.name AS press, t.format, t.name AS tier, c.name AS color,
             c.swatch_image_url AS url, 'color' AS kind
      FROM press_colors c
      JOIN press_color_tiers t ON t.id = c.tier_id
      JOIN manufacturers m ON m.id = t.press_id
      WHERE c.archived_at IS NULL AND t.archived_at IS NULL
        AND c.swatch_image_url LIKE '/objects/uploads/%'
      UNION ALL
      SELECT m.name, t.format, t.name, '(type preview)', t.preview_image_url, 'tier'
      FROM press_color_tiers t
      JOIN manufacturers m ON m.id = t.press_id
      WHERE t.archived_at IS NULL AND t.preview_image_url LIKE '/objects/uploads/%'
      ORDER BY 1, 2, 3, 4
    `)
  ).rows as any[];
  console.log(`Measuring ${rows.length} images…`);

  const flagged: string[] = [];
  const byPress = new Map<string, { n: number; low: number; min: number; max: number }>();
  const CONC = 8;
  let i = 0;
  const results: string[] = [];
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (i < rows.length) {
        const r = rows[i++];
        const m = await measure(r.url);
        const s = byPress.get(r.press) ?? { n: 0, low: 0, min: Infinity, max: 0 };
        s.n++;
        if ("error" in m) {
          flagged.push(`${r.press} · ${r.format} · ${r.tier} · ${r.color} — ERROR ${m.error} (${r.url})`);
        } else {
          const short = Math.min(m.w, m.h);
          s.min = Math.min(s.min, short);
          s.max = Math.max(s.max, short);
          if (short < FLOOR) {
            s.low++;
            flagged.push(`${r.press} · ${r.format} · ${r.tier} · ${r.color} — ${m.w}x${m.h} (${r.url})`);
          }
        }
        byPress.set(r.press, s);
      }
    }),
  );

  console.log("\n── Per press ──");
  for (const [press, s] of byPress) {
    console.log(`${press}: ${s.n} images, ${s.low} below ${FLOOR}px, shortest ${s.min}px, largest ${s.max}px`);
  }
  console.log(`\n── Below ${FLOOR}px shorter side (or unreadable): ${flagged.length} ──`);
  for (const f of flagged.sort()) console.log("  " + f);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
