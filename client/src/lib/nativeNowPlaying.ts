/**
 * Now-Playing bridge for the native apps (lock screen / Control Center).
 *
 * The GoodTunes native shells are a thin Capacitor wrap of the web player, so
 * audio is played by the WebView's hidden <audio> element (see
 * PlayerContext.tsx). That element alone never tells the OS *what* is playing,
 * so the iOS lock screen would only show the app name with dead transport
 * buttons. This module mirrors the current track's metadata + playback
 * position out to the OS and forwards the lock-screen / Control Center
 * commands back into the web player.
 *
 * Platform split:
 *   - iOS (native): the in-tree `NowPlaying` Capacitor plugin
 *     (`ios/App/App/NowPlayingPlugin.swift`) sets the AVAudioSession `.playback`
 *     category (so audio keeps going with the screen locked / app backgrounded),
 *     populates `MPNowPlayingInfoCenter` (title/artist/album/artwork/elapsed/
 *     duration), and forwards `MPRemoteCommandCenter` play/pause/next/prev/seek
 *     events. This is the reliable lock-screen path on iOS WKWebView, which is
 *     why PlayerContext gates the *web* MediaSession block off on native iOS
 *     and lets the plugin own the now-playing info instead.
 *   - Android (native): the Chromium System WebView surfaces the web
 *     `navigator.mediaSession` metadata as the phone media-style notification
 *     and keeps audio alive in the background (unchanged). The in-tree
 *     `NowPlaying` plugin (`android/.../NowPlayingPlugin.java`) is a no-op
 *     stub — Android Auto was removed after a Play Console policy rejection
 *     (Auto App Quality Guidelines: Login Credentials). All plugin methods
 *     still resolve so no JS crash occurs.
 *   - Web (any browser / PWA): no native token — every export is a no-op and the
 *     web MediaSession layer handles the mobile-web / PWA lock screen.
 *
 * Everything is guarded so importing the module off-native is harmless and an
 * older native binary (built before this shipped, so missing the plugin) never
 * throws an unhandled rejection — mirroring the pushNotifications.ts pattern.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNative } from "./platform";

export interface NowPlayingMetadata {
  title: string;
  artist: string;
  album: string;
  /** Album artwork URL shown on the lock screen; omitted when unavailable. */
  artworkUrl?: string;
  /** Track length in seconds (0 when unknown). */
  duration: number;
}

export interface NowPlayingPlaybackState {
  isPlaying: boolean;
  /** Current elapsed playback position in seconds. */
  elapsed: number;
  /** Track length in seconds (0 when unknown). */
  duration: number;
  /** Whether shuffle is on — drives the CarPlay Now Playing shuffle button's
   *  displayed state (iOS only; omitted = leave unchanged). */
  shuffle?: boolean;
  /** Repeat mode — drives the CarPlay Now Playing repeat button's displayed
   *  state (iOS only; omitted = leave unchanged). */
  repeat?: "none" | "all" | "one";
}

/** A single browsable entry (a queued track) published to CarPlay (iOS) so
 *  the car head-unit can show + jump around the Up Next list. */
export interface NowPlayingQueueItem {
  /** Stable id (the PlayerSong id) echoed back on a `playIndex` command. */
  id: string;
  title: string;
  artist: string;
  /** Album artwork URL for the browse row thumbnail; omitted when unavailable. */
  artworkUrl?: string;
  /** Track length in seconds (0 when unknown) — shown in the CarPlay Up Next
   *  row's detail text. */
  duration: number;
}

/** A single track inside a browsable catalog album (CarPlay album-detail row). */
export interface NowPlayingCatalogTrack {
  /** Stable id (the PlayerSong id) echoed back on a `playAlbum` command. */
  id: string;
  title: string;
  artist: string;
  /** Track length in seconds (0 when unknown). */
  duration: number;
}

/** A browsable album published to CarPlay (iOS) — the fan's owned GoodTunes
 *  releases + their tracklists. Drives the CarPlay Library root list and the
 *  per-album track list. */
