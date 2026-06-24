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
import {
  ADMIN_ROLES,
  MEMBERSHIP_SCOPE_KINDS,
  type AdminRole,
  type MembershipScopeKind,
} from "@shared/schema";
import { getActiveMembershipKey, membershipKey } from "./activeMembership";

export type { AdminRole };
export { membershipKey };

export interface UserRoleInfo {
  role: AdminRole;
  roleScopeId: string | null;
}

// Task #1036 — one resolved "hat" a user wears. `role` is always a
// normalized ADMIN_ROLES value; god roles (super_admin/admin) carry
// scopeKind/scopeId null. For single-membership users this set has
// exactly one element and reproduces the legacy users.role /
// role_scope_id byte-for-byte.
export interface ResolvedMembership {
  role: AdminRole;
  scopeKind: MembershipScopeKind | null;
  scopeId: string | null;
  subRole: string | null;
}

// Normalize a raw users.role value into the closed ADMIN_ROLES enum.
// Task #78 — `org` is the historical alias for `non_profit`; unknown
// values fall back to super_admin (matches the original getUserRole).
function normalizeRole(raw: string | null): AdminRole {
  const normalized = raw === "org" ? "non_profit" : raw;
  return ADMIN_ROLES.includes(normalized as AdminRole)
    ? (normalized as AdminRole)
    : "super_admin";
}

// The scope kind a role implies. Partner roles double as their scope
// kind (label→label, artist→artist, …, non_profit→non_profit); the god
// roles imply no scope.
function roleToScopeKind(role: AdminRole): MembershipScopeKind | null {
  return (MEMBERSHIP_SCOPE_KINDS as readonly string[]).includes(role)
    ? (role as MembershipScopeKind)
    : null;
}

// Read the legacy users.role / role_scope_id pair exactly as the
// original getUserRole did. Returns null when there's no users row.
// This is the byte-for-byte safety net: when the memberships table is
// missing (dev clones before post-merge) or a user somehow has no
// membership row, resolution synthesizes a single membership from here.
async function readLegacyUserRole(userId: string): Promise<UserRoleInfo | null> {
  const r = await db.execute<{ role: string; role_scope_id: string | null }>(
    sql`SELECT role, role_scope_id FROM users WHERE id = ${userId} LIMIT 1`,
  );
  const row = (r as any).rows?.[0];
  if (!row) return null;
  return { role: normalizeRole(row.role), roleScopeId: row.role_scope_id ?? null };
}

let membershipsTableKnownToExist: boolean | null = null;

