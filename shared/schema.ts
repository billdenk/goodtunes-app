import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, jsonb, boolean, uniqueIndex, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  realName: text("real_name"),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  // Task #57 — preferred second factor for admin sign-in:
  // "email"  → 6-digit code emailed each sign-in (default for new admins)
  // "totp"   → authenticator app (existing TOTP-enrolled admins)
  // Anyone with a row in admin_totp is migrated to "totp" on first apply
  // so no current admin gets locked out. Switching factors is a one-click
  // toggle on the admin security page (only allowed if both are set up).
  factorPref: text("factor_pref").notNull().default("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Record-label entity. One row per label (Atlantic, XL, Sub Pop, …) —
// logo / bio / location / cover live here. Each album is released on at
// most one label (the label printed on the back of the record); a label
// has many albums; the label's artist roster is derived from those albums.
// Future: dedicated `/label/:id` fan page with all releases.
export const labels = pgTable("labels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Canonical apex domain (lowercased, no www). Mirrors `vendors.domain`
  // as the dedup key so the "paste a label URL" flow can detect "already
  // added" before double-creating. Nullable for legacy rows created
  // before the paste-URL flow existed.
  domain: text("domain").unique(),
  logoUrl: text("logo_url"),
  // Curation lock on `logoUrl`. When true, automated paths (favicon
  // backfills, "re-scrape from website" enrichment, any future logo
  // enrichment job) MUST skip writing `logoUrl` — the operator has
  // explicitly curated it. Explicit admin writes (PUT /api/admin/labels/:id
  // with a new `logoUrl`) bypass the lock; locks are about automation,
  // not editability. Mirrors `people.photoLocked` / `people.coverLocked`.
  logoLocked: boolean("logo_locked").notNull().default(false),
  bio: text("bio"),
  location: text("location"),
  websiteUrl: text("website_url"),
  // Optional Instagram profile URL. Used in admin so the label page can
  // surface a follow link later — not auto-scraped from IG (Instagram blocks
  // server fetches), so this is admin-entered.
  instagramUrl: text("instagram_url"),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const albums = pgTable("albums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  artwork: text("artwork").notNull(),
  year: integer("year"),
  // Release format. One of "Single" (1 track — only reachable via
  // streaming-catalog imports; GoodTunes itself never sells a single),
  // "Duo" (2 tracks — the smallest GoodTunes-curated bundle), "EP"
  // (3–7 tracks), "LP" (8+ tracks, the full-length record; covers
  // Double-LPs too — the physical-pressing surface will add an
  // `isDoubleLP` boolean when that ships). Legacy rows used "album" —
  // migrated to "LP" on the 2026-05 schema bump.
  type: text("type").notNull().default("LP"),
  description: text("description"),
  // ISO YYYY-MM-DD. Day GoodTunes goes live with the in-app player (the
  // bundle-holder pre-streaming window starts here). Nullable while the
  // album is still being assembled.
  goodTunesReleaseDate: text("good_tunes_release_date"),
  // ISO YYYY-MM-DD. Day the same album drops on Apple/Spotify/etc. When
  // this date hits, the player surfaces a "Now on streaming — listen
  // anywhere" banner so we're not holding fans hostage.
  streamingReleaseDate: text("streaming_release_date"),
  // The label this album was released on. SET NULL so deleting a label
  // doesn't take down its catalog; the album just loses its label credit
  // until reassigned. Album reads denormalize the joined label entity
  // into `album.label` so the fan side can render it without a 2nd fetch.
  labelId: varchar("label_id").references(() => labels.id, { onDelete: "set null" }),
  // Primary artist of this album as a real People row. Optional + SET NULL —
  // the `artist` text column above stays the canonical display string (so
  // legacy rows + reissues with collaboration billing keep rendering even
  // when there's no profile). When `primaryArtistId` is set the admin UI
  // mirrors the People name into `artist` on save, and the artist page can
  // surface this album under "GoodTunes Releases".
  primaryArtistId: varchar("primary_artist_id").references(() => people.id, { onDelete: "set null" }),
  // Demo show/hide flag. When true the album is excluded from public catalog
  // reads (album list + detail) AND from the fan-facing credits surface,
  // effectively hiding the artist + all their songs/credits in one toggle.
  // Admin endpoints keep returning hidden rows so the CMS can flip them back.
  isHidden: boolean("is_hidden").notNull().default(false),
  // True only for albums GoodTunes is actually releasing — i.e. curated by
  // the label, not pulled in via a People discography import. The admin
  // Albums sidebar filters to these by default so the second column stays
  // reserved for GoodTunes releases. Discography-imported albums still
  // live in the DB (so they remain reachable from a person's profile
  // and from the credits surface), they're just absent from this list.
  isGoodTunesRelease: boolean("is_goodtunes_release").notNull().default(false),
  // Parental-advisory flag. When true the consumer surfaces a small "E"
  // badge next to the album title (Apple Music / Spotify convention).
  // Admin toggle lives in AdminAlbum's header; defaults false because most
  // catalog rows are clean and we don't want to force a per-album decision
  // on every import.
  isExplicit: boolean("is_explicit").notNull().default(false),
  // Streaming-service handoff. We host the album in-app for the first ~2 weeks
  // then surface "Listen on Apple Music / Spotify" buttons on the album page
  // that point fans at the canonical album URL on each service — same
  // referral logic as the per-artist links on `people`.
  appleMusicUrl: text("apple_music_url"),
  spotifyUrl: text("spotify_url"),
  // Single primary genre string ("Indie Rock", "Soul", "Ambient"). Free-text
  // for now — admin types it in, fan-side renders it next to the year
  // under the artist on the album page. Optional: legacy rows + imports
  // without a genre stay null and the "Genre · Year" line collapses to
  // just the year on the fan side.
  genre: text("genre"),
  // Liner notes — the full original prose from the album's credits doc
  // (PDF/Word/text) preserved verbatim after a credits-importer run.
  // Structured per-track writers + performers go into trackWriters /
  // trackPerformers, but this field is the human-readable "back of the
  // record" version: anything the AI couldn't slot into a structured row
  // is still readable here. Surfaced on the album detail page when set.
  linerNotes: text("liner_notes"),
  // ─── Task #48 — per-album payout override ────────────────────────
  // When set, this album's orders use these split values instead of
  // the global payout_settings row. NULL means "inherit the default".
  // `payoutOwnerKind` + `payoutOwnerId` let an operator route revenue
  // to a specific People or Label row when the album's primaryArtistId
  // / labelId isn't who should be paid (e.g. compilations, side
  // projects). When NULL we fall back to labelId, then primaryArtistId.
  payoutFeePctOverride: integer("payout_fee_pct_override"),
  payoutCertCentsOverride: integer("payout_cert_cents_override"),
  payoutOwnerKind: text("payout_owner_kind"),
  payoutOwnerId: varchar("payout_owner_id"),
});

// Bonus content attached to an album. Both tables are intentionally
// tiny — admin uploads a file via /api/admin/upload (Object Storage),
// then POSTs the returned URL here as `videoUrl` / `photoUrl`. Fan-side
// surfaces these only when there's at least one row, so a clean album
// keeps the same scrolling layout it has today. `position` drives
// display order so the admin can reorder without renumbering anything.
// FK on delete cascade — wiping an album wipes its bonus content too.
export const albumVideos = pgTable("album_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled video"),
  // Short blurb shown under the video on the fan side. Optional —
  // most album videos are self-explanatory from the title alone.
  description: text("description"),
  // /objects/uploads/<uuid>.mp4 served by Object Storage. Uploaded MP4
  // (or whatever video MIME the admin picked — we don't restrict here,
  // the multer config does).
  videoUrl: text("video_url").notNull(),
  // Optional still frame for the thumbnail. When null the fan-side
  // renders a generic play-icon tile.
  posterUrl: text("poster_url"),
  // Original URL the operator pasted when importing (Dropbox share,
  // direct .mp4 link, etc.). NULL for direct file uploads. Surfaced
  // in the admin Edit dialog as an "Imported from <host>" chip so
  // Bill can copy/open the original. Never shown fan-side.
  sourceUrl: text("source_url"),
  position: integer("position").notNull().default(0),
});

