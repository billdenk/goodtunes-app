# Codemagic build cheat-sheet (cloud builds → TestFlight + one-button App Store)

This is the plain-English runbook for cutting GoodTunes iOS builds **without a Mac**. Codemagic rents cloud Macs, builds + signs the app for us, and drops each build straight into TestFlight. When you're ready to send a build to Apple for public review, you click **one button**.

The pipeline itself lives in [`codemagic.yaml`](../codemagic.yaml) at the repo root. You don't have to read it — this doc covers everything you actually do. For the older Mac-in-Xcode way (the fallback if Codemagic is ever down), see [`native-builds.md`](./native-builds.md).

> **Where Codemagic gets the code:** Codemagic builds from the GitHub mirror `github.com/billdenk/goodtunes-app` (branch `main`). Replit is the source of truth; GitHub is just a build mirror. That mirror now updates **automatically on every merge** to the project's main — `scripts/post-merge.sh` force-pushes the merged code to GitHub at the end of each merge, so a Codemagic build always picks up the latest. You don't push anything by hand. The sync now fetches GitHub's tip before pushing (so a diverged history can't balloon into a multi-GB pack that GitHub rejects with HTTP 500), uploads any new LFS objects so GitHub's `GH008` hook accepts the push, and — if it ever does fail — logs the **real git error** in the merge output instead of swallowing it. (If GitHub ever drifts behind anyway — e.g. the deploy key was removed — the manual catch-up recipe lives in `.agents/memory/github-mirror-push.md`.) The push authenticates with a **non-expiring, repo-scoped SSH deploy key** (the **`GITHUB_MIRROR_DEPLOY_KEY`** secret) — there is nothing to rotate on a schedule. See [*The GitHub mirror push deploy key*](#the-github-mirror-push-deploy-key-no-expiry) below for the one-time operator setup.

---

## What the pipeline does (the short version)

There are three "buttons" (workflows) in Codemagic:

| Button | What it does | When you click it |
|---|---|---|
| **iOS → TestFlight** | Builds the app on a cloud Mac, signs it, bumps the build number, and uploads it to **TestFlight** so testers can install it. Does **not** send anything to Apple review. | Day-to-day, whenever you want a fresh test build. |
| **iOS → App Store (submit for review)** | Same build, but it also **submits the build to Apple for public App Store review**. This is the "push the button" one. | Only when a build is ready to go live to everyone. |
| **Android → Play internal testing** | Builds a signed Android `.aab` and uploads it to Play internal testing. **Automatic, but only when the native shell changed** — a `when.changeset` filter skips the build for web/content/server/docs merges (they reach devices on republish). Requires the Android credentials + repo connection in Codemagic. | Native-shell merges (auto); force a build by hand anytime. |

Each one:
- Rebuilds the web app, packages it into the native shell, signs it with our Apple key, and **auto-increments the build number** so Apple never rejects a duplicate.
- Runs entirely on Codemagic's cloud Macs. Your Mac is only a backup.

