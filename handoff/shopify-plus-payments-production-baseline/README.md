# Shopify+ Payments — production baseline for Ruby

This handoff attaches Otis’s current production Payments-tab component so Ruby can plan the CAD/USD R&D variant in Canvas against the real UI rather than redrawing or approximating it.

## Attached source

- Original repository path: `client/src/components/admin/ShopifyPlusPanel.tsx`
- Attached path: `client/src/components/admin/ShopifyPlusPanel.tsx`
- Source lines: 2,403
- Source commit: `4c60af1e4fd1c40f1d90f4cea92242881ddb628b`
- Source commit date: `2026-09-01T20:18:56Z`
- SHA-256: `e0dbd5571a74cd6e36c31a6a74415932082037f4515bbcccd36cbc3905c190d9`

The attached file is a byte-for-byte copy of the current production source. It has not been rewritten, simplified, restyled, or converted into a mock component.

## Covered production surface

`ShopifyPlusPanel.tsx` is the existing Payments-tab baseline containing the estimate, payment-request, ledger, status, and payout-queue states Ruby requested.

It uses the application’s existing shared UI primitives, hooks, data contracts, and API routes. No local sibling component from `client/src/components/admin/` is imported, so this single source file is the complete panel-specific visual baseline. It is not a standalone runnable Playground component without the main application dependencies.

## Authority boundary

- Otis’s production component is authoritative for existing behavior and state coverage.
- Ruby’s CAD/USD work is an R&D design variant to be planned in Canvas against this baseline.
- This attachment does not change production UI, behavior, payments, pricing, permissions, services, schemas, or currency handling.
