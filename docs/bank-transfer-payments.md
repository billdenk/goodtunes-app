# Inbound bank-transfer invoice payments (Task #3004)

Artists pay manufacturing ledger steps (Shopify+ prepaid ledger) by **pushing
a bank transfer** — Stripe `customer_balance` PaymentIntents with
`funding_type: bank_transfer`, `bank_transfer.type: us_bank_transfer`, USD
domestic only. ACH **debit** (`us_bank_account`) has been removed from this
flow entirely; card remains a fallback with a server-owned, grossed-up
surcharge disclosed before confirmation. Stripe.js identifies the actual card,
the server retrieves Stripe's immutable issuer-country metadata, computes the
domestic or international quote, then creates the exact PaymentIntent that the
browser confirms. The browser never supplies a rate or fee amount.

## Authoritative fee terms (effective 2026-09-01)

The GoodTunes live account is US-based and settles this flow in USD. A
read-only live fee-ledger audit on 2026-09-01 confirmed the account actually
charges 2.9% + 30¢ on domestic cards and 4.4% + 30¢ on international cards.
The same audit found the settled CALIFORNIALAND ACH-credit payment charged the
$5 bank-transfer cap, confirming the live rail price. Stripe's official US
standard schedule supplies the remaining wire and conversion terms. No
account-specific discounted schedule is represented in code; if Stripe grants
custom pricing, update the fee profile and this section together.

Source: [Stripe local payment-method pricing](https://stripe.com/pricing/local-payment-methods),
verified 2026-09-01.

| Condition | Stripe cost |
| --- | --- |
| USD bank transfer by ACH credit | 0.5% per successful transaction, capped at $5 |
| Domestic USD wire to the same virtual account | 0.5% capped at $5, plus $15 per wire payment |
| US domestic online card | 2.9% + 30¢ |
| International card | domestic card rate + 1.5% |
| Stripe currency conversion required | applicable card rate + 1% |

Evidence level: domestic card, international card, and the ACH-credit cap are
observed on the live account; the conversion premium and $15 wire add-on are
current Stripe-published terms (there was no matching live settled example).

These are Stripe costs to GoodTunes, not payer-facing bank-transfer
surcharges. The payer sees **no card surcharge** on the bank-transfer option.
Their own bank may separately charge a sender fee.

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
| `payment_intent.succeeded` | Step → **Paid** (idempotent `markStepPaid`, mints the held earmark, notifies operator + artist confirmation email). Covers both a confirmed card PaymentIntent and a reconciled transfer that fully funds its PI — including after our under-threshold auto-close. |
| `payment_intent.partially_funded` | Records `amount_received_cents` (read from the customer's cash balance). If the shortfall ≤ threshold (`BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS`, default **1500** = $15), shrinks the PI to the funds on hand and confirms it → auto-closes. Otherwise the step stays **Awaiting transfer** showing received vs remaining; a second transfer to the same virtual account completes it. |
| `payment_intent.payment_failed` | Card PaymentIntent → **Failed**, preserving Stripe's reason so the payer can retry with a newly identified card or choose bank transfer. |
| `customer_cash_balance_transaction.created` (`type=funded`) | Logs payer details (`funded.bank_transfer`, incl. `sender_name` even when it differs from the expected payer) onto the matching awaiting-transfer step's `payer_details`. |
| `checkout.session.completed` / `checkout.session.async_payment_succeeded` / `checkout.session.expired` | Legacy manufacturing Checkout attempts only. New card fallback uses direct PaymentIntents so Stripe can identify the card before the final amount is fixed. |

Successful/failed payment state flips off PaymentIntent webhooks only — no
polling. Both bank and card object creation use stable idempotency keys. If
Stripe may have created an object but its ID could not be saved, the row stays
`processing` with a reconciliation marker; the reset route refuses to reopen
it until an operator identifies the Stripe object. This prevents a second
collectible attempt after an ambiguous API/DB failure.

PaymentIntent state webhooks are bound to the Stripe PaymentIntent ID currently
stored on the step. Delayed or replayed success/failure events from an earlier
card attempt are ignored after a newer attempt replaces that ID. Legacy
Checkout events are separately bound to their stored Checkout Session ID.

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

## US-only boundary; Canada and SWIFT later

The current PaymentIntent is explicitly USD `us_bank_transfer`; it is not a
Canadian rail. Canadian payers, including Viryl, are outside this flow:
Canadian domestic push payments use EFT, while bank debits use PAD, and
Interac is a separate rail. Adding CAD/EFT/PAD/Interac is out of scope here.

The same US virtual account already carries a `swift_code` (we snapshot it in
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

`shared/breakEven.test.ts` pins domestic gross-up, international and
currency-conversion premiums, unknown-condition refusal, and cent rounding.

`server/shopifyPlusBankTransfer.db.test.ts` — hermetic (stub Stripe seam,
real dev DB): full funding, under-threshold short transfer auto-close,
partial above threshold, second-transfer completion, overpay, payer-detail
logging, foreign-PI ignore, paid-step replay idempotency, threshold config.