export const albumPhotos = pgTable("album_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  // /objects/uploads/<uuid>.<ext> — same upload path as album artwork
  // and profile photos.
  photoUrl: text("photo_url").notNull(),
  // Optional caption rendered under the photo on the fan-side gallery.
  caption: text("caption"),
  position: integer("position").notNull().default(0),
});

export const songs = pgTable("songs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id),
  title: text("title").notNull(),
  trackNumber: integer("track_number").notNull(),
  duration: integer("duration").notNull().default(180),
  lyrics: text("lyrics"),
  audioUrl: text("audio_url"),
  // Browser-friendly playback URL is in `audioUrl`. When the operator
  // uploads a master in a format the browser can't decode (24-bit /
  // 32-bit / 32-bit-float PCM WAV is the common one — HTML5 <audio>
  // only handles 16-bit PCM reliably), the import pipeline transcodes
  // it to FLAC for `audioUrl` and stashes the ORIGINAL bytes here
  // under `audioSourceUrl`. Null when the upload was already
  // browser-friendly (no transcode happened). Used for: archival,
  // re-mastering for streaming services, and a "Download original"
  // affordance on the admin master row.
  audioSourceUrl: text("audio_source_url"),
  // Per-line WebVTT-derived timing. Uploaded by admin as a .vtt file,
  // parsed client-side into { timeMs, text } cues. When present, the
  // Player's lyrics overlay uses these timestamps verbatim instead of
  // auto-distributing the plain-text `lyrics` field across duration.
  syncedLyrics: jsonb("synced_lyrics").$type<{ timeMs: number; endMs?: number; text: string }[]>(),
  // Marks a track that has no lyrics by design (instrumental / interlude /
  // outro). The Lyrics status dot then reads "intentionally none" (grey
  // Ban glyph) instead of "missing" (empty grey ring). Default false.
  instrumental: boolean("instrumental").notNull().default(false),
  // Per-track explicit flag — Apple Music's model. The fan-facing
  // tracklist renders a small "E" pill next to the title when true.
  // Album.isExplicit stays as a separate override (artwork/title
  // advisory) so admins can mark the whole record without flipping
  // every song; the album card's "E" badge lights up if either is on.
  isExplicit: boolean("is_explicit").notNull().default(false),
  // The 30-second in-app preview window. When both are null, the player
  // auto-derives a preview from the first 30s of the master (v1 default
  // → Preview status dot reads "auto-set", green check). When the admin
  // hand-picks a window via the Preview Slider™ — by dragging the
  // handles, typing a timestamp, or uploading a custom clip — these
  // store the chosen window in milliseconds and the Preview dot flips
  // to the gold "custom clip" state (rounded-rectangle glyph). FK is
  // implicit: the window lives on the master, not the song row, but the
  // master is one-to-one with the song so we colocate the fields here.
  previewStartMs: integer("preview_start_ms"),
  previewEndMs: integer("preview_end_ms"),
  // Pre-computed waveform peaks for the master file. Generated server-side
  // at upload (or via the admin "Regenerate waveform" action) by piping
  // the master through ffmpeg → mono 8 kHz PCM → ~200 normalized peaks
  // (0..1, loudest = 1). Powers the Preview Slider™ window picker and the
  // consumer Now Playing scrubber so both render the same shape that
  // matches the actual audio. Null until the master has been analyzed —
  // UI falls back to decorative bars in that case.
  waveform: jsonb("waveform").$type<number[]>(),
  // Mux integration (launch-plan Phase 3). When an admin migrates a
  // master to Mux, the import pipeline POSTs the WAV to Mux as a new
  // asset under `playback_policy: signed` and stashes the IDs here.
  // - `muxAssetId`     — internal Mux asset handle, returned synchronously
  //                       at creation. Persists even before encoding finishes.
  // - `muxPlaybackId`  — the HLS playback handle (`https://stream.mux.com/<id>.m3u8`).
  //                       Only set once Mux fires `video.asset.ready`.
  // - `muxStatus`      — `preparing` (asset created, encoding) → `ready`
  //                       (playable) → `errored` (Mux failed). Drives the
  //                       admin "Mux: ready/preparing/errored" pill on the
  //                       Tracks tab and gates the player swap to HLS.
  // The original `audioUrl` is left intact so non-Mux songs keep playing
  // and we can fall back if a Mux asset gets deleted. Once all songs are
  // on Mux + Phase 3 audit lands, the Object-Storage masters become
  // archival only and we restrict their ACL.
  muxAssetId: text("mux_asset_id"),
  muxPlaybackId: text("mux_playback_id"),
  muxStatus: text("mux_status"),
});

export const userAlbums = pgTable(
  "user_albums",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    albumId: varchar("album_id").notNull().references(() => albums.id),
    certificateNumber: integer("certificate_number"),
    acquiredAt: timestamp("acquired_at").defaultNow(),
  },
  (t) => ({
    userAlbumUnique: uniqueIndex("user_albums_user_album_uniq").on(t.userId, t.albumId),
  }),
);

export const playlists = pgTable("playlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playlistSongs = pgTable(
  "playlist_songs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    playlistId: varchar("playlist_id").notNull().references(() => playlists.id),
    songId: varchar("song_id").notNull().references(() => songs.id),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at").defaultNow(),
  },
  (t) => ({
    playlistSongUnique: uniqueIndex("playlist_songs_playlist_song_uniq").on(t.playlistId, t.songId),
  }),
);

