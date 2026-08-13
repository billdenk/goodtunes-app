import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  scanBuffer,
  validateCompletedComponent,
  measuredBleedInches,
  logSpotUsageFallback,
  hasTrustworthyBleedBoxes,
  templateTrimRectInches,
  contentBleedFromRaster,
  type ContentBleedMeasurement,
} from "./completedTemplate";
import {
  requiredFinishedComponents,
  resolveFinishedComponents,
  completedTemplateConfigToAlbumFormat,
  type CompletedTemplateConfig,
  type PressTemplateSpecRow,
} from "@shared/vendorSpecs";
import {
  rollupStatus,
  rollupCompletedTemplate,
  type CompletedTemplateComponent,
} from "@shared/uploadValidation";

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
    // Task #3030 — bleed now always runs and FAILS without a certified
    // template line or file BleedBox; exclude it from the legacy roll-up
    // assertion (its behavior is covered by the Task #3030 suite).
    assert.notEqual(rollupStatus(checks.filter((c) => c.key !== "tmpl.bleed")), "fail");
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
    // (Task #3030 — bleed excluded: it now fails without a measurement source.)
    assert.equal(rollupStatus(checks.filter((c) => c.key !== "tmpl.bleed")), "warn");
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
    // Task #3030 — bleed excluded (fails without a measurement source).
    assert.notEqual(rollupStatus(checks.filter((x) => x.key !== "tmpl.bleed")), "fail");
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
    // Task #3062 — 10" maps to the template-spec-only 10_inch key (NOT an
    // ALBUM_FORMATS entry; nothing sellable) so stored 10" specs can win.
    assert.equal(completedTemplateConfigToAlbumFormat({ ...CFG, size: '10"', discs: 1 }), "10_inch");
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

  // ── Task #3011 — measured-from-template precedence ──────────────────
  test("measured template values fill in when no explicit edit exists (edit > measured > baseline)", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      pressName: "Memphis Record Pressing",
      storeRows: [
        row({ measuredArtboardWInches: 28.0, measuredArtboardHInches: 26.5, measuredPages: 1 }),
      ],
    });
    const jacket = resolved.find((s) => s.id === "jacket")!;
    assert.deepEqual(jacket.templatePageInches, { w: 28.0, h: 26.5 });
    assert.equal(jacket.sizeSource, "measured");
    assert.equal(jacket.expectedPages, 1);
    assert.equal(jacket.pagesSource, "measured");
    assert.equal(jacket.measuredFromLabel, "Memphis Record Pressing");
  });

  test("an explicit operator edit wins over the measured template value", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [
        row({
          artboardWInches: 30,
          artboardHInches: 30,
          expectedPages: 4,
          measuredArtboardWInches: 28.0,
          measuredArtboardHInches: 26.5,
          measuredPages: 1,
        }),
      ],
    });
    const jacket = resolved.find((s) => s.id === "jacket")!;
    assert.deepEqual(jacket.templatePageInches, { w: 30, h: 30 });
    assert.equal(jacket.sizeSource, "operator");
    assert.equal(jacket.expectedPages, 4);
    assert.equal(jacket.pagesSource, "operator");
  });

  test("a failed scan (measuredError, no measured dims) keeps the baseline exactly as today", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      storeRows: [row({ measuredError: "Couldn't fetch the file (HTTP 404)." })],
    });
    const jacket = resolved.find((s) => s.id === "jacket")!;
    assert.deepEqual(jacket.templatePageInches, baseJacket.templatePageInches);
    assert.equal(jacket.sizeSource, "baseline");
  });

  test("two presses with different measured templates produce different expected specs", () => {
    const a = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      pressName: "Memphis Record Pressing",
      storeRows: [row({ measuredArtboardWInches: 27.25, measuredArtboardHInches: 27.0 })],
    });
    const b = resolveFinishedComponents({
      vendorId: "hellbender",
      config: CFG,
      pressName: "Hellbender Vinyl",
      storeRows: [row({ measuredArtboardWInches: 33.0, measuredArtboardHInches: 32.53 })],
    });
    assert.deepEqual(a.find((s) => s.id === "jacket")!.templatePageInches, { w: 27.25, h: 27.0 });
    assert.deepEqual(b.find((s) => s.id === "jacket")!.templatePageInches, { w: 33.0, h: 32.53 });
    assert.equal(a.find((s) => s.id === "jacket")!.measuredFromLabel, "Memphis Record Pressing");
    assert.equal(b.find((s) => s.id === "jacket")!.measuredFromLabel, "Hellbender Vinyl");
  });
});

