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
import { sql, and, eq, isNull, gt, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  albums,
  songs,
  partnerPermissions,
  adminOverrides,
  pendingChanges,
  type PartnerPermissionVerb,
  type PartnerScopeKind,
} from "@shared/schema";
import { getUserRole, type UserRoleInfo } from "./roles";

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

// Resolve target → { scope, albumId } for the two row kinds we gate
// today. Extend here if we widen the surface.
async function resolveTarget(targetTable: "albums" | "songs", targetId: string): Promise<{
  scope: { kind: PartnerScopeKind; id: string } | null;
  albumId: string | null;
  firstSoldAt: Date | null;
} | null> {
  if (targetTable === "albums") {
    const [row] = await db
      .select({ id: albums.id, labelId: albums.labelId, primaryArtistId: albums.primaryArtistId, firstSoldAt: albums.firstSoldAt })
      .from(albums)
      .where(eq(albums.id, targetId));
    if (!row) return null;
    const scope: { kind: PartnerScopeKind; id: string } | null = row.labelId
      ? { kind: "label", id: row.labelId }
      : row.primaryArtistId
        ? { kind: "artist", id: row.primaryArtistId }
        : null;
    return { scope, albumId: row.id, firstSoldAt: row.firstSoldAt ?? null };
  }
  // songs
  const [row] = await db
    .select({
      albumId: songs.albumId,
      labelId: albums.labelId,
      primaryArtistId: albums.primaryArtistId,
      firstSoldAt: albums.firstSoldAt,
    })
    .from(songs)
    .innerJoin(albums, eq(albums.id, songs.albumId))
    .where(eq(songs.id, targetId));
  if (!row) return null;
  const scope: { kind: PartnerScopeKind; id: string } | null = row.labelId
    ? { kind: "label", id: row.labelId }
    : row.primaryArtistId
      ? { kind: "artist", id: row.primaryArtistId }
      : null;
  return { scope, albumId: row.albumId, firstSoldAt: row.firstSoldAt ?? null };
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

    // Partner role from here on. Must match the target's scope row.
    if (
      !target.scope ||
      (role.role !== target.scope.kind) ||
      role.roleScopeId !== target.scope.id
    ) {
      return res.status(403).json({ message: "Out of scope" });
    }

    const perms = await getPartnerPermissions(target.scope.kind, target.scope.id);
    const verbCol = verbToColumn(verb);
    // Task #351 — per-(scope, user) override layer. An explicit override
    // (granted=true or false) wins over the scope default. NULL row =>
    // fall back to the scope verb.
    const override = await getUserPermissionOverride(target.scope.kind, target.scope.id, userId, verb);
    const allowed = override !== null ? override : !!(perms && perms[verbCol]);
    if (!allowed) {
      return res.status(403).json({ message: `Missing permission: ${verb}` });
    }

    // Post-sale lock only applies to metadata edits. Masters upload, Shopify
    // mapping, and payouts intentionally remain editable post-sale (those
    // are operational, not historical-record, changes).
    const isLocked = !!target.firstSoldAt;
    const needsApproval = !!perms.metadataEditsRequireApproval;

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
        role: role.role,
        roleScopeId: role.roleScopeId,
        targetScope: target.scope,
        albumId: target.albumId,
        divert: true,
        divertReason: "approval_required",
      };
      return next();
    }

    req.partnerGate = {
      role: role.role,
      roleScopeId: role.roleScopeId,
      targetScope: target.scope,
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
} | null> {
  const [row] = await db
    .select({ labelId: albums.labelId, primaryArtistId: albums.primaryArtistId, firstSoldAt: albums.firstSoldAt })
    .from(albums)
    .where(eq(albums.id, albumId));
  if (!row) return null;
  const scope: { kind: PartnerScopeKind; id: string } | null = row.labelId
    ? { kind: "label", id: row.labelId }
    : row.primaryArtistId
      ? { kind: "artist", id: row.primaryArtistId }
      : null;
  return { scope, firstSoldAt: row.firstSoldAt ?? null };
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

  if (role.role !== scope.kind || role.roleScopeId !== scope.id) {
    res.status(403).json({ message: "Out of scope" });
    return "deny";
  }

  const perms = await getPartnerPermissions(scope.kind, scope.id);
  const col = verbToColumn(verb);
  const override = await getUserPermissionOverride(scope.kind, scope.id, userId, verb);
  const allowed = override !== null ? override : !!(perms && perms[col]);
  if (!allowed) {
    res.status(403).json({ message: `Missing permission: ${verb}` });
    return "deny";
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
  if (verb === "edit_metadata" && perms.metadataEditsRequireApproval) {
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
  opts: { albumIdForLock?: string | null; req?: Request } = {},
): Promise<{ status: number; body: any } | null> {
  const role = await getUserRole(userId);
  if (!role) return { status: 403, body: { message: "No role" } };
  if (role.role === "super_admin" || role.role === "admin") return null;

  if (role.role !== scope.kind || role.roleScopeId !== scope.id) {
    return { status: 403, body: { message: "Out of scope" } };
  }

  const perms = await getPartnerPermissions(scope.kind, scope.id);
  const col = verbToColumn(verb);
  const override = await getUserPermissionOverride(scope.kind, scope.id, userId, verb);
  const allowed = override !== null ? override : !!(perms && perms[col]);
  if (!allowed) {
    return { status: 403, body: { message: `Missing permission: ${verb}` } };
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
    .select({ id: albums.id, labelId: albums.labelId, primaryArtistId: albums.primaryArtistId, firstSoldAt: albums.firstSoldAt })
    .from(albums)
    .where(eq(albums.id, albumId));
  if (!album) return null;
  const locked = !!album.firstSoldAt;
  const scope: { kind: PartnerScopeKind; id: string } | null = album.labelId
    ? { kind: "label", id: album.labelId }
    : album.primaryArtistId
      ? { kind: "artist", id: album.primaryArtistId }
      : null;

  if (!role || role.role === "super_admin" || role.role === "admin") {
    return {
      role: role?.role ?? null,
      canEdit: true,
      locked,
      hasActiveOverride: false,
      requiresApproval: false,
      missingPermissions: [] as string[],
    };
  }

  const inScope = scope && role.role === scope.kind && role.roleScopeId === scope.id;
  if (!inScope) {
    return {
      role: role.role,
      canEdit: false,
      locked,
      hasActiveOverride: false,
      requiresApproval: false,
      missingPermissions: ["out_of_scope"],
    };
  }

  const perms = scope ? await getPartnerPermissions(scope.kind, scope.id) : null;
  const missing: string[] = [];
  if (!perms?.editMetadata) missing.push("edit_metadata");

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
  return {
    role: role.role,
    canEdit,
    locked,
    hasActiveOverride,
    requiresApproval: !!perms?.metadataEditsRequireApproval,
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
  const { __op, ...payload } = patch as { __op?: "create" | "update" | "delete" } & Record<string, unknown>;
  const op = __op ?? "update";

  switch (targetTable) {
    case "albums": {
      if (op === "delete") {
        await storage.deleteAlbum(targetId);
        return true;
      }
      const updated = await storage.updateAlbum(targetId, payload as any);
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
