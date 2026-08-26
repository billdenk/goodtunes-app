// Task #3385 — Press ERP reference labels resolve per-press with generic
// fallbacks. The mechanism is press-generic; only labels/values vary.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePressErpRefLabels,
  DEFAULT_PRESS_ERP_REF_LABELS,
  PRESS_CUSTOMER_CATEGORIES,
  PRESS_CUSTOMER_PRICING_TIERS,
} from "./pressErp";

test("null/undefined config resolves to the generic defaults", () => {
  assert.deepEqual(resolvePressErpRefLabels(null), {
    jobNumber: DEFAULT_PRESS_ERP_REF_LABELS.jobNumber,
    salesOrder: DEFAULT_PRESS_ERP_REF_LABELS.salesOrder,
  });
  assert.deepEqual(resolvePressErpRefLabels(undefined), {
    jobNumber: "Press job #",
    salesOrder: "Press SO #",
  });
});

test("MRP-style per-press labels win over defaults", () => {
  assert.deepEqual(
    resolvePressErpRefLabels({ jobNumber: "MRP #", salesOrder: "SO #" }),
    { jobNumber: "MRP #", salesOrder: "SO #" },
  );
});

test("partial config falls back per-field; blank/whitespace counts as unset", () => {
  assert.deepEqual(resolvePressErpRefLabels({ jobNumber: "Job Nr." }), {
    jobNumber: "Job Nr.",
    salesOrder: "Press SO #",
  });
  assert.deepEqual(resolvePressErpRefLabels({ jobNumber: "  ", salesOrder: null }), {
    jobNumber: "Press job #",
    salesOrder: "Press SO #",
  });
});

test("MRP customer vocabulary is the first data set", () => {
  assert.deepEqual([...PRESS_CUSTOMER_CATEGORIES], ["major", "broker", "indie"]);
  assert.deepEqual([...PRESS_CUSTOMER_PRICING_TIERS], ["1", "2", "3"]);
});
