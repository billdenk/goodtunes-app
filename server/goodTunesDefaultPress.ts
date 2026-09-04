import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { manufacturers } from "@shared/schema";
import { MRP_DOMAIN } from "./pressCatalog";

type NewArtistPressFields = {
  invitedByPressId?: string | null;
  defaultPressId?: string | null;
};

export function needsGoodTunesDefaultPress(fields: NewArtistPressFields): boolean {
  return !fields.invitedByPressId && !fields.defaultPressId;
}

export async function resolveGoodTunesDefaultPressId(): Promise<string> {
  const [mrp] = await db
    .select({ id: manufacturers.id })
    .from(manufacturers)
    .where(
      and(
        eq(manufacturers.domain, MRP_DOMAIN),
        isNull(manufacturers.deletedAt),
      ),
    )
    .limit(1);
  if (!mrp) {
    throw new Error(`GoodTunes default press is unavailable (${MRP_DOMAIN})`);
  }
  return mrp.id;
}

/**
 * Creation-only policy. Callers pass the complete INSERT payload so an
 * originating press or explicit operator choice always wins atomically.
 * Never call this from reads or updates: a later operator clear is
 * authoritative and must remain clear.
 */
export async function withGoodTunesDefaultPress<T extends NewArtistPressFields>(
  values: T,
): Promise<T> {
  if (!needsGoodTunesDefaultPress(values)) return values;
  return { ...values, defaultPressId: await resolveGoodTunesDefaultPressId() };
}

/**
 * Invite-grant boundary for an existing Person becoming a GoodTunes artist.
 * The NULL guards preserve press provenance, explicit operator choices, and a
 * later operator clear because this is called only while granting the first
 * direct GoodTunes artist account/invite.
 */
export async function assignGoodTunesDefaultPressAtArtistGrant(
  personId: string,
): Promise<boolean> {
  const mrpId = await resolveGoodTunesDefaultPressId();
  const result: any = await db.execute(sql`
    UPDATE people
       SET default_press_id = ${mrpId}
     WHERE people.id = ${personId}
       AND people.deleted_at IS NULL
       AND people.default_press_id IS NULL
       AND people.invited_by_press_id IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM albums a
           JOIN album_skus sku ON sku.album_id = a.id
          WHERE a.primary_artist_id = people.id
            AND a.deleted_at IS NULL
            AND sku.press_id IS NOT NULL
       )
       AND NOT EXISTS (
         SELECT 1
           FROM albums a
           JOIN pressing_order_requests por ON por.album_id = a.id
          WHERE a.primary_artist_id = people.id
            AND a.deleted_at IS NULL
            AND por.status <> 'cancelled'
       )
  `);
  return Number(result?.rowCount ?? 0) > 0;
}

export async function backfillEligibleGoodTunesArtists(
  markerName = "goodtunes_artist_default_press_mrp",
): Promise<number> {
  const mrpId = await resolveGoodTunesDefaultPressId();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )
  `);
  const result: any = await db.execute(sql`
    WITH claimed AS (
      INSERT INTO post_merge_data_backfills (name)
      VALUES (${markerName})
      ON CONFLICT (name) DO NOTHING
      RETURNING name
    )
    UPDATE people p
       SET default_press_id = ${mrpId}
     WHERE p.deleted_at IS NULL
       AND p.default_press_id IS NULL
       AND p.invited_by_press_id IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM albums a
           JOIN album_skus sku ON sku.album_id = a.id
          WHERE a.primary_artist_id = p.id
            AND a.deleted_at IS NULL
            AND sku.press_id IS NOT NULL
       )
       AND NOT EXISTS (
         SELECT 1
           FROM albums a
           JOIN pressing_order_requests por ON por.album_id = a.id
          WHERE a.primary_artist_id = p.id
            AND a.deleted_at IS NULL
            AND por.status <> 'cancelled'
       )
       AND EXISTS (SELECT 1 FROM claimed)
       AND (
         p.is_artist_promoted = true
         OR EXISTS (
           SELECT 1 FROM albums a
            WHERE a.primary_artist_id = p.id
              AND a.deleted_at IS NULL
              AND a.is_goodtunes_release = true
         )
         OR EXISTS (
           SELECT 1 FROM users u
            WHERE u.role = 'artist' AND u.role_scope_id = p.id
         )
         OR EXISTS (
           SELECT 1 FROM memberships ms
            WHERE ms.role = 'artist'
              AND ms.scope_kind = 'artist'
              AND ms.scope_id = p.id
         )
       )
  `);
  return Number(result?.rowCount ?? 0);
}