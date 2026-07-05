---
name: Codemagic Xcode toolchain pin
description: Why codemagic.yaml pins an explicit Xcode instead of `xcode: latest`, and how the archive breaks otherwise.
---

The iOS Codemagic build pins an explicit `xcode:` in the shared `ios_env` anchor
(`codemagic.yaml`), NOT `xcode: latest` / `edge`. Currently pinned to the
last-known-good **26.3**.

**Why:** `xcode: latest` lets Codemagic silently roll the toolchain forward. When
it rolled to Xcode 26.4.1, the `Build the signed .ipa` step started failing with
"Failed to archive" (exit 65) even though NO app code changed — every earlier step
(web build, cap sync, pods, signing, all four guards) stayed green.

**THE TRAP — a `26.4` prefix pin drifts UP to the broken 26.4.1:** an explicit
`xcode: 26.4` pin does NOT protect against the break. Codemagic resolves `26.4`
*up* to the broken **26.4.1** point release, so a build pinned at `26.4` still ran
on 26.4.1 and still failed to archive. Any forward move must name a version
Codemagic offers as a stable image and be confirmed green — never trust a `26.x`
prefix.

**`ENABLE_USER_SCRIPT_SANDBOXING = NO` did NOT fix 26.4.1:** the standard CocoaPods
sandbox fix (set on the App target Debug+Release in `project.pbxproj`) was tried as
the "move forward instead of pin back" fix and was NOT sufficient — the 26.4.1
archive still failed with it in place. It stays committed (zero-risk: our project's
old implicit default was already NO, objectVersion 48), but it is not the answer to
the 26.4.1 break. The shipped fix is the pin-back to **26.3**, which archives
cleanly and still ships the iOS 26 SDK (ASC required iOS 26 SDK from 2026-04-28, so
26.3 satisfies it — pinning back costs nothing on the SDK front). Root cause of the
26.4.1 exit-65 stays OPEN (no `xcodebuild_logs` artifact was available); revisit by
reading that log if Bill supplies a failed build's artifact zip.

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
  newest specific 26.x that builds green (NOT a prefix that resolves up); don't
  restore `latest`. Verification is CI-only — re-run `ios-testflight`; on failure
  read the `xcodebuild_logs` artifact for the exact error and fix that specifically.
