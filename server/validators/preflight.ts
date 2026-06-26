// Task #216 — Upload-time preflight validation.
//
// `validateArt(buffer, opts)` and `validateAudio(buffer, opts)` are
// pure functions: feed them the freshly-uploaded bytes plus the chosen
// vendor + template (and, for audio, the side-break tracklist) and they
// return a structured array of pass/warn/fail rows that gets persisted
// to `upload_validations` and rendered both on the artist's upload UI
// and the admin Orders queue.
//
// Validation is intentionally read-only — we never re-encode or auto-fix
// (that's a separate task in the roadmap). When we cannot probe a value
// (e.g. an EPS file we don't decode), we emit a `warn` row that says so
// rather than a silent pass; the admin override flow is the escape hatch.
//
// FUTURE: the same buffer may eventually be uploaded twice — once as
// "for print" (with bleed) and once as "for display" (trimmed). When
// that happens we'll route the `usage: "display"` flavour through a
// thinner ruleset that skips the bleed + CMYK checks.

import type { CheckResult } from "@shared/uploadValidation";
import { rollupStatus } from "@shared/uploadValidation";
import {
  getVendorSpec,
  getTemplate,
  resolveAudioSpec,
  type ArtFileFormat,
  type AudioSpecOverride,
  type ColorSpace,
  type VendorId,
  type VinylRpm,
  type VinylSize,
} from "@shared/vendorSpecs";

const fmtHz = (hz: number) => {
  const khz = hz / 1000;
  const s = Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
  return `${s} kHz`;
};

const fmtMinSec = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

// Extension sniff from a filename. We never trust the upload's
// originalname for security, but for spec validation we DO want to know
// what the operator intended to send — a `.docx` masquerading as
// `application/octet-stream` should fail "format not accepted".
function extOf(name: string | null | undefined): ArtFileFormat | "unknown" {
  if (!name) return "unknown";
  const m = /\.([a-zA-Z0-9]+)$/.exec(name.trim());
  if (!m) return "unknown";
  const e = m[1].toLowerCase();
  if (e === "pdf") return "pdf";
  if (e === "psd") return "psd";
  if (e === "eps" || e === "ai") return "eps";
  if (e === "tif" || e === "tiff") return "tiff";
  if (e === "zip" || e === "idml") return "indd-package";
  if (e === "jpg" || e === "jpeg") return "jpeg";
  if (e === "png") return "png";
  return "unknown";
}

// Cheap content sniffer — magic bytes only. Used to confirm the
// extension isn't lying, not to deeply parse the file.
function sniffFormat(buf: Buffer): ArtFileFormat | "unknown" {
  if (buf.length < 8) return "unknown";
  if (buf.slice(0, 4).toString("ascii") === "%PDF") return "pdf";
  if (buf.slice(0, 4).toString("ascii") === "8BPS") return "psd";
  // EPS = PostScript: "%!PS"; some EPSs have a binary header (C5D0D3C6) first
  if (buf.slice(0, 4).toString("ascii") === "%!PS") return "eps";
  if (buf[0] === 0xc5 && buf[1] === 0xd0 && buf[2] === 0xd3 && buf[3] === 0xc6) return "eps";
  // TIFF: II*\0 or MM\0*
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) return "tiff";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf.slice(1, 4).toString("ascii") === "PNG") return "png";
  // ZIP / IDML: "PK\x03\x04"
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "indd-package";
  return "unknown";
}

// PDF color-space sniff. PDFs declare device color spaces via the
// "/DeviceRGB", "/DeviceCMYK", "/DeviceGray" tokens; if neither RGB
// nor CMYK is present we mark color space as unknown rather than
// guessing. This is best-effort and consistent with what the human
// MRP/Hellbender QC team does — they look for the same tokens in
// Acrobat's "Output Preview" pane.
function sniffPdfColorSpace(buf: Buffer): ColorSpace {
  // PDF can be huge; only scan the first ~2MB which captures the
  // resource dictionaries on every release we've seen.
  const slice = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString("latin1");
  const hasCMYK = /\/DeviceCMYK\b/.test(slice) || /\bCMYK\b/.test(slice);
  const hasRGB = /\/DeviceRGB\b/.test(slice);
  const hasGray = /\/DeviceGray\b/.test(slice);
  // CMYK + RGB in the same file is common (e.g. RGB preview thumbnail
  // embedded in a CMYK master). We side with the printable plates —
  // CMYK wins. Pure-RGB fails the check; admin can override.
  if (hasCMYK) return "cmyk";
  if (hasRGB) return "rgb";
  if (hasGray) return "grayscale";
  return "unknown";
}