async function detectMembershipsTable(): Promise<boolean> {
  if (membershipsTableKnownToExist !== null) return membershipsTableKnownToExist;
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'memberships'`,
    );
    membershipsTableKnownToExist = (r.rowCount ?? 0) > 0;
  } catch {
    membershipsTableKnownToExist = false;
  }
  return membershipsTableKnownToExist;
}

// Task #1250 — every super-admin's email, resolved membership-aware.
// Legacy users.role stays authoritative, but a multi-hat account can
// carry its super_admin hat only in the memberships table (legacy
// users.role pointing at a different primary hat), so we UNION both and
// dedupe. Used to fan out review/notification emails to all super-admins.
export async function listSuperAdminEmails(): Promise<string[]> {
  const emails = new Set<string>();
  try {
    const r = await db.execute<{ email: string }>(sql`
      SELECT email FROM users
       WHERE role = 'super_admin' AND email IS NOT NULL AND email <> ''
    `);
    for (const row of ((r as any).rows ?? [])) {
      if (row.email) emails.add(row.email);
    }
  } catch {
    // Legacy role columns may be absent on a fresh clone — fall through
    // to the membership-aware query below.
  }
  if (await detectMembershipsTable()) {
    try {
      const r = await db.execute<{ email: string }>(sql`
        SELECT u.email AS email
          FROM memberships m
          JOIN users u ON u.id = m.user_id
         WHERE m.role = 'super_admin' AND u.email IS NOT NULL AND u.email <> ''
      `);
      for (const row of ((r as any).rows ?? [])) {
        if (row.email) emails.add(row.email);
      }
    } catch {
      // best-effort
    }
  }
  return [...emails];
}

// Task #1036 — resolve the FULL SET of memberships (hats) for an account.
// Reads the memberships table when present; otherwise — or when a user
// has no rows yet — synthesizes exactly ONE membership from the legacy
// users.role / role_scope_id columns so behavior is identical to the
// pre-memberships code. Returns [] only when there's no users row.
//
// Task #1038 — this is the UNFILTERED set (every hat the account holds).
// The hat-switcher UI lists from here. Role gating instead goes through
// getUserMemberships() below, which narrows to the active hat.
export async function getAllUserMemberships(userId: string): Promise<ResolvedMembership[]> {
  if (await detectMembershipsTable()) {
    const r = await db.execute<{
      role: string;
      scope_kind: string | null;
      scope_id: string | null;
      sub_role: string | null;
    }>(sql`
      SELECT role, scope_kind, scope_id, sub_role
      FROM memberships WHERE user_id = ${userId}
    `);
    const rows = ((r as any).rows ?? []) as any[];
    if (rows.length > 0) {
      return rows.map((row) => ({
        role: normalizeRole(row.role),
        scopeKind: (row.scope_kind as MembershipScopeKind | null) ?? null,
        scopeId: row.scope_id ?? null,
        subRole: row.sub_role ?? null,
      }));
    }
  }
  // Fallback / safety net: one synthetic membership from legacy columns.
  const legacy = await readLegacyUserRole(userId);
  if (!legacy) return [];
  return [
    {
      role: legacy.role,
      scopeKind: roleToScopeKind(legacy.role),
      scopeId: legacy.roleScopeId,
      subRole: null,
    },
  ];
}

// Task #1038 — the EFFECTIVE membership set for the current request. When
// the operator has switched into a specific hat (req.session
// .activeMembershipKey, lifted into AsyncLocalStorage by
// activeMembershipContext) AND the account actually holds more than one
// hat, narrow the set to that single matching hat — so getUserRole,
// findMembershipForScope, getPartnerScope and every gate downstream scope
// to it. Single-membership accounts (or no active key, or a stale key
// that no longer matches) fall straight through to the full set, keeping
// behavior byte-for-byte identical to before the switcher existed.
export async function getUserMemberships(userId: string): Promise<ResolvedMembership[]> {
  const all = await getAllUserMemberships(userId);
  if (all.length <= 1) return all;
  const activeKey = getActiveMembershipKey();
  if (!activeKey) return all;
  const match = all.find((m) => membershipKey(m) === activeKey);
  return match ? [match] : all;
}

// Pick the "primary" hat for legacy single-value callers. God roles win
// (super_admin > admin), then any scoped hat. For single-membership
// users (this phase) there's exactly one, so the choice is moot; the
// ordering only matters once Phase 3 lets a user hold several.
export function pickPrimaryMembership(ms: ResolvedMembership[]): ResolvedMembership | null {
  if (ms.length === 0) return null;
  const rank = (m: ResolvedMembership) =>
    m.role === "super_admin" ? 0 : m.role === "admin" ? 1 : 2;
  return [...ms].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return `${a.scopeKind ?? ""}:${a.scopeId ?? ""}`.localeCompare(
      `${b.scopeKind ?? ""}:${b.scopeId ?? ""}`,
    );
  })[0];
}

// Task #1036 — the matching hat for a given target scope, or null when
// the account holds no membership for it. This is what the partner gates
// use instead of comparing the single users.role_scope_id, so a future
// multi-hat user matches the RIGHT scope. For single-membership users it
// returns the same yes/no as `role.role === kind && role.roleScopeId === id`.
export async function findMembershipForScope(
  userId: string,
  kind: MembershipScopeKind,
  id: string,
): Promise<ResolvedMembership | null> {
  const ms = await getUserMemberships(userId);
  return ms.find((m) => m.scopeKind === kind && m.scopeId === id) ?? null;
}

export async function getUserRole(userId: string): Promise<UserRoleInfo | null> {
  const ms = await getUserMemberships(userId);
  const primary = pickPrimaryMembership(ms);
  if (!primary) return null;
  return { role: primary.role, roleScopeId: primary.scopeId };
}

// Task #1036 — keep the user's membership SET in lock-step with the
// legacy users.role / role_scope_id columns. This phase is
// single-membership: the user's set becomes exactly { the legacy hat }.
// Stale hats from a previous role are removed; an existing row for the
// same scope is updated in place so its mirrored permission_overrides
// survive a same-scope re-grant. No-op when the table doesn't exist yet
// (dev clones before post-merge) — the synth fallback keeps reads correct.
export async function syncUserMembership(userId: string): Promise<void> {
  if (!(await detectMembershipsTable())) return;
  const legacy = await readLegacyUserRole(userId);
  if (!legacy) return;
  const scopeKind = roleToScopeKind(legacy.role);
  // Preserve role_scope_id verbatim (don't null it for god roles) so the
  // DB path matches the synth fallback + the original getUserRole exactly.
  // In practice god roles always carry a null scope id anyway.
  const scopeId = legacy.roleScopeId;
  await db.transaction(async (tx) => {
    // Drop any membership that isn't this exact hat.
    await tx.execute(sql`
      DELETE FROM memberships
      WHERE user_id = ${userId}
        AND (scope_kind IS DISTINCT FROM ${scopeKind} OR scope_id IS DISTINCT FROM ${scopeId})
    `);
    // Upsert the surviving / new hat. Preserve permission_overrides if a
    // same-scope row already exists.
    const ex = await tx.execute<{ id: string }>(sql`
      SELECT id FROM memberships
      WHERE user_id = ${userId}
        AND scope_kind IS NOT DISTINCT FROM ${scopeKind}
        AND scope_id IS NOT DISTINCT FROM ${scopeId}
      LIMIT 1
    `);
    const existingId = ((ex as any).rows ?? [])[0]?.id as string | undefined;
    if (existingId) {
      await tx.execute(sql`
        UPDATE memberships SET role = ${legacy.role}, updated_at = NOW()
        WHERE id = ${existingId}
      `);
    } else {
      await tx.execute(sql`
        INSERT INTO memberships (user_id, role, scope_kind, scope_id)
        VALUES (${userId}, ${legacy.role}, ${scopeKind}, ${scopeId})
      `);
    }
  });
}

export async function setUserRole(
  userId: string,
  role: AdminRole,
  roleScopeId: string | null,
): Promise<void> {
  await db.execute(
    sql`UPDATE users SET role = ${role}, role_scope_id = ${roleScopeId} WHERE id = ${userId}`,
  );
  // Task #1036 — dual-write the membership SET so the two never drift.
  await syncUserMembership(userId);
}

// Task #1038 — ADD a hat to an account WITHOUT disturbing its other hats.
// Unlike setUserRole (which rewrites the legacy users.role columns and,
// via syncUserMembership, DELETES every membership that isn't the legacy
// hat), this is a purely additive upsert on the memberships SET. Use it
// whenever an EXISTING account gains an additional scope (a second/third
// hat) — grant, invite-accept-onto-existing, promote-with-existing-hats.
//
// The legacy users.role / role_scope_id columns are left untouched so the
// account's PRIMARY hat (and the single-membership synth fallback) stay
// stable — UNLESS the account had no hat at all, in which case the added
// hat is also its primary and we mirror it into the legacy columns so
// getUserRole / landing resolve correctly even on the synth path.
//
// When the memberships table doesn't exist yet (dev clones before
// post-merge) there's no SET to add to, so we degrade to setUserRole
// (single-hat semantics) — matching every other resolver in this file.
export async function addMembership(
  userId: string,
  role: AdminRole,
  scopeId: string | null,
  subRole: string | null = null,
): Promise<void> {
  if (!(await detectMembershipsTable())) {
    await setUserRole(userId, role, scopeId);
    return;
  }
  const scopeKind = roleToScopeKind(role);
  const before = await db.execute<{ ct: number }>(
    sql`SELECT COUNT(*)::int AS ct FROM memberships WHERE user_id = ${userId}`,
  );
  const hadNoHats = ((((before as any).rows ?? [])[0]?.ct ?? 0) as number) === 0;

  if (scopeId === null) {
    // God hat (super_admin/admin): one per user via the partial unique on
    // (user_id) WHERE scope_id IS NULL.
    await db.execute(sql`
      INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
      VALUES (${userId}, ${role}, ${scopeKind}, NULL, ${subRole})
      ON CONFLICT (user_id) WHERE scope_id IS NULL
      DO UPDATE SET role = EXCLUDED.role,
        sub_role = COALESCE(EXCLUDED.sub_role, memberships.sub_role),
        updated_at = NOW()
    `);
  } else {
    // Scoped (partner) hat: one per (user, scope) via the partial unique
    // on (user_id, scope_kind, scope_id) WHERE scope_id IS NOT NULL.
    await db.execute(sql`
      INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
      VALUES (${userId}, ${role}, ${scopeKind}, ${scopeId}, ${subRole})
      ON CONFLICT (user_id, scope_kind, scope_id) WHERE scope_id IS NOT NULL
      DO UPDATE SET role = EXCLUDED.role,
        sub_role = COALESCE(EXCLUDED.sub_role, memberships.sub_role),
        updated_at = NOW()
    `);
  }

  if (hadNoHats) {
    await db.execute(
      sql`UPDATE users SET role = ${role}, role_scope_id = ${scopeId} WHERE id = ${userId}`,
    );
  }
}

// Task #1038 — REMOVE one hat from an account, leaving its other hats (and
// its fan/customer account) intact. Used by every revoke/un-grant path so
// pulling a partner membership no longer nukes the whole login. When this
// was the account's primary (legacy) hat, re-point the legacy columns at
// whatever hat remains (highest-privileged) so getUserRole stays valid;
// if it was the last hat, the legacy columns are left as-is (the account
// keeps its login but resolves to that now-orphaned legacy role, exactly
// as a never-granted users row would). No-op without the memberships table.
export async function removeMembership(
  userId: string,
  role: AdminRole,
  scopeId: string | null,
): Promise<void> {
  if (!(await detectMembershipsTable())) return;
  const scopeKind = roleToScopeKind(role);
  await db.execute(sql`
    DELETE FROM memberships
    WHERE user_id = ${userId}
      AND role = ${role}
      AND scope_kind IS NOT DISTINCT FROM ${scopeKind}
      AND scope_id IS NOT DISTINCT FROM ${scopeId}
  `);
  // If the legacy columns still point at the hat we just removed, move
  // them onto the highest-privileged remaining hat (or leave them when
  // none remain — the row keeps its login, just no live scope).
  const legacy = await readLegacyUserRole(userId);
  const legacyScopeKind = legacy ? roleToScopeKind(legacy.role) : null;
  const legacyWasRemoved =
    !!legacy &&
    legacy.role === role &&
    legacyScopeKind === scopeKind &&
    (legacy.roleScopeId ?? null) === (scopeId ?? null);
  if (legacyWasRemoved) {
    const remaining = await getAllUserMemberships(userId);
    const primary = pickPrimaryMembership(remaining);
    if (primary) {
      await db.execute(
        sql`UPDATE users SET role = ${primary.role}, role_scope_id = ${primary.scopeId} WHERE id = ${userId}`,
      );
    }
  }
}

// Task #1036 — refresh a membership's mirrored permission_overrides JSONB
// from the canonical partner_permission_overrides rows for (user, scope).
// Called after any override mutation so the membership stays in sync.
// The override table remains the READ source this phase; this mirror is
// for the Phase 3 hat-switcher. UPDATE-only: if no membership row exists
// yet it's a no-op (the canonical table still governs).
export async function rebuildMembershipOverrides(
  userId: string,
  scopeKind: string,
  scopeId: string,
): Promise<void> {
  if (!(await detectMembershipsTable())) return;
  const r = await db.execute<{ verb: string; granted: boolean }>(sql`
    SELECT verb, granted FROM partner_permission_overrides
    WHERE scope_kind = ${scopeKind} AND scope_id = ${scopeId} AND user_id = ${userId}
  `);
  const map: Record<string, boolean> = {};
  for (const row of ((r as any).rows ?? []) as any[]) map[row.verb] = !!row.granted;
  await db.execute(sql`
    UPDATE memberships
    SET permission_overrides = ${JSON.stringify(map)}::jsonb, updated_at = NOW()
    WHERE user_id = ${userId} AND scope_kind = ${scopeKind} AND scope_id = ${scopeId}
  `);
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
  // Task #1425 — "manager" added so super-admins can also view the
  // Reports surface from a manager's perspective. A manager has no album
  // column; the album cohort is derived from its roster in
  // server/reports/index.ts (resolveScope).
  viewAs?: { kind: "label" | "artist" | "non_profit" | "manager"; id: string };
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
      (asKind === "label" || asKind === "artist" || asKind === "non_profit" || asKind === "manager")
    ) {
      return { ...scope, viewAs: { kind: asKind, id: asPartner } };
    }
  }
  return scope;
}

export async function requireReportScope(req: Request, res: Response, next: NextFunction) {
  const scope = await resolveReportScope(req);
  if (!scope) return res.status(401).json({ message: "Unauthorized" });
  // Task #2081 — a publisher/writer account is NOT a reporting partner. Its
  // only data surface is the self-scoped GET /api/publisher/statement. It must
  // never reach the partner-reports module: a role with no album/org scope
  // falls through to resolveScope's `albumIds: null` super_admin god-view
  // (every partner's sales/plays/payouts/fans). Fail closed.
  if (scope.role === "publisher") {
    return res
      .status(403)
      .json({ message: "Publishers use the publisher statement, not partner reports." });
  }
  (req as any).reportScope = scope;
  next();
}

// Effective (kind, id) the report should filter by. Returns null when
// the caller is super_admin with no asPartner — i.e. "see everything".
// Non-profit impersonation returns null here because orgs don't own
// albums; album-scoped reports should treat it as an empty cohort
// (see `effectiveOrgId` + resolveScope in reports/index.ts).
export function effectiveScopeFilter(scope: PartnerScope): { kind: "label" | "artist" | "manager"; id: string } | null {
  if (scope.viewAs) {
    const v = scope.viewAs;
    if (v.kind === "label") return { kind: "label", id: v.id };
    if (v.kind === "artist") return { kind: "artist", id: v.id };
    // Task #1425 — manager cohort is derived from its roster in resolveScope.
    if (v.kind === "manager") return { kind: "manager", id: v.id };
    return null;
  }
  if (scope.role === "label" && scope.roleScopeId) return { kind: "label", id: scope.roleScopeId };
  if (scope.role === "artist" && scope.roleScopeId) return { kind: "artist", id: scope.roleScopeId };
  // A real manager-role caller must NOT fall through to the null "see
  // everything" branch (that is the super_admin god-view). Pin them to
  // their own manager scope so the cohort derivation runs.
  if (scope.role === "manager" && scope.roleScopeId) return { kind: "manager", id: scope.roleScopeId };
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
