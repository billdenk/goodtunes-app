# Super-admin Artist Profile — Current Source Map

## Read this first

The originally requested tab list — Dashboard, Overview, Cover, GoodTunes® Releases, Streaming, Gear, Splits, Payouts, Permissions — is stale. It must not become the Super-admin Artist Profile navigation.

The current artist-account registry is authoritative:

> **Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals, Shopify, Reports, Settings**

Canon:

- `docs/STATUS.md` — “Artist Dashboard tier discipline” and “Artist rail nav canon”
- `client/src/components/operator/registry.ts` — `modulesForRole("artist")`
- `client/src/pages/ArtistDashboard.tsx` — `ARTIST_PORTAL_TABS` and `ArtistTabBody`

Ruby must reuse the real artist tab bodies. Do not recreate them from screenshots, older handoffs, release-level pages, or admin-only panels.

## Requested tabs: definitive disposition

| Requested tab | Exists? | Canonical route | Canonical component/source | Artist behavior | Super-admin delta |
|---|---|---|---|---|---|
| Dashboard | YES | `/artist?tab=dashboard`; bare `/artist` defaults here | `ArtistDashboard` / `DashboardTab`, `client/src/pages/ArtistDashboard.tsx` | Metrics, date range, activity, KPI links | Same `DashboardTab`; explicit artist `personId`, broader data access, operator chrome |
| Overview | **ABSENT** | None; stale `tab=overview` canonicalizes to Dashboard | Canonicalization in `client/src/pages/ArtistDashboard.tsx` | Overview was merged into Dashboard | No separate admin Overview |
| Cover | **ABSENT** as an account tab | None | Release art lives in `ArtistReleasesWall` and release-level `ArtistRelease` | Artwork is managed per release | Inspect through the same release body; do not create an account Cover tab |
| GoodTunes® Releases | YES, named **Releases** | `/artist?tab=catalog` | `ArtistReleasesWall`, `client/src/pages/artist/restructure/ArtistReleasesWall.tsx` | Release wall, statuses, card actions, New Release | Same wall; operator release links may open `/admin/albums/:id` |
| Streaming | **ABSENT** as an account tab | None | No artist registry entry | No account-tab behavior | Do not promote player or release streaming UI into a profile tab |
| Gear | **ABSENT** as an account tab | None | Existing gear components are admin/vendor/release features | No account-tab behavior | Do not reuse `PersonGearManager` as an artist profile tab |
| Splits | **ABSENT** as an account tab | None | Existing split panels are admin/release surfaces | No account-tab behavior | Do not reuse `SplitsPanels` or `AlbumNpoSplitPanel` as profile tabs |
| Payouts | **ABSENT** as a standalone tab | No `/artist?tab=payouts` | Payout setup is inside `ArtistSettingsPage`; earnings/payments are inside `ArtistReportsHub` | Manage payout account in Settings; inspect earnings in Reports | Same Settings and Reports bodies with explicit `personId`; never substitute `/admin/payouts` |
| Permissions | **ABSENT** as a standalone tab | None | Team/access lives in `ArtistSettingsPage` | Invite and manage teammates through Settings → Team | Same Settings body with scoped operator permissions; no separate Permissions tab |

The word **ABSENT** above is intentional. Do not fill those gaps with nearby-looking components.

## Actual current artist registry

Source of truth: `client/src/components/operator/registry.ts`.

| Rail label | Registry id | Canonical route | Shared body |
|---|---|---|---|
| Dashboard | `dashboard` | `/artist?tab=dashboard` | `DashboardTab` branch in `ArtistTabBody` |
| Releases | `catalog` | `/artist?tab=catalog` | `ArtistReleasesWall` |
| Audience | `audience` | `/artist?tab=audience` | `AudienceTab` |
| Acquisition | `acquisition` | `/artist?tab=acquisition` | `AcquisitionTab` |
| Orders | `orders` | `/artist?tab=orders` | `OrdersTab` |
| Buyers | `buyers` | `/artist?tab=buyers` | `BuyersTab` |
| Referrals | `referrals` | `/artist?tab=referrals` | `ReferralsTab` |
| Shopify | `shopify` | `/artist?tab=shopify` | `ArtistShopifyTab`, `client/src/components/operator/ArtistShopifyTab.tsx` |
| Reports | `reports` | `/artist?tab=reports` | `ArtistReportsHub`, `client/src/pages/artist/restructure/ArtistReportsHub.tsx` |
| Settings | `settings` | `/artist?tab=settings` | `ArtistSettingsPage`, `client/src/pages/artist/restructure/ArtistSettingsPage.tsx` |

