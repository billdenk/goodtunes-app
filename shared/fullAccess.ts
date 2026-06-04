// Temporary "for now" full-playback / preview-privilege allowlist.
//
// Production has no per-account ownership records yet, so every signed-in fan
// is treated as a non-owner (preview-first). Bill's own accounts get full
// playback + can stage-preview not-yet-public release pages. Admin sessions
// are covered by their `kind: "admin"` server-side; this list covers the
// *customer-side* accounts that need the same privilege — notably on the
// get.goodtunes.music share host, which only ever issues customer-kind
// sessions (an admin session is rejected there), so an admin-only check
// silently no-ops and we must recognize the privileged customer by email.
//
// Single source of truth shared by the client hook (useFullPlaybackAccess)
// and the server staging-preview gate. When the real ownership/entitlement
// pipeline lands, delete this and its callers.
export const FULL_ACCESS_EMAILS: string[] = [
  // Bill's fan-side account (@billy). Add more emails (lowercase) below.
  "billdenk@mac.com",
];

export function isFullAccessEmail(email?: string | null): boolean {
  if (!email) return false;
  return FULL_ACCESS_EMAILS.includes(email.toLowerCase().trim());
}
