// Task #2109 — Completed-template confirmation (server scanner + validator).
//
// This is the back-end half of the admin-only "Confirm a completed PDF
// matches the press specs" surface. Unlike `preflight.ts` (which probes a
// freshly-uploaded art/audio buffer ≤200MB), the *completed* print-ready
// files are 350–530MB and arrive as paste-a-URL share links (Dropbox etc.).
// We therefore NEVER hold the whole file in memory and NEVER store the blob:
//
//   1. `fetchAndScanPdf(url)` — SSRF-guarded, manual-redirect, size/time
//      bounded fetch that STREAMS the body through `CompletedPdfScanner`.
//   2. `CompletedPdfScanner` — a bounded-memory chunked latin1 regex scanner
//      with a carry overlap so tokens straddling a chunk boundary are still
//      seen, and counted matches are committed exactly once. Produces a
//      `CompletedPdfScan` (page count + per-page MediaBox/Trim/Bleed in
//      inches + CMYK/RGB/spot + font embedding + dieline tokens).
//   3. `validateCompletedComponent(scan, spec)` — pure: turns a scan + the
//      required-component spec into `CheckResult[]` (exact artboard size,
//      page/face count, color, fonts, dieline advisory).
//
// `scanBuffer(buf)` exercises the same scanner over an in-memory buffer for
// unit tests. Validation is read-only — we never re-encode or auto-fix.
//
// INTAKE MODEL (intentional, not a gap): the operator pastes ONE URL per
// required component slot and the server validates that file against THAT
// slot's spec. There is deliberately NO arbitrary multi-file auto-matcher
// and NO cross-component "combined PDF" splitter, because the real finished
// assets are separate 350–530MB files with mutually-incompatible flat
// artboards (jacket ≈27.25×27, labels 6.5×7.68, sleeve 19×31, one file per
// disc) — a single combined PDF spanning components is not how vinyl print
// files are delivered, and the operator already knows which named file is
// which. The only multi-page case is within ONE component (the 4-up label
// file), handled via `expectedPages`. present/missing/extra are slot-coverage
// states (extra = a saved slot orphaned by a later config change).
//
// SSRF posture mirrors `certOgImage.ts`, but because the pasted URL is an
// *arbitrary* third-party host (not our own origin) we additionally resolve
// DNS and block any host that resolves to a private/loopback/link-local/
// metadata address, and we re-validate every redirect hop. (There is an
// inherent TOCTOU gap between the DNS check and the kernel's own resolution
// inside fetch; acceptable for an admin-only operator paste flow.)

import dns from "node:dns/promises";
import net from "node:net";
import type { CheckResult } from "@shared/uploadValidation";
import type { FinishedComponentSpec } from "@shared/vendorSpecs";

// ─── Scanner ──────────────────────────────────────────────────────────

export type BoxInches = { w: number; h: number };

export type CompletedPdfScan = {
  /** First bytes were `%PDF`. */
  isPdf: boolean;
  /** Total bytes streamed through the scanner. */
  bytes: number;
  /** Hit the size cap before the stream ended (results are partial). */
  truncated: boolean;
  /** Best page count: `/Type /Page` count, falling back to MediaBox count. */
  pageCount: number;
  typePageCount: number;
  mediaBoxCount: number;
  /** Per-occurrence page boxes in inches (1pt = 1/72in), in stream order. */
  pageSizesInches: BoxInches[];
  trimSizesInches: BoxInches[];
  bleedSizesInches: BoxInches[];
  hasCMYK: boolean;
  hasRGB: boolean;
  /** Spot color — `/Separation` or `/DeviceN`. */
  hasSpot: boolean;
  /** PDF declares live text (a /Font dict or /BaseFont). */
  hasFontDicts: boolean;
  /** Embedded font program present (/FontFile, /FontFile2, /FontFile3). */
  hasEmbeddedFonts: boolean;
  /** A dieline / template / "do not print" token appears anywhere. */
  hasDieline: boolean;
  /**
   * Task #2705 — pixel dimensions of embedded raster images (`/Subtype
   * /Image` XObjects whose /Width + /Height appear near the token).
   * Best-effort: placement (the `cm` matrix) is NOT parsed, so these give
   * only a lower-bound PPI estimate assuming full-artboard placement.
   */
  imageDimsPx: { w: number; h: number }[];
  /**
   * Task #3012 — subset of imageDimsPx that are 1-bit / bitmap images
   * (`/BitsPerComponent 1` or `/ImageMask true` in the image dict).
   * Drives the second (line-art) PPI floor. imageDimsPx still contains
   * ALL images so pre-existing verdicts never shift.
   */
  bitmapImageDimsPx: { w: number; h: number }[];
  /** Task #3012 — images carrying an /SMask (soft transparency mask —
   * typical of PNG-sourced placements; JPEG/TIFF print art has none). */
  smaskImageCount: number;
  /** Task #3012 — /DeviceGray or /CalGray ink usage seen. */
  hasDeviceGray: boolean;
  /** Task #3012 — decoded `/Separation /Name` spot-color names (unique,
   * capped) for the Pantone-authenticity heuristic. */
  spotColorNames: string[];
};

// CARRY must exceed the longest token/match we look for so a match that
// straddles a chunk boundary is fully present in the next window.
const CARRY = 1024;

