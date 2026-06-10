# Codemagic build cheat-sheet (cloud builds → TestFlight + one-button App Store)

This is the plain-English runbook for cutting GoodTunes iOS builds **without a Mac**. Codemagic rents cloud Macs, builds + signs the app for us, and drops each build straight into TestFlight. When you're ready to send a build to Apple for public review, you click **one button**.

The pipeline itself lives in [`codemagic.yaml`](../codemagic.yaml) at the repo root. You don't have to read it — this doc covers everything you actually do. For the older Mac-in-Xcode way (the fallback if Codemagic is ever down), see [`native-builds.md`](./native-builds.md).

> **Where Codemagic gets the code:** Codemagic builds from the GitHub mirror `github.com/billdenk/goodtunes-app` (branch `main`). Replit is the source of truth; GitHub is just a build mirror. That mirror now updates **automatically on every merge** to the project's main — `scripts/post-merge.sh` force-pushes the merged code to GitHub at the end of each merge, so a Codemagic build always picks up the latest. You don't push anything by hand. The sync now fetches GitHub's tip before pushing (so a diverged history can't balloon into a multi-GB pack that GitHub rejects with HTTP 500), uploads any new LFS objects so GitHub's `GH008` hook accepts the push, and — if it ever does fail — logs the **real git error** in the merge output instead of swallowing it. (If GitHub ever drifts behind anyway — e.g. the push token was revoked — the manual catch-up recipe lives in `.agents/memory/github-mirror-push.md`.)

---

## What the pipeline does (the short version)

There are three "buttons" (workflows) in Codemagic:

| Button | What it does | When you click it |
|---|---|---|
| **iOS → TestFlight** | Builds the app on a cloud Mac, signs it, bumps the build number, and uploads it to **TestFlight** so testers can install it. Does **not** send anything to Apple review. | Day-to-day, whenever you want a fresh test build. |
| **iOS → App Store (submit for review)** | Same build, but it also **submits the build to Apple for public App Store review**. This is the "push the button" one. | Only when a build is ready to go live to everyone. |
| **Android → Play internal testing** | Builds a signed Android `.aab` and uploads it to Play internal testing. **Automatic** — auto-runs on every push to `main` once the Android credentials + repo connection are set in Codemagic. | Every merge (auto). |

Each one:
- Rebuilds the web app, packages it into the native shell, signs it with our Apple key, and **auto-increments the build number** so Apple never rejects a duplicate.
- Runs entirely on Codemagic's cloud Macs. Your Mac is only a backup.

Nothing reaches **Apple review** by accident: the two iOS workflows only run when **you** start them, and the App Store submit is a separate button from the TestFlight one, so you stay in control of what goes to public review. Android is the deliberate exception — it auto-builds on every merge and uploads **only to the Play internal testing track** (never the public Play production track), so testers always have the latest.

---

## One-time setup (Bill does this once, ~20 minutes)

You only do this once. After it's done, builds are just button-clicks.

### 1. Create a Codemagic account and connect the repo

1. Go to **codemagic.io** and sign up (the free tier includes cloud-Mac minutes to start).
2. **Add application** → connect the GoodTunes repository.
3. When Codemagic asks how to configure the build, choose **"Use codemagic.yaml"**. It will find the `codemagic.yaml` already committed in the repo — you don't paste anything.

### 2. Make the App Store Connect API key (this is the signing key)

This one key lets Codemagic build, sign, upload, and submit — no certificates to juggle by hand.

1. Sign in to **App Store Connect** → **Users and Access** → **Integrations** tab → **App Store Connect API**.
2. Click **+** to generate a new key. Give it the **App Manager** role (needed to upload + submit).
3. Download the **`.p8` key file** — App Store Connect only lets you download it once, so keep it safe.
4. Note the **Issuer ID** (shown above the key list) and the **Key ID** (next to the key you just made).

### 3. Paste the key into Codemagic

1. In Codemagic: **Teams / Personal account → Integrations → App Store Connect → Manage keys → Add key**.
2. Name it exactly **`GoodTunes ASC API key`** (the pipeline references it by this name).
3. Upload the `.p8` file and paste in the **Issuer ID** and **Key ID**. Save.

