import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalPhysicalSearch,
  physicalSubTabFromSearch,
  physicalSubTabsFor,
} from "./physicalNavigation";

test("operator Physical navigation exposes Audio, Art and Fulfillment", () => {
  assert.deepEqual(
    physicalSubTabsFor(false).map(({ label }) => label),
    ["Audio", "Art", "Fulfillment"],
  );
});

test("press Physical navigation retains its permission-scoped Downloads tab", () => {
  assert.deepEqual(
    physicalSubTabsFor(true).map(({ label }) => label),
    ["Audio", "Art", "Fulfillment", "Downloads"],
  );
});

test("Physical deep links restore valid nested tabs and default safely", () => {
  assert.equal(physicalSubTabFromSearch("?tab=press&ptab=art"), "art");
  assert.equal(physicalSubTabFromSearch("?tab=press&ptab=fulfillment"), "fulfillment");
  assert.equal(physicalSubTabFromSearch("?tab=press&ptab=unknown"), "audio");
  assert.equal(
    physicalSubTabFromSearch("?tab=press&ptab=downloads", false),
    "audio",
    "operator/artist links cannot select the press-only body",
  );
  assert.equal(
    physicalSubTabFromSearch("?tab=press&ptab=downloads", true),
    "downloads",
    "press links retain the scoped Downloads body",
  );
  assert.equal(
    canonicalPhysicalSearch("?tab=press&ptab=downloads&gtAppearance=dark", false),
    "?tab=press&gtAppearance=dark",
    "unauthorized Downloads links canonicalize without clobbering other state",
  );
  assert.equal(
    canonicalPhysicalSearch("?tab=press&ptab=downloads&gtAppearance=dark", true),
    "?tab=press&ptab=downloads&gtAppearance=dark",
    "press Downloads links stay intact",
  );
});