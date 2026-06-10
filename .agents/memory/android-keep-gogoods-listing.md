---
name: Android keeps the com.gogoods_mobile Play listing
description: Android applicationId is the existing immutable Play package com.gogoods_mobile, deliberately decoupled from the Gradle namespace/Java package fm.goodtunes.player; assetlinks SHA is baked in, not env-driven.
---

# Android ships into the existing `com.gogoods_mobile` Play listing

The live Google Play listing is **`com.gogoods_mobile`** (the GoGoods-era app, ~100 installs + reviews). Play package names are immutable, so to keep that install base + reviews the build MUST upload under that exact applicationId — it cannot be renamed to `fm.goodtunes.player`.

## applicationId ≠ namespace ≠ iOS bundle id (three intentional identities)
- **Android `applicationId` = `com.gogoods_mobile`** — the Play package. Lives ONLY in `android/app/build.gradle` `defaultConfig.applicationId`, `public/.well-known/assetlinks.json` `package_name`, and Codemagic `--package-name`.
- **Gradle `namespace` / Java package = `fm.goodtunes.player`** — the `R` class root + source tree `android/app/src/main/java/fm/goodtunes/player/*`. Left UNCHANGED on purpose: `namespace` and `applicationId` are independent in Gradle, and moving the namespace would force relocating the Java source dirs for no benefit.
- **iOS bundle id = `Io.GoGoods.music`** — unrelated (see ios-bundle-id-vs-android.md). `capacitor.config.ts` `appId` is the iOS id and is NOT copied into build.gradle by `cap sync`, so the Android applicationId stays independent.

**Why decouple:** Bill wanted the existing Play listing's installs/reviews kept (immutable package) without disturbing the working Android source tree (namespace) or the live iOS app.

## assetlinks.json fingerprint is BAKED IN, not env-driven
`public/.well-known/assetlinks.json` carries the real Play **app-signing-key** SHA-256 directly (the `REPLACE_WITH_*` sentinel was removed). The fingerprint is public (it is literally served at that endpoint), so there is no secret to protect; baking it in makes the served file deterministic and kills the 503-when-env-unset failure mode. The server route still substitutes `ANDROID_RELEASE_SHA256` IF a sentinel ever reappears — a dormant key-rotation override only. Do NOT "restore" env substitution as the primary path.

## custom_url_scheme is inert
`strings.xml` `custom_url_scheme` was set to `com.gogoods_mobile` for tidiness, but NOTHING consumes it — Android deep-linking is via App Links on `https://my.goodtunes.music`, not a custom scheme. (Underscore is technically invalid in a URI scheme but moot since unused.)

## Operator gotchas (Codemagic → Play)
- **versionCode floor:** the listing already has PRODUCTION builds with high versionCodes. Codemagic must query `get-latest-build-number` across ALL tracks (internal/alpha/beta/production), not internal-only, or it falls back to 0 → versionCode 1 → Play rejects it as already-used.
- **Upload key + service account** must be the ones registered/granted for `com.gogoods_mobile`, or the upload is rejected regardless of build validity.
- **Republish required:** App Links won't verify for the new package until production is redeployed (so the new `assetlinks.json` is served on `my.goodtunes.music`) AND a fresh signed `.aab` with the new applicationId is installed.