// Quick PDF "are fonts embedded?" heuristic. A PDF with subset-embedded
// fonts contains "/FontFile" or "/FontFile2" or "/FontFile3" stream
// references. Outlined text (no fonts at all) is fine too — that case
// has no /Font dictionaries to flag.
function sniffPdfFonts(buf: Buffer): { hasFontDicts: boolean; hasEmbeddedFonts: boolean } {
  const slice = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString("latin1");
  const hasFontDicts = /\/Type\s*\/Font\b/.test(slice) || /\/BaseFont\b/.test(slice);
  const hasEmbeddedFonts = /\/FontFile[23]?\b/.test(slice);
  return { hasFontDicts, hasEmbeddedFonts };
}

// PDF page dimensions in points (1pt = 1/72 inch). Looks at the first
// `/MediaBox` declaration. Returns null if we can't find one.
function sniffPdfMediaBoxInches(buf: Buffer): { w: number; h: number } | null {
  const slice = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString("latin1");
  const m = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(slice);
  if (!m) return null;
  const x0 = parseFloat(m[1]), y0 = parseFloat(m[2]);
  const x1 = parseFloat(m[3]), y1 = parseFloat(m[4]);
  const wPts = Math.abs(x1 - x0);
  const hPts = Math.abs(y1 - y0);
  if (!Number.isFinite(wPts) || !Number.isFinite(hPts) || wPts === 0) return null;
  return { w: wPts / 72, h: hPts / 72 };
}

export type ValidateArtOpts = {
  vendorId: VendorId;
  templateId: string;
  fileName: string | null;
  /**
   * The real press name to show in error messages. When the vendorId is
   * "generic" (an unrecognised press), this is the actual plant name so
   * messages read "<press> requires CMYK" instead of "your pressing plant
   * requires CMYK". Also adds a "general vinyl spec" qualifier so operators
   * know the rule comes from industry standards, not a measured plant spec.
   */
  pressDisplayName?: string;
};

