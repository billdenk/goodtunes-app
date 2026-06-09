---
name: Public album read for logged-out fans
description: Why GET /api/albums/:id must be anonymous-readable and how the not-found-for-logged-out bug recurs.
---

# Logged-out fans 404 on a LIVE album

`GET /api/albums/:id` is the canonical fan album-detail read. It was guarded by
`requireAuth`, so an anonymous visitor got `401 Unauthorized`. On the client,
`AlbumDetail`'s own `["/api/albums", id]` query refetches on mount, and the
default fetcher returns **null** on a 401 — overwriting any primed cache and
tripping the `if (!album) return <AlbumNotFound/>` guard. Result: a logged-out
fan opening a **LIVE** (non-prepping) release sees "We couldn't find that album".

**Why the earlier client fix didn't cover it:** the staleTime:Infinity /
refetchOnMount:false trust-the-primed-cache fix only applies when
`publicPreview` is truthy — i.e. PREPPING/preview surfaces. A LIVE album passes
`publicPreview = undefined`, so it refetches. And the launch root (`/` →
`<AlbumDetail albumId={launchAlbumId}/>`) primes **nothing**, so no client
priming trick can save it. The real gap is the server gate.

**Fix:** `optionalAuth` middleware (mirror of `requireAuth`: hydrates
`req.session.userId/kind` from cookie OR bearer, keeps the merged-customer
teardown, but `next()`s instead of 401 when no auth) applied to
`GET /api/albums/:id`. The handler already gates visibility via
`getAlbumById(id, { includeHidden: isAdminUser(req) })` (anon → false) and the
owner-bypass is `req.session.userId`-guarded, so anon safely gets only public,
visibility-gated rows.

**Why it's safe:** the already-public `GET /api/public/album-by-slug/...`
returns the identical `{...album, isExplicit, songs}` payload, so id-based read
just matches slug-based read. No new exposure.

**How to apply:** any fan catalog read that must render for logged-out visitors
on get.goodtunes.music should use `optionalAuth`, not `requireAuth`. Don't try
to paper over a server 401 with client cache-priming — the launch root has no
priming.
