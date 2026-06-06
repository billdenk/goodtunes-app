---
name: Native Capacitor app loads remote site (server.url)
description: Why the iOS/Android native build must point at the live host instead of the bundled payload, and what symptom proves it regressed.
---

# Native Capacitor build must render from the live host, not the bundled payload

The native app (Capacitor wrapper, `capacitor.config.ts`) sets
`server.url = "https://my.goodtunes.music"` so the webview loads the live player
site. Do NOT "fix" this by removing server.url to ship the bundled `dist/public`.

**Why:** the entire client talks to the backend and loads assets through
RELATIVE paths — `fetch("/api/me")` in `useAuth`, every TanStack query key
(`"/api/..."`), and every image/asset (`/goodtunes-logo-white-sm.png`,
`/objects/uploads/...`, `/figmaAssets/...`). Those resolve against the page
ORIGIN. There is no native API base abstraction anywhere (no `VITE_API_BASE`, no
`getApiBase()`). On the web the origin is the server, so it all works. In a
bundled native build the origin is `capacitor://localhost`, which has no backend:
`/api/me` never returns → `App.tsx`'s `useAuth().isLoading` gate spins forever,
and every image 404s to iOS's gray broken-image placeholder.

**Symptom of regression:** TestFlight/native app stuck on a static navy
(`#00062B`) screen showing iOS's broken-image glyph (looks like a share/upload
icon) above a non-advancing blue spinner — the auth loading gate that never
resolves. Both devices, no movement. This is NOT a packaging/cap-sync failure
and NOT a stale-bundle issue; it's the missing backend origin.

**How to apply:**
- Keep `server.url` pointing at the player host. `Capacitor.isNativePlatform()`
  / `getPlatform()` are unaffected by server.url, so `platform.ts` gating
  (buyEnabled=false on native, chat hidden, on-device downloads on) stays
  correct.
- The alternative ("proper" bundled build) would require rewriting EVERY fetch
  AND every asset path to an absolute base when native — and OAuth/redirect
  flows on top — so it's a large, risky change, not a quick swap.
- Known limitation: Google may refuse OAuth inside an embedded webview
  (`disallowed_useragent`). The App Review demo account uses email+password, so
  review is unaffected; real Google-sign-in-in-app is a separate follow-up.
- Offline cold-launch won't work with server.url (needs network) — acceptable
  for v1; downloaded files still play via `Capacitor.convertFileSrc`.

## Once it loads the live site, the WEB layout's native blind spots surface

After server.url makes the app boot, the next class of bugs is the web app's own
responsive + chrome assumptions showing through the iPhone/iPad frame. All are
fixed in the WEB app and ship via **Publish — no new Codemagic/TestFlight build**
(only the native shell — config/Info.plist/icons/splash/true native features like
lock-screen controls — needs a rebuild).

- **iPad "thinks it's the iPhone":** `useDesktopShell`/`useTabletShell`
  (`client/src/hooks/useDesktopShell.ts`) used to return `lg && !isNative` /
  `md && !isNative`, force-killing desktop chrome on native (legacy task #547 when
  the binary was a phone-only bundle). Now that native loads the live site, make
  them width-only so an iPad gets the left rail + right lyrics rail + immersive
  player. Buy/Chat stay native-gated separately in `lib/platform.ts`, so this
  doesn't re-expose them.
- **White bands top/bottom:** the gradient lives on `body` (a finite box); the
  safe-area strips (black-translucent status bar / home indicator) + overscroll
  bounce expose the element underneath, which defaults to WHITE in the iOS
  webview. Fix: `background-color:#00062B` on the `html,body` rule in `index.css`.
- **Dock/mini-player tuck under the home indicator:** `DOCK_BOTTOM` (BottomNav)
  and the MiniPlayer container bottoms were flat `12px`/`79px`. Wrap each as
  `calc(<n>px + env(safe-area-inset-bottom, 0px))` — `env()` is 0 on web/non-notch
  (web byte-identical) and only lifts inside the notch device. Keep dock + player
  on the SAME inset so the stack lifts together and the gap stays constant.
  (NOTE: env-only lift does NOT change the *relative* mini-player↔nav gap; if the
  player still kisses the nav on device, that's a separate hardcoded-gap nudge.)
