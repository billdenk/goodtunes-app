// Pressing-vendor spec data — typed, machine-checkable version of the
// human reference docs under `docs/vendors/*.md`. The upload-time
// validator (`server/validators/preflight.ts`) and the template-hint UI
// (`client/src/components/admin/UploadValidationsPanel.tsx`) both
// consume this module. Anything stricter than what a vendor actually
// publishes is sourced from `docs/vendors/README.md` ("Platform upload
// requirements — highest spec across all plants") so a release can be
// re-pressed at another plant later without re-collecting files.
//
// Future tweak: art uploads may arrive in TWO flavours — "for print"
// (with bleed) and "for digital display" (trimmed). For now we treat
// every uploaded art file as a print master and accept that the digital
// preview will show the bleed; when that becomes a problem we'll add a
// `usage: "print" | "display"` discriminator to ArtAsset and skip the
// bleed/CMYK rules for `display`.

export type VendorId = "mrp" | "pmp" | "hellbender";

export type VinylSize = '7"' | '10"' | '12"';
export type VinylRpm = 33 | 45;

export type ArtFileFormat = "pdf" | "psd" | "eps" | "tiff" | "indd-package" | "jpeg" | "png";

export type ColorSpace = "cmyk" | "rgb" | "pms" | "grayscale" | "unknown";

export type TemplateSpec = {
  id: string;
  label: string;
  size: VinylSize | null; // null for stickers / inserts that aren't sized to a disc
  /** Finished trim size in inches (jacket dimensions before bleed). */
  finishedInches: { w: number; h: number };
  /** Required bleed in inches on each side. 0 = no bleed required. */
  bleedInches: number;
};

export type VendorSpec = {
  id: VendorId;
  label: string;
  /** Public docs page the spec was sourced from. */
  sourceUrl: string;

  art: {
    /** Required pixel density at finished + bleed size. */
    requiredPpi: number;
    /** Permitted color spaces; an upload outside this list FAILs. */
    allowedColorSpaces: ColorSpace[];
    /** File formats accepted for upload. */
    acceptedFormats: ArtFileFormat[];
    /** True if PDFs must have fonts embedded / outlined. */
    requireEmbeddedFonts: boolean;
    /** Warn (not fail) when the file has a visible dieline/template layer. */
    warnIfDielineEmbedded: boolean;
    /** Optional filename pattern (regex source) — PMP enforces this. */
    filenamePattern?: string;
    /** Templates the artist can lay art out on, with their finished/bleed sizes. */
    templates: TemplateSpec[];
  };

  audio: {
    /** WAV is the only universally accepted master format today. */
    requiredFormats: Array<"wav" | "aiff" | "flac">;
    /** Required bit depth; null = not stated by vendor. */
    requiredBitDepth: number | null;
    /** Per-side max length (in seconds) per size + rpm. null = not stated. */
    maxSideSecondsBySizeRpm: Partial<Record<VinylSize, Partial<Record<VinylRpm, number>>>> | null;
    /** Hard rule: one audio file per side. */
    oneFilePerSide: boolean;
    /** Tracklist with side breaks and per-track times must be supplied. */
    requireSideBreakTracklist: boolean;
    /** Warn copy when the loudest tracks are not sequenced first on each side. */
    warnLoudFirst: boolean;
  };
};

// "Highest spec across all plants" — Hellbender refuses dielines /
// outside templates, PMP refuses RGB / non-PDF, MRP publishes the
// strictest numeric thresholds, so the unioned ruleset is what we
// enforce at upload time even if the artist picked a more permissive
// plant today.

const MRP_TEMPLATES: TemplateSpec[] = [
  { id: "12_center_label",  label: '12" Center Label',         size: '12"', finishedInches: { w: 3.875, h: 3.875 }, bleedInches: 0.125 },
  { id: "12_single_jacket", label: '12" Single Jacket',        size: '12"', finishedInches: { w: 12, h: 12 },       bleedInches: 0.125 },
  { id: "12_gatefold",      label: '12" Gatefold Jacket',      size: '12"', finishedInches: { w: 24, h: 12 },       bleedInches: 0.125 },
  { id: "12_widespine",     label: '12" Widespine (2×LP)',     size: '12"', finishedInches: { w: 12, h: 12 },       bleedInches: 0.125 },
  { id: "12_insert_2pp",    label: '12" Insert (12×12, 2pp)',  size: '12"', finishedInches: { w: 12, h: 12 },       bleedInches: 0.125 },
  { id: "10_center_label",  label: '10" Center Label',         size: '10"', finishedInches: { w: 3.5, h: 3.5 },     bleedInches: 0.125 },
  { id: "10_single_jacket", label: '10" Single Jacket',        size: '10"', finishedInches: { w: 10, h: 10 },       bleedInches: 0.125 },
  { id: "7_center_label",   label: '7" Center Label',          size: '7"',  finishedInches: { w: 3.5, h: 3.5 },     bleedInches: 0.125 },
  { id: "7_single_jacket",  label: '7" Single Jacket',         size: '7"',  finishedInches: { w: 7.0625, h: 7.0625 }, bleedInches: 0.125 },
];

