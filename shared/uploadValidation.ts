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
