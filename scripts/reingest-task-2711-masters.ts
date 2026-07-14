/**
 * Task #2711 — re-kick Mux ingest for stuck masters on two live albums:
 *
 *   - Crashing Dream (Deluxe) 9c4273fc-43ac-4441-a013-b6f2ee0cf8ad:
 *     all 26 tracks stuck in Mux status "preparing" — the 60s reconcile
 *     sweep has been re-checking their assets forever without them ever
 *     flipping to ready, so the assets themselves are dead. Fresh assets
 *     must be created from the stored masters.
 *   - CALIFORNIALAND a5e96e28-1961-4dd4-8184-e0ebf6446143: tracks 12–13
 *     were never ingested (no playback id at all).
 *
 * For each in-scope song that has a stored master (audioUrl → /objects/…)
 * and is NOT already (muxStatus="ready" AND muxPlaybackId):
 *   1. If it has a muxAssetId, ask Mux for the asset's real status first.
 *      If Mux says "ready", just heal the DB row (webhook drop) — no new
 *      asset. Otherwise (preparing forever / errored / asset gone) fall
 *      through to a fresh create.
 *   2. Create a new Mux asset from a direct GCS signed URL (same as the
 *      manual /mux-ingest retry route) and stamp the row with the new
 *      asset id / playback id / status, clearing muxLastError + the
 *      retry ladder. The webhook / reconcile sweep flips it to ready.
 *
 * IDEMPOTENT + marker-guarded (post_merge_data_backfills marker
 * `task_2711_reingest_stuck_masters`, per DB):
 *   - Already-ready tracks are always skipped, so a re-run after the
 *     ingests complete writes nothing.
 *   - The marker prevents the "asset still preparing a minute after we
 *     created it" window on a subsequent merge from spawning duplicate
 *     assets.
 *   - Prereqs FATAL without stamping the marker: missing Mux secrets or
 *     object storage config exits non-zero so a later merge retries.
 *   - A DB where neither album exists (unexpected) writes nothing and
 *     leaves the marker unset to re-check on a later merge.
 *
 * Dev:   npx tsx scripts/reingest-task-2711-masters.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/reingest-task-2711-masters.ts
 */
import { inArray, sql } from "drizzle-orm";
import { db } from "../server/db";
import { songs } from "@shared/schema";
import {
  isMuxConfigured,
  muxMissingSecrets,
  createAssetFromUrl,
  getAsset,
} from "../server/mux";
import { ObjectStorageService } from "../server/replit_integrations/object_storage/objectStorage";

const MARKER = "task_2711_reingest_stuck_masters";

const IN_SCOPE_ALBUM_IDS = [
  "9c4273fc-43ac-4441-a013-b6f2ee0cf8ad", // Crashing Dream (Deluxe)
  "a5e96e28-1961-4dd4-8184-e0ebf6446143", // CALIFORNIALAND
];

