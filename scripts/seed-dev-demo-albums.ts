/**
 * Seed a few fully-playable DEMO albums into the DEV database so Bill can
 * click through the real app (player, album pages, Buy flow, owned-album /
 * Library, GoodSync lyrics, GoodDeed / certificate surfaces) without
 * hand-entering albums and uploading a master per track in the Admin UI.
 *
 * What it creates (idempotent, fixed string ids):
 *   - 3 released, visible GoodTunes albums (album-demo-1..3), each with a
 *     primary-artist People row, album art, 3–4 songs, and a priced 12" LP
 *     SKU so the fan Buy sheet renders a real price.
 *   - Each demo song is created with INSERT … SELECT FROM songs WHERE id =
 *     '<static-seed source>' (song-1-1 / song-5-1 / song-5-6) so the env's
 *     OWN valid Mux playback/asset ids + lyrics are COPIED — never hardcoded
 *     (Mux ids differ per clone). Only the title + track number are
 *     overridden with literals; everything that makes the track play is
 *     copied verbatim, so every demo track plays full-length.
 *   - album-demo-1 is GRANTED (real ownership, is_preview = false) to the
 *     existing reviewer fan account (cust-appreview-demo) so it lands in the
 *     fan's Library and exercises owned-album playback + cert surfaces.
 *
 * IDEMPOTENT: every insert is ON CONFLICT DO NOTHING on a stable id (or the
 * (user_id, album_id) natural key for the grant), so re-running never
 * duplicates rows or clobbers operator edits.
 *
 * DEV-ONLY HARD GUARD (fails CLOSED): refuses to run if DATABASE_URL equals
 * PROD_DATABASE_URL or shares its host, if it's running inside a deployed
 * (REPLIT_DEPLOYMENT) runtime, and — crucially — if PROD_DATABASE_URL is
 * unset (so we can't even prove the target isn't prod) UNLESS the operator
 * explicitly passes --force-dev to acknowledge the target is a dev DB. Fails
 * loudly — never silently proceeds. This is on-demand dev test data and is
 * deliberately NOT wired into scripts/post-merge.sh.
 *
 * Run (dev):  npx tsx scripts/seed-dev-demo-albums.ts
 * Dry run:    npx tsx scripts/seed-dev-demo-albums.ts --dry
 * If PROD_DATABASE_URL isn't set in your shell, confirm dev with --force-dev:
 *             npx tsx scripts/seed-dev-demo-albums.ts --force-dev
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

const DRY = process.argv.includes("--dry");
const FORCE_DEV = process.argv.includes("--force-dev");

// Existing reviewer fan account (seeded by post-merge seed_task_939). Reused
// here so the demo grant lands in a known, sealed test fan's Library.
const FAN_ID = "cust-appreview-demo";

// Static-seed source songs — each is Mux-ready in BOTH dev and prod (Mux is
// a shared account), so copying their playback/asset ids yields tracks that
// actually play. These are the same sources the appreview Sampler seed uses.
const SRC = {
  a: "song-1-1",
  b: "song-5-1",
  c: "song-5-6",
} as const;

type SongSpec = { id: string; title: string; track: number; source: string };
type AlbumSpec = {
  id: string;
  title: string;
  artist: string;
  personId: string;
  artwork: string;
  year: number;
  type: string;
  genre: string;
  description: string;
  releaseDate: string;
  priceCents: number; // 12" LP SKU price
  songs: SongSpec[];
};

const ALBUMS: AlbumSpec[] = [
  {
    id: "album-demo-1",
    title: "Midnight Diaries",
    artist: "The Wanderers",
    personId: "person-demo-1",
    artwork: "/figmaAssets/album-5-cover.jpg",
    year: 2026,
    type: "EP",
    genre: "Indie Rock",
    description: "A short, fully-playable demo EP for clicking through the GoodTunes player, Library, and checkout.",
    releaseDate: "2026-05-15",
    priceCents: 2999,
    songs: [
      { id: "song-demo-1-1", title: "Headlights", track: 1, source: SRC.a },
      { id: "song-demo-1-2", title: "Slow Burn", track: 2, source: SRC.b },
      { id: "song-demo-1-3", title: "Paper Moon", track: 3, source: SRC.c },
    ],
  },
  {
    id: "album-demo-2",
    title: "Neon Skyline",
    artist: "Violet Avenue",
    personId: "person-demo-2",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png",
    year: 2026,
    type: "LP",
    genre: "Synth Pop",
    description: "A demo LP for exercising the album page, bundle/Buy flow, and full-length playback.",
    releaseDate: "2026-04-20",
    priceCents: 3199,
    songs: [
      { id: "song-demo-2-1", title: "City Lights", track: 1, source: SRC.b },
      { id: "song-demo-2-2", title: "Afterglow", track: 2, source: SRC.c },
      { id: "song-demo-2-3", title: "Skyline", track: 3, source: SRC.a },
      { id: "song-demo-2-4", title: "Last Train Home", track: 4, source: SRC.b },
    ],
  },
  {
    id: "album-demo-3",
    title: "Paper Hearts",
    artist: "June & the Tides",
    personId: "person-demo-3",
    artwork: "/figmaAssets/album-5-cover.jpg",
    year: 2025,
    type: "EP",
    genre: "Folk",
    description: "A demo EP for testing GoodSync lyrics, favorites, and the owned-album surface.",
    releaseDate: "2026-03-10",
    priceCents: 2799,
    songs: [
      { id: "song-demo-3-1", title: "Tides", track: 1, source: SRC.c },
      { id: "song-demo-3-2", title: "Driftwood", track: 2, source: SRC.a },
      { id: "song-demo-3-3", title: "Paper Hearts", track: 3, source: SRC.b },
    ],
  },
];

// The album granted to the reviewer fan account.
const GRANTED_ALBUM_ID = "album-demo-1";

/**
 * Hard dev-only guard. Fails CLOSED: it does not just block the cases it can
 * prove are prod — it refuses to proceed unless it can affirmatively treat the
 * target as a dev DB.
 *   1. DATABASE_URL must be set.
 *   2. Never run inside a deployed (published / prod) runtime (REPLIT_DEPLOYMENT).
 *   3. If PROD_DATABASE_URL is set, refuse when the target URL / host matches it.
 *   4. If PROD_DATABASE_URL is NOT set, we can't prove the target isn't prod,
 *      so refuse unless the operator explicitly confirms with --force-dev.
 */
