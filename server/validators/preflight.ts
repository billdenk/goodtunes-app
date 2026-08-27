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
// Task #3388 — shared per-font embedding association (mixed-font detection).
import { normalizeFontName, collectEmbeddedFontNames, unembeddedFromSets } from "./completedTemplate";
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
function sniffPdfFonts(buf: Buffer): {
  hasFontDicts: boolean;
  hasEmbeddedFonts: boolean;
  fontNames: string[];
  unembeddedFontNames: string[];
} {
  const slice = buf.slice(0, Math.min(buf.length, 2 * 1024 * 1024)).toString("latin1");
  const hasFontDicts = /\/Type\s*\/Font\b/.test(slice) || /\/BaseFont\b/.test(slice);
  const hasEmbeddedFonts = /\/FontFile[23]?\b/.test(slice);
  // Task #3388 — enumerate /BaseFont names (decoded, subset prefixes like
  // "ABCDEF+" stripped) so a missing-font failure can NAME the offenders,
  // and associate each font with its own embedded program (FontDescriptor
  // /FontName ↔ /FontFile proximity) so MIXED files fail on just the
  // unembedded fonts. Helpers shared with the completed-art scanner.
  const names = new Set<string>();
  const re = /\/BaseFont\s*\/([^\s/\[\]<>()]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null && names.size < 40) {
    const decoded = normalizeFontName(m[1]);
    if (decoded) names.add(decoded);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  const embeddedNames = new Set<string>();
  collectEmbeddedFontNames(slice, embeddedNames);
  return {
    hasFontDicts,
    hasEmbeddedFonts,
    fontNames: Array.from(names).sort(),
    unembeddedFontNames: unembeddedFromSets(names, embeddedNames, hasEmbeddedFonts),
  };
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
      } else if (f.hasEmbeddedFonts && f.unembeddedFontNames.length === 0) {
        checks.push({ key: "art.fonts", label: "Fonts", status: "pass",
          message: "All fonts embedded." });
      } else {
        // Task #3388 — name the missing fonts where extractable, and make
        // the fix actionable: outline the type or upload the font files.
        // Mixed files (some embedded, some not) name only the missing ones.
        const missing = f.hasEmbeddedFonts ? f.unembeddedFontNames : f.fontNames;
        const namesPart = missing.length > 0
          ? ` Missing font${missing.length > 1 ? "s" : ""}: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ` (+${missing.length - 8} more)` : ""}.`
          : "";
        checks.push({ key: "art.fonts", label: "Fonts", status: "fail",
          message: `${pressName} requires fonts to be embedded or outlined.${namesPart} Outline the type in your design app, or upload the font files (OTF/TTF) alongside this art.${genericNote}` });
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

// Task #3413 — one shared side-length evaluator so `validateAudio` and
// `validateAudioFromSpecs` can never drift apart. When the resolved spec
// carries an inter-track gap (press_audio_specs override), each side's
// effective length is sum(tracks) + gap × (tracks − 1) — the spacing the
// press will actually cut. When no gap is on file (every press today
// unless an operator records one) the math and the message text are
// byte-identical to the pre-gap behavior.
export function gapAwareSideSeconds(
  trackTimesSeconds: number[],
  gapSeconds: number | null | undefined,
): number {
  const raw = trackTimesSeconds.reduce((a, b) => a + b, 0);
  const gap = gapSeconds ?? 0;
  return raw + gap * Math.max(0, trackTimesSeconds.length - 1);
}

function sideLengthCheck(
  sideBreaks: SideBreakInput[] | undefined,
  maxSide: number | null,
  gapSeconds: number | null | undefined,
  ctx: { pressName: string; vinylSize: VinylSize; rpm: VinylRpm; genericNote: string },
): CheckResult | null {
  const { pressName, vinylSize, rpm, genericNote } = ctx;
  const gap = gapSeconds ?? null;
  if (sideBreaks && sideBreaks.length > 0 && maxSide != null) {
    let worstOver = 0;
    let worstSide = "";
    let worstGapCount = 0;
    for (const sb of sideBreaks) {
      const total = gapAwareSideSeconds(sb.trackTimesSeconds, gap);
      if (total > maxSide && total - maxSide > worstOver) {
        worstOver = total - maxSide;
        worstSide = sb.side;
        worstGapCount = Math.max(0, sb.trackTimesSeconds.length - 1);
      }
    }
    // Only mention gaps when a press gap spec actually shaped the math.
    const gapNote =
      gap != null && gap > 0
        ? ` (incl. ${pressName}'s ${gap}s spacing between tracks)`
        : "";
    if (worstOver > 0) {
      const failGapNote =
        gap != null && gap > 0 && worstGapCount > 0
          ? ` (incl. ${worstGapCount} × ${gap}s spacing between tracks)`
          : "";
      return { key: "audio.side_length", label: "Side length", status: "fail",
        message: `Side ${worstSide} exceeds ${pressName}'s ${fmtMinSec(maxSide)} max for ${vinylSize} @ ${rpm} RPM by ${fmtMinSec(worstOver)}${failGapNote}.${genericNote}` };
    }
    return { key: "audio.side_length", label: "Side length", status: "pass",
      message: `All sides within ${fmtMinSec(maxSide)} max for ${vinylSize} @ ${rpm} RPM${gapNote}.` };
  }
  if (maxSide != null) {
    return { key: "audio.side_length", label: "Side length", status: "warn",
      message: `Supply a side-break tracklist to verify against ${fmtMinSec(maxSide)} max for ${vinylSize} @ ${rpm} RPM.` };
  }
  return null;
}

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

  // 4. Per-side length (when we have a side-breaks tracklist) — Task
  // #3413: folds the press's inter-track gap spec into the math.
  const maxTable = audio.maxSideSecondsBySizeRpm;
  const maxSide = maxTable?.[opts.vinylSize]?.[opts.rpm] ?? null;
  const sideLen = sideLengthCheck(opts.sideBreaks, maxSide, audio.interTrackGapSeconds ?? null, {
    pressName, vinylSize: opts.vinylSize, rpm: opts.rpm, genericNote,
  });
  if (sideLen) checks.push(sideLen);

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

  // 4. Per-side length (when caller supplies side-breaks) — Task #3413:
  // folds the press's inter-track gap spec into the math.
  const maxTable = audio.maxSideSecondsBySizeRpm;
  const maxSide = maxTable?.[opts.vinylSize]?.[opts.rpm] ?? null;
  const sideLen = sideLengthCheck(opts.sideBreaks, maxSide, audio.interTrackGapSeconds ?? null, {
    pressName, vinylSize: opts.vinylSize, rpm: opts.rpm, genericNote,
  });
  if (sideLen) checks.push(sideLen);

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

// ────────────────────────────────────────────────────────────────────────
// Task #3248 — album-level UPC preflight. Warning-only (never blocks):
// jacket/packaging artwork usually carries a UPC-A barcode, so when a
// vinyl release's vinyl SKU has no UPC on file the artist/press should
// find out BEFORE pressing. Pure function over the album's SKU rows so
// the endpoint and tests share one implementation. Returns null when the
// album has no vinyl SKU (nothing to warn about) or when every vinyl SKU
// already carries a UPC.
export function upcPreflightCheck(
  skus: { format: string; active: boolean; upc: string | null }[],
  isVinyl: (format: string) => boolean,
): CheckResult | null {
  const vinyl = skus.filter((s) => isVinyl(s.format));
  if (vinyl.length === 0) return null;
  // Prefer active rows; fall back to any vinyl row (a not-yet-activated
  // draft still presses jackets).
  const considered = vinyl.some((s) => s.active) ? vinyl.filter((s) => s.active) : vinyl;
  const missing = considered.filter((s) => !(s.upc ?? "").trim());
  if (missing.length === 0) {
    return {
      key: "release.upc",
      label: "UPC on vinyl SKU",
      status: "pass",
      message: "Vinyl SKU carries a UPC — barcode artwork can be generated for the jacket.",
    };
  }
  return {
    key: "release.upc",
    label: "UPC on vinyl SKU",
    status: "warn",
    message:
      "No UPC on the vinyl SKU. Retail/distribution jackets usually need a UPC-A barcode printed on the packaging — add one on the Package tab's format row before pressing. (Warning only — pressing is not blocked.)",
  };
}

// ────────────────────────────────────────────────────────────────────────
// Task #3413 — side-file master analysis. Professional artists often
// deliver ONE file per vinyl side instead of per-song masters. These pure
// functions compare a measured side file against the expected tracklist so
// preflight can flag a probably-missing track and gaps cut wider than the
// press's spacing spec. The route measures (ffprobe duration + ffmpeg
// silencedetect) at attach time and stores the numbers; analysis here is
// deterministic and testable with no audio tooling.

export type MeasuredSilence = {
  start: number; // seconds from file start
  end: number;
  duration: number;
};

// Parse ffmpeg silencedetect stderr into measured silences. Lines look like:
//   [silencedetect @ 0x...] silence_start: 245.13
//   [silencedetect @ 0x...] silence_end: 255.21 | silence_duration: 10.08
// A trailing silence_start with no matching end (file ends silent) is
// closed at `totalDuration` when provided, else dropped.
export function parseSilencedetectOutput(
  stderr: string,
  totalDuration?: number | null,
): MeasuredSilence[] {
  const out: MeasuredSilence[] = [];
  let pendingStart: number | null = null;
  const re = /silence_(start|end):\s*(-?[\d.]+)(?:\s*\|\s*silence_duration:\s*([\d.]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const kind = m[1];
    const v = parseFloat(m[2]);
    if (!Number.isFinite(v)) continue;
    if (kind === "start") {
      pendingStart = Math.max(0, v);
    } else {
      const dur = m[3] != null ? parseFloat(m[3]) : pendingStart != null ? v - pendingStart : NaN;
      const start = pendingStart != null ? pendingStart : Number.isFinite(dur) ? v - dur : null;
      if (start != null && Number.isFinite(dur) && dur > 0) {
        out.push({ start, end: v, duration: dur });
      }
      pendingStart = null;
    }
  }
  if (pendingStart != null && totalDuration != null && totalDuration > pendingStart) {
    out.push({ start: pendingStart, end: totalDuration, duration: totalDuration - pendingStart });
  }
  return out;
}

// Silences that sit BETWEEN tracks — ignore lead-in and run-out quiet at
// the very edges of the side file so a mastered 2s lead-in doesn't read
// as an oversized gap.
export function interiorSilences(
  silences: MeasuredSilence[],
  totalDuration: number | null,
): MeasuredSilence[] {
  return silences.filter((s) => {
    if (s.start <= 0.5) return false; // lead-in
    if (totalDuration != null && s.end >= totalDuration - 0.5) return false; // run-out
    return true;
  });
}

export type SideFileAnalysisInput = {
  side: string; // "A", "B", …
  durationSeconds: number | null; // measured file duration (ffprobe)
  silences: MeasuredSilence[] | null; // measured silences (silencedetect), null = scan unavailable
};

export type SideFileAnalysisOpts = {
  /** Durations of this side's tracks, in vinyl order (from the tracklist). */
  expectedTrackSeconds: number[];
  /** Press inter-track gap spec seconds; null = no spec on file. */
  gapSeconds: number | null;
  /** Format limit for this size+rpm; null = no published limit. */
  maxSideSeconds: number | null;
  pressName: string;
  vinylSize: VinylSize;
  rpm: VinylRpm;
  genericNote?: string;
};

// Tolerance for "matches the expected total": scales gently with track
// count so a 12-track side isn't held to single-second precision.
function durationToleranceSeconds(trackCount: number): number {
  return Math.max(8, 2 * trackCount);
}

export function analyzeSideFile(
  input: SideFileAnalysisInput,
  opts: SideFileAnalysisOpts,
): CheckResult[] {
  const checks: CheckResult[] = [];
  const side = input.side;
  const genericNote = opts.genericNote ?? "";
  const tracks = opts.expectedTrackSeconds;
  const gap = opts.gapSeconds;
  const measured = input.durationSeconds;

  // 1. Duration vs the expected tracklist total (tracks + press gaps).
  const expected = gapAwareSideSeconds(tracks, gap);
  if (measured == null) {
    checks.push({ key: "sidefile.duration", label: `Side ${side} file duration`, status: "warn",
      message: `Couldn't measure the Side ${side} master file's duration — verify the file isn't corrupt.` });
  } else if (tracks.length === 0) {
    checks.push({ key: "sidefile.duration", label: `Side ${side} file duration`, status: "warn",
      message: `Side ${side} master runs ${fmtMinSec(measured)}, but no tracks are assigned to Side ${side} in the vinyl order — assign tracks so the file can be verified.` });
  } else {
    const tol = durationToleranceSeconds(tracks.length);
    const deficit = expected - measured;
    if (deficit > tol) {
      // Short side — does the shortfall look like a whole track?
      const matchesATrack = tracks.some(
        (t) => t > 0 && Math.abs(deficit - t) <= Math.max(10, 0.25 * t),
      );
      const gapNote = gap != null && gap > 0 ? ` incl. ${gap}s gaps` : "";
      if (matchesATrack || deficit > Math.min(...tracks.filter((t) => t > 0), Infinity)) {
        checks.push({ key: "sidefile.duration", label: `Side ${side} file duration`, status: "fail",
          message: `A track may be missing from Side ${side} — the master file runs ${fmtMinSec(measured)} but the tracklist expects ${fmtMinSec(expected)}${gapNote} (short by ${fmtMinSec(deficit)}, about one track's length). Please verify every track is in the file.${genericNote}` });
      } else {
        checks.push({ key: "sidefile.duration", label: `Side ${side} file duration`, status: "warn",
          message: `Side ${side} master runs ${fmtMinSec(measured)} — ${fmtMinSec(deficit)} shorter than the tracklist total of ${fmtMinSec(expected)}${gapNote}. Verify track times and spacing.${genericNote}` });
      }
    } else if (measured - expected > tol) {
      checks.push({ key: "sidefile.duration", label: `Side ${side} file duration`, status: "warn",
        message: `Side ${side} master runs ${fmtMinSec(measured)} — ${fmtMinSec(measured - expected)} longer than the tracklist total of ${fmtMinSec(expected)}${gap != null && gap > 0 ? ` incl. ${gap}s gaps` : ""}. Check for extra material or wider-than-spec gaps.${genericNote}` });
    } else {
      checks.push({ key: "sidefile.duration", label: `Side ${side} file duration`, status: "pass",
        message: `Side ${side} master runs ${fmtMinSec(measured)} — matches the tracklist total of ${fmtMinSec(expected)}${gap != null && gap > 0 ? ` incl. ${gap}s gaps` : ""}.` });
    }
  }

  // 2. Measured inter-track gaps vs the press's spacing spec.
  if (input.silences != null) {
    const interior = interiorSilences(input.silences, measured);
    if (gap != null && gap > 0) {
      const over = interior.filter((s) => s.duration > gap + 1); // 1s grace
      if (over.length > 0) {
        const longest = Math.max(...over.map((s) => s.duration));
        const at = over
          .slice(0, 4)
          .map((s) => `${fmtMinSec(s.start)} (${s.duration.toFixed(1)}s)`)
          .join(", ");
        checks.push({ key: "sidefile.gaps", label: `Side ${side} track gaps`, status: "warn",
          message: `${over.length} gap${over.length === 1 ? "" : "s"} between tracks on Side ${side} exceed${over.length === 1 ? "s" : ""} ${opts.pressName}'s ${gap}s spacing spec (longest ${longest.toFixed(1)}s; at ${at}).${measured != null ? ` Effective side length ${fmtMinSec(measured)}.` : ""}${genericNote}` });
      } else {
        checks.push({ key: "sidefile.gaps", label: `Side ${side} track gaps`, status: "pass",
          message: `Measured gaps between tracks on Side ${side} are within ${opts.pressName}'s ${gap}s spacing spec.` });
      }
    } else if (interior.length > 0) {
      const longest = Math.max(...interior.map((s) => s.duration));
      checks.push({ key: "sidefile.gaps", label: `Side ${side} track gaps`, status: "pass",
        message: `${interior.length} gap${interior.length === 1 ? "" : "s"} measured between tracks on Side ${side} (longest ${longest.toFixed(1)}s). No press spacing spec on file.` });
    }
  }

  // 3. Measured side length vs the format limit — the file IS the side,
  // so its duration is the honest side length regardless of tracklist math.
  if (measured != null && opts.maxSideSeconds != null) {
    if (measured > opts.maxSideSeconds) {
      checks.push({ key: "sidefile.side_length", label: `Side ${side} measured length`, status: "fail",
        message: `Side ${side} master runs ${fmtMinSec(measured)} — exceeds ${opts.pressName}'s ${fmtMinSec(opts.maxSideSeconds)} max for ${opts.vinylSize} @ ${opts.rpm} RPM by ${fmtMinSec(measured - opts.maxSideSeconds)}.${genericNote}` });
    } else {
      checks.push({ key: "sidefile.side_length", label: `Side ${side} measured length`, status: "pass",
        message: `Side ${side} master runs ${fmtMinSec(measured)} of ${fmtMinSec(opts.maxSideSeconds)} max for ${opts.vinylSize} @ ${opts.rpm} RPM.` });
    }
  }

  return checks;
}

export { rollupStatus };
