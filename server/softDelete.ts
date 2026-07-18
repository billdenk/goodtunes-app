// Task #475 — Soft-delete Trash for admin entities.
//
// Every admin Delete now flips `deleted_at` / `deleted_by_user_id` on
// the row instead of issuing a hard DELETE; the row disappears from
// list/detail reads and surfaces on /admin/trash (super-admin only)
// for 30 days. From there the admin can Restore (clears the trio of
// columns; for parents, also re-clears the children that cascaded with
// it) or Purge (real DELETE; DB-level ON DELETE CASCADE handles join
// rows). A daily sweeper hard-deletes any row older than 30 days.
//
// Object Storage blobs (artwork, photos, audio masters) are NOT copied
// or moved when a row is soft-deleted — the file stays where it is and
// is only freed when the row is purged or sweeper-collected (handled
// by the existing on-row-delete cleanups in routes.ts; out of scope
// here).
import { pool, safeConnect } from "./db";

export type TrashEntityType =
  | "album"
  | "song"
  | "album_video"
  | "album_photo"
  | "campaign_gallery_item"
  | "album_credit"
  | "person"
  | "band_member"
  | "instrument"
  | "label"
  | "manager"
  | "vendor"
  | "manufacturer"
  | "fulfillment_partner"
  | "track_writer"
  | "track_performer";

export const TRASH_ENTITY_TYPES: TrashEntityType[] = [
  "album",
  "song",
  "album_video",
  "album_photo",
  "campaign_gallery_item",
  "album_credit",
  "person",
  "band_member",
  "instrument",
  "label",
  "manager",
  "vendor",
  "manufacturer",
  "fulfillment_partner",
  "track_writer",
  "track_performer",
];

// Maps entity kind → physical table name. The kind is what the routes
// and the trash page speak (`album`, `vendor`, …) so URLs and JSON
// stay typed; the table name is only used inside this module's raw
// SQL so we never hand-spell it on a route.
const TABLE_NAMES: Record<TrashEntityType, string> = {
  album: "albums",
  song: "songs",
  album_video: "album_videos",
  album_photo: "album_photos",
  campaign_gallery_item: "campaign_gallery_items",
  album_credit: "album_credits",
  person: "people",
  band_member: "band_members",
  instrument: "instruments",
  label: "labels",
  manager: "managers",
  vendor: "vendors",
  manufacturer: "manufacturers",
  fulfillment_partner: "fulfillment_partners",
  track_writer: "track_writers",
  track_performer: "track_performers",
};

// Human-readable label column for the trash list — what shows up next
// to the entity type so the operator can recognise a row before they
// click Restore. Falls back to id at render time when the chosen
// column is null.
const LABEL_COL: Record<TrashEntityType, string> = {
  album: "title",
  song: "title",
  album_video: "title",
  album_photo: "caption",
  campaign_gallery_item: "caption",
  album_credit: "name",
  person: "name",
  band_member: "id",
  instrument: "name",
  label: "name",
  manager: "name",
  vendor: "name",
  manufacturer: "name",
  fulfillment_partner: "name",
  track_writer: "name",
  track_performer: "name",
};

// Soft-cascade graph. When `kind` is soft-deleted, every row in
// `child.table` whose `child.fk = parentId` is also soft-deleted and
// stamped with `deleted_via_parent_id = parentId` so Restore can
// undo the same cascade as one atomic step and so the trash list can
// hide rows that aren't an independent deletion.
//
// Join tables without a soft-delete column (album_lineup,
// instrument_vendors, organization_people, playlist_songs, …) are
// left alone here and only get hard-deleted when the parent is
// eventually purged (via DB-level ON DELETE CASCADE). Person→bands
// has two FKs into the same table so it's handled inline below.
const CHILDREN: Partial<Record<TrashEntityType, { table: string; fk: string }[]>> = {
  album: [
    { table: "songs", fk: "album_id" },
    { table: "album_videos", fk: "album_id" },
    { table: "album_photos", fk: "album_id" },
    { table: "campaign_gallery_items", fk: "album_id" },
    { table: "album_credits", fk: "album_id" },
  ],
  song: [
    { table: "track_writers", fk: "song_id" },
    { table: "track_performers", fk: "song_id" },
  ],
};

