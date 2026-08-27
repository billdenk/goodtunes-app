// Task #3413 — honest side lengths: press gap spec + side-file masters.
//
// Two failure modes bit real customers:
//   1. The side-length check summed raw track durations with ZERO spacing
//      between tracks, so a side that only fits gap-free passed preflight
//      and came out too long once the press cut its specified gaps (a PMP
//      customer's 20s gaps pushed both sides over).
//   2. Masters delivered as ONE file per side were validated per-song
//      only, so a completely missing track went undetected.
//
// This pins the pure math the route calls:
//   - gapAwareSideSeconds + the gap-aware side_length check (and the
//     acceptance criterion: presses with NO gap spec get byte-identical
//     results),
//   - resolveAudioSpec's interTrackGapSeconds precedence,
//   - parseSilencedetectOutput on canned ffmpeg stderr AND on stderr from
//     a real ffmpeg run over generated fixture audio,
//   - analyzeSideFile: probable-missing-track boundaries, oversized-gap
//     flagging vs the press spec, and measured-length-vs-format-limit.
//
// Node's built-in runner:
//   npx tsx --test server/preflightSideFile.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAudioFromSpecs,
  gapAwareSideSeconds,
  parseSilencedetectOutput,
  interiorSilences,
  analyzeSideFile,
  type AudioStoredSpecs,
  type ValidateAudioFromSpecsOpts,
} from "./validators/preflight";
import { resolveAudioSpec } from "../shared/vendorSpecs";

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

const byKey = (checks: Array<{ key: string }>, key: string) =>
  checks.find((c) => c.key === key) as
    | { key: string; label: string; status: string; message: string }
    | undefined;

// ─── gapAwareSideSeconds: the core math ───────────────────────────────

test("gapAwareSideSeconds: no gap spec = raw sum", () => {
  assert.equal(gapAwareSideSeconds([300, 300, 300], null), 900);
  assert.equal(gapAwareSideSeconds([300, 300, 300], 0), 900);
});

test("gapAwareSideSeconds: gap × (tracks − 1), never per-track", () => {
  assert.equal(gapAwareSideSeconds([300, 300, 300], 10), 900 + 20);
  assert.equal(gapAwareSideSeconds([300], 10), 300, "single track has no gaps");
  assert.equal(gapAwareSideSeconds([], 10), 0, "empty side has no gaps");
});

// ─── Gap-aware side_length check ──────────────────────────────────────
//
// MRP's baseline 12" @ 33 budget is 22:00 (1320s). Ten 130s tracks sum to
// 1300s — fits gap-free, but 9 × 10s of press spacing pushes it to 1390s.

const tenTracks = Array(10).fill(130); // 1300s raw

test("a side that only fits WITHOUT gaps fails once the press gap spec applies", () => {
  const sideBreaks = [{ side: "A", trackTimesSeconds: tenTracks }];
  const gapless = validateAudioFromSpecs(master(), opts({ sideBreaks, audioOverride: null }));
  assert.equal(byKey(gapless, "audio.side_length")!.status, "pass", "1300s fits 1320s gap-free");

  const gapped = validateAudioFromSpecs(
    master(),
    opts({ sideBreaks, audioOverride: { interTrackGapSeconds: 10 } }),
  );
  const check = byKey(gapped, "audio.side_length")!;
  assert.equal(check.status, "fail", "1300s + 9×10s = 1390s must fail the 1320s budget");
  assert.match(check.message, /spacing between tracks/, "the fail message names the gap math");
});

test("a side that fits WITH gaps still passes, and the pass message discloses the spacing", () => {
  const sideBreaks = [{ side: "A", trackTimesSeconds: [300, 300, 300] }]; // 900 + 2×10 = 920s
  const checks = validateAudioFromSpecs(
    master(),
    opts({ sideBreaks, audioOverride: { interTrackGapSeconds: 10 } }),
  );
  const check = byKey(checks, "audio.side_length")!;
  assert.equal(check.status, "pass");
  assert.match(check.message, /10s spacing/, "operators see the gap folded into the number");
});

