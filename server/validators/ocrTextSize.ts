// Task #3411 — OCR small-text detection for outlined/raster completed art.
//
// The live-text minimum-size check (completedTemplate.ts check 8b) only sees
// PDF text operators. Art delivered with outlined type, or as a TIFF/JPG,
// is invisible to it. This module rasterizes pages at a KNOWN DPI (pdftoppm,
// same tool the previews use — never the raw 350–530MB blob semantics: the
// caller hands us an already-downloaded local file), runs Tesseract with
// word-level bounding boxes (TSV output), and converts glyph bbox heights
// back to physical points.
//
// Contract (per the established press-rules model):
//   - OCR findings are WARN-ONLY heuristics — never hard fails. OCR misreads
//     decorative type, and false failures train operators to ignore the check.
//   - Any failure in here (tesseract missing, render error, unreadable file)
//     returns null = "not checked" — the caller's row degrades to today's
//     advisory wording. Nothing in this module ever throws to the route.
//
// Point-size estimation: a Tesseract word bbox spans the INK of the word,
// not the em box. How much of the em the ink covers depends on which glyph
// classes are present:
//   - ascenders (or caps/digits) AND descenders → bbox ≈ 1.00 em
//   - ascenders/caps only, or descenders only   → bbox ≈ 0.75 em
//   - x-height glyphs only ("acorn")            → bbox ≈ 0.52 em
// pt = bboxHeightPx * (72 / dpi) / factor. These are typography constants
// (DejaVu: asc 0.76em / desc 0.24em / x-height 0.55em; most text faces sit
// within a few percent), good enough for a ≈-worded advisory.

export type OcrWordBox = {
  text: string;
  /** Tesseract word confidence 0–100. */
  conf: number;
  heightPx: number;
  widthPx: number;
  /** 1-based page the word was found on (caller-assigned for multi-page). */
  page: number;
};

export type OcrTextMeasurement = {
  /** Estimated point size of the smallest confident word found. */
  minPt: number;
  /** The word itself (for the verdict copy). */
  text: string;
  /** 1-based page/face it was found on. */
  page: number;
  /** Total confident words considered across all scanned pages. */
  wordCount: number;
};

/** Render DPI for the OCR pass over PDF pages. 200 keeps a 4–6 pt glyph at
 *  ~11–17 px (readable to Tesseract) while a 27″ gatefold artboard stays
 *  under ~30 MP. */
export const OCR_PDF_RENDER_DPI = 200;
/** Words below this Tesseract confidence are discarded (noise/texture). */
const MIN_WORD_CONF = 60;
/** Pages OCR'd per file — bounds worst-case runtime on booklet PDFs. */
const MAX_OCR_PAGES = 6;
/** Per-tesseract-invocation timeout. */
const TESSERACT_TIMEOUT_MS = 60_000;
/** Raster inputs larger than this on either axis are downscaled first
 *  (tesseract slows badly and gains nothing above ~300 effective DPI). */
const MAX_RASTER_EDGE_PX = 7000;

const ASCENDERS = /[A-Z0-9bdfhklt?!/\\()\[\]{}$#@&%]/;
const DESCENDERS = /[gjpqy]/;

/** Estimate the em size (pt) of a word from its ink-bbox height. Exported
 *  for tests. `pxPerPt` = dpi / 72. */
export function estimatePointSize(text: string, heightPx: number, pxPerPt: number): number {
  const asc = ASCENDERS.test(text);
  const desc = DESCENDERS.test(text);
  const factor = asc && desc ? 1.0 : asc || desc ? 0.75 : 0.52;
  return heightPx / pxPerPt / factor;
}

/** Parse `tesseract ... tsv` output into word boxes. Pure — exported for
 *  tests. Keeps only level-5 (word) rows with a real bbox. */
export function parseTesseractTsv(tsv: string, page: number): OcrWordBox[] {
  const out: OcrWordBox[] = [];
  for (const line of tsv.split("\n")) {
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    if (cols[0] !== "5") continue; // word level only
    const width = Number(cols[8]);
    const height = Number(cols[9]);
    const conf = Number(cols[10]);
    const text = cols.slice(11).join("\t").trim();
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(conf)) continue;
    if (width <= 0 || height <= 0) continue;
    out.push({ text, conf, heightPx: height, widthPx: width, page });
  }
  return out;
}

