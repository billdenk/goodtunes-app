// Task #2346 — prove the per-press AUDIO override is ENFORCED during the
// masters preflight, not merely stored.
//
// Task #2339 already pinned the CRUD + gate for press_audio_specs (the row
// saves, blanks stay NULL, cross-press writes are 403'd). What it did NOT
// prove is that those saved numbers actually change a preflight verdict. The
// masters-preflight route (`POST /api/admin/albums/:id/preflight-masters`)
// reads the row via audioOverrideForVendor() and threads it straight into
// `validateAudioFromSpecs`, which resolves it OVER the measured baseline via
// `resolveAudioSpec`. If the override were read but dropped — or merged with
// the wrong precedence — a master that breaks a plant's cutting limits would
// sail through silently. That is the highest-value gap, so this exercises the
// exact two pure functions the route calls (no DB, no name-matching — the
// route's pressId resolution is covered by #2339 + the storage read; the
// enforcement math is what's untested).
//
// Node's built-in runner, no DB:
//   npx tsx --test server/preflightAudioOverride.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAudioFromSpecs,
  type AudioStoredSpecs,
  type ValidateAudioFromSpecsOpts,
} from "./validators/preflight";
import { resolveAudioSpec } from "../shared/vendorSpecs";

// A clean 24-bit / 96 kHz WAV master — conforms to anything we throw at it
// below unless a test deliberately weakens one field.
function master(over: Partial<AudioStoredSpecs> = {}): AudioStoredSpecs {
  return {
    format: "pcm_s24le",
    containerExt: ".wav",
    sampleRate: 96000,
    bitDepth: 24,
    bytes: 10_000_000,
    channels: 2,
    duration: 180,
    ...over,
  };
}

function opts(over: Partial<ValidateAudioFromSpecsOpts> = {}): ValidateAudioFromSpecsOpts {
  return {
    vendorId: "mrp",
    vinylSize: '12"',
    rpm: 33,
    fileName: "01 Track.wav",
    ...over,
  };
}

// Pull a single check by key so assertions don't depend on ordering.
const byKey = (checks: ReturnType<typeof validateAudioFromSpecs>, key: string) =>
  checks.find((c) => c.key === key);

// ─── Bit depth: an override adds a limit the baseline didn't have ─────
//
// MRP's measured baseline has requiredBitDepth: null ("high-res WAV" with no
// number), so WITHOUT an override a 16-bit master raises no bit-depth check
// at all. The override must turn that into a hard FAIL.

test("override bit depth FLAGS a master below it (baseline had no bit-depth rule)", () => {
  const checks = validateAudioFromSpecs(
    master({ bitDepth: 16 }),
    opts({ audioOverride: { requiredBitDepth: 24 } }),
  );
  const bd = byKey(checks, "audio.bit_depth");
  assert.ok(bd, "the override introduces a bit-depth check");
  assert.equal(bd!.status, "fail", "16-bit must fail a 24-bit override");
});

test("without the override, the same 16-bit master raises no bit-depth check (proves the override is what flags it)", () => {
  const checks = validateAudioFromSpecs(master({ bitDepth: 16 }), opts({ audioOverride: null }));
  assert.equal(
    byKey(checks, "audio.bit_depth"),
    undefined,
    "MRP baseline has no bit-depth minimum, so nothing flags a 16-bit master",
  );
});

test("a conforming 24-bit master passes the bit-depth override", () => {
  const checks = validateAudioFromSpecs(
    master({ bitDepth: 24 }),
    opts({ audioOverride: { requiredBitDepth: 24 } }),
  );
  assert.equal(byKey(checks, "audio.bit_depth")!.status, "pass");
});

// ─── Sample rate: same story — no plant publishes a baseline minimum ──

test("override sample rate FLAGS a master below it", () => {
  const checks = validateAudioFromSpecs(
    master({ sampleRate: 44100 }),
    opts({ audioOverride: { requiredSampleRateHz: 96000 } }),
  );
  const sr = byKey(checks, "audio.sample_rate");
  assert.equal(sr!.status, "fail", "44.1 kHz must fail a 96 kHz override");
});