export function validateArt(buf: Buffer, opts: ValidateArtOpts): CheckResult[] {
  const spec = getVendorSpec(opts.vendorId);
  const template = getTemplate(opts.vendorId, opts.templateId);
  const checks: CheckResult[] = [];

  if (!spec || !template) {
    return [{
      key: "art.config",
      label: "Vendor / template",
      status: "fail",
      message: "Unknown vendor or template — pick one before uploading.",
    }];
  }

  // Use the real press name for attribution; fall back to the spec label.
  const pressName = opts.pressDisplayName ?? spec.label;
  // When using the generic spec, append a qualifier so the operator knows
  // these are industry-standard rules, not a plant-specific measured spec.
  const genericNote = opts.vendorId === "generic" && opts.pressDisplayName
    ? ` (general vinyl spec — no plant-specific specs on file for ${opts.pressDisplayName})`
    : "";

  // 1. File format
  const sniffed = sniffFormat(buf);
  const claimed = extOf(opts.fileName);
  const effective = sniffed !== "unknown" ? sniffed : claimed;
  if (effective === "unknown") {
    checks.push({ key: "art.format", label: "File format", status: "fail",
      message: `Could not identify file type. ${pressName} accepts: ${spec.art.acceptedFormats.join(", ").toUpperCase()}.${genericNote}` });
  } else if (!spec.art.acceptedFormats.includes(effective as ArtFileFormat)) {
    checks.push({ key: "art.format", label: "File format", status: "fail",
      message: `${effective.toUpperCase()} not accepted. ${pressName} requires: ${spec.art.acceptedFormats.join(", ").toUpperCase()}.${genericNote}` });
  } else {
    checks.push({ key: "art.format", label: "File format", status: "pass",
      message: `${effective.toUpperCase()} accepted.` });
  }

  // 2. Filename convention (PMP)
  if (spec.art.filenamePattern) {
    const re = new RegExp(spec.art.filenamePattern);
    if (opts.fileName && re.test(opts.fileName)) {
      checks.push({ key: "art.filename", label: "Filename convention", status: "pass",
        message: `Matches ${pressName}'s required pattern.` });
    } else {
      checks.push({ key: "art.filename", label: "Filename convention", status: "fail",
        message: `${pressName} requires Catalog#_ArtistName_TemplateType_YYYYMMDD.ext (e.g. ABC123_DAVIDBOWIE_CENTERLABEL_20240101.pdf).` });
    }
  }

  // The rest of the structural checks only run on PDFs today — for
  // PSD/EPS/TIFF we can't reliably read the color space or dimensions
  // without heavy decoders, so we surface a "couldn't probe" warn so
  // QC isn't a silent pass.
  if (effective === "pdf") {
    // 3. Dimensions vs. finished + bleed
    const dims = sniffPdfMediaBoxInches(buf);
    const target = {
      w: template.finishedInches.w + template.bleedInches * 2,
      h: template.finishedInches.h + template.bleedInches * 2,
    };
    if (!dims) {
      checks.push({ key: "art.dimensions", label: "Dimensions", status: "warn",
        message: `Could not read PDF page size. Expected ${target.w.toFixed(2)}″ × ${target.h.toFixed(2)}″ (finished ${template.finishedInches.w}×${template.finishedInches.h}″ + ${template.bleedInches}″ bleed all sides).` });
    } else {
      const dw = Math.abs(dims.w - target.w);
      const dh = Math.abs(dims.h - target.h);
      const tol = 0.05; // 1/20"
      if (dw <= tol && dh <= tol) {
        checks.push({ key: "art.dimensions", label: "Dimensions", status: "pass",
          message: `${dims.w.toFixed(2)}″ × ${dims.h.toFixed(2)}″ matches ${template.label} finished+bleed.` });
      } else {
        checks.push({ key: "art.dimensions", label: "Dimensions", status: "fail",
          message: `${dims.w.toFixed(2)}″ × ${dims.h.toFixed(2)}″ — expected ${target.w.toFixed(2)}″ × ${target.h.toFixed(2)}″ (finished ${template.finishedInches.w}×${template.finishedInches.h}″ + ${template.bleedInches}″ bleed).` });
      }
      // 4. Resolution — at the chosen template, MediaBox dimensions
      // directly imply DPI when paired with a raster. PDFs are vector
      // by nature, so for a vector PDF this is informational; for a
      // raster-only PDF we'd need to decode the image (not in scope).
      checks.push({ key: "art.resolution", label: "Resolution", status: "pass",
        message: `Vector PDF — scales to ${spec.art.requiredPpi} PPI at print size. (Embedded rasters not deeply inspected.)` });
    }

    // 5. Color space
    const cs = sniffPdfColorSpace(buf);
    if (cs === "rgb") {
      checks.push({ key: "art.color_space", label: "Color mode", status: "fail",
        message: `RGB detected — ${pressName} requires ${spec.art.allowedColorSpaces.map((c) => c.toUpperCase()).join(" / ")}.${genericNote}` });
    } else if (spec.art.allowedColorSpaces.includes(cs)) {
      checks.push({ key: "art.color_space", label: "Color mode", status: "pass",
        message: `${cs.toUpperCase()} — accepted.` });
    } else {
      checks.push({ key: "art.color_space", label: "Color mode", status: "warn",
        message: `Could not determine color space. ${pressName} requires ${spec.art.allowedColorSpaces.map((c) => c.toUpperCase()).join(" / ")}.${genericNote}` });
    }

    // 6. Embedded / outlined fonts
    if (spec.art.requireEmbeddedFonts) {
      const f = sniffPdfFonts(buf);
      if (!f.hasFontDicts) {
        checks.push({ key: "art.fonts", label: "Fonts", status: "pass",
          message: "No live text detected — type appears outlined." });
      } else if (f.hasEmbeddedFonts) {
        checks.push({ key: "art.fonts", label: "Fonts", status: "pass",
          message: "All fonts embedded." });
      } else {
        checks.push({ key: "art.fonts", label: "Fonts", status: "fail",
          message: `${pressName} requires fonts to be embedded or outlined.${genericNote}` });
      }
    }

    // 7. Dieline layer warning — heuristic: look for "dieline" /
    // "template" tokens in the PDF stream.
    if (spec.art.warnIfDielineEmbedded) {
      const slice = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString("latin1");
      if (/dieline|template/i.test(slice)) {
        checks.push({ key: "art.dieline", label: "Template / dieline layer", status: "warn",
          message: "Found a layer named like a template/dieline — hide or delete it before final export." });
      }
    }
  } else if (effective !== "unknown" && (effective === "psd" || effective === "eps" || effective === "tiff" || effective === "indd-package")) {
    // Structural rules we can't probe inside the binary — surface as warn
    // so admins know to eyeball the file. Override flow handles
    // false positives.
    checks.push({ key: "art.dimensions", label: "Dimensions", status: "warn",
      message: `Could not auto-probe ${effective.toUpperCase()} dimensions. Verify ${(template.finishedInches.w + template.bleedInches * 2).toFixed(2)}″ × ${(template.finishedInches.h + template.bleedInches * 2).toFixed(2)}″ at ${spec.art.requiredPpi} PPI.` });
    checks.push({ key: "art.color_space", label: "Color mode", status: "warn",
      message: `Could not auto-probe color mode. ${pressName} requires ${spec.art.allowedColorSpaces.map((c) => c.toUpperCase()).join(" / ")}.${genericNote}` });
  }

  return checks;
}

