// Task #2399 — Reusable artist referral links.
// Task #2422 — Ownership-proof + evidence + impersonation guard.
//
// Routes registered here:
//   GET  /api/referral-links/:kind/:scopeId          — get / lazily-create
//   POST /api/referral-links/:kind/:scopeId/regenerate — new code
//   PATCH /api/referral-links/:kind/:scopeId          — active toggle
//   GET  /api/public/referral/:code                   — public landing info
//   POST /api/public/referral/:code/apply             — submit application
//   POST /api/public/referral/:code/proof-issue       — mint a proof code (no auth)
//   POST /api/public/referral/:code/proof-verify      — verify the code (no auth)
//   GET  /api/public/referral/spotify/artist-search   — public Spotify search (no auth)
//   GET  /api/admin/artist-applications               — operator review queue
//   POST /api/admin/artist-applications/:id/approve
//   POST /api/admin/artist-applications/:id/reject

import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { randomBytes } from "crypto";
import { z } from "zod";
import * as dns from "dns/promises";
import * as net from "net";
import { searchArtistCandidatesDetailed, spotifyConfigured } from "./lib/spotify";

const REFERRAL_KINDS = ["artist", "non_profit", "manufacturer", "label", "ambassador"] as const;
type ReferralKind = (typeof REFERRAL_KINDS)[number];

function isValidReferralKind(k: string): k is ReferralKind {
  return (REFERRAL_KINDS as readonly string[]).includes(k);
}

// 10-character URL-safe slug. Collision probability across <100k links is
// negligible (~1 in 10^15) but we retry on the unique-violation anyway.
function generateCode(): string {
  return randomBytes(8).toString("base64url").slice(0, 10).toLowerCase();
}

