---
name: Post-purchase cross-host player hand-off
description: How a fan authed on the buy funnel gets re-authed on the player host after checkout, and the one-time welcome modal.
---

# Post-purchase player hand-off (get./store. → my.)

The buy funnel (`get.`/`store.goodtunes.music`) sells; fans play on `my.goodtunes.music`.
Neither auth artifact crosses subdomains: the session cookie is host-only AND the
`localStorage` bearer token (`goodtunes_auth_token`) is host-scoped.

**Rule:** to move an authed fan across customer subdomains, mint a fresh customer
bearer token server-side and carry it in the URL **fragment** (never the query) —
fragments aren't sent to the server, so the bearer never lands in an access log.
Pick it up before React mounts (in `main.tsx`), `setAuthToken`, scrub the fragment.
This is the same mechanism `welcomeBack.ts` uses for the sign-in link.

**Why:** host-scoped cookie + host-scoped token (see also multi-host-oauth-cookie.md).

**How to apply:** gate the cross-host hop on `isPurchaseFunnelHost()` so dev /
single-host `*.replit.app` stays an in-app navigation. Endpoint
`POST /api/checkout/player-handoff` is `requireCustomer` (customer-only, so an admin
token can't mint a customer session).

**Gotcha:** the bare `/album/:id` route mounts `<AlbumDetail />` with NO `albumId`
prop — any per-album logic in the parent (e.g. the one-time welcome modal's
`gt:welcome-seen:<albumId>` localStorage key) must resolve the id via `useParams`,
or the key collapses to one global value and the modal only ever shows for the first
album opened.
