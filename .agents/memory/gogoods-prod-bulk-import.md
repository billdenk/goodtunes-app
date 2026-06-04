---
name: gogoods prod bulk import
description: Why the gogoods customer/purchase importer must batch inserts and dedup unique constraints when run against prod.
---

# gogoods prod bulk import (scripts/import-gogoods.ts)

The importer does the whole apply in ONE `db.transaction`. Two prod realities bite
that a throwaway dev DB never exposed:

## 1. Single-transaction round-trip count must be batched
Prod DB sits behind a link-local proxy (~68ms/query) and has
`idle_in_transaction_session_timeout = 5min`. ~9,000 sequential awaited single-row
inserts ≈ 10min → the process is torn down mid-transaction and the whole apply
rolls back atomically (prod silently unchanged, no report written).
**Fix:** collect each bulk loop's rows into an array and `tx.insert(t).values(chunk)`
in chunks of 500 (PG param cap 65535). Cuts ~9,000 round-trips → ~170 (~15-20s).

**Map dependency note:** songs need no RETURNING (the song legacy→id map is never
read downstream). Created customers DO need their generated id (consumed by
user_albums + orders), so batch customers with `RETURNING id, legacy_gogoods_id`
and rebuild the map by legacy id (don't rely on RETURNING row order).

## 2. The gogoods source violates prod-only unique constraints
- `orders_album_good_deed_number_uniq` — partial unique on
  `(album_id, good_deed_number) WHERE good_deed_number IS NOT NULL`. Resold
  collectibles mean the same GoodDeed number appears across multiple complete
  txns on one album → duplicate insert. **Fix:** dedup candidates, sort by
  `created_at` desc, keep the MOST RECENT (sale of record, matches current owner
  in user_albums), skip older ones. Nulls never collide (partial index).
- `orders_stripe_payment_intent_id_unique` — full unique; NULLs are distinct so
  the many legacy null payment_ids are fine, but a repeated non-null id collides.
  **Fix:** null the duplicate ref, keep the order (never drop a purchase over a
  stale Stripe linkage).
- `user_albums_user_album_uniq` `(user_id, album_id)` is already handled by the
  in-loop `ownedSet`; the 4 linked accounts (Andrew + 3 Bill emails) overlap
  albums they already own, so those land as skips, not errors.

**Why:** the 2026-05-26 run hit dev (no these constraints / no conflicting rows)
so neither problem surfaced until the real prod apply.

## Admin association is safe
The importer NEVER touches `users` (admin) and only stamps `legacy_gogoods_id` on
existing `customer_users` rows (ids unchanged). So `users.customer_user_id` links
stay intact and Bill's `billdenk@*` customer rows remain linkable to admin.
