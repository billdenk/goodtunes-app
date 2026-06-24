---
name: Two requireAdmin guards differ on session vs bearer
description: commerce.ts admin routes are bearer-only; routes.ts admin routes accept session-or-bearer — matters for any session-path test/feature on admin APIs
---

There are TWO independent `requireAdmin` middlewares in the backend and they
resolve auth differently:

- **routes.ts `requireAdmin`** (and the press isolation guards
  `pressGlobalDenyGuard` / `pressManufacturerScopeGuard`) resolve the caller via
  `getUserIdFromRequest`, which reads the **session cookie OR a bearer token**.
  So the manufacturer *detail* route (`GET /api/manufacturers/:id`) and the
  403 cross-press isolation boundary work over either auth mode.

- **commerce.ts `requireAdmin`** is **bearer-only**: it returns 401 immediately
  if there's no `Authorization: Bearer` header. The press *catalog* and
  *format-cost* admin endpoints (`/api/admin/manufacturers/:id/catalog`,
  `/.../format-costs`, registered via `registerPressCatalogRoutes` and the
  format-cost routes) go through it, so a **cookie-session caller is 401'd on its
  own catalog/format-costs** even though the isolation guard would let it
  through.

**Why it matters:** the security-critical isolation (403 on globals / other
presses) is enforced by the session-or-bearer guards and holds in both modes.
But any test or feature that drives a commerce admin read over a **session**
will get 401, not 200 — that's by design (the admin SPA uses bearer tokens for
those calls), not a bug. requirePressScope returns 403; a 401 there means the
bearer-only requireAdmin rejected the request before scope was even checked.

**How to apply:** when asserting positive (200) admin reads over a session
cookie, use routes.ts-gated routes (e.g. manufacturer detail). For commerce.ts
admin routes (catalog/format-costs/SKUs/addons/orders) use a bearer token, or
assert 401 if testing the session path. Locked in by
`server/pressDataIsolation.db.test.ts`.