// Counted / box-collecting matches use the global flag + an exec loop; we
// reset lastIndex on each call (single-threaded, synchronous use only).
const TYPE_PAGE_RE = /\/Type\s*\/Page(?![sA-Za-z])/g; // /Type /Page but NOT /Pages
const BOX_RE = (name: string) =>
  new RegExp(`\\/${name}\\s*\\[\\s*([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s*\\]`, "g");
const MEDIABOX_RE = BOX_RE("MediaBox");
const TRIMBOX_RE = BOX_RE("TrimBox");
const BLEEDBOX_RE = BOX_RE("BleedBox");
const IMAGE_SUBTYPE_RE = /\/Subtype\s*\/Image\b/g;
// Image dicts are small; /Width and /Height sit within a few hundred bytes
// of /Subtype /Image in either order. IMG_DICT_RADIUS must stay < CARRY so
// the inspection window is fully present in the carried overlap.
const IMG_DICT_RADIUS = 400;
const MAX_IMAGE_DIMS = 2000;
// Task #3012 — /Separation /<name> pairs; PDF name tokens may carry #xx
// hex escapes (e.g. PANTONE#20186#20C). Also matches the second name in a
// [/Separation /Name /AltSpace ...] array form.
const SEPARATION_NAME_RE = /\/Separation\s*\/([^\s/\[\]<>()]+)/g;
const MAX_SPOT_NAMES = 60;

function decodePdfName(raw: string): string {
  return raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export class CompletedPdfScanner {
  private carry = "";
  private headSeen = false;
  private _isPdf = false;
  private _bytes = 0;
  private _truncated = false;
  private readonly maxBytes: number;

  private typePage = 0;
  private readonly media: BoxInches[] = [];
  private readonly trim: BoxInches[] = [];
  private readonly bleed: BoxInches[] = [];
  private cmyk = false;
  private rgb = false;
  private spot = false;
  private fontDicts = false;
  private embedded = false;
  private dieline = false;
  private readonly imageDims: { w: number; h: number }[] = [];
  private readonly bitmapDims: { w: number; h: number }[] = [];
  private smaskImages = 0;
  private gray = false;
  private readonly spotNames = new Set<string>();

  constructor(opts?: { maxBytes?: number }) {
    this.maxBytes = opts?.maxBytes ?? 800 * 1024 * 1024; // 800MB hard ceiling
  }

  push(chunk: Buffer): void {
    if (this._truncated) return;
    if (!this.headSeen) {
      this._isPdf = chunk.slice(0, 5).toString("latin1").startsWith("%PDF");
      this.headSeen = true;
    }
    this._bytes += chunk.length;
    const over = this._bytes > this.maxBytes;

    const window = this.carry + chunk.toString("latin1");
    // Commit (count) only matches whose START index is before the last
    // CARRY chars; those tail chars carry over and get committed next round
    // (or at finish). This makes every byte commit exactly once.
    const commit = Math.max(0, window.length - CARRY);
    this.scanWindow(window, commit);
    this.carry = window.length > CARRY ? window.slice(window.length - CARRY) : window;

    if (over) this._truncated = true;
  }

  finish(): CompletedPdfScan {
    if (this.carry) this.scanWindow(this.carry, this.carry.length); // flush fully
    this.carry = "";
    const pageCount = this.typePage > 0 ? this.typePage : this.media.length;
    return {
      isPdf: this._isPdf,
      bytes: this._bytes,
      truncated: this._truncated,
      pageCount,
      typePageCount: this.typePage,
      mediaBoxCount: this.media.length,
      pageSizesInches: this.media,
      trimSizesInches: this.trim,
      bleedSizesInches: this.bleed,
      hasCMYK: this.cmyk,
      hasRGB: this.rgb,
      hasSpot: this.spot,
      hasFontDicts: this.fontDicts,
      hasEmbeddedFonts: this.embedded,
      hasDieline: this.dieline,
      imageDimsPx: this.imageDims,
      bitmapImageDimsPx: this.bitmapDims,
      smaskImageCount: this.smaskImages,
      hasDeviceGray: this.gray,
      spotColorNames: Array.from(this.spotNames),
    };
  }

  private scanWindow(s: string, commit: number): void {
    // Booleans: OR over the whole window every time (idempotent — seeing a
    // token twice across the carry overlap is harmless).
    if (!this.cmyk && /\/DeviceCMYK\b/.test(s)) this.cmyk = true;
    if (!this.rgb && /\/DeviceRGB\b/.test(s)) this.rgb = true;
    if (!this.spot && (/\/Separation\b/.test(s) || /\/DeviceN\b/.test(s))) this.spot = true;
    if (!this.fontDicts && (/\/Type\s*\/Font\b/.test(s) || /\/BaseFont\b/.test(s))) this.fontDicts = true;
    if (!this.embedded && /\/FontFile[23]?\b/.test(s)) this.embedded = true;
    if (!this.gray && /\/(DeviceGray|CalGray)\b/.test(s)) this.gray = true;
    if (!this.dieline && /(dieline|die[\s_-]?cut|do[\s_-]?not[\s_-]?print|template)/i.test(s)) this.dieline = true;

    // Counted page objects.
    TYPE_PAGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TYPE_PAGE_RE.exec(s)) !== null) {
      if (m.index < commit) this.typePage++;
      if (m.index === TYPE_PAGE_RE.lastIndex) TYPE_PAGE_RE.lastIndex++;
    }

    this.collectBoxes(MEDIABOX_RE, s, commit, this.media);
    this.collectBoxes(TRIMBOX_RE, s, commit, this.trim);
    this.collectBoxes(BLEEDBOX_RE, s, commit, this.bleed);

    // Task #3012 — spot-color (Separation) names for the Pantone check.
    if (this.spotNames.size < MAX_SPOT_NAMES) {
      SEPARATION_NAME_RE.lastIndex = 0;
      let sm: RegExpExecArray | null;
      while ((sm = SEPARATION_NAME_RE.exec(s)) !== null) {
        if (sm.index < commit && this.spotNames.size < MAX_SPOT_NAMES) {
          const name = decodePdfName(sm[1]).trim();
          if (name) this.spotNames.add(name);
        }
        if (sm.index === SEPARATION_NAME_RE.lastIndex) SEPARATION_NAME_RE.lastIndex++;
      }
    }

    // Embedded raster image dims (best-effort, for the min-PPI estimate).
    if (this.imageDims.length < MAX_IMAGE_DIMS) {
      IMAGE_SUBTYPE_RE.lastIndex = 0;
      let im: RegExpExecArray | null;
      while ((im = IMAGE_SUBTYPE_RE.exec(s)) !== null) {
        if (im.index < commit && this.imageDims.length < MAX_IMAGE_DIMS) {
          const win = s.slice(Math.max(0, im.index - IMG_DICT_RADIUS), im.index + IMG_DICT_RADIUS);
          const wMatch = /\/Width\s+(\d+)/.exec(win);
          const hMatch = /\/Height\s+(\d+)/.exec(win);
          if (wMatch && hMatch) {
            const w = parseInt(wMatch[1], 10);
            const h = parseInt(hMatch[1], 10);
            if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
              this.imageDims.push({ w, h });
              // Task #3012 — 1-bit / bitmap (line-art) images get their own
              // PPI floor; SMask presence hints at PNG-sourced placement.
              if (/\/BitsPerComponent\s+1\b/.test(win) || /\/ImageMask\s+true\b/.test(win)) {
                this.bitmapDims.push({ w, h });
              }
              if (/\/SMask\s/.test(win)) this.smaskImages++;
            }
          }
        }
        if (im.index === IMAGE_SUBTYPE_RE.lastIndex) IMAGE_SUBTYPE_RE.lastIndex++;
      }
    }
  }

  private collectBoxes(re: RegExp, s: string, commit: number, into: BoxInches[]): void {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      if (m.index < commit) {
        const w = Math.abs(parseFloat(m[3]) - parseFloat(m[1]));
        const h = Math.abs(parseFloat(m[4]) - parseFloat(m[2]));
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          into.push({ w: w / 72, h: h / 72 });
        }
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
}