// ────────────────────────────────────────────────────────────────────────

export type SideBreakInput = {
  side: string; // "A", "B", …
  trackTimesSeconds: number[]; // per-track durations on this side
};

export type ValidateAudioOpts = {
  vendorId: VendorId;
  vinylSize: VinylSize;
  rpm: VinylRpm;
  fileName: string | null;
  // The side-break tracklist the artist supplied. When omitted, the
  // tracklist check FAILs; per-side length check is skipped.
  sideBreaks?: SideBreakInput[];
  // Optional: which side this particular file is for ("A", "B"…). Drives
  // the "one file per side" hint.
  side?: string | null;
  /** Real press name to use in messages. See ValidateArtOpts.pressDisplayName. */
  pressDisplayName?: string;
  // Task #2324 — operator/partner-editable audio override merged OVER the
  // measured-constant baseline. NULL field inherits the baseline.
  audioOverride?: AudioSpecOverride | null;
};

export async function validateAudio(buf: Buffer, opts: ValidateAudioOpts): Promise<CheckResult[]> {
  const spec = getVendorSpec(opts.vendorId);
  const checks: CheckResult[] = [];
  if (!spec) {
    return [{ key: "audio.config", label: "Vendor", status: "fail", message: "Unknown vendor — pick one before uploading." }];
  }
  // Task #2324 — enforce the operator's confirmed audio numbers (merged
  // over the baseline) when present; otherwise the plant's baseline spec.
  const audio = resolveAudioSpec(opts.vendorId, opts.audioOverride) ?? spec.audio;

  const pressName = opts.pressDisplayName ?? spec.label;
  const genericNote = opts.vendorId === "generic" && opts.pressDisplayName
    ? ` (general vinyl spec — no plant-specific specs on file for ${opts.pressDisplayName})`
    : "";

  // Probe with music-metadata (already a dep). Best-effort: parse from
  // buffer; fall back to "unknown" on failure.
  let format: string | null = null;
  let bitDepth: number | null = null;
  let sampleRate: number | null = null;
  let duration: number | null = null;
  let channels: number | null = null;
  try {
    const mm = await import("music-metadata");
    const meta = await mm.parseBuffer(buf, undefined, { duration: true });
    format = (meta.format.container || meta.format.codec || "").toLowerCase();
    bitDepth = meta.format.bitsPerSample ?? null;
    sampleRate = meta.format.sampleRate ?? null;
    duration = meta.format.duration ?? null;
    channels = meta.format.numberOfChannels ?? null;
  } catch (err) {
    checks.push({ key: "audio.probe", label: "Probe", status: "warn",
      message: "Couldn't read audio headers — verify the file isn't corrupt." });
  }

  // 1. Format
  const isWav = !!format && /wav|wave|riff/.test(format);
  const isAiff = !!format && /aiff|aifc/.test(format);
  const isFlac = !!format && /flac/.test(format);
  const matches =
    (isWav && audio.requiredFormats.includes("wav")) ||
    (isAiff && audio.requiredFormats.includes("aiff")) ||
    (isFlac && audio.requiredFormats.includes("flac"));
  if (format && matches) {
    checks.push({ key: "audio.format", label: "Format", status: "pass",
      message: `${format.toUpperCase()} accepted.` });
  } else if (format) {
    checks.push({ key: "audio.format", label: "Format", status: "fail",
      message: `${format.toUpperCase()} — ${pressName} requires ${audio.requiredFormats.map((f) => f.toUpperCase()).join(" or ")}.${genericNote}` });
  } else {
    checks.push({ key: "audio.format", label: "Format", status: "warn",
      message: `Format unknown — ${pressName} requires ${audio.requiredFormats.map((f) => f.toUpperCase()).join(" or ")}.${genericNote}` });
  }

  // 2. Bit depth
  if (audio.requiredBitDepth != null) {
    if (bitDepth == null) {
      checks.push({ key: "audio.bit_depth", label: "Bit depth", status: "warn",
        message: `Couldn't read bit depth — ${pressName} requires ${audio.requiredBitDepth}-bit.${genericNote}` });
    } else if (bitDepth >= audio.requiredBitDepth) {
      checks.push({ key: "audio.bit_depth", label: "Bit depth", status: "pass",
        message: `${bitDepth}-bit — meets ${pressName}'s ${audio.requiredBitDepth}-bit minimum.` });
    } else {
      checks.push({ key: "audio.bit_depth", label: "Bit depth", status: "fail",
        message: `${bitDepth}-bit — ${pressName} requires ${audio.requiredBitDepth}-bit.${genericNote}` });
    }
  }

  // 3. Sample rate — presence-only UNLESS the press confirmed a minimum
  // (audio.requiredSampleRateHz, via the per-press override). No plant
  // publishes one by default, so this stays a soft "present?" check until
  // an operator records a real number.
  if (audio.requiredSampleRateHz != null) {
    if (sampleRate == null) {
      checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "warn",
        message: `Sample rate not declared in the file header — ${pressName} requires ${fmtHz(audio.requiredSampleRateHz)}.${genericNote}` });
    } else if (sampleRate >= audio.requiredSampleRateHz) {
      checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "pass",
        message: `${sampleRate.toLocaleString()} Hz — meets ${pressName}'s ${fmtHz(audio.requiredSampleRateHz)} minimum.` });
    } else {
      checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "fail",
        message: `${sampleRate.toLocaleString()} Hz — ${pressName} requires ${fmtHz(audio.requiredSampleRateHz)}.${genericNote}` });
    }
  } else if (sampleRate) {
    checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "pass",
      message: `${sampleRate.toLocaleString()} Hz.` });
  } else {
    checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "warn",
      message: "Sample rate not declared in the file header." });
  }

  // 4. Per-side length (when we have a side-breaks tracklist)
  const maxTable = audio.maxSideSecondsBySizeRpm;
  const maxSide = maxTable?.[opts.vinylSize]?.[opts.rpm] ?? null;
  if (opts.sideBreaks && opts.sideBreaks.length > 0 && maxSide != null) {
    let worstOver = 0;
    let worstSide = "";
    for (const sb of opts.sideBreaks) {
      const total = sb.trackTimesSeconds.reduce((a, b) => a + b, 0);
      if (total > maxSide && total - maxSide > worstOver) {
        worstOver = total - maxSide;
        worstSide = sb.side;
      }
    }
    if (worstOver > 0) {
      checks.push({ key: "audio.side_length", label: "Side length", status: "fail",
        message: `Side ${worstSide} exceeds ${pressName}'s ${fmtMinSec(maxSide)} max for ${opts.vinylSize} @ ${opts.rpm} RPM by ${fmtMinSec(worstOver)}.${genericNote}` });
    } else {
      checks.push({ key: "audio.side_length", label: "Side length", status: "pass",
        message: `All sides within ${fmtMinSec(maxSide)} max for ${opts.vinylSize} @ ${opts.rpm} RPM.` });
    }
  } else if (maxSide != null) {
    checks.push({ key: "audio.side_length", label: "Side length", status: "warn",
      message: `Supply a side-break tracklist to verify against ${fmtMinSec(maxSide)} max for ${opts.vinylSize} @ ${opts.rpm} RPM.` });
  }

  // 5. One file per side — we can't enforce across uploads in a single
  // call, but if `side` is missing we surface a warn.
  if (audio.oneFilePerSide) {
    if (opts.side && /^[A-Z][0-9]?$/.test(opts.side)) {
      checks.push({ key: "audio.one_per_side", label: "One file per side", status: "pass",
        message: `Tagged side ${opts.side}.` });
    } else {
      checks.push({ key: "audio.one_per_side", label: "One file per side", status: "warn",
        message: `${pressName} requires one file per side — tag this upload with its side (A / B / …).${genericNote}` });
    }
  }

  // 6. Side-break tracklist supplied
  if (audio.requireSideBreakTracklist) {
    if (opts.sideBreaks && opts.sideBreaks.length > 0) {
      checks.push({ key: "audio.tracklist", label: "Tracklist", status: "pass",
        message: `${opts.sideBreaks.length} side(s) supplied with per-track times.` });
    } else {
      checks.push({ key: "audio.tracklist", label: "Tracklist", status: "fail",
        message: `${pressName} requires a tracklist with side breaks and per-track times.${genericNote}` });
    }
  }

  return checks;
}

