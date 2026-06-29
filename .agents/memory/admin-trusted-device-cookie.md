---
name: Admin trusted-device cookie SameSite + route-test prod gate
description: Why the admin "remember this device" cookie must be SameSite=Lax, and how to route-test the production-only trusted-device bypass without a NODE_ENV flip.
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

# Route-testing the production-only trusted-device bypass

`registerRoutes()` now accepts `opts?: { forceProductionAuth?: boolean }`. When
`forceProductionAuth: true` is passed, the dev-only 2FA bypass in `/api/login`
is closed for that server INSTANCE via a closure-scoped flag — without touching
`process.env.NODE_ENV`.

**Why this replaced the old NODE_ENV flip:** the old pattern (`before()` sets
`NODE_ENV="production"`, `after()` restores it) caused a race when two test files
run in the same worker: one file's `after()` could restore NODE_ENV to a non-
production value while the other file's TOTP verify test was still in flight,
causing `pendingTotpUserId` to never be set → 401.

**Pattern:** pass `{ forceProductionAuth: true }` as the third arg to
`registerRoutes()`. Do NOT flip `process.env.NODE_ENV` in test files.

**Warmup note:** the mint test's `before()` hook calls `await db.execute(sql\`SELECT 1\`)`
after `listen()`. This drains any residual pool contention left by a preceding
test file's connections before tests run — without it, the TOTP test can see a
cold-pool timeout that produces a bare session cookie with no `pendingTotpUserId`,
causing a confusing 401 on the verify call.

**pool.end() note:** do NOT call `pool.end()` in an `after()` hook. Each test file
runs in its own child process, but the shared drizzle `db` + `pool` export is
module-local to that process; closing it in `after()` kills all DB access for
the rest of that file's teardown. `--test-force-exit` handles the process exit.
