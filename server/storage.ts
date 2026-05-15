import {
  type User,
  type InsertUser,
  type Album,
  type Song,
  type Playlist,
  type PlaylistSong,
  type UserAlbum,
  type Person,
  type InsertPerson,
  type PersonDiscography,
  type InsertPersonDiscography,
  type Instrument,
  type InsertInstrument,
  type InstrumentVendor,
  type InsertInstrumentVendor,
  type Vendor,
  type InsertVendor,
  type Label,
  type InsertLabel,
  type AlbumVideo,
  type InsertAlbumVideo,
  type AlbumPhoto,
  type InsertAlbumPhoto,
  type AlbumWithLabel,
  type EnrichedInstrumentVendor,
  type TrackWriter,
  type InsertTrackWriter,
  type TrackPerformer,
  type InsertTrackPerformer,
  type CreditRole,
  type InsertCreditRole,
  users,
  albums,
  songs,
  userAlbums,
  playlists,
  playlistSongs,
  authTokens,
  profilePhotos,
  analyticsEvents,
  people,
  personDiscography,
  instruments,
  instrumentVendors,
  vendors,
  labels,
  trackWriters,
  trackPerformers,
  creditRoles,
  albumVideos,
  albumPhotos,
} from "@shared/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  // `includeHidden` is honored only by admin call sites — public reads
  // always pass false so demo-hidden albums vanish from the fan catalog.
  // Album reads denormalize the joined label entity into `album.label` so
  // the fan side can render label name/logo without a second fetch.
  getAlbums(opts?: { includeHidden?: boolean }): Promise<AlbumWithLabel[]>;
  getAlbumById(id: string, opts?: { includeHidden?: boolean }): Promise<AlbumWithLabel | undefined>;
  getSongsByAlbum(albumId: string): Promise<Song[]>;
  getSongById(id: string): Promise<Song | undefined>;
  getUserAlbums(userId: string): Promise<(UserAlbum & { album: Album })[]>;

  // CMS mutations (admin-only at the route layer).
  createAlbum(data: Omit<Album, "id"> & { id?: string }): Promise<Album>;
  updateAlbum(id: string, data: Partial<Album>): Promise<Album | undefined>;
  deleteAlbum(id: string): Promise<void>;
  createSong(data: Omit<Song, "id"> & { id?: string }): Promise<Song>;
  updateSong(id: string, data: Partial<Song>): Promise<Song | undefined>;
  deleteSong(id: string): Promise<void>;

  // Bonus album content. Public reads expose only the rows attached to
  // the requested album; admin writes are scoped per-row. Cascade on
  // album delete keeps orphan rows out of the DB.
  listAlbumVideos(albumId: string): Promise<AlbumVideo[]>;
  createAlbumVideo(data: InsertAlbumVideo): Promise<AlbumVideo>;
  updateAlbumVideo(id: string, data: Partial<AlbumVideo>): Promise<AlbumVideo | undefined>;
  deleteAlbumVideo(id: string): Promise<void>;
  listAlbumPhotos(albumId: string): Promise<AlbumPhoto[]>;
  createAlbumPhoto(data: InsertAlbumPhoto): Promise<AlbumPhoto>;
  updateAlbumPhoto(id: string, data: Partial<AlbumPhoto>): Promise<AlbumPhoto | undefined>;
  deleteAlbumPhoto(id: string): Promise<void>;

  // Admin bootstrap
  countAdmins(): Promise<number>;
  setUserAdmin(userId: string, isAdmin: boolean): Promise<void>;
  // Atomically grant admin to `userId` iff no admin currently exists. Returns
  // true if this caller claimed the slot, false if an admin already existed.
  tryClaimFirstAdmin(userId: string): Promise<boolean>;

  // SuperCredits™ catalog
  getPeople(): Promise<Person[]>;
  getPersonById(id: string): Promise<Person | undefined>;
  createPerson(data: InsertPerson & { id?: string }): Promise<Person>;
  updatePerson(id: string, data: Partial<Person>): Promise<Person | undefined>;
  deletePerson(id: string): Promise<void>;

  // Apple Music discography for a Person, mirrored from the admin's
  // iTunes Lookup pull. Replace-all on every persist (admin scrape is
  // the single source of truth — partial diffs would just diverge from
  // Apple). `getByArtistName` is the fan-side convenience used by
  // ArtistDetail, which is keyed by display name today.
  getDiscographyByPerson(personId: string): Promise<PersonDiscography[]>;
  getDiscographyByArtistName(name: string): Promise<PersonDiscography[]>;
  replaceDiscographyForPerson(personId: string, items: Omit<InsertPersonDiscography, "personId">[]): Promise<PersonDiscography[]>;

  // `includeHiddenVendors` is honored only by admin call sites — public
  // reads always pass false so hidden vendor buttons don't render in the
  // fan-side InstrumentSheet. Returned `vendors` are flat-enriched (vendor
  // metadata joined onto the attachment) so the client sees one shape.
  getInstruments(opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[] })[]>;
  getInstrumentById(id: string, opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[] }) | undefined>;
  createInstrument(data: InsertInstrument & { id?: string }): Promise<Instrument>;
  updateInstrument(id: string, data: Partial<Instrument>): Promise<Instrument | undefined>;
  deleteInstrument(id: string): Promise<void>;

  // Label ENTITY CRUD. Each album.labelId points here (nullable, SET NULL).
  // Editing the label propagates to every album released on it.
  getLabels(): Promise<Label[]>;
  getLabelById(id: string): Promise<Label | undefined>;
  createLabel(data: InsertLabel & { id?: string }): Promise<Label>;
  updateLabel(id: string, data: Partial<Label>): Promise<Label | undefined>;
  deleteLabel(id: string): Promise<void>;

  // Vendor ENTITY CRUD (one real-world vendor per row — Carter, Reverb, …).
  // Editing here propagates to every instrument the vendor is attached to.
  getVendors(): Promise<Vendor[]>;
  getVendorById(id: string): Promise<Vendor | undefined>;
  getVendorByDomain(domain: string): Promise<Vendor | undefined>;
  createVendor(data: InsertVendor & { id?: string }): Promise<Vendor>;
  updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor | undefined>;
  deleteVendor(id: string): Promise<void>;
  // Vendor profile reads — power the fan-facing VendorSheet tabs.
  // `getVendorInstruments` lists every (non-hidden) instrument attached to
  // this vendor. `getVendorSuperCreditArtists` derives artists by walking
  // track_performers → instruments → instrument_vendors, so any artist
  // credited as having played one of the vendor's instruments shows up.
  getVendorInstruments(vendorId: string): Promise<Instrument[]>;
  getVendorSuperCreditArtists(vendorId: string): Promise<Array<Person & { trackCount: number }>>;

  // Symmetric to the vendor version, but anchored on an instrument:
  // returns every artist credited (via SuperCredits) as having played
  // THIS instrument on a track. Powers the "Artists who play this" rail
  // on the fan-side InstrumentSheet.
  getInstrumentSuperCreditArtists(instrumentId: string): Promise<Array<Person & { trackCount: number }>>;

  // Every track this instrument is credited on, with album + person joined.
  // Powers the Tracks tab on the admin Instrument editor (and is a useful
  // building block for the fan-side instrument profile later).
  getInstrumentTracks(instrumentId: string): Promise<Array<{
    performerId: string;
    songId: string;
    songTitle: string;
    trackNumber: number;
    albumId: string;
    albumTitle: string;
    albumArtwork: string;
    albumYear: number | null;
    personId: string | null;
    personName: string;
    personPhotoUrl: string | null;
    role: string;
    tuningNotes: string | null;
  }>>;

  // Person profile — every (non-hidden) track this person is credited on
  // across the catalog, with album + (optional) instrument joined in. The
  // fan-side PerformerSheet derives both the Music and Gear tabs from this
  // single payload, so one round-trip powers the whole artist view.
  getPersonTracks(personId: string): Promise<Array<{
    performerId: string;
    songId: string;
    songTitle: string;
    trackNumber: number;
    albumId: string;
    albumTitle: string;
    albumArtwork: string;
    albumArtist: string;
    albumYear: number | null;
    role: string;
    tuningNotes: string | null;
    instrumentId: string | null;
    instrumentName: string | null;
    instrumentShortCategory: string | null;
    instrumentCategory: string | null;
    instrumentPhotoUrl: string | null;
  }>>;

  // Admin-only: every track the gear flow can attach this person to, plus
  // whatever credits they already have on each. "Assignable" means tracks
  // on albums where this person is the primary artist OR tracks where
  // they're already credited as a performer. Hidden albums are included
  // (admin needs to see everything they own).
  getPersonGearContext(personId: string): Promise<Array<{
    albumId: string;
    albumTitle: string;
    albumArtwork: string;
    albumYear: number | null;
    tracks: Array<{
      songId: string;
      title: string;
      trackNumber: number;
      performers: Array<{
        id: string;
        instrumentId: string | null;
        instrumentName: string | null;
        instrumentPhotoUrl: string | null;
        role: string;
        tuningNotes: string | null;
      }>;
    }>;
  }>>;

  // Attachment CRUD — only the per-instrument fields (affiliateUrl, position,
  // isHidden) live on the join row. Vendor metadata edits go through the
  // vendor-entity methods above.
  attachVendorToInstrument(data: {
    instrumentId: string;
    vendorId: string;
    affiliateUrl: string;
    position?: number;
    isHidden?: boolean;
  }): Promise<InstrumentVendor>;
  updateInstrumentVendorAttachment(
    id: string,
    data: { affiliateUrl?: string; position?: number; isHidden?: boolean },
  ): Promise<InstrumentVendor | undefined>;
  detachInstrumentVendor(id: string): Promise<void>;

  getSongCredits(songId: string): Promise<{
    writers: (TrackWriter & { person: Person | null })[];
    performers: (TrackPerformer & {
      person: Person | null;
      instrument: (Instrument & { vendors: EnrichedInstrumentVendor[] }) | null;
    })[];
  }>;
  // Same enriched shape as getSongCredits, but for every song on the album
  // in one round-trip. Keyed by songId; songs with no credits rows are
  // omitted (the client falls back to its static seed for those).
  getAlbumCredits(albumId: string): Promise<{
    bySongId: Record<string, {
      writers: (TrackWriter & { person: Person | null })[];
      performers: (TrackPerformer & {
        person: Person | null;
        instrument: (Instrument & { vendors: EnrichedInstrumentVendor[] }) | null;
      })[];
    }>;
  }>;
  createTrackWriter(data: InsertTrackWriter & { id?: string }): Promise<TrackWriter>;
  updateTrackWriter(id: string, data: Partial<TrackWriter>): Promise<TrackWriter | undefined>;
  deleteTrackWriter(id: string): Promise<void>;
  createTrackPerformer(data: InsertTrackPerformer & { id?: string }): Promise<TrackPerformer>;
  updateTrackPerformer(id: string, data: Partial<TrackPerformer>): Promise<TrackPerformer | undefined>;
  deleteTrackPerformer(id: string): Promise<void>;

  listCreditRoles(): Promise<CreditRole[]>;
  findOrCreateCreditRole(data: InsertCreditRole): Promise<CreditRole>;

  getPlaylists(userId: string): Promise<(Playlist & { artworks: string[]; songCount: number })[]>;
  getPlaylistById(id: string): Promise<Playlist | undefined>;
  createPlaylist(userId: string, name: string): Promise<Playlist>;
  updatePlaylist(id: string, name: string): Promise<Playlist | undefined>;
  deletePlaylist(id: string): Promise<void>;
  getPlaylistSongs(playlistId: string): Promise<(PlaylistSong & { song: Song & { album: Album } })[]>;
  addSongToPlaylist(playlistId: string, songId: string, position: number): Promise<PlaylistSong>;
  removeSongFromPlaylist(playlistId: string, songId: string): Promise<void>;

  // Auth tokens (bearer)
  createAuthToken(token: string, userId: string): Promise<void>;
  getUserIdByAuthToken(token: string): Promise<string | undefined>;
  deleteAuthToken(token: string): Promise<void>;

  // Profile photo
  getProfilePhoto(userId: string): Promise<string | null>;
  setProfilePhoto(userId: string, dataUrl: string): Promise<void>;
  deleteProfilePhoto(userId: string): Promise<void>;

  // Analytics
  insertAnalyticsEvents(rows: {
    clientId?: string;
    name: string;
    payload: Record<string, any>;
    ts: Date;
    sessionId?: string;
    userId?: string;
  }[]): Promise<void>;
  deleteAnalyticsForUser(userId: string): Promise<void>;
  getRecentAnalyticsForUser(userId: string, limit: number): Promise<any[]>;
}

