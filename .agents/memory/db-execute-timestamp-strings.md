---
name: db.execute timestamp columns come back as strings
description: raw db.execute rows return timestamp cols as STRINGS not Dates; wrap in new Date() before toISOString or the route 500s
---

Raw `db.execute(sql\`...\`)` rows in this app return `timestamp`/`timestamp without time zone`
columns as **strings** (e.g. `"2026-06-09 00:38:23.074866"`), NOT JS `Date` objects — even
though a drizzle-mapped select of the same column is a Date. So calling `.toISOString()`
directly on a raw row field throws `... .toISOString is not a function` at runtime.

**Rule:** in any shaper fed by `db.execute`, write `x ? new Date(x).toISOString() : null`,
never `x.toISOString()`. This is the established convention across `server/routes.ts` (only
one shaper ever violated it).

**Why:** this bit the operator press Albums tab. `shapePipelineAlbum` (the single shaper
behind `GET /api/admin/manufacturers/:id/albums` → `loadConnectedAlbums`) called
`row.first_sold_at.toISOString()` raw. It was dormant because that route only ever returned
never-sold pressing-order albums (first_sold_at NULL). When the SKU-union feature started
surfacing already-SOLD SKU-assigned albums (a sold album like Hope has first_sold_at set), a
single such row 500'd the WHOLE list. The client then had no data → rendered the misleading
empty "no pressing-order requests have resolved to this press yet" hint. Looked like a stale
deploy / missing assignment but was a serialization crash.

**How to apply:** the `db-query-smoke` EXPLAIN guard can't catch this (it validates columns,
not JS shaping). When you add a raw-SQL admin list, grep the shaper for bare `.toISOString()`
on a snake_case field and wrap it. Server containers run UTC so `new Date(str)` (parsed as
local) round-trips the wall-clock correctly.
