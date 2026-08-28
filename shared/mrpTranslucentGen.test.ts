// Task #3451 — MRP's exact "Translucent" group is normalized to the Standard
// generator with the Translucent finish, keeping each color's imported photo
// as the rebuild/compare reference. Similarly named or photo-backed groups
// outside the target, and non-Memphis presses, stay byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMrpTranslucentStandardGen,
  isMemphisPress,
  vinylComponentConfigSchema,
  type VinylComponentConfig,
} from "./pressComponents";

const sw = (over: Record<string, unknown> = {}) => ({
  id: "translucent-ruby-red",
  name: "Ruby Red",
  kind: "translucent" as const,
  base: "#C81E38",
  sizes: ['7"', '12"'] as any,
  customImg: "/objects/uploads/ruby-red",
  ...over,
});

const config = (categories: any[]): VinylComponentConfig => ({
  categories,
  weights: [],
  sizeOptions: [],
  quantities: [],
});

const translucentCat = (over: Record<string, unknown> = {}) => ({
  id: "translucent",
  name: "Translucent",
  kind: "translucent" as const,
  sizes: ['7"', '12"'] as any,
  swatches: [sw()],
  ...over,
});

test("exact Translucent group: swatches gain Standard→Translucent gen from their saved hex", () => {
  const { config: next, changed } = applyMrpTranslucentStandardGen(config([translucentCat()]));
  assert.equal(changed, true);
  const out = next.categories[0].swatches[0];
  assert.deepEqual(out.gen, { styleId: "standard", colors: ["#C81E38"], option: "trans" });
  // Photo, identity, sizes retained — the reference image survives.
  assert.equal(out.customImg, "/objects/uploads/ruby-red");
  assert.equal(out.id, "translucent-ruby-red");
  assert.equal(out.name, "Ruby Red");
  assert.equal(out.kind, "translucent");
  // Result still passes the component schema.
  vinylComponentConfigSchema.parse(next);
});

test("category name match is exact (trim/case-insensitive) — similar names untouched", () => {
  const others = [
    translucentCat({ id: "trans-blends", name: "Translucent Blends" }),
    translucentCat({ id: "ultra", name: "Ultra Clear" }),
    translucentCat({ id: "smoke", name: "Smoke Blends", kind: "opaque" }),
  ];
  const { config: next, changed } = applyMrpTranslucentStandardGen(config(others));
  assert.equal(changed, false);
  assert.deepEqual(next.categories, others);

  // "  translucent " still matches — the exact group, whitespace/case aside.
  const padded = applyMrpTranslucentStandardGen(config([translucentCat({ name: "  TRANSLUCENT " })]));
  assert.equal(padded.changed, true);
  assert.ok(padded.config.categories[0].swatches[0].gen);
});

test("idempotent: swatches already carrying gen are never overwritten", () => {
  const operatorGen = { styleId: "cloudy", colors: ["#111111", "#222222"] };
  const cat = translucentCat({ swatches: [sw({ gen: operatorGen })] });
  const { config: next, changed } = applyMrpTranslucentStandardGen(config([cat]));
  assert.equal(changed, false);
  assert.deepEqual(next.categories[0].swatches[0].gen, operatorGen);

  // Second pass over a freshly normalized config is a no-op.
  const first = applyMrpTranslucentStandardGen(config([translucentCat()]));
  const second = applyMrpTranslucentStandardGen(first.config);
  assert.equal(second.changed, false);
  assert.deepEqual(second.config, first.config);
});

test("swatch hex normalizes to the 6-digit form the generator renders", () => {
  const cats = [
    translucentCat({
      swatches: [
        sw({ id: "a", base: "#abc" }),
        sw({ id: "b", base: "#C81E38FF" }),
        sw({ id: "c", base: "#0C0C0C" }),
      ],
    }),
  ];
  const { config: next } = applyMrpTranslucentStandardGen(config(cats));
  const [a, b, c] = next.categories[0].swatches;
  assert.deepEqual(a.gen!.colors, ["#aabbcc"]);
  assert.deepEqual(b.gen!.colors, ["#C81E38"]);
  assert.deepEqual(c.gen!.colors, ["#0C0C0C"]);
});

test("placeholder base takes the canonical MRP hex; real saved base always wins", () => {
  const cats = [
    translucentCat({
      swatches: [
        // Photo-only import: base is the seed placeholder → canonical table.
        sw({ id: "t01", name: "T01 Ruby", base: "#0C0C0C" }),
        // Operator saved a real base → it wins over the table.
        sw({ id: "t03", name: "T03 Cobalt", base: "#123456" }),
        // Placeholder base, name not in the table → honest placeholder kept.
        sw({ id: "x", name: "Mystery Color", base: "#0C0C0C" }),
      ],
    }),
  ];
  const { config: next } = applyMrpTranslucentStandardGen(config(cats));
  const [t01, t03, x] = next.categories[0].swatches;
  assert.equal(t01.base, "#c0566a");
  assert.deepEqual(t01.gen!.colors, ["#c0566a"]);
  assert.equal(t03.base, "#123456");
  assert.deepEqual(t03.gen!.colors, ["#123456"]);
  assert.equal(x.base, "#0C0C0C");
  assert.deepEqual(x.gen!.colors, ["#0C0C0C"]);
  // Photos ride through on all three.
  assert.ok(t01.customImg && t03.customImg && x.customImg);
});

test("other categories in the same config pass through untouched", () => {
  const opaque = translucentCat({ id: "opaque", name: "Opaque", kind: "opaque" });
  const { config: next, changed } = applyMrpTranslucentStandardGen(
    config([opaque, translucentCat()]),
  );
  assert.equal(changed, true);
  assert.deepEqual(next.categories[0], opaque);
  assert.ok(next.categories[1].swatches[0].gen);
});

test("isMemphisPress matches only MRP's exact identity", () => {
  assert.equal(isMemphisPress({ name: "Memphis Record Pressing", domain: null }), true);
  assert.equal(isMemphisPress({ name: "  memphis record pressing  " }), true);
  assert.equal(isMemphisPress({ name: "Decoy", domain: "memphisrecordpressing.com" }), true);
  assert.equal(isMemphisPress({ name: "Physical Music Products", domain: "pmp.example" }), false);
  assert.equal(isMemphisPress({ name: "Memphis Vinyl Co" }), false);
  assert.equal(isMemphisPress(null), false);
});
