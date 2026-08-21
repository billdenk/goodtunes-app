// Task #3227 — unit tests for the component→price resolution logic.
// Pure functions only (no DB): rung-snap semantics mirror the record
// ladders (snap UP; beyond top = custom quote), honest "no price on
// file" gaps, and strict same-press isolation (a link pointing at a
// service item that isn't in this press's own set resolves as a gap,
// never $0, never another press's number).
//
// Run: GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test server/pressComponentPricing.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveComponentCostLine,
  resolvePackageComponentLines,
  snapComponentLadder,
  ladderItemToRungs,
  ladderRungSchema,
  matchJacketRowForOption,
  validateTypedRungs,
  type ComponentLadderCatalog,
  type ComponentPriceLinkData,
  type ResolvableServiceItem,
} from "../shared/pressComponentPricing";
import { resolveSeedPress } from "../scripts/seed-component-price-links";

// MRP-shaped: Tier 3 quantity breaks (subset of the real gatefold ladder).
const MRP_QTYS = [300, 500, 1000, 2000, 3000, 5000, 10000, 25000];
const mrpGatefoldRungs = [
  { qty: 300, unitCents: 597 },
  { qty: 500, unitCents: 358 },
  { qty: 1000, unitCents: 231 },
  { qty: 2000, unitCents: 146 },
  { qty: 3000, unitCents: 131 },
  { qty: 5000, unitCents: 116 },
  { qty: 10000, unitCents: 104 },
  { qty: 25000, unitCents: 104 },
];

// Viryl-shaped: setup & services flat rows.
const virylServices: ResolvableServiceItem[] = [
  { id: "svc-shrink", label: "Shrink Wrapping", amountCents: 15, unitBasis: "per_unit" },
  { id: "svc-insertion", label: "Insertion of Sleeved Record into Jacket", amountCents: 11, unitBasis: "per_record" },
  { id: "svc-barcode", label: "Bar Codes (Generation)", amountCents: 3500, unitBasis: "per_order" },
  { id: "svc-cutting", label: "Master Cutting", amountCents: 40000, unitBasis: "per_side" },
  { id: "svc-archived", label: "Old Sleeve", amountCents: 20, unitBasis: "per_unit", archivedAt: new Date() },
  { id: "svc-white-sleeve", label: 'Standard White Paper Inner Sleeves (12"/10"/7")', amountCents: 0, unitBasis: "per_unit" },
];
const svcMap = new Map(virylServices.map((s) => [s.id, s] as const));

const ladderLink = (rungs: { qty: number; unitCents: number }[]): ComponentPriceLinkData => ({
  componentKey: "jacket",
  optionId: "gatefold",
  priceMode: "ladder",
  serviceItemId: null,
  ladderSource: { groupKey: "gatefold_jackets", itemLabel: '12"/10" / 20pt Board / 4/0 (CMYK)' },
  ladderRungs: rungs,
});

test("snapComponentLadder snaps UP to the next rung", () => {
  const hit = snapComponentLadder(mrpGatefoldRungs, 750);
  assert.deepEqual(hit, { qty: 1000, unitCents: 231, requiresQuote: false });
});

test("snapComponentLadder exact rung match", () => {
  const hit = snapComponentLadder(mrpGatefoldRungs, 500);
  assert.deepEqual(hit, { qty: 500, unitCents: 358, requiresQuote: false });
});

test("snapComponentLadder beyond top rung = requiresQuote", () => {
  const hit = snapComponentLadder(mrpGatefoldRungs, 30000);
  assert.equal(hit?.requiresQuote, true);
});

test("empty ladder resolves null (no price, never $0)", () => {
  assert.equal(snapComponentLadder([], 500), null);
});

test("ladder link prices at snapped rung × quantity", () => {
  const line = resolveComponentCostLine({
    componentKey: "jacket",
    optionId: "gatefold",
    link: ladderLink(mrpGatefoldRungs),
    serviceItemsById: svcMap,
    quantity: 750,
  });
  assert.equal(line.status, "priced");
  assert.equal(line.unitCents, 231);
  assert.equal(line.snappedQty, 1000);
  assert.equal(line.totalCents, 231 * 750);
});