export interface NowPlayingCatalogAlbum {
  /** Stable album id echoed back on a `playAlbum` command. */
  id: string;
  title: string;
  artist: string;
  /** Album artwork URL for the browse row thumbnail; omitted when unavailable. */
  artworkUrl?: string;
  tracks: NowPlayingCatalogTrack[];
}

/** A transport command originated from the OS lock screen / Control Center or
 *  the CarPlay in-car surface (iOS). */
export type RemoteCommand =
  | { action: "play" | "pause" | "toggle" | "next" | "prev" | "stop" }
  | { action: "seek"; value: number }
  /** The user tapped a row in the CarPlay browse list —
   *  `value` is the 0-based index into the queue last published via
   *  {@link setNowPlayingQueue}. */
  | { action: "playIndex"; value: number }
  /** The user tapped a track in the CarPlay Library (album detail), a Play/
   *  Shuffle row, or a Recents entry. Play `albumId` from the catalog last
   *  published via {@link setNowPlayingCatalog}: `trackId` present = start at that
   *  track; absent = start from the top; `shuffle` = shuffle the album. */
  | { action: "playAlbum"; albumId: string; trackId?: string; shuffle?: boolean }
  /** CarPlay Now Playing heart tapped — toggle the current track's favorite. */
  | { action: "toggleFavorite" }
  /** CarPlay Now Playing shuffle button tapped — toggle shuffle. */
  | { action: "toggleShuffle" }
  /** CarPlay Now Playing repeat button tapped — cycle repeat (off→all→one). */
  | { action: "cycleRepeat" }
  /** CarPlay connected — re-publish metadata + playback state + queue +
   *  catalog (iOS resets the now-playing info around scene connect). */
  | { action: "resync" };

interface PluginListenerHandle {
  remove: () => Promise<void>;
}

/** A single "recently played" entry published to CarPlay (iOS) — an owned
 *  album or a track within one. Drives the CarPlay Recents tab. */
export interface NowPlayingRecentItem {
  /** Album id echoed back on a `playAlbum` command. */
  albumId: string;
  /** Track id echoed back on a `playAlbum` command (absent = play the album
   *  from the top). */
  trackId?: string;
  title: string;
  subtitle: string;
  /** Artwork URL for the browse row thumbnail; omitted when unavailable. */
  artworkUrl?: string;
}

/** Native build provenance returned by the NowPlaying plugin's `getBuildInfo`.
 *  Lets an operator confirm IN-APP which source commit produced the installed
 *  binary — the remote-origin shell otherwise makes "is this build stale?"
 *  unanswerable on-device. */
export interface NowPlayingBuildInfo {
  /** The git commit the native binary was built from (Info.plist `GTGitCommit`,
   *  stamped by the Codemagic archive step). Empty on a binary built before the
   *  stamp step / where the key is absent. */
  commit: string;
  /** `CFBundleShortVersionString` — the marketing version (e.g. "3.0.6"). */
  version: string;
  /** `CFBundleVersion` — the build number. */
  build: string;
}

interface NowPlayingPlugin {
  setMetadata(options: NowPlayingMetadata): Promise<void>;
  setPlaybackState(options: NowPlayingPlaybackState): Promise<void>;
  setQueue(options: { items: NowPlayingQueueItem[]; currentIndex: number }): Promise<void>;
  setCatalog(options: { albums: NowPlayingCatalogAlbum[] }): Promise<void>;
  setRecents(options: { items: NowPlayingRecentItem[] }): Promise<void>;
  setFavorite(options: { isFavorite: boolean }): Promise<void>;
  clear(): Promise<void>;
  clearLibrary(): Promise<void>;
  getBuildInfo(): Promise<NowPlayingBuildInfo>;
  addListener(
    eventName: "remoteCommand",
    listenerFunc: (data: RemoteCommand) => void,
  ): Promise<PluginListenerHandle>;
}

const NowPlaying = registerPlugin<NowPlayingPlugin>("NowPlaying");

