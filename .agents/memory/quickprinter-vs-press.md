---
name: Quickprinter vs press capability
description: GoodDeed cert routing lives at the platform-default level, not per-album; Quickprinter is its own vendor capability with per-paper-size ladders.
---

# Quickprinter vs press

Per-album printer/hologram/insertion routing on `album_addons.{print,hologram,insertion}_vendor_id` was a UX foot-gun — every album resolves to the same trio of vendors in practice. The single source of truth is now `payout_settings.default_{print,hologram,insertion}_vendor_id`, set on the Platform Pricing page. Legacy per-album columns remain on the table as a back-compat override that the UI no longer writes to; the live-cost preview reads the album row only when set, otherwise the platform default.

**Why:** an operator picking the certificate printer per release isn't a real workflow — the same Quickprinter handles every GoodDeed. Surface that decision on the platform page (where it belongs) and the Shopify Sell panel stops being two clones of the same form.

**How to apply:** any new per-album operational-routing field that always resolves to the same vendor across albums should default at the platform level (payout_settings singleton) with the per-album column kept only as a back-compat override.

## Quickprinter capability

`vendors.is_quickprinter` is mutually exclusive with `is_maker` (a vinyl press is never a Quickprinter). The Printing picker on the routing-defaults card is server-side filtered to `is_quickprinter = true` so a press can't be chosen as the certificate printer.

## Per-paper-size ladders

`vendor_gooddeed_services.size_ladders_json` is `{ letter: Tier[], "12x18": Tier[] }`. Fixed rungs: **50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000**. Missing rungs walk down to the next-lower rung at price-resolution time. The legacy `tiers_json` is read as a fallback when `size_ladders_json` is missing on a row, so old press printing rows keep working. New paper sizes extend `PaperSize` in `server/vendorGoodDeedPricing.ts` and add a tab in the editor; the walking rule stays the same.
