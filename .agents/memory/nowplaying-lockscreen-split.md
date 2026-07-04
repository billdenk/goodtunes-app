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
- **Android native:** the in-tree `NowPlaying` plugin now EXISTS (added for
  Android Auto) but the phone lock-screen notification + background audio STILL
  come from the Chromium System WebView's `navigator.mediaSession` — the native
  plugin's session is kept inactive off-car so the phone doesn't get a duplicate
  notification (see "car surface" below). So the web MediaSession block stays ON
  for Android (do NOT gate it off there — only iOS gates it off).
- **Web / PWA:** web `navigator.mediaSession` only.

## Car surface (CarPlay + Android Auto) — reuses the same metadata/queue/callbacks
Built as an extension of the same wiring, NOT a parallel stack. `PlayerContext`
publishes the Up Next queue via `setNowPlayingQueue` next to metadata/state, and
a car row-tap returns a `playIndex` remoteCommand → `playQueueIndex(index)`
(same transport ref path as play/pause/next/prev/seek).
- **iOS:** `CarPlaySceneDelegate.swift` = `CPTabBarTemplate`(NowPlaying + "Up
  Next" `CPListTemplate`) fed by the `NowPlayingStore.swift` singleton; the
  plugin's `setQueue` updates the store, store `onPlayIndex` → plugin emits
  `playIndex`. Needs `com.apple.developer.carplay-audio` entitlement + a CarPlay
  scene manifest in `Info.plist` (both committed; entitlement must ALSO be
  enabled on the App ID / provisioning profile or the CarPlay scene won't load).
- **Android:** `AutoMediaBrowserService` (`MediaBrowserServiceCompat`) exposes an
  app-owned `MediaSessionCompat` held by the `MediaSessionHolder` singleton +
  a one-level browse list of the queue; manifest `<service>` +
  `com.google.android.gms.car.application` → `@xml/automotive_app_desc`. The
  session is `setActive(true)` ONLY when a car client connects (package check in
  `onGetRoot`), so the phone keeps its single WebView notification. Still NO
  foreground service / FOREGROUND_SERVICE perm (audio plays in the WebView).
  `androidx.media:media` added to `build.gradle`; plugin registered in
  `MainActivity` before `super.onCreate`.

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
latest player callbacks through a ref. CarPlay / Android Auto are BUILT (see
"Car surface" above) and reuse this exact metadata/state/queue + transport path
— any new remote command must thread the plugin → JS `remoteCommand` handler →
`mediaControlsRef` on BOTH iOS and Android.

## iOS lock-screen artwork must be an ABSOLUTE URL
Album art is stored app-relative (`/objects/uploads/x`, `/figmaAssets/x`). The
iOS plugin fetches it with a native `URLSession` OUTSIDE the WebView, so a
relative URL has no host → `URL(string:)` fails silently → no lock-screen art.
`absolutizeArtwork()` in `nativeNowPlaying.ts` resolves it against
`window.location.origin` (the live remote host on native) before it crosses the
bridge; already-absolute `http(s)`/`data:` pass through. **Web MediaSession
never hit this** (browser resolves relative art against the page), so it's an
iOS-native-only trap — any new now-playing art source must stay absolute.
**Why:** this is device-only code; the whole path can't be exercised in the
container, so the artwork URL contract is pinned by `nativeNowPlaying.test.ts`
and the on-device pass is documented under "Background audio + lock-screen
controls" in `docs/native-builds.md`.
