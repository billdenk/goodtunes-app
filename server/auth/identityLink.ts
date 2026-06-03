// Task #1037 — Unified identity P2 helpers.
//
// One human = one account across the fan player (customer_users) and the
// admin shell (users). The link lives on users.customer_user_id and the
// fan row is the CANONICAL credential + OAuth-identity store. These
// helpers are the single seam every auth path goes through so the two
// rows never silently drift.
//
// Password convergence rule (no-lockout): we only ever FILL an empty
// side on link, never overwrite a non-null password. /api/login (admin)
// accepts the canonical fan password OR users.password, and any explicit
// password write (reset / set-password) calls writeLinkedPassword to
// overwrite BOTH linked rows — so a single reset fully converges the
// credential everywhere.
import { sql } from "drizzle-orm";
import { db } from "../db";

// users.id for the admin row linked to this fan, or null.
export async function getAdminIdForCustomer(customerId: string): Promise<string | null> {
  const r = await db.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE customer_user_id = ${customerId} LIMIT 1`,
  );
  return ((r as any).rows?.[0]?.id as string | undefined) ?? null;
}

// customer_users.id this admin row is linked to, or null.
export async function getCustomerIdForAdmin(adminUserId: string): Promise<string | null> {
  const r = await db.execute<{ customer_user_id: string | null }>(
    sql`SELECT customer_user_id FROM users WHERE id = ${adminUserId} LIMIT 1`,
  );
  return ((r as any).rows?.[0]?.customer_user_id as string | null) ?? null;
}

// Mirror a linked fan's OAuth identities onto the admin row so
// "Sign in with Google/Apple" resolves on the admin shell too. The
// admin_identities unique (provider, provider_user_id) means a sub
// already attached to a DIFFERENT admin is skipped — never re-pointed.
export async function mirrorCustomerIdentitiesToAdmin(
  customerId: string,
  adminUserId: string,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO admin_identities (user_id, provider, provider_user_id, email, linked_at)
      SELECT ${adminUserId}, provider, provider_user_id, email, NOW()
        FROM customer_identities
       WHERE user_id = ${customerId}
      ON CONFLICT DO NOTHING
    `);
  } catch (e: any) {
    console.warn(`[identity-link] mirror customer→admin failed (${adminUserId}): ${e?.message ?? e}`);
  }
}

