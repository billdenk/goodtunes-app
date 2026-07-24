---
name: Shopify E2E test hygiene
description: Rules and gotchas for running live Shopify order tests against prod
---
- **Never map tests to a real artist's album** (Bill rule, 2026-07-24; Nightbirde's *Hope* must stay pristine for estate reporting). Use the dedicated hidden prod QA album `a0000000-0000-4000-8000-00000000e2e0` ("GoodTunes QA Test Album (do not sell)").
- **Why:** a webhook-minted test order creates a REAL `user_albums` ownership grant + orders row against the mapped album, polluting artist/estate reporting.
- An `orderCreate` order created *already-paid* fires NO `orders/paid` webhook (no transition). Create `financialStatus: PENDING`, then `orderMarkAsPaid` — that fires it.
- Redemption metafield lives in the app-reserved `$app:goodtunes` namespace — reads resolve to `app--<appid>--goodtunes`; querying plain namespace `goodtunes` returns empty (looks like a false failure).
- The checkout-banner data path is verifiable headlessly: mint an HS256 session JWT with `SHOPIFY_API_SECRET` (aud=`SHOPIFY_API_KEY`, dest=store domain) and hit `/api/shopify/redemption-status?orderId=&confirmation=`.
- **How to apply:** any live Shopify order test — map to the QA album, use pending→mark-paid, and sweep prod rows (order, items, code, stub customer, grant, mapping) afterward.
