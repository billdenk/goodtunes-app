---
name: iOS safe-area white status-bar strip
description: Why a pure-white strip appears across the iOS status-bar/safe-area inset on fan pages, and the robust fix.
---

# iOS standalone white status-bar strip

**Symptom:** On the standalone iOS webview (native Capacitor app loading the remote origin, or home-screen PWA — both are full-screen WKWebView with a transparent `black-translucent` status bar), a **pure-white** strip appears across the `safe-area-inset-top` region, with **solid navy immediately below it**. It "starts the right color" then reveals white after an overscroll/scroll-up and won't go away.

**Root cause:** The fan navy gradient was painted on the **body box**. On iOS standalone (`viewport-fit=cover` + `black-translucent`), a body-box background does **not** reliably extend into the `safe-area-inset-top` strip — `background-attachment: fixed` makes it worse (classic WebKit compositing bug). The unpainted inset lets the WKWebView's default **white window** show through behind the transparent status bar, and the status-bar tint latches onto it. The hard navy-below / white-above seam is the signature of "background box stops below the inset."

**Why config checks mislead you:** Everything static can be correct and you still get the strip — `color-scheme: dark` on `:root`, `theme-color #00062B`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-capable=yes`, `viewport-fit=cover`, html+body navy. No JS mutates `theme-color`; `gt-admin` is cleanly added/removed (if it were stuck the WHOLE page would be light `#f7f8fa`, not just the strip). The CapacitorStatusBar pod is installed but never configured from JS — irrelevant; the CSS fix covers PWA + Safari + native because all are WKWebView.

**Fix (in `client/src/index.css`):** Paint the gradient on a `position: fixed; inset: 0; z-index: -1; pointer-events: none` **`body::before`** backdrop instead of the body box. A fixed pseudo-element is pinned to the full layout viewport **including the safe-area insets**, so navy can never miss the strip. Make `body` `background-color: transparent`; keep `html { background-color: #00062B }` as the ultimate backstop. Guard admin with `body.gt-admin::before { display: none }` (admin keeps its flat light `#f7f8fa`).

**Why this is safe:** `#root` has no background rule (transparent) and fan pages render transparent over the body gradient, so a `z-index:-1` backdrop shows through identically. Visually equivalent on desktop/admin; only the iOS inset behavior changes. Cannot be verified from desktop preview — verify the gradient still paints (fan `/`) and admin stays light (`/admin`), then ship via Replit Publish (native loads remote origin, no Codemagic needed) and confirm on a physical iPhone.

**Full-screen OVERLAYS need their own reaching navy — the page `body::before` is behind them.** Any `position: fixed` fan overlay must use plain `inset-0` (top:0 + bottom:0) so its OWN opaque navy fills BOTH safe-area insets. The trap: anchoring with `top:0; bottom:auto; height:100dvh` (copied from the player surface to dodge the iOS Safari toolbar sliver) leaves a **white strip over the home-indicator** inset on native standalone, because `100dvh` stops short of the real bottom edge. The fan player surface gets away with it ONLY because it renders a dedicated `fixed inset-0` z-49 solid-navy backstop behind itself; the lyrics overlay had no backstop and showed the strip. Fix = plain `inset-0` + inner `h-full` (not `h-[100dvh]`); the player backstop also sits behind the lyrics overlay and covers any web-Safari toolbar sliver. Most other fan overlays already use plain `inset-0` and are fine — audit any that override it.

**Distinct from** `ios-webkit-stacked-backdrop-blur.md` (that's a GPU-crash from two stacked `backdrop-filter` surfaces; this is an unpainted safe-area inset).
