---
name: Admin parameterised fetches need bearer + cookie
description: Custom queryFns on admin dashboards must send authHeaders(), not cookies alone
---

Rule: any hand-rolled admin fetch (custom queryFn like `fetchAdminJson` for parameterised report endpoints) must send BOTH `credentials: "include"` AND `headers: authHeaders()` — mirroring the default queryFn.

**Why:** admin logins via the `#token=` hash path (dev-login, OAuth callback) authenticate with a localStorage bearer; the session cookie may be absent or unusable (host-scoped, Safari ITP). A cookie-only fetch 401s silently while sibling default-queryFn requests succeed, so half the dashboard renders and the report cards sit on "—" forever with no visible error.

**How to apply:** when adding a query with a custom queryFn on any admin/partner surface, copy the fetchAdminJson pattern in AdminDashboard.tsx (post Apple-canon Round 2). Symptom to recognize: a handful of 401s in browser console while /api/me and list endpoints work.
