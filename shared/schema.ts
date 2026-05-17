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
  logoUrl: text("logo_url"),
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
  // Release format. One of "Single" (1–2 tracks, the 7" equivalent),
  // "EP" (3–7 tracks), "LP" (8+ tracks, the full-length record). Legacy
  // rows used "album" — migrated to "LP" on the 2026-05 schema bump.
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
  // Per-line WebVTT-derived timing. Uploaded by admin as a .vtt file,
  // parsed client-side into { timeMs, text } cues. When present, the
  // Player's lyrics overlay uses these timestamps verbatim instead of
  // auto-distributing the plain-text `lyrics` field across duration.
  syncedLyrics: jsonb("synced_lyrics").$type<{ timeMs: number; text: string }[]>(),
  // Marks a track that has no lyrics by design (instrumental / interlude /
  // outro). The Lyrics status dot then reads "intentionally none" (grey
  // Ban glyph) instead of "missing" (empty grey ring). Default false.
  instrumental: boolean("instrumental").notNull().default(false),
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
export const authTokens = pgTable("auth_tokens", {
  token: varchar("token").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

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
