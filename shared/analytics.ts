// Typed analytics event registry.
//
// Add a new event by appending an entry to the `AnalyticsEventMap` union.
// Both client and server import from here so payload shapes can't drift —
// dropping a field in the client is a TypeScript error in the server's
// debug overlay reader, and vice versa.
//
// Every event also carries an "envelope" of context fields added by the
// SDK/server (deviceId, sessionId, userId, platform, referrer, geo). Those
// live on the wire alongside `payload` and aren't repeated in each event's
// payload shape.

export type AnalyticsPlatform = "web-mobile" | "web-desktop";

export type AnalyticsEnvelope = {
  deviceId: string;
  sessionId: string;
  userId?: string | null;
  platform?: AnalyticsPlatform;
  referrer?: string | null;
  // Filled in server-side from the request (IP-derived). The client never
  // sets these — they're authoritative from the ingest endpoint.
  country?: string | null;
  region?: string | null;
};

// Reused payload fragments — when an event references an entity, prefer
// these typed bits over ad-hoc field names so admin dashboards can group
// across events by the same key.
type EntityRefs = {
  songId?: string;
  albumId?: string;
  artistId?: string;
  personId?: string;
  labelId?: string;
  vendorId?: string;
  instrumentId?: string;
  playlistId?: string;
  certificateNumber?: number;
};

// ────────────────────────────────────────────────────────────────────────
// Event map. Each key is the wire-level event name; the value is the
// shape of `payload` for that event.
// ────────────────────────────────────────────────────────────────────────
export interface AnalyticsEventMap {
  // ─── Playback ────────────────────────────────────────────────
  play_start: EntityRefs & { songTitle?: string; albumTitle?: string; artist?: string; duration?: number; simulated?: boolean };
  play_30s: EntityRefs & { at: number; duration: number; songTitle?: string };
  play_complete: EntityRefs & { at: number; duration: number; songTitle?: string };
  play_skip: EntityRefs & { at: number; duration: number; direction: "next" | "prev" };
  play_seek: EntityRefs & { from: number; to: number; duration: number };
  play_pause: EntityRefs & { at: number };
  play_resume: EntityRefs & { at: number };

  // ─── Library ─────────────────────────────────────────────────
  favorite_song: EntityRefs;
  unfavorite_song: EntityRefs;
  favorite_artist: EntityRefs;
  unfavorite_artist: EntityRefs;
  // `follow_artist` fires alongside `favorite_artist` — in GoodTunes the star
  // on an artist IS the follow concept (see docs/design-system.md). Kept as a
  // separate event so dashboards can distinguish "star icon tapped" from a
  // future dedicated follow surface without renaming history.
  follow_artist: EntityRefs;

  // ─── Playlists ──────────────────────────────────────────────
  playlist_created: { playlistId?: string; name?: string };
  playlist_renamed: { playlistId?: string };
  playlist_deleted: { playlistId?: string };
  song_added_to_playlist: EntityRefs & { playlistId: string };
  song_removed_from_playlist: EntityRefs & { playlistId: string };

  // ─── Discovery ──────────────────────────────────────────────
  search_performed: { query: string; tab?: string; resultCount?: number };
  search_result_clicked: EntityRefs & { kind: "song" | "album" | "artist" | "vendor" | "instrument"; query?: string };
  album_viewed: EntityRefs & { albumTitle?: string };
  artist_viewed: EntityRefs & { artistName?: string };
  song_viewed: EntityRefs;

  // ─── Credits & lyrics ───────────────────────────────────────
  lyrics_opened: EntityRefs;
  credits_opened: EntityRefs;
  credits_person_clicked: EntityRefs;

  // ─── Gear ───────────────────────────────────────────────────
  gear_viewed: EntityRefs & { instrumentName?: string };
  gear_vendor_clicked: EntityRefs & { vendorName?: string; affiliateUrl?: string; vendorDomain?: string; url?: string };
  gear_vendor_chat_opened: EntityRefs & { vendorName?: string };

  // ─── Share ──────────────────────────────────────────────────
  share_initiated: EntityRefs & { destination: "native" | "copy" | "twitter" | "facebook" | "sms" | "email" | "other" };
  share_completed: EntityRefs & { destination: string };

  // ─── Gear vendor (in-app browser handoff lives in `gear_vendor_clicked`;
  //     this event fires when the fan opens a vendor chat thread instead)
  // Note: `vendorDomain` and `url` carry the resolved affiliate target so we
  //       can later attribute clicks back to SuperCredits™ payouts.

  // ─── Commerce ───────────────────────────────────────────────
  // `bundle_viewed` fires when the BuySheet finishes loading its SKUs +
  // add-ons — i.e. the fan is looking at the full purchasable bundle for
  // an album (format SKUs × signed-cert add-on). Distinct from
  // `album_viewed`, which is just the album page.
  bundle_viewed: EntityRefs & { skuCount?: number; hasSignedCert?: boolean };
  checkout_started: EntityRefs & { priceCents?: number };
  checkout_completed: EntityRefs & { priceCents?: number; orderId?: string };
  // `gift_initiated` fires the first time a buyer attaches a real
  // recipient to a paid order (turning it into a gift). The gift row
  // itself is created server-side at checkout, but this event marks the
  // buyer-initiated send.
  gift_initiated: EntityRefs & { orderId: string };

  // ─── Welcome-back "What's New" sheet (Task #536) ────────────
  // `welcome_back_shown` fires once per render — i.e. the first time a
  // fan's first-launch-after-update lands on a route that mounts the
  // sheet. `card_tapped` fires when a fan taps one of the capability
  // cards to dive in; `dismissed` fires when they close the sheet
  // (either via the CTA or the X). All three carry the current
  // `version` so funnels can pivot by wave.
  welcome_back_shown: { version: number; libraryCount: number; recognized: boolean };
  welcome_back_card_tapped: { version: number; cardKey: string };
  welcome_back_dismissed: { version: number; via: "cta" | "close" };

  // ─── Auth ───────────────────────────────────────────────────
  sign_in: { provider: "password" | "google" | "apple"; kind?: "admin" | "customer" };
  sign_up: { provider: "password" | "google" | "apple"; kind?: "admin" | "customer" };
  sign_out: { kind?: "admin" | "customer" };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

// On-the-wire shape: a typed payload + an `id` (client-generated for
// dedup) + a `ts` (client clock; server stamps `received_at` separately).
export type AnalyticsEventEnvelope<N extends AnalyticsEventName = AnalyticsEventName> = {
  id: string;
  name: N;
  payload: AnalyticsEventMap[N];
  ts: number;
} & AnalyticsEnvelope;

// Type-asserting helper: forces a tracked event's payload to match the
// declared shape at call sites that opt into typed tracking.
export type TrackFn = <N extends AnalyticsEventName>(name: N, payload: AnalyticsEventMap[N]) => void;
