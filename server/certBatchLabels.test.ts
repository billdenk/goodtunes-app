// Task #3091 — unit tests for the EasyPost label plumbing (pure parts):
// address validation, snapshot mapping, and UPS rate picking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLabelAddress, snapshotToLabelInput } from "./certBatch";
import { pickUpsRate, easypostConfigured } from "./easypost";

test("validateLabelAddress reports every missing required field", () => {
  const r = validateLabelAddress({ name: "A", city: "Austin" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.missing.sort(), ["state", "street1", "zip"]);
});

test("validateLabelAddress trims and defaults country to US", () => {
  const r = validateLabelAddress({
    name: " Jane Manager ",
    street1: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    street2: "  ",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.address.name, "Jane Manager");
    assert.equal(r.address.country, "US");
    assert.equal(r.address.street2, null);
  }
});

test("validateLabelAddress rejects null/undefined input", () => {
  const r = validateLabelAddress(null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.missing.includes("name"));
});

test("snapshotToLabelInput maps PartnerAddressSnapshot fields", () => {
  const input = snapshotToLabelInput("Spinney Media", {
    line1: "9 Dock Rd",
    line2: null,
    city: "Nashville",
    state: "TN",
    postalCode: "37203",
    country: "US",
  });
  const r = validateLabelAddress(input);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.address.name, "Spinney Media");
    assert.equal(r.address.zip, "37203");
  }
});

test("pickUpsRate picks the cheapest UPS rate and ignores other carriers", () => {
  const rate = pickUpsRate([
    { id: "r1", carrier: "USPS", rate: "4.10" },
    { id: "r2", carrier: "UPS", service: "Ground", rate: "9.50" },
    { id: "r3", carrier: "UPSDAP", service: "Ground", rate: "8.20" },
    { id: "r4", carrier: "UPS", service: "NextDayAir", rate: "42.00" },
  ]);
  assert.equal(rate?.id, "r3");
});

test("pickUpsRate returns null when no UPS rates exist (unpinned)", () => {
  delete process.env.EASYPOST_UPS_CARRIER_ACCOUNT_ID;
  assert.equal(pickUpsRate([{ id: "r1", carrier: "USPS", rate: "4.10" }]), null);
});

test("pickUpsRate with pinned carrier account falls back to any returned rate", () => {
  process.env.EASYPOST_UPS_CARRIER_ACCOUNT_ID = "ca_test";
  try {
    const rate = pickUpsRate([{ id: "r1", carrier: "UPS®", rate: "7.00" }]);
    assert.equal(rate?.id, "r1");
  } finally {
    delete process.env.EASYPOST_UPS_CARRIER_ACCOUNT_ID;
  }
});

test("easypostConfigured reflects EASYPOST_API_KEY presence", () => {
  const prev = process.env.EASYPOST_API_KEY;
  delete process.env.EASYPOST_API_KEY;
  assert.equal(easypostConfigured(), false);
  process.env.EASYPOST_API_KEY = "EZTKtest";
  assert.equal(easypostConfigured(), true);
  if (prev === undefined) delete process.env.EASYPOST_API_KEY;
  else process.env.EASYPOST_API_KEY = prev;
});
