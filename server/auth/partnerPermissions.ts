// Task #79 — Per-partner permissions + post-sale edit lock.
//
// This module owns the gating logic shared by every partner-touchable
// admin mutation:
//
//   1. Resolve the caller's role + scope (via getUserRole).
//   2. Resolve the target row's owning scope (album → labelId or
//      primaryArtistId; song → its album → same).
//   3. If caller is super_admin, always pass.
//   4. If caller is a partner role:
//      - their roleScopeId must match the target's scope id
//      - their partner_permissions row must have the requested verb
//      - if the verb is `edit_metadata` AND the target album is
//        post-sale locked (`first_sold_at` is non-null), require an
//        active admin_overrides row OR write a pending_changes row
//        instead of letting the mutation through
//      - if `metadata_edits_require_approval` is true, divert into the
//        pending_changes queue regardless of lock state
//   5. Otherwise 403.
//
// The "divert into queue" outcome is signalled to the route by setting
// `req.partnerGate.divert = true`. The route checks this and, instead
// of calling storage.updateX, calls storage.createPendingChange with
// the request body as the patch.

import type { Request, Response, NextFunction } from "express";
import { sql, and, eq, ne, isNull, gt, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  albums,
  songs,
  partnerPermissions,
  adminOverrides,
  pendingChanges,
  ADMIN_ROLES,
  PARTNER_SCOPE_KINDS,
  type AdminRole,
  type PartnerPermissionVerb,
  type PartnerScopeKind,
} from "@shared/schema";
import {
  getUserRole,
  findMembershipForScope,
  rebuildMembershipOverrides,
  type UserRoleInfo,
  type ResolvedMembership,
} from "./roles";

export type PartnerVerb = PartnerPermissionVerb;

export interface PartnerGate {
  role: UserRoleInfo["role"];
  roleScopeId: string | null;
  // Resolved scope of the target row.
  targetScope: { kind: PartnerScopeKind; id: string } | null;
  // Album the request ultimately touches (for lock checks + denorm on
  // pending_changes rows).
  albumId: string | null;
  // True when the route should write to pending_changes instead of
  // applying the patch directly.
  divert: boolean;
  // Reason for divert ("approval_required" | "post_sale_lock"), surfaced
  // in the response so the partner UI can show the right hint.
  divertReason?: "approval_required" | "post_sale_lock";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      partnerGate?: PartnerGate;
      // Per-request memo of which album overrides have already been
      // "consumed" by an earlier gate check in the same request. Stops
      // a multi-gate route (e.g. song PUT that wants both edit_metadata
      // AND upload_masters) from burning two single-shot overrides for
      // one mutation.
      partnerOverrideConsumed?: Set<string>;
    }
  }
}

/**
 * Look up the parent album for a credit row (writer or performer).
 * Returns `null` if the row doesn't exist. Used by the credit-mutation
 * routes so they can call `gateAlbumRoute(... 'edit_metadata', albumId)`
 * — credits are metadata, so the partner's edit_metadata verb + the
 * post-sale lock both apply.
 */
export async function getAlbumIdForCreditRow(
  kind: "writer" | "performer",
  creditRowId: string,
): Promise<string | null> {
  const table = kind === "writer" ? "track_writers" : "track_performers";
  const rows = await db.execute(
    sql`SELECT s.album_id AS "albumId"
        FROM ${sql.raw(table)} c
        JOIN songs s ON s.id = c.song_id
        WHERE c.id = ${creditRowId}
        LIMIT 1`,
  );
  const r = (rows as any).rows?.[0] ?? (rows as any)[0];
  return r?.albumId ?? null;
}

// Task #2896 — a label-attached album has TWO candidate owning scopes:
// the label (labelId) AND the primary artist (primaryArtistId). Read
// surfaces already treat "primary artist" as in-scope (artist dashboard /
// roster scope is primary_artist OR payout-owner); the write gates must
// honor the same relationship. Candidates are ordered label-first so the
// legacy single-scope resolution (`candidates[0]`) is byte-for-byte
// unchanged for every existing caller.
export function albumScopeCandidates(row: {
  labelId: string | null;
  primaryArtistId: string | null;
}): { kind: PartnerScopeKind; id: string }[] {
  const out: { kind: PartnerScopeKind; id: string }[] = [];
  if (row.labelId) out.push({ kind: "label", id: row.labelId });
  if (row.primaryArtistId) out.push({ kind: "artist", id: row.primaryArtistId });
  return out;
}

// Task #2896 — given an album, find a membership the user holds in ANY of
// the album's candidate scopes (skipping `exclude`, which the caller
// already tried). Fail-closed: returns null when the user is in neither
// scope. Used by the gates to let an album's primary artist through even
// when the album also carries a labelId (label-first resolution would
// otherwise 403 them "Out of scope").
export async function findAlbumScopeMembership(
  userId: string,
  albumId: string,
  exclude: { kind: PartnerScopeKind; id: string } | null,
): Promise<{ scope: { kind: PartnerScopeKind; id: string }; match: ResolvedMembership } | null> {
  const [row] = await db
    .select({ labelId: albums.labelId, primaryArtistId: albums.primaryArtistId })
    .from(albums)
    .where(eq(albums.id, albumId));
  if (!row) return null;
  for (const c of albumScopeCandidates(row)) {
    if (exclude && c.kind === exclude.kind && c.id === exclude.id) continue;
    const m = await findMembershipForScope(userId, c.kind, c.id);
    if (m) return { scope: c, match: m };
  }
  return null;
}

// Resolve target → { scope, albumId } for the two row kinds we gate
// today. Extend here if we widen the surface. `scopes` carries EVERY
// candidate owning scope (label first, then artist) so the gate can match
// the caller's membership against either; `scope` stays the legacy
// label-first primary for callers that only want one.
async function resolveTarget(targetTable: "albums" | "songs", targetId: string): Promise<{
  scope: { kind: PartnerScopeKind; id: string } | null;
  scopes: { kind: PartnerScopeKind; id: string }[];
  albumId: string | null;
  firstSoldAt: Date | null;
  // Task #2468 — pre-sunrise flag drives the artist-owner phase policy
  // (prepping = edit directly; released = request-only).
  isPrepping: boolean;
} | null> {
  if (targetTable === "albums") {
    const [row] = await db
      .select({ id: albums.id, labelId: albums.labelId, primaryArtistId: albums.primaryArtistId, firstSoldAt: albums.firstSoldAt, isPrepping: albums.isPrepping })
      .from(albums)
      .where(eq(albums.id, targetId));
    if (!row) return null;
    const scopes = albumScopeCandidates(row);
    return { scope: scopes[0] ?? null, scopes, albumId: row.id, firstSoldAt: row.firstSoldAt ?? null, isPrepping: !!row.isPrepping };
  }
  // songs
  const [row] = await db
    .select({
      albumId: songs.albumId,
      labelId: albums.labelId,
      primaryArtistId: albums.primaryArtistId,
      firstSoldAt: albums.firstSoldAt,
      isPrepping: albums.isPrepping,
    })
    .from(songs)
    .innerJoin(albums, eq(albums.id, songs.albumId))
    .where(eq(songs.id, targetId));
  if (!row) return null;
  const scopes = albumScopeCandidates(row);
  return { scope: scopes[0] ?? null, scopes, albumId: row.albumId, firstSoldAt: row.firstSoldAt ?? null, isPrepping: !!row.isPrepping };
}

