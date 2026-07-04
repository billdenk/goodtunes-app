---
name: Codemagic Xcode toolchain pin
description: Why codemagic.yaml pins an explicit Xcode instead of `xcode: latest`, and how the archive breaks otherwise.
---

The iOS Codemagic build pins an explicit `xcode:` in the shared `ios_env` anchor
(`codemagic.yaml`), NOT `xcode: latest` / `edge`.

**Why:** `xcode: latest` lets Codemagic silently roll the toolchain forward. When
it rolled to Xcode 26.4.1, the `Build the signed .ipa` step started failing with
"Failed to archive" (exit 65) even though NO app code changed — every earlier step
(web build, cap sync, pods, signing, all four guards) stayed green. It was purely
the toolchain. The fix was pinning to the last-known-good version the previous
green TestFlight build ran on.

**How to apply:**
- Symptom "TestFlight archive fails, everything else green, no code changed" ⇒
  suspect a Codemagic Xcode roll first, not signing/cert/profile/icon.
- Keep the pin explicit. If Codemagic retires the pinned version, bump to the
  newest generation that still predates the break; don't restore `latest`.
- Moving ONTO a newer Xcode later (App Store SDK minimums) is a deliberate change:
  raise `platform :ios` in `ios/App/Podfile` (+ stamp in `post_install`), pin
  `cocoapods:` to a compatible version, and only if the real error is script
  sandboxing set `ENABLE_USER_SCRIPT_SANDBOXING = NO` on the App target.
