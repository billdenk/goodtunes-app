---
name: Report release-picker filters is_goodtunes_release
description: Why a seeded album vanishes from partner funnel/release reports unless it's flagged a GoodTunes release, plus the exact DB column name.
---

# Report release-picker only lists GoodTunes storefront releases

`ownedReleasesWithFunnel()` (server/reports/admin.ts) — the funnel/release picker
and campaign link-builder backing `partnerFunnelReleases` — filters
`albums.isGoodTunesRelease = true`. Streaming-imported discography rows have no
storefront page or share link, so they are intentionally excluded (docs/admin-
conventions.md streaming-row vs GoodTunes-release rule).

**Consequence for DB tests / seeds:** an album seeded WITHOUT that flag is
silently absent from every partner/label/artist release list, even though it
resolves fine for the acquisition *funnel* (which scopes by albumId only). A
seed that inserts only (id,title,artist,artwork,label_id/primary_artist_id) will
make "partner sees own release" assertions fail while "empty scope" assertions
pass — looks like the seed hook threw, but it didn't.

**The DB column is `is_goodtunes_release`** — NO underscore between "good" and
"tunes". Drizzle's `albums.isGoodTunesRelease` maps to it via an explicit column
name, so the naive snake-case `is_good_tunes_release` does NOT exist and throws
`column does not exist`, aborting the whole `before` hook.

**How to apply:** any report/funnel DB test that seeds an album it expects a
partner to *see* must set `is_goodtunes_release = true` in the INSERT.
