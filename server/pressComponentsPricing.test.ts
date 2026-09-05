// Task #3047 — per-size component pricing: seeding, legacy single-price
// migration, and re-seed merge behavior (pure functions, no DB).
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedPricingFromVinyl, mergePricingRows, rowHasAnyPrice } from "./pressComponents";
import type { PricingRow, VinylComponentConfig } from "@shared/pressComponents";
import { MRP_CODA_SOURCE } from "@shared/mrpCodaPricing";

const vinyl: VinylComponentConfig = {
  weights: [{ id: "140", label: "140g", note: "Standard" }],
  quantities: [{ id: "1", label: "1 LP", note: "Single" }],
  sizeOptions: [
    { id: "7", label: '7"', note: "Single" },
    { id: "10", label: '10"', note: "EP" },
    { id: "12", label: '12"', note: "LP · Standard" },
  ],
  categories: [
    {
      id: "black",
      kind: "black",
      name: "Black",
      sizes: ['7"', '10"', '12"'],
      swatches: [{ id: "black-classic", name: "Classic Black", kind: "black", base: "#111114", sizes: [] }],
    },
    {
      id: "splatter",
      kind: "splatter",
      name: "Splatter",
      sizes: ['10"', '12"'],
      swatches: [{ id: "splatter-cosmic", name: "Cosmic", kind: "splatter", base: "#3A2E6E", sizes: ['12"'] }],
    },
  ],
} as VinylComponentConfig;

test("seedPricingFromVinyl: rows carry the type's sizes; colors inherit when unset; no size caption in detail", () => {
  const { rows } = seedPricingFromVinyl(vinyl);
  const type = rows.find((r) => r.key === "type:black")!;
  assert.deepEqual(type.sizes, ['7"', '10"', '12"']);
  assert.equal(type.detail, ""); // old '7" · 12"' caption is gone
  assert.deepEqual(type.pricesBySize, {});
  // color with empty sizes inherits the category's sizes
  const inherit = rows.find((r) => r.key === "color:black:black-classic")!;
  assert.deepEqual(inherit.sizes, ['7"', '10"', '12"']);
  // color with its own sizes keeps them
  const own = rows.find((r) => r.key === "color:splatter:splatter-cosmic")!;
  assert.deepEqual(own.sizes, ['12"']);
});

test("merge: legacy single priceCents migrates into every size the row is pressed in, legacy field nulls", () => {
  const seeded = seedPricingFromVinyl(vinyl).rows;
  const existing: PricingRow[] = [
    { key: "type:splatter", label: "Splatter", detail: '10" · 12"', kind: "type", sizes: [], priceCents: 250, pricesBySize: {} },
  ];
  const merged = mergePricingRows(existing, seeded);
  const row = merged.find((r) => r.key === "type:splatter")!;
  assert.equal(row.priceCents, null);
  assert.deepEqual(row.pricesBySize, { '10"': 250, '12"': 250 });
  // a 7" price never appears for a type not pressed in 7"
  assert.equal(row.pricesBySize['7"'], undefined);
});

test("merge: legacy price on an orphan with no sizes fans out to all three sizes; unpriced orphans drop", () => {
  const seeded = seedPricingFromVinyl(vinyl).rows;
  const existing: PricingRow[] = [
    { key: "type:gone", label: "Retired", detail: "", kind: "type", sizes: [], priceCents: 99, pricesBySize: {} },
    { key: "type:gone-unpriced", label: "Retired 2", detail: "", kind: "type", sizes: [], priceCents: null, pricesBySize: {} },
  ];
  const merged = mergePricingRows(existing, seeded);
  const kept = merged.find((r) => r.key === "type:gone")!;
  assert.deepEqual(kept.pricesBySize, { '7"': 99, '10"': 99, '12"': 99 });
  assert.equal(merged.find((r) => r.key === "type:gone-unpriced"), undefined);
});

test("merge: re-seed keeps entered per-size prices and never resurrects the legacy field", () => {
  const seeded = seedPricingFromVinyl(vinyl).rows;
  const existing: PricingRow[] = [
    { key: "type:black", label: "Black", detail: "", kind: "type", sizes: ['7"', '10"', '12"'], priceCents: null, pricesBySize: { '7"': 100, '12"': 300 } },
  ];
  const merged = mergePricingRows(existing, seeded);
  const row = merged.find((r) => r.key === "type:black")!;
  assert.deepEqual(row.pricesBySize, { '7"': 100, '12"': 300 });
  assert.equal(row.priceCents, null);
});