test("a conforming 96 kHz master passes the sample-rate override", () => {
  const checks = validateAudioFromSpecs(
    master({ sampleRate: 96000 }),
    opts({ audioOverride: { requiredSampleRateHz: 96000 } }),
  );
  assert.equal(byKey(checks, "audio.sample_rate")!.status, "pass");
});

// ─── Per-side length: a TIGHTER override beats the baseline budget ────
//
// MRP's baseline 12" @ 33 budget is 22:00 (1320s). A 15:00 (900s) side fits
// the baseline but must fail a 10:00 (600s) override — proving the override
// value wins over the baseline cell, not the other way round.

test("a tighter per-side override FLAGS a side that fits the baseline", () => {
  const sideBreaks = [{ side: "A", trackTimesSeconds: [300, 300, 300] }]; // 900s
  const baseline = validateAudioFromSpecs(master(), opts({ sideBreaks, audioOverride: null }));
  assert.equal(
    byKey(baseline, "audio.side_length")!.status,
    "pass",
    "900s fits MRP's baseline 1320s budget",
  );

  const overridden = validateAudioFromSpecs(
    master(),
    opts({ sideBreaks, audioOverride: { maxSideSeconds: { '12"': { 33: 600 } } } }),
  );
  assert.equal(
    byKey(overridden, "audio.side_length")!.status,
    "fail",
    "the same 900s side must fail the tighter 600s override",
  );
});

test("a side within the per-side override passes", () => {
  const sideBreaks = [{ side: "A", trackTimesSeconds: [200, 200] }]; // 400s < 600s
  const checks = validateAudioFromSpecs(
    master(),
    opts({ sideBreaks, audioOverride: { maxSideSeconds: { '12"': { 33: 600 } } } }),
  );
  assert.equal(byKey(checks, "audio.side_length")!.status, "pass");
});

// ─── Blank override field falls back to the BASELINE, never "no limit" ─
//
// PMP's baseline requiredBitDepth is 24. An override that leaves bit depth
// blank (null) must NOT erase that rule — a 16-bit master still fails. This
// is the precedence trap the task calls out: blank ≠ unlimited.

test("a blank override field inherits the baseline limit (not 'no limit')", () => {
  const checks = validateAudioFromSpecs(
    master({ bitDepth: 16 }),
    opts({
      vendorId: "pmp",
      // Bit depth left blank; only sample rate set. The PMP baseline's
      // 24-bit rule must still apply.
      audioOverride: { requiredBitDepth: null, requiredSampleRateHz: 96000 },
    }),
  );
  assert.equal(
    byKey(checks, "audio.bit_depth")!.status,
    "fail",
    "blank bit-depth override must inherit PMP's 24-bit baseline, not disable it",
  );
});

// ─── resolveAudioSpec precedence (the merge the route depends on) ─────

test("resolveAudioSpec: a set override wins over a null baseline", () => {
  const resolved = resolveAudioSpec("mrp", { requiredBitDepth: 24 });
  assert.equal(resolved!.requiredBitDepth, 24, "override 24 wins over MRP's null baseline");
});

test("resolveAudioSpec: a blank override field inherits the baseline", () => {
  const resolved = resolveAudioSpec("pmp", { requiredBitDepth: null });
  assert.equal(resolved!.requiredBitDepth, 24, "null override inherits PMP's 24-bit baseline");
});

test("resolveAudioSpec: no override at all returns the untouched baseline", () => {
  assert.equal(resolveAudioSpec("mrp", null)!.requiredBitDepth, null);
  assert.equal(resolveAudioSpec("pmp", null)!.requiredBitDepth, 24);
});

test("resolveAudioSpec: a per-side override replaces only the cell it sets", () => {
  const resolved = resolveAudioSpec("mrp", { maxSideSeconds: { '12"': { 33: 600 } } });
  const table = resolved!.maxSideSecondsBySizeRpm!;
  assert.equal(table['12"']![33], 600, "the overridden 33 RPM cell wins");
  assert.equal(table['12"']![45], 16 * 60, "the un-overridden 45 RPM cell keeps the baseline");
  assert.equal(table['7"']![33], 8 * 60, "untouched sizes keep their baseline budget");
});
