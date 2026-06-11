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
  normalizePicksCategory,
  extractMicrodataPrice,
  extractElixirProduct,
  parseGaugeFromName,
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
  "jimdunlop.com": { name: "Dunlop", role: "maker" },
  "dandreausa.com": { name: "D'Andrea USA", role: "maker" },
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

// ——— Task #1944: Dunlop / Fender / D'Andrea picks & accessories ————————————

// D'Andrea's Shopify store: vendor is "D'Andrea USA" (the same as its
// KNOWN_HOSTS name), so the brand collapses to null and the route-level
// maker-owned fallback attaches dandreausa.com as the maker. product_type
// is empty across their whole catalog, so picks don't auto-categorize.
const DANDREA_FIXTURE: ShopifyProduct = {
  title: "Pro Plec 351 Shape - 1.5mm (12 pack)",
  vendor: "D'Andrea USA",
  product_type: "",
  body_html: "<p>The original celluloid-style tortoise shell pick.</p>",
  tags: "",
  variants: [{ price: "9.95" }],
  images: [{ src: "https://cdn.shopify.com/s/files/1/dandrea/proplec.jpg" }],
};

test("D'Andrea — vendor equal to its KNOWN_HOSTS name collapses brand to null", () => {
  const m = mapShopifyProduct(DANDREA_FIXTURE, "D'Andrea USA");
  assert.equal(m.brand, null);
});

test("D'Andrea — empty product_type yields a null category (no auto-pick)", () => {
  const m = mapShopifyProduct(DANDREA_FIXTURE, "D'Andrea USA");
  assert.equal(m.category, null);
});

test("resolveMakerHostFromBrand maps Dunlop aliases → jimdunlop.com", () => {
  assert.equal(resolveMakerHostFromBrand("Dunlop", KNOWN_HOSTS), "jimdunlop.com");
  assert.equal(resolveMakerHostFromBrand("Jim Dunlop", KNOWN_HOSTS), "jimdunlop.com");
  assert.equal(resolveMakerHostFromBrand("JIM DUNLOP", KNOWN_HOSTS), "jimdunlop.com");
});

test("resolveMakerHostFromBrand maps D'Andrea aliases → dandreausa.com", () => {
  assert.equal(resolveMakerHostFromBrand("D'Andrea", KNOWN_HOSTS), "dandreausa.com");
  assert.equal(resolveMakerHostFromBrand("D'Andrea USA", KNOWN_HOSTS), "dandreausa.com");
  assert.equal(resolveMakerHostFromBrand("dandrea", KNOWN_HOSTS), "dandreausa.com");
});

// ——— normalizePicksCategory —————————————————————————————————————————————

test("normalizePicksCategory collapses any picks signal to 'Picks'", () => {
  assert.equal(normalizePicksCategory("Picks"), "Picks");
  assert.equal(normalizePicksCategory("Guitar Picks"), "Picks");
  assert.equal(normalizePicksCategory("Pick Accessories"), "Picks");
});

test("normalizePicksCategory leaves non-pick categories untouched (incl. Pickups)", () => {
  assert.equal(normalizePicksCategory("Pickups"), "Pickups");
  assert.equal(normalizePicksCategory("Pickguards"), "Pickguards");
  assert.equal(normalizePicksCategory("Straps"), "Straps");
  assert.equal(normalizePicksCategory(null), null);
});

test("mapShopifyProduct normalizes a 'Guitar Picks' product_type to 'Picks'", () => {
  const m = mapShopifyProduct(
    { title: "Fender 351 Classic Celluloid Picks", vendor: "Fender", product_type: "Guitar Picks" },
    "Fender",
  );
  assert.equal(m.category, "Picks");
});

// ——— extractMicrodataPrice (Dunlop / BigCommerce price fallback) ——————————

test("extractMicrodataPrice reads schema.org microdata price (Dunlop case)", () => {
  const html = `<meta itemprop="price" content="5.76"><meta itemprop="availability" content="InStock">`;
  assert.equal(extractMicrodataPrice(html), "USD 5.76");
});

test("extractMicrodataPrice honors priceCurrency and content-first attr order", () => {
  const html = `<meta content="12.50" itemprop="price"><meta itemprop="priceCurrency" content="GBP">`;
  assert.equal(extractMicrodataPrice(html), "GBP 12.50");
});

