# Codemagic build cheat-sheet (cloud builds → TestFlight + one-button App Store)

This is the plain-English runbook for cutting GoodTunes iOS builds **without a Mac**. Codemagic rents cloud Macs, builds + signs the app for us, and drops each build straight into TestFlight. When you're ready to send a build to Apple for public review, you click **one button**.

The pipeline itself lives in [`codemagic.yaml`](../codemagic.yaml) at the repo root. You don't have to read it — this doc covers everything you actually do. For the older Mac-in-Xcode way (the fallback if Codemagic is ever down), see [`native-builds.md`](./native-builds.md).

> **Where Codemagic gets the code:** Codemagic builds from the GitHub mirror `github.com/billdenk/goodtunes-app` (branch `main`). Replit is the source of truth; GitHub is just a build mirror. That mirror now updates **automatically on every merge** to the project's main — `scripts/post-merge.sh` force-pushes the merged code to GitHub at the end of each merge, so a Codemagic build always picks up the latest. You don't push anything by hand. (If GitHub ever drifts behind — e.g. the push token was revoked — the manual catch-up recipe lives in `.agents/memory/github-mirror-push.md`.)

---

## What the pipeline does (the short version)

There are three "buttons" (workflows) in Codemagic:

| Button | What it does | When you click it |
|---|---|---|
| **iOS → TestFlight** | Builds the app on a cloud Mac, signs it, bumps the build number, and uploads it to **TestFlight** so testers can install it. Does **not** send anything to Apple review. | Day-to-day, whenever you want a fresh test build. |
| **iOS → App Store (submit for review)** | Same build, but it also **submits the build to Apple for public App Store review**. This is the "push the button" one. | Only when a build is ready to go live to everyone. |
| **Android → Play internal testing** | Builds a signed Android `.aab` and uploads it to Play internal testing. **Off by default** — ignore it until we want Android. | Later, if/when we ship Android. |

Each one:
- Rebuilds the web app, packages it into the native shell, signs it with our Apple key, and **auto-increments the build number** so Apple never rejects a duplicate.
- Runs entirely on Codemagic's cloud Macs. Your Mac is only a backup.

Nothing reaches Apple or Google by accident: every button only runs when **you** start it. The App Store submit is a separate button from the TestFlight one, so you stay in control of what goes to review.

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

## Turning on Android later (optional)

The Android button is in the config but **dormant** — it never runs unless you start it. When we want Android:

1. In Codemagic, upload the GoodTunes **upload keystore** under **Code signing identities → Android keystores**, with reference name **`goodtunes_keystore`**.
2. Create a Play **service-account JSON** (Google Play Console → Setup → API access), and add it to a Codemagic env-var group named **`google_play`** as **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`**.
3. Start the **`Android → Play internal testing`** workflow. It builds a signed `.aab` and uploads to the internal track.

Until you do all three, just leave it alone — it costs nothing sitting idle.

---

## If Codemagic is ever down (manual-Mac fallback)

Codemagic is the day-to-day path, but your Mac still works as a backup. The full Xcode/Android-Studio steps are in [`native-builds.md`](./native-builds.md): `npm run build && npx cap sync`, then **Product → Archive** in Xcode → **Distribute App → App Store Connect → Upload**. Same Apple account, same bundle id (`Io.GoGoods.music`), so a hand-cut build slots in next to the cloud builds without any conflict.

---

## Quick troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Build fails at signing | The **`GoodTunes ASC API key`** integration isn't set, is misnamed, or the key lacks **App Manager** role. Re-check step 2–3. |
| "No app found for Apple ID" / build-number step fails | `APP_STORE_APPLE_ID` in the `apple_app` group is missing or wrong. It's the long number from App Information. |
| Build uploads but never appears in TestFlight | Apple is still processing (give it 20 min), or the tester group name in `beta_groups` doesn't match App Store Connect. |
| Android build fails | The `goodtunes_keystore` reference or `google_play` credentials aren't set yet — Android is off until you add them (see above). |