// ----- SuperCredits™ catalog -------------------------------------------
// Bound to song-level credits in a later turn (track_writers /
// track_performers will FK into people + instruments). Keep these
// schemas matching the in-app `Person` / `Instrument` / `InstrumentVendor`
// shapes in client/src/data/musicData.ts so the CMS can fully replace the
// static seed data without a downstream type rewrite.
export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  // Optional wide background image for the artist hero — mirrors
  // `vendors.coverUrl` / `labels.coverUrl` so when the fan-side artist
  // page lands we already have a place to put a banner. The initial
  // circle now always falls back to brand blue (#319ED8); the old
  // per-person `accent` hex was removed.
  coverUrl: text("cover_url"),
  // Curation locks. When `true`, automated paths (Spotify bulk-match,
  // credits-import enrichment, future Wikipedia / Apple scrapes) MUST
  // skip writing this field — the admin has explicitly curated it and
  // doesn't want a refresh to clobber their choice. Explicit admin
  // writes (PUT /api/admin/people/:id with a new URL) still go
  // through; the lock is about *automation*, not editability.
  photoLocked: boolean("photo_locked").notNull().default(false),
  coverLocked: boolean("cover_locked").notNull().default(false),
  bio: text("bio"),
  // Optional FK to the label this artist is signed to. Mirrors
  // `albums.labelId` so an artist can be tagged with a label even before
  // they've released anything in-app, and so independent artists (no
  // label) stay an explicit choice — `null` means "no label", not
  // "missing". SET NULL on delete keeps the person renderable if the
  // label row is removed.
  labelId: varchar("label_id").references(() => labels.id, { onDelete: "set null" }),
  // Streaming-service handoff. We host the song in-app for the first ~2 weeks,
  // then surface "Listen on Apple Music / Spotify" buttons that point at the
  // artist's canonical page on each service. Same URLs are also the scrape
  // source for name/photo/bio on first import.
  appleMusicUrl: text("apple_music_url"),
  spotifyUrl: text("spotify_url"),
  // Tri-state Spotify scan outcome, written by the bulk "Match people on
  // Spotify" walk. Lets the People grid badge people who've been searched
  // (true = candidates exist & still need admin pick; false = Spotify
  // returned zero results) versus never-scanned (null). When the admin
  // picks a candidate via the dialog the row gets a real spotifyUrl —
  // the flag stops mattering at that point.
  spotifyHasMatch: boolean("spotify_has_match"),
  // iTunes Lookup needs the numeric artist id (last path segment of an Apple
  // Music artist URL). Cached so the discography panel can refresh without
  // re-parsing the URL.
  itunesArtistId: text("itunes_artist_id"),
  // Social handles. Stored as full URLs (not @handles) so the renderer can
  // open them directly without per-platform URL construction. The streaming
  // links above (apple/spotify) get small icons too — these socials are the
  // "don't only push fans to Apple/Spotify" answer: keep artists discoverable
  // wherever they live. `websiteUrl` is the generic catch-all (personal site,
  // Mastodon, Linktree, Bandcamp, anything we don't have a dedicated icon for).
  instagramUrl: text("instagram_url"),
  tiktokUrl: text("tiktok_url"),
  twitterUrl: text("twitter_url"),
  blueskyUrl: text("bluesky_url"),
  facebookUrl: text("facebook_url"),
  websiteUrl: text("website_url"),
  // Optional muso.ai profile UUID — captured when a Person is imported from a
  // muso credits dump so re-imports can match this row instantly. muso.ai
  // splits the same human across multiple UUIDs (e.g. "Nick Carter", "Nick
  // (us) Carter", "Nickolas G Carter") — only ONE of those gets pinned here;
  // the rest live as rows in `person_aliases` below. Not unique on purpose.
  musoId: text("muso_id"),
  // Admin-only contact email. Captured when a credits doc lists an email
  // next to a person ("connorhansonmusic@gmail.com") so we have an outreach
  // roster for verified-artist invites + label-side follow-ups. NEVER
  // surfaced on the public Person page — only readable on admin endpoints.
  contactEmail: text("contact_email"),
});

// Alias rows for a Person — extra names + extra source IDs that all point
// at the same canonical human. Two main uses today:
//   1. muso.ai dedup — fold the 3–4 muso UUIDs muso.ai splits a real artist
//      across into a single People row, with each original (id, name) kept
//      here so future re-imports route back to the same Person.
//   2. Stage / legal-name variants (e.g. "Aleks Šebek" ↔ "Aleksandar Šebek")
//      so credits typed by one variant still resolve to the right Person.
// CASCADE on personId so cleanup is automatic when a Person is deleted.
export const personAliases = pgTable(
  "person_aliases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Optional foreign-system ID this alias represents (e.g. a muso UUID).
    // When set we'll prefer a `source` so we can disambiguate sources later
    // ("muso", "spotify", "isni", …) without inventing a new column.
    source: text("source"), // "muso" | "spotify" | "isni" | null
    sourceId: text("source_id"),
  },
  (t) => ({
    // The same external (source, sourceId) pair must only map to one Person.
    sourceUnique: uniqueIndex("person_aliases_source_id_uniq")
      .on(t.source, t.sourceId)
      .where(sql`${t.source} IS NOT NULL AND ${t.sourceId} IS NOT NULL`),
  }),
);

// Cached iTunes Lookup discography for a Person. We pull this in admin
// (`/api/admin/people/scrape`) and persist it here so the fan-side artist
// page can render a "Streaming" section without re-hitting Apple on every
// visit, and so the data survives the admin's `sessionStorage` lifetime.
// One row per release (album / EP / single). `collectionId` is Apple's
// numeric iTunes id, unique per person so re-pulls upsert cleanly.
export const personDiscography = pgTable("person_discography", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  collectionId: text("collection_id").notNull(),
  name: text("name").notNull(),
  artworkUrl: text("artwork_url"),
  year: integer("year"),
  // "album" | "EP" | "Single" — kept lowercase-ish to match the
  // ScrapedArtistAlbum shape so admin + fan render off the same values
  // without translation.
  type: text("type").notNull(),
  trackCount: integer("track_count"),
  appleMusicUrl: text("apple_music_url"),
  // Per-release Spotify URL is a v2 problem (needs Spotify Web API).
  // Today the fan-side "How to Play" sheet falls back to a Spotify
  // search URL when this is null.
  spotifyUrl: text("spotify_url"),
  // Display order — admin pulls newest-first from Apple, we mirror that.
  position: integer("position").notNull().default(0),
});

export const instruments = pgTable("instruments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // e.g. "1967 Gretsch 6071 'Monkees' Bass Walnut"
  name: text("name").notNull(),
  category: text("category").notNull(),
  shortCategory: text("short_category"),
  photoUrl: text("photo_url"),
  about: text("about"),
  artistNote: text("artist_note"),
});

// Real-world vendor entity. One row per shop (Carter Vintage, Reverb,
// Sweetwater, …) — the logo / bio / location / cover live here so editing
// once propagates across every instrument that links to this vendor.
// `domain` is the canonical dedup key (lowercased hostname, no www).
export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  homeUrl: text("home_url"),
  aboutUrl: text("about_url"),
  logoUrl: text("logo_url"),
  // Curation lock on `logoUrl`. When true, automated paths (favicon
  // backfills, "re-scrape from website" enrichment, any future logo
  // enrichment job) MUST skip writing `logoUrl` — the operator has
  // explicitly curated it. Explicit admin writes (PUT /api/admin/vendors/:id
  // with a new `logoUrl`) bypass the lock; locks are about automation,
  // not editability. Mirrors `people.photoLocked` / `people.coverLocked`.
  logoLocked: boolean("logo_locked").notNull().default(false),
  tagline: text("tagline"),
  bio: text("bio"),
  location: text("location"),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Join row attaching a vendor to an instrument with a per-instrument
