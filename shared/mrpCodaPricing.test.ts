import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MRP_CODA_CROSSWALK,
  MRP_CODA_SOURCE,
  extendMrpCodaCents,
  mrpCodaMultiplicity,
  resolveMrpCodaCode,
} from "./mrpCodaPricing";
import { pricingComponentConfigSchema } from "./pressComponents";

test("MRP crosswalk has unique stable CODA identities and structured semantics", () => {
  assert.equal(MRP_CODA_CROSSWALK.size, 124);
  for (const [code, entry] of MRP_CODA_CROSSWALK) {
    assert.equal(entry.code, code);
    assert.match(code, /^\d{4}[A-Z]{0,2}-\d{4}$/);
    assert.ok(entry.workbookRow > 0);
    assert.ok(entry.targetKind);
    assert.ok(entry.targetKey);
  }
});

test("reviewed crosswalk snapshot satisfies pricing-config runtime validation", () => {
  const parsed = pricingComponentConfigSchema.parse({
    rows: [],
    mrpCodaCrosswalk: {
      source: MRP_CODA_SOURCE,
      reviewedWorkbook: "GoodTunes___GoGoods-Tier3-2_1788555344172.xlsx",
      entries: Array.from(MRP_CODA_CROSSWALK.values()),
    },
  });
  assert.equal(parsed.mrpCodaCrosswalk?.entries.length, 124);
});

test("job per-LP rates use finished units times discs per finished unit", () => {
  const single = { finishedUnits: 500, discsPerFinishedUnit: 1 };
  const double = { finishedUnits: 500, discsPerFinishedUnit: 2 };
  assert.equal(mrpCodaMultiplicity("4011-0001", single), 500);
  assert.equal(mrpCodaMultiplicity("4011-0001", double), 1000);
  assert.equal(extendMrpCodaCents("4011-0001", 165, double), 165_000);
});

test("setup costs charge once except per-LP, which uses discs in one finished unit", () => {
  const double = { finishedUnits: 2000, discsPerFinishedUnit: 2 };
  assert.equal(mrpCodaMultiplicity("4021-0004", double), 2);
  // Test-pressing package is a setup/per-unit row: workbook J2 says setup
  // costs still charge once unless charge type is per LP.
  assert.equal(mrpCodaMultiplicity("4011B-0001", double), 1);
  assert.equal(mrpCodaMultiplicity("4055-0002", double), 1);
});

test("stickers and touches require explicit per-finished-unit counts", () => {
  assert.equal(
    mrpCodaMultiplicity("4036-0002", {
      finishedUnits: 300,
      discsPerFinishedUnit: 1,
      stickersPerFinishedUnit: 2,
    }),
    600,
  );
  assert.equal(
    mrpCodaMultiplicity("4040A-0004", {
      finishedUnits: 300,
      discsPerFinishedUnit: 2,
      touchesPerFinishedUnit: 4,
    }),
    1200,
  );
});

test("unknown codes, malformed counts, and rows 29/35 fail closed", () => {
  const ctx = { finishedUnits: 300, discsPerFinishedUnit: 2 };
  assert.equal(resolveMrpCodaCode("NOT-A-CODE"), null);
  assert.equal(mrpCodaMultiplicity("NOT-A-CODE", ctx), null);
  assert.equal(extendMrpCodaCents("NOT-A-CODE", 999_999, ctx), null);
  assert.equal(resolveMrpCodaCode("4080-0001"), null, "row 29 is held for MRP");
  assert.equal(resolveMrpCodaCode("4011A-0003"), null, "row 35 is held for MRP");
  assert.equal(mrpCodaMultiplicity("4011-0001", { ...ctx, discsPerFinishedUnit: 0 }), null);
  assert.equal(extendMrpCodaCents("4011-0001", Number.NaN, ctx), null);
});

test("a genuine zero rate remains zero, never pending", () => {
  assert.equal(
    extendMrpCodaCents("4033-0003", 0, { finishedUnits: 1000, discsPerFinishedUnit: 2 }),
    0,
  );
});