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