/** Reduce word boxes to the smallest plausible text measurement. Pure —
 *  exported for tests. Returns null when nothing confident enough remains
 *  (= "no detectable text"). */
export function smallestTextFromWords(
  words: OcrWordBox[],
  pxPerPt: number,
): OcrTextMeasurement | null {
  let best: { pt: number; text: string; page: number } | null = null;
  let considered = 0;
  for (const w of words) {
    if (w.conf < MIN_WORD_CONF) continue;
    const alnum = (w.text.match(/[A-Za-z0-9]/g) ?? []).length;
    // Single stray glyphs are the classic OCR-on-texture false positive;
    // require a word with at least 2 letters/digits and 3+ chars total.
    if (alnum < 2 || w.text.length < 3) continue;
    // Vertical/rotated type reads as a tall skinny box — the height is not
    // a glyph height. Skip anything taller than it is wide per character.
    if (w.heightPx > w.widthPx * 1.6) continue;
    const pt = estimatePointSize(w.text, w.heightPx, pxPerPt);
    // Implausible sizes are misreads, not type.
    if (!Number.isFinite(pt) || pt < 1 || pt > 300) continue;
    considered += 1;
    if (!best || pt < best.pt) best = { pt, text: w.text, page: w.page };
  }
  if (!best) return null;
  return {
    minPt: Math.round(best.pt * 10) / 10,
    text: best.text,
    page: best.page,
    wordCount: considered,
  };
}

/** Run tesseract on one image, returning raw TSV or null on ANY failure
 *  (missing binary, timeout, unreadable image). */
async function runTesseractTsv(imagePath: string): Promise<string | null> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const { stdout } = await run(
      "tesseract",
      [imagePath, "stdout", "--psm", "11", "-l", "eng", "tsv"],
      { timeout: TESSERACT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout;
  } catch (e) {
    console.warn(`[ocr-text] tesseract failed for ${imagePath}`, (e as Error)?.message ?? e);
    return null;
  }
}

/** OCR one already-rendered page image whose scale is known. */
export async function ocrImageSmallestText(
  imagePath: string,
  pxPerPt: number,
  page: number,
): Promise<OcrTextMeasurement | null> {
  const tsv = await runTesseractTsv(imagePath);
  if (tsv == null) return null;
  return smallestTextFromWords(parseTesseractTsv(tsv, page), pxPerPt);
}

/**
 * OCR a local PDF: render up to MAX_OCR_PAGES pages at OCR_PDF_RENDER_DPI
 * with pdftoppm (grayscale — OCR doesn't need color and the files are
 * smaller), tesseract each, and return the smallest text found across
 * pages. Null on any failure or when no confident text exists.
 */
