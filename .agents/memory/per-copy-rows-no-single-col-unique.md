---
name: Per-copy rows can't carry single-column uniques on shared stamps
description: Why signed_cert_reservations.stripe_checkout_session_id lost its UNIQUE — pattern warning for any one-row-per-copy table
---

- `signed_cert_reservations` holds ONE ROW PER SIGNED COPY, and checkout stamps the SAME Stripe session id onto every row of the batch. The original single-column `.unique()` on `stripe_checkout_session_id` made every multi-cert checkout 500 at the stamp UPDATE (23505) — single-cert orders masked it until a fan bought 4 signed copies in prod (2026-08-07 ops alert; fan retried 4×, leaving 16 NULL-stamped reservations, no sale).
- **Rule:** when a table fans out to one-row-per-copy (per-copy entitlements pattern), any "which order/session does this belong to" column must be a plain indexed column, never unique. Uniqueness on such stamps belongs on one-row-per-order tables (orders) only.
- **How to apply:** fixed via DROP CONSTRAINT + plain `signed_cert_reservations_session_idx` (post-merge.sh block, applied to both DBs). Diagnosing lookalikes: a 23505 where the UPDATE writes one value to N rows needs no second writer — the statement conflicts with itself.
