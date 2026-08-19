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
import zlib from "node:zlib";
import type { CheckResult } from "@shared/uploadValidation";
import type { FinishedComponentSpec } from "@shared/vendorSpecs";
import type { GuideEdges, MeasuredTemplateGuides } from "@shared/templateGuides";

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
  /**
   * Task #3069 — whether spot colorspaces are actually USED by page
   * content, not merely defined (Illustrator embeds unused swatch
   * definitions, incl. in its private round-trip data).
   *   "none"    — no /Separation or /DeviceN tokens at all.
   *   "used"    — a content stream selects (`cs`/`CS`) a colorspace
   *               resource that resolves to a Separation/DeviceN object.
   *   "unused"  — spot definitions exist, content streams decoded fine,
   *               and none of them is ever selected.
   *   "unknown" — usage couldn't be confirmed; see spotUsageReason.
   */
  spotUsage: SpotUsage;
  /** Task #3069 — why usage couldn't be confirmed (null unless "unknown"). */
  spotUsageReason: SpotUsageReason | null;
  /** Task #3069 — who the "unknown" is attributed to: "file" (encrypted /
   * malformed — a problem with the file) or "system" (a GoodTunes scanner
   * limitation: caps, legacy compression, unsupported-but-valid structure). */
  spotUsageAttribution: "file" | "system" | null;
  /** Task #3069 — decoded names of the spot colorspaces confirmed USED
   * (subset semantics of spotColorNames; may be empty for used DeviceN /
   * unreadable names). */
  usedSpotColorNames: string[];
  /**
   * Task #3097 — guide geometry (bleed/cut/safety rings + fold/score lines)
   * extracted from a "does not print" dieline spot separation's stroked
   * vector paths. Conservative: null whenever extraction couldn't run or
   * classification is ambiguous (multi-page files, encrypted/exotic
   * structure, caps hit, no dieline-named separation, unclassifiable
   * strokes) — never a guess.
   */
  dielineGuides: MeasuredTemplateGuides | null;
};

export type SpotUsage = "none" | "used" | "unused" | "unknown";
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