test("extractMicrodataPrice returns null when no microdata price is present", () => {
  assert.equal(extractMicrodataPrice(`<meta property="og:title" content="A Pick">`), null);
});

// ——— parseGaugeFromName ———————————————————————————————————————————————————

test("parseGaugeFromName — pulls a standard gauge from a string title", () => {
  assert.equal(
    parseGaugeFromName("XL Nickel Wound Electric Guitar Strings, Regular Light, 10-46"),
    "10-46",
  );
});

test("parseGaugeFromName — handles a 3-digit bass low end", () => {
  assert.equal(parseGaugeFromName("EXL170 Nickel Wound Bass, Light, 45-100"), "45-100");
});

test("parseGaugeFromName — handles a half-step gauge (10.5-48)", () => {
  assert.equal(parseGaugeFromName("Balanced Tension 10.5-48"), "10.5-48");
});

test("parseGaugeFromName — model numbers like 'D-35' do NOT match", () => {
  assert.equal(parseGaugeFromName("Martin D-35 Acoustic"), null);
});

test("parseGaugeFromName — a year like 1974 does NOT match", () => {
  assert.equal(parseGaugeFromName("1974 Stratocaster"), null);
});

test("parseGaugeFromName — '12pc' pick-pack count does NOT match", () => {
  assert.equal(parseGaugeFromName("Delrin 12pc Pick Pack"), null);
});

// ——— D'Addario (maker-owned Shopify store) ————————————————————————————————
//
// D'Addario's Shopify vendor field equals the shop name (so brand → null and
// the route's maker-owned fallback stamps daddario.com), and product_type
// echoes the brand ("D'Addario") rather than a real category. mapShopifyProduct
// must drop that junk category, infer "Strings" from the title, lift the SKU
// off the first variant, and parse the gauge from the title.
const DADDARIO_FIXTURE: ShopifyProduct = {
  title: "EXL110 Nickel Wound Electric Guitar Strings, Regular Light, 10-46",
  vendor: "D'Addario",
  product_type: "D'Addario",
  body_html: "<p>The best-selling electric guitar strings in the world.</p>",
  tags: "Gauge Group: Light, Instrument: Electric Guitar",
  variants: [{ price: "8.49", sku: "EXL110" }],
  images: [
    { src: "https://cdn.shopify.com/s/files/1/daddario/exl110-front.jpg" },
    { src: "https://cdn.shopify.com/s/files/1/daddario/exl110-back.jpg" },
  ],
};

test("D'Addario — vendor equal to shop name collapses brand to null", () => {
  const m = mapShopifyProduct(DADDARIO_FIXTURE, "D'Addario");
  assert.equal(m.brand, null, "brand must be null when vendor === shop name");
});

test("D'Addario — product_type echoing the vendor is dropped and category inferred as Strings", () => {
  const m = mapShopifyProduct(DADDARIO_FIXTURE, "D'Addario");
  assert.equal(m.category, "Strings");
});

test("D'Addario — name, price, and description map correctly", () => {
  const m = mapShopifyProduct(DADDARIO_FIXTURE, "D'Addario");
  assert.equal(
    m.name,
    "EXL110 Nickel Wound Electric Guitar Strings, Regular Light, 10-46",
  );
  assert.equal(m.price, "USD 8.49");
  assert.ok(m.description?.includes("best-selling electric guitar strings"));
});

test("D'Addario — SKU lifted from the first variant", () => {
  const m = mapShopifyProduct(DADDARIO_FIXTURE, "D'Addario");
  assert.equal(m.specs.SKU, "EXL110");
});

test("D'Addario — gauge parsed from the title", () => {
  const m = mapShopifyProduct(DADDARIO_FIXTURE, "D'Addario");
  assert.equal(m.specs.Gauge, "10-46");
});

test("D'Addario — first image surfaced as the raw image", () => {
  const m = mapShopifyProduct(DADDARIO_FIXTURE, "D'Addario");
  assert.equal(
    m.rawImage,
    "https://cdn.shopify.com/s/files/1/daddario/exl110-front.jpg",
  );
});

// A maker product that is NOT strings (e.g. a pedal accessory) keeps a real
// product_type and is never relabeled "Strings".
const DADDARIO_NON_STRING: ShopifyProduct = {
  title: "Auto-Lock Guitar Strap, Black",
  vendor: "D'Addario",
  product_type: "Straps",
  variants: [{ price: "29.99", sku: "50BAL06" }],
  images: [{ src: "https://cdn.shopify.com/s/files/1/daddario/strap.jpg" }],
};

