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

// Single source of truth for every preflight/print vendor id. Server
// request schemas (z.enum) derive from this so adding a plant here
// automatically widens the API allowlist — never re-list these ids in a
// hand-written enum.
export const VENDOR_IDS = ["mrp", "pmp", "hellbender", "viryl", "generic"] as const;
export type VendorId = (typeof VENDOR_IDS)[number];

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
    /**
     * Required minimum sample rate in Hz. Optional/absent = no published
     * minimum → presence-only check (as today). No plant publishes one,
     * so every baseline leaves this undefined; a per-press override
     * (press_audio_specs.requiredSampleRateHz) can set it once a plant PM
     * confirms a real number. See resolveAudioSpec.
     */
    requiredSampleRateHz?: number | null;
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

// Viryl Technologies Corp. (Toronto). Sourced from docs/vendors/viryl.md.
// Viryl publishes 300 DPI / CMYK / 1/8" bleed and a 4" (101.6 mm) label
// diameter for 12" — wider than the 3.875" the US plants use. 7" and 12"
// gatefold jackets are Custom Quote at Viryl, but the templates are the
// industry-standard finished sizes so the artist can lay out against them.
const VIRYL_TEMPLATES: TemplateSpec[] = [
  { id: "12_center_label",  label: '12" Center Label (4″)',     size: '12"', finishedInches: { w: 4.0, h: 4.0 },     bleedInches: 0.125 },
  { id: "12_single_jacket", label: '12" Single Jacket (digitally printed)', size: '12"', finishedInches: { w: 12, h: 12 }, bleedInches: 0.125 },
  { id: "12_gatefold",      label: '12" Gatefold Jacket',       size: '12"', finishedInches: { w: 24, h: 12 },       bleedInches: 0.125 },
  { id: "10_center_label",  label: '10" Center Label',          size: '10"', finishedInches: { w: 3.5, h: 3.5 },     bleedInches: 0.125 },
  { id: "10_single_jacket", label: '10" Single Jacket',         size: '10"', finishedInches: { w: 10, h: 10 },       bleedInches: 0.125 },
  { id: "7_center_label",   label: '7" Center Label',           size: '7"',  finishedInches: { w: 3.5, h: 3.5 },     bleedInches: 0.125 },
  { id: "7_single_jacket",  label: '7" Single Jacket',          size: '7"',  finishedInches: { w: 7.0625, h: 7.0625 }, bleedInches: 0.125 },
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

// Generic industry-standard vinyl spec used when the album's dedicated press
// is not one of the three plants with measured specs on file (MRP/PMP/Hellbender).
// The label is a placeholder — callers pass the real press name via `pressDisplayName`
// on the validator opts so messages are attributed to the actual chosen plant.
const GENERIC_VINYL_TEMPLATES: TemplateSpec[] = [
  { id: "12_center_label",  label: '12" Center Label',        size: '12"', finishedInches: { w: 3.875, h: 3.875 }, bleedInches: 0.125 },
  { id: "12_single_jacket", label: '12" Single Jacket',       size: '12"', finishedInches: { w: 12, h: 12 },       bleedInches: 0.125 },
  { id: "12_gatefold",      label: '12" Gatefold Jacket',     size: '12"', finishedInches: { w: 24, h: 12 },       bleedInches: 0.125 },
  { id: "10_center_label",  label: '10" Center Label',        size: '10"', finishedInches: { w: 3.5, h: 3.5 },     bleedInches: 0.125 },
  { id: "10_single_jacket", label: '10" Single Jacket',       size: '10"', finishedInches: { w: 10, h: 10 },       bleedInches: 0.125 },
  { id: "7_center_label",   label: '7" Center Label',         size: '7"',  finishedInches: { w: 3.5, h: 3.5 },     bleedInches: 0.125 },
  { id: "7_single_jacket",  label: '7" Single Jacket',        size: '7"',  finishedInches: { w: 7.0625, h: 7.0625 }, bleedInches: 0.125 },
];

export const VENDOR_SPECS: Record<VendorId, VendorSpec> = {
  // Generic spec for presses without plant-specific specs on file.
  // The label is a neutral placeholder; real press name is threaded
  // via pressDisplayName on the validator opts.
  generic: {
    id: "generic",
    label: "your pressing plant",
    sourceUrl: "",
    art: {
      requiredPpi: 300,
      allowedColorSpaces: ["cmyk", "pms", "grayscale"],
      acceptedFormats: ["pdf", "psd", "eps", "tiff", "indd-package"],
      requireEmbeddedFonts: true,
      warnIfDielineEmbedded: true,
      templates: GENERIC_VINYL_TEMPLATES,
    },
    audio: {
      requiredFormats: ["wav", "aiff"],
      requiredBitDepth: 24,
      maxSideSecondsBySizeRpm: MRP_MAX_SIDE,
      oneFilePerSide: true,
      requireSideBreakTracklist: true,
      warnLoudFirst: false,
    },
  },
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
  viryl: {
    id: "viryl",
    label: "Viryl Technologies",
    sourceUrl: "https://viryl.ca",
    art: {
      requiredPpi: 300, // Viryl publishes a 300 DPI minimum
      // Viryl states CMYK; pms/grayscale stay accepted (printable as
      // spot/black plates) for parity with the other plants and to avoid
      // false-failing a grayscale label.
      allowedColorSpaces: ["cmyk", "pms", "grayscale"],
      // Viryl accepts PDF (preferred), AI, and PSD. AI is sniffed as EPS.
      acceptedFormats: ["pdf", "eps", "psd"],
      requireEmbeddedFonts: true,
      warnIfDielineEmbedded: true,
      templates: VIRYL_TEMPLATES,
    },
    audio: {
      // Viryl's 2024 price sheet confirms WAV, one file per side (A/B), and a
      // PQ sheet / track listing — but publishes no bit depth, sample rate, or
      // per-side length table (those are TBD until a Viryl PM confirms them).
      // So bit depth + the per-side length table stay on the platform-wide
      // fallback: 24-bit WAV, MRP's per-side length table. See
      // docs/vendors/viryl.md "Audio file requirements".
      requiredFormats: ["wav"],
      requiredBitDepth: 24,
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

// Task #2324 — per-press AUDIO spec override, supplied by an operator (or a
// press-scoped partner admin) via press_audio_specs. Mirrors how the
// art/template specs are operator-editable. A NULL/absent field inherits
// the plant's measured-constant baseline; a set value wins. Decoupled from
// the DB row shape (server casts the row into this) so this stays a pure
// shared module with no schema import.
export type AudioSpecOverride = {
  requiredBitDepth?: number | null;
  requiredSampleRateHz?: number | null;
  maxSideSeconds?: Partial<Record<VinylSize, Partial<Record<VinylRpm, number>>>> | null;
};

const ALL_VINYL_SIZES: VinylSize[] = ['7"', '10"', '12"'];
const ALL_VINYL_RPMS: VinylRpm[] = [33, 45];

// Resolve the audio spec a validator should enforce for (vendorId, override):
// the plant's baseline audio block with any operator-set override values
// merged OVER it. Per-side length cells merge individually (an override only
// replaces the cells it sets). Returns null only for an unknown vendor.
export function resolveAudioSpec(
  vendorId: VendorId,
  override?: AudioSpecOverride | null,
): VendorSpec["audio"] | null {
  const base = VENDOR_SPECS[vendorId]?.audio;
  if (!base) return null;
  if (!override) return base;

  let maxSide = base.maxSideSecondsBySizeRpm;
  if (override.maxSideSeconds) {
    const merged: Partial<Record<VinylSize, Partial<Record<VinylRpm, number>>>> = {};
    for (const size of ALL_VINYL_SIZES) {
      const baseCell = base.maxSideSecondsBySizeRpm?.[size];
      const ovCell = override.maxSideSeconds[size];
      if (!baseCell && !ovCell) continue;
      const cell: Partial<Record<VinylRpm, number>> = {};
      for (const rpm of ALL_VINYL_RPMS) {
        const v = ovCell?.[rpm] != null ? ovCell[rpm] : baseCell?.[rpm];
        if (v != null) cell[rpm] = v;
      }
      if (Object.keys(cell).length > 0) merged[size] = cell;
    }
    maxSide = merged;
  }

  return {
    ...base,
    requiredBitDepth:
      override.requiredBitDepth != null ? override.requiredBitDepth : base.requiredBitDepth,
    requiredSampleRateHz:
      override.requiredSampleRateHz != null
        ? override.requiredSampleRateHz
        : (base.requiredSampleRateHz ?? null),
    maxSideSecondsBySizeRpm: maxSide,
  };
}

export function getTemplate(vendorId: VendorId, templateId: string): TemplateSpec | null {
  return VENDOR_SPECS[vendorId].art.templates.find((t) => t.id === templateId) ?? null;
}

// Task #597 — vendors hidden from every preflight / print-PDF /
// Printer-chip surface pre-meeting. Hellbender shouldn't render as the
// default live plant while that pitch is open. Restore by emptying
// this set.
// Task #625 — MRP is now a first-class press with a loaded quote
// (1LP/2LP Color+Splatter + 7" Color confirmed; Black left as yellow
// TBD placeholders). Removed from the hidden set so the SellPanel and
// preflight surfaces treat it as a real, pickable plant.
// "generic" is always hidden from manual pickers — it is only set
// programmatically when the album's dedicated press has no measured spec.
export const HIDDEN_PREFLIGHT_VENDORS: ReadonlySet<VendorId> = new Set<VendorId>(["hellbender", "generic"]);

export function visiblePreflightVendors(): VendorSpec[] {
  return Object.values(VENDOR_SPECS).filter((s) => !HIDDEN_PREFLIGHT_VENDORS.has(s.id));
}

/** First non-hidden vendor — the "only live vendor" fallback. */
export function defaultPreflightVendor(): VendorId {
  return (visiblePreflightVendors()[0] ?? Object.values(VENDOR_SPECS)[0]).id;
}

/**
 * Best-effort match from an album's invited-press manufacturer name
 * to a `VENDOR_SPECS` entry that can drive preflight. Used by the
 * Press tab's single vendor picker to default to the album's
 * assigned press when present (Task #597). Returns null when the
 * invited press has no corresponding spec.
 */
export function matchInvitedPressToVendor(pressName: string | null | undefined): VendorId | null {
  if (!pressName) return null;
  const n = pressName.trim().toLowerCase();
  if (!n) return null;
  for (const v of Object.values(VENDOR_SPECS)) {
    if (v.id === "generic") continue; // skip synthetic entry
    const label = v.label.toLowerCase();
    if (n === label || n.includes(label) || label.includes(n) || n.startsWith(v.id)) {
      return v.id;
    }
  }
  return null;
}

/**
 * Like `matchInvitedPressToVendor` but never returns null: an unknown
 * press maps to `"generic"` instead. Use this anywhere the Physical tab
 * needs a VendorId to drive preflight — it guarantees a real spec is
 * returned even when the album's dedicated plant has no measured spec on
 * file, so the tab never silently impersonates MRP.
 */
export function resolveVendorIdForPress(pressName: string | null | undefined): VendorId {
  return matchInvitedPressToVendor(pressName) ?? (pressName?.trim() ? "generic" : defaultPreflightVendor());
}

/**
 * Returns true when `vendorId` is the synthetic generic spec rather than
 * one of the three plants with measured specs on file. Use this to add the
 * "general vinyl spec — no plant-specific specs on file" qualifier in UI
 * and message strings.
 */
export function isGenericVendor(vendorId: VendorId): boolean {
  return vendorId === "generic";
}

// ─── Task #2109 — Completed-template confirmation specs ───────────────
// The admin "Confirm a completed PDF matches the press specs" surface
// needs, per (vendor, product configuration), the exact set of print
// components a finished release must supply and the checks each is held
// to.
//
// CRUCIAL distinction from the art-preflight TemplateSpec above: those
// describe the artist's BLANK template (finished trim + bleed). A
// COMPLETED, print-ready file is laid out on the vendor's own artboard,
// whose flat page size is NOT finished+bleed — it carries the plant's
// bleed and fold/turn-in/glue allowances. Measured proof (MRP, real
// files sent to print, Nov 2025 — Nick Carter 2LP):
//   • 12" 2LP center labels  → 4 pages, each 6.5000 × 7.6811 in
//   • 12" inner sleeve (board-weight Euro) → 1 page, 19.0935 × 30.9685 in
//     (delivered as one file PER DISC, not one multi-page file)
//   • 12" gatefold OLD-STYLE jacket (North America, 1/2 pocket)
//                            → 1 page, 27.2500 × 27.0000 in
// A naive finished+bleed target (a 24×12 gatefold, or a ~4.19" 100mm
// label) would FALSE-FAIL every one of those real files — hence we
// hard-check against the MEASURED artboard where we have it
// (`templatePageInches`) and fall back to computed finished+bleed
// (clearly flagged "no vendor template on file") as a WARN-only target
// everywhere else.
//
// NOTE on variants: a single canonical artboard per (vendor, jacket kind)
// is necessarily approximate — MRP issues region- and pocket-specific
// gatefold templates whose flat size differs (a blank gatefold measured
// 33.00×32.53 vs the 27.25×27.00 North-America file actually sent). The
// size check is EXACT against the canonical artboard and admin
// override-with-justification is the documented escape hatch for a
// legitimate variant. Out of scope: auto-detecting the variant.

export type JacketKind = "single" | "gatefold" | "gatefold_oldstyle" | "widespine";
export type InnerSleeveKind = "none" | "printed" | "generic";
export type LabelColorKind = "process-4c" | "spot-1c" | "none";

export type CompletedTemplateConfig = {
  size: VinylSize;
  /** Discs in the package (1 = single LP, 2 = double LP, …). */
  discs: number;
  jacket: JacketKind;
  innerSleeves: InnerSleeveKind;
  labelColor: LabelColorKind;
  /**
   * Task #2705 — whether the package includes a printed booklet. Older
   * persisted configs predate this field; absent = false.
   */
  booklet?: boolean;
};

export function defaultCompletedTemplateConfig(): CompletedTemplateConfig {
  return { size: '12"', discs: 1, jacket: "single", innerSleeves: "none", labelColor: "process-4c", booklet: false };
}

/** Plate requirement for a finished component. */
export type FinishedComponentColor = "process-4c" | "cmyk-or-pms";

export type FinishedComponentSpec = {
  /** Stable slot key, unique within a confirmation. */
  id: string;
  /** Human label ("12" gatefold jacket", "Center labels (4 faces)"). */
  label: string;
  /**
   * Authoritative flat artboard size (inches) measured from a real
   * vendor template / print-ready file. When set, a completed file is
   * hard-checked EXACTLY against this on every page. Null = no vendor
   * template on file → computed finished+bleed is used as a WARN target.
   */
  templatePageInches: { w: number; h: number } | null;
  /** Computed fallback basis (finished trim) when no template on file. */
  finishedInches: { w: number; h: number };
  bleedInches: number;
  /**
   * Pages/faces the completed file for this slot must contain.
   * 0 = not specified (no measured baseline and no catalog value) — the
   * page-count check becomes advisory instead of pass/fail.
   */
  expectedPages: number;
  color: FinishedComponentColor;
  /**
   * Task #2705 — minimum effective raster resolution (PPI) the press
   * requires for placed images. Null = not specified (no check). Sourced
   * only from an operator-entered catalog value — never fabricated.
   */
  minPpi: number | null;
  /**
   * Task #2705 — downloadable template file for this slot, threaded from
   * the press catalog row (press_template_specs.template_file_url) so the
   * Completed Art card can offer a "Template ↓" link. Null = none on file.
   */
  templateFileUrl: string | null;
};

// Measured flat artboard sizes (inches) keyed by
// `${vendorId}:${component}:${sizeKey}[:${variant}]`. Sourced ONLY from
// real measured files — never a published "finished" number. See the
// note above for provenance.
const MEASURED_TEMPLATE_ARTBOARDS: Record<string, { w: number; h: number }> = {
  "mrp:labels:12in": { w: 6.5, h: 7.6811 },
  "mrp:inner_sleeve:12in": { w: 19.0935, h: 30.9685 },
  "mrp:jacket:12in:gatefold_oldstyle": { w: 27.25, h: 27.0 },
};

const SINGLE_JACKET_FINISHED: Record<VinylSize, { w: number; h: number }> = {
  '12"': { w: 12, h: 12 },
  '10"': { w: 10, h: 10 },
  '7"': { w: 7.0625, h: 7.0625 },
};
const LABEL_FINISHED: Record<VinylSize, { w: number; h: number }> = {
  '12"': { w: 3.875, h: 3.875 },
  '10"': { w: 3.5, h: 3.5 },
  '7"': { w: 3.5, h: 3.5 },
};
const INNER_SLEEVE_FINISHED: Record<VinylSize, { w: number; h: number }> = {
  '12"': { w: 12.375, h: 12.375 },
  '10"': { w: 10.375, h: 10.375 },
  '7"': { w: 7.4375, h: 7.4375 },
};

function sizeKeyOf(size: VinylSize): "12in" | "10in" | "7in" {
  return size === '12"' ? "12in" : size === '10"' ? "10in" : "7in";
}

function jacketFinishedInches(size: VinylSize, kind: JacketKind): { w: number; h: number } {
  const single = SINGLE_JACKET_FINISHED[size];
  if (kind === "gatefold" || kind === "gatefold_oldstyle") return { w: single.w * 2, h: single.h };
  return single; // single + widespine use the single face as the computed basis
}

function jacketExpectedPages(kind: JacketKind): number {
  // Old-style tip-on wraps print as one flat sheet; the rest export as
  // outside + inside spreads (2 pages). Authoritative only where we also
  // have a measured artboard.
  return kind === "gatefold_oldstyle" ? 1 : 2;
}

const JACKET_LABELS: Record<JacketKind, string> = {
  single: "single jacket",
  gatefold: "gatefold jacket",
  gatefold_oldstyle: "gatefold jacket (old-style tip-on)",
  widespine: "widespine jacket",
};

/**
 * The set of print components a completed release must supply for the
 * chosen vendor + product configuration, each with the finished-template
 * checks it's held to. Drives both the required-slot list in the admin
 * panel and the server-side per-component validator.
 */
export function requiredFinishedComponents(
  vendorId: VendorId,
  config: CompletedTemplateConfig,
): FinishedComponentSpec[] {
  const out: FinishedComponentSpec[] = [];
  const discs = Math.max(1, Math.floor(Number(config.discs) || 1));
  const sizeKey = sizeKeyOf(config.size);

  // Jacket — always exactly one.
  out.push({
    id: "jacket",
    label: `${config.size} ${JACKET_LABELS[config.jacket]}`,
    templatePageInches:
      MEASURED_TEMPLATE_ARTBOARDS[`${vendorId}:jacket:${sizeKey}:${config.jacket}`] ?? null,
    finishedInches: jacketFinishedInches(config.size, config.jacket),
    bleedInches: 0.125,
    expectedPages: jacketExpectedPages(config.jacket),
    color: "cmyk-or-pms",
    minPpi: null,
    templateFileUrl: null,
  });

  // Center labels — one component, two faces per disc, delivered as one
  // multi-page file (confirmed: a 2LP ships a single 4-page label PDF).
  if (config.labelColor !== "none") {
    const faces = discs * 2;
    out.push({
      id: "labels",
      label: `Center labels (${faces} faces)`,
      templatePageInches: MEASURED_TEMPLATE_ARTBOARDS[`${vendorId}:labels:${sizeKey}`] ?? null,
      finishedInches: LABEL_FINISHED[config.size],
      bleedInches: 0.125,
      expectedPages: faces,
      color: config.labelColor === "process-4c" ? "process-4c" : "cmyk-or-pms",
      minPpi: null,
      templateFileUrl: null,
    });
  }

  // Booklet — one component when the package includes one. No measured
  // baseline exists (page count and artboard come only from the press
  // catalog row), so expectedPages 0 = advisory page count and the size
  // check falls back to the computed jacket face + bleed as a WARN target.
  if (config.booklet) {
    out.push({
      id: "booklet",
      label: "Booklet",
      templatePageInches: null,
      finishedInches: SINGLE_JACKET_FINISHED[config.size],
      bleedInches: 0.125,
      expectedPages: 0,
      color: "cmyk-or-pms",
      minPpi: null,
      templateFileUrl: null,
    });
  }

  // Printed inner sleeves — one slot PER DISC (confirmed: each disc ships
  // its own 1-page sleeve file).
  if (config.innerSleeves === "printed") {
    const measured = MEASURED_TEMPLATE_ARTBOARDS[`${vendorId}:inner_sleeve:${sizeKey}`] ?? null;
    for (let d = 1; d <= discs; d++) {
      out.push({
        id: `inner_sleeve_${d}`,
        label: discs > 1 ? `Printed inner sleeve — disc ${d}` : "Printed inner sleeve",
        templatePageInches: measured,
        finishedInches: INNER_SLEEVE_FINISHED[config.size],
        bleedInches: 0.125,
        expectedPages: 1,
        color: "cmyk-or-pms",
        minPpi: null,
        templateFileUrl: null,
      });
    }
  }

  return out;
}

// ─── Catalog-stored press template specs (operator-editable) ──────────
// Task #2109 expansion. The MEASURED_TEMPLATE_ARTBOARDS constants above
// are the permanent baseline. Operators can additionally store per-press,
// per-format, per-component artboard / page / color specs in the press
// CATALOG (press_template_specs, keyed by manufacturers.id). When a
// stored row exists for the resolved (press, format, component[, jacket
// variant][, disc count]) it overrides the matching baseline FIELD; an
// absent row — or an absent field on a row — always falls back to the
// constant. Same finished-template check, now backed by operator-curated
// data without ever losing the measured-from-real-files defaults.

/**
 * One operator-editable spec row, shaped loosely so the resolver can
 * consume drizzle's `PressTemplateSpec` rows directly (structural typing)
 * without importing the DB schema into this shared module.
 */
export type PressTemplateSpecRow = {
  format: string;
  /** 'jacket' | 'labels' | 'inner_sleeve'. */
  componentKey: string;
  /** JacketKind for jacket rows; "" (no variant) for labels / sleeves. */
  variantKey: string;
  /** Discs this row is specific to; 0 = generic (applies to any count). */
  discCount: number;
  artboardWInches: number | null;
  artboardHInches: number | null;
  expectedPages: number | null;
  /** 'process-4c' | 'cmyk-or-pms' | null (keep baseline). */
  color: string | null;
  fontsRule?: string | null;
  templateFileUrl?: string | null;
  /** Task #2705 — minimum placed-image resolution (PPI); null = no check. */
  minPpi?: number | null;
};

/**
 * Map a completed-template product config to the catalog AlbumFormat key
 * the press catalog (and press_template_specs) is keyed by. 10" has no
 * catalog format → null (no stored specs; baseline / computed only).
 */
export function completedTemplateConfigToAlbumFormat(
  config: CompletedTemplateConfig,
): string | null {
  const discs = Math.max(1, Math.floor(Number(config.discs) || 1));
  if (config.size === '7"') return "7_inch";
  if (config.size === '12"') return discs >= 2 ? "12_double" : "12_lp";
  return null; // 10" (and any future size) has no catalog format yet
}

/**
 * The catalog lookup coordinates for a required-component spec: which
 * component_key + variant_key a stored row must carry to override it.
 * Jacket rows are variant-specific (by JacketKind); labels and the
 * per-disc inner sleeves share one variant-less ("") row each.
 */
function specLookupCoords(
  specId: string,
  config: CompletedTemplateConfig,
): { componentKey: string; variantKey: string } {
  if (specId === "jacket") return { componentKey: "jacket", variantKey: config.jacket };
  if (specId === "labels") return { componentKey: "labels", variantKey: "" };
  if (specId === "booklet") return { componentKey: "booklet", variantKey: "" };
  if (specId.startsWith("inner_sleeve")) return { componentKey: "inner_sleeve", variantKey: "" };
  return { componentKey: specId, variantKey: "" };
}

/**
 * The required finished components for (vendor, config), with any
 * operator-stored catalog specs merged OVER the measured-constant
 * baseline per field. Both artboard dimensions must be present to
 * override the template artboard (a half-specified row is ignored for
 * sizing); expectedPages / color override individually when set. A
 * jacket row may be variant-specific (wins) or variant-less ("" = applies
 * to any JacketKind). Each candidate prefers an exact disc-count row,
 * then the generic (discCount 0) row.
 */
export function resolveFinishedComponents(args: {
  vendorId: VendorId;
  config: CompletedTemplateConfig;
  storeRows?: PressTemplateSpecRow[];
}): FinishedComponentSpec[] {
  const baseline = requiredFinishedComponents(args.vendorId, args.config);
  const format = completedTemplateConfigToAlbumFormat(args.config);
  const rows = (args.storeRows ?? []).filter((r) => !format || r.format === format);
  if (rows.length === 0) return baseline;
  const discs = Math.max(1, Math.floor(Number(args.config.discs) || 1));
  return baseline.map((spec) => {
    const { componentKey, variantKey } = specLookupCoords(spec.id, args.config);
    const variantCandidates =
      componentKey === "jacket" && variantKey !== "" ? [variantKey, ""] : [variantKey];
    let match: PressTemplateSpecRow | undefined;
    for (const vk of variantCandidates) {
      match =
        rows.find(
          (r) => r.componentKey === componentKey && (r.variantKey ?? "") === vk && r.discCount === discs,
        ) ??
        rows.find(
          (r) => r.componentKey === componentKey && (r.variantKey ?? "") === vk && r.discCount === 0,
        );
      if (match) break;
    }
    if (!match) return spec;
    const next: FinishedComponentSpec = { ...spec };
    if (match.artboardWInches != null && match.artboardHInches != null) {
      next.templatePageInches = { w: match.artboardWInches, h: match.artboardHInches };
    }
    if (match.expectedPages != null) next.expectedPages = match.expectedPages;
    if (match.color === "process-4c" || match.color === "cmyk-or-pms") next.color = match.color;
    if (match.minPpi != null && match.minPpi > 0) next.minPpi = match.minPpi;
    if (match.templateFileUrl) next.templateFileUrl = match.templateFileUrl;
    return next;
  });
}
