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
  type Instrument,
  type InsertInstrument,
  type InstrumentVendor,
  type InsertInstrumentVendor,
  type Vendor,
  type InsertVendor,
  type Label,
  type InsertLabel,
  type AlbumWithLabel,
  type EnrichedInstrumentVendor,
  type TrackWriter,
  type InsertTrackWriter,
  type TrackPerformer,
  type InsertTrackPerformer,
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
  instruments,
  instrumentVendors,
  vendors,
  labels,
  trackWriters,
  trackPerformers,
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
  { id: "album-1", title: "When the World Stops", artist: "Tim Snider & Wolfgang Timber", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png", year: 2024, type: "album", description: "A sweeping collection of songs about stillness, change, and the moments between.", labelId: null, isHidden: false, appleMusicUrl: null, spotifyUrl: null },
  { id: "album-2", title: "Guitar as a Voice", artist: "Fernando Perdomo", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png", year: 2024, type: "album", description: "Instrumental mastery meets emotional storytelling.", labelId: null, isHidden: false, appleMusicUrl: null, spotifyUrl: null },
  { id: "album-3", title: "Love Spell EP", artist: "Whitney Lyman", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png", year: 2024, type: "EP", description: "Four songs that cast a spell.", labelId: null, isHidden: false, appleMusicUrl: null, spotifyUrl: null },
  { id: "album-4", title: "California Way", artist: "TOMMYGUNN", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png", year: 2024, type: "album", description: "Sunshine, highways, and the stories only California can tell.", labelId: null, isHidden: false, appleMusicUrl: null, spotifyUrl: null },
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
    const rows = await db
      .select()
      .from(albums)
      .leftJoin(labels, eq(albums.labelId, labels.id))
      .where(opts?.includeHidden ? undefined : eq(albums.isHidden, false));
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
  // Idempotent: both the albums and songs inserts use onConflictDoNothing so
  // a partial-seed failure on a prior boot, or two boots racing, both heal on
  // the next start instead of leaving missing songs permanently.
  await db.insert(albums).values(SEED_ALBUMS).onConflictDoNothing();
  await db
    .insert(songs)
    .values(
      SEED_SONGS.map((s) => ({ ...s, lyrics: s.lyrics ?? null, audioUrl: s.audioUrl ?? null })),
    )
    .onConflictDoNothing();
}

export const storage: IStorage = new DbStorage();
