# App Store + Play Store submission checklist

One-page runbook for getting the GoodTunes Capacitor build into **TestFlight** and **Play Internal Testing**, then through public review when we're ready.

For the build-time mechanics (Xcode archive, Android Studio bundle, signing) see [`native-builds.md`](./native-builds.md). This doc is the reviewer-facing side: privacy labels, demo accounts, review notes, and the gotchas that have historically caused app rejections.

---

## App identity

| Field | Value | Notes |
|---|---|---|
| App name | **GoodTunes** | Reserved on App Store Connect and Play Console |
| Bundle id (iOS) | `Io.GoGoods.music` | Matches the existing App Store Connect app (Apple ID `6448246869`); set in `capacitor.config.ts` + the Xcode project — Apple does not allow changing it |
| Application id (Android) | `com.gogoods_mobile` | Overridden in `android/app/build.gradle` so this build **updates the pre-existing Play listing** (`com.gogoods_mobile`, ~100 installs + reviews) instead of creating a new one. Deliberately differs from the iOS bundle id (`Io.GoGoods.music`) and from the Android `namespace` (`fm.goodtunes.player`) — the two stores don't need matching ids. Locked once uploaded; do not change. |
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
- **Can users request deletion?** Yes — in-app at **Account → Privacy → Delete My Account**, which calls `DELETE /api/customer/me` (`requireCustomer`). The endpoint anonymizes the fan row in place (scrubs every PII column, nulls the password, drops all OAuth identities, revokes every bearer token, wipes favorites/playlists/library) and tears down the session; orders are retained for legal/accounting records. Play also wants a *public* deletion URL on the store listing — this is now shipped at **`goodtunes.music/delete-account`** (`client/src/pages/DeleteAccount.tsx`), a public page documenting the in-app path, what's removed vs. retained, and a support-email fallback. Paste that URL into the Data safety form's deletion-URL field at submission.
- **Independent security review?** No (mark accordingly; no false claim).

---

## Permissions / capabilities matrix

| Capability | iOS | Android | Reason it's enabled (or why it isn't) |
|---|---|---|---|
| Background audio | **Yes** | **Yes** | Required so playback continues with the screen off |
| Push entitlement | **Yes** (declared) | **Yes** (declared) | Capability enabled in Xcode + `AndroidManifest.xml` so we don't have to re-submit when payloads ship — **no payloads are sent yet** |
| Sign-in with Apple | **Yes** | n/a | Capacitor `@capacitor-community/apple-sign-in` plugin gives the native sheet on iOS; Google Sign-In on Android uses the existing web OAuth flow inside the WebView |
| Universal links / App Links | **Yes** | **Yes** | `applinks:my.goodtunes.music` (iOS) + intent-filter on `https://my.goodtunes.music/*` (Android) — see "Deep links" below. The bare `goodtunes.music` apex is intentionally **not** claimed (it's the Webflow marketing site). |
| ATT (App Tracking Transparency) | **NOT declared** | n/a | We don't track across apps. Declaring it without using it is a guideline 5.1.2 rejection trigger. |
| In-app purchase / StoreKit | **NOT declared** | n/a | All purchases happen on the web. See the reviewer note above. |
| Filesystem (Capacitor) | n/a | n/a | Plugin-level only — no extra permission needed for app-private `Documents/` writes |
| Microphone / Camera / Contacts / Location | **NOT declared** | **NOT declared** | We don't use any of them; declaring is a rejection trigger |

---

## Deep links — Universal Links (iOS) + App Links (Android)

We want a fan tapping a `https://my.goodtunes.music/album/xyz` link on a phone with the app installed to land on the album page inside the app, not Safari/Chrome.

> **Why the app only claims `my.goodtunes.music`, not the bare `goodtunes.music` apex.** The bare apex `goodtunes.music` is the **Webflow marketing site** (served via Cloudflare — confirmed by `x-wf-region` / Webflow surrogate-key response headers), *not* this Replit deployment. It can't serve our `/.well-known/apple-app-site-association` or `assetlinks.json` (those paths 404 on Webflow), so claiming the apex in the app could only ever produce a **permanent verification failure**. Fan-shareable content links live on the app subdomains (`my.goodtunes.music`, `get.goodtunes.music/<slug>`), never on the marketing homepage, so dropping the apex claim costs nothing. (Decision: keep Webflow untouched, verify only on the app subdomain. If we ever *do* need the bare apex to open the app, the apex would have to either move off Webflow onto this deployment or proxy just the two `/.well-known/` files through the domain's own Cloudflare — Apple/Google don't follow redirects for these files, so a 301 won't do.)

