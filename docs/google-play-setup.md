# Google Play setup with Codemagic (Android → Play, player-only)

This is the plain-English, start-to-finish runbook for getting the GoodTunes
**Android** app onto Google Play. Like the iOS side, Codemagic builds + signs the
app in the cloud (no Android Studio needed) and uploads it straight to Play's
**internal testing** track. Your job is the one-time wiring: two Codemagic
credentials, the Play Console app + agreements, the store listing, and the
compliance forms.

The build itself is already wired — the `android-internal` workflow in
[`codemagic.yaml`](../codemagic.yaml) does `npm ci` → web build → `cap sync` →
auto-increment `versionCode` → source icon guard → signed `.aab` → **built-`.aab`
icon guard** → upload to Play internal. You don't edit it. Everything in-repo
(API 35, App Links, account
deletion, icons, player-only gating) was already verified — see
[`store-review-readiness.md`](./store-review-readiness.md). The **only** gap is
the operator/console work below.

> **Player-only, on purpose.** The Android app is a pure music player. There is
> **no in-app Buy and no Play Billing** — `client/src/lib/platform.ts` sets
> `buyEnabled = !isNative`, so every Buy/price/checkout surface is hidden in the
> native shell (same as iOS). Purchases happen on the web at `goodtunes.music`.
> This keeps us out of Play's billing-policy scope entirely; do **not** add Play
> Billing or any in-app purchase to "fix" a review note — point the reviewer at
> the web instead (the reviewer note below already does).

> **App identity:** Android applicationId is **`com.gogoods_mobile`** (set in
> `android/app/build.gradle` → `defaultConfig.applicationId`). This is the
> **existing** Play listing (~100 installs + reviews) that we keep — Play
> package names are immutable, so the build must carry it to upload into that
> listing. The Gradle `namespace` stays `fm.goodtunes.player` (the Java
> package, independent of `applicationId`). iOS is a *different* identity again
> (`Io.GoGoods.music`) — that's intentional, not a mistake. Everything below
> uses the Android package name `com.gogoods_mobile`.

> **Where Codemagic gets the code, and when it builds:** the GitHub mirror
> `github.com/billdenk/goodtunes-app` (branch `main`), which updates
> automatically on every merge. You don't push anything by hand. The
> `android-internal` workflow auto-triggers on pushes to `main` (the
> `triggering:` block in `codemagic.yaml`), **but only actually builds when the
> merge changed the native shell** — the `android/` project, `capacitor.config.ts`,
> or the dependency files `package.json` / `package-lock.json` (a `when.changeset`
> filter). The apps are thin Capacitor shells that load the live site, so
> web/content/server merges reach devices on republish with no new build, and
> Codemagic skips the ~$0.50 no-op. Native-shell merges build → upload to Play
> internal with **no button**. You can still **force a build by hand anytime**
> (Start new build → `Android → Play internal testing`); manual builds ignore the
> filter. Ambiguous cases bias toward building. For the webhook to fire, the
> Codemagic app must be **connected to the mirror repo** (one-time, in Codemagic →
> app settings → repository). The two iOS workflows stay manual on purpose. (Same
> mirror as the iOS flow — see [`codemagic-builds.md`](./codemagic-builds.md).)

---

## The two Codemagic credentials the build depends on

The `android-internal` workflow references exactly two things by name. Until both
exist in Codemagic, the build can't sign or upload. This is the whole checklist:

| What | Codemagic location | Reference name the YAML expects | What it's for |
|---|---|---|---|
| **Android upload keystore** | Code signing identities → **Android keystores** | **`goodtunes_keystore`** | The private key that signs the `.aab`. Play App Signing re-signs on Google's side, but the upload still has to be signed by *your* upload key. |
| **Play service-account JSON** | Environment variables → group **`google_play`** | variable **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`** (paste the JSON as the value) | Lets Codemagic read the latest build number off the Play internal track (`google-play get-latest-build-number`) and upload the `.aab` to that track. |

The YAML lines that consume them:

```yaml
environment:
  groups:
    - google_play            # provides GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
  android_signing:
    - goodtunes_keystore     # the keystore reference uploaded in Codemagic
...
publishing:
  google_play:
    credentials: $GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
    track: internal
