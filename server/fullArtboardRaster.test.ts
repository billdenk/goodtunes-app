// Task #3351 — the persisted FULL-ARTBOARD fallback raster must live in the
// SAME geometry as the client pdf.js render (page viewport = CropBox,
// MediaBox when absent, with the page's /Rotate applied). The persisted mm
// are derived from the rendered raster's own pixel dimensions at a known
// DPI (rasterArtboardMm), so image and dimensions describe the same
// rectangle by construction. Coverage:
//   1. rasterArtboardMm (pure): px÷dpi mm math, degenerate honesty.
//   2. pdftoppm integration on a synthetic PDF whose MediaBox and CropBox
//      DIVERGE: the `-cropbox` pass (what generateCompletedPreview's
//      full-artboard raster uses) must produce pixel dimensions matching
//      the CropBox, while a plain pass rasterizes the (different) MediaBox
//      — the exact misregistration the flag exists to avoid.
//   3. `/Rotate 90` integration: poppler emits the ROTATED raster (like
//      pdf.js's default-rotation viewport), so a portrait CropBox yields a
//      landscape image AND landscape mm — orientation can't disagree.
// UserUnit: pdf.js exposes page.userUnit separately and does NOT bake it
// into scale-1 viewport dims; poppler sizes rasters from box points ÷ 72 ×
// dpi the same way — both sides ignore it identically, and since our mm
// come from the raster itself they track poppler's behavior regardless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { rasterArtboardMm, parsePdfBoxes, PT_TO_MM } from "./completedArtPreview";

// ── 1 · pure raster-mm math ───────────────────────────────────────────────

test("rasterArtboardMm converts pixels at a known DPI to mm", () => {
  // 144px @ 72dpi = 2in = 50.8mm
  assert.deepEqual(rasterArtboardMm(144, 288, 72), { wMm: 50.8, hMm: 101.6 });
  // 96dpi: 96px = 1in = 25.4mm
  assert.deepEqual(rasterArtboardMm(96, 96, 96), { wMm: 25.4, hMm: 25.4 });
});

test("rasterArtboardMm is honest about degenerate inputs", () => {
  assert.equal(rasterArtboardMm(0, 100, 96), null);
  assert.equal(rasterArtboardMm(100, undefined, 96), null);
  assert.equal(rasterArtboardMm(100, 100, 0), null);
  assert.equal(rasterArtboardMm(NaN, 100, 96), null);
});

// ── 2/3 · poppler agreement on synthetic PDFs ─────────────────────────────

// Minimal valid single-page PDF, xref offsets computed, not hand-counted.
function buildPdf(pageDict: string): Buffer {
  const content = "1 0 0 RG 4 w 40 40 200 200 re S";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R ${pageDict} /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

function pngDims(path: string): { w: number; h: number } {
  const buf = readFileSync(path);
  // PNG IHDR: width/height are big-endian uint32 at offsets 16/20.
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function rasterize(dir: string, pdfPath: string, prefix: string, cropbox: boolean): { w: number; h: number } {
  execFileSync("pdftoppm", [
    "-f", "1", "-l", "1", "-png", "-r", "72",
    ...(cropbox ? ["-cropbox"] : []),
    pdfPath, join(dir, prefix),
  ]);
  const f = readdirSync(dir).find((n) => n.startsWith(`${prefix}-`) && n.endsWith(".png"));
  assert.ok(f, `${prefix} raster produced`);
  return pngDims(join(dir, f));
}

test("pdftoppm -cropbox rasterizes the CropBox frame; raster-derived mm match it", () => {
  const dir = mkdtempSync(join(tmpdir(), "fullart-test-"));
  try {
    const pdfPath = join(dir, "src.pdf");
    // MediaBox 288×288pt (4in), CropBox [36 36 180 180] = 144×144pt (2in).
    writeFileSync(pdfPath, buildPdf("/MediaBox [0 0 288 288] /CropBox [36 36 180 180]"));

    // -cropbox pass (the full-artboard raster path): 144pt @ 72dpi = 144px.
    const crop = rasterize(dir, pdfPath, "crop", true);
    assert.equal(crop.w, 144);
    assert.equal(crop.h, 144);
    // Raster-derived mm — the frame the client seats — equals the CropBox mm.
    const mm = rasterArtboardMm(crop.w, crop.h, 72);
    assert.ok(mm);
    assert.equal(mm.wMm, Math.round(144 * PT_TO_MM * 100) / 100);

    // Sanity: the boxes poppler reports agree that CropBox is the 144pt frame.
    const info = execFileSync("pdfinfo", ["-f", "1", "-l", "1", "-box", pdfPath], { encoding: "utf8" });
    const boxes = parsePdfBoxes(info, 1);
    assert.ok(boxes.crop);
    assert.equal(Math.abs(boxes.crop.x1 - boxes.crop.x0), 144);

    // Plain pass rasterizes the DIVERGENT MediaBox (288px) — the exact
    // stretched/misregistered frame the -cropbox flag exists to avoid.
    assert.equal(rasterize(dir, pdfPath, "plain", false).w, 288);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("/Rotate 90: poppler emits the rotated raster, so raster-derived mm swap orientation too", () => {
  const dir = mkdtempSync(join(tmpdir(), "fullart-rot-test-"));
  try {
    const pdfPath = join(dir, "src.pdf");
    // Portrait CropBox 144×288pt with /Rotate 90 → pdf.js's default
    // viewport (and poppler's raster) are LANDSCAPE 288×144.
    writeFileSync(
      pdfPath,
      buildPdf("/MediaBox [0 0 216 360] /CropBox [0 0 144 288] /Rotate 90"),
    );
    const crop = rasterize(dir, pdfPath, "rot", true);
    assert.equal(crop.w, 288, "rotated raster is landscape");
    assert.equal(crop.h, 144);
    // mm derive from the SAME rotated raster → landscape mm; a box-based
    // (unrotated) computation would have said portrait and misregistered.
    const mm = rasterArtboardMm(crop.w, crop.h, 72);
    assert.ok(mm);
    assert.equal(mm.wMm, Math.round(288 * PT_TO_MM * 100) / 100);
    assert.equal(mm.hMm, Math.round(144 * PT_TO_MM * 100) / 100);
    assert.ok(mm.wMm > mm.hMm, "mm orientation matches the rotated image");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
