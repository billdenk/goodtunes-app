---
name: iOS bundle id ≠ Android applicationId
description: The live App Store app uses a GoGoods-era iOS bundle id that differs from the Android applicationId; native iOS builds must sign that exact id.
---

# iOS app identity is `Io.GoGoods.music`, Android applicationId is `com.gogoods_mobile`

The live App Store Connect "GoodTunes" app (Apple ID `6448246869`, SKU `20230423gogoods-goodtunes`, team GoGoods Inc) ships under iOS bundle id **`Io.GoGoods.music`** — exact casing: capital `I`, lowercase `o`, then `.GoGoods.music`. This is a GoGoods-era identity. Apple does **not** allow changing an existing app's bundle id, so anything that signs/uploads iOS must use this exact string.

Android is a **separate** identity. The **applicationId is `com.gogoods_mobile`** — the existing, immutable Google Play listing (kept for its installs + reviews). The Gradle **`namespace` / Java package stays `fm.goodtunes.player`** (the `R` root + `android/app/src/main/java/fm/goodtunes/player/*` source tree), which is independent of the applicationId. See `android-keep-gogoods-listing.md` for the full rationale. Do not unify any of the three.

**Why:** the repo was originally configured with `fm.goodtunes.player` for BOTH platforms, but that never matched either live store app. iOS was realigned to `Io.GoGoods.music` (the live App Store app), and Android's applicationId was realigned to `com.gogoods_mobile` (the live Play listing) so both keep their existing users/history — Bill's call.

**How to apply:** the iOS bundle id lives in 5 spots that must stay in lockstep — `capacitor.config.ts` appId, `ios/App/App.xcodeproj/project.pbxproj` PRODUCT_BUNDLE_IDENTIFIER (×2), `codemagic.yaml` `ios_signing.bundle_identifier` (×2). Universal links add a 6th: `public/.well-known/apple-app-site-association` `appIDs` is `REPLACE_WITH_TEAM_ID.<iOS bundle id>` (the team-id sentinel is substituted at request time from `APPLE_TEAM_ID`); a wrong bundle id here silently breaks deep-linking into the iOS app. The Android applicationId `com.gogoods_mobile` lives in `android/app/build.gradle` `defaultConfig.applicationId`, `assetlinks.json` `package_name`, and Codemagic `--package-name`; the Gradle `namespace` and all `android/.../java/fm/goodtunes/player/*` files keep `fm.goodtunes.player`.
