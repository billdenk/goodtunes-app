---
name: Native plugin version skew + iOS icon
description: Why a new Capacitor plugin call shows a red "Unhandled promise rejection" banner on an installed native build, and why a single-size iOS app icon renders blank in TestFlight.
---

# Native plugin version skew (remote-origin bundle vs installed binary)

The native iOS/Android shells load the LATEST deployed web bundle from
`my.goodtunes.music` (remote origin), but the installed binary is whatever
Codemagic build the user has on their phone. So the JS can be NEWER than the
native binary.

**Symptom:** after shipping a new Capacitor plugin (e.g. push-notifications),
fans on an older binary get a global red `Unhandled promise rejection` banner:
`"<Plugin>" plugin is not implemented on ios`. The binary has no native side
for that plugin, so EVERY call rejects — including `addListener(...)`, which
returns a promise. An un-awaited `addListener` reject escapes to
`window.onunhandledrejection`, and GlobalErrorBoundary paints same-origin
rejections (the stack is on `my.goodtunes.music`, so it counts as "ours").

**Rule for any new native plugin used from shared web code:**
1. Gate on `Capacitor.isPluginAvailable("<Name>")` before touching it — older
   binaries skip cleanly.
2. `await` every plugin call (including `addListener`) inside a try/catch — an
   un-awaited reject becomes the banner.

**Why it matters / fast fix:** because the bundle is remote, a **republish
(web deploy) fixes the banner on the already-installed old binary** — you do
NOT need a new TestFlight/Codemagic build for the guard to take effect.

# Version-SKEW (republish) vs plugin-ABSENT (rebuild) — don't conflate

Two different failure modes with OPPOSITE fixes:
- **Skew** (above): plugin IS in the binary, JS is newer, an un-awaited
  reject paints the banner → a **web republish** fixes it.
- **Absent:** `Capacitor.isPluginAvailable("<Name>")` returns `false` on a
  native binary. The plugin is simply NOT in that build, so every bridge call
  no-ops silently (no banner if you gated correctly). A web publish can NEVER
  add a native plugin — this needs a fresh **Codemagic native rebuild**,
  regardless of how correct the source is.

**How to tell them apart without a Mac:** ship an operator-only, native-only
on-device DIAGNOSTIC via a normal web publish (the remote-origin shell picks
it up with no rebuild) that reads back `isNative`/`platform`/`isPluginAvailable`
plus the last args + `delivered = available()` for each bridge setter. This
resolved the Now Playing lock-screen/CarPlay fork: readout showed JS computing
100% correct title/artist/album/artwork but `pluginAvailable:false` +
`delivered:false` everywhere, and the lock screen showing the generic app
name + icon with a working scrubber = iOS auto-managing the WebView `<audio>`,
NOT our plugin. That pinned it to plugin-absent (rebuild), not a data-shape or
mediaSession bug — before spending a rebuild cycle on a guess.

**Sharper fork-decider — probe the SIBLING in-tree plugins too:** a single
`pluginAvailable:false` can't tell "stale install" from "this-plugin-specific
registration bug." Add the full native inventory to the diagnostic: the bridge
`Capacitor.PluginHeaders` name list + `isPluginAvailable` probes of the OTHER
hand-registered in-tree plugins (SystemVolume, SecureKeyStore). All the in-tree
Swift plugins compile & auto-register together (same CAPBridgedPlugin path), so
they share fate:
- ALL in-tree customs absent (PluginHeaders shows ONLY stock npm/core:
  App/CapacitorCookies/CapacitorHttp/Console/Filesystem/PushNotifications/
  SplashScreen/StatusBar/WebView) → the installed binary is STALE (predates the
  builds that compiled them) → Codemagic rebuild + reinstall IS the fix.
- siblings present but the one plugin absent → genuinely plugin-SPECIFIC bug →
  fix source, rebuild won't help by itself.
The Now Playing case resolved as the FIRST branch: on-device readout showed all
three customs (SystemVolume/SecureKeyStore/NowPlaying) missing while the 9 stock
plugins registered — even though the two siblings were added weeks earlier —
proving a stale install, not a NowPlaying wiring bug.

**Confirming source is correct (so a rebuild WILL fix it), all in-repo:**
in-tree iOS Swift plugin conforms to `CAPBridgedPlugin` with `jsName` matching
the JS `registerPlugin("<Name>")`; it's in the Xcode target in all 4 pbxproj
spots (PBXBuildFile, PBXFileReference, group children, Sources build phase) —
mirror a known-working sibling like `SystemVolumePlugin`; and no build-time gate
strips it (the CarPlay gate in codemagic.yaml strips only the carplay-audio
entitlement + `UIApplicationSceneManifest`, never the plugin sources).
`git log -S "<File>.swift in Sources" -- ...pbxproj` proving one add / never
removed = registration has been continuously present. **Keep the diagnostic in
place until the rebuild is installed and the readout flips to
`pluginAvailable:true` / `delivered:true` — that's the on-device proof; only
then remove the scaffolding.**

**iOS build trigger:** `ios-testflight` in codemagic.yaml has NO auto-trigger
(its `triggering:` block is commented out) — it's a MANUAL "Start new build"
in the Codemagic UI (unlike `android-internal`, which auto-builds on push). So
a native fix waits on an operator starting that build + App Store Connect
processing + the tester installing it.

# iOS app icon blank/generic in TestFlight

**Symptom:** home-screen + TestFlight tile is the blank/generic placeholder
even though `AppIcon.appiconset` has a valid icon and
`ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` is set.

**Cause:** the asset catalog had ONLY a single 1024×1024 `ios-marketing` icon
(the Capacitor template default). A single-size icon can fail to produce the
home-screen/TestFlight tile on Codemagic's `xcode: latest` toolchain.

**Fix:** ship the COMPLETE explicit icon set (all iPhone + iPad slots + 1024
marketing), every PNG opaque (PNG color type 2, NO alpha / no tRNS — Apple
rejects alpha in icons). Generate from the 1024 master with
`-alpha remove -alpha off`. Takes effect only in the NEXT signed build.
