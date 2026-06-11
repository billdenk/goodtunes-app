// Coverage for the Add-gear scrape route's Shopify-JSON handlers
// (Retrofret, Gryphon). The route imports these exact functions from
// ./shopifyGearMapping, so this locks in the field-mapping contract
// (title→name, junk-vendor handling, year extraction, tag→specs
// filtering, price formatting, brand→maker host resolution, fail-loud
// HTTP paths) against saved fixture payloads — no reference-copy drift.
//
//   npx tsx --test server/lib/shopifyGearMapping.test.ts
//
// Mirrors the node:test + tsx pattern in dropboxCreditsImport.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapShopifyProduct,
  resolveMakerHostFromBrand,
  makerSlotFromBrand,
  classifyShopifyApiResult,
  extractErnieBallProduct,
  type KnownHosts,
  type ShopifyProduct,
} from "./shopifyGearMapping";

// Minimal subset of routes.ts's KNOWN_HOSTS — enough to exercise the
// reseller-skip + maker name-match fallback in resolveMakerHostFromBrand.
const KNOWN_HOSTS: KnownHosts = {
  "retrofret.com": { name: "Retrofret Vintage Guitars", role: "reseller" },
  "gryphonstrings.com": { name: "Gryphon Stringed Instruments", role: "reseller" },
  "martinguitar.com": { name: "Martin Guitar", role: "maker" },
  "gibson.com": { name: "Gibson", role: "both" },
  "fender.com": { name: "Fender", role: "maker" },
};

// — Saved fixture payloads ————————————————————————————————————————————
// Trimmed to the fields the mapper reads, but faithful to the real
// `/products/<handle>.json` shape (tags as a comma-separated STRING,
// variants[].price as a string, body_html with markup, images[].src).

// Retrofret leaves a placeholder in `vendor` ("Tremoloa Maker") that
// must resolve to a name-only maker — never a fabricated domain.
const RETROFRET_FIXTURE: ShopifyProduct = {
  title: "1928 Tremoloa Harp by Kratt — Restored",
  vendor: "Tremoloa Maker",
  product_type: "Other Fretted",
  body_html:
    "<p>A rare 1920s Tremoloa.</p><p>Includes original case &amp; bow.</p>",
  tags: "Level 1: Instruments, Condition: Excellent, Decade: 1920s",
  variants: [{ price: "1850.00" }, { price: "1850.00" }],
  images: [
    { src: "http://cdn.shopify.com/s/files/1/tremoloa.jpg" },
    { src: "http://cdn.shopify.com/s/files/1/tremoloa-2.jpg" },
  ],
};

// Gryphon's vendor is "CF Martin & Co." — must map to martinguitar.com
// via BRAND_ALIASES so the maker slot carries a real domain.
const GRYPHON_FIXTURE: ShopifyProduct = {
  title: "1974 Martin D-35 Dreadnought",
  vendor: "CF Martin & Co.",
  product_type: "Instruments",
  body_html: "Brazilian rosewood back &amp; sides.<br>Plays beautifully.",
  tags: "Level 2: Acoustic, Body: Dreadnought",
  variants: [{ price: "4250.00" }],
  images: [{ src: "https://cdn.shopify.com/s/files/1/d35.jpg" }],
};

// ——— mapShopifyProduct: Retrofret ———————————————————————————————————

test("Retrofret — name is the trimmed title", () => {
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal(m.name, "1928 Tremoloa Harp by Kratt — Restored");
});

test("Retrofret — year extracted from the title", () => {
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal(m.year, "1928");
  assert.equal(m.specs.Year, "1928");
});

test("Retrofret — placeholder vendor is still surfaced as the brand string", () => {
  // The route only collapses a vendor that equals the SHOP name to null;
  // a placeholder maker name passes through and is later resolved to a
  // name-only maker slot (see makerSlotFromBrand test below).
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal(m.brand, "Tremoloa Maker");
});

test("Retrofret — `Level N:` taxonomy tags are skipped, real specs kept", () => {
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal("Level 1" in m.specs, false);
  assert.equal(m.specs.Condition, "Excellent");
  assert.equal(m.specs.Decade, "1920s");
});

test("Retrofret — price formatted from the first variant", () => {
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal(m.price, "USD 1850.00");
});

test("Retrofret — http image is upgraded to https", () => {
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal(m.rawImage, "https://cdn.shopify.com/s/files/1/tremoloa.jpg");
});

test("Retrofret — body_html is stripped to plain text + entities decoded", () => {
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal(
    m.description,
    "A rare 1920s Tremoloa.\n\nIncludes original case & bow.",
  );
});

