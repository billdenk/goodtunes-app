---
name: Artist Rig feature surfaces
description: Where a Rig (named gear bundle) reads/writes across fan + admin; the non-obvious credits-payload coupling.
---

# Artist Rigs (named gear bundle)

A Rig = base instrument + accessory lines (type/value), attachable to a track with a per-track tweak note. Three tables: `rigs`, `rig_accessories`, `track_rigs` (all soft-delete; instrument FK + rig FK are SET NULL; `track_rigs.rig_name` is a snapshot).

**Fan read coupling (the gotcha):** a track's rigs ride in the ALBUM credits payload at `getAlbumCredits().bySongId[songId].rigs`, NOT in `getCredits()` (which returns `TrackCredits` with no rigs). The fan credits sheet call site must pass `rigs={apiAlbumCredits?.bySongId?.[song.id]?.rigs}`. Any admin rig mutation must invalidate `["/api/albums", albumId, "credits"]` in addition to `["/api/songs", songId, "rigs"]` and `["/api/rigs"]`, or the fan sheet shows stale rigs under staleTime:Infinity.

**Accessory types:** free text stored verbatim; admin builder suggests from `accessoryTypesFor(shortCategory)` in `shared/categories.ts` (category-keyed list + generic fallback). The list is a convenience only — never a constraint.

**Admin builder** lives on the per-track Credits panel (`RigPanel` inside `client/src/components/admin/TrackCreditsPanel.tsx`), rendered at the bottom of the default-exported panel. Build-and-attach is one step (POST /api/admin/rigs then POST /api/admin/songs/:songId/rigs).

**Demo data:** Fernando Perdomo is prod-only (not in dev/task clones, like Nick's catalog). The demo rig seed in `scripts/post-merge.sh` (`seed_task_1643_demo_rig`, marker `task_1643_demo_rig`) resolves him by name, picks a track via `track_performers`, and no-ops WITHOUT stamping the marker on DBs where he's absent — so it retries cheaply on dev and only lands in prod.
