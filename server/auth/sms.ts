// Task #538 — Outbound SMS helper.
//
// Single chokepoint for every SMS we send: phone-OTP codes today, future
// gift-recipient notifications, etc. Uses the Twilio integration set up
// via the integrations skill — credentials live in the Replit connector
// store (no .env wrangling) and the token is fetched fresh per call.
//
// In dev (or when Twilio isn't connected yet) we no-op and log the
// destination + payload to stdout so the operator can grab the OTP code
// from server logs exactly like the email-OTP fallback. The code itself
// is NEVER logged from inside this helper — callers log a synthetic
// `[sms]` marker without the body. The body argument is opaque here on
// purpose so we don't accidentally double-log the secret.
import type { Request } from "express";

type SendArgs = { to: string; body: string };

let twilioModule: any | null = null;
async function getTwilio() {
  if (twilioModule) return twilioModule;
  try {
    // Optional dep — installed only when the Twilio connector is wired.
    twilioModule = await import("twilio");
    return twilioModule;
  } catch {
    return null;
  }
}

// Fetch the Twilio credentials from Replit's connectors proxy. Mirrors
// the boilerplate the integrations skill ships — token + account sid +
// from-number all live behind the connector, refreshed per call so an
// expired token never poisons a long-running server.
async function getTwilioCreds(): Promise<{ accountSid: string; authToken: string; fromNumber: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;
  if (!hostname || !xReplitToken) return null;
  try {
    const r = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=twilio`,
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } },
    );
    if (!r.ok) return null;
    const json: any = await r.json();
    const conn = json.items?.[0];
    if (!conn) return null;
    const s = conn.settings ?? {};
    const accountSid = s.account_sid ?? s.accountSid;
    const authToken = s.auth_token ?? s.authToken ?? s.api_secret;
    const fromNumber = s.from_number ?? s.fromNumber ?? s.phone_number;
    if (!accountSid || !authToken || !fromNumber) return null;
    return { accountSid, authToken, fromNumber };
  } catch {
    return null;
  }
}

export async function sendSms({ to, body }: SendArgs): Promise<{ ok: boolean; provider: "twilio" | "console"; error?: string }> {
  const twilio = await getTwilio();
  const creds = await getTwilioCreds();
  if (!twilio || !creds) {
    // Dev / unconfigured: log destination only (NEVER the body in plain
    // form — callers also log a `[sms]` marker without the secret).
    console.log(`[sms] (console-only — twilio not configured) to=${to} bodyLen=${body.length}`);
    return { ok: true, provider: "console" };
  }
  try {
    const client = twilio.default(creds.accountSid, creds.authToken);
    await client.messages.create({ to, from: creds.fromNumber, body });
    return { ok: true, provider: "twilio" };
  } catch (e: any) {
    const msg = e?.message || "send failed";
    console.error(`[sms-failure] to=${to} ${msg}`);
    return { ok: false, provider: "twilio", error: msg };
  }
}

// Best-effort E.164 normalization. We only accept numbers the user
// typed in dialable form — anything that doesn't parse to a leading
// `+` followed by 8–15 digits is rejected at the route layer. We don't
// pull in libphonenumber-js for this task; if a number gets through
// that Twilio later rejects, the failure is logged and surfaced to
// the user as "couldn't send code, double-check the number".
const E164_RE = /^\+[1-9]\d{7,14}$/;

export function normalizeE164(raw: string, defaultCountryDial = "1"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already in +E.164
  if (trimmed.startsWith("+")) {
    const cleaned = "+" + trimmed.slice(1).replace(/[^\d]/g, "");
    return E164_RE.test(cleaned) ? cleaned : null;
  }
  // Strip everything non-digit; if it looks like a US-shaped 10 digits,
  // prepend the default country dial code. Otherwise reject — we never
  // guess a country from an opaque 7-digit string.
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    const cleaned = `+${defaultCountryDial}${digits}`;
    return E164_RE.test(cleaned) ? cleaned : null;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const cleaned = `+${digits}`;
    return E164_RE.test(cleaned) ? cleaned : null;
  }
  return null;
}

// Last-four mask for UI confirmation copy ("Code sent to •••• 1234").
// Keeps the rest of the number off the wire so a leaked log line can't
// be reverse-paired to a person.
export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}

export function extractIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return fwd || req.ip || req.socket.remoteAddress || "unknown";
}
