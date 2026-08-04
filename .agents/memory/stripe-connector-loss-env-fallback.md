---
name: Stripe connector loss + env fallback
description: Enterprise migration severed the Replit Stripe production connection; server/stripe.ts has a guarded live-key env fallback.
---

**What happened (Aug 2026):** Replit's Enterprise account migration silently dropped the Stripe *production* connection (connectors API returned 0 items for `environment=production`; dev/test kept working). Prod checkout 503'd with "Stripe production connection not found". Republishing, re-accepting the integration, and reinstalling the Stripe app on the live account did NOT re-bind it — the Publishing pane never showed a "Connect Stripe" step. Platform-side break; support ticket required.

**The fix in code:** `server/stripe.ts` `envFallbackCredentials()` — if the connector lookup fails/returns nothing, fall back to `STRIPE_SECRET_KEY_LIVE` + `STRIPE_PUBLISHABLE_KEY_LIVE` Replit Secrets. Guarded to production only AND live-prefixed keys only (`sk_live_`/`rk_live_`, `pk_live_`), so a stray secret can never leak live charges into dev. The connector always wins when present.

**Why:** keeps checkout alive during platform-side connection loss without breaking automatic test/live switching.

**How to apply / unwind:** once Replit support restores the production connection, the connector takes over automatically; the fallback secrets (and the "GoodTunes Replit fallback" key in Stripe) can then be deleted. Diagnose connection state by fetching `https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?connector_names=stripe&environment=production&include_secrets=true` with `X-Replit-Token: repl $REPL_IDENTITY`.

**Gotcha:** users pasting keys from Stripe's list often paste the truncated display text — validate prefix AND length (~100+ chars) before trusting a pasted key.
