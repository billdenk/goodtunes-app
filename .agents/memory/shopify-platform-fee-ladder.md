---
name: Shopify platform fee ladder
description: Per-unit wholesale fee resolution for Shopify orders — precedence, the null-means-inherit store fee, and operator-only fee writes.
---

Per-unit platform fee accrual resolves through one shared resolver (used by the webhook mint, the historical backfill, and every effective-fee display):
release override → store explicit fee → artist default → $3.50 platform default.

**Why:** the fee is snapshotted into the wholesale ledger at mint time with no correction path, so a deal rate must be settable BEFORE the store install lands or early/backfilled orders accrue at $3.50.

**How to apply:**
- Never coalesce the store fee straight to 350; go through the resolver.
- The store fee column is nullable ON PURPOSE and must never get a DB default: a stamped "explicit" default would shadow the artist default forever. Null = inherit.
- Fee writes are operator-only financial controls: the release override rides the partner-editable mapping PATCH, so the fee field's PRESENCE (including null) requires an admin/super_admin check — partner mapping edits must omit it.
- Label-level default is a deliberate seam (stores also carry a label link) — slot it between store fee and artist default if built.
