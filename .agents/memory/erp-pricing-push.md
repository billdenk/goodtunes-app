---
name: ERP inbound pricing push (Matilda)
description: Inbound push API pattern for a press ERP with no public API — per-press key, validate/submit, staged pending sync reusing Coda preview→commit.
---

# ERP inbound pricing push

The inverse of the Coda pull sync: the press's ERP (Matilda for MRP) POSTs
pricing JSON to `/api/erp/v1/pricing/validate` (pure dry-run) and
`/api/erp/v1/pricing/pushes`. Implementation lives in
`server/erpPricingPush.ts` + routes in `registerPressCatalogRoutes`; spec
doc for the external developer is `docs/matilda-integration-kit.md`.

**Rules that must hold:**
- A push NEVER writes ladders directly. Submits land as a `pending` row in
  `press_pricing_syncs` with `source='erp_push'`; only an operator
  preview→commit (reusing `loadCatalogContext` + `mergeCodaLadder`, which
  respects `lockedFromSync`) applies them. Statuses used: `validated`
  (dry-run), `pending`, `ok`, `discarded`, `error` (rejected submit —
  recorded so history shows failed attempts).
- Submit is STRICT: any row error → 422, nothing staged. Duplicates of
  (format,tier,qty) are errors, never median-collapsed like Coda.
- Credential: one active key per press in `press_push_credentials`
  (`gtpush_<12hex-keyId>_<48hex-secret>`, secret envelope-encrypted via
  `encryptSecret`, constant-time verify with a dummy-secret compare so
  unknown keyIds don't leak by timing). Mint revokes the prior row;
  revoked rows kept for audit. Key routes are requireAdmin + the explicit
  `requireOperator` gate (requireAdmin admits all partners).
- Freshness ("pricing last received") is derived from erp_push submit
  rows (`pending/ok/discarded`), NOT validates — no extra column.

**Why:** capabilities promise external pushes can't silently rewrite live
pricing; the Coda operator-review model is the ruled safety boundary for
ALL external pricing sources.

**How to apply:** any future inbound ERP surface (orders, inventory)
should join the `/api/erp/v1/` family, reuse the same key + rate-limit
verification, and stage writes behind an operator verb rather than
applying directly.
