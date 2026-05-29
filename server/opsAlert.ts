// Operational alerting — turns server-side 5xx errors into an email to
// on-call so an outage is a ~60-second heads-up instead of a fan (or Bill)
// finding it first. Deliberately dependency-free and fail-safe: every
// public entry point is fire-and-forget and swallows its own errors, so
// alerting can never take down the request that triggered it.
//
// Recipient: OPS_ALERT_EMAIL, falling back to MAIL_REPLY_TO. Only sends in
// production with a recipient configured; otherwise it logs a single
// structured line so dev still shows what *would* have paged.
//
// Throttling (in-memory, per-instance): one email per distinct signature
// per COOLDOWN_MS, plus a global hourly cap, so a crash loop or a flood of
// identical 500s can't fan out into thousands of emails. Per-instance
// state is an accepted v1 tradeoff — under autoscale a few instances may
// each send one per window, which is fine (slightly noisy beats silent).
// A shared dedup table can replace this if the noise ever justifies it.

import { sendOpsAlertEmail } from "./mail";

const COOLDOWN_MS = 15 * 60 * 1000; // one email per signature per 15 min
const GLOBAL_HOURLY_CAP = 20; // hard ceiling across all signatures / hour

const lastSentBySignature = new Map<string, number>();
let windowStart = Date.now();
let sentThisWindow = 0;

function recipient(): string | null {
  const v = (process.env.OPS_ALERT_EMAIL || process.env.MAIL_REPLY_TO || "").trim();
  return v.length > 0 ? v : null;
}

function withinGlobalCap(now: number): boolean {
  if (now - windowStart >= 60 * 60 * 1000) {
    windowStart = now;
    sentThisWindow = 0;
  }
  return sentThisWindow < GLOBAL_HOURLY_CAP;
}

export type OpsAlert = {
  // Dedup key — keep it coarse (e.g. "500 POST /api/auth/login") so a
  // repeating fault collapses into one email per cooldown window.
  signature: string;
  subject: string;
  detail: string;
};

// Fire-and-forget. Safe to call from a hot request path; never throws.
export function alertOps(alert: OpsAlert): void {
  void dispatch(alert).catch(() => {
    /* alerting must never surface into the caller */
  });
}

async function dispatch(alert: OpsAlert): Promise<void> {
  const now = Date.now();
  const last = lastSentBySignature.get(alert.signature) ?? 0;
  if (now - last < COOLDOWN_MS) return; // still cooling down for this fault

  const to = recipient();
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd || !to) {
    // Dev, or no recipient configured: log what would have paged so the
    // signal is visible without sending mail.
    console.warn(
      `[ops-alert${isProd ? "" : ":dev"}] ${alert.signature} :: ${alert.subject}` +
        (to ? "" : " (no OPS_ALERT_EMAIL/MAIL_REPLY_TO recipient configured)"),
    );
    lastSentBySignature.set(alert.signature, now);
    return;
  }

  if (!withinGlobalCap(now)) {
    console.warn(`[ops-alert] global hourly cap reached; suppressing ${alert.signature}`);
    return;
  }

  // Stamp the cooldown + count BEFORE awaiting so a burst arriving within
  // the same tick can't all slip past the gate.
  lastSentBySignature.set(alert.signature, now);
  sentThisWindow += 1;

  const res = await sendOpsAlertEmail(to, alert.subject, alert.detail);
  if (!res.ok) {
    console.warn(`[ops-alert] send failed for ${alert.signature}: ${res.reason}`);
  }
}