**iOS** — Apple's Associated Domains (already wired):
1. The entitlements file at `ios/App/App/App.entitlements` declares `applinks:my.goodtunes.music` and is wired into both Debug and Release build settings (`CODE_SIGN_ENTITLEMENTS = App/App.entitlements`).
2. The server serves the AASA file at `https://my.goodtunes.music/.well-known/apple-app-site-association`. The committed file at `public/.well-known/apple-app-site-association` carries a `REPLACE_WITH_TEAM_ID` sentinel; the route in `server/routes.ts` substitutes the real Team ID from the **`APPLE_TEAM_ID`** environment variable at request time. ✅ **`APPLE_TEAM_ID` is set** (global Replit secret), so the route serves valid JSON (`appIDs: ["<TeamID>.Io.GoGoods.music"]`, `application/json`, 200) on every host that reaches the deployment — verified live on `my.goodtunes.music`.
3. Paths handled: every path on `my.goodtunes.music` (the AASA components entry is `/*`). The web SPA router already handles unknown paths, so handing the whole namespace to the app keeps fans in-app on any deep link.

**Android** — App Links via `assetlinks.json` (already wired):
1. `android/app/src/main/AndroidManifest.xml` has an `<intent-filter android:autoVerify="true">` matching every path on `https://my.goodtunes.music` on the main Activity (`<data android:pathPattern="/.*" />`).
2. The server serves `assetlinks.json` at `https://my.goodtunes.music/.well-known/assetlinks.json`. The committed file at `public/.well-known/assetlinks.json` declares `package_name: com.gogoods_mobile` and carries the **real, public app-signing-key SHA-256** for that listing (`8B:F3:50:…:CF:4B`) directly — no sentinel, no env var needed. The fingerprint is public (it's served right here), and with Play App Signing on for `com.gogoods_mobile` it is Google's **app-signing key** certificate (Play Console → **Test and release → App integrity → App signing key certificate**), the key that signs what users actually download — *not* the upload key. The route still substitutes **`ANDROID_RELEASE_SHA256`** if a sentinel is ever re-introduced (a dormant key-rotation override), but in the normal case it serves the committed value as-is (200).

### Deep-link prerequisites — current state

`apple-app-site-association` is served live with the real Team ID on the canonical hosts — `https://my.goodtunes.music` and `https://admin.goodtunes.music` both return it (200, `application/json`, real Team ID, no sentinel). No further server action needed on the iOS side.

`assetlinks.json` now declares the kept Play listing `package_name: com.gogoods_mobile` and a **committed, public app-signing-key SHA-256** (no env var needed; the dev deployment serves it 200/valid). ⚠️ **Production must be republished** before this takes effect — the running production build still serves the *previous* `assetlinks.json` (old package + old env-var SHA) until a redeploy. So Android App Links will not verify for the `com.gogoods_mobile` app until **both**: (a) production is republished so the new file is served on `my.goodtunes.music`, **and** (b) a fresh signed `.aab` carrying applicationId `com.gogoods_mobile` is installed. Confirm with Google's Statement List Tester on a real install (operator step below).

**Decision (Bill, confirmed): claim only `my.goodtunes.music`, leave the apex alone.** The original plan was to attach the bare `goodtunes.music` apex as a custom domain on this deployment so the apex would serve the association files. We investigated and found the apex is already in use as the **Webflow marketing homepage** (the apex A record in Route 53 points at Webflow, served via Cloudflare; `https://goodtunes.music/` returns Webflow HTML and `https://goodtunes.music/.well-known/...` returns a Webflow 404). Re-pointing the apex to this deployment would replace the marketing site, and fans never tap bare-apex content links anyway (shareable links live on `my.`/`get.`). So instead of attaching the apex, we **removed the bare-apex claim from the app** and verify only on `my.goodtunes.music`, which already points here and serves both files. No deployment custom-domain change is needed, and the Webflow site is untouched.

What this means for verification:
- iOS entitlements and the Android manifest now declare **only** `my.goodtunes.music` (the bare `goodtunes.music` was removed from both). This change ships in the **next signed build via Codemagic** — the currently-installed/old builds still claim the apex until a new build is cut.
- `https://my.goodtunes.music/.well-known/apple-app-site-association` and `https://my.goodtunes.music/.well-known/assetlinks.json` already return 200 with real values in production (verified live), so once the new build is installed there is nothing further to attach or republish on the server side.

**Operator steps (after a new Codemagic build is installed):**

1. Cut a fresh signed build through Codemagic so the new (apex-free) entitlements + manifest ship.
2. Run Apple's `swcutil verify -d my.goodtunes.music` and Google's [Statement List Tester](https://developers.google.com/digital-asset-links/tools/generator) for `my.goodtunes.music` on a real install to confirm both stores see the association before submitting. (No signed build / device was available in this environment, so these two verifier runs are the operator's last pre-upload check.)

> **Package-name check before the Android build verifies:** `assetlinks.json` declares `package_name: com.gogoods_mobile` (matching the `applicationId` override in `android/app/build.gradle` and the kept Play listing). This is the legacy Play package we keep so the new build updates the existing listing in place; confirm the `.aab` you upload uses that same applicationId. The Android `namespace` stays `fm.goodtunes.player` and the iOS bundle id is `Io.GoGoods.music` — only the Android `applicationId` is `com.gogoods_mobile`. The `ANDROID_RELEASE_SHA256` secret must hold the **app-signing key SHA-256 of the `com.gogoods_mobile` listing** (from Play Console → App integrity), not a fresh key — otherwise App Links won't verify.

> **If you ever want bare `goodtunes.music/...` links to open the app:** the apex would have to either move off Webflow onto this deployment (replacing the marketing homepage) or proxy just the two `/.well-known/` files through the domain's own Cloudflare/edge (Apple and Google do **not** follow redirects when fetching these files, so a 301 to `my.` won't work — it must be a same-URL 200). `server/auth/host.ts` already exempts `/.well-known/*` from the apex→`my.` 301 and the routes are host-agnostic, so the app side is ready if that ever happens — only the apex's DNS/edge ownership stands in the way.

### Push entitlement

The iOS entitlements file declares `aps-environment = development` (Xcode auto-swaps to `production` on Archive). The Android manifest declares `android.permission.POST_NOTIFICATIONS` so the user gets prompted once on first launch (Android 13+).

End-to-end push is now wired (Task #1338):

- **Client.** The `@capacitor/push-notifications` plugin is installed. On native launch, once a fan is signed in, `client/src/lib/pushNotifications.ts` requests permission, registers with the OS, and POSTs the resulting APNs (iOS) / FCM (Android) device token to `/api/push/register`. `ios/App/App/AppDelegate.swift` forwards the APNs registration callbacks into the Capacitor plugin so the JS `register()` resolves a token.
- **Server.** Tokens persist in `push_devices` (one row per fan × device, keyed on the unique token, soft-deleted when invalid). `server/push.ts` delivers via APNs HTTP/2 (ES256 JWT) for iOS and FCM HTTP v1 for Android, and the admin "mark shipped" action fires an `order_shipped` alert end-to-end.
- **Credential-gated, inert without keys** (same pattern as opsAlert / Sentry / Resend). With no provider secrets set, every send is a no-op that logs one `[push:dry-run]` line — so the wiring is verifiable without an Apple/Google account. To actually deliver, set the operator secrets: **APNs** — `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID` (optional `APNS_BUNDLE_ID`, default `Io.GoGoods.music`; `APNS_PRODUCTION=0` for sandbox); **FCM** — `FCM_SERVICE_ACCOUNT_JSON` (optional `FCM_PROJECT_ID`). Android delivery additionally needs `google-services.json` in the Android build (already conditionally applied by `android/app/build.gradle`).

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

---

## Pre-submission native sign-in audit (Task #947)

*What the build agent verified from the codebase — June 2026. Nothing below required a device; everything that does is in the TestFlight checklist that follows.*

### 1 — Demo-account seed ✅

`scripts/post-merge.sh` → `seed_task_939_appreview_demo` runs on every merge against **both** dev and prod:

- Customer row `cust-appreview-demo` / `appreview@goodtunes.music` is inserted with a scrypt password hash and `email_verified_at = now()`, `signup_completed_at = now()`, `onboarded_at = now()`, and `terms_accepted_at = now()` — all the flags that could otherwise block the first-login redirect.
- `ON CONFLICT (id) DO NOTHING` on every row means **a password Bill rotated via the admin reset flow survives a merge** — the seed will never clobber it.
- The three Sampler songs are copied with `INSERT…SELECT … FROM songs WHERE id = 'song-1-1' / 'song-5-1' / 'song-5-6'` so each environment inherits its own valid Mux IDs (Mux is a shared account — the asset IDs resolve on both dev and prod).
- `user_albums` row `ua-appreview-sampler` carries `is_preview = false`, so the album lands in Library and plays full-length with no purchase required.

### 2 — In-WebView auth / session flow ✅

The app is a Capacitor WebView wrapping the same SPA that ships at `goodtunes.music`. API calls originate from `capacitor://localhost` (iOS) or `http://localhost` (Android) to `https://my.goodtunes.music` — a cross-origin pair. Two layers ensure the session always reaches the server:

**Layer 1 — Session cookie.** Express session is configured with `sameSite: "lax"` and `secure: true`. `SameSite=Lax` cookies are not sent on cross-origin WebView requests from `capacitor://localhost`, but that is acceptable: the Bearer token (Layer 2) is the authoritative auth mechanism for native and survives iOS ITP. The session cookie re-hydrates on the first same-origin navigation or can be refreshed from the Bearer token on the server side.

**Layer 2 — Bearer token (iOS ITP bypass).** On login the server returns a token that the client stores in `localStorage` under `goodtunes_auth_token` (`client/src/lib/queryClient.ts`). Every `apiRequest` call attaches `Authorization: Bearer <token>`. If the cookie session is absent (e.g. after iOS ITP partitions it), the server resolves auth from the Bearer header and re-hydrates the session — so the user stays signed in even when iOS has eaten the cookie.

Both layers are wired and work without any per-platform code path.

### 3 — Buy and Chat surface gates ✅

`client/src/lib/platform.ts` is the single source of truth:

```ts
export const buyEnabled   = !(isNative && nativePlatform === "ios");  // hidden iOS-only
export const chatEnabled  = !isNative;                                  // hidden all-native
```

- iOS native: Buy hidden (App Store guideline 3.1.1), Chat hidden.
- Android native: Buy visible (Play allows external-payment music apps), Chat hidden.
- Every gated UI surface reads these booleans — no scattered `Capacitor.isNativePlatform()` calls.

### 4 — Capacitor config ✅

`capacitor.config.ts` has no `server.url` override, which is correct for a production archive — the bundled `dist/public` SPA is loaded by the WebView and all API calls go to `my.goodtunes.music` over the network. `android.allowMixedContent: false` enforces HTTPS-only. Splash and status-bar colors are set to `#00062B`.

### 5 — What still needs a real device

| Check | Why it can't be done from the workspace |
|---|---|
| Password Bill rotated for this submission signs in | The plaintext is only in App Store Connect / Play Console, not in the repo |
| WKWebView (iOS 17+) sends the Bearer token + re-hydrates session | Cookie behavior on a real WKWebView vs. a desktop browser can differ |
| All three Sampler tracks stream to completion | Mux HLS signing requires a live network round-trip to `my.goodtunes.music` |
| No Buy button or Chat tab appears anywhere in the native shell | Requires a native binary (Capacitor build), not the web preview |

---

## TestFlight checklist — Bill's four steps

*Run this on your iPhone with the latest GoodTunes TestFlight build installed.*

1. **Open TestFlight → GoodTunes → Install** (or Update if it's already installed). Launch the app.
2. **Sign in** with `appreview@goodtunes.music` and the password you set via the admin reset flow.
   - The Library tab should appear immediately with **GoodTunes Sampler** visible.
3. **Play all three tracks full-length** — tap the album, then play each song through to the end (or at least scrub near the end to confirm the track advances). Confirm audio continues with the screen off.
4. **Confirm no Buy and no Chat** — scroll every screen you can reach; there should be no "Buy", "Purchase", or price pill anywhere, and no Chat tab in the bottom nav.

If every step passes, the demo-account check-box for the App Store / Play Store submission form is done. ✅
