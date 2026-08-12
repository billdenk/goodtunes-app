// Task #3065 — template option detection + custom-slot helpers.
//
// Option detection: a single template PDF sometimes draws MORE than one
// physical option (the canonical case: a 7″ center-label template showing
// both the small spindle hole and the large 45 "jukebox" hole cutout). The
// attach flow extracts the PDF's text and looks for option-family wording;
// when a family's options are ALL mentioned, the operator is offered a
// confirm ("this one template serves both…"). Detection is conservative —
// every option in the family must appear, and nothing is persisted without
// the operator confirming — so a wrong guess is harmless.
//
// Built as a FAMILIES list so future option families (e.g. sleeve
// with/without flap) are one entry here, no flow changes.

export type TemplateOption = { key: string; label: string };

type OptionFamily = {
  family: string;
  options: Array<TemplateOption & { patterns: RegExp[] }>;
};

const OPTION_FAMILIES: OptionFamily[] = [
  {
    family: "hole_size",
    options: [
      {
        key: "small_hole",
        label: "Small hole",
        patterns: [/small[\s-]*(?:spindle[\s-]*)?hole/i, /spindle[\s-]*hole/i],
      },
      {
        key: "large_hole",
        label: "Large hole",
        patterns: [/(?:large|big)[\s-]*hole/i, /(?:large|big)[\s-]*hole[\s-]*cut[\s-]*out/i, /jukebox[\s-]*hole/i, /45[\s-]*hole/i],
      },
    ],
  },
];

/**
 * Scan extracted PDF text for option families. Returns the options of the
 * FIRST family whose options are ALL mentioned (conservative: one mention of
 * one option — e.g. only "small hole" — is not a multi-option template).
 * Empty array = nothing option-like found.
 */
export function detectOptionsInText(text: string): TemplateOption[] {
  if (!text || text.length < 8) return [];
  for (const fam of OPTION_FAMILIES) {
    const hits = fam.options.filter((o) => o.patterns.some((p) => p.test(text)));
    if (hits.length === fam.options.length && hits.length >= 2) {
      return hits.map(({ key, label }) => ({ key, label }));
    }
  }
  return [];
}

/** Validate a client-confirmed options payload against the known families —
 *  the stamp endpoint only persists options detection could have offered. */
export function isKnownOptionSet(options: TemplateOption[]): boolean {
  if (!Array.isArray(options) || options.length < 2 || options.length > 4) return false;
  return OPTION_FAMILIES.some((fam) => {
    if (options.length !== fam.options.length) return false;
    const keys = new Set(fam.options.map((o) => o.key));
    return options.every((o) => keys.has(o.key));
  });
}

// ─── Custom-slot helpers ─────────────────────────────────────────────

/** "Hype sticker (front)" → "custom_hype_sticker_front". */
export function customSlotKeyFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return `custom_${slug || "slot"}`;
}

export const CUSTOM_SLOT_KEY_RE = /^custom_[a-z0-9_]{1,48}$/;

/** Auto-assign one of the four die-line icons from the slot's name. */
export function iconKindForSlotName(name: string): "jacket" | "sleeve" | "labels" | "booklet" {
  const n = name.toLowerCase();
  if (/(booklet|insert|card|lyric|poster|flyer|obi)/.test(n)) return "booklet";
  if (/(sleeve|bag|pocket|wallet|envelope)/.test(n)) return "sleeve";
  if (/(jacket|cover|box|slip|case|wrap)/.test(n)) return "jacket";
  return "labels"; // stickers, labels, disc faces, everything round/adhesive
}
