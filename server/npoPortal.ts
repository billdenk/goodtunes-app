// Task #545 — Non-profit portal: ambassador / staff / artist invites.
//
// Mirrors the press portal pattern (server/pressPortal.ts). Three
// invite kinds:
//   • `ambassador` / `staff` — mints an admin_invites row with role=
//     'non_profit', roleScopeId=<npoId>, inviteRole=npo_ambassador|
//     npo_staff. On accept the new user joins the NPO scope and lands
//     on /non-profit. The dashboard reads admin_invites.invite_role
//     by accepted_user_id to know what buttons to render.
//   • `artist` — creates a Person row (if email is new) and mints an
//     admin_invites row with role='artist', roleScopeId=<personId>,
//     referrerKind='non_profit', referrerScopeId=<npoId>. On accept
//     the existing referrer-wiring in /api/invites/:token/accept sets
//     people.referred_by_org_id so the artist shows up in the NPO's
//     "Your artists" rollup and earns $1/unit credits.
//
// Authorization graph:
//   • super_admin / admin             → any invite kind
//   • non_profit (no inviteRole set)  → ambassador, staff, artist
//   • non_profit + inviteRole='npo_*' → artist only (server-enforced)
// Sub-roles cannot invite outside their NPO scope: requireNpoScope
// pins the route to one NPO id; the body cannot reassign it.

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { getUserRole, findMembershipForScope, addMembership } from "./auth/roles";
import { sqlNpoAlbumLedger } from "./adminAlbumQueries";

const INVITE_TTL_DAYS = 14;

// ─── Sub-role helper ─────────────────────────────────────────────────
// A user's NPO sub-role is the `invite_role` of the most-recent
// accepted admin_invites row whose role='non_profit'. Returns null for
// NPO admins (invited as plain non_profit with no inviteRole) and for
// non-NPO users.
export async function getNpoSubRole(
  userId: string,
): Promise<"npo_ambassador" | "npo_staff" | null> {
  const r = await db.execute<{ invite_role: string | null }>(sql`
    SELECT invite_role FROM admin_invites
    WHERE accepted_user_id = ${userId} AND role = 'non_profit' AND used_at IS NOT NULL
    ORDER BY used_at DESC LIMIT 1
  `);
  const ir = (r as any).rows?.[0]?.invite_role ?? null;
  if (ir === "npo_ambassador" || ir === "npo_staff") return ir;
  return null;
}

export async function npoInviteCapabilities(
  userId: string,
  npoId: string,
): Promise<{
  ok: boolean;
  isAdmin: boolean;
  subRole: "npo_ambassador" | "npo_staff" | null;
  canInviteAmbassadors: boolean;
  canInviteStaff: boolean;
  canInviteArtists: boolean;
  canViewTree: boolean;
} | null> {
  const info = await getUserRole(userId);
  if (!info) return null;
  if (info.role === "super_admin" || info.role === "admin") {
    return {
      ok: true, isAdmin: true, subRole: null,
      canInviteAmbassadors: true, canInviteStaff: true,
      canInviteArtists: true, canViewTree: true,
    };
  }
  // Task #1036 — match against the membership SET, not the primary hat.
  if (!(await findMembershipForScope(userId, "non_profit", npoId))) return null;
  const subRole = await getNpoSubRole(userId);
  if (subRole) {
    return {
      ok: true, isAdmin: false, subRole,
      canInviteAmbassadors: false, canInviteStaff: false,
      canInviteArtists: true, canViewTree: false,
    };
  }
  // Plain NPO admin (the identity tier for an org).
  return {
    ok: true, isAdmin: true, subRole: null,
    canInviteAmbassadors: true, canInviteStaff: true,
    canInviteArtists: true, canViewTree: true,
  };
}

