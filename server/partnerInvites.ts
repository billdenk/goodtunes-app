// Task #964 — Decision helpers + raw-SQL builders for the self-serve
// partner invite endpoints (artist→artist/label, label→artist/label).
//
// The carveout rules (who may invite whom), the per-scope outstanding
// cap, the ownership guard on resend/revoke, and the "only expose the
// accept link for live, un-held invites" rule used to live inline inside
// the route closures in `server/routes.ts`, where nothing guarded them.
// They are extracted here so:
//   - the pure predicates are unit-testable (`server/partnerInvites.test.ts`),
//     and a future change can't silently widen who can invite whom or
//     break the outstanding cap without a test going red;
//   - the raw read SQL is an exported builder `scripts/db-query-smoke.ts`
//     can EXPLAIN, so a renamed column is caught before it 500s a partner.
import { sql, type SQL } from "drizzle-orm";

// The two scopes that can run a self-serve invite, and the two roles
// they may mint. Both artist and label partners may invite a fresh
// artist OR label — and nothing else. Widening this set is exactly the
// kind of change the tests are here to catch.
export type PartnerInviterKind = "artist" | "label";
export type SelfServeInviteeRole = "artist" | "label";

export const SELF_SERVE_INVITEE_ROLES: readonly SelfServeInviteeRole[] = ["artist", "label"];

// A label-portal caller picks the invitee role; an artist-portal caller
// uses role-specific endpoints. Either way, only artist/label is allowed.
export function isAllowedSelfServeInviteeRole(role: string): role is SelfServeInviteeRole {
  return role === "artist" || role === "label";
}

// Ownership guard for resend/revoke: a partner may only act on invites
// they themselves sent, matched on the referrer chain stamped at create
// time. Returns false when either the kind or the scope id differs, so
// one partner can never resend/revoke another's invite (→ 403).
export function ownsPartnerInvite(
  invite: { referrerKind?: string | null; referrerScopeId?: string | null } | null | undefined,
  callerKind: PartnerInviterKind,
  callerScopeId: string,
): boolean {
  if (!invite) return false;
  return invite.referrerKind === callerKind && invite.referrerScopeId === callerScopeId;
}

// The scoped GET only exposes the magic accept link for live, un-held
// invites — never revoked / used / held-for-review rows, because the
// token is the bearer credential. `buildUrl` formats the link from the
// (never-leaked) token so this stays transport-agnostic.
export function partnerInviteAcceptUrl(
  invite: {
    token?: string | null;
    usedAt?: unknown;
    revokedAt?: unknown;
    reviewStatus?: string | null;
  },
  buildUrl: (token: string) => string,
): string | null {
  const live = !invite.usedAt && !invite.revokedAt && invite.reviewStatus === "not_required";
  return live && invite.token ? buildUrl(invite.token) : null;
}

// An invite counts against the per-scope outstanding cap while it's
// neither accepted nor revoked and hasn't expired. Mirrors the SQL
// COUNT(*) WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at >
// NOW() used in the central create handler, so the JS-side counter on
// the GET list can't drift from the cap check that gates new invites.
export function isOutstandingInvite(
  invite: { usedAt?: unknown; revokedAt?: unknown; expiresAt: Date | string },
  now: Date = new Date(),
): boolean {
  if (invite.usedAt || invite.revokedAt) return false;
  return new Date(invite.expiresAt) > now;
}

// The cap is reached at-or-above the limit — a partner sitting exactly
// at the cap can't mint one more.
export function isOverOutstandingCap(outstandingCount: number, cap: number): boolean {
  return outstandingCount >= cap;
}

// ─── Raw read SQL builders (EXPLAIN'd by db-query-smoke) ───────────────

