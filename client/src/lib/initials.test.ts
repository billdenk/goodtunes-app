import { test } from "node:test";
import assert from "node:assert/strict";
import { getInitials } from "./initials";

test("two words use the first and last word initials, uppercase", () => {
  assert.equal(getInitials("Aaron Wagner"), "AW");
  assert.equal(getInitials("bill denk"), "BD");
});

test("three or more words use first + LAST initial", () => {
  assert.equal(getInitials("Alan Roy Scott"), "AS");
  assert.equal(getInitials("Mary Jane Watson"), "MW");
});

test("a single word is first-cap, second-lowercase", () => {
  assert.equal(getInitials("Adele"), "Ad");
  assert.equal(getInitials("BILL"), "Bi");
  assert.equal(getInitials("activ8te"), "Ac");
});

test("a single-letter name stays one character", () => {
  assert.equal(getInitials("A"), "A");
});

test("extra internal whitespace doesn't create empty initials", () => {
  assert.equal(getInitials("  Aaron   Wagner  "), "AW");
});

test("empty / whitespace / nullish falls back", () => {
  assert.equal(getInitials(""), "?");
  assert.equal(getInitials("   "), "?");
  assert.equal(getInitials(undefined), "?");
  assert.equal(getInitials(null), "?");
});

test("the fallback is configurable", () => {
  assert.equal(getInitials("", ""), "");
  assert.equal(getInitials(null, "•"), "•");
  assert.equal(getInitials(undefined, "??"), "??");
});