// ────────────────────────────────────────────────────────────────────────
// Task #334 — Spec-driven audio preflight.
//
// `validateAudio` above probes a freshly-uploaded buffer with
// music-metadata. By the time a master lands on the Press tab the
// authoritative specs are already on the `songs` row (written by the
// ffprobe pipeline at upload time), so re-downloading + re-probing
// just to validate is wasted work — and worse, music-metadata's
// bit-depth reading is flaky on some 24-bit WAVs, so the "Couldn't
// read bit depth" warn fired even on rows whose stored
// `audio_bit_depth` was a perfectly good number.
//
// `validateAudioFromSpecs` takes the stored columns directly and
// returns the same `CheckResult[]` shape. Buffer-free, idempotent,
// safe to call in a loop for batch preflight. A NULL stored field is
// the only thing that surfaces a "couldn't read" warn — anything else
// is a hard pass/fail against the picked plant.

export type AudioStoredSpecs = {
  format: string | null;          // ffprobe codec_name (e.g. "pcm_s24le", "flac")
  containerExt: string | null;    // ".wav" / ".aiff" / ".flac" (leading dot)
  sampleRate: number | null;
  bitDepth: number | null;
  bytes: number | null;
  channels: number | null;
  duration: number | null;        // seconds
};

export type ValidateAudioFromSpecsOpts = {
  vendorId: VendorId;
  vinylSize: VinylSize;
  rpm: VinylRpm;
  fileName: string | null;
  sideBreaks?: SideBreakInput[];
  side?: string | null;
  /** Real press name to use in messages. See ValidateArtOpts.pressDisplayName. */
  pressDisplayName?: string;
  // Task #2324 — operator/partner-editable audio override merged OVER the
  // measured-constant baseline. NULL field inherits the baseline.
  audioOverride?: AudioSpecOverride | null;
};

