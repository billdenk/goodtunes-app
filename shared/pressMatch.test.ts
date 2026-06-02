import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePressMatches, type PressCandidateInput, type PressMatchSpec } from "./pressMatch";

function press(over: Partial<PressCandidateInput>): PressCandidateInput {
  return {
    pressId: over.pressId ?? "p",
    name: over.name ?? "Press",
    logoUrl: null,
    location: over.location ?? null,
    turnaroundWeeksMin: over.turnaroundWeeksMin ?? null,
    turnaroundWeeksMax: over.turnaroundWeeksMax ?? null,
    turnaroundDays: over.turnaroundDays ?? null,
    brokerDiscountPct: 0,
    formats: over.formats ?? ["12_lp"],
    tiers: over.tiers ?? [],
  };
}

const blackTier = (unit: number) => ({
  id: "t-black",
  name: "Black",
  colors: [{ id: "c-black", name: "Black", swatchHex: "#000000" }],
  ladder: [{ qty: 500, unitCents: unit, confirmed: true }],
});

test("format is a hard filter — wrong format never matches", () => {
  const spec: PressMatchSpec = { format: "7_inch", quantity: 500 };
  const out = scorePressMatches(spec, [
    press({ pressId: "a", formats: ["12_lp"], tiers: [blackTier(500)] }),
  ]);
  assert.equal(out[0].matches, false);
  assert.match(out[0].failedHard[0], /Doesn't press/);
});

test("cheaper press ranks first on price", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500 };
  const out = scorePressMatches(spec, [
    press({ pressId: "expensive", name: "Exp", tiers: [blackTier(800)] }),
    press({ pressId: "cheap", name: "Cheap", tiers: [blackTier(400)] }),
  ]);
  assert.equal(out[0].pressId, "cheap");
  assert.equal(out[0].score, 100);
  assert.ok(out[1].score < 100);
});

test("color is a hard filter when requested", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500, color: "gold" };
  const goldTier = {
    id: "t-gold", name: "Metallic",
    colors: [{ id: "c-gold", name: "Gold", swatchHex: "#f3d57a" }],
    ladder: [{ qty: 500, unitCents: 600, confirmed: true }],
  };
  const out = scorePressMatches(spec, [
    press({ pressId: "hasgold", tiers: [goldTier] }),
    press({ pressId: "blackonly", tiers: [blackTier(400)] }),
  ]);
  const gold = out.find((r) => r.pressId === "hasgold")!;
  const black = out.find((r) => r.pressId === "blackonly")!;
  assert.equal(gold.matches, true);
  assert.equal(gold.colorMatch?.kind, "exact");
  assert.equal(black.matches, false);
  assert.match(black.failedHard[0], /No gold option/);
});

test("hex-family fallback matches a same-family swatch", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500, color: "blue" };
  const tier = {
    id: "t", name: "Translucent",
    colors: [{ id: "c", name: "Ocean Wave", swatchHex: "#1f4ec0" }],
    ladder: [{ qty: 500, unitCents: 600, confirmed: true }],
  };
  const out = scorePressMatches(spec, [press({ tiers: [tier] })]);
  assert.equal(out[0].matches, true);
  assert.equal(out[0].colorMatch?.kind, "family");
});

test("turnaround over the requested max is penalized, not excluded", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500, maxTurnaroundWeeks: 8 };
  const out = scorePressMatches(spec, [
    press({ pressId: "fast", turnaroundWeeksMax: 6, tiers: [blackTier(500)] }),
    press({ pressId: "slow", turnaroundWeeksMax: 16, tiers: [blackTier(500)] }),
  ]);
  const fast = out.find((r) => r.pressId === "fast")!;
  const slow = out.find((r) => r.pressId === "slow")!;
  assert.equal(fast.matches, true);
  assert.equal(slow.matches, true);
  assert.equal(fast.factors.turnaround.score, 1);
  assert.ok(slow.factors.turnaround.score < 1);
  assert.ok(fast.score > slow.score);
});

test("inactive factors don't dilute the score", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500 };
  const out = scorePressMatches(spec, [press({ tiers: [blackTier(500)] })]);
  assert.equal(out[0].factors.color.active, false);
  assert.equal(out[0].factors.location.active, false);
  assert.equal(out[0].factors.turnaround.active, false);
  assert.equal(out[0].score, 100);
});

test("location token match beats country-only beats different region", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500, preferredLocation: "Nashville, Tennessee, USA" };
  const out = scorePressMatches(spec, [
    press({ pressId: "tn", location: "Nashville, TN", tiers: [blackTier(500)] }),
    press({ pressId: "usa", location: "Portland, USA", tiers: [blackTier(500)] }),
    press({ pressId: "cz", location: "Prague", tiers: [blackTier(500)] }),
  ]);
  const tn = out.find((r) => r.pressId === "tn")!;
  const usa = out.find((r) => r.pressId === "usa")!;
  const cz = out.find((r) => r.pressId === "cz")!;
  assert.equal(tn.factors.location.score, 1);
  assert.equal(usa.factors.location.score, 0.55);
  assert.ok(cz.factors.location.score < 0.55);
});

test("unconfirmed-only ladder surfaces as needs-a-quote, still matches", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500 };
  const tier = {
    id: "t", name: "Black",
    colors: [{ id: "c", name: "Black", swatchHex: "#000" }],
    ladder: [{ qty: 500, unitCents: 0, confirmed: false }],
  };
  const out = scorePressMatches(spec, [press({ tiers: [tier] })]);
  assert.equal(out[0].matches, true);
  assert.equal(out[0].unitCents, null);
  assert.equal(out[0].factors.price.note, "No confirmed ladder — needs a quote");
});

test("format listed but zero tiers fails the hard filter", () => {
  const spec: PressMatchSpec = { format: "12_lp", quantity: 500 };
  const out = scorePressMatches(spec, [press({ formats: ["12_lp"], tiers: [] })]);
  assert.equal(out[0].matches, false);
  assert.match(out[0].failedHard[0], /No catalog pricing/);
});
