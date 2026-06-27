---
name: SameSite=Lax session cookie + stateless OAuth state
description: Session cookie moved from None to Lax to fix Safari login; Apple form_post requires stateless OAuth state.
---

# SameSite=Lax Session Cookie + Stateless OAuth State

## The rule
- Main `connect.sid` session cookie is `SameSite=Lax` (was `None`). `gt_trusted_device` is also Lax (unchanged since Task #2231).
- OAuth state (nonce/kind/provider/linkToUserId/inviteToken) is **not** stored in the session. It is HMAC-SHA256 signed via `signOAuthState()` in `server/auth/oauth.ts` and round-tripped as the OAuth `state` parameter. The callback verifies with `verifyOAuthState()`.

**Why:** Safari ITP drops `SameSite=None` first-party cookies → password login silently failed in Safari. Apple's `response_mode=form_post` is a cross-site POST → the `Lax` session cookie is not sent on it → storing state in the session would break Apple OAuth. Stateless signed state fixes both.

**How to apply:**
- Never add a new OAuth `state` field to `req.session`. All state goes in `signOAuthState({ nonce, kind, provider, ... })`.
- The HMAC key is `SESSION_SECRET` (dev fallback: `goodtunes-dev-only-secret`).
- Native Capacitor auth: session cookie won't be sent cross-origin from `capacitor://localhost`; the Bearer token in `Authorization:` is the authoritative auth mechanism for native — server re-hydrates session from it.

## Test seam
`/__test/sign-oauth-state` (in `identityLink.db.test.ts`) POSTs a raw bag and returns `{ signedState }`. Tests pass this as the `state` query/body param to the callback. The old `/__test/seed-oauth-state` (session-based) was removed.
