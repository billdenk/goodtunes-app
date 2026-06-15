---
name: gibson.com folds to one Gibson maker
description: Why gibson.com is NOT in SUB_BRAND_PARENT_HOSTS — operator rule that every product on gibson.com is one Gibson maker, plus the sub-brand-promotion gotcha behind it.
---

# Everything on gibson.com is one Gibson maker

Operator rule (Bill, confirmed): **anything whose product URL is on `gibson.com` is Gibson** — including Epiphone, "Gibson Custom", and "Gibson Mod™ Collection". The Add-gear importer must yield Maker = Reseller = **Gibson** for any gibson.com page, never a separate maker card per brand string.

**Why:** the sub-brand-promotion feature (gated by `SUB_BRAND_PARENT_HOSTS` in `server/routes.ts`) takes a "both"-role host whose scraped JSON-LD `brand` ≠ the host's display name and promotes that brand into its own maker (parented to the host vendor). It was meant for a domain that genuinely fronts distinct sub-brands, but it mis-fires on a host's own product **lines**: "Gibson Custom" / "Gibson Mod™ Collection" each became a maker card beside Gibson, and Epiphone too. Bill wants them all under one Gibson.

**How to apply:**
- Keep `gibson.com` OUT of `SUB_BRAND_PARENT_HOSTS`. The set is currently empty, so the promotion block is dormant for all hosts. Only add a host there if it truly resells separate makers you want broken out — and never gibson.com.
- `getVendorByDomain` filters `deletedAt`, so once the stray sub-brand rows are soft-deleted, gibson.com resolves to the single live Gibson row and new imports attach correctly.
- Data cleanup pattern: a one-time, marker-guarded, **domain-targeted** (not hardcoded UUIDs) fold in `scripts/post-merge.sh` repoints sub-brand gear (`instruments.maker_vendor_id` + `instrument_vendors.vendor_id`) to the top-level gibson.com vendor, de-dupes colliding attachments, then soft-deletes the children. Dev self-gates (no Gibson rows). Marker-guard prevents clobbering any deliberately re-created sub-brand on later merges. Only gear FKs matter here — album_addons / payout_settings / vendor_gooddeed_services "vendor" are GoodDeed-printing, a different concept.
