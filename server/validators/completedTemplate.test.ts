import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { scanBuffer, validateCompletedComponent, measuredBleedInches } from "./completedTemplate";
import {
  requiredFinishedComponents,
  resolveFinishedComponents,
  completedTemplateConfigToAlbumFormat,
  type CompletedTemplateConfig,
  type PressTemplateSpecRow,
} from "@shared/vendorSpecs";
import { rollupStatus } from "@shared/uploadValidation";

// MRP · 2LP · old-style gatefold · printed inners · 4-color labels — the
// confirmed Nick Carter 2LP configuration whose real print-ready files the
// MEASURED_TEMPLATE_ARTBOARDS were taken from.
const CFG: CompletedTemplateConfig = {
  size: '12"',
  discs: 2,
  jacket: "gatefold_oldstyle",
  innerSleeves: "printed",
  labelColor: "process-4c",
};
const SPECS = Object.fromEntries(
  requiredFinishedComponents("mrp", CFG).map((s) => [s.id, s]),
);

// Build a tiny synthetic PDF whose tokens the latin1 scanner reads exactly
// like a real file: `pages` MediaBoxes at w×h inches, plus the requested
// color/font/dieline tokens. Sizes are written in points (×72).
function fakePdf(opts: {
  pages: number;
  wIn: number;
  hIn: number;
  color?: "cmyk" | "rgb" | "spot" | "cmyk+spot";
  fonts?: "embedded" | "live-unembedded" | "outlined";
  dieline?: boolean;
  imageDims?: { w: number; h: number }[];
}): Buffer {
  const w = (opts.wIn * 72).toFixed(4);
  const h = (opts.hIn * 72).toFixed(4);
  const colorTok =
    opts.color === "rgb" ? "/DeviceRGB" :
    opts.color === "spot" ? "/Separation" :
    opts.color === "cmyk+spot" ? "/DeviceCMYK /Separation" :
    opts.color === "cmyk" ? "/DeviceCMYK" : "";
  const fontTok =
    opts.fonts === "embedded" ? "/BaseFont /Helvetica /FontFile2 9" :
    opts.fonts === "live-unembedded" ? "/Type /Font /BaseFont /Helvetica" : "";
  let s = "%PDF-1.6\n";
  for (let i = 0; i < opts.pages; i++) {
    s += `/Type /Page /MediaBox [ 0 0 ${w} ${h} ] /TrimBox [ 0 0 ${w} ${h} ]\n${colorTok}\n${fontTok}\n`;
    if (opts.dieline) s += "/OCG /Name (Dieline) /template-do-not-print\n";
  }
  for (const d of opts.imageDims ?? []) {
    s += `/Subtype /Image /Width ${d.w} /Height ${d.h}\n`;
  }
  s += "%%EOF";
  return Buffer.from(s, "latin1");
}

describe("CompletedPdfScanner", () => {
  test("counts /Type /Page, ignoring /Type /Pages and partial chunks", () => {
    const buf = fakePdf({ pages: 4, wIn: 6.5, hIn: 7.6811, color: "cmyk" });
    const whole = scanBuffer(buf);
    assert.equal(whole.isPdf, true);
    assert.equal(whole.pageCount, 4);
    assert.equal(whole.mediaBoxCount, 4);
    // The carry overlap must hold even when tokens are split across the
    // smallest possible chunk boundary.
    const byByte = scanBuffer(buf, { chunk: 1 });
    assert.equal(byByte.pageCount, 4);
    assert.equal(byByte.pageSizesInches.length, 4);
  });

  test("reads MediaBox dimensions in inches", () => {
    const scan = scanBuffer(fakePdf({ pages: 1, wIn: 27.25, hIn: 27.0, color: "cmyk+spot" }));
    assert.ok(Math.abs(scan.pageSizesInches[0].w - 27.25) < 1e-4);
    assert.ok(Math.abs(scan.pageSizesInches[0].h - 27.0) < 1e-4);
    assert.equal(scan.hasCMYK, true);
    assert.equal(scan.hasSpot, true);
  });

  test("non-PDF bytes are not flagged as PDF", () => {
    const scan = scanBuffer(Buffer.from("this is plainly not a pdf", "latin1"));
    assert.equal(scan.isPdf, false);
  });
});