test("Retrofret — generic product_type ('Other Fretted') kept as category", () => {
  const m = mapShopifyProduct(RETROFRET_FIXTURE, "Retrofret Vintage Guitars");
  assert.equal(m.category, "Other Fretted");
});

// ——— mapShopifyProduct: Gryphon —————————————————————————————————————

test("Gryphon — year + brand + price mapped", () => {
  const m = mapShopifyProduct(GRYPHON_FIXTURE, "Gryphon Stringed Instruments");
  assert.equal(m.name, "1974 Martin D-35 Dreadnought");
  assert.equal(m.year, "1974");
  assert.equal(m.brand, "CF Martin & Co.");
  assert.equal(m.price, "USD 4250.00");
});

test("Gryphon — non-descriptive product_type 'Instruments' → null category", () => {
  const m = mapShopifyProduct(GRYPHON_FIXTURE, "Gryphon Stringed Instruments");
  assert.equal(m.category, null);
});

// ——— Edge cases ——————————————————————————————————————————————————————

test("vendor equal to the shop name collapses to null brand", () => {
  const m = mapShopifyProduct(
    { title: "House Special", vendor: "Gryphon Stringed Instruments" },
    "Gryphon Stringed Instruments",
  );
  assert.equal(m.brand, null);
});

test("tags supplied as an array (not a string) still map", () => {
  const m = mapShopifyProduct(
    { title: "Test", tags: ["Color: Sunburst", "Level 3: Electric"] },
    "Shop",
  );
  assert.equal(m.specs.Color, "Sunburst");
  assert.equal("Level 3" in m.specs, false);
});

test("overlong tag values are dropped", () => {
  const m = mapShopifyProduct(
    { title: "Test", tags: `Note: ${"x".repeat(200)}` },
    "Shop",
  );
  assert.equal("Note" in m.specs, false);
});

test("missing price / images / tags yield nulls and an empty spec set", () => {
  const m = mapShopifyProduct({ title: "Bare Listing" }, "Shop");
  assert.equal(m.price, null);
  assert.equal(m.rawImage, null);
  assert.equal(m.year, null);
  assert.deepEqual(m.specs, {});
});

test("title with no year leaves Year out of specs", () => {
  const m = mapShopifyProduct({ title: "Vintage Strat", vendor: "" }, "Shop");
  assert.equal(m.year, null);
  assert.equal("Year" in m.specs, false);
});

// ——— Brand → maker host resolution ———————————————————————————————————

test("resolveMakerHostFromBrand maps 'CF Martin & Co.' → martinguitar.com via BRAND_ALIASES", () => {
  assert.equal(
    resolveMakerHostFromBrand("CF Martin & Co.", KNOWN_HOSTS),
    "martinguitar.com",
  );
});

test("resolveMakerHostFromBrand is case-insensitive", () => {
  assert.equal(
    resolveMakerHostFromBrand("cf martin & co.", KNOWN_HOSTS),
    "martinguitar.com",
  );
});

test("resolveMakerHostFromBrand falls back to a KNOWN_HOSTS name match", () => {
  assert.equal(resolveMakerHostFromBrand("Fender", KNOWN_HOSTS), "fender.com");
});

test("resolveMakerHostFromBrand skips reseller rows on name match", () => {
  // A reseller whose display name happens to be passed as a brand must
  // NOT resolve to its host (resellers aren't makers).
  assert.equal(
    resolveMakerHostFromBrand("Retrofret Vintage Guitars", KNOWN_HOSTS),
    null,
  );
});

test("resolveMakerHostFromBrand returns null for an unknown junk vendor", () => {
  assert.equal(resolveMakerHostFromBrand("Tremoloa Maker", KNOWN_HOSTS), null);
});

// ——— makerSlotFromBrand ——————————————————————————————————————————————

test("makerSlotFromBrand — junk vendor with no catalog match → name-only maker (null domain)", async () => {
  const slot = await makerSlotFromBrand("Tremoloa Maker", {
    knownHosts: KNOWN_HOSTS,
    lookupVendorByName: async () => undefined,
  });
  assert.equal(slot?.name, "Tremoloa Maker");
  assert.equal(slot?.domain, null);
  assert.equal(slot?.known, false);
});

test("makerSlotFromBrand — 'CF Martin & Co.' resolves to the martinguitar.com maker slot", async () => {
  const slot = await makerSlotFromBrand("CF Martin & Co.", {
    knownHosts: KNOWN_HOSTS,
    // Should never be consulted — the alias resolves first.
    lookupVendorByName: async () => {
      throw new Error("lookupVendorByName should not be called");
    },
  });
  assert.equal(slot?.domain, "martinguitar.com");
  assert.equal(slot?.name, "Martin Guitar");
  assert.equal(slot?.known, true);
});

