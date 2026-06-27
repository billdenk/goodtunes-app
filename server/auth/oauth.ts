import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from "jose";

export const GOOGLE_CONFIGURED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Apple stores the .p8 signing key as a base64 PKCS#8 blob. Some
// secret-managers paste it complete with PEM headers; others strip the
// headers (or collapse newlines). Normalise both shapes into the
// canonical PEM the JOSE importer expects, and consider Apple
// "configured" when the resulting block looks plausibly like a key.
export function normalizeApplePrivateKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed)) {
    return trimmed.replace(/\\n/g, "\n");
  }
  // Treat anything else as raw base64 (whitespace allowed) and wrap.
  const b64 = trimmed.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 80) return null;
  const wrapped = b64.match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

const APPLE_PRIVATE_KEY_PEM = normalizeApplePrivateKey(process.env.APPLE_PRIVATE_KEY);

export const APPLE_CONFIGURED = !!(
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_SERVICES_ID &&
  APPLE_PRIVATE_KEY_PEM
);

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

// ── Stateless OAuth state (signed bag) ──────────────────────────────────────
// Apple's form_post callback is a cross-site POST. With SameSite=Lax the
// session cookie is not sent on that POST, so we cannot store the OAuth
// nonce/kind/etc. in the session and read it back on the callback. Instead
// we HMAC-sign a JSON bag and round-trip it inside the OAuth `state`
// parameter itself. The signature is verified on the callback with a
// timing-safe comparison before any bag field is trusted.

export type OAuthStateBag = {
  nonce: string;
  kind: "admin" | "customer";
  provider: string;
  linkToUserId?: string;
  inviteToken?: string;
};

function oauthHmacKey(): string {
  return process.env.SESSION_SECRET || "goodtunes-dev-only-secret";
}

export function signOAuthState(bag: OAuthStateBag): string {
  const payload = Buffer.from(JSON.stringify(bag)).toString("base64url");
  const sig = createHmac("sha256", oauthHmacKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(token: string): OAuthStateBag | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", oauthHmacKey()).update(payload).digest("base64url");
  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as OAuthStateBag;
  } catch {
    return null;
  }
}

// ---------- Google ---------------------------------------------------------

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const tokens = (await tokenRes.json()) as { id_token?: string; access_token?: string };
  if (!tokens.id_token) throw new Error("Google did not return an id_token");

  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: process.env.GOOGLE_CLIENT_ID!,
  });
  return {
    sub: String(payload.sub),
    email: (payload.email as string) ?? null,
    emailVerified: Boolean(payload.email_verified),
    name: (payload.name as string) ?? null,
    picture: (payload.picture as string) ?? null,
  };
}

// ---------- Apple ----------------------------------------------------------

async function buildAppleClientSecret(): Promise<string> {
  if (!APPLE_PRIVATE_KEY_PEM) throw new Error("APPLE_PRIVATE_KEY is missing or not a PKCS#8 blob");
  const pk = await importPKCS8(APPLE_PRIVATE_KEY_PEM, "ES256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("https://appleid.apple.com")
    .setSubject(process.env.APPLE_SERVICES_ID!)
    .sign(pk);
}

export function buildAppleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_SERVICES_ID!,
    redirect_uri: redirectUri,
    response_type: "code id_token",
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

export async function exchangeAppleCode(code: string, redirectUri: string): Promise<{
  sub: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateRelay: boolean;
}> {
  const clientSecret = await buildAppleClientSecret();
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_SERVICES_ID!,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Apple token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Apple did not return an id_token");

  const jwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: "https://appleid.apple.com",
    audience: process.env.APPLE_SERVICES_ID!,
  });
  const email = (payload.email as string) ?? null;
  return {
    sub: String(payload.sub),
    email,
    emailVerified: Boolean(payload.email_verified) || payload.email_verified === "true",
    // Apple sets this when the user chose "Hide my email" — we store the
    // relay address as-is so they can still receive transactional email.
    isPrivateRelay: Boolean(payload.is_private_email) || payload.is_private_email === "true",
  };
}
