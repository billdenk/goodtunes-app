// Role middleware + helpers. The users.role / users.role_scope_id
// columns live outside the drizzle pgTable definition (see schema.ts
// comment near ADMIN_ROLES) so we read them via raw SQL here. Once
// we're ready to fold them into the main `users` definition this
// file collapses to a thin re-export.
//
// This module serves two callers:
//   1. Task #69 role gating — getUserRole / setUserRole / requireRole
//      enforce per-role access on admin routes.
//   2. Task #80 partner-reports scope resolution — resolveReportScope /
//      requireReportScope / effectiveScopeFilter compute which albums
//      a caller can see, with super_admin impersonation via
//      ?asPartner=<id>&asPartnerKind=label|artist.

import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import { ADMIN_ROLES, type AdminRole } from "@shared/schema";

export type { AdminRole };

export interface UserRoleInfo {
  role: AdminRole;
  roleScopeId: string | null;
}

export async function getUserRole(userId: string): Promise<UserRoleInfo | null> {
  const r = await db.execute<{ role: string; role_scope_id: string | null }>(
    sql`SELECT role, role_scope_id FROM users WHERE id = ${userId} LIMIT 1`,
  );
  const row = (r as any).rows?.[0];
  if (!row) return null;
  // Task #78 — `org` is the historical name for the non-profit partner
  // role used by reports code. Fold it into `non_profit` so the closed
  // ADMIN_ROLES enum stays the single source of truth.
  const normalized = row.role === "org" ? "non_profit" : row.role;
  const role = ADMIN_ROLES.includes(normalized as AdminRole)
    ? (normalized as AdminRole)
    : "super_admin";
  return { role, roleScopeId: row.role_scope_id ?? null };
}

export async function setUserRole(
  userId: string,
  role: AdminRole,
  roleScopeId: string | null,
): Promise<void> {
  await db.execute(
    sql`UPDATE users SET role = ${role}, role_scope_id = ${roleScopeId} WHERE id = ${userId}`,
  );
}

// Express middleware: only allow the listed roles. Requires an
// authenticated admin session — pair after requireAdmin if you want
// the 401-vs-403 distinction to stay clean.
export function requireRole(...roles: AdminRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user?.isAdmin) return res.status(403).json({ message: "Admin only" });
    const info = await getUserRole(userId);
    if (!info || !roles.includes(info.role)) {
      return res.status(403).json({ message: "Insufficient role" });
    }
    (req as any).userRole = info;
    next();
  };
}

// ─── Task #80 — partner-reports scope resolution ─────────────────────
//
// `PartnerScope` extends `UserRoleInfo` with super_admin impersonation
// state. The reports endpoints filter their queries by the resolved
// (kind, id) tuple so every partner sees only their own catalogue.

export interface PartnerScope extends UserRoleInfo {
  // When super_admin uses ?asPartner=<id>&asPartnerKind=label|artist|non_profit
  // these are populated and the report query filters as if the caller
  // were that partner. The role itself stays "super_admin" so we know
  // not to demote them mid-request.
  //
  // Task #524 — non_profit was added so super-admins can also view the
  // Reports surface from a non-profit's perspective (Referrals tab is
  // the relevant one; album-scoped tabs gate out for orgs).
  viewAs?: { kind: "label" | "artist" | "non_profit"; id: string };
}

let roleColumnsKnownToExist: boolean | null = null;

async function detectRoleColumns(): Promise<boolean> {
  if (roleColumnsKnownToExist !== null) return roleColumnsKnownToExist;
  try {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' AND column_name IN ('role','role_scope_id')`,
    );
    roleColumnsKnownToExist = r.rowCount === 2;
  } catch {
    roleColumnsKnownToExist = false;
  }
  return roleColumnsKnownToExist;
}

export async function getPartnerScope(userId: string): Promise<PartnerScope> {
  const hasCols = await detectRoleColumns();
  if (!hasCols) return { role: "super_admin", roleScopeId: null };
  const info = await getUserRole(userId);
  if (!info) return { role: "super_admin", roleScopeId: null };
  return info;
}

/**
 * Resolve the effective scope for a partner-reports request. Reads the
 * caller's role; if super_admin, honors ?asPartner=<id>&asPartnerKind=...
 * for read-through impersonation. Returns null on missing auth.
 */
export async function resolveReportScope(req: Request): Promise<PartnerScope | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const user = await storage.getUser(userId);
  if (!user?.isAdmin) return null;
  const scope = await getPartnerScope(userId);
  if (scope.role === "super_admin") {
    const asPartner = String(req.query.asPartner || "").trim();
    const asKind = String(req.query.asPartnerKind || "").trim();
    if (
      asPartner &&
      (asKind === "label" || asKind === "artist" || asKind === "non_profit")
    ) {
      return { ...scope, viewAs: { kind: asKind, id: asPartner } };
    }
  }
  return scope;
}

export async function requireReportScope(req: Request, res: Response, next: NextFunction) {
  const scope = await resolveReportScope(req);
  if (!scope) return res.status(401).json({ message: "Unauthorized" });
  (req as any).reportScope = scope;
  next();
}

// Effective (kind, id) the report should filter by. Returns null when
// the caller is super_admin with no asPartner — i.e. "see everything".
// Non-profit impersonation returns null here because orgs don't own
// albums; album-scoped reports should treat it as an empty cohort
// (see `effectiveOrgId` + resolveScope in reports/index.ts).
export function effectiveScopeFilter(scope: PartnerScope): { kind: "label" | "artist"; id: string } | null {
  if (scope.viewAs) {
    const v = scope.viewAs;
    if (v.kind === "label") return { kind: "label", id: v.id };
    if (v.kind === "artist") return { kind: "artist", id: v.id };
    return null;
  }
  if (scope.role === "label" && scope.roleScopeId) return { kind: "label", id: scope.roleScopeId };
  if (scope.role === "artist" && scope.roleScopeId) return { kind: "artist", id: scope.roleScopeId };
  return null;
}

// True when the caller's effective scope is a non-profit (real role
// or super_admin impersonation). Reports that are album-scoped should
// treat this as an empty cohort; the Referrals tab uses `effectiveOrgId`
// to pull the referred-artist cohort instead.
export function isOrgScope(scope: PartnerScope): boolean {
  if (scope.viewAs?.kind === "non_profit") return true;
  return scope.role === "non_profit" || scope.role === ("org" as AdminRole);
}

// Effective non-profit org id for the caller (impersonation > own role).
export function effectiveOrgId(scope: PartnerScope): string | null {
  if (scope.viewAs?.kind === "non_profit") return scope.viewAs.id;
  if (isOrgScope(scope)) return scope.roleScopeId;
  return null;
}