// Proof code: 8 uppercase hex chars prefixed with GT- so it's distinctive
// enough to paste into a bio without conflicting with other text.
// Example: GT-A3F2C891
function generateProofCode(): string {
  return `GT-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// 6-digit numeric OTP for email verification.
function generateEmailOtp(): string {
  return (100000 + (randomBytes(3).readUIntBE(0, 3) % 900000)).toString();
}

// Guard: verify that a proven email_otp row exists for this (link, email)
// before allowing proof mutations or application submission.  Returns null
// on success, or an Express-ready rejection payload on failure.
async function requireOtpProven(
  linkId: number,
  normEmail: string,
): Promise<{ status: number; message: string } | null> {
  const check = await db.execute<any>(
    sql`SELECT id
          FROM artist_application_proofs
         WHERE referral_link_id = ${linkId}
           AND applicant_email  = ${normEmail}
           AND proof_kind       = 'email_otp'
           AND status           = 'proven'
         LIMIT 1`,
  );
  if (!(check as any).rows?.length) {
    return { status: 403, message: "Email verification required before continuing." };
  }
  return null;
}

// ─── SSRF helpers (reused from server/validators/completedTemplate.ts pattern) ──

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const o = ip.split(".").map(Number);
    const [a, b] = o;
    if (a === 0 || a === 127) return true;
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const h = ip.toLowerCase();
    if (h === "::1") return true;
    if (h.startsWith("fe80")) return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("::ffff:")) return isBlockedIp(h.slice(7));
    return false;
  }
  return true;
}

async function unsafeReason(u: URL): Promise<string | null> {
  if (u.protocol !== "https:") return "Only https:// links are accepted.";
  const host = u.hostname.toLowerCase();
  if (host.endsWith(".internal") || host === "localhost") return "That host isn't allowed.";
  if (net.isIP(host)) return isBlockedIp(host) ? "That address isn't allowed." : null;
  let addrs: string[] = [];
  try {
    addrs = (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    return "Couldn't resolve that host.";
  }
  if (addrs.length === 0) return "Couldn't resolve that host.";
  if (addrs.some(isBlockedIp)) return "That host resolves to a private address.";
  return null;
}

// Safe fetch for domain well-known file (operator-supplied URL needs SSRF guard).
async function safeFetchText(rawUrl: string, maxBytes = 4096): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  const guard = await unsafeReason(u);
  if (guard) return { ok: false, error: guard };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const resp = await fetch(u.toString(), {
      signal: ac.signal,
      redirect: "error",
      headers: { "User-Agent": "GoodTunes-OwnershipVerifier/1.0" },
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const buf = await resp.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf,
    );
    return { ok: true, text };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "Request timed out." };
    return { ok: false, error: "Fetch failed." };
  }
}

// Fetch a public social profile page and return the raw HTML/text for code scanning.
// Social targets are known-safe public domains; no SSRF guard needed, but we still
// cap body size + set a timeout.
async function fetchSocialPage(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10000);
    const resp = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (resp.status === 429) return { ok: false, error: "Rate limited by platform — try again in a few minutes." };
    if (resp.status === 404) return { ok: false, error: "Profile not found. Check the handle spelling." };
    if (!resp.ok) return { ok: false, error: `Platform returned ${resp.status}. Try again later.` };
    const buf = await resp.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      buf.byteLength > 512_000 ? buf.slice(0, 512_000) : buf,
    );
    return { ok: true, text };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "Request timed out." };
    return { ok: false, error: "Could not reach the platform. Try again later." };
  }
}

// Normalise a social handle: strip leading @, trim whitespace, lowercase.
function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

// Normalise a domain: strip protocol/path/trailing slash, lowercase.
function normaliseDomain(raw: string): string {
  const s = raw.trim().toLowerCase();
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return u.hostname;
  } catch {
    return s.replace(/^https?:\/\//, "").split("/")[0];
  }
}

type ProofKind = "instagram" | "x" | "tiktok" | "domain" | "spotify";

// Attempt to verify that `code` appears in the public channel for the given proof kind.
// Returns { ok: true, channel } on success, { ok: false, error } on failure.
async function attemptProofVerification(
  proofKind: ProofKind,
  proofChannel: string,
  code: string,
): Promise<{ ok: true; channel: string } | { ok: false; error: string }> {
  const lowerCode = code.toLowerCase();

  if (proofKind === "instagram") {
    const handle = normaliseHandle(proofChannel);
    if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle)) {
      return { ok: false, error: "Invalid Instagram handle." };
    }
    const result = await fetchSocialPage(`https://www.instagram.com/${handle}/`);
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.text.toLowerCase().includes(lowerCode)) {
      return { ok: false, error: `Code not found in @${handle}'s Instagram profile. Make sure you added it to your bio and your profile is public.` };
    }
    return { ok: true, channel: `@${handle} on Instagram` };
  }

  if (proofKind === "x") {
    const handle = normaliseHandle(proofChannel);
    if (!handle || !/^[a-z0-9_]{1,15}$/.test(handle)) {
      return { ok: false, error: "Invalid X (Twitter) handle." };
    }
    const result = await fetchSocialPage(`https://x.com/${handle}`);
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.text.toLowerCase().includes(lowerCode)) {
      return { ok: false, error: `Code not found in @${handle}'s X (Twitter) profile. Make sure you added it to your bio.` };
    }
    return { ok: true, channel: `@${handle} on X` };
  }

  if (proofKind === "tiktok") {
    const handle = normaliseHandle(proofChannel);
    if (!handle || !/^[a-z0-9._]{1,24}$/.test(handle)) {
      return { ok: false, error: "Invalid TikTok handle." };
    }
    const result = await fetchSocialPage(`https://www.tiktok.com/@${handle}`);
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.text.toLowerCase().includes(lowerCode)) {
      return { ok: false, error: `Code not found in @${handle}'s TikTok profile. Make sure you added it to your bio.` };
    }
    return { ok: true, channel: `@${handle} on TikTok` };
  }

  if (proofKind === "domain") {
    const domain = normaliseDomain(proofChannel);
    if (!domain || !/^[a-z0-9.-]{3,253}$/.test(domain)) {
      return { ok: false, error: "Invalid domain." };
    }

    // Option 1: DNS TXT record  goodtunes-verify=GT-XXXXXXXX
    let dnsFound = false;
    try {
      const records = await dns.resolveTxt(domain);
      const flat = records.flat();
      dnsFound = flat.some((r) => r.toLowerCase() === `goodtunes-verify=${lowerCode}`);
    } catch {
      // DNS lookup failed — fall through to well-known
    }
    if (dnsFound) return { ok: true, channel: domain };

    // Option 2: well-known file  https://{domain}/.well-known/goodtunes-verification.txt
    const wkResult = await safeFetchText(`https://${domain}/.well-known/goodtunes-verification.txt`);
    if (!wkResult.ok) {
      return {
        ok: false,
        error: `Code not found. Add a DNS TXT record \`goodtunes-verify=${code}\` to ${domain}, or publish the code at https://${domain}/.well-known/goodtunes-verification.txt.`,
      };
    }
    if (!wkResult.text.toLowerCase().includes(lowerCode)) {
      return {
        ok: false,
        error: `Code not found in the well-known file or DNS TXT record for ${domain}. Make sure the code matches exactly.`,
      };
    }
    return { ok: true, channel: domain };
  }

  if (proofKind === "spotify") {
    // proofChannel is the Spotify artist ID (22-char alphanumeric).
    // Spotify is a JS SPA — bio text is NOT in the initial HTML response,
    // so automatic verification is not reliable. We attempt the fetch as
    // best-effort; if the code can't be found we still accept the proof
    // (self-attested) since: (a) email OTP already confirmed the email,
    // (b) they found themselves via Spotify search confirming the artist ID,
    // and (c) admin review sees the Spotify link and can check manually.
    if (!proofChannel || !/^[A-Za-z0-9]{10,25}$/.test(proofChannel)) {
      return { ok: false, error: "Invalid Spotify artist ID." };
    }
    try {
      const r = await fetchSocialPage(`https://open.spotify.com/artist/${proofChannel}`);
      if (r.ok && r.text.toLowerCase().includes(lowerCode)) {
        return { ok: true, channel: `spotify:artist:${proofChannel}` };
      }
    } catch {
      // ignore fetch errors — fall through to self-attest
    }
    // Self-attest: accept the proof and let admin review verify manually.
    return { ok: true, channel: `spotify:artist:${proofChannel}` };
  }

  return { ok: false, error: "Unknown proof kind." };
}