const OBJ_HEADER_RE = /(\d+)\s+\d+\s+obj\b/g;
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

  // Task #3069 — spot-usage state.
  private pend = ""; // unprocessed committed text for the stream machine
  private streamMode: "idle" | "capture" | "skip" = "idle";
  private streamBuf = "";
  private streamFlate = false;
  private encrypted = false;
  private objStm = false;
  private lzwContent = false;
  private otherFilterContent = false;
  private zlibFailed = false;
  private capHit = false;
  private decodedStreams = 0;
  private totalCaptured = 0;
  private readonly sepObjIds = new Set<string>(); // obj ids defining Separation/DeviceN
  private readonly sepObjName = new Map<string, string>(); // obj id → decoded name
  private readonly csRefEntries = new Map<string, string>(); // resource name → obj id
  private readonly csInlineSep = new Map<string, string>(); // resource name → sep name ("" = unreadable)
  private readonly csAmbiguous = new Set<string>(); // resource names mapped to CONFLICTING targets
  private readonly csNonSpot = new Set<string>(); // resource names aliased DIRECTLY to a standard non-spot space (/CS0 /DeviceCMYK)
  private readonly csRefTargets = new Set<string>(); // obj ids referenced via `/ColorSpace N 0 R` anywhere (incl. image dicts)
  // Task #3097 — dieline guide extraction: first MediaBox rect (pts, with
  // origin) + retained decoded content-stream code, interpreted at finish()
  // once every separation-resource mapping has been seen.
  private mediaRectPts: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private readonly guideCode: string[] = [];
  private guideCodeBytes = 0;
  private guideOverflow = false;
  private spotImage = false; // image XObject with an inline Separation/DeviceN colorspace
  private readonly spotImageNames = new Set<string>(); // readable inline spot-image ink names
  private readonly contentCsNames = new Set<string>(); // names selected via cs/CS

  // Task #3069 caps — instance fields so tests can exercise each boundary.
  private readonly capTotalStream: number;
  private readonly capPerStreamCompressed: number;
  private readonly capPerStreamDecoded: number;
  private readonly capEntries: number;

  constructor(opts?: {
    maxBytes?: number;
    spotCaps?: { totalStream?: number; perStreamCompressed?: number; perStreamDecoded?: number; entries?: number };
  }) {
    this.maxBytes = opts?.maxBytes ?? 800 * 1024 * 1024; // 800MB hard ceiling
    this.capTotalStream = opts?.spotCaps?.totalStream ?? TOTAL_STREAM_CAP;
    this.capPerStreamCompressed = opts?.spotCaps?.perStreamCompressed ?? PER_STREAM_COMPRESSED_CAP;
    this.capPerStreamDecoded = opts?.spotCaps?.perStreamDecoded ?? PER_STREAM_DECODED_CAP;
    this.capEntries = opts?.spotCaps?.entries ?? 5000;
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
    // An unterminated content stream at EOF = broken/malformed file.
    if (this.streamMode === "capture") this.zlibFailed = true;
    this.pend = "";
    this.streamBuf = "";

    // Task #3069 — resolve spot USAGE from the collected evidence.
    let spotUsage: SpotUsage = "none";
    let spotUsageReason: SpotUsageReason | null = null;
    const usedNames = new Set<string>();
    // Names `cs`/`CS` may take DIRECTLY without a resource-dict lookup.
    const DIRECT_CS = new Set(["DeviceGray", "DeviceRGB", "DeviceCMYK", "Pattern"]);
    let unresolvedSelection = false;
    let provenUsed = false;
    if (this.spot) {
      for (const n of Array.from(this.contentCsNames)) {
        if (DIRECT_CS.has(n)) continue;
        if (this.csAmbiguous.has(n)) {
          // Same resource name mapped to conflicting targets across
          // scopes — can't safely say which one this selection means.
          unresolvedSelection = true;
          continue;
        }
        const inline = this.csInlineSep.get(n);
        if (inline !== undefined) {
          provenUsed = true;
          if (inline) usedNames.add(inline);
          continue;
        }
        if (this.csNonSpot.has(n)) continue; // direct alias to a standard non-spot space
        const ref = this.csRefEntries.get(n);
        if (ref !== undefined) {
          if (this.sepObjIds.has(ref)) {
            provenUsed = true;
            const nm = this.sepObjName.get(ref);
            if (nm) usedNames.add(nm);
          }
          continue; // resolved to a non-spot colorspace — fine
        }
        // Selected but NEVER resolved (e.g. the resources live in an
        // indirect /ColorSpace dict or an ObjStm we can't see) — a spot
        // could hide behind it, so this can never support "unused".
        unresolvedSelection = true;
      }
      // Spot-bearing IMAGE colorspaces count as usage (inline, or a
      // /ColorSpace ref that resolves to a Separation/DeviceN object).
      if (this.spotImage) {
        provenUsed = true;
        for (const nm of Array.from(this.spotImageNames)) usedNames.add(nm);
      }
      for (const id of Array.from(this.csRefTargets)) {
        if (this.sepObjIds.has(id)) {
          provenUsed = true;
          const nm = this.sepObjName.get(id);
          if (nm) usedNames.add(nm);
        }
      }
      // A "used" verdict requires that EVERY selected colorspace resolved:
      // an unresolved/ambiguous selection could hide a different (e.g.
      // non-Pantone) spot, so it forces the reason-coded fallback even
      // when another spot is provably used.
      if (provenUsed && !unresolvedSelection) spotUsage = "used";
      if (spotUsage !== "used") {
        // Conservative, reason-coded fallback — never pass blindly.
        if (this.encrypted) spotUsageReason = "encrypted";
        else if (this.zlibFailed) spotUsageReason = "malformed";
        else if (this.lzwContent) spotUsageReason = "unsupported-compression";
        else if (this.capHit || this._truncated) spotUsageReason = "cap-reached";
        else if (
          this.objStm ||
          this.otherFilterContent ||
          this.decodedStreams === 0 ||
          unresolvedSelection
        ) {
          spotUsageReason = "unsupported-structure";
        }
        spotUsage = spotUsageReason ? "unknown" : "unused";
      }
    }
    const spotUsageAttribution =
      spotUsageReason == null
        ? null
        : spotUsageReason === "encrypted" || spotUsageReason === "malformed"
          ? ("file" as const)
          : ("system" as const);

    const pageCount = this.typePage > 0 ? this.typePage : this.media.length;

    // Task #3097 — dieline guide extraction. Only attempted when the whole
    // file was read cleanly, it is a single page (content stream ↔ page
    // association is unknowable in a streaming scan), and at least one
    // separation carries a guide-style name. Any failure → null (no guess).
    let dielineGuides: MeasuredTemplateGuides | null = null;
    if (
      this._isPdf &&
      !this._truncated &&
      !this.encrypted &&
      !this.zlibFailed &&
      !this.lzwContent &&
      !this.otherFilterContent &&
      !this.objStm &&
      !this.capHit &&
      !this.guideOverflow &&
      pageCount === 1 &&
      this.mediaRectPts
    ) {
      try {
        // Resolve which resource names select a guide separation.
        const guideRes = new Map<string, string>(); // resource name → sep name
        const seen = new Set<string>();
        for (const [res, nm] of Array.from(this.csInlineSep)) {
          if (!this.csAmbiguous.has(res) && nm && GUIDE_SEP_NAME_RE.test(nm)) {
            guideRes.set(res, nm);
          }
        }
        for (const [res, objId] of Array.from(this.csRefEntries)) {
          if (this.csAmbiguous.has(res) || guideRes.has(res)) continue;
          const nm = this.sepObjName.get(objId);
          if (nm && GUIDE_SEP_NAME_RE.test(nm)) guideRes.set(res, nm);
        }
        if (guideRes.size > 0) {
          const strokes: GuideStroke[] = [];
          for (const code of this.guideCode) {
            for (const st of interpretGuideStrokes(code)) {
              if (!guideRes.has(st.csResource)) continue;
              seen.add(guideRes.get(st.csResource)!);
              strokes.push(st);
            }
          }
          const classified = classifyDielineGuides(strokes, this.mediaRectPts);
          if (classified) {
            classified.sepNames = Array.from(seen).sort();
            dielineGuides = classified;
          }
        }
      } catch {
        dielineGuides = null; // conservative — extraction must never break a scan
      }
    }

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
      spotUsage,
      spotUsageReason,
      spotUsageAttribution,
      usedSpotColorNames: Array.from(usedNames),
      dielineGuides,
    };
  }

  private scanWindow(s: string, commit: number): void {
    // Task #3069 — feed the committed slice to the content-stream machine
    // FIRST (the commit-gated slices concatenate to the exact byte stream,
    // each byte exactly once — see push()).
    if (commit > 0) this.trackCommitted(s.slice(0, commit));

    // Booleans: OR over the whole window every time (idempotent — seeing a
    // token twice across the carry overlap is harmless).
    if (!this.cmyk && /\/DeviceCMYK\b/.test(s)) this.cmyk = true;
    if (!this.rgb && /\/DeviceRGB\b/.test(s)) this.rgb = true;
    if (!this.spot && (/\/Separation\b/.test(s) || /\/DeviceN\b/.test(s))) this.spot = true;
    if (!this.fontDicts && (/\/Type\s*\/Font\b/.test(s) || /\/BaseFont\b/.test(s))) this.fontDicts = true;
    if (!this.embedded && /\/FontFile[23]?\b/.test(s)) this.embedded = true;
    if (!this.gray && /\/(DeviceGray|CalGray)\b/.test(s)) this.gray = true;
    if (!this.dieline && /(dieline|die[\s_-]?cut|do[\s_-]?not[\s_-]?print|template)/i.test(s)) this.dieline = true;
    // Task #3069 — structure flags for the spot-usage fallback reasons.
    if (!this.encrypted && ENCRYPT_RE.test(s)) this.encrypted = true;
    if (!this.objStm && /\/Type\s*\/ObjStm\b/.test(s)) this.objStm = true;

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

    // Task #3069 — objects defining Separation/DeviceN colorspaces
    // (lookahead < CARRY so the slice is always fully present).
    OBJ_HEADER_RE.lastIndex = 0;
    let om: RegExpExecArray | null;
    while ((om = OBJ_HEADER_RE.exec(s)) !== null) {
      if (om.index < commit && this.sepObjIds.size >= this.capEntries) this.capHit = true;
      if (om.index < commit && this.sepObjIds.size < this.capEntries) {
        let ahead = s.slice(om.index, om.index + OBJ_LOOKAHEAD);
        // Never look past this object's end — a following object's
        // /Separation must not be attributed to THIS obj id.
        const end = ahead.indexOf("endobj", om[0].length);
        if (end >= 0) ahead = ahead.slice(0, end);
        if (/\/Separation\b/.test(ahead) || /\/DeviceN\b/.test(ahead)) {
          const id = om[1];
          this.sepObjIds.add(id);
          SEPARATION_NAME_RE.lastIndex = 0;
          const nameM = SEPARATION_NAME_RE.exec(ahead);
          if (nameM && !this.sepObjName.has(id)) {
            const nm = decodePdfName(nameM[1]).trim();
            if (nm) this.sepObjName.set(id, nm);
          }
        }
      }
      if (om.index === OBJ_HEADER_RE.lastIndex) OBJ_HEADER_RE.lastIndex++;
    }

    // Task #3069 — /ColorSpace resource dictionaries: name → obj ref, plus
    // inline [/Separation …] / [/DeviceN …] arrays.
    CS_DICT_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = CS_DICT_RE.exec(s)) !== null) {
      if (cm.index < commit && this.csRefEntries.size >= this.capEntries) this.capHit = true;
      if (cm.index < commit && this.csRefEntries.size < this.capEntries) {
        const body = cm[1];
        CS_INLINE_SEP_RE.lastIndex = 0;
        let im2: RegExpExecArray | null;
        while ((im2 = CS_INLINE_SEP_RE.exec(body)) !== null) {
          const res = decodePdfName(im2[1]);
          const nm = im2[2] === "Separation" && im2[3] ? decodePdfName(im2[3]).trim() : "";
          const prev = this.csInlineSep.get(res);
          if (prev === undefined) {
            // Same name already mapped to an obj ref elsewhere → ambiguous.
            if (this.csRefEntries.has(res) || this.csNonSpot.has(res)) this.csAmbiguous.add(res);
            this.csInlineSep.set(res, nm);
          } else if (prev !== nm) {
            this.csAmbiguous.add(res); // conflicting inline targets
          }
          if (im2.index === CS_INLINE_SEP_RE.lastIndex) CS_INLINE_SEP_RE.lastIndex++;
        }
        CS_REF_ENTRY_RE.lastIndex = 0;
        let rm: RegExpExecArray | null;
        while ((rm = CS_REF_ENTRY_RE.exec(body)) !== null) {
          const res = decodePdfName(rm[1]);
          const prev = this.csRefEntries.get(res);
          if (prev === undefined) {
            if (this.csInlineSep.has(res) || this.csNonSpot.has(res)) this.csAmbiguous.add(res);
            this.csRefEntries.set(res, rm[2]);
          } else if (prev !== rm[2]) {
            this.csAmbiguous.add(res); // same name → different objects
          }
          if (rm.index === CS_REF_ENTRY_RE.lastIndex) CS_REF_ENTRY_RE.lastIndex++;
        }
        // Direct non-spot aliases (`/CS0 /DeviceCMYK`) — strip bracketed
        // arrays first so `/Separation /Name /DeviceCMYK` inside an inline
        // array can't masquerade as an alias.
        const flatBody = body.replace(/\[[^\]]*\]?/g, " ");
        const CS_DIRECT_NONSPOT_RE =
          /\/([^\s/\[\]<>()]+)\s*\/(DeviceGray|DeviceRGB|DeviceCMYK|CalGray|CalRGB|Lab|Pattern)\b/g;
        let dm: RegExpExecArray | null;
        while ((dm = CS_DIRECT_NONSPOT_RE.exec(flatBody)) !== null) {
          const res = decodePdfName(dm[1]);
          if (!this.csNonSpot.has(res)) {
            if (this.csInlineSep.has(res) || this.csRefEntries.has(res)) this.csAmbiguous.add(res);
            this.csNonSpot.add(res);
          }
          if (dm.index === CS_DIRECT_NONSPOT_RE.lastIndex) CS_DIRECT_NONSPOT_RE.lastIndex++;
        }
      }
      if (cm.index === CS_DICT_RE.lastIndex) CS_DICT_RE.lastIndex++;
    }

    // Task #3069 — every obj id referenced via `/ColorSpace N 0 R` (page
    // resources OR image dicts): if any resolves to a Separation/DeviceN
    // object, spot ink is genuinely painted. (Idempotent set — overlap-safe.)
    const CS_REF_TARGET_RE = /\/ColorSpace\s+(\d+)\s+\d+\s+R\b/g;
    let tm2: RegExpExecArray | null;
    while ((tm2 = CS_REF_TARGET_RE.exec(s)) !== null) {
      if (this.csRefTargets.size < this.capEntries) this.csRefTargets.add(tm2[1]);
      else if (!this.csRefTargets.has(tm2[1])) this.capHit = true;
      if (tm2.index === CS_REF_TARGET_RE.lastIndex) CS_REF_TARGET_RE.lastIndex++;
    }

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

  // Task #3069 — bounded state machine over the committed byte stream:
  // capture non-image/non-font content streams (raw or FlateDecode),
  // decompress under caps, and record `/Name cs|CS` colorspace selections.
  private trackCommitted(text: string): void {
    this.pend += text;
    for (;;) {
      if (this.streamMode === "idle") {
        const m = /stream\r?\n/.exec(this.pend);
        if (!m) {
          if (this.pend.length > STREAM_LOOKBACK) {
            this.pend = this.pend.slice(this.pend.length - STREAM_LOOKBACK);
          }
          return;
        }
        const i = m.index;
        const after = i + m[0].length;
        // Reject `endstream` (or any identifier ending in "stream").
        if (i > 0 && /[A-Za-z0-9]/.test(this.pend[i - 1])) {
          this.pend = this.pend.slice(after);
          continue;
        }
        const look = this.pend.slice(Math.max(0, i - STREAM_LOOKBACK), i);
        const isImage = /\/Subtype\s*\/Image\b/.test(look);
        const isFont = /\/FontFile[23]?\b/.test(look);
        const isObjStm = /\/Type\s*\/ObjStm\b/.test(look);
        const hasFlate = /\/FlateDecode\b/.test(look);
        const hasLZW = /\/LZWDecode\b/.test(look);
        const hasFilter = /\/Filter\b/.test(look);
        if (isImage || isFont || isObjStm) {
          // Task #3069 — an image XObject can carry a DIRECT Separation/
          // DeviceN colorspace: painted spot ink even with no `cs` operator.
          if (isImage && (/\/Separation\b/.test(look) || /\/DeviceN\b/.test(look))) {
            this.spotImage = true;
            SEPARATION_NAME_RE.lastIndex = 0;
            const nm = SEPARATION_NAME_RE.exec(look);
            if (nm) {
              const decoded = decodePdfName(nm[1]).trim();
              if (decoded) this.spotImageNames.add(decoded);
            }
          }
          this.streamMode = "skip";
        } else if (hasLZW) {
          this.lzwContent = true; // legacy compression we don't decode
          this.streamMode = "skip";
        } else if (hasFilter && !hasFlate) {
          this.otherFilterContent = true; // exotic filter chain
          this.streamMode = "skip";
        } else if (this.totalCaptured >= this.capTotalStream) {
          this.capHit = true;
          this.streamMode = "skip";
        } else {
          this.streamMode = "capture";
          this.streamFlate = hasFlate;
          this.streamBuf = "";
        }
        this.pend = this.pend.slice(after);
        continue;
      }
      const j = this.pend.indexOf("endstream");
      if (j >= 0) {
        if (this.streamMode === "capture") {
          this.streamBuf += this.pend.slice(0, j);
          this.finalizeStream();
        }
        this.streamMode = "idle";
        this.pend = this.pend.slice(j + "endstream".length);
        continue;
      }
      const keep = 12; // enough to reassemble a split "endstream"
      if (this.pend.length > keep) {
        const take = this.pend.slice(0, this.pend.length - keep);
        if (this.streamMode === "capture") {
          this.streamBuf += take;
          if (this.streamBuf.length > this.capPerStreamCompressed) {
            this.capHit = true;
            this.streamBuf = "";
            this.streamMode = "skip";
          }
        }
        this.pend = this.pend.slice(this.pend.length - keep);
      }
      return;
    }
  }

  private finalizeStream(): void {
    // Strip the optional EOL immediately before `endstream`.
    const raw = this.streamBuf.replace(/\r?\n$/, "");
    this.streamBuf = "";
    if (raw.length === 0) return;
    this.totalCaptured += raw.length;
    if (this.totalCaptured > this.capTotalStream) {
      // Crossing the cumulative cap ON this stream: don't trust a partial
      // picture — force the conservative fallback.
      this.capHit = true;
      return;
    }
    let decoded: string;
    if (this.streamFlate) {
      try {
        decoded = zlib
          .inflateSync(Buffer.from(raw, "latin1"), { maxOutputLength: this.capPerStreamDecoded })
          .toString("latin1");
      } catch (e: any) {
        if (e?.code === "ERR_BUFFER_TOO_LARGE") this.capHit = true;
        else this.zlibFailed = true;
        return;
      }
    } else {
      decoded = raw;
    }
    this.decodedStreams++;
    // Lexically strip comments and literal/hex strings so `/Name cs` inside
    // a string or comment never counts as a colorspace selection.
    const code = stripPdfStringsAndComments(decoded);
    // Paint OPERATORS in the content stream are the ground truth for ink
    // usage. Illustrator emits `0 0.5 1 0 k` directly with NO /DeviceCMYK
    // token anywhere in the file, so a genuinely-CMYK file used to read as
    // "RGB only" off a leftover editing-data preview thumbnail (which is
    // never painted on the artboard). Operand-count-anchored patterns:
    // 4 numbers + k/K = CMYK, 3 numbers + rg/RG = RGB, 1 number + g/G = gray.
    if (!this.cmyk && /(?:[\d.]+\s+){4}[kK](?![A-Za-z0-9])/.test(code)) this.cmyk = true;
    if (!this.rgb && /(?:[\d.]+\s+){3}(?:rg|RG)(?![A-Za-z0-9])/.test(code)) this.rgb = true;
    if (!this.gray && /(?:[\d.]+\s+)[gG](?![A-Za-z0-9])/.test(code)) this.gray = true;
    CONTENT_CS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONTENT_CS_RE.exec(code)) !== null) {
      if (this.contentCsNames.size >= MAX_CONTENT_CS_NAMES) {
        // Cap reached: a later selection could be a spot alias we'd miss —
        // force the conservative fallback, never certify "unused".
        this.capHit = true;
        break;
      }
      this.contentCsNames.add(decodePdfName(m[1]));
      if (m.index === CONTENT_CS_RE.lastIndex) CONTENT_CS_RE.lastIndex++;
    }
    // Task #3097 — retain path-bearing content code for guide extraction at
    // finish() (resources routinely appear AFTER the content stream). Bounded;
    // overflow disables guide extraction rather than trusting a partial view.
    if (GUIDE_PATH_OPS_RE.test(code)) {
      if (this.guideCodeBytes + code.length > GUIDE_CODE_CAP) {
        this.guideOverflow = true;
      } else {
        this.guideCode.push(code);
        this.guideCodeBytes += code.length;
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
          // Task #3097 — keep the FIRST MediaBox's raw rect (guide geometry
          // is expressed relative to the artboard incl. its origin).
          if (into === this.media && !this.mediaRectPts) {
            const xs = [parseFloat(m[1]), parseFloat(m[3])];
            const ys = [parseFloat(m[2]), parseFloat(m[4])];
            this.mediaRectPts = {
              x0: Math.min(xs[0], xs[1]),
              y0: Math.min(ys[0], ys[1]),
              x1: Math.max(xs[0], xs[1]),
              y1: Math.max(ys[0], ys[1]),
            };
          }
        }
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
}

