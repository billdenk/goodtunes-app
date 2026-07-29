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

4. **Global operator registries** — `label`/`manager`/`non_profit` are denied a
   BROAD set of operator-only registries by `denyReportingPartnerRegistry`
   (server/routes.ts, session-OR-bearer): press registry + wholesale catalogs
   (`/api/manufacturers`, `/api/admin/manufacturers`), gear (`/api/admin/instruments`),
   label (`/api/admin/labels`), manager (`/api/admin/managers`), organization/NPO
   (`/api/admin/organizations`), fulfillment (`/api/admin/fulfillment-partners` +
   `/api/fulfillment-partners`), press-formats (`/api/admin/press-formats`),
   partner-notifications (`/api/admin/partner-notifications`), the vendor
   (Maker/Reseller) registry (`/api/admin/vendors`), the global omnibox search
   (`/api/admin/search`), the fan customer registry + PII (`/api/admin/customers`
   list/geo/detail), editorial playlists (`/api/admin/playlists`), and the
   operator-only transactional/ops registries: fan orders w/ PII
   (`/api/admin/orders`), pressing orders (`/api/admin/pressing-orders`), the
   wholesale RFQ queue (`/api/admin/rfqs`), the admin event/audit log
   (`/api/admin/events`), and payout accounts/stuck (`/api/admin/payouts`). NOTE
   the `/api/admin/orders` + `/api/admin/payouts` handlers live in
   `commerce.ts` / `payouts.ts` and are registered AFTER the deny block, so the
   `app.use(prefix, deny)` mount still wins (registration order matters). The
   `/api/admin/customers` artist-only scoped branch is untouched (deny covers only
   label/manager/non_profit). AdminFrame fires orders/customers badge queries
   (enabled:isAdmin) for these roles too, but it trims their nav so the badges
   never render — the 403s are harmless background (and correct: the client
   shouldn't get that data). The guard is now a FACTORY
   taking the denied-role set and **fails CLOSED** (a resolved userId whose role
   lookup throws is 403'd, not let through; anon/no-userId still falls to
   `requireAdmin`'s 401). Pinned by `server/labelManagerNpoIsolation.db.test.ts`
   (Bearer + session).

   **NON-OBVIOUS CARVE-OUTS — these must fall THROUGH the deny, not be blocked:**
   - `/api/admin/people` (+ `/api/admin/invites` + `/api/admin/partner-contacts`):
     the `AddPeopleMenu` roster builder (embedded in the label + NPO portals via
     `OrganizationPeople`) legitimately GET-searches / POST-creates / GET-reads
     global People rows and forwards the invite flow into those endpoints
     server-side, so a blanket deny breaks a real portal feature.
   - `GET /api/admin/vendors/:id/gooddeed-services` ONLY: the vendor mount is
     path-aware — that single GET backs the NPO-reachable GoodDeed pricing page
     (`/admin/gooddeed-pricing`), so it falls through to `requireAdmin`; the vendor
     list, detail, and every vendor write stay denied. The carve-out regex is an
     EXACT `^/[^/]+/gooddeed-services/?$` match (GET-only; PUT writes stay denied) —
     a nested sub-path falls back to the registry deny (pinned by a test).

   The "portals only call their scoped /api/{label,manager,non-profit}/* endpoints"
   assumption is FALSE — verify actual client calls before denying any shared admin
   prefix.

5. **Per-route allow-lists behind requireAdmin** — even routes with an artist
   scoping branch (`/api/admin/orders` in commerce.ts, the `/api/admin/customers`
   list/geo/detail family) failed OPEN: any role NOT matched by the artist branch
   (manufacturer/vendor/fulfillment, or an unknown future role) fell through to
   the global fan-PII feed. Fixed to explicit allow-lists (operators global,
   artist scoped, everything else empty/403). Same class of bug on the
   `/api/admin/people` typeahead (no artist scoping at all) and on `/api/people`,
   which resolved the caller SESSION-ONLY so a Bearer-authed artist looked
   anonymous and got the full catalog — any public route that scopes by admin
   role must resolve session-OR-bearer (admin-kind only). Pinned by
   `server/partnerOrderPeopleScope.db.test.ts`.

**How to apply:** when adding ANY new admin-side role (publisher was the example —
it has only the self-scoped GET /api/publisher/statement), fail it closed in
`NO_ALBUM_LIST_ROLES`, `requireReportScope`, AND (if it should not see hidden album
detail) `PORTAL_SCOPED_NON_OPERATOR_ROLES`, and add a client `/admin/*` route guard
in client/src/App.tsx (mirror the `isArtistPartner` / `isPublisherPartner` blocks).
For a scoped reporting role, also decide which global registries to deny via
`denyReportingPartnerRegistry` — but confirm the portal's real fetches first
(People/invites/partner-contacts are shared by design; see point 4).

**2026-07 additions (Shopify review 2.1.1 sweep):**
- Client nav gating must be fail-CLOSED too: AdminAlbum's operator-only tabs were once gated by an exclude-list of partner roles (narrowing `hidePress` to labels-only made newer roles fail open). Gate on an explicit `operatorTabs` (super_admin/admin) flag instead.
- The Shopify album READ routes (shopify-push/-mappings/-sales) sat behind `requireAdmin` with no `gateAlbumRoute` — any partner could read any album's push metadata, and the push-status `stores` list returned EVERY connected store platform-wide. All three now gate on `map_shopify` and the stores list is role-scoped. Regression test: `server/shopifyAlbumReadScope.db.test.ts`.
- shopify.ts's local Bearer-only `requireAdmin` did not backfill `req.session.userId`, so adding `gateAlbumRoute` (which reads session) 401'd every bearer caller until the guard backfilled it — same landmine as requirerole-vs-requireadmin-session-backfill.md.
- Frame-level badge queries (e.g. AdminFrame's feedback count) must be `enabled:`-gated on operator role or every partner page collects console 403s — reviewer-visible noise.
- Shopify reviewer demo env (shopifyreview@goodtunes.music, artist person-shopifydemo-artist, album album-shopifydemo) is seeded idempotently via post-merge; runbook section 5b in docs/shopify-app-review.md.
