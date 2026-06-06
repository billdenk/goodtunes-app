---
name: Manager partner type — derived catalog
description: How the "manager" partner entity relates to artists/albums and why there is no albums.managerId
---

# Manager partner type — derived catalog

The `manager` partner entity mirrors `label` (same table shape, same scope plumbing, same dashboard/admin surfaces, entity-invite role `'manager'`).

**Rule:** an artist is tagged to a manager via `people.manager_id`. The manager's roster = those people; the manager's catalog/songs are **DERIVED** from the roster people's albums (primaryArtistId / owned albums). There is **no `albums.manager_id`** column.

**Why:** managers represent multiple acts and the catalog should auto-fill from whoever is on the roster, with zero per-album bookkeeping. Adding an album-level manager link would create a second source of truth that drifts from the roster.

**How to apply:**
- Scope derivation lives in `server/managerReports.ts` (`resolveManagerScope`), keyed off `people.manager_id` — mirror any label scope change here too.
- Do NOT add `albums.manager_id`. Catalog is always reached through roster people.
- `manager` is in MEMBERSHIP_SCOPE_KINDS + PARTNER_SCOPE_KINDS, threaded through resolveReportScope (`asPartnerKind=label|artist|manager`).
- `manager` is deliberately NOT in PAYOUT_OWNER_KINDS — manager payout economics were left out of the initial build (the payouts tab was removed from AdminManager). Wire payouts before assuming a manager can earn.
- Distinct axis from the teammate sub-role `memberships.sub_role = 'manager'` — that is an org-teammate hat, unrelated to this partner entity. Never conflate them.

## Roster-partner drill-through scope leak (label + manager)
`server/artistReports.ts` `resolveArtistScope` lets label AND manager users drill into a roster artist via `?personId=`. The dataset narrowing (now in exported `computeArtistDatasetScope`) MUST drop the `track_performers`/`track_writers` credited-song UNION for any roster-partner caller — otherwise the partner sees the roster artist's GUEST credits on OTHER artists' albums (off-roster catalog/play-metric leak). Gate var is `isRosterPartnerCaller = role === "label" || role === "manager"`, NOT the old label-only `isLabelCaller`.
**Why:** a roster artist who features on a non-roster album would otherwise leak that album's song into the partner's analytics. Caught in code review.
**How to apply:** any new roster-style partner that reuses the artist drill endpoints must be added to `isRosterPartnerCaller`. Self-view artists + super_admins keep the full union. Covered by server/artistReports.scope.db.test.ts.