/** Scan an in-memory buffer (tests). Pushed in modest chunks so the carry
 * overlap is exercised exactly as it is on a real stream. */
export function scanBuffer(
  buf: Buffer,
  opts?: {
    maxBytes?: number;
    chunk?: number;
    spotCaps?: { totalStream?: number; perStreamCompressed?: number; perStreamDecoded?: number; entries?: number };
  },
): CompletedPdfScan {
  const sc = new CompletedPdfScanner(opts);
  const step = opts?.chunk ?? 64 * 1024;
  for (let i = 0; i < buf.length; i += step) {
    sc.push(buf.subarray(i, Math.min(buf.length, i + step)));
  }
  return sc.finish();
}

// ─── Task #3097: dieline guide extraction ─────────────────────────────
//
// Press templates draw their cut/bleed/safety/fold guides as stroked vector
// paths in a "does not print" spot separation. We interpret a minimal subset
// of the content-stream language (q/Q/cm transform stack, CS stroking-space
// selection, m/l/c/v/y/re/h path building, S/s/B/B*/b/b* stroking) and then
// classify the resulting device-space strokes:
//   • nested boundary rings (bounding boxes of ring-ish paths + the global
//     stroke bbox) → bleed / cut / safety insets,
//   • deep-interior full-span thin lines → fold/score positions.
// Everything is tolerance-checked; when a configuration doesn't fit the
// conservative model we emit nothing rather than guessing.

/** Sep names that mark a non-printing guide separation. Deliberately does
 * NOT match bare "dimension(s)" — those separations carry measurement
 * arrows/callouts, not die geometry. */
export const GUIDE_SEP_NAME_RE =
  /(die\s*line|die[\s_-]?cut|kiss[\s_-]?cut|keyline|do(?:es)?[\s_-]?not[\s_-]?print)/i;

