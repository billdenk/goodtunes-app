---
name: Shopify custom-app bridge (review-block workaround)
description: Second custom-distribution Shopify app installs while the public app is stuck in App Store review; how the dual-credential support works
---

# Custom-distribution bridge app beside the public Shopify app

A PUBLIC-distribution Shopify app cannot be installed on any live merchant store while it is in App Store review ("This app is under review" install block) — "unlisted" only hides the listing, it does NOT skip review. Bridge: a second Partner-Dashboard app with **Custom** distribution (locked to one store, no review) — first user Niina Soleil's store.

**How it works** (server/shopify.ts):
- Credentials: `SHOPIFY_CUSTOM_API_KEY`/`SHOPIFY_CUSTOM_API_SECRET` beside the public pair; `appCreds(kind)` resolver, kind = `'public' | 'custom'`.
- Install: `/api/shopify/install?...&appCred=custom` → signed OAuth state payload gets an `app2:` prefix (stripped before the existing nonce/label/person/link parsing); state sig, OAuth query HMAC, and code exchange all use that app's secret.
- `shopify_stores.app_credential` remembers which app installed the store; token refresh signs with the matching secret; a re-install under the other app flips it on callback.
- **Provenance rule:** webhook HMAC + extension session-token JWT verification try both secrets but the kind that verified must MATCH the store row's app_credential — otherwise accept-and-drop (webhook) / 401 (JWT). This stops a stale `app/uninstalled` from the old app clobbering a fresh token after re-install.

**Why:** Niina's store hit the review block on first real install attempt (2026-08-13); the bridge is deliberate and temporary — no UI affordance, the operator hands out the `&appCred=custom` link manually. When the public app clears review, re-install the store under it (normal link) and the row flips back.

**How to apply:** the custom app in Partner Dashboard needs the same scopes + the callback host whitelisted; checkout UI extension lives on the public app only, so bridge stores rely on the email/note_attribute redemption path unless the extension is also deployed to the custom app.