Codemagic uses this key to **create/fetch the provisioning profile** automatically and to upload/submit builds. It does **not**, however, supply the signing *certificate's private key* — Apple's API physically cannot hand that out. That's what the next step is for.

### 3b. Distribution certificate (a persistent private key the API manages around)

An App Store build must be **signed with a distribution certificate's private key**. Apple's API can create the *provisioning profile* but cannot hand out a certificate's private key. The reliable way to give the cloud Mac a private key it can actually use is **not** a hand-exported `.p12` from Keychain Access — those load the certificate but fail to pair the private key on the build machine (`Cannot save Signing Certificates without certificate private key`, which then surfaces as a misleading "requires a provisioning profile with the Associated Domains and Push Notifications features" error). Instead we generate **one persistent private key**, hand it to Codemagic, and let the API create/reuse a certificate signed with it.

Do this once:

1. **Generate a persistent private key and copy it (base64).** On a Mac, in Terminal:
   ```sh
   openssl genrsa 2048 | base64 | pbcopy   # PEM private key, base64-encoded, now on your clipboard
   ```
   Keep this key safe — the same key is reused on every build, so don't regenerate it casually.
2. **Store it in Codemagic** → **Environment variables** → group **`apple_app`** (same group as `APP_STORE_APPLE_ID`), marked **Secure**:
   - `CERTIFICATE_PRIVATE_KEY` = the base64 text from step 1
   - *(The old `DIST_CERTIFICATE_P12` / `DIST_CERTIFICATE_PASSWORD` vars are no longer used and can be deleted.)*
3. **Enable the App ID's capabilities** in the Apple Developer portal → **Certificates, IDs & Profiles → Identifiers → `Io.GoGoods.music`**: tick **Associated Domains** and **Push Notifications**, then Save. The generated provisioning profile inherits these, so the archive won't fail asking for them.
4. **Clear out stale profiles** in the Apple portal → **Profiles**: delete any App Store profiles for `Io.GoGoods.music`. The pipeline's `--create` mints a fresh one that references the managed certificate and the App ID's capabilities.

On each build, the signing step decodes this key, runs `app-store-connect fetch-signing-files --create` (which finds or creates a distribution certificate matching the key and fetches/creates the profile), loads it into the build keychain, and points Xcode at it. After this one-time setup, builds are just button-clicks again. Apple caps you at a few distribution certs; if `--create` is ever blocked, revoke an old/unused one in the Apple portal → **Certificates** (revoking never affects apps already on the App Store — it only governs *future* signing).

### 4. Add the app's numeric "App Apple ID"

The build-number step needs to know which app to look up.

1. In App Store Connect → your **GoodTunes** app → **App Information** → **General Information**, copy the **Apple ID** (a long number, e.g. `6450000000`).
2. In Codemagic: **Environment variables**, create a **group** named **`apple_app`**, add a variable named **`APP_STORE_APPLE_ID`** with that number as the value. Save.

> The pipeline already references the `apple_app` group, so once the variable is in it, the build picks it up automatically.

### 5. (One-time, in App Store Connect) make a TestFlight tester group

So new builds auto-appear for your testers:
1. App Store Connect → **TestFlight** → **Internal Testing** → use the existing **`GoGoods Test Group`** (or create/rename one) and add yourself (and anyone else testing). The group name in `codemagic.yaml` (`beta_groups:`) must match this **exactly** — it's case- and space-sensitive, and a mismatch fails the build *after* the upload already succeeded.
2. The pipeline adds each new TestFlight build to that group by name. (If you name it differently, change `beta_groups` in `codemagic.yaml` to match.)

You're done. Everything below is just clicking buttons.

---

## How to cut a TestFlight build (the everyday flow)

1. In Codemagic, open the GoodTunes app → **Start new build**.
2. Pick the branch you want and the **`iOS → TestFlight`** workflow → **Start new build**.
3. Wait ~15–25 min. Codemagic builds + signs + uploads. You'll get an email when it's done.
4. Apple processes the build for ~10–20 min, then it shows up under **TestFlight → iOS Builds** and auto-lands in your **GoGoods Test Group** tester group.
5. Testers install/update via the **TestFlight** app on their phone.