test("makerSlotFromBrand — unknown brand with a catalog row uses that row's domain", async () => {
  const slot = await makerSlotFromBrand("Tremoloa Maker", {
    knownHosts: KNOWN_HOSTS,
    lookupVendorByName: async () => ({
      name: "Tremoloa Co.",
      domain: "tremoloa.example",
    }),
  });
  assert.equal(slot?.domain, "tremoloa.example");
  assert.equal(slot?.name, "Tremoloa Co.");
});

test("makerSlotFromBrand — empty brand string → null", async () => {
  const slot = await makerSlotFromBrand("   ", {
    knownHosts: KNOWN_HOSTS,
    lookupVendorByName: async () => undefined,
  });
  assert.equal(slot, null);
});

// ——— Fail-loud HTTP classification ———————————————————————————————————

test("classifyShopifyApiResult — 404 → sold/removed message", () => {
  const out = classifyShopifyApiResult(
    { status: 404, ok: false },
    null,
    "Retrofret Vintage Guitars",
  );
  assert.equal(out.kind, "error");
  if (out.kind === "error") {
    assert.equal(out.status, 404);
    assert.match(out.message, /sold or removed/);
  }
});

test("classifyShopifyApiResult — non-ok (502 upstream) → 502 fail-loud", () => {
  const out = classifyShopifyApiResult(
    { status: 502, ok: false },
    null,
    "Gryphon Stringed Instruments",
  );
  assert.equal(out.kind, "error");
  if (out.kind === "error") {
    assert.equal(out.status, 502);
    assert.match(out.message, /returned 502/);
  }
});

test("classifyShopifyApiResult — 200 but no product in body → 404 no-data", () => {
  const out = classifyShopifyApiResult({ status: 200, ok: true }, {}, "Shop");
  assert.equal(out.kind, "error");
  if (out.kind === "error") assert.equal(out.status, 404);
});

test("classifyShopifyApiResult — 200 with a product → product outcome", () => {
  const out = classifyShopifyApiResult(
    { status: 200, ok: true },
    { product: GRYPHON_FIXTURE },
    "Gryphon Stringed Instruments",
  );
  assert.equal(out.kind, "product");
  if (out.kind === "product") assert.equal(out.product.title, GRYPHON_FIXTURE.title);
});

// ——— Ernie Ball active-product extractor ——————————————————————————————————

// Minimal HTML fixture that mirrors Ernie Ball's comparison-page structure.
// The h1 reads "Compare" (not the product name), each string-set item has a
// data-sku attribute, and the active item has data-product-name. The gallery
// img src contains the SKU in the filename.
const EB_HTML = `<!DOCTYPE html>
<html>
<head><title>Electric Guitar Strings | Ernie Ball</title>
<meta property="og:site_name" content="Ernie Ball">
</head>
<body>
<h1>Compare</h1>
<ul class="string-compare-list">
  <li class="string-item" data-sku="P02223">
    <h2>Super Slinky Nickel Wound Electric Guitar Strings 9-42 Gauge</h2>
    <span class="product-price">$5.99</span>
    <p class="product-description">Super Slinky nickel wound strings.</p>
  </li>
  <li class="string-item string-item--active" data-sku="P02217" data-product-name="Zippy Slinky Nickel Wound Electric Guitar Strings 7-36 Gauge">
    <h2>Zippy Slinky Nickel Wound Electric Guitar Strings 7-36 Gauge</h2>
    <span class="product-price">$8.99</span>
    <p class="product-description">Zippy Slinky pure nickel wound strings with a plain steel 7 gauge 1st string.</p>
  </li>
</ul>
<div class="product-gallery">
  <img src="https://media.ernieball.com/catalog/product/P/0/P02217_w.jpg" alt="Zippy Slinky" width="800" height="800">
</div>
</body>
</html>`;

test("Ernie Ball — name from data-product-name (not the h1 'Compare')", () => {
  const out = extractErnieBallProduct(EB_HTML, "P02217");
  assert.ok(out, "should return a product");
  assert.equal(out!.name, "Zippy Slinky Nickel Wound Electric Guitar Strings 7-36 Gauge");
});

test("Ernie Ball — SKU is echoed back on the result", () => {
  const out = extractErnieBallProduct(EB_HTML, "P02217");
  assert.equal(out!.sku, "P02217");
});