describe("Task #3011 — measured-template check wording", () => {
  test("a measured template drives authoritative wording naming the press", () => {
    const spec = {
      ...SPECS.jacket,
      templatePageInches: { w: 27.25, h: 27.0 },
      sizeSource: "measured" as const,
      pagesSource: "measured" as const,
      expectedPages: 1,
      measuredFromLabel: "Memphis Record Pressing",
    };
    const good = scanBuffer(fakePdf({ pages: 1, wIn: 27.25, hIn: 27.0, color: "cmyk", fonts: "outlined" }));
    const checks = validateCompletedComponent(good, spec);
    const size = checks.find((c) => c.key === "tmpl.size")!;
    assert.equal(size.status, "pass");
    assert.match(size.message, /Memphis Record Pressing template on file/);
    assert.doesNotMatch(size.message, /No vendor template on file/);

    const bad = scanBuffer(fakePdf({ pages: 1, wIn: 24.25, hIn: 12.25, color: "cmyk", fonts: "outlined" }));
    const badSize = validateCompletedComponent(bad, spec).find((c) => c.key === "tmpl.size")!;
    assert.equal(badSize.status, "fail");
    assert.match(badSize.message, /measured from the Memphis Record Pressing template on file/);
  });

  test("the advisory 'no vendor template' wording still appears when nothing is on file", () => {
    const spec = { ...SPECS.booklet ?? SPECS.jacket, templatePageInches: null, sizeSource: null };
    const scan = scanBuffer(fakePdf({ pages: 2, wIn: 12.25, hIn: 12.25, color: "cmyk", fonts: "outlined" }));
    const size = validateCompletedComponent(scan, spec).find((c) => c.key === "tmpl.size")!;
    assert.match(size.message, /No vendor template on file/);
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
  /** Task #3030 — write an explicit /BleedBox of this size. */
  bleedWIn?: number;
  bleedHIn?: number;
  color?: string; // raw tokens appended per page
  imageDims?: { w: number; h: number; bitmap?: boolean; smask?: boolean }[];
  sepNames?: string[];
  /** Task #3069 — spot swatches actually USED by page content: emits
   * Separation objects + a /ColorSpace resource dict + a content stream
   * that selects each via `cs`. */
  usedSpotNames?: string[];
  /** Task #3069 — an unreadable-name spot (DeviceN) that IS used. */
  usedDeviceN?: boolean;
  /** Task #3069 — a plain decodable content stream that never selects a
   * spot colorspace (makes "unused" provable). */
  plainContentStream?: boolean;
  /** Task #3069 — raw extra tokens appended verbatim (encrypt/LZW/etc.). */
  extraRaw?: string;
}): Buffer {
  const w = (opts.wIn * 72).toFixed(4);
  const h = (opts.hIn * 72).toFixed(4);
  const tw = ((opts.trimWIn ?? opts.wIn) * 72).toFixed(4);
  const th = ((opts.trimHIn ?? opts.hIn) * 72).toFixed(4);
  let s = "%PDF-1.6\n";
  s += `/Type /Page /MediaBox [ 0 0 ${w} ${h} ]`;
  if (!opts.noTrim) s += ` /TrimBox [ 0 0 ${tw} ${th} ]`;
  if (opts.bleedWIn != null && opts.bleedHIn != null) {
    s += ` /BleedBox [ 0 0 ${(opts.bleedWIn * 72).toFixed(4)} ${(opts.bleedHIn * 72).toFixed(4)} ]`;
  }
  s += `\n${opts.color ?? "/DeviceCMYK"}\n`;
  for (const n of opts.sepNames ?? []) s += `/Separation /${n} /DeviceCMYK\n`;
  for (const d of opts.imageDims ?? []) {
    s += `/Subtype /Image /Width ${d.w} /Height ${d.h}`;
    if (d.bitmap) s += " /BitsPerComponent 1";
    if (d.smask) s += " /SMask 12 0 R";
    s += "\n";
  }
  // Task #3069 — used-spot machinery: obj defs + resources + content stream.
  const used = opts.usedSpotNames ?? [];
  const csEntries: string[] = [];
  const csOps: string[] = [];
  used.forEach((n, i) => {
    s += `${50 + i} 0 obj [ /Separation /${n} /DeviceCMYK 9 0 R ] endobj\n`;
    csEntries.push(`/CS${i} ${50 + i} 0 R`);
    csOps.push(`/CS${i} cs 1 scn 0 0 10 10 re f`);
  });
  if (opts.usedDeviceN) {
    s += `70 0 obj [ /DeviceN [ /InkA ] /DeviceCMYK 9 0 R ] endobj\n`;
    csEntries.push(`/CSN 70 0 R`);
    csOps.push(`/CSN cs 1 scn 0 0 10 10 re f`);
  }
  if (csEntries.length > 0) {
    s += `/Resources << /ColorSpace << ${csEntries.join(" ")} >> >>\n`;
    s += `<< /Length 99 >>\nstream\n${csOps.join(" ")}\nendstream\n`;
  }
  if (opts.plainContentStream) {
    s += `<< /Length 30 >>\nstream\n0 0 0 1 k 0 0 10 10 re f\nendstream\n`;
  }
  if (opts.extraRaw) s += opts.extraRaw + "\n";
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

  // Task #3030 — a spec carrying the press's certified template line.
  const LINE_SPEC = {
    ...RULED_SPEC,
    templateBleedLineInches: 0.25,
    bleedLineSource: "measured" as const,
  } as any;

  test("Task #3030: template line — meeting the line passes and names the source", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 }));
    const c = find(validateCompletedComponent(scan, LINE_SPEC), "tmpl.bleed");
    assert.equal(c.status, "pass");
    assert.match(c.message, /Memphis Record Pressing certified template line/);
    assert.match(c.source, /Memphis Record Pressing certified template line/);
  });

  test("Task #3030: template line — below the line but ≥ press min warns", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.55, hIn: 12.55, trimWIn: 12.25, trimHIn: 12.25 }));
    const c = find(validateCompletedComponent(scan, LINE_SPEC), "tmpl.bleed");
    assert.equal(c.status, "warn");
    assert.match(c.message, /below the 0.25" line/);
    assert.match(c.source, /certified template line/);
  });

  test("Task #3030: template line — below the press minimum fails", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.35, hIn: 12.35, trimWIn: 12.25, trimHIn: 12.25 }));
    const c = find(validateCompletedComponent(scan, LINE_SPEC), "tmpl.bleed");
    assert.equal(c.status, "fail");
    assert.match(c.source, /certified template line/);
  });

  test("Task #3030: template line + unmeasurable file (no trim box) FAILS explicitly", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    const c = find(validateCompletedComponent(scan, LINE_SPEC), "tmpl.bleed");
    assert.equal(c.status, "fail");
    assert.match(c.message, /Bleed could not be measured\./);
  });

  test("Task #3030: no template line + file BleedBox ⇒ UNVERIFIED with the fixed reason", () => {
    const scan = scanBuffer(
      bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25, bleedWIn: 12.75, bleedHIn: 12.75 }),
    );
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.bleed");
    assert.equal(c.status, "unverified");
    assert.match(c.message, /Measured against PDF bleed box; no certified template line\./);
    assert.equal(c.source, "Measured against PDF bleed box; no certified template line.");
  });

  test("Task #3030: BleedBox fallback below the press minimum still FAILS (never a silent unverified)", () => {
    const scan = scanBuffer(
      bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25, bleedWIn: 12.35, bleedHIn: 12.35 }),
    );
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.bleed");
    assert.equal(c.status, "fail");
    assert.match(c.source, /PDF bleed box/);
  });

  test("Task #3030: neither template line nor BleedBox ⇒ FAIL 'Bleed could not be measured.'", () => {
    // Trim + media only — a media-box surrogate is NOT a PDF bleed box.
    const withTrim = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 }));
    const c1 = find(validateCompletedComponent(withTrim, RULED_SPEC), "tmpl.bleed");
    assert.equal(c1.status, "fail");
    assert.match(c1.message, /Bleed could not be measured\./);
    const noTrim = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    const c2 = find(validateCompletedComponent(noTrim, RULED_SPEC), "tmpl.bleed");
    assert.equal(c2.status, "fail");
    assert.match(c2.message, /Bleed could not be measured\./);
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

  test("pantone-only: USED PANTONE names pass (incl. #20 escapes); off-brand names warn", () => {
    // Task #3069 — the name heuristic now keys off spots actually USED by
    // page content, so these fixtures paint with the swatch.
    const ok = scanBuffer(bleedPdf({ ...base, usedSpotNames: ["PANTONE#20186#20C", "PMS#20287"] }));
    assert.equal(ok.spotUsage, "used");
    assert.equal(find(validateCompletedComponent(ok, RULED_SPEC), "tmpl.pantone").status, "pass");
    const bad = scanBuffer(bleedPdf({ ...base, usedSpotNames: ["My#20Cool#20Orange"] }));
    const c = find(validateCompletedComponent(bad, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /My Cool Orange/);
  });

  test("pantone-only: process separation names (All/None) are never listed as off-brand", () => {
    // Only process names → treated as "names couldn't be read" (warn), and
    // the message must not accuse All/None of being off-brand inks.
    const scan = scanBuffer(bleedPdf({ ...base, usedSpotNames: ["All", "None"] }));
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
    // Task #3030 — bleed excluded (fails without a measurement source).
    assert.notEqual(rollupStatus(checks.filter((c) => c.key !== "tmpl.bleed")), "fail");
  });
});

