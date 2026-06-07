---
name: Apple Pay / Google Pay in fan checkout
description: How wallet buttons are enabled in the Stripe Embedded Checkout Buy flow (no separate Express Checkout Element)
---

# Apple Pay / Google Pay in the fan Buy flow

Wallets are surfaced **inside the existing Stripe Embedded Checkout**, NOT via a
separate Express Checkout Element button. Embedded Checkout auto-renders the
Apple Pay / Google Pay button on a supported device once two things are true:

1. The fan host serves Stripe's Apple Pay domain-association file at
   `/.well-known/apple-developer-merchantid-domain-association` (committed in
   `public/.well-known/`, served by a route in `server/routes.ts` next to the
   apple-app-site-association route; `/.well-known/*` already bypasses the
   canonical-host redirect).
2. That host is registered as a Stripe **payment method domain**
   (`stripe.paymentMethodDomains`).

**Why a static association file works:** the bytes are Stripe's universal file
(fetched from stripe.com/files/apple-pay/...), not a per-merchant file — no Apple
Developer merchant-ID setup needed when using Stripe.

**Registration is automatic at boot:** `server/applePay.ts`
(`ensureApplePayDomainsOnce`) runs ~10s after start, guarded by
`isStripeConfigured()`, registering FAN_HOSTS (`my./store./get.goodtunes.music`)
plus the dev REPLIT host. Idempotent (lists first, re-validates inactive),
best-effort, never throws. Manual run: `scripts/register-apple-pay-domains.ts`.

**Gotchas:**
- `getStripe()` resolves the TEST account in dev / the LIVE account in prod, so
  the same boot hook lights up wallets in both — but prod only validates once the
  file actually serves on the live hosts (i.e. after publish).
- Stripe TEST mode reported all fan hosts `applePay=active` even before the file
  was provably on those live hosts — test-mode validation is lenient; don't read
  "active in test" as proof prod is wired. Verify the live account post-publish.
- There is no `payment_method_types` restriction on the checkout session
  (`server/commerce.ts`), which is what lets wallets auto-surface — don't add one.