// product URL. Vendor metadata lives on `vendors`; only the things that
// vary per-instrument live here.
export const instrumentVendors = pgTable("instrument_vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instrumentId: varchar("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  affiliateUrl: text("affiliate_url").notNull(),
  position: integer("position").notNull().default(0),
  // Demo show/hide flag — hides this vendor's "Buy / Discover more" button
  // from the fan-facing InstrumentSheet on THIS instrument only, so it
  // doesn't look like we're promoting a competitor during a different
  // vendor's pitch. Per-attachment, not per-vendor.
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ----- SuperCredits™ song credits (linking layer) -----------------------
// Each song has any number of writers + performers. Both rows store a
// `name` snapshot so credits keep rendering after a Person is removed
// (historical credits, muso.ai imports of people not in our roster).
// FK delete policy:
//   - songId → CASCADE              (credits row is meaningless without song)
//   - personId → SET NULL           (name snapshot preserves display)
//   - instrumentId → SET NULL       (performance keeps person, loses gear)
export const trackWriters = pgTable("track_writers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Composer" / "Lyricist" / "Producer"
  position: integer("position").notNull().default(0),
});

export const trackPerformers = pgTable("track_performers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  instrumentId: varchar("instrument_id").references(() => instruments.id, { onDelete: "set null" }),
  name: text("name").notNull(), // snapshot of person.name at credit time
  role: text("role").notNull(), // "Guitar" / "Bass" / "Composer · Violin"
  tuningNotes: text("tuning_notes"), // "DADGAD", "Dropped D, capo 3"
  position: integer("position").notNull().default(0),
});

// Album-wide production credits — Producer / Mixed by / Mastered by /
// Recording Engineer / Executive Producer / A&R / Arranged by. These
// apply to the album as a whole (or "all tracks except…") rather than a
// single song, which trackWriters/trackPerformers don't model cleanly.
// Same delete policy as track credits: album CASCADE, person SET NULL
// with a name snapshot so deleting a Person row doesn't blank historical
// credits. Rendered at the bottom of the album credits sheet on the fan
// side and also reused as the "Album credits" review section in the
// credits importer.
export const albumCredits = pgTable("album_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  position: integer("position").notNull().default(0),
});

// ----- Organizations (labels-publishers as legal entities) --------------
// A muso-style "Organizations" credit (Record Label, Publisher, PRO, etc.)
// is a *legal entity*, not a person. We already have a richer `labels` table
// for record labels we actually release on — `organizations` is the broader
// catch-all: any company that needs to show up on a publishing/mechanical
// split (publishers, sub-publishers, admin shops, distributors, sometimes a
// label not yet promoted into `labels`). `musoId` is captured when imported
// so re-imports dedup. `kind` is a free text tag for now ("label",
// "publisher", "pro", …) — promotable to an enum once we stop discovering
// new shapes.
export const organizations = pgTable(
  "organizations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // "label" | "publisher" | "pro" | "distributor" | …
    musoId: text("muso_id"),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    // Optional FK promoting an Organization that's also a GoodTunes-tracked
    // label into the richer `labels` row — so admins editing the label there
    // don't need to keep two records in sync.
    labelId: varchar("label_id").references(() => labels.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    // Mirrors the partial unique index created in
    // scripts/migrate-muso-tables.sql — keeps the Drizzle schema and the live
    // DB invariants aligned so a future `drizzle-kit push` doesn't see drift.
    musoIdUniq: uniqueIndex("organizations_muso_id_uniq")
      .on(t.musoId)
      .where(sql`${t.musoId} IS NOT NULL`),
  }),
);

// ----- Mechanical (master-side) splits ----------------------------------
// Per-track percentage split of the *recording* (master) revenue — the
// "mechanical" side of the song. Rows can credit either a Person (artist,
// session player who negotiated points) or an Organization (label, distrib).
// Percentages are stored as integer basis-points (12.5% → 1250) to dodge
// float drift; UI divides by 100 for display. Sum across a song SHOULD be
// 10000 but isn't enforced in DB — admin tooling validates. Admin-only
// surface: never returned to the fan-side credits endpoint.
export const trackMechanicalSplits = pgTable("track_mechanical_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Featured Artist" / "Label" / "Distributor" / …
  percentBp: integer("percent_bp").notNull().default(0),
  position: integer("position").notNull().default(0),
});

// ----- Publishing (writers-side) splits ---------------------------------
// Per-track percentage split of the *composition* (publishing) revenue —
// the songwriter / publisher side. Each row also captures the PRO the
// writer is affiliated with so reporting can roll up by society (ASCAP /
// BMI / SESAC / PRS / SOCAN / …). Same basis-points convention. Admin-only.
export const trackPublishingSplits = pgTable("track_publishing_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Writer" / "Co-Writer" / "Publisher" / "Sub-Publisher"
  proAffiliation: text("pro_affiliation"), // "ASCAP" | "BMI" | "SESAC" | "PRS" | …
  percentBp: integer("percent_bp").notNull().default(0),
  position: integer("position").notNull().default(0),
});

// ----- Credit role catalog ----------------------------------------------
// A searchable, growable list of roles the admin can assign on track-level
// credits. `kind` tells the system which underlying table a credit belongs
// in when saved:
//   • "writer"    → row lives in track_writers  (Composer, Lyricist, …)
//   • "performer" → row lives in track_performers (Guitar, Lead vocal, …)
// We seed the table lazily with industry-standard roles on first read.
// Admins can create new ones inline from the credits picker — pick a
// kind, give it a name, save. Unique on `name` so a typo'd duplicate
// surfaces as a clean upsert rather than two near-identical rows.
//
// Future use: a `person_roles` join (or `roles[]` on people) can pull
// from the same table to categorize people as Singer-Songwriters,
// Producers, etc. on the artist-list/filter surfaces.
export const creditRoles = pgTable(
  "credit_roles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(), // "writer" | "performer"
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    kindNameUnique: unique("credit_roles_kind_name_unique").on(t.kind, t.name),
  }),
);

