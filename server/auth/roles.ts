// Role middleware + helpers. The users.role / users.role_scope_id
// columns live outside the drizzle pgTable definition (see schema.ts
// comment near ADMIN_ROLES) so we read them via raw SQL here. Once
// we're ready to fold them into the main `users` definition this
// file collapses to a thin re-export.

import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { ADMIN_ROLES, type AdminRole } from "@shared/schema";

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
  const role = ADMIN_ROLES.includes(row.role as AdminRole)
    ? (row.role as AdminRole)
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
