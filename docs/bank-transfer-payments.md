# Inbound bank-transfer invoice payments (Task #3004)

Artists pay manufacturing ledger steps (Shopify+ prepaid ledger) by **pushing
a bank transfer** — Stripe `customer_balance` PaymentIntents with
`funding_type: bank_transfer`, `bank_transfer.type: us_bank_transfer`, USD
domestic only. ACH **debit** (`us_bank_account`) has been removed from this
flow entirely; card remains the fallback with the card fee
(`cardFeeCents()` — 2.9% + 30¢) added server-side as its own disclosed
Checkout line item.

## Answers to Otis's pre-build questions

### 1. Is bank transfers (customer balance) enabled on our Stripe account?

- **Test mode (dev / sandbox `acct_1U0SFVI6u2DIjjZr`): YES.** A
  `customer_balance` PaymentIntent with `us_bank_transfer` funding confirms
  successfully and returns `next_action.display_bank_transfer_instructions`
  with full ABA details (bank name, routing, account number, reference) plus
  a SWIFT block. Verified live against the sandbox on 2026-08-10.
- **Live mode: YES (enabled 2026-08-10).** Bill enabled "Bank Transfers"
  on the live Default payment configuration via the Dashboard wizard
  (verification docs submitted; Stripe flipped `customer_balance:
  { available: true }` immediately). Verified with a live smoke the same
  day: a $0.50 `customer_balance` / `us_bank_transfer` PI on a throwaway
  customer confirmed to `requires_action` and returned full
  `display_bank_transfer_instructions` (ABA + SWIFT financial addresses,
  reference); PI canceled + customer deleted afterward.
- Note: our code passes `payment_method_types: ["customer_balance"]`
  explicitly, so the Dashboard *display preference* toggles don't gate us —
  only account-level availability does.

### 2. Exact webhook events invoice state keys off

All consumed in `handleShopifyPlusWebhookEvent` (server/shopifyPlus.ts),
matched on PI metadata `gt_kind=shopify_plus_step` + `gt_step_id`:

| Event | Effect |
| --- | --- |
| `payment_intent.succeeded` | Step → **Paid** (idempotent `markStepPaid`, mints the held earmark, notifies operator + artist confirmation email). Fires when the reconciled transfer fully funds the PI — including after our under-threshold auto-close. |
| `payment_intent.partially_funded` | Records `amount_received_cents` (read from the customer's cash balance). If the shortfall ≤ threshold (`BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS`, default **1500** = $15), shrinks the PI to the funds on hand and confirms it → auto-closes. Otherwise the step stays **Awaiting transfer** showing received vs remaining; a second transfer to the same virtual account completes it. |
| `customer_cash_balance_transaction.created` (`type=funded`) | Logs payer details (`funded.bank_transfer`, incl. `sender_name` even when it differs from the expected payer) onto the matching awaiting-transfer step's `payer_details`. |
| `checkout.session.completed` / `checkout.session.async_payment_succeeded` / `checkout.session.expired` | Card-fallback lifecycle (unchanged from the ACH era, now card-only). |

State flips off webhooks only — no polling.

The production webhook endpoint (`https://get.goodtunes.music/api/webhooks/stripe`,
`we_1TgDELJ2hCFJLdgeJOQleg7p`) originally only subscribed to
`checkout.session.completed` + `charge.refunded`. On 2026-08-10 it was updated
to the full set the server consumes: the two above plus
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `payment_intent.succeeded`,
`payment_intent.partially_funded`, `payment_intent.payment_failed`, and
`customer_cash_balance_transaction.created`. (Same endpoint/secret — only
`enabled_events` changed.)

## Overpayments / leftover funds

Overpayments stay in the payer's Stripe **customer cash balance**. The
ledger GET surfaces nonzero balances to operators (amber banner in the
Payments tab) with apply-or-refund guidance — Stripe auto-returns
unreconciled funds after **75 days**, so don't let them sit.

## SWIFT later

The same virtual account already carries a `swift_code` (we snapshot it in
`funding_instructions`). International wires would additionally need
Stripe's cross-border bank-transfer config (`bank_transfer.type` per
region, non-USD presentment) and UI — nothing else in our mechanism
changes.

## Why the one-off Payment Requests flow was NOT converted

`server/paymentRequests.ts` uses Stripe **Payment Links**, which do not
support `customer_balance`. Converting it would mean rebuilding that flow
on PaymentIntents — not low-cost, so per the brief it keeps card/link
payments; the manufacturing ledger (the priority) got the full treatment.

## Tests

`server/shopifyPlusBankTransfer.db.test.ts` — hermetic (stub Stripe seam,
real dev DB): full funding, under-threshold short transfer auto-close,
partial above threshold, second-transfer completion, overpay, payer-detail
logging, foreign-PI ignore, paid-step replay idempotency, threshold config.
