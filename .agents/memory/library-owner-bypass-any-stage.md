---
name: Fan Library sources owned tiles from ownership, not the public catalog
description: Why the fan Collection/Library renders owned tiles off the /api/my-albums ownership feed instead of intersecting the public /api/albums catalog — the trap that hides owned staged/hidden releases.
---

# Fan Library must source owned tiles from OWNERSHIP, not the public catalog

The public catalog feed (`GET /api/albums` → `getAlbums`) deliberately strips
Prepping (`isPrepping`), `isHidden`, and sunrise releases. So any fan-Library
surface that computes "albums I own" by **intersecting the public catalog with
ownership** silently drops owned-but-staged / owned-but-hidden releases — the
owner can't see or open their own copy before it goes public.

**The fix / the rule:** source owned tiles from the OWNER-SCOPED ownership feed
(`GET /api/my-albums` → `getUserAlbums`), which resolves the full album row
server-side (incl. `isPrepping`/`isHidden`/`isGoodTunesRelease`). Prefer the
richer public-catalog row when present (it carries label credit / artist photo /
share slug that the raw ownership row lacks) but fall back to the ownership
`.album` for a staged/hidden release the public feed omits.

**Why it's safe to drop the stage filters in `getUserAlbums` (but nowhere else):**
that query is keyed on `userAlbums.userId`, so a fan only ever sees their OWN
grants. Every PUBLIC surface (catalog list, album detail, search, slug, buy)
keeps its Prepping/hidden/sunrise filters, so a staged release stays invisible
to non-owners. `getUserAlbums` still filters soft-deleted albums (`deletedAt`)
and EXPIRED previews (`isPreview && previewExpiresAt <= now`); real owned/comp
rows (`isPreview=false`) always pass. This mirrors the album-detail owner-bypass
(`userOwnsAlbum` re-reads with `includeHidden`).

**How to apply:** if you touch the fan Collection/Library grid (`Collection.tsx`
`useFanLibrary` / `dbAlbums`) or add a new "my owned albums" surface, build the
owned set from the ownership feed, not the public catalog. Public browse
surfaces that are NOT the owner's own library (e.g. `ArtistDetail`, `FanLabel`)
intentionally stay filtered — they source from the public catalog and must keep
hiding staged/hidden releases even for an owner viewing them.

Owner's staged tile gets a subtle "Not yet released" marker. The shared album
card exposes it behind an EXPLICIT opt-in prop (not derived internally) so the
same card can't leak the marker on public browse surfaces (Search/ArtistDetail)
that also render owned releases.
