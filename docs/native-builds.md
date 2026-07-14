# Native builds — iOS (TestFlight) + Android (Play internal testing)

> **Day-to-day, builds run in the cloud — no Mac required.** [`codemagic-builds.md`](./codemagic-builds.md) is the operator cheat-sheet: Codemagic builds + signs on cloud Macs, ships to TestFlight, and has a one-button App Store submit. The Xcode/Android-Studio steps below are now the **manual fallback** (if Codemagic is down) and the reference for how the native projects are wired.

The GoodTunes native apps are **Capacitor wrappers** around the same React + Vite app that ships at `goodtunes.app`. There is no separate codebase. One change-set updates web, iOS, and Android together; the only difference is which surfaces are visible (see `client/src/lib/platform.ts`).

Product rules baked into the platform layer:

- **Chat** — web-only for v1. Hidden from BottomNav on native; every "Chat with vendor" CTA is gated; `/chat` deep links bounce to `/collection`.
- **Downloads** — native only. The web "download" tick is a localStorage flag (no real file). On native the audio bytes are fetched and written to `Documents/goodtunes/songs/<songId>.<ext>` via the Capacitor Filesystem plugin, and `PlayerContext` prefers the on-device file over the network URL so albums play in airplane mode.

- **Volume** — on iOS *web* the player's volume slider is hidden because Mobile Safari makes audio volume read-only (the hardware buttons own loudness). In the native iOS shell a small Capacitor plugin (`ios/App/App/SystemVolumePlugin.swift`, JS wrapper `client/src/lib/nativeVolume.ts`) reads/writes the device's hardware volume via MPVolumeView + AVAudioSession, so the slider is shown there and mirrors the system volume. The plugin is an **in-tree native file** committed to `ios/App` — it is *not* an npm package, so `cap sync` won't add or remove it; if you ever re-scaffold `ios/`, re-add the Swift file to the Xcode target.

- **In-car (CarPlay — iOS only)** — CarPlay reuses the same now-playing metadata + player callbacks the lock screen already drives (`PlayerContext.tsx` → `client/src/lib/nativeNowPlaying.ts` → the in-tree `NowPlaying` plugin). `PlayerContext` publishes the Up Next queue (`setNowPlayingQueue`) alongside metadata/state, and a tapped car row comes back as a `playIndex` remote command that calls `playQueueIndex(index)` (same transport path as play/pause/next/prev/seek). `ios/App/App/CarPlaySceneDelegate.swift` builds a `CPTabBarTemplate` of `CPNowPlayingTemplate.shared` + an "Up Next" `CPListTemplate`, fed by `NowPlayingStore.swift`; needs the `com.apple.developer.carplay-audio` entitlement (`App.entitlements`) + the CarPlay scene role in the `Info.plist` scene manifest (both committed). The entitlement is *restricted* — Apple approved it 2026-07-07, two portal steps (tick the App ID capability, delete stale profiles) still gate a clean distribution sign — see `docs/codemagic-builds.md` step 3. ⚠️ **Scene-lifecycle rule:** once *any* `UIApplicationSceneManifest` is in `Info.plist`, UIKit runs the whole app on the UIScene lifecycle — the manifest must therefore ALWAYS declare the phone window role (`UIWindowSceneSessionRoleApplication` → `ios/App/App/SceneDelegate.swift` + the `Main` storyboard) alongside the CarPlay role; this is what black-screened two prior attempts (see `.agents/memory/ios-scene-manifest-black-screen.md`) and it is fully declarative here — no `application(_:configurationForConnecting:)` override in `AppDelegate`. Because that failure mode signs and launches fine but paints black on-device, `codemagic.yaml`'s "Gate CarPlay out of the distribution archive" step strips BOTH the entitlement and the whole `UIApplicationSceneManifest` key from every distribution build (`ios-testflight`, `ios-appstore-submit`) unless `CARPLAY_GRANTED=true` is set in Codemagic's `apple_app` group — flip it only after Apple's grant is fully wired AND a CarPlay Simulator/real-device pass has actually run (see the verification section below). **Android Auto has been removed** — the `NowPlayingPlugin` on Android is now a no-op stub (Play Console rejected the app under Auto App Quality Guidelines: Login Credentials); all JS methods still resolve so no JS crash. Android lock-screen/notification is unchanged (system WebView `navigator.mediaSession`). The iOS CarPlay files remain in-tree (not npm) — re-add them to the Xcode target if you re-scaffold `ios/`.

