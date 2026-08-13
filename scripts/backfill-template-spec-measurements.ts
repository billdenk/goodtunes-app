/**
 * Task #3011 — one-time (idempotent) backfill: measure already-attached
 * press template files so existing presses' on-file templates start
 * driving the completed-artwork checks without a re-upload.
 *
 * Picks every press_template_specs row with a template_file_url and no
 * measured_at, scans the PDF (object storage directly for our
 * /objects/uploads paths; the SSRF-safe fetch for external URLs), and
 * writes ONLY the measured_* columns — operator-entered values are never
 * touched. Failures are recorded as measured_error (row keeps working on
 * baseline/computed fallback) and can be retried via the Re-scan button.
 *
 * Run:  DATABASE_URL=... npx tsx scripts/backfill-template-spec-measurements.ts
 * Idempotent: rows with measured_at set are skipped.
 */
import { Pool } from "pg";
import { ObjectStorageService } from "../server/replit_integrations/object_storage/objectStorage";
import {
  CompletedPdfScanner,
  fetchAndScanPdf,
  measuredBleedInches,
  type CompletedPdfScan,
} from "../server/validators/completedTemplate";
import { emptyMeasuredGuides } from "../shared/templateGuides";

const MAX_BYTES = 300 * 1024 * 1024;

async function scanObject(url: string): Promise<CompletedPdfScan> {
  const svc = new ObjectStorageService();
  const file = await svc.getObjectEntityFile(url);
  const scanner = new CompletedPdfScanner({ maxBytes: MAX_BYTES });
  await new Promise<void>((resolve, reject) => {
    const rs = file.createReadStream();
    rs.on("data", (chunk: Buffer) => scanner.push(chunk));
    rs.on("end", () => resolve());
    rs.on("error", (e: Error) => reject(e));
  });
  return scanner.finish();
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: dbUrl, max: 2 });
  try {
    // Task #3030 — RESCAN_BLEED_LINE=1 additionally re-scans rows that were
    // measured BEFORE the bleed-line column existed (measured cleanly but
    // carry no measured_bleed_line_inches), so already-attached certified
    // templates start supplying the line without a re-upload. Run one-time
    // (marker-guarded in post-merge.sh): templates without trim geometry
    // legitimately stay NULL and must not be re-scanned every merge.
    const rescanBleed = process.env.RESCAN_BLEED_LINE === "1";
    // Task #3097 — RESCAN_GUIDES=1 re-scans rows measured before the
    // measured_guides column existed (jsonb NULL = never guide-scanned; a
    // guide-scanned template with no guides stores the empty object, so this
    // predicate converges). One-time, marker-guarded in post-merge.sh.
    const rescanGuides = process.env.RESCAN_GUIDES === "1";
    const where = rescanBleed
      ? `template_file_url IS NOT NULL AND (measured_at IS NULL
           OR (measured_error IS NULL AND measured_bleed_line_inches IS NULL))`
      : rescanGuides
        ? `template_file_url IS NOT NULL AND (measured_at IS NULL
             OR (measured_error IS NULL AND measured_guides IS NULL))`
        : `template_file_url IS NOT NULL AND measured_at IS NULL`;
    const { rows } = await pool.query(
      `SELECT id, press_id, template_file_url
         FROM press_template_specs
        WHERE ${where}
        ORDER BY press_id, format, component_key`,
    );
    console.log(`[template-backfill] ${rows.length} unmeasured template row(s)`);
    let ok = 0;
    let failed = 0;
    for (const row of rows) {
      const url: string = row.template_file_url;
      let scan: CompletedPdfScan | null = null;
      let error: string | null = null;
      try {
        if (url.startsWith("/objects/uploads/")) {
          scan = await scanObject(url);
          if (!scan.isPdf) {
            error = "The attached file isn't a PDF — only PDF templates can be measured.";
            scan = null;
          }
        } else if (/^https?:\/\//i.test(url)) {
          const fetched = await fetchAndScanPdf(url, { maxBytes: MAX_BYTES, timeoutMs: 60_000 });
          if (fetched.ok) scan = fetched.scan;
          else error = fetched.error;
        } else {
          error = "Unsupported template location.";
        }
      } catch (e: any) {
        error = e?.message ? `Couldn't measure this template: ${e.message}` : "Couldn't measure this template.";
      }

      if (scan) {
        const first = scan.pageSizesInches[0] ?? null;
        // Task #3030 — the template's own drawn bleed line (trim → bleed
        // boundary distance per side). Null when the template carries no
        // trim geometry.
        const bleedLine = measuredBleedInches(scan);
        await pool.query(
          `UPDATE press_template_specs SET
             measured_artboard_w_inches = $2,
             measured_artboard_h_inches = $3,
             measured_pages = $4,
             measured_has_cmyk = $5,
             measured_has_rgb = $6,
             measured_has_spot = $7,
             measured_has_live_text = $8,
             measured_has_embedded_fonts = $9,
             measured_has_dieline = $10,
             measured_bleed_line_inches = $11,
             measured_guides = $12::jsonb,
             measured_at = now(),
             measured_error = NULL
           WHERE id = $1`,
          [
            row.id,
            first ? Math.round(first.w * 10000) / 10000 : null,
            first ? Math.round(first.h * 10000) / 10000 : null,
            scan.pageCount > 0 ? scan.pageCount : null,
            scan.hasCMYK,
            scan.hasRGB,
            scan.hasSpot,
            scan.hasFontDicts,
            scan.hasEmbeddedFonts,
            scan.hasDieline,
            bleedLine != null && bleedLine > 0 ? Math.round(bleedLine * 10000) / 10000 : null,
            // Task #3097 — dieline-guide geometry; "nothing found" persists
            // the empty object (NOT null) so the rescan predicate converges.
            JSON.stringify(scan.dielineGuides ?? emptyMeasuredGuides()),
          ],
        );
        ok++;
        console.log(`[template-backfill] measured ${row.id} (${url.slice(0, 80)})`);
      } else {
        await pool.query(
          `UPDATE press_template_specs
              SET measured_at = now(), measured_error = $2
            WHERE id = $1`,
          [row.id, error ?? "Couldn't measure this template."],
        );
        failed++;
        console.log(`[template-backfill] FAILED ${row.id}: ${error}`);
      }
    }
    console.log(`[template-backfill] done — ${ok} measured, ${failed} failed`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[template-backfill] fatal:", e);
  process.exit(1);
});