Nothing reaches **Apple review** by accident: the two iOS workflows only run when **you** start them, and the App Store submit is a separate button from the TestFlight one, so you stay in control of what goes to public review. Android is the deliberate exception — it auto-builds (when the native shell changes — see [*Android builds*](#android-builds-automatic--only-when-the-native-shell-changes) below) and uploads **only to the Play internal testing track** (never the public Play production track), so testers always have the latest shell.

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
   - **CarPlay audio (`com.apple.developer.carplay-audio`) is a *restricted* entitlement — it is NOT a normal tick-box.** It's committed in `App.entitlements` + the `Info.plist` CarPlay scene manifest, so device/simulator testing works under a *development* profile, but **App Store / TestFlight signing will fail until Apple grants the capability on the App ID.** Request it once at **[developer.apple.com/contact/carplay/](https://developer.apple.com/contact/carplay/)** (choose *CarPlay audio app*, bundle id `Io.GoGoods.music`). Approval is a manual Apple review and can take days-to-weeks. Once granted, the **CarPlay** capability appears in the App ID's capability list — tick it and Save, exactly like Associated Domains / Push. Only then can a distribution profile be minted that carries the entitlement.
     - **You do NOT have to wait for that grant to ship builds.** By default the pipeline's *"Gate CarPlay out of the distribution archive"* step **strips** `com.apple.developer.carplay-audio` from the archive it signs, so iOS distribution builds succeed while the Apple request is pending. The entitlement stays committed in `App.entitlements` (dev/simulator CarPlay is unaffected) — only the signed distribution binary drops it.
     - **When Apple grants CarPlay:** (1) delete stale App Store profiles for `Io.GoGoods.music` (step 4 below) so `--create` mints one carrying CarPlay, then (2) add `CARPLAY_GRANTED` = `true` to the Codemagic **`apple_app`** variable group. The gate step then **keeps** the entitlement and the CarPlay scene ships in the next build. (Any of `true`/`1`/`yes`/`granted`, case-insensitive, enables it; unset or anything else strips it.)
4. **Clear out stale profiles** in the Apple portal → **Profiles**: delete any App Store profiles for `Io.GoGoods.music`. The pipeline's `--create` mints a fresh one that references the managed certificate and the App ID's capabilities. **Do this again after CarPlay is granted** so the regenerated profile picks up the new capability (otherwise a cached App Store profile without CarPlay will keep failing signing).

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

## Android builds (automatic — only when the native shell changes)

The Android workflow auto-triggers on pushes to `main` (the `triggering:` block in `codemagic.yaml`) and uploads to the Play **internal testing** track only — never the public production track. The chain is merge → `scripts/post-merge.sh` force-pushes the GitHub mirror → GitHub webhook → Codemagic. It needs three things in place, all one-time:

1. In Codemagic, upload the GoodTunes **upload keystore** under **Code signing identities → Android keystores**, with reference name **`goodtunes_keystore`**.
2. Create a Play **service-account JSON** (Google Play Console → Setup → API access), and add it to a Codemagic env-var group named **`google_play`** as **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`**.
3. **Connect the Codemagic app to the GitHub mirror repo** so the push webhook reaches it (Codemagic → app settings → repository). Without this, the auto-trigger never fires.

**It only builds when the native shell actually changed.** The apps are thin Capacitor shells that load the live site (`server.url = https://my.goodtunes.music`), so web, server, content, copy, pricing, and docs merges reach devices the moment the web app is republished — no new `.aab` is needed. To stop paying ~$0.50 per no-op Linux build, the workflow carries a `when.changeset` filter that **skips the build unless the merge touched a native-shell path**: the `android/` project (Gradle/Kotlin, manifest, launcher + splash icons, Capacitor sync artifacts), `capacitor.config.ts`, `package.json`, or `package-lock.json` (the last two catch added/updated Capacitor plugins). `codemagic.yaml` itself is always in the changeset, so editing the build config always builds. (iOS workflows are untouched — still manual, still on the free Mac minutes.)

**Why this is safe under the force-pushed mirror, and how it fails:** Codemagic computes the changeset against the **last successful build's commit** (not the webhook's before-SHA). Project `main` is append-only, so the mirror's defensive `git push --force` still presents a fast-forward and the diff is clean. When Codemagic *can't* anchor a clean base — the first build right after this filter lands, or a genuinely unreachable base — it **fails open and builds anyway**. That's the intended bias: a wasted ~$0.50 build beats silently shipping testers a stale native shell. The manual button (below) is the backstop for the rare wrong-skip.

**A guard catches the one dangerous drift automatically.** Because `includes:` disables Codemagic's default include-all, the silent risk is a *new* native-config path appearing in the repo that nobody adds to the list — a real native change would then auto-skip its build and ship testers a stale shell. The `codemagic-android-changeset-smoke` validation check (`scripts/verify-codemagic-android-changeset-smoke.py`, wrapping the `scripts/verify-codemagic-android-changeset.py` guard) parses the `android-internal` `when.changeset.includes` and **fails the build if a native-shell path that exists on disk isn't covered** — e.g. a migration to `capacitor.config.{js,json}`, or `android/` / `package.json` / `package-lock.json` dropping off the list. If you ever add a new native-config file, add it to the `includes` list and that check goes green again.

Once those are set, builds run on their own when the shell changes; you can also **force a build by hand anytime** (**Start new build** → branch `main` → `Android → Play internal testing`) — manual builds ignore the `when.changeset` filter and always run. It **runs the same icon guards iOS gets** (source + built-binary — see *Publishing reliability* below). Full operator runbook: [`google-play-setup.md`](./google-play-setup.md).

---

## The GitHub mirror push deploy key (no expiry)

The automatic mirror push authenticates with a single secret — **`GITHUB_MIRROR_DEPLOY_KEY`**
(stored in Replit Secrets, read by `scripts/post-merge.sh` → `sync_github_build_mirror`). It is
the **private half of an SSH deploy key** scoped to **just the `billdenk/goodtunes-app` repo**,
with **write access** (that's what lets the code + Git-LFS objects push to the mirror over SSH).

**Why a deploy key instead of a token:** the old approach used a fine-grained personal access
token (`GITHUB_TOKEN`) that GitHub forces to expire every ~90 days. When it lapsed, the
post-merge mirror push failed *silently* (best-effort, only logs a WARNING, never fails the
merge), so iOS quietly built from stale code and Android internal-testing testers kept getting
the old `.aab` with no failed-build signal. A **repo-scoped SSH deploy key does not expire**, so
there is nothing to rotate on a schedule and no expiry watcher to maintain. (The Task #2084
token-expiry pre-warn scheduler was retired along with the PAT.)

**Security properties of the current setup:**
- The push uses SSH (`git@github.com:billdenk/goodtunes-app.git`), not HTTPS.
- The private key is written to a `600` temp file at sync time and **shredded by a `RETURN`
  trap** the moment the function exits — it never persists on disk and never appears in logs.
- GitHub's SSH host keys are **pinned** via a bundled `known_hosts` (the three keys GitHub
  publishes at `https://api.github.com/meta`) with `StrictHostKeyChecking=yes`, so the push
  can't be MITM'd by a spoofed `github.com`.
- If `GITHUB_MIRROR_DEPLOY_KEY` is unset, the sync **skips gracefully** (logs a one-line
  notice, returns 0) — exactly like the old token-absent no-op.

**One-time operator setup (Bill does the GitHub part — the agent can't):**
1. Generate a fresh keypair locally (no passphrase, so CI can use it non-interactively):
   ```bash
   ssh-keygen -t ed25519 -C "goodtunes-mirror-deploy" -N "" -f goodtunes_mirror_deploy
   # creates goodtunes_mirror_deploy (private) and goodtunes_mirror_deploy.pub (public)
   ```
2. Add the **public** key to the mirror repo: **https://github.com/billdenk/goodtunes-app/settings/keys**
   → **Add deploy key** → paste the contents of `goodtunes_mirror_deploy.pub`, **check "Allow
   write access"**, save.
3. Save the **private** key (`goodtunes_mirror_deploy`, the full
   `-----BEGIN OPENSSH PRIVATE KEY-----` … `-----END OPENSSH PRIVATE KEY-----` block) as the
   **`GITHUB_MIRROR_DEPLOY_KEY`** secret in Replit (Secrets pane, or hand it to the agent's
   secret-request prompt — never paste a private key into chat, a doc, or a commit). Then delete
   both local key files. *Don't sweat exact formatting:* the sync rebuilds a canonical PEM from
   the secret before use, so a paste that collapsed the key's line breaks into spaces or added
   stray whitespace (a common secret-store quirk that otherwise surfaces as `Load key: error in
   libcrypto` / `Permission denied`) still works — just make sure the whole
   `-----BEGIN…END-----` block is present.
4. The next real merge's `sync_github_build_mirror` step force-pushes over SSH and logs success
   (no WARNING). To verify host-key pinning + key acceptance without pushing:
   ```bash
   ssh -i <path-to-private-key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
     -o UserKnownHostsFile=<bundled known_hosts> -o BatchMode=yes -T git@github.com
   # "Hi billdenk/goodtunes-app! You've successfully authenticated…" = key works
   # "Host key verification failed" = pinned known_hosts is stale (refresh from api.github.com/meta)
   ```

The sync mechanism itself (fetch-first, LFS upload, lockfile sanitize, time budget, force-push)
is unchanged; see [`.agents/memory/github-mirror-push.md`](../.agents/memory/github-mirror-push.md).

### A drift signal when the mirror falls behind (read-only)

The mirror only auto-syncs when an **isolated task agent merges** to project main (that's when
`post-merge.sh` runs `sync_github_build_mirror`). A fix that lands via a **main-agent checkpoint**
(no task merge) never triggers that step, so the mirror silently stays behind and Codemagic keeps
building **stale** code with no failed-build signal — exactly how the CarPlay iOS-14 fix left the
mirror stale until a manual catch-up push.

`scripts/check-github-mirror-freshness.sh` (registered as the **`mirror-freshness`** validation
check) surfaces that drift. It reuses the same deploy key + pinned known_hosts as the sync to
`git ls-remote` the mirror's `refs/heads/main` tip **read-only (it never pushes)** and compares it
to local project `main`:

- **current** (tip == project main) → passes quietly.
- **behind by N** (tip is an ancestor of project main) → passes but prints a loud `WARNING —
  mirror is BEHIND project main by N commit(s)` and lists the missing commits. It does **not** fail
  the run, because every in-flight task legitimately sits ahead of the mirror and the gap self-heals
  on the next merge's force-push; a *persistent* behind-count across tasks is the signal that a fix
  landed via a checkpoint and needs a manual catch-up (recipe in
  [`.agents/memory/github-mirror-push.md`](../.agents/memory/github-mirror-push.md)).
- **diverged** (tip is not an ancestor of project main) → **fails** (exit 1); this is the one
  genuinely actionable state and needs a real force-push through an isolated task agent (the main
  agent can't force-push).
- **key unset / mirror unreachable** → skips cleanly (exit 0); that's infra, not drift.

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

### The Xcode toolchain is pinned to a specific stable Xcode (26.4) — keep it explicit, never `latest`

`codemagic.yaml` pins **`xcode: 26.4`** in the shared `ios_env` block. That
selector maps to **Xcode 26.4.1 (17E202)**, Codemagic's current default/`latest`
*stable* release (Codemagic exposes no finer `26.4.1` string, and there is no
higher `26.4.x` for it to drift to; `26.5`/`26.6`/`27` are `edge`, not stable). We
pin the explicit `26.4` selector rather than `latest`/`edge` so a future silent
roll to a new major can't break the archive without us choosing it.

**History — the 26.4.1 "Failed to archive" (exit 65) break, root-caused.** The
block used to say `xcode: latest`; when Codemagic rolled `latest` forward to
26.4.1 the archive step (`Build the signed .ipa`) started failing with **"Failed
to archive" (exit 65)** with no app-code change — every earlier step (web build,
Capacitor sync, CocoaPods, signing, all four guards) stayed green, so #2551 pinned
back to the last-known-good **26.3** as a stopgap. Reading an actual failed 26.4.1
console (`attached_assets/Pasted-Using-Xcode-26-4-1-*.txt`) finally identified the
real error — it is **not** a compiler/link break:

```
❌ "App" requires a provisioning profile with the Associated Domains and Push
   Notifications features. Select a provisioning profile in the Signing &
   Capabilities editor.
Failed to archive ios/App/App.xcworkspace
Step 8 script `Build the signed .ipa` exited with status code 65
```

This is the documented **Xcode 26.2+ archive-time provisioning regression**: the
newer toolchain's capability-resolution service fails to recognize that the App
Store profile fetched by `app-store-connect fetch-signing-files` and applied by
`xcode-project use-profiles` **already carries** the App ID's Associated Domains +
Push capabilities. (It names only those two capabilities, never `carplay-audio` —
confirming these logs predate the CarPlay entitlement and that this is a *separate*
problem from the operator-blocked CarPlay grant; see
`.agents/memory/carplay-restricted-entitlement.md`.)

**The fix (at source):** pass **`-allowProvisioningUpdates`** to the archive via
`xcode-project build-ipa --archive-flags="-allowProvisioningUpdates"` (see the
`Build the signed .ipa` step). That lets `xcodebuild` re-resolve/refresh the
profile against Apple's backend using the **same App Store Connect API key** the
`app_store_connect` integration already exports (`APP_STORE_CONNECT_*`), so the
capability check passes. It is a no-op on toolchains where the local profile
already satisfies signing, so it is safe to keep across Xcode bumps. The earlier
`ENABLE_USER_SCRIPT_SANDBOXING = NO` change was **unrelated** and never fixed this.

> **Verification is CI-only.** This fix cannot be exercised from the workspace —
> re-run the **`ios-testflight`** workflow (pinned at `26.4`) to confirm a green
> archive. If it fails again, download the **`/tmp/xcodebuild_logs/*.log`**
> artifact and read the exact error before changing code. If the archive error is
> still the provisioning message above, the quickest rollback is to re-pin
> `xcode: 26.3` (known-green) while investigating — do not float back to `latest`.

**Second break — the exit-65 "build-graph cycle" (surfaced once provisioning was
fixed).** The first build carrying `-allowProvisioningUpdates` (Xcode 26.4.1)
cleared the provisioning error but the archive **still** failed exit 65 — and it
failed **fast (~13s, before any real compilation)**. The only flagged console
line was the CocoaPods **`[CP] Embed Pods Frameworks`** phase warning: *"will be
run during every build because it does not specify any outputs."* A ~13-second
failure is the build **dependency graph** being rejected up front (a *cycle*),
**not** the embed script failing to *run* (that would fail minutes in, after
compiling), and **not** the script sandbox (`ENABLE_USER_SCRIPT_SANDBOXING` is
already `NO`). Root cause: Capacitor's generated `ios/App/Podfile` set `install!
'cocoapods', :disable_input_output_paths => true`, which leaves the `[CP]` script
phases with **no declared outputs**; Xcode 26.3 tolerated the resulting graph, but
26.4.1's stricter build system rejects it.

**The fix:** flip that Podfile flag to `install! 'cocoapods',
:disable_input_output_paths => false` (the CocoaPods default) so `pod install`
regenerates proper input/output `.xcfilelist`s and Xcode can order the phases.
It's safe on CI — every build is a fresh clone + `pod install`, so the
stale-Pods-cache dev ergonomics the Capacitor comment worried about don't apply.
**Confirmed green (Jul 2026):** with the flag flipped, the archive succeeded and
build **3.0.2 (72)** uploaded to App Store Connect (reached "Waiting for Review"),
so the two 26.4.1 archive fixes — `-allowProvisioningUpdates` + this
`disable_input_output_paths => false` — together restore the end-to-end
`ios-testflight` pipeline. If a future archive exit-65s again, download the
**`/tmp/xcodebuild_logs/*.log`** artifact and search it for `Cycle`, `error:`, or
`PhaseScriptExecution failed` for the exact cause before changing more.

The **`ENABLE_USER_SCRIPT_SANDBOXING = NO`** build setting stays committed on the
**App** target (`ios/App/App.xcodeproj/project.pbxproj`, both Debug and Release).
Newer Xcode sandboxes run-script build phases, which can deny the CocoaPods
`[CP] …` phases (`Embed Pods Frameworks`, `Copy Pods Resources`, `Check Pods
Manifest.lock`) and abort the archive. It's the standard CocoaPods fix and is
**zero-risk here** (our project's old implicit default was already `NO`), so we
keep it — it just wasn't the cause of the 26.4.1 break.

Two things we deliberately did **not** change, because research showed they
weren't needed:

- **No deployment-target bump.** Xcode 26's minimum is iOS **12**; we're already at
  **13.0**, and Capacitor's `assertDeploymentTarget` `post_install` hook (in
  `ios/App/Podfile`) already stamps every *pod* target to ≥13.0. Raising
  `platform :ios` would only drop older-device support for no build benefit.
- **`cocoapods: default` stays.** Codemagic keeps each image's bundled CocoaPods in
  lock-step with that image's Xcode, so `default` on the 26.4 image is the safest
  choice. Hard-pinning (e.g. `1.16.2`) would risk the still-open Xcode-26
  `objectVersion 70` CocoaPods incompatibility — not a concern for us *today* (our
  `project.pbxproj` is `objectVersion 48`), but a pin would freeze us on a version
  that can't move forward with the image.

Keep the pin **explicit** (never `latest`/`edge`). To move forward again (e.g. if
Apple starts rejecting 26.4-built uploads), pin the newest Xcode version Codemagic
offers as a **stable** image, confirm it archives green (re-run `ios-testflight`),
and only then commit the bump. **Do not use a bare `26.x` prefix that could resolve
up to an untested point release** — the original break happened exactly because a
`latest`/prefix pin silently drifted onto 26.4.1. If an archive ever fails, **read
the `xcodebuild_logs` artifact for the exact error** and fix that specifically.

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
