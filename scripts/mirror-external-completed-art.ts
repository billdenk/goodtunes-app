/**
 * Task #3350 — one-time (marker-guarded) sweep: mirror legacy EXTERNAL
 * completed-art links into OUR object storage.
 *
 * Background: completed-art rows checked before the mirror-at-save rule
 * (Task #3184 era) still store the raw pasted URL (e.g. an expiring
 * Dropbox link) in completed_template_checks components[].assetUrl. The
 * art-file route self-heals such a row only when someone opens the viewer
 * AND the external link is still alive — so an untouched row goes
 * permanently dark the day the external host stops serving.
 *
 * This sweep:
 *   • finds every components[] entry whose assetUrl is an external URL,
 *   • fetches it through the SAME SSRF-guarded mirror path new checks use
 *     (mirrorExternalTemplatePdf — verifies it's a real PDF),
 *   • on success rewrites JUST that component's assetUrl to the stored
 *     `/objects/uploads/<id>.pdf` path (checks/previews/overrides
 *     untouched — same bytes, same verdicts),
 *   • on failure leaves the component untouched — the viewer keeps its
 *     existing "link is dead, re-upload" behavior.
 *
 * Idempotent: mirrored components become /objects paths and drop out of
 * the predicate; the marker (task_3350_mirror_external_completed_art)
 * keeps dead links from being re-fetched on every merge.
 *
 * Run:  DATABASE_URL=... npx tsx scripts/mirror-external-completed-art.ts
 */
import { Pool } from "pg";
import { mirrorExternalTemplatePdf } from "../server/templateSpecs";
import type { CompletedTemplateComponent } from "../shared/uploadValidation";

const MARKER = "task_3350_mirror_external_completed_art";

function isExternal(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: dbUrl, max: 2 });
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS one_shot_markers (name text PRIMARY KEY, created_at timestamptz DEFAULT now())`,
    );
    const marked = await pool.query(`SELECT 1 FROM one_shot_markers WHERE name = $1`, [MARKER]);
    if (marked.rowCount) {
      console.log(`[completed-art-mirror-sweep] marker ${MARKER} present — nothing to do`);
      return;
    }

    const { rows } = await pool.query<{
      id: string;
      album_id: string;
      components: CompletedTemplateComponent[];
    }>(
      `SELECT id, album_id, components
         FROM completed_template_checks
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(components) c
          WHERE c->>'assetUrl' ~* '^https?://'
        )`,
    );
    const total = rows.reduce(
      (n, r) => n + r.components.filter((c) => isExternal(c.assetUrl)).length,
      0,
    );
    console.log(
      `[completed-art-mirror-sweep] ${total} external art link(s) across ${rows.length} row(s) to process`,
    );

    let mirrored = 0;
    let dead = 0;
    for (const row of rows) {
      for (const comp of row.components) {
        if (!isExternal(comp.assetUrl)) continue;
        const result = await mirrorExternalTemplatePdf(comp.assetUrl);
        if (result.ok) {
          // Rewrite ONLY this component's assetUrl, and only if the row
          // still carries the exact external URL we mirrored (guards
          // against a concurrent re-check replacing the file meanwhile).
          const upd = await pool.query(
            `UPDATE completed_template_checks
                SET components = (
                      SELECT jsonb_agg(
                        CASE WHEN c->>'componentId' = $2 AND c->>'assetUrl' = $3
                             THEN jsonb_set(c, '{assetUrl}', to_jsonb($4::text))
                             ELSE c END)
                      FROM jsonb_array_elements(components) c
                    ),
                    updated_at = now()
              WHERE id = $1
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(components) c
                  WHERE c->>'componentId' = $2 AND c->>'assetUrl' = $3
                )`,
            [row.id, comp.componentId, comp.assetUrl, result.objectPath],
          );
          mirrored++;
          console.log(
            `[completed-art-mirror-sweep] mirrored album ${row.album_id} slot ${comp.componentId} → ${result.objectPath}${upd.rowCount ? "" : " (row changed meanwhile — object kept, row untouched)"}`,
          );
        } else {
          dead++;
          console.log(
            `[completed-art-mirror-sweep] album ${row.album_id} slot ${comp.componentId} still dead — NEEDS RE-UPLOAD: ${result.error} [${comp.assetUrl}]`,
          );
        }
      }
    }

    await pool.query(
      `INSERT INTO one_shot_markers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [MARKER],
    );
    console.log(
      `[completed-art-mirror-sweep] done — ${mirrored} mirrored, ${dead} left flagged for re-upload; marker ${MARKER} stamped`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[completed-art-mirror-sweep] FATAL:", e?.message ?? e);
  process.exit(1);
});