test("merge: per-size prices win over a lingering legacy value (no double-migration)", () => {
  const seeded = seedPricingFromVinyl(vinyl).rows;
  const existing: PricingRow[] = [
    { key: "type:black", label: "Black", detail: "", kind: "type", sizes: ['7"', '10"', '12"'], priceCents: 999, pricesBySize: { '12"': 300 } },
  ];
  const merged = mergePricingRows(existing, seeded);
  const row = merged.find((r) => r.key === "type:black")!;
  // legacy value is NOT copied when any per-size price already exists
  assert.deepEqual(row.pricesBySize, { '12"': 300 });
});

test("merge: a size removed from a type keeps the remaining sizes' prices intact", () => {
  const seeded = seedPricingFromVinyl({
    ...vinyl,
    categories: [{ ...vinyl.categories[0], sizes: ['12"'] }],
  } as VinylComponentConfig).rows;
  const existing: PricingRow[] = [
    { key: "type:black", label: "Black", detail: "", kind: "type", sizes: ['7"', '10"', '12"'], priceCents: null, pricesBySize: { '7"': 100, '12"': 300 } },
  ];
  const merged = mergePricingRows(existing, seeded);
  const row = merged.find((r) => r.key === "type:black")!;
  assert.deepEqual(row.sizes, ['12"']);
  assert.equal(row.pricesBySize['12"'], 300);
});

test("rowHasAnyPrice: per-size or legacy value both count; empty is unpriced", () => {
  const base: PricingRow = { key: "k", label: "x", detail: "", kind: "type", sizes: [], priceCents: null, pricesBySize: {} };
  assert.equal(rowHasAnyPrice(base), false);
  assert.equal(rowHasAnyPrice({ ...base, priceCents: 1 }), true);
  assert.equal(rowHasAnyPrice({ ...base, pricesBySize: { '7"': 1 } }), true);
  assert.equal(rowHasAnyPrice({ ...base, pricesBySize: { '7"': null } }), false);
});

test("rowHasAnyPrice: a quantity ladder counts as priced (standard and heavyweight)", () => {
  const base: PricingRow = { key: "k", label: "x", detail: "", kind: "type", sizes: [], priceCents: null, pricesBySize: {} };
  assert.equal(rowHasAnyPrice({ ...base, rungsBySize: { '12"': [{ qty: 500, unitCents: 275 }] } }), true);
  assert.equal(rowHasAnyPrice({ ...base, rungsBySizeHeavy: { '12"': [{ qty: 500, unitCents: 375 }] } }), true);
  assert.equal(rowHasAnyPrice({ ...base, rungsBySize: { '12"': [] } }), false);
});

test("merge: re-sync carries seeded quantity ladders and pricingSource through (matched and orphan rows)", () => {
  const seeded = seedPricingFromVinyl(vinyl).rows;
  const ladder = [{ qty: 500, unitCents: 275 }, { qty: 1000, unitCents: 250 }];
  const existing: PricingRow[] = [
    { key: "type:black", label: "Black", detail: "", kind: "type", sizes: ['7"', '10"', '12"'], priceCents: null, pricesBySize: {}, rungsBySize: { '12"': ladder }, pricingSource: "pmp-pricing-2026", codaCodesBySize: { '12"': "4011-0001" }, codaSource: MRP_CODA_SOURCE },
    // orphan (not in the re-seeded vinyl) with only a ladder must survive too
    { key: "type:gone", label: "Retired", detail: "", kind: "type", sizes: ['12"'], priceCents: null, pricesBySize: {}, rungsBySize: { '12"': ladder } },
  ];
  const merged = mergePricingRows(existing, seeded);
  const black = merged.find((r) => r.key === "type:black")!;
  assert.deepEqual(black.rungsBySize, { '12"': ladder });
  assert.equal(black.pricingSource, "pmp-pricing-2026");
  assert.deepEqual(black.codaCodesBySize, { '12"': "4011-0001" });
  assert.equal(black.codaSource, MRP_CODA_SOURCE);
  const gone = merged.find((r) => r.key === "type:gone")!;
  assert.deepEqual(gone.rungsBySize, { '12"': ladder });
});
