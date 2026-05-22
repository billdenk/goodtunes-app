---
name: Instrument scrape — brand-identity Product nodes
description: Manufacturer sites embed an `@type: Product` for the company itself on every model page; the scraper must skip these or it imports the brand as a gear row with the logo as the photo.
---

When parsing JSON-LD on a manufacturer's model-detail page, do **not** trust the first `@type: Product` you find.

Some manufacturer sites (PRS Guitars confirmed; expect Fender / Gibson-direct / boutique sites to do the same) ship a brand-identity Product on every page describing the *company* — same name as `og:site_name`, `@id` anchored at the site root (`...#identity`, `#organization`), no `offers` / `sku` / `mpn`, image is the company logo.

**Why:** Without filtering these out, the importer reads the brand card, the gear gets named "Paul Reed Smith Guitars", and the photo is the PRS logo. Vendor never gets created because the flow exits at the gear-preview step looking malformed.

**How to apply:** In `server/routes.ts` the scrape endpoint uses `pickProduct(html, siteName)` which calls `collectProducts` then filters via `isBrandIdentityProduct`. Heuristic: skip a Product if its `@id` matches `#(identity|organization|brand|company)` **or** it has zero product signals (no offers/sku/mpn/additionalProperty) **and** its name equals `og:site_name`. Falling through to `og:title` + `og:image` is the correct behavior — model-detail pages reliably populate OG with the real model name and hero shot.
