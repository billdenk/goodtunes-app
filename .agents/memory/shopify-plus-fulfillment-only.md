---
name: Shopify+ fulfillment-only orders + physicalFormat keyspace
description: How sellMode='shopify_plus' orders stay payout/revenue-safe, and the albums.physicalFormat vs shipping/SKU format keyspace mismatch.
---

# Shopify+ fulfillment-only orders

A `sellMode='shopify_plus'` release sells on the CUSTOMER's own Shopify; GoodTunes
only manufactures + (optionally) fulfills. A fulfillment-only order (minted in
`materializeShopifyPlusFulfillmentOnly`, server/shopify.ts) carries:
- `status='fulfillment_only'`
- `origin='shopify_plus:<storeId>'`

**Why this is payout- and revenue-safe (verified):**
- Every revenue/payout read filters `status` on paid/shipped-ish
  (reports/*, partnerDashboard, adminAlbumQueries, routes.ts label/artist
  revenue REVENUE_STATUSES, pressPortal paid-PI query). `fulfillment_only` is
  never in those sets → auto-excluded.
- `attemptTransferForOrder` has FOUR triggers (admin ship button, payout retry,
  OD `shipped` webhook, Odoo poller); all gate on `status==='paid'` or
  `'shipped'`, and a fulfillment_only row can never reach those states. So it
  can never fire an artist/label transfer.
- Fulfillment still runs because OD/Odoo webhooks write `fulfillmentStatus`, NOT
  `status`. `dispatchShippingEmail` early-returns for `origin` starting
  `shopify_plus:` (customer's own Shopify emails the buyer).
- Admin list `GET /api/admin/orders` has no default status filter → the row
  stays visible to operators.

**How to apply:** any NEW order read that sums/counts by album MUST keep a
status filter or it will wrongly include these. Buyer-roster / audience reads
(storage.ts, customer orderCount) intentionally have NO status filter — they
count these as buyers, which is correct and not a revenue read. Any new payout
trigger must gate on paid/shipped.

# albums.physicalFormat ≠ shipping/SKU format keyspace

`albums.physicalFormat` uses `single_lp / double_lp / seven_inch / cassette / cd`.
The shipping rate card (`quoteShipping` / `FORMAT_OZ` in server/shipping.ts) and
the SKU catalog use `12_lp / 12_double / 7_inch / cd`. Passing `physicalFormat`
raw into `quoteShipping` silently misses every key and falls to
`DEFAULT_FORMAT_OZ` (16oz / band2) — over-charges a 7", under-charges a double
LP. **Map before quoting:** seven_inch→7_inch, single_lp→12_lp,
double_lp→12_double. The fan-checkout path avoids this because it passes
`sku.format` (already the SKU keyspace), not `physicalFormat`.
