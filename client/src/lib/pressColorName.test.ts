// Bill's ruling (Aug 23 2026): MRP-facing surfaces never show raw internal
// color codes — hide any name containing a code token, show renamed names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayPressColorName } from "./pressColorName";

test("raw MRP codes are hidden", () => {
  assert.equal(displayPressColorName("O02 w/ O03 O22"), null);
  assert.equal(displayPressColorName("O15 w/ O08 O09 O22"), null);
  assert.equal(displayPressColorName("T08 w/ black"), null);
  assert.equal(displayPressColorName("GT150 splatter"), null);
});

test("human names show", () => {
  assert.equal(displayPressColorName("Blood moon splatter"), "Blood moon splatter");
  assert.equal(displayPressColorName("Red"), "Red");
  assert.equal(displayPressColorName("180g Black"), "180g Black");
  assert.equal(displayPressColorName("7-inch clear"), "7-inch clear");
  assert.equal(displayPressColorName("Coke bottle clear"), "Coke bottle clear");
});

test("empty and blank are hidden", () => {
  assert.equal(displayPressColorName(""), null);
  assert.equal(displayPressColorName("   "), null);
  assert.equal(displayPressColorName(null), null);
  assert.equal(displayPressColorName(undefined), null);
});
