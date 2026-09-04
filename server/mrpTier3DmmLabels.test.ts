import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { MRP_DMM_LABEL_RENAMES } from "../scripts/update-mrp-tier3-2-dmm-labels";

test("Tier3-2 DMM label correction preserves every source price", () => {
  assert.deepEqual(
    MRP_DMM_LABEL_RENAMES.map(({ newLabel, amountCents }) => [newLabel, amountCents]),
    [
      ['12"/10" DMM Cutting', 40000],
      ['12"/10" DMM Plating', 30000],
      ['7" DMM Cutting', 29000],
      ['7" DMM Plating', 16000],
    ],
  );
  assert.ok(MRP_DMM_LABEL_RENAMES.every(({ oldLabel, newLabel }) =>
    oldLabel.replace("Master", "DMM") === newLabel
  ));
});

test("the base service seed refuses legacy rows before inserting DMM rows", () => {
  const source = fs.readFileSync("scripts/seed-mrp-services-tier3.ts", "utf8");
  assert.match(source, /LEGACY_DMM_LABELS/);
  assert.match(source, /if \(legacyRows\.length > 0\)/);
  assert.match(source, /transactional reconciliation first/);
  assert.match(source, /eq\(manufacturers\.name, "Memphis Record Pressing"\)/);
  assert.match(source, /eq\(manufacturers\.domain, "memphisrecordpressing\.com"\)/);
});