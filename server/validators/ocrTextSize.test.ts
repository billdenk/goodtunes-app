// Task #3411 — OCR small-text detection for outlined/raster art.
//
// Pure pieces (TSV parsing, pt conversion, word filtering, signature
// sniffing, verdict rows) run unconditionally. The end-to-end fixtures
// (ImageMagick-generated pages with a KNOWN point size at a known DPI →
// tesseract) are skipped when either binary is missing so the suite stays
// green on machines without the toolchain — the deploy image ships both
// via replit.nix.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  parseTesseractTsv,
  estimatePointSize,
  smallestTextFromWords,
  sniffRasterKind,
  ocrPdfSmallestText,
  ocrRasterSmallestText,
  type OcrTextMeasurement,
} from "./ocrTextSize";
import { scanBuffer, validateCompletedComponent, validateRasterComponent } from "./completedTemplate";
import { requiredFinishedComponents, type CompletedTemplateConfig } from "@shared/vendorSpecs";

const run = promisify(execFile);

const CFG: CompletedTemplateConfig = {
  size: '12"',
  discs: 2,
  jacket: "gatefold_oldstyle",
  innerSleeves: "printed",
  labelColor: "process-4c",
};
const SPECS = Object.fromEntries(requiredFinishedComponents("mrp", CFG).map((s) => [s.id, s]));
const specWith = (rules: Record<string, unknown> | null) =>
  ({ ...SPECS["jacket"], printRules: rules, pressName: "MRP" }) as any;
const find = (checks: { key: string }[], key: string) => checks.find((c) => c.key === key) as any;

// A word row in tesseract TSV: level page block par line word left top w h conf text
const tsvRow = (h: number, conf: number, text: string, w = h * text.length) =>
  `5\t1\t1\t1\t1\t1\t10\t10\t${w}\t${h}\t${conf}\t${text}`;
const TSV_HEADER =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

describe("Task #3411 — TSV parsing + point-size estimation (pure)", () => {
  test("parses only level-5 word rows with a real bbox", () => {
    const tsv = [
      TSV_HEADER,
      "1\t1\t0\t0\t0\t0\t0\t0\t900\t300\t-1\t", // page row — ignored
      "4\t1\t1\t1\t1\t0\t40\t80\t500\t30\t-1\t", // line row — ignored
      tsvRow(24, 91, "tiny"),
      tsvRow(0, 95, "zeroheight"), // degenerate bbox — ignored
    ].join("\n");
    const words = parseTesseractTsv(tsv, 3);
    assert.equal(words.length, 1);
    assert.equal(words[0].text, "tiny");
    assert.equal(words[0].heightPx, 24);
    assert.equal(words[0].page, 3);
  });

  test("ascender+descender word ≈ 1 em; caps-only ≈ 0.75; x-height-only ≈ 0.52", () => {
    const pxPerPt = 300 / 72;
    // "Pressing": cap + descender g → full em. 73px at 300dpi ≈ 17.5pt.
    assert.ok(Math.abs(estimatePointSize("Pressing", 73, pxPerPt) - 17.5) < 0.5);
    // "Hello": ascenders only → bbox is ~0.75 em.
    assert.ok(Math.abs(estimatePointSize("Hello", 58, pxPerPt) - 18.6) < 0.5);
    // "acorn": x-height only.
    const xOnly = estimatePointSize("acorn", 26, pxPerPt);
    assert.ok(xOnly > 11 && xOnly < 13, `got ${xOnly}`);
  });

  test("smallestTextFromWords filters low confidence, junk, and implausible boxes", () => {
    const pxPerPt = 300 / 72;
    const words = [
      // Confident real words at ~18pt and ~6pt.
      { text: "Pressing", conf: 92, heightPx: 73, widthPx: 300, page: 1 },
      { text: "tiny", conf: 91, heightPx: 24, widthPx: 80, page: 2 },
      // Low confidence — dropped even though smaller.
      { text: "noise", conf: 30, heightPx: 10, widthPx: 40, page: 1 },
      // Single glyph / too few alnum chars — dropped.
      { text: "|", conf: 95, heightPx: 8, widthPx: 4, page: 1 },
      { text: "a.", conf: 95, heightPx: 8, widthPx: 10, page: 1 },
      // Tall skinny box (vertical type misread) — dropped.
      { text: "abc", conf: 95, heightPx: 200, widthPx: 20, page: 1 },
    ];
    const m = smallestTextFromWords(words, pxPerPt);
    assert.ok(m);
    assert.equal(m!.text, "tiny");
    assert.equal(m!.page, 2);
    assert.ok(m!.minPt > 5 && m!.minPt < 7, `got ${m!.minPt}`);
    assert.equal(m!.wordCount, 2);
  });

  test("no confident words ⇒ null (no detectable text)", () => {
    assert.equal(smallestTextFromWords([], 300 / 72), null);
    assert.equal(
      smallestTextFromWords([{ text: "x", conf: 20, heightPx: 5, widthPx: 5, page: 1 }], 300 / 72),
      null,
    );
  });

  test("sniffRasterKind recognizes TIFF (both endians) and JPEG only", () => {
    assert.equal(sniffRasterKind(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0])), "tiff");
    assert.equal(sniffRasterKind(Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0])), "tiff");
    assert.equal(sniffRasterKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
    assert.equal(sniffRasterKind(Buffer.from("%PDF-1.6")), null);
    assert.equal(sniffRasterKind(Buffer.from("PK\x03\x04")), null);
    assert.equal(sniffRasterKind(Buffer.alloc(0)), null);
    assert.equal(sniffRasterKind(null), null);
  });
});

