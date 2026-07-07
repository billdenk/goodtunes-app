---
name: Web boot-splash is the native cold-load splash (and how to keep its logo from drifting)
description: Why the GoodTunes wordmark "shifts down twice" on the iOS native splash, and the stable centering pattern that fixes it web-side.
---

# The web `#boot-splash` is what shows during a slow cold native launch

**Key fact:** the native apps load the REMOTE origin, and the Capacitor
`SplashScreen` overlay auto-hides at `launchShowDuration` (1200ms) — but a cold
TestFlight remote load takes ~4s. So for the ~3s gap the visible splash is the
WEBVIEW's `#boot-splash` in `client/index.html` (the small, 50%-ghosted
`goodtunes-logo-white-sm.png`), NOT the big full-opacity native `Splash.imageset`.
On warm/cached launches React mounts almost instantly, so the boot-splash logo
flashes too briefly to see → "just navy ~1s then Collection, no logo." A ghosted
small logo in a splash screenshot = this web boot-splash, every time.

**Why the logo "comes in high, shifts down, shifts down again":** two independent
drift sources during the slow cold load:
1. The `<img>` had `height:auto` with no reserved box → it popped from 0→height
   when the PNG finished downloading.
2. It was flex-centered inside `position:fixed; inset:0`, whose HEIGHT grows as
   iOS resolves the `viewport-fit=cover` safe-area insets during load (native
   `ios.contentInset:"always"` is a likely reflow trigger) → the flex center
   drifts downward as the viewport settles.

**Fix (web-only — ships via Publish, fixes the already-installed app, NO Codemagic
build):** split the splash — outer `#boot-splash` keeps plain `inset:0` navy fill
(covers BOTH safe-area insets, no white strip per `ios-safearea-white-statusbar-strip.md`);
inner stage is `position:absolute; top:0; height:100vh; flex-center` so the logo
centers against a CONSTANT full-screen height that WebKit latches to the large
viewport and does not re-derive from contentInset churn. Reserve the image box
with `aspect-ratio` (kills the load pop). Keep the whole thing INSIDE `#root` so
the boot-heal failsafe (React swap / watchdog / fatal banner replacing `#root`)
is preserved; `paintFatalBanner` uses z-index max-int so it still paints above the
splash's high z-index.

**Why this is safe but not proven:** `100vh` being more stable than `inset:0`
against the cold-load reflow is a theory that CANNOT be reproduced on desktop; but
it can't be WORSE than the old flex (worst case it degenerates to the same
behavior), and the `aspect-ratio` fix independently removes the definite pop.
**Verify on a physical iPhone via a cold TestFlight launch after Publish.** If one
residual downward shift survives, the `100vh` theory is falsified and the remaining
lever is native-side: raise `launchShowDuration` (or `launchAutoHide:false` +
web-side `SplashScreen.hide()` when React mounts) so the STABLE native overlay
covers the whole cold load — that needs a new native build.

**Warm-launch "no logo" is cosmetic, not a bug.** Making the logo appear
consistently on every launch would require moving the splash OUTSIDE `#root` plus a
minimum-display + deliberate blur/fade — a separate follow-up, not part of the
shift fix.
