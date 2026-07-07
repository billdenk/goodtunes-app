---
name: iOS scene manifest black-screens this Capacitor wrap (CarPlay ripped out)
description: Why ANY UIApplicationSceneManifest black-screens the GoodTunes iPhone app at launch, why even the both-roles fix failed on-device, and the proven manifest-free legacy lifecycle.
---

**Rule (proven):** GoodTunes iOS is a Capacitor thin-wrap that MUST run the
LEGACY UIApplication lifecycle — `Info.plist` has `UIMainStoryboardFile = "Main"`
(initial VC = Capacitor's `CAPBridgeViewController`) and NO
`UIApplicationSceneManifest`. The moment ANY scene manifest exists, UIKit adopts
the UIScene lifecycle for the WHOLE app and the store-signed binary launches to a
solid BLACK screen on iPhone/iPad.

**History — BOTH scene attempts failed, so don't trust the "supported pattern":**
- v3.0.2 shipped a CarPlay-ONLY manifest (no phone window role) → black screen:
  iOS created a window-scene session, found no configuration for it, and never
  built a window.
- Build 75 (v3.0.3) then declared BOTH roles — `UIWindowSceneSessionRoleApplication`
  → a hand-written `SceneDelegate.swift` (+ Main storyboard) AND
  `CPTemplateApplicationSceneSessionRoleApplication` → `CarPlaySceneDelegate`,
  even with a defensive manual-window fallback in `scene(_:willConnectTo:)`. It
  STILL black-screened on TestFlight. The "declare both roles = Apple's supported
  CarPlay-audio pattern" theory did NOT hold in practice for this remote-`server.url`
  Capacitor wrap. Do not re-attempt it on the strength of the theory alone.
- Fix that shipped (v3.0.4): **CarPlay ripped out entirely** — deleted
  SceneDelegate.swift + CarPlaySceneDelegate.swift, removed the manifest from
  Info.plist, removed the `com.apple.developer.carplay-audio` entitlement, and
  removed the Codemagic "Gate CarPlay out of the distribution archive" step.
  Manifest-free legacy lifecycle is the known-good state that shipped working
  builds ≤3.0.1.

**Extra trap (why dev-device tests lied):** the Codemagic "Gate CarPlay out" step
only stripped the carplay-audio *entitlement* from the distribution archive —
`Info.plist` (and therefore the manifest) shipped as committed. A dev-profile
device test with the entitlement present did NOT exercise the store binary's
scene-lifecycle launch path. Only a cold launch of the store-SIGNED
(distribution) build on a real device proves the launch actually paints.

**How to apply:**
- Keep GoodTunes iOS manifest-free. Under the legacy lifecycle, deep links
  (custom-scheme URLs + universal links) arrive on AppDelegate
  `application(_:open:options:)` / `application(_:continue:restorationHandler:)`
  (both forward to Capacitor's `ApplicationDelegateProxy`); APNs registration
  callbacks stay on AppDelegate; the navy WebView re-paint lives in
  `applicationDidBecomeActive`. Nothing SceneDelegate used to do is orphaned.
- If CarPlay is EVER revisited it re-introduces a scene manifest, so it MUST be
  cold-launch tested on a real iPhone using the STORE-SIGNED distribution binary
  (not a dev-profile build) before shipping. Assume the phone window path is
  broken until proven otherwise on-device.
- Separately, remote-`server.url` Capacitor apps also need `server.errorPath` set
  (offline.html) or a failed cold-launch network load leaves an unpainted (black)
  WKWebView forever with no retry — see remote-load-failure-black-screen.md. That
  safety net is orthogonal to the manifest issue and stays in place.
- An approved-but-broken version closes its version train, and a build stuck in
  Apple beta review blocks new beta submissions in the SAME train (422 "Another
  build is in review"). Bump `MARKETING_VERSION` (codemagic.yaml) + the Account.tsx
  version label to open a fresh train (see ios-build-submission-gates.md).
