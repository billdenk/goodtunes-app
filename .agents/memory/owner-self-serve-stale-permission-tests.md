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
metadata edit diverts to the review queue). Example: `adminAlbumDelete.db.test.ts`
"an in-scope artist WITHOUT edit_metadata is rejected (403)". This is test-vs-code
drift from when the owner-self-serve default landed AFTER those tests were written;
it is NOT a regression and NOT caused by unrelated (e.g. analytics) changes.

**Why:** the owner default stops an owner from being locked out of their own
release, while still letting a super-admin revoke a specific verb via a per-user
override (override wins over the owner default). To make such a test assert non-owner
behavior it must seed a teammate (`subRole` set) or a per-user override deny — not a
scope-wide `partner_permissions=false`.

**Also:** these `*.db.test.ts` files boot the full route tree via `registerRoutes`,
which transitively tries to `listen` on port **5000**. When the dev "Start
application" workflow is running (it always holds 5000), the test logs
`EADDRINUSE 0.0.0.0:5000` — but that fires "after the test ended" (async) and does
NOT cause the 202-vs-403 assertion. It's the documented port-5000 race, an
environment condition, not a code defect.

**How to apply:** if admin auth/permission DB tests fail 202-vs-403 or EADDRINUSE
during your validation and your change didn't touch `server/auth/*`, the DELETE/PUT
album routes, memberships, or trusted-device, treat them as pre-existing/unrelated —
verify your own surface is green and skip validation with a documented reason rather
than editing tests you don't own.
