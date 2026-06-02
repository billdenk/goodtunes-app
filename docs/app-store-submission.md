# App Store + Play Store submission checklist

One-page runbook for getting the GoodTunes Capacitor build into **TestFlight** and **Play Internal Testing**, then through public review when we're ready.

For the build-time mechanics (Xcode archive, Android Studio bundle, signing) see [`native-builds.md`](./native-builds.md). This doc is the reviewer-facing side: privacy labels, demo accounts, review notes, and the gotchas that have historically caused app rejections.

---

## App identity

| Field | Value | Notes |
|---|---|---|
| App name | **GoodTunes** | Reserved on App Store Connect and Play Console |
| Bundle id (iOS) / Application id (Android) | `fm.goodtunes.player` | Set in `capacitor.config.ts` — do not change after first submission |
| Marketing version | matches the web build (`package.json`) | Bump for every TestFlight / Internal Testing release |
| Build number (iOS `CFBundleVersion` / Android `versionCode`) | monotonically-increasing integer | Apple + Google both reject duplicates |
| Category | **Music** | Primary on both stores |
| Age rating | **12+** (iOS) / **Teen** (Play) | Driven by user-generated content (chat is web-only, but lyrics can be explicit; some albums carry the explicit badge) |
| Content rights | Music + cover art is licensed from the artists / labels on the platform | We can prove this from the per-album admin contract record |

---

## Demo account (mandatory for review)

App Review will not approve an app that gates content behind login unless they can sign in. We supply a real-but-throwaway demo account on the customer shell:

- Email: `appreview@goodtunes.music`
- Password: rotated per submission, written into the **App Review Information → Sign-In Required** field, never committed to the repo or sent over email outside of App Store Connect / Play Console.
- The account owns one published album end-to-end (the **GoodTunes Sampler** — a 3-track EP) so the reviewer can: play it, scrub it, open lyrics, open credits, tap through to a Person sheet and an Instrument sheet. The three tracks are *When The World Stops*, *Made for Us*, and *Never Break My Heart (Not Again)* — each backed by a real Mux master with lyrics (tracks 2 & 3 are time-synced), per-track writer/performer credits, a linked **Person** (GoodTunes Sampler) and a linked **Instrument** (Martin D-28 Acoustic Guitar).
- Ownership is a real `user_albums` grant (no purchase), so the album lands in **Library** and plays full-length with **no Buy or Chat surfaces** anywhere in the flow.

### How the account is provisioned

The account, the Sampler album, its tracks, credits, Person, and Instrument are all seeded idempotently by `scripts/post-merge.sh` (`seed_task_939_appreview_demo`), which runs against **both** the dev and prod databases on every merge. It is ID-preserving and `ON CONFLICT (id) DO NOTHING`, so re-running never clobbers operator edits, and the songs are copied with `INSERT…SELECT` from static-seed source rows so each environment inherits its own valid Mux ids. The committed password value is a **scrypt hash**, never the plaintext.

Rotating the password before a submission: ask the operator (Bill) to set a new password on the account via the admin reset flow, surface the new plaintext only into the App Review form, and update the App Review form. (Re-running post-merge will not overwrite an operator-rotated password.) Do **not** reuse the password across iOS + Android — different review pools.

---

## Reviewer notes (paste into both stores verbatim)

> GoodTunes is a fan-first music player. Purchases happen on the web at `https://goodtunes.music`, not inside the app — the iOS build intentionally hides every Buy button (App Store guideline 3.1.1). To verify playback, sign in with the demo account above and tap any song on the **GoodTunes Sampler** album in Library. The web-only Chat tab is also hidden in the native shell.

Including this verbatim has historically pre-empted the "we cannot find the in-app purchase flow" rejection that hits music apps that sell on the web.

---

## App Store Connect — Privacy Nutrition Labels

These match what GoodTunes actually collects today. Re-confirm before each submission:

| Data type | Collected? | Linked to user? | Used to track? | Purpose |
|---|---|---|---|---|
| **Email address** | Yes | Yes | No | Account, customer support, transactional mail (purchase receipts, password reset) |
| **Name** | Yes (display name) | Yes | No | Account personalization, GoodDeed certificate |
| **Purchases** | Yes | Yes | No | App functionality — fans need to see what they own |
| **Audio data** (listening history per song) | Yes | Yes | No | Analytics + artist insights (`/api/events`, PostHog) — see `docs/analytics.md` |
| **Device id / advertising id** | **No** | — | — | We don't use IDFA. ATT prompt is NOT included in the manifest — adding it without using it is a separate rejection trigger. |
| **Crash data** | No (today) | — | — | If we add Sentry/Crashlytics later, add a row here and bump the version. |
| **Location** | No | — | — | Geo enrichment in analytics is IP-derived server-side; we do not request the iOS Location permission. |

Track-this-user: **No** on every row. We do not share data with third parties for cross-app/site tracking; PostHog is configured as first-party analytics only.

## Google Play — Data safety form

Mirror the labels above. Play also asks:
- **Data encrypted in transit?** Yes (TLS to `goodtunes.music`).
- **Can users request deletion?** Yes — Account → Delete account (`DELETE /api/customer/me`).
- **Independent security review?** No (mark accordingly; no false claim).

---

## Permissions / capabilities matrix

