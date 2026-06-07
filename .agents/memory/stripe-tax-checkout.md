---
name: Stripe Tax on embedded checkout
description: Durable rules for automatic sales tax on the fan checkout session — why customer_update is required and how to avoid double-counting tax.
---

# Stripe Tax on embedded checkout

The embedded Checkout session runs Stripe automatic tax with per-line tax codes
and `tax_behavior: "exclusive"` (tax added on top, not baked into the price).

**customer_update is mandatory when a customer is pre-attached.** With a `customer`
on the session, automatic tax can only read the address the buyer types in the form
if the session also passes `customer_update` with address/name/shipping set to auto.
Without it Stripe can't locate the buyer and tax silently fails / the session errors.
**Why:** Stripe won't overwrite a saved Customer address from the form unless you opt in.

**Exclusive tax is tax-INCLUSIVE on every Stripe total you read back.** With
`tax_behavior: "exclusive"`, the session's `amount_total`, each line item's
`amount_total`, and `shipping_cost.amount_total` ALL already include the tax. The
separate `total_details.amount_tax` reports the whole tax (items + shipping).
**How to apply:** when you persist item and shipping amounts AND also break out a
Tax line on the receipt/summary, snapshot the **pre-tax** figures — line item
`amount_subtotal` and `total_details.amount_shipping` (pre-tax shipping == the rate
you quoted) — never the `amount_total` variants. Otherwise tax is double-counted and
items-subtotal + shipping + tax exceeds the order total.
**Reconciliation identity (no discounts):** sum(line amount_subtotal) +
`total_details.amount_shipping` + `total_details.amount_tax` == session `amount_total`.
The order's stored total stays the tax-inclusive grand total; the tax field is
display-only and never re-added.

**Fail-safe is free.** With automatic tax on, Stripe blocks completion in the
embedded UI if it can't determine tax for an address — no extra code needed. A
registered-but-non-taxing jurisdiction returns a real computed $0, not an error.

**Operator dependency.** Stripe Tax only collects where the business is *registered*.
The state/locale registrations + head-office/origin address are a Stripe Dashboard
task, not a code change; until a jurisdiction is registered Stripe collects $0 there.
