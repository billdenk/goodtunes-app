// Task #876 — Catch broken admin album queries before they reach customers.
//
// Two admin-facing album list queries used to be inline `db.execute(sql`...`)`
// blocks inside route handlers. tsc can't see inside those template literals,
// so a renamed column ships silently — exactly the `a.cover_url` vs `a.artwork`
// bug class Task #871 fixed on the early-cut-pools query.
//
// Exposing each query as an exported builder lets `scripts/db-query-smoke.ts`
// EXPLAIN the *exact* SQL production runs, so Postgres validates every column
// reference at test time instead of in a customer-facing 500. Add any new
// raw-SQL album query here (and to SMOKE_QUERIES) rather than inlining it.
import { sql, type SQL } from "drizzle-orm";
import { pgArray } from "./lib/pgArray";

// Album+stage data for a fixed set of album ids — backs the album pipeline /
// entity Albums tab (`loadConnectedAlbums`). Note `a.artwork AS cover_url`:
// the albums art column is `artwork`, there is no `cover_url` column.
export function sqlConnectedAlbums(albumIds: string[]): SQL {
  return sql`
    SELECT
      a.id,
      a.title,
      a.artwork AS cover_url,
      a.first_sold_at,
      a.is_goodtunes_release,
      a.is_prepping,
      a.is_hidden,
      a.price_cents,
      (SELECT name FROM people WHERE id = a.primary_artist_id) AS artist_name,
      (SELECT COUNT(*)::int FROM album_skus WHERE album_id = a.id) AS sku_count,
      (SELECT COUNT(*)::int FROM songs WHERE album_id = a.id) AS song_count,
      (SELECT COUNT(*)::int FROM songs WHERE album_id = a.id AND audio_url IS NOT NULL AND audio_url <> '') AS songs_with_audio,
      (SELECT COUNT(*)::int FROM songs WHERE album_id = a.id AND mux_status = 'ready') AS songs_mux_ready,
      NULL::text AS connection_reason
    FROM albums a
    WHERE a.id = ANY(${pgArray(albumIds)})
    ORDER BY a.first_sold_at DESC NULLS LAST, a.title ASC
  `;
}

// Task #922 — per-album NPO donation ledger for one non-profit. One row per
// album the NPO is a beneficiary of (album_npo_beneficiaries) OR has ever
// earned a credit from (referral_credits, which carries no album_id so it
// joins through orders.album_id). `a.artwork AS cover_url` — same column
// note as above. Drives the NPO portal + admin "Donation ledger" tab.
export function sqlNpoAlbumLedger(npoId: string): SQL {
  return sql`
    WITH bens AS (
      SELECT b.album_id, b.per_unit_cents
      FROM album_npo_beneficiaries b
      WHERE b.organization_id = ${npoId}
    ),
    credits AS (
      SELECT o.album_id,
             COALESCE(SUM(rc.units), 0)::int AS units_sold,
             COALESCE(SUM(rc.amount_cents) FILTER (WHERE rc.status = 'pending_payout'), 0)::int AS expected_cents,
             COALESCE(SUM(rc.amount_cents) FILTER (WHERE rc.status = 'paid'), 0)::int AS paid_cents
      FROM referral_credits rc
      JOIN orders o ON o.id = rc.order_id
      WHERE rc.referrer_kind = 'non_profit' AND rc.referrer_org_id = ${npoId}
      GROUP BY o.album_id
    ),
    album_ids AS (
      SELECT album_id FROM bens
      UNION
      SELECT album_id FROM credits
    )
    SELECT a.id AS album_id, a.title, a.artwork AS cover_url,
           a.primary_artist_id AS artist_id,
           (SELECT name FROM people WHERE id = a.primary_artist_id) AS artist_name,
           bens.per_unit_cents,
           COALESCE(credits.units_sold, 0) AS units_sold,
           COALESCE(credits.expected_cents, 0) AS expected_cents,
           COALESCE(credits.paid_cents, 0) AS paid_cents
    FROM album_ids
    JOIN albums a ON a.id = album_ids.album_id
    LEFT JOIN bens ON bens.album_id = album_ids.album_id
    LEFT JOIN credits ON credits.album_id = album_ids.album_id
    ORDER BY a.title ASC
  `;
}

// For-sale albums + paid units per artist — backs the non-profit dashboard
// artist roster. Same `a.artwork AS cover_url` note as above; only albums
// with an active album_skus row are returned.
export function sqlNpoArtistAlbums(activeArtistIds: string[]): SQL {
  return sql`
    SELECT a.id, a.title, a.artwork AS cover_url, a.primary_artist_id,
      COALESCE((
        SELECT SUM(oi.quantity)::int
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id AND oi.kind = 'format'
        WHERE o.album_id = a.id AND o.status = 'paid'
      ), 0) AS units
    FROM albums a
    WHERE a.primary_artist_id = ANY(${pgArray(activeArtistIds, "varchar")})
      AND EXISTS (
        SELECT 1 FROM album_skus s
        WHERE s.album_id = a.id AND s.active = true
      )
    ORDER BY a.title ASC
  `;
}
