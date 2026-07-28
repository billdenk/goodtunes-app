---
name: Signed-cert provisional accrual + true-up
description: Post-Shopify-submission billing model for bundled-cert orders; retail attribution dropped, wholesale-only.
---

Spec source of truth: `docs/shopify-pricing-strategy.md` § "Signed-cert billing: provisional accrual + true-up (post-submission)".

- **Gate:** build only AFTER the Shopify App Store submission is in. Nothing ships before then. Does not touch fan flow, cert reservation, or the pre-submission publish batch.
- **Model:** bundled-cert order provisions → provisional accrual $13/unit (top ladder rung, always — expectations aren't orders). Window close → one downward-only adjustment per release truing to the actual tier (25–49=$13, 50–99=$12, 100–199=$9, 200–299=$7, 300+=$6). <25 units → auto-refund + no print run + accruals REVERSED, not trued up. Batch size = actual orders at close.
- **Backfill:** on ship, accrue $13 over pre-existing bundled-cert orders (they carry no cert line today).
- **Retail attribution DROPPED (decided, not defaulted):** no variant-delta derivation; wholesale is the only cert number. Legacy mappings with stored signedCertPriceCents keep behavior; column stays. Retail-ish figures, if ever wanted, are reporting-layer estimates off Shopify data, never order accounting lines.

**Why:** retail money never touches GoodTunes on the external_paid Shopify path; variant delta is fragile (single-variant mappings, zero/negative deltas, price drift).
