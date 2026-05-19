// One-shot migration: rename `<uuid>.bin` object-storage audio uploads
// (legacy bulk-Dropbox imports made before `MIME_TO_EXT` was taught the
// audio mimes) to `<uuid>.<real-ext>` so the file extension matches the
// stored content-type. Updates `songs.audio_url` to point at the new path
// and deletes the old `.bin` object.
//
// Run once:   npx tsx scripts/repair-bin-audio-urls.ts
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { pool } from "../server/db";

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/aiff": ".aiff",
  "audio/x-aiff": ".aiff",
  "audio/ogg": ".ogg",
};

function resolveBucketAndPrefix(): { bucketName: string; prefix: string } {
  const dir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  return { bucketName, prefix };
}

async function main() {
  const { bucketName, prefix } = resolveBucketAndPrefix();
  const bucket = objectStorageClient.bucket(bucketName);

  const { rows } = await pool.query<{ id: string; title: string; audio_url: string }>(
    `SELECT id, title, audio_url FROM songs WHERE audio_url LIKE '%.bin' ORDER BY title`,
  );
  console.log(`Found ${rows.length} song(s) with .bin audio_url`);

  let fixed = 0;
  let skipped = 0;
  for (const row of rows) {
    const m = row.audio_url.match(/^\/objects\/uploads\/([^/?#]+)\.bin$/);
    if (!m) {
      console.warn(`  - skip ${row.id} (${row.title}): audio_url shape unexpected`);
      skipped++;
      continue;
    }
    const oldId = m[1];
    const oldObjectName = `${prefix ? `${prefix}/` : ""}uploads/${oldId}.bin`;
    const oldFile = bucket.file(oldObjectName);
    try {
      const [meta] = await oldFile.getMetadata();
      const contentType = String(meta.contentType || "").toLowerCase();
      const ext = MIME_TO_EXT[contentType];
      if (!ext) {
        console.warn(`  - skip ${row.id} (${row.title}): unknown content-type ${contentType}`);
        skipped++;
        continue;
      }
      const newId = `${oldId}${ext}`;
      const newObjectName = `${prefix ? `${prefix}/` : ""}uploads/${newId}`;
      const newFile = bucket.file(newObjectName);
      // Copy preserves ACL? Be safe and re-assert the metadata + cache-control.
      await oldFile.copy(newFile);
      await newFile.setMetadata({
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      });
      // Mirror the public ACL the original upload set so /objects/uploads/:id
      // (which gates on `acl.visibility === "public"`) still serves the new
      // path.
      const [oldMd] = await oldFile.getMetadata();
      const oldAclRaw = (oldMd.metadata as Record<string, string> | undefined)?.["custom:aclPolicy"];
      if (oldAclRaw) {
        await newFile.setMetadata({ metadata: { "custom:aclPolicy": oldAclRaw } });
      }
      const newUrl = `/objects/uploads/${newId}`;
      await pool.query(`UPDATE songs SET audio_url = $1 WHERE id = $2`, [newUrl, row.id]);
      await oldFile.delete().catch((e) => {
        console.warn(`    (could not delete old ${oldObjectName}: ${e?.message || e})`);
      });
      console.log(`  ✓ ${row.id} (${row.title}): .bin → ${ext}  →  ${newUrl}`);
      fixed++;
    } catch (e: any) {
      console.error(`  ✗ ${row.id} (${row.title}): ${e?.message || e}`);
      skipped++;
    }
  }

  console.log(`\nDone. Fixed ${fixed}, skipped ${skipped}.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
