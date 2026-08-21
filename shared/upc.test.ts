// Task #3248 — GTIN-12 validator tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUpc, upcCheckDigit } from "./upc";

test("valid 12-digit UPC passes and stays canonical", () => {
  // 036000291452 — classic GS1 example (check digit 2).
  const r = normalizeUpc("036000291452");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.upc12, "036000291452");
    assert.equal(r.checkDigit, 2);
    assert.equal(r.completedFrom11, false);
  }
});

test("11-digit input auto-completes the check digit", () => {
  const r = normalizeUpc("03600029145");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.upc12, "036000291452");
    assert.equal(r.checkDigit, 2);
    assert.equal(r.completedFrom11, true);
  }
});

test("bad check digit rejects with an explanatory message", () => {
  const r = normalizeUpc("036000291453");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Check digit/);
});

test("non-numeric input rejects", () => {
  const r = normalizeUpc("03600A291452");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /digits only/);
});

test("wrong length rejects (10 and 13 digits)", () => {
  for (const v of ["0360002914", "0360002914522"]) {
    const r = normalizeUpc(v);
    assert.equal(r.ok, false, v);
    if (!r.ok) assert.match(r.error, /12 digits/);
  }
});

test("spaces and hyphens are tolerated", () => {
  const r = normalizeUpc(" 0-36000-29145-2 ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.upc12, "036000291452");
});

test("empty input rejects", () => {
  assert.equal(normalizeUpc("").ok, false);
  assert.equal(normalizeUpc(null).ok, false);
  assert.equal(normalizeUpc(undefined).ok, false);
});

test("all-zero check digit case ((10 - 0) % 10 === 0)", () => {
  assert.equal(upcCheckDigit("00000000000"), 0);
  const r = normalizeUpc("000000000000");
  assert.equal(r.ok, true);
});

test("upcCheckDigit throws on non-11-digit input", () => {
  assert.throws(() => upcCheckDigit("123"));
});
