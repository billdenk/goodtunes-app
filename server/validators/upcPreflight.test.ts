// Task #3248 — album-level UPC preflight check (warning-only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { upcPreflightCheck } from "./preflight";

const isVinyl = (f: string) => f.startsWith("12_") || f === "7_inch" || f === "10_inch";

test("no vinyl SKUs → null (nothing to warn about)", () => {
  assert.equal(upcPreflightCheck([], isVinyl), null);
  assert.equal(
    upcPreflightCheck([{ format: "cd", active: true, upc: null }], isVinyl),
    null,
  );
});

test("vinyl SKU without UPC → warn, never fail", () => {
  const c = upcPreflightCheck([{ format: "12_single", active: true, upc: null }], isVinyl);
  assert.ok(c);
  assert.equal(c!.status, "warn");
  assert.equal(c!.key, "release.upc");
  assert.match(c!.message, /not blocked/i);
});

test("vinyl SKU with UPC → pass", () => {
  const c = upcPreflightCheck(
    [{ format: "12_single", active: true, upc: "036000291452" }],
    isVinyl,
  );
  assert.ok(c);
  assert.equal(c!.status, "pass");
});

test("active vinyl rows take precedence over inactive drafts", () => {
  // Active row has a UPC; a stale inactive draft without one shouldn't warn.
  const c = upcPreflightCheck(
    [
      { format: "12_single", active: true, upc: "036000291452" },
      { format: "7_inch", active: false, upc: null },
    ],
    isVinyl,
  );
  assert.equal(c!.status, "pass");
});

test("inactive-only vinyl draft without UPC still warns (jackets still press)", () => {
  const c = upcPreflightCheck([{ format: "12_double", active: false, upc: null }], isVinyl);
  assert.equal(c!.status, "warn");
});

test("blank-string UPC counts as missing", () => {
  const c = upcPreflightCheck([{ format: "12_single", active: true, upc: "  " }], isVinyl);
  assert.equal(c!.status, "warn");
});
