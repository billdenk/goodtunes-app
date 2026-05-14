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
} from "@shared/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  getAlbums(): Promise<Album[]>;
  getAlbumById(id: string): Promise<Album | undefined>;
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

  getInstruments(): Promise<(Instrument & { vendors: InstrumentVendor[] })[]>;
  getInstrumentById(id: string): Promise<(Instrument & { vendors: InstrumentVendor[] }) | undefined>;
  createInstrument(data: InsertInstrument & { id?: string }): Promise<Instrument>;
  updateInstrument(id: string, data: Partial<Instrument>): Promise<Instrument | undefined>;
  deleteInstrument(id: string): Promise<void>;

  createInstrumentVendor(data: InsertInstrumentVendor & { id?: string }): Promise<InstrumentVendor>;
  updateInstrumentVendor(id: string, data: Partial<InstrumentVendor>): Promise<InstrumentVendor | undefined>;
  deleteInstrumentVendor(id: string): Promise<void>;

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
  { id: "album-1", title: "When the World Stops", artist: "Tim Snider & Wolfgang Timber", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png", year: 2024, type: "album", description: "A sweeping collection of songs about stillness, change, and the moments between." },
  { id: "album-2", title: "Guitar as a Voice", artist: "Fernando Perdomo", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png", year: 2024, type: "album", description: "Instrumental mastery meets emotional storytelling." },
  { id: "album-3", title: "Love Spell EP", artist: "Whitney Lyman", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png", year: 2024, type: "EP", description: "Four songs that cast a spell." },
  { id: "album-4", title: "California Way", artist: "TOMMYGUNN", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png", year: 2024, type: "album", description: "Sunshine, highways, and the stories only California can tell." },
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

  async getAlbums(): Promise<Album[]> {
    return db.select().from(albums);
  }
  async getAlbumById(id: string): Promise<Album | undefined> {
    const [a] = await db.select().from(albums).where(eq(albums.id, id));
    return a;
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

  async getInstruments(): Promise<(Instrument & { vendors: InstrumentVendor[] })[]> {
    const all = await db.select().from(instruments).orderBy(asc(instruments.name));
    if (all.length === 0) return [];
    const allVendors = await db
      .select()
      .from(instrumentVendors)
      .orderBy(asc(instrumentVendors.position));
    const byInstrument = new Map<string, InstrumentVendor[]>();
    for (const v of allVendors) {
      const list = byInstrument.get(v.instrumentId) ?? [];
      list.push(v);
      byInstrument.set(v.instrumentId, list);
    }
    return all.map((i) => ({ ...i, vendors: byInstrument.get(i.id) ?? [] }));
  }
  async getInstrumentById(id: string): Promise<(Instrument & { vendors: InstrumentVendor[] }) | undefined> {
    const [i] = await db.select().from(instruments).where(eq(instruments.id, id));
    if (!i) return undefined;
    const vendors = await db
      .select()
      .from(instrumentVendors)
      .where(eq(instrumentVendors.instrumentId, id))
      .orderBy(asc(instrumentVendors.position));
    return { ...i, vendors };
  }
  async createInstrument(data: InsertInstrument & { id?: string }): Promise<Instrument> {
    const [i] = await db.insert(instruments).values(data as any).returning();
    return i;
  }
  async updateInstrument(id: string, data: Partial<Instrument>): Promise<Instrument | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return (await this.getInstrumentById(id)) as Instrument | undefined;
    const [i] = await db.update(instruments).set(rest).where(eq(instruments.id, id)).returning();
    return i;
  }
  async deleteInstrument(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(instrumentVendors).where(eq(instrumentVendors.instrumentId, id));
      await tx.delete(instruments).where(eq(instruments.id, id));
    });
  }
  async createInstrumentVendor(data: InsertInstrumentVendor & { id?: string }): Promise<InstrumentVendor> {
    const [v] = await db.insert(instrumentVendors).values(data as any).returning();
    return v;
  }
  async updateInstrumentVendor(id: string, data: Partial<InstrumentVendor>): Promise<InstrumentVendor | undefined> {
    const { id: _i, instrumentId: _ii, ...rest } = data as any;
    if (Object.keys(rest).length === 0) {
      const [v] = await db.select().from(instrumentVendors).where(eq(instrumentVendors.id, id));
      return v;
    }
    const [v] = await db.update(instrumentVendors).set(rest).where(eq(instrumentVendors.id, id)).returning();
    return v;
  }
  async deleteInstrumentVendor(id: string): Promise<void> {
    await db.delete(instrumentVendors).where(eq(instrumentVendors.id, id));
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
    const rows = await db
      .select()
      .from(userAlbums)
      .innerJoin(albums, eq(userAlbums.albumId, albums.id))
      .where(eq(userAlbums.userId, userId));
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
        .where(eq(playlistSongs.playlistId, p.id))
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
      .where(eq(playlistSongs.playlistId, playlistId))
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
