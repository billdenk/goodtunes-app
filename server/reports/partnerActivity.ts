// Partner activity report — super-admin only.
//
// Builds one entry per invited-partner scope from existing tables:
// admin_invites (backbone), analytics_events (sign-in), pending_changes
// (submitted edits), press_pricing_syncs (pricing updates for presses),
// job_runs (imports run on their albums), orders (sales of their albums).
//
// "last seen" and the status bucket are derived from those dated signals.
// Album/people counts are un-dated (no created_at on albums/people) so we
// surface them as snapshot counts and make that clear in the UI.

import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Tunables ─────────────────────────────────────────────────────────────
export const ACTIVE_WITHIN_DAYS = 30;
const RECENT_SALES_DAYS = 30;

// ─── Types ─────────────────────────────────────────────────────────────────
export type PartnerActivityStatus =
  | "invited"
  | "expired_or_revoked"
  | "idle"
  | "active"
  | "stalled";

export interface PartnerActivityRow {
  inviteId: string;
  role: string;
  roleScopeId: string | null;
  scopeName: string;
  scopeThumbUrl: string | null;
  inviteeEmail: string | null;
  inviterDisplayName: string | null;
  inviterEmail: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  status: PartnerActivityStatus;
  lastSeenAt: string | null;
  albumCount: number;
  rosterCount: number;
  pendingChangesCount: number;
  pricingSyncsCount: number;
  importsCount: number;
  recentSalesCount: number;
  catalogItemsCount: number;
}

export interface ActivityTimelineItem {
  kind: "login" | "edit" | "pricing_sync" | "import" | "sale";
  ts: string;
  detail: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function safeNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function computeStatus(row: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  lastSeenAt: Date | null;
}): PartnerActivityStatus {
  const now = new Date();
  if (!row.acceptedAt) {
    if (row.revokedAt || row.expiresAt < now) return "expired_or_revoked";
    return "invited";
  }
  if (!row.lastSeenAt) return "idle";
  const daysSince = (now.getTime() - row.lastSeenAt.getTime()) / 86400_000;
  return daysSince <= ACTIVE_WITHIN_DAYS ? "active" : "stalled";
}