test("ladder link beyond top rung surfaces as custom quote, no total", () => {
  const line = resolveComponentCostLine({
    componentKey: "jacket",
    optionId: "gatefold",
    link: ladderLink(mrpGatefoldRungs),
    serviceItemsById: svcMap,
    quantity: 50000,
  });
  assert.equal(line.status, "custom_quote");
  assert.equal(line.totalCents, null);
  assert.equal(line.unitCents, null);
});

test("per-unit service extends amount × quantity", () => {
  const line = resolveComponentCostLine({
    componentKey: "extras",
    optionId: "shrink_wrap",
    link: {
      componentKey: "extras",
      optionId: "shrink_wrap",
      priceMode: "service",
      serviceItemId: "svc-shrink",
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap,
    quantity: 500,
  });
  assert.equal(line.status, "priced");
  assert.equal(line.totalCents, 15 * 500);
  assert.equal(line.unitBasis, "per_unit");
  assert.equal(line.sourceLabel, "Shrink Wrapping");
});

test("$0 service item resolves as included, never a $0 priced line", () => {
  const line = resolveComponentCostLine({
    componentKey: "inner_sleeve",
    optionId: "white",
    link: {
      componentKey: "inner_sleeve",
      optionId: "white",
      priceMode: "service",
      serviceItemId: "svc-white-sleeve",
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap,
    quantity: 500,
  });
  assert.equal(line.status, "included");
  assert.equal(line.unitCents, null);
  assert.equal(line.totalCents, 0);
});

test("per_order service is a flat one-time amount", () => {
  const line = resolveComponentCostLine({
    componentKey: "extras",
    optionId: "sticker",
    link: {
      componentKey: "extras",
      optionId: "sticker",
      priceMode: "service",
      serviceItemId: "svc-barcode",
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap,
    quantity: 2000,
  });
  assert.equal(line.status, "priced");
  assert.equal(line.totalCents, 3500);
});

test("per_side service shows rate but refuses a fabricated total", () => {
  const line = resolveComponentCostLine({
    componentKey: "extras",
    optionId: "insertion",
    link: {
      componentKey: "extras",
      optionId: "insertion",
      priceMode: "service",
      serviceItemId: "svc-cutting",
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap,
    quantity: 500,
  });
  assert.equal(line.status, "priced");
  assert.equal(line.unitCents, 40000);
  assert.equal(line.totalCents, null);
});

test("link to a service item NOT in this press's set = no price on file (cross-press isolation)", () => {
  const line = resolveComponentCostLine({
    componentKey: "extras",
    optionId: "poly_bag",
    link: {
      componentKey: "extras",
      optionId: "poly_bag",
      priceMode: "service",
      serviceItemId: "some-other-press-item",
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap, // this press's items only
    quantity: 500,
  });
  assert.equal(line.status, "no_price_on_file");
  assert.equal(line.totalCents, null);
  assert.equal(line.unitCents, null);
});

test("archived service item resolves as no price on file", () => {
  const line = resolveComponentCostLine({
    componentKey: "inner_sleeve",
    optionId: "white",
    link: {
      componentKey: "inner_sleeve",
      optionId: "white",
      priceMode: "service",
      serviceItemId: "svc-archived",
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap,
    quantity: 500,
  });
  assert.equal(line.status, "no_price_on_file");
});

test("included resolves to $0 total labeled as included", () => {
  const line = resolveComponentCostLine({
    componentKey: "inner_sleeve",
    optionId: "white-poly",
    link: {
      componentKey: "inner_sleeve",
      optionId: "white-poly",
      priceMode: "included",
      serviceItemId: null,
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap,
    quantity: 500,
  });
  assert.equal(line.status, "included");
  assert.equal(line.totalCents, 0);
});

test("custom_quote link and missing link both refuse a number", () => {
  const cq = resolveComponentCostLine({
    componentKey: "insert",
    optionId: "poster",
    link: {
      componentKey: "insert",
      optionId: "poster",
      priceMode: "custom_quote",
      serviceItemId: null,
      ladderSource: null,
      ladderRungs: null,
    },
    serviceItemsById: svcMap,
    quantity: 500,
  });
  assert.equal(cq.status, "custom_quote");
  assert.equal(cq.totalCents, null);
  const none = resolveComponentCostLine({
    componentKey: "insert",
    optionId: "sheet",
    link: null,
    serviceItemsById: svcMap,
    quantity: 500,
  });
  assert.equal(none.status, "no_price_on_file");
  assert.equal(none.totalCents, null);
});

test("resolvePackageComponentLines: MRP-shaped package at two quantities", () => {
  const links: ComponentPriceLinkData[] = [
    ladderLink(mrpGatefoldRungs),
    {
      componentKey: "inner_sleeve",
      optionId: "white-poly",
      priceMode: "included",
      serviceItemId: null,
      ladderSource: null,
      ladderRungs: null,
    },
    {
      componentKey: "extras",
      optionId: "shrink_wrap",
      priceMode: "service",
      serviceItemId: "svc-shrink",
      ladderSource: null,
      ladderRungs: null,
    },
  ];
  const selections = [
    { componentKey: "jacket" as const, optionId: "gatefold" },
    { componentKey: "inner_sleeve" as const, optionId: "white-poly" },
    { componentKey: "extras" as const, optionId: "shrink_wrap" },
    { componentKey: "insert" as const, optionId: "poster" }, // unlinked
  ];
  const at500 = resolvePackageComponentLines({ selections, links, serviceItems: virylServices, quantity: 500 });
  assert.equal(at500.length, 4);
  assert.equal(at500[0].totalCents, 358 * 500);
  assert.equal(at500[1].totalCents, 0);
  assert.equal(at500[2].totalCents, 15 * 500);
  assert.equal(at500[3].status, "no_price_on_file");

  const at1500 = resolvePackageComponentLines({ selections, links, serviceItems: virylServices, quantity: 1500 });
  assert.equal(at1500[0].snappedQty, 2000); // snap up
  assert.equal(at1500[0].totalCents, 146 * 1500);
});

test("invalid selections are dropped, not fabricated", () => {
  const lines = resolvePackageComponentLines({
    selections: [{ componentKey: "jacket" as any, optionId: "bogus" }],
    links: [],
    serviceItems: [],
    quantity: 500,
  });
  assert.equal(lines.length, 0);
});

test("ladderItemToRungs zips quantities against the blob and skips zero rungs", () => {
  const catalog: ComponentLadderCatalog = {
    quantities: MRP_QTYS,
    groups: [
      {
        key: "gatefold_jackets",
        label: "Printed Gatefold Jackets",
        items: [{ label: "12/10 CMYK", unitCents: [597, 358, 231, 146, 131, 116, 104, 0] }],
      },
    ],
  };
  const rungs = ladderItemToRungs(catalog, "gatefold_jackets", "12/10 CMYK");
  assert.equal(rungs?.length, 7); // trailing 0 dropped — never a $0 rung
  assert.deepEqual(rungs?.[0], { qty: 300, unitCents: 597 });
  assert.equal(ladderItemToRungs(catalog, "nope", "12/10 CMYK"), null);
  assert.equal(ladderItemToRungs(catalog, "gatefold_jackets", "missing"), null);
});

// ── Jacket style → press jacket row (record ladder leg) ────────────────
const MRP_JACKETS = [
  { id: "j-single", name: "Single Jacket", isDefault: true },
  { id: "j-gate", name: "Gatefold Jacket" },
  { id: "j-tipon-gate", name: "Old-Style Tip-On Gatefold" },
  { id: "j-tri", name: "Tri-Fold Gatefold" },
  { id: "j-wide", name: "Widespine Jacket" },
];
const VIRYL_JACKETS = [
  { id: "v-std", name: 'Standard Digitally Printed Jacket (12")', isDefault: true },
  { id: "v-180", name: 'Standard Digitally Printed Jacket (12" 180g)' },
  { id: "v-none", name: "Records + Inner Sleeves Only (No Gatefold)" },
  { id: "v-white", name: "Records + White Inner Sleeve Only (No Printed Jacket)" },
  { id: "v-7", name: "7-inch Paper Sleeve Only (No Jacket)" },
];

test("matchJacketRowForOption maps MRP styles to their own jacket rows", () => {
  assert.equal(matchJacketRowForOption("gatefold", MRP_JACKETS), "j-gate"); // plain over tip-on/tri-fold
  assert.equal(matchJacketRowForOption("trifold", MRP_JACKETS), "j-tri");
  assert.equal(matchJacketRowForOption("single", MRP_JACKETS), "j-single");
  assert.equal(matchJacketRowForOption("pvc", MRP_JACKETS), null); // no PVC jacket row = honest gap
});

test("matchJacketRowForOption never matches Viryl's jacketless config rows", () => {
  // Viryl has NO gatefold jacket ladder — 'No Gatefold' is a records-only row.
  assert.equal(matchJacketRowForOption("gatefold", VIRYL_JACKETS), null);
  // single resolves to the default standard jacket (that IS the record ladder).
  assert.equal(matchJacketRowForOption("single", VIRYL_JACKETS), "v-std");
});

test("matchJacketRowForOption honors applicableFormats", () => {
  const jackets = [
    { id: "j-12", name: "Gatefold Jacket", applicableFormats: ["12_lp"] },
    { id: "j-7", name: "Gatefold Jacket 7in", applicableFormats: ["7_single"] },
  ];
  assert.equal(matchJacketRowForOption("gatefold", jackets, "7_single"), "j-7");
  assert.equal(matchJacketRowForOption("gatefold", jackets, "12_lp"), "j-12");
});

// ── Typed-rung validation: zero prices are NEVER a priced rung ─────────
test("ladderRungSchema rejects zero and negative unitCents", () => {
  assert.equal(ladderRungSchema.safeParse({ qty: 300, unitCents: 0 }).success, false);
  assert.equal(ladderRungSchema.safeParse({ qty: 300, unitCents: -5 }).success, false);
  assert.equal(ladderRungSchema.safeParse({ qty: 300, unitCents: 1 }).success, true);
});

test("validateTypedRungs rejects duplicate quantities", () => {
  assert.equal(
    validateTypedRungs([{ qty: 300, unitCents: 100 }, { qty: 300, unitCents: 90 }]),
    "Duplicate ladder quantity 300",
  );
  assert.equal(validateTypedRungs([{ qty: 300, unitCents: 100 }, { qty: 500, unitCents: 90 }]), null);
});

// ── Seed press resolution: decoy shells never win a fuzzy name match ────
test("resolveSeedPress prefers the exact-domain press over a decoy shell", async () => {
  const candidates = [
    { id: "decoy", name: "VIRYL", domain: "viryltech.com" },
    { id: "real", name: "Viryl Technologies", domain: "viryl.ca" },
  ];
  const tiers = async (id: string) => (id === "real" ? 24 : 0);
  const hit = await resolveSeedPress("Viryl", candidates, "viryl.ca", tiers);
  assert.equal(hit.id, "real");
});

test("resolveSeedPress falls back to the single candidate with catalog tiers", async () => {
  const candidates = [
    { id: "decoy", name: "VIRYL", domain: "viryltech.com" },
    { id: "real", name: "Viryl Technologies", domain: null },
  ];
  const hit = await resolveSeedPress("Viryl", candidates, "viryl.ca", async (id) => (id === "real" ? 24 : 0));
  assert.equal(hit.id, "real");
});

test("resolveSeedPress is FATAL on ambiguity or an all-empty match set", async () => {
  const two = [
    { id: "a", name: "Viryl A", domain: null },
    { id: "b", name: "Viryl B", domain: null },
  ];
  await assert.rejects(() => resolveSeedPress("Viryl", two, "viryl.ca", async () => 5), /ambiguous/);
  await assert.rejects(() => resolveSeedPress("Viryl", two, "viryl.ca", async () => 0), /FATAL/);
  await assert.rejects(() => resolveSeedPress("Viryl", [], "viryl.ca", async () => 0), /not found/);
});
