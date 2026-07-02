---
name: Shopify+ prepaid manufacturing mode (fulfillment-only orders, ACH pay endpoint, payer access, physicalFormat keyspace)
description: How sellMode='shopify_plus' orders stay payout/revenue-safe; the single-flight ACH pay claim that stops double bank-debits; who may pay the ledger; and the albums.physicalFormat vs shipping/SKU format keyspace mismatch.
---

# Shopify+ prepaid manufacturing ledger — who may pay

The staged ACH manufacturing ledger is payable by ANYONE holding **album-level
`manage_payouts`** (label, manager, or artist), NOT operators only. So the
album-editor **Payments** tab must surface for those partners even when the
operator-only **Physical** tab and **Customers** roster stay hidden
(`visibleTabsFor`'s `hidePress` branch: for `shopify_plus` + `canManagePayouts`
it returns base + Payments).

**Why:** the customer prepays their own manufacturing; gating payment behind an
operator hat would strand the person who actually owns the money.

**How to apply:** the UI reads `canManagePayouts` off
`GET /api/admin/albums/:id/edit-access` (`getAlbumEditAccess` in
partnerPermissions.ts returns it in ALL branches: super_admin/admin=true,
out_of_scope=false, in-scope=`!!perms.managePayouts`). It threads two levels
deep: the album editor shows the Payments TAB (`visibleTabsFor`), and inside
ShopifyPlusPanel the Pay BUTTON gates on a `canPay` prop = `canManagePayouts`
(the ledger's add-step / remove-step / toggles stay on `canEdit` =
`edit_metadata`). Gating only the tab is NOT enough — a `manage_payouts`-only
partner would then see a read-only ledger with no Pay button. Any new
payer-facing surface should reuse `canManagePayouts`, not re-derive from role.
Server pay route still gates independently (don't trust the client).

# ACH manufacturing pay endpoint — single-flight atomic claim

`POST /api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/pay` must
**atomically claim** the step (UPDATE ... SET status='processing' WHERE id=? AND
status='unpaid' RETURNING) BEFORE minting the Stripe Checkout Session. If no row
comes back, another attempt already owns it → 409.

**Why:** webhook idempotency stops a double *earmark* but NOT two real ACH debits
settling. Without the claim, two concurrent (or double-clicked) POSTs each mint a
live us_bank_account Checkout URL for the same money and both can settle. A
fast-path 409 on already paid/processing handles the common sequential case but
does NOT close the true concurrent race — only the conditional UPDATE does.

**How to apply:**
- On Stripe-create failure, roll the claim back to `unpaid` (with `lastError`) so
  a retry works instead of the step being stranded in `processing`.
- Set `expires_at` on the session to ~35 min (Stripe's 30-min floor + padding)
  so an abandoned attempt frees fast, not after Stripe's 24h default.
- Release the claim on `checkout.session.expired` (helper `releaseAbandonedStep`
  resets processing→unpaid only if the sessionId matches AND there's no
  `stripePaymentIntentId`) and on `async_payment_failed`.
- Stamp `paidByUserId` in the claim so the ledger records who initiated.

**Known narrow strand (accepted, not blocking):** if the process dies AFTER the
claim but BEFORE the `stripeCheckoutSessionId` write, the step sits in
`processing` with a null sessionId. `releaseAbandonedStep`'s sessionId-match
guard can't free it, and if the crash was before the Stripe session was even
created no `checkout.session.expired` webhook ever fires. Extremely rare (death
inside a ~ms window); recover by manually resetting that step to `unpaid`. A
future sweep could release long-`processing` rows with a null sessionId.

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
