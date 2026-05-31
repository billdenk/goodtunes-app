import { useAuth } from "./useAuth";

/**
 * Temporary "for now" exemption from the preview-first 30s cap.
 *
 * Production has no per-account ownership records yet, so every signed-in
 * fan is treated as a non-owner and gets the preview-first experience
 * (30s auto-advance + preview-only tracklist) on Buy-enabled albums. Bill
 * wants his own accounts to hear full-length tracks on every album — even
 * albums shared to an account that doesn't "own" them.
 *
 * This is NOT the real entitlement system (that's the Phase 4 ownership
 * work in docs/roadmap.md). It's a deliberately small, easy-to-edit
 * allowlist that grants full playback to:
 *   - any admin/operator session (`kind: "admin"` or `isAdmin: true`), and
 *   - any fan account whose email is in FULL_ACCESS_EMAILS below.
 *
 * Policy (confirmed by Bill): for now, *every admin can hear full tracks* —
 * not just super_admins, but every partner role too (label, artist,
 * non_profit, manufacturer, fulfillment, vendor). They all sign in through
 * the admin shell, which stamps `kind: "admin"` on the session regardless of
 * the `users.is_admin` column, so the `kind === "admin"` check below covers
 * all of them. Do NOT re-gate this on `isAdmin` alone — partner accounts can
 * have `is_admin = false` and would wrongly lose full playback.
 *
 * Non-profits technically get full access too, but they have no master
 * audio yet, so that carve-out is moot until they do. The deliberate 30s
 * preview stays in force for real (non-admin) fans — that's by design, not
 * something this hook should remove.
 *
 * To grant a new (non-admin) account: add its lowercase email to
 * FULL_ACCESS_EMAILS. When the real ownership pipeline lands, delete this
 * hook and its callers.
 */
const FULL_ACCESS_EMAILS: string[] = [
  // Add Bill's fan-side account email(s) here, lowercase, e.g.:
  // "bill@example.com",
];

export function useFullPlaybackAccess(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.isAdmin || user.kind === "admin") return true;
  const email = user.email?.toLowerCase().trim();
  if (email && FULL_ACCESS_EMAILS.includes(email)) return true;
  return false;
}
