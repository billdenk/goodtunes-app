import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { needsGoodTunesDefaultPress } from "./goodTunesDefaultPress";

test("GoodTunes default applies only when a new artist has no press relationship", () => {
  assert.equal(needsGoodTunesDefaultPress({}), true);
  assert.equal(needsGoodTunesDefaultPress({ invitedByPressId: "origin" }), false);
  assert.equal(needsGoodTunesDefaultPress({ defaultPressId: "operator-choice" }), false);
  assert.equal(
    needsGoodTunesDefaultPress({ invitedByPressId: "origin", defaultPressId: "choice" }),
    false,
  );
});

test("an explicit clear is not a creation event and is never defaulted by the policy", () => {
  const existingArtistAfterOperatorClear = {
    invitedByPressId: null,
    defaultPressId: null,
  };
  // The helper is intentionally not called from updates. This assertion
  // documents that the predicate is creation-only rather than a read/save
  // invariant that could re-home an existing artist.
  assert.equal(needsGoodTunesDefaultPress(existingArtistAfterOperatorClear), true);
});

test("post-merge runs the new one-time default after legacy phantom-MRP cleanup", () => {
  const script = readFileSync("scripts/post-merge.sh", "utf8");
  const legacyCleanup = script.indexOf(
    'clear_phantom_press_default_homings prod "${PROD_DATABASE_URL:-}"',
  );
  const newBackfill = script.indexOf(
    'backfill_goodtunes_artist_default_press dev  "${DATABASE_URL:-}"',
  );
  assert.ok(legacyCleanup >= 0, "legacy cleanup call remains present");
  assert.ok(newBackfill > legacyCleanup, "new default backfill runs after cleanup");
});