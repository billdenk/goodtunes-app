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
 *   - Android (native): there is intentionally NO native plugin. The Chromium
 *     System WebView surfaces the web `navigator.mediaSession` metadata as a
 *     media-style notification and keeps audio alive in the background, so the
 *     web MediaSession layer in PlayerContext covers Android for free. This
 *     wrapper's `isPluginAvailable("NowPlaying")` check is false there, so every
 *     call is a no-op.
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

/** A transport command originated from the OS lock screen / Control Center. */
export type RemoteCommand =
  | { action: "play" | "pause" | "toggle" | "next" | "prev" | "stop" }
  | { action: "seek"; value: number };

interface PluginListenerHandle {
  remove: () => Promise<void>;
}

interface NowPlayingPlugin {
  setMetadata(options: NowPlayingMetadata): Promise<void>;
  setPlaybackState(options: NowPlayingPlaybackState): Promise<void>;
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