// The scoped invite list for one partner (artist or label portal). One
// row per invite this partner sent, newest first, with the scope display
// name + thumbnail COALESCE'd across people/labels by role. `invite_role
// IS NULL` excludes teammate invites — those live in a different surface.
export function sqlPartnerInviteList(referrerKind: PartnerInviterKind, scopeId: string): SQL {
  return sql`
    SELECT ai.id, ai.email, ai.role, ai.role_scope_id AS "roleScopeId", ai.token,
           ai.welcome_note AS "welcomeNote", ai.expires_at AS "expiresAt",
           ai.created_at AS "createdAt", ai.used_at AS "usedAt",
           ai.revoked_at AS "revokedAt", ai.resent_at AS "resentAt",
           ai.invite_role AS "inviteRole", ai.review_status AS "reviewStatus",
           COALESCE(p.name, l.name) AS "scopeName",
           COALESCE(p.photo_url, l.logo_url) AS "scopeThumbUrl"
      FROM admin_invites ai
      LEFT JOIN people p ON p.id = ai.role_scope_id AND ai.role = 'artist'
      LEFT JOIN labels l ON l.id = ai.role_scope_id AND ai.role = 'label'
     WHERE ai.referrer_kind = ${referrerKind}
       AND ai.referrer_scope_id = ${scopeId}
       AND ai.invite_role IS NULL
     ORDER BY ai.created_at DESC
     LIMIT 100
  `;
}

// Idempotency probe: is there already a live, non-teammate invite from
// this partner to this email? Backs the 409 "resend it instead" guard on
// the create endpoints.
export function sqlPartnerOutstandingInviteToEmail(
  referrerKind: PartnerInviterKind,
  email: string,
  scopeId: string,
): SQL {
  return sql`
    SELECT id FROM admin_invites
     WHERE LOWER(email) = ${email}
       AND referrer_kind = ${referrerKind} AND referrer_scope_id = ${scopeId}
       AND invite_role IS NULL
       AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1
  `;
}

// ─── Accept-time referrer stamping (DB side effects) ──────────────────
//
// When an artist invitee accepts, the accept handler resolves the
// invite's referrer chain (referrer_kind / referrer_scope_id) onto the
// new artist's Person row so the existing referral-attribution machinery
// lights up. These were inline `db.execute(sql`...`)` calls inside the
// /api/invites/:token/accept closure; extracted here so:
//   - the exact SQL is column-validated by db-query-smoke, and
//   - the branch logic (which kind stamps what) is integration-tested
//     against a real DB rather than mirrored in a test.
//
// Note the asymmetry that the tests pin: an `artist`-referred invitee
// gets `people.referred_by_person_id` stamped AND an open
// `artist_referrals` row; a `label`-referred invitee gets NOTHING on the
// Person row — a label's provenance lives only on the invite row
// (referrer_kind='label'), because labels carry no per-unit referral.

// Stamp the invitee artist's referrer Person, but only if not already
// referred (NULL-guarded so a stale re-accept can't re-home them).
export function sqlStampReferredByPerson(inviteePersonId: string, referrerPersonId: string): SQL {
  return sql`UPDATE people SET referred_by_person_id = ${referrerPersonId} WHERE id = ${inviteePersonId} AND referred_by_person_id IS NULL`;
}

// Stamp the invitee artist's referring organization (NPO), NULL-guarded.
export function sqlStampReferredByOrg(inviteePersonId: string, referrerOrgId: string): SQL {
  return sql`UPDATE people SET referred_by_org_id = ${referrerOrgId} WHERE id = ${inviteePersonId} AND referred_by_org_id IS NULL`;
}

// Open the per-album referral row with album_id NULL until the invitee
// starts a release. ON CONFLICT keys off the COALESCE(album_id,'')
// expression index, so a duplicate accept is a no-op.
export function sqlOpenArtistReferral(referrerPersonId: string, inviteePersonId: string): SQL {
  return sql`
    INSERT INTO artist_referrals (referrer_person_id, invitee_person_id, album_id)
    VALUES (${referrerPersonId}, ${inviteePersonId}, NULL)
    ON CONFLICT (referrer_person_id, invitee_person_id, COALESCE(album_id, '')) DO NOTHING
  `;
}

// Read an ambassador Person's parent NPO so an ambassador-referred
// artist can inherit it (the NPO's roll-up then includes the new artist).
export function sqlAmbassadorOrg(ambassadorPersonId: string): SQL {
  return sql`SELECT referred_by_org_id AS org FROM people WHERE id = ${ambassadorPersonId} LIMIT 1`;
}

// A minimal executor shape so callers can pass `db.execute` (or a tx) and
// these helpers stay transport-agnostic / unit-drivable.
export type SqlExecutor = (q: SQL) => Promise<{ rows?: any[] } | any>;