describe("validateCompletedComponent", () => {
  test("correct label file (6.5×7.6811 ×4, CMYK) passes every check", () => {
    const scan = scanBuffer(fakePdf({ pages: 4, wIn: 6.5, hIn: 7.6811, color: "cmyk+spot", fonts: "embedded" }));
    const checks = validateCompletedComponent(scan, SPECS["labels"]);
    assert.equal(checks.find((c) => c.key === "tmpl.pages")!.status, "pass");
    assert.equal(checks.find((c) => c.key === "tmpl.size")!.status, "pass");
    assert.equal(checks.find((c) => c.key === "tmpl.color")!.status, "pass");
    assert.equal(checks.find((c) => c.key === "tmpl.fonts")!.status, "pass");
    assert.notEqual(rollupStatus(checks), "fail");
  });

  test("wrong artboard size fails (and blocks) against an exact template", () => {
    const scan = scanBuffer(fakePdf({ pages: 4, wIn: 7, hIn: 7, color: "cmyk" }));
    const checks = validateCompletedComponent(scan, SPECS["labels"]);
    assert.equal(checks.find((c) => c.key === "tmpl.size")!.status, "fail");
    assert.equal(rollupStatus(checks), "fail");
  });

  test("wrong page/face count fails", () => {
    const scan = scanBuffer(fakePdf({ pages: 2, wIn: 6.5, hIn: 7.6811, color: "cmyk" }));
    const checks = validateCompletedComponent(scan, SPECS["labels"]);
    assert.equal(checks.find((c) => c.key === "tmpl.pages")!.status, "fail");
  });

  test("RGB-only labels fail the 4-color process check", () => {
    const scan = scanBuffer(fakePdf({ pages: 4, wIn: 6.5, hIn: 7.6811, color: "rgb" }));
    const checks = validateCompletedComponent(scan, SPECS["labels"]);
    assert.equal(checks.find((c) => c.key === "tmpl.color")!.status, "fail");
  });

  test("spot-only labels fail (and block) the 4-color process check", () => {
    // A 4-color label slot supplied as a 1-color spot imprint (no CMYK) is the
    // wrong process — it must BLOCK the roll-up, not merely warn, so a
    // spot-only file can never report "Ready to send".
    const scan = scanBuffer(fakePdf({ pages: 4, wIn: 6.5, hIn: 7.6811, color: "spot", fonts: "embedded" }));
    const checks = validateCompletedComponent(scan, SPECS["labels"]);
    assert.equal(checks.find((c) => c.key === "tmpl.color")!.status, "fail");
    assert.equal(rollupStatus(checks), "fail");
  });

  test("CMYK + embedded RGB preview still passes (CMYK wins)", () => {
    // A PDF with both DeviceCMYK and DeviceRGB (RGB thumbnail) is the common
    // real case — must not fail on the RGB presence.
    const buf = Buffer.concat([
      fakePdf({ pages: 1, wIn: 27.25, hIn: 27.0, color: "cmyk" }),
      Buffer.from("/DeviceRGB preview\n", "latin1"),
    ]);
    const checks = validateCompletedComponent(scanBuffer(buf), SPECS["jacket"]);
    assert.equal(checks.find((c) => c.key === "tmpl.color")!.status, "pass");
  });

  test("outlined type (no font dicts) passes the font check", () => {
    const scan = scanBuffer(fakePdf({ pages: 1, wIn: 27.25, hIn: 27.0, color: "cmyk", fonts: "outlined" }));
    const checks = validateCompletedComponent(scan, SPECS["jacket"]);
    assert.equal(checks.find((c) => c.key === "tmpl.fonts")!.status, "pass");
  });

  test("live text with no embedded font program fails the font check", () => {
    const scan = scanBuffer(fakePdf({ pages: 1, wIn: 27.25, hIn: 27.0, color: "cmyk", fonts: "live-unembedded" }));
    const checks = validateCompletedComponent(scan, SPECS["jacket"]);
    assert.equal(checks.find((c) => c.key === "tmpl.fonts")!.status, "fail");
  });

  test("dieline token is advisory (warn), never a blocker", () => {
    const scan = scanBuffer(fakePdf({ pages: 1, wIn: 27.25, hIn: 27.0, color: "cmyk", fonts: "outlined", dieline: true }));
    const checks = validateCompletedComponent(scan, SPECS["jacket"]);
    assert.equal(checks.find((c) => c.key === "tmpl.dieline")!.status, "warn");
    // Everything else passes → roll-up is "warn" (still sendable), not fail.
    assert.equal(rollupStatus(checks), "warn");
  });

  // ── Task #2705 — min-PPI advisory: orientation-safe lower-bound math ──
  const RECT_SPEC = {
    ...SPECS["jacket"],
    minPpi: 300,
    templatePageInches: { w: 10, h: 20 },
  };
  const rectPdf = (imageDims: { w: number; h: number }[]) =>
    scanBuffer(fakePdf({ pages: 1, wIn: 10, hIn: 20, color: "cmyk", fonts: "outlined", imageDims }));
  const ppiCheck = (dims: { w: number; h: number }[]) =>
    validateCompletedComponent(rectPdf(dims), RECT_SPEC).find((c) => c.key === "tmpl.min_ppi")!;

  test("min-PPI: square image on a rectangular target must NOT falsely pass", () => {
    // 1000×1000 px on a 10×20 in artboard is at best 50 PPI (constrained by
    // the 20 in axis) — the old formula fabricated 100 PPI. Must warn.
    const c = ppiCheck([{ w: 1000, h: 1000 }]);
    assert.equal(c.status, "warn");
    assert.match(c.message, /50 PPI/);
  });

  test("min-PPI: per-orientation estimate uses the constrained axis", () => {
    // 3200×6200 px on 10×20 in: w-axis 320, h-axis 310 → lower bound 310.
    const c = ppiCheck([{ w: 3200, h: 6200 }]);
    assert.equal(c.status, "pass");
    assert.match(c.message, /310 PPI/);
  });

  test("min-PPI: rotated placement (90°) is allowed the better orientation", () => {
    // 6200×3200 px is the same image rotated — must yield the same 310 PPI.
    const c = ppiCheck([{ w: 6200, h: 3200 }]);
    assert.equal(c.status, "pass");
    assert.match(c.message, /310 PPI/);
  });

  test("min-PPI: below-minimum image warns (advisory, never blocks)", () => {
    const checks = validateCompletedComponent(rectPdf([{ w: 500, h: 1000 }]), RECT_SPEC);
    const c = checks.find((x) => x.key === "tmpl.min_ppi")!;
    assert.equal(c.status, "warn");
    assert.notEqual(rollupStatus(checks), "fail");
  });

  test("min-PPI: no measurable images warns, spec without minPpi skips the check", () => {
    const none = validateCompletedComponent(rectPdf([]), RECT_SPEC);
    assert.equal(none.find((x) => x.key === "tmpl.min_ppi")!.status, "warn");
    const off = validateCompletedComponent(rectPdf([{ w: 100, h: 100 }]), {
      ...RECT_SPEC,
      minPpi: undefined,
    });
    assert.equal(off.find((x) => x.key === "tmpl.min_ppi"), undefined);
  });

  test("non-PDF link returns a single filetype failure", () => {
    const scan = scanBuffer(Buffer.from("<html>not a pdf</html>", "latin1"));
    const checks = validateCompletedComponent(scan, SPECS["labels"]);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].key, "tmpl.filetype");
    assert.equal(checks[0].status, "fail");
  });
});

