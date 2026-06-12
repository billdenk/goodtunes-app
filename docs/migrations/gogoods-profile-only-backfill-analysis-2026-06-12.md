# goGoods profile-only fans — backfill analysis (BLOCKED on source)

**Date:** 2026-06-12
**Task:** Backfill missing goGoods purchases for profile-only fans (#1988)
**Outcome:** **No writes performed.** The required complete export was never
provided; the only export we hold contains no purchase data for these fans.
Minting orders/collection for them would fabricate purchases that never
existed (explicitly out of scope).

## What the task assumed

That ~1,874 of 2,692 imported goGoods fans (incl. Kellie Fitzgerald,
goGoods user `11834`) came over **profile-only** because the
`collectible_transaction` export the importer was run against was
**incomplete** — and that re-running the importer against a *complete*
goGoods PostgreSQL export would restore their orders + collection.

The blocking pre-flight check (per the task): spot-check Kellie in the
complete export — **if her transaction/collectible rows are absent there
too, the source itself is incomplete; report back before any writes.**

## What we actually have

The only goGoods export in the repo is
`attached_assets/gogoods_export_1779758914784.zip` — the **same** export the
original importer (`scripts/import-gogoods.ts`) and the QR backfill
(`scripts/backfill-gogoods-collectible-ids.ts`) already ran against. No new
"complete" export was supplied.

Export contents (8 CSVs):
`artist, artist_release, release, recording, user, collectible,
collectible_transaction, collectible_transaction_collectible`.

## Findings (export ⇄ production cross-reference)

Production (read-only) baseline — matches the task framing:

| Metric | Count |
|---|---:|
| Imported goGoods customers | 2,692 |
| …with orders + collection (the Stripe-export buyers) | 818 |
| …**profile-only** (no orders, no collection) | 1,871 |
| Total `legacy:gogoods` orders | 2,701 |

In the export itself:

| Metric | Count |
|---|---:|
| `user` rows | 2,940 |
| Users with ≥1 `collectible_transaction` (any status) | 1,479 |
| Users with a **`complete`** transaction | 945 |
| Users owning ≥1 **ACTIVE** collectible (owned) | 942 |
| Users owning any collectible | 944 |
| Profile-only in export (no txn, no collectible) | 1,461 |
| …of which status `PENDING` | 965 |

**Cross-reference (the decisive result).** Of the **1,871** prod profile-only
fans, matched to the export by `legacy_gogoods_id`:

- **0** own an ACTIVE collectible in the export.
- **0** have a `complete` transaction in the export.
- **1,871** are genuinely empty at source (no complete txn, no active
  collectible).

**Kellie (`11834`)** specifically: present in `user.csv` (status `PENDING`,
blank first/last name, no location, created 2026-01-23) with **0** rows in
`collectible_transaction` and **0** rows in `collectible`. She is also absent
from both in-repo Stripe export CSVs
(`unified_payments-54_*.csv`, `unified_customers-13_*.csv`).

**First-hand corroboration (operator-confirmed).** Bill confirmed Kellie never
appears in the Stripe database, and supplied the goGoods support email thread
for her: on **2026-01-22/23** Kellie wrote in *"Locked out of trying to create
an account"* — she initiated an account "to likely make a purchase," never
received her verification code, and was left with a half-created account she
couldn't sign into or reset. Bill's reply suggested she retry via Continue with
Apple/Google. This is exactly consistent with the data: her account exists only
as a `PENDING` profile shell with no transaction and no collectible — she never
completed sign-up, so she never reached checkout and never purchased.

## Conclusion

This is **not** an importer matching gap — there are simply no source
purchase/collection rows for the profile-only fans. They are
registered-but-never-purchased accounts (the heavy `PENDING` skew confirms
it). Re-running the importer against this export is a clean no-op for them by
design, and creates nothing to restore.

Therefore the backfill **cannot proceed**: there is nothing to backfill from
the data we hold, and writing orders/collection anyway would mint purchases
that never happened.

## What would unblock this

A genuinely **complete** goGoods PostgreSQL export whose
`collectible_transaction` + `collectible` tables actually contain the
profile-only fans' rows (verify by spot-checking Kellie `11834` has ≥1
`complete` transaction and ≥1 ACTIVE collectible before any apply). If such an
export is produced, the existing idempotent importer can be pointed at it
(`tsx scripts/import-gogoods.ts --dir <folder>` dry-run, then `--apply`), and
the data backfill landed via the marker-guarded post-merge path so it reaches
prod and is a no-op for the 818 already-imported buyers.

If no such export exists (i.e. these fans truly never purchased on goGoods),
then nothing is stranded — the admin customer page is already showing their
state accurately, and no action is warranted.