export async function ocrPdfSmallestText(
  pdfPath: string,
  opts?: { pageCount?: number | null },
): Promise<OcrTextMeasurement | null> {
  const fsp = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  let tmpDir: string | null = null;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const lastPage = Math.min(
      opts?.pageCount != null && opts.pageCount > 0 ? opts.pageCount : MAX_OCR_PAGES,
      MAX_OCR_PAGES,
    );
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ocr-text-"));
    const outBase = path.join(tmpDir, "pg");
    await run(
      "pdftoppm",
      ["-f", "1", "-l", String(lastPage), "-png", "-gray", "-r", String(OCR_PDF_RENDER_DPI), pdfPath, outBase],
      { timeout: 120_000 },
    );
    const files = (await fsp.readdir(tmpDir))
      .filter((f) => f.startsWith("pg") && f.endsWith(".png"))
      .sort();
    if (files.length === 0) return null;
    const pxPerPt = OCR_PDF_RENDER_DPI / 72;
    let best: OcrTextMeasurement | null = null;
    let words = 0;
    for (const f of files) {
      // pdftoppm names pages pg-1.png / pg-01.png — recover the number.
      const m = /-(\d+)\.png$/.exec(f);
      const page = m ? parseInt(m[1], 10) : 1;
      const found = await ocrImageSmallestText(path.join(tmpDir, f), pxPerPt, page);
      if (!found) continue;
      words += found.wordCount;
      if (!best || found.minPt < best.minPt) best = found;
    }
    if (!best) return null;
    return { ...best, wordCount: words };
  } catch (e) {
    console.warn(`[ocr-text] pdf OCR failed for ${pdfPath}`, (e as Error)?.message ?? e);
    return null;
  } finally {
    if (tmpDir) fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Task #3412 — collect ALL recognized word boxes from a local PDF (same
 * pdftoppm render + tesseract pass as ocrPdfSmallestText, but returning
 * the raw words in page order for tracklist matching instead of reducing
 * to the smallest measurement). Null on any failure (missing binaries,
 * render error) — the caller emits nothing rather than a false claim.
 * Callers that also need the smallest-text measurement can derive it via
 * smallestTextFromWords(words, OCR_PDF_RENDER_DPI / 72) without a second
 * OCR pass.
 */