describe("Task #3069 — spot-usage detection (unused swatches pass certification)", () => {
  const base = { wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 };

  test("unused-swatch-only file: pantone passes; color summary drops spot/PMS", () => {
    // Swatch DEFINITIONS only (Illustrator-style), plus a decodable content
    // stream that never selects them → provably unused.
    const scan = scanBuffer(
      bleedPdf({ ...base, sepNames: ["My#20Cool#20Orange"], plainContentStream: true }),
    );
    assert.equal(scan.hasSpot, true);
    assert.equal(scan.spotUsage, "unused");
    assert.equal(scan.spotUsageReason, null);
    const checks = validateCompletedComponent(scan, RULED_SPEC);
    const p = find(checks, "tmpl.pantone");
    assert.equal(p.status, "pass");
    assert.match(p.message, /defined in the file but none are used in the artwork/);
    const color = find(checks, "tmpl.color");
    assert.doesNotMatch(color.message, /spot\/PMS/);
  });

  test("genuinely used Pantone spot: used + pass, and the summary reports spot/PMS", () => {
    const scan = scanBuffer(bleedPdf({ ...base, usedSpotNames: ["PANTONE#20186#20C"] }));
    assert.equal(scan.spotUsage, "used");
    assert.deepEqual(scan.usedSpotColorNames, ["PANTONE 186 C"]);
    const checks = validateCompletedComponent(scan, RULED_SPEC);
    assert.equal(find(checks, "tmpl.pantone").status, "pass");
    assert.match(find(checks, "tmpl.color").message, /spot\/PMS/);
  });

  test("used non-Pantone spot warns with the off-brand name", () => {
    const scan = scanBuffer(bleedPdf({ ...base, usedSpotNames: ["House#20Red"] }));
    assert.equal(scan.spotUsage, "used");
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /House Red/);
  });

  test("unreadable-name-but-used (DeviceN) warns that names couldn't be read", () => {
    const scan = scanBuffer(bleedPdf({ ...base, usedDeviceN: true }));
    assert.equal(scan.spotUsage, "used");
    assert.equal(scan.usedSpotColorNames.length, 0);
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /names couldn't be read/);
  });

  test("carry/overlap: tiny chunks give identical usage verdicts", () => {
    const buf = bleedPdf({ ...base, usedSpotNames: ["PANTONE#20186#20C"] });
    const scan = scanBuffer(buf, { chunk: 7 });
    assert.equal(scan.spotUsage, "used");
    assert.deepEqual(scan.usedSpotColorNames, ["PANTONE 186 C"]);
    const unusedBuf = bleedPdf({ ...base, sepNames: ["Foo"], plainContentStream: true });
    assert.equal(scanBuffer(unusedBuf, { chunk: 7 }).spotUsage, "unused");
  });

  test("can't confirm — encrypted PDF: file-problem attribution", () => {
    const scan = scanBuffer(
      bleedPdf({ ...base, sepNames: ["Foo"], plainContentStream: true, extraRaw: "/Encrypt 5 0 R" }),
    );
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "encrypted");
    assert.equal(scan.spotUsageAttribution, "file");
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /encrypted\/password-protected/);
    assert.match(c.message, /problem with the file/);
    assert.doesNotMatch(c.message, /scanner couldn't fully inspect/);
  });

  test("can't confirm — malformed content stream: file-problem attribution", () => {
    const scan = scanBuffer(
      bleedPdf({
        ...base,
        sepNames: ["Foo"],
        extraRaw: "<< /Length 9 /Filter /FlateDecode >>\nstream\nnot-flate\nendstream",
      }),
    );
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "malformed");
    assert.equal(scan.spotUsageAttribution, "file");
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /broken or malformed/);
    assert.match(c.message, /problem with the file/);
  });

  test("can't confirm — legacy LZW compression: scanner-limitation attribution", () => {
    const scan = scanBuffer(
      bleedPdf({
        ...base,
        sepNames: ["Foo"],
        extraRaw: "<< /Length 4 /Filter /LZWDecode >>\nstream\nxxxx\nendstream",
      }),
    );
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "unsupported-compression");
    assert.equal(scan.spotUsageAttribution, "system");
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /legacy compression/);
    assert.match(c.message, /GoodTunes scanner limitation/);
  });

  test("can't confirm — scan cap reached: scanner-limitation attribution", () => {
    // A /Separation token early, then the byte cap cuts the scan short.
    const early = Buffer.from("%PDF-1.6\n/Separation /Foo /DeviceCMYK\n", "latin1");
    const pad = Buffer.alloc(4096, 0x20);
    const scan = scanBuffer(Buffer.concat([early, pad]), { maxBytes: 256 });
    assert.equal(scan.truncated, true);
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "cap-reached");
    assert.equal(scan.spotUsageAttribution, "system");
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /scan\/decompression cap/);
    assert.match(c.message, /GoodTunes scanner limitation/);
  });

  test("can't confirm — unsupported structure (no decodable content / ObjStm): scanner-limitation attribution", () => {
    // Definitions but NO content streams at all → can't prove unused.
    const noStreams = scanBuffer(bleedPdf({ ...base, sepNames: ["Foo"] }));
    assert.equal(noStreams.spotUsage, "unknown");
    assert.equal(noStreams.spotUsageReason, "unsupported-structure");
    assert.equal(noStreams.spotUsageAttribution, "system");
    // Compressed object streams present → same reason.
    const objStm = scanBuffer(
      bleedPdf({
        ...base,
        sepNames: ["Foo"],
        plainContentStream: true,
        extraRaw: "<< /Type /ObjStm /Filter /FlateDecode >>\nstream\nxx\nendstream",
      }),
    );
    assert.equal(objStm.spotUsage, "unknown");
    assert.equal(objStm.spotUsageReason, "unsupported-structure");
    const c = find(validateCompletedComponent(noStreams, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /GoodTunes scanner limitation/);
  });

  test("indirect /ColorSpace resource dict can NOT certify 'unused' (falls back)", () => {
    // Page resources point at an INDIRECT dict (`/ColorSpace 12 0 R`); the
    // map lives in object 12 (unparsed), so the decoded `/CS0 cs` selection
    // never resolves. A spot could hide behind it → conservative unknown.
    const raw =
      "12 0 obj << /CS0 50 0 R >> endobj\n" +
      "50 0 obj [ /Separation /PANTONE#20186#20C /DeviceCMYK 9 0 R ] endobj\n" +
      "/Resources << /ColorSpace 12 0 R >>\n" +
      "<< /Length 30 >>\nstream\n/CS0 cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.hasSpot, true);
    assert.notEqual(scan.spotUsage, "unused");
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "unsupported-structure");
    assert.equal(scan.spotUsageAttribution, "system");
  });

  test("unresolved selected colorspace name can NOT certify 'unused'", () => {
    // Content selects /CS9 but no resource dict maps it — never "unused".
    const raw =
      "/Separation /Foo /DeviceCMYK\n" +
      "<< /Length 30 >>\nstream\n/CS9 cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "unsupported-structure");
  });

  test("reused resource name mapped to CONFLICTING targets is ambiguous → unknown", () => {
    // Two scopes both call their colorspace /CS0: one maps to a Separation,
    // the other to a different (non-spot) object. A `/CS0 cs` selection is
    // ambiguous — must fall back, never resolve optimistically.
    const raw =
      "50 0 obj [ /Separation /House#20Red /DeviceCMYK 9 0 R ] endobj\n" +
      "60 0 obj [ /ICCBased 61 0 R ] endobj\n" +
      "/Resources << /ColorSpace << /CS0 50 0 R >> >>\n" +
      "/Resources << /ColorSpace << /CS0 60 0 R >> >>\n" +
      "<< /Length 30 >>\nstream\n/CS0 cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "unsupported-structure");
  });

  test("spot-color image XObject (inline Separation colorspace) counts as USED", () => {
    // An image can paint spot ink with no `cs` operator at all — its dict
    // carries the colorspace directly. Must never certify "unused".
    const raw =
      "<< /Subtype /Image /Width 10 /Height 10 /ColorSpace [ /Separation /House#20Red /DeviceCMYK 9 0 R ] /Length 4 >>\nstream\nxxxx\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, plainContentStream: true, extraRaw: raw }));
    assert.equal(scan.spotUsage, "used");
    assert.deepEqual(scan.usedSpotColorNames, ["House Red"]);
    const checks = validateCompletedComponent(scan, RULED_SPEC);
    const p = find(checks, "tmpl.pantone");
    assert.equal(p.status, "warn"); // off-brand ink name
    assert.match(p.message, /House Red/);
    assert.match(find(checks, "tmpl.color").message, /spot\/PMS/);
  });

  test("spot-color image XObject (referenced Separation colorspace) counts as USED", () => {
    const raw =
      "50 0 obj [ /Separation /PANTONE#20186#20C /DeviceCMYK 9 0 R ] endobj\n" +
      "<< /Subtype /Image /Width 10 /Height 10 /ColorSpace 50 0 R /Length 4 >>\nstream\nxxxx\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, plainContentStream: true, extraRaw: raw }));
    assert.equal(scan.spotUsage, "used");
    assert.deepEqual(scan.usedSpotColorNames, ["PANTONE 186 C"]);
    assert.equal(find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone").status, "pass");
  });

  test("plain (non-spot) image XObject does not block an 'unused' verdict", () => {
    const raw =
      "<< /Subtype /Image /Width 10 /Height 10 /ColorSpace /DeviceRGB /Length 4 >>\nstream\nxxxx\nendstream";
    const scan = scanBuffer(
      bleedPdf({ ...base, sepNames: ["Foo"], plainContentStream: true, extraRaw: raw }),
    );
    assert.equal(scan.spotUsage, "unused");
  });

  test("direct process alias (/CS0 /DeviceCMYK) selected + unused spot defs → 'unused'", () => {
    // Illustrator-style: artwork selects a process space through a resource
    // alias while the spot swatch is only defined — must certify unused.
    const raw =
      "50 0 obj [ /Separation /House#20Red /DeviceCMYK 9 0 R ] endobj\n" +
      "/Resources << /ColorSpace << /CS0 /DeviceCMYK /CS1 50 0 R >> >>\n" +
      "<< /Length 30 >>\nstream\n/CS0 cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "unused");
    const checks = validateCompletedComponent(scan, RULED_SPEC);
    assert.equal(find(checks, "tmpl.pantone").status, "pass");
    assert.doesNotMatch(find(checks, "tmpl.color").message, /spot\/PMS/);
  });

  test("direct process alias in Flate content also certifies 'unused'", async () => {
    const zlib = await import("node:zlib");
    const content = zlib.deflateSync(Buffer.from("/CS0 cs 1 scn 0 0 10 10 re f", "latin1"));
    const raw =
      "50 0 obj [ /Separation /House#20Red /DeviceCMYK 9 0 R ] endobj\n" +
      "/Resources << /ColorSpace << /CS0 /DeviceRGB >> >>\n" +
      `<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n` +
      content.toString("latin1") +
      "\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "unused");
  });

  test("alias name reused as direct non-spot AND spot ref stays ambiguous → unknown", () => {
    const raw =
      "50 0 obj [ /Separation /House#20Red /DeviceCMYK 9 0 R ] endobj\n" +
      "/Resources << /ColorSpace << /CS0 /DeviceCMYK >> >>\n" +
      "/Resources << /ColorSpace << /CS0 50 0 R >> >>\n" +
      "<< /Length 30 >>\nstream\n/CS0 cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "unsupported-structure");
  });

  test("resolved Pantone spot + an UNRESOLVED selection still falls back to unknown (no bypass)", () => {
    // /CS0 provably paints an official Pantone ink, but the content also
    // selects /CS9 which never resolves — /CS9 could be a non-Pantone spot,
    // so the verdict must stay conservative and the Pantone row must warn.
    const raw = "<< /Length 30 >>\nstream\n/CS9 cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(
      bleedPdf({ ...base, usedSpotNames: ["PANTONE#20186#20C"], extraRaw: raw }),
    );
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "unsupported-structure");
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "warn");
    assert.match(c.message, /GoodTunes scanner limitation/);
  });

  test("resolved Pantone spot + an AMBIGUOUS selection also falls back to unknown", () => {
    const raw =
      "60 0 obj [ /ICCBased 61 0 R ] endobj\n" +
      "/Resources << /ColorSpace << /CSA /DeviceCMYK >> >>\n" +
      "/Resources << /ColorSpace << /CSA 60 0 R >> >>\n" +
      "<< /Length 30 >>\nstream\n/CSA cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(
      bleedPdf({ ...base, usedSpotNames: ["PANTONE#20186#20C"], extraRaw: raw }),
    );
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "unsupported-structure");
    assert.equal(find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone").status, "warn");
  });

  test("selection-cap overflow forces conservative cap-reached fallback", () => {
    // 400+ distinct selections exhaust the tracker; a later spot alias
    // could be missed, so the verdict must be unknown (cap-reached).
    let ops = "";
    for (let i = 0; i <= 400; i++) ops += `/N${i} cs `;
    const raw =
      "/Separation /Foo /DeviceCMYK\n" +
      `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`;
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "cap-reached");
    assert.equal(scan.spotUsageAttribution, "system");
  });

  test("`/Name cs` inside literal strings or comments is NOT a selection", () => {
    // The only spot-ish selections live in a string and a comment; the real
    // selection is a process alias → provably unused.
    const content =
      "(text with /CS1 cs inside a string) Tj\n" +
      "% comment /CS1 cs here\n" +
      "<AABB> Tj\n" +
      "/CS0 cs 1 scn 0 0 10 10 re f";
    const raw =
      "50 0 obj [ /Separation /House#20Red /DeviceCMYK 9 0 R ] endobj\n" +
      "/Resources << /ColorSpace << /CS0 /DeviceCMYK /CS1 50 0 R >> >>\n" +
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "unused");
  });

  test("cumulative stream cap crossed ON the final stream → cap-reached, never unused", () => {
    // Two decodable streams; the second crosses the total-captured cap.
    const s1 = "0 0 0 1 k 0 0 10 10 re f";
    const s2 = "1 0 0 0 k 0 0 99 99 re f padding padding padding";
    const raw =
      "/Separation /Foo /DeviceCMYK\n" +
      `<< /Length ${s1.length} >>\nstream\n${s1}\nendstream\n` +
      `<< /Length ${s2.length} >>\nstream\n${s2}\nendstream`;
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }), {
      spotCaps: { totalStream: s1.length + 10 }, // first fits, second crosses
    });
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "cap-reached");
    assert.equal(scan.spotUsageAttribution, "system");
  });

  test("entry-cap overflow in resource/object collections → cap-reached, never unused", () => {
    // More Separation objects and ColorSpace refs than the entry cap can
    // hold; a later spot image ref could be missed → conservative fallback.
    let raw = "";
    for (let i = 0; i < 4; i++) {
      raw += `${100 + i} 0 obj [ /Separation /Ink${i} /DeviceCMYK 9 0 R ] endobj\n`;
    }
    raw += "/Resources << /ColorSpace << /CS0 /DeviceCMYK >> >>\n";
    raw += "<< /Length 30 >>\nstream\n/CS0 cs 1 scn 0 0 10 10 re f\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }), {
      spotCaps: { entries: 2 },
    });
    assert.equal(scan.spotUsage, "unknown");
    assert.equal(scan.spotUsageReason, "cap-reached");

    // ColorSpace ref-target overflow: distinct `/ColorSpace N 0 R` refs
    // beyond the cap must also flag, since one could resolve to a spot.
    let raw2 = "/Separation /Foo /DeviceCMYK\n";
    for (let i = 0; i < 4; i++) raw2 += `/ColorSpace ${200 + i} 0 R\n`;
    raw2 += "<< /Length 30 >>\nstream\n0 0 0 1 k 0 0 10 10 re f\nendstream";
    const scan2 = scanBuffer(bleedPdf({ ...base, extraRaw: raw2 }), {
      spotCaps: { entries: 2 },
    });
    assert.equal(scan2.spotUsage, "unknown");
    assert.equal(scan2.spotUsageReason, "cap-reached");
  });

  test("telemetry redacts query strings from relative /objects paths too", () => {
    const scan = scanBuffer(bleedPdf({ ...base, sepNames: ["Foo"] }));
    const lines: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => { lines.push(a.join(" ")); };
    try {
      logSpotUsageFallback(scan, {
        fileName: "jacket.pdf",
        source: "/objects/uploads/abc.pdf?sig=SECRET#frag",
      });
    } finally {
      console.warn = orig;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /source=\/objects\/uploads\/abc\.pdf(\s|$)/);
    assert.doesNotMatch(lines[0], /SECRET|sig=|#frag/);
  });

  test("telemetry redacts query strings from pasted URLs", () => {
    const scan = scanBuffer(bleedPdf({ ...base, sepNames: ["Foo"] })); // unknown
    assert.equal(scan.spotUsage, "unknown");
    const lines: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => { lines.push(a.join(" ")); };
    try {
      logSpotUsageFallback(scan, {
        fileName: "jacket.pdf",
        source: "https://dl.example.com/file.pdf?token=SECRET&sig=abc",
      });
    } finally {
      console.warn = orig;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /reason=unsupported-structure/);
    assert.match(lines[0], /source=https:\/\/dl\.example\.com\/file\.pdf(\s|$)/);
    assert.doesNotMatch(lines[0], /SECRET|sig=/);
  });

  test("Flate-compressed content stream is decompressed and proves usage", async () => {
    const zlib = await import("node:zlib");
    const content = zlib.deflateSync(Buffer.from("/CS0 cs 1 scn 0 0 10 10 re f", "latin1"));
    const raw =
      "50 0 obj [ /Separation /PANTONE#20345#20C /DeviceCMYK 9 0 R ] endobj\n" +
      "/Resources << /ColorSpace << /CS0 50 0 R >> >>\n" +
      `<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n` +
      content.toString("latin1") +
      "\nendstream";
    const scan = scanBuffer(bleedPdf({ ...base, extraRaw: raw }));
    assert.equal(scan.spotUsage, "used");
    assert.deepEqual(scan.usedSpotColorNames, ["PANTONE 345 C"]);
  });

  test("no spot tokens at all stays 'none' and passes untouched", () => {
    const scan = scanBuffer(bleedPdf({ ...base, plainContentStream: true }));
    assert.equal(scan.spotUsage, "none");
    const c = find(validateCompletedComponent(scan, RULED_SPEC), "tmpl.pantone");
    assert.equal(c.status, "pass");
    assert.match(c.message, /No spot colors detected/);
  });
});

