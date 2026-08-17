/**
 * Task #3154 — one-time (marker-guarded) sweep: mirror legacy EXTERNAL
 * press_template_specs.template_file_url links into OUR object storage.
 *
 * Background: before the mirror-at-save rule (Task #3090 era,
 * server/templateSpecs.ts mirrorExternalTemplatePdf), a pasted Dropbox/https
 * template link was persisted as-is. When the external host stops serving a
 * PDF, the download proxy used to 502 — breaking the press's Templates page
 * AND paging ops via the /api 5xx alert on every open.
 *
 * This sweep:
 *   • finds every spec row whose template_file_url is an external URL,
 *   • fetches it through the SAME SSRF-guarded mirror path new attaches use,
 *   • on success updates the row to the stored `/objects/uploads/<id>` path,
 *   • on failure leaves the row untouched — the Templates UI now presents
 *     any remaining external URL as "Needs re-upload".
 *
 * Idempotent: mirrored rows become /objects paths and drop out of the
 * predicate; the post-merge marker (task_3154_mirror_external_templates)
 * keeps dead links from being re-fetched on every merge. Dev has zero
 * external rows today, so this is a no-op there.
 *
 * Run:  DATABASE_URL=... npx tsx scripts/mirror-external-template-files.ts
 */
import { Pool } from "pg";
import { mirrorExternalTemplatePdf } from "../server/templateSpecs";

const MARKER = "task_3154_mirror_external_templates";

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
      console.log(`[template-mirror-sweep] marker ${MARKER} present — nothing to do`);
      return;
    }

    const { rows } = await pool.query<{ id: string; press_id: string; template_file_url: string }>(
      `SELECT id, press_id, template_file_url
         FROM press_template_specs
        WHERE template_file_url IS NOT NULL
          AND template_file_url NOT LIKE '/%'`,
    );
    console.log(`[template-mirror-sweep] ${rows.length} external template link(s) to process`);

    let mirrored = 0;
    let dead = 0;
    for (const row of rows) {
      const mirroredResult = await mirrorExternalTemplatePdf(row.template_file_url);
      if (mirroredResult.ok) {
        // Guard against a concurrent replace: only update if the row still
        // carries the exact external URL we mirrored.
        const upd = await pool.query(
          `UPDATE press_template_specs
              SET template_file_url = $1
            WHERE id = $2 AND template_file_url = $3`,
          [mirroredResult.objectPath, row.id, row.template_file_url],
        );
        mirrored++;
        console.log(
          `[template-mirror-sweep] mirrored spec ${row.id} (press ${row.press_id}) → ${mirroredResult.objectPath}${upd.rowCount ? "" : " (row changed meanwhile — object kept, row untouched)"}`,
        );
      } else {
        dead++;
        console.log(
          `[template-mirror-sweep] spec ${row.id} (press ${row.press_id}) still dead — left for re-upload: ${mirroredResult.error} [${row.template_file_url}]`,
        );
      }
    }

    await pool.query(
      `INSERT INTO one_shot_markers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [MARKER],
    );
    console.log(
      `[template-mirror-sweep] done — ${mirrored} mirrored, ${dead} left flagged for re-upload; marker ${MARKER} stamped`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[template-mirror-sweep] FATAL:", e?.message ?? e);
  process.exit(1);
});
