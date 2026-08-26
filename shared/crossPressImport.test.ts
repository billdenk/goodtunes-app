// Task #3394 — Cross-press import: the price firewall and the honest
// translation engine, tested pure (no DB, no network).
//
//   npx tsx --test shared/crossPressImport.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  specFromBuilderState,
  specFromSkuSnapshot,
  translateSpec,
  findForbiddenPriceKeys,
  assertSpecPriceFree,
  specIsEligible,
  deriveEffectFamily,
  deriveColorFamily,
  deriveJacketConstruction,
  type DestinationCatalog,
} from "./crossPressImport";

// A destination catalog with NO price fields anywhere (the type forbids
// them; this fixture mirrors what the server projection produces).
const dest: DestinationCatalog = {
  sizes: ["7", "12"],
  weights: ["140", "180"],
  tiers: [
    { id: "t-black", name: "Black", formats: ["12_lp", "7_inch"], effectFamily: "black" },
    { id: "t-splatter", name: "Splatter", formats: ["12_lp"], effectFamily: "splatter" },
    { id: "t-opaque", name: "Opaque", formats: ["12_lp"], effectFamily: "opaque" },
  ],
  colors: [
    { id: "c-black", tierId: "t-black", name: "Black", colorFamily: "black" },
    { id: "c-red-spl", tierId: "t-splatter", name: "Red Splatter", colorFamily: "multi" },
    { id: "c-blue-spl", tierId: "t-splatter", name: "Blue Splatter", colorFamily: "multi" },
    { id: "c-opq-red", tierId: "t-opaque", name: "Ruby Red", colorFamily: "red" },
  ],
  jackets: [
    { id: "j-single", name: "Standard jacket", construction: "single_pocket" },
    { id: "j-gate", name: "Gatefold jacket", construction: "gatefold" },
  ],
};

test("specFromBuilderState is allowlist-built: a price-laden builder state yields a price-free spec", () => {
  const spec = specFromBuilderState({
    sourceRef: { kind: "estimate", id: "e1" },
    title: "Californialand",
    builderState: {
      sizeId: "12",
      discs: 1,
      weightId: "140",
      colorTierName: "Wild Splatter",
      colorName: "Red Splatter",
      jacketId: "gatefold", // the builder's own symbolic style id
      qty: 500,
      // Commerce that must NOT travel:
      totalCents: 512345,
      unitPriceCents: 1024,
      priceLadder: [{ qty: 100, unitCents: 1235 }],
      negotiatedRate: 0.8,
      setupFeeCents: 25000,
    },
  });
  assert.deepEqual(findForbiddenPriceKeys(spec), []);
  assert.equal(spec.lastQuantity, 500);
  assert.equal(spec.color.tierName, "Wild Splatter");
  assert.equal(spec.color.effectFamily, "splatter");
  assert.equal((spec as any).totalCents, undefined);
  assert.ok(specIsEligible(spec));
});

test("specFromSkuSnapshot never reads cost columns and carries no press identity", () => {
  const spec = specFromSkuSnapshot({
    sourceRef: { kind: "album_sku", id: "s1" },
    title: "Hope",
    format: "12_lp",
    vinylColor: "Ruby Red",
    vinylColorTier: "Opaque",
    jacketUpgrade: "Gatefold jacket",
    quantityTier: "300",
    sideBreaks: [
      { side: "A", tracks: 5 },
      { side: "B", tracks: 4 },
    ],
  });
  assert.deepEqual(findForbiddenPriceKeys(spec), []);
  assert.equal(spec.sizeId, "12");
  assert.equal(spec.lastQuantity, 300);
  // No press id/name anywhere on the spec.
  const flat = JSON.stringify(spec).toLowerCase();
  assert.ok(!flat.includes("press"), "spec must carry no press identity");
});

test("findForbiddenPriceKeys deep-scans nested commerce keys", () => {
  const hits = findForbiddenPriceKeys({
    ok: true,
    nested: { list: [{ unitCents: 1 }, { fine: "yes" }], ladder: [] },
  });
  assert.ok(hits.some((h) => h.includes("unitCents")));
  assert.ok(hits.some((h) => h.includes("ladder")));
  assert.throws(() => assertSpecPriceFree({ totalCents: 1 }));
});