describe("Task #3012/#3030 — fallback safety: no rules ⇒ identical verdicts (bleed excepted)", () => {
  test("a spec without printRules produces exactly today's check set, plus the always-on bleed check", () => {
    const scan = scanBuffer(fakePdf({ pages: 4, wIn: 6.5, hIn: 7.6811, color: "cmyk+spot", fonts: "embedded" }));
    const before = validateCompletedComponent(scan, SPECS["labels"]);
    const after = validateCompletedComponent(scan, { ...SPECS["labels"], printRules: null, pressName: null } as any);
    assert.deepEqual(after, before);
    // None of the rules-gated keys appear.
    for (const k of ["tmpl.edge_band", "tmpl.min_ppi_bitmap", "tmpl.grayscale", "tmpl.pantone", "tmpl.placed_format", "tmpl.safety"]) {
      assert.equal(find(after, k), undefined);
    }
    // Task #3030 — DELIBERATE contract change: the bleed check now always
    // runs. With no certified template line and no file BleedBox it must
    // FAIL explicitly (no silent pass, no silent downgrade).
    const bleed = find(after, "tmpl.bleed");
    assert.ok(bleed);
    assert.equal(bleed.status, "fail");
    assert.match(bleed.message, /Bleed could not be measured\./);
  });
});

