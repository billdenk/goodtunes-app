---
name: order materialization test seam
description: How to drive materializeOrderFromSession in a test without calling Stripe, and why unpaid sessions are the cheap path.
---

# Testing order materialization (materializeOrderFromSession)

`materializeOrderFromSession` in `server/commerce.ts` re-fetches the session
from Stripe internally (`checkout.sessions.retrieve` + `listLineItems`), so a
test can't just hand it a plain object. It takes an optional `{ stripe }`
injection seam (prod passes nothing → `getStripe()`); a test passes a stub
exposing only `checkout.sessions.retrieve` and `checkout.sessions.listLineItems`.

**Why an UNPAID fixture session is the right test surface:** the `order_items`
insert (and `order_copies`) happen in the fresh-order branch regardless of
`payment_status`. Setting `payment_status: "unpaid"` skips the whole
paid-only block (GoodDeed numbering, stock decrement, referral-credit accrual,
Order Desk handoff, PI metadata patch, receipt email), so the test needs to
seed only `customer_users` + `albums` + `album_skus` — not the entire
referral/press graph. Set `customer: null` so the Stripe-customer backfill is
skipped too.

**Snapshot derivation map** (what the test must arrange to populate each
column): `vinylColor`/`jacketUpgrade` come from the `album_skus` row matched by
the format line item's `gt_sku` (must equal a real format like `12_lp`);
`fulfiller` comes off the custom_addon line item's `product.metadata.gt_fulfiller`;
`kind`/`sku` come off `product.metadata.gt_kind`/`gt_sku`.

**Why:** the schema-drift guard only proves columns exist, not that the write
path still populates them — a dropped `items.push({...})` field would ship a
silently-broken receipt. The test (`server/commerce.orderSnapshots.db.test.ts`)
pins that.
