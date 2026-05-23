---
name: Vendor pricing bypasses post-sale lock
description: Which signed-cert surfaces are gated by the partner-permissions edit_metadata post-sale lock and which intentionally are not.
---

Two layers gate signed-cert edits:

1. **Partner permissions** (album-scoped, five verbs in PARTNER_PERMISSION_VERBS). `edit_metadata` is the only one that respects the post-sale lock; `manage_payouts`, `manage_masters`, `manage_shopify`, etc. stay live.
2. **Vendor-scope auth** (separate resource, gated by `gateVendorAccess`: super_admin OR `role=vendor` with matching `role_scope_id`). This layer never consults the post-sale lock.

**Rule:** operational routing must stay editable after first sale. That covers:

- Per-vendor GoodDeed pricing (`/api/admin/vendors/:id/gooddeed-services`).
- Per-album per-leg vendor assignment (`PATCH /api/admin/albums/:id/signed-cert-vendors`).
- Payouts (the original prior art for this rule).

What still respects the lock: fan-facing addon metadata (price, min price, planned quantity) via `PUT /api/admin/albums/:id/addons/signed_cert` and the normal `edit_metadata` verb. The fan can't have the price flip under them post-sale; the vendor can absolutely be swapped post-sale because that's a logistics decision.

**Why:** when a release has sold to fans, GoodTunes still needs to (a) re-route the print order to a different vendor if the assigned one falls through, and (b) update payout details. Freezing those would force a manual DB poke. The per-release `pricing_snapshot` on `album_addons` is the audit trail that protects the fan/artist from a vendor mid-flight price change once the run is locked.

**How to apply:** when adding a new signed-cert-adjacent endpoint, decide first whether it's *what the fan paid for* (gate behind `edit_metadata` + lock) or *operational routing* (gate behind super_admin / vendor scope only).
