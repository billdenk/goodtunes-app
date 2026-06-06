---
name: ArtistDetail not-found gate vs ownership filter
description: Why the fan artist page can false-404, and which signals are ownership-independent
---

The fan `ArtistDetail` page resolves the artist by NAME (case-insensitive) and
the navigation (album → artist link → `/artist/<name>`) works reliably — proven
by jsdom repro. The real failure mode is the **page content**, not the link.

`artistAlbums` is ownership-filtered (fans see only albums they OWN; admins see
all). The "Artist not found" gate must therefore NOT key off `artistAlbums`
alone, or a non-owning fan tapping a real artist dead-ends on "Artist not found"
and backs out to the previous page.

**Rule:** gate the not-found / artist-exists decision on ownership-INDEPENDENT
signals — `goodTunesTitles` (full GoodTunes catalog for the name) and
`artistPerson` (resolved `/api/people` row) — never on `artistAlbums`/owned sets.

**Why:** the owned-only filter is deliberate for the RELEASE GRID but leaks into
any derived "does this artist exist" check. The same trap is documented in
ArtistDetail's `goodTunesTitles` comment (must derive from full catalog so unowned
GT releases don't re-surface as streaming tiles).

**How to apply:** any new "empty/not-found/exists" branch on a fan discovery
surface that an artist/album reaches from anywhere must use full-catalog presence,
not the ownership-filtered list.
