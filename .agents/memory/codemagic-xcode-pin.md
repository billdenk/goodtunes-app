---
name: Codemagic Xcode toolchain pin
description: Why codemagic.yaml pins an explicit Xcode instead of `xcode: latest`, and how the archive breaks otherwise.
---

The iOS Codemagic build pins an explicit `xcode:` in the shared `ios_env` anchor
(`codemagic.yaml`), NOT `xcode: latest` / `edge`. Now on **26.4** (current), was
briefly on 26.3.

**Why:** `xcode: latest` lets Codemagic silently roll the toolchain forward. When
it rolled to Xcode 26.4.1, the `Build the signed .ipa` step started failing with
"Failed to archive" (exit 65) even though NO app code changed — every earlier step
(web build, cap sync, pods, signing, all four guards) stayed green. First unblock
was pinning back to the last-known-good 26.3; that pin was temporary because Apple
requires the current SDK (ASC required iOS 26 SDK from 2026-04-28), so we moved
forward to 26.4 with the archive break fixed at the source.

**The actual 26.4.x archive fix (what to do, not just pin back):** set
`ENABLE_USER_SCRIPT_SANDBOXING = NO` on the **App** target (both Debug+Release) in
`ios/App/App.xcodeproj/project.pbxproj`. Newer Xcode sandboxes run-script phases →
denies the CocoaPods `[CP] …` phases → archive aborts. Zero-risk: our project's old
implicit default was already NO (pbxproj is objectVersion 48).

**What NOT to change (researched, unneeded):**
- No `platform :ios` bump: Xcode 26 min is iOS 12, we're at 13.0, and Capacitor's
  `assertDeploymentTarget` post_install already stamps pod targets ≥13.0.
- Keep `cocoapods: default`: Codemagic curates each image's cocoapods to its Xcode;
  hard-pinning risks the OPEN Xcode-26 `objectVersion 70` cocoapods incompat (moot
  for us at objectVersion 48, but a pin freezes you off the image's version).

**How to apply:**
- Symptom "TestFlight archive fails, everything else green, no code changed" ⇒
  suspect a Codemagic Xcode roll first, not signing/cert/profile/icon.
- Keep the pin explicit. If Codemagic retires the pinned version, bump to the
  newest 26.x that builds green; don't restore `latest`. Verification is CI-only —
  re-run `ios-testflight`; on failure read the `xcodebuild_logs` artifact for the
  exact error and fix that specifically.
