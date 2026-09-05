import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generatedVinylReplacement, isUnresolvedVinylImage, keepVinylImage,
  replaceVinylImage, unresolvedVinylImageCount, validateVinylImageUpload,
  openImageRepresentation, buildWithColors, keepImageMode,
  canDismissVinylImageUpload, canSaveGeneratedVinylRepresentation,
} from "./vinylImageRepresentation";

test("legacy custom images are unresolved while reviewed images are not", () => {
  assert.equal(isUnresolvedVinylImage({ customImg: "/objects/uploads/legacy.png" }), true);
  assert.equal(isUnresolvedVinylImage({ customImg: "/objects/uploads/pending.png", imageReviewed: false }), true);
  assert.equal(isUnresolvedVinylImage({ customImg: "/objects/uploads/ok.png", imageReviewed: true }), false);
  assert.equal(unresolvedVinylImageCount([{ customImg: "a" }, { customImg: "b", imageReviewed: true }]), 1);
});

test("opening and canceling stay image-centered; conversion is an explicit local mode", () => {
  assert.deepEqual(openImageRepresentation(), { conversionMode: false, compareOpen: false });
  assert.deepEqual(buildWithColors(), { conversionMode: true, compareOpen: true });
  assert.deepEqual(keepImageMode(), { conversionMode: false, compareOpen: false });
  assert.equal(canSaveGeneratedVinylRepresentation(true, false), false, "an image cannot become generated before Build with colors");
  assert.equal(canSaveGeneratedVinylRepresentation(true, true), true);
  assert.equal(canSaveGeneratedVinylRepresentation(false, false), true);
});

test("an in-flight image upload cannot be dismissed into a late save", () => {
  assert.equal(canDismissVinylImageUpload(false), true);
  assert.equal(canDismissVinylImageUpload(true), false);
});

test("keep, replacement, and generated transitions preserve identity and resolve", () => {
  const legacy = { id: "same-color", customImg: "old" };
  assert.deepEqual(keepVinylImage(legacy), { id: "same-color", customImg: "old", imageReviewed: true });
  assert.deepEqual(replaceVinylImage(legacy, "new"), { id: "same-color", customImg: "new", imageReviewed: true });
  assert.deepEqual(generatedVinylReplacement(legacy), { id: "same-color" });
  assert.deepEqual(legacy, { id: "same-color", customImg: "old" }, "pure helpers leave cancel/source state untouched");
  assert.equal(unresolvedVinylImageCount([keepVinylImage(legacy)]), 0, "keeping the last image removes its queue badge");
  assert.equal(unresolvedVinylImageCount([replaceVinylImage(legacy, "new")]), 0, "replacing the last image removes its queue badge");
  assert.equal(unresolvedVinylImageCount([generatedVinylReplacement(legacy)]), 0, "generating the last image removes its queue badge");
});

test("only transparent-safe PNG/WebP uploads under 2 MB are accepted", () => {
  assert.equal(validateVinylImageUpload({ type: "image/png", size: 2 * 1024 * 1024 }), null);
  assert.equal(validateVinylImageUpload({ type: "image/webp", size: 10 }), null);
  assert.match(validateVinylImageUpload({ type: "image/jpeg", size: 10 })!, /PNG or WebP/);
  assert.match(validateVinylImageUpload({ type: "", size: 10 })!, /PNG or WebP/);
  assert.match(validateVinylImageUpload({ type: "image/png", size: 2 * 1024 * 1024 + 1 })!, /2 MB/);
});