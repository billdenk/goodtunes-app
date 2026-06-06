// Task #1460 — Auto-grant the "Love Life Tragedy (Bonus)" album to every
// owner of the Nick Carter "Love Life Tragedy (Double Album)".
//
// Bill restructured the Nick Carter bonus content: the real bonus content
// now lives on a single album (LLT_BONUS_ALBUM_ID). Only fans who PAID for
// the LLT Double Album earn that bonus — owning one of the six standalone
// "- LLT (Single Series)" singles does NOT qualify. This module is the one
// place the (qualifying release → bonus) map lives so the forward grant rule
// (the purchase paths in commerce.ts / shopify.ts / gifts.ts) and the
// one-time post-merge backfill (scripts/post-merge.sh) stay in lock-step.
import { db } from "./db";
import { userAlbums } from "@shared/schema";

export const LLT_BONUS_ALBUM_ID = "4ee3d6b9-d01f-4573-b1d6-c60951c67211";

// The qualifying release: the single Nick Carter "Love Life Tragedy (Double
// Album)". Verified against prod on 2026-06-06 — exactly one such album
// exists. (It is soft-deleted in prod, but its user_albums rows still
// entitle the owner to the bonus.) A Set keeps the call sites uniform and
// leaves room to add releases later if Bill ever expands the rule.
export const LLT_RELEASE_ALBUM_IDS: ReadonlySet<string> = new Set([
  "0da0fccf-292f-4259-82d1-f95a59eb45c0", // Love Life Tragedy (Double Album)
]);

// Accepts either the base `db` or a Drizzle transaction handle so callers
// inside a transaction (gift claim) keep the grant atomic — mirrors the
// `tx` typing convention used elsewhere in server/commerce.ts.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// When `albumId` is a qualifying LLT release, also grant the bonus album to
// the same fan. No-op for any other album. Idempotent via the user_albums
// (user_id, album_id) unique index, so it never double-grants and never
// disturbs an existing grant (or an existing real/preview row).
export async function grantLltBonusIfEligible(
  executor: Executor,
  userId: string,
  albumId: string,
): Promise<void> {
  if (!LLT_RELEASE_ALBUM_IDS.has(albumId)) return;
  await executor
    .insert(userAlbums)
    .values({ userId, albumId: LLT_BONUS_ALBUM_ID })
    .onConflictDoNothing();
}
