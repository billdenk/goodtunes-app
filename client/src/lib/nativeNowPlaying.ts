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
 *   - Android (native): the Chromium System WebView still surfaces the web
 *     `navigator.mediaSession` metadata as the phone media-style notification
 *     and keeps audio alive in the background (unchanged). The in-tree
 *     `NowPlaying` plugin (`android/.../NowPlayingPlugin.java`) additionally
 *     mirrors the same metadata/state/queue into an app-owned
 *     `MediaSessionCompat` that the `AutoMediaBrowserService` exposes to
 *     Android Auto, and forwards Auto's transport back into the web player.
 *     The native session only goes active while a media browser (Android Auto
 *     / Assistant) is connected, so the phone lock screen keeps showing the
 *     single WebView card when you're not projecting.
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
}

/** A single browsable entry (a queued track) published to CarPlay / Android
 *  Auto so the car head-unit can show + jump around the Up Next list. */
export interface NowPlayingQueueItem {
  /** Stable id (the PlayerSong id) echoed back on a `playIndex` command. */
  id: string;
  title: string;
  artist: string;
  /** Album artwork URL for the browse row thumbnail; omitted when unavailable. */
  artworkUrl?: string;
}

/** A transport command originated from the OS lock screen / Control Center or
 *  an in-car surface (CarPlay / Android Auto). */
export type RemoteCommand =
  | { action: "play" | "pause" | "toggle" | "next" | "prev" | "stop" }
  | { action: "seek"; value: number }
  /** The user tapped a row in the CarPlay / Android Auto browse list —
   *  `value` is the 0-based index into the queue last published via
   *  {@link setNowPlayingQueue}. */
  | { action: "playIndex"; value: number };

interface PluginListenerHandle {
  remove: () => Promise<void>;
}

interface NowPlayingPlugin {
  setMetadata(options: NowPlayingMetadata): Promise<void>;
  setPlaybackState(options: NowPlayingPlaybackState): Promise<void>;
  setQueue(options: { items: NowPlayingQueueItem[]; currentIndex: number }): Promise<void>;
  clear(): Promise<void>;
  addListener(
    eventName: "remoteCommand",
    listenerFunc: (data: RemoteCommand) => void,
  ): Promise<PluginListenerHandle>;
}

const NowPlaying = registerPlugin<NowPlayingPlugin>("NowPlaying");

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

/** Publish the current track's metadata to the OS lock screen. No-op off-native. */
export function setNowPlayingMetadata(meta: NowPlayingMetadata): void {
  if (!available()) return;
  NowPlaying.setMetadata(meta).catch(() => {
    /* best-effort; a failed set just leaves the previous now-playing info */
  });
}

/** Publish play/pause + elapsed position so the lock-screen scrubber tracks
 *  real playback. No-op off-native. */
export function setNowPlayingPlaybackState(state: NowPlayingPlaybackState): void {
  if (!available()) return;
  NowPlaying.setPlaybackState(state).catch(() => {});
}

/**
 * Publish the current Up Next queue so CarPlay / Android Auto can render a
 * browsable list and let the driver jump to any track. `currentIndex` marks
 * the now-playing row. No-op off-native (and on native iOS this is only
 * consumed by the CarPlay scene — the lock screen ignores it). */
export function setNowPlayingQueue(
  items: NowPlayingQueueItem[],
  currentIndex: number,
): void {
  if (!available()) return;
  NowPlaying.setQueue({ items, currentIndex }).catch(() => {});
}

/** Clear the OS now-playing info (queue emptied / player torn down). */
export function clearNowPlaying(): void {
  if (!available()) return;
  NowPlaying.clear().catch(() => {});
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
  NowPlaying.addListener("remoteCommand", (data) => handler(data))
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
