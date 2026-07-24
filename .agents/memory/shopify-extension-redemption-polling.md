---
name: Shopify checkout-extension redemption = polling, not metafields
description: Why the redemption checkout UI extension polls our endpoint instead of reading order metafields
---

**Rule:** Checkout UI Extensions on BOTH surfaces (`purchase.thank-you` and `customer-account.order-status`) CANNOT read ORDER-owned metafields — `AppMetafieldEntryTarget` has no `order` owner type. Any data an extension needs about the order must come from polling our own authenticated endpoint.

**Why:** Verified against the 2026-07 extension API when replacing the deprecated ScriptTag redemption CTA. The `$app:goodtunes` order metafield is still written (durable record + sweep retry `sweepRedemptionMetafields`, 10-min scheduler), but the extension never reads it.

**How to apply:**
- Extension auth = Shopify session token (`useSessionToken`, HS256 verify with `SHOPIFY_API_SECRET`, `aud` = API key, shop from `dest`) + the order `confirmationNumber` as proof-of-order (stored on `orders.shopify_confirmation_number` at webhook materialization). Endpoint releases the code only on confirmation match; `{ready:false}` is returned freely.
- Pre-2024 orders have no confirmationNumber → 403 forever; fallback card links to the library. Acceptable.
- `network_access = true` in the extension TOML requires a written justification during Shopify App Store review.
- ScriptTag path fully removed (install fn, callback call, repair/inspect surfaces, `write_script_tags` scope). Legacy `/shopify/redeem-button.js` is still SERVED for stores whose old tags exist until Shopify's ScriptTag shutoff (Aug 2026) — don't delete the route yet.
- Scope reduction is safe: existing store tokens keep their granted scopes; only new installs request the smaller set.
