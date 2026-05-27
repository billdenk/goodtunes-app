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
  albumCredits,
  type AlbumCredit,
  type InsertAlbumCredit,
  type CreditRole,
  type InsertCreditRole,
  users,
  customerUsers,
  type CustomerUser,
  type InsertCustomerUser,
  adminIdentities,
  customerIdentities,
  type AdminIdentity,
  type CustomerIdentity,
  adminTotp,
  type AdminTotp,
  adminEmailOtp,
  type AdminEmailOtp,
  adminPasswordResetTokens,
  type AdminPasswordResetToken,
  customerPasswordResetTokens,
  type CustomerPasswordResetToken,
  albums,
  songs,
  userAlbums,
  playlists,
  playlistSongs,
  songFavorites,
  artistFavorites,
  fanRecents,
  fanRecentSearches,
  type FanRecent,
  type FanRecentSearch,
  type FanRecentKind,
  type SongFavorite,
  type ArtistFavorite,
  authTokens,
  profilePhotos,
  analyticsEvents,
  jobRuns,
  type InsertJobRun,
  type JobRun,
  people,
  personDiscography,
  bandMembers,
  albumLineup,
  type BandMember,
  type InsertBandMember,
  type BandMemberWithPerson,
  type AlbumLineupWithPerson,
  instruments,
  instrumentVendors,
  vendors,
  labels,
  manufacturers,
  fulfillmentPartners,
  rfqs,
  rfqReplies,
  type Manufacturer,
  type InsertManufacturer,
  type FulfillmentPartner,
  type InsertFulfillmentPartner,
  type Rfq,
  type InsertRfq,
  type RfqReply,
  type InsertRfqReply,
  adminInvites,
  type AdminInvite,
  type InsertAdminInvite,
  trackWriters,
  trackPerformers,
  creditRoles,
  albumVideos,
  albumPhotos,
  orders,
  uploadValidations,
  pressingOrderRequests,
  type PressingOrderRequest,
  type PressingOrderPackageSnapshot,
  printGenerations,
  printArtifacts,
} from "@shared/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { softDeleteEntity } from "./softDelete";

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
  // Returns the set of album IDs that have at least one explicit song.
  // Used by the /api/albums + /api/albums/:id routes to derive the
  // album-level "E" badge from per-song flags without a per-album
  // round-trip. One query per list response.
  getExplicitAlbumIds(): Promise<Set<string>>;
  getSongsByAlbum(albumId: string): Promise<Song[]>;
  getSongById(id: string): Promise<Song | undefined>;
  getAllSongs(opts?: { includeHidden?: boolean }): Promise<Song[]>;
  getUserAlbums(userId: string): Promise<(UserAlbum & { album: Album })[]>;

  // CMS mutations (admin-only at the route layer).
  createAlbum(data: Omit<Album, "id"> & { id?: string }): Promise<Album>;
  updateAlbum(id: string, data: Partial<Album>): Promise<Album | undefined>;
  deleteAlbum(id: string): Promise<void>;
  createSong(data: Omit<Song, "id"> & { id?: string }): Promise<Song>;
  updateSong(id: string, data: Partial<Song>): Promise<Song | undefined>;
  // Atomically claim a song for Mux ingest. Conditional UPDATE that sets
  // mux_status='ingesting' only when no other caller has already claimed
  // it (i.e. the song has no mux_asset_id, or its previous attempt
  // errored, or we're explicitly re-ingesting after an audioUrl swap).
  // Returns true if THIS caller claimed it — false means someone else
  // already started, so the caller should bail out.
  claimSongForMuxIngest(id: string): Promise<boolean>;
  deleteSong(id: string): Promise<void>;

  // Bonus album content. Public reads expose only the rows attached to
  // the requested album; admin writes are scoped per-row. Cascade on
  // album delete keeps orphan rows out of the DB.
  listAlbumVideos(albumId: string): Promise<AlbumVideo[]>;
  listAllAlbumVideos(): Promise<AlbumVideo[]>;
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

  // Task #190 — Bands & members. Both sides hydrate the joined Person
  // name/photo so callers don't N+1.
  listBandMembers(bandId: string): Promise<BandMemberWithPerson[]>;
  listMemberBands(memberId: string): Promise<BandMemberWithPerson[]>;
  addBandMember(data: InsertBandMember): Promise<BandMember>;
  updateBandMember(id: string, data: Partial<InsertBandMember>): Promise<BandMember | undefined>;
  removeBandMember(id: string): Promise<void>;

  // Album-lineup snapshots — full-replace semantics (admin saves the whole
  // ordered list at once). `listAlbumLineup` returns empty when no
  // snapshot is pinned; callers fall back to current band roster.
  listAlbumLineup(albumId: string): Promise<AlbumLineupWithPerson[]>;
  setAlbumLineup(
    albumId: string,
    members: Array<{ memberId: string; roles: string[] | null; displayOrder: number }>,
  ): Promise<AlbumLineupWithPerson[]>;
  clearAlbumLineup(albumId: string): Promise<void>;
  // Task #193 — Roll up distinct performers across an album's tracks
  // (from track_performers / SuperCredits) into a proposed lineup, with
  // suggested role labels and a track count so the admin can accept the
  // suggestion in one click via PUT /api/admin/albums/:id/lineup.
  suggestAlbumLineupFromCredits(albumId: string): Promise<
    Array<{
      memberId: string;
      personName: string;
      photoUrl: string | null;
      roles: string[];
      trackCount: number;
    }>
  >;

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
  // `maker` is the joined vendor row referenced by makerVendorId (Task
  // #174) — null when the gear hasn't been linked to a builder yet.
  getInstruments(opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[]; maker: (Vendor & { parent?: Vendor | null }) | null })[]>;
  getInstrumentById(id: string, opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[]; maker: (Vendor & { parent?: Vendor | null }) | null }) | undefined>;
  createInstrument(data: InsertInstrument & { id?: string }): Promise<Instrument>;
  updateInstrument(id: string, data: Partial<Instrument>): Promise<Instrument | undefined>;
  deleteInstrument(id: string): Promise<void>;
  // Pre-delete usage check — how many track credits (performer rows)
  // currently reference this instrument. Used by the admin delete-
  // confirm dialog so the operator sees "Used on 12 track credits"
  // before they cascade.
  getInstrumentUsage(id: string): Promise<{ performerCount: number }>;

  // Label ENTITY CRUD. Each album.labelId points here (nullable, SET NULL).
  // Editing the label propagates to every album released on it.
  getLabels(): Promise<Label[]>;
  getLabelById(id: string): Promise<Label | undefined>;
  getLabelByDomain(domain: string): Promise<Label | undefined>;
  createLabel(data: InsertLabel & { id?: string }): Promise<Label>;
  updateLabel(id: string, data: Partial<Label>): Promise<Label | undefined>;
  deleteLabel(id: string): Promise<void>;

  // Vendor ENTITY CRUD (one real-world vendor per row — Carter, Reverb, …).
  // Editing here propagates to every instrument the vendor is attached to.
  getVendors(): Promise<Vendor[]>;
  getVendorById(id: string): Promise<Vendor | undefined>;
  getVendorByDomain(domain: string): Promise<Vendor | undefined>;
  // Task #500 — case-insensitive name lookup. Used by the gear scrape
  // route to resolve a JSON-LD `brand` string (e.g. "Ernie Ball") back
  // to an existing maker vendor row when the brand-alias map misses.
  getVendorByNameInsensitive(name: string): Promise<Vendor | undefined>;
  // Task #237 — only the top-level row for a domain (parent_vendor_id
  // IS NULL). Used by the create-flow collision check so a sub-brand's
  // domain match doesn't dead-end the operator on 409.
  getTopLevelVendorByDomain(domain: string): Promise<Vendor | undefined>;
  // Task #237 — list every sub-brand directly under this vendor.
  // Single-level: a sub-brand cannot itself be a parent.
  getVendorChildren(parentId: string): Promise<Vendor[]>;
  createVendor(data: InsertVendor & { id?: string }): Promise<Vendor>;
  updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor | undefined>;
  deleteVendor(id: string): Promise<void>;
  // Vendor profile reads — power the fan-facing VendorSheet tabs.
  // `getVendorInstruments` lists every (non-hidden) instrument attached to
  // this vendor. `getVendorSuperCreditArtists` derives artists by walking
  // track_performers → instruments → instrument_vendors, so any artist
  // credited as having played one of the vendor's instruments shows up.
  getVendorInstruments(vendorId: string): Promise<Instrument[]>;
  // Task #174 — every instrument whose headline maker (FK
  // instruments.makerVendorId) is this vendor. Used by the Maker profile
  // page in the admin so a Maker entity sees the gear it builds.
  getMakerInstruments(vendorId: string): Promise<Instrument[]>;
  getMakerInstrumentsWithResellers(vendorId: string): Promise<
    Array<
      Instrument & {
        resellers: Array<{
          id: string;
          name: string;
          domain: string | null;
          logoUrl: string | null;
          affiliateUrl: string | null;
        }>;
      }
    >
  >;
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

  // Admin-only: every GoodTunes-release track for a person, with a flag
  // indicating whether this person+instrument is already credited on it.
  // Mode "credited" filters to tracks where the person already has any
  // performer credit (any instrument/role); mode "all" returns every
  // GoodTunes-release track in the catalog as a fallback search.
  getPersonTracksForInstrument(
    personId: string,
    instrumentId: string,
    mode: "credited" | "all",
  ): Promise<Array<{
    songId: string;
    songTitle: string;
    trackNumber: number;
    albumId: string;
    albumTitle: string;
    albumArtwork: string;
    albumYear: number | null;
    alreadyCreditedHere: boolean;
    existingRole: string | null;
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
    production: (AlbumCredit & { person: Person | null })[];
  }>;
  createTrackWriter(data: InsertTrackWriter & { id?: string }): Promise<TrackWriter>;
  updateTrackWriter(id: string, data: Partial<TrackWriter>): Promise<TrackWriter | undefined>;
  deleteTrackWriter(id: string): Promise<void>;
  createTrackPerformer(data: InsertTrackPerformer & { id?: string }): Promise<TrackPerformer>;
  updateTrackPerformer(id: string, data: Partial<TrackPerformer>): Promise<TrackPerformer | undefined>;
  deleteTrackPerformer(id: string): Promise<void>;

  // Album-wide production credits (Producer / Mixed by / Mastered by /
  // engineering / A&R). Same person-snapshot pattern as track credits.
  listAlbumProductionCredits(albumId: string): Promise<(AlbumCredit & { person: Person | null })[]>;
  createAlbumProductionCredit(data: InsertAlbumCredit & { id?: string }): Promise<AlbumCredit>;
  deleteAlbumProductionCredit(id: string): Promise<void>;

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

  // Fan favorites (Task #395). userId is a customer_users.id; admin
  // sessions are never expected to call these (the routes are gated by
  // requireCustomer). Ordered ASC by createdAt so the client's "oldest
  // first" iteration order matches the legacy localStorage Set behavior.
  listSongFavorites(userId: string): Promise<SongFavorite[]>;
  addSongFavorite(userId: string, songId: string): Promise<void>;
  removeSongFavorite(userId: string, songId: string): Promise<void>;
  listArtistFavorites(userId: string): Promise<ArtistFavorite[]>;
  addArtistFavorite(userId: string, artistName: string): Promise<void>;
  removeArtistFavorite(userId: string, artistName: string): Promise<void>;

  // Task #530 — Fan recents + recent searches. Loose FK to customer_users.id;
  // upserts dedupe on (userId, entityKind, entityId), capping the list per
  // fan so it stays bounded (Apple Music keeps ~200).
  listFanRecents(userId: string): Promise<FanRecent[]>;
  upsertFanRecent(
    userId: string,
    row: { entityKind: FanRecentKind; entityId: string; title: string; subtitle?: string | null; thumbUrl?: string | null; href: string },
  ): Promise<void>;
  removeFanRecent(userId: string, id: string): Promise<void>;
  clearFanRecents(userId: string): Promise<void>;
  listFanRecentSearches(userId: string): Promise<FanRecentSearch[]>;
  upsertFanRecentSearch(
    userId: string,
    input:
      | { kind: "query"; displayQuery: string }
      | { kind: "entity"; entityKind: string; entityId: string; title: string; subtitle?: string | null; thumbUrl?: string | null; href: string },
  ): Promise<void>;
  clearFanRecentSearches(userId: string): Promise<void>;

  // Auth tokens (bearer)
  // `kind` defaults to "admin" for back-compat with the existing route
  // call sites — once those routes are kind-aware, every new token mint
  // should pass the actual kind. Task #265: under the hood we route to
  // either `admin_user_id` or `customer_user_id`, each with a real FK.
  createAuthToken(token: string, userId: string, kind?: "admin" | "customer"): Promise<void>;
  // Kind-aware lookup: returns the row only when the token's kind matches.
  // Used by host-routed endpoints to prevent a customer token being
  // replayed against an admin host, or vice versa.
  getAuthBy(token: string): Promise<{ userId: string; kind: "admin" | "customer" } | undefined>;
  deleteAuthToken(token: string): Promise<void>;

  // ---- Customer side (Task #31) ------------------------------------
  getCustomer(id: string): Promise<CustomerUser | undefined>;
  getCustomerByUsername(username: string): Promise<CustomerUser | undefined>;
  getCustomerByEmail(email: string): Promise<CustomerUser | undefined>;
  createCustomer(user: InsertCustomerUser): Promise<CustomerUser>;
  updateCustomer(id: string, data: Partial<CustomerUser>): Promise<CustomerUser | undefined>;

  // ---- Admin customers directory (Task #131) -----------------------
  // Read-only directory of fan accounts for the admin Customers section.
  // List returns each customer's row plus a roll-up (order count + lifetime
  // spend on paid/shipped orders + last activity timestamp). Profile
  // returns the customer + orders + collection items + playlist summaries.
  listAdminCustomers(opts?: { q?: string; limit?: number; offset?: number }): Promise<{
    rows: Array<CustomerUser & { orderCount: number; lifetimeSpendCents: number; lastActivityAt: Date | null }>;
    total: number;
  }>;
  getAdminCustomerProfile(id: string): Promise<{
    customer: CustomerUser;
    orders: Array<{ id: string; albumId: string; albumTitle: string; albumArtist: string; totalCents: number; status: string; goodDeedNumber: number | null; createdAt: Date | null; shippedAt: Date | null }>;
    collection: Array<{ id: string; albumId: string; albumTitle: string; albumArtist: string; albumArtwork: string; certificateNumber: number | null; acquiredAt: Date | null }>;
    playlists: Array<{ id: string; name: string; songCount: number; createdAt: Date | null }>;
  } | undefined>;

  // ---- OAuth identities --------------------------------------------
  findIdentity(kind: "admin" | "customer", provider: string, providerUserId: string): Promise<{ userId: string } | undefined>;
  linkIdentity(kind: "admin" | "customer", data: { userId: string; provider: string; providerUserId: string; email: string | null }): Promise<void>;
  listIdentities(kind: "admin" | "customer", userId: string): Promise<Array<{ id: string; provider: string; email: string | null; linkedAt: Date | null }>>;
  unlinkIdentity(kind: "admin" | "customer", userId: string, identityId: string): Promise<boolean>;

  // ---- Admin TOTP --------------------------------------------------
  getAdminTotp(userId: string): Promise<AdminTotp | undefined>;
  setAdminTotp(userId: string, secretEncrypted: string, recoveryCodeHashes: string[]): Promise<void>;
  deleteAdminTotp(userId: string): Promise<void>;
  // Removes a recovery hash from the stored array. Returns true if a hash
  // was actually removed (i.e. the supplied code matched something).
  consumeRecoveryCode(userId: string, matchHash: string): Promise<boolean>;

  // ---- Admin email-OTP (Task #57) ---------------------------------
  // Single active 6-digit code per admin. setAdminEmailOtp replaces any
  // previous code (issuing a new code invalidates the old one). The
  // delete is called after a successful verify so the row never lingers.
  getAdminEmailOtp(userId: string): Promise<AdminEmailOtp | undefined>;
  setAdminEmailOtp(userId: string, codeHash: string, expiresAt: Date): Promise<void>;
  bumpAdminEmailOtpAttempts(userId: string): Promise<void>;
  deleteAdminEmailOtp(userId: string): Promise<void>;
  // Atomic verify+consume: delete the row only if the stored hash still
  // matches `codeHash`. Returns true on the winning request; concurrent
  // duplicates see false. Use this in verify endpoints to prevent the
  // race where two parallel requests both pass verifyCode and both mint
  // tokens before the row is deleted.
  consumeAdminEmailOtp(userId: string, codeHash: string): Promise<boolean>;
  setUserFactorPref(userId: string, pref: "email" | "totp"): Promise<void>;

  // ---- Admin password reset (Task #269) ---------------------------
  // Single-use, scrypt-style: raw token only in the recipient's email,
  // we store SHA-256 hex. `createAdminPasswordResetToken` returns the
  // inserted row id so callers can audit. `consume` is the atomic
  // verify+mark: it sets consumedAt only if the row is currently
  // un-consumed and un-expired, returns the userId on the winning
  // request and undefined on duplicates or stale tokens.
  createAdminPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<AdminPasswordResetToken>;
  getActiveAdminPasswordResetToken(tokenHash: string): Promise<AdminPasswordResetToken | undefined>;
  consumeAdminPasswordResetToken(tokenHash: string): Promise<string | undefined>;
  invalidateAdminPasswordResetTokensForUser(userId: string): Promise<void>;

  // ---- Customer password reset (Task #271) ------------------------
  // Mirror of the admin flow against customer_users. OAuth-only fans
  // (customer_users.password IS NULL) are filtered out at the route
  // layer — there's no password to reset.
  createCustomerPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<CustomerPasswordResetToken>;
  getActiveCustomerPasswordResetToken(tokenHash: string): Promise<CustomerPasswordResetToken | undefined>;
  consumeCustomerPasswordResetToken(tokenHash: string): Promise<string | undefined>;
  invalidateCustomerPasswordResetTokensForUser(userId: string): Promise<void>;

  // Super-admin grant/revoke (Task #31 step 9). `listAdmins` is the
  // source of truth for the admin-only UI.
  listAdmins(): Promise<Array<{ id: string; username: string; email: string; displayName: string }>>

  // Profile photo
  getProfilePhoto(userId: string): Promise<string | null>;
  setProfilePhoto(userId: string, photoUrl: string): Promise<void>;
  hasProfilePhoto(userId: string): Promise<boolean>;
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
  getRecentAnalyticsEvents(limit: number): Promise<any[]>;

  // Job-run audit log (Dropbox imports, GoodSync, etc.).
  recordJobRun(data: InsertJobRun): Promise<JobRun>;
  getJobRunById(id: string): Promise<JobRun | undefined>;
  listJobRuns(opts?: { limit?: number; albumId?: string; songId?: string; jobType?: string }): Promise<JobRun[]>;

  // Task #69 — Manufacturer + fulfillment partner entity CRUD. Mirrors
  // the Label entity shape (one row per partner, edit propagates).
  getManufacturers(): Promise<Manufacturer[]>;
  getManufacturerById(id: string): Promise<Manufacturer | undefined>;
  getManufacturerByDomain(domain: string): Promise<Manufacturer | undefined>;
  createManufacturer(data: InsertManufacturer & { id?: string }): Promise<Manufacturer>;
  updateManufacturer(id: string, data: Partial<Manufacturer>): Promise<Manufacturer | undefined>;
  deleteManufacturer(id: string): Promise<void>;

  getFulfillmentPartners(): Promise<FulfillmentPartner[]>;
  getFulfillmentPartnerById(id: string): Promise<FulfillmentPartner | undefined>;
  getFulfillmentPartnerByDomain(domain: string): Promise<FulfillmentPartner | undefined>;
  createFulfillmentPartner(data: InsertFulfillmentPartner & { id?: string }): Promise<FulfillmentPartner>;
  updateFulfillmentPartner(id: string, data: Partial<FulfillmentPartner>): Promise<FulfillmentPartner | undefined>;
  deleteFulfillmentPartner(id: string): Promise<void>;

  // RFQ flow — basic data layer. UI for the comparison + accept flow
  // lands in a follow-up; today the routes expose CRUD so plants can
  // submit quotes via /admin/rfqs even before the polished compare
  // table ships.
  listRfqs(opts?: { albumId?: string }): Promise<Rfq[]>;
  getRfqById(id: string): Promise<Rfq | undefined>;
  createRfq(data: InsertRfq & { createdByUserId: string; manufacturerIds: string[] }): Promise<Rfq>;
  listRfqReplies(rfqId: string): Promise<RfqReply[]>;
  listRfqRepliesForManufacturer(manufacturerId: string): Promise<RfqReply[]>;
  upsertRfqReply(rfqId: string, manufacturerId: string, patch: Partial<RfqReply>): Promise<RfqReply>;
  acceptRfqReply(rfqId: string, replyId: string): Promise<Rfq | undefined>;

  // Admin invites — outstanding tokens that bind an email + role to a
  // one-shot signup link. Accepts on the recipient's first /invite/:token
  // POST. We never expose the token over GET-by-id; lookups happen by
  // token only so a leaked invite list can't be re-emailed.
  createAdminInvite(data: InsertAdminInvite & { token: string; expiresAt: Date; createdByUserId: string }): Promise<AdminInvite>;
  listPendingAdminInvites(): Promise<AdminInvite[]>;
  getAdminInviteByToken(token: string): Promise<AdminInvite | undefined>;
  markAdminInviteUsed(id: string, acceptedUserId: string): Promise<void>;
  deleteAdminInvite(id: string): Promise<void>;
  revokeAdminInvite(id: string): Promise<void>;
  resendAdminInvite(id: string, newToken: string, newExpiresAt: Date): Promise<AdminInvite | undefined>;
  getAdminInviteById(id: string): Promise<AdminInvite | undefined>;

  // ---- Task #216 — Upload validation results ----------------------
  // Persisted preflight outcomes for art / audio uploads. The same row
  // backs both the artist-side upload UI and the admin Orders queue.
  listUploadValidations(albumId: string): Promise<UploadValidationRow[]>;
  getUploadValidation(id: string): Promise<UploadValidationRow | undefined>;
  insertUploadValidation(data: InsertUploadValidationRow): Promise<UploadValidationRow>;
  overrideUploadValidation(
    id: string,
    justification: string,
    byUserId: string,
  ): Promise<UploadValidationRow | undefined>;
  deleteUploadValidation(id: string): Promise<void>;

  // ---- Task #225 — Pressing-order requests --------------------------
  listPressingOrderRequests(opts: {
    status?: "pending" | "approved" | "rejected" | "cancelled" | "all";
    albumIds?: string[] | null;
  }): Promise<PressingOrderRequest[]>;
  getPressingOrderRequest(id: string): Promise<PressingOrderRequest | undefined>;
  getLatestPressingOrderRequestForAlbum(albumId: string): Promise<PressingOrderRequest | undefined>;
  insertPressingOrderRequest(data: {
    albumId: string;
    packageSnapshot: PressingOrderPackageSnapshot;
    quantity: number;
    unitCents: number;
    totalCents: number;
    preflightStatus: string | null;
    submittedByUserId: string;
  }): Promise<PressingOrderRequest>;
  decidePressingOrderRequest(
    id: string,
    decision: "approved" | "rejected" | "cancelled",
    decidedByUserId: string,
    rejectionNote?: string | null,
  ): Promise<PressingOrderRequest | undefined>;

  // ---- Task #217 — Print PDF generations ---------------------------
  // One row per "Generate print PDFs" click on a release; child
  // print_artifacts rows are the per-template PDFs produced.
  listPrintGenerations(albumId: string): Promise<PrintGenerationWithArtifacts[]>;
  insertPrintGeneration(args: {
    albumId: string;
    vendorId: string;
    createdByUserId: string | null;
    overrideJustification: string | null;
    artifacts: Array<{
      templateId: string;
      templateLabel: string;
      fileName: string;
      assetUrl: string;
      sizeBytes: number;
    }>;
  }): Promise<PrintGenerationWithArtifacts>;

  // ---- Task #336 — Global admin search -----------------------------
  searchPeople(q: string, limit: number): Promise<Array<{ id: string; name: string; photoUrl: string | null }>>;
  searchVendorsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string; isMaker: boolean; isReseller: boolean }>>;
  searchLabelsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>>;
  searchAlbumsAdmin(q: string, limit: number): Promise<Array<{ id: string; title: string; artist: string }>>;
  searchInstrumentsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string; category: string | null }>>;
  searchCustomersAdmin(q: string, limit: number): Promise<Array<{ id: string; displayName: string; email: string }>>;
  searchManufacturersAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>>;
  searchFulfillmentAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>>;
  searchNonProfitsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>>;
  // Task #338 — songs, playlists, and orders.
  searchSongsAdmin(q: string, limit: number): Promise<Array<{ id: string; title: string; albumId: string; albumTitle: string; albumArtist: string }>>;
  searchPlaylistsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string; ownerId: string; ownerName: string | null }>>;
  searchOrdersAdmin(q: string, limit: number): Promise<{
    fan: Array<{ id: string; goodDeedNumber: number | null; buyerName: string | null; buyerEmail: string | null; status: string; albumTitle: string | null }>;
    pressing: Array<{ id: string; status: string; albumTitle: string | null; quantity: number }>;
  }>;
}

