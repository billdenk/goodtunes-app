import test from "node:test";
import assert from "node:assert/strict";
import { resolvePortalPressId, shapeFormats } from "./artistPortal";

test("artist portal press attribution follows shared provenance/default/SKU precedence", () => {
  assert.equal(resolvePortalPressId({
    artist_invited_press_id: "artist-origin",
    artist_default_press_id: "artist-default",
  }, [{ press_id: "sku" }]), "artist-origin");

  assert.equal(resolvePortalPressId({
    artist_default_press_id: "artist-default",
  }, [{ press_id: "sku" }]), "artist-default");

  assert.equal(resolvePortalPressId({}, [{ press_id: "sku" }, { press_id: "sku" }]), "sku");
  assert.equal(resolvePortalPressId({}, [{ press_id: "one" }, { press_id: "two" }]), null);
  assert.equal(resolvePortalPressId({}, []), null);
});

test("artist portal formats expose the resolved name and preserve a genuine null", () => {
  const assigned = shapeFormats(
    { artist_default_press_id: "mrp" },
    [{ id: "vinyl", format: "12_lp", display_name: "Vinyl", active: true, price_cents: 2500, locked_at: null, press_id: null }],
    new Map([["mrp", "Memphis Record Pressing"]]),
  );
  assert.equal(assigned[0].pressName, "Memphis Record Pressing");

  const unassigned = shapeFormats(
    {},
    [{ id: "vinyl", format: "12_lp", display_name: "Vinyl", active: true, price_cents: 2500, locked_at: null, press_id: null }],
  );
  assert.equal(unassigned[0].pressName, null);
});