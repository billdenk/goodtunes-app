/**
 * Task #434 — One-shot CLI version of the legacy image audit.
 *
 * Prints the same grouped report the /admin/legacy-image-audit page shows:
 * every row carrying a `legacy_gogoods_id` whose image URL is NOT an
 * Object Storage path (`/objects/uploads/...`). Reporting only — never
 * moves or rewrites anything.
 *
 *   npx tsx scripts/audit-legacy-images.ts
 *
 * Against prod:
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/audit-legacy-images.ts
 */
import { buildLegacyImageAuditReport, renderLegacyImageAuditCsv } from "../server/legacyImageAudit";

async function main() {
  const wantCsv = process.argv.includes("--csv");
  const report = await buildLegacyImageAuditReport();

  if (wantCsv) {
    process.stdout.write(renderLegacyImageAuditCsv(report));
    return;
  }

  console.log(`Legacy image audit — ${report.generatedAt}`);
  console.log(`${report.total} image(s) still off-platform.\n`);

  const sections: Array<["person" | "album" | "bonus_video", string]> = [
    ["person", "People"],
    ["album", "Albums"],
    ["bonus_video", "Bonus videos"],
  ];

  for (const [key, label] of sections) {
    const rows = report.byEntityType[key];
    if (rows.length === 0) continue;
    console.log(`── ${label} (${rows.length}) ──`);
    for (const r of rows) {
      console.log(`  [${r.host}] ${r.displayName}  (${r.field})`);
      console.log(`      ${r.currentUrl}`);
      console.log(`      → ${r.adminHref}`);
    }
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