function inviteAcceptBase(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export function registerNpoPortalRoutes(
  app: Express,
  requireAdmin: any,
): void {
  // Scope gate — super_admin/admin pass; non_profit user must be
  // pinned to this exact NPO id.
  const requireNpoScope = async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const info = await getUserRole(userId);
    if (!info) return res.status(403).json({ message: "Forbidden" });
    const npoId = String(req.params.id);
    if (info.role === "super_admin" || info.role === "admin") return next();
    // Task #1036 — match against the membership SET, not the primary hat.
    if (await findMembershipForScope(userId, "non_profit", npoId)) return next();
    return res.status(403).json({ message: "Not your non-profit" });
  };

  // GET /api/non-profit/:id/me — header info + caller capabilities.
  app.get("/api/non-profit/:id/me", requireAdmin, requireNpoScope, async (req, res) => {
    const npoId = String(req.params.id);
    const r = await db.execute<any>(sql`
      SELECT id, name, logo_url, website_url
      FROM organizations
      WHERE id = ${npoId} AND kind = 'non_profit' LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    if (!row) return res.status(404).json({ message: "Non-profit not found" });
    const caps = await npoInviteCapabilities((req.session as any).userId, npoId);
    res.json({
      id: row.id,
      name: row.name,
      logoUrl: row.logo_url,
      websiteUrl: row.website_url,
      caller: caps,
    });
  });

  // GET /api/non-profit/:id/album-ledger — Task #922 per-album donation
  // ledger. One row per album this NPO is a beneficiary of (or has ever
  // earned a credit from), showing the per-unit donation, units sold,
  // expected (pending) cents, paid cents, and the allocating artist.
  // referral_credits has no album_id, so units/cents join through
  // orders.album_id; the per-unit rate + zero-sale albums come from
  // album_npo_beneficiaries.
  app.get("/api/non-profit/:id/album-ledger", requireAdmin, requireNpoScope, async (req, res) => {
    const npoId = String(req.params.id);
    const rows = await db.execute<any>(sqlNpoAlbumLedger(npoId));
    res.json({
      albums: ((rows as any).rows ?? []).map((r: any) => ({
        albumId: r.album_id,
        title: r.title,
        coverUrl: r.cover_url,
        artistId: r.artist_id,
        artistName: r.artist_name,
        perUnitCents: r.per_unit_cents,
        unitsSold: r.units_sold,
        expectedCents: r.expected_cents,
        paidCents: r.paid_cents,
      })),
    });
  });

  // GET /api/non-profit/:id/buyers — Task #938 scoped buyer roster.
  // Attribution = orders that minted a referral_credit crediting this
  // NPO (referrer_kind='non_profit', referrer_org_id=<npoId>). Same
  // join referral payouts use, so it never leaks cross-partner buyers.
  // Defaults to all-time; ?from/?to narrow it.
  app.get("/api/non-profit/:id/buyers", requireAdmin, requireNpoScope, async (req, res) => {
    const npoId = String(req.params.id);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
    const { buyerRoster } = await import("./reports/buyers");
    const filter = sql`o.id IN (
      SELECT rc.order_id FROM referral_credits rc
      WHERE rc.referrer_kind = 'non_profit' AND rc.referrer_org_id = ${npoId}
    )`;
    const buyers = await buyerRoster(filter, from, to);
    res.json({ buyers });
  });

  // GET /api/non-profit/:id/buyer-map — Fan-Map-style city map for the
  // same NPO-attributed orders.
  app.get("/api/non-profit/:id/buyer-map", requireAdmin, requireNpoScope, async (req, res) => {
    const npoId = String(req.params.id);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
    const { buyerMap } = await import("./reports/buyers");
    const filter = sql`o.id IN (
      SELECT rc.order_id FROM referral_credits rc
      WHERE rc.referrer_kind = 'non_profit' AND rc.referrer_org_id = ${npoId}
    )`;
    const map = await buyerMap(filter, from, to);
    res.json(map);
  });

  // POST /api/non-profit/:id/invites — mint an ambassador/staff/artist
  // invite. Body shape:
  //   { email, kind: 'ambassador'|'staff'|'artist', name?, welcomeNote? }
  const inviteSchema = z.object({
    email: z.string().email(),
    kind: z.enum(["ambassador", "staff", "artist"]),
    name: z.string().min(1).max(200).optional().nullable(),
    welcomeNote: z.string().max(1000).optional().nullable(),
  });
  app.post("/api/non-profit/:id/invites", requireAdmin, requireNpoScope, async (req, res) => {
    const npoId = String(req.params.id);
    const userId = (req.session as any).userId as string;
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid invite" });
    }
    const { email: rawEmail, kind, name, welcomeNote } = parsed.data;
    const email = rawEmail.trim().toLowerCase();

    const caps = await npoInviteCapabilities(userId, npoId);
    if (!caps?.ok) return res.status(403).json({ message: "Forbidden" });
    if (kind === "ambassador" && !caps.canInviteAmbassadors) {
      return res.status(403).json({ message: "Only the NPO admin can invite ambassadors" });
    }
    if (kind === "staff" && !caps.canInviteStaff) {
      return res.status(403).json({ message: "Only the NPO admin can invite staff" });
    }
    if (kind === "artist" && !caps.canInviteArtists) {
      return res.status(403).json({ message: "Not allowed to invite artists" });
    }

    // Resolve role/scope before the existing-user check so we can
    // fast-path: if the user already has an admin account, add the hat
    // directly (matching POST /api/admin/invites behavior) rather than
    // returning a hard error that prevents any further action.
    let role: "artist" | "non_profit";
    let roleScopeId: string;
    let inviteRole: string | null = null;
    let referrerKind: "non_profit" | null = null;
    let referrerScopeId: string | null = null;

    if (kind === "ambassador" || kind === "staff") {
      role = "non_profit";
      roleScopeId = npoId;
      inviteRole = kind === "ambassador" ? "npo_ambassador" : "npo_staff";
    } else {
      role = "artist";
      // Reuse an existing Person if the email is on file; otherwise
      // mint a placeholder Person carrying the inviter's NPO as the
      // referrer org. The accept handler also writes referred_by_org_id
      // via the referrerKind='non_profit' path, but we set it here too
      // so the artist surfaces in the NPO's roll-up even pre-accept.
      const personName = (name || email.split("@")[0]).trim();
      const existing = await db.execute<{ id: string }>(sql`
        SELECT id FROM people WHERE LOWER(email) = ${email} LIMIT 1
      `);
      const row = ((existing as any).rows ?? [])[0];
      if (row?.id) {
        roleScopeId = row.id;
        await db.execute(sql`
          UPDATE people SET referred_by_org_id = ${npoId}
          WHERE id = ${roleScopeId} AND referred_by_org_id IS NULL
        `);
      } else {
        const created = await db.execute<{ id: string }>(sql`
          INSERT INTO people (name, email, referred_by_org_id)
          VALUES (${personName}, ${email}, ${npoId})
          RETURNING id
        `);
        roleScopeId = (created as any).rows[0].id;
      }
      referrerKind = "non_profit";
      referrerScopeId = npoId;
    }

    // If an admin account already exists for this email, add the hat
    // directly (matching the system /api/admin/invites fast-path) so
    // the NPO portal doesn't hard-block the operation with a 400.
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      await db.execute(sql`UPDATE users SET is_admin = true WHERE id = ${existingUser.id} AND is_admin = false`);
      await addMembership(existingUser.id, role as any, roleScopeId ?? null, inviteRole ?? null);
      return res.json({ added: true, userId: existingUser.id, email, kind });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await storage.createAdminInvite({
      email,
      role,
      roleScopeId,
      token,
      expiresAt,
      createdByUserId: userId,
      referrerKind,
      referrerScopeId,
      welcomeNote: welcomeNote ?? null,
      inviteRole: inviteRole as any,
    } as any);

    const acceptUrl = `${inviteAcceptBase(req)}/invite/${token}`;

    const { sendAdminInviteEmail } = await import("./mail");
    const inviter = await storage.getUser(userId);
    const npo = ((await db.execute<any>(
      sql`SELECT name, logo_url FROM organizations WHERE id = ${npoId} LIMIT 1`,
    )) as any).rows?.[0];
    const inviterName =
      inviter?.displayName || inviter?.email || npo?.name || "Your non-profit partner";
    const roleLabel =
      kind === "ambassador" ? "Ambassador"
        : kind === "staff" ? "Staff"
        : "Artist";
    const mail = await sendAdminInviteEmail(
      email, acceptUrl, inviterName, roleLabel, INVITE_TTL_DAYS,
      npo?.logo_url ?? null, npo?.name ?? null,
    );

    res.json({
      id: invite.id,
      email: invite.email,
      kind,
      acceptUrl,
      emailDelivered: mail.ok,
    });
  });

  // POST /api/non-profit/:id/invites/:inviteId/resend
  app.post(
    "/api/non-profit/:id/invites/:inviteId/resend",
    requireAdmin, requireNpoScope,
    async (req, res) => {
      const npoId = String(req.params.id);
      const userId = (req.session as any).userId as string;
      const inviteId = String(req.params.inviteId);
      const existing = await storage.getAdminInviteById(inviteId);
      if (!existing) return res.status(404).json({ message: "Invite not found" });
      if (!isOwnedByNpo(existing, npoId)) {
        return res.status(404).json({ message: "Invite not found" });
      }
      const caps = await npoInviteCapabilities(userId, npoId);
      // Sub-roles can only resend artist invites they created.
      if (caps && !caps.isAdmin) {
        if (existing.role !== "artist" || (existing as any).createdByUserId !== userId) {
          return res.status(403).json({ message: "You can only resend artist invites you sent" });
        }
      }
      if (existing.usedAt) return res.status(410).json({ message: "Invite already accepted" });
      if ((existing as any).revokedAt) {
        return res.status(410).json({ message: "Invite was revoked — send a new one" });
      }
      const newToken = crypto.randomBytes(32).toString("base64url");
      const newExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const updated = await storage.resendAdminInvite(existing.id, newToken, newExpiresAt);
      if (!updated) return res.status(500).json({ message: "Resend failed" });

      const { sendAdminInviteEmail } = await import("./mail");
      const acceptUrl = `${inviteAcceptBase(req)}/invite/${newToken}`;
      const inviter = await storage.getUser(userId);
      const npo = ((await db.execute<any>(
        sql`SELECT name, logo_url FROM organizations WHERE id = ${npoId} LIMIT 1`,
      )) as any).rows?.[0];
      const inviterName =
        inviter?.displayName || inviter?.email || npo?.name || "Your non-profit partner";
      const ir = (existing as any).inviteRole as string | null;
      const roleLabel =
        ir === "npo_ambassador" ? "Ambassador"
          : ir === "npo_staff" ? "Staff"
          : existing.role === "artist" ? "Artist"
          : "Non-profit";
      const mail = await sendAdminInviteEmail(
        updated.email, acceptUrl, inviterName, roleLabel, INVITE_TTL_DAYS,
        npo?.logo_url ?? null, npo?.name ?? null,
      );
      res.json({ id: updated.id, acceptUrl, emailDelivered: mail.ok });
    },
  );

  // DELETE /api/non-profit/:id/invites/:inviteId
  app.delete(
    "/api/non-profit/:id/invites/:inviteId",
    requireAdmin, requireNpoScope,
    async (req, res) => {
      const npoId = String(req.params.id);
      const userId = (req.session as any).userId as string;
      const inviteId = String(req.params.inviteId);
      const existing = await storage.getAdminInviteById(inviteId);
      if (!existing) return res.status(404).json({ message: "Invite not found" });
      if (!isOwnedByNpo(existing, npoId)) {
        return res.status(404).json({ message: "Invite not found" });
      }
      const caps = await npoInviteCapabilities(userId, npoId);
      if (caps && !caps.isAdmin) {
        if (existing.role !== "artist" || (existing as any).createdByUserId !== userId) {
          return res.status(403).json({ message: "You can only revoke artist invites you sent" });
        }
      }
      if (existing.usedAt) return res.status(410).json({ message: "Invite already accepted" });
      await storage.revokeAdminInvite(inviteId);
      res.json({ ok: true });
    },
  );

  // GET /api/non-profit/:id/tree — read-only invite tree.
  //   Root: the NPO
  //   Children (level 1): NPO admin users + ambassador/staff users
  //                       (accepted) + pending ambassador/staff invites
  //   Grandchildren (level 2): artists invited by each level-1 node
  app.get("/api/non-profit/:id/tree", requireAdmin, requireNpoScope, async (req, res) => {
    const npoId = String(req.params.id);
    const userId = (req.session as any).userId as string;
    const caps = await npoInviteCapabilities(userId, npoId);
    if (!caps?.canViewTree) return res.status(403).json({ message: "Tree is admin-only" });

    const npo = ((await db.execute<any>(
      sql`SELECT id, name, logo_url FROM organizations WHERE id = ${npoId} LIMIT 1`,
    )) as any).rows?.[0];
    if (!npo) return res.status(404).json({ message: "Non-profit not found" });

    // Accepted NPO-scope users (admins + ambassador/staff).
    const userRows = ((await db.execute<any>(sql`
      SELECT u.id, u.display_name, u.email,
        (SELECT invite_role FROM admin_invites ai
          WHERE ai.accepted_user_id = u.id AND ai.role = 'non_profit'
          ORDER BY ai.used_at DESC LIMIT 1) AS invite_role,
        (SELECT used_at FROM admin_invites ai
          WHERE ai.accepted_user_id = u.id AND ai.role = 'non_profit'
          ORDER BY ai.used_at DESC LIMIT 1) AS joined_at
      FROM users u
      WHERE u.role = 'non_profit' AND u.role_scope_id = ${npoId}
      ORDER BY u.display_name ASC
    `)) as any).rows ?? [];

    // Pending ambassador/staff invites (not yet accepted).
    const pendingTeam = ((await db.execute<any>(sql`
      SELECT id, email, invite_role, created_at, expires_at, created_by_user_id
      FROM admin_invites
      WHERE role = 'non_profit' AND role_scope_id = ${npoId}
        AND invite_role IN ('npo_ambassador','npo_staff')
        AND used_at IS NULL AND revoked_at IS NULL
      ORDER BY created_at DESC
    `)) as any).rows ?? [];

    // All artist invites tied to this NPO — both accepted and pending.
    const artistInvites = ((await db.execute<any>(sql`
      SELECT ai.id, ai.email, ai.created_at, ai.expires_at, ai.used_at,
             ai.created_by_user_id, ai.role_scope_id,
             COALESCE(p.name, ai.email) AS person_name,
             p.photo_url
      FROM admin_invites ai
      LEFT JOIN people p ON p.id = ai.role_scope_id
      WHERE ai.role = 'artist'
        AND ai.referrer_kind = 'non_profit' AND ai.referrer_scope_id = ${npoId}
        AND ai.revoked_at IS NULL
      ORDER BY ai.created_at DESC
    `)) as any).rows ?? [];

    const byInviter = new Map<string, any[]>();
    for (const a of artistInvites) {
      const k = a.created_by_user_id || "_orphan";
      const list = byInviter.get(k) ?? [];
      list.push({
        id: a.id,
        personId: a.role_scope_id,
        name: a.person_name,
        email: a.email,
        photoUrl: a.photo_url,
        status: a.used_at ? "accepted" : "pending",
        createdAt: a.created_at,
        expiresAt: a.expires_at,
      });
      byInviter.set(k, list);
    }

    const team = [
      ...userRows.map((u: any) => ({
        nodeKind: "user" as const,
        id: u.id,
        name: u.display_name || u.email,
        email: u.email,
        subRole:
          u.invite_role === "npo_ambassador" ? "ambassador"
            : u.invite_role === "npo_staff" ? "staff"
            : "admin",
        joinedAt: u.joined_at,
        artists: byInviter.get(u.id) ?? [],
      })),
      ...pendingTeam.map((p: any) => ({
        nodeKind: "pending" as const,
        id: `invite:${p.id}`,
        inviteId: p.id,
        name: p.email,
        email: p.email,
        subRole: p.invite_role === "npo_ambassador" ? "ambassador" : "staff",
        createdAt: p.created_at,
        expiresAt: p.expires_at,
        artists: [],
      })),
    ];

    res.json({
      npo: { id: npo.id, name: npo.name, logoUrl: npo.logo_url },
      team,
      orphanArtists: byInviter.get("_orphan") ?? [],
    });
  });
}

// admin_invites rows owned by this NPO are either:
//   • role=non_profit + roleScopeId=npoId (ambassador/staff invites), or
//   • role=artist + referrer_kind='non_profit' + referrer_scope_id=npoId
function isOwnedByNpo(invite: any, npoId: string): boolean {
  if (invite.role === "non_profit" && invite.roleScopeId === npoId) return true;
  if (
    invite.role === "artist" &&
    (invite as any).referrerKind === "non_profit" &&
    (invite as any).referrerScopeId === npoId
  ) return true;
  return false;
}
