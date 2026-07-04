---
name: Now-Playing / lock-screen architecture split
description: How background audio + lock-screen transport is wired across iOS native / Android / web, and why each platform uses a different owner.
---

# Now-Playing / lock-screen controls (background audio)

Three platforms, deliberately different owners. All wiring lives in one place:
the media-session effects in `PlayerContext.tsx` (metadata / playback-state /
position / action-handler effects) plus the JS bridge `lib/nativeNowPlaying.ts`
and the iOS Swift plugin `ios/App/App/NowPlayingPlugin.swift`.

## Who owns the lock screen on each platform
- **iOS native (WKWebView):** the in-tree `NowPlaying` Capacitor plugin owns
  `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` and sets AVAudioSession
  `.playback` (this is what keeps the WebView's `<audio>` alive when
  locked/backgrounded — pairs with `UIBackgroundModes=audio`). Re-apply the
  category on setMetadata/setPlaybackState because WKWebView can reset it.
- **Android native:** NO native plugin. The Chromium System WebView surfaces the
  web `navigator.mediaSession` metadata as the media notification AND keeps audio
  playing in the background. `Capacitor.isPluginAvailable("NowPlaying")` is false
  there so the JS bridge no-ops.
- **Web / PWA:** web `navigator.mediaSession` only.

## Two non-obvious rules
- **Gate the web MediaSession block OFF on native iOS** (`!isNativeIOS`). If both
  the web MediaSession and the native plugin set now-playing info on iOS, WKWebView's
  own MediaSession fights `MPNowPlayingInfoCenter` → flicker/wrong metadata.
- **Do NOT add `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` perms
  to AndroidManifest** for this. We declare no foreground service (Chromium WebView
  provides the notification + background audio), and declaring the media-playback
  foreground-service permission without a matching service is a Play-review
  liability (triggers a policy declaration requirement). WAKE_LOCK already present
  is enough.

**Why:** the app is a thin Capacitor wrap — audio is played by the WebView's
hidden `<audio>`, not native code — so the native layer only *describes* playback
to the OS and forwards transport back into the web player (bidirectional).

**How to apply:** native position pushes are throttled to whole-second
granularity (JS↔native bridge is chatty) but react immediately to
play/pause/duration/song changes; OS action handlers register ONCE and read the
latest player callbacks through a ref. CarPlay / Android Auto are explicit
follow-ups (not built).