/** Cheap pre-filter: only retain streams that stroke paths at all. */
const GUIDE_PATH_OPS_RE = /(?:^|[\s\]])(?:re|l)[\s]/m;

const GUIDE_CODE_CAP = 24 * 1024 * 1024; // retained decoded code, total
const GUIDE_MAX_STROKES = 4000;
const GUIDE_MAX_PTS_PER_PATH = 2000;

export type GuideStroke = {
  /** Device-space points of all subpaths (order preserved, breaks ignored). */
  pts: { x: number; y: number }[];
  hasCurve: boolean;
  /** Resource name selected via `CS` when this path was stroked. */
  csResource: string;
};

const GUIDE_TOKEN_RE = /\/[^\s/\[\]<>(){}%]+|\[[^\]]*\]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?|[A-Za-z'"*]+/g;
const GUIDE_NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?$/;

type Mat = [number, number, number, number, number, number];
const matMul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const matApply = (m: Mat, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** Interpret one stripped content stream, returning every stroked path with
 * the stroking-colorspace resource name in effect. Pure; exported for tests.
 * Throws only on the hard caps (callers treat that as "no guides"). */
export function interpretGuideStrokes(code: string): GuideStroke[] {
  const out: GuideStroke[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  const stack: { ctm: Mat; cs: string }[] = [];
  let strokeCs = "";
  let nums: number[] = [];
  let lastName = "";
  let pts: { x: number; y: number }[] = [];
  let hasCurve = false;
  let start: { x: number; y: number } | null = null;
  const flushPath = (stroked: boolean) => {
    if (stroked && strokeCs && pts.length >= 2) {
      if (out.length >= GUIDE_MAX_STROKES) throw new Error("guide stroke cap");
      out.push({ pts, hasCurve, csResource: strokeCs });
    }
    pts = [];
    hasCurve = false;
    start = null;
  };
  const addPt = (x: number, y: number) => {
    if (pts.length >= GUIDE_MAX_PTS_PER_PATH) throw new Error("guide point cap");
    const p = matApply(ctm, x, y);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error("non-finite point");
    pts.push(p);
    return p;
  };
  GUIDE_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GUIDE_TOKEN_RE.exec(code)) !== null) {
    const t = m[0];
    if (GUIDE_NUM_RE.test(t)) {
      const v = parseFloat(t);
      if (Number.isFinite(v)) nums.push(v);
      if (nums.length > 12) nums = nums.slice(-12);
      continue;
    }
    if (t[0] === "[") continue; // arrays (dash patterns, TJ) — ignored
    if (t[0] === "/") {
      lastName = decodePdfName(t.slice(1));
      continue;
    }
    switch (t) {
      case "q":
        stack.push({ ctm, cs: strokeCs });
        if (stack.length > 64) throw new Error("q stack cap");
        break;
      case "Q": {
        const top = stack.pop();
        if (top) {
          ctm = top.ctm;
          strokeCs = top.cs;
        }
        break;
      }
      case "cm":
        if (nums.length >= 6) ctm = matMul(nums.slice(-6) as Mat, ctm);
        break;
      case "CS":
        strokeCs = lastName;
        break;
      case "m":
        if (nums.length >= 2) start = addPt(nums[nums.length - 2], nums[nums.length - 1]);
        break;
      case "l":
        if (nums.length >= 2) addPt(nums[nums.length - 2], nums[nums.length - 1]);
        break;
      case "c":
      case "v":
      case "y":
        if (nums.length >= 2) {
          addPt(nums[nums.length - 2], nums[nums.length - 1]);
          hasCurve = true;
        }
        break;
      case "re":
        if (nums.length >= 4) {
          const [x, y, w, h] = nums.slice(-4);
          addPt(x, y);
          addPt(x + w, y);
          addPt(x + w, y + h);
          addPt(x, y + h);
          addPt(x, y);
        }
        break;
      case "h":
        if (start && pts.length < GUIDE_MAX_PTS_PER_PATH) pts.push(start);
        break;
      case "S":
      case "s":
      case "B":
      case "b":
        flushPath(true);
        break;
      case "f":
      case "F":
      case "n":
        flushPath(false);
        break;
      default:
        // B* / b* / f* arrive as 'B'/'b'/'f' + '*'? No — tokenizer keeps
        // letters+'*' together, so handle them here.
        if (t === "B*" || t === "b*") flushPath(true);
        else if (t === "f*") flushPath(false);
        break;
    }
    nums = [];
  }
  return out;
}

type PtRect = { x0: number; y0: number; x1: number; y1: number };

const rectOf = (pts: { x: number; y: number }[]): PtRect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
};

const RING_MERGE_TOL = 3; // pts — bboxes this close are the same ring
const EDGE_TOL = 4; // pts — a line this close to a bbox edge belongs to it
const FOLD_MIN_EDGE_DIST = 0.3 * 72; // folds live deep in the interior
const LINE_THIN = 1.5; // pts

/**
 * Classify guide strokes into bleed/cut/safety rings + fold lines.
 * `media` is the page MediaBox in points. Pure; exported for tests.
 * Returns null when nothing classifiable (or the picture is implausible).
 */
