---
name: qa:test order exclusion fan-out
description: Every admin-facing order/fan read must exclude origin='qa:test'; Shopify E2E mints against the QA album stamp qa:test at the webhook.
---

QA test purchases (native checkout QA + Shopify E2E against the permanent QA album, exported as `QA_TEST_ALBUM_ID` from `shared/qaTest.ts`) carry `orders.origin='qa:test'`.

**Rule:** any NEW admin dashboard/report/queue/roster query over `orders` OR any signup/new-fan count over `customer_users` must exclude qa:test. Orders: `origin` is NOT NULL (default 'direct') so plain `ne()` is safe. Fans: a "QA-only" customer (has a qa:test order AND no non-qa order) is a test artifact — exclude via the NOT EXISTS/EXISTS pair; zero-order fans still count.

**Why:** Shopify E2E orders once minted as `shopify:<store>` and leaked into the fan-orders queue with live fulfillment buttons, and the E2E stub fan inflated "New fans" KPIs. The webhook now stamps qa:test for QA-album mints (redemption code/unlock kept; fulfillment routing, OD push, press-pool/ledger accruals skipped).

**How to apply:** when adding an order or fan read on an admin surface, grep 'qa:test' for the existing predicate patterns (reports, orders queue, roster) and mirror one.