function assertNotProd() {
  const url = (process.env.DATABASE_URL || "").trim();
  const prod = (process.env.PROD_DATABASE_URL || "").trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set — refusing to run.");
  }
  const hostOf = (u: string): string | null => {
    try {
      return new URL(u).host.toLowerCase();
    } catch {
      return null;
    }
  };
  const urlHost = hostOf(url);
  console.log(
    `Guard inputs: target host=${urlHost ?? "<unparseable>"} · PROD_DATABASE_URL ${prod ? "set" : "UNSET"} · ` +
      `REPLIT_DEPLOYMENT ${process.env.REPLIT_DEPLOYMENT ? "set" : "unset"} · --force-dev ${FORCE_DEV ? "yes" : "no"}`,
  );

  // 2. Deployed runtime → this is the published/prod environment.
  if (process.env.REPLIT_DEPLOYMENT) {
    throw new Error("Running inside a deployed (REPLIT_DEPLOYMENT) runtime — refusing to seed demo data into production.");
  }

  // 3. Known prod URL → block on exact match or shared host.
  if (prod) {
    if (url === prod) {
      throw new Error("DATABASE_URL equals PROD_DATABASE_URL — refusing to seed demo data into production.");
    }
    const prodHost = hostOf(prod);
    if (prodHost && urlHost && urlHost === prodHost) {
      throw new Error(`DATABASE_URL host (${urlHost}) matches PROD_DATABASE_URL host — refusing to seed demo data into production.`);
    }
    return; // PROD_DATABASE_URL set and target proven different — OK.
  }

  // 4. PROD_DATABASE_URL unset → cannot prove the target isn't prod. Fail closed.
  if (!FORCE_DEV) {
    throw new Error(
      "PROD_DATABASE_URL is not set, so this script cannot prove DATABASE_URL is a DEV database. " +
        "Refusing to run. If you are certain DATABASE_URL points at a dev DB, re-run with --force-dev.",
    );
  }
}