/** Scan an in-memory buffer (tests). Pushed in modest chunks so the carry
 * overlap is exercised exactly as it is on a real stream. */
export function scanBuffer(buf: Buffer, opts?: { maxBytes?: number; chunk?: number }): CompletedPdfScan {
  const sc = new CompletedPdfScanner(opts);
  const step = opts?.chunk ?? 64 * 1024;
  for (let i = 0; i < buf.length; i += step) {
    sc.push(buf.subarray(i, Math.min(buf.length, i + step)));
  }
  return sc.finish();
}

// ─── Validator ────────────────────────────────────────────────────────

const SIZE_TOL = 0.02; // inches

function matchesBox(box: BoxInches, target: BoxInches, tol: number): boolean {
  const direct = Math.abs(box.w - target.w) <= tol && Math.abs(box.h - target.h) <= tol;
  const swapped = Math.abs(box.w - target.h) <= tol && Math.abs(box.h - target.w) <= tol;
  return direct || swapped;
}

const inch = (n: number) => `${n.toFixed(2)}″`;
const dim = (b: BoxInches) => `${inch(b.w)} × ${inch(b.h)}`;

/**
 * Turn a completed-PDF scan into the finished-template check rows for one
 * required component. Pure + synchronous. Size uses the EXACT measured
 * artboard (hard pass/fail) when `templatePageInches` is set; otherwise it
 * falls back to a computed finished+bleed target that can only WARN (we have
 * no authoritative template on file for that vendor/size/kind).
 */
// ─── Task #3012 — press print-rule helpers ────────────────────────────

// Names that legitimately appear as /Separation without being spot inks.
const PROCESS_SEP_NAMES = new Set([
  "all",
  "none",
  "cyan",
  "magenta",
  "yellow",
  "black",
  "registration",
]);

function isOfficialPantoneName(name: string): boolean {
  return /^\s*(pantone|pms)\b/i.test(name.replace(/[_-]+/g, " "));
}

/**
 * Measured bleed (inches per side) from the PDF's own boxes: TrimBox vs
 * BleedBox (preferred) or MediaBox. Pairs boxes by stream order when the
 * counts line up, else compares the first of each. Returns null when the
 * PDF carries no TrimBox (can't measure).
 */
export function measuredBleedInches(scan: CompletedPdfScan): number | null {
  const trims = scan.trimSizesInches;
  if (trims.length === 0) return null;
  const outers = scan.bleedSizesInches.length > 0 ? scan.bleedSizesInches : scan.pageSizesInches;
  if (outers.length === 0) return null;
  const n = trims.length === outers.length ? trims.length : 1;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const t = trims[i];
    const o = outers[i];
    const b = Math.min((o.w - t.w) / 2, (o.h - t.h) / 2);
    if (Number.isFinite(b)) min = Math.min(min, b);
  }
  if (!Number.isFinite(min)) return null;
  return Math.max(0, min);
}