export function classifyDielineGuides(
  strokes: GuideStroke[],
  media: { x0: number; y0: number; x1: number; y1: number },
): MeasuredTemplateGuides | null {
  const straight = strokes.filter((s) => !s.hasCurve && s.pts.length >= 2);
  if (straight.length === 0) return null;
  const mediaW = media.x1 - media.x0;
  const mediaH = media.y1 - media.y0;
  if (!(mediaW > 0 && mediaH > 0)) return null;

  const rects = straight.map((s) => rectOf(s.pts));
  // Global bbox of every straight guide stroke = the outermost boundary.
  const G = rectOf(rects.flatMap((r) => [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }]));
  const gW = G.x1 - G.x0;
  const gH = G.y1 - G.y0;
  // Sanity: the die must occupy a meaningful share of the artboard.
  if (gW < 0.35 * mediaW || gH < 0.35 * mediaH) return null;

  // Split thin full-span lines from ring-ish paths.
  type Line = { axis: "x" | "y"; pos: number; lo: number; hi: number };
  const lines: Line[] = [];
  const ringRects: PtRect[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    if (w <= LINE_THIN && h > LINE_THIN) {
      lines.push({ axis: "x", pos: (r.x0 + r.x1) / 2, lo: r.y0, hi: r.y1 });
    } else if (h <= LINE_THIN && w > LINE_THIN) {
      lines.push({ axis: "y", pos: (r.y0 + r.y1) / 2, lo: r.x0, hi: r.x1 });
    } else if (w > LINE_THIN && h > LINE_THIN) {
      ringRects.push(r);
    }
  }

  // Assemble rectangles out of thin-line quads (dotted safety rects are often
  // drawn as four separate strokes with no closing ring path).
  const vLines = lines.filter((l) => l.axis === "x");
  const hLines = lines.filter((l) => l.axis === "y");
  const quadRects: PtRect[] = [];
  for (let i = 0; i < vLines.length; i++) {
    for (let j = i + 1; j < vLines.length; j++) {
      const L = vLines[i].pos < vLines[j].pos ? vLines[i] : vLines[j];
      const R = vLines[i].pos < vLines[j].pos ? vLines[j] : vLines[i];
      if (R.pos - L.pos < 4 * EDGE_TOL) continue;
      const bot = hLines.find(
        (l) =>
          Math.abs(l.pos - Math.max(L.lo, R.lo)) <= 2 * EDGE_TOL &&
          l.lo <= L.pos + 2 * EDGE_TOL &&
          l.hi >= R.pos - 2 * EDGE_TOL,
      );
      const top = hLines.find(
        (l) =>
          Math.abs(l.pos - Math.min(L.hi, R.hi)) <= 2 * EDGE_TOL &&
          l.lo <= L.pos + 2 * EDGE_TOL &&
          l.hi >= R.pos - 2 * EDGE_TOL,
      );
      if (bot && top && top.pos - bot.pos > 4 * EDGE_TOL) {
        quadRects.push({ x0: L.pos, y0: bot.pos, x1: R.pos, y1: top.pos });
      }
    }
  }

  // Ring set: G + deduped ring/quad bboxes.
  const sameRect = (a: PtRect, b: PtRect) =>
    Math.abs(a.x0 - b.x0) <= RING_MERGE_TOL &&
    Math.abs(a.y0 - b.y0) <= RING_MERGE_TOL &&
    Math.abs(a.x1 - b.x1) <= RING_MERGE_TOL &&
    Math.abs(a.y1 - b.y1) <= RING_MERGE_TOL;
  const rings: PtRect[] = [G];
  for (const r of [...ringRects, ...quadRects]) {
    // Ignore tiny decorations (icons, arrows) — a ring must be die-scale.
    if (r.x1 - r.x0 < 0.25 * gW || r.y1 - r.y0 < 0.25 * gH) continue;
    if (!rings.some((q) => sameRect(q, r))) rings.push(r);
  }

  // Nesting depth from G (side-by-side per-panel rects share a depth).
  const inside = (inner: PtRect, outer: PtRect) =>
    inner.x0 >= outer.x0 - RING_MERGE_TOL &&
    inner.y0 >= outer.y0 - RING_MERGE_TOL &&
    inner.x1 <= outer.x1 + RING_MERGE_TOL &&
    inner.y1 <= outer.y1 + RING_MERGE_TOL &&
    !sameRect(inner, outer);
  const depth = rings.map((r) => rings.filter((q) => inside(r, q)).length);
  const levels: PtRect[][] = [];
  rings.forEach((r, i) => {
    (levels[depth[i]] ??= []).push(r);
  });
  const union = (rs: PtRect[]): PtRect => ({
    x0: Math.min(...rs.map((r) => r.x0)),
    y0: Math.min(...rs.map((r) => r.y0)),
    x1: Math.max(...rs.map((r) => r.x1)),
    y1: Math.max(...rs.map((r) => r.y1)),
  });
  const levelRects = levels.filter((l) => l && l.length > 0).map(union);

  // Per-side gap between consecutive rings (outer → inner).
  const gaps = (outer: PtRect, inner: PtRect) => [
    inner.x0 - outer.x0,
    inner.y0 - outer.y0,
    outer.x1 - inner.x1,
    outer.y1 - inner.y1,
  ];
  const gapIn = (outer: PtRect, inner: PtRect, min: number, max: number) => {
    const g = gaps(outer, inner);
    return g.every((v) => v >= min * 72 && v <= max * 72);
  };

  let bleedR: PtRect | null = null;
  let cutR: PtRect | null = null;
  let safeR: PtRect | null = null;
  if (levelRects.length >= 3) {
    if (gapIn(levelRects[0], levelRects[1], 0.02, 0.5)) {
      bleedR = levelRects[0];
      cutR = levelRects[1];
      if (gapIn(levelRects[1], levelRects[2], 0.03, 1.0)) safeR = levelRects[2];
    } else {
      cutR = levelRects[0];
      if (gapIn(levelRects[0], levelRects[1], 0.03, 1.0)) safeR = levelRects[1];
    }
  } else if (levelRects.length === 2) {
    // Two rings is ambiguous between (bleed,cut) and (cut,safety); safety is
    // the more common companion when only one inner ring is drawn.
    cutR = levelRects[0];
    if (gapIn(levelRects[0], levelRects[1], 0.03, 1.0)) safeR = levelRects[1];
  } else {
    cutR = levelRects[0] ?? null;
  }
  if (!cutR) return null;

  // Folds: thin full-span lines deep in the interior, not sitting on any
  // ring edge (safety edges drawn as dotted lines would otherwise count).
  const nearRingEdge = (l: Line) =>
    rings.some((r) =>
      l.axis === "x"
        ? Math.abs(l.pos - r.x0) <= EDGE_TOL || Math.abs(l.pos - r.x1) <= EDGE_TOL
        : Math.abs(l.pos - r.y0) <= EDGE_TOL || Math.abs(l.pos - r.y1) <= EDGE_TOL,
    );
  const foldX: number[] = [];
  const foldY: number[] = [];
  for (const l of lines) {
    const spanDim = l.hi - l.lo;
    const fullSpan = l.axis === "x" ? spanDim >= 0.6 * gH : spanDim >= 0.6 * gW;
    if (!fullSpan || nearRingEdge(l)) continue;
    if (l.axis === "x") {
      if (l.pos - G.x0 < FOLD_MIN_EDGE_DIST || G.x1 - l.pos < FOLD_MIN_EDGE_DIST) continue;
      if (!foldX.some((v) => Math.abs(v - l.pos) <= RING_MERGE_TOL)) foldX.push(l.pos);
    } else {
      if (l.pos - G.y0 < FOLD_MIN_EDGE_DIST || G.y1 - l.pos < FOLD_MIN_EDGE_DIST) continue;
      if (!foldY.some((v) => Math.abs(v - l.pos) <= RING_MERGE_TOL)) foldY.push(l.pos);
    }
  }
  // Too many "folds" = we're misreading the drawing — drop them, keep rings.
  const foldsOk = foldX.length <= 6 && foldY.length <= 6;

  // Convert to inches relative to the artboard (top-left origin for Y).
  const edges = (r: PtRect): GuideEdges => ({
    left: (r.x0 - media.x0) / 72,
    bottom: (r.y0 - media.y0) / 72,
    right: (media.x1 - r.x1) / 72,
    top: (media.y1 - r.y1) / 72,
  });
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const roundEdges = (e: GuideEdges): GuideEdges => ({
    left: round3(e.left),
    top: round3(e.top),
    right: round3(e.right),
    bottom: round3(e.bottom),
  });
  const bleed = bleedR ? roundEdges(edges(bleedR)) : null;
  const cut = roundEdges(edges(cutR));
  const safety = safeR ? roundEdges(edges(safeR)) : null;
  const minGap = (outer: PtRect, inner: PtRect) => round3(Math.min(...gaps(outer, inner)) / 72);
  return {
    version: 1,
    sepNames: [],
    bleed,
    cut,
    safety,
    foldXInches: foldsOk ? foldX.sort((a, b) => a - b).map((p) => round3((p - media.x0) / 72)) : [],
    foldYInches: foldsOk ? foldY.sort((a, b) => a - b).map((p) => round3((media.y1 - p) / 72)) : [],
    bleedLineInches: bleedR ? minGap(bleedR, cutR) : null,
    safetyInsetInches: safeR ? minGap(cutR, safeR) : null,
  };
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

/**
 * Task #3030 — bleed measured STRICTLY from the PDF's own BleedBox vs
 * TrimBox. Unlike measuredBleedInches above, this NEVER falls back to the
 * MediaBox: it answers "does the checked file itself carry declared bleed
 * geometry?" for the Unverified fallback path. Null when either box is
 * absent.
 */
export function measuredBleedFromBleedBoxInches(scan: CompletedPdfScan): number | null {
  const trims = scan.trimSizesInches;
  const bleeds = scan.bleedSizesInches;
  if (trims.length === 0 || bleeds.length === 0) return null;
  const n = trims.length === bleeds.length ? trims.length : 1;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const t = trims[i];
    const b = bleeds[i];
    const v = Math.min((b.w - t.w) / 2, (b.h - t.h) / 2);
    if (Number.isFinite(v)) min = Math.min(min, v);
  }
  if (!Number.isFinite(min)) return null;
  return Math.max(0, min);
}

// ─── Task #3072 — rendered-content bleed vs the certified template line ──
//
// Print-ready files routinely arrive with the template/bleed layer removed
// AND no usable TrimBox/BleedBox (or all three boxes stamped equal). When a
// certified template line is on file, the bleed check can instead verify
// that the artwork's RENDERED content extends past the template-derived
// trim rectangle by at least the bleed amount on every side. The pieces
// are split pure-vs-IO so the geometry is unit-testable without pdftoppm.

const BOX_EQ_TOL = 0.02; // inches — same-box tolerance

/**
 * True when the file's own PDF boxes carry TRUSTWORTHY bleed geometry:
 * a TrimBox exists AND at least one page's trim differs from its outer
 * boxes. All-equal boxes (BleedBox==MediaBox==TrimBox, the default-stamped
 * degenerate case) are NOT trustworthy — they'd read a fake 0" bleed.
 */
export function hasTrustworthyBleedBoxes(scan: CompletedPdfScan): boolean {
  const trims = scan.trimSizesInches;
  if (trims.length === 0) return false;
  const same = (a: BoxInches, b: BoxInches) =>
    Math.abs(a.w - b.w) <= BOX_EQ_TOL && Math.abs(a.h - b.h) <= BOX_EQ_TOL;
  const medias = scan.pageSizesInches;
  const bleeds = scan.bleedSizesInches;
  for (let i = 0; i < trims.length; i++) {
    const t = trims[i];
    const m = medias.length > 0 ? medias[Math.min(i, medias.length - 1)] : null;
    const b = bleeds.length > 0 ? bleeds[Math.min(i, bleeds.length - 1)] : null;
    if (!m && !b) continue; // nothing to compare against
    const trimEqMedia = m ? same(t, m) : true;
    const trimEqBleed = b ? same(t, b) : true;
    if (!(trimEqMedia && trimEqBleed)) return true; // distinct geometry somewhere
  }
  return false;
}

export type SideInches = { left: number; right: number; top: number; bottom: number };

