import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, boolean, uniqueIndex } from "drizzle-orm/pg-core";
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
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const albums = pgTable("albums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  artwork: text("artwork").notNull(),
  year: integer("year"),
  type: text("type").notNull().default("album"),
  description: text("description"),
  // The label this album was released on. SET NULL so deleting a label
  // doesn't take down its catalog; the album just loses its label credit
  // until reassigned. Album reads denormalize the joined label entity
  // into `album.label` so the fan side can render it without a 2nd fetch.
  labelId: varchar("label_id").references(() => labels.id, { onDelete: "set null" }),
  // Demo show/hide flag. When true the album is excluded from public catalog
  // reads (album list + detail) AND from the fan-facing credits surface,
  // effectively hiding the artist + all their songs/credits in one toggle.
  // Admin endpoints keep returning hidden rows so the CMS can flip them back.
  isHidden: boolean("is_hidden").notNull().default(false),
  // Streaming-service handoff. We host the album in-app for the first ~2 weeks
  // then surface "Listen on Apple Music / Spotify" buttons on the album page
  // that point fans at the canonical album URL on each service — same
  // referral logic as the per-artist links on `people`.
  appleMusicUrl: text("apple_music_url"),
  spotifyUrl: text("spotify_url"),
});

export const songs = pgTable("songs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id),
  title: text("title").notNull(),
  trackNumber: integer("track_number").notNull(),
  duration: integer("duration").notNull().default(180),
  lyrics: text("lyrics"),
  audioUrl: text("audio_url"),
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
  bio: text("bio"),
  // HSL-friendly hex from the brand palette for the initial-circle avatar
  // fallback (#319ED8, #7F10A7, #4AFFCA, #FF5470).
  accent: text("accent"),
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

export const insertInstrumentSchema = createInsertSchema(instruments).omit({ id: true });
export type InsertInstrument = z.infer<typeof insertInstrumentSchema>;
export type Instrument = typeof instruments.$inferSelect;

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

export const insertLabelSchema = createInsertSchema(labels).omit({ id: true, createdAt: true });
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type Label = typeof labels.$inferSelect;

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
export type UserAlbum = typeof userAlbums.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