const BLEED_TOL = 0.005; // measurement tolerance, inches

export type EdgeBandVerdict = "filled" | "empty" | null;

/**
 * Task #3012 — edge-band bleed-content heuristic (ADVISORY ONLY). Renders
 * page 1 of a LOCAL pdf small (pdftoppm @24dpi, 30s cap) and tests whether
 * the band outside the trim rectangle contains any non-white content.
 * Returns null on ANY failure (no pdftoppm, render error, no trim box, no
 * bleed area) — the caller then simply omits the line item.
 */
export async function edgeBandContent(
  pdfPath: string,
  scan: CompletedPdfScan,
): Promise<EdgeBandVerdict> {
  try {
    const outer = scan.pageSizesInches[0];
    const trim = scan.trimSizesInches[0];
    if (!outer || !trim) return null;
    const bandW = (outer.w - trim.w) / 2;
    const bandH = (outer.h - trim.h) / 2;
    if (bandW < 0.02 && bandH < 0.02) return null; // no bleed area to inspect
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const fsp = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "edge-band-"));
    try {
      const outBase = path.join(tmpDir, "p1");
      await run("pdftoppm", ["-f", "1", "-l", "1", "-png", "-r", "24", pdfPath, outBase], {
        timeout: 30_000,
      });
      const files = await fsp.readdir(tmpDir);
      const pageFile = files.find((f) => f.startsWith("p1") && f.endsWith(".png"));
      if (!pageFile) return null;
      const sharp = (await import("sharp")).default;
      const { data, info } = await sharp(path.join(tmpDir, pageFile))
        .flatten({ background: "#ffffff" })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const ch = info.channels || 1;
      // Trim rect assumed centered in the rendered page (true for every
      // real template we've measured; heuristic only).
      const bx = Math.round((bandW / outer.w) * info.width);
      const by = Math.round((bandH / outer.h) * info.height);
      if (bx <= 0 && by <= 0) return null;
      let total = 0;
      let inked = 0;
      for (let y = 0; y < info.height; y++) {
        const bandRow = y < by || y >= info.height - by;
        for (let x = 0; x < info.width; x++) {
          if (!bandRow && bx > 0 && x >= bx && x < info.width - bx) {
            x = info.width - bx - 1;
            continue;
          }
          if (!bandRow && bx <= 0) break; // middle row, no side band
          total++;
          if (data[(y * info.width + x) * ch] < 245) inked++;
        }
      }
      if (total === 0) return null;
      return inked / total >= 0.02 ? "filled" : "empty";
    } finally {
      fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch {
    return null; // degrade silently — skip just this line item
  }
}