export type ContentBleedMeasurement = {
  /** Per-side content overhang (inches) beyond the template-derived trim
   * rectangle — MINIMUM across measured pages. Negative = content stops
   * short of the trim line on that side. */
  perSideInches: SideInches;
  /** Worst (smallest) per-side overhang across all sides/pages. */
  minInches: number;
  pagesMeasured: number;
};

export type RectInches = { left: number; top: number; width: number; height: number };

/**
 * The expected trim rectangle for an artwork page, derived from TEMPLATE
 * geometry alone (never the artwork's declared boxes):
 *   • labels — the spec's finished square centered in the artboard
 *     (matches the preview-crop semantics; label artboards carry margins);
 *   • everything else — the centered artboard inset by the certified
 *     bleed line on each side.
 * Returns null when the page's artboard doesn't match the template
 * artboard (within tolerance, either orientation) — the artboard-size
 * check is the authority on that mismatch, so no bleed verdict is derived.
 */
export function templateTrimRectInches(opts: {
  componentId: string;
  pageInches: BoxInches;
  templatePageInches: BoxInches;
  bleedLineInches: number;
  finishedInches?: BoxInches | null;
}): RectInches | null {
  const { componentId, pageInches, templatePageInches, bleedLineInches, finishedInches } = opts;
  const tol = 0.05;
  const direct =
    Math.abs(pageInches.w - templatePageInches.w) <= tol &&
    Math.abs(pageInches.h - templatePageInches.h) <= tol;
  const swapped =
    Math.abs(pageInches.w - templatePageInches.h) <= tol &&
    Math.abs(pageInches.h - templatePageInches.w) <= tol;
  if (!direct && !swapped) return null; // artboard mismatch — size check owns this
  if (componentId === "labels" && finishedInches) {
    const fw = Math.min(finishedInches.w, pageInches.w);
    const fh = Math.min(finishedInches.h, pageInches.h);
    if (fw <= 0 || fh <= 0) return null;
    return { left: (pageInches.w - fw) / 2, top: (pageInches.h - fh) / 2, width: fw, height: fh };
  }
  const b = bleedLineInches;
  const w = pageInches.w - 2 * b;
  const h = pageInches.h - 2 * b;
  if (w <= 0 || h <= 0) return null;
  // Sheet-with-margins templates (gogoods, Aug 16 2026): vendor sheets like
  // MRP's jacket artboard are several inches larger than finished + 2×bleed —
  // the cut line sits deep inside the sheet, not one bleed-width from its
  // edge, so "page inset by bleed" would be nonsense geometry. Without a
  // verified cut rectangle (callers can supply one measured from the
  // template's own layers) the honest answer is UNMEASURED, never inferred.
  if (finishedInches && (w > finishedInches.w + 0.25 || h > finishedInches.h + 0.25)) {
    return null;
  }
  return { left: b, top: b, width: w, height: h };
}

/**
 * Per-side content overhang (inches) beyond a trim rectangle, from a raw
 * grayscale raster. Pure — takes the pixel data + page/trim geometry and
 * finds the ink bounding box (any pixel below `inkThreshold`; 250 keeps
 * near-white art edges counted as content so a light design doesn't
 * false-fail its own bleed, while pure-white paper never counts).
 * Returns null when the page renders blank (nothing measurable — the
 * caller must NOT treat that as a pass).
 */
