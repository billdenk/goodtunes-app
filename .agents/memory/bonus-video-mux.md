---
name: Bonus-video Mux pipeline
description: How album bonus videos stream (signed adaptive HLS, mirroring audio masters) and the security/parity constraints that came out of review.
---

# Album bonus videos go through Mux, exactly like audio masters

Bonus videos (`album_videos`) ingest to Mux (signed asset, `video_quality:"basic"` = adaptive ladder) and play as signed HLS via hls.js / native-HLS. The raw upload stays in Object Storage purely as the Mux ingest source — it is the master and must never reach a fan.

**Why:** capabilities.md promises masters/originals never leave as a downloadable file. Bonus videos are part of that promise.

## The non-obvious leak the first build missed
`GET /api/albums/:id/videos` is shared by BOTH the fan player AND the admin CMS (same TanStack key `["/api/albums", albumId, "videos"]`). Returning the full row leaks `videoUrl` (a publicly-fetchable `/objects/uploads/...` master) to anonymous fans.

**How to apply:** the endpoint branches on `isAdminUser(req)` — admins get the full row (they edit `videoUrl`/`sourceUrl`), fans get a projection of ONLY `{id, albumId, title, description, posterUrl, position, muxPlaybackId, muxStatus}`. Any new fan-facing read of a master-bearing table needs the same shaping. The fan player must never reference `video.videoUrl` (Mux-only, no raw fallback — same rule as audio).

## Webhook handles songs AND videos
`/api/webhooks/mux` matches a song by `muxAssetId` first; on miss it falls through to `listAllAlbumVideos()` and updates the matched video. Songs + bonus videos share one Mux account/webhook, so forgetting the video fallback means videos only heal via the slow reconcile sweep, not the webhook.

## Lazy backfill + retry
`POST /api/album-videos/:id/playback-url` is PUBLIC (bonus videos are promotional/anon-viewable). When a row has no Mux asset yet (legacy cohort that predates the pipeline) it kicks a lazy ingest and returns 409 `preparing`. The fan tile keeps the central control tappable in `preparing`/`error` (status overlay is `pointer-events-none`) so a fan can retry without reload. Boot + interval `reconcileMuxVideos` heals dropped webhooks / un-ingested rows.

## Terminal "unavailable" vs retryable "preparing"
Some rows have NO media at all — empty `videoUrl`/`sourceUrl` AND no `muxAssetId`/`muxPlaybackId`. The lazy-ingest can never heal these (nothing to ingest), so 409 `preparing` would loop the fan tile forever. The playback-url route distinguishes them: only kick a lazy ingest + return `preparing` when there's something ingestable (a `/objects/...` source or an existing asset); a truly sourceless row returns 409 with body `{status:"unavailable"}`.

**How to apply:** the fan tile must branch on the JSON **body** `status`, not just the HTTP code — `unavailable` is TERMINAL (clear the retry timer, drop the play/retry badge, show an honest caption), while a 409/503 with no `status` stays the retryable preparing path. Admin CMS flags the same sourceless shape (and `muxStatus:"errored"`) with a warning badge so the operator notices before a fan does. The create endpoint now also rejects empty `videoUrl` (400) so this state can't be minted going forward.

**Why:** four bonus videos on *Cold Night – LLT* shipped with empty media rows and looped "Preparing…" forever; re-uploads are operator work, app must fail honestly meanwhile.

## "Stuck / won't convert" bonus videos are usually SOURCELESS, not unconverted
When a "these N bonus videos never converted to Mux" report comes in, check `video_url` FIRST. The big stuck cohort (35 rows across Nick Carter's LLT singles + Aliza Hava's "Into the Light") had **empty `video_url`, null `source_url`, no asset** — a metadata-only seed where footage was never attached. The pipeline correctly skips them (nothing to ingest); it is NOT a reconcile bug. They carry no stored Dropbox/source URL, so there is nothing to auto-reimport — recovery is an operator re-upload. Bill's call was to **remove** the empty slots: a marker-guarded soft-delete (`task_1459_sourceless_videos` in `scripts/post-merge.sh`) flips `deleted_at` on rows matching the sourceless predicate (self-limiting, can never hit a `ready` row). Don't burn time hunting a conversion bug before confirming the rows actually have a `/objects/` source.

## Analytics
`shared/analytics.ts` video events: `video_play_start` / `video_progress` (quartiles 25/50/75) / `video_complete` / `video_pause` / `video_seek`, fired from `BonusVideoPlayer` on `AlbumDetail`; each carries `albumId` + `videoId`.
