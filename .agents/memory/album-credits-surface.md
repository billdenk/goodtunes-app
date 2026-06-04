---
name: Album credits surface (Apple-style grouped)
description: How the fan album-credits surface aggregates + when it shows; desktop vs mobile gating differs on purpose.
---

# Album credits surface

The fan album-credits surface (mobile `AlbumCreditsSheet` + desktop `AlbumCreditsModal`, both in `AlbumCreditsSheet.tsx`) renders Apple's three broad buckets, built by the shared `buildAlbumCreditGroups(payload)`:
- **Performing Artists** ← every song's `bySongId[*].performers`
- **Composition & Lyrics** ← every song's `bySongId[*].writers`
- **Production & Engineering** ← album-level `production`

Each person is deduped within a group; their distinct role strings are joined (first-seen order) into the **subtitle** under the name (e.g. "Vocals, Bass Guitar"). Empty groups are dropped. The credits endpoint is `GET /api/albums/:id/credits` (shape: `{ bySongId, production }`). Both surfaces take the **full payload** prop (`credits`), not flat rows.

## Gating is intentionally different desktop vs mobile
- **Desktop (`AlbumDetailDesktop.tsx`)**: credits are **owner-gated** ("show after someone buys", per Bill). Both the credits IconButton and the modal mount require `effectiveOwned && hasAnyCredits`.
- **Mobile (`AlbumDetail.tsx`)**: deliberately **NOT** owner-gated — it keeps the pre-purchase SuperCredits™ teaser (the SuperCredits badge opens the same sheet). Mobile open-gate uses aggregated `albumCreditGroups.length > 0` (not production-only).

**Why:** Bill asked credits to look like Apple and be shown "after someone buys"; that maps to the desktop modal. Mobile's SuperCredits teaser is a deliberate pre-purchase selling point and was preserved.

**How to apply:** changing the gate on one platform does NOT imply the other. If you ever unify gating, confirm with Bill first — the split is by design.