/**
 * Resolve an album-artwork value to an absolute, fetchable URL.
 *
 * Artwork is stored app-relative (e.g. `/objects/uploads/<id>` or
 * `/figmaAssets/<file>`). The web MediaSession resolves those against the page
 * origin, but the native iOS plugin loads the image with a native `URLSession`
 * *outside* the WebView — `URL(string: "/objects/…")` there has no host, so the
 * fetch fails and the lock screen shows no art. Absolutizing against the WebView
 * origin (the live remote host on native) gives both paths a fetchable URL.
 * Already-absolute (`http(s)://…`, `data:`) values pass through unchanged, and
 * anything that can't be resolved falls back to the original string.
 */
export function absolutizeArtwork(
  artwork: string | undefined,
): string | undefined {
  if (!artwork) return undefined;
  if (/^(https?:|data:)/i.test(artwork)) return artwork;
  const origin =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : undefined;
  if (!origin) return artwork;
  try {
    return new URL(artwork, origin).href;
  } catch {
    return artwork;
  }
}

// Cache the availability probe: `isPluginAvailable` is cheap but this is called
// on every position tick. False on web and on any native binary that predates
// the plugin, so every call below short-circuits to a no-op there.
let pluginAvailable: boolean | null = null;
function available(): boolean {
  if (!isNative) return false;
  if (pluginAvailable === null) {
    try {
      pluginAvailable = Capacitor.isPluginAvailable("NowPlaying");
    } catch {
      pluginAvailable = false;
    }
  }
  return pluginAvailable;
}

// --- Now-Playing diagnostic capture (Task #2658) ---------------------------
// Bill's native lock screen + CarPlay show a generic "GoodTunes" title and the
// app logo while the scrubber + transport work. That symptom narrows to exactly
// one of three causes, each with a DIFFERENT fix:
//   1. the JS side never computes a real title (data-shape bug) — JS fix;
//   2. the bridge call never reaches the plugin (`available()` === false, e.g.
//      the plugin isn't registered on this binary), so the scrubber Bill sees
//      is just iOS auto-managing the WebView <audio> — native/rebuild fix;
//   3. the bridge delivers real values but iOS ignores the plugin's manual
//      MPNowPlayingInfoCenter write for the WebView session — fix is to feed
//      navigator.mediaSession.metadata instead.
// The deciding fact is device-only (no Xcode / head unit in the container), so
// this records what the JS side last TRIED to publish and whether the bridge
// actually delivered it. The native shell loads the remote origin, so it ships
// to the existing binary via a normal web publish (no CodeMagic build);
// operators read it in-app via NowPlayingDebugOverlay.
type DiagMeta = NowPlayingMetadata & { at: number; delivered: boolean; error: string | null };
type DiagPlayback = NowPlayingPlaybackState & { at: number; delivered: boolean; error: string | null };
type DiagFavorite = { isFavorite: boolean; at: number; delivered: boolean; error: string | null };
type DiagCommand = { cmd: RemoteCommand; at: number };

export interface NowPlayingDiag {
  isNative: boolean;
  platform: string;
  /** Live `Capacitor.isPluginAvailable("NowPlaying")` — the (2) vs (3) fork. */
  pluginAvailable: boolean;
  /**
   * Every native plugin the installed binary registered (from the bridge-injected
   * `Capacitor.PluginHeaders`). This distinguishes a STALE build (predates the
   * NowPlaying plugin → the list lacks it AND the two working siblings would
   * still be present on a recent build) from a NowPlaying-specific registration
   * bug (siblings present, NowPlaying absent) — without needing Xcode.
   */
  registeredPlugins: string[];
  /**
   * Availability of the two other in-tree Capacitor plugins that use the exact
   * same registration pattern as NowPlaying. If these read `true` on the same
   * binary where NowPlaying reads `false`, the binary is NOT stale and the fault
   * is NowPlaying-specific (not a missing rebuild).
   */
  siblingSystemVolume: boolean;
  siblingSecureKeyStore: boolean;
  lastMetadata: DiagMeta | null;
  lastPlayback: DiagPlayback | null;
  lastFavorite: DiagFavorite | null;
  lastCommand: DiagCommand | null;
  metadataCalls: number;
  playbackCalls: number;
  favoriteCalls: number;
  commandCount: number;
  /**
   * Native build provenance (git commit + version/build) read back through the
   * now-registered NowPlaying plugin. Null until fetched, on web, or on a native
   * binary predating `getBuildInfo`. A non-empty `commit` confirms exactly which
   * source produced the installed build AND proves the plugin registered.
   */
  buildInfo: NowPlayingBuildInfo | null;
}

