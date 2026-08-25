// Task #3379 — ERP pricing push unit tests: pure payload parsing (no
// DB, no network), key format, price/format parsing, rate limiter.
// Run: GT_TEST=1 npx tsx --test server/erpPricingPush.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePushKey,
  parsePushPrice,
  parsePushFormat,
  parsePushPayload,
  checkPushRateLimit,
  MAX_PUSH_ROWS,
  PUSH_KEY_PREFIX,
} from "./erpPricingPush";

process.env.TOTP_ENC_KEY = process.env.TOTP_ENC_KEY || "t3379-test-totp-enc-key";

// ─── Key format ──────────────────────────────────────────────────────

test("generatePushKey mints gtpush_<12hex>_<48hex> keys", () => {
  const { keyId, secret, key } = generatePushKey();
  assert.match(keyId, /^[0-9a-f]{12}$/);
  assert.match(secret, /^[0-9a-f]{48}$/);
  assert.equal(key, `${PUSH_KEY_PREFIX}_${keyId}_${secret}`);
  // Two mints never collide.
  assert.notEqual(generatePushKey().key, key);
});

// ─── Price / format parsing ──────────────────────────────────────────

test("parsePushPrice handles numbers and money strings", () => {
  assert.equal(parsePushPrice(2.35), 235);
  assert.equal(parsePushPrice("2.35"), 235);
  assert.equal(parsePushPrice("$2.35"), 235);
  assert.equal(parsePushPrice("1,234.50"), 123450);
  assert.equal(parsePushPrice(0), null);
  assert.equal(parsePushPrice(-3), null);
  assert.equal(parsePushPrice("free"), null);
  assert.equal(parsePushPrice(null), null);
});

test("parsePushFormat accepts canonical ids and loose vocabulary", () => {
  assert.equal(parsePushFormat("12_lp"), "12_lp");
  assert.equal(parsePushFormat("12_double"), "12_double");
  assert.equal(parsePushFormat('12"'), "12_lp");
  assert.equal(parsePushFormat("2LP"), "12_double");
  assert.equal(parsePushFormat("Cassette"), "cassette");
  assert.equal(parsePushFormat("CD"), "cd");
  assert.equal(parsePushFormat('7"'), "7_inch");
  assert.equal(parsePushFormat("8-track"), null);
  assert.equal(parsePushFormat(12), null);
});

// ─── Payload parsing ─────────────────────────────────────────────────

const good = {
  version: 1,
  default_format: "12_lp",
  rows: [
    { tier: "Black", quantity: 300, unit_price: 2.35 },
    { tier: "Black", quantity: 500, unit_price: "2.10" },
    { tier: "Opaque", quantity: 500, total_price: 1275, format: "2LP" },
  ],
};

test("well-formed payload parses to exactly what was sent", () => {
  const p = parsePushPayload(good);
  assert.equal(p.version, 1);
  assert.equal(p.rowsReceived, 3);
  assert.equal(p.errors.length, 0);
  assert.equal(p.warnings.length, 0);
  assert.deepEqual(p.rows, [
    { index: 0, format: "12_lp", tierName: "Black", qty: 300, unitCents: 235 },
    { index: 1, format: "12_lp", tierName: "Black", qty: 500, unitCents: 210 },
    { index: 2, format: "12_double", tierName: "Opaque", qty: 500, unitCents: 255 },
  ]);
});

test("payload-level errors: not an object / version / rows", () => {
  assert.equal(parsePushPayload("nope").errors[0].code, "payload_not_object");
  assert.equal(parsePushPayload([1]).errors[0].code, "payload_not_object");
  assert.equal(parsePushPayload({ rows: [] }).errors[0].code, "version_missing");
  assert.equal(parsePushPayload({ version: 2, rows: [] }).errors[0].code, "unsupported_version");
  const noRows = parsePushPayload({ version: 1 });
  assert.ok(noRows.errors.some((e) => e.code === "rows_missing"));
  const empty = parsePushPayload({ version: 1, rows: [] });
  assert.ok(empty.errors.some((e) => e.code === "rows_empty"));
});

