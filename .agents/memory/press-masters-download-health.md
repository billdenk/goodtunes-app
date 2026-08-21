---
name: Press masters download + masters health
description: Source preference (original over served), failure classes, and the shared classification module for press master downloads.
---

**Rule:** Press/operator master downloads always prefer `songs.audioSourceUrl` (the artist's original upload, e.g. 24-bit WAV) over `audioUrl` (playback copy, often pipeline-made FLAC); extension/content-type follow the file actually streamed. Fans never touch these routes.

**Why:** Plants cut vinyl from these bytes — serving the playback transcode instead of the original silently downgrades quality (the Hope album shipped FLACs while WAV originals sat unused).

**Auth mode (Aug 2026):** the download + health routes are `requireAdmin` (session-OR-bearer) — they were `requireAdminBearer` (bearer-only) and 401'd every session-cookie operator login ("Couldn't download …" on the whole Physical tab). Reads never need the bearer-only CSRF guard. The scope gate is `requireOperatorOrAlbumPress` (operator + album's press + album's own artist/label partners via `findAlbumScopeMembership`). Digital-tab per-track downloads also go through the authed route via `downloadMasterViaApi` in AdminAlbum.tsx — never a bare `/objects/` anchor anywhere.

**How to apply:** All classification lives in `server/mastersHealth.ts` (`classifySongMaster`: ok_original / ok_served / no_master / external / missing_object). Three surfaces share it and must stay in lockstep: the download route (reasoned 404/422 codes, `X-Master-Source` header), the per-album pre-flight `GET /api/admin/albums/:id/masters/health` (PressPanel flags rows before click), and the 6-hourly background sweep (`startMastersHealthSweep`, alerts ops via `alertOps` only on NEW severe breakage — external/missing_object, not no_master). Client mirrors the preference in `preferredMasterUrl` inside PressPanel.tsx for the expected filename extension. Catalog audit script: `scripts/audit-masters.ts` (AUDIT_DB_URL selects env). Aug 2026 audit: prod had 0 missing storage objects; ~196 legacy tracks genuinely have no master (fans play via Mux) — that's normal, dashboard-only. The 4 Dropbox externals repair via the existing `scripts/rehost-dropbox-masters-prod.ts` (marker `task_3197_rehost_dropbox_masters` in post-merge.sh).