// Task #351 — verb → partner_permissions column name.
type VerbCol = "editMetadata" | "uploadMasters" | "mapShopify" | "managePayouts" | "inviteSubusers" | "editCreditsAndGear";
export function verbToColumn(verb: PartnerVerb): VerbCol {
  switch (verb) {
    case "edit_metadata": return "editMetadata";
    case "upload_masters": return "uploadMasters";
    case "map_shopify": return "mapShopify";
    case "manage_payouts": return "managePayouts";
    case "invite_subusers": return "inviteSubusers";
    case "edit_credits_and_gear": return "editCreditsAndGear";
  }
}

// Task #351 — Per-(scope, user, verb) override lookup. Returns null
// when no override row exists (caller falls back to the scope-wide
// partner_permissions row).
//
// Implication rule: an override on `edit_metadata` is treated as
// implying `edit_credits_and_gear` (credits + gear ARE metadata; the
// narrow verb only exists so a Team member can be limited to credits
// without also being able to retitle the album). The implication is
// one-way — an `edit_credits_and_gear` override does NOT grant
// `edit_metadata`.
export async function getUserPermissionOverride(
  scopeKind: PartnerScopeKind,
  scopeId: string,
  userId: string,
  verb: PartnerVerb,
): Promise<boolean | null> {
  const r = await db.execute<{ granted: boolean }>(sql`
    SELECT granted FROM partner_permission_overrides
    WHERE scope_kind = ${scopeKind} AND scope_id = ${scopeId}
      AND user_id = ${userId} AND verb = ${verb}
    LIMIT 1
  `);
  const row = (r as any).rows?.[0];
  if (row) return !!row.granted;
  // Implication: edit_metadata override → edit_credits_and_gear.
  if (verb === "edit_credits_and_gear") {
    const r2 = await db.execute<{ granted: boolean }>(sql`
      SELECT granted FROM partner_permission_overrides
      WHERE scope_kind = ${scopeKind} AND scope_id = ${scopeId}
        AND user_id = ${userId} AND verb = 'edit_metadata'
      LIMIT 1
    `);
    const row2 = (r2 as any).rows?.[0];
    if (row2 && row2.granted) return true;
  }
  return null;
}

// Task #2468 — the self-serve verbs the OWNER of an artist scope (the
// primary artist) may run on their own release without an explicit
// grant. A brand-new artist holds no partner_permissions row and no
// per-user overrides, so without this implicit default they'd be locked
// out of their own catalog (allowed=false → 403 on every edit). The
// grant is runtime-only — we deliberately do NOT seed a
// partner_permissions row, whose metadataEditsRequireApproval default
// (true) would wrongly divert even prepping edits into the review queue.
export const OWNER_SELF_SERVE_VERBS: PartnerVerb[] = [
  "edit_metadata",
  "upload_masters",
  "edit_credits_and_gear",
  "manage_payouts",
];

// The primary artist (scope owner) is the membership on an `artist`
// scope with no sub_role. Team ('team') and manager ('manager')
// teammates share the same role + scope but carry a sub_role, so this
// deliberately excludes them — they get only what their explicit
// per-user overrides grant, never the implicit owner default. This is
// what stops a credits-only Team member from being silently escalated
// into a full metadata editor.
export function isArtistScopeOwner(
  scopeKind: PartnerScopeKind,
  match: Pick<ResolvedMembership, "role" | "subRole">,
): boolean {
  return scopeKind === "artist" && match.role === "artist" && match.subRole == null;
}

// Task #2468 — single source of truth for the verb decision, shared by
// requirePartnerPermission, partnerEditGate, checkPartnerVerbForScope
// AND getAlbumEditAccess so the four can never drift. Precedence:
//   1. explicit per-user override (grant OR deny) always wins — a
//      super-admin can still revoke an owner's default with a deny.
//   2. scope-wide partner_permissions grant.
//   3. implicit artist-owner default (self-serve verbs only).
export function resolveVerbAllowed(
  scopeKind: PartnerScopeKind,
  match: Pick<ResolvedMembership, "role" | "subRole">,
  perms: Awaited<ReturnType<typeof getPartnerPermissions>>,
  verb: PartnerVerb,
  override: boolean | null,
): boolean {
  if (override !== null) return override;
  const verbCol = verbToColumn(verb);
  if (perms && perms[verbCol]) return true;
  if (isArtistScopeOwner(scopeKind, match) && OWNER_SELF_SERVE_VERBS.includes(verb)) {
    return true;
  }
  return false;
}

// Async convenience wrapper — fetches perms (unless supplied) + the
// per-user override, then applies resolveVerbAllowed. Used by
// getAlbumEditAccess which needs a per-verb answer without duplicating
// the precedence rules.
export async function resolvePartnerVerb(
  userId: string,
  verb: PartnerVerb,
  scope: { kind: PartnerScopeKind; id: string },
  match: Pick<ResolvedMembership, "role" | "subRole">,
  perms?: Awaited<ReturnType<typeof getPartnerPermissions>>,
): Promise<boolean> {
  const p = perms !== undefined ? perms : await getPartnerPermissions(scope.kind, scope.id);
  const override = await getUserPermissionOverride(scope.kind, scope.id, userId, verb);
  return resolveVerbAllowed(scope.kind, match, p, verb, override);
}

// Task #699 — write the per-user permission overrides that distinguish a
// press Owner/Admin from Staff at invite-accept (or direct-grant) time.
// Both tiers live on the manufacturer scope:
//   • owner_admin → all six verbs GRANTED (full press scope, incl.
//     invite_subusers so they can invite artists from any shell).
//   • staff       → invite_subusers GRANTED, every editing verb DENIED
//     (metadata / masters / shopify / payouts / credits+gear). The
//     denials are what `pressUserCanEdit` reads to lock the press portal
//     editing surfaces and what the partner verb checks read to 403 any
//     edit attempt server-side.
export async function applyPressTeammateOverrides(
  userId: string,
  pressId: string,
  level: "owner_admin" | "staff",
  byUserId: string | null,
): Promise<void> {
  const grants: Record<PartnerVerb, boolean> =
    level === "staff"
      ? {
          invite_subusers: true,
          edit_metadata: false,
          upload_masters: false,
          map_shopify: false,
          manage_payouts: false,
          edit_credits_and_gear: false,
        }
      : {
          invite_subusers: true,
          edit_metadata: true,
          upload_masters: true,
          map_shopify: true,
          manage_payouts: true,
          edit_credits_and_gear: true,
        };
  for (const [verb, granted] of Object.entries(grants)) {
    await db.execute(sql`
      INSERT INTO partner_permission_overrides (scope_kind, scope_id, user_id, verb, granted, updated_by_user_id, updated_at)
      VALUES ('manufacturer', ${pressId}, ${userId}, ${verb}, ${granted}, ${byUserId}, NOW())
      ON CONFLICT (scope_kind, scope_id, user_id, verb)
      DO UPDATE SET granted = EXCLUDED.granted, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()
    `);
  }
  // Task #1036 — mirror the new override state into the user's
  // membership for this press scope (no-op when the table is absent).
  await rebuildMembershipOverrides(userId, "manufacturer", pressId);
}

