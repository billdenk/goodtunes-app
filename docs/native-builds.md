# Native builds — iOS (TestFlight) + Android (Play internal testing)

> **Day-to-day, builds run in the cloud — no Mac required.** [`codemagic-builds.md`](./codemagic-builds.md) is the operator cheat-sheet: Codemagic builds + signs on cloud Macs, ships to TestFlight, and has a one-button App Store submit. The Xcode/Android-Studio steps below are now the **manual fallback** (if Codemagic is down) and the reference for how the native projects are wired.

The GoodTunes native apps are **Capacitor wrappers** around the same React + Vite app that ships at `goodtunes.app`. There is no separate codebase. One change-set updates web, iOS, and Android together; the only difference is which surfaces are visible (see `client/src/lib/platform.ts`).

Product rules baked into the platform layer:

- **Chat** — web-only for v1. Hidden from BottomNav on native; every "Chat with vendor" CTA is gated; `/chat` deep links bounce to `/collection`.
- **Downloads** — native only. The web "download" tick is a localStorage flag (no real file). On native the audio bytes are fetched and written to `Documents/goodtunes/songs/<songId>.<ext>` via the Capacitor Filesystem plugin, and `PlayerContext` prefers the on-device file over the network URL so albums play in airplane mode.

- **Volume** — on iOS *web* the player's volume slider is hidden because Mobile Safari makes audio volume read-only (the hardware buttons own loudness). In the native iOS shell a small Capacitor plugin (`ios/App/App/SystemVolumePlugin.swift`, JS wrapper `client/src/lib/nativeVolume.ts`) reads/writes the device's hardware volume via MPVolumeView + AVAudioSession, so the slider is shown there and mirrors the system volume. The plugin is an **in-tree native file** committed to `ios/App` — it is *not* an npm package, so `cap sync` won't add or remove it; if you ever re-scaffold `ios/`, re-add the Swift file to the Xcode target.

Everything is wired through `client/src/lib/platform.ts` (booleans — `isNativeIOS` / `isWebIOS` gate the volume slider), `client/src/lib/nativeDownloads.ts` (storage), and `client/src/lib/nativeVolume.ts` (system volume). Don't sprinkle `Capacitor.isNativePlatform()` calls around the app — extend those files.

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
- Display name + version: set in Xcode → General. CFBundleShortVersionString = the marketing version; CFBundleVersion = monotonically-increasing build number.

### Android — application id, signing, icons

- Application id: `fm.goodtunes.player` (Capacitor copies it from `capacitor.config.ts` into `android/app/build.gradle`).
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

## What is intentionally **not** in v1

- Push notifications, deep links, in-app purchases, native chat — all deferred (see `docs/roadmap.md`).
- Submitting for public review. We stop at TestFlight + Play internal testing. Store listings, screenshots, and review submission are a follow-up once Nick has hands on the builds.
- A real React Native rewrite. The roadmap entry stays open; Capacitor is the bridge until that's worth doing.
