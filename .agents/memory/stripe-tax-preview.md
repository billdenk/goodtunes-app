---
name: Stripe Tax pre-checkout line
description: How the Buy-sheet sales-tax line is computed and why it can read "unavailable" even when the code is correct.
---

The Buy sheet shows a **plain "Sales tax" line** before the fan reaches the embedded
card form, mirroring the existing live shipping quote. Endpoint is a public
`GET /api/checkout/tax-quote` next to the shipping-quote route in `server/commerce.ts`.

**Framing is deliberately low-key (Bill's call):** no "estimated" wording, no
"Estimated total" relabel, no scary footnote — the tax just folds into the Total and
the fan pays. **Why:** Bill didn't want to spook fans or draw attention to tax. We
can present it as a settled number (not an estimate) precisely because Stripe Tax is
the SAME engine that confirms the charge inside checkout, so the figure doesn't move.
Do NOT swap Stripe Tax for a static rate table to "make it always appear" — a static
table would diverge from what Stripe actually charges at the card step and reintroduce
the exact surprise Bill wants gone.

**How it stays tamper-proof / consistent with checkout:** it re-resolves line prices
server-side from the same catalog the session-create path reads (SKU price, booklet
bundle via `resolveBookletBundleCents`, signed-cert clamped to the per-album floor),
reuses the SAME per-line `tax_code` constants + `tax_behavior: "exclusive"`, includes
the real `quoteShipping` charge as `shipping_cost` (physical is taxed on shipping
too), then calls `stripe.tax.calculations.create`. The tax figure is
`calculation.tax_amount_exclusive`. Custom ("Gift of Hope") add-ons are donation
tax-code = non-taxable, so they're omitted from the calc entirely.

**Why it can return `{ available: false }` with correct code (don't chase it as a
bug):**
- `tax.calculations.create` REQUIRES `customer_details.address.postal_code` for
  `country=US` — country alone throws. That's why the client only fetches once a
  postal code (≥3 chars) is typed, and why a postal field was added to the Buy sheet.
- It also throws `"You must have a valid head office address to enable automatic tax
  calculation"` when the Stripe account/test-mode hasn't been configured in
  Dashboard → Tax. This is the SAME operator prerequisite as the shipped
  `automatic_tax` checkout path; until Bill sets it, BOTH the checkout tax and this
  preview are inert. The endpoint catches and returns `available:false` → the UI just
  hides the tax line, order still completes.

**Why:** keeps the estimate authoritative-adjacent (same engine, same classification)
without duplicating the ~200-line session-create resolution, and degrades silently
instead of 500-ing when Stripe Tax isn't set up.