export function contentBleedFromRaster(opts: {
  data: Buffer | Uint8Array;
  width: number;
  height: number;
  channels: number;
  pageInches: BoxInches;
  trimRectInches: RectInches;
  inkThreshold?: number;
  /** When set, each side must ALSO show ≥50% ink coverage in the bleed band
   * (the ring of this thickness just outside the trim edge). Kills the
   * crop-mark false pass: an isolated tick reaching each page edge makes the
   * global bounding box span everything while the actual bleed band stays
   * white — coverage catches that, real imagery covers its band ~100%. A
   * side that fails coverage reports 0 overhang (short), never a pass. */
  bleedBandInches?: number;
}): SideInches | null {
  const { data, width, height, channels, pageInches, trimRectInches } = opts;
  if (width <= 0 || height <= 0 || pageInches.w <= 0 || pageInches.h <= 0) return null;
  const th = opts.inkThreshold ?? 250;
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const rowBase = y * width * channels;
    for (let x = 0; x < width; x++) {
      if (data[rowBase + x * channels] < th) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // blank page — nothing to measure
  const ppiX = width / pageInches.w;
  const ppiY = height / pageInches.h;
  const trimLeftPx = trimRectInches.left * ppiX;
  const trimRightPx = (trimRectInches.left + trimRectInches.width) * ppiX;
  const trimTopPx = trimRectInches.top * ppiY;
  const trimBottomPx = (trimRectInches.top + trimRectInches.height) * ppiY;
  const sides: SideInches = {
    left: (trimLeftPx - minX) / ppiX,
    right: (maxX + 1 - trimRightPx) / ppiX,
    top: (trimTopPx - minY) / ppiY,
    bottom: (maxY + 1 - trimBottomPx) / ppiY,
  };
  const band = opts.bleedBandInches ?? 0;
  if (band > 0) {
    const clampX = (v: number) => Math.max(0, Math.min(width, Math.round(v)));
    const clampY = (v: number) => Math.max(0, Math.min(height, Math.round(v)));
    // Coverage of a pixel rect: fraction of pixels darker than the same ink
    // threshold used for the bounding box.
    const coverage = (x0: number, x1: number, y0: number, y1: number): number => {
      const xa = clampX(x0), xb = clampX(x1), ya = clampY(y0), yb = clampY(y1);
      if (xb <= xa || yb <= ya) return 0;
      let ink = 0, total = 0;
      for (let y = ya; y < yb; y++) {
        const rowBase = y * width * channels;
        for (let x = xa; x < xb; x++) {
          total++;
          if (data[rowBase + x * channels] < th) ink++;
        }
      }
      return total > 0 ? ink / total : 0;
    };
    const bandX = band * ppiX;
    const bandY = band * ppiY;
    const cov = {
      left: coverage(trimLeftPx - bandX, trimLeftPx, trimTopPx, trimBottomPx),
      right: coverage(trimRightPx, trimRightPx + bandX, trimTopPx, trimBottomPx),
      top: coverage(trimLeftPx, trimRightPx, trimTopPx - bandY, trimTopPx),
      bottom: coverage(trimLeftPx, trimRightPx, trimBottomPx, trimBottomPx + bandY),
    };
    const MIN_COVERAGE = 0.5;
    if (cov.left < MIN_COVERAGE) sides.left = Math.min(sides.left, 0);
    if (cov.right < MIN_COVERAGE) sides.right = Math.min(sides.right, 0);
    if (cov.top < MIN_COVERAGE) sides.top = Math.min(sides.top, 0);
    if (cov.bottom < MIN_COVERAGE) sides.bottom = Math.min(sides.bottom, 0);
  }
  return sides;
}

// 72 DPI: 0.125" = 9px, so ±1px of raster rounding is ≈0.014" — well inside
// the pass/fail band for the 0.125" threshold while keeping big flat
// artboards (27"+) cheap to render.
const CONTENT_BLEED_DPI = 72;
const CONTENT_BLEED_MAX_PAGES = 8;

/**
 * Task #3072 — measure per-side content overhang beyond the TEMPLATE-derived
 * trim rectangle by rendering the file's pages (pdftoppm + sharp, same
 * pipeline as the preview/edge-band paths). Takes the MINIMUM per side
 * across pages (the per-page pairing semantics of the box measurements).
 * Null on ANY failure — no renderer, blank pages, artboard mismatch — so
 * the caller falls back to the explicit "could not be measured" verdict,
 * never a false pass.
 */
export async function contentBleedMeasurement(
  pdfPath: string,
  scan: CompletedPdfScan,
  spec: {
    id: string;
    templatePageInches?: { w: number; h: number } | null;
    templateBleedLineInches?: number | null;
    finishedInches: { w: number; h: number };
  },
  measureOpts?: {
    /** Cut rectangle measured from the template's OWN layers (template
     * coordinates, inches, top-left origin). Used only when the rendered
     * page matches the template artboard directly (no orientation swap) —
     * this is the verified geometry for sheet-with-margins templates where
     * templateTrimRectInches honestly returns null. */
    trimRectOverrideInches?: RectInches | null;
  },
): Promise<ContentBleedMeasurement | null> {
  try {
    const line = spec.templateBleedLineInches ?? null;
    const tmpl = spec.templatePageInches ?? null;
    if (line == null || line <= 0 || !tmpl) return null;
    const pages = Math.min(Math.max(scan.pageCount, 1), CONTENT_BLEED_MAX_PAGES);
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const fsp = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const sharp = (await import("sharp")).default;
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "content-bleed-"));
    try {
      const outBase = path.join(tmpDir, "p");
      await run(
        "pdftoppm",
        ["-f", "1", "-l", String(pages), "-png", "-r", String(CONTENT_BLEED_DPI), pdfPath, outBase],
        { timeout: 120_000 },
      );
      const files = (await fsp.readdir(tmpDir)).filter((f) => f.endsWith(".png")).sort();
      if (files.length === 0) return null;
      let agg: SideInches | null = null;
      let measured = 0;
      for (const f of files) {
        const { data, info } = await sharp(path.join(tmpDir, f))
          .flatten({ background: "#ffffff" })
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const pageInches = { w: info.width / CONTENT_BLEED_DPI, h: info.height / CONTENT_BLEED_DPI };
        const override = measureOpts?.trimRectOverrideInches ?? null;
        const tol = 0.05;
        const overrideUsable =
          override != null &&
          Math.abs(pageInches.w - tmpl.w) <= tol &&
          Math.abs(pageInches.h - tmpl.h) <= tol &&
          override.left >= 0 &&
          override.top >= 0 &&
          override.width > 0 &&
          override.height > 0 &&
          override.left + override.width <= pageInches.w + tol &&
          override.top + override.height <= pageInches.h + tol;
        const trimRect = overrideUsable
          ? override
          : templateTrimRectInches({
              componentId: spec.id,
              pageInches,
              templatePageInches: tmpl,
              bleedLineInches: line,
              finishedInches: spec.finishedInches,
            });
        if (!trimRect) continue; // artboard mismatch / unverified geometry — stays unmeasured
        const sides = contentBleedFromRaster({
          data,
          width: info.width,
          height: info.height,
          channels: info.channels || 1,
          pageInches,
          trimRectInches: trimRect,
          bleedBandInches: line,
        });
        if (!sides) continue; // blank page
        measured++;
        agg = agg
          ? {
              left: Math.min(agg.left, sides.left),
              right: Math.min(agg.right, sides.right),
              top: Math.min(agg.top, sides.top),
              bottom: Math.min(agg.bottom, sides.bottom),
            }
          : sides;
      }
      if (!agg || measured === 0) return null;
      const minInches = Math.min(agg.left, agg.right, agg.top, agg.bottom);
      return { perSideInches: agg, minInches, pagesMeasured: measured };
    } finally {
      fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch {
    return null; // degrade silently — caller falls back to "could not be measured"
  }
}

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

/**
 * Task #3069 — server-side telemetry for the spot-usage fallback: one log
 * line per occurrence, with the structured reason code + attribution and
 * enough file context to review frequency later. No-op unless the scan
 * actually fell back ("unknown").
 */
export function logSpotUsageFallback(
  scan: CompletedPdfScan,
  ctx: { fileName?: string | null; source?: string | null },
): void {
  if (!scan.hasSpot || scan.spotUsage !== "unknown") return;
  // Redact query strings/fragments regardless of URL form — pasted share
  // links AND relative /objects paths can carry signed tokens that must
  // never land in server logs.
  let source = (ctx.source ?? "?").split(/[?#]/)[0];
  try {
    const u = new URL(source);
    source = `${u.origin}${u.pathname}`;
  } catch {
    /* relative path or label — query already stripped above */
  }
  console.warn(
    `[completed-scan] spot-usage fallback reason=${scan.spotUsageReason} attribution=${scan.spotUsageAttribution} file=${ctx.fileName ?? "?"} source=${source} bytes=${scan.bytes} truncated=${scan.truncated}`,
  );
}
export function validateCompletedComponent(
  scan: CompletedPdfScan,
  spec: FinishedComponentSpec,
  opts?: { edgeBand?: EdgeBandVerdict; contentBleed?: ContentBleedMeasurement | null },
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
  // Task #3069 — definition-only spot swatches (never applied to art) must
  // not count as spot ink. "unknown" stays conservative (counts as present).
  // Older stored scans lack spotUsage — default keeps legacy behavior.
  const spotUsage: SpotUsage = (scan as any).spotUsage ?? (scan.hasSpot ? "unknown" : "none");
  const spotInUse = scan.hasSpot && spotUsage !== "unused";
  if (spec.color === "process-4c") {
    if (scan.hasCMYK) {
      checks.push({
        key: "tmpl.color",
        label: "Color (4-color process)",
        status: "pass",
        message: `CMYK process present${spotInUse ? " (+ spot)" : ""}${scan.hasRGB ? " — embedded RGB preview ignored" : ""}.`,
      });
    } else if (spotInUse) {
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
    if (scan.hasCMYK || spotInUse) {
      const parts = [scan.hasCMYK ? "CMYK" : null, spotInUse ? "spot/PMS" : null].filter(Boolean);
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
      status: "warn",
      message: "Live text detected (fonts are embedded) — outline all type before sending final print files.",
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
        // Vector-only art passes — no raster images means nothing to hold
        // to a resolution floor (Viryl live-test, Aug 18 2026).
        status: "pass",
        message: `No embedded raster images — vector-only art passes (no ${minPpi} PPI floor applies).`,
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

  // 7. Bleed — Task #3030 canon (Otis/Ruby, Bill-approved): the measurement
  // reference is the press's CERTIFIED control-template bleed line — never
  // Illustrator's document bleed setting and never the checked file's own
  // PDF BleedBox as an authoritative source. Strict priority:
  //   a) certified template line (operator-entered or measured from the
  //      press's uploaded template) → authoritative pass/warn/fail;
  //   b) the checked file's own PDF BleedBox → check runs but the result
  //      is UNVERIFIED (blocks a clean verdict until acknowledged);
  //   c) neither → explicit FAIL ("Bleed could not be measured.").
  // Every result stamps the source it was measured against (visible text).
  {
    const line = spec.templateBleedLineInches ?? null;
    const min = rules?.bleedMinInches ?? null;
    if (line != null && line > 0) {
      const lineWord =
        spec.bleedLineSource === "operator"
          ? `the ${pressWord} certified template line (operator-entered)`
          : `the ${pressWord} certified template line`;
      const source = `Measured against ${lineWord} — ${line}" bleed.`;
      const measured = measuredBleedInches(scan);
      // Task #3072 — prefer TRUSTWORTHY artwork box measurement; when the
      // boxes are missing or degenerate (all stamped equal), fall back to
      // the rendered-content measurement when the caller could render.
      const boxesTrusted = measured != null && hasTrustworthyBleedBoxes(scan);
      const contentBleed = opts?.contentBleed ?? null;
      // Rendered content also overrides boxes that FAIL the line (gogoods,
      // Aug 16 2026): full-artboard exports routinely stamp TrimBox == BleedBox
      // (declaring 0" bleed) while the drawn art physically covers the whole
      // sheet — the boxes lie in exactly the case the check exists for. The
      // content measurement is physical, so it wins in both directions.
      const boxesFailLine = measured != null && measured + BLEED_TOL < line;
      if ((!boxesTrusted || boxesFailLine) && contentBleed) {
        const cb = contentBleed;
        const contentSource = `Measured against ${lineWord} via rendered content — ${line}" bleed.`;
        const r3 = (v: number) => Math.round(v * 1000) / 1000;
        const m = r3(cb.minInches);
        const shortSides = (Object.entries(cb.perSideInches) as [string, number][])
          .filter(([, v]) => v + BLEED_TOL < line)
          .map(([k, v]) => `${k} ≈${r3(Math.max(0, v))}"`);
        const how = "Measured from rendered content vs the certified template line (the file carries no usable trim/bleed boxes).";
        if (cb.minInches + BLEED_TOL >= line) {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "pass",
            source: contentSource,
            message: `Rendered content extends ≈${m}" past the template trim line on all sides — meets the ${line}" bleed line vs ${lineWord}. ${how}`,
          });
        } else if (min != null && cb.minInches + BLEED_TOL >= min) {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "warn",
            source: contentSource,
            message: `Rendered content extends ≈${m}" past the template trim line — below the ${line}" line vs ${lineWord} (short on ${shortSides.join(", ")}), but meets ${pressWord}'s ≥${min}" minimum. ${how}`,
          });
        } else {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "fail",
            source: contentSource,
            message: `Rendered content falls short of the ${line}" bleed line vs ${lineWord} — short on ${shortSides.join(", ")}. ${how}`,
          });
        }
      } else if (measured == null) {
        checks.push({
          key: "tmpl.bleed",
          label: "Bleed",
          status: "fail",
          source,
          message: `Bleed could not be measured. The file carries no trim box to measure art extent against vs ${lineWord}.`,
        });
      } else {
        const m = Math.round(measured * 1000) / 1000;
        if (measured + BLEED_TOL >= line) {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "pass",
            source,
            message: `Measured ≈${m}" bleed — meets the ${line}" bleed line vs ${lineWord}. Measured from the file's own PDF boxes.`,
          });
        } else if (min != null && measured + BLEED_TOL >= min) {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "warn",
            source,
            message: `Measured ≈${m}" bleed — below the ${line}" line vs ${lineWord}, but meets ${pressWord}'s ≥${min}" minimum. Measured from the file's own PDF boxes.`,
          });
        } else {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "fail",
            source,
            message: `Measured ≈${m}" bleed — below the ${line}" bleed line vs ${lineWord}. Measured from the file's own PDF boxes.`,
          });
        }
      }
    } else {
      const fileBleed = measuredBleedFromBleedBoxInches(scan);
      if (fileBleed != null) {
        const source = "Measured against PDF bleed box; no certified template line.";
        const m = Math.round(fileBleed * 1000) / 1000;
        if (min != null && fileBleed + BLEED_TOL < min) {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "fail",
            source,
            message: `Measured ≈${m}" bleed from the file's own PDF bleed box — below ${pressWord}'s ≥${min}" minimum. Measured against PDF bleed box; no certified template line.`,
          });
        } else {
          checks.push({
            key: "tmpl.bleed",
            label: "Bleed",
            status: "unverified",
            source,
            message: `Measured ≈${m}" bleed from the file's own PDF bleed box${min != null ? ` — meets ${pressWord}'s ≥${min}" minimum` : ""}. Measured against PDF bleed box; no certified template line.`,
          });
        }
      } else {
        checks.push({
          key: "tmpl.bleed",
          label: "Bleed",
          status: "fail",
          source: "No certified template line on file; no PDF bleed box in the file.",
          message: `Bleed could not be measured. No certified template line is on file for ${pressWord} and the file carries no PDF bleed box.`,
        });
      }
    }
  }

  if (rules && (rules.bleedMinInches != null || rules.bleedRecommendedInches != null)) {
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
    } else if (spotUsage === "unused") {
      // Task #3069 — Illustrator embeds swatch definitions (incl. in its
      // private round-trip data) even when never applied to artwork.
      checks.push({
        key: "tmpl.pantone",
        label: "Pantone spot colors",
        status: "pass",
        message: `Spot color swatches are defined in the file but none are used in the artwork — nothing will output as a spot plate. (${pressWord} accepts only official Pantone spot inks.)`,
      });
    } else if (spotUsage === "unknown") {
      // Task #3069 — reason-coded conservative fallback: name the exact
      // reason and attribute it (scanner limitation vs file problem).
      const reason = ((scan as any).spotUsageReason ?? "unsupported-structure") as SpotUsageReason;
      const reasonText: Record<SpotUsageReason, string> = {
        encrypted:
          "the PDF is encrypted/password-protected, so its page content can't be inspected — this is a problem with the file, not a GoodTunes limitation",
        malformed:
          "a content stream in the PDF is broken or malformed — this is a problem with the file, not a GoodTunes limitation",
        "unsupported-compression":
          "the PDF uses legacy compression (e.g. LZW) that our scanner doesn't decode — a GoodTunes scanner limitation (our scanner couldn't fully inspect this file)",
        "unsupported-structure":
          "the PDF uses a structure our scanner doesn't fully parse (e.g. compressed object streams) — a GoodTunes scanner limitation (our scanner couldn't fully inspect this file)",
        "cap-reached":
          "the file exceeded our scan/decompression cap — a GoodTunes scanner limitation (our scanner couldn't fully inspect this file)",
      };
      checks.push({
        key: "tmpl.pantone",
        label: "Pantone spot colors",
        status: "warn",
        message: `Spot color swatches are defined, but we couldn't confirm whether they're used in the artwork: ${reasonText[reason]}. ${pressWord} accepts only official Pantone spot inks — verify each used swatch is a PANTONE library color.`,
      });
    } else {
      // spotUsage === "used" — today's name heuristic, keyed to USED spots.
      const usedNames: string[] = (scan as any).usedSpotColorNames ?? [];
      const named = usedNames.filter((n) => !PROCESS_SEP_NAMES.has(n.toLowerCase()));
      const offBrand = named.filter((n) => !isOfficialPantoneName(n));
      if (named.length === 0) {
        checks.push({
          key: "tmpl.pantone",
          label: "Pantone spot colors",
          status: "warn",
          message: `Spot colors are used in the artwork but their names couldn't be read — ${pressWord} accepts only official Pantone spot inks; verify each swatch is a PANTONE library color.`,
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
  | {
      ok: true;
      scan: CompletedPdfScan;
      fileName: string | null;
      finalUrl: string;
      /** Task #3090 — true when `opts.spoolTo` captured the COMPLETE file
       *  (not truncated by the size cap and no write error). */
      spooled?: boolean;
    }
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
  opts?: {
    maxBytes?: number;
    timeoutMs?: number;
    /** Task #3090 — also tee the streamed bytes into this local file so the
     *  caller can rasterize a preview. Best-effort: a write failure aborts
     *  spooling (spooled=false) but never fails the scan. The caller owns
     *  cleanup of the file. */
    spoolTo?: string;
  },
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
    let truncatedByCap = false;
    // Task #3090 — optional tee-to-disk while scanning (sequential writes on
    // one handle; a failure stops spooling but never the scan).
    let spoolHandle: import("node:fs/promises").FileHandle | null = null;
    let spoolOk = false;
    if (opts?.spoolTo) {
      try {
        spoolHandle = await (await import("node:fs/promises")).open(opts.spoolTo, "w");
        spoolOk = true;
      } catch {
        spoolOk = false;
      }
    }
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.length;
        const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        scanner.push(chunk);
        if (spoolHandle && spoolOk) {
          try {
            await spoolHandle.write(chunk);
          } catch {
            spoolOk = false;
          }
        }
        if (total > maxBytes) {
          truncatedByCap = true;
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
      }
    } finally {
      if (spoolHandle) {
        try {
          await spoolHandle.close();
        } catch {
          /* ignore */
        }
      }
    }

    const scan = scanner.finish();
    if (!scan.isPdf) return { ok: false, error: "That link doesn't point at a PDF file." };
    return {
      ok: true,
      scan,
      fileName,
      finalUrl: current.toString(),
      spooled: !!opts?.spoolTo && spoolOk && !truncatedByCap,
    };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "Timed out fetching the file — try again." };
    return { ok: false, error: "Couldn't fetch the file from that link." };
  } finally {
    clearTimeout(timer);
  }
}

