// Task #2845 — Phase 3 GraphQL migration: products and variants.
//
// The product/variant REST endpoints in server/shopify.ts moved to Admin
// GraphQL. Every caller in that file still speaks the REST payload shape
// (numeric ids, body_html, comma-joined tags, option1, inventory_item_id),
// bridged by gqlProductToRest(). These tests pin that bridge:
//
//   (a) gqlProductToRest maps a GraphQL product node to the exact legacy
//       REST shape (ids off legacyResourceId, tags joined ", ", option1
//       from selectedOptions, inventory_item_id numeric).
//   (b) fetchProductByLegacyId returns null for a missing product
//       (GraphQL `product: null`, where REST 404'd) and the REST shape
//       otherwise — hermetic via a stubbed globalThis.fetch.
//   (c) diffPushSnapshot — written against the REST shape — reports no
//       drift for a matching GraphQL-mapped product and catches real
//       label-side edits, i.e. the conflict-check contract survived the
//       migration.
//
//   npx tsx --test server/shopifyGraphqlProducts.test.ts
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { __internal } from "./shopify";
import { pool } from "./db";

const { gqlProductToRest, fetchProductByLegacyId, productGid, variantGid, diffPushSnapshot } = __internal as any;

after(async () => {
  await pool.end().catch(() => {});
});

const NODE = {
  legacyResourceId: "9001",
  title: "Test Album",
  descriptionHtml: "<p>Body</p>",
  vendor: "Test Label",
  tags: ["goodtunes", "vinyl"],
  productType: "Music",
  featuredMedia: { preview: { image: { url: "https://cdn.example/art.png" } } },
  variants: {
    nodes: [
      {
        legacyResourceId: "111",
        title: "GoodTunes Edition",
        price: "25.00",
        sku: "gt-abcd1234-edition",
        inventoryQuantity: 40,
        selectedOptions: [{ name: "Edition", value: "GoodTunes Edition" }],
        inventoryItem: { legacyResourceId: "555" },
      },
      {
        legacyResourceId: "222",
        title: "+ Signed printed GoodDeed",
        price: "10.00",
        sku: "gt-abcd1234-cert",
        inventoryQuantity: 10,
        selectedOptions: [{ name: "Edition", value: "+ Signed printed GoodDeed" }],
        inventoryItem: { legacyResourceId: "556" },
      },
    ],
  },
};

test("gid builders produce Admin API global ids", () => {
  assert.equal(productGid("9001"), "gid://shopify/Product/9001");
  assert.equal(variantGid(222), "gid://shopify/ProductVariant/222");
});

test("(a) gqlProductToRest maps the node to the legacy REST shape", () => {
  const p = gqlProductToRest(NODE);
  assert.equal(p.id, "9001");
  assert.equal(p.title, "Test Album");
  assert.equal(p.body_html, "<p>Body</p>");
  assert.equal(p.vendor, "Test Label");
  assert.equal(p.tags, "goodtunes, vinyl"); // REST comma-space join
  assert.equal(p.product_type, "Music");
  assert.equal(p.image?.src, "https://cdn.example/art.png");
  assert.equal(p.images.length, 1);
  assert.equal(p.variants.length, 2);
  const [ed, cert] = p.variants;
  assert.equal(ed.id, "111");
  assert.equal(ed.option1, "GoodTunes Edition");
  assert.equal(ed.price, "25.00");
  assert.equal(ed.inventory_quantity, 40);
  assert.equal(ed.inventory_item_id, 555); // numeric like REST
  assert.equal(cert.option1, "+ Signed printed GoodDeed");
  assert.equal(cert.sku, "gt-abcd1234-cert");
});