test("Ernie Ball — price extracted from product-price element", () => {
  const out = extractErnieBallProduct(EB_HTML, "P02217");
  assert.equal(out!.price, "USD 8.99");
});

test("Ernie Ball — description extracted from product-description element", () => {
  const out = extractErnieBallProduct(EB_HTML, "P02217");
  assert.ok(out!.description?.includes("Zippy Slinky"));
});

test("Ernie Ball — image src contains the active SKU in the filename", () => {
  const out = extractErnieBallProduct(EB_HTML, "P02217");
  assert.ok(out!.rawImage?.includes("P02217"), `rawImage should contain SKU, got: ${out!.rawImage}`);
});

test("Ernie Ball — a different SKU on the same page resolves to that item", () => {
  const out = extractErnieBallProduct(EB_HTML, "P02223");
  assert.ok(out, "should return a product for the other SKU");
  assert.equal(out!.name, "Super Slinky Nickel Wound Electric Guitar Strings 9-42 Gauge");
  assert.equal(out!.price, "USD 5.99");
});

test("Ernie Ball — SKU lookup is case-insensitive", () => {
  const out = extractErnieBallProduct(EB_HTML, "p02217");
  assert.ok(out, "should find SKU regardless of case");
  assert.ok(out!.name.includes("Zippy Slinky"));
});

test("Ernie Ball — missing SKU (no hash) → null (fail loud)", () => {
  const out = extractErnieBallProduct(EB_HTML, "");
  assert.equal(out, null);
});

test("Ernie Ball — unrecognised SKU not in the page → null (fail loud)", () => {
  const out = extractErnieBallProduct(EB_HTML, "P99999");
  assert.equal(out, null, "unknown SKU must return null, not garbage");
});

test("Ernie Ball — brand-card h1 'Compare' is never used as the product name", () => {
  // Any result must NOT have name === "Compare"
  const out = extractErnieBallProduct(EB_HTML, "P02217");
  assert.notEqual(out!.name.trim().toLowerCase(), "compare");
});

// ——— Pickworld (maker-owned Shopify store) ————————————————————————————————

// Pickworld's Shopify vendor field equals the shop name; mapShopifyProduct
// must return brand=null in this case. The route-level maker-owned fallback
// then sets the maker to the host slot. We test the mapping half here.
const PICKWORLD_FIXTURE: ShopifyProduct = {
  title: "PickWorld Branded Picks - Delrin\u00ae - 12pc Pick Pack",
  vendor: "PickWorld",
  product_type: "Picks",
  body_html: "<p>12-pack of Delrin picks. Great for any style of playing.</p>",
  tags: "Material: Delrin, Pack Size: 12",
  variants: [{ price: "4.99" }],
  images: [{ src: "https://cdn.shopify.com/s/files/1/pickworld/delrin.jpg" }],
};

const KNOWN_HOSTS_WITH_PICKWORLD: KnownHosts = {
  "pickworld.com": { name: "PickWorld", role: "maker" },
  "martinguitar.com": { name: "Martin Guitar", role: "maker" },
  "fender.com": { name: "Fender", role: "maker" },
};

test("Pickworld — vendor equal to shop name collapses brand to null", () => {
  const m = mapShopifyProduct(PICKWORLD_FIXTURE, "PickWorld");
  assert.equal(m.brand, null, "brand must be null when vendor === shop name");
});

test("Pickworld — name, price, and description map correctly", () => {
  const m = mapShopifyProduct(PICKWORLD_FIXTURE, "PickWorld");
  assert.equal(m.name, "PickWorld Branded Picks - Delrin\u00ae - 12pc Pick Pack");
  assert.equal(m.price, "USD 4.99");
  assert.ok(m.description?.includes("Delrin picks"));
});

test("Pickworld — product_type 'Picks' becomes the category", () => {
  const m = mapShopifyProduct(PICKWORLD_FIXTURE, "PickWorld");
  assert.equal(m.category, "Picks");
});

test("Pickworld — specs extracted from Label:Value tags", () => {
  const m = mapShopifyProduct(PICKWORLD_FIXTURE, "PickWorld");
  assert.equal(m.specs.Material, "Delrin");
  assert.equal(m.specs["Pack Size"], "12");
});

test("Pickworld — resolveMakerHostFromBrand('PickWorld') resolves to pickworld.com via name match", () => {
  assert.equal(
    resolveMakerHostFromBrand("PickWorld", KNOWN_HOSTS_WITH_PICKWORLD),
    "pickworld.com",
  );
});
