/**
 * Task #2842 — Phase 1b: one-time cleanup of leftover GoodTunes ScriptTags.
 *
 * The order-status ScriptTag was replaced by the Checkout UI Extension
 * (extensions/goodtunes-redemption). Install-time ScriptTag registration was
 * already removed from server/shopify.ts; this removes the ScriptTags that
 * legacy installs left behind on currently-installed stores.
 *
 * All Shopify I/O goes through cleanupGoodTunesScriptTags() in
 * server/shopify.ts (shopifyFetch), because store tokens are encrypted at
 * rest AND rotate (expiring offline tokens) — a raw access_token read from
 * the DB is ciphertext and always 401s.
 *
 * Best-effort per store: 404 = no ScriptTag surface (skip); 401/403 =
 * NEEDS-MANUAL (reconnect required, or remove tags from the store admin).
 * Exit code is 0 only on a clean sweep, and the post_merge_data_backfills
 * marker is stamped only then, so failures re-check on the next merge.
 *
 * IDEMPOTENT: re-running finds zero GoodTunes tags and deletes nothing.
 *
 * Dev:   npx tsx scripts/cleanup-script-tags.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/cleanup-script-tags.ts
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { cleanupGoodTunesScriptTags } from "../server/shopify";

const MARKER = "script_tag_cleanup_v1";

async function main(): Promise<void> {
  // Marker guard: stamped only after a clean sweep on this DB, so a partial
  // failure re-checks on the next merge. Pre-create the marker table — this
  // script can run before the post-merge block that normally creates it.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);
  const done = await db.execute(sql`
    SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}
  `);
  if (done.rows.length > 0) {
    console.log(`[script-tag-cleanup] marker ${MARKER} already stamped — nothing to do`);
    return;
  }

  const { deleted, failures } = await cleanupGoodTunesScriptTags();
  console.log(`[script-tag-cleanup] deleted ${deleted} GoodTunes tag(s)`);
  for (const f of failures) console.log(`[script-tag-cleanup] NEEDS-MANUAL/FAIL ${f}`);

  if (failures.length > 0) {
    console.log(`[script-tag-cleanup] ${failures.length} failure(s) — marker NOT stamped, re-checks next merge`);
    process.exitCode = 1;
  } else {
    await db.execute(sql`
      INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER})
      ON CONFLICT (name) DO NOTHING
    `);
    console.log(`[script-tag-cleanup] clean sweep — marker stamped`);
  }
}

main()
  .catch((e) => {
    console.error(`[script-tag-cleanup] fatal: ${e?.message ?? e}`);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
