---
name: Coda press pricing sync
description: Per-press Coda.io (Superhuman Docs) pricing connection + preview/commit sync conventions.
---

- Connection lives in `press_coda_connections` (one per press): API token encrypted with `server/auth/crypto` (`TOTP_ENC_KEY` envelope, same as admin 2FA), one-time entry — GET returns only a `configured` projection, never the token or encrypted blob.
- Sheet shape is operator-mapped, not assumed: `columnMapping` (tier/qty/price column ids, priceKind unit|total, optional format column or defaultFormat). Preview/commit re-fetch rows fresh; commit mirrors the Hellbender apply (default-jacket ladders, `lockedFromSync` rungs skipped, runs in `press_pricing_syncs` with source `coda`).
- **Why operator-only:** the routes carry a press-supplied secret; `requireAdmin` admits all partners, so the Coda routes add an explicit super_admin/admin gate (`requireOperator` in server/pressCatalog.ts).
- **How to apply:** any new press-side external connector (token + doc/table + mapping) should copy this module (server/codaPricingSync.ts) — classified API errors (auth/forbidden/not_found/rate_limit) so token problems never look like an empty sync; config errors get `kind:"config"` so routes return 4xx not 502.
- UI: CodaPricingSyncCard on AdminManufacturer Overview (operator tab).