test("translate: exact tier+color+jacket resolves with no confirmation needed", () => {
  const spec = specFromSkuSnapshot({
    sourceRef: { kind: "album_sku", id: "s2" },
    format: "12_lp",
    vinylColor: "Black",
    vinylColorTier: "Black",
    jacketUpgrade: "Gatefold jacket",
    quantityTier: 100,
  });
  const p = translateSpec(spec, dest);
  assert.deepEqual(findForbiddenPriceKeys(p), []);
  assert.equal(p.fields.find((f) => f.field === "colorTier")?.status, "exact");
  assert.equal(p.fields.find((f) => f.field === "color")?.status, "exact");
  assert.equal(p.fields.find((f) => f.field === "jacket")?.status, "exact");
  assert.equal(p.needsConfirmation, false);
  // The proposal speaks the destination quote builder's OWN vocabulary so a
  // draft hydrates correctly: press_colors row id + tier-slug colorKind +
  // symbolic jacket style — never a press_jackets UUID.
  assert.equal(p.proposedBuilderState.colorId, "c-black");
  assert.equal(p.proposedBuilderState.colorKind, "black");
  assert.equal(p.proposedBuilderState.colorTierName, "Black");
  assert.equal(p.proposedBuilderState.jacketId, "gatefold");
  assert.equal(p.proposedBuilderState.qty, 100);
});

test("translate: confirming a specific closest tier regenerates color candidates from THAT tier", () => {
  const multi: DestinationCatalog = {
    ...dest,
    tiers: [
      ...dest.tiers,
      { id: "t-splatter2", name: "Splatter Deluxe", formats: ["12_lp"], effectFamily: "splatter" },
    ],
    colors: [
      ...dest.colors,
      { id: "c-em-spl2", tierId: "t-splatter2", name: "Emerald Splatter", colorFamily: "green" },
    ],
  };
  const spec = specFromBuilderState({
    sourceRef: { kind: "estimate", id: "e5" },
    builderState: { sizeId: "12", colorTierName: "Wild Splatter", colorName: "Crimson Splatter", qty: 250 },
  });
  // Confirm the NON-top-ranked tier: color candidates must come only from it.
  const p = translateSpec(spec, multi, { confirmedTierId: "t-splatter2" });
  const tier = p.fields.find((f) => f.field === "colorTier");
  assert.equal(tier?.status, "closest");
  assert.ok(tier?.candidates.some((c) => c.id === "t-splatter2"));
  const color = p.fields.find((f) => f.field === "color");
  assert.equal(color?.status, "closest");
  assert.ok(color!.candidates.length >= 1, "the confirmed tier's colors are offered");
  for (const c of color!.candidates) {
    assert.equal(multi.colors.find((x) => x.id === c.id)?.tierId, "t-splatter2", "every candidate lives under the confirmed tier");
  }
});

test("translate: different tier NAME in the same family is a closest match that requires confirmation — never a silent swap", () => {
  const spec = specFromBuilderState({
    sourceRef: { kind: "estimate", id: "e2" },
    builderState: { sizeId: "12", colorTierName: "Wild Splatter", colorName: "Crimson Splatter", qty: 250 },
  });
  const p = translateSpec(spec, dest);
  const tier = p.fields.find((f) => f.field === "colorTier");
  assert.equal(tier?.status, "closest");
  assert.ok((tier?.candidates.length ?? 0) >= 1);
  assert.equal(tier?.candidates[0].name, "Splatter");
  // The unconfirmed tier must NOT be pre-written into the proposed state.
  assert.equal(p.proposedBuilderState.colorTierName, undefined);
  assert.equal(p.needsConfirmation, true);
});

test("translate: a jacket style the destination doesn't offer is NEVER matched exact or hydrated silently", () => {
  const singleOnly: DestinationCatalog = {
    ...dest,
    jackets: [{ id: "j-single", name: "Standard jacket", construction: "single_pocket" }],
  };
  const spec = specFromSkuSnapshot({
    sourceRef: { kind: "album_sku", id: "s6" },
    format: "12_lp",
    vinylColor: "Black",
    vinylColorTier: "Black",
    jacketUpgrade: "Gatefold jacket",
    quantityTier: 100,
  });
  const p = translateSpec(spec, singleOnly);
  const jacket = p.fields.find((f) => f.field === "jacket");
  assert.equal(jacket?.status, "closest", "unoffered style needs explicit confirmation of an alternative");
  assert.deepEqual(jacket?.candidates.map((c) => c.id), ["single"], "only the destination's own jackets are candidates");
  assert.equal(p.proposedBuilderState.jacketId, undefined, "never pre-write an unconfirmed jacket");
  assert.equal(p.needsConfirmation, true);

  // A destination with NO jackets at all says so honestly.
  const noJackets: DestinationCatalog = { ...dest, jackets: [] };
  const p2 = translateSpec(spec, noJackets);
  const jacket2 = p2.fields.find((f) => f.field === "jacket");
  assert.equal(jacket2?.status, "none");
  assert.deepEqual(jacket2?.candidates, []);
  assert.equal(p2.proposedBuilderState.jacketId, undefined);
});