// Task #2449 — renumber an album's surviving (non-deleted) tracks to a
// gap-free 1..N sequence in their current `track_number` order. This is
// the shared recompaction the song soft-delete calls so a deletion never
// leaves a hole in the tracklist, mirroring what the drag-and-drop
// reorder route already does. It runs on the caller's transaction client
// so it commits atomically with the delete, and only writes
// `track_number` (vinyl side/order fields are never touched). Ties on
// track_number fall back to a stable `id` order. Ascending order is
// preserved because ROW_NUMBER walks the same `track_number ASC` sort the
// tracklist renders by.
async function recompactTracklist(
  client: { query: (text: string, params?: unknown[]) => Promise<any> },
  albumId: string,
): Promise<void> {
  await client.query(
    `WITH ordered AS (
       SELECT id,
              ROW_NUMBER() OVER (ORDER BY track_number ASC, id ASC) AS rn
         FROM songs
        WHERE album_id = $1 AND deleted_at IS NULL
     )
     UPDATE songs s
        SET track_number = ordered.rn
       FROM ordered
      WHERE s.id = ordered.id
        AND s.track_number IS DISTINCT FROM ordered.rn`,
    [albumId],
  );
}

export async function softDeleteEntity(
  kind: TrashEntityType,
  id: string,
  userId: string | null,
): Promise<boolean> {
  const table = TABLE_NAMES[kind];
  const nowIso = new Date().toISOString();
  const client = await safeConnect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE ${table}
         SET deleted_at = $1,
             deleted_by_user_id = $2,
             deleted_via_parent_id = NULL
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id`,
      [nowIso, userId, id],
    );
    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    // Recursive cascade. We collect every soft-deletable descendant
    // (album → songs → track_writers/track_performers; person → its
    // band_members) so deleting an album also pulls song-level credits
    // into trash, not just the song row. The traversal carries the
    // ORIGINAL parent id in `deleted_via_parent_id` so a single
    // Restore on the root un-flips every descendant in one shot.
    //
    // playlist_songs has no soft-delete column — we hard-delete those
    // join rows whenever the song (or its parent album, transitively)
    // is soft-deleted so a trashed song can't keep haunting saved
    // playlists. Restoring the song does not re-add it to playlists.
    async function softCascadeFromSong(songId: string): Promise<void> {
      for (const child of CHILDREN.song ?? []) {
        await client.query(
          `UPDATE ${child.table}
              SET deleted_at = $1,
                  deleted_by_user_id = $2,
                  deleted_via_parent_id = $3
            WHERE ${child.fk} = $4 AND deleted_at IS NULL`,
          [nowIso, userId, id, songId],
        );
      }
      await client.query(`DELETE FROM playlist_songs WHERE song_id = $1`, [songId]);
    }
    if (kind === "album") {
      // First snapshot the child songs (before we flip them) so we can
      // then recurse into their per-track children.
      const songRows = await client.query(
        `SELECT id FROM songs WHERE album_id = $1 AND deleted_at IS NULL`,
        [id],
      );
      // Then flip the direct children (songs, videos, photos, credits).
      for (const child of CHILDREN.album ?? []) {
        await client.query(
          `UPDATE ${child.table}
              SET deleted_at = $1,
                  deleted_by_user_id = $2,
                  deleted_via_parent_id = $3
            WHERE ${child.fk} = $3 AND deleted_at IS NULL`,
          [nowIso, userId, id],
        );
      }
      // Recurse: every song we just trashed needs its writers/performers
      // pulled in too, and its playlist join rows hard-dropped.
      for (const row of songRows.rows) {
        await softCascadeFromSong(row.id);
      }
    } else if (kind === "song") {
      await softCascadeFromSong(id);
      // Task #2449 — recompact the album's remaining tracklist to a
      // gap-free 1..N so a delete never leaves a hole (e.g. 1,4,5,…).
      // Same renumbering the drag-and-drop reorder does, but derived from
      // the surviving rows' current `track_number` order instead of a
      // client-supplied order. Runs in the same transaction as the delete
      // and only touches `track_number` — vinyl side/order stay untouched.
      // The soft-deleted row keeps its FK, so we can still read its
      // album_id after the flip.
      const albumRow = await client.query(
        `SELECT album_id FROM songs WHERE id = $1`,
        [id],
      );
      const albumId = albumRow.rows[0]?.album_id;
      if (albumId) {
        await recompactTracklist(client, albumId);
      }
    } else if (kind === "person") {
      // band_members carries two FKs into people (bandId + memberId), so
      // we soft-cascade on either side rather than via CHILDREN above.
      await client.query(
        `UPDATE band_members
            SET deleted_at = $1,
                deleted_by_user_id = $2,
                deleted_via_parent_id = $3
          WHERE (band_id = $3 OR member_id = $3) AND deleted_at IS NULL`,
        [nowIso, userId, id],
      );
    } else {
      // Generic single-level cascade for any kind that registered
      // children in the CHILDREN map (currently none beyond album/song,
      // but keeps future additions correct without another branch).
      for (const child of CHILDREN[kind] ?? []) {
        await client.query(
          `UPDATE ${child.table}
              SET deleted_at = $1,
                  deleted_by_user_id = $2,
                  deleted_via_parent_id = $3
            WHERE ${child.fk} = $3 AND deleted_at IS NULL`,
          [nowIso, userId, id],
        );
      }
    }
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export class RestoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreConflictError";
  }
}

export async function restoreEntity(
  kind: TrashEntityType,
  id: string,
): Promise<void> {
  const table = TABLE_NAMES[kind];
  const client = await safeConnect();
  try {
    await client.query("BEGIN");
    // Root-row un-flip first, then walk every other soft-deletable
    // table for children stamped with this id. Unique-violations
    // (Postgres 23505) anywhere in the transaction — root OR child —
    // become a single RestoreConflictError; we never leave a partially-
    // restored tree behind because we ROLLBACK and bail.
    try {
      await client.query(
        `UPDATE ${table}
           SET deleted_at = NULL,
               deleted_by_user_id = NULL,
               deleted_via_parent_id = NULL
         WHERE id = $1`,
        [id],
      );
      const allTables = Object.values(TABLE_NAMES);
      for (const t of allTables) {
        if (t === table) continue;
        await client.query(
          `UPDATE ${t}
              SET deleted_at = NULL,
                  deleted_by_user_id = NULL,
                  deleted_via_parent_id = NULL
            WHERE deleted_via_parent_id = $1`,
          [id],
        );
      }
    } catch (e: any) {
      if (e?.code === "23505") {
        await client.query("ROLLBACK");
        const detail = e?.detail || e?.message || "name/slug already in use";
        throw new RestoreConflictError(
          `Can't restore: another ${kind} (or one of its children) already exists with the same key (${detail}). Rename or delete the conflicting row first.`,
        );
      }
      throw e;
    }
    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// Pre-purge child-impact preview — for the confirm dialog on /admin/trash.
