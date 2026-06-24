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
export function validateCompletedComponent(
  scan: CompletedPdfScan,
  spec: FinishedComponentSpec,
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
  if (scan.pageCount === 0) {
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
      message: `${scan.pageCount} ${unit}${scan.pageCount === 1 ? "" : "s"} — matches.`,
    });
  } else {
    checks.push({
      key: "tmpl.pages",
      label: isLabels ? "Faces" : "Pages",
      status: "fail",
      message: `${scan.pageCount} ${unit}${scan.pageCount === 1 ? "" : "s"} — expected ${spec.expectedPages}.`,
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
      message: `Couldn't read a page size — expected ${dim(target)}${exact ? " (vendor template)" : " (computed finished + bleed)"}.`,
    });
  } else {
    const bad = pages.find((p) => !matchesBox(p, target, SIZE_TOL));
    if (exact) {
      if (!bad) {
        checks.push({
          key: "tmpl.size",
          label: "Artboard size",
          status: "pass",
          message: `${dim(pages[0])} — matches the ${spec.label} vendor template exactly.`,
        });
      } else {
        checks.push({
          key: "tmpl.size",
          label: "Artboard size",
          status: "fail",
          message: `${dim(bad)} — expected ${dim(target)} (vendor template). Override with justification if this is a legitimate variant.`,
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
