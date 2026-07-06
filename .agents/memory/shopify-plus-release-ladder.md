---
name: Shopify+ three-state release ladder
description: How "Submitted to press" is stored/derived and why fan gates stay isPrepping-only
---

Shopify+ (`sell_mode='shopify_plus'`) albums have Prepping → Submitted to press → Released; every other sell mode stays two-state.

- Storage: `albums.submitted_to_press_at` (nullable timestamp) + existing `is_prepping`. Submitted = `is_prepping AND submitted_to_press_at IS NOT NULL`. Released keeps the timestamp as history (`is_prepping=false` wins); demote to Prepping clears it.
- Server: `PUT /api/admin/albums/:id` takes `releaseStatus` (`prepping|submitted_to_press|released`); middle state 400s for non-Shopify+. Legacy `isPrepping` body flag still works.
- Press portal: read-only "Submitted for review" chip on the pipeline card (`submittedForReview` in sqlPressPipeline payload); NOT a manufacturing stage.

**Why:** press needs "package formally handed over for review (may still change)" long before the digital release flips via the artist's Shopify presale; keying fan gates off a new column would have required auditing every gate.

**How to apply:** never add fan gates on `submitted_to_press_at` — `is_prepping` stays the single fan-visibility source of truth; the timestamp is an operator/press signal only.
