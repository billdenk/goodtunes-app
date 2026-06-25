// Task #2116 — pure-function coverage for the catalog CSV parser's strict
// validation. The acceptance bar is that invalid rows fail LOUDLY with a
// readable, row-numbered error and are never silently coerced or dropped. These
// pin the parsing layer (parseCatalogCsv) without a DB or HTTP round-trip so
// they run identically in isolation and inside the full `test` suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalogCsv } from "./pressCatalogCsv";

const HEADER =
  "record_type,format,color_group,name,hex,photo_url,quantity,unit_price,offered,component,variant,disc_count,template_url,artboard_w_in,artboard_h_in,pages,color_mode,fonts_rule";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

test("a bad `offered` value fails loudly and is not coerced to true", () => {
  const parsed = parseCatalogCsv(
    csv("price,7_inch,Black,,,,100,12.50,maybe,,,,,,,,,"),
  );
  const offeredErr = parsed.errors.filter((e) => /offered/i.test(e.message));
  assert.equal(offeredErr.length, 1, "expected exactly one offered error");
  assert.match(offeredErr[0].message, /isn't a valid offered value/);
  // The invalid row must NOT be accepted as a price.
  assert.equal(parsed.prices.length, 0);
});

test("blank `offered` defaults to TRUE; TRUE/FALSE are accepted", () => {
  const parsed = parseCatalogCsv(
    csv(
      "price,7_inch,Black,,,,100,12.50,,,,,,,,,,",
      "price,7_inch,Black,,,,200,11.00,TRUE,,,,,,,,,",
      "price,7_inch,Black,,,,300,10.00,FALSE,,,,,,,,,",
    ),
  );
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.prices.length, 3);
  assert.equal(parsed.prices[0].offered, true); // blank -> default true
  assert.equal(parsed.prices[1].offered, true);
  assert.equal(parsed.prices[2].offered, false);
});

test("a non-numeric quantity surfaces a row-numbered error", () => {
  const parsed = parseCatalogCsv(
    csv("price,7_inch,Black,,,,notanumber,12.50,TRUE,,,,,,,,,"),
  );
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].rowNum, 2); // header is row 1
  assert.match(parsed.errors[0].message, /quantity/i);
});

test("an invalid hex swatch is rejected, not stored", () => {
  const parsed = parseCatalogCsv(
    csv("swatch,7_inch,Black,Jet,not-a-hex,,,,,,,,,,,,,"),
  );
  assert.equal(parsed.swatches.length, 0);
  assert.match(parsed.errors[0].message, /hex/i);
});
