# Store-review readiness — pre-submission compliance audit

Audit of the GoodTunes Capacitor build against current Apple App Store Review
Guidelines and Google Play policy (as of June 2026). Scope: verify every claim in
[`app-store-submission.md`](./app-store-submission.md) and
[`native-builds.md`](./native-builds.md) against the actual code, fix in-repo gaps,
and flag what only an operator or a real device/Mac build can close.

No native build, store upload, or device test was performed (none is possible in
the Replit container). Findings are grouped by who can close them:

- **A — Fixed in this repo.** Code/doc changes landed here; verifiable now.
- **B — Operator / infra.** Needs a publish, a store-console action, or a domain
  change. Cannot be done by a task agent.
- **C — Device / Mac-build only.** Needs the Xcode/Gradle toolchain or a physical
  device that doesn't exist in this environment.

---

## A — Fixed in this repo

### A1. In-app account deletion now actually exists (was a false doc claim) — **critical**
`app-store-submission.md` claimed fans could delete their account via
`DELETE /api/customer/me`, but **no such route and no UI existed**. An app that
offers account creation but no in-app deletion is an automatic rejection under
Apple guideline **5.1.1(v)** and Google Play's account-deletion policy.

Implemented:
- **Route** `DELETE /api/customer/me` (`requireCustomer`) in `server/routes.ts`.
- **Storage** `deleteCustomerAccount(id)` in `server/storage.ts` — a single
  transaction that revokes every bearer token, drops all OAuth identities, wipes
  favorites / playlists (+ playlist songs) / library grants, then **anonymizes the
  `customer_users` row in place** (random unguessable email, nulled password,
  every PII column scrubbed). Orders are **retained** for legal/accounting reasons,
  so the row is kept rather than hard-deleted (a hard delete would orphan or FK-fail
  against `orders`). The result is an unrecoverable, sign-in-impossible account.
- **UI** `Account → Privacy → Delete My Account`, behind a two-step confirm, which
  calls the endpoint, clears the local bearer token + query cache, and returns the
  fan to the login screen.

Verified by a throwaway-fixture script against the dev DB: after deletion the row's
PII is scrubbed, password is null, email is the sentinel, and tokens / identities /
favorites / playlists / playlist-songs are all gone. Route returns `401` (not `404`)
unauthenticated, proving registration. Docs in `app-store-submission.md` and
`capabilities.md` updated to describe the real path.

### A2. Doc claims reconciled with code
- `app-store-submission.md` deletion line rewritten to the real in-app path +
  behavior, plus a note that Play also wants a **public deletion URL** on the
  listing (see B3).
- Android **target API 35** bump now applied in-repo: `android/variables.gradle`
  `compileSdkVersion`/`targetSdkVersion = 35`, AGP `8.7.2`, Gradle wrapper `8.9`.
  All that remains is the Mac-only clean release build (see B1 / C1).

### A3. Claims re-verified as accurate (no change needed)
These existing claims were checked against code and hold:
- **Buy / price / chat / streaming-handoff gates.** All fan commerce, price, chat,
  and "stream elsewhere" surfaces are gated by the platform capability flags; no
  iOS leak path found. (Matters for guideline 3.1.1 — no external-purchase pointers
  in the iOS build.)
- **`.well-known` routes.** `apple-app-site-association` substitutes `APPLE_TEAM_ID`
  at request time and returns `503` when it's missing (no sentinel leak).
  `assetlinks.json` now serves a **committed, public app-signing-key SHA-256** plus
  `package_name: com.gogoods_mobile` (no substitution in the normal path —
  `ANDROID_RELEASE_SHA256` is a dormant rotation override). `server/auth/host.ts`
  exempts `/.well-known/*` from the apex→`my.` redirect.
- **Bundle ids are consistent.** iOS is `Io.GoGoods.music` (across `capacitor.config.ts`,
  the iOS pbxproj, and the AASA `appIDs`); Android applicationId is `com.gogoods_mobile`
  (Android `build.gradle` `defaultConfig.applicationId` + `assetlinks.json` + Codemagic
  `--package-name`), while the Gradle `namespace` (Java package) stays `fm.goodtunes.player`.
  The two stores use different identities by design — see `app-store-submission.md § App identity`.
