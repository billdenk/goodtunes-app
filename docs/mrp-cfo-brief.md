# GoodTunes platform — money-flow brief for MRP's CFO

Prepared for Memphis Record Pressing (MRP), August 2026.
Two halves: how fans pay in, and how MRP gets paid out. No numbers below are
invented; fee levels described as "configurable" are set per partnership, not
fixed platform-wide.

## Half 1 — How fan money comes in

- **Checkout:** Stripe Checkout, embedded in the GoodTunes buy flow (the fan
  never leaves the app for a hosted page). **Apple Pay and Google Pay surface
  automatically** inside the Stripe form on eligible devices/domains.
- **Sales tax:** computed automatically by **Stripe Tax** — quoted live in the
  cart from the fan's postal code and confirmed by the same engine at the card
  step, so the number the fan sees is the number charged.
- **Shipping:** real carrier-based rates quoted server-side from the
  fulfillment partner's published rate card per destination and weight,
  charged to the fan as its own line. Destinations we can't price are refused,
  never charged $0.
- **All amounts are computed server-side** — the browser cannot alter prices.
- **Refunds:** flow back through Stripe. Order state is
  **webhook-authoritative** (the Stripe event, not our UI, is the source of
  truth), the fan's album access is revoked, and **any partner transfer that
  was already released is automatically reversed** so a refund can never leave
  a partner over-paid.

## Half 2 — How MRP gets paid out

- **Mechanism:** each partner (press, artist, label) gets a **Stripe Connect
  Express account** of its own. Onboarding and **KYC are handled by Stripe
  directly** via Stripe Account Links — GoodTunes never collects or stores
  MRP's bank or identity documents.
- **Flow on a sale:** when an order ships, the partner's share is computed and
  **earmarked** (held) rather than paid instantly. The GoodTunes operator
  reviews and releases earmarks from a payout queue; release fires the actual
  Stripe transfer to the connected account, keyed idempotently so a release
  can never double-pay. A daily digest keeps held payouts visible to the
  operator so nothing sits unnoticed.
- **Settlement timing:** once released, the transfer settles to the connected
  account's bank on **Stripe's standard connected-account schedule**
  (typically on the order of ~2 business days after release; exact timing is
  Stripe's, and we don't promise a tighter number).
- **Transfer cost:** transfers to the partner's bank carry **no additional
  GoodTunes fee**.

## Fees

- **Platform fee:** an operator-configured percentage of the order (after
  per-certificate costs), with per-album overrides available. The platform
  default is seeded at 10%, but the effective rate is **agreed per
  partnership** — treat it as a term to settle in this meeting, not a fixed
  number.
- **GoodDeed certificate costs:** per-certificate costs follow a tiered
  wholesale ladder (print/hologram/shrinkwrap/insertion plus shipping legs),
  configurable by the operator.
- **Stripe's own processing fees** apply to fan card payments as Stripe's
  standard published rates — those are Stripe's fees, not GoodTunes fees, and
  we do not restate them here.

## Manufacturing-ledger payments (money MRP or artists pay in)

- Manufacturing ledger steps (deposits, balance-of-run, etc.) are payable by
  **US bank transfer** — Stripe `customer_balance` push transfers, with
  virtual-account details (routing/account/reference) issued per payment.
  **No card fees apply on the bank-transfer path.**
- **Card remains the fallback**, and when used its processing fee is added
  server-side as **its own disclosed line item** at checkout — never buried in
  the price.
- Underpayments within a small operator-configured threshold auto-close;
  larger shortfalls stay open showing received vs. remaining until a second
  transfer completes them. Overpayments sit in the payer's Stripe cash balance
  with operator guidance to apply or refund.

## Publishing mechanical royalties (separate ledger)

- Mechanical royalties are computed on a **separate ledger** from sales
  payouts: statutory rate × **units pressed** × publisher share, with
  data-quality guardrails (the engine flags any song whose splits don't sum
  to 100% before a cent is paid).
- Computation is implemented today; **disbursement is operator-driven**, not
  automatic.

## Honest limits

- Payout release is a deliberate human step (operator review), by design —
  it is a control, not a delay bug.
- Fee percentages and cert-cost ladders shown in the product are
  configuration, seeded with defaults; the numbers that will apply to MRP are
  whatever the partnership agrees.
