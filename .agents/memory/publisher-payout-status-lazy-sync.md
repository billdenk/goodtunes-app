---
name: Publisher payout status lazy-sync
description: Why payout-status reads must lazy-sync from Stripe instead of trusting the stored payoutsEnabled flag
---

`payout_accounts.payoutsEnabled` only advances when Stripe's `account.updated`
**Connect** webhook is delivered to the platform (`server/commerce.ts` →
`syncAccountFromStripe`). That delivery is fragile: it lags, and the Connect
webhook endpoint may not even be configured in a given Stripe account. So any
publisher/partner *status* read that drives a "ready vs in progress" UI must
not trust the stored flag while it's still false.

**Rule:** when an account row exists but `payoutsEnabled` is false, do a live
`stripe.accounts.retrieve` + `syncAccountFromStripe` on read and report the
fresh value. Bound it (stop once enabled) and make it best-effort (fall back to
the stored value on any Stripe error). `GET /api/publisher/me` does exactly
this.

**Why:** the publisher portal banner (`PublisherPortal.tsx`) would otherwise
stay stuck on "Payout setup in progress" forever after a publisher completes
Stripe onboarding, because nothing else re-syncs their account. The Stripe
return_url (`/publisher?payout=return`) reloads the page, so a fresh `me` fetch
is all that's needed once the read self-heals.

**How to apply:** reuse this lazy-sync pattern for any future partner-facing
payout-status surface; don't add a separate manual "refresh" button as the
primary mechanism. The admin `/api/admin/payouts/accounts/:id/refresh` route is
the on-demand operator equivalent.
