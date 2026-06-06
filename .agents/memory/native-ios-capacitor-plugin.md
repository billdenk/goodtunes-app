---
name: In-tree native iOS Capacitor plugin
description: How native-only iOS capabilities (e.g. system volume) are added as an in-tree Swift plugin + gated in the shared web codebase.
---

Native-only iOS capabilities live as **in-tree Capacitor plugins committed to
`ios/App/App/*.swift`**, NOT npm packages.

**Why:** the GoodTunes apps are a thin Capacitor wrap of the same web app; a
one-off native bridge (system volume, etc.) doesn't warrant a published plugin.
`cap sync` only copies npm-package plugins — it will NOT pick up a `.swift` file
dropped into `ios/App`, and it won't delete it either.

**How to apply:**
- Write the Swift plugin as `CAPPlugin, CAPBridgedPlugin` with `@objc(<Name>Plugin)`,
  declaring `identifier` / `jsName` / `pluginMethods` (Capacitor 6 auto-registers
  bridged plugins; no separate Obj-C `.m` macro file needed).
- It MUST be added to the Xcode target by hand — edit `ios/App/App.xcodeproj/project.pbxproj`
  in 4 places: a `PBXBuildFile` entry, a `PBXFileReference` entry, the `App`
  `PBXGroup` children, and the `PBXSourcesBuildPhase` files list (mirror how
  `AppDelegate.swift` appears in all four). Use fresh unique 24-hex IDs.
- JS side: `registerPlugin<T>("<jsName>")` in a `client/src/lib/native*.ts`
  wrapper, fully guarded so it's a no-op on web.
- Gate the UI on `isNativeIOS` (show native-only) vs `isWebIOS` (hide on Safari)
  from `client/src/lib/platform.ts` — never raw `Capacitor.isNativePlatform()`.
- None of this compiles/tests in the Replit container (no Cocoapods/Xcode);
  correctness is verified only when a Mac cuts the build per `docs/native-builds.md`.

**System volume specifically:** read via `AVAudioSession.outputVolume`; SET only
by nudging a hidden off-screen `MPVolumeView`'s embedded `UISlider`
(`slider.value = x; slider.sendActions(for: .valueChanged)`) — there is no
public setter. Live hardware-button changes come from KVO on `outputVolume`.
