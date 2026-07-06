---
name: iOS scene manifest requires the phone window role (black-screen launch)
description: Why declaring a UIApplicationSceneManifest with only the CarPlay role black-screens the phone app at launch, and the required both-roles pattern.
---

**Rule:** once ANY `UIApplicationSceneManifest` exists in `ios/App/App/Info.plist`,
UIKit runs the WHOLE app on the UIScene lifecycle — the legacy
AppDelegate/`UIMainStoryboardFile` window path is ignored. The manifest must
therefore always declare the phone window role
(`UIWindowSceneSessionRoleApplication` → `SceneDelegate.swift` + the `Main`
storyboard, whose initial VC is Capacitor's `CAPBridgeViewController`) alongside
any CarPlay/other role. "Declare only the CarPlay role and the phone stays on
the legacy lifecycle" is WRONG — there is no such hybrid path.

**Why:** the v3.0.2 App-Store-approved build shipped a CarPlay-only manifest and
launched to a pure BLACK screen on every iPhone/iPad: iOS created a window-scene
session, found no configuration for it, and never built a window. Extra trap:
the Codemagic "Gate CarPlay out" step strips only the carplay-audio
*entitlement* from distribution archives — `Info.plist` (and so the manifest)
ships as committed, so a dev-profile device test with the entitlement present
doesn't prove the store binary's launch path.

**How to apply:**
- Never remove the `UIWindowSceneSessionRoleApplication` entry from the manifest.
- Under scenes, deep links (custom-scheme URLs + universal links) arrive on
  SceneDelegate (`openURLContexts` / `continue userActivity` + cold-launch
  `connectionOptions`), NOT AppDelegate — forward them to Capacitor's
  `ApplicationDelegateProxy`. APNs registration callbacks stay on AppDelegate.
- `applicationDidBecomeActive` does NOT fire under scenes — the navy WebView
  re-paint lives in `SceneDelegate.sceneDidBecomeActive`; SceneDelegate mirrors
  its window onto `AppDelegate.window` so window-reading code keeps working.
- `UIApplicationSupportsMultipleScenes` stays `true` (phone + CarPlay scenes
  must run simultaneously for CarPlay audio).
- An approved-but-broken version closes its version train: bump
  `MARKETING_VERSION` in codemagic.yaml + the Account.tsx version label
  (see ios-build-submission-gates.md).