No version bumping needed — the build number auto-increments every run.

---

## How to push the one-button App Store submit

When a TestFlight build looks good and you're ready to go live:

1. In Codemagic → **Start new build** → pick the **`iOS → App Store (submit for review)`** workflow → **Start new build**.
2. That's the button. It builds a fresh signed copy, uploads it, and **submits it to Apple review** automatically.
3. You'll still complete the store listing (screenshots, description, what's-new) in App Store Connect the first time — that's a Nick/marketing task (see task #556), not part of this pipeline.
4. Apple review usually takes ~24–48h. On approval, the app rolls out gradually over 7 days (**phased release** — you can speed it to "all at once" in App Store Connect if you want).

> If you click it twice by accident, the pipeline cancels the older pending submission so you won't get a "build already in review" error.

---

## Marketing version vs. build number

- **Build number** (the internal counter Apple uses to tell uploads apart) is bumped **automatically** every run. You never touch it.
- **Marketing version** (the "3.0.1" users see) is set by **one line in `codemagic.yaml`** — `agvtool new-marketing-version 3.0.1`, in the "Set the marketing version and auto-increment the build number" step. Apple **requires** every new build to carry a version *higher* than the latest version already on the App Store, or it rejects the upload (errors 90062 / 90478). The iOS project shipped pinned at `1.0`, which was below the live `3.0`, so we stamp the real version here instead.
  - **To ship a new version**, change that single number to something above the current store version (e.g. `3.0.2`, `3.1`, `4.0`) and re-run. That's the only edit you need.

---

## Android builds (automatic)

The Android workflow **auto-triggers on every push to `main`** (the `triggering:` block in `codemagic.yaml`) and uploads to the Play **internal testing** track only — never the public production track. The chain is merge → `scripts/post-merge.sh` force-pushes the GitHub mirror → GitHub webhook → Codemagic builds. It needs three things in place, all one-time:

1. In Codemagic, upload the GoodTunes **upload keystore** under **Code signing identities → Android keystores**, with reference name **`goodtunes_keystore`**.
2. Create a Play **service-account JSON** (Google Play Console → Setup → API access), and add it to a Codemagic env-var group named **`google_play`** as **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`**.
3. **Connect the Codemagic app to the GitHub mirror repo** so the push webhook reaches it (Codemagic → app settings → repository). Without this, the auto-trigger never fires.

Once those are set, builds run on their own; you can also start one by hand anytime (**Start new build** → branch `main` → `Android → Play internal testing`). It **runs the same icon guards iOS gets** (source + built-binary — see *Publishing reliability* below). Full operator runbook: [`google-play-setup.md`](./google-play-setup.md).

---

## Keeping the GitHub mirror small (history shrink)

Codemagic clones the build from the GitHub mirror, so a bloated git history makes
every checkout, clone, and mirror push slow and bandwidth-heavy. The culprit is
`attached_assets/` — it collects **every** file uploaded in chat (~3.1 GB across
~3,800 files), but the app only imports ~23 small images from it (the ones
referenced via `@assets/...`). The rest is screen recordings, screenshots and
zips that never reach the build.

Two layers keep this under control:

1. **Going forward (already in the repo):** `.gitattributes` routes large *non-build*
   media in `attached_assets/` (video, screen recordings, audio, archives) to **Git
   LFS** automatically, so future uploads of that kind don't fatten the regular git
   history. The post-merge mirror sync **uploads those LFS objects to GitHub's own LFS
   store** (targeted by object id) before it pushes — otherwise GitHub's `GH008`
   pre-receive hook rejects any commit that references an LFS object it doesn't have,
   which is exactly what happened when a 99 MB screen recording landed and silently
   broke every mirror push until it was uploaded. `.gitattributes` deliberately does
   **not** track images: the build imports specific images via `@assets/...`, and
   build-imported files (plus the iOS AppIcon PNGs) stay as **normal git blobs** so
   they never depend on LFS resolution at checkout and never consume the LFS quota.

   > **Heads-up on the LFS quota.** Total LFS is small today (~280 MB; GitHub's free
   > tier is 1 GiB storage + 1 GiB/month bandwidth), but every new screen recording
   > added to `attached_assets/` is ~100 MB and is uploaded to GitHub LFS on the next
   > merge. That's headroom for only a handful more before pushes start failing on
   > quota — at which point the one-time history shrink below becomes the real fix
   > (it strips those recordings from history entirely, so they never reach GitHub).

2. **One-time cleanup of the existing 2.4 GB of history (operator action, coordinated
   with Bill):** run [`scripts/shrink-git-history.sh`](../scripts/shrink-git-history.sh).
   It auto-derives the ~23 build-imported assets to **keep** and strips every other
   `attached_assets/` blob from **all** history with `git filter-repo`.

   ⚠️ **This rewrites history — it changes every commit SHA.** Do it deliberately:
   - Run on a **throwaway clone**, not your working repo.
   - `bash scripts/shrink-git-history.sh` first (dry run — prints the keep/strip plan
     and current `.git` size), then `--apply`.
   - Verify: `npm ci && npm run build` (the kept assets must still resolve) and
     `du -sh .git` (should drop dramatically).
   - **Force-push the mirror** afterwards (see
     [`.agents/memory/github-mirror-push.md`](../.agents/memory/github-mirror-push.md)
     for the token-auth + `--no-verify` + `GIT_LFS_SKIP_PUSH` push recipe).
   - Anyone with an existing clone (including the Replit project) must **re-clone**,
     since SHAs no longer match.

---

## If Codemagic is ever down (manual-Mac fallback)

Codemagic is the day-to-day path, but your Mac still works as a backup. The full Xcode/Android-Studio steps are in [`native-builds.md`](./native-builds.md): `npm run build && npx cap sync`, then **Product → Archive** in Xcode → **Distribute App → App Store Connect → Upload**. Same Apple account, same bundle id (`Io.GoGoods.music`), so a hand-cut build slots in next to the cloud builds without any conflict.

---

## Publishing reliability (two guards the pipeline runs for you)

These two safeguards were added after real failures and run automatically on
**both** iOS workflows — you don't configure anything. The **icon guard** below
also runs on the **Android** workflow (see *Android gets the icon guard too*);
the App Store Connect publish retry is iOS-only (the Play API doesn't need it —
see that note for why).

### 1. The build won't ship the generic placeholder icon

TestFlight builds 59, 64 and 66 shipped Apple's **generic placeholder** icon (a
white tile with light-blue arrows) instead of the navy "G" — even though the
committed icon artwork was correct. The cause is subtle: Xcode sometimes archives
the app **without baking the icon into the binary**, and iOS silently renders the
placeholder at display time. Xcode never fails the build over this.

There are now **two** icon guards:

- **Source guard** (`verify-ios-appicon.py`) — checks the committed
  `AppIcon.appiconset` *before* the archive.
- **Built-binary guard** (`verify-ios-ipa-icon.py`) — runs *after* `Build the
  signed .ipa`. It unzips the produced `.ipa`, runs macOS `assetutil` on the
  compiled `Assets.car`, and confirms a real app icon (≥120 px) is actually
  embedded. If it isn't, the build **hard-fails right there** so the placeholder
  binary never reaches Apple. (It also does a best-effort near-white check on any
  loose icon PNG to catch a placeholder-colored image.)

If you ever see the built-binary guard fail, the fix is on the **build** side, not
the artwork: re-run the build, and if it recurs confirm the App target's
`Assets.xcassets` is in **Copy Bundle Resources** and
`ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` (it is, today).

### 2. A transient App Store Connect 500 no longer wastes a whole build

App Store Connect occasionally returns a **`500 internal server error`** on the
post-upload poll **after the binary has already uploaded** ("UPLOAD SUCCEEDED with
no errors", then a 500). The old declarative publishing step treated that as fatal
and threw away the entire ~10-minute Mac build (this is what killed build 65).

Publishing is now a **scripted, retry-aware** step (`scripts/publish-ios.sh`):

- It lets the CLI auto-retry transient 5xx (`--altool-retries`,
  `--api-server-error-retries`).
- On failure it **checks whether the binary actually registered** on App Store
  Connect. If it did, it does **not** re-upload (a duplicate binary is rejected) —
  it retries only the submission. If it didn't, it retries the upload. Up to 4
  attempts with growing back-off.
- It **fails fast** (no pointless retries) on **deterministic** errors a retry
  can't fix — see the next row.

The behavior is otherwise identical to before: `iOS → TestFlight` submits to
TestFlight + the **GoGoods Test Group**; `iOS → App Store (submit for review)`
also submits to App Store review (after-approval, phased, cancel-previous).

> **Deterministic vs. transient.** A `500` on the upload poll is *transient* — the
> retry handles it. A message like **"Complete test information is required …
> missing required Beta App Review Information: First Name, Last Name, Phone
> Number, Email"** is **not** transient: it's a one-time setup task. Fill in
> **TestFlight → Test Information** (Beta App Information *Feedback Email* + Beta
> App Review Information contact name/phone/email) at
> `https://appstoreconnect.apple.com/apps/<APP_STORE_APPLE_ID>/testflight/test-info`,
> then re-run. The build that hit this still uploaded — internal testers may
> already have it — only the external beta-review submission failed.

