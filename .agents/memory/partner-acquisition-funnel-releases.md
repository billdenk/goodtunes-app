---
name: Partner acquisition funnel — release picker scope
description: Why the partner release picker lists ALL owned releases but god-view stays trafficked-only
---

The Acquisition tab's release picker feeds two things: the funnel chart AND the
campaign link-builder. These have opposite "what counts as a release" needs.

- `funnelReleases(albumIds)` returns only releases that already have
  `album_viewed` traffic — the honest "nothing to show yet" set for the funnel.
- `ownedReleasesWithFunnel(albumIds)` returns ALL owned releases incl.
  zero-traffic (soft-deleted excluded), landed defaulting to 0.

`partnerFunnelReleases(ctx)` picks between them:
- god-view (`albumIds === null`): `funnelReleases(null)` — trafficked-only,
  because you can't enumerate the whole catalog and an operator always has
  trafficked releases.
- a real partner (array, incl. `[]`): `ownedReleasesWithFunnel(albumIds)`.

**Why:** a brand-new release has zero traffic, which is the exact moment a
partner needs the campaign link-builder. Sourcing the picker from trafficked
releases left a new release showing an empty state with no way to build links.
(This was the code-review blocker on the first cut.)

**How to apply:** if you add another surface that needs to pick a partner's
releases for an action (not just funnel display), source it from
`ownedReleasesWithFunnel`, not `funnelReleases`. The link-builder UI itself is
the shared `client/src/components/operator/CampaignLinkBuilder.tsx`, reused by
both the partner AcquisitionTab and the operator AdminReports funnel view —
`utm_source` must match the funnel's `deriveSource` key or clicks won't
self-attribute into the "By source" breakdown.

## Date-range parity across partner roles
AcquisitionTab takes an OPTIONAL `rangeQs`. Artist/label dashboards have a page-level `RangePicker` (shared across tabs) and pass `rangeQs` in. The non-profit dashboard has NO page-level range infra, so it passes no `rangeQs` → AcquisitionTab falls back to its OWN in-tab `RangePicker` (SELF_RANGE_PRESETS, default 30d) so the date window is honored for every partner role. `usesOwnRange = rangeQs === undefined` is the discriminator; never make non-profit the odd one out by leaving its window server-defaulted.
