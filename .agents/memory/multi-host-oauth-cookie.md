---
name: Adding a customer-family host (store/my)
description: What it takes to add a new fan-facing canonical host so auth + OAuth + checkout work end-to-end on it.
---

Adding a new fan-facing canonical subdomain (e.g. `store.goodtunes.music` alongside `my.goodtunes.music`) is more than a host→kind mapping. The full checklist:

- Map host → `customer` kind in BOTH `server/auth/host.ts` (`kindFromRequest`) and `client/src/hooks/useAuthKind.ts` (`detectAuthKind`).
- Exempt it from the canonical-host 301 in `canonicalHostRedirect` (add to the early `return next()` AND the `shouldCanonicalize` guard) or the deploy edge will 301 it away.
- **OAuth must round-trip to the SAME host the fan started on.** The session cookie is host-only (`sameSite=none`, no `domain`), so `oauthState` stored on the session is NOT sent on a cross-subdomain callback → state mismatch → sign-in fails. `callbackOrigin` must return the originating customer-family host, not collapse every customer to the canonical one.

**Why:** host-only cookie + session-stored OAuth state. A callback that lands on a different subdomain than the start can't see the state cookie.

**How to apply:** keep a `CUSTOMER_HOSTS` set; `callbackOrigin` returns `https://<that host>` when the request host is in it. Then the new host's `…/api/auth/google/callback` + `…/apple/callback` redirect URIs MUST be registered in the Google/Apple IdP consoles (infra-owner action) or provider sign-in 403s. Email-code sign-in + `?buy=1` bounce-back are same-origin and need no IdP change. Stripe `return_url`/`/welcome` already uses the request host (`absoluteOrigin`), so checkout follows the host automatically.

The store launch landing reuses the preview-first `AlbumDetail` via an optional `albumId` prop (id stays out of the URL); launch album id is `STOREFRONT_LAUNCH_ALBUM_ID` in `shared/schema.ts`, overridable in dev via `VITE_LAUNCH_ALBUM_ID`. Full writeup in `docs/auth-and-dual-shell.md` → "Store launch host".