- **Permissions hygiene.** ATT / StoreKit / Camera / Mic / Location are *not*
  declared — correct, since declaring an unused capability is itself a rejection
  trigger. (Note: this is the *device-permission* surface. We still **collect**
  coarse, IP-derived country/region server-side for analytics — that is a
  data-collection disclosure, not a runtime permission, and is mapped in A4. No
  `NSUserTrackingUsageDescription` / `NSLocationWhenInUseUsageDescription` is
  needed: we never request the OS Location permission and we never track across
  other companies' apps.)

### A4. App Privacy / Data-safety disclosure — first-party analytics + affiliate

GoodTunes runs a typed, first-party analytics pipeline (see
[`docs/analytics.md`](./analytics.md); registry in `shared/analytics.ts`, envelope
+ ingest in `client/src/lib/analytics.ts` / `server/analytics.ts`). This section
maps what we **actually** collect to the exact App Store Connect *App Privacy* and
Google Play *Data safety* fields, and records the affiliate / ATT posture. It is
built from the real event registry, not invented.

**Three posture statements (the "why this is compliant" summary):**

1. **Affiliate commissions on physical goods are not an IAP / 3.1.1 issue.** The
   gear exit click (`gear_vendor_clicked`) sends the fan to a maker's or
   reseller's *own* website to buy a **physical** instrument; GoodTunes later
   earns an affiliate commission and passes 70% to the artist who built the kit.
   Apple guideline **3.1.1** (IAP) governs *digital* content consumed in-app;
   **3.1.3(e) / 3.1.5(a)** explicitly allow physical goods and services to be
   bought with other payment methods. Outbound affiliate links for physical gear
   are permitted. (On the native store builds, in-app Buy + Chat are gated off
   anyway — `buyEnabled` / `chatEnabled` `= !isNative` in
   `client/src/lib/platform.ts`.)
2. **First-party analytics for personalization needs disclosure but NOT the ATT
   prompt.** We collect usage to personalize the fan experience and to reconcile
   affiliate clicks. None of it is shared with a third party for *their* own
   advertising, and none is combined with third-party data to track a user across
   other companies' apps/sites — so Apple's **App Tracking Transparency** does not
   apply and no `NSUserTrackingUsageDescription` is declared (consistent with A3).
   PostHog is a server-side **data processor** for our own project
   (`server/analytics.ts` forwards over plain `fetch`; it is *not* a client SDK
   and not a data broker), so it does not change the first-party posture.
3. **Maker / reseller reconciliation is aggregate-only.** The vendor-facing
   reporting surface returns counts grouped by instrument — never any fan-level
   identifier. Verified below.

**App Privacy / Data-safety field mapping** (data type → linked-to-identity →
purpose). "Linked to a fan identity" is *yes* whenever the fan is signed in
(`userId` is stamped via `identifyAnalyticsUser`); anonymous fans carry only a
pseudonymous `deviceId` (a localStorage UUID — **not** an advertising / IDFA id),
which is also what stitches an anonymous session to the account after sign-in.

| What we collect | Real events / fields | Linked to fan identity? | App Store Connect "App Privacy" data type | Google Play "Data safety" type | Purpose |
| --- | --- | --- | --- | --- | --- |
| Account identity | `userId`; `sign_in` / `sign_up` / `sign_out` (`provider`, `kind`) | Yes | **User ID** (Identifiers) | **Personal info → User IDs** | App Functionality, Analytics |
| Device / session id | envelope `deviceId`, `sessionId` | Pseudonymous; stitched to `userId` after sign-in | **Device ID** (Identifiers) | **Device or other IDs** | Analytics |
| Product interaction / usage | `play_*`, `video_*`, `favorite_*`, `follow_artist`, playlist events, `album_viewed` / `artist_viewed` / `song_viewed`, `lyrics_opened`, `credits_*`, `gear_viewed`, `share_*`, welcome-back events | Signed-in: yes; else device-only | **Product Interaction** (Usage Data) | **App activity → App interactions** | Analytics, Product Personalization |
| Search history | `search_performed` (`query`), `search_result_clicked` | Signed-in: yes; else device-only | **Search History** | **App activity → In-app search history** | Analytics, Product Personalization |
| Gear / affiliate exit clicks | `gear_vendor_clicked` (`vendorId`, `instrumentId`, `affiliateUrl`, `vendorDomain`, `url`), `gear_vendor_chat_opened` | Signed-in: yes; else device-only | **Product Interaction** (Usage Data) | **App activity → App interactions** | App Functionality, Analytics (affiliate reconciliation) |
| Purchases | `bundle_viewed`, `checkout_started`, `checkout_completed` (`priceCents`, `orderId`), `gift_initiated` | Yes | **Purchase History** | **Financial info → Purchase history** | App Functionality, Analytics — **web-only**; native store builds hide Buy (`buyEnabled = !isNative`), so these generally don't fire on iOS/Android |
| Coarse location | server-stamped `country` / `region` from CDN IP headers (`geoFromRequest`) | Signed-in: yes; else device-only | **Coarse Location** (IP-derived country/region only; never GPS/precise) | **Location → Approximate location** | Analytics |

Notes kept honest to the code: the envelope `referrer` (`document.referrer`) is
in-app navigation context, not cross-site browsing history, and isn't declared as
a separate data type. We do **not** collect contacts, health, messages, photos,
audio recordings, or precise location. PostHog forwarding (`POSTHOG_API_KEY`) is
server-side only; the canonical record always lives in our own `analytics_events`
table.

**Aggregate-only reconciliation — verified.** The maker/reseller-facing reporting
surface is `GET /api/admin/vendors/:id/analytics` (`server/routes.ts`), which calls
`loadConnectedAnalytics`. For gear it runs:

```sql
SELECT (ae.payload->>'instrumentId') AS instrument_id,
       (SELECT name FROM instruments WHERE id = (ae.payload->>'instrumentId')) AS name,
       COUNT(*)::int AS clicks
FROM analytics_events ae
WHERE ae.name = 'gear_vendor_clicked' AND (ae.payload->>'vendorId') = $vendorId
GROUP BY (ae.payload->>'instrumentId')
ORDER BY clicks DESC LIMIT 25
```

The response (`byGear` / `byAlbum` / `byTrack` / `byPerson`) carries only
`{ id, label, count }` rows (instrument / album / track / **artist** ids — never a
*fan* id) plus scalar totals. There is **no `userId`, `deviceId`, `sessionId`,
email, or any fan-level identifier in the payload** — individual fan context is
collapsed by `COUNT(*) … GROUP BY` before anything reaches the vendor. The
non-profit and manufacturer analytics routes reuse the same aggregate helper.

**⚠ Blocking code finding — surfaced, NOT fixed here (out of this doc-task's
scope).** The reconciliation payload above is clean, but the *raw-event* debug
tail `GET /api/admin/events/recent` (`server/routes.ts`) returns whole
`analytics_events` rows — including raw `userId` / `deviceId` — and is gated only
by `requireAdmin`. `requireAdmin` proves `isAdmin === true`, and **partner roles
(vendor / reseller / label / etc.) are also `isAdmin`** (see
`.agents/memory/requireadmin-includes-partners.md`), so a partner-kind account
could in principle read raw fan-level analytics for *all* fans, unscoped. It is
operator-only by intent (the admin debug overlay is off-by-default behind a
feature flag) but the server route does not enforce that intent. **Must-fix before
submission / before relying on the "no fan identifiers reach a maker" guarantee:**
add an explicit operator check (`getUserRole` → `super_admin` / `admin`) on
`/api/admin/events/recent` and `/api/admin/events`-family routes, mirroring the
operator-only pattern already used elsewhere in `routes.ts`. Tracked here rather
than silently patched because tightening an auth gate is a behavior change that
deserves its own review.

---

## B — Operator / infra (cannot be done by a task agent)

### B1. Verify the API-35 release build on the Mac — **blocking**
The version bump itself is **done in-repo**: `android/variables.gradle` now pins
`compileSdkVersion` / `targetSdkVersion = 35`, `android/build.gradle` carries
AGP `8.7.2`, and the Gradle wrapper is `8.9` (AGP ≥ 8.6 + Gradle ≥ 8.7 is what
API 35 wants; this pairing also keeps the existing JDK 17 source/target). Google
Play has required **API level 35 (Android 15)** for new apps and updates since
**31 Aug 2025**; a 34-target `.aab` is rejected at upload. What remains can only
be done on the Mac: run a clean `./gradlew :app:bundleRelease` and fix any
AGP-version fallout before the first Play upload (see C1).

### B2. Cut a new build so deep links verify on `my.goodtunes.music`
From `app-store-submission.md` (see the "Deep links" section for the full rationale):
1. **Republish — done.** The production app now serves real values; `assetlinks.json`
   and `apple-app-site-association` return 200 with the real SHA-256 / Team ID on both
   `my.goodtunes.music` and `admin.goodtunes.music` (re-verified live).
2. **Apex no longer needed.** The original plan to attach the bare `goodtunes.music`
   apex was dropped: the apex is the **Webflow marketing site** (it can't serve our
   association files), so the app now claims **only `my.goodtunes.music`** — the
   bare-apex claim was removed from both the iOS entitlements and Android manifest.
   No deployment custom-domain change is required and Webflow stays untouched. This
   change ships in the **next signed build via Codemagic**; after that build is
   installed, run the verifiers in C2 against `my.goodtunes.music`.

### B3. Provide a public account-deletion URL for the Play listing — **fixed in repo (A)**
In-app deletion exists (A1), and the public deletion page Play's Data safety form
wants is now shipped at `goodtunes.music/delete-account` (route in `client/src/App.tsx`,
page `client/src/pages/DeleteAccount.tsx`). It's a public, host-agnostic page that
documents the in-app `Account → Privacy → Delete My Account` steps, what data is
removed vs. retained (orders kept for legal/accounting), and a support email
fallback. **Operator action remaining:** paste that URL into the Play Data safety
form's deletion-URL field at submission. (Apple has no equivalent URL requirement —
in-app is enough.)