let diagLastMetadata: DiagMeta | null = null;
let diagBuildInfo: NowPlayingBuildInfo | null = null;
let diagLastPlayback: DiagPlayback | null = null;
let diagLastFavorite: DiagFavorite | null = null;
let diagLastCommand: DiagCommand | null = null;
let diagMetadataCalls = 0;
let diagPlaybackCalls = 0;
let diagFavoriteCalls = 0;
let diagCommandCount = 0;

function emitDiag(): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("gt:nowplaying-diag"));
    }
  } catch {}
}

/** Snapshot the Now-Playing bridge diagnostic state. Cheap; safe off-native. */
export function getNowPlayingDiag(): NowPlayingDiag {
  let platform = "web";
  let pluginAvailable = false;
  let registeredPlugins: string[] = [];
  let siblingSystemVolume = false;
  let siblingSecureKeyStore = false;
  try {
    platform = Capacitor.getPlatform();
  } catch {}
  try {
    pluginAvailable = isNative && Capacitor.isPluginAvailable("NowPlaying");
  } catch {}
  try {
    // The native bridge injects `Capacitor.PluginHeaders` — the authoritative
    // list of plugins the installed binary actually registered. Absent on web.
    const headers = (Capacitor as unknown as {
      PluginHeaders?: Array<{ name?: string }>;
    }).PluginHeaders;
    if (Array.isArray(headers)) {
      registeredPlugins = headers
        .map((h) => h?.name)
        .filter((n): n is string => typeof n === "string")
        .sort();
    }
  } catch {}
  try {
    siblingSystemVolume = isNative && Capacitor.isPluginAvailable("SystemVolume");
  } catch {}
  try {
    siblingSecureKeyStore =
      isNative && Capacitor.isPluginAvailable("SecureKeyStore");
  } catch {}
  return {
    isNative,
    platform,
    pluginAvailable,
    registeredPlugins,
    siblingSystemVolume,
    siblingSecureKeyStore,
    lastMetadata: diagLastMetadata,
    lastPlayback: diagLastPlayback,
    lastFavorite: diagLastFavorite,
    lastCommand: diagLastCommand,
    metadataCalls: diagMetadataCalls,
    playbackCalls: diagPlaybackCalls,
    favoriteCalls: diagFavoriteCalls,
    commandCount: diagCommandCount,
    buildInfo: diagBuildInfo,
  };
}

/**
 * Read the native build's provenance (commit/version/build) through the plugin
 * and cache it for the diagnostic overlay. No-op off-native / when the plugin is
 * unavailable (older binary without the method). Safe to call repeatedly — the
 * overlay calls it on open. Emits the diag event so the overlay re-renders.
 */
export async function fetchNowPlayingBuildInfo(): Promise<void> {
  if (!available()) return;
  try {
    const info = await NowPlaying.getBuildInfo();
    diagBuildInfo = {
      commit: String(info?.commit ?? ""),
      version: String(info?.version ?? ""),
      build: String(info?.build ?? ""),
    };
    emitDiag();
  } catch {
    /* older binary without getBuildInfo — leave buildInfo null */
  }
}

/** Publish the current track's metadata to the OS lock screen. No-op off-native. */
export function setNowPlayingMetadata(meta: NowPlayingMetadata): void {
  const delivered = available();
  diagMetadataCalls += 1;
  diagLastMetadata = { ...meta, at: Date.now(), delivered, error: null };
  emitDiag();
  if (!delivered) return;
  NowPlaying.setMetadata(meta).catch((e: any) => {
    if (diagLastMetadata) diagLastMetadata.error = String(e?.message ?? e);
    emitDiag();
    /* best-effort; a failed set just leaves the previous now-playing info */
  });
}

/** Publish play/pause + elapsed position so the lock-screen scrubber tracks
 *  real playback. No-op off-native. */
