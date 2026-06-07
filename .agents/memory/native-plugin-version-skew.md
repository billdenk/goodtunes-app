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