const HELLBENDER_TEMPLATES: TemplateSpec[] = [
  { id: "12_center_label",  label: '12" Center Label',         size: '12"', finishedInches: { w: 3.875, h: 3.875 }, bleedInches: 0.125 },
  { id: "12_single_jacket", label: '12" Single Pocket Jacket', size: '12"', finishedInches: { w: 12, h: 12 },       bleedInches: 0.125 },
  { id: "12_gatefold_1",    label: '12" Gatefold (1 pocket)',  size: '12"', finishedInches: { w: 24, h: 12 },       bleedInches: 0.125 },
  { id: "12_gatefold_2",    label: '12" Gatefold (2 pocket)',  size: '12"', finishedInches: { w: 24, h: 12 },       bleedInches: 0.125 },
  { id: "12_widespine",     label: '12" Widespine (2×LP)',     size: '12"', finishedInches: { w: 12, h: 12 },       bleedInches: 0.125 },
  { id: "10_jacket",        label: '10" Standard Jacket',      size: '10"', finishedInches: { w: 10, h: 10 },       bleedInches: 0.125 },
  { id: "7_jacket",         label: '7" Standard Jacket',       size: '7"',  finishedInches: { w: 7.0625, h: 7.0625 }, bleedInches: 0.125 },
];

const PMP_TEMPLATES: TemplateSpec[] = [
  // PMP issues templates per-project via CSR; we surface the common
  // 12" jacket so the hint UI has something to draw against.
  { id: "12_single_jacket", label: '12" Single Jacket (CSR-issued)', size: '12"', finishedInches: { w: 12, h: 12 }, bleedInches: 0.125 },
];

// MRP's published per-side max table (using the upper end of each
// range — anything beyond fails; warn copy in the result row carries
// the lower "ideal" number). PMP and Hellbender don't publish their own,
// so they re-use MRP's table by virtue of the "highest spec" rule.
const MRP_MAX_SIDE: VendorSpec["audio"]["maxSideSecondsBySizeRpm"] = {
  '12"': { 33: 22 * 60, 45: 16 * 60 },
  '10"': { 33: 15 * 60, 45: 12 * 60 },
  '7"':  { 33:  8 * 60, 45:  6 * 60 },
};

export const VENDOR_SPECS: Record<VendorId, VendorSpec> = {
  mrp: {
    id: "mrp",
    label: "Memphis Record Pressing",
    sourceUrl: "https://memphisrecordpressing.com/art-file-prep/",
    art: {
      requiredPpi: 300,
      allowedColorSpaces: ["cmyk", "pms", "grayscale"],
      acceptedFormats: ["pdf", "psd", "eps", "tiff", "indd-package"],
      requireEmbeddedFonts: true,
      warnIfDielineEmbedded: true,
      templates: MRP_TEMPLATES,
    },
    audio: {
      requiredFormats: ["wav"],
      requiredBitDepth: null, // MRP says "high-res WAV" without a number
      maxSideSecondsBySizeRpm: MRP_MAX_SIDE,
      oneFilePerSide: true,
      requireSideBreakTracklist: true,
      warnLoudFirst: true,
    },
  },
  pmp: {
    id: "pmp",
    label: "Physical Music Products",
    sourceUrl: "https://www.physicalmusicproducts.com/detailed-faq",
    art: {
      requiredPpi: 300, // not stated by PMP — we use the platform-wide rule
      allowedColorSpaces: ["cmyk", "pms", "grayscale"],
      acceptedFormats: ["pdf", "psd", "eps", "tiff", "indd-package"],
      requireEmbeddedFonts: true,
      warnIfDielineEmbedded: true,
      filenamePattern: "^[A-Za-z0-9]+_[A-Za-z0-9]+_[A-Za-z0-9]+_\\d{8}\\.[a-zA-Z]+$",
      templates: PMP_TEMPLATES,
    },
    audio: {
      requiredFormats: ["wav"],
      requiredBitDepth: 24,
      maxSideSecondsBySizeRpm: MRP_MAX_SIDE, // platform-wide rule
      oneFilePerSide: true,
      requireSideBreakTracklist: true,
      warnLoudFirst: true,
    },
  },
  hellbender: {
    id: "hellbender",
    label: "Hellbender Vinyl",
    sourceUrl: "https://hellbendervinyl.com/pages/templates",
    art: {
      requiredPpi: 300, // Hellbender rejects 72dpi but won't post a minimum
      allowedColorSpaces: ["cmyk", "pms", "grayscale"],
      acceptedFormats: ["pdf", "psd", "eps", "tiff", "indd-package"],
      requireEmbeddedFonts: true,
      warnIfDielineEmbedded: true,
      templates: HELLBENDER_TEMPLATES,
    },
    audio: {
      requiredFormats: ["wav"],
      requiredBitDepth: null, // not stated
      maxSideSecondsBySizeRpm: MRP_MAX_SIDE,
      oneFilePerSide: true,
      requireSideBreakTracklist: true,
      warnLoudFirst: false,
    },
  },
};

export function getVendorSpec(id: string | null | undefined): VendorSpec | null {
  if (!id) return null;
  return (VENDOR_SPECS as Record<string, VendorSpec>)[id] ?? null;
}

export function getTemplate(vendorId: VendorId, templateId: string): TemplateSpec | null {
  return VENDOR_SPECS[vendorId].art.templates.find((t) => t.id === templateId) ?? null;
}
