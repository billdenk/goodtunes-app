---
name: orders.total_cents is tax+shipping inclusive
description: Any admin/artist financial report that treats orders.total_cents as "sale proceeds" will overstate artist/vinyl funds by the tax and shipping baked into it.
---

# orders.total_cents includes tax + shipping

`orders.total_cents` mirrors Stripe's `amount_total` for the whole checkout
session — merchandise **plus** `tax_cents` **plus** `shipping_charged_cents`
(base + the flat markup, see `fan-shipping-charge.md`). It is the right number
for the top-line "Gross sales" KPI (what fans were actually charged), but it is
**not** artist or vinyl-fund money: tax is owed to the state and shipping pays
for postage/fulfillment (plus a small platform markup).

## Why this bit us

An artist payout/earmark breakdown (gross → Stripe fee → platform fee → cert
cost → net toward vinyl) started from `total_cents` and let ~$530 of tax +
shipping per album leak into the "funds for vinyl" waterfall, overstating the
artist's real proceeds. The fix: back `tax_cents` and `shipping_charged_cents`
out of gross *before* computing merchandise/artist gross, then run the
Stripe-fee/platform-fee/cert-cost subtractions on that merchandise-only
figure. `shipping_charged_cents` covers charges from BOTH the vinyl rate-card
quote and any per-box custom add-on shipping (see `fan-shipping-charge.md`) —
neither is vinyl money.

## How to apply

Any new report/ledger that claims to show "artist net" or "funds toward
X" from order totals must start from
`merchandiseGrossCents = totalCents - taxCents - shippingChargedCents`,
not raw `totalCents`. Keep raw `totalCents` only for reconciliation against
the dashboard's top-line Gross Sales KPI, which intentionally stays
tax+shipping-inclusive (that's the real fan-facing charge).
