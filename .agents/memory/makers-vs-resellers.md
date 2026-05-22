---
name: Makers vs Resellers vendor split
description: vendors carry is_maker + is_reseller; one row can be both; admin surfaces are mode-aware on a single component
---

The `vendors` table carries two role booleans, `is_maker` and `is_reseller`, with a CHECK that at least one is true. **A single row can carry both flags** — Gibson is a Maker (builds Les Pauls) and a Reseller (sells them direct). Do not split it into two rows; the surface that creates from sets the relevant flag and the other defaults off, but a Roles panel on the detail page lets the operator promote either way without delete-and-recreate.

**Why:** The catalog had a single "Vendor" concept that conflated the brand that built the gear with the storefront that sold it. The fan-side "By Gibson" headline needs the former; the "Available at" list needs the latter. Splitting into two tables forces a fake dedupe and breaks for vendors that legitimately do both.

**How to apply:**
- `AdminVendors.tsx` and `AdminVendor.tsx` are single components that flip mode on `useRoute("/admin/makers")`. Add new vendor-adjacent surfaces with the same shape; do not fork the file.
- Filter via `/api/vendors?role=maker|reseller` as a **URL string** in the queryKey — the default fetcher does `queryKey.join("/")`, so a `{role}` object segment would break it.
- Gear → single Maker is `instruments.maker_vendor_id` (FK, SET NULL). The reseller join table (`instrument_vendors`) is unchanged and still drives the "Available at" list on the fan side and the "Resellers" tab on the admin side (tab key stays `vendors` so deep links don't break).
- Never invent a third role token (`affiliate`, `partner`, etc.) — extend with another boolean if needed.

## Presses ≠ Manufacturers ≠ Makers

The vinyl pressing-plant entity (`AdminManufacturers.tsx`, route `/admin/manufacturers`) is labelled **"Presses"** in every user-facing string. URL, sidebar key, and filename stay as `manufacturers` so backlinks don't break. The rename exists so the word "Manufacturer" never blurs with the new Maker concept above — a Maker builds the gear, a Press stamps the vinyl.