// ─── Task #2109 expansion — catalog-stored, operator-editable specs ──────
describe("completedTemplateConfigToAlbumFormat", () => {
  test("maps size + disc count to the catalog format key", () => {
    assert.equal(completedTemplateConfigToAlbumFormat({ ...CFG, size: '7"', discs: 1 }), "7_inch");
    assert.equal(completedTemplateConfigToAlbumFormat({ ...CFG, size: '12"', discs: 1 }), "12_lp");
    assert.equal(completedTemplateConfigToAlbumFormat({ ...CFG, size: '12"', discs: 2 }), "12_double");
    // 10" has no catalog format yet → no stored specs, baseline only.
    assert.equal(completedTemplateConfigToAlbumFormat({ ...CFG, size: '10"', discs: 1 }), null);
  });
});

describe("resolveFinishedComponents — catalog specs merged over baseline", () => {
  const baseline = requiredFinishedComponents("mrp", CFG);
  const baseJacket = baseline.find((s) => s.id === "jacket")!;
  const row = (over: Partial<PressTemplateSpecRow>): PressTemplateSpecRow => ({
    format: "12_double",
    componentKey: "jacket",
    variantKey: "gatefold_oldstyle",
    discCount: 0,
    artboardWInches: null,
    artboardHInches: null,
    expectedPages: null,
    color: null,
    ...over,
  });

  test("no store rows → identical to the measured baseline", () => {
    assert.deepEqual(
      resolveFinishedComponents({ vendorId: "mrp", config: CFG, storeRows: [] }),
      baseline,
    );
  });

  test("a matching row overrides the artboard dims, leaving siblings alone", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [row({ artboardWInches: 28.5, artboardHInches: 27.5 })],
    });
    assert.deepEqual(resolved.find((s) => s.id === "jacket")!.templatePageInches, { w: 28.5, h: 27.5 });
    assert.deepEqual(
      resolved.find((s) => s.id === "labels")!.templatePageInches,
      baseline.find((s) => s.id === "labels")!.templatePageInches,
    );
  });

  test("rows for a different format are ignored", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [row({ format: "12_lp", artboardWInches: 99, artboardHInches: 99 })],
    });
    assert.deepEqual(resolved.find((s) => s.id === "jacket")!.templatePageInches, baseJacket.templatePageInches);
  });

  test("a half-specified row never overrides sizing but still overrides pages/color", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [row({ artboardWInches: 28.5, artboardHInches: null, expectedPages: 3, color: "process-4c" })],
    });
    const jacket = resolved.find((s) => s.id === "jacket")!;
    assert.deepEqual(jacket.templatePageInches, baseJacket.templatePageInches);
    assert.equal(jacket.expectedPages, 3);
    assert.equal(jacket.color, "process-4c");
  });

  test("an exact disc-count row wins over a generic (discCount 0) row", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [
        row({ discCount: 0, artboardWInches: 10, artboardHInches: 10 }),
        row({ discCount: 2, artboardWInches: 20, artboardHInches: 20 }),
      ],
    });
    assert.deepEqual(resolved.find((s) => s.id === "jacket")!.templatePageInches, { w: 20, h: 20 });
  });

  test("a variant-specific jacket row wins over a variant-less ('') fallback", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [
        row({ variantKey: "", artboardWInches: 30, artboardHInches: 30 }),
        row({ variantKey: "gatefold_oldstyle", artboardWInches: 40, artboardHInches: 40 }),
      ],
    });
    assert.deepEqual(resolved.find((s) => s.id === "jacket")!.templatePageInches, { w: 40, h: 40 });
  });

  test("a variant-less ('') row applies when no variant-specific row exists", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [row({ variantKey: "", artboardWInches: 31, artboardHInches: 31 })],
    });
    assert.deepEqual(resolved.find((s) => s.id === "jacket")!.templatePageInches, { w: 31, h: 31 });
  });
});