export function validateCompletedComponent(
  scan: CompletedPdfScan,
  spec: FinishedComponentSpec,
  opts?: { edgeBand?: EdgeBandVerdict },
): CheckResult[] {
  // Not a PDF → nothing else is meaningful.
  if (!scan.isPdf) {
    return [{
      key: "tmpl.filetype",
      label: "File type",
      status: "fail",
      message: "That link isn't a PDF — supply the print-ready PDF for this component.",
    }];
  }

  const checks: CheckResult[] = [];

  if (scan.truncated) {
    checks.push({
      key: "tmpl.size_cap",
      label: "File size",
      status: "warn",
      message: "File exceeded the scan ceiling — results below are based on a partial read; verify manually.",
    });
  }

  // 1. Page / face count.
  const isLabels = spec.id === "labels";
  const unit = isLabels ? "face" : "page";
  // Task #3011 — when the expected values were measured from the press's
  // uploaded template file, say so ("vs MRP template on file") instead of
  // the generic vendor-template wording.
  const measuredLabel = spec.measuredFromLabel?.trim() || "the press";
  const sizeFromMeasured = spec.sizeSource === "measured";
  const pagesFromMeasured = spec.pagesSource === "measured";
  if (spec.expectedPages <= 0) {
    // No authoritative page count for this slot (e.g. a booklet whose page
    // count isn't specified in the press catalog) — advisory only.
    checks.push({
      key: "tmpl.pages",
      label: isLabels ? "Faces" : "Pages",
      status: scan.pageCount === 0 ? "warn" : "pass",
      message:
        scan.pageCount === 0
          ? "Couldn't read a page count, and no expected count is on file — verify against the plant's spec."
          : `${scan.pageCount} ${unit}${scan.pageCount === 1 ? "" : "s"} read — no expected count on file for this component; verify against the plant's spec.`,
    });
  } else if (scan.pageCount === 0) {
    checks.push({
      key: "tmpl.pages",
      label: isLabels ? "Faces" : "Pages",
      status: "warn",
      message: `Couldn't read a page count — expected ${spec.expectedPages} ${unit}${spec.expectedPages === 1 ? "" : "s"}.`,
    });
  } else if (scan.pageCount === spec.expectedPages) {
    checks.push({
      key: "tmpl.pages",
      label: isLabels ? "Faces" : "Pages",
      status: "pass",
      message: `${scan.pageCount} ${unit}${scan.pageCount === 1 ? "" : "s"} — matches${pagesFromMeasured ? ` the ${measuredLabel} template on file` : ""}.`,
    });
  } else {
    checks.push({
      key: "tmpl.pages",
      label: isLabels ? "Faces" : "Pages",
      status: "fail",
      message: `${scan.pageCount} ${unit}${scan.pageCount === 1 ? "" : "s"} — expected ${spec.expectedPages}${pagesFromMeasured ? ` (from the ${measuredLabel} template on file)` : ""}.`,
    });
  }

  // 2. Artboard size.
  const exact = spec.templatePageInches;
  const target: BoxInches = exact ?? {
    w: spec.finishedInches.w + spec.bleedInches * 2,
    h: spec.finishedInches.h + spec.bleedInches * 2,
  };
  const pages = scan.pageSizesInches;
  if (pages.length === 0) {
    checks.push({
      key: "tmpl.size",
      label: "Artboard size",
      status: "warn",
      message: `Couldn't read a page size — expected ${dim(target)}${exact ? (sizeFromMeasured ? ` (${measuredLabel} template on file)` : " (vendor template)") : " (computed finished + bleed)"}.`,
    });
  } else {
    const bad = pages.find((p) => !matchesBox(p, target, SIZE_TOL));
    if (exact) {
      if (!bad) {
        checks.push({
          key: "tmpl.size",
          label: "Artboard size",
          status: "pass",
          message: sizeFromMeasured
            ? `${dim(pages[0])} — matches the ${measuredLabel} template on file exactly.`
            : `${dim(pages[0])} — matches the ${spec.label} vendor template exactly.`,
        });
      } else {
        checks.push({
          key: "tmpl.size",
          label: "Artboard size",
          status: "fail",
          message: `${dim(bad)} — expected ${dim(target)} (${sizeFromMeasured ? `measured from the ${measuredLabel} template on file` : "vendor template"}). Override with justification if this is a legitimate variant.`,
        });
      }
    } else {
      // No vendor template on file → computed target can only advise.
      if (!bad) {
        checks.push({
          key: "tmpl.size",
          label: "Artboard size",
          status: "pass",
          message: `${dim(pages[0])} — matches computed finished + bleed (${dim(target)}). No vendor template on file; verify against the plant's spec.`,
        });
      } else {
        checks.push({
          key: "tmpl.size",
          label: "Artboard size",
          status: "warn",
          message: `${dim(bad)} vs computed ${dim(target)}. No vendor template on file for this size/kind — verify against the plant's spec.`,
        });
      }
    }
  }

  // 3. Color.
  if (spec.color === "process-4c") {
    if (scan.hasCMYK) {
      checks.push({
        key: "tmpl.color",
        label: "Color (4-color process)",
        status: "pass",
        message: `CMYK process present${scan.hasSpot ? " (+ spot)" : ""}${scan.hasRGB ? " — embedded RGB preview ignored" : ""}.`,
      });
    } else if (scan.hasSpot) {
      // process-4c means a full-color label printed in CMYK. A spot-only
      // file is a 1-color imprint — the WRONG process for this slot — so it
      // must BLOCK (fail), not merely advise. Override-with-justification
      // remains the escape hatch for a deliberate spot-as-process job.
      checks.push({
        key: "tmpl.color",
        label: "Color (4-color process)",
        status: "fail",
        message: "Spot color only — this label is specified as 4-color process (CMYK), not a 1-color spot imprint. Supply CMYK art, or change the label spec / override with justification.",
      });
    } else if (scan.hasRGB) {
      checks.push({
        key: "tmpl.color",
        label: "Color (4-color process)",
        status: "fail",
        message: "RGB only — labels must be 4-color process (CMYK).",
      });
    } else {
      checks.push({
        key: "tmpl.color",
        label: "Color (4-color process)",
        status: "warn",
        message: "Couldn't determine color mode — confirm 4-color process (CMYK).",
      });
    }
  } else {
    // cmyk-or-pms
    if (scan.hasCMYK || scan.hasSpot) {
      const parts = [scan.hasCMYK ? "CMYK" : null, scan.hasSpot ? "spot/PMS" : null].filter(Boolean);
      checks.push({
        key: "tmpl.color",
        label: "Color (CMYK / PMS)",
        status: "pass",
        message: `${parts.join(" + ")} present${scan.hasRGB ? " — embedded RGB preview ignored" : ""}.`,
      });
    } else if (scan.hasRGB) {
      checks.push({
        key: "tmpl.color",
        label: "Color (CMYK / PMS)",
        status: "fail",
        message: "RGB only — print components must be CMYK or named spot/PMS colors.",
      });
    } else {
      checks.push({
        key: "tmpl.color",
        label: "Color (CMYK / PMS)",
        status: "warn",
        message: "Couldn't determine color mode — confirm CMYK or spot/PMS.",
      });
    }
  }

  // 4. Fonts — embedded or fully outlined.
  if (!scan.hasFontDicts) {
    checks.push({
      key: "tmpl.fonts",
      label: "Fonts",
      status: "pass",
      message: "No live text detected — type appears outlined.",
    });
  } else if (scan.hasEmbeddedFonts) {
    checks.push({
      key: "tmpl.fonts",
      label: "Fonts",
      status: "pass",
      message: "All fonts embedded.",
    });
  } else {
    checks.push({
      key: "tmpl.fonts",
      label: "Fonts",
      status: "fail",
      message: "Live text with no embedded font program — outline the type or embed all fonts before sending.",
    });
  }

  // 5. Dieline / template layer — ADVISORY ONLY, never blocks. Every real
  // print-ready file we've measured keeps the dieline/template layer (set
  // non-printing), so a hard fail here would false-fail every correct file.
  if (scan.hasDieline) {
    checks.push({
      key: "tmpl.dieline",
      label: "Dieline / template layer",
      status: "warn",
      message: "Template/dieline tokens present — confirm that layer is set non-printing (this is normal and not a blocker).",
    });
  } else {
    checks.push({
      key: "tmpl.dieline",
      label: "Dieline / template layer",
      status: "pass",
      message: "No dieline/template layer detected.",
    });
  }

  // 6. Minimum image resolution — best-effort estimate, ADVISORY ONLY.
  // The scanner reads embedded image pixel dimensions but NOT placement
  // (no content-stream matrix parsing), so we estimate a lower-bound PPI
  // by assuming the largest embedded image spans the full artboard. A
  // smaller placement only raises the effective PPI, so a passing estimate
  // is safe; a failing estimate can only WARN (never hard-fail) because
  // the image may genuinely be placed smaller.
  // Task #3012 — the press-level printRules.minPpi is a default; the
  // component catalog column (spec.minPpi) always wins when set. When no
  // press rules exist this is exactly `spec.minPpi` (unchanged behavior).
  const rules = spec.printRules ?? null;
  const pressName = spec.pressName || null;
  const pressWord = pressName ?? "the press";
  const effectiveMinPpi =
    spec.minPpi != null && spec.minPpi > 0
      ? spec.minPpi
      : rules?.minPpi != null && rules.minPpi > 0
        ? Math.round(rules.minPpi)
        : null;
  // Lower-bound PPI for an image assumed to span the artboard: per
  // orientation, the effective PPI is the SMALLER of px-width/in-width
  // and px-height/in-height (the constrained axis governs). Allow the
  // better of the two orientations (image may be rotated 90°), then
  // take the best (largest) estimate across embedded images.
  // (`target` from the artboard-size check above — same placement basis.)
  const bestPpiEstimate = (dims: { w: number; h: number }[]): number => {
    let best = 0;
    for (const d of dims) {
      const est = Math.max(
        Math.min(d.w / target.w, d.h / target.h),
        Math.min(d.w / target.h, d.h / target.w),
      );
      if (est > best) best = est;
    }
    return best;
  };
  if (effectiveMinPpi != null) {
    const minPpi = effectiveMinPpi;
    const dims = scan.imageDimsPx;
    if (dims.length === 0) {
      checks.push({
        key: "tmpl.min_ppi",
        label: `Image resolution (min ${minPpi} PPI)`,
        status: "warn",
        message: `Couldn't measure any embedded images — verify placed images are at least ${minPpi} PPI.`,
      });
    } else {
      const best = bestPpiEstimate(dims);
      const rounded = Math.round(best);
      if (best >= minPpi) {
        checks.push({
          key: "tmpl.min_ppi",
          label: `Image resolution (min ${minPpi} PPI)`,
          status: "pass",
          message: `Largest embedded image ≈${rounded} PPI at full-artboard placement — meets the ${minPpi} PPI minimum (placement not measured; estimate only).`,
        });
      } else {
        checks.push({
          key: "tmpl.min_ppi",
          label: `Image resolution (min ${minPpi} PPI)`,
          status: "warn",
          message: `Largest embedded image ≈${rounded} PPI if placed full-artboard — below the ${minPpi} PPI minimum. Placement isn't measured, so verify the actual placed resolution.`,
        });
      }
    }
  }

  // ─── Task #3012 — press-specific print-rule checks. Every block below
  // is gated on the press having entered a value; with no rules the
  // checks above are the complete (unchanged) output.

  // 7. Bleed measured from the PDF's own boxes (TrimBox vs BleedBox/
  // MediaBox) against the press's minimum / recommended values.
  if (rules && (rules.bleedMinInches != null || rules.bleedRecommendedInches != null)) {
    const min = rules.bleedMinInches ?? 0;
    const rec = rules.bleedRecommendedInches ?? null;
    const specText =
      rules.bleedMinInches != null
        ? `${pressWord} requires ≥${min}" bleed${rec != null ? `; ${rec}" recommended` : ""}`
        : `${pressWord} recommends ${rec}" bleed`;
    const measured = measuredBleedInches(scan);
    if (measured == null) {
      checks.push({
        key: "tmpl.bleed",
        label: "Bleed",
        status: "warn",
        message: `Couldn't measure bleed (the PDF carries no trim box). ${specText}.`,
      });
    } else {
      const m = Math.round(measured * 1000) / 1000;
      if (rules.bleedMinInches != null && measured + BLEED_TOL < min) {
        checks.push({
          key: "tmpl.bleed",
          label: "Bleed",
          status: "fail",
          message: `Measured ≈${m}" bleed beyond the trim line — ${specText}.`,
        });
      } else if (rec != null && measured + BLEED_TOL < rec) {
        checks.push({
          key: "tmpl.bleed",
          label: "Bleed",
          status: "warn",
          message: `Measured ≈${m}" bleed — meets the minimum but is below the recommended ${rec}" (${specText}).`,
        });
      } else {
        checks.push({
          key: "tmpl.bleed",
          label: "Bleed",
          status: "pass",
          message: `Measured ≈${m}" bleed beyond the trim line — ${specText}.`,
        });
      }
    }

    // Edge-band bleed-content heuristic — ADVISORY ONLY, only emitted when
    // the caller could render the file (own direct uploads); a render
    // failure or pasted URL simply omits the row.
    if (opts?.edgeBand === "empty") {
      checks.push({
        key: "tmpl.edge_band",
        label: "Bleed content",
        status: "warn",
        message:
          "Outer bleed band appears empty — art may not extend to the cut line. White-background designs legitimately trip this; verify visually.",
      });
    } else if (opts?.edgeBand === "filled") {
      checks.push({
        key: "tmpl.edge_band",
        label: "Bleed content",
        status: "pass",
        message: "Artwork extends into the outer bleed band beyond the trim line.",
      });
    }
  }

  // 8. Second PPI floor for 1-bit / bitmap (line-art) images.
  if (rules?.minPpiBitmap != null && rules.minPpiBitmap > 0) {
    const floor = Math.round(rules.minPpiBitmap);
    const dims = scan.bitmapImageDimsPx;
    if (dims.length === 0) {
      checks.push({
        key: "tmpl.min_ppi_bitmap",
        label: `Bitmap/line-art resolution (min ${floor} PPI)`,
        status: "pass",
        message: `No 1-bit/bitmap images detected — nothing held to ${pressWord}'s ${floor} PPI line-art floor.`,
      });
    } else {
      const best = bestPpiEstimate(dims);
      const rounded = Math.round(best);
      checks.push({
        key: "tmpl.min_ppi_bitmap",
        label: `Bitmap/line-art resolution (min ${floor} PPI)`,
        status: best >= floor ? "pass" : "warn",
        message:
          best >= floor
            ? `Largest 1-bit image ≈${rounded} PPI at full-artboard placement — meets ${pressWord}'s ${floor} PPI line-art minimum (estimate only).`
            : `Largest 1-bit image ≈${rounded} PPI if placed full-artboard — below ${pressWord}'s ${floor} PPI line-art minimum. Placement isn't measured, so verify the actual placed resolution.`,
      });
    }
  }

  // 9. Grayscale-required pieces (press flags a B/W component).
  if (rules?.grayscaleRequired) {
    if (scan.hasRGB) {
      checks.push({
        key: "tmpl.grayscale",
        label: "Grayscale (B/W piece)",
        status: "fail",
        message: `${pressWord} requires this piece built as grayscale — RGB color usage detected.`,
      });
    } else if (scan.hasCMYK) {
      checks.push({
        key: "tmpl.grayscale",
        label: "Grayscale (B/W piece)",
        status: "warn",
        message: `${pressWord} requires this piece built as grayscale — CMYK color usage detected; confirm all art is actually grayscale-only.`,
      });
    } else {
      checks.push({
        key: "tmpl.grayscale",
        label: "Grayscale (B/W piece)",
        status: "pass",
        message: scan.hasDeviceGray
          ? "Grayscale ink usage detected; no RGB/CMYK color usage found."
          : "No RGB/CMYK color usage found.",
      });
    }
  }

  // 10. Official-Pantone spot colors only (name heuristic, never a fail —
  // the scanner can't always recover every Separation name).
  if (rules?.pantoneOnly) {
    if (!scan.hasSpot) {
      checks.push({
        key: "tmpl.pantone",
        label: "Pantone spot colors",
        status: "pass",
        message: `No spot colors detected (${pressWord} accepts only official Pantone spot inks).`,
      });
    } else {
      const named = scan.spotColorNames.filter((n) => !PROCESS_SEP_NAMES.has(n.toLowerCase()));
      const offBrand = named.filter((n) => !isOfficialPantoneName(n));
      if (named.length === 0) {
        checks.push({
          key: "tmpl.pantone",
          label: "Pantone spot colors",
          status: "warn",
          message: `Spot colors detected but their names couldn't be read — ${pressWord} accepts only official Pantone spot inks; verify each swatch is a PANTONE library color.`,
        });
      } else if (offBrand.length > 0) {
        const list = offBrand.slice(0, 5).join('", "');
        checks.push({
          key: "tmpl.pantone",
          label: "Pantone spot colors",
          status: "warn",
          message: `Spot color${offBrand.length > 1 ? "s" : ""} "${list}" ${offBrand.length > 1 ? "don't" : "doesn't"} look like official Pantone names — ${pressWord} accepts only official Pantone spot inks.`,
        });
      } else {
        checks.push({
          key: "tmpl.pantone",
          label: "Pantone spot colors",
          status: "pass",
          message: `All named spot colors look like official Pantone inks (${named.slice(0, 5).join(", ")}).`,
        });
      }
    }
  }

  // 11. Placed-image format rule (PNG-provenance heuristic: print-ready
  // placements carry no soft transparency mask; PNG-sourced ones do).
  if (rules?.placedImageRule) {
    if (scan.smaskImageCount > 0) {
      checks.push({
        key: "tmpl.placed_format",
        label: "Placed image formats",
        status: "warn",
        message: `${scan.smaskImageCount} placed image${scan.smaskImageCount > 1 ? "s carry" : " carries"} a soft transparency mask (typical of PNG/GIF-sourced art). ${pressWord}: ${rules.placedImageRule}`,
      });
    } else {
      checks.push({
        key: "tmpl.placed_format",
        label: "Placed image formats",
        status: "pass",
        message: `No PNG-style transparency masks detected. ${pressWord}: ${rules.placedImageRule}`,
      });
    }
  }

  // 12. Advisory rows — the press's own wording for rules that can't be
  // machine-verified. Status "pass" + tier "advisory" so they inform
  // without flipping an otherwise-clean component to "warnings".
  if (rules?.safetyMarginInches != null && rules.safetyMarginInches > 0) {
    checks.push({
      key: "tmpl.safety",
      label: "Safety margin",
      status: "pass",
      tier: "advisory",
      message: `Keep text and critical art at least ${rules.safetyMarginInches}" inside the cut line (${pressWord} spec) — content position isn't machine-verified.`,
    });
  }
  for (let i = 0; i < (rules?.advisories?.length ?? 0); i++) {
    checks.push({
      key: `tmpl.advisory_${i}`,
      label: `${pressName ?? "Press"} advisory`,
      status: "pass",
      tier: "advisory",
      message: rules!.advisories![i],
    });
  }

  return checks;
}

