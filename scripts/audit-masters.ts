/**
 * Task #3197 — catalog-wide press-masters audit.
 *
 * Classifies every non-deleted song's master pointers (BOTH audio_url and
 * audio_source_url) as:
 *   • ok_original    — a live /objects/ original upload exists (press gets it)
 *   • ok_served      — no original stashed; the served playback file is live
 *   • no_master      — no pointer at all (nothing uploaded)
 *   • external       — only pointer(s) are external URLs never mirrored into
 *                      our bucket (repair: scripts/rehost-dropbox-masters-prod.ts)
 *   • missing_object — pointer looks right but the object is GONE from storage
 *
 * Storage probes hit the shared dev+prod bucket via ObjectStorageService,
 * memoized per distinct path. Read-only — repairs live in
 * scripts/rehost-dropbox-masters-prod.ts (external mirroring, invoked
 * marker-guarded from scripts/post-merge.sh) and manual re-uploads.
 *
 * Run:
 *   npx tsx scripts/audit-masters.ts                 # dev (DATABASE_URL)
 *   AUDIT_DB_URL="$PROD_DATABASE_URL" npx tsx scripts/audit-masters.ts   # prod
 */
import { Pool } from "pg";
import { classifySongMaster, type MasterStatus } from "../server/mastersHealth";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../server/replit_integrations/object_storage/objectStorage";

async function main() {
  const url = process.env.AUDIT_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set AUDIT_DB_URL or DATABASE_URL");
    process.exit(1);
  }
  const label = process.env.AUDIT_DB_URL ? "AUDIT_DB_URL" : "DATABASE_URL";
  const pool = new Pool({ connectionString: url, max: 2 });
  const svc = new ObjectStorageService();
  const memo = new Map<string, Promise<boolean>>();
  const probe = (p: string): Promise<boolean> => {
    let hit = memo.get(p);
    if (!hit) {
      hit = (async () => {
        try {
          await svc.getObjectEntityFile(p);
          return true;
        } catch (e) {
          if (e instanceof ObjectNotFoundError) return false;
          throw e;
        }
      })();
      memo.set(p, hit);
    }
    return hit;
  };

  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.track_number, a.id AS album_id, a.title AS album_title,
            s.audio_url, s.audio_source_url
       FROM songs s
       JOIN albums a ON a.id = s.album_id
      WHERE s.deleted_at IS NULL AND a.deleted_at IS NULL
      ORDER BY a.title, s.track_number`,
  );
  console.log(`[audit-masters] ${label}: scanning ${rows.length} songs…`);

  const counts: Record<MasterStatus, number> = {
    ok_original: 0,
    ok_served: 0,
    no_master: 0,
    external: 0,
    missing_object: 0,
  };
  const broken: any[] = [];
  for (const r of rows) {
    const { status, url: ptr } = await classifySongMaster(
      { audioUrl: r.audio_url, audioSourceUrl: r.audio_source_url },
      probe,
    );
    counts[status]++;
    if (status !== "ok_original" && status !== "ok_served") {
      broken.push({
        songId: r.id,
        track: r.track_number,
        title: r.title,
        album: r.album_title,
        albumId: r.album_id,
        status,
        pointer: ptr,
      });
    }
  }

  console.log("\n[audit-masters] summary:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(15)} ${v}`);
  if (broken.length) {
    console.log(`\n[audit-masters] ${broken.length} broken track(s):`);
    for (const b of broken) {
      console.log(
        `  ${b.status.padEnd(15)} "${b.title}" (#${b.track ?? "?"}) on "${b.album}" [song ${b.songId}]${b.pointer ? ` → ${b.pointer}` : ""}`,
      );
    }
  } else {
    console.log("\n[audit-masters] no broken masters — catalog is clean.");
  }
  await pool.end();
}

main().catch((e) => {
  console.error("[audit-masters] failed", e);
  process.exit(1);
});
