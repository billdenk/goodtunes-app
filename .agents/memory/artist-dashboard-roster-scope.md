---
name: Artist dashboard ↔ buyer-roster scope parity
description: The one canonical album scope shared by the artist dashboard totals and the admin buyer-roster page; keep both queries in lock-step.
---

The artist dashboard lifetime/windowed totals (`resolveArtistScope` in
`server/artistReports.ts`) and the admin buyer-roster page
(`GET /api/admin/people/:id/buyers` in `server/routes.ts`) must scope albums
identically or the headline numbers drift.

**Canonical album scope:** an artist owns an album when
`primary_artist_id = personId OR (payout_owner_kind='person' AND payout_owner_id=personId)`
**AND** `deleted_at IS NULL`.

**Why:** Originally they diverged on two axes — the dashboard counted
payout-owner-only albums and did NOT filter soft-deleted albums; the roster
scoped by primary_artist only but DID filter `deleted_at IS NULL`. So an artist
with a payout-owner-only album, or a soft-deleted release with sales, saw the
dashboard headline disagree with the roster. We picked the dashboard's broader
ownership rule (payout-owner counts — that's who gets paid) PLUS the roster's
soft-delete filter (deleted releases shouldn't count anywhere).

**Status set already matched:** roster uses `IN ('paid','shipped','complete','completed')`;
dashboard's `ordersFilter` includes `'refunded'` only so its `CASE WHEN o.status <> 'refunded'`
deduction works — the counted set is the same four statuses.

**How to apply:** any change to either album-scope query (label drill-through
clause aside) must be mirrored in the other. Label callers additionally narrow
by `label_id`; the roster is admin-only and has no label clause.
