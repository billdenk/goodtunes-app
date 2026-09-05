import assert from "node:assert/strict";
import { test } from "node:test";
import { vinylSwatchSchema } from "./pressComponents";

const base = { id: "legacy", name: "Legacy image", kind: "opaque" as const, base: "#112233", sizes: ['12"'] };

test("vinyl JSONB schema accepts omitted imageReviewed for legacy image imports", () => {
  const parsed = vinylSwatchSchema.parse({ ...base, customImg: "/objects/uploads/legacy.png" });
  assert.equal(parsed.imageReviewed, undefined);
});

test("vinyl JSONB schema persists an explicit reviewed image flag", () => {
  const parsed = vinylSwatchSchema.parse({ ...base, customImg: "/objects/uploads/reviewed.webp", imageReviewed: true });
  assert.equal(parsed.imageReviewed, true);
});

test("vinyl JSONB schema preserves an explicit unresolved flag", () => {
  const parsed = vinylSwatchSchema.parse({ ...base, customImg: "/objects/uploads/pending.png", imageReviewed: false });
  assert.equal(parsed.imageReviewed, false);
});