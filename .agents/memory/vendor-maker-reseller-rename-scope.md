---
name: Vendor → Maker/Reseller rename scope
description: Which user-facing "vendor" strings get renamed to Maker/Reseller and which stay; identifiers never change.
---

The gear-supplier `vendor` concept is presented to operators as **Maker** / **Reseller** / **Makers & Resellers**, but ONLY as UI copy.

**Rule:** rename only USER-FACING strings (labels, headings, tab text, toasts, error messages, placeholders, aria-labels/titles, count strings, empty states, confirm dialogs). NEVER touch identifiers: the `vendor` role value, `vendors` table, `/api/admin/vendors` routes, `data-testid`s, `queryKey`s, component names (VendorRow/VendorSheet/VendorPane), `vendorId`/`entityKind="vendor"`, localStorage keys, route hrefs, tab element `id`s, type unions.

**In scope (renamed):** the gear/instrument supplier surfaces — AdminVendor(s), AdminInstrument(s) per-gear maker/reseller panel + editor, Admin.tsx gear-instrument editor + VendorPaneEditor/preview, AdminSearchBar group label, AdminUserMenu role label, AdminPerson/AdminTrash copy.

**Deliberately LEFT as "vendor":** the GoodDeed-routing / printing / payout supplier meaning is a DIFFERENT concept — SignedCertVendorPanel, PrintPdfsPanel, AdminPayoutsRelease, AdminPlatformPricing printing-ladder copy, SellPanel "Vendors tab" (press-quoting). Do not rename these.

**Why:** Bill wanted operator-facing language to distinguish makers from resellers without a risky schema/route migration. Mixing the two "vendor" meanings under one rename would mislabel payout/printing suppliers.

**design-lint gotcha:** changing the text on a line that already carries a baselined violation (e.g. a naked-icon-button's aria-label/title) re-flags it as NEW. Re-snapshot with `npm run design:lint -- --update-baseline` — do not convert the pre-existing button just to clear it (scope creep). See design-lint-baseline-line-keyed.md.
