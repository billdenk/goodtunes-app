// otplib 13.x replaced the older `authenticator` singleton with a
// functional API. The async variants (`generate` / `verify`) return
// Promises, which is a footgun for `if (verify(...))` style checks —
// every boolean test would pass against a pending Promise and silently
// accept any TOTP code. We use the `*Sync` variants throughout so the
// 2FA gate actually gates.
import { generateSync, generateSecret, verifySync } from "otplib";
import QRCode from "qrcode";

export function generateTotpSecret(): string {
  return generateSecret();
}

// Build the otpauth:// URI by hand — the otplib 13 API doesn't ship a
// `keyuri` helper anymore, but the format is RFC-6238 boilerplate.
export function totpUri(secret: string, accountName: string, issuer = "GoodTunes Admin"): string {
  const enc = (s: string) => encodeURIComponent(s);
  const label = `${enc(issuer)}:${enc(accountName)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function totpQrDataUrl(secret: string, accountName: string): Promise<string> {
  return QRCode.toDataURL(totpUri(secret, accountName));
}

export function verifyTotp(secret: string, token: string): boolean {
  // otplib 13.x verifySync returns `{ valid, delta }` — *not* a boolean.
  // Both `{ valid: true }` and `{ valid: false }` are truthy objects, so
  // a naked `if (verifyTotp(...))` against the raw result would silently
  // accept every code. Pull `.valid` out explicitly here so every caller
  // sees a real boolean.
  const result = verifySync({ secret, token: token.replace(/\s/g, "") });
  return Boolean(result?.valid);
}

// Convenience for tests / debugging.
export function currentTotp(secret: string): string {
  return generateSync({ secret });
}