```

Get each one as follows.

### A. The upload keystore (`goodtunes_keystore`)

If a GoodTunes upload keystore already exists, reuse it — **do not generate a new
one for an app that's already published**, or Play will reject the upload
(signature mismatch). For a brand-new app you make it once and keep it forever:

1. On any machine with the JDK, generate the keystore:
   ```sh
   keytool -genkey -v -keystore goodtunes-upload.keystore \
     -alias goodtunes -keyalg RSA -keysize 2048 -validity 10000
   ```
   It will prompt for a keystore password, a key password, and a name/org. Write
   all three down somewhere safe (a password manager) — losing them means you
   can never ship an update under this upload key again.
2. In Codemagic → **Teams / Personal account → Code signing identities →
   Android keystores → Add keystore**.
3. Upload `goodtunes-upload.keystore`, enter the **keystore password**, **key
   alias** (`goodtunes`), and **key password**, and set the **reference name** to
   exactly **`goodtunes_keystore`** (the YAML matches on this string — a typo
   fails the build at signing).

> The SHA-256 fingerprint of the key that actually signs what users download is
> what App Links verify against. With Play App Signing on for `com.gogoods_mobile`,
> that's the **Play app-signing key**, not the upload key — it lives at Play
> Console → **Test and release → App integrity → App signing key certificate**.
> That fingerprint (`8B:F3:50:…:CF:4B`) is **public and committed directly into
> `public/.well-known/assetlinks.json`**, so the deployment serves it without
> any env var. (`ANDROID_RELEASE_SHA256` remains a dormant rotation override —
> see [`app-store-submission.md`](./app-store-submission.md) → "Deep links".)

### B. The Play service-account JSON (`google_play` group)

This is a Google Cloud service account that's been granted Play Developer API
access, so Codemagic can talk to your Play account programmatically.

1. **Create the Play Console app first** (next section) — the service account is
   linked *from inside* Play Console, so the app has to exist.
2. In **Play Console → Setup → API access**:
   - If prompted, link a Google Cloud project (create one if you don't have it).
   - Under **Service accounts**, click **Create new service account** → this
     bounces you to Google Cloud Console.
   - In Google Cloud Console: **Create service account**, give it a name (e.g.
     `codemagic-play-publisher`), finish creation, then open it →  **Keys → Add
     key → Create new key → JSON**. Download the JSON file. (This is the file you
     give Codemagic — keep it secret.)
3. Back in **Play Console → API access**, find the new service account in the
   list → **Manage Play permissions / Grant access**, and give it at least:
   - **Releases**: "Release apps to testing tracks" (needed to upload to
     internal) — and "Manage testing tracks".
   - **Admin (all permissions)** is the simplest if you'd rather not pick — but
     least-privilege (release-to-testing) is enough for this pipeline.
4. **Enable the Google Play Android Developer API on the Cloud project.** The
   service account can authenticate, but the *project* it belongs to must also
   have the publishing API switched on, or the upload fails at the very last step
   with **"Google Play Android Developer API has not been used in project `<N>`
   before or it is disabled."** Open
   **`https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com`**
   (or the exact `console.developers.google.com/...?project=<N>` link printed in
   the error), confirm the project selector shows the **same Cloud project the
   service-account JSON belongs to** (its `project_id` / number), and click
   **Enable**. Wait a few minutes for it to propagate, then re-run the Codemagic
   build — no code change and no new `.aab` config is needed.
5. In Codemagic → **Environment variables**:
   - Create a group named exactly **`google_play`**.
   - Add a variable **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`**, paste the **entire
     contents of the JSON file** as the value, and mark it **Secure**.

> Permission propagation can take a few minutes to an hour after you grant the
> service account access in Play. If the first build fails on the
> `get-latest-build-number` / publish step with a permissions error, wait and
> re-run before touching anything.

---

## Play Console one-time setup

Do this once, before the first build.

1. **Create the app.** Play Console → **Create app**. App name **GoodTunes**,
   default language, type **App**, **Free**. Confirm the declarations.
2. **Set the package name.** We are **keeping the existing `com.gogoods_mobile`
   listing** (it already has installs + reviews), not creating a new app, so its
   package is already locked to **`com.gogoods_mobile`**. The `.aab` you upload
   must carry that same applicationId (it does — see `android/app/build.gradle`).
   Just don't upload a bundle with a different applicationId, or Play will reject
   it as a mismatched package.
3. **Accept agreements & complete account setup.** Play Console → **Setup** and
   the dashboard "set up your app" task list: accept the Developer Distribution
   Agreement, and fill the app-content declarations (covered under Compliance
   below). The Google Play developer account itself needs the one-time $25
   registration paid and (for newer accounts) identity verification done — that's
   an account-level prerequisite, not per-app.
4. **Link the Google Cloud service account** (credential B above) under
   **Setup → API access**, with release-to-testing permission.
5. **Create the internal testing track.** Play Console → **Test and release →
   Testing → Internal testing**. Add yourself (and anyone testing) to the
   **testers** list by email — they must accept the opt-in link before they can
   install. The Codemagic build publishes to this `internal` track.

After this, the first Codemagic `android-internal` run will drop a signed `.aab`
onto the internal track automatically.

