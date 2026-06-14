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

**Fan gear-door UX is shared mobile+desktop via one resolver lib.** The "On this track" gear doors + RigDetailSheet drill-down render on BOTH the mobile `SongCreditsSheet` (bottom sheet) and the desktop `AlbumCreditsPage` (centered card). The data plumbing that turns the raw credits payload into a fully-hydrated `RigDetailView` lives ONCE in `client/src/lib/rigViewModel.ts` (`makeResolveRigView` + `buildInstrumentsById` + `normalizePerson/normalizeInstrument` + `AlbumCreditsApiPayload`). Both surfaces feed it primitive shapes (mobile static `Album`, desktop `ApiAlbum`) so they stay in lockstep — change resolution logic in the lib, never per-surface. `RigDetailSheet` itself is dumb (renders a resolved view). Performer↔rig linkage is `rig.instrument.id === performer.instrumentId` (track_rigs has NO personId).

**Two-state availability is a deliberate decision (partial DROPPED).** The RigDetailSheet shows only "Available from {vendor}" (base instrument resolves ≥1 vendor via `instrumentsById`, seeded from enriched performers) or "Request this rig" (none → `POST /api/rigs/:rigId/request-quote`, works logged-out). **Why:** a middle "partial" state can't be computed honestly client-side — accessories aren't vendor-resolvable today, so it would over-promise or fabricate a shop list. Reviving partial needs accessory→catalog linking + a `loadRigDetail` that enriches accessories with vendor lists server-side (tracked in docs/roadmap.md). The heart/favorite control is intentionally omitted from the rig sheet (dead control = chevron-honesty violation).