### Android gets the icon guard too (but not the publish retry)

The Android workflow runs the **same two-layer icon protection** iOS gets:

- **Source guard** (`verify-android-appicon.py`) — before the build, checks the
  committed `res/` tree (per-density launcher rasters + adaptive-icon XML, plus
  the white-on-transparent notification silhouette).
- **Built-binary guard** (`verify-android-aab-icon.py`) — *after* `Build the
  signed .aab`. It unzips the produced `.aab`, confirms the adaptive-icon XML
  survived into the bundle, that the per-density `ic_launcher` rasters are
  actually packaged at the right sizes, and (best-effort) that the **navy brand
  icon — not a near-white blank/default — is embedded**. If not, the build
  **hard-fails right there** so an icon-broken bundle never reaches Google Play.
  (This catches the Android version of the iOS "source-correct, binary-wrong"
  failure that shipped a placeholder to TestFlight.)

The **publish retry is intentionally iOS-only.** Google Play's Developer API is
*transactional* — Codemagic inserts an edit, uploads the bundle, assigns the
track, then **commits**. A transient `5xx` *before* commit aborts the whole edit,
so nothing partially registers and a simple re-run cleanly re-does the upload
(re-uploading the same `versionCode` in a fresh edit is fine because the prior
edit was discarded). That removes the entire reason `publish-ios.sh` is complex:
App Store Connect can *register* a binary and then 500 the submission, which
forces the skip-upload / duplicate-binary handling — Play has no such
half-committed state. Google's publisher client also already retries transient
`5xx`/`429`. So Android publishing stays the simple declarative `google_play`
block. (If transient publish failures ever become common, the future path is
fastlane `supply`, pre-installed on the runner, with its own retry.)

### 3. Incomplete TestFlight Test Information fails in seconds, not after the build

The deterministic check above (in `scripts/publish-ios.sh`) only sees the missing
Test Information **after** the binary uploads — i.e. at the very end of a ~10–25
minute Mac build. To avoid wasting that build, an **up-front guard** now runs
right after the marketing-version guard, **before** `Build the signed .ipa`:

- **`verify-ios-testflight-info.py`** asks App Store Connect (via the same API key
  the rest of the pipeline uses) whether the app's **Beta App Review Information**
  (contact First/Last Name, Phone Number, Email — plus demo-account name/password
  when the app marks one required) and **Beta App Information** (Feedback Email)
  are filled in. If a required field is empty it **hard-fails in seconds** with the
  exact missing fields and the `…/testflight/test-info` URL to fix them.

It is **fail-open** on uncertainty — exactly like the marketing-version guard. If
the API credentials aren't present, the JWT libraries can't be loaded, the API
call errors, or the response shape is unexpected, it **warns and continues**
rather than blocking a legitimate build; it only hard-fails when App Store Connect
proves a required field is empty. The guard self-skips on any `PUBLISH_MODE` that
doesn't submit to TestFlight. (PyJWT + cryptography are pip-installed in the step
to sign the API request; if that install fails the guard simply fails open.)

