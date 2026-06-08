// Task #1766 — stateless, signed "preview pass" for the staged-launch review
// flow. An operator mints a pass for a specific album from the admin Share
// panel ("See Preview Flow"); the link carries it in the URL fragment
// (#previewpass=…), the client stashes it and attaches it as an
// `X-Preview-Pass` header on every request. The pass grants STAGING read of
// that one prepping release (so family reviewers see the real Preview &
// Purchase page before it's live) but NEVER allows a real charge — the
// checkout route rejects any request carrying a pass. No DB row, no session:
// the HMAC signature + embedded expiry are the whole token.
import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.SESSION_SECRET ?? "goodtunes-preview-pass-fallback-dev-key";
// 14 days is plenty for a family review window and keeps a leaked link from
// living forever.
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14;

export type PreviewPass = { albumId: string; mode: "review"; exp: number };

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64");
}

function signPayload(payloadB64: string): string {
  return b64url(createHmac("sha256", SECRET).update(payloadB64).digest());
}

export function signPreviewPass(
  albumId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const payload: PreviewPass = {
    albumId,
    mode: "review",
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadB64}.${signPayload(payloadB64)}`;
}

export function verifyPreviewPass(
  token: string | null | undefined,
): PreviewPass | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = signPayload(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      b64urlDecode(payloadB64).toString("utf8"),
    ) as PreviewPass;
    if (!payload?.albumId || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readPreviewPass(req: {
  headers: Record<string, any>;
}): PreviewPass | null {
  const h = req.headers?.["x-preview-pass"];
  const token = Array.isArray(h) ? h[0] : h;
  return verifyPreviewPass(typeof token === "string" ? token : null);
}