// Bearer token store (replaces in-memory tokenStore).
//
// `kind` tags the side this token belongs to. Today's tokens were minted
// against the `users` table which is the admin table going forward, so
// pre-existing rows are implicitly `admin`. Customer tokens reference
// `customer_users.id` (no FK because Drizzle pgTable can't express
// "FK to one of two tables", and we want kind to be the authoritative
// switch anyway — the server always reads tokens through the kind+id
// pair via the storage layer).
export const authTokens = pgTable("auth_tokens", {
  token: varchar("token").primaryKey(),
  userId: varchar("user_id").notNull(),
  kind: text("kind").notNull().default("admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────────
// Task #31 — Dual auth (admin + customer)
//
// `users` is the admin table going forward (existing rows = admins). A
// separate `customer_users` table holds fan accounts. The two tables
// NEVER share rows; the same email can exist on both sides as two
// independent accounts. `*_identities` tables link Google/Apple OAuth
// subjects to a user row on that same side. `admin_totp` stores the
// admin-only second factor.
//
// We deliberately did NOT rename `users` → `admin_users` because doing
// so would require migrating 7+ existing FKs (playlists, user_albums,
// profile_photos, analytics_events, etc.) — far more invasive than the
// product change requires. The table name stays; the role does not.
// ──────────────────────────────────────────────────────────────────────────

export const customerUsers = pgTable("customer_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  realName: text("real_name"),
  // Nullable: OAuth-only customers never set a password.
  password: text("password"),
  // Task #44 — Stripe-backed identity columns. The Stripe Customer is the
  // source of truth for legal name + addresses + phone; webhook handlers
  // backfill these columns on payment success. realName/displayName above
  // remain user-editable on the profile; the Stripe-backed `billing*` +
  // `shipping*` snapshots are append-only history.
  stripeCustomerId: text("stripe_customer_id").unique(),
  billingAddress: jsonb("billing_address").$type<StripeAddressSnapshot>(),
  shippingAddress: jsonb("shipping_address").$type<StripeAddressSnapshot>(),
  phone: text("phone"),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// JSON shape we persist for billing/shipping snapshots. Matches the subset
// of Stripe's Address object we actually read on receipts + cert prints.
export type StripeAddressSnapshot = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

// 6-digit email verification codes. Issued when a guest types an email at
// the Buy-flow signup gate; the code lands in their inbox and proves the
// address before a password / Stripe customer ever gets attached. Stored
// as scrypt-hashed strings so a DB leak can't be replayed. Expire in 15m;
// `attempts` caps brute force; `consumedAt` is non-null after a successful
// verification so the row can't be redeemed twice.
export const emailVerifications = pgTable("email_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Commerce (Task #44) ─────────────────────────────────────────────────
// Album SKUs: per-album, per-physical-format rows. The fan-side Buy sheet
// reads `active=true` rows for an album to populate the format picker, and
// the admin "Sell this album" panel writes here. We keep this table narrow
// (format type + price + stock + active) because price + design rules vary
// per album, not per global format catalog.
//
// `format` is a closed enum at the API edge (see `ALBUM_FORMAT` below);
// the column stays `text` so future formats land without a migration.
export const albumSkus = pgTable(
  "album_skus",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    priceCents: integer("price_cents").notNull(),
    // null = unlimited stock; non-null = decrement on successful order.
    stock: integer("stock"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    albumFormatUnique: unique("album_skus_album_format_unique").on(t.albumId, t.format),
  }),
);

// Generic per-album add-on. First user: the **signed_cert** add-on (printed
// & signed GoodDeed certificate). Future shapes (professional framing,
// full-album-sized framed GoodDeed with QR provenance) drop in here as new
// `kind` values without a migration rewrite. `minPriceCents` is the per-
// album floor the artist can't price below; `priceCents` is what they
// chose for this album.
export const albumAddons = pgTable(
  "album_addons",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    priceCents: integer("price_cents").notNull(),
    minPriceCents: integer("min_price_cents").notNull().default(0),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    albumKindUnique: unique("album_addons_album_kind_unique").on(t.albumId, t.kind),
  }),
);

// Orders. One row per Stripe Checkout Session that completed payment.
// Idempotent writes are keyed on `stripeCheckoutSessionId` (and also
// `stripePaymentIntentId` once Stripe attaches one) so webhook replays
// don't double-write. Status lifecycle: pending → paid → shipped (or
// → refunded at any point). `goodDeedNumber` is assigned at paid-time
// (atomically picking the next number for the album) and voided on
// refund. Address + buyer snapshots are duplicated here so a later
// customer-profile edit doesn't rewrite history.
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customerUsers.id),
  albumId: varchar("album_id").notNull().references(() => albums.id),
  totalCents: integer("total_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  status: text("status").notNull().default("pending"),
  shippingAddress: jsonb("shipping_address").$type<StripeAddressSnapshot>(),
  billingAddress: jsonb("billing_address").$type<StripeAddressSnapshot>(),
  buyerEmail: text("buyer_email"),
  buyerName: text("buyer_name"),
  buyerPhone: text("buyer_phone"),
  goodDeedNumber: integer("good_deed_number"),
  shippedAt: timestamp("shipped_at"),
  refundedAt: timestamp("refunded_at"),
  // Task #46 — gifting. Nullable FK to the gifts row when this order was
  // bought as a gift. Lets the buyer's order list + admin orders view
  // pull the gift status without a separate query.
  giftId: varchar("gift_id"),
  // ─── Task #48 — Stripe Connect payouts ────────────────────────────
  // Lifecycle: null → "pending" (paid, awaiting ship) → "transferred"
  // (ship triggered a Connect Transfer) → "reversed" (refund reversed
  // the transfer). "skipped" means we shipped but had no connected
  // account to pay (operator must reconcile manually). "failed" means
  // we tried the transfer and Stripe rejected it — surfaced in the
  // stuck-cases dashboard with the error string.
  payoutStatus: text("payout_status"),
  payoutTransferId: text("payout_transfer_id"),
  // Amount transferred to the connected account, in cents. Equals
  // `totalCents - platformFeeCents - certCostCents` at transfer time.
  // Snapshotted so a later settings change can't rewrite history.
  payoutAmountCents: integer("payout_amount_cents"),
  platformFeeCents: integer("platform_fee_cents"),
  certCostCents: integer("cert_cost_cents"),
  // Which connected-account owner received the payout. Mirrors
  // payout_accounts.ownerKind / ownerId so the admin order row can
  // deep-link to the recipient even if the album's owner later changes.
  payoutOwnerKind: text("payout_owner_kind"),
  payoutOwnerId: varchar("payout_owner_id"),
  payoutAt: timestamp("payout_at"),
  payoutError: text("payout_error"),
  // ─── Task #49 — order origin ───────────────────────────────────────
  // "direct"            → bought on goodtunes.music via Stripe Checkout
  // "shopify:<storeId>" → bought on a label's Shopify store; webhook
  //                       arrived at /api/webhooks/shopify/orders.
  // Existing rows backfill to "direct" via column default. Order surfaces
  // (fan + admin) read this to render the origin badge.
  origin: text("origin").notNull().default("direct"),
  // FK to shopify_stores when origin starts with "shopify:". Null for
  // direct orders. Lets admin lists join to store_name without parsing
  // the origin string.
  shopifyStoreId: varchar("shopify_store_id"),
  // Shopify's numeric order id (stringified). Unique across the system
  // so a replayed `orders/paid` webhook is a no-op. Null for direct.
  shopifyOrderId: text("shopify_order_id").unique(),
  // Task #49 — Shopify's per-order unguessable token (`order.token` on the
  // payload, also exposed to the order-status-page JS as
  // Shopify.checkout.token). We require it on the public redemption-by-
  // order endpoint so possession of an order id alone isn't enough to
  // pull the redemption code; the buyer also has to be on their own
  // order status page (where Shopify hands them the token).
  shopifyOrderToken: text("shopify_order_token"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Task #49 — Shopify redemption flow ─────────────────────────────────
// One row per Shopify store that has installed the GoodTunes app. We
// store the offline access token Shopify hands us at OAuth callback so
// later admin calls (script-tag install, refund queries) can authenticate
// without the operator re-clicking through the install flow. v1 stores
// the token in plaintext — pre-production we should envelope-encrypt it
// like admin_totp.secretEncrypted.
export const shopifyStores = pgTable("shopify_stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // The myshopify.com domain (e.g. "tim-snider-records.myshopify.com").
  // Unique because Shopify's OAuth handshake is per-shop and a re-install
  // overwrites the same row.
  shopDomain: text("shop_domain").notNull().unique(),
  // Display name of the store, pulled from /admin/api/.../shop.json on
  // install so admin lists don't have to make a live call.
  storeName: text("store_name"),
  accessToken: text("access_token").notNull(),
  scopes: text("scopes"),
  // Set when the store calls app/uninstalled. We keep the row (for
  // historical order joins) but clear accessToken and stamp this column
  // so admin UI can render "Disconnected" without losing the linkage.
  installedAt: timestamp("installed_at").defaultNow(),
  uninstalledAt: timestamp("uninstalled_at"),
});

// Mapping a Shopify product (or specific variant) on a connected store
// to a GoodTunes album. One row per (storeId, productId, variantId).
// `offerSignedCert` toggles whether the label is bundling a printed +
// signed GoodDeed certificate into the same Shopify order — the price
// label sets here is enforced at webhook time against the album's
// per-album minimum floor (album_addons.signed_cert.minPriceCents).
export const shopifyProductMappings = pgTable(
  "shopify_product_mappings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    storeId: varchar("store_id")
      .notNull()
      .references(() => shopifyStores.id, { onDelete: "cascade" }),
    // Both ids stored as strings — Shopify uses int64 ids that overflow
    // JS numbers in some cases, so always treat them as strings.
    shopifyProductId: text("shopify_product_id").notNull(),
    // null variantId = match every variant of the product (label hasn't
    // split formats into separate variants; the album maps the whole
    // product). Required for products with multiple variants where the
    // label wants different albums per variant — they create one mapping
    // per variant id instead.
    shopifyVariantId: text("shopify_variant_id"),
    // Snapshot for the admin list ("Bundled with: ‹product title›")
    // so we don't round-trip Shopify on every render.
    shopifyProductTitle: text("shopify_product_title"),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    offerSignedCert: boolean("offer_signed_cert").notNull().default(false),
    // Price the label is selling the cert for inside the Shopify cart.
    // Subject to the album's min floor — webhook discards values below.
    signedCertPriceCents: integer("signed_cert_price_cents"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  // No table-level uniqueness here — Postgres treats NULL variantId as
  // distinct from every other NULL, so a single 3-col unique constraint
  // would let product-wide mappings (variantId=null) duplicate. Instead
  // we maintain two PARTIAL unique indexes via raw SQL migration:
  //   * shopify_mapping_unique_with_variant: (store, product, variant)
  //       WHERE variant IS NOT NULL
  //   * shopify_mapping_unique_product_wide: (store, product)
  //       WHERE variant IS NULL
  // Drizzle's table builder doesn't model partial indexes today, so
  // these live in code-managed SQL alongside the upsert in
  // server/shopify.ts (which uses a manual select-then-update-or-insert
  // because Postgres requires the conflict target to match exactly one
  // of the two partial indexes).
);

// One-time redemption code minted at orders/paid webhook time. The code
// is the path component on /redeem/<code> — both the order-status-page
// script and the email template button deep-link to it. We don't hash
// it (unlike admin OTPs) because the code IS the secret being mailed to
// the fan, and order resolution requires the raw string anyway. Long
// enough (16 hex chars = 64 bits) that brute force is uneconomical.
export const shopifyRedemptionCodes = pgTable("shopify_redemption_codes", {
  code: varchar("code").primaryKey(),
  orderId: varchar("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" })
    .unique(),
  // Filled when /redeem/:code lands the fan in the player. Idempotent —
  // a second click just signs them in to the already-claimed account.
  redeemedAt: timestamp("redeemed_at"),
  redeemedByUserId: varchar("redeemed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Task #46 — Gifting. One row per gifted order. Created when the buyer
// taps "This is a gift" on the order-confirmation screen. `claimToken`
// is the shareable secret embedded in /gift/:token. When the recipient
// signs in/up and claims, `claimedByUserId` + `claimedAt` get filled,
// AND the parent order.customerId + matching user_albums.userId both
// move to the claimer so the certificate + library follow the gift.
// `expiresAt` is suggested 30 days from creation; the buyer can re-send
// (rotates `claimToken`) or change the recipient within 24h.
export const gifts = pgTable("gifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }).unique(),
  buyerUserId: varchar("buyer_user_id").notNull().references(() => customerUsers.id),
  recipientFirstName: text("recipient_first_name").notNull(),
  recipientLastName: text("recipient_last_name").notNull(),
  recipientEmail: text("recipient_email"),
  recipientPhone: text("recipient_phone"),
  claimToken: text("claim_token").notNull().unique(),
  claimedByUserId: varchar("claimed_by_user_id").references(() => customerUsers.id),
  claimedAt: timestamp("claimed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  // Bookkeeping for "Sent / Resent" admin pill — increments each resend.
  resendCount: integer("resend_count").notNull().default(0),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stripe Connect (Express) account attached to a People row or a
// Label row. Pair (ownerKind, ownerId) is unique — each artist or
// label has at most one connected account. Created via
// POST /api/admin/payouts/accounts (operator-driven; no self-serve
// artist portal yet). `payoutsEnabled` + `chargesEnabled` mirror
// the Stripe account capability flags; we refresh them on demand
// (GET /accounts/:id/refresh) and on the `account.updated` webhook.
export const payoutAccounts = pgTable(
  "payout_accounts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerKind: text("owner_kind").notNull(),
    ownerId: varchar("owner_id").notNull(),
    stripeAccountId: text("stripe_account_id").notNull().unique(),
    country: text("country").notNull().default("US"),
    email: text("email"),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    detailsSubmitted: boolean("details_submitted").notNull().default(false),
    requirementsDue: jsonb("requirements_due").$type<string[]>(),
    disabledReason: text("disabled_reason"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    ownerUnique: unique("payout_accounts_owner_unique").on(t.ownerKind, t.ownerId),
  }),
);

// Singleton settings row (id = 'default'). Platform fee + per-order
// certificate cost are global defaults; per-album overrides live on
// the `albums` table (see payoutFeePctOverride / payoutCertCentsOverride).
export const payoutSettings = pgTable("payout_settings", {
  id: varchar("id").primaryKey().default("default"),
  platformFeePct: integer("platform_fee_pct").notNull().default(10),
  certCostCents: integer("cert_cost_cents").notNull().default(500),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// One row per line item on an order. `kind` is "format" (the physical SKU
// the fan picked) or "addon" (signed_cert today, framing/etc. later).
// `label` is a human snapshot — even if the SKU row is later renamed in
// admin, the receipt + order history keep reading the original label.
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  sku: text("sku").notNull(),
  label: text("label").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminIdentities = pgTable(
  "admin_identities",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "google" | "apple"
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    linkedAt: timestamp("linked_at").defaultNow(),
  },
  (t) => ({
    providerSubUnique: unique("admin_identities_provider_sub_unique").on(t.provider, t.providerUserId),
  }),
);

export const customerIdentities = pgTable(
  "customer_identities",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    linkedAt: timestamp("linked_at").defaultNow(),
  },
  (t) => ({
    providerSubUnique: unique("customer_identities_provider_sub_unique").on(t.provider, t.providerUserId),
  }),
);

// TOTP second factor for admin sign-in. One row per admin user.
// `secretEncrypted` is AES-256-GCM-encrypted at rest with TOTP_ENC_KEY
// so a DB dump alone can't be used to generate codes.
// `recoveryCodes` is an array of scrypt-hashed single-use codes; each
// hash is removed after consumption.
export const adminTotp = pgTable("admin_totp", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  secretEncrypted: text("secret_encrypted").notNull(),
  recoveryCodes: text("recovery_codes").array().notNull().default(sql`'{}'::text[]`),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
});

// Task #57 — Email-a-code admin sign-in.
// One row per admin currently mid-sign-in: holds the scrypt-hashed
// 6-digit code, its expiry, and the attempt counter. The row is deleted
// the moment the code verifies (or replaced when the admin asks for a
// fresh one). We only store ONE active code at a time — issuing a new
// code invalidates the previous one, which is what users expect from
// "didn't get it, resend".
//
// Phone number is intentionally absent: SMS delivery is out of scope for
// this task. When SMS lands we add `phoneE164` here and branch on
// channel at issue time — no other shape change needed.
export const adminEmailOtp = pgTable("admin_email_otp", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastSentAt: timestamp("last_sent_at").defaultNow(),
});

export type CustomerUser = typeof customerUsers.$inferSelect;
export type AdminIdentity = typeof adminIdentities.$inferSelect;
export type CustomerIdentity = typeof customerIdentities.$inferSelect;
export type AdminTotp = typeof adminTotp.$inferSelect;
export type AdminEmailOtp = typeof adminEmailOtp.$inferSelect;

export const insertCustomerUserSchema = createInsertSchema(customerUsers).pick({
  username: true,
  email: true,
  displayName: true,
  realName: true,
  password: true,
});
export type InsertCustomerUser = z.infer<typeof insertCustomerUserSchema>;

// One profile photo per user. Stored inline as a data URL so we don't need
// object storage yet — small images (5MB cap on the client). When GT object
// storage lands, swap dataUrl for a CDN URL on the same row.
export const profilePhotos = pgTable("profile_photos", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  dataUrl: text("data_url").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Server-side analytics event store (replaces the in-memory ring buffer).
// Indexed-loosely — for real reporting this gets rolled up nightly.
export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id"),
  name: text("name").notNull(),
  payload: json("payload").$type<Record<string, any>>(),
  ts: timestamp("ts").notNull(),
  sessionId: text("session_id"),
  userId: varchar("user_id"),
  receivedAt: timestamp("received_at").defaultNow(),
});

// Audit log for long-running admin jobs (Dropbox imports, GoodSync,
// etc.). One row per completed run. The summary jsonb captures the
// matched/unmatched/errors arrays so the agent can dig into what
// actually happened when Bill says "nothing imported." Status is
// success | partial | failed.
export const jobRuns = pgTable("job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull(),
  albumId: varchar("album_id"),
  songId: varchar("song_id"),
  status: text("status").notNull(),
  summary: jsonb("summary").$type<Record<string, any>>(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  displayName: true,
  realName: true,
  password: true,
});

export const insertAlbumSchema = createInsertSchema(albums);
export const insertSongSchema = createInsertSchema(songs);
export const insertPlaylistSchema = createInsertSchema(playlists).pick({ name: true });
export const insertPlaylistSongSchema = createInsertSchema(playlistSongs).pick({ songId: true, position: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type Song = typeof songs.$inferSelect;

export const insertPersonSchema = createInsertSchema(people).omit({ id: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

export const insertPersonDiscographySchema = createInsertSchema(personDiscography).omit({ id: true });
export type InsertPersonDiscography = z.infer<typeof insertPersonDiscographySchema>;
export type PersonDiscography = typeof personDiscography.$inferSelect;

export const insertInstrumentSchema = createInsertSchema(instruments).omit({ id: true });
export type InsertInstrument = z.infer<typeof insertInstrumentSchema>;
export type Instrument = typeof instruments.$inferSelect;

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

export const insertLabelSchema = createInsertSchema(labels).omit({ id: true, createdAt: true });
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type Label = typeof labels.$inferSelect;

export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true, finishedAt: true });
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;
export type JobRun = typeof jobRuns.$inferSelect;

export const insertAlbumVideoSchema = createInsertSchema(albumVideos).omit({ id: true });
export type InsertAlbumVideo = z.infer<typeof insertAlbumVideoSchema>;
export type AlbumVideo = typeof albumVideos.$inferSelect;

export const insertAlbumPhotoSchema = createInsertSchema(albumPhotos).omit({ id: true });
export type InsertAlbumPhoto = z.infer<typeof insertAlbumPhotoSchema>;
export type AlbumPhoto = typeof albumPhotos.$inferSelect;

// Album reads denormalize the joined label entity so the fan-facing UI can
// render label name/logo without a second fetch. `label` is null when an
// album has no labelId set or the label was deleted (FK SET NULL).
export type AlbumWithLabel = Album & { label: Label | null };

export const insertInstrumentVendorSchema = createInsertSchema(instrumentVendors).omit({ id: true, createdAt: true });
export type InsertInstrumentVendor = z.infer<typeof insertInstrumentVendorSchema>;
export type InstrumentVendor = typeof instrumentVendors.$inferSelect;

// Enriched shape returned by read joins (getInstruments / getSongCredits /
// getAlbumCredits). Keeps the flat fan-facing shape AlbumDetail.tsx and the
// admin UI expect, while adding `vendorId` + `domain` so admin write paths
// can route vendor-entity edits vs attachment edits to the correct endpoint.
export type EnrichedInstrumentVendor = {
  // attachment fields
  id: string;
  instrumentId: string;
  vendorId: string;
  affiliateUrl: string;
  position: number;
  isHidden: boolean;
  createdAt: Date | null;
  // vendor entity fields (flattened)
  name: string;
  domain: string;
  homeUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
};

export const insertTrackWriterSchema = createInsertSchema(trackWriters).omit({ id: true });
export type InsertTrackWriter = z.infer<typeof insertTrackWriterSchema>;
export type TrackWriter = typeof trackWriters.$inferSelect;

export const insertTrackPerformerSchema = createInsertSchema(trackPerformers).omit({ id: true });
export type InsertTrackPerformer = z.infer<typeof insertTrackPerformerSchema>;
export type TrackPerformer = typeof trackPerformers.$inferSelect;

export const insertAlbumCreditSchema = createInsertSchema(albumCredits).omit({ id: true });
export type InsertAlbumCredit = z.infer<typeof insertAlbumCreditSchema>;
export type AlbumCredit = typeof albumCredits.$inferSelect;

export const insertPersonAliasSchema = createInsertSchema(personAliases).omit({ id: true });
export type InsertPersonAlias = z.infer<typeof insertPersonAliasSchema>;
export type PersonAlias = typeof personAliases.$inferSelect;

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

export const insertTrackMechanicalSplitSchema = createInsertSchema(trackMechanicalSplits).omit({ id: true });
export type InsertTrackMechanicalSplit = z.infer<typeof insertTrackMechanicalSplitSchema>;
export type TrackMechanicalSplit = typeof trackMechanicalSplits.$inferSelect;

export const insertTrackPublishingSplitSchema = createInsertSchema(trackPublishingSplits).omit({ id: true });
export type InsertTrackPublishingSplit = z.infer<typeof insertTrackPublishingSplitSchema>;
export type TrackPublishingSplit = typeof trackPublishingSplits.$inferSelect;

export const insertCreditRoleSchema = createInsertSchema(creditRoles)
  .omit({ id: true, createdAt: true })
  .extend({
    // Kind is a closed enum on the API even though the column is text —
    // keeps junk like "engineer" or "" from sneaking in via direct POSTs.
    kind: z.enum(["writer", "performer"]),
    name: z.string().min(1).max(60),
  });
export type InsertCreditRole = z.infer<typeof insertCreditRoleSchema>;
export type CreditRole = typeof creditRoles.$inferSelect;
export type UserAlbum = typeof userAlbums.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

// ─── Commerce constants + insert schemas (Task #44) ──────────────────────
// Closed enum of formats the API accepts. The DB column stays text so a
// new format ships without a migration, but every write path validates
// against this list to keep the catalog clean. Labels rendered to the fan
// live in `ALBUM_FORMAT_LABEL` so admin + buy-sheet read identical copy.
export const ALBUM_FORMATS = ["7_inch", "12_lp", "12_double", "cassette", "cd"] as const;
export type AlbumFormat = (typeof ALBUM_FORMATS)[number];
export const ALBUM_FORMAT_LABEL: Record<AlbumFormat, string> = {
  "7_inch": '7" Single',
  "12_lp": '12" LP',
  "12_double": '12" Double LP',
  cassette: "Cassette",
  cd: "CD",
};
// Closed enum of add-on kinds. Today the only shipped add-on is the
// printed & signed GoodDeed certificate (`signed_cert`). Future shapes
// (`framing`, `framed_gooddeed_qr`) drop in here without a schema change.
export const ALBUM_ADDON_KINDS = ["signed_cert"] as const;
export type AlbumAddonKind = (typeof ALBUM_ADDON_KINDS)[number];
export const ALBUM_ADDON_LABEL: Record<AlbumAddonKind, string> = {
  signed_cert: "Printed & Signed GoodDeed Certificate",
};

export const insertAlbumSkuSchema = createInsertSchema(albumSkus)
  .omit({ id: true, createdAt: true })
  .extend({
    format: z.enum(ALBUM_FORMATS),
    priceCents: z.number().int().min(0),
    stock: z.number().int().min(0).nullable().optional(),
  });
export type InsertAlbumSku = z.infer<typeof insertAlbumSkuSchema>;
export type AlbumSku = typeof albumSkus.$inferSelect;

export const insertAlbumAddonSchema = createInsertSchema(albumAddons)
  .omit({ id: true, createdAt: true })
  .extend({
    kind: z.enum(ALBUM_ADDON_KINDS),
    priceCents: z.number().int().min(0),
    minPriceCents: z.number().int().min(0),
  })
  .refine((d) => d.priceCents >= d.minPriceCents, {
    message: "Price must be at or above the per-album minimum",
    path: ["priceCents"],
  });
export type InsertAlbumAddon = z.infer<typeof insertAlbumAddonSchema>;
export type AlbumAddon = typeof albumAddons.$inferSelect;

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, createdAt: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// Task #46 — gift create/update inputs. Recipient name fields are
// required; contact is "at least one of email/phone" — enforced at the
// route layer because zod refinement on createInsertSchema makes the
// type ergonomics awkward downstream.
export const insertGiftSchema = createInsertSchema(gifts).omit({
  id: true,
  claimToken: true,
  claimedByUserId: true,
  claimedAt: true,
  resendCount: true,
  lastSentAt: true,
  createdAt: true,
});
export type InsertGift = z.infer<typeof insertGiftSchema>;
export type Gift = typeof gifts.$inferSelect;

// ─── Task #48 — Stripe Connect payouts ──────────────────────────────────
export const PAYOUT_OWNER_KINDS = ["person", "label"] as const;
export type PayoutOwnerKind = (typeof PAYOUT_OWNER_KINDS)[number];

export const insertPayoutAccountSchema = createInsertSchema(payoutAccounts)
  .omit({ id: true, createdAt: true, lastSyncedAt: true })
  .extend({
    ownerKind: z.enum(PAYOUT_OWNER_KINDS),
  });
export type InsertPayoutAccount = z.infer<typeof insertPayoutAccountSchema>;
export type PayoutAccount = typeof payoutAccounts.$inferSelect;
export type PayoutSettings = typeof payoutSettings.$inferSelect;

export type EmailVerification = typeof emailVerifications.$inferSelect;

// ─── Task #49 — Shopify redemption flow ─────────────────────────────────
export const insertShopifyStoreSchema = createInsertSchema(shopifyStores).omit({
  id: true,
  installedAt: true,
  uninstalledAt: true,
});
export type InsertShopifyStore = z.infer<typeof insertShopifyStoreSchema>;
export type ShopifyStore = typeof shopifyStores.$inferSelect;

export const insertShopifyProductMappingSchema = createInsertSchema(shopifyProductMappings)
  .omit({ id: true, createdAt: true })
  .extend({
    shopifyProductId: z.string().min(1),
    signedCertPriceCents: z.number().int().min(0).nullable().optional(),
  });
export type InsertShopifyProductMapping = z.infer<typeof insertShopifyProductMappingSchema>;
export type ShopifyProductMapping = typeof shopifyProductMappings.$inferSelect;

export type ShopifyRedemptionCode = typeof shopifyRedemptionCodes.$inferSelect;
