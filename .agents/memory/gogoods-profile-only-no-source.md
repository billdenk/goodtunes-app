---
name: goGoods profile-only fans have no source purchases
description: Why the "backfill missing goGoods purchases for profile-only fans" effort is a dead end with the export we hold
---

# goGoods profile-only fans = registered-but-never-purchased

The ~1,871 prod goGoods customers (of 2,692) that came over **profile-only**
(0 orders, 0 collection — e.g. Kellie Fitzgerald, goGoods user `11834`) are
**not** an importer matching gap. They genuinely have **no** purchase/collection
rows in any source we hold.

**Evidence (verified 2026-06-12):** the only export in the repo
(`attached_assets/gogoods_export_1779758914784.zip`) is the SAME one the
original importer ran against. Cross-referencing it against the live prod
roster by `legacy_gogoods_id`: of the 1,871 profile-only fans, **0** own an
ACTIVE collectible and **0** have a `complete` transaction in the export.
965 of the export's profile-only users are status `PENDING`. Kellie is absent
from the Stripe export CSVs (`unified_payments-*`, `unified_customers-*`) too.

**Why:** these are accounts that registered on goGoods but never bought
anything. The 818 prod buyers came from the Stripe export; the goGoods PG
export only ever carried profiles for the rest. Operator-confirmed for the
named case: Bill confirmed Kellie is absent from the Stripe DB and supplied her
Jan 2026 goGoods support thread — she was *locked out trying to create an
account* (never got her code), so she never completed sign-up or reached
checkout. The `PENDING` profile shell is the fingerprint of a failed signup,
not a lost purchase.

**How to apply:** do NOT attempt to mint orders/collection for profile-only
goGoods fans from the data on hand — it fabricates purchases that never
happened. The ONLY thing that unblocks a real backfill is a genuinely complete
goGoods PG export whose `collectible_transaction`/`collectible` tables contain
these fans' rows — verify by spot-checking that Kellie `11834` has ≥1
`complete` txn AND ≥1 ACTIVE collectible BEFORE any apply. Full write-up:
`docs/migrations/gogoods-profile-only-backfill-analysis-2026-06-12.md`.
