---
name: iOS bundle id ≠ Android applicationId
description: The live App Store app uses a GoGoods-era iOS bundle id that differs from the Android applicationId; native iOS builds must sign that exact id.
---

# iOS app identity is `Io.GoGoods.music`, Android is `fm.goodtunes.player`

The live App Store Connect "GoodTunes" app (Apple ID `6448246869`, SKU `20230423gogoods-goodtunes`, team GoGoods Inc) ships under iOS bundle id **`Io.GoGoods.music`** — exact casing: capital `I`, lowercase `o`, then `.GoGoods.music`. This is a GoGoods-era identity. Apple does **not** allow changing an existing app's bundle id, so anything that signs/uploads iOS must use this exact string.

Android is a **separate** Play identity: applicationId/namespace `fm.goodtunes.player` (android/build.gradle, strings.xml, MainActivity package path). Do not unify them.

**Why:** the repo was originally configured with `fm.goodtunes.player` for BOTH platforms, but that never matched the live iOS app. Building iOS as `fm.goodtunes.player` would fail to upload into Apple ID 6448246869 (or silently target a different/new app). Bill chose to keep the existing live app + its users/history, so iOS was realigned to `Io.GoGoods.music`.

**How to apply:** the iOS bundle id lives in 5 spots that must stay in lockstep — `capacitor.config.ts` appId, `ios/App/App.xcodeproj/project.pbxproj` PRODUCT_BUNDLE_IDENTIFIER (×2), `codemagic.yaml` `ios_signing.bundle_identifier` (×2). Universal links add a 6th: `public/.well-known/apple-app-site-association` `appIDs` is `REPLACE_WITH_TEAM_ID.<iOS bundle id>` (the team-id sentinel is substituted at request time from `APPLE_TEAM_ID`); a wrong bundle id here silently breaks deep-linking into the iOS app. Codemagic's Android `--package-name` and all android/ files keep `fm.goodtunes.player`.
