---
name: Press ERP identifiers + customer profile
description: Generic press-ERP reference fields on pressing orders with per-press labels, and the press-scoped customer profile — boundaries to keep when building BOM/floor exports or Phase-2 ERP sync.
---

# Press ERP identifiers on orders + press customer profile

**The rule:** order↔ERP matching fields are press-GENERIC columns with per-press
display labels — never press-specific columns. `pressing_order_requests.press_job_number`
/ `press_sales_order_number` are the values; `manufacturers.erp_ref_labels`
(jsonb `{jobNumber, salesOrder}`, resolver + defaults in `shared/pressErp.ts`)
supplies the vocabulary (MRP: "MRP #"/"SO #"). The press assigns both
out-of-band in Phase 1, so blank is normal and operators enter them in ANY
status (numbers often arrive after approval).

**Why:** every white-label press runs a different ERP (MRP→Coda,
Hellbender→Odoo, Viryl/PMP→spreadsheets); improvements must land for all
presses at once, with only labels/values varying.

**How to apply:**
- Any surface that shows these numbers (queue detail, order detail, future
  BOM/floor exports) must resolve labels per-press: snapshot `pressId` first,
  else the album's `album_skus.press_id`, else generic defaults. Older
  pressing-order POSTs wrote `packageSnapshot.pressId` null — the album_skus
  fallback is what makes labels work for them.
- `press_customer_profiles` (category/pricing tier/payment terms/billing
  basis) is INTERNAL ops data — how the press's own ERP classifies us.
  Routes are requireAdmin + super_admin: a press must never read/write its
  own classification of GoodTunes from our side. The GoodTunes row is
  `customer_kind='goodtunes'` + `customer_id NULL` (default category
  "broker" — GoodTunes is customer-of-record for brokered orders); the
  kind/id pair reserves room for direct label/artist records. Uniqueness is
  an expression index on `COALESCE(customer_id,'')` (post-merge.sh, not in
  drizzle — drift guard checks columns only).
- Loose text on purpose (category/tier are selects seeded with MRP's
  vocabulary but validated as short strings) so another press's scheme fits
  without schema change. Don't tighten to enums.
