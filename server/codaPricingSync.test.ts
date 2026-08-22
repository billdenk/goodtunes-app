// Task #3310 — Coda pricing sync unit tests: row→rung transform on
// fixture Coda payloads (no live network) + lock-preservation behavior.
// Run: GT_TEST=1 npx tsx --test server/codaPricingSync.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCodaPriceCents,
  parseCodaQty,
  parseCodaFormat,
  transformCodaRows,
  mergeCodaLadder,
  classifyCodaStatus,
  codaErrorMessage,
  CODA_PRICING_SOURCE,
  type CodaRow,
} from "./codaPricingSync";
import type { CodaColumnMapping } from "@shared/schema";

const MAPPING: CodaColumnMapping = {
  tierColumnId: "c-tier",
  qtyColumnId: "c-qty",
  priceColumnId: "c-price",
  priceKind: "unit",
  formatColumnId: "c-format",
  defaultFormat: null,
};

const row = (id: string, values: Record<string, unknown>, name?: string): CodaRow => ({
  id,
  name,
  values,
});

// ─── Cell parsers ────────────────────────────────────────────────────

test("parseCodaPriceCents handles numbers and money strings", () => {
  assert.equal(parseCodaPriceCents(2.35), 235);
  assert.equal(parseCodaPriceCents("$2.35"), 235);
  assert.equal(parseCodaPriceCents("1,234.50"), 123450);
  assert.equal(parseCodaPriceCents("$ 1.70"), 170);
  assert.equal(parseCodaPriceCents(0), null);
  assert.equal(parseCodaPriceCents(-3), null);
  assert.equal(parseCodaPriceCents(""), null);
  assert.equal(parseCodaPriceCents("n/a"), null);
  assert.equal(parseCodaPriceCents(null), null);
});

test("parseCodaQty handles numbers and formatted strings", () => {
  assert.equal(parseCodaQty(300), 300);
  assert.equal(parseCodaQty("1,000"), 1000);
  assert.equal(parseCodaQty("500 units"), 500);
  assert.equal(parseCodaQty(0), null);
  assert.equal(parseCodaQty("qty"), null);
});

test("parseCodaFormat recognizes the format vocabulary", () => {
  assert.equal(parseCodaFormat('12"'), "12_lp");
  assert.equal(parseCodaFormat("12 inch LP"), "12_lp");
  assert.equal(parseCodaFormat("LP"), "12_lp");
  assert.equal(parseCodaFormat("2LP"), "12_double");
  assert.equal(parseCodaFormat("Double LP"), "12_double");
  assert.equal(parseCodaFormat('7"'), "7_inch");
  assert.equal(parseCodaFormat("Cassette"), "cassette");
  assert.equal(parseCodaFormat("CD"), "cd");
  assert.equal(parseCodaFormat("mystery"), null);
  assert.equal(parseCodaFormat(42), null);
});

// ─── transformCodaRows ───────────────────────────────────────────────

test("transform maps well-formed rows into sorted writes", () => {
  const { writes, unmatched } = transformCodaRows(
    [
      row("r1", { "c-tier": "Opaque", "c-qty": 500, "c-price": 2.3, "c-format": '12"' }),
      row("r2", { "c-tier": "Opaque", "c-qty": 300, "c-price": 2.35, "c-format": '12"' }),
      row("r3", { "c-tier": "Black", "c-qty": "1,000", "c-price": "$1.65", "c-format": "LP" }),
    ],
    MAPPING,
  );
  assert.equal(unmatched.length, 0);
  assert.deepEqual(writes, [
    { format: "12_lp", tierName: "Black", qty: 1000, unitCents: 165 },
    { format: "12_lp", tierName: "Opaque", qty: 300, unitCents: 235 },
    { format: "12_lp", tierName: "Opaque", qty: 500, unitCents: 230 },
  ]);
});

test("transform reports bad rows with honest reasons instead of dropping them", () => {
  const { writes, unmatched } = transformCodaRows(
    [
      row("r1", { "c-tier": "", "c-qty": 300, "c-price": 2, "c-format": 'LP' }, "blank tier"),
      row("r2", { "c-tier": "Opaque", "c-qty": "soon", "c-price": 2, "c-format": "LP" }),
      row("r3", { "c-tier": "Opaque", "c-qty": 300, "c-price": "TBD", "c-format": "LP" }),
      row("r4", { "c-tier": "Opaque", "c-qty": 300, "c-price": 2, "c-format": "8-track" }),
    ],
    MAPPING,
  );
  assert.equal(writes.length, 0);
  assert.equal(unmatched.length, 4);
  assert.match(unmatched[0].reason, /tier/i);
  assert.match(unmatched[1].reason, /quantity/i);
  assert.match(unmatched[2].reason, /price/i);
  assert.match(unmatched[3].reason, /format/i);
});