// ─── Task #3012 — press-specific print-rule fields + checks ──────────────

// fakePdf variant with an explicit smaller TrimBox (bleed = (media−trim)/2)
// plus optional bitmap images, separation names, gray/SMask tokens.
function bleedPdf(opts: {
  wIn: number;
  hIn: number;
  trimWIn?: number;
  trimHIn?: number;
  noTrim?: boolean;
  color?: string; // raw tokens appended per page
  imageDims?: { w: number; h: number; bitmap?: boolean; smask?: boolean }[];
  sepNames?: string[];
}): Buffer {
  const w = (opts.wIn * 72).toFixed(4);
  const h = (opts.hIn * 72).toFixed(4);
  const tw = ((opts.trimWIn ?? opts.wIn) * 72).toFixed(4);
  const th = ((opts.trimHIn ?? opts.hIn) * 72).toFixed(4);
  let s = "%PDF-1.6\n";
  s += `/Type /Page /MediaBox [ 0 0 ${w} ${h} ]`;
  if (!opts.noTrim) s += ` /TrimBox [ 0 0 ${tw} ${th} ]`;
  s += `\n${opts.color ?? "/DeviceCMYK"}\n`;
  for (const n of opts.sepNames ?? []) s += `/Separation /${n} /DeviceCMYK\n`;
  for (const d of opts.imageDims ?? []) {
    s += `/Subtype /Image /Width ${d.w} /Height ${d.h}`;
    if (d.bitmap) s += " /BitsPerComponent 1";
    if (d.smask) s += " /SMask 12 0 R";
    s += "\n";
  }
  s += "%%EOF";
  return Buffer.from(s, "latin1");
}

const MRP_RULES = {
  bleedMinInches: 0.125,
  bleedRecommendedInches: 0.25,
  safetyMarginInches: 0.125,
  minPpi: 300,
  minPpiBitmap: 800,
  pantoneOnly: true,
  placedImageRule: "No GIF or PNG-sourced images.",
  advisories: ["Keep text inside the safety area."],
} as const;

// A loose jacket-like spec (no exact template artboard) carrying MRP rules.
const RULED_SPEC = {
  ...SPECS["jacket"],
  // Pin the placement basis so PPI expectations below are deterministic.
  templatePageInches: { w: 12.75, h: 12.75 },
  expectedPages: 0,
  printRules: { ...MRP_RULES },
  pressName: "Memphis Record Pressing",
} as any;

