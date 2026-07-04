// Task #1766 — signed "preview pass" for the staged / in-progress review flow.
// An operator (or the owning artist/label) hands out a link for a specific
// album; the link carries the pass in the URL fragment (#previewpass=…), the
// client stashes it and attaches it as an `X-Preview-Pass` header on every
// request. The pass grants STAGING read of that one release — at ANY stage
// (hidden work-in-progress, prepping, sunrise-pending) so artists/labels can
// watch progress and updates — but NEVER completes a real charge (the checkout
// route treats a forwarded grant as view-only).
//
// Two flavors share one HMAC envelope:
//   • Stateless (no `jti`): the operator "See Preview Flow" self-preview and
//     the /testing · /staging dry-runs. No DB row — the signature + embedded
//     expiry are the whole token. Behaves exactly as it always has.
//   • Stateful (`jti` = album_preview_grants.id): a handed-out grant. The
//     signature proves the link wasn't forged; the DB row is the authority for
//     REVOCATION and view tracking, so every read re-checks the row and a
//     revoked / expired grant stops working immediately.
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { albumPreviewGrants } from "@shared/schema";

const SECRET =
  process.env.SESSION_SECRET ?? "goodtunes-preview-pass-fallback-dev-key";
// 14 days is plenty for a family review window and keeps a leaked link from
// living forever. Stateful grants can also carry their own expiry (the DB
// row's expiresAt), enforced on top of this.
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14;
// Throttle view-stat writes so a reviewer refreshing the page doesn't inflate
// the count — one bump per grant per 5-minute window.
const VIEW_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

export type PreviewPass = {
  albumId: string;
  mode: "review";
  exp: number;
  // Present only on handed-out (stateful) grants. Stateless operator
  // self-previews omit it.
  jti?: string;
};

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
  opts: { ttlSeconds?: number; jti?: string } = {},
): string {
  const payload: PreviewPass = {
    albumId,
    mode: "review",
    exp: Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    ...(opts.jti ? { jti: opts.jti } : {}),
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

// Sync, signature-only read. Safe for the stateless (no-jti) fast path and
// kept for backward compatibility. Prefer `resolvePreviewPass` on any surface
// that must honor revocation of a handed-out grant.
export function readPreviewPass(req: {
  headers: Record<string, any>;
}): PreviewPass | null {
  const h = req.headers?.["x-preview-pass"];
  const token = Array.isArray(h) ? h[0] : h;
  return verifyPreviewPass(typeof token === "string" ? token : null);
}

// Async, revocation-aware read. Verifies the signature first (garbage never
// hits the DB), then — for a stateful grant (`jti` present) — re-checks the
// backing row: it must exist, still point at this album, not be revoked, and
// not be past the row's own expiry. A stateless pass (no `jti`) is returned
// unchanged. Returns null on any failure (never throws) so callers can treat
// "revoked" identically to "no pass" (falls back to public gating).
export async function resolvePreviewPass(req: {
  headers: Record<string, any>;
}): Promise<PreviewPass | null> {
  const pass = readPreviewPass(req);
  if (!pass) return null;
  if (!pass.jti) return pass; // stateless operator self-preview — unchanged
  try {
    const [grant] = await db
      .select({
        albumId: albumPreviewGrants.albumId,
        revokedAt: albumPreviewGrants.revokedAt,
        expiresAt: albumPreviewGrants.expiresAt,
      })
      .from(albumPreviewGrants)
      .where(eq(albumPreviewGrants.id, pass.jti));
    if (!grant) return null;
    if (grant.revokedAt) return null;
    if (grant.albumId !== pass.albumId) return null;
    if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) return null;
    return pass;
  } catch {
    // Fail closed for stateful grants: a DB hiccup must not silently keep a
    // possibly-revoked link alive.
    return null;
  }
}

// Best-effort, throttled view tracking for a stateful grant. Fire-and-forget:
// callers do not await, and this never throws. Bumps viewCount + lastViewedAt
// at most once per throttle window per grant.
export function touchPreviewGrant(jti: string | null | undefined): void {
  if (!jti) return;
  const cutoff = new Date(Date.now() - VIEW_TOUCH_THROTTLE_MS);
  void db
    .update(albumPreviewGrants)
    .set({
      viewCount: sql`${albumPreviewGrants.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(
      and(
        eq(albumPreviewGrants.id, jti),
        isNull(albumPreviewGrants.revokedAt),
        or(
          isNull(albumPreviewGrants.lastViewedAt),
          lt(albumPreviewGrants.lastViewedAt, cutoff),
        ),
      ),
    )
    .catch(() => {});
}
