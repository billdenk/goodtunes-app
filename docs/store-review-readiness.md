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
- **`.well-known` routes.** `apple-app-site-association` and `assetlinks.json`
  substitute `APPLE_TEAM_ID` / `ANDROID_RELEASE_SHA256` at request time and return
  `503` when the var is missing (no sentinel leak). `server/auth/host.ts` exempts
  `/.well-known/*` from the apex→`my.` redirect.
- **Bundle ids are consistent.** iOS is `Io.GoGoods.music` (across `capacitor.config.ts`,
  the iOS pbxproj, and the AASA `appIDs`); Android is `fm.goodtunes.player` (Android
  `build.gradle` + `assetlinks.json`). The two stores use different identities by design —
  see `app-store-submission.md § App identity`.
- **Permissions hygiene.** ATT / StoreKit / Camera / Mic / Location are *not*
  declared — correct, since declaring an unused capability is itself a rejection
  trigger.

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

## Validation state at audit time
- `npm run design:lint` — **clean** (after migrating the new Delete-Account UI hex
  to `var(--brand-heart)`).
- `schema-drift-smoke` — clean (dev + prod, 108 tables).
- `db-query-smoke` — 29/29.
- `test` — the one failing file (`client/src/pages/mobilePlayerScrubber.test.ts`) is
  a **pre-existing, unrelated** failure (a stale `isWebIOS` import in `Player.tsx`),
  present before this task and out of scope.
