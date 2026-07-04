// Task #2519 — Artist→artist referral earning window.
//
// The artist/label referral promise is "$1 on every paid unit they ship,
// for one year" — NOT for life. The earning window runs for one year from
// when the referred artist's relationship was established (their invite
// accept, which == `artist_referrals.created_at`). Once the year passes,
// no NEW referral_credits are minted for that referral (already-earned
// credits are untouched; no clawback).
//
// This helper is shared by the server (payout minting gate in
// server/commerce.ts + the /api/artist/referrals status) and the client
// (the referred-artists dashboard active/ended label) so the promise and
// the surfaced status can never drift.
//
// NPO / non-profit referrals are a separate, still-ongoing program and do
// NOT use this window.

export const REFERRAL_WINDOW_YEARS = 1;

// One calendar year after the anchor, DST-safe (uses setFullYear, not a
// fixed millisecond count, so a leap year doesn't shift the boundary).
export function referralWindowEndsAt(anchor: Date | string): Date {
  const start = anchor instanceof Date ? anchor : new Date(anchor);
  const end = new Date(start.getTime());
  end.setFullYear(end.getFullYear() + REFERRAL_WINDOW_YEARS);
  return end;
}

// Whether the referral's one-year earning window is still active at `at`
// (defaults to now).
//
// A null/undefined/unparseable anchor returns TRUE (fail-open): we only
// STOP paying when we can positively prove the window has closed. A legacy
// referral with no recoverable anchor keeps earning rather than being
// silently and wrongly cut off.
export function isReferralWindowActive(
  anchor: Date | string | null | undefined,
  at: Date | number = Date.now(),
): boolean {
  if (anchor == null) return true;
  const start = anchor instanceof Date ? anchor : new Date(anchor);
  if (Number.isNaN(start.getTime())) return true;
  const now = typeof at === "number" ? at : at.getTime();
  return now < referralWindowEndsAt(start).getTime();
}