const find = (checks: { key: string }[], key: string) =>
  checks.find((c) => c.key === key) as any;

describe("Task #3012 — bleed measurement + tiers", () => {
  test("measuredBleedInches reads (media−trim)/2; null without a TrimBox", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 }));
    assert.ok(Math.abs(measuredBleedInches(scan)! - 0.25) < 1e-3);
    assert.equal(measuredBleedInches(scanBuffer(bleedPdf({ wIn: 12, hIn: 12, noTrim: true }))), null);
  });

  test("bleed ≥ recommended passes and cites the press's spec", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 }));
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.bleed");
    assert.equal(c.status, "pass");
    assert.match(c.message, /Memphis Record Pressing requires ≥0.125" bleed; 0.25" recommended/);
  });

  test("bleed between min and recommended warns", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.55, hIn: 12.55, trimWIn: 12.25, trimHIn: 12.25 }));
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.bleed");
    assert.equal(c.status, "warn");
    assert.match(c.message, /below the recommended/);
  });

  test("bleed below the minimum fails", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.35, hIn: 12.35, trimWIn: 12.25, trimHIn: 12.25 }));
    assert.equal(find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.bleed").status, "fail");
  });

  test("unmeasurable bleed (no trim box) warns, never fails", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    assert.equal(find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.bleed").status, "warn");
  });

  test("edge band: empty warns, filled passes, absent (null) omits the row", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 }));
    const empty = validateCompletedComponent(scan, RULED_SPEC, { edgeBand: "empty" });
    assert.equal(find(empty, "tmpl.edge_band").status, "warn");
    const filled = validateCompletedComponent(scan, RULED_SPEC, { edgeBand: "filled" });
    assert.equal(find(filled, "tmpl.edge_band").status, "pass");
    const none = validateCompletedComponent(scan, RULED_SPEC);
    assert.equal(find(none, "tmpl.edge_band"), undefined);
  });
});

