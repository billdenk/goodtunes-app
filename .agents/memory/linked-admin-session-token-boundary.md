---
name: Linked-admin stale-session vs token boundary
description: Why a linked admin/fan account 401'd on the admin host, and why the host/kind boundary is unit-tested as a pure helper instead of over HTTP.
---

# Linked-account host/kind auth boundary

`getAuthFromRequest` (server/routes.ts) checks the **session before** the Bearer
token. A linked account — an invited platform admin whose login is also a fan
account — can carry a session whose `kind` is `customer` (they last signed in on
the player host). On the canonical admin host the host/kind gate then rejects
them (401) even when they hold a valid admin Bearer token. Symptom seen: 401
saving in the admin Edit Profile dialog.

**Rule:** when the canonical host's `authKind` mismatches the session kind, honor
a presented Bearer token whose kind matches THIS host before bouncing — holding
the token proves the caller owns that hat.

**Why:** the boundary must stay strict (a fan-only session can't act as admin; an
admin token can't be used on a fan host) but a *correct* token for this host is
sufficient proof; the stale session kind is just an artifact of which host the
user last touched.

**How to apply:** the decision is the pure `resolveAuthAcrossBoundary` helper.
Don't re-inline it; if you touch the precedence (session vs token, host known vs
dev), update that helper + its unit test (server/authBoundary.test.ts).

## Don't test this boundary over HTTP — extract a pure helper

An end-to-end HTTP regression test for this is a trap:

- **undici `fetch` silently strips the `Host` header** (it's a forbidden header).
  So the canonical host never reaches the server, `req.hostKnown` stays false,
  and the boundary is never exercised (admin token wrongly accepted on the fan
  host, etc.). Use `node:http` (which lets you set `Host`) if you must go over
  the wire.
- **The session cookie is `secure: true` + `sameSite: "none"`.** express-session
  won't issue it over plain HTTP unless `req.secure` is true — i.e. you must send
  `X-Forwarded-Proto: https` AND the app has `trust proxy` set. Without that,
  `establishSession` gets no cookie.
- Even then it was flaky under the full `tsx --test` suite vs. standalone.

The robust fix was to extract the decision into a pure function and unit-test it
directly (no HTTP, no DB, no cookies) — deterministic in isolation and in-suite.
Prefer this pattern for any host/kind / auth-precedence logic.