describe("Task #3411 — outlined-PDF text-size row via OCR (warn-only)", () => {
  // Outlined art: a PDF with NO font dicts.
  const outlinedScan = () =>
    scanBuffer(
      Buffer.from("%PDF-1.6\n/Type /Page /MediaBox [ 0 0 1962 1944 ]\n/DeviceCMYK\n%%EOF", "latin1"),
    );
  const ocrBelow: OcrTextMeasurement = { minPt: 3.2, text: "credits", page: 2, wordCount: 41 };
  const ocrMeets: OcrTextMeasurement = { minPt: 7.5, text: "credits", page: 1, wordCount: 41 };

  test("OCR below the floor ⇒ WARN naming the size and page — never fail, even with the blocking flag", () => {
    const c = find(
      validateCompletedComponent(outlinedScan(), specWith({ minTextPointSize: 6, minTextPointSizeBlocking: true }), {
        ocrText: ocrBelow,
      }),
      "tmpl.text_size",
    );
    assert.equal(c.status, "warn");
    assert.match(c.message, /≈3\.2 pt/);
    assert.match(c.message, /page 2/);
    assert.match(c.message, /"credits"/);
    assert.match(c.message, /OCR/);
  });

  test("OCR at/above the floor ⇒ advisory pass with the estimate", () => {
    const c = find(
      validateCompletedComponent(outlinedScan(), specWith({ minTextPointSize: 6 }), { ocrText: ocrMeets }),
      "tmpl.text_size",
    );
    assert.equal(c.status, "pass");
    assert.equal(c.tier, "advisory");
    assert.match(c.message, /≈7\.5 pt/);
    assert.match(c.message, /meets MRP's 6 pt minimum/);
  });

  test("no OCR data (failed / skipped) ⇒ today's advisory row, byte-identical", () => {
    const before = validateCompletedComponent(outlinedScan(), specWith({ minTextPointSize: 6 }));
    const withNull = validateCompletedComponent(outlinedScan(), specWith({ minTextPointSize: 6 }), {
      ocrText: null,
    });
    assert.deepEqual(withNull, before);
    const row = find(before, "tmpl.text_size");
    assert.equal(row.status, "pass");
    assert.equal(row.tier, "advisory");
    assert.match(row.message, /outlined type isn't measured/i);
  });

  test("no min-text rule ⇒ no tmpl.text_size row and OCR data changes nothing (byte-identical)", () => {
    const noRules = validateCompletedComponent(outlinedScan(), specWith(null));
    assert.equal(find(noRules, "tmpl.text_size"), undefined);
    const withOcr = validateCompletedComponent(outlinedScan(), specWith(null), { ocrText: ocrBelow });
    assert.deepEqual(withOcr, noRules);
  });

  test("labels slot words the location as a face", () => {
    const spec = { ...SPECS["labels"], printRules: { minTextPointSize: 6 }, pressName: "MRP" } as any;
    const c = find(
      validateCompletedComponent(outlinedScan(), spec, { ocrText: ocrBelow }),
      "tmpl.text_size",
    );
    assert.match(c.message, /face 2/);
  });

  test("live-text PDFs never take the OCR row (existing check unchanged)", () => {
    const liveScan = scanBuffer(
      Buffer.from(
        "%PDF-1.6\n/Type /Page /MediaBox [ 0 0 1962 1944 ]\n/DeviceCMYK\n" +
          "<< /Length 22 >>\nstream\nBT /F1 8 Tf (x) Tj ET\nendstream\n" +
          "/Type /Font /BaseFont /Helvetica /FontFile2 9\n%%EOF",
        "latin1",
      ),
    );
    const c = find(
      validateCompletedComponent(liveScan, specWith({ minTextPointSize: 6 }), { ocrText: ocrBelow }),
      "tmpl.text_size",
    );
    assert.equal(c.status, "pass");
    assert.match(c.message, /Smallest live text ≈8 pt/);
  });
});

describe("Task #3411 — raster component checks", () => {
  test("file-type row warns that structural checks can't run; no min-text rule ⇒ only that row", () => {
    const checks = validateRasterComponent("tiff", specWith(null));
    assert.equal(checks.length, 1);
    assert.equal(checks[0].key, "tmpl.filetype");
    assert.equal(checks[0].status, "warn");
    assert.match(checks[0].message, /TIFF \(raster image\)/);
    assert.match(checks[0].message, /print-ready PDF/);
    assert.equal(find(checks, "tmpl.text_size"), undefined);
  });

  test("min-text rule + OCR below floor ⇒ warn-only row; expected-size basis is disclosed", () => {
    const checks = validateRasterComponent("jpeg", specWith({ minTextPointSize: 6 }), {
      ocr: {
        measurement: { minPt: 4.1, text: "thanks", page: 1, wordCount: 12 },
        dpi: 287,
        dpiSource: "expected-size",
      },
    });
    const c = find(checks, "tmpl.text_size");
    assert.equal(c.status, "warn");
    assert.match(c.message, /≈4\.1 pt/);
    assert.match(c.message, /below MRP's 6 pt minimum/);
    assert.match(c.message, /expected size/);
    assert.doesNotMatch(c.message, /page 1/); // raster rows don't cite a page
  });

  test("min-text rule + OCR meets floor (metadata DPI) ⇒ advisory pass, no basis note", () => {
    const checks = validateRasterComponent("jpeg", specWith({ minTextPointSize: 6 }), {
      ocr: {
        measurement: { minPt: 8.2, text: "thanks", page: 1, wordCount: 12 },
        dpi: 300,
        dpiSource: "metadata",
      },
    });
    const c = find(checks, "tmpl.text_size");
    assert.equal(c.status, "pass");
    assert.equal(c.tier, "advisory");
    assert.doesNotMatch(c.message, /expected size/);
  });

  test("min-text rule but OCR failed/no text ⇒ honest advisory 'couldn't be measured'", () => {
    const checks = validateRasterComponent("tiff", specWith({ minTextPointSize: 6 }), { ocr: null });
    const c = find(checks, "tmpl.text_size");
    assert.equal(c.status, "pass");
    assert.equal(c.tier, "advisory");
    assert.match(c.message, /couldn't be measured/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end fixtures: real ImageMagick renders at a KNOWN dpi/point size →
// real tesseract. Skipped when the toolchain is missing.
// ---------------------------------------------------------------------------
const FONT = path.resolve("server/assets/fonts/DejaVuSans.ttf");
async function hasBin(bin: string, args: string[]): Promise<boolean> {
  try {
    await run(bin, args, { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}
const toolchain = Promise.all([
  hasBin("tesseract", ["--version"]),
  hasBin("convert", ["-version"]),
  hasBin("pdftoppm", ["-v"]),
]).then(([t, c, p]) => t && c && p);

describe("Task #3411 — end-to-end OCR fixtures (skipped without tesseract/imagemagick)", () => {
  let tmpDir: string;
  async function fixture(name: string, args: string[]): Promise<string> {
    tmpDir ??= await fsp.mkdtemp(path.join(os.tmpdir(), "ocr-fixture-"));
    const out = path.join(tmpDir, name);
    await run("convert", [...args, out], { timeout: 60_000 });
    return out;
  }
  // 3″×1″ page at 300 DPI with 18 pt and 6 pt lines of real text.
  const pageArgs = (density: string) => [
    "-density", density, "-units", "PixelsPerInch",
    "-size", "900x300", "xc:white", "-fill", "black", "-font", FONT,
    "-pointsize", "18", "-annotate", "+40+100", "Hello Pressing 4711",
    "-pointsize", "6", "-annotate", "+40+200", "tiny legal line text",
  ];

  test("JPG with DPI metadata: finds the ~6pt line, misses nothing dramatic", async (t) => {
    if (!(await toolchain)) return t.skip("toolchain missing");
    const jpg = await fixture("page.jpg", pageArgs("300"));
    const r = await ocrRasterSmallestText(jpg, { expectedWidthInches: null });
    assert.ok(r, "expected a measurement");
    assert.equal(r!.dpiSource, "metadata");
    assert.ok(Math.abs(r!.dpi - 300) <= 1, `dpi ${r!.dpi}`);
    assert.ok(r!.measurement!.minPt >= 4 && r!.measurement!.minPt <= 8.5, `minPt ${r!.measurement!.minPt}`);
  });

  test("TIFF without usable DPI metadata: scale derived from the expected physical width", async (t) => {
    if (!(await toolchain)) return t.skip("toolchain missing");
    // Written at the default 72 DPI stamp (treated as unknown) — the file is
    // still 900px of a 3″-wide component, so the fallback derives 300 DPI.
    const tif = await fixture("page.tif", [...pageArgs("300"), "-density", "72"]);
    const r = await ocrRasterSmallestText(tif, { expectedWidthInches: 3 });
    assert.ok(r, "expected a measurement");
    assert.equal(r!.dpiSource, "expected-size");
    assert.ok(Math.abs(r!.dpi - 300) <= 1, `dpi ${r!.dpi}`);
    assert.ok(r!.measurement!.minPt >= 4 && r!.measurement!.minPt <= 8.5, `minPt ${r!.measurement!.minPt}`);
  });

  test("raster with no metadata AND no expected size ⇒ null (no fabricated scale)", async (t) => {
    if (!(await toolchain)) return t.skip("toolchain missing");
    const tif = await fixture("noscale.tif", [...pageArgs("300"), "-density", "72"]);
    assert.equal(await ocrRasterSmallestText(tif, { expectedWidthInches: null }), null);
  });

  test("outlined/raster PDF: pdftoppm render → OCR finds the small line", async (t) => {
    if (!(await toolchain)) return t.skip("toolchain missing");
    const pdf = await fixture("page.pdf", pageArgs("300"));
    const m = await ocrPdfSmallestText(pdf, { pageCount: 1 });
    assert.ok(m, "expected a measurement");
    assert.equal(m!.page, 1);
    assert.ok(m!.minPt >= 4 && m!.minPt <= 8.5, `minPt ${m!.minPt}`);
  });

  test("blank page ⇒ null (no detectable text, no noise)", async (t) => {
    if (!(await toolchain)) return t.skip("toolchain missing");
    const blank = await fixture("blank.jpg", ["-density", "300", "-units", "PixelsPerInch", "-size", "900x300", "xc:white"]);
    assert.equal(await ocrRasterSmallestText(blank, { expectedWidthInches: 3 }), null);
  });

  test("unreadable input ⇒ null, silently (OCR failure degrades to 'not checked')", async () => {
    assert.equal(await ocrRasterSmallestText("/nonexistent/nope.tif", { expectedWidthInches: 3 }), null);
    assert.equal(await ocrPdfSmallestText("/nonexistent/nope.pdf", {}), null);
  });
});