Audience, Acquisition, and Buyers are top-level destinations. Reports is the Payments/Earnings hub. Settings is pinned to the bottom of the GoodTunes rail.

## Shell and layout canon

The protected artist account route is `/artist`, mounted by `client/src/App.tsx`.

`ArtistDashboard` renders the shared `OperatorShell` with:

- artist registry tabs
- left-rail layout
- spaced content
- `superAdminView` when rendered for an operator

Sources:

- `client/src/pages/ArtistDashboard.tsx`
- `client/src/components/operator/OperatorShell.tsx`
- `client/src/components/operator/registry.ts`

Page titles, range controls, filters, cards, tables, loading states, empty states, and actions belong to the shared tab bodies. The Super-admin Artist Profile must not wrap them in a second visual system.

Responsive and theme behavior also comes from the existing shell and bodies:

- Preserve their flex wrapping and full-width constrained content at desktop and 768px.
- Preserve current light-slate and charcoal-dark themes.
- Never introduce fan navy into the artist/operator portal.
- Do not derive new fixed widths, radii, or spacing from screenshots when the canonical component already defines them.

## One body, two chromes

The implementation rule is:

> **One body, two chromes. Super-admin reuses the artist body and changes only permission, scope, and quiet contextual actions.**

The reuse seam already exists:

- `ARTIST_PORTAL_TABS` — `client/src/pages/ArtistDashboard.tsx`
- `ArtistTabBody` — `client/src/pages/ArtistDashboard.tsx`
- `AdminPerson` imports and mounts both — `client/src/pages/AdminPerson.tsx`

Current operator differences:

1. Queries receive the selected artist’s explicit `personId`.
2. `superAdminView` supplies operator context through the shell.
3. Release links may open `/admin/albums/:id`; the artist remains on `/artist/albums/:id`.
4. Artist-session-only referral invitation UI is suppressed in operator view.
5. Additional operator actions must remain quiet, contextual, and permission-driven.

Do not create parallel `AdminArtistDashboard`, `AdminArtistOverview`, or copied tab bodies.

## Account pages are not release pages

These are embedded release routes, not artist-account tabs:

- `/artist/albums/:id`
- `/artist/albums/:id/art-test/:componentId`

Their source is `client/src/pages/artist/restructure/ArtistRelease.tsx`. Release-level Dashboard, Details, Assets, Package, Store, and Payments must not be substituted for the account-level artist profile.

The public fan route `/artist/:slug` is also unrelated to the signed-in artist account.

## Stale implementations not to copy

- `?tab=overview` and `?tab=people` are stale and canonicalize to Dashboard.
- Old `?tab=reports&rtab=audience|acquisition|buyers` links canonicalize to the corresponding top-level rail item.
- The artist rail label is **Releases**, despite its internal id remaining `catalog`.
- Older handoff/mock implementations are visual history, not runtime canon.
- `PartnerPermissionsPanel`, `PersonGearManager`, `SplitsPanels`, `AlbumNpoSplitPanel`, and admin payout screens are not artist-account tabs.

## Verification

No ZIP or binary screenshot dump is part of this handoff. Ruby has the Git mirror; current source and the running app are more authoritative than frozen screenshots.

Useful development verification:

- Account: `/artist`
- Tab: `/artist?tab=<registry-id>`
- Seeded artist login: `appreview@goodtunes.music`
- Seeded release: `/artist/albums/album-sampler`
- Appearance override: append `?gtappearance=dark` or `?gtappearance=light`

Screenshots may be used to verify rendered states, but they must never override the registry or shared component source.