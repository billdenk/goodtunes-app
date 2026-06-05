---
name: Publishing payouts (mechanical settlement on pressed units)
description: How publishing/writer-publisher payouts differ from sales payouts, and what app infra already exists to build them on.
---

# Publishing payouts

**Basis is units PRESSED, not units sold.** Bill's publishing settlement pays a flat per-song amount on the pressing run (Nick's runs: $127.00/song = $0.254/unit × 500), split among writers/publishers. This is a mechanical-royalty settlement and is INDEPENDENT of Stripe sales — it does not move with how many copies sold. Keep it as its own ledger, separate from the artist sales payout.

**Why:** Bill sent a publishing sheet computed off the Pressing Business / MRP order quantities, not sales. Conflating the two double-pays or under-pays.

## Existing infra to build on (don't reinvent)
- `track_publishing_splits` (percentBp 0–10000, links person_id OR organization_id) — the per-track split model. `track_mechanical_splits` is the master/recording side.
- `organizations` (kind="publisher"|"label"|...) — publisher payee entities. `people` — writers.
- `payout_accounts` (owner_kind person|label|manufacturer|organization, ownerId → stripeAccountId) — the Stripe Connect Express payee record; onboarded via `PayoutAccountPanel`.
- Payout rail: order ship → `attemptTransferForOrder` mints a `payout_earmarks` row → super-admin "Release" in /admin/payouts-release → `stripe.transfers.create`. `referral_credits` (NPO/referral) uses the same earmark→release pattern via `server/referralPayouts.ts`.
- Splits UI: `client/src/components/admin/SplitsPanels.tsx`; display credits: `track_writers`/`track_performers`, `TrackCreditsPanel.tsx`, fan-facing `buildAlbumCreditGroups`.

## What's MISSING for publishing payouts
- No engine that mints payout ledger rows from `track_publishing_splits` (on a pressed-units basis).
- Publisher-payee onboarding not exposed on org pages; no validation that every split has a payout account before release.
- No server-side per-payee aggregation across an album/run.

## Data reality (Nick Carter catalog)
- **Nick's catalog is PROD-ONLY** (zero rows in dev) — publishing data writes target prod via marker-guarded `post-merge.sh` backfill; can't dry-run against his real songs in dev.
- As of this work: 50 Nick songs in prod, 0 publishing splits, 0 publisher organizations (only 3 non_profit orgs).
- Sheet has dup/identity issues that MUST be deduped before creating payees: "Concord ANZ" vs "Concord ANZ Pty Ltd"; "Songs From Lenwood" with/without "adm. by Kobalt"; bare "Publishing Designee (BMI)" vs "Publishing Designee of <name>" (Abraham Poythress "Abrham" typo + John Christian Frasca). Two covers (Dirty Laundry → Henley/Woody Creek + Kortchmar/WC Music; Help Me Re-Record → Gerrard/Vice-Maslin) pay outside writers, Nick has no share.
