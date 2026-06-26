---
name: Admin trusted-device cookie SameSite + route-test prod gate
description: Why the admin "remember this device" cookie must be SameSite=Lax, and how to route-test a request-time NODE_ENV=production gate under tsx.
---

# Admin "remember this device" trusted-device cookie

The admin 2FA "remember this device for 30 days" cookie MUST be minted with
`SameSite=Lax`, not `None`.

**Why:** Safari ITP and Cloudflare proxies cap/drop `SameSite=None` cookies on a
first-party admin login, so the cookie never returns and the 2FA-bypass branch
never sees it — the admin keeps being asked for the email code in production
(dev hid this because dev skips 2FA entirely). The admin login is first-party,
so Lax is both correct and sufficient; nothing here needs the cross-site None.

**How to apply:** there are TWO mint sites (the TOTP-verify and email-OTP-verify
endpoints) — keep them in lockstep. Read/bypass, storage expiry filtering, and
revocation were already correct; only the cookie attribute mattered.

# Route-testing a request-time dev-bypass that keys off NODE_ENV

The admin `/api/login` branch has a dev-only 2FA bypass that fires when
`NODE_ENV !== "production"`, evaluated at REQUEST time. To exercise the
production-only trusted-device branch in a route test, run the request under
`NODE_ENV=production`.

**Gotcha:** do NOT set `NODE_ENV=production` before `registerRoutes()`. The route
graph transitively imports `server/index.ts`, whose top-level bootstrap mounts
the static-asset handler in production; that handler relies on `__dirname`, which
is undefined under tsx/ESM, so registration throws.

**Pattern:** register in the default env, then flip to production at the END of
the `before()` hook (after registration) and restore it in `after()`. Like every
db route test, the file still trips the shared port-5000 `listen()` EADDRINUSE
async noise — harness-tolerated; trust per-assertion pass/fail, not the
file-level mark.
