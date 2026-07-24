// Task #2847 — Phase 5 GraphQL migration: inventory and locations.
//
// The `GET locations.json` + `POST inventory_levels/set.json` REST calls
// in the album push flow moved to Admin GraphQL. Callers keep speaking
// numeric REST ids; the Phase 5 helpers translate at the boundary.
// Hermetic (stubbed globalThis.fetch — no network):
//
//   (a) gid builders for Location / InventoryItem.
//   (b) fetchLocations: sends the locations query, maps nodes to
//       REST-style { id: numeric, name } rows.
//   (c) setInventoryAvailable: sends inventorySetQuantities with
//       name "available", reason "correction", ignoreCompareQuantity,
//       and gid-wrapped item/location ids; resolves on clean success,
//       throws on userErrors.
//
//   npx tsx --test server/shopifyGraphqlPhase5.test.ts
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { __internal } from "./shopify";
import { pool } from "./db";

const { locationGid, inventoryItemGid, fetchLocations, setInventoryAvailable } = __internal as any;

after(async () => {
  await pool.end().catch(() => {});
});

const STORE = { id: "phase5-test-store", shopDomain: "phase5-test.myshopify.com", accessToken: "" } as any;

// Stub fetch for the duration of `fn`. `respond` receives the parsed
// GraphQL body ({ query, variables }) and returns the `data` payload.
async function withGraphqlStub(
  respond: (body: { query: string; variables: any }) => any,
  fn: () => Promise<void>,
) {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(init?.body ?? "{}");
      return new Response(JSON.stringify({ data: respond(body) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("(a) gid builders", () => {
  assert.equal(locationGid(77), "gid://shopify/Location/77");
  assert.equal(locationGid("77"), "gid://shopify/Location/77");
  assert.equal(inventoryItemGid("123456"), "gid://shopify/InventoryItem/123456");
});

test("(b) fetchLocations maps nodes to numeric REST-shaped rows", async () => {
  const seen: any[] = [];
  await withGraphqlStub(
    (body) => {
      seen.push(body);
      return {
        locations: {
          nodes: [
            { id: "gid://shopify/Location/111", name: "Warehouse" },
            { id: "gid://shopify/Location/222", name: "Retail" },
          ],
        },
      };
    },
    async () => {
      const locs = await fetchLocations(STORE);
      assert.deepEqual(locs, [
        { id: 111, name: "Warehouse" },
        { id: 222, name: "Retail" },
      ]);
    },
  );
  assert.match(seen[0].query, /locations\(first: 10\)/);

  // Empty / null payload → empty list, no throw.
  await withGraphqlStub(
    () => ({ locations: null }),
    async () => {
      assert.deepEqual(await fetchLocations(STORE), []);
    },
  );
});

test("(c) setInventoryAvailable sends the right input and resolves on success", async () => {
  const seen: any[] = [];
  await withGraphqlStub(
    (body) => {
      seen.push(body);
      return {
        inventorySetQuantities: {
          inventoryAdjustmentGroup: { id: "gid://shopify/InventoryAdjustmentGroup/1" },
          userErrors: [],
        },
      };
    },
    async () => {
      await setInventoryAvailable(STORE, "987654", 111, 25);
    },
  );
  assert.match(seen[0].query, /inventorySetQuantities\(input: \$input\)/);
  assert.deepEqual(seen[0].variables.input, {
    name: "available",
    reason: "correction",
    ignoreCompareQuantity: true,
    quantities: [
      {
        inventoryItemId: "gid://shopify/InventoryItem/987654",
        locationId: "gid://shopify/Location/111",
        quantity: 25,
      },
    ],
  });
});

test("(c) setInventoryAvailable throws on userErrors", async () => {
  await withGraphqlStub(
    () => ({
      inventorySetQuantities: {
        inventoryAdjustmentGroup: null,
        userErrors: [{ field: ["input"], message: "Inventory item is not stocked at location" }],
      },
    }),
    async () => {
      await assert.rejects(
        () => setInventoryAvailable(STORE, "987654", 111, 25),
        /not stocked at location/,
      );
    },
  );
});
