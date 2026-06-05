---
name: EasyPost historical shipment pull + order backfill
description: How GoodTunes' one-time EasyPost shipping/tracking data was pulled and matched onto historical prod orders; the API quirks and matching rules that make it reproducible.
---

# EasyPost historical pull → order backfill

A one-time job pulled ALL historical EasyPost shipments and backfilled
shipping/tracking onto historical prod `orders`. GoodTunes is NOT using EasyPost
going forward. Scripts: `scripts/easypost-pull.mjs` (enumerate + enrich),
`scripts/easypost-backfill-write.mjs` (single set-based prod write).

## EasyPost API quirks (the non-obvious part)
- **`GET /v2/shipments` index returns empty** for this account; you cannot list
  shipments that way. Enumerate via **monthly shipment Reports** instead.
- **Report download URLs are ZIP files, not raw CSV** — the body starts with `PK`.
  Unzip with python `zipfile` (the `unzip` binary isn't installed here).
- Reports **cap at a 32-day window**; request month-by-month. A report whose
  status comes back `empty` is terminal for that month (genuinely no data), not a
  retry case.
- Per-shipment detail (`GET /v2/shipments/{id}`) is reliable and carries
  `tracking_code`, `public_url` (use as `tracking_url` — always resolves),
  full `to_address`, `to_email`, `status`, `created_at`, delivery time.
- **`reference` is always null** even via the API, so there is NO shipment→order
  id join. Matching is **email + date** only.

## Matching rules
- Match shipment `to_email` (lowercased) to `orders.buyerEmail`.
- **Date guard**: only attach a shipment whose ship date `>=` order.createdAt.
- **Consolidation**: one shipment can cover several of a buyer's orders; attach the
  same tracking to all of that buyer's qualifying orders. This is inherently lossy —
  a buyer's order placed long before the shipment may not really have been in that
  box, and `reference` being null means there is NO way to verify. Accept it as
  best-effort and lean on the confidence stamp, do NOT pretend it's exact.
- **Confidence must be honest** (a single-shipment buyer is NOT automatically
  reliable). Use three tiers, not two:
  - `high` = buyer has exactly 1 backfilled order AND 1 shipment (true 1:1).
  - `medium` = 1 shipment but multiple orders (consolidated, shared tracking).
  - `low` = buyer has >1 shipment (genuinely ambiguous which order→which box; the
    blanket-one-tracking approach mis-attributes some).
  Cross-customer attribution must always be 0 — audit it
  (`count(*) where n_customers>1` grouped by tracking) before trusting a run.

## Status mapping → `orders.fulfillment_status`
`delivered`→delivered; `in_transit`/`out_for_delivery`/`pre_transit`→shipped;
`return_to_sender`→returned; `cancelled`→excluded. The AdminOrders pill recognizes
delivered/shipped/returned/in_fulfillment/submitted/cancelled; the timeline reads
`shippedAt`/`deliveredAt`.

## Write shape gotchas
- `orders.shipping_address` is typed `StripeAddressSnapshot`
  (`{name,line1,line2,city,state,postalCode,country}`) and the admin + fan UIs read
  exactly those keys. Do NOT store EasyPost's raw `to_street1`/`to_zip`/... shape —
  it silently won't render. Remap before/after the write.
- Write was non-destructive: only `WHERE tracking_number IS NULL`, COALESCE for
  name/phone/address, and a reversible `fulfillment_raw.source =
  'easypost_backfill_2026-06'` marker (also stores shipment_id + confidence).

## Prod write performance
- 2000+ sequential per-row UPDATEs in one transaction over the network gets
  **killed/rolled back** before commit. Use a **single set-based UPDATE** that
  passes the whole assignment array as one `$1::json` param via
  `json_to_recordset(...)` + `UPDATE ... FROM`. One round trip = fast.
- node-`pg` from a bash script printing/`pool.end()` may be killed AFTER the
  implicit commit (exit -1, no stdout). Don't trust the exit code — verify the
  marker count with `psql` instead. The UPDATE had already committed both times it
  looked like it "failed".

## Operator handoff
- Unmatched shipments (email not in orders, or no email on shipment) can't be
  attached — export them to a CSV for manual reconciliation. Put PII exports in the
  **gitignored `.local/exports/`**, never `attached_assets/` (that dir is committed,
  so customer names/emails/addresses would leak into git history + forks).
- The empty buyer_name/shipping_address on historical orders was a **gogoods import
  gap** (addresses WERE in the source CSVs), NOT an EasyPost gap — the EasyPost pull
  happened to also fill those.
- EASYPOST_API_KEY is a one-time-use secret; agents cannot delete secrets, the
  operator removes it from the Secrets tab after the run.
