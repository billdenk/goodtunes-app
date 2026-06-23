import { createHmac, timingSafeEqual } from "crypto";

// Task #2012 — signed, stateless unsubscribe tokens for the new-music
// announcement email. The token encodes the customer id plus an HMAC so a fan
// can turn off notify_new_music_opt_in from a one-tap email link without us
// storing a per-fan secret or exposing a guessable raw id.
//
// Keyed off TOTP_ENC_KEY (already provisioned in dev + prod). If it's somehow
// unset we fall back to a fixed dev-only key so local testing still works; in
// production we REFUSE to sign with the fallback (otherwise the fixed secret
// would let anyone forge a one-tap opt-out for any customer id).
const REAL_SECRET = (process.env.TOTP_ENC_KEY || "").trim();
const SECRET = REAL_SECRET || "goodtunes-dev-unsubscribe-key";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

// True when we can sign real (non-forgeable) unsubscribe tokens: dev always
// works via the fixed fallback key; production REQUIRES the real secret.
export function isUnsubscribeTokenConfigured(): boolean {
  return !!REAL_SECRET || process.env.NODE_ENV !== "production";
}

// Preflight guard for callers (e.g. the mass-announce route) that must fail
// CLEANLY before doing irreversible work — claiming the single-shot send,
// blasting the list — rather than throwing mid-loop once it's too late.
export function assertUnsubscribeTokenConfigured(): void {
  if (!isUnsubscribeTokenConfigured()) {
    throw new Error(
      "TOTP_ENC_KEY is required to sign unsubscribe tokens in production",
    );
  }
}

export function signUnsubscribeToken(customerId: string): string {
  assertUnsubscribeTokenConfigured();
  const sig = sign(customerId);
  return `${Buffer.from(customerId).toString("base64url")}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const idPart = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let customerId: string;
  try {
    customerId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!customerId) return null;
  const expected = sign(customerId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return customerId;
}