### B4. Demo account + reviewer notes
The mandatory review demo account and the reviewer notes (web-only purchases, no
StoreKit) are documented in `app-store-submission.md`; confirm the seeded demo
account is live in the environment the reviewer will hit and paste the notes into
both consoles verbatim at submission time.

### B5. Enter the App Privacy / Data-safety fields + privacy-policy URL
The data-type mapping is written in A4, but **filling out the forms is operator
work** — no API does it:
- **App Store Connect → App Privacy:** declare the data types from the A4 table
  (User ID, Device ID, Product Interaction, Search History, Purchase History,
  Coarse Location), each marked **Used for analytics / product personalization +
  app functionality**, **Linked to the user**, and **Not Used for Tracking** (so
  no ATT prompt). Do **not** declare any data type "Used for Tracking."
- **Google Play → Data safety:** declare the matching types (Personal info → User
  IDs; Device or other IDs; App activity → App interactions + In-app search
  history; Financial info → Purchase history; Location → Approximate location),
  collected + processed, with the same analytics / app-functionality purposes, and
  paste the public deletion URL (B3).
- **Privacy-policy URL (both consoles):** the linked policy must mention that we
  collect first-party analytics for personalization and that gear pages contain
  **affiliate links** that may earn GoodTunes a commission. Confirm the live policy
  copy says this before submission (copywriting beyond this note is out of scope).

