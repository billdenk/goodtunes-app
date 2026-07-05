---
name: Codemagic Xcode toolchain pin
description: Why codemagic.yaml pins an explicit Xcode; and that exit-65 at "Build the signed .ipa" is a GENERIC xcodebuild failure with (so far) TWO distinct root causes — always read the actual error, never assume.
---

The iOS Codemagic build pins an explicit `xcode:` in the shared `ios_env` anchor
(`codemagic.yaml`), NOT `xcode: latest` / `edge`, so Codemagic can't silently roll
the toolchain forward onto an untested version without us choosing it.

**exit-65 is NOT a diagnosis — it's the generic `xcodebuild` "something failed"
code.** The `Build the signed .ipa` step has failed exit-65 for two completely
different reasons; the log's `❌` lines tell you which. ALWAYS read them:
  1. **Signing / provisioning regression** (Associated Domains + Push) — see below.
  2. **Swift availability compile error** — a `CompileSwift` failure with
     `❌ … 'X' is only available in iOS 14.0 or newer`. On build #43 the new
     `CarPlaySceneDelegate.swift` used seven iOS-14-only CarPlay template APIs
     while the app deployment target is iOS 13.0. Fix = gate the whole delegate
     with `@available(iOS 14.0, *)` (the class is instantiated only by NAME from
     Info.plist's CarPlay scene role, so it doesn't cascade onto the phone app;
     the app minimum stays 13.0). Do NOT roll Xcode back to dodge a real compiler
     error — Apple requires a current SDK for App Store submissions.

**Root cause #1 detail — the earlier 26.4.1 "Failed to archive" (exit 65) was a
signing regression, not a compiler break.** When `latest` rolled to Xcode 26.4.1 the
`Build the signed .ipa` step failed exit-65 with no app-code change (every earlier
step green). The failed console (`attached_assets/Pasted-Using-Xcode-26-4-1-*.txt`)
shows the real error:
`"App" requires a provisioning profile with the Associated Domains and Push
Notifications features.` This is the documented **Xcode 26.2+ archive-time
provisioning regression** — the newer toolchain's capability-resolution service
fails to see that the profile fetched by `fetch-signing-files` + applied by
`use-profiles` already carries the App ID's Associated Domains + Push caps.

**THE FIX:** add `-allowProvisioningUpdates` to the archive, via
`xcode-project build-ipa --archive-flags="-allowProvisioningUpdates"`. It lets
xcodebuild re-resolve/refresh the profile against Apple's backend using the ASC API
key the `app_store_connect` integration already exports (`APP_STORE_CONNECT_*`).
No-op when the local profile already satisfies signing, so it's safe to keep across
Xcode bumps.

**Two red herrings — do NOT chase these for this error:**
- `ENABLE_USER_SCRIPT_SANDBOXING = NO` (App target Debug+Release) is the standard
  CocoaPods run-script-sandbox fix and stays committed (zero-risk), but it did NOT
  fix 26.4.1 — that break was signing, not the sandbox.
- CarPlay grant. The error names ONLY Associated Domains + Push, never
  `carplay-audio`, so these logs predate the CarPlay entitlement. CarPlay is a
  SEPARATE operator-blocked signing blocker (see `carplay-restricted-entitlement.md`).

**Selector nuance:** Codemagic's `26.4` selector == `latest` == the current stable
release 26.4.1 (17E202); there's no finer `26.4.1` string, and 26.5/26.6/27 are
`edge` not stable. Pin the explicit `26.4` (stable), never `latest`/`edge`. The
memory's old "a `26.4` prefix drifts up to the broken 26.4.1" warning is now moot
*because we fixed 26.4.1* — but if a future patch bumps `26.4` to 26.4.2+, re-confirm
green.

**What NOT to change (researched, unneeded):** no `platform :ios` bump (Xcode 26
min is iOS 12, we're at 13.0, Capacitor's `assertDeploymentTarget` post_install
already stamps pod targets ≥13.0); keep `cocoapods: default` (Codemagic curates each
image's cocoapods to its Xcode; hard-pinning risks the OPEN Xcode-26 `objectVersion
70` incompat — moot at our objectVersion 48, but a pin freezes you off the image).

**How to apply:**
- Symptom "archive fails, everything else green, no code changed" ⇒ suspect a
  Codemagic Xcode roll first, then read the archive error — if it's
  "requires a provisioning profile with the Associated Domains and Push…" it's the
  26.2+ provisioning regression, add `-allowProvisioningUpdates`, do NOT re-try the
  sandbox setting or assume a compiler break.
- Verification is CI-only — re-run `ios-testflight`; on failure read the
  `/tmp/xcodebuild_logs/*.log` artifact for the exact error. Quick rollback if the
  archive still fails on 26.4: re-pin `xcode: 26.3` (known-green) while investigating,
  never restore `latest`.
