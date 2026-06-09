---
name: Buyer location billing fallback
description: Why every report/admin buyer-location read must coalesce shipping_address → billing_address
---

Operator-facing buyer location (city/region/country) must read
`coalesce(nullif(shipping_address->>'x',''), nullif(billing_address->>'x',''))`,
never shipping_address alone.

**Why:** Digital / donation add-ons (e.g. Nightbirde "Gift of Hope", digital-only
GoodDeed certs) collect ONLY a billing address at Stripe checkout, so
`orders.shipping_address` lands all-null (`{city:null,state:null,country:null}`)
while the real location lives in `billing_address`. Reading shipping-only made the
admin "Add-ons sold" panel (and every other report) show "Location unknown" for
real buyers who clearly had a known location.

**How to apply:**
- Reusable SQL fragments live in `server/reports/buyers.ts`: `LOC_CITY`,
  `LOC_REGION`, `LOC_COUNTRY` (exported). They hardcode the orders alias `o`, so the
  importing query MUST alias `orders` as `o`.
- Used across: reports/buyers.ts (roster/map/geography), artistReports.ts,
  labelReports.ts, managerReports.ts, reports/index.ts (topFans/fanMap — drizzle
  select, merge in JS), reports/admin.ts (revenueBreakdown byCountry — JS merge),
  and routes.ts admin Customers-tab list/search/sort (`/api/admin/people/:id/buyers`,
  `/api/admin/albums/:id/buyers`).
- Any NEW buyer-location surface must use the same fallback.
- Privacy: only city/region/country may leave a report. Never widen to
  street/line1/postalCode/email/phone.
- EXCEPTION — do NOT add the billing fallback to fulfillment/mailing-label columns.
  The `/api/admin/albums/:id/buyers?format=csv&variant=fulfillment` export pulls
  line1/line2/postalCode/city/state/country straight from shipping_address ON
  PURPOSE; digital orders legitimately stay blank there (you can't ship to a
  billing-only address). Its `has_shipping` flag + "Digital" order-type guard that.