describe("Task #3030 — unverified status: rollup + acknowledgment", () => {
  const comp = (over: Partial<CompletedTemplateComponent>): CompletedTemplateComponent => ({
    componentId: "jacket",
    label: "Jacket",
    presence: "present",
    assetUrl: "/objects/uploads/x",
    fileName: "jacket.pdf",
    previewUrl: null,
    previewUrl2: null,
    checks: [],
    status: "pass",
    override: null,
    unverifiedAck: null,
    ...over,
  });

  test("rollupStatus: unverified outranks warn, fail outranks unverified", () => {
    const mk = (status: any) => ({ key: "k", label: "L", status, message: "" }) as any;
    assert.equal(rollupStatus([mk("pass"), mk("warn"), mk("unverified")]), "unverified");
    assert.equal(rollupStatus([mk("unverified"), mk("fail")]), "fail");
    assert.equal(rollupStatus([mk("pass")]), "pass");
  });

  test("an unacknowledged unverified component blocks a clean verdict (warnings, not ready)", () => {
    const verdict = rollupCompletedTemplate([comp({ status: "unverified" })], ["jacket"]);
    assert.equal(verdict, "warnings");
  });

  test("an acknowledged unverified component may roll up clean", () => {
    const verdict = rollupCompletedTemplate(
      [comp({ status: "unverified", unverifiedAck: { byUserId: "u1", byDisplayName: "Op", at: "2026-08-11T00:00:00Z" } })],
      ["jacket"],
    );
    assert.equal(verdict, "ready");
  });
});

