// Task #2399 — Reusable artist referral links.
//
// Each entity (press, NPO, label, artist/ambassador) gets one durable,
// reusable link they can post anywhere. Opening /join/:code lands on a
// branded gated-signup page; submissions queue in artist_applications for
// super-admin review before an invite email goes out.
//
// Routes registered here:
//   GET  /api/referral-links/:kind/:scopeId          — get / lazily-create
//   POST /api/referral-links/:kind/:scopeId/regenerate — new code
//   PATCH /api/referral-links/:kind/:scopeId          — active toggle
//   GET  /api/public/referral/:code                   — public landing info
//   POST /api/public/referral/:code/apply             — submit application
//   GET  /api/public/referral/spotify/artist-search   — public Spotify search (no auth)
//   GET  /api/admin/artist-applications               — operator review queue
//   POST /api/admin/artist-applications/:id/approve
//   POST /api/admin/artist-applications/:id/reject

import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { randomBytes } from "crypto";
import { z } from "zod";
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

// Resolve display name + photo for the referrer entity. Used by the public
// landing endpoint so no server data can leak beyond name + logo.
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

// Lazily create the entity's referral link row on first access. One row per
// (referrer_kind, referrer_scope_id) is the invariant we maintain: the GET
// handler does a SELECT first; only the INSERT path can race, so we retry on
// unique_violation for the code column (astronomically unlikely).
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
      // 23505 = unique_violation on code — retry with a new code.
      if (e?.code === "23505" && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error("Could not generate unique referral link code");
}

export function registerReferralLinkRoutes(
  app: Express,
  requireAdmin: (req: any, res: any, next: any) => void,
) {
  // ─── GET /api/referral-links/:kind/:scopeId ──────────────────────────
  // Fetch (or lazily mint) the entity's referral link. Partners can only
  // read their own link; super-admins can read any.
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
  // Regenerate the code. The old URL immediately stops resolving.
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

      // Ensure the row exists before we try to UPDATE it.
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
  // Enable or disable the link.
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
  // No auth. Returns entity branding for the public landing page.
  // Intentionally minimal: name + logo, referrer kind label. No PII.
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
  // No auth. Public Spotify artist search for the /join/:code landing page.
  // Reuses the same helper as the admin artist-search route but skips
  // the requireAdmin guard so applicants can self-identify without an account.
  // Rate-limited only by Spotify's own token budget; no applicant PII is stored.
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

  // ─── POST /api/public/referral/:code/apply ───────────────────────────
  // No auth. Submit a pending application. If a pending application from
  // the same email already exists for this link we return ok without
  // creating a duplicate (idempotent).
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

    const parsed = z
      .object({
        applicantEmail: z.string().email(),
        applicantName: z.string().min(1).max(200),
        spotifyArtistId: z.string().optional().nullable(),
        spotifyArtistName: z.string().max(300).optional().nullable(),
        spotifyArtistUrl: z.string().url().optional().nullable(),
        spotifyPhotoUrl: z.string().url().optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const d = parsed.data;
    const email = d.applicantEmail.toLowerCase().trim();

    // Idempotent: don't create a second pending row for the same email.
    const dupe = await db.execute<any>(
      sql`SELECT id FROM artist_applications
           WHERE referral_link_id = ${link.id}
             AND applicant_email = ${email}
             AND status = 'pending'
           LIMIT 1`,
    );
    if ((dupe as any).rows?.length) return res.json({ ok: true, existing: true });

    await db.execute(
      sql`INSERT INTO artist_applications
           (referral_link_id, referrer_kind, referrer_scope_id,
            applicant_email, applicant_name,
            spotify_artist_id, spotify_artist_name,
            spotify_artist_url, spotify_photo_url,
            status)
          VALUES
           (${link.id}, ${link.referrerKind}, ${link.referrerScopeId},
            ${email}, ${d.applicantName.trim()},
            ${d.spotifyArtistId ?? null}, ${d.spotifyArtistName ?? null},
            ${d.spotifyArtistUrl ?? null}, ${d.spotifyPhotoUrl ?? null},
            'pending')`,
    );
    return res.json({ ok: true, existing: false });
  });

  // ─── GET /api/admin/artist-applications ─────────────────────────────
  // Super-admin review queue. Query param: ?status=pending|approved|rejected|all
  // (defaults pending). Joined with referrer entity tables for display names.
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
  // Creates an admin_invites row with the referrer attribution stamped and
  // sends the standard invite email. The full provisioning machinery in
  // applyAdminInviteGrant runs when the artist clicks the link.
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

      const reviewNote = String(req.body?.reviewNote ?? "").trim() || null;
      const inviteToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      // Mint the invite row with referrer attribution so the accept-time
      // provisioning machinery stamps referredByPersonId / referredByOrgId
      // exactly as it does for a directly-sent email invite.
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
                   review_note        = ${reviewNote},
                   linked_invite_id   = ${inviteId}
             WHERE id = ${appl.id}`,
      );

      // Determine the accept URL. Use the same origin the request came in on
      // so dev and prod each get their own working links.
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
        `[referral-approve] application ${appl.id} approved → invite ${inviteId} email=${appl.applicant_email} delivered=${emailDelivered}`,
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