// Reverse mirror: copy a linked admin's OAuth identities onto the fan row
// so a Google/Apple sign-in for a human who only ever attached the
// provider on the admin shell still resolves on the consumer player.
// The fan store is canonical, so convergence must run both ways. The
// customer_identities unique (provider, provider_user_id) skips a sub
// already attached to a DIFFERENT fan — never re-pointed.
export async function mirrorAdminIdentitiesToCustomer(
  adminUserId: string,
  customerId: string,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO customer_identities (user_id, provider, provider_user_id, email, linked_at)
      SELECT ${customerId}, provider, provider_user_id, email, NOW()
        FROM admin_identities
       WHERE user_id = ${adminUserId}
      ON CONFLICT DO NOTHING
    `);
  } catch (e: any) {
    console.warn(`[identity-link] mirror admin→customer failed (${customerId}): ${e?.message ?? e}`);
  }
}

// Link an admin (users) row to a fan (customer_users) row. Idempotent.
// Sets the link (only when currently null), fills the fan password from
// the admin row when the fan has none (never overwrites, never copies an
// OAuth-only placeholder), and mirrors OAuth identities BOTH ways so a
// single provider sign-in resolves on either shell.
export async function linkAdminToCustomer(adminUserId: string, customerId: string): Promise<void> {
  await db.execute(
    sql`UPDATE users SET customer_user_id = ${customerId}
        WHERE id = ${adminUserId} AND customer_user_id IS NULL`,
  );
  // Fill the canonical (fan) credential when it's empty so the admin
  // password keeps working after the fan row becomes authoritative.
  // Never overwrite an existing fan password, and never copy an
  // `!oauth-only:` placeholder — that is not a hashed password and would
  // corrupt the canonical store + break forgot-password.
  await db.execute(sql`
    UPDATE customer_users c
       SET password = u.password
      FROM users u
     WHERE u.id = ${adminUserId}
       AND c.id = ${customerId}
       AND c.password IS NULL
       AND u.password IS NOT NULL
       AND u.password NOT LIKE '!oauth-only:%'
  `);
  await mirrorCustomerIdentitiesToAdmin(customerId, adminUserId);
  await mirrorAdminIdentitiesToCustomer(adminUserId, customerId);
}

// Resolve the linked counterpart shell+id for a given shell row, or null.
async function linkedCounterpart(
  kind: "admin" | "customer",
  userId: string,
): Promise<{ kind: "admin" | "customer"; userId: string } | null> {
  if (kind === "admin") {
    const custId = await getCustomerIdForAdmin(userId);
    return custId ? { kind: "customer", userId: custId } : null;
  }
  const adminId = await getAdminIdForCustomer(userId);
  return adminId ? { kind: "admin", userId: adminId } : null;
}

// Ongoing identity ATTACH convergence: after a provider is attached on one
// shell (link-from-profile, invite-accept, OAuth signup), mirror it onto
// the linked counterpart so the same Google/Apple sign-in resolves on both
// shells. ON CONFLICT skips a sub already attached elsewhere. Best-effort.
export async function mirrorIdentityToLinked(
  kind: "admin" | "customer",
  userId: string,
  data: { provider: string; providerUserId: string; email: string | null },
): Promise<void> {
  try {
    const cp = await linkedCounterpart(kind, userId);
    if (!cp) return;
    if (cp.kind === "admin") {
      await db.execute(sql`
        INSERT INTO admin_identities (user_id, provider, provider_user_id, email, linked_at)
        VALUES (${cp.userId}, ${data.provider}, ${data.providerUserId}, ${data.email}, NOW())
        ON CONFLICT DO NOTHING
      `);
    } else {
      await db.execute(sql`
        INSERT INTO customer_identities (user_id, provider, provider_user_id, email, linked_at)
        VALUES (${cp.userId}, ${data.provider}, ${data.providerUserId}, ${data.email}, NOW())
        ON CONFLICT DO NOTHING
      `);
    }
  } catch (e: any) {
    console.warn(`[identity-link] attach mirror failed (${kind} ${userId}): ${e?.message ?? e}`);
  }
}

// Ongoing identity DETACH convergence: unlink an identity on the current
// shell AND remove the matching (provider, sub) on the linked counterpart,
// so removing a provider on one shell removes it everywhere. Returns true
// when the current-shell row was actually deleted (so the route 404s the
// same way as before). The counterpart delete is best-effort.
export async function unlinkIdentityEverywhere(
  kind: "admin" | "customer",
  userId: string,
  identityId: string,
): Promise<boolean> {
  // Delete on the current shell, returning provider+sub so we can mirror.
  const del = await db.execute<{ provider: string; provider_user_id: string }>(
    kind === "admin"
      ? sql`DELETE FROM admin_identities WHERE id = ${identityId} AND user_id = ${userId}
             RETURNING provider, provider_user_id`
      : sql`DELETE FROM customer_identities WHERE id = ${identityId} AND user_id = ${userId}
             RETURNING provider, provider_user_id`,
  );
  const row = (del as any).rows?.[0] as { provider: string; provider_user_id: string } | undefined;
  if (!row) return false;
  try {
    const cp = await linkedCounterpart(kind, userId);
    if (cp) {
      if (cp.kind === "admin") {
        await db.execute(
          sql`DELETE FROM admin_identities WHERE user_id = ${cp.userId}
              AND provider = ${row.provider} AND provider_user_id = ${row.provider_user_id}`,
        );
      } else {
        await db.execute(
          sql`DELETE FROM customer_identities WHERE user_id = ${cp.userId}
              AND provider = ${row.provider} AND provider_user_id = ${row.provider_user_id}`,
        );
      }
    }
  } catch (e: any) {
    console.warn(`[identity-link] detach mirror failed (${kind} ${userId}): ${e?.message ?? e}`);
  }
  return true;
}

// Overwrite the password on BOTH linked rows so the canonical fan store
// and the admin fallback stay identical. Pass whichever id you hold; the
// other side is resolved via the link. Safe when there is no link (only
// the row you passed is written).
export async function writeLinkedPassword(opts: {
  adminUserId?: string;
  customerId?: string;
  hashed: string;
}): Promise<void> {
  const { hashed } = opts;
  let adminId = opts.adminUserId ?? null;
  let custId = opts.customerId ?? null;
  if (adminId && !custId) custId = await getCustomerIdForAdmin(adminId);
  if (custId && !adminId) adminId = await getAdminIdForCustomer(custId);
  if (custId) {
    await db.execute(sql`UPDATE customer_users SET password = ${hashed} WHERE id = ${custId}`);
  }
  if (adminId) {
    await db.execute(sql`UPDATE users SET password = ${hashed} WHERE id = ${adminId}`);
  }
}