// ─── Task #3072 — rendered-content bleed vs the certified template line ──
describe("Task #3072 — content-based bleed measurement", () => {
  // LINE_SPEC-alike: certified 0.25" line, MRP rules (min 0.125"), pinned
  // 12.75×12.75 template artboard.
  const CB_SPEC = {
    ...RULED_SPEC,
    templateBleedLineInches: 0.25,
    bleedLineSource: "measured" as const,
  } as any;

  const fullBleed: ContentBleedMeasurement = {
    perSideInches: { left: 0.25, right: 0.25, top: 0.26, bottom: 0.25 },
    minInches: 0.25,
    pagesMeasured: 1,
  };
  const shortBleed: ContentBleedMeasurement = {
    perSideInches: { left: 0.25, right: 0.02, top: 0.25, bottom: 0.05 },
    minInches: 0.02,
    pagesMeasured: 1,
  };
  const midBleed: ContentBleedMeasurement = {
    perSideInches: { left: 0.25, right: 0.15, top: 0.25, bottom: 0.25 },
    minInches: 0.15,
    pagesMeasured: 1,
  };

  test("hasTrustworthyBleedBoxes: trim<media trusted; no trim / all-equal boxes not", () => {
    const distinct = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 }));
    assert.equal(hasTrustworthyBleedBoxes(distinct), true);
    const noTrim = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    assert.equal(hasTrustworthyBleedBoxes(noTrim), false);
    const degenerate = scanBuffer(
      bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.75, trimHIn: 12.75, bleedWIn: 12.75, bleedHIn: 12.75 }),
    );
    assert.equal(hasTrustworthyBleedBoxes(degenerate), false);
  });

  test("templateTrimRectInches: artboard inset by the line; labels use the centered finished square", () => {
    const jacket = templateTrimRectInches({
      componentId: "jacket",
      pageInches: { w: 12.75, h: 12.75 },
      templatePageInches: { w: 12.75, h: 12.75 },
      bleedLineInches: 0.25,
    })!;
    assert.deepEqual(jacket, { left: 0.25, top: 0.25, width: 12.25, height: 12.25 });
    const labels = templateTrimRectInches({
      componentId: "labels",
      pageInches: { w: 6.5, h: 7.6811 },
      templatePageInches: { w: 6.5, h: 7.6811 },
      bleedLineInches: 0.25,
      finishedInches: { w: 3.875, h: 3.875 },
    })!;
    assert.ok(Math.abs(labels.left - (6.5 - 3.875) / 2) < 1e-6);
    assert.equal(labels.width, 3.875);
  });

  test("templateTrimRectInches: artboard mismatch → null (size check is the authority); 90° rotation still resolves", () => {
    assert.equal(
      templateTrimRectInches({
        componentId: "jacket",
        pageInches: { w: 12, h: 12 },
        templatePageInches: { w: 27.25, h: 27 },
        bleedLineInches: 0.25,
      }),
      null,
    );
    const rotated = templateTrimRectInches({
      componentId: "jacket",
      pageInches: { w: 27, h: 27.25 },
      templatePageInches: { w: 27.25, h: 27 },
      bleedLineInches: 0.25,
    });
    assert.ok(rotated);
  });

  test("contentBleedFromRaster: full-page ink overhangs the trim rect by the bleed; blank page → null", () => {
    // 128×128 px page = 12.8" @10ppi; trim rect inset 0.25" (2.5px) each side.
    const W = 128;
    const page = { w: 12.8, h: 12.8 };
    const trim = { left: 0.25, top: 0.25, width: 12.3, height: 12.3 };
    const inked = Buffer.alloc(W * W, 0); // solid black to every edge
    const sides = contentBleedFromRaster({
      data: inked, width: W, height: W, channels: 1, pageInches: page, trimRectInches: trim,
    })!;
    for (const v of Object.values(sides)) assert.ok(Math.abs(v - 0.25) < 0.02, String(v));
    const blank = Buffer.alloc(W * W, 255);
    assert.equal(
      contentBleedFromRaster({ data: blank, width: W, height: W, channels: 1, pageInches: page, trimRectInches: trim }),
      null,
    );
  });

  test("contentBleedFromRaster: content stopping short of the bleed edge reads a smaller overhang", () => {
    const W = 128;
    const page = { w: 12.8, h: 12.8 };
    const trim = { left: 0.25, top: 0.25, width: 12.3, height: 12.3 };
    const data = Buffer.alloc(W * W, 255);
    // Ink only from x/y = 2..125 (0.2" margin on left/top, 0.2" on right/bottom).
    for (let y = 2; y < W - 2; y++) for (let x = 2; x < W - 2; x++) data[y * W + x] = 0;
    const sides = contentBleedFromRaster({
      data, width: W, height: W, channels: 1, pageInches: page, trimRectInches: trim,
    })!;
    // Overhang = 0.25 − 0.2 = 0.05" per side.
    for (const v of Object.values(sides)) assert.ok(Math.abs(v - 0.05) < 0.02, String(v));
  });

  test("no-box file + content filling to the bleed edge PASSES via rendered content", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    const c = find(validateCompletedComponent(scan, CB_SPEC, { contentBleed: fullBleed }), "tmpl.bleed");
    assert.equal(c.status, "pass");
    assert.match(c.message, /rendered content/i);
    assert.match(c.message, /certified template line/);
    assert.match(c.source, /via rendered content/);
  });

  test("no-box file + content short of the line FAILS with per-side detail", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    const c = find(validateCompletedComponent(scan, CB_SPEC, { contentBleed: shortBleed }), "tmpl.bleed");
    assert.equal(c.status, "fail");
    assert.match(c.message, /short on/);
    assert.match(c.message, /right ≈0.02"/);
    assert.match(c.message, /bottom ≈0.05"/);
    assert.match(c.source, /via rendered content/);
  });

  test("content below the line but ≥ press minimum WARNS", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    const c = find(validateCompletedComponent(scan, CB_SPEC, { contentBleed: midBleed }), "tmpl.bleed");
    assert.equal(c.status, "warn");
    assert.match(c.message, /≥0.125" minimum/);
  });

  test("degenerate-box file (Bleed==Media==Trim) routes to the content measurement", () => {
    const scan = scanBuffer(
      bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.75, trimHIn: 12.75, bleedWIn: 12.75, bleedHIn: 12.75 }),
    );
    const c = find(validateCompletedComponent(scan, CB_SPEC, { contentBleed: fullBleed }), "tmpl.bleed");
    assert.equal(c.status, "pass");
    assert.match(c.source, /via rendered content/);
  });

  test("trustworthy box geometry keeps winning over the content measurement", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, trimWIn: 12.25, trimHIn: 12.25 }));
    const c = find(validateCompletedComponent(scan, CB_SPEC, { contentBleed: shortBleed }), "tmpl.bleed");
    assert.equal(c.status, "pass"); // boxes say 0.25" — trusted source
    assert.match(c.message, /file's own PDF boxes/);
    assert.doesNotMatch(c.source, /rendered content/);
  });

  test("no-box file with NO content measurement keeps the explicit fail (unchanged)", () => {
    const scan = scanBuffer(bleedPdf({ wIn: 12.75, hIn: 12.75, noTrim: true }));
    const c = find(validateCompletedComponent(scan, CB_SPEC), "tmpl.bleed");
    assert.equal(c.status, "fail");
    assert.match(c.message, /Bleed could not be measured\./);
  });
});

