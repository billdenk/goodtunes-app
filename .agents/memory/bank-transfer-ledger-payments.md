---
name: Ledger bank-transfer (push) payments
description: Stripe customer_balance bank transfers on the Shopify+ manufacturing ledger — enablement, webhook events, threshold, gotchas.
---

# Shopify+ ledger bank-transfer payments

- ACH debit is REMOVED from this flow. The bank path is a payer-initiated ACH credit or domestic wire; card fallback first lets Stripe identify the card, then uses a server-owned grossed-up quote and direct PaymentIntent.
- **Live customer_balance ENABLED 2026-08-10** (Dashboard wizard, verification submitted, availability flipped immediately; live $0.50 smoke PI returned full ABA+SWIFT instructions, then canceled). Gotcha found en route: the prod webhook endpoint only carried checkout.session.completed+charge.refunded — even `payment_intent.succeeded` was missing, so NO PI-driven state would ever have flipped; enabled_events updated via API (same endpoint/secret). When adding webhook-driven flows, verify the LIVE endpoint's enabled_events, not just handler code.
- Reconciliation is webhook-only in `handleShopifyPlusWebhookEvent` (injectable `{stripe}` deps for tests): `payment_intent.succeeded` → paid (idempotent markStepPaid); `payment_intent.partially_funded` → record received (read customer cash balance), auto-close by shrinking PI + confirm when shortfall ≤ `BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS` (default 1500); `customer_cash_balance_transaction.created` (funded) → append payer details (matched by stripeCustomerId, no PI metadata on that event).
- Overpayments live on the Stripe customer cash balance — surfaced operator-only on the ledger GET (`cashBalances`); Stripe auto-returns unapplied funds after 75 days.
- Payment Requests flow (server/paymentRequests.ts) intentionally NOT converted: Payment Links can't do customer_balance.
- **Why:** push-transfer instructions persist so a second transfer to the same virtual account completes a partial. Stripe's US terms verified 2026-09-01 are 0.5% capped at $5, plus $15 for domestic wire; never call the payer path fee-free.

## Durable rules from the accept-partial work
- One Stripe customer/cash balance is REUSED across a run's steps, so a
  step's recorded received tally is historical and can be 0 with funds on
  the balance (webhook gap). **Why:** money-moving decisions must derive
  from a live Stripe read (fail closed), and operator UI must not be
  gated on the tally.
- A thrown Stripe mutation is INDETERMINATE (timeouts land after the
  change applies) — reconcile from an authoritative re-read and record
  Stripe's settled amount, never the intended one.
- A reconciled pushed wire can leave BOTH `PaymentIntent.amount_received`
  and the customer's unallocated cash balance at zero. The authoritative
  proof is the customer's `applied_to_payment` cash-balance transaction
  whose `payment_intent` equals the step's PI; net any matching
  `unapplied_from_payment` reversals. Payer-details receipts are display
  only because their funded event has no PI metadata.
  **Why:** production showed a $4,135 wire in this exact state; trusting the
  newest-open-step receipt would risk settling another request on the reused
  customer.
  **How to apply:** for money-moving reconciliation, require strict,
  fully-paginated live Stripe reads and safe integer cents; fail closed on
  malformed/missing fields or attribution ambiguity.
  **Confirmed:** after publication, the PI-bound transaction recovery settled
  the production request at the exact applied amount and produced the expected
  remaining ledger balance.