async function main() {
  assertNotProd();
  const host = (() => {
    try {
      return new URL((process.env.DATABASE_URL || "").trim()).host;
    } catch {
      return "<unparseable>";
    }
  })();
  console.log(`Target DB host: ${host}${DRY ? " · DRY RUN (no writes)" : ""}`);

  // Verify the source songs exist + are playable in THIS env before we copy.
  const srcIds = Object.values(SRC);
  const srcRows = await db.execute<{ id: string; mux_playback_id: string | null }>(sql`
    SELECT id, mux_playback_id FROM songs WHERE id = ANY(${sql`ARRAY[${sql.join(srcIds.map((s) => sql`${s}`), sql`, `)}]`})
  `);
  const found = new Set(srcRows.rows.map((r) => r.id));
  const missing = srcIds.filter((s) => !found.has(s));
  if (missing.length) {
    throw new Error(`Source song(s) not found in this DB: ${missing.join(", ")}. Run the static seed / post-merge first.`);
  }
  const unplayable = srcRows.rows.filter((r) => !r.mux_playback_id).map((r) => r.id);
  if (unplayable.length) {
    console.warn(`WARNING: source song(s) have no Mux playback id (may not play): ${unplayable.join(", ")}`);
  }

  // Verify the reviewer fan account exists (so the grant lands somewhere).
  const fan = await db.execute<{ id: string }>(sql`SELECT id FROM customer_users WHERE id = ${FAN_ID}`);
  if (!fan.rows[0]) {
    console.warn(`WARNING: fan account ${FAN_ID} not found — the ownership grant will be skipped. Run post-merge seed_task_939 first.`);
  }

  if (DRY) {
    for (const a of ALBUMS) {
      console.log(`  [DRY] would upsert album ${a.id} "${a.title}" + person ${a.personId} + ${a.songs.length} songs + 1 priced 12_lp SKU ($${(a.priceCents / 100).toFixed(2)})`);
    }
    console.log(`  [DRY] would grant ${GRANTED_ALBUM_ID} to ${FAN_ID} (is_preview=false)`);
    console.log("\n[DRY] no changes written.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const a of ALBUMS) {
      // Artist People row.
      await tx.execute(sql`
        INSERT INTO people (id, name, photo_url, bio)
        VALUES (${a.personId}, ${a.artist}, ${a.artwork}, ${`${a.artist} — demo artist for the GoodTunes dev test catalog.`})
        ON CONFLICT (id) DO NOTHING
      `);

      // Album row — released, visible, GoodTunes release, not prepping.
      await tx.execute(sql`
        INSERT INTO albums
          (id, title, artist, artwork, year, type, description, genre,
           good_tunes_release_date, is_goodtunes_release, is_prepping,
           is_hidden, primary_artist_id, price_cents)
        VALUES
          (${a.id}, ${a.title}, ${a.artist}, ${a.artwork}, ${a.year}, ${a.type},
           ${a.description}, ${a.genre}, ${a.releaseDate}, true, false, false,
           ${a.personId}, ${a.priceCents})
        ON CONFLICT (id) DO NOTHING
      `);

      // Songs — COPY playback/lyrics from a static-seed source; override
      // only id / album / title / track number.
      for (const s of a.songs) {
        await tx.execute(sql`
          INSERT INTO songs
            (id, album_id, title, track_number, duration, lyrics, synced_lyrics,
             audio_url, mux_playback_id, mux_asset_id, mux_status)
          SELECT ${s.id}, ${a.id}, ${s.title}, ${s.track}, duration, lyrics,
                 synced_lyrics, audio_url, mux_playback_id, mux_asset_id, mux_status
          FROM songs WHERE id = ${s.source}
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // One priced 12" LP SKU so the Buy sheet renders a real price.
      // Conflict on the (album_id, format) natural key (unique constraint
      // album_skus_album_format_unique) — NOT the id — so a re-run after an
      // operator replaced/edited this SKU under a different id is a no-op
      // instead of a unique-violation that aborts the whole transaction.
      await tx.execute(sql`
        INSERT INTO album_skus (id, album_id, format, price_cents, stock, active, position)
        VALUES (${`sku-${a.id}-12lp`}, ${a.id}, '12_lp', ${a.priceCents}, NULL, true, 0)
        ON CONFLICT (album_id, format) DO NOTHING
      `);
    }

    // Grant one album to the reviewer fan (real ownership, not a purchase).
    if (fan.rows[0]) {
      await tx.execute(sql`
        INSERT INTO user_albums (id, user_id, album_id, is_preview)
        VALUES (${`ua-demo-${FAN_ID}-${GRANTED_ALBUM_ID}`}, ${FAN_ID}, ${GRANTED_ALBUM_ID}, false)
        ON CONFLICT (user_id, album_id) DO NOTHING
      `);
    }
  });

  // ---- Verify ----
  const after = await db.execute<{ id: string; title: string; songs: number; skus: number }>(sql`
    SELECT a.id, a.title,
           (SELECT COUNT(*)::int FROM songs s WHERE s.album_id = a.id) AS songs,
           (SELECT COUNT(*)::int FROM album_skus k WHERE k.album_id = a.id AND k.active) AS skus
    FROM albums a
    WHERE a.id = ANY(${sql`ARRAY[${sql.join(ALBUMS.map((a) => sql`${a.id}`), sql`, `)}]`})
    ORDER BY a.id
  `);
  console.log("\nDemo albums now:");
  for (const r of after.rows) console.log(`  ${r.id}  "${r.title}"  (${r.songs} songs, ${r.skus} active SKU)`);

  const grant = await db.execute<{ album_id: string }>(sql`
    SELECT album_id FROM user_albums WHERE user_id = ${FAN_ID} AND album_id = ${GRANTED_ALBUM_ID}
  `);
  console.log(grant.rows[0]
    ? `Grant: ${FAN_ID} owns ${GRANTED_ALBUM_ID} (in Library, plays full-length).`
    : `Grant: NOT present (fan account missing?).`);
  console.log("\nDone.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