Everything is wired through `client/src/lib/platform.ts` (booleans — `isNativeIOS` / `isWebIOS` gate the volume slider), `client/src/lib/nativeDownloads.ts` (storage), `client/src/lib/nativeVolume.ts` (system volume), and `client/src/lib/nativeNowPlaying.ts` (lock-screen + CarPlay metadata, state, queue, and transport; Android Auto removed). Don't sprinkle `Capacitor.isNativePlatform()` calls around the app — extend those files.

⚠️ **Remote-load failure = permanent black screen (Task #2578).** Because `capacitor.config.ts`'s `server.url` points the native webview at the LIVE `my.goodtunes.music` site instead of a bundled payload (see the comment there), the very first thing the app does on cold launch is a real network request. Capacitor's own navigation-failure handler (`WebViewDelegationHandler.webView(_:didFail...)`) does **nothing visible** unless `server.errorPath` is set — no error page, no retry — so a failed load (no network yet, a DNS hiccup, a brief outage, a slow cellular handshake on first launch) leaves the WKWebView exactly as it started: nothing painted. A freshly-created WKWebView's un-painted state is plain **black**, regardless of the navy `backgroundColor`/`isOpaque` set on the surrounding window/webview chrome, because that only takes effect once a frame actually commits. This is the leading suspect for the "black screen on open" TestFlight reports on build 74 — it's a load-failure/no-retry gap, not a scene-manifest or `server.url` misconfiguration (both of those were re-verified fine for this task; see Task #2570 above for the *other* black-screen cause). **Fix shipped:** `capacitor.config.ts` now sets `server.errorPath: "offline.html"`, and `client/public/offline.html` is a branded navy fallback page (bundled into the native webDir via `npm run build` + `npx cap sync`) that auto-retries the real load with backoff and offers a manual "Try Again" button, so a failed cold-launch load recovers instead of dead-ending on black forever. **Verification gap:** this is a device-only failure mode (it depends on real network timing at launch) and could not be reproduced or confirmed inside the Replit container — it must be verified on an actual TestFlight install (a good test: toggle Airplane Mode on, cold-launch, confirm the offline page + retry appears instead of black, then toggle it off and confirm auto-retry recovers into the player) before this task is considered fully closed. If black screens persist after this fix ships, the next step is pulling an actual device console log (Xcode → Window → Devices and Simulators, or Console.app on the paired Mac) at the moment of a repro — nothing further can be diagnosed from static code review alone.

---

## One-time setup

These steps need to be done **once**, on a Mac with Xcode 15+ and Android Studio Hedgehog+ installed. They cannot be run from the Replit container (no Cocoapods, no Android SDK, no signing keychain).

```bash
# from the repo root, on the Mac
npm install
npm run build                       # produces dist/public — the web payload
npx cap add ios
npx cap add android
npx cap sync
```

`cap add` scaffolds `ios/` and `android/` directories. They're meant to be committed (Capacitor convention), but the bulk of native config (`Info.plist`, `AndroidManifest.xml`, signing) is then maintained inside those projects directly.

### iOS — bundle id, signing, icons

- Bundle id: `Io.GoGoods.music` (set in `capacitor.config.ts`; must match the existing App Store Connect record, Apple ID `6448246869`).
- Open `ios/App/App.xcworkspace` in Xcode.
- Signing & Capabilities tab → Team = the existing GoodTunes Apple Developer team. Let Xcode auto-manage signing.
- App icon: drop the GoodTunes mark into `ios/App/App/Assets.xcassets/AppIcon.appiconset`. Use the brand `#00062B` bg.
- Splash: configured in `capacitor.config.ts` (`#00062B`, 1.2s). For the actual launch images, edit `ios/App/App/Assets.xcassets/Splash.imageset`.
  - **Source of truth:** the three splash PNGs (`splash-2732x2732.png`, `splash-2732x2732-1.png`, `splash-2732x2732-2.png`) are generated by compositing `client/public/goodtunes-logo-white.png` (the white GoodTunes wordmark) onto a 2732×2732 navy `#00062B` canvas. They must **never** be replaced with a solid-color asset — the Codemagic splash guard (`scripts/verify-ios-ipa-splash.py`) hard-fails the build if the compiled splash is detected as logo-free. To regenerate all three:
    ```bash
    magick -size 2732x2732 xc:'#00062B' \
      \( client/public/goodtunes-logo-white.png -resize 1600x \) \
      -gravity center -composite \
      ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
    cp ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png \
       ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
    cp ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png \
       ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
    ```
- Display name + version: set in Xcode → General. CFBundleShortVersionString = the marketing version; CFBundleVersion = monotonically-increasing build number.

### Android — application id, signing, icons

- Application id: `com.gogoods_mobile` (the immutable Google Play package for the kept listing). It's set directly in `android/app/build.gradle` (`defaultConfig.applicationId`) — NOT derived from `capacitor.config.ts` (whose `appId` is the iOS bundle id `Io.GoGoods.music`). The Gradle `namespace` stays `fm.goodtunes.player` (the Java package/`R` root), which is independent of `applicationId`. The matching upload/app-signing keystore must be used or Play will reject the upload.
- Open `android/` in Android Studio.
- Create or import the existing GoodTunes upload keystore (one-time). Store the keystore path + alias + passwords in `~/.gradle/gradle.properties` — **never** commit them.
- App icon: replace `android/app/src/main/res/mipmap-*/ic_launcher*.png` (and the adaptive icon files) with the GoodTunes mark.
- Splash: edit `android/app/src/main/res/drawable/splash.png` and `values/styles.xml` (`#00062B`).

> **⚠️ target API level — version bump done in-repo, build verification still pending.** Google Play requires **API level 35 (Android 15)** for new apps and updates since **31 Aug 2025**; a 34-target `.aab` is rejected at upload. The repo now ships the bump: `android/variables.gradle` pins `compileSdkVersion`/`targetSdkVersion = 35`, `android/build.gradle` carries **AGP 8.7.2**, and `gradle/wrapper/gradle-wrapper.properties` pins **Gradle 8.9** (API 35 wants AGP ≥ 8.6 + Gradle ≥ 8.7; AGP 8.7.x pairs with Gradle 8.9 and keeps the existing JDK 17 source/target). This **cannot be verified in the Replit container** (no Android SDK/Gradle) — on the Mac, run a clean `./gradlew :app:bundleRelease` and fix any AGP-version fallout before the first Play upload.

---

## Cutting a build (every release)

```bash
# from the repo root
npm run build           # rebuild web payload into dist/public
npx cap sync            # copy dist/public + plugins into ios/ and android/
```

### iOS → TestFlight

```bash
npx cap open ios        # opens Xcode
```

In Xcode:

1. Set the scheme to **App > Any iOS Device (arm64)**.
2. Bump the build number under General.
3. **Product → Archive**. Wait for the archive to complete.
4. The Organizer opens automatically. Click **Distribute App → App Store Connect → Upload**.
5. Pick the GoodTunes team + the auto-managed provisioning profile, click **Upload**.
6. App Store Connect processes the build (~10–20 min), then it appears under TestFlight → iOS Builds.
7. Add it to the internal testing group and (optionally) submit for external TestFlight review.

### Android → Play internal testing

```bash
npx cap open android    # opens Android Studio
```

In Android Studio:

1. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
2. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
3. Select the existing upload keystore, enter passwords (loaded from `gradle.properties`).
4. Build the release `.aab`. It lands in `android/app/release/`.
5. In **Play Console → GoodTunes app → Testing → Internal testing**, click **Create new release**, drop in the `.aab`, write release notes, **Review release → Roll out to internal testing**.
6. Testers on the internal list get the build within a few minutes via the Play Store app.

---

## Smoke test (every build, before sharing the testing link)

Walk this on a real iPhone and a real Android phone:

1. Sign in.
2. Browse to an artist → an album → tap play. Audio comes from the network.
3. Tap the download tick on a song. Wait for it to fill.
4. Tap the album-level download button to grab the rest.
5. **Put the phone in airplane mode.**
6. Reopen the album. Tap play. The song you downloaded plays end-to-end.
7. Open BottomNav: confirm Collection / Playlists / Account are present and **Chat is not visible**.
8. Open an instrument sheet (SuperCredits™). Confirm the chat bubble next to the vendor row is **not** rendered.

---

## Hardware-key download verification (device-only — can't run in the Replit container)

The secure-key store and compromised-device gate are native code (Swift Keychain in `ios/App/App/SecureKeyStorePlugin.swift`, Java AndroidKeyStore in `android/app/src/main/java/fm/goodtunes/player/SecureKeyStorePlugin.java`). Neither compiles or runs in the Linux container — only the web no-op contract is covered by automated tests (`client/src/lib/nativeDownloadsWebNoop.test.ts`). Run this pass on a **real iPhone and a real Android phone** (native build with downloads enabled) whenever the key store, `migrateToHardwareKey`, or the compromise gate changes.

1. **Key persists across launches.** Sign in, download a song, then force-quit and relaunch the app. Put the phone in airplane mode and play the downloaded song end-to-end. If the per-device key didn't survive the relaunch, decryption fails and playback falls back to (now-unavailable) streaming — so airplane-mode playback proves the Keychain/Keystore key persisted.
2. **Legacy download re-encrypts onto the hardware key once.** Install a *pre-hardware-key* build, download a song (encrypted under the legacy sandboxed-IndexedDB key), then upgrade in place to the current build. On next launch `migrateToHardwareKey` re-encrypts the existing file under the hardware key and retires the legacy key. Confirm the previously-downloaded song still plays offline, and that re-launching again doesn't re-migrate (the `gt:offline-hw-key-migrated:v1` flag is set). A song downloaded *after* the upgrade must also play offline.
3. **Compromised-device gate.** On a **stock** device, confirm downloads are *not* refused (the jailbreak/root probe must not false-positive) and downloaded songs play offline. On a **jailbroken (iOS) / rooted (Android)** test device, confirm the download is refused (the song row surfaces the "offline downloads are unavailable on this device" failure) and that playback instead streams online — never decrypts a protected file on the compromised device.

If any step fails, capture the device/OS version and the Xcode/Logcat console output — the native plugins `reject()` with a specific message on key-store failure, which the JS layer swallows into a software-key fallback, so the native log is the only place a key-store error is visible.

---

## Background audio + lock-screen controls (device-only — can't run in the Replit container)

Background playback and the lock-screen / Control Center transport are native code: the iOS `NowPlaying` Capacitor plugin (`ios/App/App/NowPlayingPlugin.swift`) drives `AVAudioSession` + `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`, and on Android the Chromium System WebView surfaces the web `navigator.mediaSession` as the media notification. Neither compiles or runs in the Linux container. What **is** covered here: the TS wiring (`client/src/lib/nativeNowPlaying.ts`, the media-session effects in `client/src/context/PlayerContext.tsx`) and the artwork-URL absolutization (`nativeNowPlaying.test.ts`). Behavior notes live in `.agents/memory/nowplaying-lockscreen-split.md`. Run this pass on a **real iPhone and a real Android phone** whenever the plugin, the JS bridge, or the PlayerContext media-session effects change.

1. **iPhone — audio survives lock/background.** Play an album, lock the phone (and separately, swipe to the home screen). Audio keeps playing. If it cuts out on lock, the `AVAudioSession .playback` category isn't sticking — WKWebView can reset it, which is why the plugin re-applies it on `setMetadata`/`setPlaybackState` (`configureAudioSession()`); capture whether it dies immediately or after a delay.
2. **iPhone — lock screen shows the right metadata + art.** With the screen locked, confirm the album **artwork**, song title, and artist all show. Artwork is the fragile one: it's fetched by a native `URLSession` outside the WebView, so the URL must be absolute — the app now absolutizes app-relative art (`/objects/…`, `/figmaAssets/…`) against the WebView origin before it crosses the bridge. If art is missing, note the exact art URL and whether it's an `/objects/` (object-storage) or `/figmaAssets/` (bundled) path.
3. **iPhone — transport is bidirectional + the scrubber tracks.** From the lock screen: play/pause, next, previous, and drag the scrubber. Each must move the in-app player, and changing the track/position **in-app** must update the lock screen within ~1s (native position pushes are throttled to whole-second granularity). Confirm play/pause state stays in sync both directions (no "playing" pill while paused).
4. **Android — media notification + background audio.** Play an album, lower the notification shade: a media-style notification shows the same artwork/title/artist with working play/pause + next/previous, and audio keeps playing when the app is backgrounded. There is **no** Android native plugin — this all comes from the system WebView surfacing `navigator.mediaSession`, so if the notification is missing, it's a WebView/MediaSession issue, not a plugin bug.

File any gaps as follow-up tasks with the device/OS version — known suspects: WKWebView resetting the audio session on interruption (a phone call), object-storage artwork 401ing the unauthenticated native fetch, and the Android WebView dropping the notification on some OEM skins.

---

## In-car verification — CarPlay (iOS only; device-only — can't run in the Replit container)

> **Status (2026-07-14): code-complete (third pass + cold-connect browse + cold-connect tap-to-play); gated out of distribution builds by default; on-hardware pass still outstanding.** Cold-connect browse was added on 2026-07-10: the CarPlay scene now persists a compact snapshot of the fan's owned catalog / recents / last Now Playing track to disk (`NowPlayingStore`) and hydrates it on `didConnect`, so connecting with the phone app fully quit shows real last-known content and the real last track (never the "open the app" placeholder or the GoodTunes logo), with a bounded connect→resync retry that swaps in fresh data when the web player later comes up. Sign-out wipes the snapshot. **Cold-connect tap-to-play was implemented 2026-07-14** (manifest-free): `didConnect` also boots the web player headless (`HeadlessWebPlayer` in `MainViewController.swift` — no scene-manifest change), taps landing during the boot are buffered (`NowPlayingStore.pendingIntent` → drained by `NowPlayingPlugin.load()` → retained `notifyListeners` with a 2-minute JS staleness guard), a headless boot defers `AVAudioSession.setActive` until the first play intent so connecting the car never interrupts another app's audio, and a `setHeadlessBringUp` kill switch is persisted from JS on every boot (flip `HEADLESS_BRINGUP_ENABLED` in `nativeNowPlaying.ts` + web-publish to disable without a rebuild). See `docs/roadmap.md` "CarPlay cold-connect tap-to-play" for the design. **Until the on-device pass below is recorded, treat tap-to-play as unverified** — it needs a fresh `ios-testflight` build (the Swift half is not in any existing binary). The CarPlay wiring — `SceneDelegate.swift` + `CarPlaySceneDelegate.swift`, the `Info.plist` scene manifest (both scene roles, fully declarative), the `com.apple.developer.carplay-audio` entitlement, and the JS bridge (`PlayerContext.tsx` → `nativeNowPlaying.ts` → `NowPlayingPlugin`/`NowPlayingStore`) — is committed and reviewed end-to-end. This is the **third** implementation attempt; the first two black-screened the store-signed binary on real iPhones (see `.agents/memory/ios-scene-manifest-black-screen.md`) and were fully ripped out. This pass applies the lessons from both: the manifest is fully declarative (no `configurationForConnecting` override), `SceneDelegate` mirrors its window into `AppDelegate.window`, and — new this time — `codemagic.yaml`'s "Gate CarPlay out of the distribution archive" step strips **both** the entitlement and the whole scene-manifest key from every distribution build unless `CARPLAY_GRANTED=true`, so an unverified build can no longer reach TestFlight/App Store with the risky code path live. The `com.apple.developer.carplay-audio` managed entitlement was approved by Apple on 2026-07-07 — see **operator checklist below** for the two remaining portal steps (tick capability on App ID + delete stale profile). Once those are done, `CARPLAY_GRANTED=true` still must NOT be set until a CarPlay Simulator/real-device pass has actually run (**cannot run in the Replit container or in CI** — no Xcode, no head unit), so it is deferred to an operator with a CarPlay unit (or the Xcode CarPlay simulator). **When that pass is run, record its dated result here** — device + head-unit (or simulator) versions and pass/fail per checklist item — so this section becomes the verification record, not just the procedure.

CarPlay is native code that cannot be compiled or exercised in the Linux container (no Xcode, no head unit). The wiring is reviewed in-repo — the web player publishes metadata/state/queue and handles the `playIndex` command (`client/src/context/PlayerContext.tsx` → `client/src/lib/nativeNowPlaying.ts`), and iOS renders it through `CarPlaySceneDelegate` + `NowPlayingStore` + `NowPlayingPlugin` (all three registered in the Xcode target). Metadata rendering, transport, the browse list, and lock-step behaviour can only be confirmed on real hardware. Run this pass on a **CarPlay unit or the Xcode CarPlay simulator** whenever `PlayerContext`'s now-playing block, `nativeNowPlaying.ts`, or any of the CarPlay native files change.

### iOS — CarPlay

CarPlay needs the `com.apple.developer.carplay-audio` entitlement (`ios/App/App/App.entitlements`, committed) **enabled on the App ID / provisioning profile**. Apple grants this as a managed capability. **The capability was approved by Apple on 2026-07-07** (email to admin@gogoods.io confirmed). Two operator steps remain before a distribution build signs cleanly:

1. **Tick the capability on the App ID.** Developer portal → **Certificates, IDs & Profiles → Identifiers → `Io.GoGoods.music`** → the **CarPlay** capability now appears in the list → tick it → **Save**.
2. **Delete stale App Store profiles.** Portal → **Profiles** → delete any App Store profiles for `Io.GoGoods.music`. The Codemagic `--create` step will mint a fresh profile that includes CarPlay. (A cached profile minted before the grant will keep failing signing if you skip this.)
3. **Set `CARPLAY_GRANTED=true`** in Codemagic's `apple_app` group. Until this is set, `codemagic.yaml`'s gate step strips the entitlement and the `Info.plist` scene manifest from every distribution build, so TestFlight/App Store builds keep signing and shipping on the known-good legacy lifecycle regardless of portal state.
4. **Run the on-device / CarPlay Simulator verification pass below FIRST**, then run a distribution build (`ios-testflight` or `ios-appstore-submit`). It should sign successfully with the entitlement and manifest intact.

On a development profile you can test on a device/simulator at any time without waiting for these steps — dev/simulator builds never run the Codemagic gate, so CarPlay is always live there. A distribution (App Store / TestFlight) build requires all of the above, in order.

1. **Connect.** Run the app on a device wired to a CarPlay head unit, or use Xcode → the CarPlay simulator (**I/O → External Displays → CarPlay** in the Simulator, or the CarPlay window when running on a device). GoodTunes appears with a two-tab layout: **Now Playing** + **Up Next**.
2. **Metadata + artwork.** Start a song in the phone app, then look at CarPlay's Now Playing tab: title, artist, album, and album artwork all show. Artwork arrives a beat after the text (it's fetched async) — that's expected.
3. **Transport + scrubber.** From the car: play/pause, next, previous, and dragging the scrubber all drive the phone player. Confirm the car scrubber tracks real elapsed time while playing (it interpolates between updates, so it should advance smoothly, not jump).
4. **Up Next browse list.** The Up Next tab lists the current queue; the now-playing row is marked as playing. **Tap a different row** — the phone player jumps to that track (this is the `playIndex` → `playQueueIndex` path) and the car's now-playing updates to match.
5. **Both directions.** Change the track *in the phone app* (next/prev or tap a song) and confirm CarPlay's Now Playing + Up Next both update; then drive a change *from the car* and confirm the phone player mirrors it. They must stay in lock-step.
6. **Cold connect (the key case).** Fully quit GoodTunes on the phone (swipe it out of the app switcher so no scene is running), then connect to the head unit *without* opening the app first. **Home / Collection / Recents must render the last-known real content immediately** (owned albums, artists/songs, recents — never an "open the app" placeholder), and **Now Playing must show the last track's real title/artist/album art** (never the GoodTunes logo). This is served from the on-device snapshot (`NowPlayingStore.hydrateFromDisk()` on `didConnect`), so it works with no phone interaction and no network. Also verify **sign-out wipes the snapshot**: sign out on the phone, cold-connect again, and confirm the previous fan's library/track is gone (neutral empty rows only).
7. **Cold-connect tap-to-play (new 2026-07-14 — the Apple-review case).** Still from a true cold connect (phone app fully quit, phone locked in your pocket): **tap an album's Play row (or a track) in the car.** Audio must start within ~10–20 seconds (the headless web player has to boot, sign in from the stored session, and fetch the library — a spinner-free silent gap is expected; the tap is buffered, not lost). Verify all three tap kinds: an album Play/Shuffle row, a specific track, and a playlist. **Also tap a row in the Up Next tab from cold** — this is a known-weaker path (the `playIndex` command has no JS-side replay stash, so a tap landing before the queue rehydrates may silently no-op; record the result either way). Then:
   - **No-tap etiquette:** cold-connect while **Spotify/another app is playing** and *don't* tap anything — the other app's audio must keep playing uninterrupted (the headless boot defers audio-session activation until a real play intent).
   - **Phone adoption:** after cold tap-to-play is playing, unlock the phone and open GoodTunes — the app must come up showing the same playing track (the phone window adopts the headless player; no second player, no double audio).
   - **Stale-tap guard:** cold-connect somewhere with **no network**, tap an album (nothing can play), disconnect, and open the phone app on network more than 2 minutes later — playback must NOT burst out unprompted (the retained tap is dropped as stale).
   - If bring-up misbehaves in the field, the kill switch is `HEADLESS_BRINGUP_ENABLED` in `client/src/lib/nativeNowPlaying.ts` — set `false` + web-publish; the next cold connect skips the headless boot entirely (browse/metadata still work).
