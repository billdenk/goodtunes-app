---
name: Order payment snapshot only lands at materialization
description: Why card brand/last4/wallet/receipt on orders never backfills onto already-paid rows, and where to add capture if you extend the snapshot.
---

`materializeOrderFromSession` (server/commerce.ts) is the ONLY place the Stripe
payment-instrument snapshot is captured for an order: it expands
`payment_intent.payment_method` + `payment_intent.latest_charge` and writes card
brand/last4, `card.wallet.type`, and the charge `receipt_url` in BOTH the INSERT
and the pending→paid UPDATE branch.

**Constraint / gotcha:** the function early-returns once an order is already
`paid` (before any refetch). So any column newly captured here only populates on
an order's *first* materialization. Rows that were already `paid` before the
field existed — and webhook replays of paid sessions — will NEVER backfill; they
stay null and the admin UI simply omits the line.

**How to apply:** if you add another field to the materialization snapshot and
need historical rows filled, do NOT rely on webhook replay. Write a one-shot
backfill keyed by `orders.stripePaymentIntentId` (retrieve the PI with the same
expands, then UPDATE), or move the capture ahead of the paid early-return. New
happy-path paid orders are fine without this.