export async function ocrPdfWordBoxes(
  pdfPath: string,
  opts?: { pageCount?: number | null },
): Promise<OcrWordBox[] | null> {
  const fsp = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  let tmpDir: string | null = null;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const lastPage = Math.min(
      opts?.pageCount != null && opts.pageCount > 0 ? opts.pageCount : MAX_OCR_PAGES,
      MAX_OCR_PAGES,
    );
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ocr-words-"));
    const outBase = path.join(tmpDir, "pg");
    await run(
      "pdftoppm",
      ["-f", "1", "-l", String(lastPage), "-png", "-gray", "-r", String(OCR_PDF_RENDER_DPI), pdfPath, outBase],
      { timeout: 120_000 },
    );
    const files = (await fsp.readdir(tmpDir))
      .filter((f) => f.startsWith("pg") && f.endsWith(".png"))
      .sort();
    if (files.length === 0) return null;
    const out: OcrWordBox[] = [];
    for (const f of files) {
      const m = /-(\d+)\.png$/.exec(f);
      const page = m ? parseInt(m[1], 10) : 1;
      const tsv = await runTesseractTsv(path.join(tmpDir, f));
      if (tsv == null) continue;
      out.push(...parseTesseractTsv(tsv, page));
    }
    return out;
  } catch (e) {
    console.warn(`[ocr-text] pdf word-box OCR failed for ${pdfPath}`, (e as Error)?.message ?? e);
    return null;
  } finally {
    if (tmpDir) fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Task #3412 — recognized word boxes from a raster (TIFF/JPG) label file.
 * Unlike ocrRasterSmallestText, no physical scale is needed — tracklist
 * matching only cares about the words and their order — so files with no
 * resolution metadata still get matched. Null on any failure.
 */
export async function ocrRasterWordBoxes(filePath: string): Promise<OcrWordBox[] | null> {
  const fsp = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  let tmpDir: string | null = null;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(filePath).metadata();
    const pxW = meta.width ?? 0;
    const pxH = meta.height ?? 0;
    if (pxW < 8 || pxH < 8) return null;
    let scale = 1;
    const maxEdge = Math.max(pxW, pxH);
    if (maxEdge > MAX_RASTER_EDGE_PX) scale = MAX_RASTER_EDGE_PX / maxEdge;
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ocr-raster-words-"));
    const normPath = path.join(tmpDir, "norm.png");
    let pipeline = sharp(filePath).flatten({ background: "#ffffff" }).toColourspace("srgb");
    if (scale < 1) pipeline = pipeline.resize(Math.round(pxW * scale), Math.round(pxH * scale), { fit: "fill" });
    await pipeline.png().toFile(normPath);
    const tsv = await runTesseractTsv(normPath);
    if (tsv == null) return null;
    return parseTesseractTsv(tsv, 1);
  } catch (e) {
    console.warn(`[ocr-text] raster word-box OCR failed for ${filePath}`, (e as Error)?.message ?? e);
    return null;
  } finally {
    if (tmpDir) fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export type RasterOcrResult = {
  measurement: OcrTextMeasurement | null;
  /** The DPI the pt conversion used, and where it came from — threaded into
   *  the verdict copy so the estimate is honest about its basis. */
  dpi: number;
  dpiSource: "metadata" | "expected-size";
};

/**
 * OCR a raster component file (TIFF/JPG). The physical scale comes from
 * embedded DPI metadata when plausible, else from the component's expected
 * physical width (spec template/finished+bleed). Handles CMYK/16-bit inputs
 * by normalizing through sharp; very large rasters are downscaled with the
 * scale factor folded into the pt conversion. Null on any failure, no
 * detectable text, or when no physical scale can be established.
 */
export async function ocrRasterSmallestText(
  filePath: string,
  opts: { expectedWidthInches?: number | null },
): Promise<RasterOcrResult | null> {
  const fsp = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  let tmpDir: string | null = null;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(filePath).metadata();
    const pxW = meta.width ?? 0;
    const pxH = meta.height ?? 0;
    if (pxW < 8 || pxH < 8) return null;
    // sharp reports `density` in DPI. Files with no resolution metadata
    // come back as 72 (the format default) — a print raster at a true 72
    // DPI is nonsense, so treat ≤72 as "unknown" and fall back to the
    // component's expected physical size.
    let dpi: number | null = null;
    let dpiSource: RasterOcrResult["dpiSource"] = "metadata";
    if (meta.density != null && meta.density > 72 && meta.density <= 2400) {
      dpi = meta.density;
    } else if (opts.expectedWidthInches != null && opts.expectedWidthInches > 0) {
      const derived = pxW / opts.expectedWidthInches;
      if (derived >= 36 && derived <= 2400) {
        dpi = derived;
        dpiSource = "expected-size";
      }
    }
    if (dpi == null) return null;

    // Normalize (CMYK/16-bit/alpha → flat sRGB PNG) and bound the pixel
    // size; the scale factor is folded into the effective DPI.
    let scale = 1;
    const maxEdge = Math.max(pxW, pxH);
    if (maxEdge > MAX_RASTER_EDGE_PX) scale = MAX_RASTER_EDGE_PX / maxEdge;
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ocr-raster-"));
    const normPath = path.join(tmpDir, "norm.png");
    let pipeline = sharp(filePath).flatten({ background: "#ffffff" }).toColourspace("srgb");
    if (scale < 1) pipeline = pipeline.resize(Math.round(pxW * scale), Math.round(pxH * scale), { fit: "fill" });
    await pipeline.png().toFile(normPath);

    const effDpi = dpi * scale;
    const measurement = await ocrImageSmallestText(normPath, effDpi / 72, 1);
    if (!measurement) return null;
    return { measurement, dpi: Math.round(dpi), dpiSource };
  } catch (e) {
    console.warn(`[ocr-text] raster OCR failed for ${filePath}`, (e as Error)?.message ?? e);
    return null;
  } finally {
    if (tmpDir) fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Sniff a raster completed-art upload from its head bytes. Only the two
 *  formats the completed-art intake accepts (TIFF, JPEG) — anything else
 *  keeps today's "isn't a PDF" rejection. */
export function sniffRasterKind(head: Buffer | null | undefined): "tiff" | "jpeg" | null {
  if (!head || head.length < 4) return null;
  // TIFF: II*\0 (little-endian) or MM\0* (big-endian).
  if (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) return "tiff";
  if (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a) return "tiff";
  // JPEG: FF D8 FF.
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  return null;
}