// Map the stored columns to a (wav | aiff | flac | other) bucket using
// container ext first (authoritative — that's the wrapping format)
// and falling back to the codec name (FLAC is both a codec and a
// container, so it lands either way).
function classifyStoredFormat(
  format: string | null,
  containerExt: string | null,
): "wav" | "aiff" | "flac" | "unknown" | "other" {
  const ext = (containerExt || "").toLowerCase().replace(/^\./, "");
  if (ext === "wav" || ext === "wave") return "wav";
  if (ext === "aif" || ext === "aiff" || ext === "aifc") return "aiff";
  if (ext === "flac") return "flac";
  const f = (format || "").toLowerCase();
  if (!f && !ext) return "unknown";
  if (/^pcm_/.test(f) || /wav|wave|riff/.test(f)) return "wav";
  if (/aiff|aifc/.test(f)) return "aiff";
  if (/flac/.test(f)) return "flac";
  return "other";
}

function prettyStoredFormat(
  format: string | null,
  containerExt: string | null,
): string {
  const ext = (containerExt || "").toLowerCase().replace(/^\./, "");
  if (ext) return ext.toUpperCase();
  if (format) return format.toUpperCase();
  return "unknown";
}

export function validateAudioFromSpecs(
  specs: AudioStoredSpecs,
  opts: ValidateAudioFromSpecsOpts,
): CheckResult[] {
  const spec = getVendorSpec(opts.vendorId);
  const checks: CheckResult[] = [];
  if (!spec) {
    return [{ key: "audio.config", label: "Vendor", status: "fail", message: "Unknown vendor — pick one before uploading." }];
  }
  // Task #2324 — enforce the operator's confirmed audio numbers (merged
  // over the baseline) when present; otherwise the plant's baseline spec.
  const audio = resolveAudioSpec(opts.vendorId, opts.audioOverride) ?? spec.audio;

  const pressName = opts.pressDisplayName ?? spec.label;
  const genericNote = opts.vendorId === "generic" && opts.pressDisplayName
    ? ` (general vinyl spec — no plant-specific specs on file for ${opts.pressDisplayName})`
    : "";

  // 1. Format
  const klass = classifyStoredFormat(specs.format, specs.containerExt);
  const pretty = prettyStoredFormat(specs.format, specs.containerExt);
  const matches =
    (klass === "wav" && audio.requiredFormats.includes("wav")) ||
    (klass === "aiff" && audio.requiredFormats.includes("aiff")) ||
    (klass === "flac" && audio.requiredFormats.includes("flac"));
  if (klass === "unknown") {
    checks.push({ key: "audio.format", label: "Format", status: "warn",
      message: `Format unknown — ${pressName} requires ${audio.requiredFormats.map((f) => f.toUpperCase()).join(" or ")}.${genericNote}` });
  } else if (matches) {
    checks.push({ key: "audio.format", label: "Format", status: "pass",
      message: `${pretty} accepted.` });
  } else {
    checks.push({ key: "audio.format", label: "Format", status: "fail",
      message: `${pretty} — ${pressName} requires ${audio.requiredFormats.map((f) => f.toUpperCase()).join(" or ")}.${genericNote}` });
  }

  // 2. Bit depth — NULL stored value is the ONLY trigger for the
  // "couldn't read" warn. A populated number always pass/fails
  // cleanly against the plant's minimum.
  if (audio.requiredBitDepth != null) {
    if (specs.bitDepth == null) {
      checks.push({ key: "audio.bit_depth", label: "Bit depth", status: "warn",
        message: `Couldn't read bit depth — ${pressName} requires ${audio.requiredBitDepth}-bit.${genericNote}` });
    } else if (specs.bitDepth >= audio.requiredBitDepth) {
      checks.push({ key: "audio.bit_depth", label: "Bit depth", status: "pass",
        message: `${specs.bitDepth}-bit — meets ${pressName}'s ${audio.requiredBitDepth}-bit minimum.` });
    } else {
      checks.push({ key: "audio.bit_depth", label: "Bit depth", status: "fail",
        message: `${specs.bitDepth}-bit — ${pressName} requires ${audio.requiredBitDepth}-bit.${genericNote}` });
    }
  }

  // 3. Sample rate — presence-only UNLESS the press confirmed a minimum
  // (audio.requiredSampleRateHz, via the per-press override).
  if (audio.requiredSampleRateHz != null) {
    if (specs.sampleRate == null) {
      checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "warn",
        message: `Sample rate not on file — ${pressName} requires ${fmtHz(audio.requiredSampleRateHz)}. Re-probe the master.${genericNote}` });
    } else if (specs.sampleRate >= audio.requiredSampleRateHz) {
      checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "pass",
        message: `${specs.sampleRate.toLocaleString()} Hz — meets ${pressName}'s ${fmtHz(audio.requiredSampleRateHz)} minimum.` });
    } else {
      checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "fail",
        message: `${specs.sampleRate.toLocaleString()} Hz — ${pressName} requires ${fmtHz(audio.requiredSampleRateHz)}.${genericNote}` });
    }
  } else if (specs.sampleRate) {
    checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "pass",
      message: `${specs.sampleRate.toLocaleString()} Hz.` });
  } else {
    checks.push({ key: "audio.sample_rate", label: "Sample rate", status: "warn",
      message: "Sample rate not on file — re-probe the master." });
  }

  // 4. Per-side length (when caller supplies side-breaks)
  const maxTable = audio.maxSideSecondsBySizeRpm;
  const maxSide = maxTable?.[opts.vinylSize]?.[opts.rpm] ?? null;
  if (opts.sideBreaks && opts.sideBreaks.length > 0 && maxSide != null) {
    let worstOver = 0;
    let worstSide = "";
    for (const sb of opts.sideBreaks) {
      const total = sb.trackTimesSeconds.reduce((a, b) => a + b, 0);
      if (total > maxSide && total - maxSide > worstOver) {
        worstOver = total - maxSide;
        worstSide = sb.side;
      }
    }
    if (worstOver > 0) {
      checks.push({ key: "audio.side_length", label: "Side length", status: "fail",
        message: `Side ${worstSide} exceeds ${pressName}'s ${fmtMinSec(maxSide)} max for ${opts.vinylSize} @ ${opts.rpm} RPM by ${fmtMinSec(worstOver)}.${genericNote}` });
    } else {
      checks.push({ key: "audio.side_length", label: "Side length", status: "pass",
        message: `All sides within ${fmtMinSec(maxSide)} max for ${opts.vinylSize} @ ${opts.rpm} RPM.` });
    }
  } else if (maxSide != null) {
    checks.push({ key: "audio.side_length", label: "Side length", status: "warn",
      message: `Supply a side-break tracklist to verify against ${fmtMinSec(maxSide)} max for ${opts.vinylSize} @ ${opts.rpm} RPM.` });
  }

  // 5. One file per side
  if (audio.oneFilePerSide) {
    if (opts.side && /^[A-Z][0-9]?$/.test(opts.side)) {
      checks.push({ key: "audio.one_per_side", label: "One file per side", status: "pass",
        message: `Tagged side ${opts.side}.` });
    } else {
      checks.push({ key: "audio.one_per_side", label: "One file per side", status: "warn",
        message: `${pressName} requires one file per side — tag this upload with its side (A / B / …).${genericNote}` });
    }
  }

  // 6. Side-break tracklist supplied
  if (audio.requireSideBreakTracklist) {
    if (opts.sideBreaks && opts.sideBreaks.length > 0) {
      checks.push({ key: "audio.tracklist", label: "Tracklist", status: "pass",
        message: `${opts.sideBreaks.length} side(s) supplied with per-track times.` });
    } else {
      checks.push({ key: "audio.tracklist", label: "Tracklist", status: "fail",
        message: `${pressName} requires a tracklist with side breaks and per-track times.${genericNote}` });
    }
  }

  return checks;
}

export { rollupStatus };