> **Three things that MUST line up with the kept `com.gogoods_mobile` listing,
> or the upload is rejected — operator checks before the first build:**
> - **Upload key.** The `goodtunes_keystore` reference uploaded to Codemagic must
>   be the **upload key registered for `com.gogoods_mobile`** in Play App Signing.
>   A different key is rejected at upload no matter how valid the build is.
> - **Service-account access.** The `google_play` service account must be granted
>   release access **on the `com.gogoods_mobile` app specifically**.
> - **versionCode floor (already handled in CI).** This listing already has
>   published production builds, so the new build's `versionCode` must exceed the
>   highest one Play has ever accepted. The `android-internal` workflow reads the
>   latest build number across **all** tracks (internal/alpha/beta/production) and
>   adds 1, so it clears the production floor automatically — don't revert that to
>   an internal-only query or the first build collides on versionCode 1.

---

## Store listing assets — exact specs

Play Console → **Grow → Store presence → Main store listing**. Everything here is
operator/marketing content; have these ready:

| Asset | Exact spec | Notes |
|---|---|---|
| **App name** | ≤ 30 characters | "GoodTunes" |
| **Short description** | ≤ 80 characters | One-line hook shown above the fold. |
| **Full description** | ≤ 4000 characters | The long listing copy. |
| **App icon (hi-res)** | **512 × 512 px**, 32-bit PNG (with alpha) | Must visually match the in-app launcher icon. |
| **Feature graphic** | **1024 × 500 px**, PNG or JPG (no alpha) | Required; shown at the top of the listing and in promos. |
| **Phone screenshots** | **2–8 images**, PNG or JPG, 16:9 or 9:16, each side **320–3840 px** | Min 2 to publish. Use 1080 × 1920 portrait shots: Library, an album page, the player with lyrics open, an instrument/credits sheet. Placeholders/simulator captures are fine for the first submission. |
| **7-inch tablet screenshots** | up to 8, same format rules | **Optional.** Only needed if you want the listing to look right on tablets. |
| **10-inch tablet screenshots** | up to 8, same format rules | **Optional.** |

Listing fields to set alongside the assets:
- **App category:** **Music & Audio**.
- **Contact details:** support email (and optionally website/phone).
- **Privacy policy URL:** required (see Compliance below).

---

## Compliance forms (Play Console → App content / Policy)

Play won't let you submit until these are all green. Mirror the values already
documented in [`app-store-submission.md`](./app-store-submission.md) so the two
stores stay consistent.

