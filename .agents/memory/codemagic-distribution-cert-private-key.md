---
name: Codemagic App Store signing needs a real distribution private key
description: How Codemagic iOS App Store builds actually sign on cloud Macs — supply your OWN persistent private key, let the ASC API manage the cert. Hand-exported .p12 does NOT work.
---

# Codemagic App Store signing: supply your own persistent private key, API-manage the cert

**Symptom chain when signing is broken:** the iOS build dies at "Build the signed .ipa"
(status 65) with a MISLEADING
`"App" requires a provisioning profile with the Associated Domains and Push Notifications features…`.
Ignore that text — it is almost never the profile. The decisive log is the
**"Set up iOS code signing" SETUP step**, not the archive step. There you'll see the
real failure: `Cannot save Signing Certificates without certificate private key` /
`Did not find any certificates` / empty `Signing Certificate:` + `Team Id:`.

**Root truth:** an App Store archive must be signed with a distribution certificate's
**PRIVATE KEY**. The App Store Connect API key (the `.p8`) authorizes API calls and can
create the *cert + profile*, but Apple's API physically cannot hand back a private key.
So the private key has to come from us.

## What does NOT work (we burned ~16h proving this)
- **Hand-exported `.p12` (cert + key) from macOS Keychain Access**, stored as
  `DIST_CERTIFICATE_P12` / `DIST_CERTIFICATE_PASSWORD` and loaded with
  `keychain add-certificates --certificate <p12> --certificate-password <pw>`.
  On the cloud Mac this repeatedly failed: the import log even confirmed
  **"private key FOUND"**, yet signing still errored
  `Cannot save Signing Certificates without certificate private key` — **even after**
  re-encoding the `.p12` from legacy RC2/3DES to modern AES (`openssl pkcs12 ... -descert`).
  Do not keep chasing the `.p12` path; it is a dead end here.

## What DOES work (the green path)
Let the ASC API **manage the certificate**, but feed it **our own persistent private key**
so the SAME cert is reused on every build (no key loss, no burning Apple's ~3-cert limit):

1. **One-time:** `openssl genrsa 2048 | base64 | pbcopy` → store as a **Secure** env var
   `CERTIFICATE_PRIVATE_KEY` in the Codemagic `apple_app` group. (Base64 of a PEM RSA key.)
2. **Signing step:**
   ```
   keychain initialize
   echo "$CERTIFICATE_PRIVATE_KEY" | base64 --decode > /tmp/cert_key.pem
   app-store-connect fetch-signing-files "Io.GoGoods.music" \
     --type IOS_APP_STORE --certificate-key @file:/tmp/cert_key.pem --create
   rm -f /tmp/cert_key.pem
   keychain add-certificates
   xcode-project use-profiles
   ```
   `--create` reuses the distribution cert matching our key if it exists, else mints one
   signed with our key (so we always hold the matching private half), and fetches/creates
   the App Store profile. A benign `security: SecKeychainItemImport: Unable to decode the
   provided data.` line appears right before `1 key imported. 1 certificate imported.` —
   ignore it, the import succeeded.
3. **App ID capabilities matter:** the auto-created profile inherits the App ID's
   capabilities, so **Associated Domains + Push Notifications must be enabled** on the
   `Io.GoGoods.music` identifier in the Apple Developer portal, or the archive bounces for
   real. (Push "Certificates (0)/Configure" is irrelevant — only the capability toggle.)

## Marketing-version gotcha (the LAST gate, after signing is green)
Signing/build/upload can all succeed and Apple still rejects at Publishing with
**90062** (`CFBundleShortVersionString must be higher than the previously approved version`)
and **90478** (`a later version has been closed for new build submissions`). Cause: the
Capacitor iOS project shipped pinned at `1.0`, far below the live store version. The CI
auto-increments the **build number** (CFBundleVersion) but NOT the **marketing version**
(CFBundleShortVersionString). Fix: stamp it in the build step with
`agvtool new-marketing-version <X>` where X exceeds the current store version (we used
`3.0.1` over a live `3.0`). It's one line in `codemagic.yaml` to bump per release.

## Reassurance for the operator
Creating/reusing certs or profiles never affects an app already live on the App Store —
Apple holds the signed binary; signing identity only governs future builds.

**Keys (this app):** bundle id `Io.GoGoods.music`, App Apple ID `6448246869`,
Team `UA7CR568RQ`, ASC API key "GoodTunes ASC API key". Build pulls from GitHub `main`
(`github.com/billdenk/goodtunes-app`), so changes must reach GitHub, not just Replit.