test("too many rows rejects with a payload-level error", () => {
  const rows = Array.from({ length: MAX_PUSH_ROWS + 1 }, (_, i) => ({
    tier: "Black",
    quantity: i + 1,
    unit_price: 2,
    format: "12_lp",
  }));
  const p = parsePushPayload({ version: 1, rows });
  assert.ok(p.errors.some((e) => e.code === "too_many_rows"));
  assert.equal(p.rows.length, 0);
});

test("per-row errors carry index, field, and stable codes", () => {
  const p = parsePushPayload({
    version: 1,
    default_format: "12_lp",
    rows: [
      "not-an-object",
      { quantity: 300, unit_price: 2 },
      { tier: "Black", quantity: 1.5, unit_price: 2 },
      { tier: "Black", quantity: 300 },
      { tier: "Black", quantity: 300, unit_price: 2, total_price: 600 },
      { tier: "Black", quantity: 400, unit_price: "TBD" },
      { tier: "Black", quantity: 500, unit_price: 2, format: "8-track" },
    ],
  });
  const codes = p.errors.map((e) => [e.index, e.code]);
  assert.deepEqual(codes, [
    [0, "row_not_object"],
    [1, "tier_missing"],
    [2, "quantity_invalid"],
    [3, "price_missing"],
    [4, "price_conflict"],
    [5, "price_invalid"],
    [6, "format_unrecognized"],
  ]);
  assert.equal(p.rows.length, 0);
});

test("format falls back to default_format; neither = format_missing", () => {
  const noDefault = parsePushPayload({
    version: 1,
    rows: [{ tier: "Black", quantity: 300, unit_price: 2 }],
  });
  assert.equal(noDefault.errors[0].code, "format_missing");

  const badDefault = parsePushPayload({
    version: 1,
    default_format: "8-track",
    rows: [{ tier: "Black", quantity: 300, unit_price: 2 }],
  });
  assert.ok(badDefault.errors.some((e) => e.field === "default_format" && e.code === "format_unrecognized"));
});

test("duplicate (format,tier,qty) rows are an error, not silently collapsed", () => {
  const p = parsePushPayload({
    version: 1,
    default_format: "12_lp",
    rows: [
      { tier: "Black", quantity: 300, unit_price: 2.0 },
      { tier: "black", quantity: 300, unit_price: 3.0 },
    ],
  });
  assert.equal(p.rows.length, 1);
  assert.equal(p.errors.length, 1);
  assert.equal(p.errors[0].code, "duplicate_row");
  assert.equal(p.errors[0].index, 1);
});

test("total_price divides by quantity; zero-cent unit price errors", () => {
  const p = parsePushPayload({
    version: 1,
    default_format: "12_lp",
    rows: [{ tier: "Black", quantity: 500, total_price: 850 }],
  });
  assert.equal(p.rows[0].unitCents, 170);

  const zero = parsePushPayload({
    version: 1,
    default_format: "12_lp",
    rows: [{ tier: "Black", quantity: 1000, total_price: 0.02 }],
  });
  assert.equal(zero.errors[0].code, "unit_price_zero");
});

test("unknown row fields produce warnings, not errors", () => {
  const p = parsePushPayload({
    version: 1,
    default_format: "12_lp",
    rows: [{ tier: "Black", quantity: 300, unit_price: 2, erp_sku: "MAT-123" }],
  });
  assert.equal(p.errors.length, 0);
  assert.equal(p.rows.length, 1);
  assert.equal(p.warnings.length, 1);
  assert.equal(p.warnings[0].code, "unknown_field");
  assert.match(p.warnings[0].message, /erp_sku/);
});

// ─── Rate limiter ────────────────────────────────────────────────────

test("checkPushRateLimit allows up to max then blocks until the window resets", () => {
  const key = "t3379-limiter-" + Math.random();
  for (let i = 0; i < 5; i++) assert.equal(checkPushRateLimit(key, 5, 60_000), true);
  assert.equal(checkPushRateLimit(key, 5, 60_000), false);
  // A different bucket is unaffected.
  assert.equal(checkPushRateLimit(key + "-other", 5, 60_000), true);
});
