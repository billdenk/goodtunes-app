---
name: Quickprinter partner portal
description: GoodDeed quickprinters get their own scoped portal; shared print-and-mark helper across admin + printer.
---

# Quickprinter partner portal

A vendor with `is_quickprinter=true` signs into its own scoped portal (`client/src/pages/PrinterPortal.tsx`) instead of the generic GoodDeed-Services vendor shell. Reached via `VendorScopeRouter` in `VendorPortal.tsx`, which branches on the `isQuickprinter` flag now carried in the vendor `gooddeed-services` payload — on BOTH the `role==='vendor'` path and the super-admin vendor-scope path. Server routes live in `server/printerPortal.ts` under `/api/printer/:id/*`, gated by `requirePrinterScope` (super_admin OR `findMembershipForScope(userId,"vendor",vendorId)`) PLUS an `is_quickprinter` assertion.

## Shared print-and-mark path — keep both callers in sync
**Rule:** lock→render→mark-printed for a batch of certs lives ONLY in `runCertPrintBatch(certIds, format, origin, adminId)` in `server/certificates.ts`. Two routes call it: the admin batch-download route and the printer portal's `/api/printer/:id/print-queue/batch-download`.
**Why:** there must be exactly one place that flips certs to `printed`, or one surface could double-print or skip the mark. Downloading a batch is what marks printed (no separate button).
**How to apply:** any new print-and-mark surface reuses `runCertPrintBatch`; never re-implement the lock/render/printed sequence.

## Scope guardrails (don't regress)
The printer portal is read-mostly: its only write surfaces are its own profile, its GoodDeed-Services pricing (reuses `GoodDeedServicesTab`), and mark-printed-via-download. It must NEVER touch routing/pricing rungs or the press/reseller/fulfillment/GoodDeed-vendor surfaces, and gets NO artist invite roster (Staff reuses `OrganizationPeople` with `canInviteSubusers=false` + `canAddAdmins=false`). A printer's queue = certs whose resolved print vendor (`album_addons.print_vendor_id` ?? `payout_settings.default_print_vendor_id`) is this vendor; an empty queue is the correct graceful state for any non-default printer.

## design-lint: mirror baselined surfaces, don't convert
PrinterPortal mirrors PressPortal (dark shell, `text-white/NN` tones) + AdminPrintQueue (white card, slate tones + hardcoded `text-[Npx]`), both already in `.design-lint-baseline.json`. Re-snapshot the baseline for the mirrored patterns — converting to `text-fan-*` tokens would make it INCONSISTENT with PressPortal and is wrong on the white card (fan tokens are tuned for dark bg).