export type PrintGenerationWithArtifacts = {
  id: string;
  albumId: string;
  vendorId: string;
  createdByUserId: string | null;
  overrideJustification: string | null;
  createdAt: Date;
  artifacts: Array<{
    id: string;
    templateId: string;
    templateLabel: string;
    fileName: string;
    assetUrl: string;
    sizeBytes: number;
  }>;
};

export type UploadValidationRow = {
  id: string;
  albumId: string;
  kind: "art" | "audio";
  vendorId: string;
  templateId: string | null;
  assetUrl: string;
  fileName: string | null;
  status: "pass" | "warn" | "fail";
  checks: Array<{ key: string; label: string; status: "pass" | "warn" | "fail"; message: string }>;
  overrideJustification: string | null;
  overrideByUserId: string | null;
  overrideAt: Date | null;
  createdAt: Date;
};
export type InsertUploadValidationRow = Omit<UploadValidationRow, "id" | "createdAt" | "overrideJustification" | "overrideByUserId" | "overrideAt"> & {
  id?: string;
};

// Seed catalog (albums + songs). Kept inline rather than imported from the
// client `musicData.ts` because that module pulls Vite-managed `@assets/*`
// imports that the server can't resolve. The catalog tables for people /
// instruments / vendors / credits land in the next phase along with the CMS.
// Seed albums predate later schema additions (linerNotes, isExplicit, payout
// override columns added in task #48). Keep the seed loose and let the DB
// defaults fill in the rest.
type SeedAlbum = Omit<
  Album,
  | "isExplicit"
  | "linerNotes"
  | "payoutFeePctOverride"
  | "payoutCertCentsOverride"
  | "payoutOwnerKind"
  | "payoutOwnerId"
  | "priceCents"
  | "firstSoldAt"
  | "maxRedemptions"
  | "signedCertRetailCents"
  | "shopifyPushStoreId"
  | "shopifyPushProductId"
  | "shopifyPushEditionVariantId"
  | "shopifyPushCertVariantId"
  | "shopifyPushedAt"
  | "shopifyPushSnapshot"