test("ACCEPTANCE: presses with no gap spec get byte-identical side-length results", () => {
  const sideBreaks = [
    { side: "A", trackTimesSeconds: tenTracks },
    { side: "B", trackTimesSeconds: [400, 400, 700] }, // over budget
  ];
  // No override at all vs an override whose gap field is null — both must
  // produce exactly the messages the pre-gap code produced.
  const before = validateAudioFromSpecs(master(), opts({ sideBreaks, audioOverride: null }));
  const withNullGap = validateAudioFromSpecs(
    master(),
    opts({ sideBreaks, audioOverride: { interTrackGapSeconds: null } }),
  );
  assert.deepEqual(withNullGap, before, "null gap spec must not change a single byte");
  assert.doesNotMatch(
    byKey(before, "audio.side_length")!.message,
    /spacing/,
    "no gap spec → no spacing language",
  );
});

// ─── resolveAudioSpec: gap precedence ─────────────────────────────────

test("resolveAudioSpec: gap comes only from the press row (no vendor baseline ships one)", () => {
  assert.equal(resolveAudioSpec("mrp", null)!.interTrackGapSeconds ?? null, null);
  assert.equal(resolveAudioSpec("pmp", null)!.interTrackGapSeconds ?? null, null);
  assert.equal(resolveAudioSpec("mrp", { interTrackGapSeconds: 10 })!.interTrackGapSeconds, 10);
  assert.equal(
    resolveAudioSpec("pmp", { interTrackGapSeconds: null })!.interTrackGapSeconds ?? null,
    null,
    "blank override field stays no-spec",
  );
});

// ─── parseSilencedetectOutput on canned ffmpeg stderr ─────────────────

const CANNED_STDERR = `
[silencedetect @ 0x55d] silence_start: 245.13
[silencedetect @ 0x55d] silence_end: 255.21 | silence_duration: 10.08
size=N/A time=00:08:00.00 bitrate=N/A speed= 512x
[silencedetect @ 0x55d] silence_start: 490.5
[silencedetect @ 0x55d] silence_end: 512.6 | silence_duration: 22.1
`;

test("parseSilencedetectOutput: pairs starts with ends and keeps durations", () => {
  const silences = parseSilencedetectOutput(CANNED_STDERR);
  assert.equal(silences.length, 2);
  assert.equal(silences[0].start, 245.13);
  assert.equal(silences[0].end, 255.21);
  assert.ok(Math.abs(silences[0].duration - 10.08) < 1e-9);
  assert.ok(Math.abs(silences[1].duration - 22.1) < 1e-9);
});

test("parseSilencedetectOutput: a trailing silence_start closes at the file end", () => {
  const stderr = "[silencedetect @ 0x1] silence_start: 100.0\n";
  assert.deepEqual(parseSilencedetectOutput(stderr, 130), [
    { start: 100, end: 130, duration: 30 },
  ]);
  assert.deepEqual(
    parseSilencedetectOutput(stderr),
    [],
    "without a total duration the unterminated run is dropped, never invented",
  );
});

test("interiorSilences: lead-in and run-out quiet don't count as track gaps", () => {
  const silences = [
    { start: 0, end: 1.8, duration: 1.8 }, // mastered lead-in
    { start: 200, end: 212, duration: 12 }, // real inter-track gap
    { start: 598.7, end: 600, duration: 1.3 }, // run-out
  ];
  const interior = interiorSilences(silences, 600);
  assert.equal(interior.length, 1);
  assert.equal(interior[0].start, 200);
});

// ─── analyzeSideFile: missing-track detection at boundaries ───────────

function sideOpts(over: Partial<Parameters<typeof analyzeSideFile>[1]> = {}) {
  return {
    expectedTrackSeconds: [200, 180, 220, 240], // 840s raw
    gapSeconds: 10 as number | null, // 840 + 3×10 = 870s expected
    maxSideSeconds: 1320 as number | null,
    pressName: "Memphis Record Pressing",
    vinylSize: '12"' as const,
    rpm: 33 as const,
    ...over,
  };
}

