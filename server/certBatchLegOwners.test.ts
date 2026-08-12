// Task #3075 — leg ownership resolution + fulfillment service validation.
//
// resolveCertLegOwners: which party owns each physical leg of a signed
// cert batch (print / hologram+shrinkwrap / fulfillment), collapsing
// MRP-style do-it-all presses to a single owner. Pure function — no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCertLegOwners,
  validateFulfillmentGoodDeedService,
} from "./certBatch";

const mrp = { id: "v-mrp", name: "MRP" };
const printer = { id: "v-print", name: "Quickprinter" };
const spinney = { id: "fp-spinney", name: "Spinney Media" };
const dflt = { id: "fp-default", name: "Default Warehouse" };

test("do-it-all press collapses print + hologram to one owner", () => {
  const out = resolveCertLegOwners({
    printVendor: mrp,
    hologramVendor: mrp,
    returnFulfillment: null,
    albumFulfillment: null,
    defaultFulfillment: dflt,
  });
  assert.equal(out.collapsed, true);
  assert.equal(out.legs.length, 2);
  assert.equal(out.legs[0].label, "Print + hologram + shrinkwrap");
  assert.equal(out.legs[0].ownerName, "MRP");
  assert.equal(out.legs[1].leg, "fulfillment");
  assert.equal(out.legs[1].ownerName, "Default Warehouse");
  assert.equal(out.legs[1].source, "platform_default");
});

test("print-only printer: hologram leg falls to the return-label fulfillment co", () => {
  const out = resolveCertLegOwners({
    printVendor: printer,
    hologramVendor: null,
    returnFulfillment: spinney,
    albumFulfillment: null,
    defaultFulfillment: dflt,
  });
  assert.equal(out.collapsed, false);
  assert.equal(out.legs.length, 3);
  const holo = out.legs.find((l) => l.leg === "hologram_shrinkwrap")!;
  assert.equal(holo.ownerKind, "fulfillment_partner");
  assert.equal(holo.ownerName, "Spinney Media");
  assert.equal(holo.source, "return_label");
  const ful = out.legs.find((l) => l.leg === "fulfillment")!;
  assert.equal(ful.ownerName, "Spinney Media");
  assert.equal(ful.source, "return_label");
});

test("distinct hologram vendor stays a separate leg; album routing wins over default", () => {
  const out = resolveCertLegOwners({
    printVendor: printer,
    hologramVendor: mrp,
    returnFulfillment: null,
    albumFulfillment: spinney,
    defaultFulfillment: dflt,
  });
  assert.equal(out.collapsed, false);
  const holo = out.legs.find((l) => l.leg === "hologram_shrinkwrap")!;
  assert.equal(holo.ownerKind, "vendor");
  assert.equal(holo.ownerName, "MRP");
  const ful = out.legs.find((l) => l.leg === "fulfillment")!;
  assert.equal(ful.ownerName, "Spinney Media");
  assert.equal(ful.source, "album_routing");
});

test("nothing assigned: unassigned legs, no crash", () => {
  const out = resolveCertLegOwners({
    printVendor: null,
    hologramVendor: null,
    returnFulfillment: null,
    albumFulfillment: null,
    defaultFulfillment: null,
  });
  assert.equal(out.collapsed, false);
  assert.equal(out.legs.length, 3);
  for (const leg of out.legs) {
    assert.equal(leg.ownerId, null);
    assert.equal(leg.source, null);
  }
});

test("fulfillment service validation: tier rules", () => {
  assert.equal(
    validateFulfillmentGoodDeedService({ active: true, tiers: [{ qty: 25, perUnitCents: 150 }] }),
    null,
  );
  assert.match(validateFulfillmentGoodDeedService({ active: true, tiers: [] }) ?? "", /tier/i);
  assert.match(
    validateFulfillmentGoodDeedService({ active: true, tiers: [{ qty: 0, perUnitCents: 10 }] }) ?? "",
    /qty/i,
  );
  assert.match(
    validateFulfillmentGoodDeedService({
      active: true,
      tiers: [
        { qty: 25, perUnitCents: 10 },
        { qty: 25, perUnitCents: 20 },
      ],
    }) ?? "",
    /Duplicate/i,
  );
  assert.match(
    validateFulfillmentGoodDeedService({ active: "yes", tiers: [{ qty: 25, perUnitCents: 10 }] }) ?? "",
    /boolean/i,
  );
  assert.match(
    validateFulfillmentGoodDeedService({ active: true, tiers: [{ qty: 25, perUnitCents: -1 }] }) ?? "",
    /price/i,
  );
});
