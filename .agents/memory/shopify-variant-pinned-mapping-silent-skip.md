---
name: Shopify variant-pinned mapping silent skip
description: Why a delivered orders/paid webhook can 200 but mint nothing — variant-pinned product mappings skip other variants of the same product.
---

**Rule:** A `shopify_product_mappings` row with `shopify_variant_id` set only matches that exact variant. If a fan buys ANY other variant of the same mapped product (e.g. the "+ signed cert" variant), `materializeOrderFromShopify` finds the product mapped but no line hit → returns null. Webhook still answers 200 `{received:true}` — a delivered-vs-materialized gap invisible without the warn log now emitted at that bail. Prefer product-wide mappings (`shopify_variant_id = NULL`) unless a variant genuinely must not unlock digital.

**Why:** goodtunes-test orders #1004/#1005 (CALIFORNIALAND) bought the signed-cert variant while only the base variant was mapped; both webhooks delivered 200 and nothing minted; diagnosis took a full session because the bail was silent.

**How to apply:** When "webhook fired but no order," check delivery in deployment logs (`POST /api/webhooks/shopify/orders`), then compare order line `product_id:variant_id` against the mapping rows before suspecting registration/HMAC. Webhook subscriptions can be listed via `__internal.listWebhookSubscriptions(store)`.

**Related extension gotcha:** `useOrder()` THROWS (ExtensionHasNoMethodError) on the `purchase.thank-you` target — its API exposes `orderConfirmation` (order.id + `number` = confirmation number), not `order` — which blanks the whole block. Thank-you must use `useApi<"purchase.thank-you.block.render">()` + `useSubscription(api.orderConfirmation)`; customer-account order-status keeps `useOrder()`. Extension changes ship only via `npx shopify app deploy --force` (SHOPIFY_CLI_PARTNERS_TOKEN), not app publish.

**Prod one-off scripts:** `process.env.DATABASE_URL = PROD_DATABASE_URL` must be set before DYNAMIC imports of server/db — static ES imports hoist above the assignment and silently connect to dev. Store tokens decrypt with AES-256-GCM keyed off sha256(SHOPIFY_TOKEN_KEY ?? SESSION_SECRET).

**Follow-on (fan redemption dead ends):** the checkout-extension's PENDING-state fallback CTA links to `my.goodtunes.music/library` — that only works because App.tsx has a literal `/library` → `/collection` redirect above the `/:slug` share-slug catch-all (without it, logged-out buyers get "We couldn't find that album"). Separately, webhook-minted stub fans (password NULL, no identities) are promoted in place by Create Account: `/api/email-verifications/start` + `signup-with-code` both branch on `isUnclaimedCustomer` — never re-add a bare "email exists → already registered" check on fan signup. Passwordless sign-in-link emails branch on `legacyGogoodsId`: legacy rows get the migration "welcome back" template, everyone else gets neutral `sendSignInLinkEmail`.