// ─── Main aggregation ──────────────────────────────────────────────────────
export async function partnerActivity(): Promise<{
  partners: PartnerActivityRow[];
  activeWithinDays: number;
}> {
  const result = await db.execute(sql`
    WITH scope_invites AS (
      -- One row per unique (role, role_scope_id) — most recent invite wins.
      -- invite_role IS NULL excludes sub-role team invites (identity/manager/team).
      SELECT DISTINCT ON (ai.role, COALESCE(ai.role_scope_id, ai.id))
        ai.id              AS invite_id,
        ai.email,
        ai.role,
        ai.role_scope_id,
        ai.created_at      AS invited_at,
        ai.used_at         AS accepted_at,
        ai.accepted_user_id,
        ai.expires_at,
        ai.revoked_at,
        u_inviter.display_name AS inviter_display_name,
        u_inviter.email    AS inviter_email,
        COALESCE(p.name, l.name, m.name, fp.name, v.name, ai.email) AS scope_name,
        COALESCE(p.photo_url, l.logo_url, m.logo_url, fp.logo_url)  AS scope_thumb_url
      FROM admin_invites ai
      LEFT JOIN users u_inviter ON u_inviter.id = ai.created_by_user_id
      LEFT JOIN people             p  ON p.id  = ai.role_scope_id AND ai.role = 'artist'
      LEFT JOIN labels             l  ON l.id  = ai.role_scope_id AND ai.role = 'label'
      LEFT JOIN manufacturers      m  ON m.id  = ai.role_scope_id AND ai.role = 'manufacturer'
      LEFT JOIN fulfillment_partners fp ON fp.id = ai.role_scope_id AND ai.role = 'fulfillment'
      LEFT JOIN vendors            v  ON v.id  = ai.role_scope_id AND ai.role = 'vendor'
      WHERE ai.role IN ('artist','label','manufacturer','non_profit','fulfillment','vendor','manager')
        AND ai.invite_role IS NULL
      ORDER BY ai.role, COALESCE(ai.role_scope_id, ai.id), ai.created_at DESC
    ),
    -- Signal 1: logins + submitted edits + pricing syncs (user-keyed)
    last_seen_user AS (
      SELECT
        si.invite_id,
        GREATEST(
          MAX(CASE WHEN ae.name = 'sign_in' THEN ae.ts END),
          MAX(pc.created_at),
          MAX(pps.started_at)
        ) AS last_seen_at
      FROM scope_invites si
      LEFT JOIN analytics_events    ae  ON ae.user_id              = si.accepted_user_id AND ae.name = 'sign_in'
      LEFT JOIN pending_changes     pc  ON pc.submitted_by_user_id = si.accepted_user_id
      LEFT JOIN press_pricing_syncs pps ON pps.triggered_by_user_id = si.accepted_user_id
      WHERE si.accepted_user_id IS NOT NULL
      GROUP BY si.invite_id
    ),
    -- Signal 2: imports (job_runs on albums in scope — artist + label only;
    -- job_runs has no user_id so we join through albums)
    last_seen_imports AS (
      SELECT si.invite_id,
             MAX(jr.started_at) AS last_import_at,
             COUNT(jr.id)::int  AS imports_count
      FROM scope_invites si
      JOIN albums a ON a.deleted_at IS NULL
        AND (
          (si.role = 'artist' AND a.primary_artist_id = si.role_scope_id)
          OR (si.role = 'label'  AND a.label_id          = si.role_scope_id)
        )
      JOIN job_runs jr ON jr.album_id = a.id
      WHERE si.role_scope_id IS NOT NULL
        AND si.role IN ('artist', 'label')
      GROUP BY si.invite_id
    ),
    -- Signal 3: paid orders for albums in scope (artist + label)
    last_seen_sales AS (
      SELECT si.invite_id,
             MAX(o.created_at) AS last_sale_at,
             COUNT(CASE WHEN o.created_at >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS recent_sales_count
      FROM scope_invites si
      JOIN albums a ON a.deleted_at IS NULL
        AND (
          (si.role = 'artist' AND a.primary_artist_id = si.role_scope_id)
          OR (si.role = 'label'  AND a.label_id          = si.role_scope_id)
        )
      JOIN orders o ON o.album_id = a.id AND o.status = 'paid'
      WHERE si.role_scope_id IS NOT NULL
        AND si.role IN ('artist', 'label')
      GROUP BY si.invite_id
    )
    SELECT
      si.invite_id,
      si.email,
      si.role,
      si.role_scope_id,
      si.invited_at,
      si.accepted_at,
      si.accepted_user_id,
      si.expires_at,
      si.revoked_at,
      si.inviter_display_name,
      si.inviter_email,
      si.scope_name,
      si.scope_thumb_url,
      -- Combined last-seen across ALL dated signals
      GREATEST(
        lsu.last_seen_at,
        lsi.last_import_at,
        lss.last_sale_at
      ) AS last_seen_at,
      -- Album count (undated — no created_at on albums)
      (CASE
        WHEN si.role = 'artist' AND si.role_scope_id IS NOT NULL THEN
          (SELECT COUNT(*) FROM albums WHERE primary_artist_id = si.role_scope_id AND deleted_at IS NULL)
        WHEN si.role = 'label' AND si.role_scope_id IS NOT NULL THEN
          (SELECT COUNT(*) FROM albums WHERE label_id = si.role_scope_id AND deleted_at IS NULL)
        ELSE 0
      END)::int AS album_count,
      -- Roster count: distinct artists on a label; band members for an artist
      (CASE
        WHEN si.role = 'label' AND si.role_scope_id IS NOT NULL THEN
          (SELECT COUNT(DISTINCT primary_artist_id) FROM albums
           WHERE label_id = si.role_scope_id AND deleted_at IS NULL AND primary_artist_id IS NOT NULL)
        WHEN si.role = 'artist' AND si.role_scope_id IS NOT NULL THEN
          (SELECT COUNT(*) FROM band_members WHERE band_id = si.role_scope_id AND deleted_at IS NULL)
        ELSE 0
      END)::int AS roster_count,
      -- Pending edits submitted for review
      (CASE WHEN si.role_scope_id IS NOT NULL THEN
        (SELECT COUNT(*) FROM pending_changes WHERE scope_kind = si.role AND scope_id = si.role_scope_id)
      ELSE 0 END)::int AS pending_changes_count,
      -- Press pricing-sync count (manufacturers only)
      (CASE WHEN si.role = 'manufacturer' AND si.role_scope_id IS NOT NULL THEN
        (SELECT COUNT(*) FROM press_pricing_syncs WHERE press_id = si.role_scope_id)
      ELSE 0 END)::int AS pricing_syncs_count,
      -- Catalog configuration footprint (manufacturers only):
      -- formats configured (press_format_costs) + color/tier rows (press_color_tiers)
      (CASE WHEN si.role = 'manufacturer' AND si.role_scope_id IS NOT NULL THEN
        (SELECT COUNT(*) FROM press_format_costs WHERE press_id = si.role_scope_id)
        + (SELECT COUNT(*) FROM press_color_tiers WHERE press_id = si.role_scope_id)
      ELSE 0 END)::int AS catalog_items_count,
      -- Dated counts from CTEs
      COALESCE(lsi.imports_count,     0) AS imports_count,
      COALESCE(lss.recent_sales_count, 0) AS recent_sales_count
    FROM scope_invites si
    LEFT JOIN last_seen_user    lsu ON lsu.invite_id = si.invite_id
    LEFT JOIN last_seen_imports lsi ON lsi.invite_id = si.invite_id
    LEFT JOIN last_seen_sales   lss ON lss.invite_id = si.invite_id
    ORDER BY si.invited_at DESC
  `);

  const partners: PartnerActivityRow[] = ((result as any).rows ?? []).map((r: any) => {
    const lastSeenAt = r.last_seen_at ? new Date(r.last_seen_at) : null;
    return {
      inviteId: r.invite_id,
      role: r.role,
      roleScopeId: r.role_scope_id ?? null,
      scopeName: r.scope_name ?? r.email ?? "—",
      scopeThumbUrl: r.scope_thumb_url ?? null,
      inviteeEmail: r.email ?? null,
      inviterDisplayName: r.inviter_display_name ?? null,
      inviterEmail: r.inviter_email ?? null,
      invitedAt: r.invited_at ? new Date(r.invited_at).toISOString() : "",
      acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
      acceptedUserId: r.accepted_user_id ?? null,
      status: computeStatus({
        acceptedAt: r.accepted_at ? new Date(r.accepted_at) : null,
        revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
        expiresAt: new Date(r.expires_at),
        lastSeenAt,
      }),
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      albumCount: safeNum(r.album_count),
      rosterCount: safeNum(r.roster_count),
      pendingChangesCount: safeNum(r.pending_changes_count),
      pricingSyncsCount: safeNum(r.pricing_syncs_count),
      importsCount: safeNum(r.imports_count),
      recentSalesCount: safeNum(r.recent_sales_count),
      catalogItemsCount: safeNum(r.catalog_items_count),
    };
  });

  return { partners, activeWithinDays: ACTIVE_WITHIN_DAYS };
}

