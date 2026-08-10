# Otis Brief: Bank Transfer Payments In, Press Payouts Out

## What we are building

Two connected payment capabilities, both on Stripe, both living inside GoodTunes Admin:

1. **Inbound:** Artists pay manufacturing invoices by pushing a bank transfer (wire or bank-initiated transfer) to us through our system. No ACH debit anywhere in this flow. We do not pull from anyone's bank account.
2. **Outbound:** We move settled funds from our Stripe balance to a press or vendor through our system, via Stripe Connect transfers.

The artist experience and the press payout both happen inside GoodTunes. Nobody leaves our system, nobody sees our real bank details, and no payment in this flow can be clawed back after it lands.

## Why this design

- Bank transfers are push payments. The artist sends the money. There is no debit authorization, no NSF return window, no dispute mechanism after receipt. A domestic wire is final.
- Stripe's fee is $8 per inbound wire regardless of size. A $20,000 invoice costs $8 to receive instead of roughly $580 by card.
- Stripe Connect transfers from our platform balance to a connected account are instant. The press then pays out to their own bank on their own schedule.
- ACH debit is explicitly out. Do not build it, do not leave it enabled as a payment method on these invoices.

## Part 1: Inbound bank transfers

### Stripe mechanism

Use Stripe's **bank transfer payment method (customer balance)**. Stripe issues the customer a virtual bank account number unique to them. The artist pushes funds to that virtual account from their own bank. Stripe automatically reconciles the incoming transfer to the open invoice or PaymentIntent.

Reference: Stripe docs, "Bank transfer payments" and "Accept a bank transfer." Enable USD bank transfers on the account, then support it via PaymentIntent with payment_method_types including customer_balance, funding_type bank_transfer.

### Admin flow (artist-facing)

When a manufacturing invoice is due (test pressings, production deposit, balance):

1. Artist opens the invoice in GoodTunes Admin and selects **Pay by bank transfer**.
2. We display, inside our UI, everything they need to send the payment from their bank:
   - Bank name, routing number, account number (the Stripe virtual account details)
   - The exact amount due
   - A reference line if Stripe provides one
   - A plain-language line: "Send this amount from your bank using wire transfer or bank-to-bank payment. Most wires arrive the same or next business day."
3. Provide one-tap copy buttons for each field. This screen has to be clean enough that a manager can forward it or read it to their bank. Consider a "Download payment instructions (PDF)" option.
4. Invoice status becomes **Awaiting transfer**.
5. When Stripe reconciles the incoming funds (webhook), status flips to **Paid** and the artist gets a confirmation in Admin and by email.

### Webhooks and reconciliation

- Listen for the customer balance / payment intent events that signal funds received and reconciled. Flip invoice state off the webhook, never off polling.
- Configure an underpayment threshold in Stripe settings so a transfer that arrives a few dollars short (common with bank fees deducted in transit) still auto-closes the invoice. Suggest $15 threshold to start; make it a config value.
- Overpayments land in the customer's Stripe cash balance. Surface any nonzero customer balance in Admin so we can apply it to the next invoice or refund it. Do not let unreconciled balances sit silently; Stripe auto-returns unreconciled funds after 75 days.

### Edge cases

- Artist sends from a different account name than expected: Stripe still reconciles by virtual account number. No action needed, but log the payer details we receive.
- Partial payment above the underpayment threshold: invoice stays open, Admin shows amount received and amount remaining, artist can send a second transfer to the same virtual account.
- Card remains available as a fallback payment option on these invoices. If the artist chooses card, our card processing fee is added to the total and shown before they confirm. ACH debit is removed entirely.

## Part 2: Outbound payouts to presses and vendors

### Stripe mechanism

Use **Stripe Connect**. Each press or vendor onboards once as a connected account (Express onboarding, which Stripe hosts and we can brand). After onboarding, paying a press is a **Transfer** API call from our platform balance to their connected account. The transfer is instant. The press controls its own payout schedule from their connected account to their bank.

### Admin flow (our side, super admin only)

1. **Vendor setup:** A Vendors section in super admin. Add a vendor, send them a Stripe Express onboarding link (email from our system), track onboarding status (Invited, Onboarding, Active). A vendor cannot be paid until Active.
2. **Pay a vendor:** From a project or invoice context, super admin selects Pay Vendor, chooses the vendor, enters or confirms the amount, and confirms. We fire the Transfer. Show a confirmation with the Stripe transfer ID.
3. **Ledger:** Every outbound transfer is recorded against the project it belongs to: vendor, amount, date, transfer ID, initiating admin, and the inbound payment(s) it draws from. This is the beginning of per-project money-in / money-out accounting and it matters for reconciliation later. Keep the data model simple but do not skip it.

### Guardrails

- Outbound transfers are super admin only. No artist-facing surface for Part 2.
- A transfer cannot exceed the current available Stripe balance; catch and surface the Stripe error cleanly if it does.
- Destructive or money-moving actions name their target explicitly in the confirmation step: vendor name, amount, project. No generic "Confirm" on a money movement.
- Server-side authorization derives from the session. Vendor IDs and amounts are validated server-side; never trust client-supplied values for a transfer.
- Log every transfer attempt, success or failure, with the acting admin.

## Sequence for a typical order

1. Artist pays $1,295 test pressing invoice by bank transfer. Funds arrive next business day, invoice auto-reconciles, status Paid.
2. Super admin opens the project, clicks Pay Vendor, sends $1,295 (or our negotiated amount) to the press's connected account. Instant.
3. Press pays out to their own bank on their schedule.

Total cycle from artist payment to money at the press: roughly 1 to 2 business days, and nothing in the chain is reversible.

## Out of scope for this build

- Destination charges (routing the artist's payment directly to the press at charge time). We may move to this later; for now, separate inbound and outbound gives us control over timing and margin.
- Automatic or rules-based vendor payouts. All outbound transfers are manually initiated by super admin.
- Any ACH debit functionality.
- International wires. USD domestic only for v1; flag anything in the Stripe config that would need to change for SWIFT later, but do not build it.

## Questions to answer back before building

1. Does our current Stripe account have bank transfers (customer balance) available, or do we need to request enablement?
2. Confirm the exact webhook events you will key invoice state off of.
3. Proposed data model for the vendor ledger, one paragraph, before implementation.
