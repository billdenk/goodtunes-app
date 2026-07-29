---
name: Shopify install-link attribution tokens
description: How attributed Shopify install links carry ownership through OAuth and why the callback skips the verb gate for them
---

# Shopify install-link attribution (link states)

Attributed install links (artist portal, or /admin/shopify with the Store-owner picker) store personId/labelId ON the `shopify_install_links` row; the URL carries `?link=<row id>` and the signed OAuth state becomes `nonce:link:<id>`.

**Rules that must hold:**
- The callback SKIPS the session `map_shopify` verb gate for link states — authorization happened at mint time; the clicker is expected to be an anonymous store owner. Non-link person/label states still require a session + verb.
- The link's attribution applies ONLY when `linkRow.shopDomain === shop` (both at install and at callback). A swapped `?shop=` degrades to a context-less install — never a cross-shop stamp. Missing row = context-less, never a failed handshake.
- Link installs render a minimal inline-HTML success page (no admin login wall); storeName goes through `escapeHtmlText()`.
- Artist mint endpoints (`/api/artist/shopify/*`) derive personId from the session role (`requireRole("artist","super_admin")`); super_admin passes `?personId=` which is existence-validated. Re-minting a domain reassigns the pending link's owner (domain is the natural key) — accepted tradeoff.

**Why:** artists lack the `map_shopify` verb (not in OWNER_SELF_SERVE_VERBS) and copied links are opened by third parties with no GoodTunes account, so the pre-existing session-gated person/label state path could never work for them.

**How to apply:** any change to the install/callback state parsing or the verb gate must preserve the shop-domain match + degrade-to-context-less behavior (no automated test yet — see follow-up about proving this).