---

## C — Device / Mac-build only (no toolchain in this environment)

- **C1. Clean signed builds.** `npm run build && npx cap sync`, then an Xcode
  Archive (iOS) and a `./gradlew :app:bundleRelease` (Android, with the API-35
  bump already in-repo) — none runnable here. This is where any AGP-`8.7.2` /
  Gradle-`8.9` fallout from B1 surfaces.
- **C2. App Links / Universal Links verifiers.** `swcutil verify -d my.goodtunes.music`
  (Apple) and Google's Statement List Tester (for `my.goodtunes.music`) need a real
  install of the new apex-free build from B2.
- **C3. The full on-device smoke test** in `native-builds.md` (background audio,
  offline download playback, BottomNav hides Chat, instrument-sheet chat bubble
  hidden) — needs a physical iPhone + Android phone.
- **C4. Native Sign-in-with-Apple sheet** behaves correctly only in a signed device
  build; confirm during C3.

---

## Google Play player-only submission — in-repo readiness re-verified (June 2026)

Pre-submission pass for the **Android player-only** Play upload. Confirmed every
in-repo prerequisite is in place; everything that remains is operator/Codemagic/
console only (no code gap found, nothing changed):

- **API 35.** `android/variables.gradle` pins `compileSdkVersion` /
  `targetSdkVersion = 35`; `android/build.gradle` carries AGP `8.7.2`; the Gradle
  wrapper is `8.9`. (Clean release `bundleRelease` still only runnable on the
  Codemagic Linux runner — see C1.)
