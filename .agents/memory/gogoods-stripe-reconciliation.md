---
name: gogoods stripe reconciliation matching
description: Why legacy gogoods orders must match Stripe ONLY by authoritative charge metadata (txn_id), never by amount, and why session/PI never get written onto orders.
---

# Reconciling legacy orders against Stripe (scripts/reconcile-gogoods-stripe-orders.ts)

The job re-derives `orders.total_cents`/tax/shipping/address/buyer/payment-snapshot +
`order_items` for `origin='legacy:gogoods'` orders from LIVE Stripe. DATA ONLY — never
calls `materializeOrderFromSession` (that fires receipts / Connect payouts / cert mint).

## Match ONLY on authoritative charge metadata, never by amount
Match a legacy order to a charge whose `metadata.txn_id == orders.legacy_gogoods_id`
(succeeded charges only). That is the only trustworthy link gogoods stamped ON the
charge.

**Amount-based fuzzy matching is a correctness trap — removed.** Many legacy orders
are charge-less comps / `DYNAMO_*`-PI placeholder rows (small $3–$25 totals, no Stripe
charge of their own). A `charge.amount >= order.total_cents` + email + date-window
fuzzy rule attached those to a *different* shopper's larger charge (e.g. 18 unrelated
orders all stamped with one $49.95 "Rosemary Hill" charge/session). Symptoms:
inflated totals AND a crash on `orders_stripe_checkout_session_id_unique` /
`_payment_intent_id_unique` when a later order resolves to an already-used session.

**Why:** one Stripe checkout session legitimately backs ONE payment; multiple
charge-less orders sharing a buyer are NOT line items of that payment (the charge
carries a single line item at its own amount, not the sum). Anything without an
authoritative charge must stay `unmatched` (recorded in the audit table, order row
left untouched), not guessed.

## Never write stripe session/PI back onto the orders row
Record `stripe_charge_id` / `payment_intent_id` / `checkout_session_id` in the audit
table (`gogoods_stripe_reconciliation`) ONLY. Writing them onto `orders` is what
collides on the unique indexes the moment any two orders resolve to the same session.
`total_cents` (overwrite), tax/shipping/address/buyer/card/receipt (fill-if-missing
COALESCE), and `order_items` (insert only when the order has zero) are the only order
writes.

## Idempotency / reversibility shape
Audit table PK = `order_id`; both matched AND `unmatched` orders get an audit row, so
the `done` set = every processed order → a re-run finds pending=0 and stamps the
`post_merge_data_backfills` marker (`task_2431_gogoods_stripe_reconciliation`) as a
no-op. Audit snapshots `original_total_cents` (reversible for totals) but NOT the
pre-existing session/PI/card values — so a hand reversal of a bad match nulls the
session/card/receipt it set, deletes the items it inserted (order had 0 before), and
leaves a pre-existing `DYNAMO_*` PI alone (COALESCE never overwrote it).

## Run it as a WORKFLOW, not nohup
The full prod run is ~2,200 orders × live Stripe calls (many minutes). `nohup ... &`
from the bash tool gets reaped between tool calls (env teardown). Run via a
`configureWorkflow` console workflow (`DATABASE_URL="$PROD_DATABASE_URL" npx tsx …`)
and poll `getWorkflowStatus`; batches of 50 with a resumable audit-`done` set survive
a restart. Bound the Stripe client (`timeout`, `maxNetworkRetries`).
