---
name: Partner-admin roles fail OPEN to god-view in two shared gates
description: Adding a new partner-admin role silently grants full-catalog + all-partners reports unless explicitly fail-closed in BOTH gates plus the report guard.
---

# Partner-admin roles fail OPEN to god-view

Two shared scoping gates treat "any `isAdmin` role I don't explicitly handle" as
the super_admin god-view, NOT as empty. So a newly-introduced partner-admin role
silently inherits operator-level visibility until it is explicitly fail-closed:

1. **Album list** — `filterAlbumsForPartnerRole` (server/lib/albumCatalogScope.ts)
   returns `null` (= operator full catalog, incl. hidden) for any role not in its
   switch / not in `NO_ALBUM_LIST_ROLES`. Fix = add the role to `NO_ALBUM_LIST_ROLES`.
2. **Partner reports** — `effectiveScopeFilter` / `resolveScope`
   (server/auth/roles.ts + server/reports/index.ts) fall through to
   `{ albumIds: null }` ("All partners" god-view) for any role that isn't
   label/artist/manager/non-profit. `requireReportScope` admits any `user.isAdmin`
   caller, and partner-admin roles ARE `isAdmin=true`. Fix = reject the role in
   `requireReportScope` (or give it a real scope).

**Why:** partner-admin roles authenticate on the admin host (isAdmin=true) so they
can reach their portal; the gates were written assuming the only un-handled isAdmin
caller is super_admin. `requireAdmin` (server/routes.ts ~L287) DOES explicitly 403
each non-operator role on `/api/admin/*`, but the two gates above sit on looser
guards (`requireAuth` for /api/albums, `requireReportScope` for /api/partner/reports)
and are the real exposure.

3. **Album DETAIL by UUID** — GET /api/albums/:id used `includeHidden =
   isAdminUser`, so any partner-admin role could read a hidden/staged release by
   UUID even when its list/report views were fail-closed. Now scoped via
   `albumReadIncludeHidden` (server/routes.ts) + `PORTAL_SCOPED_NON_OPERATOR_ROLES`
   (server/lib/albumCatalogScope.ts). That set is deliberately NARROWER than
   `NO_ALBUM_LIST_ROLES`: it is exactly {label, manager, non_profit, publisher};
   manufacturer/vendor/fulfillment intentionally KEEP the operator-grade detail
   read, so don't fold the two sets together.

**How to apply:** when adding ANY new admin-side role (publisher was the example —
it has only the self-scoped GET /api/publisher/statement), fail it closed in
`NO_ALBUM_LIST_ROLES`, `requireReportScope`, AND (if it should not see hidden album
detail) `PORTAL_SCOPED_NON_OPERATOR_ROLES`, and add a client `/admin/*` route guard
in client/src/App.tsx (mirror the `isArtistPartner` / `isPublisherPartner` blocks).
