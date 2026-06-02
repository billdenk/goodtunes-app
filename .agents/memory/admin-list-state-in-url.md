---
name: Admin index list state persisted in URL
description: How the admin Albums list remembers tab/view/search/filters across refresh and return-from-detail navigation.
---

# Admin index list state in the URL

The admin Albums list (`client/src/pages/AdminAlbums.tsx`) mirrors its whole
view — lifecycle tab, grid/list view, search text, and type/genre/date/explicit
filters — into the URL query string so a refresh restores it, and carries that
same query into each album link so the detail page's "Back to albums" / delete
redirect lands the operator exactly where they were.

**Shape of the decision:**
- One `initial` useMemo parses every control from the URL once on mount; one
  `listQueryString` useMemo re-serializes them (defaults omitted → clean URL);
  one mirror effect `navigate(..., {replace:true})` only when it differs.
- Album links carry the *entire* list query url-encoded as a single
  `albumsReturn` param (`albumHref(id, listQueryString)`), NOT one param per
  control. `AdminAlbum.tsx` `backToAlbumsHref` reads `albumsReturn` and returns
  `/admin/albums?${ret}`. Legacy `albumsTab=<tab>` (#1007) still honored.

**Why:** threading every filter through the detail page back link is brittle and
grows with each new control; one opaque round-tripped query string is stable and
control-agnostic.

**How to apply:** the other admin index pages (People, Gear, Vendors, Labels)
use the same `useViewMode` + tab pattern and would benefit from the identical
`albumsReturn`-style round-trip when they get filters. `useViewMode` already
persists grid/list via localStorage, so view survives navigation even without
the URL; the URL mirror is for shareable/bookmarkable links and parity.