test("D'Addario — a real product_type (Straps) is preserved, not forced to Strings", () => {
  const m = mapShopifyProduct(DADDARIO_NON_STRING, "D'Addario");
  assert.equal(m.category, "Straps");
});

test("D'Addario — a non-string title yields no spurious Gauge spec", () => {
  const m = mapShopifyProduct(DADDARIO_NON_STRING, "D'Addario");
  assert.equal(m.specs.Gauge, undefined);
});

// ——— Elixir (BigCommerce, JSON-LD) ————————————————————————————————————————
//
// Elixir runs on BigCommerce: each product page ships a JSON-LD Product node
// plus OG tags. The JSON-LD `description` is a URL-encoded HTML blob, so the
// extractor must prefer the clean og:description (and decode its double-encoded
// &amp;#174; → ®). Category is always "Strings".
const ELIXIR_HTML = `<!DOCTYPE html>
<html><head>
<meta property="og:title" content="Electric Guitar Strings, NANOWEB Coating, Light" />
<meta property="og:image" content="//cdn11.bigcommerce.com/elixir/16052.jpg" />
<meta property="og:description" content="Elixir&amp;#174; Strings Light gauge, with NANOWEB&amp;#174; Coating for a smooth feel." />
<meta property="product:price:amount" content="16.99" />
<meta property="product:price:currency" content="USD" />
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Electric Guitar Strings, NANOWEB Coating, Light 10-46",
  "sku": "16052",
  "image": "//cdn11.bigcommerce.com/elixir/16052.jpg",
  "description": "Elixir%C2%AE%20Strings%20with%20NANOWEB%C2%AE%20Coating",
  "offers": { "@type": "Offer", "price": "16.99", "priceCurrency": "USD" }
}
</script>
</head><body><h1>Elixir Strings</h1></body></html>`;

test("Elixir — name comes from the JSON-LD Product node", () => {
  const out = extractElixirProduct(ELIXIR_HTML);
  assert.ok(out);
  assert.equal(out!.name, "Electric Guitar Strings, NANOWEB Coating, Light 10-46");
});

test("Elixir — price formatted from JSON-LD offers", () => {
  const out = extractElixirProduct(ELIXIR_HTML);
  assert.equal(out!.price, "USD 16.99");
});

test("Elixir — protocol-relative image is upgraded to https", () => {
  const out = extractElixirProduct(ELIXIR_HTML);
  assert.equal(out!.rawImage, "https://cdn11.bigcommerce.com/elixir/16052.jpg");
});

test("Elixir — prefers the clean og:description and decodes &amp;#174; → ®", () => {
  const out = extractElixirProduct(ELIXIR_HTML);
  assert.ok(out!.description?.includes("Elixir® Strings"));
  assert.ok(
    !out!.description?.includes("%20"),
    "must not surface the URL-encoded JSON-LD description",
  );
});

test("Elixir — SKU and gauge lifted from the JSON-LD node / name", () => {
  const out = extractElixirProduct(ELIXIR_HTML);
  assert.equal(out!.sku, "16052");
  assert.equal(out!.gauge, "10-46");
});

test("Elixir — category is always Strings", () => {
  const out = extractElixirProduct(ELIXIR_HTML);
  assert.equal(out!.category, "Strings");
});

test("Elixir — falls back to og:title + og:image when JSON-LD is absent", () => {
  const html = `<html><head>
    <meta property="og:title" content="Acoustic Phosphor Bronze, Light 12-53" />
    <meta property="og:image" content="https://cdn11.bigcommerce.com/elixir/16027.jpg" />
    <meta property="product:price:amount" content="19.99" />
  </head><body></body></html>`;
  const out = extractElixirProduct(html);
  assert.ok(out);
  assert.equal(out!.name, "Acoustic Phosphor Bronze, Light 12-53");
  assert.equal(out!.price, "USD 19.99");
  assert.equal(out!.gauge, "12-53");
  assert.equal(out!.rawImage, "https://cdn11.bigcommerce.com/elixir/16027.jpg");
});

test("Elixir — no name anywhere → null (fail loud)", () => {
  const out = extractElixirProduct("<html><head></head><body></body></html>");
  assert.equal(out, null);
});