| Capability | iOS | Android | Reason it's enabled (or why it isn't) |
|---|---|---|---|
| Background audio | **Yes** | **Yes** | Required so playback continues with the screen off |
| Push entitlement | **Yes** (declared) | **Yes** (declared) | Capability enabled in Xcode + `AndroidManifest.xml` so we don't have to re-submit when payloads ship — **no payloads are sent yet** |
| Sign-in with Apple | **Yes** | n/a | Capacitor `@capacitor-community/apple-sign-in` plugin gives the native sheet on iOS; Google Sign-In on Android uses the existing web OAuth flow inside the WebView |
| Universal links / App Links | **Yes** | **Yes** | `applinks:goodtunes.music` (iOS) + intent-filter on `https://goodtunes.music/*` (Android) — see "Deep links" below |
| ATT (App Tracking Transparency) | **NOT declared** | n/a | We don't track across apps. Declaring it without using it is a guideline 5.1.2 rejection trigger. |
| In-app purchase / StoreKit | **NOT declared** | n/a | All purchases happen on the web. See the reviewer note above. |
| Filesystem (Capacitor) | n/a | n/a | Plugin-level only — no extra permission needed for app-private `Documents/` writes |
| Microphone / Camera / Contacts / Location | **NOT declared** | **NOT declared** | We don't use any of them; declaring is a rejection trigger |

---

## Deep links — Universal Links (iOS) + App Links (Android)

We want a fan tapping `https://goodtunes.music/album/xyz` on a phone with the app installed to land on the album page inside the app, not Safari/Chrome.

**iOS** — Apple's Associated Domains (already wired):
1. The entitlements file at `ios/App/App/App.entitlements` declares `applinks:goodtunes.music` + `applinks:my.goodtunes.music` and is wired into both Debug and Release build settings (`CODE_SIGN_ENTITLEMENTS = App/App.entitlements`).
2. The server serves the AASA file at `https://goodtunes.music/.well-known/apple-app-site-association`. The committed file at `public/.well-known/apple-app-site-association` carries a `REPLACE_WITH_TEAM_ID` sentinel; the route in `server/routes.ts` substitutes the real Team ID from the **`APPLE_TEAM_ID`** environment variable at request time. **Set `APPLE_TEAM_ID` in the production env before the first device test** — without it the route returns a clear 503 instead of a broken file. Until then, the file path is reserved but unverifiable.
3. Paths handled: every path on `goodtunes.music` (the AASA components entry is `/*`). The web SPA router already handles unknown paths, so handing the whole namespace to the app keeps fans in-app on any deep link.

**Android** — App Links via `assetlinks.json` (already wired):
1. `android/app/src/main/AndroidManifest.xml` has an `<intent-filter android:autoVerify="true">` matching every path on `https://goodtunes.music` and `https://my.goodtunes.music` on the main Activity (`<data android:pathPattern="/.*" />`).
2. The server serves `assetlinks.json` at `https://goodtunes.music/.well-known/assetlinks.json`. The committed file at `public/.well-known/assetlinks.json` carries a `REPLACE_WITH_UPLOAD_KEYSTORE_SHA256_FINGERPRINT` sentinel; the route substitutes the real fingerprint from the **`ANDROID_RELEASE_SHA256`** environment variable. Get the fingerprint with `keytool -list -v -keystore <upload.keystore>` and paste the SHA-256 line into the env var (colons in, no quotes).

After `APPLE_TEAM_ID` + `ANDROID_RELEASE_SHA256` are set in prod, run Apple's `swcutil verify -d goodtunes.music` and Google's [Statement List Tester](https://developers.google.com/digital-asset-links/tools/generator) on a real install to confirm both stores see the association before submitting.

### Push entitlement

The iOS entitlements file declares `aps-environment = development` (Xcode auto-swaps to `production` on Archive). The Android manifest declares `android.permission.POST_NOTIFICATIONS` so the user gets prompted once on first launch (Android 13+). Both are wired now so the binary asks for the right provisioning at install time — **no payloads are sent yet**; the FCM / APNs wiring is a follow-up task.

---

## Screenshots (placeholders are OK for the first submission)

Required sizes — pull the canonical list from App Store Connect / Play Console when they update; today:

- **iOS** — 6.7" (1290×2796), 6.5" (1284×2778), 5.5" (1242×2208). Three sizes, four shots each minimum.
- **Android** — 1080×1920 (phone) × four shots minimum; 7" + 10" tablet optional.

For the first submission, a clean simulator capture of the Library tab, an album page, the player with lyrics open, and an instrument sheet is enough — App Review approves with placeholders. Real marketing screenshots are a follow-up Nick owns.

---

## Submission flow

1. **Build** — see `docs/native-builds.md` (`npm run build && npx cap sync`, then archive in Xcode / generate signed bundle in Android Studio).
2. **Upload** —
   - iOS: Xcode Organizer → Distribute App → App Store Connect → Upload. Wait ~15min for processing.
   - Android: Play Console → Internal Testing → Create new release → upload `.aab` → Review release.
3. **Fill the App Review form / Data safety form** with the values in this doc.
4. **Add the demo account** and the reviewer note above.
5. **Submit for review** —
   - TestFlight internal testers: instant; TestFlight external: ~24h review.
   - Play internal testing: instant; closed/open testing or production: 1–7 days.
6. **Watch for rejection email** — historically these have been:
   - "We could not find the in-app purchase flow" → reviewer note explains it.
   - "ATT prompt not implemented" → don't declare ATT until we actually track.
   - "Login required without demo account" → demo account above.

---

## Rotation cadence

- **Per release**: bump build number, run the smoke test in `docs/native-builds.md`, upload, update release notes (one line per shipped capability — pull from `docs/capabilities.md`).
- **Per quarter**: rotate the demo-account password, re-verify the AASA + assetlinks.json files, re-confirm the privacy nutrition labels still match what we collect.
- **Whenever a new tracker / SDK lands**: update the privacy labels in the same PR as the SDK. The cookie/consent rules in `docs/roadmap.md § Cookie / tracker consent banner` apply on web in parallel.