test("a side file short by ~one track FAILS with 'a track may be missing'", () => {
  const checks = analyzeSideFile(
    { side: "A", durationSeconds: 870 - 220, silences: [] }, // exactly track 3 absent
    sideOpts(),
  );
  const dur = byKey(checks, "sidefile.duration")!;
  assert.equal(dur.status, "fail");
  assert.match(dur.message, /A track may be missing from Side A/);
  assert.match(dur.message, /please verify/i);
});

test("missing-track boundary: a deficit near (but not exactly) a track length still flags", () => {
  // 180s track missing but the file also trims 15s of expected spacing —
  // deficit 195s is within 25% of the 180s track.
  const checks = analyzeSideFile(
    { side: "B", durationSeconds: 870 - 195, silences: [] },
    sideOpts(),
  );
  assert.equal(byKey(checks, "sidefile.duration")!.status, "fail");
  assert.match(byKey(checks, "sidefile.duration")!.message, /Side B/);
});

test("a small shortfall (under tolerance) passes — mastering trims are not missing tracks", () => {
  const checks = analyzeSideFile(
    { side: "A", durationSeconds: 870 - 6, silences: [] }, // 6s < max(8, 2×4)
    sideOpts(),
  );
  assert.equal(byKey(checks, "sidefile.duration")!.status, "pass");
});

test("a matching side file passes and names the expected total incl. gaps", () => {
  const checks = analyzeSideFile({ side: "A", durationSeconds: 870, silences: [] }, sideOpts());
  const dur = byKey(checks, "sidefile.duration")!;
  assert.equal(dur.status, "pass");
  assert.match(dur.message, /incl\. 10s gaps/);
});

test("a side file LONGER than the tracklist warns (extra material or wide gaps)", () => {
  const checks = analyzeSideFile({ side: "A", durationSeconds: 940, silences: [] }, sideOpts());
  assert.equal(byKey(checks, "sidefile.duration")!.status, "warn");
});

test("no tracks assigned to the side = honest warn, not a fabricated comparison", () => {
  const checks = analyzeSideFile(
    { side: "C", durationSeconds: 500, silences: [] },
    sideOpts({ expectedTrackSeconds: [] }),
  );
  assert.equal(byKey(checks, "sidefile.duration")!.status, "warn");
  assert.match(byKey(checks, "sidefile.duration")!.message, /no tracks are assigned/);
});

test("unmeasurable duration = warn to verify the file, no other duration claims", () => {
  const checks = analyzeSideFile({ side: "A", durationSeconds: null, silences: null }, sideOpts());
  assert.equal(byKey(checks, "sidefile.duration")!.status, "warn");
  assert.equal(byKey(checks, "sidefile.side_length"), undefined, "no measured-length row");
});

// ─── analyzeSideFile: gaps vs the press spacing spec ──────────────────

test("gaps wider than the press spec WARN and report where (the PMP 20s-vs-10s case)", () => {
  const checks = analyzeSideFile(
    {
      side: "A",
      durationSeconds: 900,
      silences: [
        { start: 200, end: 220, duration: 20 },
        { start: 420, end: 441, duration: 21 },
      ],
    },
    sideOpts({ gapSeconds: 10 }),
  );
  const gaps = byKey(checks, "sidefile.gaps")!;
  assert.equal(gaps.status, "warn");
  assert.match(gaps.message, /2 gaps/);
  assert.match(gaps.message, /10s spacing spec/);
  assert.match(gaps.message, /Effective side length/);
});

test("gaps within the spec (incl. the 1s grace) pass", () => {
  const checks = analyzeSideFile(
    {
      side: "A",
      durationSeconds: 880,
      silences: [{ start: 200, end: 210.8, duration: 10.8 }],
    },
    sideOpts({ gapSeconds: 10 }),
  );
  assert.equal(byKey(checks, "sidefile.gaps")!.status, "pass");
});