>;
const SEED_ALBUMS: SeedAlbum[] = [
  { id: "album-1", title: "When the World Stops", artist: "Tim Snider & Wolfgang Timber", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png", year: 2024, type: "LP", description: "A sweeping collection of songs about stillness, change, and the moments between.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
  { id: "album-2", title: "Guitar as a Voice", artist: "Fernando Perdomo", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png", year: 2024, type: "LP", description: "Instrumental mastery meets emotional storytelling.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
  { id: "album-3", title: "Love Spell EP", artist: "Whitney Lyman", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png", year: 2024, type: "EP", description: "Four songs that cast a spell.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
  { id: "album-4", title: "California Way", artist: "TOMMYGUNN", artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png", year: 2024, type: "LP", description: "Sunshine, highways, and the stories only California can tell.", labelId: null, isHidden: false, isGoodTunesRelease: true, appleMusicUrl: null, spotifyUrl: null, goodTunesReleaseDate: null, streamingReleaseDate: null, primaryArtistId: null, genre: null },
];

// Seed songs predate the syncedLyrics + instrumental columns, so we type
// them loosely and supply the defaults at the insert-site below.
type SeedSong = Omit<
  Song,
  "syncedLyrics" | "instrumental" | "previewStartMs" | "previewEndMs" | "waveform" | "audioSourceUrl" | "isExplicit" | "isPreviewable" | "previewHidden" | "previewHiddenUntil" | "playlistCount" | "muxAssetId" | "muxPlaybackId" | "muxStatus" | "muxRetryCount" | "muxLastRetryAt"
> & {
  syncedLyrics?: Song["syncedLyrics"];
  instrumental?: Song["instrumental"];
  previewStartMs?: Song["previewStartMs"];
  previewEndMs?: Song["previewEndMs"];
  waveform?: Song["waveform"];
  audioSourceUrl?: Song["audioSourceUrl"];
  isExplicit?: Song["isExplicit"];
  isPreviewable?: Song["isPreviewable"];
  playlistCount?: Song["playlistCount"];
  muxAssetId?: Song["muxAssetId"];
  muxPlaybackId?: Song["muxPlaybackId"];
  muxStatus?: Song["muxStatus"];
};
const SEED_SONGS: SeedSong[] = [
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

// Lazy sunrise sweep — when a song's `previewHiddenUntil` has passed,
// we treat it as no longer hidden in the response AND fire-and-forget
// an UPDATE that clears both `previewHidden` and `previewHiddenUntil`
// so the row's stored state matches what fans see. Audited to console
// so it shows up in the workflow logs alongside other song mutations.
// Returns the (possibly normalized) row — never mutates the caller's
// reference in a way that would surprise downstream consumers.
function normalizePreviewHide(row: any): any {
  if (!row) return row;
  let hidden = row.previewHidden === true;
  let until = row.previewHiddenUntil ? new Date(row.previewHiddenUntil) : null;
  if (hidden && until && until.getTime() <= Date.now()) {
    // Sunrise has passed — clear the hide flag in the DB and on the
    // response copy. Fire-and-forget; if the UPDATE fails, the next
    // read will retry. The audit log lets ops trace auto-unhides.
    db.update(songs)
      .set({ previewHidden: false, previewHiddenUntil: null })
      .where(eq(songs.id, row.id))
      .then(() => {
        console.log(
          `[song-preview-sunrise] auto-unhid song ${row.id} (sunrise ${until!.toISOString()})`,
        );
      })
      .catch((err) => {
        console.warn(
          `[song-preview-sunrise] failed to auto-unhide song ${row.id}: ${err?.message || err}`,
        );
      });
    hidden = false;
    until = null;
  }
  // Fan-facing `isPreviewable` is fully derived from the inverted
  // hide flag — every track is previewable unless the admin has
  // explicitly hidden it (and the sunrise, if any, hasn't fired).
  // The stored `is_previewable` column is legacy and ignored on read.
  return {
    ...row,
    previewHidden: hidden,
    previewHiddenUntil: until,
    isPreviewable: !hidden,
  };
}

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
  async getAlbums(opts?: { includeHidden?: boolean; includeTrashed?: boolean }): Promise<AlbumWithLabel[]> {
    // Apple-Music / Spotify standard: alphabetical by title as a single
    // string. Postgres lower() makes it case-insensitive at the SQL
    // layer so we don't pay a JS sort cost on every list fetch.
    // Task #475 — soft-deleted rows are hidden from every list/detail
    // read path; the only surface that sees them is /admin/trash via
    // raw SQL in server/softDelete.ts.
    const conds = [isNull(albums.deletedAt)];
    if (!opts?.includeHidden) conds.push(eq(albums.isHidden, false));
    const rows = await db
      .select()
      .from(albums)
      // Soft-deleted labels are joined as NULL — the album survives the
      // label's deletion, but the credit clears (mirrors what restoring
      // the label later would re-attach).
      .leftJoin(labels, and(eq(albums.labelId, labels.id), isNull(labels.deletedAt)))
      .where(and(...conds))
      .orderBy(asc(sql`lower(${albums.title})`));
    return rows.map((r) => ({ ...r.albums, label: r.labels ?? null }));
  }
  async getAlbumById(id: string, opts?: { includeHidden?: boolean; includeTrashed?: boolean }): Promise<AlbumWithLabel | undefined> {
    const [row] = await db
      .select()
      .from(albums)
      .leftJoin(labels, and(eq(albums.labelId, labels.id), isNull(labels.deletedAt)))
      .where(eq(albums.id, id));
    if (!row) return undefined;
    if (row.albums.deletedAt && !opts?.includeTrashed) return undefined;
    if (row.albums.isHidden && !opts?.includeHidden) return undefined;
    return { ...row.albums, label: row.labels ?? null };
  }
  async getSongsByAlbum(albumId: string): Promise<Song[]> {
    const rows = await db.select().from(songs)
      .where(and(eq(songs.albumId, albumId), isNull(songs.deletedAt)))
      .orderBy(asc(songs.trackNumber));
    return rows.map((r) => normalizePreviewHide(r));
  }
  async getExplicitAlbumIds(): Promise<Set<string>> {
    const rows = await db
      .selectDistinct({ albumId: songs.albumId })
      .from(songs)
      .where(and(eq(songs.isExplicit, true), isNull(songs.deletedAt)));
    return new Set(rows.map((r) => r.albumId));
  }
  async getSongById(id: string): Promise<Song | undefined> {
    const [s] = await db.select().from(songs)
      .where(and(eq(songs.id, id), isNull(songs.deletedAt)));
    return s ? normalizePreviewHide(s) : s;
  }
  // Used by the fan-side `/api/songs` endpoint so PlayerContext can build
  // an id→DB-song hydration map. Every entry point that builds a queue
  // (album page, artist page, Songs tab, playlists, etc.) routes through
  // playSong → hydrate, so the player always reads real DB fields
  // (syncedLyrics, audioUrl, lyrics) regardless of how the queue was
  // assembled. Lightweight enough to ship the whole catalog today; if the
  // catalog grows past a few thousand rows we'll switch to per-album fetch.
  // Hidden-album filter mirrors getAlbums: non-admins must not be able to
  // enumerate songs from demo-hidden albums by hitting this endpoint.
  async getAllSongs(opts?: { includeHidden?: boolean }): Promise<Song[]> {
    if (opts?.includeHidden) {
      const all = await db.select().from(songs).where(isNull(songs.deletedAt));
      return all.map((r) => normalizePreviewHide(r));
    }
    const rows = await db
      .select({ song: songs })
      .from(songs)
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .where(and(eq(albums.isHidden, false), isNull(songs.deletedAt), isNull(albums.deletedAt)));
    return rows.map((r) => normalizePreviewHide(r.song));
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
  async deleteAlbum(id: string, userId?: string | null): Promise<void> {
    // Task #475 — Soft-delete. Stamps `deleted_at` on the album and
    // soft-cascades to songs / album_videos / album_photos /
    // album_credits (and song→track_writers/track_performers in turn);
    // `user_albums` rows stay live so fans who own the album still see
    // their certificate, and `playlist_songs` get hard-removed inside
    // the song path so trashed songs don't haunt playlists. Restore is
    // reversible until the 30-day sweeper purges the row.
    await softDeleteEntity("album", id, userId ?? null);
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
      .where(and(eq(albumVideos.albumId, albumId), isNull(albumVideos.deletedAt)))
      .orderBy(asc(albumVideos.position), asc(albumVideos.id));
  }
  async listAllAlbumVideos(): Promise<AlbumVideo[]> {
    return db.select().from(albumVideos).where(isNull(albumVideos.deletedAt));
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
  async deleteAlbumVideo(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("album_video", id, userId ?? null);
  }
  async listAlbumPhotos(albumId: string): Promise<AlbumPhoto[]> {
    return db.select().from(albumPhotos)
      .where(and(eq(albumPhotos.albumId, albumId), isNull(albumPhotos.deletedAt)))
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
  async deleteAlbumPhoto(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("album_photo", id, userId ?? null);
  }
  async updateSong(id: string, data: Partial<Song>): Promise<Song | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return this.getSongById(id);
    const [s] = await db.update(songs).set(rest).where(eq(songs.id, id)).returning();
    return s;
  }
  async claimSongForMuxIngest(id: string): Promise<boolean> {
    // Atomic compare-and-swap: only one caller (auto-ingest hook OR boot
    // backfill OR explicit retry route) can flip a song into "ingesting"
    // at a time. Eligible rows: never-ingested (NULL asset) or previously
    // errored. The asset_id reset clears any stale linkage so callers
    // always see a clean slate when they win the claim.
    const rows = await db
      .update(songs)
      .set({ muxStatus: "ingesting", muxAssetId: null, muxPlaybackId: null })
      .where(
        and(
          eq(songs.id, id),
          sql`(${songs.muxAssetId} IS NULL OR ${songs.muxStatus} = 'errored')`,
        ),
      )
      .returning({ id: songs.id });
    return rows.length > 0;
  }
  async deleteSong(id: string, userId?: string | null): Promise<void> {
    // Task #475 — Soft-delete. Stamps `deleted_at` and soft-cascades
    // to track_writers + track_performers; playlist_songs are hard-
    // deleted inside softDeleteEntity so the song doesn't keep
    // appearing in saved playlists while it sits in the trash.
    await softDeleteEntity("song", id, userId ?? null);
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
    return db.select().from(people).where(isNull(people.deletedAt)).orderBy(asc(people.name));
  }
  async getPersonById(id: string): Promise<Person | undefined> {
    const [p] = await db.select().from(people)
      .where(and(eq(people.id, id), isNull(people.deletedAt)));
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
  async deletePerson(id: string, userId?: string | null): Promise<void> {
    // Task #475 — Soft-delete. Soft-cascades to band_members on either
    // side (band_id or member_id) so the band roster comes back cleanly
    // on Restore. track_writers / track_performers / album_credits
    // already have ON DELETE SET NULL on personId — we don't soft-touch
    // those rows because the snapshotted `name` text keeps the credit
    // rendering correctly while the Person sits in trash.
    await softDeleteEntity("person", id, userId ?? null);
  }

  // ---- Task #190 — Bands & members ---------------------------------
  async listBandMembers(bandId: string): Promise<BandMemberWithPerson[]> {
    const rows = await db
      .select({ bm: bandMembers, p: people })
      .from(bandMembers)
      .innerJoin(people, eq(bandMembers.memberId, people.id))
      .where(and(
        eq(bandMembers.bandId, bandId),
        isNull(bandMembers.deletedAt),
        isNull(people.deletedAt),
      ))
      .orderBy(asc(bandMembers.displayOrder), asc(people.name));
    return rows.map((r) => ({
      ...r.bm,
      memberName: r.p.name,
      memberPhotoUrl: r.p.photoUrl ?? null,
      memberIsGroup: !!r.p.isGroup,
    }));
  }

  async listMemberBands(memberId: string): Promise<BandMemberWithPerson[]> {
    const rows = await db
      .select({ bm: bandMembers, p: people })
      .from(bandMembers)
      .innerJoin(people, eq(bandMembers.bandId, people.id))
      .where(and(
        eq(bandMembers.memberId, memberId),
        isNull(bandMembers.deletedAt),
        isNull(people.deletedAt),
      ))
      .orderBy(asc(people.name));
    // memberName/photo here reflect the BAND (the other side), so the
    // caller can render "Plays in: <band>" without a second fetch.
    return rows.map((r) => ({
      ...r.bm,
      memberName: r.p.name,
      memberPhotoUrl: r.p.photoUrl ?? null,
      memberIsGroup: !!r.p.isGroup,
    }));
  }

  async addBandMember(data: InsertBandMember): Promise<BandMember> {
    const [row] = await db.insert(bandMembers).values(data as any).returning();
    return row;
  }

  async updateBandMember(
    id: string,
    data: Partial<InsertBandMember>,
  ): Promise<BandMember | undefined> {
    const { id: _i, ...rest } = data as any;
    if (Object.keys(rest).length === 0) {
      const [row] = await db.select().from(bandMembers).where(eq(bandMembers.id, id));
      return row;
    }
    const [row] = await db
      .update(bandMembers)
      .set(rest)
      .where(eq(bandMembers.id, id))
      .returning();
    return row;
  }

  async removeBandMember(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("band_member", id, userId ?? null);
  }

  async listAlbumLineup(albumId: string): Promise<AlbumLineupWithPerson[]> {
    const rows = await db
      .select({ al: albumLineup, p: people })
      .from(albumLineup)
      .innerJoin(people, eq(albumLineup.memberId, people.id))
      .where(eq(albumLineup.albumId, albumId))
      .orderBy(asc(albumLineup.displayOrder), asc(people.name));
    return rows.map((r) => ({
      ...r.al,
      memberName: r.p.name,
      memberPhotoUrl: r.p.photoUrl ?? null,
    }));
  }

  async setAlbumLineup(
    albumId: string,
    members: Array<{ memberId: string; roles: string[] | null; displayOrder: number }>,
  ): Promise<AlbumLineupWithPerson[]> {
    await db.transaction(async (tx) => {
      await tx.delete(albumLineup).where(eq(albumLineup.albumId, albumId));
      if (members.length > 0) {
        await tx
          .insert(albumLineup)
          .values(
            members.map((m) => ({
              albumId,
              memberId: m.memberId,
              roles: m.roles,
              displayOrder: m.displayOrder,
            })) as any,
          );
      }
    });
    return this.listAlbumLineup(albumId);
  }

  async clearAlbumLineup(albumId: string): Promise<void> {
    await db.delete(albumLineup).where(eq(albumLineup.albumId, albumId));
  }

  async suggestAlbumLineupFromCredits(albumId: string): Promise<
    Array<{
      memberId: string;
      personName: string;
      photoUrl: string | null;
      roles: string[];
      trackCount: number;
    }>
  > {
    // Walk every track on the album → join its performer rows → join
    // the Person row. Personless credits (name-snapshot only) and the
    // primary artist themselves are skipped: a lineup is *members*, and
    // a band's own row would otherwise show up if it ever got
    // accidentally tagged on a track.
    const album = await db
      .select({ primaryArtistId: albums.primaryArtistId })
      .from(albums)
      .where(eq(albums.id, albumId))
      .limit(1);
    const primaryArtistId = album[0]?.primaryArtistId ?? null;

    // Task #448 — LEFT join people so name-only performer rows
    // (personId NULL — common after liner-notes paste or scraped imports
    // where the row was created with just a name snapshot) still surface
    // in the roll-up. We re-attach them to an existing Person by
    // case-insensitive exact name match below; if there's no Person row
    // at all we skip (lineup rows require a Person FK).
    const rows = await db
      .select({
        personId: trackPerformers.personId,
        role: trackPerformers.role,
        songId: trackPerformers.songId,
        snapshotName: trackPerformers.name,
        personName: people.name,
        photoUrl: people.photoUrl,
      })
      .from(trackPerformers)
      .innerJoin(songs, eq(trackPerformers.songId, songs.id))
      .leftJoin(people, eq(trackPerformers.personId, people.id))
      .where(eq(songs.albumId, albumId));

    // Resolve name-only rows by matching against existing People (case-
    // insensitive exact). Single batched query keyed by lowercased name.
    const orphanNames = Array.from(
      new Set(
        rows
          .filter((r) => !r.personId && r.snapshotName)
          .map((r) => r.snapshotName.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const orphanMatches = new Map<
      string,
      { id: string; name: string; photoUrl: string | null }
    >();
    if (orphanNames.length > 0) {
      const matched = await db
        .select({ id: people.id, name: people.name, photoUrl: people.photoUrl })
        .from(people)
        .where(inArray(sql`lower(${people.name})`, orphanNames));
      for (const m of matched) {
        orphanMatches.set(m.name.trim().toLowerCase(), m);
      }
    }

    // Aggregate by personId. Collapse role variants like "Composer ·
    // Violin" down to the instrument label after the bullet when one
    // exists, otherwise use the raw role. Distinct, order-preserving.
    const agg = new Map<
      string,
      {
        memberId: string;
        personName: string;
        photoUrl: string | null;
        roles: string[];
        roleSet: Set<string>;
        songIds: Set<string>;
      }
    >();
    for (const r of rows) {
      // Resolve the effective Person for this row: either the FK or a
      // name-match against existing People. Unmatched name-only rows
      // (no Person row exists at all) can't be pinned to a lineup, so
      // we skip them — operator can add the Person and they'll roll
      // up on the next refresh.
      let personId = r.personId;
      let personName = r.personName;
      let photoUrl = r.photoUrl;
      if (!personId && r.snapshotName) {
        const m = orphanMatches.get(r.snapshotName.trim().toLowerCase());
        if (m) {
          personId = m.id;
          personName = m.name;
          photoUrl = m.photoUrl;
        }
      }
      if (!personId || !personName) continue;
      if (primaryArtistId && personId === primaryArtistId) continue;
      const cleanedRole = (() => {
        const raw = (r.role ?? "").trim();
        if (!raw) return "";
        // "Composer · Violin" → "Violin" for lineup labels; keep raw
        // otherwise so producers/engineers/etc. still render legibly.
        const parts = raw.split("·").map((s) => s.trim()).filter(Boolean);
        return parts.length > 1 ? parts[parts.length - 1] : raw;
      })();
      let entry = agg.get(personId);
      if (!entry) {
        entry = {
          memberId: personId,
          personName: personName,
          photoUrl: photoUrl ?? null,
          roles: [],
          roleSet: new Set<string>(),
          songIds: new Set<string>(),
        };
        agg.set(personId, entry);
      }
      entry.songIds.add(r.songId);
      if (cleanedRole && !entry.roleSet.has(cleanedRole)) {
        entry.roleSet.add(cleanedRole);
        entry.roles.push(cleanedRole);
      }
    }

    return Array.from(agg.values())
      .map((e) => ({
        memberId: e.memberId,
        personName: e.personName,
        photoUrl: e.photoUrl,
        roles: e.roles,
        trackCount: e.songIds.size,
      }))
      .sort((a, b) => b.trackCount - a.trackCount || a.personName.localeCompare(b.personName));
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

  // Task #174 — bulk-load the headline Maker (vendor) for a set of
  // instruments in one round trip. Returns a map keyed by instrument id;
  // entries are absent when the instrument has no makerVendorId.
  // Task #237 — when a maker is a sub-brand (parentVendorId set) we
  // also hydrate the parent vendor onto the maker as `.parent`, so
  // the AdminInstrument header can render "Epiphone — Owned by Gibson"
  // without a second roundtrip.
  private async loadMakers(instrumentRows: Instrument[]): Promise<Map<string, Vendor & { parent?: Vendor | null }>> {
    const out = new Map<string, Vendor & { parent?: Vendor | null }>();
    const makerIds = Array.from(
      new Set(
        instrumentRows
          .map((i) => (i as any).makerVendorId as string | null)
          .filter((x): x is string => !!x),
      ),
    );
    if (makerIds.length === 0) return out;
    const rows = await db.select().from(vendors).where(inArray(vendors.id, makerIds));
    const byId = new Map(rows.map((v) => [v.id, v]));
    const parentIds = Array.from(
      new Set(
        rows
          .map((v) => (v as any).parentVendorId as string | null)
          .filter((x): x is string => !!x),
      ),
    );
    const parentsById = new Map<string, Vendor>();
    if (parentIds.length > 0) {
      const prows = await db.select().from(vendors).where(inArray(vendors.id, parentIds));
      for (const p of prows) parentsById.set(p.id, p);
    }
    for (const i of instrumentRows) {
      const mid = (i as any).makerVendorId as string | null;
      if (mid && byId.has(mid)) {
        const maker = byId.get(mid)!;
        const pid = (maker as any).parentVendorId as string | null;
        const enriched = { ...maker, parent: pid ? parentsById.get(pid) ?? null : null };
        out.set(i.id, enriched);
      }
    }
    return out;
  }

  async getInstruments(opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[]; maker: (Vendor & { parent?: Vendor | null }) | null })[]> {
    const all = await db.select().from(instruments)
      .where(isNull(instruments.deletedAt))
      .orderBy(asc(instruments.name));
    if (all.length === 0) return [];
    const [byInstrument, makers] = await Promise.all([
      this.loadEnrichedAttachments(all.map((i) => i.id), !!opts?.includeHiddenVendors),
      this.loadMakers(all),
    ]);
    return all.map((i) => ({
      ...i,
      vendors: byInstrument.get(i.id) ?? [],
      maker: makers.get(i.id) ?? null,
    }));
  }
  async getInstrumentById(id: string, opts?: { includeHiddenVendors?: boolean }): Promise<(Instrument & { vendors: EnrichedInstrumentVendor[]; maker: (Vendor & { parent?: Vendor | null }) | null }) | undefined> {
    const [i] = await db.select().from(instruments)
      .where(and(eq(instruments.id, id), isNull(instruments.deletedAt)));
    if (!i) return undefined;
    const [byInstrument, makers] = await Promise.all([
      this.loadEnrichedAttachments([id], !!opts?.includeHiddenVendors),
      this.loadMakers([i]),
    ]);
    return { ...i, vendors: byInstrument.get(id) ?? [], maker: makers.get(id) ?? null };
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
  async deleteInstrument(id: string, userId?: string | null): Promise<void> {
    // Task #475 — Soft-delete. The instrument_vendors join rows stay
    // alive (no soft-delete column there) and only get hard-cascaded
    // away when the row is eventually purged or sweeper-collected.
    // Restoring the instrument therefore brings back the reseller list
    // it had at delete time.
    await softDeleteEntity("instrument", id, userId ?? null);
  }

  async getInstrumentUsage(id: string): Promise<{ performerCount: number }> {
    // Count track_performer rows referencing this instrument. These are
    // the credit lines that will have their `instrumentId` SET NULL on
    // delete (the snapshot `name` survives, the gear link is what's lost).
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(trackPerformers)
      .where(eq(trackPerformers.instrumentId, id));
    return { performerCount: row?.c ?? 0 };
  }

  // ----- Label ENTITY CRUD --------------------------------------------
  async getLabels(): Promise<Label[]> {
    return await db.select().from(labels)
      .where(isNull(labels.deletedAt))
      .orderBy(asc(labels.name));
  }
  async getLabelByDomain(domain: string): Promise<Label | undefined> {
    const [l] = await db.select().from(labels)
      .where(and(eq(labels.domain, domain), isNull(labels.deletedAt)));
    return l;
  }
  async getLabelById(id: string): Promise<Label | undefined> {
    const [l] = await db.select().from(labels)
      .where(and(eq(labels.id, id), isNull(labels.deletedAt)));
    return l;
  }
  async createLabel(data: InsertLabel & { id?: string }): Promise<Label> {
    const [l] = await db.insert(labels).values(data as any).returning();
    return l;
  }
  async updateLabel(id: string, data: Partial<Label> & { __bypassLogoLock?: boolean }): Promise<Label | undefined> {
    const { id: _i, createdAt: _c, __bypassLogoLock, ...rest } = data as any;
    // Curation lock guard. If the row is locked AND the caller hasn't
    // opted in via `__bypassLogoLock`, drop the `logoUrl` write silently
    // — that path is reserved for explicit operator Replace from the
    // admin Logo dialog. Automated/enrichment callers that don't know
    // about the bypass flag (favicon backfills, future re-scrape jobs)
    // therefore can't overwrite a curated logo. Mirrors the
    // `people.photoLocked` / `people.coverLocked` contract.
    if (rest.logoUrl !== undefined && !__bypassLogoLock) {
      const current = await this.getLabelById(id);
      if (current?.logoLocked) {
        delete rest.logoUrl;
      }
    }
    if (Object.keys(rest).length === 0) return this.getLabelById(id);
    const [l] = await db.update(labels).set(rest).where(eq(labels.id, id)).returning();
    return l;
  }
  async deleteLabel(id: string, userId?: string | null): Promise<void> {
    // Task #475 — Soft-delete. Albums keep their `label_id` pointer
    // while the label sits in trash; on Purge the existing
    // ON DELETE SET NULL kicks in and clears the credit.
    await softDeleteEntity("label", id, userId ?? null);
  }

  // ----- Vendor ENTITY CRUD -------------------------------------------
  async getVendors(): Promise<Vendor[]> {
    return await db.select().from(vendors)
      .where(isNull(vendors.deletedAt))
      .orderBy(asc(vendors.name));
  }
  async getVendorById(id: string): Promise<Vendor | undefined> {
    const [v] = await db.select().from(vendors)
      .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)));
    return v;
  }
  async getVendorByDomain(domain: string): Promise<Vendor | undefined> {
    const [v] = await db.select().from(vendors)
      .where(and(eq(vendors.domain, domain.toLowerCase()), isNull(vendors.deletedAt)));
    return v;
  }
  async getVendorByNameInsensitive(name: string): Promise<Vendor | undefined> {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const [v] = await db
      .select()
      .from(vendors)
      .where(and(
        sql`lower(${vendors.name}) = lower(${trimmed})`,
        isNull(vendors.deletedAt),
      ));
    return v;
  }
  async getTopLevelVendorByDomain(domain: string): Promise<Vendor | undefined> {
    // Task #237 — partial unique index `vendors_domain_top_uniq` makes
    // this at most one row. Used by POST /api/admin/vendors to decide
    // whether to 409 with a "sub-brand of …" prompt vs. allow create.
    const [v] = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.domain, domain.toLowerCase()), isNull(vendors.parentVendorId), isNull(vendors.deletedAt)));
    return v;
  }
  async getVendorChildren(parentId: string): Promise<Vendor[]> {
    return await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.parentVendorId, parentId), isNull(vendors.deletedAt)))
      .orderBy(asc(vendors.name));
  }
  async createVendor(data: InsertVendor & { id?: string }): Promise<Vendor> {
    const [v] = await db.insert(vendors).values({ ...data, domain: data.domain.toLowerCase() } as any).returning();
    return v;
  }
  async updateVendor(id: string, data: Partial<Vendor> & { __bypassLogoLock?: boolean }): Promise<Vendor | undefined> {
    const { id: _i, createdAt: _c, __bypassLogoLock, ...rest } = data as any;
    if (rest.domain) rest.domain = String(rest.domain).toLowerCase();
    // Curation lock guard. If the row is locked AND the caller hasn't
    // opted in via `__bypassLogoLock`, drop the `logoUrl` write silently
    // — that path is reserved for explicit operator Replace from the
    // admin logo editor. Automated/enrichment callers that don't know
    // about the bypass flag (favicon backfills, future re-scrape jobs)
    // therefore can't overwrite a curated logo. Mirrors the
    // `people.photoLocked` / `people.coverLocked` contract.
    if (rest.logoUrl !== undefined && !__bypassLogoLock) {
      const current = await this.getVendorById(id);
      if (current?.logoLocked) {
        delete rest.logoUrl;
      }
    }
    if (Object.keys(rest).length === 0) return this.getVendorById(id);
    const [v] = await db.update(vendors).set(rest).where(eq(vendors.id, id)).returning();
    return v;
  }
  async deleteVendor(id: string, userId?: string | null): Promise<void> {
    // Task #475 — Soft-delete. instrument_vendors attachments stay
    // alive while the vendor is in trash (the join table has no soft-
    // delete column) and only get hard-cascaded on Purge.
    await softDeleteEntity("vendor", id, userId ?? null);
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
        isNull(instruments.deletedAt),
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

  async getMakerInstruments(vendorId: string): Promise<Instrument[]> {
    return await db
      .select()
      .from(instruments)
      .where(and(
        eq(instruments.makerVendorId, vendorId),
        isNull(instruments.deletedAt),
      ))
      .orderBy(asc(instruments.name));
  }

  // Task #174 — Maker-profile bundle. Returns every instrument whose
  // headline maker is this vendor, each row hydrated with the resellers
  // (non-hidden join rows) carrying it. The maker himself could be one
  // of the resellers (Gibson sells Les Pauls direct), so the array
  // routinely contains the maker's own row too.
  async getMakerInstrumentsWithResellers(
    vendorId: string,
  ): Promise<
    Array<
      Instrument & {
        resellers: Array<{
          id: string;
          name: string;
          domain: string | null;
          logoUrl: string | null;
          affiliateUrl: string | null;
        }>;
      }
    >
  > {
    const built = await db
      .select()
      .from(instruments)
      .where(and(
        eq(instruments.makerVendorId, vendorId),
        isNull(instruments.deletedAt),
      ))
      .orderBy(asc(instruments.name));
    if (built.length === 0) return [];
    const ids = built.map((i) => i.id);
    const joins = await db
      .select({ iv: instrumentVendors, v: vendors })
      .from(instrumentVendors)
      .innerJoin(vendors, eq(instrumentVendors.vendorId, vendors.id))
      .where(
        and(
          inArray(instrumentVendors.instrumentId, ids),
          eq(instrumentVendors.isHidden, false),
          isNull(vendors.deletedAt),
        ),
      )
      .orderBy(asc(instrumentVendors.position));
    const byInstrument = new Map<
      string,
      Array<{
        id: string;
        name: string;
        domain: string | null;
        logoUrl: string | null;
        affiliateUrl: string | null;
      }>
    >();
    for (const row of joins) {
      const list = byInstrument.get(row.iv.instrumentId) ?? [];
      list.push({
        id: row.v.id,
        name: row.v.name,
        domain: row.v.domain,
        logoUrl: row.v.logoUrl,
        affiliateUrl: row.iv.affiliateUrl,
      });
      byInstrument.set(row.iv.instrumentId, list);
    }
    return built.map((i) => ({
      ...i,
      resellers: byInstrument.get(i.id) ?? [],
    }));
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
      .where(and(
        eq(trackPerformers.personId, personId),
        eq(albums.isHidden, false),
        isNull(trackPerformers.deletedAt),
        isNull(songs.deletedAt),
        isNull(albums.deletedAt),
      ))
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

  async getPersonTracksForInstrument(
    personId: string,
    instrumentId: string,
    mode: "credited" | "all",
  ) {
    // Pull every existing performer row for this person up front — used
    // for both the mode='credited' filter and the per-track flags.
    const personRows = await db
      .select()
      .from(trackPerformers)
      .where(and(
        eq(trackPerformers.personId, personId),
        isNull(trackPerformers.deletedAt),
      ));
    const songIdsWithCredit = new Set(personRows.map((r) => r.songId));

    if (mode === "credited" && songIdsWithCredit.size === 0) return [];

    const whereExpr =
      mode === "credited"
        ? and(
            eq(albums.isGoodTunesRelease, true),
            isNull(albums.deletedAt),
            isNull(songs.deletedAt),
            inArray(songs.id, Array.from(songIdsWithCredit)),
          )
        : and(
            eq(albums.isGoodTunesRelease, true),
            isNull(albums.deletedAt),
            isNull(songs.deletedAt),
          );

    const rows = await db
      .select({ s: songs, a: albums })
      .from(songs)
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .where(whereExpr)
      .orderBy(asc(albums.year), asc(albums.title), asc(songs.trackNumber));

    return rows.map((r) => {
      const onSong = personRows.filter((p) => p.songId === r.s.id);
      const alreadyCreditedHere = onSong.some(
        (p) => p.instrumentId === instrumentId,
      );
      // Pick the most-stable role: prefer the first row by `position`.
      const sortedOnSong = onSong.sort((a, b) => a.position - b.position);
      const existingRole = sortedOnSong[0]?.role ?? null;
      return {
        songId: r.s.id,
        songTitle: r.s.title,
        trackNumber: r.s.trackNumber,
        albumId: r.a.id,
        albumTitle: r.a.title,
        albumArtwork: r.a.artwork,
        albumYear: r.a.year,
        alreadyCreditedHere,
        existingRole,
      };
    });
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
      .where(and(
        eq(albums.primaryArtistId, personId),
        isNull(albums.deletedAt),
      ));
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
      .where(and(
        eq(trackPerformers.personId, personId),
        isNull(trackPerformers.deletedAt),
        isNull(songs.deletedAt),
        isNull(albums.deletedAt),
      ));

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
      db.select().from(trackWriters)
        .where(and(eq(trackWriters.songId, songId), isNull(trackWriters.deletedAt)))
        .orderBy(asc(trackWriters.position)),
      db.select().from(trackPerformers)
        .where(and(eq(trackPerformers.songId, songId), isNull(trackPerformers.deletedAt)))
        .orderBy(asc(trackPerformers.position)),
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
      personIds.length ? db.select().from(people).where(and(inArray(people.id, personIds), isNull(people.deletedAt))) : Promise.resolve([] as Person[]),
      instrumentIds.length ? db.select().from(instruments).where(and(inArray(instruments.id, instrumentIds), isNull(instruments.deletedAt))) : Promise.resolve([] as Instrument[]),
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
    const songRows = await db.select({ id: songs.id }).from(songs)
      .where(and(eq(songs.albumId, albumId), isNull(songs.deletedAt)));
    const songIds = songRows.map((r) => r.id);
    // Album-wide production credits are independent of songs — fetch even
    // when the album has no tracks yet so a freshly-created album still
    // exposes its Produced by / Mixed by rows.
    const production = await this.listAlbumProductionCredits(albumId);
    if (songIds.length === 0) return { bySongId: {}, production };

    // 2) All writers + performers for those songs in two queries.
    const [writerRows, performerRows] = await Promise.all([
      db.select().from(trackWriters)
        .where(and(inArray(trackWriters.songId, songIds), isNull(trackWriters.deletedAt)))
        .orderBy(asc(trackWriters.position)),
      db.select().from(trackPerformers)
        .where(and(inArray(trackPerformers.songId, songIds), isNull(trackPerformers.deletedAt)))
        .orderBy(asc(trackPerformers.position)),
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
      personIds.length ? db.select().from(people).where(and(inArray(people.id, personIds), isNull(people.deletedAt))) : Promise.resolve([] as Person[]),
      instrumentIds.length ? db.select().from(instruments).where(and(inArray(instruments.id, instrumentIds), isNull(instruments.deletedAt))) : Promise.resolve([] as Instrument[]),
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
    return { bySongId, production };
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
  async deleteTrackWriter(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("track_writer", id, userId ?? null);
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
  async deleteTrackPerformer(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("track_performer", id, userId ?? null);
  }

  async listAlbumProductionCredits(albumId: string): Promise<(AlbumCredit & { person: Person | null })[]> {
    const rows = await db
      .select()
      .from(albumCredits)
      .where(and(eq(albumCredits.albumId, albumId), isNull(albumCredits.deletedAt)))
      .orderBy(asc(albumCredits.position));
    const personIds = Array.from(new Set(rows.map((r) => r.personId).filter((v): v is string => !!v)));
    const peopleRows = personIds.length
      ? await db.select().from(people).where(inArray(people.id, personIds))
      : ([] as Person[]);
    const byId = new Map(peopleRows.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, person: r.personId ? byId.get(r.personId) ?? null : null }));
  }
  async createAlbumProductionCredit(data: InsertAlbumCredit & { id?: string }): Promise<AlbumCredit> {
    const [r] = await db.insert(albumCredits).values(data as any).returning();
    return r;
  }
  async deleteAlbumProductionCredit(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("album_credit", id, userId ?? null);
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
      .where(and(
        eq(userAlbums.userId, userId),
        eq(albums.isHidden, false),
        isNull(albums.deletedAt),
      ));
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
        .where(and(
          eq(playlistSongs.playlistId, p.id),
          eq(albums.isHidden, false),
          isNull(albums.deletedAt),
          isNull(songs.deletedAt),
        ))
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
    // Decrement playlistCount on every song that was in this playlist
    // before we drop the rows. Same denormalization rule as remove-song.
    const rows = await db
      .select({ songId: playlistSongs.songId })
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, id));
    await db.delete(playlistSongs).where(eq(playlistSongs.playlistId, id));
    for (const r of rows) {
      await db
        .update(songs)
        .set({ playlistCount: sql`GREATEST(${songs.playlistCount} - 1, 0)` })
        .where(eq(songs.id, r.songId));
    }
    await db.delete(playlists).where(eq(playlists.id, id));
  }
  async listSongFavorites(userId: string): Promise<SongFavorite[]> {
    return db
      .select()
      .from(songFavorites)
      .where(eq(songFavorites.userId, userId))
      .orderBy(asc(songFavorites.createdAt));
  }
  async addSongFavorite(userId: string, songId: string): Promise<void> {
    await db
      .insert(songFavorites)
      .values({ userId, songId })
      .onConflictDoNothing();
  }
  async removeSongFavorite(userId: string, songId: string): Promise<void> {
    await db
      .delete(songFavorites)
      .where(and(eq(songFavorites.userId, userId), eq(songFavorites.songId, songId)));
  }
  async listArtistFavorites(userId: string): Promise<ArtistFavorite[]> {
    return db
      .select()
      .from(artistFavorites)
      .where(eq(artistFavorites.userId, userId))
      .orderBy(asc(artistFavorites.createdAt));
  }
  async addArtistFavorite(userId: string, artistName: string): Promise<void> {
    await db
      .insert(artistFavorites)
      .values({ userId, artistName })
      .onConflictDoNothing();
  }
  async removeArtistFavorite(userId: string, artistName: string): Promise<void> {
    await db
      .delete(artistFavorites)
      .where(and(eq(artistFavorites.userId, userId), eq(artistFavorites.artistName, artistName)));
  }

  // ----- Task #530: Fan recents + recent searches ------------------------
  async listFanRecents(userId: string): Promise<FanRecent[]> {
    return db
      .select()
      .from(fanRecents)
      .where(eq(fanRecents.userId, userId))
      .orderBy(desc(fanRecents.lastAt))
      .limit(200);
  }
  async upsertFanRecent(
    userId: string,
    row: { entityKind: FanRecentKind; entityId: string; title: string; subtitle?: string | null; thumbUrl?: string | null; href: string },
  ): Promise<void> {
    // ON CONFLICT bumps lastAt + refreshes denormalised display fields so a
    // renamed album updates next time the fan opens it.
    await db
      .insert(fanRecents)
      .values({
        userId,
        entityKind: row.entityKind,
        entityId: row.entityId,
        title: row.title,
        subtitle: row.subtitle ?? null,
        thumbUrl: row.thumbUrl ?? null,
        href: row.href,
      })
      .onConflictDoUpdate({
        target: [fanRecents.userId, fanRecents.entityKind, fanRecents.entityId],
        set: {
          title: row.title,
          subtitle: row.subtitle ?? null,
          thumbUrl: row.thumbUrl ?? null,
          href: row.href,
          lastAt: sql`now()`,
        },
      });
    // Cap at 200 per fan; trim the tail.
    await db.execute(sql`
      DELETE FROM fan_recents
       WHERE user_id = ${userId}
         AND id NOT IN (
           SELECT id FROM fan_recents
            WHERE user_id = ${userId}
            ORDER BY last_at DESC
            LIMIT 200
         )
    `);
  }
  async removeFanRecent(userId: string, id: string): Promise<void> {
    await db.delete(fanRecents).where(and(eq(fanRecents.userId, userId), eq(fanRecents.id, id)));
  }
  async clearFanRecents(userId: string): Promise<void> {
    await db.delete(fanRecents).where(eq(fanRecents.userId, userId));
  }
  async listFanRecentSearches(userId: string): Promise<FanRecentSearch[]> {
    return db
      .select()
      .from(fanRecentSearches)
      .where(eq(fanRecentSearches.userId, userId))
      .orderBy(desc(fanRecentSearches.lastAt))
      .limit(20);
  }
  async upsertFanRecentSearch(
    userId: string,
    input:
      | { kind: "query"; displayQuery: string }
      | { kind: "entity"; entityKind: string; entityId: string; title: string; subtitle?: string | null; thumbUrl?: string | null; href: string },
  ): Promise<void> {
    if (input.kind === "query") {
      const trimmed = input.displayQuery.trim();
      if (!trimmed) return;
      const norm = `q:${trimmed.toLowerCase()}`;
      await db
        .insert(fanRecentSearches)
        .values({ userId, queryNorm: norm, displayQuery: trimmed })
        .onConflictDoUpdate({
          target: [fanRecentSearches.userId, fanRecentSearches.queryNorm],
          set: { displayQuery: trimmed, lastAt: sql`now()` },
        });
    } else {
      // Entity rows dedupe on (kind, id) so the same album can't pile
      // up just because it surfaced under multiple search queries.
      const norm = `e:${input.entityKind}:${input.entityId}`;
      await db
        .insert(fanRecentSearches)
        .values({
          userId,
          queryNorm: norm,
          displayQuery: input.title,
          entityKind: input.entityKind,
          entityId: input.entityId,
          title: input.title,
          subtitle: input.subtitle ?? null,
          thumbUrl: input.thumbUrl ?? null,
          href: input.href,
        })
        .onConflictDoUpdate({
          target: [fanRecentSearches.userId, fanRecentSearches.queryNorm],
          set: {
            displayQuery: input.title,
            title: input.title,
            subtitle: input.subtitle ?? null,
            thumbUrl: input.thumbUrl ?? null,
            href: input.href,
            lastAt: sql`now()`,
          },
        });
    }
    await db.execute(sql`
      DELETE FROM fan_recent_searches
       WHERE user_id = ${userId}
         AND query_norm NOT IN (
           SELECT query_norm FROM fan_recent_searches
            WHERE user_id = ${userId}
            ORDER BY last_at DESC
            LIMIT 20
         )
    `);
  }
  async clearFanRecentSearches(userId: string): Promise<void> {
    await db.delete(fanRecentSearches).where(eq(fanRecentSearches.userId, userId));
  }

  async getPlaylistSongs(playlistId: string): Promise<(PlaylistSong & { song: Song & { album: Album } })[]> {
    const rows = await db
      .select()
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .innerJoin(albums, eq(songs.albumId, albums.id))
      // Hide songs whose parent album is hidden so they vanish from the
      // playlist detail view too (matches getPlaylists summary).
      .where(and(
        eq(playlistSongs.playlistId, playlistId),
        eq(albums.isHidden, false),
        isNull(albums.deletedAt),
        isNull(songs.deletedAt),
      ))
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
    // Bump the denormalized counter (see schema comment on songs.playlistCount).
    await db
      .update(songs)
      .set({ playlistCount: sql`${songs.playlistCount} + 1` })
      .where(eq(songs.id, songId));
    return ps;
  }
  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
    const result = await db
      .delete(playlistSongs)
      .where(and(eq(playlistSongs.playlistId, playlistId), eq(playlistSongs.songId, songId)));
    // Only decrement if a row was actually removed — keeps counts honest
    // when a no-op delete (already gone) is called twice.
    const removed = (result as any).rowCount ?? 0;
    if (removed > 0) {
      await db
        .update(songs)
        .set({ playlistCount: sql`GREATEST(${songs.playlistCount} - 1, 0)` })
        .where(eq(songs.id, songId));
    }
  }

  async createAuthToken(token: string, userId: string, kind: "admin" | "customer" = "admin"): Promise<void> {
    // Task #265 — route to the side-specific column so the row carries
    // a real, DB-enforced FK to the right user table.
    const values = kind === "customer"
      ? { token, customerUserId: userId, kind }
      : { token, adminUserId: userId, kind };
    await db.insert(authTokens).values(values).onConflictDoNothing();
  }
  async getAuthBy(token: string): Promise<{ userId: string; kind: "admin" | "customer" } | undefined> {
    const [row] = await db.select().from(authTokens).where(eq(authTokens.token, token));
    if (!row) return undefined;
    const kind = (row.kind === "customer" ? "customer" : "admin") as "admin" | "customer";
    const userId = kind === "customer" ? row.customerUserId : row.adminUserId;
    if (!userId) return undefined;
    return { userId, kind };
  }
  async deleteAuthToken(token: string): Promise<void> {
    await db.delete(authTokens).where(eq(authTokens.token, token));
  }

  // ---- Customer side (Task #31) ----------------------------------------
  async getCustomer(id: string): Promise<CustomerUser | undefined> {
    const [c] = await db.select().from(customerUsers).where(eq(customerUsers.id, id));
    return c;
  }
  async getCustomerByUsername(username: string): Promise<CustomerUser | undefined> {
    const [c] = await db.select().from(customerUsers).where(eq(customerUsers.username, username));
    return c;
  }
  async getCustomerByEmail(email: string): Promise<CustomerUser | undefined> {
    const [c] = await db.select().from(customerUsers).where(sql`lower(${customerUsers.email}) = ${email.toLowerCase()}`);
    return c;
  }
  async createCustomer(insert: InsertCustomerUser): Promise<CustomerUser> {
    const [c] = await db
      .insert(customerUsers)
      .values({ ...insert, realName: insert.realName ?? null, password: insert.password ?? null })
      .returning();
    return c;
  }
  async updateCustomer(id: string, data: Partial<CustomerUser>): Promise<CustomerUser | undefined> {
    const { id: _i, createdAt: _c, ...rest } = data as any;
    const [c] = await db.update(customerUsers).set(rest).where(eq(customerUsers.id, id)).returning();
    return c;
  }

  // ---- Admin customers directory (Task #131) -------------------------
  async listAdminCustomers(opts?: { q?: string; limit?: number; offset?: number }) {
    const q = (opts?.q ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const like = `%${q}%`;
    // Per-customer roll-up: order count + lifetime spend on paid/shipped
    // orders (refunded orders are excluded from spend but still counted
    // in orderCount so the admin can see refund activity). lastActivity
    // is max(orders.createdAt, customer.createdAt) — gives a meaningful
    // "last seen" even before a customer has placed any orders.
    const whereExpr = q
      ? sql`(lower(${customerUsers.displayName}) LIKE ${like}
             OR lower(${customerUsers.email}) LIKE ${like}
             OR lower(${customerUsers.username}) LIKE ${like}
             OR lower(coalesce(${customerUsers.realName}, '')) LIKE ${like})`
      : sql`true`;

    const rows = await db
      .select({
        customer: customerUsers,
        orderCount: sql<number>`coalesce(count(${orders.id}), 0)::int`,
        lifetimeSpendCents: sql<number>`coalesce(sum(case when ${orders.status} in ('paid','shipped') then ${orders.totalCents} else 0 end), 0)::int`,
        lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
      })
      .from(customerUsers)
      .leftJoin(orders, eq(orders.customerId, customerUsers.id))
      .where(whereExpr)
      .groupBy(customerUsers.id)
      .orderBy(desc(customerUsers.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(customerUsers)
      .where(whereExpr);

    return {
      rows: rows.map((r) => ({
        ...r.customer,
        orderCount: r.orderCount,
        lifetimeSpendCents: r.lifetimeSpendCents,
        lastActivityAt: r.lastOrderAt ?? r.customer.createdAt ?? null,
      })),
      total,
    };
  }

  async getAdminCustomerProfile(id: string) {
    const [c] = await db.select().from(customerUsers).where(eq(customerUsers.id, id));
    if (!c) return undefined;

    const orderRows = await db
      .select({
        id: orders.id,
        albumId: orders.albumId,
        albumTitle: albums.title,
        albumArtist: albums.artist,
        totalCents: orders.totalCents,
        status: orders.status,
        goodDeedNumber: orders.goodDeedNumber,
        createdAt: orders.createdAt,
        shippedAt: orders.shippedAt,
      })
      .from(orders)
      .innerJoin(albums, eq(orders.albumId, albums.id))
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.createdAt));

    const collectionRows = await db
      .select({
        id: userAlbums.id,
        albumId: userAlbums.albumId,
        albumTitle: albums.title,
        albumArtist: albums.artist,
        albumArtwork: albums.artwork,
        certificateNumber: userAlbums.certificateNumber,
        acquiredAt: userAlbums.acquiredAt,
      })
      .from(userAlbums)
      .innerJoin(albums, eq(userAlbums.albumId, albums.id))
      .where(eq(userAlbums.userId, id))
      .orderBy(desc(userAlbums.acquiredAt));

    const playlistRows = await db
      .select({
        id: playlists.id,
        name: playlists.name,
        createdAt: playlists.createdAt,
        songCount: sql<number>`coalesce(count(${playlistSongs.id}), 0)::int`,
      })
      .from(playlists)
      .leftJoin(playlistSongs, eq(playlistSongs.playlistId, playlists.id))
      .where(eq(playlists.userId, id))
      .groupBy(playlists.id)
      .orderBy(desc(playlists.createdAt));

    return {
      customer: c,
      orders: orderRows,
      collection: collectionRows,
      playlists: playlistRows,
    };
  }

  // ---- OAuth identities -----------------------------------------------
  async findIdentity(kind: "admin" | "customer", provider: string, providerUserId: string) {
    const t = kind === "admin" ? adminIdentities : customerIdentities;
    const [row] = await db.select().from(t).where(and(eq(t.provider, provider), eq(t.providerUserId, providerUserId)));
    return row ? { userId: row.userId } : undefined;
  }
  async linkIdentity(kind: "admin" | "customer", data: { userId: string; provider: string; providerUserId: string; email: string | null }) {
    const t = kind === "admin" ? adminIdentities : customerIdentities;
    await db.insert(t).values(data).onConflictDoNothing();
  }
  async listIdentities(kind: "admin" | "customer", userId: string) {
    const t = kind === "admin" ? adminIdentities : customerIdentities;
    const rows = await db.select().from(t).where(eq(t.userId, userId));
    return rows.map((r) => ({ id: r.id, provider: r.provider, email: r.email, linkedAt: r.linkedAt }));
  }
  async unlinkIdentity(kind: "admin" | "customer", userId: string, identityId: string) {
    const t = kind === "admin" ? adminIdentities : customerIdentities;
    const res = await db.delete(t).where(and(eq(t.id, identityId), eq(t.userId, userId))).returning();
    return res.length > 0;
  }

  // ---- Admin TOTP -----------------------------------------------------
  async getAdminTotp(userId: string): Promise<AdminTotp | undefined> {
    const [row] = await db.select().from(adminTotp).where(eq(adminTotp.userId, userId));
    return row;
  }
  async setAdminTotp(userId: string, secretEncrypted: string, recoveryCodeHashes: string[]) {
    await db
      .insert(adminTotp)
      .values({ userId, secretEncrypted, recoveryCodes: recoveryCodeHashes })
      .onConflictDoUpdate({
        target: adminTotp.userId,
        set: { secretEncrypted, recoveryCodes: recoveryCodeHashes, enrolledAt: new Date() },
      });
  }
  async consumeRecoveryCode(userId: string, matchHash: string): Promise<boolean> {
    const row = await this.getAdminTotp(userId);
    if (!row) return false;
    const idx = row.recoveryCodes.indexOf(matchHash);
    if (idx < 0) return false;
    const next = row.recoveryCodes.slice(0, idx).concat(row.recoveryCodes.slice(idx + 1));
    await db.update(adminTotp).set({ recoveryCodes: next }).where(eq(adminTotp.userId, userId));
    return true;
  }
  async deleteAdminTotp(userId: string): Promise<void> {
    await db.delete(adminTotp).where(eq(adminTotp.userId, userId));
  }

  // ---- Admin email-OTP (Task #57) -----------------------------------
  async getAdminEmailOtp(userId: string): Promise<AdminEmailOtp | undefined> {
    const [row] = await db.select().from(adminEmailOtp).where(eq(adminEmailOtp.userId, userId));
    return row;
  }
  async setAdminEmailOtp(userId: string, codeHash: string, expiresAt: Date): Promise<void> {
    // Upsert: issuing a new code REPLACES any prior code + resets the
    // attempt counter. This is what "didn't get it, resend" needs.
    await db
      .insert(adminEmailOtp)
      .values({ userId, codeHash, expiresAt, attempts: 0, lastSentAt: new Date() })
      .onConflictDoUpdate({
        target: adminEmailOtp.userId,
        set: { codeHash, expiresAt, attempts: 0, lastSentAt: new Date() },
      });
  }
  async bumpAdminEmailOtpAttempts(userId: string): Promise<void> {
    await db
      .update(adminEmailOtp)
      .set({ attempts: sql`${adminEmailOtp.attempts} + 1` })
      .where(eq(adminEmailOtp.userId, userId));
  }
  async deleteAdminEmailOtp(userId: string): Promise<void> {
    await db.delete(adminEmailOtp).where(eq(adminEmailOtp.userId, userId));
  }
  async consumeAdminEmailOtp(userId: string, codeHash: string): Promise<boolean> {
    // Single conditional delete — the DB guarantees only one parallel
    // request wins. We key on both userId and the exact hash so a stale
    // verify can't accidentally consume a freshly-issued (resent) code.
    const rows = await db
      .delete(adminEmailOtp)
      .where(and(eq(adminEmailOtp.userId, userId), eq(adminEmailOtp.codeHash, codeHash)))
      .returning({ userId: adminEmailOtp.userId });
    return rows.length > 0;
  }
  async setUserFactorPref(userId: string, pref: "email" | "totp"): Promise<void> {
    await db.update(users).set({ factorPref: pref }).where(eq(users.id, userId));
  }

  // ---- Admin password reset (Task #269) ---------------------------
  async createAdminPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<AdminPasswordResetToken> {
    const [row] = await db
      .insert(adminPasswordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return row;
  }
  async getActiveAdminPasswordResetToken(tokenHash: string): Promise<AdminPasswordResetToken | undefined> {
    const [row] = await db
      .select()
      .from(adminPasswordResetTokens)
      .where(eq(adminPasswordResetTokens.tokenHash, tokenHash));
    if (!row) return undefined;
    if (row.consumedAt) return undefined;
    if (row.expiresAt.getTime() < Date.now()) return undefined;
    return row;
  }
  async consumeAdminPasswordResetToken(tokenHash: string): Promise<string | undefined> {
    // Atomic: stamp consumedAt only if still un-consumed AND un-expired.
    // The winning request gets the userId back; concurrent duplicates
    // and stale tokens both see undefined.
    const rows = await db
      .update(adminPasswordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(adminPasswordResetTokens.tokenHash, tokenHash),
          sql`${adminPasswordResetTokens.consumedAt} IS NULL`,
          sql`${adminPasswordResetTokens.expiresAt} > now()`,
        ),
      )
      .returning({ userId: adminPasswordResetTokens.userId });
    return rows[0]?.userId;
  }
  async invalidateAdminPasswordResetTokensForUser(userId: string): Promise<void> {
    // Mark every outstanding token as consumed so a successful reset
    // can't be followed by a second one minted before the password
    // change. Cheap blanket update — these rows are tiny.
    await db
      .update(adminPasswordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(adminPasswordResetTokens.userId, userId),
          sql`${adminPasswordResetTokens.consumedAt} IS NULL`,
        ),
      );
  }

  // ---- Customer password reset (Task #271) ------------------------
  async createCustomerPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<CustomerPasswordResetToken> {
    const [row] = await db
      .insert(customerPasswordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return row;
  }
  async getActiveCustomerPasswordResetToken(tokenHash: string): Promise<CustomerPasswordResetToken | undefined> {
    const [row] = await db
      .select()
      .from(customerPasswordResetTokens)
      .where(eq(customerPasswordResetTokens.tokenHash, tokenHash));
    if (!row) return undefined;
    if (row.consumedAt) return undefined;
    if (row.expiresAt.getTime() < Date.now()) return undefined;
    return row;
  }
  async consumeCustomerPasswordResetToken(tokenHash: string): Promise<string | undefined> {
    const rows = await db
      .update(customerPasswordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(customerPasswordResetTokens.tokenHash, tokenHash),
          sql`${customerPasswordResetTokens.consumedAt} IS NULL`,
          sql`${customerPasswordResetTokens.expiresAt} > now()`,
        ),
      )
      .returning({ userId: customerPasswordResetTokens.userId });
    return rows[0]?.userId;
  }
  async invalidateCustomerPasswordResetTokensForUser(userId: string): Promise<void> {
    await db
      .update(customerPasswordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(customerPasswordResetTokens.userId, userId),
          sql`${customerPasswordResetTokens.consumedAt} IS NULL`,
        ),
      );
  }

  async listAdmins() {
    const rows = await db
      .select({ id: users.id, username: users.username, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.isAdmin, true))
      .orderBy(asc(users.username));
    return rows;
  }

  async getProfilePhoto(userId: string): Promise<string | null> {
    const [row] = await db.select().from(profilePhotos).where(eq(profilePhotos.userId, userId));
    // Prefer the new object-storage URL; fall back to the legacy inline
    // base64 so users who haven't replaced their old avatar still see it.
    return row?.photoUrl ?? row?.dataUrl ?? null;
  }
  async setProfilePhoto(userId: string, photoUrl: string): Promise<void> {
    // New writes only ever populate `photo_url`; we clear any leftover
    // inline base64 in `data_url` so the read precedence above doesn't
    // matter and old bytes don't linger in Postgres.
    await db
      .insert(profilePhotos)
      .values({ userId, photoUrl, dataUrl: null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: profilePhotos.userId,
        set: { photoUrl, dataUrl: null, updatedAt: new Date() },
      });
  }
  async hasProfilePhoto(userId: string): Promise<boolean> {
    const [row] = await db.select().from(profilePhotos).where(eq(profilePhotos.userId, userId));
    return Boolean(row?.photoUrl || row?.dataUrl);
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
  async getRecentAnalyticsEvents(limit: number): Promise<any[]> {
    return db
      .select()
      .from(analyticsEvents)
      .orderBy(desc(analyticsEvents.receivedAt))
      .limit(limit);
  }

  async recordJobRun(data: InsertJobRun): Promise<JobRun> {
    const [row] = await db.insert(jobRuns).values(data).returning();
    return row;
  }

  async getJobRunById(id: string): Promise<JobRun | undefined> {
    const [row] = await db.select().from(jobRuns).where(eq(jobRuns.id, id));
    return row;
  }

  async listJobRuns(opts?: { limit?: number; albumId?: string; songId?: string; jobType?: string }): Promise<JobRun[]> {
    const conds: any[] = [];
    if (opts?.albumId) conds.push(eq(jobRuns.albumId, opts.albumId));
    if (opts?.songId) conds.push(eq(jobRuns.songId, opts.songId));
    if (opts?.jobType) conds.push(eq(jobRuns.jobType, opts.jobType));
    let q = db.select().from(jobRuns).$dynamic();
    if (conds.length) q = q.where(conds.length === 1 ? conds[0] : and(...conds));
    return q.orderBy(desc(jobRuns.finishedAt)).limit(opts?.limit ?? 50);
  }

  // ----- Manufacturer ENTITY CRUD (Task #69) --------------------------
  async getManufacturers(): Promise<Manufacturer[]> {
    return await db.select().from(manufacturers)
      .where(isNull(manufacturers.deletedAt))
      .orderBy(asc(manufacturers.name));
  }
  async getManufacturerById(id: string): Promise<Manufacturer | undefined> {
    const [m] = await db.select().from(manufacturers)
      .where(and(eq(manufacturers.id, id), isNull(manufacturers.deletedAt)));
    return m;
  }
  async getManufacturerByDomain(domain: string): Promise<Manufacturer | undefined> {
    const [m] = await db.select().from(manufacturers)
      .where(and(eq(manufacturers.domain, domain), isNull(manufacturers.deletedAt)));
    return m;
  }
  async createManufacturer(data: InsertManufacturer & { id?: string }): Promise<Manufacturer> {
    const [m] = await db.insert(manufacturers).values(data as any).returning();
    return m;
  }
  async updateManufacturer(id: string, data: Partial<Manufacturer>): Promise<Manufacturer | undefined> {
    const { id: _i, createdAt: _c, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return this.getManufacturerById(id);
    const [m] = await db.update(manufacturers).set(rest).where(eq(manufacturers.id, id)).returning();
    return m;
  }
  async deleteManufacturer(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("manufacturer", id, userId ?? null);
  }

  // ----- Fulfillment partner ENTITY CRUD (Task #69) -------------------
  async getFulfillmentPartners(): Promise<FulfillmentPartner[]> {
    return await db.select().from(fulfillmentPartners)
      .where(isNull(fulfillmentPartners.deletedAt))
      .orderBy(asc(fulfillmentPartners.name));
  }
  async getFulfillmentPartnerById(id: string): Promise<FulfillmentPartner | undefined> {
    const [f] = await db.select().from(fulfillmentPartners)
      .where(and(eq(fulfillmentPartners.id, id), isNull(fulfillmentPartners.deletedAt)));
    return f;
  }
  async getFulfillmentPartnerByDomain(domain: string): Promise<FulfillmentPartner | undefined> {
    const d = (domain ?? "").trim().toLowerCase().replace(/^www\./, "");
    if (!d) return undefined;
    const [f] = await db.select().from(fulfillmentPartners)
      .where(and(eq(fulfillmentPartners.domain, d), isNull(fulfillmentPartners.deletedAt)));
    return f;
  }
  async createFulfillmentPartner(data: InsertFulfillmentPartner & { id?: string }): Promise<FulfillmentPartner> {
    const [f] = await db.insert(fulfillmentPartners).values(data as any).returning();
    return f;
  }
  async updateFulfillmentPartner(id: string, data: Partial<FulfillmentPartner>): Promise<FulfillmentPartner | undefined> {
    const { id: _i, createdAt: _c, ...rest } = data as any;
    if (Object.keys(rest).length === 0) return this.getFulfillmentPartnerById(id);
    const [f] = await db.update(fulfillmentPartners).set(rest).where(eq(fulfillmentPartners.id, id)).returning();
    return f;
  }
  async deleteFulfillmentPartner(id: string, userId?: string | null): Promise<void> {
    await softDeleteEntity("fulfillment_partner", id, userId ?? null);
  }

  // ----- RFQ flow (Task #69) ------------------------------------------
  async listRfqs(opts?: { albumId?: string }): Promise<Rfq[]> {
    let q = db.select().from(rfqs).$dynamic();
    if (opts?.albumId) q = q.where(eq(rfqs.albumId, opts.albumId));
    return q.orderBy(desc(rfqs.createdAt));
  }
  async getRfqById(id: string): Promise<Rfq | undefined> {
    const [r] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    return r;
  }
  async createRfq(
    data: InsertRfq & { createdByUserId: string; manufacturerIds: string[] },
  ): Promise<Rfq> {
    const { manufacturerIds, ...rfqData } = data;
    const [r] = await db.insert(rfqs).values(rfqData as any).returning();
    if (manufacturerIds.length) {
      await db
        .insert(rfqReplies)
        .values(
          manufacturerIds.map((mid) => ({
            rfqId: r.id,
            manufacturerId: mid,
            status: "invited" as const,
          })),
        )
        .onConflictDoNothing();
    }
    return r;
  }
  async listRfqReplies(rfqId: string): Promise<RfqReply[]> {
    return await db
      .select()
      .from(rfqReplies)
      .where(eq(rfqReplies.rfqId, rfqId))
      .orderBy(asc(rfqReplies.createdAt));
  }
  async listRfqRepliesForManufacturer(manufacturerId: string): Promise<RfqReply[]> {
    return await db
      .select()
      .from(rfqReplies)
      .where(eq(rfqReplies.manufacturerId, manufacturerId))
      .orderBy(desc(rfqReplies.createdAt));
  }
  async upsertRfqReply(
    rfqId: string,
    manufacturerId: string,
    patch: Partial<RfqReply>,
  ): Promise<RfqReply> {
    const existing = await db
      .select()
      .from(rfqReplies)
      .where(
        and(eq(rfqReplies.rfqId, rfqId), eq(rfqReplies.manufacturerId, manufacturerId)),
      );
    if (existing.length) {
      const { id: _i, createdAt: _c, ...rest } = patch as any;
      const [r] = await db
        .update(rfqReplies)
        .set({ ...rest, repliedAt: rest.repliedAt ?? new Date() })
        .where(eq(rfqReplies.id, existing[0].id))
        .returning();
      return r;
    }
    const [r] = await db
      .insert(rfqReplies)
      .values({ rfqId, manufacturerId, ...(patch as any), repliedAt: new Date() })
      .returning();
    return r;
  }
  async acceptRfqReply(rfqId: string, replyId: string): Promise<Rfq | undefined> {
    const [winner] = await db.select().from(rfqReplies).where(eq(rfqReplies.id, replyId));
    if (!winner || winner.rfqId !== rfqId) return undefined;
    await db
      .update(rfqReplies)
      .set({ status: "won" })
      .where(eq(rfqReplies.id, replyId));
    // Every other invited/quoted reply on this RFQ becomes "declined".
    const others = await db
      .select()
      .from(rfqReplies)
      .where(eq(rfqReplies.rfqId, rfqId));
    for (const o of others) {
      if (o.id !== replyId && o.status !== "declined") {
        await db
          .update(rfqReplies)
          .set({ status: "declined" })
          .where(eq(rfqReplies.id, o.id));
      }
    }
    const [r] = await db
      .update(rfqs)
      .set({ status: "awarded", acceptedReplyId: replyId, awardedAt: new Date() })
      .where(eq(rfqs.id, rfqId))
      .returning();
    return r;
  }

  async createAdminInvite(data: InsertAdminInvite & { token: string; expiresAt: Date; createdByUserId: string }): Promise<AdminInvite> {
    const [row] = await db.insert(adminInvites).values({
      email: data.email.trim().toLowerCase(),
      role: data.role,
      roleScopeId: data.roleScopeId ?? null,
      token: data.token,
      expiresAt: data.expiresAt,
      createdByUserId: data.createdByUserId,
      referrerKind: (data as any).referrerKind ?? null,
      referrerScopeId: (data as any).referrerScopeId ?? null,
      welcomeNote: (data as any).welcomeNote ?? null,
      // Task #351 — team invite shape.
      inviteRole: (data as any).inviteRole ?? null,
      targetPersonId: (data as any).targetPersonId ?? null,
      preFlightedAlbumId: (data as any).preFlightedAlbumId ?? null,
      reviewStatus: (data as any).reviewStatus ?? "not_required",
    } as any).returning();
    return row;
  }
  async getAdminInviteById(id: string): Promise<AdminInvite | undefined> {
    const [row] = await db.select().from(adminInvites).where(eq(adminInvites.id, id)).limit(1);
    return row;
  }
  async revokeAdminInvite(id: string): Promise<void> {
    await db.update(adminInvites)
      .set({ revokedAt: new Date() })
      .where(eq(adminInvites.id, id));
  }
  async resendAdminInvite(id: string, newToken: string, newExpiresAt: Date): Promise<AdminInvite | undefined> {
    const [row] = await db.update(adminInvites)
      .set({ token: newToken, expiresAt: newExpiresAt, resentAt: new Date() })
      .where(eq(adminInvites.id, id))
      .returning();
    return row;
  }
  async listPendingAdminInvites(): Promise<AdminInvite[]> {
    return db
      .select()
      .from(adminInvites)
      .where(sql`${adminInvites.usedAt} IS NULL AND ${adminInvites.revokedAt} IS NULL`)
      .orderBy(desc(adminInvites.createdAt));
  }
  async getAdminInviteByToken(token: string): Promise<AdminInvite | undefined> {
    const [row] = await db.select().from(adminInvites).where(eq(adminInvites.token, token)).limit(1);
    if (!row) return undefined;
    // Revoked invites stay in the table for audit but can't be accepted.
    if ((row as any).revokedAt) return undefined;
    return row;
  }
  async markAdminInviteUsed(id: string, acceptedUserId: string): Promise<void> {
    // Conditional update — only flips usedAt when it's still NULL. Two
    // parallel /accept calls with the same token will both pass the
    // earlier usedAt-null check, but only the first one's UPDATE will
    // match a row here. The route reads .rowCount to detect the loser
    // and rolls back the duplicate user it just created.
    const r = await db.execute(sql`
      UPDATE admin_invites
      SET used_at = NOW(), accepted_user_id = ${acceptedUserId}
      WHERE id = ${id} AND used_at IS NULL
    `);
    if ((r as any).rowCount === 0) {
      throw new Error("INVITE_ALREADY_USED");
    }
  }
  async deleteAdminInvite(id: string): Promise<void> {
    await db.delete(adminInvites).where(eq(adminInvites.id, id));
  }

  // ---- Task #216 — Upload validation results ----------------------
  async listUploadValidations(albumId: string): Promise<UploadValidationRow[]> {
    const rows = await db
      .select()
      .from(uploadValidations)
      .where(eq(uploadValidations.albumId, albumId))
      .orderBy(desc(uploadValidations.createdAt));
    return rows.map(toUploadValidationRow);
  }
  async getUploadValidation(id: string): Promise<UploadValidationRow | undefined> {
    const [row] = await db.select().from(uploadValidations).where(eq(uploadValidations.id, id));
    return row ? toUploadValidationRow(row) : undefined;
  }
  async insertUploadValidation(data: InsertUploadValidationRow): Promise<UploadValidationRow> {
    const [row] = await db
      .insert(uploadValidations)
      .values({
        albumId: data.albumId,
        kind: data.kind,
        vendorId: data.vendorId,
        templateId: data.templateId,
        assetUrl: data.assetUrl,
        fileName: data.fileName,
        status: data.status,
        checks: data.checks,
      })
      .returning();
    return toUploadValidationRow(row);
  }
  async overrideUploadValidation(
    id: string,
    justification: string,
    byUserId: string,
  ): Promise<UploadValidationRow | undefined> {
    const [row] = await db
      .update(uploadValidations)
      .set({
        overrideJustification: justification,
        overrideByUserId: byUserId,
        overrideAt: new Date(),
      })
      .where(eq(uploadValidations.id, id))
      .returning();
    return row ? toUploadValidationRow(row) : undefined;
  }
  async deleteUploadValidation(id: string): Promise<void> {
    await db.delete(uploadValidations).where(eq(uploadValidations.id, id));
  }

  // ---- Task #225 — Pressing-order requests --------------------------
  async listPressingOrderRequests(opts: {
    status?: "pending" | "approved" | "rejected" | "cancelled" | "all";
    albumIds?: string[] | null;
  }): Promise<PressingOrderRequest[]> {
    const conds: any[] = [];
    if (opts.status && opts.status !== "all") {
      conds.push(eq(pressingOrderRequests.status, opts.status));
    }
    if (opts.albumIds) {
      if (opts.albumIds.length === 0) return [];
      conds.push(inArray(pressingOrderRequests.albumId, opts.albumIds));
    }
    const q = db.select().from(pressingOrderRequests);
    const filtered = conds.length ? q.where(and(...conds)) : q;
    return filtered.orderBy(desc(pressingOrderRequests.submittedAt));
  }
  async getPressingOrderRequest(id: string): Promise<PressingOrderRequest | undefined> {
    const [row] = await db.select().from(pressingOrderRequests).where(eq(pressingOrderRequests.id, id));
    return row;
  }
  async getLatestPressingOrderRequestForAlbum(albumId: string): Promise<PressingOrderRequest | undefined> {
    const [row] = await db
      .select()
      .from(pressingOrderRequests)
      .where(eq(pressingOrderRequests.albumId, albumId))
      .orderBy(desc(pressingOrderRequests.submittedAt))
      .limit(1);
    return row;
  }
  async insertPressingOrderRequest(data: {
    albumId: string;
    packageSnapshot: PressingOrderPackageSnapshot;
    quantity: number;
    unitCents: number;
    totalCents: number;
    preflightStatus: string | null;
    submittedByUserId: string;
  }): Promise<PressingOrderRequest> {
    // Idempotency: cancel any other pending row on this album first so
    // the new submission is the canonical pending one. Cheap; covers
    // the case where an artist clicks "Go to Press!" twice.
    await db
      .update(pressingOrderRequests)
      .set({ status: "cancelled", decidedAt: new Date(), decidedByUserId: data.submittedByUserId })
      .where(and(eq(pressingOrderRequests.albumId, data.albumId), eq(pressingOrderRequests.status, "pending")));
    const [row] = await db
      .insert(pressingOrderRequests)
      .values({
        albumId: data.albumId,
        status: "pending",
        packageSnapshot: data.packageSnapshot,
        quantity: data.quantity,
        unitCents: data.unitCents,
        totalCents: data.totalCents,
        preflightStatus: data.preflightStatus,
        submittedByUserId: data.submittedByUserId,
      })
      .returning();
    return row;
  }
  async decidePressingOrderRequest(
    id: string,
    decision: "approved" | "rejected" | "cancelled",
    decidedByUserId: string,
    rejectionNote?: string | null,
  ): Promise<PressingOrderRequest | undefined> {
    const [row] = await db
      .update(pressingOrderRequests)
      .set({
        status: decision,
        decidedAt: new Date(),
        decidedByUserId,
        rejectionNote: decision === "rejected" ? (rejectionNote ?? null) : null,
      })
      .where(eq(pressingOrderRequests.id, id))
      .returning();
    return row;
  }

  // ---- Task #217 — Print PDF generations ---------------------------
  async listPrintGenerations(albumId: string): Promise<PrintGenerationWithArtifacts[]> {
    const gens = await db
      .select()
      .from(printGenerations)
      .where(eq(printGenerations.albumId, albumId))
      .orderBy(desc(printGenerations.createdAt));
    if (gens.length === 0) return [];
    const arts = await db
      .select()
      .from(printArtifacts)
      .where(inArray(printArtifacts.generationId, gens.map((g) => g.id)))
      .orderBy(asc(printArtifacts.templateLabel));
    const byGen = new Map<string, typeof arts>();
    for (const a of arts) {
      const list = byGen.get(a.generationId) ?? [];
      list.push(a);
      byGen.set(a.generationId, list);
    }
    return gens.map((g) => ({
      id: g.id,
      albumId: g.albumId,
      vendorId: g.vendorId,
      createdByUserId: g.createdByUserId,
      overrideJustification: g.overrideJustification,
      createdAt: g.createdAt,
      artifacts: (byGen.get(g.id) ?? []).map((a) => ({
        id: a.id,
        templateId: a.templateId,
        templateLabel: a.templateLabel,
        fileName: a.fileName,
        assetUrl: a.assetUrl,
        sizeBytes: a.sizeBytes,
      })),
    }));
  }

  async insertPrintGeneration(args: {
    albumId: string;
    vendorId: string;
    createdByUserId: string | null;
    overrideJustification: string | null;
    artifacts: Array<{
      templateId: string;
      templateLabel: string;
      fileName: string;
      assetUrl: string;
      sizeBytes: number;
    }>;
  }): Promise<PrintGenerationWithArtifacts> {
    const [gen] = await db
      .insert(printGenerations)
      .values({
        albumId: args.albumId,
        vendorId: args.vendorId,
        createdByUserId: args.createdByUserId,
        overrideJustification: args.overrideJustification,
      })
      .returning();
    const inserted = args.artifacts.length
      ? await db
          .insert(printArtifacts)
          .values(args.artifacts.map((a) => ({ ...a, generationId: gen.id })))
          .returning()
      : [];
    return {
      id: gen.id,
      albumId: gen.albumId,
      vendorId: gen.vendorId,
      createdByUserId: gen.createdByUserId,
      overrideJustification: gen.overrideJustification,
      createdAt: gen.createdAt,
      artifacts: inserted.map((a) => ({
        id: a.id,
        templateId: a.templateId,
        templateLabel: a.templateLabel,
        fileName: a.fileName,
        assetUrl: a.assetUrl,
        sizeBytes: a.sizeBytes,
      })),
    };
  }

  // ---- Task #336 — Global admin search -----------------------------
  // Each entity exposes a tiny shape just rich enough to render a row
  // in the dropdown (id + display + a secondary line where useful) +
  // build an admin href. Case-insensitive substring on the obvious
  // columns; per-group limit is capped by the caller.
  async searchPeople(q: string, limit: number): Promise<Array<{ id: string; name: string; photoUrl: string | null }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: people.id, name: people.name, photoUrl: people.photoUrl })
      .from(people)
      .where(and(sql`lower(${people.name}) LIKE ${like}`, isNull(people.deletedAt)))
      .orderBy(asc(people.name))
      .limit(limit);
  }
  async searchVendorsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string; isMaker: boolean; isReseller: boolean }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: vendors.id, name: vendors.name, isMaker: vendors.isMaker, isReseller: vendors.isReseller })
      .from(vendors)
      .where(and(
        sql`lower(${vendors.name}) LIKE ${like} OR lower(coalesce(${vendors.domain}, '')) LIKE ${like}`,
        isNull(vendors.deletedAt),
      ))
      .orderBy(asc(vendors.name))
      .limit(limit);
  }
  async searchLabelsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(and(sql`lower(${labels.name}) LIKE ${like}`, isNull(labels.deletedAt)))
      .orderBy(asc(labels.name))
      .limit(limit);
  }
  async searchAlbumsAdmin(q: string, limit: number): Promise<Array<{ id: string; title: string; artist: string }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: albums.id, title: albums.title, artist: albums.artist })
      .from(albums)
      .where(and(
        sql`(lower(${albums.title}) LIKE ${like} OR lower(${albums.artist}) LIKE ${like}) AND ${albums.isGoodTunesRelease} = true`,
        isNull(albums.deletedAt),
      ))
      .orderBy(asc(albums.title))
      .limit(limit);
  }
  async searchInstrumentsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string; category: string | null }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: instruments.id, name: instruments.name, category: instruments.shortCategory })
      .from(instruments)
      .where(and(sql`lower(${instruments.name}) LIKE ${like}`, isNull(instruments.deletedAt)))
      .orderBy(asc(instruments.name))
      .limit(limit);
  }
  async searchCustomersAdmin(q: string, limit: number): Promise<Array<{ id: string; displayName: string; email: string }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: customerUsers.id, displayName: customerUsers.displayName, email: customerUsers.email })
      .from(customerUsers)
      .where(sql`lower(${customerUsers.displayName}) LIKE ${like}
             OR lower(${customerUsers.email}) LIKE ${like}
             OR lower(${customerUsers.username}) LIKE ${like}`)
      .orderBy(asc(customerUsers.displayName))
      .limit(limit);
  }
  async searchManufacturersAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: manufacturers.id, name: manufacturers.name })
      .from(manufacturers)
      .where(and(sql`lower(${manufacturers.name}) LIKE ${like}`, isNull(manufacturers.deletedAt)))
      .orderBy(asc(manufacturers.name))
      .limit(limit);
  }
  async searchFulfillmentAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({ id: fulfillmentPartners.id, name: fulfillmentPartners.name })
      .from(fulfillmentPartners)
      .where(and(sql`lower(${fulfillmentPartners.name}) LIKE ${like}`, isNull(fulfillmentPartners.deletedAt)))
      .orderBy(asc(fulfillmentPartners.name))
      .limit(limit);
  }
  async searchNonProfitsAdmin(q: string, limit: number): Promise<Array<{ id: string; name: string }>> {
    const like = `%${q.toLowerCase()}%`;
    const rows = await db.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM organizations
      WHERE kind = 'non_profit' AND lower(name) LIKE ${like}
      ORDER BY name ASC
      LIMIT ${limit}
    `);
    return ((rows as any).rows ?? []) as Array<{ id: string; name: string }>;
  }

  // Task #338 — songs, playlists, orders for the global admin search.
  // Songs are joined to their parent album so the dropdown can show
  // "Song · Album · Artist" and deep-link to /admin/albums/:id?track=:songId.
  // Mirrors the GoodTunes-release filter on albums so streaming-only
  // rows don't pollute results (admins don't manage those tracks here).
  async searchSongsAdmin(
    q: string,
    limit: number,
  ): Promise<Array<{ id: string; title: string; albumId: string; albumTitle: string; albumArtist: string }>> {
    const like = `%${q.toLowerCase()}%`;
    return await db
      .select({
        id: songs.id,
        title: songs.title,
        albumId: albums.id,
        albumTitle: albums.title,
        albumArtist: albums.artist,
      })
      .from(songs)
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .where(and(
        sql`lower(${songs.title}) LIKE ${like} AND ${albums.isGoodTunesRelease} = true`,
        isNull(songs.deletedAt),
        isNull(albums.deletedAt),
      ))
      .orderBy(asc(songs.title))
      .limit(limit);
  }

  // Playlists are customer-owned, so the deep link lands on the
  // owning customer's admin profile (which renders the playlist list).
  // Owner display name is left-joined so an orphaned playlist still
  // surfaces with a null owner instead of disappearing.
  async searchPlaylistsAdmin(
    q: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; ownerId: string; ownerName: string | null }>> {
    const like = `%${q.toLowerCase()}%`;
    const rows = await db.execute<{ id: string; name: string; owner_id: string; owner_name: string | null }>(sql`
      SELECT p.id, p.name, p.user_id AS owner_id, c.display_name AS owner_name
      FROM playlists p
      LEFT JOIN customer_users c ON c.id = p.user_id
      WHERE lower(p.name) LIKE ${like}
      ORDER BY p.name ASC
      LIMIT ${limit}
    `);
    return ((rows as any).rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      ownerId: r.owner_id,
      ownerName: r.owner_name ?? null,
    }));
  }

  // Orders: fan orders match on numeric goodDeedNumber, id prefix,
  // buyer name, or buyer email; pressing requests match on id prefix
  // or joined album title. Returns both lists so the route can render
  // them as separate groups.
  async searchOrdersAdmin(q: string, limit: number): Promise<{
    fan: Array<{ id: string; goodDeedNumber: number | null; buyerName: string | null; buyerEmail: string | null; status: string; albumTitle: string | null }>;
    pressing: Array<{ id: string; status: string; albumTitle: string | null; quantity: number }>;
  }> {
    const lower = q.toLowerCase();
    const like = `%${lower}%`;
    const numeric = /^\d+$/.test(q) ? Number(q) : null;
    const fanRows = await db.execute<any>(sql`
      SELECT o.id, o.good_deed_number, o.buyer_name, o.buyer_email, o.status, a.title AS album_title
      FROM orders o
      LEFT JOIN albums a ON a.id = o.album_id
      WHERE lower(o.id) LIKE ${`${lower}%`}
         OR lower(coalesce(o.buyer_name, '')) LIKE ${like}
         OR lower(coalesce(o.buyer_email, '')) LIKE ${like}
         ${numeric !== null ? sql`OR o.good_deed_number = ${numeric}` : sql``}
      ORDER BY o.created_at DESC NULLS LAST
      LIMIT ${limit}
    `);
    const pressingRows = await db.execute<any>(sql`
      SELECT r.id, r.status, r.quantity, a.title AS album_title
      FROM pressing_order_requests r
      LEFT JOIN albums a ON a.id = r.album_id
      WHERE lower(r.id) LIKE ${`${lower}%`}
         OR lower(coalesce(a.title, '')) LIKE ${like}
      ORDER BY r.submitted_at DESC
      LIMIT ${limit}
    `);
    return {
      fan: ((fanRows as any).rows ?? []).map((r: any) => ({
        id: r.id,
        goodDeedNumber: r.good_deed_number ?? null,
        buyerName: r.buyer_name ?? null,
        buyerEmail: r.buyer_email ?? null,
        status: r.status,
        albumTitle: r.album_title ?? null,
      })),
      pressing: ((pressingRows as any).rows ?? []).map((r: any) => ({
        id: r.id,
        status: r.status,
        albumTitle: r.album_title ?? null,
        quantity: r.quantity,
      })),
    };
  }
}

function toUploadValidationRow(row: typeof uploadValidations.$inferSelect): UploadValidationRow {
  return {
    id: row.id,
    albumId: row.albumId,
    kind: row.kind as "art" | "audio",
    vendorId: row.vendorId,
    templateId: row.templateId,
    assetUrl: row.assetUrl,
    fileName: row.fileName,
    status: row.status as "pass" | "warn" | "fail",
    checks: (row.checks ?? []) as UploadValidationRow["checks"],
    overrideJustification: row.overrideJustification,
    overrideByUserId: row.overrideByUserId,
    overrideAt: row.overrideAt,
    createdAt: row.createdAt,
  };
}

// Idempotent schema/data migrations that need to run on every boot,
// before any code reads/writes columns that drizzle expects. We can't
// rely on `npm run db:push` having been executed in every environment
// (notably ephemeral preview DBs), so anything load-bearing for runtime
// code goes here.
//
// playlist_count denorm: songs.playlist_count is read on the song row
// and incremented/decremented on every add/remove_song_to_playlist. If
// the column is missing the next playlist mutation throws; if it's
// present but never backfilled the counts read as 0 for every song that
// existed before the column landed.
async function ensureRuntimeMigrations(): Promise<void> {
  try {
    // Task #75 — artist reporting indexes (no-ops if already present).
    const { ensureArtistReportingIndexes } = await import("./artistReports");
    await ensureArtistReportingIndexes();
    // ADD COLUMN is idempotent (IF NOT EXISTS) and cheap.
    await db.execute(sql`ALTER TABLE songs ADD COLUMN IF NOT EXISTS playlist_count INTEGER NOT NULL DEFAULT 0`);
    // Task #536 — "What's New" welcome-back sheet. Nullable INT — NULL
    // means "fan has never dismissed", which is the eligible state for
    // the next first-launch render.
    await db.execute(sql`ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS whats_new_seen_version INTEGER`);
    // Task #119 — platform-cost pricing + artist profit readout.
    // 1. payout_settings.shopify_fee_cents — new platform-cost knob shown
    //    on the super-admin Platform Pricing page. Default $3.50.
    // 2. album_addons.cost_cents_snapshot — per-addon snapshot of the
    //    platform's cert cost taken at the moment the artist saved the
    //    add-on, so the "You earn $X.XX" readout in the Sell panel is
    //    stable until the artist re-saves at a new platform price.
    // Guard each ALTER with `to_regclass` so first-boot dev DBs (where
    // drizzle-kit push hasn't yet created `payout_settings` / `album_addons`)
    // don't crash the migration runner. Once the tables land, subsequent
    // boots run the ADD COLUMN + backfill normally.
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.payout_settings') IS NOT NULL THEN
          ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS shopify_fee_cents INTEGER NOT NULL DEFAULT 350;
          -- Signed-cert wholesale ladder (editable in god-view). Nullable
          -- so the column adding never blocks an existing fresh DB; the
          -- read path falls back to DEFAULT_SIGNED_CERT_LADDER when NULL.
          -- Backfill any existing 'default' row that is still NULL so
          -- the AdminPlatformPricing form has rungs to render on first
          -- load.
          ALTER TABLE payout_settings ADD COLUMN IF NOT EXISTS signed_cert_ladder JSONB;
          UPDATE payout_settings
          SET signed_cert_ladder = '[
            {"minQty":25,"label":"25–49","wholesaleCents":1300},
            {"minQty":50,"label":"50–99","wholesaleCents":1200},
            {"minQty":100,"label":"100–199","wholesaleCents":900},
            {"minQty":200,"label":"200–299","wholesaleCents":700},
            {"minQty":300,"label":"300+","wholesaleCents":600}
          ]'::jsonb
          WHERE id = 'default' AND signed_cert_ladder IS NULL;
          -- Make sure the singleton row exists *before* we use its
          -- cert_cost_cents to backfill addon snapshots. Without this,
          -- a fresh DB where getPayoutSettings() hasn't run yet would
          -- leave existing signed_cert rows with a NULL snapshot, and
          -- a later platform-cost change would retroactively shift the
          -- artist's "You earn" readout — the exact thing the
          -- price-lock rule (docs/admin-conventions.md) forbids.
          INSERT INTO payout_settings (id, platform_fee_pct, cert_cost_cents, shopify_fee_cents, signed_cert_ladder)
          VALUES ('default', 10, 1200, 350, '[
            {"minQty":25,"label":"25–49","wholesaleCents":1300},
            {"minQty":50,"label":"50–99","wholesaleCents":1200},
            {"minQty":100,"label":"100–199","wholesaleCents":900},
            {"minQty":200,"label":"200–299","wholesaleCents":700},
            {"minQty":300,"label":"300+","wholesaleCents":600}
          ]'::jsonb)
          ON CONFLICT (id) DO NOTHING;
        END IF;
        -- Task #216 — preflight validation results
        CREATE TABLE IF NOT EXISTS upload_validations (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          album_id varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
          kind text NOT NULL,
          vendor_id text NOT NULL,
          template_id text,
          asset_url text NOT NULL,
          file_name text,
          status text NOT NULL,
          checks jsonb NOT NULL,
          override_justification text,
          override_by_user_id varchar,
          override_at timestamp,
          created_at timestamp NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS upload_validations_album_idx ON upload_validations(album_id);
        -- Task #225 — pressing-order requests (artist → GoodTunes review)
        CREATE TABLE IF NOT EXISTS pressing_order_requests (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          album_id varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
          status text NOT NULL,
          package_snapshot jsonb NOT NULL,
          quantity integer NOT NULL,
          unit_cents integer NOT NULL,
          total_cents integer NOT NULL,
          preflight_status text,
          rejection_note text,
          submitted_at timestamp NOT NULL DEFAULT now(),
          submitted_by_user_id varchar,
          decided_at timestamp,
          decided_by_user_id varchar
        );
        CREATE INDEX IF NOT EXISTS pressing_order_requests_album_idx ON pressing_order_requests(album_id);
        CREATE INDEX IF NOT EXISTS pressing_order_requests_status_idx ON pressing_order_requests(status);
        IF to_regclass('public.album_addons') IS NOT NULL THEN
          ALTER TABLE album_addons ADD COLUMN IF NOT EXISTS cost_cents_snapshot INTEGER;
          IF to_regclass('public.payout_settings') IS NOT NULL THEN
            UPDATE album_addons
            SET cost_cents_snapshot = (
              SELECT cert_cost_cents FROM payout_settings WHERE id = 'default'
            )
            WHERE kind = 'signed_cert' AND cost_cents_snapshot IS NULL;
          END IF;
        END IF;
      END
      $$;
    `);
    // One-time backfill: recompute from playlist_songs only when no song
    // currently carries a non-zero count. The first boot after the
    // column lands fills it; subsequent boots short-circuit cheaply.
    const probe = await db.execute(sql`SELECT 1 FROM songs WHERE playlist_count > 0 LIMIT 1`);
    if ((probe as any).rows?.length === 0 || (probe as any).length === 0) {
      await db.execute(sql`
        UPDATE songs s
        SET playlist_count = COALESCE(c.cnt, 0)
        FROM (
          SELECT song_id, COUNT(*)::int AS cnt
          FROM playlist_songs
          GROUP BY song_id
        ) c
        WHERE c.song_id = s.id AND s.playlist_count <> c.cnt
      `);
    }
  } catch (e) {
    console.error("[migrations] ensureRuntimeMigrations failed:", e);
  }
}

export async function seedCatalog(): Promise<void> {
  await ensureRuntimeMigrations();
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