test("translate: no equivalent is stated honestly (status none, empty candidates, no invented option)", () => {
  const spec = specFromBuilderState({
    sourceRef: { kind: "estimate", id: "e3" },
    builderState: { sizeId: "10", colorTierName: "Picture Disc", colorName: "Picture", qty: 100 },
  });
  const p = translateSpec(spec, dest);
  assert.equal(p.fields.find((f) => f.field === "size")?.status, "none");
  const tier = p.fields.find((f) => f.field === "colorTier");
  assert.equal(tier?.status, "none");
  assert.deepEqual(tier?.candidates, []);
  assert.equal(p.proposedBuilderState.sizeId, undefined);
  assert.equal(p.proposedBuilderState.colorTierName, undefined);
});

test("translate output never contains a price key even against a hostile spec title", () => {
  const spec = specFromSkuSnapshot({
    sourceRef: { kind: "album_sku", id: "s3" },
    title: "Total Price Of Fear", // key SCAN is on keys, values are free text
    format: "12_lp",
    vinylColor: "Black",
    vinylColorTier: "Black",
    quantityTier: 500,
  });
  const p = translateSpec(spec, dest);
  assert.deepEqual(findForbiddenPriceKeys(p), []);
});

test("derivation heuristics: honest null beats a fabricated family", () => {
  assert.equal(deriveColorFamily("Zzyzx"), null); // no token, no hex → unknown
  assert.equal(deriveColorFamily("Zzyzx", "#ff0000"), "red"); // hex rescues
  assert.equal(deriveEffectFamily("Cosmic Smoke Blends"), "marble");
  assert.equal(deriveJacketConstruction("Deluxe Gatefold"), "gatefold");
});

test("translate: format-scoped destination options are gated by record size even when the spec's format is unknown (builder-state specs)", () => {
  // The destination sells Splatter and gatefold jackets ONLY for 7". A 12"
  // builder-state spec (format:null, sizeId:"12") must not be offered
  // either — a tier or jacket sold for another record is not on offer here.
  const scoped: DestinationCatalog = {
    ...dest,
    tiers: [{ id: "t-spl-7", name: "Splatter", formats: ["7_inch"], effectFamily: "splatter" }],
    colors: [{ id: "c-spl-7", tierId: "t-spl-7", name: "Red Splatter", colorFamily: "multi" }],
    jackets: [
      { id: "j-single", name: "Standard jacket", construction: "single_pocket" },
      { id: "j-gate-7", name: "Gatefold jacket", construction: "gatefold", formats: ["7_inch"] },
    ],
  };
  const spec = specFromBuilderState({
    sourceRef: { kind: "estimate", id: "e-fmt" },
    builderState: { sizeId: "12", discs: 1, colorTierName: "Splatter", colorName: "Red Splatter", jacketId: "gatefold", qty: 500 },
  });
  const p = translateSpec(spec, scoped);
  const tier = p.fields.find((f) => f.field === "colorTier");
  assert.equal(tier?.status, "none", "a 7\"-only tier is honestly not offered for a 12\" record");
  assert.deepEqual(tier?.candidates, []);
  const jacket = p.fields.find((f) => f.field === "jacket");
  assert.equal(jacket?.status, "closest", "gatefold sold only for 7\" must not read as available");
  assert.deepEqual(jacket?.candidates.map((c) => c.id), ["single"], "only jackets applicable to this record are candidates");
  assert.equal(p.proposedBuilderState.jacketId, undefined, "nothing hydrates without confirmation");
});

test("translate: an album-derived spec's exact format gates format-scoped tiers and jackets too", () => {
  const scoped: DestinationCatalog = {
    ...dest,
    jackets: [
      { id: "j-single", name: "Standard jacket", construction: "single_pocket", formats: ["12_lp"] },
      { id: "j-gate-7", name: "Gatefold jacket", construction: "gatefold", formats: ["7_inch"] },
    ],
  };
  const spec = specFromSkuSnapshot({
    sourceRef: { kind: "album", id: "a-fmt" },
    format: "12_lp",
    vinylColor: "Black",
    vinylColorTier: "Black",
    jacketUpgrade: "Gatefold",
    quantityTier: 300,
  });
  const p = translateSpec(spec, scoped);
  const jacket = p.fields.find((f) => f.field === "jacket");
  assert.equal(jacket?.status, "closest");
  assert.deepEqual(jacket?.candidates.map((c) => c.id), ["single"], "the 7\"-only gatefold row never makes gatefold available for a 12\" record");
});
