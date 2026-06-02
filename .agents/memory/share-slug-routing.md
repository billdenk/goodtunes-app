---
name: Per-release share slugs
description: How get.goodtunes.music/<slug> clean share links resolve and what must stay in sync
---

# Per-release share slugs (`get.goodtunes.music/<slug>`)

A release can carry a `albums.share_slug` (partial-unique-where-not-null) that
resolves to the same public preview-and-buy album page as `/album/:id`, no UUID,
no login wall. Slugs resolve ONLY for buy-eligible releases (not hidden, not
prepping, not soft-deleted) — `storage.getAlbumBySlug` mirrors `getAlbumById`
gating and the public `GET /api/public/album-by-slug/:slug` 404s otherwise.

**One source of truth: `shared/shareSlug.ts`** — `normalizeShareSlug`,
`RESERVED_SLUGS`, `validateShareSlug`. Used by the admin editor (client), the
PUT validator (server), and the og dispatcher — all three must agree.

**Why the slug route is a landmine:** it's a single-segment catch-all
(`/:slug`). Three things must stay in lockstep or a real route silently becomes
an album lookup:
1. The `/:slug` route in `client/src/App.tsx` MUST sit below every literal
   single-segment route (so /store, /collection, /chat, /search, /artist… win)
   and above `/` + the catch-all. Multi-segment routes (/album/:id) are never
   shadowed.
2. **`RESERVED_SLUGS` must contain EVERY literal single-segment route** + infra
   path. **Why:** validation rejects reserved slugs, but it can't reject a slug
   it doesn't know is a route — so a missing entry (e.g. `chat`/`recents`/
   `error`) lets an operator save a slug whose runtime route precedence resolves
   to the literal route, producing a broken share link. **How to apply:** a
   drift-guard test (`shared/shareSlug.test.ts`) parses App.tsx single-segment
   routes and asserts each is reserved — run it after adding any top-level route.
3. The og dispatcher (`server/og.ts`) normalizes + skips RESERVED_SLUGS before
   trying the by-slug album OG; falls through to the branded default card.

**Cache prime trick:** the slug page fetches the PUBLIC by-slug endpoint
(logged-out safe), then `queryClient.setQueryData(["/api/albums", album.id],
album)` so the mounted `AlbumDetail` renders without an authed `/api/albums/:id`
refetch (which would 401 when logged out).

**New host:** `get.goodtunes.music` is wired the same way as other customer
hosts. Per the multi-host-oauth-cookie memo, OAuth redirect URIs for a new host
still need Google+Apple registration before sign-in works on it.
