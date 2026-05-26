---
name: Soft-delete trash architecture
description: 14 admin tables soft-delete via `deleted_at` + cascade; super-admin /admin/trash restores/purges; 30-day sweeper hard-deletes.
---

Soft-delete is implemented as a `deleted_at` flip on the row, not a separate audit table. The set of soft-deletable tables and the cascade graph live in `server/softDelete.ts` (`softDeleteEntity`, `restoreEntity`, `purgeEntity`, `sweepExpiredTrash`, `TRASH_ENTITY_TYPES`).

**Rule:** every read against a soft-deletable table must filter `WHERE deleted_at IS NULL`. When adding a new admin list/detail query against any of the 14 tables, add the `isNull(deletedAt)` predicate or the row will reappear after a "delete". Joins through these tables need the predicate on each soft-deletable side.

**Why:** the recycle bin and the sweeper assume the rest of the app cannot see soft-deleted rows. A missed filter on a read leaks a deleted album/song/person back into player results, search, and partner panels until the sweeper purges it 30 days later. The classic offender is "lookup by natural key" methods (`getXByDomain`, `getXBySlug`, `getXByName`) — they're written before soft-delete exists and never get audited; always grep for `getX...By` when adding a new soft-deletable table.

**How to apply:**
- New table joining the 14? Add `deleted_at IS NULL` on its side too.
- New table that *should* be soft-deletable? Spread `softDeleteCols` in `shared/schema.ts`, append to `TRASH_ENTITY_TYPES` + the spec map in `server/softDelete.ts` (label fields + parent cascade), extend the migration in `scripts/post-merge.sh`, and wire its `deleteX` storage method through `softDeleteEntity(kind, id, userId?)`.
- Object Storage blobs are intentionally **not** copied. A purge does not delete the underlying file; a restore reuses the existing URL. Don't add blob deletion to the purge path without redesigning — capabilities.md never promised file deletion on delete.
- Cascade children record `deleted_via_parent_id = <parent.id>`; restore lifts only the children that match. Don't reuse `deleted_via_parent_id` for anything else — it's how restore tells "deleted with its album" apart from "manually deleted earlier".
- Restore must handle unique-violation collisions. If a row with the same natural key (name/slug/domain) was created while the original was in trash, the UPDATE that un-flips `deleted_at` will raise Postgres 23505. Catch it, roll back the transaction, and throw `RestoreConflictError` so the route can return 409 with an actionable "rename the conflicting row first" message instead of a generic 500.