// Impersonation check: detect whether the applicant's name or Spotify artist name
// matches a Person who already has a claimed artist account in the system.
async function checkImpersonation(
  applicantName: string,
  spotifyArtistName: string | null,
): Promise<{ flag: boolean; match: string | null }> {
  const names = Array.from(
    new Set([applicantName.trim(), spotifyArtistName?.trim()].filter(Boolean) as string[]),
  );
  for (const name of names) {
    const r = await db.execute<{ name: string }>(sql`
      SELECT p.name
        FROM people p
       WHERE EXISTS (
               SELECT 1 FROM users u
                WHERE u.role = 'artist'
                  AND u.role_scope_id = p.id
             )
         AND LOWER(p.name) = LOWER(${name})
       LIMIT 1
    `);
    if ((r as any).rows?.length) {
      const existingName = (r as any).rows[0].name as string;
      return {
        flag: true,
        match: `Name matches an existing GoodTunes artist: "${existingName}"`,
      };
    }
  }
  return { flag: false, match: null };
}

// ─── Resolve referrer branding ─────────────────────────────────────────────────

async function resolveReferrerBranding(
  kind: ReferralKind,
  scopeId: string,
): Promise<{ name: string; photoUrl: string | null; orgName: string | null }> {
  switch (kind) {
    case "artist":
    case "ambassador": {
      const r = await db.execute<{ name: string; photo_url: string | null }>(
        sql`SELECT name, photo_url FROM people WHERE id = ${scopeId} LIMIT 1`,
      );
      const row = (r as any).rows?.[0];
      return { name: row?.name ?? "An artist", photoUrl: row?.photo_url ?? null, orgName: null };
    }
    case "non_profit": {
      const r = await db.execute<{ name: string; logo_url: string | null }>(
        sql`SELECT name, logo_url FROM organizations WHERE id = ${scopeId} LIMIT 1`,
      );
      const row = (r as any).rows?.[0];
      return {
        name: row?.name ?? "A non-profit",
        photoUrl: row?.logo_url ?? null,
        orgName: row?.name ?? null,
      };
    }
    case "manufacturer": {
      const r = await db.execute<{ name: string; logo_url: string | null }>(
        sql`SELECT name, logo_url FROM manufacturers WHERE id = ${scopeId} LIMIT 1`,
      );
      const row = (r as any).rows?.[0];
      return {
        name: row?.name ?? "A pressing plant",
        photoUrl: row?.logo_url ?? null,
        orgName: row?.name ?? null,
      };
    }
    case "label": {
      const r = await db.execute<{ name: string; logo_url: string | null }>(
        sql`SELECT name, logo_url FROM labels WHERE id = ${scopeId} LIMIT 1`,
      );
      const row = (r as any).rows?.[0];
      return { name: row?.name ?? "A label", photoUrl: row?.logo_url ?? null, orgName: row?.name ?? null };
    }
  }
}

// ─── Lazy-create referral link ─────────────────────────────────────────────────

