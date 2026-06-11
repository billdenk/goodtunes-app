// Shared inviter-branding lookup for partner/admin invite emails.
//
// Resolves the optional avatar/logo and "on behalf of" org name to render
// on the branded invite email (server/mail.ts buildAdminInviteEmail). The
// inviter's role scope decides which entity image we surface:
//   artist     -> people.photo_url
//   label      -> labels.logo_url
//   manager    -> managers.logo_url
//   non_profit -> organizations.logo_url + name (rendered "on behalf of")
//
// Lives in its own module so both routes.ts and publishingSettlementRoutes.ts
// can use it without the latter importing routes.ts (circular dependency).
import { sql } from "drizzle-orm";
import { db } from "./db";

export async function resolveInviterBranding(
  userId: string,
): Promise<{ photoUrl: string | null; onBehalfOf: string | null }> {
  try {
    const { getUserRole } = await import("./auth/roles");
    const role = await getUserRole(userId);
    if (!role || !role.roleScopeId) return { photoUrl: null, onBehalfOf: null };
    if (role.role === "artist") {
      const r = await db.execute<any>(
        sql`SELECT photo_url FROM people WHERE id = ${role.roleScopeId} LIMIT 1`,
      );
      return { photoUrl: (r as any).rows?.[0]?.photo_url ?? null, onBehalfOf: null };
    }
    if (role.role === "label") {
      const r = await db.execute<any>(
        sql`SELECT logo_url FROM labels WHERE id = ${role.roleScopeId} LIMIT 1`,
      );
      return { photoUrl: (r as any).rows?.[0]?.logo_url ?? null, onBehalfOf: null };
    }
    if (role.role === "manager") {
      const r = await db.execute<any>(
        sql`SELECT logo_url FROM managers WHERE id = ${role.roleScopeId} LIMIT 1`,
      );
      return { photoUrl: (r as any).rows?.[0]?.logo_url ?? null, onBehalfOf: null };
    }
    if (role.role === "non_profit") {
      const r = await db.execute<any>(
        sql`SELECT name, logo_url FROM organizations WHERE id = ${role.roleScopeId} LIMIT 1`,
      );
      const row = (r as any).rows?.[0];
      return { photoUrl: row?.logo_url ?? null, onBehalfOf: row?.name ?? null };
    }
    return { photoUrl: null, onBehalfOf: null };
  } catch (e: any) {
    console.warn(`[invite] inviter branding lookup failed: ${e?.message}`);
    return { photoUrl: null, onBehalfOf: null };
  }
}
