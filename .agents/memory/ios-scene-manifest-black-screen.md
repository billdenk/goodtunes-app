---
name: iOS scene manifest black-screens this Capacitor wrap
description: Why ANY UIApplicationSceneManifest risks black-screening the GoodTunes iPhone app, and the two-key Codemagic gate that keeps a CarPlay scene manifest out of unverified distribution builds.
---

**Rule (proven — apply extreme caution, not a blanket ban):** GoodTunes iOS
shipped working builds on the LEGACY UIApplication lifecycle — `Info.plist`
had `UIMainStoryboardFile = "Main"` and NO `UIApplicationSceneManifest`. Two
separate attempts at adding a scene manifest for CarPlay black-screened the
store-signed binary (history below), even when both a phone window role and a
CarPlay role were declared side by side — declaring both roles is NOT proven
safe for this remote-`server.url` Capacitor wrap, despite being the
documented Apple pattern. Any future CarPlay (or other scene-manifest) work
must ship behind a **build-time gate** that strips the manifest AND the
related entitlement from every distribution build by default, and must only
be verified via a cold launch of the actual **store-signed** binary on a real
device or the CarPlay Simulator — never a dev-profile build, and never code
review alone.

**History — both scene-manifest attempts failed, so don't trust "declare both roles" as safe:**
- A CarPlay-ONLY manifest (no phone window role) black-screened immediately:
  iOS created a window-scene session, found no configuration for it, and never
  built a window.
- Declaring BOTH roles — a phone window role backed by a hand-written
  `SceneDelegate` (+ storyboard) alongside a CarPlay scene role — still
  black-screened on TestFlight, even with a defensive manual-window fallback.
  The theory that "both roles declared = Apple's supported CarPlay-audio
  pattern" did not hold in practice and was never mechanically diagnosed
  further before being ripped out. Treat it as unverified, not safe-by-theory,
  every time it resurfaces.
- The proven fix each time: rip the manifest out entirely (delete the scene
  delegates, remove `UIApplicationSceneManifest` from `Info.plist`, remove the
  CarPlay entitlement). Manifest-free legacy lifecycle is the only
  known-good state.

**Extra trap (why a dev-device pass can lie):** if a build-time gate only
strips the CarPlay *entitlement* and leaves `UIApplicationSceneManifest`
committed in `Info.plist`, the manifest still ships in the distribution
archive — a dev-profile device test with the entitlement present does NOT
exercise the store binary's scene-lifecycle launch path at all. A gate meant
to keep an unverified scene manifest out of shipped builds must strip **both
the manifest key and the entitlement**, or it silently fails to protect
anything.

**How to apply:**
- Before re-adding or modifying any `UIApplicationSceneManifest` /
  scene-delegate code: confirm deep links (custom-scheme URLs + universal
  links) still resolve on both paths — legacy `AppDelegate`
  `application(_:open:options:)` / `application(_:continue:restorationHandler:)`,
  and (if a manifest is present) the scene-level equivalents on
  `SceneDelegate` — both should forward to Capacitor's `ApplicationDelegateProxy`.
- Never trust a scene-manifest change as working until it has been cold-launch
  tested on a real iPhone using the STORE-SIGNED distribution binary (gate
  flag deliberately flipped on for that one build only) — not a dev-profile
  build, not the simulator alone for the phone-launch path.
- Keep any such feature behind an env-gated build step that strips both the
  manifest and its entitlement by default, so an unverified regression can
  never reach a real user's shipped build.
- Separately, remote-`server.url` Capacitor apps also need `server.errorPath`
  set (offline.html) or a failed cold-launch network load leaves an unpainted
  (black) WKWebView forever with no retry — see
  remote-load-failure-black-screen.md. That failure mode is orthogonal to the
  manifest issue and its fix stays in place regardless.
- An approved-but-broken version closes its version train, and a build stuck
  in Apple beta review blocks new beta submissions in the SAME train (422
  "Another build is in review"). Bump `MARKETING_VERSION` (codemagic.yaml) +
  the Account.tsx version label to open a fresh train (see
  ios-build-submission-gates.md).
