---
name: Deep-link claims target my. not the apex
description: Why the native app's Universal/App Link claims list only my.goodtunes.music and never the bare goodtunes.music apex
---

The iOS entitlements (`ios/App/App/App.entitlements`), Android manifest
(`android/app/src/main/AndroidManifest.xml`), the committed AASA
(`public/.well-known/apple-app-site-association`), and the `capacitor.config.ts`
comment all claim **only `my.goodtunes.music`** for Universal Links / App Links.
The bare `goodtunes.music` apex is deliberately NOT claimed.

**Why:** The bare apex is the **Webflow marketing homepage** (apex A record in
Route 53 points at Webflow, fronted by Cloudflare — response headers carry
`x-wf-region` + Webflow surrogate keys). It returns 200 HTML at `/` but 404s on
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`,
because those files are served by *this Replit deployment*, which the apex does
not route to. Claiming a host the app can't serve the association file on yields
a **permanent verification failure**, never a pass. Fans only tap content links
on the app subdomains (`my.`, `get.`), never the marketing homepage, so dropping
the apex claim costs nothing. Bill confirmed this direction.

**How to apply:**
- Don't "fix" deep-link verification by re-adding `applinks:goodtunes.music` or
  by trying to attach the apex as a Replit custom domain — that would replace the
  Webflow marketing site.
- `my.goodtunes.music` and `admin.goodtunes.music` already serve both
  association files (200, real Team ID + SHA-256) in production.
- If the bare apex ever genuinely needs to open the app, the apex must either
  move off Webflow onto this deployment, or proxy just the two `/.well-known/`
  files through the domain's own Cloudflare/edge as a **same-URL 200** (Apple and
  Google do NOT follow redirects for these files, so a 301 to `my.` fails).
  `server/auth/host.ts` already exempts `/.well-known/*` from the apex→`my.` 301
  and the routes in `server/routes.ts` are host-agnostic, so the app side is
  ready — only the apex's DNS/edge ownership stands in the way.
- Native config changes here only take effect in the **next Codemagic signed
  build**; old installs keep the old claims until rebuilt.
