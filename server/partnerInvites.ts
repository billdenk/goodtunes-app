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
