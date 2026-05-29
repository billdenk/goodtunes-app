---
name: Per-sale pool accrual needs refund reversal across 3 sites
description: Any per-album/per-sale earmark that accrues on paid sales must also reverse on refund, and refunds fan out across three separate code paths.
---

Any feature that accrues money into a per-album pool on a paid sale (e.g. the
early-cut press funding pool: `album_press_pool_ledger` + denormalized
`albums.press_pool_accrued_cents`) MUST also subtract it back on refund, or the
pool overstates what fans actually paid and downstream gates (funding floors,
auto-triggers) fire on phantom money.

**Why:** accrual hooks live on the paid-sale path only; the refund path is
separate and easy to forget. A refunded sale that never reverses leaves the pool
permanently inflated.

**How to apply:** an order refund fans out across **three** sites — wire the
reversal into all of them:
- `server/commerce.ts` `handleRefund()` (Stripe webhook + non-shopify refund route)
- `server/commerce.ts` the inline Shopify full-refund branch in the admin refund route
- `server/shopify.ts` `handleShopifyRefund()` (Shopify webhook)

Make the reversal idempotent with a partial unique index keyed on
`(album_id, source_order_id)` for the reversal kind, and read the exact accrued
cents back from the ledger rather than re-deriving them (tier/price can change
between sale and refund). Decrement the denorm with `GREATEST(0, … - cents)`.

Also: any admin "approve and move money" endpoint that flips a status then does
ledger/payout side effects must run the status claim + side effects in ONE
`db.transaction` (conditional `UPDATE … WHERE status='pending' RETURNING id` as
the claim) so a mid-sequence failure rolls the claim back and the row stays
retryable instead of stranded half-applied.