// Apply the full accept-time referrer stamp for an artist invitee. This
// is the single source of truth the /accept handler delegates to, so a
// regression in the branch logic (e.g. a label-referred invitee wrongly
// stamping the Person, or ambassador inheritance dropping) surfaces in
// server/partnerInvites.db.test.ts. No-ops for non-artist invitees and
// for any invite missing a referrer chain. Throws on SQL failure — the
// caller keeps its best-effort try/catch.
export async function applyArtistAcceptReferral(
  exec: SqlExecutor,
  invite: {
    role?: string | null;
    roleScopeId?: string | null;
    referrerKind?: string | null;
    referrerScopeId?: string | null;
  },
): Promise<void> {
  const { role, roleScopeId, referrerKind, referrerScopeId } = invite;
  if (role !== "artist" || !roleScopeId || !referrerKind || !referrerScopeId) return;
  if (referrerKind === "artist") {
    await exec(sqlStampReferredByPerson(roleScopeId, referrerScopeId));
    await exec(sqlOpenArtistReferral(referrerScopeId, roleScopeId));
  } else if (referrerKind === "non_profit") {
    await exec(sqlStampReferredByOrg(roleScopeId, referrerScopeId));
  } else if (referrerKind === "ambassador") {
    const o = await exec(sqlAmbassadorOrg(referrerScopeId));
    const ambOrg = ((o as any)?.rows ?? [])[0]?.org ?? null;
    await exec(sqlStampReferredByPerson(roleScopeId, referrerScopeId));
    if (ambOrg) await exec(sqlStampReferredByOrg(roleScopeId, ambOrg));
  }
  // referrerKind === "label" (and any other kind) intentionally stamps
  // nothing on the Person — provenance stays on the invite row.
}

// ─── Revoke-time placeholder cleanup (DB side effects) ────────────────
//
// Revoking an un-accepted artist/label invite should delete the
// placeholder Person/Label it minted — but ONLY when nothing else
// depends on that scope. The guard counts everything that would make the
// scope "in use": releases under it, an admin login bound to it, or any
// OTHER invite still pointing at it. A wrong guard either leaks orphan
// rows into the catalog or deletes a scope that's actually in use.

// COUNT(*) of everything that pins a placeholder scope row in place.
// Zero ⇒ safe to delete the placeholder.
export function sqlPlaceholderScopeInUseCount(
  scopeKind: PartnerInviterKind,
  scopeId: string,
  excludeInviteId: string,
): SQL {
  const albumCol = scopeKind === "label" ? sql`label_id` : sql`primary_artist_id`;
  return sql`
    SELECT (
      (SELECT COUNT(*) FROM albums WHERE ${albumCol} = ${scopeId}) +
      (SELECT COUNT(*) FROM users WHERE role = ${scopeKind} AND role_scope_id = ${scopeId}) +
      (SELECT COUNT(*) FROM admin_invites WHERE role_scope_id = ${scopeId} AND id <> ${excludeInviteId})
    )::int AS ct
  `;
}

// Delete the placeholder scope row iff the in-use guard is zero. Returns
// true when the placeholder was removed, false when it was preserved
// because something still references it. The single source of truth the
// revoke handlers delegate to.
export async function revokePlaceholderIfUnused(
  exec: SqlExecutor,
  scopeKind: PartnerInviterKind,
  scopeId: string,
  excludeInviteId: string,
): Promise<boolean> {
  const guard = await exec(sqlPlaceholderScopeInUseCount(scopeKind, scopeId, excludeInviteId));
  const ct = ((guard as any)?.rows ?? [])[0]?.ct ?? 0;
  if (ct !== 0) return false;
  await exec(
    scopeKind === "label"
      ? sql`DELETE FROM labels WHERE id = ${scopeId}`
      : sql`DELETE FROM people WHERE id = ${scopeId}`,
  );
  return true;
}

// Person lookup keyed on contact email, shared by the press + NPO invite
// flows. People are keyed on `people.contact_email` — there is NO
// `people.email` column (raw SQL referencing one 500'd the press invite
// flow in production). Soft-deleted people never match, so a trashed
// profile can't be silently resurrected by a new invite.
export function sqlPersonIdByContactEmail(emailLower: string): SQL {
  return sql`
    SELECT id FROM people
    WHERE LOWER(contact_email) = ${emailLower} AND deleted_at IS NULL
    LIMIT 1
  `;
}
