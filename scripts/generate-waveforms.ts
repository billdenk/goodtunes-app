/**
 * One-off: generate waveform peaks for every song on an album and store
 * them on `songs.waveform`. Used to backfill an existing catalog before
 * the master-upload flow starts auto-generating on its own.
 *
 *   npx tsx scripts/generate-waveforms.ts album-5
 */
import { db } from "../server/db";
import { songs } from "../shared/schema";
import { eq, asc } from "drizzle-orm";
import { waveformFromAudioUrl } from "../server/waveform";

async function main() {
  const albumId = process.argv[2];
  if (!albumId) {
    console.error("Usage: npx tsx scripts/generate-waveforms.ts <albumId>");
    process.exit(1);
  }
  const all = await db
    .select()
    .from(songs)
    .where(eq(songs.albumId, albumId))
    .orderBy(asc(songs.trackNumber));
  console.log(`Found ${all.length} songs on ${albumId}`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const limit = Number(process.env.LIMIT || "0") || Infinity;
  let processed = 0;
  for (const s of all) {
    if (processed >= limit) break;
    if (s.waveform && s.waveform.length > 0) {
      skipped++;
      continue;
    }
    if (!s.audioUrl) {
      console.log(`  - skip ${s.id} (${s.title}) — no master`);
      skipped++;
      continue;
    }
    processed++;
    const t0 = Date.now();
    try {
      const peaks = await waveformFromAudioUrl(s.audioUrl);
      await db
        .update(songs)
        .set({ waveform: peaks })
        .where(eq(songs.id, s.id));
      console.log(
        `  ✓ ${s.id} (${s.title}) — ${peaks.length} bars in ${(
          (Date.now() - t0) /
          1000
        ).toFixed(1)}s`,
      );
      ok++;
    } catch (err: any) {
      console.error(`  ✗ ${s.id} (${s.title}) — ${err?.message}`);
      failed++;
    }
  }
  console.log(`\nDone: ${ok} ok · ${skipped} skipped · ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
