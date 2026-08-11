// Shared types for upload-time preflight validation (art + audio
// against a pressing-vendor spec). Used by both `server/validators/`
// and `client/src/components/admin/UploadValidationsPanel.tsx`.

export type CheckStatus = "pass" | "warn" | "fail";

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
  /** Per-rule finished-template check results (empty for a missing slot). */
  checks: CheckResult[];
  /** Worst status across `checks`; null when nothing has been run yet. */
  status: CheckStatus | null;
  /** Admin override-with-justification, stamped per component. */
  override: ValidationOverride | null;
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
    else if (c.status === "warn") warned = true;
  }
  // Files matched to no required slot never block — they only warn.
  if (components.some((c) => c.presence === "extra")) warned = true;
  if (blocked) return "blocked";
  if (warned) return "warnings";
  return "ready";
}