### 4. Incomplete App Store listing metadata fails in seconds (appstore mode only)

The **`iOS → App Store (submit for review)`** workflow (`PUBLISH_MODE=appstore`)
doesn't just upload to TestFlight — it also submits the version to the **public App
Store review**. Apple rejects that submission when the version's **listing** is
incomplete, and (just like the Test Information case) only surfaces it at the very
end of a ~10–25 minute build. So an **appstore-only** up-front guard runs right
after the Test Information guard, **before** `Build the signed .ipa`:

- **`verify-ios-appstore-listing.py`** finds the version currently in a
  prepare-for-submission state and asks App Store Connect (via the same API key)
  whether its required listing fields are filled in: **screenshots**,
  **description**, **keywords**, **support URL**, the app-level **privacy-policy
  URL** (App Information), and the **age-rating** questionnaire. If a required field
  is empty it **hard-fails in seconds** with the exact missing fields and the
  `…/distribution` URL to fix them.

It is **fail-open** on uncertainty — exactly like the other guards. If the API
credentials aren't present, the JWT libraries can't be loaded, an API call errors,
the response shape is unexpected, or there simply is **no version in a
prepare-for-submission state**, it **warns and continues** rather than blocking a
legitimate build; it only hard-fails when App Store Connect proves a required field
is empty. The guard self-skips unless `PUBLISH_MODE=appstore` (a plain TestFlight
build never touches the public listing). Per-field nested lookups (screenshots,
privacy URL, age rating) each fail open on their own errors, so one flaky sub-call
never produces a false "missing" verdict.

---

## Quick troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Build fails at signing | The **`GoodTunes ASC API key`** integration isn't set, is misnamed, or the key lacks **App Manager** role. Re-check step 2–3. |
| "No app found for Apple ID" / build-number step fails | `APP_STORE_APPLE_ID` in the `apple_app` group is missing or wrong. It's the long number from App Information. |
| Build fails at **"Guard — fail fast if the BUILT .ipa ships Apple's placeholder icon"** | The archive compiled without the app icon (would ship the generic placeholder). Re-run; if it recurs, confirm `Assets.xcassets` is in Copy Bundle Resources and `ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon`. See *Publishing reliability* above. |
| Build fails at **"Guard — fail fast if TestFlight Test Information is incomplete"** | App Store Connect is missing required Beta App Review Information / Feedback Email. The guard prints the exact fields + the `…/testflight/test-info` URL. Fill them in, then re-run. Catches this in seconds *before* the build. See *Publishing reliability* above. |
| Publish fails with **"Complete test information is required" / "missing required Beta App Review Information"** | **Not transient** — fill in TestFlight → Test Information (Feedback Email + review contact name/phone/email), then re-run. The up-front guard usually catches this first; if it slipped through (fail-open), this post-upload check is the backstop. See *Publishing reliability* above. |
| Build fails at **"Guard — fail fast if the App Store listing metadata is incomplete"** (appstore submit) | App Store Connect is missing required listing fields on the in-prep version. The guard prints the exact fields (screenshots / description / keywords / support URL / privacy-policy URL / age rating) + the `…/distribution` URL. Fill them in, then re-run. Catches this in seconds *before* the build. See *Publishing reliability* above. |
| Publish logged a `500` but the build still made it | Expected — the scripted publish detects an upload that 500'd *after* registering and retries only the submission. No action needed. |
| Build uploads but never appears in TestFlight | Apple is still processing (give it 20 min), or the **GoGoods Test Group** name doesn't match App Store Connect exactly. |
| Android build fails | The `goodtunes_keystore` reference or `google_play` credentials aren't set yet — Android is off until you add them (see above). |
| Android build fails at **"Guard — fail fast if the BUILT .aab ships a wrong/blank launcher icon"** | The bundle didn't carry the real launcher icon (would ship a blank/default). The script prints exactly which density/asset is missing or whether the embedded icon read as near-white. Re-run; if it recurs, confirm the `res/mipmap-*` launcher rasters + `mipmap-anydpi-v26` adaptive XML are committed and that `minifyEnabled`/resource-shrinking isn't renaming them. See *Android gets the icon guard too* above. |