async function main() {
  // Prereq: Mux must be configured — FATAL (exit 1, no marker) so a later
  // merge retries once secrets exist.
  if (!isMuxConfigured()) {
    console.error(
      `reingest-2711: FATAL — Mux not configured (missing: ${muxMissingSecrets().join(", ")}). Not stamping marker.`,
    );
    process.exit(1);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name       text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )`);
  const marker = await db.execute(
    sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`,
  );
  if ((marker.rows?.length ?? 0) > 0) {
    console.log(`reingest-2711: marker '${MARKER}' present — already applied, skipping`);
    return;
  }

  const rows = await db
    .select({
      id: songs.id,
      albumId: songs.albumId,
      title: songs.title,
      trackNumber: songs.trackNumber,
      audioUrl: songs.audioUrl,
      muxAssetId: songs.muxAssetId,
      muxPlaybackId: songs.muxPlaybackId,
      muxStatus: songs.muxStatus,
    })
    .from(songs)
    .where(inArray(songs.albumId, IN_SCOPE_ALBUM_IDS));

  if (rows.length === 0) {
    console.log(
      "reingest-2711: neither in-scope album exists in this DB — nothing to do, marker left unset",
    );
    return;
  }

  const candidates = rows.filter(
    (s) =>
      typeof s.audioUrl === "string" &&
      s.audioUrl.startsWith("/objects/") &&
      !(s.muxStatus === "ready" && s.muxPlaybackId),
  );
  console.log(
    `reingest-2711: ${rows.length} in-scope song(s), ${candidates.length} need attention`,
  );

  const objectStorage = new ObjectStorageService();
  let healed = 0;
  let reingested = 0;
  let inFlight = 0;
  let failed = 0;

  // Rerun safety: if a previous (partially failed) run already created a
  // fresh asset for a song, that asset will be young and "preparing". Don't
  // spawn a duplicate — leave it to the webhook / reconcile sweep. The
  // originally-stuck assets are far older than this window, so the first
  // run still replaces them.
  const IN_FLIGHT_WINDOW_MS = 24 * 60 * 60 * 1000;

  for (const s of candidates) {
    const label = `${s.title} (#${s.trackNumber ?? "?"}, ${s.id})`;
    try {
      // 1) Existing asset that actually finished? Heal instead of re-create.
      if (s.muxAssetId) {
        try {
          const asset: any = await getAsset(s.muxAssetId);
          if (asset?.status === "ready") {
            const pb = (asset.playback_ids || []).find(
              (p: any) => p.policy === "signed",
            );
            if (pb?.id) {
              await db
                .update(songs)
                .set({
                  muxStatus: "ready",
                  muxPlaybackId: pb.id,
                  muxLastError: null,
                  muxRetryCount: 0,
                  muxLastRetryAt: null,
                })
                .where(sql`${songs.id} = ${s.id}`);
              healed++;
              console.log(`reingest-2711: healed (webhook drop) — ${label}`);
              continue;
            }
          }
          if (asset?.status === "preparing") {
            const createdMs = Number(asset.created_at) * 1000;
            if (
              Number.isFinite(createdMs) &&
              Date.now() - createdMs < IN_FLIGHT_WINDOW_MS
            ) {
              inFlight++;
              console.log(
                `reingest-2711: still in-flight (asset < 24h old, likely from a prior run) — skipping recreate — ${label}`,
              );
              continue;
            }
          }
        } catch {
          // Asset gone at Mux — fall through to fresh create.
        }
      }

      // 2) Fresh create from a direct GCS signed URL (mirrors /mux-ingest).
      const publicUrl = /^https?:\/\//i.test(s.audioUrl!)
        ? s.audioUrl!
        : await objectStorage.getSignedDownloadUrl(s.audioUrl!);
      const asset = await createAssetFromUrl(publicUrl);
      await db
        .update(songs)
        .set({
          muxAssetId: asset.assetId,
          muxPlaybackId: asset.playbackId,
          muxStatus: asset.status,
          muxLastError: null,
          muxRetryCount: 0,
          muxLastRetryAt: null,
        })
        .where(sql`${songs.id} = ${s.id}`);
      reingested++;
      console.log(
        `reingest-2711: re-ingested — ${label} → asset=${asset.assetId} status=${asset.status}`,
      );
    } catch (err: any) {
      failed++;
      console.error(`reingest-2711: FAILED — ${label}: ${err?.message}`);
    }
    // Pace under Mux's create-asset rate limit (same as mux-migrate-all).
    await new Promise((r) => setTimeout(r, 250));
  }

  if (failed > 0) {
    console.error(
      `reingest-2711: ${failed} song(s) failed — NOT stamping marker so the next merge retries. ` +
        `(${healed} healed, ${reingested} re-ingested this run; those are safe to repeat — already-ready rows are skipped.)`,
    );
    process.exit(1);
  }

  await db.execute(
    sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
  );
  console.log(
    `reingest-2711: done — ${healed} healed, ${reingested} re-ingested, ${inFlight} still in-flight, marker stamped. ` +
      `Newly created assets flip to ready via the webhook / 60s reconcile sweep.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("reingest-2711: fatal", err);
    process.exit(1);
  });