test("priceKind=total divides the run total by quantity", () => {
  const { writes } = transformCodaRows(
    [row("r1", { "c-tier": "Black", "c-qty": 500, "c-price": 850, "c-format": "LP" })],
    { ...MAPPING, priceKind: "total" },
  );
  assert.deepEqual(writes, [{ format: "12_lp", tierName: "Black", qty: 500, unitCents: 170 }]);
});

test("no format column falls back to defaultFormat; neither = unmatched", () => {
  const noFormatCol: CodaColumnMapping = { ...MAPPING, formatColumnId: null, defaultFormat: "7_inch" };
  const { writes } = transformCodaRows(
    [row("r1", { "c-tier": "Black", "c-qty": 300, "c-price": 1.78 })],
    noFormatCol,
  );
  assert.deepEqual(writes, [{ format: "7_inch", tierName: "Black", qty: 300, unitCents: 178 }]);

  const neither: CodaColumnMapping = { ...MAPPING, formatColumnId: null, defaultFormat: null };
  const r = transformCodaRows([row("r1", { "c-tier": "Black", "c-qty": 300, "c-price": 1.78 })], neither);
  assert.equal(r.writes.length, 0);
  assert.match(r.unmatched[0].reason, /default format/i);
});

test("duplicate (format,tier,qty) rows collapse to the median price", () => {
  const { writes } = transformCodaRows(
    [
      row("r1", { "c-tier": "Opaque", "c-qty": 300, "c-price": 2.0, "c-format": "LP" }),
      row("r2", { "c-tier": "opaque", "c-qty": 300, "c-price": 3.0, "c-format": "LP" }),
      row("r3", { "c-tier": "OPAQUE", "c-qty": 300, "c-price": 2.5, "c-format": "LP" }),
    ],
    MAPPING,
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].unitCents, 250);
});

// ─── mergeCodaLadder (lock preservation) ─────────────────────────────

test("merge writes new + updates unlocked rungs with coda provenance", () => {
  const { merged, written, skippedLocked } = mergeCodaLadder(
    [{ qty: 300, unitCents: 999, confirmed: true }],
    [
      { qty: 300, unitCents: 235 },
      { qty: 500, unitCents: 230 },
    ],
    "2026-08-22T00:00:00.000Z",
  );
  assert.equal(written, 2);
  assert.equal(skippedLocked, 0);
  assert.deepEqual(merged, [
    { qty: 300, unitCents: 235, confirmed: true, source: CODA_PRICING_SOURCE, syncedAt: "2026-08-22T00:00:00.000Z" },
    { qty: 500, unitCents: 230, confirmed: true, source: CODA_PRICING_SOURCE, syncedAt: "2026-08-22T00:00:00.000Z" },
  ]);
});

test("lockedFromSync rungs survive a re-sync untouched", () => {
  const locked = {
    qty: 300,
    unitCents: 275,
    confirmed: true,
    source: "mrp-tier3-2025",
    lockedFromSync: true,
  };
  const { merged, written, skippedLocked } = mergeCodaLadder(
    [locked, { qty: 500, unitCents: 260 }],
    [
      { qty: 300, unitCents: 111 }, // must NOT clobber the locked rung
      { qty: 500, unitCents: 230 },
    ],
    "2026-08-22T00:00:00.000Z",
  );
  assert.equal(written, 1);
  assert.equal(skippedLocked, 1);
  assert.deepEqual(merged[0], locked); // byte-identical: value, source, lock all kept
  assert.equal(merged[1].unitCents, 230);
});

test("rungs the sync doesn't mention are left alone", () => {
  const { merged } = mergeCodaLadder(
    [{ qty: 2000, unitCents: 150, confirmed: true, source: "operator" }],
    [{ qty: 300, unitCents: 235 }],
    "2026-08-22T00:00:00.000Z",
  );
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[1], { qty: 2000, unitCents: 150, confirmed: true, source: "operator" });
});

// ─── Error classification ────────────────────────────────────────────

test("Coda HTTP statuses classify into honest error kinds", () => {
  assert.equal(classifyCodaStatus(401), "auth");
  assert.equal(classifyCodaStatus(403), "forbidden");
  assert.equal(classifyCodaStatus(404), "not_found");
  assert.equal(classifyCodaStatus(429), "rate_limit");
  assert.equal(classifyCodaStatus(500), "api");
  assert.match(codaErrorMessage("auth"), /token/i);
  assert.match(codaErrorMessage("not_found"), /doc/i);
});
