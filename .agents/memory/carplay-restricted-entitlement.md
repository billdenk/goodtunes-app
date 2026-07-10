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

## Runtime crash rule: never embed / double-push CPNowPlayingTemplate

**Symptom:** the granted CARPLAY_GRANTED build installs, the GoodTunes icon shows
in the CarPlay grid, but the app opens-then-crashes the instant a real head unit
connects (worst with music already playing). Crash log (`.ips`, bug_type 309,
EXC_CRASH/SIGABRT, voucher `CarPlayTemplateUIHost`) ends in
`objc_exception_throw` → `-[CPTabBarTemplate validateTemplates:]` →
`-[CPTabBarTemplate initWithTemplates:]`.

**Rule:** `CPTabBarTemplate.validateTemplates:` accepts ONLY
list / grid / information / point-of-interest / contact templates. Putting
`CPNowPlayingTemplate.shared` (or any non-container template) into a tab bar — or
into any container — throws an uncaught NSException → `abort()` on connect. Fix
was to stop embedding it: configure `CPNowPlayingTemplate.shared` and set the
root to the "Up Next" `CPListTemplate` directly.

**Why:** for a `carplay-audio` app CarPlay surfaces Now Playing on its OWN — it
adds the system Now Playing bar/button once `MPNowPlayingInfoCenter` has active
info (NowPlayingPlugin already populates it for the lock screen) and pushes
`CPNowPlayingTemplate.shared` on tap. Nothing to add to the hierarchy.

**How to apply:** if you ever want tapping a queue row to jump straight to Now
Playing, you may `interfaceController.pushTemplate(CPNowPlayingTemplate.shared,…)`
in the CPListItem handler — but FIRST check it isn't already in
`interfaceController.templates`; pushing a template already in the hierarchy
throws the SAME class of uncaught NSException. A CPListTemplate root with zero
sections is valid, and exceeding `CPListTemplate.maximumItemCount` truncates
silently (never throws), so an empty or huge queue can't abort. This crash class
only reproduces on a real head unit / CarPlay simulator, not the plain iOS
simulator.
