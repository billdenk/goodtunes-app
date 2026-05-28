/**
 * Task #644 — One-shot, idempotent backfill that copies an album's
 * `label_id` onto its primary artist's `people.label_id` whenever the
 * artist currently has no label. Mirrors the live `syncPrimaryArtistLabel`
 * helper in `server/routes.ts`:
 *
 *   - Only operates on live GoodTunes releases (`deleted_at IS NULL`
 *     AND `is_goodtunes_release = true`). Streaming-only rows are out
 *     of scope per docs/admin-conventions.md.
 *   - Only operates when the album row carries both a `label_id` and
 *     a `primary_artist_id`.
 *   - Only writes when the person's `label_id` is NULL.
 *   - Conflicts (person already on a *different* label) are logged and
 *     skipped — never overwritten silently. The live UI prompts the
 *     operator; this script preserves the same intent.
 *
 * Walks every qualifying album (not one per artist) so a conflict on
 * any release is surfaced. Idempotent: a second pass writes nothing
 * new because the first pass either signed the artist (now matches),
 * left them alone (already-matched), or recorded the conflict
 * (still conflicts).
 *
 * Run against whatever DATABASE_URL is set:
 *   npx tsx scripts/backfill-album-artist-labels.ts
 * Against prod:
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-album-artist-labels.ts
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

type Row = {
  album_id: string;
  album_title: string;
  album_label_id: string;
  album_label_name: string | null;
  person_id: string;
  person_name: string;
};

async function main() {
  const candidatesRes = await db.execute(sql`
    SELECT a.id          AS album_id,
           a.title       AS album_title,
           a.label_id    AS album_label_id,
           la.name       AS album_label_name,
           a.primary_artist_id AS person_id,
           p.name        AS person_name
      FROM albums a
      JOIN people p  ON p.id = a.primary_artist_id AND p.deleted_at IS NULL
      JOIN labels la ON la.id = a.label_id          AND la.deleted_at IS NULL
     WHERE a.deleted_at IS NULL
       AND a.is_goodtunes_release = true
       AND a.label_id IS NOT NULL
       AND a.primary_artist_id IS NOT NULL
     ORDER BY a.id
  `);
  const rows = ((candidatesRes as any).rows ?? candidatesRes) as Row[];

  let applied = 0;
  let alreadyMatched = 0;
  const conflicts: Array<Row & { person_label_id: string; person_label_name: string | null }> = [];

  for (const r of rows) {
    // Re-read the person inside the loop so a sign earlier in the pass
    // is visible to later rows for the same artist — keeps the second
    // album of the same artist from looking like a "conflict" against
    // the label we just stamped.
    const personRes = await db.execute(sql`
      SELECT p.label_id AS person_label_id, l.name AS person_label_name
        FROM people p
   LEFT JOIN labels l ON l.id = p.label_id
       WHERE p.id = ${r.person_id}
    `);
    const personRow = ((personRes as any).rows ?? personRes)[0] as
      | { person_label_id: string | null; person_label_name: string | null }
      | undefined;
    if (!personRow) continue;

    if (personRow.person_label_id == null) {
      await db.execute(sql`
        UPDATE people
           SET label_id = ${r.album_label_id}
         WHERE id = ${r.person_id}
           AND label_id IS NULL
      `);
      applied += 1;
      console.log(
        `  + ${r.person_name} (${r.person_id}) → ${r.album_label_name ?? r.album_label_id} (from album "${r.album_title}")`,
      );
    } else if (personRow.person_label_id === r.album_label_id) {
      alreadyMatched += 1;
    } else {
      conflicts.push({
        ...r,
        person_label_id: personRow.person_label_id,
        person_label_name: personRow.person_label_name,
      });
    }
  }

  console.log(
    `Backfill complete. signed=${applied} already-matched=${alreadyMatched} conflicts=${conflicts.length} candidates=${rows.length}`,
  );
  if (conflicts.length > 0) {
    console.log("Conflicts (artist on a different label — left untouched):");
    for (const c of conflicts) {
      console.log(
        `  ! ${c.person_name} (${c.person_id}) on ${c.person_label_name ?? c.person_label_id}; album "${c.album_title}" wanted ${c.album_label_name ?? c.album_label_id}`,
      );
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
