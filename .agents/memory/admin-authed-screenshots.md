---
name: Authed admin screenshots via /dev-login
description: How to capture logged-in /admin pages with the Screenshot tool in dev
---
The Screenshot tool's browser profile keeps cookies between calls. To capture an authed admin page:
1. Screenshot `/dev-login?email=<admin email>` first (dev-only route in server/routes.ts; mints the session server-side on that request — the capture itself still shows the login form, that's fine).
2. Then screenshot the real target (`/admin/shopify`, `/admin/albums/<id>?tab=...`) — it renders authed.

**Why:** admin surfaces are login-gated and the Screenshot tool can't interact with forms; this is the only zero-code way to visually verify admin UI.
**How to apply:** pick a `users.is_admin=true` email from the dev DB (prefer super_admin so operator-only pages don't redirect). `isDev` hostname checks see `127.0.0.1`, so dev-only panels gated on "localhost"/"replit" strings won't render in captures.