export function setNowPlayingPlaybackState(state: NowPlayingPlaybackState): void {
  const delivered = available();
  diagPlaybackCalls += 1;
  // Ticks ~1×/sec, so update the snapshot without dispatching an event (the
  // overlay polls while open); metadata/favorite/command still emit.
  diagLastPlayback = { ...state, at: Date.now(), delivered, error: null };
  if (!delivered) return;
  NowPlaying.setPlaybackState(state).catch((e: any) => {
    if (diagLastPlayback) diagLastPlayback.error = String(e?.message ?? e);
  });
}

/**
 * Publish the current Up Next queue so CarPlay (iOS) can render a browsable
 * list and let the driver jump to any track. `currentIndex` marks the
 * now-playing row. No-op off-native (and on native iOS this is only consumed
 * by the CarPlay scene — the lock screen ignores it). */
export function setNowPlayingQueue(
  items: NowPlayingQueueItem[],
  currentIndex: number,
): void {
  if (!available()) return;
  NowPlaying.setQueue({ items, currentIndex }).catch(() => {});
}

/**
 * Publish the fan's browsable Library (owned GoodTunes releases + tracklists)
 * so CarPlay (iOS) can render the Library root list + per-album track lists and
 * let the driver start any track. No-op off-native (and on native iOS this is
 * only consumed by the CarPlay scene — the lock screen ignores it). */
export function setNowPlayingCatalog(albums: NowPlayingCatalogAlbum[]): void {
  if (!available()) return;
  NowPlaying.setCatalog({ albums }).catch(() => {});
}

/**
 * Publish the fan's "recently played" list so CarPlay (iOS) can render the
 * Recents tab and let the driver resume any album/track. No-op off-native (and
 * on native iOS this is only consumed by the CarPlay scene — the lock screen
 * ignores it). */
export function setNowPlayingRecents(items: NowPlayingRecentItem[]): void {
  if (!available()) return;
  NowPlaying.setRecents({ items }).catch(() => {});
}

/**
 * Publish whether the current track is a favorite so CarPlay (iOS) can render
 * the Now Playing heart button filled vs outline. No-op off-native. */
export function setNowPlayingFavorite(isFavorite: boolean): void {
  const delivered = available();
  diagFavoriteCalls += 1;
  diagLastFavorite = { isFavorite, at: Date.now(), delivered, error: null };
  emitDiag();
  if (!delivered) return;
  NowPlaying.setFavorite({ isFavorite }).catch((e: any) => {
    if (diagLastFavorite) diagLastFavorite.error = String(e?.message ?? e);
    emitDiag();
  });
}

/** Clear the OS now-playing info (queue emptied / player torn down). */
export function clearNowPlaying(): void {
  if (!available()) return;
  NowPlaying.clear().catch(() => {});
}

/**
 * Wipe the persisted cold-connect snapshot (owned catalog/recents/queue + last
 * now-playing metadata/art) that CarPlay reloads when the phone app was never
 * opened. Call on sign-out so the next fan can't see the previous fan's library
 * in the car. No-op off-native (and on native binaries predating the plugin
 * method, the rejected promise is swallowed). */
export function clearNowPlayingLibrary(): void {
  if (!available()) return;
  NowPlaying.clearLibrary().catch(() => {});
}

/**
 * Subscribe to lock-screen / Control Center transport commands. Returns a
 * cleanup function that removes the listener. No-op (returns a noop cleanup)
 * off-native.
 */
export function onNowPlayingRemoteCommand(
  handler: (cmd: RemoteCommand) => void,
): () => void {
  if (!available()) return () => {};
  let cancelled = false;
  let handle: PluginListenerHandle | null = null;
  NowPlaying.addListener("remoteCommand", (data) => {
    // Record the inbound command (esp. `toggleFavorite`) so an operator can
    // confirm the CarPlay heart tap actually reaches JS — the "highlights but
    // doesn't take" symptom is either no command arriving or the favorite echo
    // (setNowPlayingFavorite) not landing.
    diagLastCommand = { cmd: data, at: Date.now() };
    diagCommandCount += 1;
    emitDiag();
    handler(data);
  })
    .then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    handle?.remove().catch(() => {});
  };
}
