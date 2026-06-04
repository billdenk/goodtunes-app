---
name: Admin-aware includeHidden fan-out
description: Every fan-facing album read must replicate the admin-aware includeHidden gate or god-view 404s on staged (hidden/future-dated) releases.
---

Fan-facing album reads call `storage.getAlbumById(id)` / `getAlbumBySlug(id)`, which
sunrise-gate: a `isHidden` row or one whose `goodTunesReleaseDate > today` returns
`undefined` (→ 404) **unless** the caller passes `{ includeHidden: true }`.

The public album-detail route (`GET /api/albums/:id` in routes.ts) passes
`includeHidden = await isAdminUser(req)`, so an admin/god-view can preview a staged
release while a real fan 404s. Any OTHER fan-facing read of the same album that
forgets this opts-arg will 404 the staged album for admins too — producing the
classic "album PAGE loads but the Buy sheet / SKUs / sibling endpoint says 'Album
not found'" asymmetry. (`GET /api/albums/:id/buy-options` had exactly this bug.)

**Rule:** when adding a fan-facing endpoint that loads an album by id/slug for a
staged-release-previewable surface, compute `includeHidden` from an admin check and
thread it through, mirroring the detail route.

**Why:** the gate is the single source of "fans never see unreleased albums";
re-deriving visibility per-route guarantees drift. capabilities.md promises staged
releases stay invisible to fans, so the admin bypass must be the ONLY way through.

**How to apply:** `commerce.ts` keeps a local `viewerIsAdmin(req)` (NOT a static
import from routes.ts — registerCommerceRoutes is dynamically imported, cycle risk)
that mirrors `getAuthFromRequest`+`isAdminUser`: session-or-Bearer → kind must be
"admin" → honor the `req.hostKnown && kind !== req.authKind` host boundary (admin
token on a customer host in prod is rejected) → `storage.getUser().isAdmin`. Request
params/body can never flip includeHidden. Consider centralizing into a shared auth
util to stop routes.ts/commerce.ts drift.
