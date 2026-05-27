---
name: admin.goodtunes.music blank page triage
description: Fast checklist for "admin is blank" reports — separates cache/PWA from real outages.
---

When someone reports `https://admin.goodtunes.music/` rendering blank, work this list **before** touching code. In every blank-page report so far the server was healthy and the bundle was serving — the blank state was client-side stale.

## 60-second triage

1. `curl -I https://admin.goodtunes.music/` — confirm 200 + `cache-control: no-store, must-revalidate` on the HTML. If that's missing, the SPA index is being cached and that alone can pin a browser to a deleted asset hash → fix the response headers.
2. `curl -s https://admin.goodtunes.music/ | rg '<script type="module"'` — pluck the bundle hash, then `curl -I` it. Bundle must be 200; if 404, the deployed `index.html` is pointing at a hash that wasn't published — re-publish.
3. Headless screenshot via `screenshot(type=external_url, url=…)`. If the login form paints in headless Chrome, the production app is fine and the reporter is on stale local state.
4. Sanity-check fan side: `https://my.goodtunes.music/` (the Replit fan player) and `https://goodtunes.music/` (Webflow marketing — **not** ours). Both unaffected = the admin host is the only suspect.

## Things that have caused real blankness historically

- **Stacked `backdrop-filter` on iOS Safari** (#424). The `gt-admin` body class is now set in `client/src/main.tsx` *before* React mounts, and `ProtectedRoute` wraps admin pages in `AdminShellErrorBoundary` so a throw inside `AdminFrame` paints a card instead of dark canvas. Both defenses are already in place — don't remove them.
- **Host-based routing bail-out.** `useAuthKind` in `client/src/hooks/useAuthKind.ts` keys on `window.location.host`; any future change there must keep `admin.goodtunes.music` returning `"admin"` or the customer-shell will render in admin chrome and look wrong (not blank, but worth knowing).

## What's NOT the cause

- No service worker is registered (verified via the manifest + repo search). PWA cache cannot pin a stale bundle.
- The customer fan player at `my.goodtunes.music` and the Webflow marketing site at the apex `goodtunes.music` are independent surfaces — issues there are separate.

**How to apply:** if steps 1–3 all pass, tell the reporter to hard-reload (⌘⇧R / "Clear all caches and reload" in DevTools → Application). Only escalate to a code change if the headless screenshot **also** comes back blank, or if step 2 shows a 404 on the bundle hash.
