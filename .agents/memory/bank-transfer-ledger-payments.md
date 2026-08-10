---
name: Ledger bank-transfer (push) payments
description: Stripe customer_balance bank transfers on the Shopify+ manufacturing ledger — enablement, webhook events, threshold, gotchas.
---

# Shopify+ ledger bank-transfer payments

- Pay route accepts `{method: "bank_transfer"|"card"}`; bank transfer mints a `customer_balance` PI (`funding_type: bank_transfer`, `us_bank_transfer`, confirm:true) and persists `next_action.display_bank_transfer_instructions` as `funding_instructions` on the step (status `awaiting_transfer`). ACH debit (`us_bank_account`) is REMOVED from this flow; card fallback adds `cardFeeCents()` (shared/breakEven.ts) as a disclosed Checkout line item.
- **Live customer_balance ENABLED 2026-08-10** (Dashboard wizard, verification submitted, availability flipped immediately; live $0.50 smoke PI returned full ABA+SWIFT instructions, then canceled). Gotcha found en route: the prod webhook endpoint only carried checkout.session.completed+charge.refunded — even `payment_intent.succeeded` was missing, so NO PI-driven state would ever have flipped; enabled_events updated via API (same endpoint/secret). When adding webhook-driven flows, verify the LIVE endpoint's enabled_events, not just handler code.
- Reconciliation is webhook-only in `handleShopifyPlusWebhookEvent` (injectable `{stripe}` deps for tests): `payment_intent.succeeded` → paid (idempotent markStepPaid); `payment_intent.partially_funded` → record received (read customer cash balance), auto-close by shrinking PI + confirm when shortfall ≤ `BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS` (default 1500); `customer_cash_balance_transaction.created` (funded) → append payer details (matched by stripeCustomerId, no PI metadata on that event).
- Overpayments live on the Stripe customer cash balance — surfaced operator-only on the ledger GET (`cashBalances`); Stripe auto-returns unapplied funds after 75 days.
- Payment Requests flow (server/paymentRequests.ts) intentionally NOT converted: Payment Links can't do customer_balance.
- **Why:** wires are push-only ($8 flat vs ~3% card), irreversible; instructions persist so a second transfer to the same virtual account completes a partial.
