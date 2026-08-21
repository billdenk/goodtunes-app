---
name: Shopify historical-order backfill + held emails
description: Connecting a store that already has past sales — config-before-backfill ordering and the numbering/email-release invariants.
---

Connecting a Shopify store with pre-existing sales must run the historical
backfill first, or the first NEW webhook order grabs GoodDeed #1.

**Why:** GoodDeed numbers promise "earliest purchaser gets #1"; MAX+1
numbering is unique but NOT ordered under interleaving, and per-store
fee/NPO config is read at mint time.

**How to apply:**
- Set the store's per-unit fee and the album's NPO beneficiary split BEFORE
  the backfill — mint-time reads; late config only covers future orders.
- Number-ordering across backfill vs live webhooks needs explicit
  serialization (per-album advisory locks held for the whole chronological
  pass); don't trust MAX+1 alone.
- Held-email release must be send-first, stamp-after (at-least-once).
  Stamp-then-send permanently strands a fan whose send crashed mid-flight.
- "Already materialized" checks must require the redemption code too — a
  crash between order insert and code mint leaves a codeless order that a
  rerun must RESUME, not skip.
- Backfill mode never writes back to Shopify, never enters fulfillment or
  Order Desk; Shopify+ fulfillment-only mapped historical orders no-op.

Operator sequence: docs/niina-shopify-golive-runbook.md.