### Data safety
Play Console → **App content → Data safety**. Declare what GoodTunes actually
collects (don't over- or under-declare):
- **Email address** — collected, linked to the user, not used for tracking
  (account + transactional mail).
- **Name** (display name) — collected, linked, not tracking.
- **Purchases** — collected, linked, not tracking (app functionality).
- **App activity / listening history** — collected, linked, not tracking
  (analytics + artist insights; see [`analytics.md`](./analytics.md)).
- **No** advertising ID / IDFA, **no** location permission, **no** microphone /
  camera / contacts.
- **Data encrypted in transit?** **Yes** (TLS to `goodtunes.music`).
- **Can users request deletion?** **Yes**, in-app at **Account → Privacy →
  Delete My Account** (`DELETE /api/customer/me`). Paste the **public deletion
  URL** Play requires into the deletion-URL field:
  **`https://goodtunes.music/delete-account`** (a live public page documenting
  the in-app steps and what's removed vs. retained).
- **Independent security review?** **No** (don't claim one).

### Content rating
Play Console → **App content → Content rating** → fill the IARC questionnaire.
GoodTunes is a music player; the rating driver is user-generated/explicit content
(some albums carry the explicit badge; lyrics can be explicit). Answer honestly —
this lands around **Teen** (matching the iOS 12+ rating). Chat is hidden in the
native shell, so there's no in-app user-to-user communication to declare.

### Other App-content declarations
- **Privacy policy** — paste the privacy-policy URL (App content → Privacy
  policy). Required.
- **Target audience & content** — select the intended age groups (not designed
  for children; Teen+). This drives Families-policy applicability.
- **Ads** — declare **No, this app does not contain ads** (we don't serve ads).
- **Government apps / News / COVID** — **No** to all (not applicable).
- **Data deletion** — already covered by the Data safety deletion URL above.

---

## Reviewer / tester access

Play's internal-testing reviewers (and any human review on promotion) need to be
able to sign in and play something, since content is behind login.

- **Demo account:** `appreview@goodtunes.music` — seeded idempotently into every
  environment by `scripts/post-merge.sh` (`seed_task_939_appreview_demo`). It
  owns the **GoodTunes Sampler** (a 3-track EP) via a real `user_albums` grant,
  so it lands in Library and plays full-length with **no Buy and no Chat**
  anywhere. Rotate the password via the admin reset flow before submission and
  put the new plaintext only into the console — never the repo. (Full detail:
  [`app-store-submission.md`](./app-store-submission.md) → "Demo account".)
- **Add the demo account email to the internal-testing tester list** so it can
  install the build, and add any reviewer it needs.
- **Reviewer notes** (paste verbatim into the release notes / "Tell us about this
  release"):

  > GoodTunes is a fan-first music player. Purchases happen on the web at
  > `https://goodtunes.music`, not inside the app — the Android build
  > intentionally hides every Buy button, and there is no Play Billing /
  > in-app purchase. To verify playback, sign in with the demo account above and
  > tap any song on the **GoodTunes Sampler** album in Library. The web-only Chat
  > tab is also hidden in the native shell.

---

## First build & automatic builds after

Once **both** credentials (`goodtunes_keystore` + the `google_play` group) are in
Codemagic, the Play app + internal track exist, and the Codemagic app is
**connected to the GitHub mirror repo** (so its push webhook reaches Codemagic):

- **Automatic — the normal path.** Every merge force-pushes the mirror (via
  `scripts/post-merge.sh`) and reaches the `android-internal` workflow, but it
  **only actually builds when the merge changed the native shell** (`android/`,
  `capacitor.config.ts`, or `package.json`/`package-lock.json` — a `when.changeset`
  filter). Web/content/server merges skip the ~$0.50 no-op build because they
  reach devices via the live site on republish. When the shell does change, no
  button: it builds + signs + uploads a fresh `.aab` to the Play **internal**
  track, `versionCode` auto-incremented past whatever Play already has.
- **Manual — to verify wiring or build on demand.** You can still start one by
  hand: Codemagic → open the GoodTunes app → **Start new build** → branch `main`
  + the **`Android → Play internal testing`** (`android-internal`) workflow →
  **Start new build**. Do this once right after wiring the credentials to confirm
  the build is green before leaning on the auto-trigger.

Either way the build runs: lockfile check → `npm ci` → `npm run build` →
`cap sync android` → auto-increment `versionCode` from the latest Play build →
**source** icon guard → `./gradlew bundleRelease` → **built-`.aab`** icon guard →
upload the signed `.aab` to the Play **internal** track. After it finishes, the
`.aab` appears in **Play Console → Test and release → Internal testing**.
Complete the listing + compliance forms (above) if you haven't, then **Review
release → Roll out to internal testing**. Testers on the internal list install
via the Play Store app (after accepting the opt-in link).

`versionCode` auto-increments off whatever Play already has on the internal
track, so duplicates are impossible — you never bump it by hand. `versionName`
("1.0") lives in `android/app/build.gradle`; bump it there when you want the
user-visible version string to change.

> **If the build fails:** signing errors → check the `goodtunes_keystore`
> reference name/passwords. Publish/`get-latest-build-number` errors → check the
> `google_play` group has `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` and that the
> service account has release-to-testing permission (and that permissions have
> propagated). Icon-guard failures → the **source** guard
> (`scripts/verify-android-appicon.py`, before the build) and the **built-`.aab`**
> guard (`scripts/verify-android-aab-icon.py`, after the build) each print exactly
> which density/asset is wrong — the latter inspects the produced bundle to prove
> the real navy launcher icon was actually packaged (not a blank/default). See
> [`codemagic-builds.md`](./codemagic-builds.md) → "Android gets the icon guard too".

### Confirm the icon on the first real build (one-time)

The built-`.aab` guard had only ever run against synthetic/reconstructed input
before the first real Gradle bundle. On that first `android-internal` run, do a
quick by-hand confirmation that it didn't false-positive on a genuine store
binary:

1. **Guard step is green.** In the build log, the **"fail fast if the BUILT
   `.aab` ships a wrong/blank launcher icon"** step should end with
   `Built-AAB icon guard passed`, and the lines above it should report the
   adaptive-icon XML present, the largest legacy launcher icon `192px` (`>= 192`),
   and a composited luminance `~0.30` (`<= 0.7` — the dark navy brand, not a
   near-white placeholder). The color check runs even if the `pip3 install Pillow`
   line fails, because the guard falls back to ImageMagick / the raw PNG header.
2. **Installed icon is the navy "G".** After rolling out to internal testing,
   install on a real device and confirm the launcher icon is the navy GoodTunes
   "G" — not a blank/default/white square.

If both hold, the guard is confirmed working against a real bundle and needs no
threshold/path changes. (The iOS built-`.ipa` guard's authoritative check —
`assetutil` on the compiled `Assets.car` — is macOS-only and is exercised on the
TestFlight build's macOS runner, not locally.)

---

## What's intentionally out of scope

- **Apple App Store submission** — separate flow, see
  [`codemagic-builds.md`](./codemagic-builds.md) and
  [`app-store-submission.md`](./app-store-submission.md).
- **In-app purchase / Play Billing** — deliberately not built (player-only).
- **Changing the `android-internal` workflow** — no code gap; only the console
  wiring above remains.
