// Shared types for upload-time preflight validation (art + audio
// against a pressing-vendor spec). Used by both `server/validators/`
// and `client/src/components/admin/UploadValidationsPanel.tsx`.

// Task #3030 — "unverified": the check RAN but only against a weaker
// measurement source than the canon reference (e.g. bleed measured from
// the file's own PDF bleed box because no certified press template line
// exists). Not a pass: it blocks a fully-clean verdict until an operator
// explicitly acknowledges it.
export type CheckStatus = "pass" | "warn" | "fail" | "unverified";

export type CheckResult = {
  /** Stable machine key (e.g. "art.resolution", "audio.bit_depth"). */
  key: string;
  /** Short human label for the row ("Resolution", "Bit depth"). */
  label: string;
  status: CheckStatus;
  /**
   * Task #3012 — "advisory" rows carry press-worded guidance that can't
   * be machine-verified (safety-area content, label knockout). They keep
   * status "pass" so they never flip a clean component's rollup, but the
   * client renders them with an info glyph instead of a green check.
   */
  tier?: "advisory";
  /** One-line detail message. */
  message: string;
  /**
   * Task #3030 — the measurement source this result was produced against
   * (e.g. "Measured against the MRP certified template line."). Rendered
   * as visible plain text on the check row and the verdict banner — never
   * a tooltip. Currently stamped by the bleed check.
   */
  source?: string;
};

export type UploadValidationKind = "art" | "audio";

export type ValidationOverride = {
  byUserId: string;
  byDisplayName: string | null;
  justification: string;
  at: string; // ISO timestamp
};

export type UploadValidationResult = {
  id: string;
  albumId: string;
  kind: UploadValidationKind;
  vendorId: string;
  templateId: string | null;
  assetUrl: string;
  fileName: string | null;
  status: CheckStatus;
  checks: CheckResult[];
  override: ValidationOverride | null;
  createdAt: string;
};

/** Roll a list of per-check results into a single status. */
export function rollupStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  // Task #3030 — unverified outranks warn: it means a check could only be
  // run against a weaker source and needs explicit operator attention.
  if (checks.some((c) => c.status === "unverified")) return "unverified";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

// ─── Task #2109 — Completed-template confirmation ─────────────────────
// A finished, print-ready release is more than one file: it's a SET of
// print components (jacket, center labels, inner sleeves, …) defined by
// the chosen vendor + product configuration. The admin "Confirm a
// completed PDF matches the press specs" surface matches each supplied
// file to a required component slot and records, per component, whether
// it's present / missing / extra plus the finished-template checks it ran.

export type CompletedComponentPresence = "present" | "missing" | "extra";

export type CompletedTemplateComponent = {
  /** Matches a FinishedComponentSpec.id (or a free id for an extra file). */
  componentId: string;
  /** Snapshot of the component label at match time. */
  label: string;
  presence: CompletedComponentPresence;
  /** Source URL of the print-ready file (we persist the link, not the blob). */
  assetUrl: string | null;
  fileName: string | null;
  /**
   * Task #2705 — first-page raster thumbnail (/objects/uploads/… path)
   * generated server-side for direct-uploaded files. Null when no preview
   * could be produced (pasted external links are never fetched twice) —
   * the client shows a generic PDF tile, never a fake.
   */
  previewUrl?: string | null;
  /**
   * Task #3020 — second preview face, currently only for center labels
   * (page 2 = Side B), cropped to the trim square like `previewUrl`.
   * Null/absent when the file has no second page or no preview could be
   * produced.
   */
  previewUrl2?: string | null;
  /**
   * Task #3351 — FULL-ARTBOARD raster (/objects/uploads/… path), uncropped
   * (bleed + flaps included), generated server-side alongside the trim
   * preview at check time. The artist Test page's pdf.js render is the
   * primary full-bleed view; this is the lightweight fallback when a very
   * large master can't be rendered in the browser. When no crop was applied
   * to `previewUrl` this may be the same object. Null when no raster could
   * be produced.
   */
  fullPreviewUrl?: string | null;
  /** Artboard width/height in millimetres (page-1 CropBox, MediaBox
   *  fallback) so the fallback raster can seat over the measured template
   *  exactly like the pdf.js render. Null when the boxes couldn't be read. */
  fullPreviewWMm?: number | null;
  fullPreviewHMm?: number | null;
  /** Per-rule finished-template check results (empty for a missing slot). */
  checks: CheckResult[];
  /** Worst status across `checks`; null when nothing has been run yet. */
  status: CheckStatus | null;
  /** Admin override-with-justification, stamped per component. */
  override: ValidationOverride | null;
  /**
   * Task #3030 — operator acknowledgment of an Unverified result (who +
   * when). Once acknowledged, the rollup may read clean, but the result
   * itself still displays as Unverified + acknowledged. Re-running the
   * check against a (possibly changed) file resets this to null.
   */
  unverifiedAck?: UnverifiedAck | null;
};

/** Task #3030 — who acknowledged an Unverified result, and when. */
export type UnverifiedAck = {
  byUserId: string;
  byDisplayName: string | null;
  at: string; // ISO timestamp
};

// Rolled-up "ready to send" verdict for a whole confirmation:
//   ready    — every required component present + passing (or overridden)
//   warnings — sendable but something warned / was overridden / is extra
//   blocked  — a required component is missing or failing (not overridden)
//   empty    — nothing configured / supplied yet
// Both `ready` and `warnings` are sendable; only `blocked` stops a send.
export type CompletedTemplateVerdict = "ready" | "warnings" | "blocked" | "empty";

export function rollupCompletedTemplate(
  components: CompletedTemplateComponent[],
  requiredComponentIds: string[],
): CompletedTemplateVerdict {
  if (requiredComponentIds.length === 0 && components.length === 0) return "empty";
  const byId = new Map(components.map((c) => [c.componentId, c]));
  let blocked = false;
  let warned = false;
  for (const id of requiredComponentIds) {
    const c = byId.get(id);
    if (c?.override) {
      warned = true;
      continue;
    }
    if (!c || c.presence === "missing") {
      blocked = true;
      continue;
    }
    // Present but never validated (status null) is not "ready".
    if (c.status === "fail" || c.status == null) blocked = true;
    // Task #3030 — an unacknowledged Unverified result blocks a clean
    // verdict (like warn-or-worse). Once an operator acknowledges it, the
    // verdict may roll up clean while the row still displays Unverified.
    else if (c.status === "unverified") {
      if (!c.unverifiedAck) warned = true;
    } else if (c.status === "warn") warned = true;
  }
  // Files matched to no required slot never block — they only warn.
  if (components.some((c) => c.presence === "extra")) warned = true;
  if (blocked) return "blocked";
  if (warned) return "warnings";
  return "ready";
}