// ─── SSRF-guarded streaming fetch ─────────────────────────────────────

export type FetchScanResult =
  | { ok: true; scan: CompletedPdfScan; fileName: string | null; finalUrl: string }
  | { ok: false; error: string };

// Normalize known share-link patterns so we land on the raw bytes. Dropbox
// serves the file (not the HTML preview) when `dl=1`; the subsequent
// redirect to dl.dropboxusercontent.com is followed + re-validated below.
function normalizeShareUrl(raw: string): string {
  const s = raw.trim();
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host === "dropbox.com" || host === "www.dropbox.com" || host.endsWith(".dropbox.com")) {
      u.searchParams.set("dl", "1");
      return u.toString();
    }
    return u.toString();
  } catch {
    return s;
  }
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const o = ip.split(".").map(Number);
    const [a, b] = o;
    if (a === 0 || a === 127) return true; // this-network / loopback
    if (a === 10) return true; // private
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const h = ip.toLowerCase();
    if (h === "::1") return true; // loopback
    if (h.startsWith("fe80")) return true; // link-local
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local
    if (h.startsWith("::ffff:")) return isBlockedIp(h.slice(7)); // v4-mapped
    return false;
  }
  return true; // not a recognizable IP → block
}

// Returns an error string if the URL is unsafe to fetch, else null.
async function unsafeReason(u: URL): Promise<string | null> {
  if (u.protocol !== "https:") return "Only https:// links are accepted.";
  const host = u.hostname.toLowerCase();
  if (host.endsWith(".internal") || host === "localhost") return "That host isn't allowed.";
  if (net.isIP(host)) return isBlockedIp(host) ? "That address isn't allowed." : null;
  let addrs: string[] = [];
  try {
    addrs = (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    return "Couldn't resolve that host.";
  }
  if (addrs.length === 0) return "Couldn't resolve that host.";
  if (addrs.some(isBlockedIp)) return "That host resolves to a private address.";
  return null;
}

function filenameFromResponse(res: Response, url: URL): string | null {
  const cd = res.headers.get("content-disposition") || "";
  const star = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
  if (plain) return plain[1].trim();
  try {
    const base = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    return base || null;
  } catch {
    return null;
  }
}

/**
 * Fetch a pasted (Dropbox/etc.) URL safely and stream it through the
 * scanner. Never buffers the whole file; never stores it. Manual redirects
 * are followed up to 5 hops, each re-validated.
 */
export async function fetchAndScanPdf(
  rawUrl: string,
  opts?: { maxBytes?: number; timeoutMs?: number },
): Promise<FetchScanResult> {
  const maxBytes = opts?.maxBytes ?? 800 * 1024 * 1024;
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  let current: URL;
  try {
    current = new URL(normalizeShareUrl(rawUrl));
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response | null = null;
    let hops = 0;
    for (;;) {
      const why = await unsafeReason(current);
      if (why) return { ok: false, error: why };
      res = await fetch(current.toString(), {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { Accept: "application/pdf,application/octet-stream,*/*" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "The link redirected without a destination." };
        if (++hops > 5) return { ok: false, error: "Too many redirects." };
        try {
          current = new URL(loc, current);
        } catch {
          return { ok: false, error: "The link redirected to an invalid URL." };
        }
        continue;
      }
      break;
    }

    if (!res.ok) return { ok: false, error: `Couldn't fetch the file (HTTP ${res.status}).` };

    const declared = Number(res.headers.get("content-length") || "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, error: `File is too large to scan (${Math.round(declared / 1e6)} MB).` };
    }

    const fileName = filenameFromResponse(res, current);
    const body = res.body as ReadableStream<Uint8Array> | null;
    if (!body) return { ok: false, error: "The server returned an empty response." };

    const scanner = new CompletedPdfScanner({ maxBytes });
    const reader = body.getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      scanner.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
    }

    const scan = scanner.finish();
    if (!scan.isPdf) return { ok: false, error: "That link doesn't point at a PDF file." };
    return { ok: true, scan, fileName, finalUrl: current.toString() };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "Timed out fetching the file — try again." };
    return { ok: false, error: "Couldn't fetch the file from that link." };
  } finally {
    clearTimeout(timer);
  }
}