8. **Sign-out mid-playback → cold connect (privacy edge).** Start a track, then sign out on the phone *without* pausing (leave audio to auto-advance a track or two), fully quit, and cold-connect. The car must show **empty** library/recents/Now Playing — never the signed-out fan's track. (Guards the post-logout re-persist path: `saveSnapshot` stays suppressed after `clearSnapshot` until a fresh re-login catalog publish.)
9. **Paused warm connect (resync edge).** With a track **paused** in the phone app (app already opened this session), connect to the head unit. Now Playing must show the real track at its **real paused position/state**, not the hydrated 0:00 presentation. (Guards the resync fix: attempt-0 resync fires unconditionally even though `hydrateFromDisk` already filled the catalog.)

### Off-car regression

With **no** CarPlay connected, confirm the baseline is unchanged: audio keeps playing with the screen locked / app backgrounded, and the lock screen shows the current track with working transport. The CarPlay code must not have regressed the everyday lock-screen path.

If any step fails, capture the device/OS + head-unit (or simulator) versions and the Xcode console output. The JS bridge swallows plugin errors into no-ops (so an older native binary degrades gracefully), which means the native log is the only place a wiring failure is visible.

---

## What is intentionally **not** in v1

- Push notifications, deep links, in-app purchases, native chat — all deferred (see `docs/roadmap.md`).
- Submitting for public review. We stop at TestFlight + Play internal testing. Store listings, screenshots, and review submission are a follow-up once Nick has hands on the builds.
- A real React Native rewrite. The roadmap entry stays open; Capacitor is the bridge until that's worth doing.
