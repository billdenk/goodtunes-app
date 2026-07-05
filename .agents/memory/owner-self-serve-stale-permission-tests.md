---
name: Owner-self-serve verbs make older "owner without verb → 403" tests stale
description: Why some admin permission/delete DB tests fail 202-vs-403 independent of your change, and why the DB tests hit EADDRINUSE:5000
---

An artist-scope **owner** (a membership on an `artist` scope with `subRole == null`,
including the one `getUserRole` synthesizes from legacy `users.role='artist'` +
`role_scope_id` when the user has NO `memberships` row) implicitly holds the
`OWNER_SELF_SERVE_VERBS` — currently `edit_metadata`, `upload_masters`,
`edit_credits_and_gear`, `manage_payouts` — via `resolveVerbAllowed`, **regardless
of `partner_permissions`**. `partner_permissions` only governs invited sub-users
(teammates carry a `subRole`, so they get only their explicit overrides).

**Consequence:** older permission/delete DB tests that seed an owner
(`role=artist`, no membership) with `partner_permissions.edit_metadata=false` and
assert **403** are STALE — the route now correctly returns **202** (owner's
metadata edit diverts to the review queue). The `adminAlbumDelete.db.test.ts`
case was rewritten to assert owner-self-serve (202 + a queued pending_change).
This is test-vs-code drift from when the owner-self-serve default landed AFTER
those tests were written; it is NOT a regression and NOT from unrelated changes.

**Why:** the owner default stops an owner from being locked out of their own
release, while still letting a super-admin revoke a specific verb via a per-user
override (override wins over the owner default). To make such a test assert non-owner
behavior it must seed a teammate (`subRole` set) or a per-user override deny — not a
scope-wide `partner_permissions=false`.

**Port-5000 race (now FIXED with a code change):** these `*.db.test.ts` files boot
the full route tree via `registerRoutes`, which at runtime does `await import("./odoo")`.
odoo.ts — plus `giftScheduler.ts` / `credentialExpiry.ts` — USED to
`import { log } from "./index"`, which forced Node to evaluate the entire
`server/index.ts` module body, whose top level calls
`httpServer.listen({ port: 5000, reusePort: true })`. So merely booting the routes
in a test spun up a SECOND server on 5000 and raced the always-on dev/test
workflows → `EADDRINUSE 0.0.0.0:5000` fired "after the test ended" (async, so the
assertions still passed; `reusePort:true` made it intermittent, not every-run).
Fix: `log` now lives in the dependency-free `server/log.ts` and those three modules
import it from there, so the route tree no longer evaluates `server/index.ts` (no
phantom server, no 5000 bind) during tests. `index.ts` imports+re-exports `log`
from `./log`. **Rule:** any module the route tree can reach must import `log` from
`./log`, NEVER `./index`, or it reintroduces the port-5000 boot side effect in
every db route test.

**How to apply:** if admin auth/permission DB tests fail 202-vs-403 and your change
didn't touch `server/auth/*`, the DELETE/PUT album routes, memberships, or
trusted-device, treat them as pre-existing owner-self-serve drift — fix the
assertion to expect **202** (owner metadata edits divert to the review queue),
don't weaken the route. If a NEW server module you add needs `log`, import it from
`./log`.
