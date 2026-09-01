---
name: Exact card surcharge preflight
description: Why an issuer-sensitive Stripe surcharge cannot be quoted from a normal hosted Checkout session.
---

An exact card surcharge that varies by domestic versus international issuer
must use Stripe's immutable PaymentMethod metadata before the final charge
amount is created. Never trust a browser-supplied “domestic card” assertion or
show a domestic estimate as universally exact.

**Why:** Hosted Checkout does not reveal the card's issuing country until after
the payer enters the card, but its payment amount is fixed when the Checkout
Session is created. That ordering silently under-recovers international-card
premiums. A direct PaymentMethod preflight lets the server retrieve issuer
country, calculate fee-on-fee gross-up, create the exact PaymentIntent, and let
Stripe.js confirm that fixed intent.

**How to apply:** For payment flows whose fees depend on card metadata, collect
the PaymentMethod first, retrieve it server-side, fail honestly when required
metadata is missing, and never accept fee rates or surcharge cents from the
client. After Stripe object creation becomes possible, ambiguous failures must
remain non-retryable until reconciled so a second collectible object cannot be
minted.

Webhook transitions must match the Stripe artifact currently stored on the
payment row. A delayed failure or success from attempt A must not change
attempt B after B replaces the PaymentIntent ID; legacy Checkout events use
their stored Session ID as a separate compatibility boundary.

Any webhook path that mutates Stripe after an asynchronous read must first
atomically reserve the current payment row. Every retry, failure, reset, and
later database write must honor that reservation until the Stripe mutation
settles or is released; a final preflight read alone still has a TOCTOU gap.

Related project notes: [bank-transfer ledger](bank-transfer-ledger-payments.md),
[fail-closed payment resets](payment-state-reset-fail-closed.md), and
[Stripe connector fallback](stripe-connector-loss-env-fallback.md).