// ─── Per-partner timeline ──────────────────────────────────────────────────
// Accepts the inviteId — looks up acceptedUserId + role + roleScopeId internally
// so the route handler stays thin.
export async function partnerActivityTimelineByInviteId(
  inviteId: string,
): Promise<ActivityTimelineItem[]> {
  const r = await db.execute(sql`
    SELECT accepted_user_id, role, role_scope_id
    FROM admin_invites WHERE id = ${inviteId} LIMIT 1
  `);
  const row = ((r as any).rows ?? [])[0];
  if (!row?.accepted_user_id) return [];
  return partnerActivityTimeline(
    row.accepted_user_id,
    row.role,
    row.role_scope_id ?? null,
  );
}

// Returns up to 25 dated activity items newest-first across all signal types.
export async function partnerActivityTimeline(
  acceptedUserId: string,
  role: string,
  roleScopeId: string | null,
): Promise<ActivityTimelineItem[]> {
  const items: { ts: Date; kind: ActivityTimelineItem["kind"]; detail: string }[] = [];

  // ── Signal 1: logins ───────────────────────────────────────────────────
  const logins = await db.execute(sql`
    SELECT ts FROM analytics_events
    WHERE user_id = ${acceptedUserId} AND name = 'sign_in'
    ORDER BY ts DESC LIMIT 10
  `);
  for (const row of (logins as any).rows ?? []) {
    if (row.ts) items.push({ ts: new Date(row.ts), kind: "login", detail: "Signed in" });
  }

  // ── Signal 2: submitted edits ──────────────────────────────────────────
  const edits = await db.execute(sql`
    SELECT created_at, target_table, status
    FROM pending_changes
    WHERE submitted_by_user_id = ${acceptedUserId}
    ORDER BY created_at DESC LIMIT 10
  `);
  for (const row of (edits as any).rows ?? []) {
    if (row.created_at) {
      const note = row.status === "approved" ? " (approved)" : row.status === "rejected" ? " (rejected)" : "";
      items.push({
        ts: new Date(row.created_at),
        kind: "edit",
        detail: `Submitted edit to ${row.target_table ?? "record"}${note}`,
      });
    }
  }

  // ── Signal 3: pricing syncs (press only) ──────────────────────────────
  const syncs = await db.execute(sql`
    SELECT started_at, source, rungs_written, colors_mapped
    FROM press_pricing_syncs
    WHERE triggered_by_user_id = ${acceptedUserId}
    ORDER BY started_at DESC LIMIT 5
  `);
  for (const row of (syncs as any).rows ?? []) {
    if (row.started_at) {
      items.push({
        ts: new Date(row.started_at),
        kind: "pricing_sync",
        detail: `Pricing sync from ${row.source ?? "unknown"} — ${row.rungs_written ?? 0} rungs, ${row.colors_mapped ?? 0} colors`,
      });
    }
  }

  // ── Signal 4: imports (job_runs on albums in scope) ───────────────────
  if (roleScopeId && (role === "artist" || role === "label")) {
    const scopeCol = role === "artist" ? sql`a.primary_artist_id` : sql`a.label_id`;
    const imports = await db.execute(sql`
      SELECT jr.started_at, jr.job_type, jr.status, a.title AS album_title
      FROM job_runs jr
      JOIN albums a ON a.id = jr.album_id AND ${scopeCol} = ${roleScopeId} AND a.deleted_at IS NULL
      ORDER BY jr.started_at DESC LIMIT 8
    `);
    for (const row of (imports as any).rows ?? []) {
      if (row.started_at) {
        const failNote = row.status === "failed" ? " (failed)" : "";
        items.push({
          ts: new Date(row.started_at),
          kind: "import",
          detail: `Import (${row.job_type ?? "unknown"}) on "${row.album_title ?? "album"}"${failNote}`,
        });
      }
    }
  }

  // ── Signal 5: paid orders for albums in scope ─────────────────────────
  if (roleScopeId && (role === "artist" || role === "label")) {
    const scopeCol = role === "artist" ? sql`a.primary_artist_id` : sql`a.label_id`;
    const sales = await db.execute(sql`
      SELECT o.created_at, o.total_cents, o.sku_kind, a.title AS album_title
      FROM orders o
      JOIN albums a ON a.id = o.album_id AND ${scopeCol} = ${roleScopeId} AND a.deleted_at IS NULL
      WHERE o.status = 'paid'
      ORDER BY o.created_at DESC LIMIT 8
    `);
    for (const row of (sales as any).rows ?? []) {
      if (row.created_at) {
        const dollars = row.total_cents ? ` · $${(row.total_cents / 100).toFixed(2)}` : "";
        const kind = row.sku_kind ? ` (${row.sku_kind})` : "";
        items.push({
          ts: new Date(row.created_at),
          kind: "sale",
          detail: `Sale of "${row.album_title ?? "album"}"${kind}${dollars}`,
        });
      }
    }
  }

  items.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  return items.slice(0, 25).map(({ ts, kind, detail }) => ({
    kind,
    ts: ts.toISOString(),
    detail,
  }));
}
