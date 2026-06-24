import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { scanBuffer, validateCompletedComponent } from "./completedTemplate";
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
