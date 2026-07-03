---
name: Shopify expiring offline tokens
description: Shopify's Dec 2025 cutover rejects non-expiring offline tokens; how our OAuth mints/rotates the expiring pair and how legacy stores recover.
---

# Shopify expiring offline tokens (Dec 2025 cutover)

As of Shopify's Dec 2025 change, the Admin API rejects classic non-expiring
offline tokens (the `shpat_` tokens our install used to mint). Every Admin API
call 403s with `[API] Non-expiring access tokens are no longer accepted...
Start using expiring offline tokens`.

**The fix:** request `expiring: "1"` on the OAuth code exchange. The response
then carries a ~1-hour `access_token` + `expires_in`, plus a ~90-day
`refresh_token` + `refresh_token_expires_in`. We store the encrypted refresh
token and both expiry timestamps on `shopify_stores`, and rotate the access
token in `shopifyFetch` (proactively within a skew window, reactively on
401/403).

**Why refresh ordering is critical.** Shopify retires the OLD refresh token the
instant it issues a new one (rotation on every grant). So `refreshStoreToken`
MUST persist the rotated pair to the DB *before* returning the new access token.
A process crash in the millisecond gap between Shopify issuing the pair and our
DB write is the only unavoidable brick — recoverable by operator reconnect.

**How to apply / invariants:**
- Single-flight per store id (per-instance Map) so concurrent callers share one
  refresh and can't each spend the refresh token.
- Cross-instance race net: if our refresh POST fails (`!r.ok`), re-read the row;
  if a concurrent instance already landed a fresh, unexpired access token,
  adopt it. Compare the **access-token ciphertext** (not the refresh token) —
  holds even on the rare grant that returns no new refresh_token.
- Never throw for token reasons. Best-effort callers keep their `r.ok` contract;
  a store that can't be revived just gets its 401/403 back.
- Legacy rows have `access_token_expires_at = null` → treated as non-expiring,
  token returned as-is. They only recover when the operator **reconnects** (the
  existing OAuth install flow IS the reconnect). The products route turns an
  unrevivable 401/403 into `409 {code:"shopify_reconnect_required"}`, which the
  client surfaces as a reconnect prompt. This 409 is products-route-only; all
  other Admin call sites (webhooks, refunds, push, inventory, reinstall-hooks)
  keep their plain `r.ok` contract through the transparent refresh.
- `decryptToken` transparently accepts legacy plaintext `shpat_` rows, so old
  installs read fine until they 403.
- Uninstall handler clears accessToken + refreshToken + both expiry columns.
- Columns live in `post-merge.sh` (`migrate_shopify_expiring_tokens`, idempotent
  ADD COLUMN IF NOT EXISTS on dev + prod).

**Verification gotcha (can't be done from dev):** you cannot confirm from the
dev environment that Shopify honors `expiring:"1"`. If it were ignored, the
exchange returns no `expires_in` → row saved with null expiry → treated as
legacy → still 403s (loud failure, reconnect visibly still broken, not silent).
Post-merge you MUST reconnect a real store in prod (e.g. goodtunes-test),
confirm `shopify_stores.access_token_expires_at` + `refresh_token` populate,
then confirm a product browse succeeds past the 1-hour access-token lifetime.
