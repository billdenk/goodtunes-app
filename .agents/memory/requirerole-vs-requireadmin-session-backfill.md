---
name: requireRole must backfill req.session like requireAdmin does
description: Bearer-only admin requests 401 deep inside a handler even after passing the requireRole gate, because downstream helpers re-read req.session?.userId directly instead of taking the resolved identity.
---

`requireRole(...)` (server/auth/roles.ts) and `requireAdmin` (server/routes.ts) both resolve identity via `getAuthFromRequest` (session-OR-bearer), so both correctly admit a Bearer-only admin at the gate. But several handlers gated by `requireRole` (e.g. `resolveArtistScope`/`resolveAlbumScope` in server/artistReports.ts) don't take the resolved auth as an argument — they independently re-read `req.session?.userId` further down the call stack. `requireAdmin` masks this because it backfills `req.session.userId`/`kind` after a successful Bearer resolution; `requireRole` didn't, so a Bearer-only admin could pass the gate and still 401 (or silently fall back to a bad scope) inside the handler.

**Why:** this caused a real production bug — an admin's browser had a valid Bearer token but a stale/missing session cookie, so the Album Dashboard tab (gated by `requireRole`) 401'd even though other `requireAdmin`-gated admin pages worked fine for the same user.

**How to apply:** `requireRole` now backfills `req.session.userId = userId; req.session.kind = "admin";` after resolving auth, mirroring `requireAdmin`. If you add a NEW gate/middleware that resolves auth via `getAuthFromRequest` (or add a new raw `req.session?.userId` read anywhere in a handler), either (a) thread the resolved identity through explicitly, or (b) confirm the gate backfills `req.session` the same way, or Bearer-only callers will intermittently break downstream even though the gate itself let them through. There's a large number (~280+) of raw `req.session?.userId` reads across server/*.ts — most are safe because they sit behind `requireAdmin`, but any behind a newer/different gate should be checked the same way.

Also found while investigating (separate, unrelated bug, left unfixed): `server/artistReports.ts`'s referral-credits summary query filters `rc.kind = 'npo'`, but the `referral_credits` table has no `kind` column — it's `referrer_kind`, and the non-profit value is `'non_profit'` not `'npo'`. `server/dailySalesReport.ts` has the correct version of the same query right next to it (`rc.referrer_kind = 'non_profit'`). This 500s `/api/artist/summary` whenever it hits that branch.

- 2026-08-07: commerce.ts requireAdmin and GET /api/partner/:scope/dashboard now backfill req.session.userId from a validated admin Bearer, so press-portal /me and partner dashboards work for #token-hash logins (they used to 500/401).
