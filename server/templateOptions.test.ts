// Task #3065 — template option detection + custom-slot helper units.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectOptionsInText,
  isKnownOptionSet,
  customSlotKeyFromName,
  iconKindForSlotName,
  CUSTOM_SLOT_KEY_RE,
} from "./templateOptions";

test("detects both hole options when both are mentioned", () => {
  const text = "SIDE A\nSmall hole (spindle)\nLarge hole cutout guide\nSIDE B";
  const opts = detectOptionsInText(text);
  assert.deepEqual(
    opts.map((o) => o.key).sort(),
    ["large_hole", "small_hole"],
  );
});

test("big hole wording counts as large hole", () => {
  const opts = detectOptionsInText("small hole guide … big hole cutout");
  assert.equal(opts.length, 2);
});

test("conservative: one option alone is not a multi-option template", () => {
  assert.deepEqual(detectOptionsInText("Small hole only, 0.286 in spindle"), []);
  assert.deepEqual(detectOptionsInText("large hole 1.5in"), []);
});

test("no options in plain template text", () => {
  assert.deepEqual(detectOptionsInText("12 inch jacket. Bleed 0.125 in. Spine 3mm."), []);
  assert.deepEqual(detectOptionsInText(""), []);
});

test("isKnownOptionSet accepts only complete known families", () => {
  const both = [
    { key: "small_hole", label: "Small hole" },
    { key: "large_hole", label: "Large hole" },
  ];
  assert.equal(isKnownOptionSet(both), true);
  assert.equal(isKnownOptionSet([both[0]] as any), false);
  assert.equal(isKnownOptionSet([{ key: "x", label: "X" }, { key: "y", label: "Y" }]), false);
});

test("customSlotKeyFromName slugs and matches the route regex", () => {
  const key = customSlotKeyFromName("Hype sticker (front)");
  assert.equal(key, "custom_hype_sticker_front");
  assert.ok(CUSTOM_SLOT_KEY_RE.test(key));
  assert.ok(CUSTOM_SLOT_KEY_RE.test(customSlotKeyFromName("  ***  ")));
});

test("iconKindForSlotName keyword mapping", () => {
  assert.equal(iconKindForSlotName("Hype sticker"), "labels");
  assert.equal(iconKindForSlotName("Lyric insert card"), "booklet");
  assert.equal(iconKindForSlotName("Poly bag sleeve"), "sleeve");
  assert.equal(iconKindForSlotName("Slipcase wrap"), "jacket");
});
