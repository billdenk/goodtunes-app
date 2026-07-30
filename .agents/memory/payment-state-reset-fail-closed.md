---
name: Payment-state resets must fail closed
description: Operator resets of Stripe-backed payment state (e.g. Shopify+ step "Paying" reset) — verification and race rules the completion reviewer enforces
---

Any operator action that reverts a payment-in-progress row (making money re-payable) must:

- **Fail CLOSED on every unverifiable Stripe state.** A retrieve/expire error only counts as "session dead" when Stripe positively says `resource_missing`; transient network/auth errors must 502 and leave the row untouched. If `sessions.expire` throws, re-retrieve and only proceed when the session is now positively `expired`.
- **Guard the flip on the FULL verified snapshot,** not just `status`: the UPDATE predicate must match status AND the exact checkout-session id AND the payment-intent column as read (id match or IS NULL), so a racing webhook that attaches a PI or marks paid wins and the reset no-ops (409).
- Inject the Stripe surface (`{stripe}` param) so DB tests drive it hermetically — mirrors the materializeOrderFromSession seam.

**Why:** completion review rejected two rounds of the Shopify+ "Cancel payment link" reset for exactly these gaps — fail-open on retrieval errors and a status-only predicate both create duplicate-ACH-debit exposure.

**How to apply:** any future refund/reset/unstick verb touching stripe_checkout_session_id / stripe_payment_intent_id columns.
