---
name: Shopify-JSON gear scrape handler
description: How Add-gear imports from Shopify-based vintage shops (Retrofret, Gryphon) and why the .json endpoint beats HTML scraping.
---

# Shopify vintage shops → `/products/<handle>.json`

Vintage/boutique shops on Shopify (Retrofret, Gryphon) often render product
pages with minimal meta — Gryphon emits **no** JSON-LD `Product` and no
`og:description`, so the generic OG/JSON-LD scraper imports only a name + photo
and drops maker/price/year/description. The robust fix (same philosophy as the
Gruhn `api.guitars.com` handler) is to hit Shopify's public
`/products/<handle>.json` instead of scraping HTML.

**Rule:** curated-Shopify shops live in `SHOPIFY_JSON_HOSTS` (always structured,
fail-loud). **Unknown** hosts are auto-detected: if the pasted URL has a
`/products/<handle>` segment, the route probes `<host>/products/<handle>.json`
and uses the structured path only when it returns JSON with a `product` object —
otherwise it falls through to the generic HTML scraper (no fail-loud, no
fabricated maker). Auto-detect deliberately skips `KNOWN_HOSTS` so their
curated/specialized handlers (e.g. Gruhn, Reverb table-scrape) stay intact.
Unknown-host reseller name is a title-cased domain (`shop.com` → "Shop"). The
shared mapper (`tryShopifyJsonImport`) extracts the handle from the last
`/products/<h>` path segment, fetches `https://<host>/products/<handle>.json`,
and maps:
`title→name`, `vendor→brand/maker`, `variants[0].price→price`,
`body_html→description`, `images[0].src→photo`, leading 18xx/19xx/20xx token in
the title → `specs.Year`, `Label:Value` tags (skip `Level N:` taxonomy nav) →
specs.

**Why:** the `.json` endpoint is stable structured data; HTML meta on these
themes is inconsistent. It also dodges the SPA problem and bot walls.

**How to apply / gotchas:**
- Shopify's `vendor` field is the brand BUT some shops leave a placeholder
  ("Tremoloa Maker" on Retrofret) or the store's own name. Treat a vendor that
  equals the shop name as no-brand; a placeholder resolves to a name-only maker
  slot (no domain) so the client skips auto-attach — never fabricate a domain.
- Reuse the reseller brand-resolution chain (`BRAND_ALIASES` → known maker host
  → `getVendorByNameInsensitive` → name-only). Gryphon's vendor is
  "CF Martin & Co." — needs a `BRAND_ALIASES` entry to map to martinguitar.com.
- `product.tags` comes back as a comma-separated **string** from `.json` (not an
  array) — split on "," and trim.
- Fail loud like Gruhn: 404 on sold/removed, 502 on unreachable; same-host fetch
  so `safeFetchWithUaFallback` SSRF guard is fine.
- Vintage Guitar magazine (vintageguitar.com) is WordPress/WooCommerce magazine,
  NOT a per-instrument storefront — nothing to import, deliberately skipped.