describe("Task #3030 — resolver: certified template bleed line precedence", () => {
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

  test("operator-entered bleed line wins over the measured value", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      pressName: "MRP",
      storeRows: [row({ bleedLineInches: 0.1875, measuredBleedLineInches: 0.25 })],
    });
    const jacket = resolved.find((s) => s.id === "jacket")!;
    assert.equal(jacket.templateBleedLineInches, 0.1875);
    assert.equal(jacket.bleedLineSource, "operator");
  });

  test("measured bleed line fills in when no operator value is set", () => {
    const resolved = resolveFinishedComponents({
      vendorId: "mrp",
      config: CFG,
      pressName: "MRP",
      storeRows: [row({ measuredBleedLineInches: 0.25 })],
    });
    const jacket = resolved.find((s) => s.id === "jacket")!;
    assert.equal(jacket.templateBleedLineInches, 0.25);
    assert.equal(jacket.bleedLineSource, "measured");
    assert.equal(jacket.measuredFromLabel, "MRP");
  });

  test("no stored line ⇒ templateBleedLineInches stays null", () => {
    const resolved = resolveFinishedComponents({ vendorId: "mrp", config: CFG, storeRows: [row({})] });
    const jacket = resolved.find((s) => s.id === "jacket")!;
    assert.equal(jacket.templateBleedLineInches, null);
    assert.equal(jacket.bleedLineSource, null);
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

// ---------------------------------------------------------------------------
// Task #3097 — dieline guide extraction (interpreter + classifier)
// ---------------------------------------------------------------------------
import { interpretGuideStrokes, classifyDielineGuides, GUIDE_SEP_NAME_RE, type GuideStroke } from "./completedTemplate";

describe("Task #3097 — GUIDE_SEP_NAME_RE", () => {
  test("matches dieline/does-not-print style names, not Dimensions", () => {
    assert.ok(GUIDE_SEP_NAME_RE.test("MRP DIELINE - Does Not Print"));
    assert.ok(GUIDE_SEP_NAME_RE.test("Die Line"));
    assert.ok(GUIDE_SEP_NAME_RE.test("kiss-cut"));
    assert.ok(GUIDE_SEP_NAME_RE.test("Keyline"));
    assert.ok(!GUIDE_SEP_NAME_RE.test("Dimensions"));
    assert.ok(!GUIDE_SEP_NAME_RE.test("PANTONE 300 C"));
  });
});

describe("Task #3097 — interpretGuideStrokes", () => {
  test("tracks CS resource, cm transforms, and stroked paths only", () => {
    const code = [
      "q 2 0 0 2 10 10 cm /CS1 CS 1 1 SCN",
      "0 0 m 5 0 l 5 5 l 0 5 l h S", // stroked square at ctm scale
      "20 20 m 30 30 l f",           // filled — not a stroke
      "Q /CS0 CS 0 0 m 1 1 l S",     // different resource
    ].join("\n");
    const strokes = interpretGuideStrokes(code);
    assert.equal(strokes.length, 2);
    assert.equal(strokes[0].csResource, "CS1");
    // 5×5 square scaled ×2 offset (10,10) → 10..20
    const xs = strokes[0].pts.map((p) => p.x);
    assert.equal(Math.min(...xs), 10);
    assert.equal(Math.max(...xs), 20);
    assert.equal(strokes[1].csResource, "CS0");
  });

  test("curves mark hasCurve; re expands to a rectangle", () => {
    const code = "/CS1 CS 0 0 m 1 1 2 2 3 3 c S 10 10 100 50 re S";
    const [curved, rect] = interpretGuideStrokes(code);
    assert.equal(curved.hasCurve, true);
    assert.equal(rect.hasCurve, false);
    const xs = rect.pts.map((p) => p.x);
    assert.equal(Math.min(...xs), 10);
    assert.equal(Math.max(...xs), 110);
  });
});

describe("Task #3097 — classifyDielineGuides", () => {
  const MEDIA = { x0: 0, y0: 0, x1: 2261.22, y1: 1377.04 };
  const rectStroke = (x0: number, y0: number, x1: number, y1: number): GuideStroke => ({
    csResource: "CS1",
    hasCurve: false,
    pts: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
      { x: x0, y: y0 },
    ],
  });
  const vLine = (x: number, y0: number, y1: number): GuideStroke => ({
    csResource: "CS1",
    hasCurve: false,
    pts: [{ x, y: y0 }, { x, y: y1 }],
  });

  test("nested bleed/cut/safety rings + interior fold lines (JKTWS shape)", () => {
    const strokes = [
      rectStroke(221.3, 221.7, 2039.8, 1155.8),   // bleed boundary
      rectStroke(230.4, 230.9, 2030.6, 1146.7),   // cut (~0.126" in)
      rectStroke(239.6, 240.1, 2021.4, 1137.5),   // safety (~0.128" in)
      vLine(1122, 230.9, 1146.7),                 // spine fold
      vLine(1138, 230.9, 1146.7),                 // spine fold
    ];
    const g = classifyDielineGuides(strokes, MEDIA)!;
    assert.ok(g, "classified");
    assert.ok(g.bleed && g.cut && g.safety);
    assert.ok(Math.abs(g.bleedLineInches! - 0.126) < 0.01, `bleed line ${g.bleedLineInches}`);
    assert.ok(Math.abs(g.safetyInsetInches! - 0.128) < 0.01);
    assert.equal(g.foldXInches.length, 2);
    assert.ok(Math.abs(g.foldXInches[0] - 1122 / 72) < 0.01);
    assert.deepEqual(g.foldYInches, []);
  });

  test("single rectangle → cut only, no fabricated bleed/safety/folds", () => {
    const g = classifyDielineGuides([rectStroke(200, 200, 2000, 1150)], MEDIA)!;
    assert.ok(g.cut);
    assert.equal(g.bleed, null);
    assert.equal(g.safety, null);
    assert.deepEqual(g.foldXInches, []);
  });

  test("tiny decoration strokes alone (implausible die) → null", () => {
    const g = classifyDielineGuides([rectStroke(10, 10, 60, 60)], MEDIA);
    assert.equal(g, null);
  });

  test("curve-only strokes → null", () => {
    const g = classifyDielineGuides(
      [{ csResource: "CS1", hasCurve: true, pts: [{ x: 0, y: 0 }, { x: 2000, y: 1300 }] }],
      MEDIA,
    );
    assert.equal(g, null);
  });

  test("edge-hugging lines never count as folds", () => {
    const strokes = [
      rectStroke(221.3, 221.7, 2039.8, 1155.8),
      rectStroke(230.4, 230.9, 2030.6, 1146.7),
      vLine(236, 221.7, 1155.8), // ~0.2" from bleed edge — staircase edge, not a fold
    ];
    const g = classifyDielineGuides(strokes, MEDIA)!;
    assert.deepEqual(g.foldXInches, []);
  });
});

describe("Task #3097 — CTM composition (PDF cm semantics)", () => {
  // PDF spec: `cm` PREPENDS — new CTM = cm × CTM, so a transform issued
  // later applies to points FIRST. These pin the affine algebra against
  // hand-computed expectations for rotation, shear and nested non-uniform
  // scale (a uniform-scale-only test would mask index bugs).
  test("rotation after translation: point runs translate → rotate", () => {
    // q ... [rot 90° CCW] cm [translate +5x] cm : (1,0) → T(6,0) → R(0,6)
    const code = "/CS1 CS 0 1 -1 0 0 0 cm 1 0 0 1 5 0 cm 1 0 m 1 0 l S";
    const [s] = interpretGuideStrokes(code);
    assert.ok(Math.abs(s.pts[0].x - 0) < 1e-9 && Math.abs(s.pts[0].y - 6) < 1e-9, JSON.stringify(s.pts[0]));
  });

  test("shear under rotation", () => {
    // rot 90° then shear [1 .5 0 1]: (2,1) → shear(2,2) → rot(-2,2)
    const code = "/CS1 CS 0 1 -1 0 0 0 cm 1 0.5 0 1 0 0 cm 2 1 m 2 1 l S";
    const [s] = interpretGuideStrokes(code);
    assert.ok(Math.abs(s.pts[0].x - -2) < 1e-9 && Math.abs(s.pts[0].y - 2) < 1e-9, JSON.stringify(s.pts[0]));
  });

  test("nested non-uniform scale restores across q/Q", () => {
    // outer scale (2,3); inner q adds translate; Q restores the outer CTM.
    const code = [
      "/CS1 CS 2 0 0 3 0 0 cm",
      "q 1 0 0 1 10 10 cm 1 1 m 1 1 l S Q", // (11,11)→(22,33)
      "1 1 m 1 1 l S",                      // (1,1)→(2,3)
    ].join("\n");
    const [inner, outer] = interpretGuideStrokes(code);
    assert.deepEqual([inner.pts[0].x, inner.pts[0].y], [22, 33]);
    assert.deepEqual([outer.pts[0].x, outer.pts[0].y], [2, 3]);
  });

  test("rotated dieline classifies identically to the unrotated one", () => {
    // The whole die drawn under a 90° rotation + translation that lands it
    // back on the same MEDIA rect (media is 2261.22×1377.04; rotate then
    // shift x by +2261.22 maps [0..1377]×[0..2261] drawing onto the page).
    const MEDIA = { x0: 0, y0: 0, x1: 2261.22, y1: 1377.04 };
    const pre = "/CS1 CS 0 1 -1 0 2261.22 0 cm ";
    // In the ROTATED frame, x' = y_dev, y' = 2261.22 - x_dev. Draw bleed +
    // cut rects of the JKTWS die in that frame.
    const rect = (x0: number, y0: number, x1: number, y1: number) =>
      `${x0} ${y0} m ${x1} ${y0} l ${x1} ${y1} l ${x0} ${y1} l ${x0} ${y0} l S `;
    // Device-space targets: bleed 221.3,221.7–2039.8,1155.8 → rotated-frame
    // (y, 2261.22-x): x' 221.7–1155.8, y' 221.42–2039.92
    const code =
      pre +
      rect(221.7, 2261.22 - 2039.8, 1155.8, 2261.22 - 221.3) +
      rect(230.9, 2261.22 - 2030.6, 1146.7, 2261.22 - 230.4);
    const strokes = interpretGuideStrokes(code);
    const g = classifyDielineGuides(strokes, MEDIA)!;
    assert.ok(g && g.cut && g.safety, "classified under rotation (2 rings = cut+safety)");
    // Outer ring drew device-x from 221.3pt — transform must land it exactly.
    assert.ok(Math.abs(g.cut!.left - 221.3 / 72) < 0.01, `cut.left ${g.cut!.left}`);
    assert.ok(Math.abs(g.cut!.top - (1377.04 - 1155.8) / 72) < 0.01, `cut.top ${g.cut!.top}`);
    assert.ok(Math.abs(g.safety!.left - 230.4 / 72) < 0.01, `safety.left ${g.safety!.left}`);
  });
});