test("no press gap spec → measured gaps are reported informationally, never flagged", () => {
  const checks = analyzeSideFile(
    {
      side: "A",
      durationSeconds: 840,
      silences: [{ start: 200, end: 225, duration: 25 }],
    },
    sideOpts({ gapSeconds: null, expectedTrackSeconds: [400, 415] }),
  );
  const gaps = byKey(checks, "sidefile.gaps")!;
  assert.equal(gaps.status, "pass");
  assert.match(gaps.message, /No press spacing spec on file/);
});

test("silence scan unavailable (null) → no gaps row at all, never a fake 'no gaps'", () => {
  const checks = analyzeSideFile({ side: "A", durationSeconds: 870, silences: null }, sideOpts());
  assert.equal(byKey(checks, "sidefile.gaps"), undefined);
});

// ─── analyzeSideFile: measured length vs the format limit ─────────────

test("a measured side over the format max FAILS regardless of tracklist math", () => {
  const checks = analyzeSideFile(
    { side: "A", durationSeconds: 1400, silences: [] },
    sideOpts({ expectedTrackSeconds: [700, 690], gapSeconds: 10 }),
  );
  const len = byKey(checks, "sidefile.side_length")!;
  assert.equal(len.status, "fail");
  assert.match(len.message, /exceeds/);
});

test("a measured side under the format max passes with the honest measured number", () => {
  const checks = analyzeSideFile({ side: "A", durationSeconds: 870, silences: [] }, sideOpts());
  assert.equal(byKey(checks, "sidefile.side_length")!.status, "pass");
});

// ─── Fixture audio: real ffmpeg silencedetect through the parser ──────
//
// Generate 16s of audio that is tone for 0–2s, silence for 2–14s, tone for
// 14–16s, run the exact silencedetect invocation the attach route uses, and
// prove the parser reads a ~12s gap out of real ffmpeg stderr.

test("real ffmpeg silencedetect output parses into the measured 12s gap", async (t) => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const os = await import("node:os");
  const path = await import("node:path");
  const fsp = await import("node:fs/promises");
  const run = promisify(execFile);

  const wav = path.join(os.tmpdir(), `gt-sidefile-fixture-${process.pid}.wav`);
  try {
    try {
      await run("ffmpeg", [
        "-y",
        "-f", "lavfi",
        "-i", "aevalsrc=if(between(t\\,2\\,14)\\,0\\,0.5*sin(440*2*PI*t)):d=16",
        "-ar", "44100",
        wav,
      ]);
    } catch {
      t.skip("ffmpeg unavailable — parser is covered by the canned-stderr tests");
      return;
    }
    let stderr = "";
    try {
      await run("ffmpeg", ["-i", wav, "-af", "silencedetect=noise=-50dB:d=1.0", "-f", "null", "-"]);
    } catch (e: any) {
      stderr = e?.stderr ?? "";
    }
    // ffmpeg writes silencedetect lines to stderr even on success.
    if (!stderr) {
      const res = await run("ffmpeg", [
        "-i", wav, "-af", "silencedetect=noise=-50dB:d=1.0", "-f", "null", "-",
      ]).catch((e: any) => ({ stderr: e?.stderr ?? "" }));
      stderr = (res as any).stderr ?? "";
    }
    const silences = parseSilencedetectOutput(stderr, 16);
    assert.equal(silences.length, 1, `expected one silence, stderr was:\n${stderr}`);
    assert.ok(Math.abs(silences[0].duration - 12) < 0.5, `~12s gap, got ${silences[0].duration}`);
    assert.ok(Math.abs(silences[0].start - 2) < 0.5, `starts ~2s, got ${silences[0].start}`);

    // And the analysis flags it against a 10s spec.
    const checks = analyzeSideFile(
      { side: "A", durationSeconds: 16, silences },
      sideOpts({ expectedTrackSeconds: [2, 2], gapSeconds: 10, maxSideSeconds: 60 }),
    );
    assert.equal(byKey(checks, "sidefile.gaps")!.status, "warn");
  } finally {
    try { await fsp.unlink(wav); } catch {}
  }
});
