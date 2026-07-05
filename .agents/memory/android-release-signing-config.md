---
name: Android release .aab must be signed in build.gradle
description: Why the Codemagic Android build produced an unsigned .aab Google Play rejected, and how signing is wired.
---

# Android release signing (Codemagic → Play)

Codemagic's `environment.android_signing: [goodtunes_keystore]` only makes the
uploaded keystore available and **exports env vars** — it does NOT auto-wire
signing into a native/Capacitor Gradle project (that auto-magic is Flutter-only).
The exported vars (confirmed against Codemagic docs):

- `CM_KEYSTORE_PATH`
- `CM_KEYSTORE_PASSWORD`
- `CM_KEY_ALIAS`
- `CM_KEY_PASSWORD`
- `CI=true` is also exported on Codemagic.

**The rule:** `android/app/build.gradle` must declare a `signingConfigs.release`
that reads those vars AND attach it to `buildTypes.release` (`signingConfig
signingConfigs.release`). Guard both on `System.getenv("CM_KEYSTORE_PATH")` so
local/dev builds (var absent) stay unsigned exactly as before — no regression.

**Why this bit us / the trap:** with no `signingConfig`, `gradlew bundleRelease`
silently emits an **unsigned** `.aab`. There's no build-time error — it fails
only at the very LAST step, the Play upload, with `Certificate issuer: None`,
`Certificate subject: None`, and `All uploaded bundles must be signed. Please
sign the bundle using jarsigner.` So a "green build that fails only on publish"
with those markers = missing/broken signing wiring, not a keystore-upload or
Play-API problem.

**How to apply / delivery:** this is an `android/` native-shell change, so it
only reaches Codemagic once the GitHub build mirror has the commit (see
github-mirror-push.md — the mirror is force-pushed on merges to main, not on a
plain checkpoint). Re-run android-internal only after the mirror syncs; if the
log still shows `Certificate issuer: None`, the mirror hasn't caught up.

**Belt-and-suspenders:** a "fail fast if the BUILT .aab is not signed" guard
step runs right after `bundleRelease` in codemagic.yaml — it asserts
`CM_KEYSTORE_PATH` is present and `jarsigner -verify`s the bundle, so a future
signing regression fails early with a clear message instead of at Play upload.
