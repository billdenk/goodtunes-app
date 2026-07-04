---
name: Stateful preview-pass grants
description: How the behind-the-scenes "hand a reviewer a private preview link" system gates viewing vs. buying, and the two constraints that are easy to break.
---

# Stateful preview-pass grants

Operators + the release's owning artist/label can mint a private, revocable, view-tracked
preview link for a specific reviewer at ANY lifecycle stage (hidden/prepping/sunrise).
The link is `<shareUrl>#previewpass=<token>`; the token carries a `jti` that keys a DB row.

## Two constraints that are easy to break (the durable why)

1. **A handed-out (jti-bearing) preview pass is strictly VIEW-ONLY — it must NEVER
   authorize checkout.** The checkout/staging gate treats `previewPass && previewPass.jti`
   as "reviewer viewing," distinct from the family `/staging` pass (no jti) that DOES turn
   on Buy. A future change that "lets reviewers buy early" by loosening the jti check would
   let a leaked reviewer link complete a purchase on an unreleased album. Keep jti = look, not buy.
   **Why:** compliance — previews are 30s server-capped encrypted segments only; the full
   master never leaves, and an unreleased release must not transact off a private link.

2. **Grant create/list/revoke deliberately bypass the post-sale `edit_metadata` lock.**
   Handing out or revoking a preview link is an OPERATIONAL verb (like per-vendor pricing /
   routing), not fan-facing metadata, so it stays editable after first sale.
   **Why:** same rule as `vendor-pricing-bypasses-post-sale-lock` — only price/min/qty on the
   fan-facing addon respect the lock.

## Enforcement notes (so a "quick fix" doesn't regress it)
- The token secret is returned ONLY from the create response (one-time reveal); the raw token
  is never stored (only the jti), so GET/revoke responses can't leak it and it's unrecoverable.
- Revocation is re-checked in the DB on EVERY read via the async resolver — the sync
  `readPreviewPass` is test-only. Every production read path (both slug routes, buy-options,
  checkout) must use the revocation-aware resolver or a revoked link keeps working.
- Who-can-manage = super_admin/admin OR a membership on the album's owning artist/label scope;
  a partner with no stake gets 403. The client panel self-hides on GET 403 — but that check
  runs AFTER all hooks (hook-order safety, cf. album-detail-hook-order).
- Documented + UI expiry range is 7–90 days; keep the server Zod floor at 7 to match the contract.
