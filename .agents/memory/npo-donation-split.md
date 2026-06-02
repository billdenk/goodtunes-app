---
name: Per-album NPO donation split
description: Design rules for the per-album multi-NPO donation split (beneficiaries → one referral_credit each at sale).
---

# Per-album NPO donation split

An album can name up to 4 NPO beneficiaries, each a per-unit cents amount, totalling
≤ 100¢/unit. Each beneficiary mints ONE `referral_credits` row per paid copy at sale.

## Durable rules (not obvious from code)
- **Funded from GoodTunes margin — never change album pricing.** The donation comes
  out of platform margin, so the fan's price is identical with or without a split.
  **Why:** capabilities.md promises this; a future "make donations bigger" request
  must NOT raise the album price to fund it.
- **referral_credits carries NO album_id.** Any per-album donation read joins
  `rc.order_id → orders.album_id`. Don't add a phantom `album_id`.
- **The old `(order_id, referrer_kind)` unique is gone.** It blocked >1 NPO credit per
  order. Replaced by TWO partial uniques: `(order_id) WHERE referrer_kind='artist'`
  and `(order_id, referrer_org_id) WHERE referrer_kind='non_profit'`. Any new
  ON CONFLICT against referral_credits must target one of these, not the old name.
- **Split is editable until the album's first sale, then add-from-unallocated only.**
  Post-`first_sold_at` you may hand out remaining (unallocated) cents to NEW causes but
  may never reduce or remove an existing beneficiary. **Why:** protects what fans were
  already told their purchase would fund. This is a *different* lock from the partner
  edit_metadata post-sale lock — it's enforced inline in the PUT endpoint.
- **Explicit split vs legacy fallback.** If an album has beneficiary rows, mint one
  credit each (the ≤100¢ cap already absorbs any charity bonus). Only when an album has
  NO rows does the splitter fall back to the single `referred_by_org_id` credit + the
  optional charity bonus.
- **Refund does NOT reverse donation credits (known gap).** `handleRefund` leaves
  minted donation/artist credits in place — same historical behaviour as the artist
  referral credit. A refunded copy still shows on the NPO ledger until this is fixed.

## Default seeding
New albums seed their split from the primary artist's referring NPO
(`people.referred_by_org_id`) at `people.referrer_per_unit_cents` (clamped 1..100).
The one-time backfill in post-merge.sh is marker-guarded so operator edits survive.