// Seed catalog (albums + songs). Kept inline rather than imported from the
// client `musicData.ts` because that module pulls Vite-managed `@assets/*`
// imports that the server can't resolve. The catalog tables for people /
// instruments / vendors / credits land in the next phase along with the CMS.
const SEED_ALBUMS: Album[] = [
  { id: "album-1", title: "When the World Stops", artist: "Tim Snider & Wolfgang Timber", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png", year: 2024, type: "LP", description: "A sweeping collection of songs about stillness, change, and the moments between.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
  { id: "album-2", title: "Guitar as a Voice", artist: "Fernando Perdomo", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png", year: 2024, type: "LP", description: "Instrumental mastery meets emotional storytelling.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
  { id: "album-3", title: "Love Spell EP", artist: "Whitney Lyman", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png", year: 2024, type: "EP", description: "Four songs that cast a spell.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
  { id: "album-4", title: "California Way", artist: "TOMMYGUNN", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png", year: 2024, type: "LP", description: "Sunshine, highways, and the stories only California can tell.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
];

const SEED_SONGS: Song[] = [
  { id: "song-1-1", albumId: "album-1", title: "The Quiet Before", trackNumber: 1, duration: 214, lyrics: "In the space between the seconds\nWhere the clocks forget to breathe\nI found a version of the stillness\nThat I never thought to seek\n\nWhen the world stops, I'll be here\nWhen the world stops, I'll be near\nIn the silence that surrounds us\nIn the peace that comes to ground us\nWhen the world stops", audioUrl: null },
  { id: "song-1-2", albumId: "album-1", title: "Paper Sky", trackNumber: 2, duration: 198, lyrics: "Folded dreams on a paper sky\nWatching clouds that never ask you why\nEvery crease a memory sealed\nEvery line a wound that time has healed\n\nPaper sky, you hold my story\nPaper sky, in all your glory\nTear the edges, let the light in\nPaper sky, where do I begin", audioUrl: null },
  { id: "song-1-3", albumId: "album-1", title: "River North", trackNumber: 3, duration: 241, lyrics: "Heading north where the river bends\nWhere the old road meets its ends\nGot a map that's out of date\nAnd a heart that's running late\n\nRiver North, carry me through\nRiver North, I'm coming to you\nPast the valleys, past the stone\nRiver North, I'm almost home", audioUrl: null },
  { id: "song-1-4", albumId: "album-1", title: "Anchor", trackNumber: 4, duration: 187, lyrics: "You are my anchor in the gray\nWhen the tide would take me away\nI've been drifting all my life\nThrough the calm and through the strife\n\nBut you anchor me down\nYou anchor me here\nEvery time I'm drowning\nYou make the surface clear", audioUrl: null },
  { id: "song-1-5", albumId: "album-1", title: "Last Light", trackNumber: 5, duration: 223, lyrics: "Stand here in the last light\nWatch the day surrender gold\nEvery dusk a story\nEvery dusk a story told\n\nLast light on the water\nLast light on your face\nLast light of the summer\nFilling every space", audioUrl: null },
  { id: "song-1-6", albumId: "album-1", title: "When the World Stops", trackNumber: 6, duration: 265, lyrics: "Title track. Full circle, everything we said\nEverything we meant and didn't mean\nLaid out in the open like a bed\n\nWhen the world stops turning\nAnd the clocks stop running\nAnd there's nothing left to prove\nI'll still be here loving you", audioUrl: null },

  { id: "song-2-1", albumId: "album-2", title: "First Conversation", trackNumber: 1, duration: 193, lyrics: "[Instrumental]\nNo words needed. The guitar speaks what language cannot.", audioUrl: null },
  { id: "song-2-2", albumId: "album-2", title: "Dialogue in Blue", trackNumber: 2, duration: 247, lyrics: "[Instrumental]\nA conversation between melody and harmony.\nTwo voices, one instrument.", audioUrl: null },
  { id: "song-2-3", albumId: "album-2", title: "Confession", trackNumber: 3, duration: 178, lyrics: "[Instrumental]\nSometimes the things you can't say out loud\nFind their way through six strings.", audioUrl: null },
  { id: "song-2-4", albumId: "album-2", title: "The Answer", trackNumber: 4, duration: 209, lyrics: "[Instrumental]\nEvery question deserves an answer. This is mine.", audioUrl: null },
  { id: "song-2-5", albumId: "album-2", title: "Soliloquy", trackNumber: 5, duration: 234, lyrics: "[Instrumental]\nA solo piece in every sense of the word.", audioUrl: null },

  { id: "song-3-1", albumId: "album-3", title: "Love Spell", trackNumber: 1, duration: 197, lyrics: "You walked in like a summer storm\nChanged the shape of everything I thought I knew\nI was standing in the calm before\nAnd then I only wanted you\n\nYou put a love spell on me\nSomething I can't see\nEvery single word you say\nPulls me more your way", audioUrl: null },
  { id: "song-3-2", albumId: "album-3", title: "Golden Hour", trackNumber: 2, duration: 211, lyrics: "Wrap me in the golden hour light\nWhere the soft meets the bright\nAll the edges of the world go warm\nIn this small beautiful storm\n\nGolden hour, golden hour\nMake this moment last\nGolden hour, golden hour\nBefore it slips too fast", audioUrl: null },
  { id: "song-3-3", albumId: "album-3", title: "Magnetic", trackNumber: 3, duration: 188, lyrics: "North and south, push and pull\nBetween us nothing's neutral\nEvery time I try to step away\nYou pull me back, what can I say\n\nMagnetic, you and I\nMagnetic, I won't deny\nNo matter what direction that I go\nYou're always where I end up", audioUrl: null },
  { id: "song-3-4", albumId: "album-3", title: "Still Here", trackNumber: 4, duration: 224, lyrics: "After all the seasons we have been\nThrough the in-between\nAll the chapters that we wrote and crossed\n\nAnd I'm still here\nStill standing in your light\nStill here\nGetting through the night", audioUrl: null },

  { id: "song-4-1", albumId: "album-4", title: "Pacific Drive", trackNumber: 1, duration: 208, lyrics: "Windows down on the PCH\nSun burning through the morning haze\nGot the stereo up and nowhere to be\nJust the road and the ocean and me\n\nPacific drive, I'm alive\nOn this coast where the dreams survive\nEvery mile a story to tell\nOn the California spell", audioUrl: null },
  { id: "song-4-2", albumId: "album-4", title: "Venice Beach", trackNumber: 2, duration: 195, lyrics: "Skateboards on the boardwalk\nArtists painting futures on the wall\nEverybody's got a story here\nEverybody answers to the call\n\nVenice Beach, you taught me something\nVenice Beach, you showed me free\nAll the colors of your people\nPainting who I want to be", audioUrl: null },
  { id: "song-4-3", albumId: "album-4", title: "Canyon Road", trackNumber: 3, duration: 231, lyrics: "Winding up the canyon road\nWhere the redwoods touch the clouds\nFar from all the city noise\n\nCanyon road, take me higher\nCanyon road, light my fire\nWhere the eagles soar and the rivers talk\nOn this ancient canyon walk", audioUrl: null },
  { id: "song-4-4", albumId: "album-4", title: "Sunset Strip", trackNumber: 4, duration: 212, lyrics: "Neon signs and broken dreams\nNothing here is what it seems\nBut I love it all the same\nThis city's always been my flame\n\nSunset Strip, you never sleep\nSunset Strip, your promises keep", audioUrl: null },
  { id: "song-4-5", albumId: "album-4", title: "California Way", trackNumber: 5, duration: 248, lyrics: "This is the California way\nDream it in the light of day\nChase it down the golden road\n\nCalifornia way, California way\nEverything is gonna be okay\nJust live it and breathe it\nBelieve it today\nThe California way", audioUrl: null },
];

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(eq(users.username, username));
    return u;
  }
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
    return u;
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const [u] = await db
      .insert(users)
      .values({ ...insertUser, realName: insertUser.realName ?? null })
      .returning();
    // Grant every signup the seed albums (matches MemStore behavior).
    const certNums = [12, 7, 3, 21];
    const all = await db.select().from(albums);
    if (all.length) {
      await db
        .insert(userAlbums)
        .values(
          all.map((a, i) => ({
            userId: u.id,
            albumId: a.id,
            certificateNumber: certNums[i] ?? null,
          })),
        )
        .onConflictDoNothing();
    }
    return u;
  }
  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const { id: _i, createdAt: _c, ...rest } = data as any;
    const [u] = await db.update(users).set(rest).where(eq(users.id, id)).returning();
    return u;
  }

  // Single LEFT JOIN with labels so each album carries its denormalized
  // label entity (or null). Same shape returned by getAlbums + getAlbumById
  // so every caller — fan list, fan detail, admin CMS — gets one read.
  async getAlbums(opts?: { includeHidden?: boolean }): Promise<AlbumWithLabel[]> {
    // Apple-Music / Spotify standard: alphabetical by title as a single
    // string. Postgres lower() makes it case-insensitive at the SQL
    // layer so we don't pay a JS sort cost on every list fetch.
    const rows = await db
      .select()
      .from(albums)
      .leftJoin(labels, eq(albums.labelId, labels.id))
      .where(opts?.includeHidden ? undefined : eq(albums.isHidden, false))
      .orderBy(asc(sql`lower(${albums.title})`));
    return rows.map((r) => ({ ...r.albums, label: r.labels ?? null }));
  }
  async getAlbumById(id: string, opts?: { includeHidden?: boolean }): Promise<AlbumWithLabel | undefined> {
    const [row] = await db
      .select()
      .from(albums)
      .leftJoin(labels, eq(albums.labelId, labels.id))
      .where(eq(albums.id, id));
    if (!row) return undefined;
    if (row.albums.isHidden && !opts?.includeHidden) return undefined;
    return { ...row.albums, label: row.labels ?? null };
  }
  async getSongsByAlbum(albumId: string): Promise<Song[]> {
    return db.select().from(songs).where(eq(songs.albumId, albumId)).orderBy(asc(songs.trackNumber));
  }
  async getSongById(id: string): Promise<Song | undefined> {
    const [s] = await db.select().from(songs).where(eq(songs.id, id));
    return s;
  }
  async createAlbum(data: Omit<Album, "id"> & { id?: string }): Promise<Album> {
    const [a] = await db.insert(albums).values(data as any).returning();
    return a;
  }
  async updateAlbum(id: string, data: Partial<Album>): Promise<Album | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return this.getAlbumById(id);
    const [a] = await db.update(albums).set(rest).where(eq(albums.id, id)).returning();
    return a;
  }
  async deleteAlbum(id: string): Promise<void> {
    // Wrap the whole cascade in a transaction: if any step fails (e.g. a
    // playlist row violates a future constraint, the connection drops), we
    // roll back instead of leaving half-deleted state.
    await db.transaction(async (tx) => {
      const albumSongs = await tx
        .select({ id: songs.id })
        .from(songs)
        .where(eq(songs.albumId, id));
      for (const s of albumSongs) {
        await tx.delete(playlistSongs).where(eq(playlistSongs.songId, s.id));
      }
      await tx.delete(songs).where(eq(songs.albumId, id));
      await tx.delete(userAlbums).where(eq(userAlbums.albumId, id));
      await tx.delete(albums).where(eq(albums.id, id));
    });
  }
  async createSong(data: Omit<Song, "id"> & { id?: string }): Promise<Song> {
    const [s] = await db.insert(songs).values(data as any).returning();
    return s;
  }

  // ----- Bonus album content (videos + photos) -----
  // Listed in `position` order so the admin's drag/reorder writes show up
  // for fans without an explicit sort hint on the consumer.
  async listAlbumVideos(albumId: string): Promise<AlbumVideo[]> {
    return db.select().from(albumVideos)
      .where(eq(albumVideos.albumId, albumId))
      .orderBy(asc(albumVideos.position), asc(albumVideos.id));
  }
  async createAlbumVideo(data: InsertAlbumVideo): Promise<AlbumVideo> {
    const [v] = await db.insert(albumVideos).values(data as any).returning();
    return v;
  }
  async updateAlbumVideo(id: string, data: Partial<AlbumVideo>): Promise<AlbumVideo | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) {
      const [v] = await db.select().from(albumVideos).where(eq(albumVideos.id, id));
      return v;
    }
    const [v] = await db.update(albumVideos).set(rest).where(eq(albumVideos.id, id)).returning();
    return v;
  }
  async deleteAlbumVideo(id: string): Promise<void> {
    await db.delete(albumVideos).where(eq(albumVideos.id, id));
  }
  async listAlbumPhotos(albumId: string): Promise<AlbumPhoto[]> {
    return db.select().from(albumPhotos)
      .where(eq(albumPhotos.albumId, albumId))
      .orderBy(asc(albumPhotos.position), asc(albumPhotos.id));
  }
  async createAlbumPhoto(data: InsertAlbumPhoto): Promise<AlbumPhoto> {
    const [p] = await db.insert(albumPhotos).values(data as any).returning();
    return p;
  }
  async updateAlbumPhoto(id: string, data: Partial<AlbumPhoto>): Promise<AlbumPhoto | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) {
      const [p] = await db.select().from(albumPhotos).where(eq(albumPhotos.id, id));
      return p;
    }
    const [p] = await db.update(albumPhotos).set(rest).where(eq(albumPhotos.id, id)).returning();
    return p;
  }
  async deleteAlbumPhoto(id: string): Promise<void> {
    await db.delete(albumPhotos).where(eq(albumPhotos.id, id));
  }
  async updateSong(id: string, data: Partial<Song>): Promise<Song | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return this.getSongById(id);
    const [s] = await db.update(songs).set(rest).where(eq(songs.id, id)).returning();
    return s;
  }
  async deleteSong(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(playlistSongs).where(eq(playlistSongs.songId, id));
      await tx.delete(songs).where(eq(songs.id, id));
    });
  }
  async countAdmins(): Promise<number> {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
    return rows.length;
  }
  async setUserAdmin(userId: string, isAdmin: boolean): Promise<void> {
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  }
  // ----- SuperCredits™ catalog ---------------------------------------
  async getPeople(): Promise<Person[]> {
    return db.select().from(people).orderBy(asc(people.name));
  }
  async getPersonById(id: string): Promise<Person | undefined> {
    const [p] = await db.select().from(people).where(eq(people.id, id));
    return p;
  }
  async createPerson(data: InsertPerson & { id?: string }): Promise<Person> {
    const [p] = await db.insert(people).values(data as any).returning();
    return p;
  }
  async updatePerson(id: string, data: Partial<Person>): Promise<Person | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return this.getPersonById(id);
    const [p] = await db.update(people).set(rest).where(eq(people.id, id)).returning();
    return p;
  }
  async deletePerson(id: string): Promise<void> {
    await db.delete(people).where(eq(people.id, id));
  }

  async getDiscographyByPerson(personId: string): Promise<PersonDiscography[]> {
    return db
      .select()
      .from(personDiscography)
      .where(eq(personDiscography.personId, personId))
      .orderBy(asc(personDiscography.position));
  }

  async getDiscographyByArtistName(name: string): Promise<PersonDiscography[]> {
    // Case-insensitive name match. People without an exact-name row in
    // the catalog (typos, alt spellings) get an empty list — fan side
    // just doesn't render the Streaming section.
    const [person] = await db
      .select()
      .from(people)
      .where(sql`lower(${people.name}) = lower(${name})`)
      .limit(1);
    if (!person) return [];
    return this.getDiscographyByPerson(person.id);
  }

  async replaceDiscographyForPerson(
    personId: string,
    items: Omit<InsertPersonDiscography, "personId">[],
  ): Promise<PersonDiscography[]> {
    // Transactional replace — admin pulls always represent the full
    // Apple discography snapshot, so partial diffs would only drift.
    return db.transaction(async (tx) => {
      await tx.delete(personDiscography).where(eq(personDiscography.personId, personId));
      if (items.length === 0) return [];
      const rows = await tx
        .insert(personDiscography)
        .values(items.map((i) => ({ ...i, personId })) as any)
        .returning();
      return rows;
    });
  }

  // Internal helper: load enriched attachments for a set of instrument ids,
  // joining vendor metadata onto each attachment so callers see the flat
  // shape AlbumDetail.tsx + the admin UI both already expect.
  private async loadEnrichedAttachments(
    instrumentIds: string[],
    includeHidden: boolean,
  ): Promise<Map<string, EnrichedInstrumentVendor[]>> {
    const byInstrument = new Map<string, EnrichedInstrumentVendor[]>();
    if (instrumentIds.length === 0) return byInstrument;
    const conds = [inArray(instrumentVendors.instrumentId, instrumentIds)];
    if (!includeHidden) conds.push(eq(instrumentVendors.isHidden, false));
    const rows = await db
      .select({ iv: instrumentVendors, v: vendors })
      .from(instrumentVendors)
      .innerJoin(vendors, eq(instrumentVendors.vendorId, vendors.id))
      .where(and(...conds))
      .orderBy(asc(instrumentVendors.position));
    for (const r of rows) {
      const enriched: EnrichedInstrumentVendor = {
        id: r.iv.id,
        instrumentId: r.iv.instrumentId,
        vendorId: r.iv.vendorId,
        affiliateUrl: r.iv.affiliateUrl,
        position: r.iv.position,
        isHidden: r.iv.isHidden,
        createdAt: r.iv.createdAt,
        name: r.v.name,
        domain: r.v.domain,
        homeUrl: r.v.homeUrl,
        aboutUrl: r.v.aboutUrl,
        logoUrl: r.v.logoUrl,
        tagline: r.v.tagline,
        bio: r.v.bio,
        location: r.v.location,
        coverUrl: r.v.coverUrl,
      };
      const list = byInstrument.get(r.iv.instrumentId) ?? [];
      list.push(enriched);
      byInstrument.set(r.iv.instrumentId, list);
    }
    return byInstrument;
  }

  async getInstruments(opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[] })[]> {
    const all = await db.select().from(instruments).orderBy(asc(instruments.name));
    if (all.length === 0) return [];
    const byInstrument = await this.loadEnrichedAttachments(
      all.map((i) => i.id),
      !!opts?.includeHiddenVendors,
    );
    return all.map((i) => ({ ...i, vendors: byInstrument.get(i.id) ?? [] }));
  }
  async getInstrumentById(id: string, opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[] }) | undefined> {
    const [i] = await db.select().from(instruments).where(eq(instruments.id, id));
    if (!i) return undefined;
    const byInstrument = await this.loadEnrichedAttachments([id], !!opts?.includeHiddenVendors);
    return { ...i, vendors: byInstrument.get(id) ?? [] };
  }
  async createInstrument(data: InsertInstrument & { id?: string }): Promise<Instrument> {
    const [i] = await db.insert(instruments).values(data as any).returning();
    return i;
  }
  async updateInstrument(id: string, data: Partial<Instrument>): Promise<Instrument | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) {
      const [existing] = await db.select().from(instruments).where(eq(instruments.id, id));
      return existing;
    }
    const [i] = await db.update(instruments).set(rest).where(eq(instruments.id, id)).returning();
    return i;
  }
  async deleteInstrument(id: string): Promise<void> {
    // FK on instrument_vendors.instrument_id is ON DELETE CASCADE — the join
    // rows go with the instrument. Vendor entities are untouched (they may
    // still be attached to other instruments).
    await db.delete(instruments).where(eq(instruments.id, id));
  }

  // ----- Label ENTITY CRUD --------------------------------------------
  async getLabels(): Promise<Label[]> {
    return await db.select().from(labels).orderBy(asc(labels.name));
  }
  async getLabelById(id: string): Promise<Label | undefined> {
    const [l] = await db.select().from(labels).where(eq(labels.id, id));
    return l;
  }
  async createLabel(data: InsertLabel & { id?: string }): Promise<Label> {
    const [l] = await db.insert(labels).values(data as any).returning();
    return l;
  }
  async updateLabel(id: string, data: Partial<Label>): Promise<Label | undefined> {
    const { id: _i, createdAt: _c, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return this.getLabelById(id);
    const [l] = await db.update(labels).set(rest).where(eq(labels.id, id)).returning();
    return l;
  }
  async deleteLabel(id: string): Promise<void> {
    // ON DELETE SET NULL on albums.label_id — the catalog stays, the label
    // credit just clears until reassigned.
    await db.delete(labels).where(eq(labels.id, id));
  }

  // ----- Vendor ENTITY CRUD -------------------------------------------
  async getVendors(): Promise<Vendor[]> {
    return await db.select().from(vendors).orderBy(asc(vendors.name));
  }
  async getVendorById(id: string): Promise<Vendor | undefined> {
    const [v] = await db.select().from(vendors).where(eq(vendors.id, id));
    return v;
  }
  async getVendorByDomain(domain: string): Promise<Vendor | undefined> {
    const [v] = await db.select().from(vendors).where(eq(vendors.domain, domain.toLowerCase()));
    return v;
  }
  async createVendor(data: InsertVendor & { id?: string }): Promise<Vendor> {
    const [v] = await db.insert(vendors).values({ ...data, domain: data.domain.toLowerCase() } as any).returning();
    return v;
  }
  async updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor | undefined> {
    const { id: _i, createdAt: _c, ...rest } = data as any;
    if (rest.domain) rest.domain = String(rest.domain).toLowerCase();
    if (Object.keys(rest).length === 0) return this.getVendorById(id);
    const [v] = await db.update(vendors).set(rest).where(eq(vendors.id, id)).returning();
    return v;
  }
  async deleteVendor(id: string): Promise<void> {
    // ON DELETE CASCADE on instrument_vendors.vendor_id removes every
    // attachment of this vendor across all instruments.
    await db.delete(vendors).where(eq(vendors.id, id));
  }

  async getVendorInstruments(vendorId: string): Promise<Instrument[]> {
    // DISTINCT instruments attached to this vendor (excluding hidden
    // attachments). A vendor could be attached to the same instrument
    // twice via separate join rows in theory, so we dedupe in JS.
    const rows = await db
      .select({ i: instruments })
      .from(instrumentVendors)
      .innerJoin(instruments, eq(instrumentVendors.instrumentId, instruments.id))
      .where(and(
        eq(instrumentVendors.vendorId, vendorId),
        eq(instrumentVendors.isHidden, false),
      ))
      .orderBy(asc(instruments.name));
    const seen = new Set<string>();
    const out: Instrument[] = [];
    for (const r of rows) {
      if (seen.has(r.i.id)) continue;
      seen.add(r.i.id);
      out.push(r.i);
    }
    return out;
  }

  async getPersonTracks(personId: string) {
    // Catalog-wide credits for one person. Joins:
    //   track_performers → songs (the track) → albums (cover + title)
    //   left-joined to instruments (some credits are role-only without
    //   a specific instrument attached, so we keep those rows too).
    // Hidden albums are filtered out — same rule fan-side album reads use.
    const rows = await db
      .select({
        p: trackPerformers,
        s: songs,
        a: albums,
        i: instruments,
      })
      .from(trackPerformers)
      .innerJoin(songs, eq(trackPerformers.songId, songs.id))
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .leftJoin(instruments, eq(trackPerformers.instrumentId, instruments.id))
      .where(and(eq(trackPerformers.personId, personId), eq(albums.isHidden, false)))
      .orderBy(asc(albums.year), asc(albums.title), asc(songs.trackNumber), asc(trackPerformers.position));
    return rows.map((r) => ({
      performerId: r.p.id,
      songId: r.s.id,
      songTitle: r.s.title,
      trackNumber: r.s.trackNumber,
      albumId: r.a.id,
      albumTitle: r.a.title,
      albumArtwork: r.a.artwork,
      albumArtist: r.a.artist,
      albumYear: r.a.year,
      role: r.p.role,
      tuningNotes: r.p.tuningNotes,
      instrumentId: r.i?.id ?? null,
      instrumentName: r.i?.name ?? null,
      instrumentShortCategory: r.i?.shortCategory ?? null,
      instrumentCategory: r.i?.category ?? null,
      instrumentPhotoUrl: r.i?.photoUrl ?? null,
    }));
  }

  async getPersonGearContext(personId: string) {
    // Admin gear flow. Returns every album the person could plausibly be
    // credited on:
    //   1) Albums where they're the primary artist (their own catalog).
    //   2) Albums where they already have a performer credit on at least
    //      one track (sessions / guest spots — keeps the existing rows
    //      editable from the same screen).
    // For every such album we include the full track list, with any
    // existing performer rows FOR THIS PERSON joined onto each track so
    // the UI can show "already credited as Guitar (1973 Martin D-28)"
    // and offer a per-row delete.
    const ownAlbums = await db
      .select()
      .from(albums)
      .where(eq(albums.primaryArtistId, personId));
    const performerRows = await db
      .select({
        p: trackPerformers,
        s: songs,
        a: albums,
        i: instruments,
      })
      .from(trackPerformers)
      .innerJoin(songs, eq(trackPerformers.songId, songs.id))
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .leftJoin(instruments, eq(trackPerformers.instrumentId, instruments.id))
      .where(eq(trackPerformers.personId, personId));

    type AlbumBucket = {
      albumId: string;
      albumTitle: string;
      albumArtwork: string;
      albumYear: number | null;
      tracks: Map<string, {
        songId: string;
        title: string;
        trackNumber: number;
        performers: Array<{
          id: string;
          instrumentId: string | null;
          instrumentName: string | null;
          instrumentPhotoUrl: string | null;
          role: string;
          tuningNotes: string | null;
        }>;
      }>;
    };
    const byAlbum = new Map<string, AlbumBucket>();
    const seed = (a: Album) => {
      if (!byAlbum.has(a.id)) {
        byAlbum.set(a.id, {
          albumId: a.id,
          albumTitle: a.title,
          albumArtwork: a.artwork,
          albumYear: a.year,
          tracks: new Map(),
        });
      }
    };
    for (const a of ownAlbums) seed(a);
    for (const r of performerRows) seed(r.a);

    const albumIds = Array.from(byAlbum.keys());
    if (albumIds.length > 0) {
      const songRows = await db
        .select()
        .from(songs)
        .where(inArray(songs.albumId, albumIds))
        .orderBy(asc(songs.trackNumber));
      for (const s of songRows) {
        const bucket = byAlbum.get(s.albumId);
        if (!bucket) continue;
        bucket.tracks.set(s.id, {
          songId: s.id,
          title: s.title,
          trackNumber: s.trackNumber,
          performers: [],
        });
      }
    }
    for (const r of performerRows) {
      const bucket = byAlbum.get(r.a.id);
      if (!bucket) continue;
      // The song may not be in the bucket yet if it was added via the
      // performer rows path AND the song lookup above hasn't run (e.g.
      // edge case where albumIds is empty — shouldn't happen here, but
      // be defensive). Seed a stub from the joined song row.
      const existing = bucket.tracks.get(r.s.id) ?? {
        songId: r.s.id,
        title: r.s.title,
        trackNumber: r.s.trackNumber,
        performers: [],
      };
      existing.performers.push({
        id: r.p.id,
        instrumentId: r.i?.id ?? null,
        instrumentName: r.i?.name ?? null,
        instrumentPhotoUrl: r.i?.photoUrl ?? null,
        role: r.p.role,
        tuningNotes: r.p.tuningNotes,
      });
      bucket.tracks.set(r.s.id, existing);
    }

    return Array.from(byAlbum.values())
      .map((b) => ({
        albumId: b.albumId,
        albumTitle: b.albumTitle,
        albumArtwork: b.albumArtwork,
        albumYear: b.albumYear,
        tracks: Array.from(b.tracks.values()).sort(
          (x, y) => x.trackNumber - y.trackNumber,
        ),
      }))
      .sort(
        (a, b) =>
          (a.albumYear ?? 0) - (b.albumYear ?? 0) ||
          a.albumTitle.localeCompare(b.albumTitle),
      );
  }

  async getVendorSuperCreditArtists(vendorId: string): Promise<Array<Person & { trackCount: number }>> {
    // Artists spotted in SuperCredits playing one of this vendor's
    // instruments. JOIN track_performers → instrument_vendors (matching
    // instrumentId, filtered to this vendor) → people. Hidden attachments
    // still count — the credit's existence reflects an artist saying "I
    // played this gear", independent of whether we surface the buy link.
    const rows = await db
      .select({
        person: people,
        songId: trackPerformers.songId,
      })
      .from(trackPerformers)
      .innerJoin(
        instrumentVendors,
        eq(trackPerformers.instrumentId, instrumentVendors.instrumentId),
      )
      .innerJoin(people, eq(trackPerformers.personId, people.id))
      .where(eq(instrumentVendors.vendorId, vendorId));
    const byPerson = new Map<string, { person: Person; tracks: Set<string> }>();
    for (const r of rows) {
      const entry = byPerson.get(r.person.id) ?? {
        person: r.person,
        tracks: new Set<string>(),
      };
      entry.tracks.add(r.songId);
      byPerson.set(r.person.id, entry);
    }
    return Array.from(byPerson.values())
      .map(({ person, tracks }) => ({ ...person, trackCount: tracks.size }))
      // Apple-Music / Spotify standard: sort artists alphabetically by
      // display name as a single string (case-insensitive). "Fernando
      // Perdomo" sorts under F; one-name acts like "SoulChef" sort under
      // S. trackCount stays on the row for badge/display use, but it no
      // longer drives order — fans scan rosters by name, not popularity.
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }

  async getInstrumentSuperCreditArtists(instrumentId: string): Promise<Array<Person & { trackCount: number }>> {
    // Walk track_performers filtered to this instrument, join people.
    // Same shape as getVendorSuperCreditArtists but one hop shorter — no
    // need to detour through instrument_vendors because the instrument
    // is the anchor here. Hidden albums are excluded so this public
    // endpoint can't leak unreleased catalog (mirrors getPersonTracks).
    const rows = await db
      .select({
        person: people,
        songId: trackPerformers.songId,
      })
      .from(trackPerformers)
      .innerJoin(people, eq(trackPerformers.personId, people.id))
      .innerJoin(songs, eq(trackPerformers.songId, songs.id))
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          eq(trackPerformers.instrumentId, instrumentId),
          eq(albums.isHidden, false),
        ),
      );
    const byPerson = new Map<string, { person: Person; tracks: Set<string> }>();
    for (const r of rows) {
      const entry = byPerson.get(r.person.id) ?? {
        person: r.person,
        tracks: new Set<string>(),
      };
      entry.tracks.add(r.songId);
      byPerson.set(r.person.id, entry);
    }
    return Array.from(byPerson.values())
      .map(({ person, tracks }) => ({ ...person, trackCount: tracks.size }))
      // Alphabetical by display name — same rule as
      // getVendorSuperCreditArtists. See note there for why.
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }

  async getInstrumentTracks(instrumentId: string) {
    // Walk track_performers anchored on this instrument, join the
    // person (optional — name snapshot survives the FK on delete) and
    // the song + album for navigation. Sort by album year → album title
    // → track number so the UI groups naturally.
    const rows = await db
      .select({
        p: trackPerformers,
        s: songs,
        a: albums,
        person: people,
      })
      .from(trackPerformers)
      .innerJoin(songs, eq(trackPerformers.songId, songs.id))
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .leftJoin(people, eq(trackPerformers.personId, people.id))
      .where(
        and(
          eq(trackPerformers.instrumentId, instrumentId),
          // Mirror getPersonTracks / getInstrumentSuperCreditArtists —
          // never expose hidden-album credits through the public profile.
          eq(albums.isHidden, false),
        ),
      );
    return rows
      .map((r) => ({
        performerId: r.p.id,
        songId: r.s.id,
        songTitle: r.s.title,
        trackNumber: r.s.trackNumber,
        albumId: r.a.id,
        albumTitle: r.a.title,
        albumArtwork: r.a.artwork,
        albumYear: r.a.year,
        personId: r.person?.id ?? null,
        // Prefer the live joined name, but the snapshot keeps the row
        // renderable if the Person row was deleted (FK is SET NULL).
        personName: r.person?.name ?? r.p.name,
        personPhotoUrl: r.person?.photoUrl ?? null,
        role: r.p.role,
        tuningNotes: r.p.tuningNotes,
      }))
      .sort(
        (a, b) =>
          (a.albumYear ?? 0) - (b.albumYear ?? 0) ||
          a.albumTitle.localeCompare(b.albumTitle) ||
          a.trackNumber - b.trackNumber,
      );
  }

  // ----- Attachment CRUD ----------------------------------------------
  async attachVendorToInstrument(data: {
    instrumentId: string;
    vendorId: string;
    affiliateUrl: string;
    position?: number;
    isHidden?: boolean;
  }): Promise<InstrumentVendor> {
    const [v] = await db.insert(instrumentVendors).values({
      instrumentId: data.instrumentId,
      vendorId: data.vendorId,
      affiliateUrl: data.affiliateUrl,
      position: data.position ?? 0,
      isHidden: data.isHidden ?? false,
    } as any).returning();
    return v;
  }
  async updateInstrumentVendorAttachment(
    id: string,
    data: { affiliateUrl?: string; position?: number; isHidden?: boolean },
  ): Promise<InstrumentVendor | undefined> {
    const rest: Record<string, unknown> = {};
    if (data.affiliateUrl !== undefined) rest.affiliateUrl = data.affiliateUrl;
    if (data.position !== undefined) rest.position = data.position;
    if (data.isHidden !== undefined) rest.isHidden = data.isHidden;
    if (Object.keys(rest).length === 0) {
      const [existing] = await db.select().from(instrumentVendors).where(eq(instrumentVendors.id, id));
      return existing;
    }
    const [v] = await db.update(instrumentVendors).set(rest).where(eq(instrumentVendors.id, id)).returning();
    return v;
  }
  async detachInstrumentVendor(id: string): Promise<void> {
    await db.delete(instrumentVendors).where(eq(instrumentVendors.id, id));
  }

  // ----- SuperCredits™ song credits ----------------------------------
  async getSongCredits(songId: string) {
    const [writerRows, performerRows] = await Promise.all([
      db.select().from(trackWriters).where(eq(trackWriters.songId, songId)).orderBy(asc(trackWriters.position)),
      db.select().from(trackPerformers).where(eq(trackPerformers.songId, songId)).orderBy(asc(trackPerformers.position)),
    ]);
    // Resolve the small set of distinct person + instrument ids in one
    // query each — keeps the fan-side credits sheet to a single GET.
    const personIds = Array.from(new Set([
      ...writerRows.map((w) => w.personId).filter((v): v is string => !!v),
      ...performerRows.map((p) => p.personId).filter((v): v is string => !!v),
    ]));
    const instrumentIds = Array.from(new Set(
      performerRows.map((p) => p.instrumentId).filter((v): v is string => !!v),
    ));
    const [peopleRows, instrumentRows, vendorsByInstrument] = await Promise.all([
      personIds.length ? db.select().from(people).where(inArray(people.id, personIds)) : Promise.resolve([] as Person[]),
      instrumentIds.length ? db.select().from(instruments).where(inArray(instruments.id, instrumentIds)) : Promise.resolve([] as Instrument[]),
      // Fan-facing — hidden vendors are excluded so demo-hidden vendor
      // buttons don't render in the InstrumentSheet.
      this.loadEnrichedAttachments(instrumentIds, false),
    ]);
    const peopleById = new Map(peopleRows.map((p) => [p.id, p]));
    const instrumentsById = new Map(
      instrumentRows.map((i) => [i.id, { ...i, vendors: vendorsByInstrument.get(i.id) ?? [] }]),
    );
    return {
      writers: writerRows.map((w) => ({ ...w, person: w.personId ? peopleById.get(w.personId) ?? null : null })),
      performers: performerRows.map((p) => ({
        ...p,
        person: p.personId ? peopleById.get(p.personId) ?? null : null,
        instrument: p.instrumentId ? instrumentsById.get(p.instrumentId) ?? null : null,
      })),
    };
  }
  async getAlbumCredits(albumId: string) {
    // 1) Resolve song ids for this album. Cheap single query.
    const songRows = await db.select({ id: songs.id }).from(songs).where(eq(songs.albumId, albumId));
    const songIds = songRows.map((r) => r.id);
    if (songIds.length === 0) return { bySongId: {} };

    // 2) All writers + performers for those songs in two queries.
    const [writerRows, performerRows] = await Promise.all([
      db.select().from(trackWriters).where(inArray(trackWriters.songId, songIds)).orderBy(asc(trackWriters.position)),
      db.select().from(trackPerformers).where(inArray(trackPerformers.songId, songIds)).orderBy(asc(trackPerformers.position)),
    ]);

    // 3) Resolve the small set of distinct person + instrument ids in one
    //    query each (same enrichment as getSongCredits, batched across the album).
    const personIds = Array.from(new Set([
      ...writerRows.map((w) => w.personId).filter((v): v is string => !!v),
      ...performerRows.map((p) => p.personId).filter((v): v is string => !!v),
    ]));
    const instrumentIds = Array.from(new Set(
      performerRows.map((p) => p.instrumentId).filter((v): v is string => !!v),
    ));
    const [peopleRows, instrumentRows, vendorsByInstrument] = await Promise.all([
      personIds.length ? db.select().from(people).where(inArray(people.id, personIds)) : Promise.resolve([] as Person[]),
      instrumentIds.length ? db.select().from(instruments).where(inArray(instruments.id, instrumentIds)) : Promise.resolve([] as Instrument[]),
      // Fan-facing — hidden vendors are excluded.
      this.loadEnrichedAttachments(instrumentIds, false),
    ]);
    const peopleById = new Map(peopleRows.map((p) => [p.id, p]));
    const instrumentsById = new Map(
      instrumentRows.map((i) => [i.id, { ...i, vendors: vendorsByInstrument.get(i.id) ?? [] }]),
    );

    // 4) Bucket by songId. Position order is preserved because we sorted at
    //    the query level above.
    const bySongId: Record<string, {
      writers: (TrackWriter & { person: Person | null })[];
      performers: (TrackPerformer & {
        person: Person | null;
        instrument: (Instrument & { vendors: EnrichedInstrumentVendor[] }) | null;
      })[];
    }> = {};
    for (const w of writerRows) {
      const bucket = bySongId[w.songId] ?? (bySongId[w.songId] = { writers: [], performers: [] });
      bucket.writers.push({ ...w, person: w.personId ? peopleById.get(w.personId) ?? null : null });
    }
    for (const p of performerRows) {
      const bucket = bySongId[p.songId] ?? (bySongId[p.songId] = { writers: [], performers: [] });
      bucket.performers.push({
        ...p,
        person: p.personId ? peopleById.get(p.personId) ?? null : null,
        instrument: p.instrumentId ? instrumentsById.get(p.instrumentId) ?? null : null,
      });
    }
    return { bySongId };
  }
  async createTrackWriter(data: InsertTrackWriter & { id?: string }): Promise<TrackWriter> {
    const [w] = await db.insert(trackWriters).values(data as any).returning();
    return w;
  }
  async updateTrackWriter(id: string, data: Partial<TrackWriter>): Promise<TrackWriter | undefined> {
    const { id: _i, songId: _s, ...rest } = data as any;
    if (Object.keys(rest).length === 0) {
      const [w] = await db.select().from(trackWriters).where(eq(trackWriters.id, id));
      return w;
    }
    const [w] = await db.update(trackWriters).set(rest).where(eq(trackWriters.id, id)).returning();
    return w;
  }
  async deleteTrackWriter(id: string): Promise<void> {
    await db.delete(trackWriters).where(eq(trackWriters.id, id));
  }
  async createTrackPerformer(data: InsertTrackPerformer & { id?: string }): Promise<TrackPerformer> {
    const [p] = await db.insert(trackPerformers).values(data as any).returning();
    return p;
  }
  async updateTrackPerformer(id: string, data: Partial<TrackPerformer>): Promise<TrackPerformer | undefined> {
    const { id: _i, songId: _s, ...rest } = data as any;
    if (Object.keys(rest).length === 0) {
      const [p] = await db.select().from(trackPerformers).where(eq(trackPerformers.id, id));
      return p;
    }
    const [p] = await db.update(trackPerformers).set(rest).where(eq(trackPerformers.id, id)).returning();
    return p;
  }
  async deleteTrackPerformer(id: string): Promise<void> {
    await db.delete(trackPerformers).where(eq(trackPerformers.id, id));
  }

  async listCreditRoles(): Promise<CreditRole[]> {
    const existing = await db.select().from(creditRoles).orderBy(asc(creditRoles.kind), asc(creditRoles.name));
    if (existing.length > 0) return existing;
    const seed: InsertCreditRole[] = [
      { kind: "writer", name: "Composer" },
      { kind: "writer", name: "Lyricist" },
      { kind: "writer", name: "Songwriter" },
      { kind: "writer", name: "Producer" },
      { kind: "writer", name: "Co-producer" },
      { kind: "writer", name: "Arranger" },
      { kind: "performer", name: "Lead vocal" },
      { kind: "performer", name: "Backing vocal" },
      { kind: "performer", name: "Guitar" },
      { kind: "performer", name: "Acoustic guitar" },
      { kind: "performer", name: "Electric guitar" },
      { kind: "performer", name: "Bass" },
      { kind: "performer", name: "Drums" },
      { kind: "performer", name: "Percussion" },
      { kind: "performer", name: "Piano" },
      { kind: "performer", name: "Keyboards" },
      { kind: "performer", name: "Organ" },
      { kind: "performer", name: "Violin" },
      { kind: "performer", name: "Cello" },
      { kind: "performer", name: "Saxophone" },
      { kind: "performer", name: "Trumpet" },
      { kind: "performer", name: "Harmonica" },
      { kind: "performer", name: "Banjo" },
      { kind: "performer", name: "Mandolin" },
      { kind: "performer", name: "Pedal steel" },
      { kind: "performer", name: "Fiddle" },
      { kind: "performer", name: "Other" },
    ];
    try {
      await db.insert(creditRoles).values(seed).onConflictDoNothing();
    } catch {}
    return db.select().from(creditRoles).orderBy(asc(creditRoles.kind), asc(creditRoles.name));
  }
  async findOrCreateCreditRole(data: InsertCreditRole): Promise<CreditRole> {
    const name = data.name.trim();
    const existing = await db
      .select()
      .from(creditRoles)
      .where(and(eq(creditRoles.kind, data.kind), sql`lower(${creditRoles.name}) = lower(${name})`))
      .limit(1);
    if (existing[0]) return existing[0];
    const [row] = await db
      .insert(creditRoles)
      .values({ kind: data.kind, name })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const [again] = await db
      .select()
      .from(creditRoles)
      .where(and(eq(creditRoles.kind, data.kind), sql`lower(${creditRoles.name}) = lower(${name})`))
      .limit(1);
    return again!;
  }

  async tryClaimFirstAdmin(userId: string): Promise<boolean> {
    // Single statement: "promote this user, but only if no admin exists yet."
    // Two callers racing both run this; whichever lands first sees a row
    // count of 1, the other sees 0 because an admin now exists.
    const result = await db.execute(
      sql`UPDATE users SET is_admin = true
          WHERE id = ${userId}
            AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = true)
          RETURNING id`,
    );
    // node-postgres returns rowCount; neon-style drivers return `rows`.
    const rowCount = (result as any).rowCount ?? (result as any).rows?.length ?? 0;
    return rowCount > 0;
  }

  async getUserAlbums(userId: string): Promise<(UserAlbum & { album: Album })[]> {
    // Hidden albums are excluded from a user's collection so the demo
    // show/hide toggle keeps the album out of the fan-facing Library tab
    // even after the user has added it. Admin still sees the row in the
    // CMS list (that path goes through getAlbums(includeHidden=true)).
    const rows = await db
      .select()
      .from(userAlbums)
      .innerJoin(albums, eq(userAlbums.albumId, albums.id))
      .where(and(eq(userAlbums.userId, userId), eq(albums.isHidden, false)));
    return rows.map((r) => ({ ...r.user_albums, album: r.albums }));
  }

  async getPlaylists(userId: string): Promise<(Playlist & { artworks: string[]; songCount: number })[]> {
    const lists = await db
      .select()
      .from(playlists)
      .where(eq(playlists.userId, userId))
      .orderBy(desc(playlists.createdAt));
    const out: (Playlist & { artworks: string[]; songCount: number })[] = [];
    for (const p of lists) {
      const entries = await db
        .select({
          addedAt: playlistSongs.addedAt,
          artwork: albums.artwork,
          albumId: albums.id,
        })
        .from(playlistSongs)
        .innerJoin(songs, eq(playlistSongs.songId, songs.id))
        .innerJoin(albums, eq(songs.albumId, albums.id))
        // Drop songs whose parent album is hidden — those artworks and the
        // bumped song count would otherwise leak the hidden album back into
        // the playlist cover mosaic / row count on the fan side.
        .where(and(eq(playlistSongs.playlistId, p.id), eq(albums.isHidden, false)))
        .orderBy(desc(playlistSongs.addedAt));
      const seen = new Set<string>();
      const artworks: string[] = [];
      for (const e of entries) {
        if (seen.has(e.albumId)) continue;
        seen.add(e.albumId);
        artworks.push(e.artwork);
        if (artworks.length >= 4) break;
      }
      out.push({ ...p, artworks, songCount: entries.length });
    }
    return out;
  }
  async getPlaylistById(id: string): Promise<Playlist | undefined> {
    const [p] = await db.select().from(playlists).where(eq(playlists.id, id));
    return p;
  }
  async createPlaylist(userId: string, name: string): Promise<Playlist> {
    const [p] = await db.insert(playlists).values({ userId, name }).returning();
    return p;
  }
  async updatePlaylist(id: string, name: string): Promise<Playlist | undefined> {
    const [p] = await db.update(playlists).set({ name }).where(eq(playlists.id, id)).returning();
    return p;
  }
  async deletePlaylist(id: string): Promise<void> {
    await db.delete(playlistSongs).where(eq(playlistSongs.playlistId, id));
    await db.delete(playlists).where(eq(playlists.id, id));
  }
  async getPlaylistSongs(playlistId: string): Promise<(PlaylistSong & { song: Song & { album: Album } })[]> {
    const rows = await db
      .select()
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .innerJoin(albums, eq(songs.albumId, albums.id))
      // Hide songs whose parent album is hidden so they vanish from the
      // playlist detail view too (matches getPlaylists summary).
      .where(and(eq(playlistSongs.playlistId, playlistId), eq(albums.isHidden, false)))
      .orderBy(asc(playlistSongs.position));
    return rows.map((r) => ({
      ...r.playlist_songs,
      song: { ...r.songs, album: r.albums },
    }));
  }
  async addSongToPlaylist(playlistId: string, songId: string, position: number): Promise<PlaylistSong> {
    const [existing] = await db
      .select()
      .from(playlistSongs)
      .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)));
    if (existing) return existing;
    const [ps] = await db
      .insert(playlistSongs)
      .values({ playlistId, songId, position })
      .returning();
    return ps;
  }
  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
    await db
      .delete(playlistSongs)
      .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)));
  }

  async createAuthToken(token: string, userId: string): Promise<void> {
    await db.insert(authTokens).values({ token, userId }).onConflictDoNothing();
  }
  async getUserIdByAuthToken(token: string): Promise<string | undefined> {
    const [row] = await db.select().from(authTokens).where(eq(authTokens.token, token));
    return row?.userId;
  }
  async deleteAuthToken(token: string): Promise<void> {
    await db.delete(authTokens).where(eq(authTokens.token, token));
  }

  async getProfilePhoto(userId: string): Promise<string | null> {
    const [row] = await db.select().from(profilePhotos).where(eq(profilePhotos.userId, userId));
    return row?.dataUrl ?? null;
  }
  async setProfilePhoto(userId: string, dataUrl: string): Promise<void> {
    await db
      .insert(profilePhotos)
      .values({ userId, dataUrl, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: profilePhotos.userId,
        set: { dataUrl, updatedAt: new Date() },
      });
  }
  async deleteProfilePhoto(userId: string): Promise<void> {
    await db.delete(profilePhotos).where(eq(profilePhotos.userId, userId));
  }

  async insertAnalyticsEvents(rows: {
    clientId?: string;
    name: string;
    payload: Record<string, any>;
    ts: Date;
    sessionId?: string;
    userId?: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(analyticsEvents).values(
      rows.map((r) => ({
        clientId: r.clientId ?? null,
        name: r.name,
        payload: r.payload ?? {},
        ts: r.ts,
        sessionId: r.sessionId ?? null,
        userId: r.userId ?? null,
      })),
    );
  }
  async deleteAnalyticsForUser(userId: string): Promise<void> {
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, userId));
  }
  async getRecentAnalyticsForUser(userId: string, limit: number): Promise<any[]> {
    return db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.userId, userId))
      .orderBy(desc(analyticsEvents.receivedAt))
      .limit(limit);
  }
}

export async function seedCatalog(): Promise<void> {
  // First-run-only. We used to insert with onConflictDoNothing every boot
  // for self-healing, but that backfired in production: deleting a seed
  // album (e.g. swapping it out for a real Apple Music import) only stuck
  // until the next republish, when the seed row would reappear and
  // duplicate the real one. Now the seed is treated as initial demo
  // data — if the catalog has ANY albums, the admin has taken ownership
  // and the seed steps back. Fresh/empty DBs still get the demo content
  // on first boot.
  const existing = await db.select({ id: albums.id }).from(albums).limit(1);
  if (existing.length > 0) return;
  await db.insert(albums).values(SEED_ALBUMS).onConflictDoNothing();
  await db
    .insert(songs)
    .values(
      SEED_SONGS.map((s) => ({ ...s, lyrics: s.lyrics ?? null, audioUrl: s.audioUrl ?? null })),
    )
    .onConflictDoNothing();
}

export const storage: IStorage = new DbStorage();