// Task #2860 — grant `invite_subusers` on the label scope when a label
// admin is granted (invite-accept, partner-contacts add, or direct
// grant), mirroring how press teammates receive it. Labels have no
// Owner/Staff tier model (out of scope), so every label grant gets the
// invite verb. ON CONFLICT DO NOTHING so an operator's explicit deny
// override (written from the Permissions tab) is never overwritten.
export async function applyLabelOwnerInviteGrant(
  userId: string,
  labelId: string,
  byUserId: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO partner_permission_overrides (scope_kind, scope_id, user_id, verb, granted, updated_by_user_id, updated_at)
    VALUES ('label', ${labelId}, ${userId}, 'invite_subusers', true, ${byUserId}, NOW())
    ON CONFLICT (scope_kind, scope_id, user_id, verb) DO NOTHING
  `);
  // Mirror the override state into the user's membership for this label
  // scope (no-op when the memberships table is absent).
  await rebuildMembershipOverrides(userId, "label", labelId);
}

// Task #699 — can this user edit the given press (settings, masters,
// invoices, payouts, customer routing)? Super_admin / unscoped admin
// always can. A scoped manufacturer admin can UNLESS they're Staff —
// detected by an explicit edit_metadata=false override on the press
// scope (written by applyPressTeammateOverrides). Owner/Admin have it
// granted (or no override at all), so they pass. Used both by the
// press-portal `requirePressEditor` middleware and the /me payload so
// the UI can disable controls before the user even tries.
export async function pressUserCanEdit(userId: string, pressId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  if (!role) return false;
  if (role.role === "super_admin" || role.role === "admin") return true;
  // Task #1036 — the account must actually hold a manufacturer membership
  // for THIS press, resolved from the membership SET rather than the
  // primary hat, so a multi-hat user is judged on the right scope. For a
  // single-membership press admin this is identical to the old implicit
  // (role===manufacturer && roleScopeId===pressId) that requirePressScope
  // already proved upstream.
  if (!(await findMembershipForScope(userId, "manufacturer", pressId))) return false;
  const ov = await getUserPermissionOverride("manufacturer", pressId, userId, "edit_metadata");
  return ov !== false;
}

export async function getPartnerPermissions(
  scopeKind: PartnerScopeKind,
  scopeId: string,
) {
  const [row] = await db
    .select()
    .from(partnerPermissions)
    .where(and(eq(partnerPermissions.scopeKind, scopeKind), eq(partnerPermissions.scopeId, scopeId)));
  return row ?? null;
}

// Task #1791 — single source of truth for *which* invites a caller may
// create, so the Invites UI can render only the partner types / roles
// the server will actually accept. This MUST mirror the carveouts in the
// POST /api/admin/invites gate (the authoritative check); it is surfaced
// via GET /api/me/role purely so the client doesn't re-implement (and
// drift from) that logic.
//
//   • super_admin              → unrestricted power form (every role,
//                                referrer attribution, team invites).
//   • scoped partner + verb on → quick partner invite only, limited to:
//       artist       → artist | non_profit
//       label        → artist | label
//       manufacturer → artist | label
//       fulfillment/vendor/manager → may only grow their own team
//                                    (gate forces role+scope to own).
//   • everyone else (unscoped admin, non_profit caller, or any partner
//     missing invite_subusers) → can't invite at all.
export interface InviteCapability {
  canInvite: boolean;
  // Roles the caller may target. Drives both the quick partner-type
  // cards and the advanced role dropdown on the client.
  allowedRoles: AdminRole[];
  // Only super-admins get the full power form (referrer + team invite).
  allowAdvanced: boolean;
}

export function computeInviteCapability(
  role: AdminRole | string | null | undefined,
  roleScopeId: string | null,
  canInviteSubusers: boolean,
): InviteCapability {
  if (role === "super_admin") {
    return { canInvite: true, allowedRoles: [...ADMIN_ROLES], allowAdvanced: true };
  }
  // Only scoped partners holding invite_subusers may invite. Unscoped
  // `admin`, the non_profit role (absent from PARTNER_SCOPE_KINDS), and
  // anyone missing the verb are all rejected by the gate.
  if (
    !PARTNER_SCOPE_KINDS.includes(role as any) ||
    !roleScopeId ||
    !canInviteSubusers
  ) {
    return { canInvite: false, allowedRoles: [], allowAdvanced: false };
  }
  let allowedRoles: AdminRole[];
  switch (role) {
    case "artist":
      allowedRoles = ["artist", "non_profit"];
      break;
    case "label":
      allowedRoles = ["artist", "label"];
      break;
    case "manufacturer":
      allowedRoles = ["artist", "label"];
      break;
    default:
      // fulfillment / vendor / manager — the gate forces the new invite
      // to the caller's own role + scope (grow your own team).
      allowedRoles = [role as AdminRole];
  }
  return { canInvite: true, allowedRoles, allowAdvanced: false };
}

export async function upsertPartnerPermissions(
  scopeKind: PartnerScopeKind,
  scopeId: string,
  patch: Partial<{
    editMetadata: boolean;
    uploadMasters: boolean;
    mapShopify: boolean;
    managePayouts: boolean;
    inviteSubusers: boolean;
    editCreditsAndGear: boolean;
    metadataEditsRequireApproval: boolean;
  }>,
  updatedByUserId: string,
) {
  const existing = await getPartnerPermissions(scopeKind, scopeId);
  if (existing) {
    const [updated] = await db
      .update(partnerPermissions)
      .set({ ...patch, updatedByUserId, updatedAt: new Date() })
      .where(eq(partnerPermissions.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(partnerPermissions)
    .values({
      scopeKind,
      scopeId,
      editMetadata: patch.editMetadata ?? false,
      uploadMasters: patch.uploadMasters ?? false,
      mapShopify: patch.mapShopify ?? false,
      managePayouts: patch.managePayouts ?? false,
      inviteSubusers: patch.inviteSubusers ?? false,
      editCreditsAndGear: patch.editCreditsAndGear ?? false,
      metadataEditsRequireApproval: patch.metadataEditsRequireApproval ?? true,
      updatedByUserId,
    })
    .returning();
  return created;
}

// Find an active (un-consumed, un-expired) override row for the album,
// and atomically consume it (single-shot if no expiresAt).
//
// When `req` is provided, the result is memoized on the request so a
// second gate in the same request (e.g. song PUT runs edit_metadata
// then upload_masters) doesn't re-consume — and therefore can't burn
// a partner's one allowed override on a single user save.
async function consumeActiveOverride(albumId: string, userId: string, req?: Request): Promise<boolean> {
  if (req) {
    req.partnerOverrideConsumed ??= new Set();
    if (req.partnerOverrideConsumed.has(albumId)) return true;
  }
  const now = new Date();
  const [row] = await db
    .select()
    .from(adminOverrides)
    .where(
      and(
        eq(adminOverrides.targetTable, "albums"),
        eq(adminOverrides.targetId, albumId),
        isNull(adminOverrides.consumedAt),
        or(isNull(adminOverrides.expiresAt), gt(adminOverrides.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!row) return false;
  // Single-shot consumption when no expiresAt; otherwise leave open
  // until expiry but stamp consumedAt on first use for audit.
  if (!row.expiresAt) {
    await db
      .update(adminOverrides)
      .set({ consumedAt: now, consumedByUserId: userId })
      .where(eq(adminOverrides.id, row.id));
  } else if (!row.consumedAt) {
    // Stamp first-use audit without invalidating remaining window.
    await db
      .update(adminOverrides)
      .set({ consumedByUserId: userId })
      .where(eq(adminOverrides.id, row.id));
  }
  if (req) req.partnerOverrideConsumed!.add(albumId);
  return true;
}

// Task #2468 — verbs whose edits ARE the historical record and CAN be
// represented as a review-queue patch, so a released / post-sale owner
// edit diverts to pending_changes instead of applying live. Master
// audio is deliberately NOT here: a binary master can't be a queue
// patch, so it request-a-changes (hard 403) instead.
export const METADATA_CLASS_VERBS: PartnerVerb[] = ["edit_metadata", "edit_credits_and_gear"];

// Task #2468 — shown when an artist-scope owner tries to change master
// audio (or add a track carrying a master) after their release is live.
// Carries `requestChange` so the client offers the generic
// "Request a change" affordance instead of a dead-disabled control.
export const MASTERS_REQUEST_CHANGE_MESSAGE =
  "Master audio is locked once your release is live. Use \u201CRequest a change\u201D and GoodTunes will update it for you.";

// Task #2468 — same idea for the commerce pricing writes, which have no
// review queue to divert into (so a released/post-sale owner reprice is
// a request-a-change rather than a silent queue).
export const PRICING_REQUEST_CHANGE_MESSAGE =
  "Pricing is locked once your release is live. Use \u201CRequest a change\u201D and GoodTunes will help you update it.";

// Task #2468 — outcome of the artist-owner PHASE policy. Kept separate
// from the legacy partner lock/approval path (which stays byte-for-byte
// for operators, labels, and artist teammates). Only the primary artist
// (isArtistScopeOwner) editing their OWN release reaches this.
export type ArtistPhaseOutcome =
  | { kind: "allow" }
  | { kind: "divert"; reason: "approval_required" | "post_sale_lock" }
  | { kind: "request_change" };

/**
 * Task #2468 — phase policy for the OWNER of an artist scope editing
 * their OWN release. Returns `null` for everyone else (operators
 * short-circuit above every gate; non-owner partners keep the legacy
 * lock/approval path), which callers treat as "run the legacy path".
 *
 * Phases (owner only):
 *   • prepping (is_prepping=true, pre-sunrise) → allow (edit directly)
 *   • released (is_prepping=false) pre-sale    → metadata-class diverts
 *                                                to the review queue;
 *                                                masters request-a-change
 *   • post-sale (first_sold_at set)            → metadata-class consumes
 *                                                an active admin override
 *                                                if present, else diverts
 *                                                (reason post_sale_lock —
 *                                                NEVER a hard 403); masters
 *                                                request-a-change
 *
 * Consumes at most one single-shot override (memoized per-request via
 * consumeActiveOverride) and only on the post-sale metadata branch, so
 * it can never double-burn against the legacy path (which this owner
 * never reaches).
 */
export async function resolveArtistOwnerPhaseOutcome(
  verb: PartnerVerb,
  scopeKind: PartnerScopeKind,
  match: Pick<ResolvedMembership, "role" | "subRole">,
  albumId: string | null,
  phase: { isPrepping: boolean; firstSoldAt: Date | null },
  userId: string,
  req?: Request,
): Promise<ArtistPhaseOutcome | null> {
  if (!isArtistScopeOwner(scopeKind, match)) return null;
  // Masters / track files can't be represented as a review-queue patch.
  if (verb === "upload_masters") {
    return phase.isPrepping ? { kind: "allow" } : { kind: "request_change" };
  }
  if (METADATA_CLASS_VERBS.includes(verb)) {
    if (phase.isPrepping) return { kind: "allow" };
    if (!phase.firstSoldAt) return { kind: "divert", reason: "approval_required" };
    const consumed = albumId ? await consumeActiveOverride(albumId, userId, req) : false;
    return consumed ? { kind: "allow" } : { kind: "divert", reason: "post_sale_lock" };
  }
  // manage_payouts (+ anything else the owner self-serves) is operational
  // configuration, not the record — applies directly regardless of phase.
  return { kind: "allow" };
}

/**
 * Express middleware that gates a partner-touchable mutation by verb.
 *
 * @param verb            permission verb on partner_permissions
 * @param resolveTargetId how to read the target id off the request
 * @param targetTable     "albums" or "songs" — drives scope resolution
 */
export function requirePartnerPermission(
  verb: PartnerVerb,
  targetTable: "albums" | "songs",
  resolveTargetId: (req: Request) => string,
  opts: {
    /** Task #499 — skip the post-sale lock for this gate while still
     *  enforcing scope + the per-verb permission grant. Used for
     *  operational/routing fields (sell mode, physical format,
     *  quote-lock, anticipated track count) that are platform
     *  configuration, not historical metadata. The matching
     *  vendor-pricing-bypasses-post-sale-lock rule in
     *  docs/admin-conventions.md is the precedent. */
    skipPostSaleLock?: boolean;
  } = {},
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user?.isAdmin) return res.status(403).json({ message: "Admin only" });

    const role = await getUserRole(userId);
    if (!role) return res.status(403).json({ message: "No role" });

    const targetId = resolveTargetId(req);
    if (!targetId) return res.status(400).json({ message: "Missing target id" });

    const target = await resolveTarget(targetTable, targetId);
    if (!target) return res.status(404).json({ message: `${targetTable} not found` });

    // Super-admin and unscoped `admin` always pass (admin = god-view ops
    // tier; super-admin is the only one who can hand out overrides, but
    // both can edit metadata without partner gating).
    if (role.role === "super_admin" || role.role === "admin") {
      req.partnerGate = {
        role: role.role,
        roleScopeId: role.roleScopeId,
        targetScope: target.scope,
        albumId: target.albumId,
        divert: false,
      };
      return next();
    }

    // Partner role from here on. Must hold a membership matching the
    // target's scope row (Task #1036 — resolved against the membership
    // SET, not the single users.role_scope_id). Identical yes/no to the
    // legacy `!target.scope || role.role !== kind || roleScopeId !== id`
    // check for single-membership users.
    if (!target.scope) {
      return res.status(403).json({ message: "Out of scope" });
    }
    // Task #2896 — try EVERY candidate scope (label first, then artist)
    // so the album's primary artist matches even when the album carries a
    // labelId. The matched scope's permissions + phase policy apply below.
    let scope = target.scope;
    let match = await findMembershipForScope(userId, scope.kind, scope.id);
    if (!match) {
      for (const c of target.scopes) {
        if (c.kind === scope.kind && c.id === scope.id) continue;
        const m = await findMembershipForScope(userId, c.kind, c.id);
        if (m) {
          scope = c;
          match = m;
          break;
        }
      }
    }
    if (!match) {
      return res.status(403).json({ message: "Out of scope" });
    }

    const perms = await getPartnerPermissions(scope.kind, scope.id);
    // Task #351 — per-(scope, user) override layer. An explicit override
    // (granted=true or false) wins over the scope default. NULL row =>
    // fall back to the scope verb, then to the Task #2468 implicit
    // artist-owner self-serve grant.
    const override = await getUserPermissionOverride(scope.kind, scope.id, userId, verb);
    const allowed = resolveVerbAllowed(scope.kind, match, perms, verb, override);
    if (!allowed) {
      return res.status(403).json({ message: `Missing permission: ${verb}` });
    }

    // Task #2468 — artist-owner PHASE policy. Only the primary artist
    // editing their OWN release reaches this (operators short-circuited
    // above; every non-owner partner returns null → legacy path below).
    // Operational routes (skipPostSaleLock) bypass it so sell-mode /
    // format config still applies directly regardless of phase.
    if (!opts.skipPostSaleLock) {
      const ownerPhase = await resolveArtistOwnerPhaseOutcome(
        verb,
        scope.kind,
        match,
        target.albumId,
        { isPrepping: target.isPrepping, firstSoldAt: target.firstSoldAt },
        userId,
        req,
      );
      if (ownerPhase) {
        if (ownerPhase.kind === "request_change") {
          return res.status(403).json({
            message: MASTERS_REQUEST_CHANGE_MESSAGE,
            requestChange: true,
            locked: !!target.firstSoldAt,
          });
        }
        req.partnerGate = {
          role: match.role,
          roleScopeId: match.scopeId,
          targetScope: scope,
          albumId: target.albumId,
          divert: ownerPhase.kind === "divert",
          divertReason: ownerPhase.kind === "divert" ? ownerPhase.reason : undefined,
        };
        return next();
      }
    }

    // Post-sale lock only applies to metadata edits. Masters upload, Shopify
    // mapping, and payouts intentionally remain editable post-sale (those
    // are operational, not historical-record, changes).
    const isLocked = !!target.firstSoldAt;
    const needsApproval = !!perms?.metadataEditsRequireApproval;

    if (verb === "edit_metadata" && isLocked && !opts.skipPostSaleLock) {
      // Post-sale lock: partner edit is BLOCKED unless an active
      // admin_overrides row is available. Returning 403 (not a queue
      // divert) is intentional — once an album has sold, the historical
      // record is frozen; only a super-admin override can let a partner
      // push through a correction. The partner UI surfaces a lock hint
      // via GET /api/admin/albums/:id/edit-access so the field-level
      // controls disable themselves before the user even tries.
      const consumed = await consumeActiveOverride(target.albumId!, userId, req);
      if (!consumed) {
        return res.status(403).json({
          message:
            "This album is locked after its first paid sale. Ask GoodTunes to unlock it for partner edits.",
          locked: true,
        });
      }
      // Override consumed → fall through (apply the edit directly).
    } else if (verb === "edit_metadata" && needsApproval) {
      req.partnerGate = {
        role: match.role,
        roleScopeId: match.scopeId,
        targetScope: scope,
        albumId: target.albumId,
        divert: true,
        divertReason: "approval_required",
      };
      return next();
    }

    req.partnerGate = {
      role: match.role,
      roleScopeId: match.scopeId,
      targetScope: scope,
      albumId: target.albumId,
      divert: false,
    };
    return next();
  };
}

/**
 * Resolve an album's owning scope (label or primary-artist). Returns
 * null when the album row doesn't exist or has no owning scope (legacy
 * unaffiliated rows — those can only be touched by super-admin/admin
 * via the higher-level requireAdmin/requireRole gates).
 */
export async function resolveAlbumScope(albumId: string): Promise<{
  scope: { kind: PartnerScopeKind; id: string } | null;
  firstSoldAt: Date | null;
  isPrepping: boolean;
} | null> {
  const [row] = await db
    .select({ labelId: albums.labelId, primaryArtistId: albums.primaryArtistId, firstSoldAt: albums.firstSoldAt, isPrepping: albums.isPrepping })
    .from(albums)
    .where(eq(albums.id, albumId));
  if (!row) return null;
  const scope: { kind: PartnerScopeKind; id: string } | null = row.labelId
    ? { kind: "label", id: row.labelId }
    : row.primaryArtistId
      ? { kind: "artist", id: row.primaryArtistId }
      : null;
  return { scope, firstSoldAt: row.firstSoldAt ?? null, isPrepping: !!row.isPrepping };
}

/**
 * Convenience: gate any handler whose target is an album id. Used by
 * routes that don't fit the album/song PUT middleware shape (videos,
 * photos, shopify-mappings, dropbox imports). Returns true when the
 * request was blocked and a response was already sent. Returns false
 * when the request should continue.
 */
export async function gateAlbumRoute(
  req: Request,
  res: Response,
  verb: PartnerVerb,
  albumId: string,
): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return true;
  }
  const resolved = await resolveAlbumScope(albumId);
  if (!resolved) {
    res.status(404).json({ message: "Album not found" });
    return true;
  }
  // Unscoped album: only admin/super_admin can edit it (the route's own
  // requireAdmin/requireRole already enforces this), so let it through.
  if (!resolved.scope) return false;
  const err = await checkPartnerVerbForScope(userId, verb, resolved.scope, {
    // Lock applies to anything that touches the record-as-sold:
    // metadata edits, track listing, master audio. Mirror the verb
    // set in checkPartnerVerbForScope.
    albumIdForLock: verb === "edit_metadata" || verb === "upload_masters" ? albumId : null,
    // Task #2896 — always thread the album id for the dual-scope
    // membership fallback (primary artist on a label-attached album),
    // independent of whether the verb is lock-relevant.
    albumIdForScope: albumId,
    // Thread the request so override consumption is memoized for the
    // life of the request — see consumeActiveOverride() comment.
    req,
  });
  if (err) {
    res.status(err.status).json(err.body);
    return true;
  }
  return false;
}

/**
 * Tri-state gate for metadata-class mutations whose target isn't an
 * album/song row directly (credits rows, person bio, label bio). Same
 * three rules as `requirePartnerPermission`:
 *   1. verb on the scope must be set
 *   2. post-sale lock (when albumIdForLock is provided) hard-blocks
 *      unless an override is consumed
 *   3. when `metadataEditsRequireApproval=true` AND verb is
 *      `edit_metadata`, the route should DIVERT to pending_changes
 *      instead of applying
 *
 * Returns:
 *   - "allow"  → fall through and apply the mutation directly
 *   - "divert" → caller writes a pending_changes row and 202s
 *   - "deny"   → response was already sent (401/403/404)
 *
 * Super-admin and `admin` always "allow".
 */
export type PartnerEditOutcome = "allow" | "divert" | "deny";
export async function partnerEditGate(
  req: Request,
  res: Response,
  verb: PartnerVerb,
  scope: { kind: PartnerScopeKind; id: string },
  opts: { albumIdForLock?: string | null } = {},
): Promise<PartnerEditOutcome> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return "deny";
  }
  const role = await getUserRole(userId);
  if (!role) {
    res.status(403).json({ message: "No role" });
    return "deny";
  }
  if (role.role === "super_admin" || role.role === "admin") return "allow";

  // Task #1036 — match against the membership SET (identical to the
  // legacy single-role check for single-membership users).
  let match = await findMembershipForScope(userId, scope.kind, scope.id);
  // Task #2896 — dual-scope fallback: when the caller passed the album's
  // label-first scope but the user is actually a member of the OTHER
  // candidate scope (the album's primary artist), match that scope
  // instead and apply ITS permissions + phase policy. Fail-closed for
  // users in neither scope.
  if (!match && opts.albumIdForLock) {
    const alt = await findAlbumScopeMembership(userId, opts.albumIdForLock, scope);
    if (alt) {
      scope = alt.scope;
      match = alt.match;
    }
  }
  if (!match) {
    res.status(403).json({ message: "Out of scope" });
    return "deny";
  }
  // Surface the MATCHED scope so a divert route can stamp the pending
  // change with the scope that actually authorized the request (not the
  // label-first scope it originally resolved).
  req.partnerGate = {
    role: match.role,
    roleScopeId: match.scopeId,
    targetScope: scope,
    albumId: opts.albumIdForLock ?? null,
    divert: false,
  };

  const perms = await getPartnerPermissions(scope.kind, scope.id);
  const override = await getUserPermissionOverride(scope.kind, scope.id, userId, verb);
  const allowed = resolveVerbAllowed(scope.kind, match, perms, verb, override);
  if (!allowed) {
    res.status(403).json({ message: `Missing permission: ${verb}` });
    return "deny";
  }

  // Task #2468 — artist-owner PHASE policy (own release only). Needs an
  // album to read the phase from; bio edits (no albumIdForLock) fall
  // through to the legacy path. Non-owners return null → legacy path.
  if (opts.albumIdForLock && isArtistScopeOwner(scope.kind, match)) {
    const [ph] = await db
      .select({ isPrepping: albums.isPrepping, firstSoldAt: albums.firstSoldAt })
      .from(albums)
      .where(eq(albums.id, opts.albumIdForLock));
    const ownerPhase = await resolveArtistOwnerPhaseOutcome(
      verb,
      scope.kind,
      match,
      opts.albumIdForLock,
      { isPrepping: ph?.isPrepping ?? false, firstSoldAt: ph?.firstSoldAt ?? null },
      userId,
      req,
    );
    if (ownerPhase) {
      if (ownerPhase.kind === "request_change") {
        res.status(403).json({
          message: MASTERS_REQUEST_CHANGE_MESSAGE,
          requestChange: true,
          locked: !!ph?.firstSoldAt,
        });
        return "deny";
      }
      return ownerPhase.kind === "divert" ? "divert" : "allow";
    }
  }

  // Post-sale lock (hard-403) for record-as-sold verbs. Never diverts.
  const LOCK_VERBS: PartnerVerb[] = ["edit_metadata", "upload_masters"];
  if (LOCK_VERBS.includes(verb) && opts.albumIdForLock) {
    const [album] = await db
      .select({ firstSoldAt: albums.firstSoldAt })
      .from(albums)
      .where(eq(albums.id, opts.albumIdForLock));
    if (album?.firstSoldAt) {
      const ok = await consumeActiveOverride(opts.albumIdForLock, userId, req);
      if (!ok) {
        res.status(403).json({
          message:
            "This album is locked after its first paid sale. Ask GoodTunes to unlock it for partner edits.",
          locked: true,
        });
        return "deny";
      }
    }
  }

  // Approval mode: only metadata edits divert. Master uploads, Shopify,
  // payouts, invites all apply directly (or 403) — no review queue.
  if (verb === "edit_metadata" && perms?.metadataEditsRequireApproval) {
    return "divert";
  }
  return "allow";
}

/**
 * Inline (non-middleware) verb check for endpoints whose target isn't
 * an album/song row — e.g. payout accounts (label/person scope),
 * Shopify mapping by album id, sub-user invites by the inviter's own
 * scope. Returns `null` on pass, or a `{ status, body }` to be sent.
 *
 * Pass `albumIdForLock` for verbs that should also respect the
 * post-sale lock (currently only `edit_metadata` for album sub-rows
 * like videos/photos uses this — masters/Shopify/payouts intentionally
 * stay editable post-sale).
 */
export async function checkPartnerVerbForScope(
  userId: string,
  verb: PartnerVerb,
  scope: { kind: PartnerScopeKind; id: string },
  opts: { albumIdForLock?: string | null; req?: Request; phaseAware?: boolean; ownerOnly?: boolean; albumIdForScope?: string | null } = {},
): Promise<{ status: number; body: any } | null> {
  const role = await getUserRole(userId);
  if (!role) return { status: 403, body: { message: "No role" } };
  if (role.role === "super_admin" || role.role === "admin") return null;

  // Task #1036 — match against the membership SET (identical to the
  // legacy single-role check for single-membership users).
  let match = await findMembershipForScope(userId, scope.kind, scope.id);
  // Task #2468 — `ownerOnly` (commerce pricing routes) applies the phase
  // gate to the artist-scope OWNER and passes EVERYONE else through
  // byte-for-byte unchanged. commerce's bearer-only requireAdmin never
  // gated these routes for partners, so a non-owner (non-member,
  // sub_role teammate, or a partner on another scope) must return null
  // (no gate) here — BEFORE the out-of-scope 403 / permission / lock
  // checks — or we'd change a previously-ungated path.
  if (opts.ownerOnly && !(match && isArtistScopeOwner(scope.kind, match))) {
    return null;
  }
  // Task #2896 — dual-scope fallback (see partnerEditGate): the album's
  // primary artist stays in-scope even when the album carries a labelId
  // and the caller resolved the label-first scope. Requires an album id
  // to look the candidates up (albumIdForScope, else albumIdForLock).
  if (!match) {
    const albumIdForScope = opts.albumIdForScope ?? opts.albumIdForLock ?? null;
    if (albumIdForScope) {
      const alt = await findAlbumScopeMembership(userId, albumIdForScope, scope);
      if (alt) {
        scope = alt.scope;
        match = alt.match;
      }
    }
  }
  if (!match) {
    return { status: 403, body: { message: "Out of scope" } };
  }

  const perms = await getPartnerPermissions(scope.kind, scope.id);
  const override = await getUserPermissionOverride(scope.kind, scope.id, userId, verb);
  const allowed = resolveVerbAllowed(scope.kind, match, perms, verb, override);
  if (!allowed) {
    return { status: 403, body: { message: `Missing permission: ${verb}` } };
  }

  // Task #2468 — artist-owner PHASE policy. This gate has NO divert
  // channel, so a queued outcome collapses to a 403 carrying
  // `requestChange`. upload_masters is ALWAYS phased here (gateAlbumRoute
  // path — masters can't be queued). Metadata-class is phased ONLY when
  // the caller opts in (phaseAware — commerce pricing writes with no
  // review queue); pressing-order reads/submits + delete-request leave
  // phaseAware off so they keep the legacy path.
  if (
    opts.albumIdForLock &&
    isArtistScopeOwner(scope.kind, match) &&
    (verb === "upload_masters" || (opts.phaseAware && METADATA_CLASS_VERBS.includes(verb)))
  ) {
    const [ph] = await db
      .select({ isPrepping: albums.isPrepping, firstSoldAt: albums.firstSoldAt })
      .from(albums)
      .where(eq(albums.id, opts.albumIdForLock));
    const ownerPhase = await resolveArtistOwnerPhaseOutcome(
      verb,
      scope.kind,
      match,
      opts.albumIdForLock,
      { isPrepping: ph?.isPrepping ?? false, firstSoldAt: ph?.firstSoldAt ?? null },
      userId,
      opts.req,
    );
    if (ownerPhase && ownerPhase.kind !== "allow") {
      return {
        status: 403,
        body:
          verb === "upload_masters"
            ? { message: MASTERS_REQUEST_CHANGE_MESSAGE, requestChange: true, locked: !!ph?.firstSoldAt }
            : { message: PRICING_REQUEST_CHANGE_MESSAGE, requestChange: true, locked: !!ph?.firstSoldAt },
      };
    }
    if (ownerPhase && ownerPhase.kind === "allow") return null;
  }

  // Post-sale lock check. Applies to anything that mutates the
  // record-as-sold: metadata, track listing, master audio. Shopify
  // mapping and payouts intentionally stay editable so an artist can
  // still re-price or fix a payout split on a sold album.
  const LOCK_VERBS: PartnerVerb[] = ["edit_metadata", "upload_masters"];
  if (LOCK_VERBS.includes(verb) && opts.albumIdForLock) {
    const [album] = await db
      .select({ firstSoldAt: albums.firstSoldAt })
      .from(albums)
      .where(eq(albums.id, opts.albumIdForLock));
    if (album?.firstSoldAt) {
      const ok = await consumeActiveOverride(opts.albumIdForLock, userId, opts.req);
      if (!ok) {
        return {
          status: 403,
          body: {
            message:
              "This album is locked after its first paid sale. Ask GoodTunes to unlock it for partner edits.",
            locked: true,
          },
        };
      }
    }
  }
  return null;
}

/**
 * Summary the partner UI uses to disable inputs and show inline lock
 * hints without having to attempt a save and parse the 403. Returns
 * `{ canEdit, locked, hasOverride, missingPermissions }` for an album
 * from the perspective of `userId`. Super-admin always canEdit.
 */
export async function getAlbumEditAccess(userId: string, albumId: string) {
  const role = await getUserRole(userId);
  const [album] = await db
    .select({ id: albums.id, labelId: albums.labelId, primaryArtistId: albums.primaryArtistId, firstSoldAt: albums.firstSoldAt, isPrepping: albums.isPrepping })
    .from(albums)
    .where(eq(albums.id, albumId));
  if (!album) return null;
  const locked = !!album.firstSoldAt;
  const isPrepping = !!album.isPrepping;
  const scopeCandidates = albumScopeCandidates(album);
  let scope: { kind: PartnerScopeKind; id: string } | null = scopeCandidates[0] ?? null;

  if (!role || role.role === "super_admin" || role.role === "admin") {
    return {
      role: role?.role ?? null,
      canEdit: true,
      canManagePayouts: true,
      locked,
      isPrepping,
      // Operators apply every edit directly; they never divert to review.
      requestOnly: false,
      hasActiveOverride: false,
      requiresApproval: false,
      missingPermissions: [] as string[],
    };
  }

  // Task #1036 — match against the membership SET (identical yes/no to
  // the legacy single-role check for single-membership users).
  // Task #2896 — dual-scope: try every candidate scope (label first, then
  // primary artist) so a label-attached album still reads as editable to
  // its primary artist; the matched scope's permissions apply below.
  let match: ResolvedMembership | null = null;
  for (const c of scopeCandidates) {
    const m = await findMembershipForScope(userId, c.kind, c.id);
    if (m) {
      scope = c;
      match = m;
      break;
    }
  }
  const inScope = !!match;
  if (!inScope) {
    return {
      role: role.role,
      canEdit: false,
      canManagePayouts: false,
      locked,
      isPrepping,
      requestOnly: false,
      hasActiveOverride: false,
      requiresApproval: false,
      missingPermissions: ["out_of_scope"],
    };
  }

  const perms = scope ? await getPartnerPermissions(scope.kind, scope.id) : null;
  const missing: string[] = [];
  // Task #2468 — resolve via the shared precedence (override → scope
  // grant → implicit artist-owner default) instead of reading the scope
  // row directly, so per-user overrides + the owner default are honored
  // here exactly as the write gates enforce them. (Historically this
  // ignored overrides, so an override-granted teammate wrongly saw
  // canEdit=false.)
  const canEditMetadata =
    scope && match
      ? await resolvePartnerVerb(userId, "edit_metadata", scope, match, perms ?? undefined)
      : false;
  const canManagePayoutsResolved =
    scope && match
      ? await resolvePartnerVerb(userId, "manage_payouts", scope, match, perms ?? undefined)
      : false;
  if (!canEditMetadata) missing.push("edit_metadata");

  // Peek at override availability without consuming.
  let hasActiveOverride = false;
  if (locked) {
    const [row] = await db
      .select({ id: adminOverrides.id })
      .from(adminOverrides)
      .where(
        and(
          eq(adminOverrides.targetTable, "albums"),
          eq(adminOverrides.targetId, albumId),
          isNull(adminOverrides.consumedAt),
          or(isNull(adminOverrides.expiresAt), gt(adminOverrides.expiresAt, new Date())),
        ),
      )
      .limit(1);
    hasActiveOverride = !!row;
  }

  const canEdit = missing.length === 0 && (!locked || hasActiveOverride);
  const requiresApproval = !!perms?.metadataEditsRequireApproval;
  // Task #2468 — `requestOnly` surfaces the OWNER phase divert only: when
  // the artist owner edits a RELEASED (pre-sale) release their metadata
  // save is filed as a change request, and post-sale (no active override)
  // they can still REQUEST a change rather than hit a hard lock. It is
  // deliberately orthogonal to `requiresApproval` (the scope-wide approval
  // flag, already surfaced separately and handled by the existing chip) so
  // the editor's non-owner + operator affordances stay byte-for-byte
  // unchanged. This only PEEKS — it never consumes an override; the owner
  // phase resolver that burns a single-shot override runs on the write
  // path. `isPrepping` allows direct edits, so the owner divert is exactly
  // "in scope + can edit metadata + not prepping (and, if locked, no
  // override to consume)".
  const isOwner = scope ? isArtistScopeOwner(scope.kind, match) : false;
  const requestOnly =
    isOwner && canEditMetadata
      ? locked
        ? !hasActiveOverride
        : !isPrepping
      : false;
  return {
    role: role.role,
    canEdit,
    // Task #2428 — anyone in scope holding `manage_payouts` can pay the
    // Shopify+ manufacturing ledger, independent of the edit_metadata lock.
    // Task #2468 — resolved via the shared precedence so an override /
    // owner grant counts, not just the scope row.
    canManagePayouts: canManagePayoutsResolved,
    locked,
    isPrepping,
    requestOnly,
    hasActiveOverride,
    requiresApproval,
    missingPermissions: missing,
  };
}

/**
 * Set `albums.first_sold_at` the first time we record a paid order for
 * the album. Idempotent — the WHERE clause only matches when the column
 * is currently NULL, so concurrent paid-order materializations don't
 * keep moving the timestamp.
 */
export async function stampFirstSoldAtIfNeeded(albumId: string): Promise<void> {
  try {
    await db.execute(
      sql`UPDATE albums SET first_sold_at = NOW() WHERE id = ${albumId} AND first_sold_at IS NULL`,
    );
  } catch {
    // Best-effort — never let this break order materialization.
  }
}

/**
 * Apply a previously-queued pending_changes patch by replaying it
 * against storage. Called from the super-admin review endpoint.
 */
export async function applyPendingChange(
  targetTable: string,
  targetId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  // The patch may carry a `__op` discriminator for tables that support
  // create/delete via the queue (credits, song create, album/song
  // delete). Default behavior for the plain row-update path strips it.
  const { __op, ...payload } = patch as { __op?: "create" | "update" | "delete" | "request" } & Record<string, unknown>;
  const op = __op ?? "update";

  // Task #2468 — a "request a change" note carries no structured patch
  // (masters / pricing can't be auto-applied). Approving it just
  // acknowledges the request; the operator makes the actual edit by hand
  // in the editor. Treat as a successful no-op so the queue advances
  // instead of 502-ing on an empty apply.
  if (op === "request") return true;

  switch (targetTable) {
    case "albums": {
      if (op === "delete") {
        await storage.deleteAlbum(targetId);
        return true;
      }
      const updated = await storage.updateAlbum(targetId, payload as any);
      // Task #644 — mirror the live PUT path's auto-sign behaviour so an
      // approved label change still propagates to the primary artist.
      // Conflicts (artist already on a different label) are logged and
      // skipped here — there's no operator session to prompt.
      if (updated && Object.prototype.hasOwnProperty.call(payload, "labelId")) {
        try {
          // Streaming-only rows are out of scope (see
          // docs/admin-conventions.md). Same gate the live PUT path uses.
          const person = updated.primaryArtistId && updated.isGoodTunesRelease
            ? await storage.getPersonById(updated.primaryArtistId)
            : null;
          if (person && updated.labelId && !person.labelId) {
            await storage.updatePerson(person.id, { labelId: updated.labelId } as any);
          } else if (person && updated.labelId && person.labelId && person.labelId !== updated.labelId) {
            console.warn(
              `[task-644] approved album ${targetId} label change skipped artist auto-sign: ${person.id} already on label ${person.labelId}`,
            );
          }
        } catch (err) {
          console.warn(`[task-644] applyPendingChange artist auto-sign failed for album ${targetId}:`, err);
        }
      }
      return !!updated;
    }
    case "songs": {
      if (op === "delete") {
        await storage.deleteSong(targetId);
        return true;
      }
      if (op === "create") {
        // For create, `targetId` is the parent albumId carried for
        // grouping in the queue. The actual albumId in the payload
        // wins (we re-pin it here so a tampered patch can't sneak a
        // song under a different album).
        const created = await storage.createSong({ ...(payload as any), albumId: targetId });
        return !!created;
      }
      const updated = await storage.updateSong(targetId, payload as any);
      return !!updated;
    }
    case "people": {
      if (op === "delete") {
        await storage.deletePerson(targetId);
        return true;
      }
      const updated = await storage.updatePerson(targetId, payload as any);
      return !!updated;
    }
    case "labels": {
      if (op === "delete") {
        await storage.deleteLabel(targetId);
        return true;
      }
      // Bypass the logo-lock guard — review-approved replays count as
      // an explicit operator action, same as the admin PUT does.
      const updated = await storage.updateLabel(targetId, { ...(payload as any), __bypassLogoLock: true });
      return !!updated;
    }
    case "track_writers": {
      if (op === "delete") {
        await storage.deleteTrackWriter(targetId);
        return true;
      }
      if (op === "create") {
        // targetId = parent songId.
        const created = await storage.createTrackWriter({ ...(payload as any), songId: targetId });
        return !!created;
      }
      const updated = await storage.updateTrackWriter(targetId, payload as any);
      return !!updated;
    }
    case "track_performers": {
      if (op === "delete") {
        await storage.deleteTrackPerformer(targetId);
        return true;
      }
      if (op === "create") {
        const created = await storage.createTrackPerformer({ ...(payload as any), songId: targetId });
        return !!created;
      }
      const updated = await storage.updateTrackPerformer(targetId, payload as any);
      return !!updated;
    }
  }
  return false;
}

// ─── Pending changes CRUD ─────────────────────────────────────────────
export async function createPendingChange(input: {
  // v1 was albums|songs only; widened to include credits + bio for
  // the approval-mode coverage rule. applyPendingChange dispatches on
  // this string.
  targetTable:
    | "albums"
    | "songs"
    | "people"
    | "labels"
    | "track_writers"
    | "track_performers";
  targetId: string;
  albumId: string | null;
  scopeKind: PartnerScopeKind;
  scopeId: string;
  patch: Record<string, unknown>;
  submittedByUserId: string;
  submittedNote?: string | null;
}) {
  const [row] = await db
    .insert(pendingChanges)
    .values({
      targetTable: input.targetTable,
      targetId: input.targetId,
      albumId: input.albumId,
      scopeKind: input.scopeKind,
      scopeId: input.scopeId,
      patch: input.patch as any,
      submittedByUserId: input.submittedByUserId,
      submittedNote: input.submittedNote ?? null,
    })
    .returning();
  return row;
}

export async function listPendingChanges(status: "pending" | "approved" | "rejected" | "all" = "pending") {
  const q = db.select().from(pendingChanges);
  if (status === "all") return q.orderBy(sql`created_at DESC`);
  return q.where(eq(pendingChanges.status, status)).orderBy(sql`created_at DESC`);
}

export async function getPendingChange(id: string) {
  const [row] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id));
  return row ?? null;
}

// Task #2478 — a partner's own submitted change requests for one album.
// Scoped to `submittedByUserId = userId` so a partner only ever sees the
// requests THEY filed (never a teammate's or another scope's), and to the
// denormalized `albumId` so song/credit diverts (which roll up to the
// album) surface alongside album-level edits. Reviewer *identity*
// (reviewedByUserId) is intentionally NOT returned — the partner sees the
// decision and GoodTunes' note, but never which operator made the call.
// Newest first.
export async function listMyChangeRequestsForAlbum(
  userId: string,
  albumId: string,
) {
  return db
    .select({
      id: pendingChanges.id,
      targetTable: pendingChanges.targetTable,
      targetId: pendingChanges.targetId,
      albumId: pendingChanges.albumId,
      patch: pendingChanges.patch,
      status: pendingChanges.status,
      submittedNote: pendingChanges.submittedNote,
      reviewedAt: pendingChanges.reviewedAt,
      reviewerNote: pendingChanges.reviewerNote,
      createdAt: pendingChanges.createdAt,
    })
    .from(pendingChanges)
    .where(
      and(
        eq(pendingChanges.submittedByUserId, userId),
        eq(pendingChanges.albumId, albumId),
        // Task #2482 — a withdrawn request is retracted by its submitter;
        // it stays in the DB for the audit trail but drops out of the
        // artist's own list (and the operator queue, which filters by
        // status separately).
        ne(pendingChanges.status, "withdrawn"),
      ),
    )
    .orderBy(sql`created_at DESC`);
}

// Task #2482 — an artist retracts a still-pending change request they filed
// by mistake. Scoped to `submittedByUserId = userId` (so a partner can only
// withdraw their OWN submissions) AND `status = "pending"` (an approved or
// rejected row is terminal and can't be withdrawn). Soft terminal status —
// the row is NOT deleted, preserving the audit trail. Returns the updated
// row, or null when nothing matched (wrong owner, not found, or already
// reviewed) so the route can 404 without leaking which case it was.
export async function withdrawPendingChange(
  id: string,
  userId: string,
  albumId: string,
) {
  const [updated] = await db
    .update(pendingChanges)
    .set({ status: "withdrawn" })
    .where(
      and(
        eq(pendingChanges.id, id),
        // Bind the request to the album in the route URL so a request can
        // only be withdrawn through its OWN album's endpoint, not any album
        // the caller happens to have edit access to.
        eq(pendingChanges.albumId, albumId),
        eq(pendingChanges.submittedByUserId, userId),
        eq(pendingChanges.status, "pending"),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function reviewPendingChange(
  id: string,
  decision: "approved" | "rejected",
  reviewerId: string,
  reviewerNote?: string | null,
  // Approve-with-edits: when present and decision="approved", replay
  // this patch instead of the partner's original. The row's `patch`
  // column is overwritten so the audit trail shows what was actually
  // applied (the partner's original lives in pending_changes history
  // via createdAt + the prior diff if we ever want to surface it).
  patchOverride?: Record<string, unknown> | null,
) {
  const row = await getPendingChange(id);
  if (!row || row.status !== "pending") return null;
  const effectivePatch =
    decision === "approved" && patchOverride
      ? patchOverride
      : ((row.patch ?? {}) as Record<string, unknown>);
  if (decision === "approved") {
    // Apply must actually succeed before we stamp the row "approved" —
    // otherwise the audit trail lies (status=approved but no data
    // changed). On failure: return null so the route can 502 instead
    // of silently advancing the queue.
    const ok = await applyPendingChange(
      row.targetTable as "albums" | "songs",
      row.targetId,
      effectivePatch,
    ).catch(() => false);
    if (!ok) {
      // Throw so the calling route returns 502 instead of conflating
      // this with "not found / already reviewed" (which also returns
      // null from this function above).
      throw new Error("apply_failed");
    }
  }
  const [updated] = await db
    .update(pendingChanges)
    .set({
      status: decision,
      reviewedByUserId: reviewerId,
      reviewedAt: new Date(),
      reviewerNote: reviewerNote ?? null,
      patch: decision === "approved" ? (effectivePatch as any) : row.patch,
    })
    .where(eq(pendingChanges.id, id))
    .returning();
  return updated;
}

// ─── Admin overrides CRUD ─────────────────────────────────────────────
export async function createAdminOverride(input: {
  targetTable: "albums";
  targetId: string;
  grantedByUserId: string;
  reason: string;
  expiresAt?: Date | null;
}) {
  const [row] = await db
    .insert(adminOverrides)
    .values({
      targetTable: input.targetTable,
      targetId: input.targetId,
      grantedByUserId: input.grantedByUserId,
      reason: input.reason,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row;
}

export async function listAdminOverridesForAlbum(albumId: string) {
  return db
    .select()
    .from(adminOverrides)
    .where(and(eq(adminOverrides.targetTable, "albums"), eq(adminOverrides.targetId, albumId)))
    .orderBy(sql`created_at DESC`);
}