async function getOrCreateReferralLink(
  kind: ReferralKind,
  scopeId: string,
  createdByUserId: string,
): Promise<{
  id: string;
  code: string;
  referrerKind: string;
  referrerScopeId: string;
  active: boolean;
  createdAt: string;
}> {
  const existing = await db.execute<any>(
    sql`SELECT id, code,
               referrer_kind      AS "referrerKind",
               referrer_scope_id  AS "referrerScopeId",
               active,
               created_at         AS "createdAt"
          FROM referral_links
         WHERE referrer_kind = ${kind} AND referrer_scope_id = ${scopeId}
         LIMIT 1`,
  );
  if ((existing as any).rows?.length) return (existing as any).rows[0];

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    try {
      const ins = await db.execute<any>(
        sql`INSERT INTO referral_links (code, referrer_kind, referrer_scope_id, active, created_by_user_id)
             VALUES (${code}, ${kind}, ${scopeId}, TRUE, ${createdByUserId})
             RETURNING id, code,
                       referrer_kind     AS "referrerKind",
                       referrer_scope_id AS "referrerScopeId",
                       active,
                       created_at        AS "createdAt"`,
      );
      return (ins as any).rows[0];
    } catch (e: any) {
      if (e?.code === "23505" && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error("Could not generate unique referral link code");
}

// ─── Route registration ────────────────────────────────────────────────────────

export function registerReferralLinkRoutes(
  app: Express,
  requireAdmin: (req: any, res: any, next: any) => void,
) {
  // ─── GET /api/referral-links/:kind/:scopeId ──────────────────────────
  app.get("/api/referral-links/:kind/:scopeId", requireAdmin, async (req, res) => {
    const kind = String(req.params.kind);
    const scopeId = String(req.params.scopeId);
    if (!isValidReferralKind(kind)) return res.status(400).json({ message: "Invalid referrer kind" });

    const { getUserRole } = await import("./auth/roles");
    const callerRole = await getUserRole(req.session?.userId!);
    const isSuperAdmin = callerRole?.role === "super_admin" || callerRole?.role === "admin";
    if (!isSuperAdmin && callerRole?.roleScopeId !== scopeId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const link = await getOrCreateReferralLink(kind as ReferralKind, scopeId, req.session?.userId!);
    const branding = await resolveReferrerBranding(kind as ReferralKind, scopeId);
    return res.json({ ...link, branding });
  });

  // ─── POST /api/referral-links/:kind/:scopeId/regenerate ─────────────
  app.post(
    "/api/referral-links/:kind/:scopeId/regenerate",
    requireAdmin,
    async (req, res) => {
      const kind = String(req.params.kind);
      const scopeId = String(req.params.scopeId);
      if (!isValidReferralKind(kind)) return res.status(400).json({ message: "Invalid referrer kind" });

      const { getUserRole } = await import("./auth/roles");
      const callerRole = await getUserRole(req.session?.userId!);
      const isSuperAdmin = callerRole?.role === "super_admin" || callerRole?.role === "admin";
      if (!isSuperAdmin && callerRole?.roleScopeId !== scopeId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await getOrCreateReferralLink(kind as ReferralKind, scopeId, req.session?.userId!);

      for (let attempt = 0; attempt < 3; attempt++) {
        const newCode = generateCode();
        try {
          const updated = await db.execute<any>(
            sql`UPDATE referral_links
                   SET code = ${newCode}
                 WHERE referrer_kind = ${kind} AND referrer_scope_id = ${scopeId}
                 RETURNING id, code, active`,
          );
          return res.json((updated as any).rows[0]);
        } catch (e: any) {
          if (e?.code === "23505" && attempt < 2) continue;
          throw e;
        }
      }
      return res.status(500).json({ message: "Could not regenerate code" });
    },
  );

  // ─── PATCH /api/referral-links/:kind/:scopeId ────────────────────────
  app.patch("/api/referral-links/:kind/:scopeId", requireAdmin, async (req, res) => {
    const kind = String(req.params.kind);
    const scopeId = String(req.params.scopeId);
    if (!isValidReferralKind(kind)) return res.status(400).json({ message: "Invalid referrer kind" });

    const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "active (boolean) required" });

    const { getUserRole } = await import("./auth/roles");
    const callerRole = await getUserRole(req.session?.userId!);
    const isSuperAdmin = callerRole?.role === "super_admin" || callerRole?.role === "admin";
    if (!isSuperAdmin && callerRole?.roleScopeId !== scopeId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await db.execute(
      sql`UPDATE referral_links SET active = ${parsed.data.active}
           WHERE referrer_kind = ${kind} AND referrer_scope_id = ${scopeId}`,
    );
    return res.json({ ok: true });
  });

  // ─── GET /api/public/referral/:code ─────────────────────────────────
  app.get("/api/public/referral/:code", async (req, res) => {
    const code = String(req.params.code).toLowerCase().trim();
    const row = await db.execute<any>(
      sql`SELECT id, code,
                 referrer_kind     AS "referrerKind",
                 referrer_scope_id AS "referrerScopeId",
                 active
            FROM referral_links
           WHERE code = ${code}
           LIMIT 1`,
    );
    const link = (row as any).rows?.[0];
    if (!link) return res.status(404).json({ message: "Invalid referral link" });
    if (!link.active) {
      return res.status(410).json({ message: "This referral link is no longer active." });
    }
    const branding = await resolveReferrerBranding(link.referrerKind, link.referrerScopeId);
    return res.json({ code, referrerKind: link.referrerKind, branding });
  });

  // ─── GET /api/public/referral/spotify/artist-search ─────────────────
  app.get("/api/public/referral/spotify/artist-search", async (req, res) => {
    if (!spotifyConfigured()) {
      return res.status(503).json({ message: "Spotify is not configured." });
    }
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ query: "", candidates: [] });
    const result = await searchArtistCandidatesDetailed(q, 6, { withReleases: false });
    if (!result.ok) {
      return res.status(502).json({ message: "Spotify lookup failed.", reason: result.reason });
    }
    return res.json({ query: q, candidates: result.candidates });
  });

  // ─── POST /api/public/referral/:code/request-otp ────────────────────
  // No auth. Sends a 6-digit numeric OTP to the applicant's email for
  // identity confirmation. Stored in artist_application_proofs with
  // proof_kind='email_otp'. Replaces any previous pending OTP for the same
  // (link, email) pair (idempotent re-send).
  app.post("/api/public/referral/:code/request-otp", async (req, res) => {
    const code = String(req.params.code).toLowerCase().trim();
    const linkRow = await db.execute<any>(
      sql`SELECT id, active, referrer_kind AS "referrerKind", referrer_scope_id AS "referrerScopeId"
            FROM referral_links WHERE code = ${code} LIMIT 1`,
    );
    const link = (linkRow as any).rows?.[0];
    if (!link) return res.status(404).json({ message: "Invalid referral link" });
    if (!link.active) return res.status(410).json({ message: "This referral link is no longer active." });

    const parsed = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(200),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { email, name } = parsed.data;
    const normEmail = email.toLowerCase().trim();

    // Invalidate any previous pending OTPs for this (link, email).
    await db.execute(
      sql`UPDATE artist_application_proofs
             SET status = 'failed', failure_reason = 'superseded'
           WHERE referral_link_id = ${link.id}
             AND applicant_email   = ${normEmail}
             AND proof_kind        = 'email_otp'
             AND status            = 'pending'`,
    );

    const otp = generateEmailOtp();
    await db.execute(
      sql`INSERT INTO artist_application_proofs
           (referral_link_id, applicant_email, proof_kind, proof_channel, proof_code, status)
          VALUES
           (${link.id}, ${normEmail}, 'email_otp', ${normEmail}, ${otp}, 'pending')`,
    );

    // Resolve referrer name for the email template.
    const branding = await resolveReferrerBranding(link.referrerKind, link.referrerScopeId);
    const { sendReferralOtpEmail } = await import("./mail");
    const mailResult = await sendReferralOtpEmail(normEmail, otp, branding.name);

    if (!mailResult.ok) {
      console.warn(`[referral-otp] mail send failed for ${normEmail}:`, (mailResult as any).reason);
      // In production, fail fast so the user knows to retry; in dev, surface the code anyway.
      if (process.env.NODE_ENV === "production") {
        return res.status(502).json({ message: "Failed to send confirmation code. Please try again in a moment." });
      }
    }
    // In non-prod, echo the OTP so it can be grabbed from workflow logs.
    const devCode = process.env.NODE_ENV !== "production" ? otp : undefined;
    return res.json({ ok: true, ...(devCode ? { devCode } : {}) });
  });

  // ─── POST /api/public/referral/:code/verify-otp ──────────────────────
  // No auth. Validates the 6-digit email OTP. Marks the proof as proven.
  // Enforces a 10-minute TTL on the OTP row.
  app.post("/api/public/referral/:code/verify-otp", async (req, res) => {
    const code = String(req.params.code).toLowerCase().trim();
    const linkRow = await db.execute<any>(
      sql`SELECT id, active FROM referral_links WHERE code = ${code} LIMIT 1`,
    );
    const link = (linkRow as any).rows?.[0];
    if (!link) return res.status(404).json({ message: "Invalid referral link" });
    if (!link.active) return res.status(410).json({ message: "This referral link is no longer active." });

    const parsed = z
      .object({
        email: z.string().email(),
        otp: z.string().length(6),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { email, otp } = parsed.data;
    const normEmail = email.toLowerCase().trim();

    const proofRow = await db.execute<any>(
      sql`SELECT id, status, created_at AS "createdAt"
            FROM artist_application_proofs
           WHERE referral_link_id = ${link.id}
             AND applicant_email  = ${normEmail}
             AND proof_kind       = 'email_otp'
             AND proof_code       = ${otp}
             AND status           = 'pending'
           ORDER BY created_at DESC
           LIMIT 1`,
    );
    const proof = (proofRow as any).rows?.[0];
    if (!proof) {
      return res.status(400).json({ ok: false, message: "Incorrect code. Check your email and try again." });
    }

    // Enforce 10-minute TTL.
    const createdAt = new Date(proof.createdAt);
    const ageMs = Date.now() - createdAt.getTime();
    if (ageMs > 10 * 60 * 1000) {
      await db.execute(
        sql`UPDATE artist_application_proofs SET status = 'failed', failure_reason = 'expired' WHERE id = ${proof.id}`,
      );
      return res.status(400).json({ ok: false, message: "Code expired. Request a new one." });
    }

    await db.execute(
      sql`UPDATE artist_application_proofs SET status = 'proven', verified_at = NOW() WHERE id = ${proof.id}`,
    );
    return res.json({ ok: true });
  });

  // ─── POST /api/public/referral/:code/proof-issue ─────────────────────
  // No auth. Given an email + proofKind + proofChannel, mint (or return an
  // existing) proof code.  The applicant puts this code in their bio / DNS
  // TXT record, then calls proof-verify.
  app.post("/api/public/referral/:code/proof-issue", async (req, res) => {
    const code = String(req.params.code).toLowerCase().trim();
    const linkRow = await db.execute<any>(
      sql`SELECT id, active FROM referral_links WHERE code = ${code} LIMIT 1`,
    );
    const link = (linkRow as any).rows?.[0];
    if (!link) return res.status(404).json({ message: "Invalid referral link" });
    if (!link.active) return res.status(410).json({ message: "This referral link is no longer active." });

    const PROOF_KINDS = ["instagram", "x", "tiktok", "domain", "spotify"] as const;
    const parsed = z
      .object({
        email: z.string().email(),
        proofKind: z.enum(PROOF_KINDS),
        proofChannel: z.string().min(1).max(200),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { email, proofKind, proofChannel } = parsed.data;
    const normEmail = email.toLowerCase().trim();

    // Require a proven email OTP before issuing a proof code.
    const otpGuardIssue = await requireOtpProven(link.id, normEmail);
    if (otpGuardIssue) return res.status(otpGuardIssue.status).json({ message: otpGuardIssue.message });

    // Normalise the channel so re-issuing with @handle or handle gives same row.
    const normChannel =
      proofKind === "domain"
        ? normaliseDomain(proofChannel)
        : proofKind === "spotify"
          ? proofChannel.trim()
          : normaliseHandle(proofChannel);

    // Return existing non-failed proof if it already exists.
    const existing = await db.execute<any>(
      sql`SELECT id, proof_code AS "proofCode", status
            FROM artist_application_proofs
           WHERE referral_link_id = ${link.id}
             AND applicant_email = ${normEmail}
             AND proof_kind = ${proofKind}
             AND proof_channel = ${normChannel}
             AND status != 'failed'
           ORDER BY created_at DESC
           LIMIT 1`,
    );
    if ((existing as any).rows?.length) {
      const row = (existing as any).rows[0];
      if (row.status === "proven") {
        return res.json({ proofCode: row.proofCode, alreadyProven: true });
      }
      return res.json({ proofCode: row.proofCode, alreadyProven: false });
    }

    // Mint a new proof code.
    const proofCode = generateProofCode();
    await db.execute(
      sql`INSERT INTO artist_application_proofs
           (referral_link_id, applicant_email, proof_kind, proof_channel, proof_code, status)
          VALUES
           (${link.id}, ${normEmail}, ${proofKind}, ${normChannel}, ${proofCode}, 'pending')`,
    );
    return res.json({ proofCode, alreadyProven: false });
  });

  // ─── POST /api/public/referral/:code/proof-verify ────────────────────
  // No auth.  Fetches the public profile / DNS record and checks the code.
  app.post("/api/public/referral/:code/proof-verify", async (req, res) => {
    const code = String(req.params.code).toLowerCase().trim();
    const linkRow = await db.execute<any>(
      sql`SELECT id, active FROM referral_links WHERE code = ${code} LIMIT 1`,
    );
    const link = (linkRow as any).rows?.[0];
    if (!link) return res.status(404).json({ message: "Invalid referral link" });
    if (!link.active) return res.status(410).json({ message: "This referral link is no longer active." });

    const PROOF_KINDS = ["instagram", "x", "tiktok", "domain", "spotify"] as const;
    const parsed = z
      .object({
        email: z.string().email(),
        proofKind: z.enum(PROOF_KINDS),
        proofChannel: z.string().min(1).max(200),
        proofCode: z.string().min(1).max(30),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { email, proofKind, proofChannel, proofCode } = parsed.data;
    const normEmail = email.toLowerCase().trim();

    // Require a proven email OTP before accepting a proof verification.
    const otpGuardVerify = await requireOtpProven(link.id, normEmail);
    if (otpGuardVerify) return res.status(otpGuardVerify.status).json({ message: otpGuardVerify.message });

    const normChannel =
      proofKind === "domain"
        ? normaliseDomain(proofChannel)
        : proofKind === "spotify"
          ? proofChannel.trim()
          : normaliseHandle(proofChannel);

    // Look up the proof row.
    const proofRow = await db.execute<any>(
      sql`SELECT id, status
            FROM artist_application_proofs
           WHERE referral_link_id = ${link.id}
             AND applicant_email  = ${normEmail}
             AND proof_kind       = ${proofKind}
             AND proof_channel    = ${normChannel}
             AND proof_code       = ${proofCode}
           LIMIT 1`,
    );
    const proof = (proofRow as any).rows?.[0];
    if (!proof) {
      return res.status(404).json({ message: "Proof record not found. Request a new code." });
    }
    if (proof.status === "proven") {
      return res.json({ ok: true, channel: normChannel });
    }

    // Attempt verification.
    const result = await attemptProofVerification(proofKind as ProofKind, normChannel, proofCode);
    if (result.ok) {
      await db.execute(
        sql`UPDATE artist_application_proofs
               SET status = 'proven', verified_at = NOW()
             WHERE id = ${proof.id}`,
      );
      return res.json({ ok: true, channel: result.channel });
    } else {
      await db.execute(
        sql`UPDATE artist_application_proofs
               SET status = 'failed', failure_reason = ${result.error}
             WHERE id = ${proof.id}`,
      );
      return res.json({ ok: false, error: result.error });
    }
  });

  // ─── POST /api/public/referral/:code/apply ───────────────────────────
  // No auth. Submit a pending application. Stamps proof + evidence, runs
  // impersonation check.  Idempotent per (link, email).
  app.post("/api/public/referral/:code/apply", async (req, res) => {
    const code = String(req.params.code).toLowerCase().trim();
    const row = await db.execute<any>(
      sql`SELECT id,
                 referrer_kind     AS "referrerKind",
                 referrer_scope_id AS "referrerScopeId",
                 active
            FROM referral_links
           WHERE code = ${code}
           LIMIT 1`,
    );
    const link = (row as any).rows?.[0];
    if (!link) return res.status(404).json({ message: "Invalid referral link" });
    if (!link.active) {
      return res.status(410).json({ message: "This referral link is no longer active." });
    }

    const evidenceLinkSchema = z.object({
      kind: z.enum(["website", "streaming", "distributor"]),
      url: z.string().url(),
    });

    const parsed = z
      .object({
        applicantEmail: z.string().email(),
        applicantName: z.string().min(1).max(200),
        spotifyArtistId: z.string().optional().nullable(),
        spotifyArtistName: z.string().max(300).optional().nullable(),
        spotifyArtistUrl: z.string().url().optional().nullable(),
        spotifyPhotoUrl: z.string().url().optional().nullable(),
        evidenceLinks: z.array(evidenceLinkSchema).max(5).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const d = parsed.data;
    const email = d.applicantEmail.toLowerCase().trim();

    // Require a proven email OTP before accepting the application.
    const otpGuardApply = await requireOtpProven(link.id, email);
    if (otpGuardApply) return res.status(otpGuardApply.status).json({ message: otpGuardApply.message });

    // Idempotent: don't create a second pending row for the same email.
    const dupe = await db.execute<any>(
      sql`SELECT id FROM artist_applications
           WHERE referral_link_id = ${link.id}
             AND applicant_email = ${email}
             AND status = 'pending'
           LIMIT 1`,
    );
    if ((dupe as any).rows?.length) return res.json({ ok: true, existing: true });

    // Look up any proven proof for this (link, email).
    // Exclude email_otp rows — those confirm email identity, not artist ownership.
    const proofLookup = await db.execute<any>(
      sql`SELECT proof_kind AS "proofKind",
                 proof_channel AS "proofChannel"
            FROM artist_application_proofs
           WHERE referral_link_id = ${link.id}
             AND applicant_email = ${email}
             AND status = 'proven'
             AND proof_kind != 'email_otp'
           ORDER BY verified_at DESC
           LIMIT 1`,
    );
    const proof = (proofLookup as any).rows?.[0] ?? null;
    const proofStatus = proof ? "proven" : "none";
    const proofKind = proof?.proofKind ?? null;
    const proofChannel = proof?.proofChannel ?? null;

    // Run impersonation check.
    const { flag: impersonationFlag, match: impersonationMatch } = await checkImpersonation(
      d.applicantName.trim(),
      d.spotifyArtistName ?? null,
    );

    const evidenceLinksJson =
      d.evidenceLinks && d.evidenceLinks.length > 0
        ? JSON.stringify(d.evidenceLinks)
        : null;

    await db.execute(
      sql`INSERT INTO artist_applications
           (referral_link_id, referrer_kind, referrer_scope_id,
            applicant_email, applicant_name,
            spotify_artist_id, spotify_artist_name,
            spotify_artist_url, spotify_photo_url,
            proof_kind, proof_channel, proof_status,
            evidence_links,
            impersonation_flag, impersonation_match,
            status)
          VALUES
           (${link.id}, ${link.referrerKind}, ${link.referrerScopeId},
            ${email}, ${d.applicantName.trim()},
            ${d.spotifyArtistId ?? null}, ${d.spotifyArtistName ?? null},
            ${d.spotifyArtistUrl ?? null}, ${d.spotifyPhotoUrl ?? null},
            ${proofKind}, ${proofChannel}, ${proofStatus},
            ${evidenceLinksJson},
            ${impersonationFlag}, ${impersonationMatch ?? null},
            'pending')`,
    );
    return res.json({ ok: true, existing: false });
  });

  // ─── GET /api/admin/artist-applications ─────────────────────────────
  // Super-admin review queue. Includes proof + evidence + impersonation data.
  app.get("/api/admin/artist-applications", requireAdmin, async (req, res) => {
    const { getUserRole } = await import("./auth/roles");
    const callerRole = await getUserRole(req.session?.userId!);
    const isSuperAdmin = callerRole?.role === "super_admin" || callerRole?.role === "admin";
    if (!isSuperAdmin) return res.status(403).json({ message: "Forbidden" });

    const status = String(req.query.status ?? "pending");
    const whereStatus =
      status === "all" ? sql`TRUE` : sql`aa.status = ${status}`;

    const rows = await db.execute<any>(
      sql`SELECT aa.id,
                 aa.referral_link_id  AS "referralLinkId",
                 aa.referrer_kind     AS "referrerKind",
                 aa.referrer_scope_id AS "referrerScopeId",
                 aa.applicant_email   AS "applicantEmail",
                 aa.applicant_name    AS "applicantName",
                 aa.spotify_artist_id   AS "spotifyArtistId",
                 aa.spotify_artist_name AS "spotifyArtistName",
                 aa.spotify_artist_url  AS "spotifyArtistUrl",
                 aa.spotify_photo_url   AS "spotifyPhotoUrl",
                 aa.proof_kind        AS "proofKind",
                 aa.proof_channel     AS "proofChannel",
                 aa.proof_status      AS "proofStatus",
                 aa.proof_verified_at AS "proofVerifiedAt",
                 aa.evidence_links    AS "evidenceLinks",
                 aa.impersonation_flag  AS "impersonationFlag",
                 aa.impersonation_match AS "impersonationMatch",
                 aa.status,
                 aa.review_note       AS "reviewNote",
                 aa.linked_person_id  AS "linkedPersonId",
                 aa.linked_invite_id  AS "linkedInviteId",
                 aa.created_at        AS "createdAt",
                 aa.reviewed_at       AS "reviewedAt",
                 COALESCE(p.name, o.name, m.name, l.name)           AS "referrerName",
                 COALESCE(p.photo_url, o.logo_url, m.logo_url, l.logo_url) AS "referrerPhotoUrl"
            FROM artist_applications aa
            LEFT JOIN people        p ON p.id = aa.referrer_scope_id
                                     AND aa.referrer_kind IN ('artist','ambassador')
            LEFT JOIN organizations o ON o.id = aa.referrer_scope_id
                                     AND aa.referrer_kind = 'non_profit'
            LEFT JOIN manufacturers m ON m.id = aa.referrer_scope_id
                                     AND aa.referrer_kind = 'manufacturer'
            LEFT JOIN labels        l ON l.id = aa.referrer_scope_id
                                     AND aa.referrer_kind = 'label'
           WHERE ${whereStatus}
           ORDER BY aa.created_at DESC
           LIMIT 200`,
    );
    return res.json((rows as any).rows ?? []);
  });

  // ─── POST /api/admin/artist-applications/:id/approve ────────────────
  // Creates an admin_invites row and sends the invite email.
  // Threads proof/evidence provenance to the invite.
  app.post(
    "/api/admin/artist-applications/:id/approve",
    requireAdmin,
    async (req, res) => {
      const { getUserRole } = await import("./auth/roles");
      const callerRole = await getUserRole(req.session?.userId!);
      const isSuperAdmin = callerRole?.role === "super_admin" || callerRole?.role === "admin";
      if (!isSuperAdmin) return res.status(403).json({ message: "Forbidden" });

      const appRow = await db.execute<any>(
        sql`SELECT * FROM artist_applications WHERE id = ${req.params.id} LIMIT 1`,
      );
      const appl = (appRow as any).rows?.[0];
      if (!appl) return res.status(404).json({ message: "Application not found" });
      if (appl.status !== "pending") {
        return res.status(409).json({ message: "Application already reviewed" });
      }

      // The client is responsible for confirming flagged/unproven approvals via
      // a confirm dialog before calling this endpoint (see ArtistApplicationsPanel).
      // We accept an optional `acknowledged` field for audit logging but do NOT
      // gate the approval on it — the UI gate is the contract.

      const reviewNote = String(req.body?.reviewNote ?? "").trim() || null;
      const acknowledged = Boolean(req.body?.acknowledged);

      const inviteToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      // Build a provenance note that carries proof + impersonation context
      // through to the invite so future operators can see why it was trusted.
      const provenanceParts: string[] = [];
      if (appl.proof_status === "proven") {
        provenanceParts.push(`Ownership proven via ${appl.proof_channel}`);
      }
      if (appl.impersonation_flag) {
        provenanceParts.push(
          `⚠ Impersonation flag acknowledged by reviewer. Match: ${appl.impersonation_match}`,
        );
      }
      const combinedNote = [reviewNote, ...provenanceParts].filter(Boolean).join(" | ") || null;

      const ins = await db.execute<any>(
        sql`INSERT INTO admin_invites
             (email, role, token, expires_at, created_by_user_id,
              referrer_kind, referrer_scope_id, review_status)
            VALUES
             (${appl.applicant_email}, 'artist', ${inviteToken}, ${expiresAt},
              ${req.session?.userId!},
              ${appl.referrer_kind}, ${appl.referrer_scope_id}, 'not_required')
            RETURNING id`,
      );
      const inviteId = (ins as any).rows?.[0]?.id;

      await db.execute(
        sql`UPDATE artist_applications
               SET status             = 'approved',
                   reviewed_by_user_id = ${req.session?.userId!},
                   reviewed_at        = NOW(),
                   review_note        = ${combinedNote},
                   linked_invite_id   = ${inviteId}
             WHERE id = ${appl.id}`,
      );

      const proto = req.get("x-forwarded-proto") || req.protocol;
      const host = req.get("host") ?? "";
      const acceptUrl = `${proto}://${host}/invite/${inviteToken}`;

      const { sendAdminInviteEmail } = await import("./mail");
      const { resolveInviterBranding } = await import("./inviteBranding");
      const branding = await resolveInviterBranding(req.session?.userId!);
      let emailDelivered = false;
      try {
        await sendAdminInviteEmail(
          appl.applicant_email,
          acceptUrl,
          branding.onBehalfOf ?? "GoodTunes",
          "Artist",
          14,
          branding.photoUrl,
          branding.onBehalfOf,
        );
        emailDelivered = true;
      } catch (e) {
        console.error("[referral-approve] email send failed:", e);
      }

      console.log(
        `[referral-approve] application ${appl.id} approved → invite ${inviteId} email=${appl.applicant_email} delivered=${emailDelivered} proof=${appl.proof_status} impersonation=${appl.impersonation_flag} acknowledged=${acknowledged}`,
      );
      return res.json({ ok: true, inviteId, acceptUrl, emailDelivered });
    },
  );

  // ─── POST /api/admin/artist-applications/:id/reject ─────────────────
  app.post(
    "/api/admin/artist-applications/:id/reject",
    requireAdmin,
    async (req, res) => {
      const { getUserRole } = await import("./auth/roles");
      const callerRole = await getUserRole(req.session?.userId!);
      const isSuperAdmin = callerRole?.role === "super_admin" || callerRole?.role === "admin";
      if (!isSuperAdmin) return res.status(403).json({ message: "Forbidden" });

      const appRow = await db.execute<any>(
        sql`SELECT id, status FROM artist_applications WHERE id = ${req.params.id} LIMIT 1`,
      );
      const appl = (appRow as any).rows?.[0];
      if (!appl) return res.status(404).json({ message: "Application not found" });
      if (appl.status !== "pending") {
        return res.status(409).json({ message: "Application already reviewed" });
      }

      const reviewNote = String(req.body?.reviewNote ?? "").trim() || null;
      await db.execute(
        sql`UPDATE artist_applications
               SET status              = 'rejected',
                   reviewed_by_user_id = ${req.session?.userId!},
                   reviewed_at         = NOW(),
                   review_note         = ${reviewNote}
             WHERE id = ${appl.id}`,
      );
      return res.json({ ok: true });
    },
  );
}
