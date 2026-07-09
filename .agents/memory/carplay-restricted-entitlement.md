---
name: CarPlay audio is a restricted (request-only) Apple entitlement
description: Why an App Store/TestFlight build fails signing even though CarPlay code+manifest are committed, and what operator step unblocks it.
---

`com.apple.developer.carplay-audio` is committed in `ios/App/App/App.entitlements`
plus the CarPlay role of the `Info.plist` scene manifest and
`CarPlaySceneDelegate.swift`. (The manifest must ALSO declare the phone window
role — a CarPlay-only manifest black-screens the phone at launch, see
ios-scene-manifest-black-screen.md.)
Device/simulator CarPlay testing works under a **development** profile with just
those committed files. But it is a **restricted** entitlement — NOT a normal
capability tick-box.

**Status (2026-07-07): GRANTED.** Apple approved the CarPlay-audio managed
entitlement on 2026-07-07 (email to admin@gogoods.io confirmed). Two portal
steps remain before a distribution build signs cleanly:
1. Developer portal → Identifiers → `Io.GoGoods.music` → tick **CarPlay** → Save.
2. Portal → Profiles → delete stale App Store profiles for `Io.GoGoods.music`.
3. Run a Codemagic `ios-distribution` (or Xcode archive) build — signs cleanly.

**Rule:** App Store / TestFlight (distribution) signing will FAIL until the
capability is ticked on the App ID AND stale profiles (minted before the grant)
are deleted. The `--create` step mints a fresh profile that carries CarPlay.

**Why:** Apple gatekeeps CarPlay behind a manual request form
(developer.apple.com/contact/carplay/). Only after approval does a "CarPlay"
capability appear in the App ID's capability list to tick; only then can a
distribution provisioning profile carry the entitlement.

**How to apply:** When a CarPlay build fails signing (or the CarPlay scene won't
load on a distribution build), don't touch code — it's the Apple-portal grant +
profile regen. After Apple grants it, delete stale App Store profiles for the
App ID so the pipeline's `--create` mints a fresh profile that carries CarPlay
(a cached profile without it keeps failing). Operator runbook: `docs/codemagic-builds.md` step 3,
`docs/native-builds.md` iOS CarPlay section.

**Pipeline no longer blocks on the grant.** codemagic.yaml's "Gate CarPlay out
of the distribution archive" step (in the shared iOS scripts, just before
build-ipa) PlistBuddy-deletes BOTH `com.apple.developer.carplay-audio` from
`App.entitlements` AND the whole `UIApplicationSceneManifest` key from
`Info.plist` before signing, BY DEFAULT, so TestFlight/App Store builds succeed
and revert to the known-good legacy (scene-manifest-free) lifecycle while the
Apple request is pending or unverified. (Earlier version of this gate only
stripped the entitlement, leaving the manifest — see
ios-scene-manifest-black-screen.md for why that alone still black-screened.)
Both keys stay committed in source (dev/simulator CarPlay unaffected); only the
signed distribution binary drops them, with a post-strip assertion that
hard-fails the build if either key is still present. To ship CarPlay once
granted AND real-device verified, set `CARPLAY_GRANTED=true` (also 1/yes/granted)
in Codemagic's `apple_app` group AND regen the profile — the step then keeps
both keys.
