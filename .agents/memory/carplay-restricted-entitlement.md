---
name: CarPlay audio is a restricted (request-only) Apple entitlement
description: Why an App Store/TestFlight build fails signing even though CarPlay code+manifest are committed, and what operator step unblocks it.
---

`com.apple.developer.carplay-audio` is committed in `ios/App/App/App.entitlements`
plus the CarPlay scene manifest in `Info.plist` and `CarPlaySceneDelegate.swift`.
Device/simulator CarPlay testing works under a **development** profile with just
those committed files. But it is a **restricted** entitlement — NOT a normal
capability tick-box.

**Rule:** App Store / TestFlight (distribution) signing will FAIL until Apple
grants CarPlay-audio on the App ID (`Io.GoGoods.music`, Apple ID 6448246869).

**Why:** Apple gatekeeps CarPlay behind a manual request form
(developer.apple.com/contact/carplay/, choose *CarPlay audio app*). Only after
approval does a "CarPlay" capability appear in the App ID's capability list to
tick; only then can a distribution provisioning profile carry the entitlement.
This is a code-side-complete / operator-blocked task: nothing in the repo can
grant it.

**How to apply:** When a CarPlay build fails signing (or the CarPlay scene won't
load on a distribution build), don't touch code — it's the Apple-portal grant +
profile regen. After Apple grants it, delete stale App Store profiles for the
App ID so the pipeline's `--create` mints a fresh profile that carries CarPlay
(a cached profile without it keeps failing). Operator runbook: `docs/codemagic-builds.md` step 3.
