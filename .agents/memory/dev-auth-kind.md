---
name: Dev auth-kind boundary
description: Why session.kind must trump path-derived authKind in dev, and the symptom when it doesn't.
---

In prod, `kindFromRequest` resolves admin vs customer from canonical hosts (admin.* / my.*). In dev/preview there is no host split, so it falls back to path: only `/admin*`, `/api/admin*`, and `/api/auth/totp*` count as admin — everything else is "customer". That means a logged-in admin hitting `/api/albums`, `/api/songs`, etc. gets `req.authKind="customer"`, mismatches `session.kind="admin"`, and `getAuthFromRequest` returns undefined → 401 → React Query yields null → pages crash on `.filter`/`.map`.

**Rule:** in `getAuthFromRequest`, only enforce the kind/authKind boundary when `req.hostKnown` is true. In dev, trust the session/token kind. `requireAdmin` / `requireCustomer` still gate role-specific routes, so this is safe.

**Why:** the host/kind boundary is a defense-in-depth check that only has meaning when the host actually distinguishes admin from customer. Applying it in dev creates a false negative that silently breaks every non-/admin API call for admins.

**How to apply:** if you see a logged-in admin getting 401s on shared API paths (`/api/albums`, `/api/songs`, `/api/me`) only in dev, this is the cause. Don't "fix" by hardcoding kind=admin on the client — the server boundary itself is wrong in dev.