const PER_STREAM_DECODED_CAP = 16 * 1024 * 1024;

const CS_REF_ENTRY_RE = /\/([^\s/\[\]<>()]+)\s+(\d+)\s+\d+\s+R\b/g;

const CS_INLINE_SEP_RE = /\/([^\s/\[\]<>()]+)\s*\[\s*\/(Separation|DeviceN)(?:\s*\/([^\s/\[\]<>()]+))?/g;

const MAX_CONTENT_CS_NAMES = 400;

const STREAM_LOOKBACK = 1500; // dict-inspection window before `stream`

/** Replace PDF comments (% → EOL), literal strings `(...)` (nesting +
 * backslash escapes) and hex strings `<...>` (but not `<<` dicts) with
 * spaces, so operator scanning can't be fooled by string/comment content. */
function stripPdfStringsAndComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "%") {
      while (i < n && src[i] !== "\n" && src[i] !== "\r") i++;
      out += " ";
      continue;
    }
    if (c === "(") {
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const d = src[i];
        if (d === "\\") i += 2;
        else {
          if (d === "(") depth++;
          else if (d === ")") depth--;
          i++;
        }
      }
      out += " ";
      continue;
    }
    if (c === "<") {
      if (src[i + 1] === "<") {
        out += "<<";
        i += 2;
        continue;
      }
      const j = src.indexOf(">", i);
      if (j === -1) {
        out += " ";
        break; // unterminated hex string — rest is string data
      }
      out += " ";
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const ENCRYPT_RE = /\/Encrypt\s+\d+\s+\d+\s+R\b/;

const CS_DICT_RE = /\/ColorSpace\s*<<([\s\S]{0,800}?)>>/g; // 800 < CARRY

const TOTAL_STREAM_CAP = 48 * 1024 * 1024;

const PER_STREAM_COMPRESSED_CAP = 4 * 1024 * 1024;

export type SpotUsageReason =
  | "encrypted"
  | "malformed"
  | "unsupported-compression"
  | "unsupported-structure"
  | "cap-reached";

const OBJ_LOOKAHEAD = 320; // < CARRY, so the slice is always fully present

const CONTENT_CS_RE = /\/([^\s/\[\]<>()]+)\s+(?:cs|CS)(?![A-Za-z])/g;