// Counts soft-cascaded children + join-table rows that the physical DELETE
// will take with the parent, so the operator sees what they're about to
// permanently destroy before they click.
export interface PurgePreview {
  kind: TrashEntityType;
  id: string;
  children: { table: string; count: number }[];
  totalChildren: number;
}

export async function previewPurge(
  kind: TrashEntityType,
  id: string,
): Promise<PurgePreview> {
  const children: { table: string; count: number }[] = [];
  for (const child of CHILDREN[kind] ?? []) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${child.table} WHERE ${child.fk} = $1`,
      [id],
    );
    if (r.rows[0]?.n > 0) children.push({ table: child.table, count: r.rows[0].n });
  }
  if (kind === "person") {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM band_members WHERE band_id = $1 OR member_id = $1`,
      [id],
    );
    if (r.rows[0]?.n > 0) children.push({ table: "band_members", count: r.rows[0].n });
  }
  if (kind === "song") {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM playlist_songs WHERE song_id = $1`,
      [id],
    );
    if (r.rows[0]?.n > 0) children.push({ table: "playlist_songs", count: r.rows[0].n });
  }
  return {
    kind,
    id,
    children,
    totalChildren: children.reduce((n, c) => n + c.count, 0),
  };
}

export async function purgeEntity(
  kind: TrashEntityType,
  id: string,
): Promise<void> {
  // Hard DELETE — DB-level ON DELETE CASCADE handles join rows and
  // soft-cascaded children together so we don't have to walk the graph
  // again here. (Children that were soft-deleted as part of the parent
  // share its `deleted_via_parent_id` and disappear with the row.)
  const table = TABLE_NAMES[kind];
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

export interface TrashRow {
  type: TrashEntityType;
  id: string;
  label: string;
  deletedAt: string;
  deletedByUserId: string | null;
  deletedByUserName: string | null;
}

export async function listTrash(): Promise<TrashRow[]> {
  // Only surface root deletions — children that cascaded with a parent
  // come back the moment the parent is restored, so showing them as
  // independent Restore targets would be misleading.
  const out: TrashRow[] = [];
  for (const kind of TRASH_ENTITY_TYPES) {
    const table = TABLE_NAMES[kind];
    const labelCol = LABEL_COL[kind];
    try {
      const res = await pool.query(
        `SELECT t.id,
                t.${labelCol} AS label,
                t.deleted_at,
                t.deleted_by_user_id,
                u.display_name AS deleted_by_user_name
           FROM ${table} t
           LEFT JOIN users u ON u.id = t.deleted_by_user_id
          WHERE t.deleted_at IS NOT NULL
            AND t.deleted_via_parent_id IS NULL
          ORDER BY t.deleted_at DESC`,
      );
      for (const r of res.rows) {
        out.push({
          type: kind,
          id: r.id,
          label: r.label ?? `(${kind} ${String(r.id).slice(0, 8)})`,
          deletedAt: r.deleted_at,
          deletedByUserId: r.deleted_by_user_id,
          deletedByUserName: r.deleted_by_user_name,
        });
      }
    } catch (e: any) {
      // Missing column on a freshly-pulled DB (post-merge.sh hasn't
      // run yet) shouldn't 500 the whole trash page — skip the table.
      if (!/column .* does not exist/i.test(String(e?.message ?? e))) throw e;
    }
  }
  out.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  return out;
}

export interface SweepResult {
  table: string;
  purged: number;
}

export async function sweepExpiredTrash(
  olderThanDays = 30,
): Promise<SweepResult[]> {
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const results: SweepResult[] = [];
  // Purge parents first so DB cascade handles the bulk of children; the
  // second pass catches orphan child rows whose parent was restored
  // but they themselves are still past cutoff.
  const tables = Object.values(TABLE_NAMES);
  for (const table of tables) {
    try {
      const res = await pool.query(
        `DELETE FROM ${table}
          WHERE deleted_at IS NOT NULL
            AND deleted_at < $1
            AND deleted_via_parent_id IS NULL`,
        [cutoff],
      );
      if (res.rowCount && res.rowCount > 0)
        results.push({ table, purged: res.rowCount });
    } catch (e: any) {
      if (!/column .* does not exist/i.test(String(e?.message ?? e))) throw e;
    }
  }
  for (const table of tables) {
    try {
      const res = await pool.query(
        `DELETE FROM ${table}
          WHERE deleted_at IS NOT NULL
            AND deleted_at < $1`,
        [cutoff],
      );
      if (res.rowCount && res.rowCount > 0)
        results.push({ table: `${table} (orphan children)`, purged: res.rowCount });
    } catch (e: any) {
      if (!/column .* does not exist/i.test(String(e?.message ?? e))) throw e;
    }
  }
  return results;
}