- **Player-only Buy gating.** `client/src/lib/platform.ts` → `buyEnabled = !isNative`,
  so Android native hides every Buy CTA exactly like iOS. `chatEnabled = !isNative`
  hides Chat too.
- **App Links.** `AndroidManifest.xml` has the `autoVerify="true"` intent-filter for
  `https://my.goodtunes.music/*` (apex intentionally not claimed). `assetlinks.json`
  is served with the **real, committed** app-signing-key SHA-256 and
  `package_name: com.gogoods_mobile` (the fingerprint is public, so it's baked into the
  committed file; `ANDROID_RELEASE_SHA256` is a dormant rotation override). AASA still
  serves the real `APPLE_TEAM_ID` via substitution.
- **Account deletion.** `DELETE /api/customer/me` returns `401` unauthenticated
  (route exists, gated); the public deletion page resolves `200` at
  `/delete-account` for the Data safety form's deletion-URL field.
- **Codemagic `android-internal` workflow** is wired end-to-end: `npm ci` → web
  build → `cap sync android` → auto-increment `versionCode` from the latest Play
  build → icon guard → `./gradlew bundleRelease` → publish to the Play `internal`
  track. Manual-trigger only.

Operator steps remaining (cannot be done in the container): run `android-internal`
in Codemagic to produce + upload the signed `.aab`; complete the Play listing,
Data safety form (+ deletion URL), content rating, and privacy-policy URL; confirm
the seeded `appreview@goodtunes.music` demo account in the reviewer-facing env and
paste the player-only reviewer notes; after install, run Google's Statement List
Tester against `my.goodtunes.music` and the on-device smoke test.

## Validation state at audit time
- `npm run design:lint` — **clean** (after migrating the new Delete-Account UI hex
  to `var(--brand-heart)`).
- `schema-drift-smoke` — clean (dev + prod, 108 tables).
- `db-query-smoke` — 29/29.
- `test` — the one failing file (`client/src/pages/mobilePlayerScrubber.test.ts`) is
  a **pre-existing, unrelated** failure (a stale `isWebIOS` import in `Player.tsx`),
  present before this task and out of scope.
- **Re-verified June 2026 (this pass):** `test` — **416/416 pass** (the scrubber
  failure noted above has since been fixed); `schema-drift-smoke` — clean (dev +
  prod, 112 tables); `db-query-smoke` — 29/29; `design:lint` — clean.
- **A4/B5 disclosure pass (doc-only):** no code, schema, or UI files changed —
  only `docs/store-review-readiness.md` and the `replit.md` doc-map pointer. The
  A4 mapping was built by reading the live event registry (`shared/analytics.ts`),
  the envelope/ingest (`client/src/lib/analytics.ts`, `server/analytics.ts`), and
  the reconciliation handler (`loadConnectedAnalytics` /
  `GET /api/admin/vendors/:id/analytics` in `server/routes.ts`). One blocking code
  finding (`/api/admin/events/recent` admits partner-kind accounts) is surfaced in
  A4, not patched — see its callout.
