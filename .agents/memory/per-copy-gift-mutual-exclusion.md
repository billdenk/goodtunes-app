---
name: Per-copy vs whole-order gift mutual exclusion
description: Why the gift partial unique indexes can't enforce whole-order/per-copy exclusivity, and that revoke is terminal.
---

# Per-copy vs whole-order gift mutual exclusion

A `gifts` row is either a **whole-order** gift (`copy_id IS NULL`, also stamps
`orders.gift_id`) or a **per-copy** gift (`copy_id` set). The two flows are
mutually exclusive on a given order.

## The indexes do NOT enforce that exclusivity
- `gifts_order_whole_uniq` = unique `(order_id) WHERE copy_id IS NULL`
- `gifts_order_copy_uniq`  = unique `(order_id, copy_id) WHERE copy_id IS NOT NULL`

These only conflict **within a kind**. A concurrent whole-order create and a
per-copy create on the same order do NOT collide on either index, so both can
pass the SELECT pre-checks and both INSERT. SELECT-then-INSERT alone is racy.

**How to apply:** `createGiftRecord` (server/gifts.ts) must run its pre-checks
+ insert + `orders.gift_id` stamp inside ONE `db.transaction` whose first
statement locks the order row with `.for("update")` (SELECT ... FOR UPDATE).
That serializes concurrent creates on the order row; the loser, after the
winner commits, sees the committed gift / stamped `gift_id` and returns 409.
Any future gift-creation path must go through `createGiftRecord` or take the
same order-row lock, or the invariant breaks again. (db.transaction is centrally
wrapped by transactionWithRetry — only retries cached-plan 0A000, rethrows the
rest with err.cause intact, so the 23505→409 intra-kind backstop still works.)

## Revoke is terminal for a copy
`applyBuyerRevoke` only stamps `buyer_revoked_at` — it does NOT delete the gift
row, free the slot, or clear `orders.gift_id`. The dup-check and the unique
index both still see the revoked row, so a revoked copy CANNOT be re-gifted
(create returns 409). This mirrors the legacy whole-order contract.
**Why:** the product meaning of revoke is "cancelled — this copy stays with
you," a terminal state; the UI (CopyGiftCard) shows no re-gift affordance on a
cancelled copy. Don't "fix" re-gift-after-revoke without a deliberate product
decision (it would need the dup-check AND the partial index to exclude revoked).
