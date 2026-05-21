import { randomBytes } from "crypto";
import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from "jose";

export const GOOGLE_CONFIGURED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Apple: we treat the OAuth flow as configured only when all four values
// are present AND the private key looks like a real PKCS#8 block. The
// task started with a placeholder APPLE_PRIVATE_KEY so we don't want the
// start endpoint to redirect users into a guaranteed failure.
export const APPLE_CONFIGURED = !!(
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_SERVICES_ID &&
  process.env.APPLE_PRIVATE_KEY &&
  /BEGIN PRIVATE KEY/.test(process.env.APPLE_PRIVATE_KEY)
);

export function randomState(): string {
  return randomBytes(24).toString("base64url");
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
  const pk = await importPKCS8(process.env.APPLE_PRIVATE_KEY!, "ES256");
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