test("(a) null-ish fields degrade to REST-style empties", () => {
  const p = gqlProductToRest({
    ...NODE,
    descriptionHtml: null,
    vendor: null,
    tags: [],
    productType: null,
    featuredMedia: null,
    variants: { nodes: [{ ...NODE.variants.nodes[0], sku: null, inventoryQuantity: null, selectedOptions: [], inventoryItem: null }] },
  });
  assert.equal(p.body_html, "");
  assert.equal(p.vendor, "");
  assert.equal(p.tags, "");
  assert.equal(p.image, null);
  assert.deepEqual(p.images, []);
  const v = p.variants[0];
  assert.equal(v.sku, "");
  assert.equal(v.inventory_quantity, 0);
  assert.equal(v.option1, "GoodTunes Edition"); // falls back to variant title
  assert.equal(v.inventory_item_id, null);
});

test("(b) fetchProductByLegacyId: null for missing, REST shape for found", async () => {
  const realFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: any }> = [];
  try {
    globalThis.fetch = (async (url: any, init?: any) => {
      const body = JSON.parse(init?.body ?? "{}");
      calls.push({ url: String(url), body });
      const found = body.variables?.id === "gid://shopify/Product/9001";
      return new Response(JSON.stringify({ data: { product: found ? NODE : null } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    const store = { id: "t-store", shopDomain: "t.myshopify.com", accessToken: "tok" };
    const found = await fetchProductByLegacyId(store, "9001");
    assert.equal(found?.id, "9001");
    assert.equal(found?.variants.length, 2);

    const missing = await fetchProductByLegacyId(store, "404404");
    assert.equal(missing, null); // GraphQL null ↔ old REST 404

    // Both calls hit the GraphQL endpoint, not a REST products/*.json path.
    for (const c of calls) {
      assert.match(c.url, /\/admin\/api\/\d{4}-\d{2}\/graphql\.json$/);
      assert.match(c.body.query, /product\(id: \$id\)/);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("(c) diffPushSnapshot: GraphQL-mapped product with no label edits → no conflicts", () => {
  const live = gqlProductToRest(NODE);
  const snap = {
    title: "Test Album",
    bodyHtml: "<p>Body</p>",
    vendor: "Test Label",
    tags: "goodtunes, vinyl",
    edition: { priceCents: 2500, inventory: 40 },
    cert: { priceCents: 1000, inventory: 10 },
  };
  const conflicts = diffPushSnapshot(snap, live, { editionVariantId: "111", certVariantId: "222" });
  assert.deepEqual(conflicts, []);
});

test("(c) diffPushSnapshot: label-side edits on the GraphQL-mapped product are detected", () => {
  const edited = {
    ...NODE,
    title: "Renamed On Shopify",
    variants: {
      nodes: [
        { ...NODE.variants.nodes[0], price: "30.00" },
        NODE.variants.nodes[1],
      ],
    },
  };
  const live = gqlProductToRest(edited);
  const snap = {
    title: "Test Album",
    bodyHtml: "<p>Body</p>",
    vendor: "Test Label",
    tags: "goodtunes, vinyl",
    edition: { priceCents: 2500, inventory: 40 },
    cert: { priceCents: 1000, inventory: 10 },
  };
  const conflicts = diffPushSnapshot(snap, live, { editionVariantId: "111", certVariantId: "222" });
  assert.ok(conflicts.includes("Title"));
  assert.ok(conflicts.includes("Edition price"));
  assert.ok(!conflicts.includes("Signed-cert price"));
});

test("(c) diffPushSnapshot: cert variant deleted on Shopify is reported", () => {
  const noCert = { ...NODE, variants: { nodes: [NODE.variants.nodes[0]] } };
  const live = gqlProductToRest(noCert);
  const snap = {
    title: "Test Album",
    bodyHtml: "<p>Body</p>",
    vendor: "Test Label",
    tags: "goodtunes, vinyl",
    edition: { priceCents: 2500, inventory: 40 },
    cert: { priceCents: 1000, inventory: 10 },
  };
  const conflicts = diffPushSnapshot(snap, live, { editionVariantId: "111", certVariantId: "222" });
  assert.ok(conflicts.includes("Signed-cert variant (removed on Shopify)"));
});