describe("Task #3012 — dual PPI, grayscale, Pantone, placed-format, advisories", () => {
  const base = { wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 };

  test("bitmap PPI floor applies only to 1-bit images", () => {
    // A 4000×4000 1-bit image on ~12.75" is well below 800 PPI → warn; the
    // same size continuous-tone image is above 300 → tmpl.min_ppi stays ok.
    const scan = scanBuffer(bleedPdf({ ...base, imageDims: [{ w: 4000, h: 4000, bitmap: true }, { w: 4000, h: 4000 }] }));
    const checks = validateCompletedComponent(scan, RULED_SPEC);
    assert.equal(find(checks, "tmpl.min_ppi_bitmap").status, "warn");
    // continuous-tone floor (press-level 300) — 4000px is ~313 PPI → pass
    assert.equal(find(checks, "tmpl.min_ppi").status, "pass");
  });

  test("no 1-bit images → bitmap check passes", () => {
    const scan = scanBuffer(bleedPdf({ ...base, imageDims: [{ w: 4000, h: 4000 }] }));
    assert.equal(find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.min_ppi_bitmap").status, "pass");
  });

  test("grayscale-required: RGB fails, CMYK warns, gray-only passes", () => {
    const gSpec = { ...RULED_SPEC, printRules: { grayscaleRequired: true } };
    const rgb = scanBuffer(bleedPdf({ ...base, color: "/DeviceRGB" }));
    assert.equal(find(validateCompletedComponent(rgb, gSpec), "tmpl.grayscale").status, "fail");
    const cmyk = scanBuffer(bleedPdf({ ...base, color: "/DeviceCMYK" }));
    assert.equal(find(validateCompletedComponent(cmyk, gSpec), "tmpl.grayscale").status, "warn");
    const gray = scanBuffer(bleedPdf({ ...base, color: "/DeviceGray" }));
    assert.equal(find(validateCompletedComponent(gray, gSpec), "tmpl.grayscale").status, "pass");
  });

  test("pantone-only: PANTONE names pass (incl. #20 escapes); off-brand names warn", () => {
    const ok = scanBuffer(bleedPdf({ ...base, sepNames: ["PANTONE#20186#20C", "PMS#20287"] }));
    assert.equal(find(validateCompletedComponent(ok, RULED_SPEC), "tmpl.pantone").status, "pass");
    const bad = scanBuffer(bleedPdf({ ...base, sepNames: ["My#20Cool#20Orange"] }));
    const c = find(validateCompletedComponent(bad, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /My Cool Orange/);
  });

  test("pantone-only: process separation names (All/None) are never listed as off-brand", () => {
    // Only process names → treated as "names couldn't be read" (warn), and
    // the message must not accuse All/None of being off-brand inks.
    const scan = scanBuffer(bleedPdf({ ...base, sepNames: ["All", "None"] }));
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.doesNotMatch(c.message, /"All"|"None"/);
  });

  test("placed-format: SMask images warn citing the press's rule text", () => {
    const scan = scanBuffer(bleedPdf({ ...base, imageDims: [{ w: 3000, h: 3000, smask: true }] }));
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.placed_format");
    assert.equal(c.status, "warn");
    assert.match(c.message, /No GIF or PNG-sourced images/);
    const clean = scanBuffer(bleedPdf({ ...base, imageDims: [{ w: 3000, h: 3000 }] }));
    assert.equal(find(validateCompletedComponent(clean, RULED_SPEC), "tmpl.placed_format").status, "pass");
  });

  test("safety margin + advisories render as advisory-tier pass rows", () => {
    const scan = scanBuffer(bleedPdf(base));
    const checks = validateCompletedComponent(scan, RULED_SPEC);
    const safety = find(checks, "tmpl.safety");
    assert.equal(safety.status, "pass");
    assert.equal(safety.tier, "advisory");
    const adv = find(checks, "tmpl.advisory_0");
    assert.equal(adv.status, "pass");
    assert.equal(adv.tier, "advisory");
    assert.match(adv.message, /safety area/);
    assert.notEqual(rollupStatus(checks), "fail");
  });
});

describe("Task #3012 — fallback safety: no rules ⇒ identical verdicts", () => {
  test("a spec without printRules produces exactly today's check set", () => {
    const scan = scanBuffer(fakePdf({ pages: 4, wIn: 6.5, hIn: 7.6811, color: "cmyk+spot", fonts: "embedded" }));
    const before = validateCompletedComponent(scan, SPECS["labels"]);
    const after = validateCompletedComponent(scan, { ...SPECS["labels"], printRules: null, pressName: null } as any);
    assert.deepEqual(after, before);
    // None of the new keys appear.
    for (const k of ["tmpl.bleed", "tmpl.edge_band", "tmpl.min_ppi_bitmap", "tmpl.grayscale", "tmpl.pantone", "tmpl.placed_format", "tmpl.safety"]) {
      assert.equal(find(after, k), undefined);
    }
  });
});

describe("Task #3012 — resolver: press rules merge + labelAdvisories routing", () => {
  const pressRules = {
    bleedMinInches: 0.125,
    minPpi: 300,
    advisories: ["general note"],
    labelAdvisories: ["solid image, no center-hole knockout"],
  } as any;

  test("press-level rules land on every slot; labelAdvisories only on labels", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [],
      pressPrintRules: pressRules,
      pressName: "Memphis Record Pressing",
    });
    const jacket = resolved.find((s) => s.id === "jacket")! as any;
    const labels = resolved.find((s) => s.id === "labels")! as any;
    assert.equal(jacket.printRules.bleedMinInches, 0.125);
    assert.equal(jacket.pressName, "Memphis Record Pressing");
    assert.deepEqual(jacket.printRules.advisories, ["general note"]);
    assert.equal(jacket.printRules.labelAdvisories, undefined);
    assert.deepEqual(labels.printRules.advisories, ["general note", "solid image, no center-hole knockout"]);
    assert.equal(labels.printRules.labelAdvisories, undefined);
  });

  test("component-row rules override press-level per field", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [
        {
          format: "12_double",
          componentKey: "jacket",
          variantKey: "gatefold_oldstyle",
          discCount: 0,
          artboardWInches: null,
          artboardHInches: null,
          expectedPages: null,
          color: null,
          printRules: { bleedMinInches: 0.25 },
        } as any,
      ],
      pressPrintRules: pressRules,
      pressName: "MRP",
    });
    const jacket = resolved.find((s) => s.id === "jacket")! as any;
    assert.equal(jacket.printRules.bleedMinInches, 0.25); // row wins
    assert.equal(jacket.printRules.minPpi, 300); // press-level survives
  });

  test("no press rules + no rows ⇒ baseline untouched (deep-equal)", () => {
    assert.deepEqual(
      resolveFinishedComponents({ vendorId: "mrp", config: CFG, storeRows: [] }),
      requiredFinishedComponents("mrp", CFG),
    );
  });
});
