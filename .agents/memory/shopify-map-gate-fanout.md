---
name: Shopify map_shopify gate fan-out
description: Every operator-initiated Shopify connect/browse surface must gate map_shopify, and the identity source differs per route.
---

# Shopify `map_shopify` gate fan-out

When you add a new operator-initiated Shopify surface (connecting a store to an
entity, or browsing a store's catalog to map a product), gating **attach/detach
only is not enough** — the OAuth **install + callback** linking path and the
**product-browse** endpoint each need the same `map_shopify` gate, or a partner
without the verb can link a store / pull catalog data.

**Why:** code review rejected the artist-store task for exactly this — attach/
detach were gated but connect (OAuth install→callback) and
`GET /api/admin/shopify/stores/:storeId/products` were `requireAdmin`-only, and
`requireAdmin` admits every partner account (partner roles are `isAdmin=true`).

**How to apply — identity source differs per route:**
- `/api/shopify/install` and `/api/shopify/callback` are **top-level browser
  navigations** (`window.location.href`, and Shopify's 302 back). There is **no
  Bearer header** — read `req.session?.userId` (the Lax admin session cookie
  rides along on same-origin nav and on the cross-site GET redirect back). Gate
  only when a validated `personId`/`labelId` context is present; context-less /
  Shopify-initiated installs stay ungated (an unknown id resolves to `""`, so it
  falls through unstamped). The `state` is HMAC-signed and only minted by the
  gated install, so install-time gating + signed state is the real boundary; the
  callback re-check is defense in depth.
- `requireAdmin` in `server/shopify.ts` is **bearer-only** and sets
  `req.adminUser` — product-browse (and any other requireAdmin route) reads
  `(req as any).adminUser.id`, NOT the session.

Resolve the scope from the **store's owner**: `store.personId` → `{kind:'artist'}`,
else `store.labelId` → `{kind:'label'}`, else (unattached, no owner) →
operator-only via `getUserRole`. `checkPartnerVerbForScope` /
`partnerEditGate` auto-allow super_admin/admin, so the operator (Bill) is never
blocked. A store dual-stamped with both person+label gates on the artist scope
only (fail-closed, acceptable).
