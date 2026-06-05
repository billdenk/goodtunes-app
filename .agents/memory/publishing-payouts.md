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

## Confirmed by Bill (for the Nick prod backfill)
- **Units pressed = 500 for every pressed Nick album** (both Pressing Business and MRP runs were 500). So the catalog roll-up applies 500 units uniformly; per-album figures only differ by song count × splits.
- **"Songs From Lenwood" pays to Kobalt** (the administrator) — model as administered-by routing: Songs From Lenwood org `payToOrgId` → Kobalt org.
- **"Wild Heart" and "Take You with Me" (bonus, track 17) splits come from Nick's attorney (Charley) doc**, which Bill is uploading — treat that doc as the authoritative split source and reconcile the workbook against it before writing prod. Do the prod load from Charley's doc, not the workbook alone, to avoid re-doing it.

## Data reality (Nick Carter catalog)
- **Nick's catalog is PROD-ONLY** (zero rows in dev) — publishing data writes target prod via marker-guarded `post-merge.sh` backfill; can't dry-run against his real songs in dev.
- As of this work: 50 Nick songs in prod, 0 publishing splits, 0 publisher organizations (only 3 non_profit orgs).
- Sheet has dup/identity issues that MUST be deduped before creating payees: "Concord ANZ" vs "Concord ANZ Pty Ltd"; "Songs From Lenwood" with/without "adm. by Kobalt"; bare "Publishing Designee (BMI)" vs "Publishing Designee of <name>" (Abraham Poythress "Abrham" typo + John Christian Frasca). Two covers (Dirty Laundry → Henley/Woody Creek + Kortchmar/WC Music; Help Me Re-Record → Gerrard/Vice-Maslin) pay outside writers, Nick has no share.

## Settlement money math — round ONCE per payee
- `computeAlbumPublishingSettlement` accumulates each split line's owed **micros** into a `microsByPayee` map and converts to cents exactly once at finalization (`round(micros / 10000)`). Do NOT round per split line then sum — when one payee carries several lines (Songs of Kaotic spans the whole catalog) the pre-rounded sum drifts a penny or two from the correct aggregate.
- **Why:** Bill's whole reason for this system is "never sloppy again" — these totals become real payment-account balances; per-line rounding silently mis-states them. Locked by the "penny-drift guard" test in `publishingSettlement.db.test.ts` (3 half-cent lines → 2¢ aggregate, not 3¢).
- The statutory rate is a single setting (`payout_settings.mechanical_rate_micros`, 127000 = $0.127) passed through as `rateMicros`; the sheet's "$127/song" is a 2× error — never hard-code dollar amounts, the engine is data-driven off splits × units × rate.
- Per-album `?unitsPressed=N` override is validated `Number.isFinite`, `0 ≤ n ≤ 100M`, truncated to int before entering the math.
- **Round once per payee at the CATALOG level too, not just per album.** The engine rounds per payee per album; summing those per-album rounded totals across the catalog gives $1778.01, but a payee is cut ONE aggregate check across all releases (Hipgnosis spans the Double LP + several singles), so the catalog roll-up must re-aggregate each payee's raw `amountMicros` across albums and round once → exactly $1,777.99 / 18 payees. `SettlementPayee.amountMicros` is exposed for this; the `/api/admin/publishing/settlements` roll-up sums micros per `payeeKey` then rounds, and its headline `totalCents` is the sum of those per-payee rounded amounts (the real payout truth). The per-album `albums[]` subtotals can sum to a cent or two more — that gap is inherent rounding granularity, NOT a bug; the per-payee figure is authoritative.
