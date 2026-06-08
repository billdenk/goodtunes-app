---
name: Stripe order recording in prod
description: Why prod can show zero native app orders / NULL tax even when the materialization code is correct
---

# Prod "no app orders / tax_cents NULL" is usually NOT a materialization bug

Before suspecting `materializeOrderFromSession`, the webhook handler, or schema drift, check these first — every prod "sales not recording" report so far has been data/operator state, not code:

1. **Is the release actually live?** A staged release (`albums.is_prepping = true`) renders the locked preview page, so fans literally cannot complete a checkout — zero sessions, zero orders, no matter how correct the code is. `is_prepping` wins over the release date. Check the specific album before debugging code.
2. **Are ALL prod orders `origin='legacy:gogoods'`?** If so there have been zero native app checkouts ever; `tax_cents` is uniformly NULL simply because every row is a legacy import predating Stripe Tax — that is expected, not a bug. The tax column exists and the code writes it for real orders.
3. The order tables (`orders`/`order_items`/`order_copies`) in prod ARE complete (schema-drift-smoke confirms 113 tables, every column) — materialization won't throw on a missing column.
4. The webhook IS mounted correctly: `express.raw` on `/api/webhooks/stripe` is registered BEFORE `express.json` in `server/index.ts`, so the signature path gets the raw buffer.

# Webhook secret is a single GLOBAL Replit Secret — fragile across test/live

**Why:** Stripe client keys come from the Replit connector (test in dev, live in prod, separated by `REPLIT_DEPLOYMENT`), but `getStripeWebhookSecret()` (`server/stripe.ts`) falls back to ONE global Replit Secret `STRIPE_WEBHOOK_SECRET`. Stripe issues a different signing secret per webhook endpoint, so this one value can match the test endpoint OR the live endpoint, never both.

**How to apply:** In prod, `STRIPE_WEBHOOK_SECRET` must equal the LIVE endpoint's signing secret or `constructEvent` fails → handler returns 400 → order never materializes (the only fallback is the fan loading `/welcome` with a valid customer bearer, which calls `GET /api/checkout/session/:id` and materializes on read). Dev tolerates unsigned webhooks, so dev keeps working even when the global secret holds the live value. A real fix is to make the secret env-aware (`STRIPE_WEBHOOK_SECRET_LIVE` in deployment, fallback to the global) so both can be wired without conflict.
