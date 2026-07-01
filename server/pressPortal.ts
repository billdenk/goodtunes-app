// Task #522 — Press portal (Hellbender et al.) endpoints.
//
// Mounted under /api/press/:id/* and gated by the same requirePressScope
// helper as /api/admin/manufacturers/:id/* (super_admin + manufacturer
// admin whose role_scope_id matches the press). All endpoints are
// additive: pipeline state derives off existing album columns
// (sellQuoteLockedAt, signedCertWindow*, certBatch*Shipped*) plus the
// new mastersTriggeredAt / pressInvoice* columns added in this task,
// so we don't denorm or background-job anything yet.
//
// Customer list = artists+labels whose defaultPressId === this press,
// plus a grey-out window for partners whose defaultPressId was just
// switched away (rows from press_switch_history). The "Invited" leg
// of the funnel reads pending admin_invites with defaultPressId=:id.

import type { Express, Request, Response } from "express";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import {
  albums,
  people,
  labels,
  manufacturers,
  pressSwitchHistory,
  pressColorTiers,
} from "@shared/schema";
import { evaluateEarlyCut, syncEarlyCutQueue, resolveAlbumPressTier } from "./earlyCut";
import { hasArtistShape } from "./lib/personArtistShape";

// Pipeline stage IDs the Pipeline tab renders columns for. Derived in
// `deriveStage` below — never persisted on the album row.
// Pipeline stages, in order. Per the task spec, "Masters triggered" is a
// SINGLE stage that an album enters only AFTER artist approval of the
// early-start cut — not when the threshold is crossed. `mastersTriggeredAt`
// is still stamped at threshold-cross so we can show "awaiting approval"
// inline in Selling and avoid re-notifying, but the stage transition is
// gated on `mastersApprovedByArtistAt`.
export const PRESS_STAGES = [
  "invited",           // admin_invites pending (no album yet)
  "accepted",          // partner exists, no album yet
  "design",            // album exists, sellQuoteLockedAt is null
  "sunrise_set",       // quote locked, signed_cert_window_opens_at in future
  "selling",           // window open (may have threshold crossed, awaiting approval)
  "masters_triggered", // artist approved early-start cut
  "locked",            // preorder window closed, no press invoice yet
  "in_production",     // locked + (invoice uploaded OR billed outside system)
  "shipped",           // certBatchShippedToFulfillmentAt set
] as const;
export type PressStage = (typeof PRESS_STAGES)[number];

function deriveStage(a: any): PressStage {
  if (a.cert_batch_shipped_to_fulfillment_at) return "shipped";
  // In production requires being past Locked first — invoice fields can
  // be present on a still-selling album (e.g. early upload draft) but
  // until the window has closed we don't promote the stage.
  const isClosed = !!(a.sell_quote_locked_at && a.signed_cert_window_closed_at);
  if (isClosed && (a.press_invoice_uploaded_at || a.press_invoice_outside_system)) return "in_production";
  if (isClosed) return "locked";
  if (a.masters_approved_by_artist_at) return "masters_triggered";
  if (a.sell_quote_locked_at) {
    const opens = a.signed_cert_window_opens_at ? new Date(a.signed_cert_window_opens_at).getTime() : 0;
    if (opens > Date.now()) return "sunrise_set";
    return "selling";
  }
  return "design";
}

// --- Raw-SQL builders (shared with the db-query smoke test) ----------------
// These hand-written queries reference columns tsc can't validate, so a
// renamed/mistyped column ships silently (see Task #772's `orders.paid_at`
// outage). Each query touching orders/order_items or feeding the press
// pipeline is exposed as a builder so `scripts/db-query-smoke.ts` can EXPLAIN
// the *exact* SQL production runs and let Postgres validate every column
// reference at test time, not in a customer-facing 500.

// Earmarked revenue (Σ unit_price_cents × quantity) on paid format rows.
export function sqlEarmarkedCentsForAlbum(albumId: string): SQL {
  return sql`
    SELECT COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::text AS s
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.kind = 'format'
      AND o.album_id = ${albumId}
      AND o.status IN ('paid','shipped')
      AND o.refunded_at IS NULL
  `;
}

// Per-album masters-prep threshold from the picked tier (and per-press MAX
// fallback when the tier no longer exists).
export function sqlMastersThresholdForAlbum(albumId: string, pressId: string): SQL {
  return sql`
    SELECT pct.masters_prep_cost_cents::int AS m
    FROM pressing_order_requests por
    JOIN press_color_tiers pct
      ON pct.press_id = ${pressId}
     AND pct.format = (por.package_snapshot ->> 'format')
     AND pct.name   = (por.package_snapshot ->> 'vinylColorTier')
    WHERE por.album_id = ${albumId}
      AND por.status <> 'cancelled'
      AND por.package_snapshot ->> 'pressId' = ${pressId}
    ORDER BY (por.status = 'approved') DESC, por.submitted_at DESC
    LIMIT 1
  `;
}
export function sqlMastersThresholdFallback(pressId: string): SQL {
  return sql`
    SELECT MAX(masters_prep_cost_cents)::int AS m
    FROM press_color_tiers WHERE press_id = ${pressId}
  `;
}

// Locked quote total + quantity for an album under a press.
export function sqlLockedQuoteForAlbum(albumId: string, pressId: string): SQL {
  return sql`
    SELECT por.total_cents AS total_cents, por.quantity AS quantity
    FROM pressing_order_requests por
    WHERE por.album_id = ${albumId}
      AND por.status <> 'cancelled'
      AND por.package_snapshot ->> 'pressId' = ${pressId}
    ORDER BY (por.status = 'approved') DESC, por.submitted_at DESC
    LIMIT 1
  `;
}

// /customers — artists + labels homed to this press (paid_units CTE inside).
export function sqlPressCustomers(pressId: string): SQL {
  return sql`
      WITH press_albums AS (
        SELECT DISTINCT por.album_id, a.primary_artist_id, a.label_id,
               a.sell_quote_locked_at, a.signed_cert_window_opens_at,
               a.signed_cert_window_closes_at, a.signed_cert_window_closed_at,
               a.masters_triggered_at, a.masters_approved_by_artist_at,
               a.press_invoice_uploaded_at, a.press_invoice_outside_system,
               a.cert_batch_shipped_to_fulfillment_at
        FROM pressing_order_requests por
        JOIN albums a ON a.id = por.album_id AND a.deleted_at IS NULL
        WHERE por.status <> 'cancelled'
          AND por.package_snapshot ->> 'pressId' = ${pressId}
      ),
      paid_units AS (
        SELECT o.album_id, COALESCE(SUM(oi.quantity), 0)::int AS units
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.kind = 'format' AND o.status IN ('paid','shipped') AND o.refunded_at IS NULL
        GROUP BY o.album_id
      ),
      person_rollup AS (
        SELECT pa.primary_artist_id AS pid,
               COUNT(*)::int AS album_count,
               COALESCE(SUM(pu.units), 0)::int AS lifetime_units,
               (ARRAY_AGG(pa.album_id ORDER BY pa.sell_quote_locked_at DESC NULLS LAST))[1] AS latest_album_id
        FROM press_albums pa
        LEFT JOIN paid_units pu ON pu.album_id = pa.album_id
        WHERE pa.primary_artist_id IS NOT NULL
        GROUP BY pa.primary_artist_id
      ),
      label_rollup AS (
        SELECT pa.label_id AS lid,
               COUNT(*)::int AS album_count,
               COALESCE(SUM(pu.units), 0)::int AS lifetime_units,
               (ARRAY_AGG(pa.album_id ORDER BY pa.sell_quote_locked_at DESC NULLS LAST))[1] AS latest_album_id
        FROM press_albums pa
        LEFT JOIN paid_units pu ON pu.album_id = pa.album_id
        WHERE pa.label_id IS NOT NULL
        GROUP BY pa.label_id
      )
      SELECT * FROM (
        SELECT 'artist'::text AS kind, p.id, p.name, p.photo_url AS photo, p.contact_email AS email,
               NULL::timestamp AS joined_at,
               COALESCE(pr.album_count, 0)::int AS album_count,
               COALESCE(pr.lifetime_units, 0)::int AS lifetime_units,
               pr.latest_album_id,
               a.sell_quote_locked_at, a.signed_cert_window_opens_at,
               a.signed_cert_window_closes_at, a.signed_cert_window_closed_at,
               a.masters_triggered_at, a.masters_approved_by_artist_at,
               a.press_invoice_uploaded_at, a.press_invoice_outside_system,
               a.cert_batch_shipped_to_fulfillment_at
        FROM people p
        LEFT JOIN person_rollup pr ON pr.pid = p.id
        LEFT JOIN albums a ON a.id = pr.latest_album_id
        WHERE p.deleted_at IS NULL
          AND (p.default_press_id = ${pressId} OR pr.pid IS NOT NULL)
          AND (
            COALESCE(pr.album_count, 0) > 0
            OR NOT EXISTS (
              SELECT 1 FROM admin_invites ai
              WHERE ai.default_press_id = ${pressId}
                AND ai.used_at IS NULL AND ai.revoked_at IS NULL
                AND ai.expires_at > NOW()
                AND (ai.role_scope_id = p.id OR lower(ai.email) = lower(p.contact_email))
            )
          )
        UNION ALL
        SELECT 'label'::text AS kind, l.id, l.name, l.logo_url AS photo,
               NULL::text AS email, l.created_at AS joined_at,
               COALESCE(lr.album_count, 0)::int AS album_count,
               COALESCE(lr.lifetime_units, 0)::int AS lifetime_units,
               lr.latest_album_id,
               a.sell_quote_locked_at, a.signed_cert_window_opens_at,
               a.signed_cert_window_closes_at, a.signed_cert_window_closed_at,
               a.masters_triggered_at, a.masters_approved_by_artist_at,
               a.press_invoice_uploaded_at, a.press_invoice_outside_system,
               a.cert_batch_shipped_to_fulfillment_at
        FROM labels l
        LEFT JOIN label_rollup lr ON lr.lid = l.id
        LEFT JOIN albums a ON a.id = lr.latest_album_id
        WHERE l.deleted_at IS NULL
          AND (l.default_press_id = ${pressId} OR lr.lid IS NOT NULL)
          AND (
            COALESCE(lr.album_count, 0) > 0
            OR NOT EXISTS (
              SELECT 1 FROM admin_invites ai
              WHERE ai.default_press_id = ${pressId}
                AND ai.used_at IS NULL AND ai.revoked_at IS NULL
                AND ai.expires_at > NOW()
                AND ai.role_scope_id = l.id
            )
          )
      ) c
      ORDER BY c.album_count DESC, c.name ASC
  `;
}

// /summary — Dashboard counts (30-day units + next-90-day backlog aggregates).
export function sqlPressSummaryCounts(pressId: string): SQL {
  return sql`
      WITH press_albums AS (
        SELECT DISTINCT a.id, a.sell_quote_locked_at, a.signed_cert_window_opens_at,
               a.signed_cert_window_closes_at, a.signed_cert_window_closed_at,
               a.masters_triggered_at, a.masters_approved_by_artist_at,
               a.press_invoice_uploaded_at, a.press_invoice_outside_system,
               a.cert_batch_shipped_to_fulfillment_at, a.primary_artist_id, a.label_id
        FROM pressing_order_requests por
        JOIN albums a ON a.id = por.album_id AND a.deleted_at IS NULL
        WHERE por.status <> 'cancelled'
          AND por.package_snapshot ->> 'pressId' = ${pressId}
      )
      SELECT
        (SELECT COUNT(DISTINCT primary_artist_id) FROM press_albums WHERE primary_artist_id IS NOT NULL)::int
          + (SELECT COUNT(DISTINCT label_id) FROM press_albums WHERE label_id IS NOT NULL)::int AS customer_count,
        (SELECT COUNT(*) FROM admin_invites
           WHERE default_press_id = ${pressId}
             AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW())::int AS pending_invites,
        (SELECT COUNT(*) FROM press_albums)::int AS total_albums,
        COALESCE((
          SELECT SUM(oi.quantity)
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN press_albums pa ON pa.id = o.album_id
          WHERE oi.kind = 'format' AND o.status IN ('paid','shipped')
            AND o.refunded_at IS NULL
            AND o.created_at > NOW() - INTERVAL '30 days'
        ), 0)::int AS units_30d,
        COALESCE((
          SELECT SUM(por2.quantity)
          FROM press_albums pa
          JOIN pressing_order_requests por2
            ON por2.album_id = pa.id
           AND por2.status IN ('pending','approved')
           AND por2.package_snapshot ->> 'pressId' = ${pressId}
          WHERE pa.signed_cert_window_closed_at IS NOT NULL
            AND pa.cert_batch_shipped_to_fulfillment_at IS NULL
            AND pa.signed_cert_window_opens_at < NOW() + INTERVAL '90 days'
        ), 0)::int AS units_next_90d
  `;
}

// /summary — albums for per-stage counts.
export function sqlPressSummaryStages(pressId: string): SQL {
  return sql`
      SELECT a.id, a.sell_quote_locked_at, a.signed_cert_window_opens_at,
             a.signed_cert_window_closes_at, a.signed_cert_window_closed_at,
             a.masters_triggered_at, a.masters_approved_by_artist_at,
             a.press_invoice_uploaded_at, a.press_invoice_outside_system,
             a.cert_batch_shipped_to_fulfillment_at
      FROM albums a
      JOIN pressing_order_requests por
        ON por.album_id = a.id AND por.status <> 'cancelled'
       AND por.package_snapshot ->> 'pressId' = ${pressId}
      WHERE a.deleted_at IS NULL
  `;
}

// /customers/:kind/:cid — albums for one customer's detail drawer.
export function sqlPressCustomerAlbums(pressId: string, kind: string, cid: string): SQL {
  return sql`
      SELECT a.id, a.title, a.artwork AS "coverUrl",
             a.sell_quote_locked_at, a.signed_cert_window_opens_at,
             a.signed_cert_window_closes_at, a.signed_cert_window_closed_at,
             a.masters_triggered_at, a.masters_approved_by_artist_at,
             a.press_invoice_uploaded_at, a.press_invoice_outside_system,
             a.cert_batch_shipped_to_fulfillment_at
      FROM albums a
      JOIN pressing_order_requests por
        ON por.album_id = a.id AND por.status <> 'cancelled'
       AND por.package_snapshot ->> 'pressId' = ${pressId}
      WHERE a.deleted_at IS NULL
        AND (${kind} = 'artist' AND a.primary_artist_id = ${cid}
             OR ${kind} = 'label' AND a.label_id = ${cid})
      ORDER BY a.sell_quote_locked_at DESC NULLS LAST
  `;
}

// /pipeline — every album awarded to this press (units_sold lateral inside).
export function sqlPressPipeline(pressId: string): SQL {
  return sql`
      SELECT a.id, a.title, a.artwork AS "coverUrl", a.physical_format AS format,
             a.sell_quote_locked_at, a.signed_cert_window_opens_at,
             a.signed_cert_window_closes_at, a.signed_cert_window_closed_at,
             a.masters_triggered_at, a.masters_approved_by_artist_at,
             a.press_invoice_url, a.press_invoice_total_cents,
             a.press_invoice_uploaded_at, a.press_invoice_outside_system,
             a.press_invoice_transfer_id, a.press_invoice_transferred_at,
             a.press_invoice_transfer_amount_cents, a.press_invoice_transfer_error,
             a.cert_batch_shipped_to_fulfillment_at,
             a.fulfillment_heads_up_sent_at, a.fulfillment_heads_up_qty,
             a.primary_artist_id, a.label_id,
             por.quantity AS locked_quantity,
             por.total_cents AS locked_total_cents,
             COALESCE(p.name, l.name) AS owner_name,
             COALESCE(a.primary_artist_id, a.label_id) AS owner_id,
             CASE WHEN a.primary_artist_id IS NOT NULL THEN 'artist' ELSE 'label' END AS owner_kind,
             sold.units_sold AS units_sold,
             notif.last_notified_at AS last_notified_at
      FROM albums a
      JOIN LATERAL (
        SELECT por.quantity, por.total_cents
        FROM pressing_order_requests por
        WHERE por.album_id = a.id
          AND por.status <> 'cancelled'
          AND por.package_snapshot ->> 'pressId' = ${pressId}
        ORDER BY (por.status = 'approved') DESC, por.submitted_at DESC
        LIMIT 1
      ) por ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(oi.quantity), 0)::int AS units_sold
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.kind = 'format' AND o.album_id = a.id
          AND o.status IN ('paid','shipped') AND o.refunded_at IS NULL
      ) sold ON true
      LEFT JOIN LATERAL (
        SELECT MAX(pnl.sent_at) AS last_notified_at
        FROM partner_notification_log pnl
        WHERE pnl.status = 'sent'
          AND pnl.payload_snapshot ->> 'albumId' = a.id
      ) notif ON true
      LEFT JOIN people p ON p.id = a.primary_artist_id
      LEFT JOIN labels l ON l.id = a.label_id
      WHERE a.deleted_at IS NULL
      ORDER BY a.sell_quote_locked_at DESC NULLS LAST
  `;
}

// Paid Stripe PaymentIntent ids for an album (earmark tagging).
export function sqlPaidPaymentIntentsForAlbum(albumId: string): SQL {
  return sql`
      SELECT stripe_payment_intent_id AS pi
      FROM orders
      WHERE album_id = ${albumId}
        AND stripe_payment_intent_id IS NOT NULL
        AND status IN ('paid','shipped')
        AND refunded_at IS NULL
  `;
}

// /early-cut-pools — per-album pool ledger summary for every album homed
// to this press that has a pool building (accrued > 0).
export function sqlEarlyCutPoolsForPress(pressId: string): SQL {
  return sql`
      SELECT a.id                                   AS "albumId",
             a.title                                AS "albumTitle",
             a.artwork                              AS "coverUrl",
             a.press_pool_accrued_cents::int        AS "accruedCents",
             a.press_pool_released_cents::int       AS "releasedCents",
             GREATEST(0, a.press_pool_accrued_cents - a.press_pool_released_cents)::int
                                                    AS "availableCents",
             a.early_cut_consent_at                 AS "artistConsentAt",
             a.masters_triggered_at                 AS "mastersTriggeredAt"
        FROM albums a
       WHERE a.deleted_at IS NULL
         AND a.press_pool_accrued_cents > 0
         AND EXISTS (
           SELECT 1 FROM pressing_order_requests por
            WHERE por.album_id = a.id
              AND por.status <> 'cancelled'
              AND por.package_snapshot ->> 'pressId' = ${pressId}
         )
       ORDER BY (a.press_pool_accrued_cents - a.press_pool_released_cents) DESC
  `;
}

// Earmarked revenue from paid orders against an album, for the
// masters-trigger threshold check. Sum of (unit_price_cents * quantity)
// across order_items.kind='format' on paid+un-refunded orders.
async function earmarkedCentsForAlbum(albumId: string): Promise<number> {
  const r = await db.execute<{ s: string | null }>(sqlEarmarkedCentsForAlbum(albumId));
  const s = ((r as any).rows ?? [])[0]?.s ?? "0";
  return parseInt(s, 10) || 0;
}

// Per-album masters-prep threshold. The album's locked
// `pressing_order_request.package_snapshot` carries the picked
// format + colour-tier name; we look up the matching
// press_color_tiers row and read its mastersPrepCostCents. If the
// album's tier no longer exists (renamed/deleted in the press's
// catalog after submission) we fall back to the per-press MAX so
// the threshold never silently drops to 0 mid-flight. Returns 0 if
// the press has no masters-prep configured for the picked tier.
async function mastersThresholdForAlbum(albumId: string, pressId: string): Promise<number> {
  const r = await db.execute<{ m: number | null }>(sqlMastersThresholdForAlbum(albumId, pressId));
  const tierVal = ((r as any).rows ?? [])[0]?.m;
  if (tierVal != null) return tierVal;
  const fallback = await db.execute<{ m: number | null }>(sqlMastersThresholdFallback(pressId));
  return ((fallback as any).rows ?? [])[0]?.m ?? 0;
}

// Pulls the locked quote total (and quantity) for an album under a
// given press by reading the same pressing_order_request the pipeline
// query uses. Returns null when there is no live POR — invoice flows
// need this to compute >10% variance for admin alerts, since
// assertAlbumBelongsToPress only returns the album row itself.
async function lockedQuoteForAlbum(albumId: string, pressId: string): Promise<{ totalCents: number; quantity: number } | null> {
  const r = await db.execute<any>(sqlLockedQuoteForAlbum(albumId, pressId));
  const row = ((r as any).rows ?? [])[0];
  if (!row) return null;
  return { totalCents: Number(row.total_cents) || 0, quantity: Number(row.quantity) || 0 };
}

// Build the public origin (proto + host) for invite accept links. The
// press portal puts the resulting URL on a "Copy link" affordance so
// the operator can paste it into Messenger / iMessage / Slack when
// email delivery is iffy.
function pressInviteAcceptBase(req: Request): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (req as any).protocol ||
    "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export function registerPressPortalRoutes(
  app: Express,
  requireAdmin: any,
  requirePressScope: any,
) {
  // Task #699 — gate every press-portal EDITING endpoint behind the
  // Owner/Admin tier. requirePressScope already proved the caller is a
  // super_admin or the matching manufacturer admin; this adds the
  // Staff-vs-Owner split: Staff (per-user deny overrides on the press
  // scope) can view and invite artists, but get a 403 on any settings /
  // masters / invoice / payout / customer-routing mutation. The press
  // /me payload exposes `canEdit` so the UI disables these controls up
  // front instead of letting Staff click into a 403.
  const requirePressEditor = async (req: Request, res: Response, next: any) => {
    const { pressUserCanEdit } = await import("./auth/partnerPermissions");
    const ok = await pressUserCanEdit(req.session.userId!, String(req.params.id));
    if (!ok) {
      return res.status(403).json({
        message:
          "Staff accounts can view the press and invite artists, but only an Owner/Admin can change settings or operations.",
      });
    }
    next();
  };

  // GET /api/press/:id/me — header payload (name + logo + is_maker flag).
  app.get("/api/press/:id/me", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    const { pressUserCanEdit } = await import("./auth/partnerPermissions");
    const canEdit = await pressUserCanEdit(req.session.userId!, pressId);
    res.json({
      id: press.id,
      name: press.name,
      logoUrl: (press as any).logoUrl ?? null,
      // Task #2191 — full-size primary nav logo for the press portal
      // whitelabel header. Distinct from the square logoUrl (lists/credits).
      navLogoUrl: (press as any).navLogoUrl ?? null,
      isMaker: (press as any).isMaker ?? true,
      // Task #2091 — the embedded Settings → Catalog editor surfaces the
      // press-specific import buttons (Hellbender / MRP) keyed off domain.
      domain: (press as any).domain ?? null,
      // Task #699 — false for Staff teammates; the portal hides/disables
      // every editing control when this is false.
      canEdit,
      // Editable profile fields surfaced for the Settings tab so it can
      // round-trip without a second fetch. Notifications subtab reuses
      // contactEmail as the pipeline-alert recipient.
      websiteUrl: (press as any).websiteUrl ?? null,
      contactEmail: (press as any).contactEmail ?? null,
      contactPhone: (press as any).contactPhone ?? null,
      location: (press as any).location ?? null,
      bio: (press as any).bio ?? null,
      // Task #2129 — capability flags so the portal's own Capabilities card
      // can render + self-toggle (Vinyl / GoodDeeds / Fulfillment). Default
      // mirrors the schema column defaults.
      doesVinyl: (press as any).doesVinyl ?? true,
      doesGoodDeed: (press as any).doesGoodDeed ?? false,
      doesFulfillment: (press as any).doesFulfillment ?? false,
      // Jacket placeholder image — the Press Portal catalog tab passes this
      // into PressCatalogPanel so the VinylPreview and editor reflect the
      // saved image without a separate fetch.
      vinylPlaceholderUrl: (press as any).vinylPlaceholderUrl ?? null,
    });
  });

  // GET /api/press/:id/customers — artists + labels homed to this press.
  //
  // "Active" = either the customer's defaultPressId points at us, OR
  // the customer has at least one album whose pressing_order_request
  // is awarded to us (so an artist who switched their *default* away
  // but still has a live album with us stays Active until the album
  // ships). Each row carries:
  //   - albumCount    — non-deleted albums on this press
  //   - lifetimeUnits — sum of paid format-row quantities across those
  //   - latestStage   — derived stage of the most-recent album, or null
  //   - state         — 'invited' (no album yet), 'accepted' (no album,
  //                     signed in), or 'active' (≥1 album in pipeline)
  // Switching rows: greyed-out for 90 days after the customer reassigned
  // their default press away from us; older switches drop off entirely.
  app.get("/api/press/:id/customers", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const rows = await db.execute<any>(sqlPressCustomers(pressId));
    const active = ((rows as any).rows ?? []).map((r: any) => ({
      kind: r.kind,
      id: r.id,
      name: r.name,
      photo: r.photo,
      email: r.email ?? null,
      joinedAt: r.joined_at,
      albumCount: r.album_count,
      lifetimeUnits: r.lifetime_units,
      latestStage: r.latest_album_id ? deriveStage({
        cert_batch_shipped_to_fulfillment_at: r.cert_batch_shipped_to_fulfillment_at,
        press_invoice_uploaded_at: r.press_invoice_uploaded_at,
        press_invoice_outside_system: r.press_invoice_outside_system,
        sell_quote_locked_at: r.sell_quote_locked_at,
        signed_cert_window_opens_at: r.signed_cert_window_opens_at,
        signed_cert_window_closed_at: r.signed_cert_window_closed_at,
        masters_triggered_at: r.masters_triggered_at,
        masters_approved_by_artist_at: r.masters_approved_by_artist_at,
      }) : null,
      state: r.album_count > 0 ? "active" : "accepted",
    }));
    const invitedRows = await db.execute<any>(sql`
      SELECT ai.id, ai.email, ai.role, ai.role_scope_id AS scope_id,
             ai.token, ai.expires_at AS expires_at,
             ai.created_at AS joined_at
      FROM admin_invites ai
      WHERE ai.default_press_id = ${pressId}
        AND ai.used_at IS NULL AND ai.revoked_at IS NULL
        AND ai.expires_at > NOW()
    `);
    const acceptUrlBase = pressInviteAcceptBase(req);
    const invited = ((invitedRows as any).rows ?? []).map((r: any) => ({
      kind: r.role === "label" ? "label" : "artist",
      id: r.scope_id ?? r.id,
      name: r.email,
      photo: null,
      email: r.email,
      joinedAt: r.joined_at,
      albumCount: 0,
      lifetimeUnits: 0,
      latestStage: null,
      state: "invited",
      // The press-portal Customers list re-uses these invite rows
      // to power Resend / Revoke / Copy-link. `inviteId` is the
      // admin_invites row id (distinct from `id`, which collapses
      // to the scope row so the Open link works for accepted rows).
      inviteId: r.id,
      acceptUrl: `${acceptUrlBase}/invite/${r.token}`,
      expiresAt: r.expires_at,
    }));
    const switching = await db.execute<any>(sql`
      SELECT h.customer_kind AS kind, h.customer_id AS id, h.switched_at,
             COALESCE(p.name, l.name) AS name,
             COALESCE(p.photo_url, l.logo_url) AS photo
      FROM press_switch_history h
      LEFT JOIN people p ON p.id = h.customer_id AND h.customer_kind = 'artist'
      LEFT JOIN labels l ON l.id = h.customer_id AND h.customer_kind = 'label'
      WHERE h.from_press_id = ${pressId}
        AND h.switched_at > NOW() - INTERVAL '90 days'
        AND h.deleted_at IS NULL
      ORDER BY h.switched_at DESC
    `);
    res.json({
      active: [...invited, ...active],
      switching: (switching as any).rows ?? [],
    });
  });

  // GET /api/press/:id/customers/:kind/:cid — detail drawer payload.
  app.get("/api/press/:id/customers/:kind/:cid", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const kind = String(req.params.kind);
    const cid = String(req.params.cid);
    if (kind !== "artist" && kind !== "label") {
      return res.status(400).json({ message: "kind must be artist|label" });
    }
    const albumsRows = await db.execute<any>(sqlPressCustomerAlbums(pressId, kind, cid));
    const history = await db.execute<any>(sql`
      SELECT switched_at, from_press_id, to_press_id, reason
      FROM press_switch_history
      WHERE customer_kind = ${kind} AND customer_id = ${cid}
        AND deleted_at IS NULL
      ORDER BY switched_at DESC
    `);
    res.json({
      albums: ((albumsRows as any).rows ?? []).map((a: any) => ({
        id: a.id,
        title: a.title,
        coverUrl: a.coverUrl,
        stage: deriveStage(a),
      })),
      switchHistory: (history as any).rows ?? [],
    });
  });

  // GET /api/press/:id/summary — Dashboard metrics card.
  // Task #2188 — added revenueLast30dCents + revenueLifetimeCents so the
  // Dashboard can surface a Sales presence without requiring Reports.
  app.get("/api/press/:id/summary", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const counts = await db.execute<any>(sqlPressSummaryCounts(pressId));
    const row = ((counts as any).rows ?? [])[0] ?? {};
    const stages = await db.execute<any>(sqlPressSummaryStages(pressId));
    const byStage: Record<string, number> = {};
    for (const a of ((stages as any).rows ?? [])) {
      const s = deriveStage(a);
      byStage[s] = (byStage[s] ?? 0) + 1;
    }
    // Revenue: sum of (unit_price_cents × quantity) on paid format rows for
    // orders against albums homed to this press. Uses the same POR join as
    // the pipeline query to stay consistent with what the press "owns".
    const revRow = await db.execute<any>(sql`
      WITH press_albums AS (
        SELECT DISTINCT a.id
        FROM pressing_order_requests por
        JOIN albums a ON a.id = por.album_id AND a.deleted_at IS NULL
        WHERE por.status <> 'cancelled'
          AND por.package_snapshot ->> 'pressId' = ${pressId}
      )
      SELECT
        COALESCE(SUM(CASE WHEN o.created_at > NOW() - INTERVAL '30 days'
                          THEN oi.unit_price_cents * oi.quantity ELSE 0 END), 0)::bigint AS rev_30d,
        COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::bigint AS rev_lifetime
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.kind = 'format'
        AND o.album_id IN (SELECT id FROM press_albums)
        AND o.status IN ('paid', 'shipped')
        AND o.refunded_at IS NULL
    `).catch(() => ({ rows: [] }) as any);
    const revR = ((revRow as any).rows ?? [])[0] ?? {};
    res.json({
      customerCount: row.customer_count ?? 0,
      pendingInvites: row.pending_invites ?? 0,
      totalAlbums: row.total_albums ?? 0,
      unitsLast30d: row.units_30d ?? 0,
      unitsNext90d: row.units_next_90d ?? 0,
      revenueLast30dCents: Number(revR.rev_30d ?? 0),
      revenueLifetimeCents: Number(revR.rev_lifetime ?? 0),
      byStage,
    });
  });

  // GET /api/press/:id/pipeline — every album whose pressing-order-request
  // is awarded to this press (status != 'cancelled'). Authoritative
  // source is pressing_order_requests.package_snapshot->>'pressId', NOT
  // people/labels.default_press_id (the customer's *next-album*
  // preference, which the press has no business acting on).
  //
  // While we're here, we run the on-read sweep that:
  //   1) auto-stamps mastersTriggeredAt when earmarked revenue crosses
  //      the press's masters_prep_cost threshold (notifies the artist
  //      via in-app + email to approve early-start cutting),
  //   2) auto-fires the fulfillment heads-up on first Locked entry and
  //      re-fires when the locked quantity drifts >5% before shipping.
  // Both writes are idempotent — repeated reads cost a single SELECT.
  app.get("/api/press/:id/pipeline", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const rows = await db.execute<any>(sqlPressPipeline(pressId));
    const albumsList: any[] = [];
    for (const a of ((rows as any).rows ?? [])) {
      // (1) Auto-trigger masters early-start when earmarked revenue
      //     crosses THIS ALBUM's per-tier masters-prep threshold.
      const threshold = !a.masters_triggered_at
        ? await mastersThresholdForAlbum(a.id, pressId)
        : 0;
      if (!a.masters_triggered_at && threshold > 0) {
        const earmarked = await earmarkedCentsForAlbum(a.id);
        if (earmarked >= threshold) {
          await db
            .update(albums)
            .set({ mastersTriggeredAt: new Date() } as any)
            .where(and(eq(albums.id, a.id), isNull(albums.mastersTriggeredAt)));
          a.masters_triggered_at = new Date();
          console.log(`[masters-trigger] album=${a.id} press=${pressId} earmarked=${earmarked} threshold=${threshold} — artist must approve`);
          notifyArtistMastersReady(a.primary_artist_id, a.id, pressId).catch(() => {});
        }
      }
      // (2) Auto-fire fulfillment heads-up on Locked entry and on >5%
      //     locked-quantity drift, BUT only while still in Locked —
      //     spec says re-fire stops once the album reaches In production.
      const inLockedStage =
        !!a.signed_cert_window_closed_at
        && !a.cert_batch_shipped_to_fulfillment_at
        && !a.press_invoice_uploaded_at
        && !a.press_invoice_outside_system;
      const qty = (a.locked_quantity as number) ?? 0;
      const prevQty = (a.fulfillment_heads_up_qty as number | null) ?? null;
      const drift = prevQty ? Math.abs(qty - prevQty) / prevQty : 1;
      if (inLockedStage && qty > 0 && (prevQty == null || drift >= 0.05)) {
        await db
          .update(albums)
          .set({ fulfillmentHeadsUpSentAt: new Date(), fulfillmentHeadsUpQty: qty } as any)
          .where(eq(albums.id, a.id));
        a.fulfillment_heads_up_sent_at = new Date();
        a.fulfillment_heads_up_qty = qty;
        notifyFulfillmentHeadsUp(a.id, pressId, qty, prevQty != null).catch(() => {});
      }
      // (3) Stripe earmark tag on Locked transition — idempotent record
      //     so the platform payouts run can attribute the earmarked
      //     balance line to this press + album. Real Connect transfer
      //     follows in the payouts cycle (Task #527).
      if (a.signed_cert_window_closed_at) {
        recordPressEarmark(a.id, pressId, a.locked_total_cents ?? 0).catch(() => {});
      }
      // Task #533 — pool-funded early-cut eligibility (3-gate). Separate
      // from the legacy masters-prep auto-fire above: this only stages a
      // review-queue row once the pool covers the FULL min-run floor AND
      // the press + artist consents are both in place. Admin approval in
      // the Early Cut Review queue is the third, manual gate.
      const earlyCut = await evaluateEarlyCut(a.id);
      if (earlyCut.eligible) {
        await syncEarlyCutQueue(a.id).catch((e) =>
          console.log(`[early-cut] queue sync failed album=${a.id}: ${(e as Error).message}`),
        );
      }
      const stage = deriveStage(a);
      // Stage-entered timestamp: the most recent timestamp column that
      // moved the album INTO its current stage. Lets the card show how
      // long the album has been waiting at this step ("Stage entered 3d
      // ago") without us adding a separate per-stage history table.
      const stageEnteredAt =
        stage === "shipped" ? a.cert_batch_shipped_to_fulfillment_at :
        stage === "in_production" ? (a.press_invoice_uploaded_at ?? a.signed_cert_window_closed_at) :
        stage === "locked" ? a.signed_cert_window_closed_at :
        stage === "masters_triggered" ? a.masters_approved_by_artist_at :
        stage === "selling" ? a.signed_cert_window_opens_at :
        stage === "sunrise_set" ? a.sell_quote_locked_at :
        null;
      // Invoice variance — computed on-read so the UI chip stays
      // honest if the locked quote changes after an invoice landed.
      // tier: ok (<5%), warn (5–10%), flag (>10%) — flag mirrors the
      // [admin-alert] line emitted by the invoice POST handler.
      let invoiceVarianceCents: number | null = null;
      let invoiceVariancePct: number | null = null;
      let invoiceVarianceTier: "ok" | "warn" | "flag" | null = null;
      if (a.press_invoice_total_cents != null && a.locked_total_cents) {
        invoiceVarianceCents = a.press_invoice_total_cents - a.locked_total_cents;
        invoiceVariancePct = Math.abs(invoiceVarianceCents) / a.locked_total_cents;
        invoiceVarianceTier = invoiceVariancePct > 0.1 ? "flag"
          : invoiceVariancePct > 0.05 ? "warn"
          : "ok";
      }
      albumsList.push({
        id: a.id,
        title: a.title,
        coverUrl: a.coverUrl,
        format: a.format,
        ownerName: a.owner_name,
        ownerId: a.owner_id,
        ownerKind: a.owner_kind,
        stage,
        stageEnteredAt,
        lockedAt: a.sell_quote_locked_at,
        sunriseDate: a.signed_cert_window_opens_at,
        windowOpensAt: a.signed_cert_window_opens_at,
        windowClosesAt: a.signed_cert_window_closes_at,
        mastersTriggeredAt: a.masters_triggered_at,
        mastersApprovedByArtistAt: a.masters_approved_by_artist_at,
        pressInvoiceUrl: a.press_invoice_url,
        pressInvoiceTotalCents: a.press_invoice_total_cents,
        pressInvoiceUploadedAt: a.press_invoice_uploaded_at,
        pressInvoiceOutsideSystem: a.press_invoice_outside_system,
        pressInvoiceTransferId: a.press_invoice_transfer_id,
        pressInvoiceTransferredAt: a.press_invoice_transferred_at,
        pressInvoiceTransferAmountCents: a.press_invoice_transfer_amount_cents,
        pressInvoiceTransferError: a.press_invoice_transfer_error,
        invoiceVarianceCents,
        invoiceVariancePct,
        invoiceVarianceTier,
        shippedAt: a.cert_batch_shipped_to_fulfillment_at,
        fulfillmentHeadsUpSentAt: a.fulfillment_heads_up_sent_at,
        fulfillmentHeadsUpQty: a.fulfillment_heads_up_qty,
        lastNotifiedAt: a.last_notified_at,
        lockedQuantity: a.locked_quantity,
        lockedTotalCents: a.locked_total_cents,
        unitsSoldToDate: a.units_sold ?? 0,
        // Task #533 — early-cut chip data.
        earlyCutEligible: earlyCut.eligible,
        earlyCutPoolReady: earlyCut.poolReady,
        earlyCutMissingConsents: earlyCut.missingConsents,
        earlyCutFloorCents: earlyCut.pressFloorTotalCents,
        earlyCutPoolAvailableCents: earlyCut.poolAvailableCents,
      });
    }
    const invitedRaw = await db.execute<any>(sql`
      SELECT ai.id, ai.email, ai.role, ai.token, ai.created_at AS "createdAt",
             ai.expires_at AS "expiresAt"
      FROM admin_invites ai
      WHERE ai.default_press_id = ${pressId}
        AND ai.used_at IS NULL AND ai.revoked_at IS NULL
        AND ai.expires_at > NOW()
      ORDER BY ai.created_at DESC
    `);
    const inviteBase = pressInviteAcceptBase(req);
    const invited = { rows: ((invitedRaw as any).rows ?? []).map((r: any) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      acceptUrl: `${inviteBase}/invite/${r.token}`,
    })) };
    // "Accepted" column — customers (artists + labels) who signed up
    // against this press but haven't created an album yet. We exclude
    // anyone with at least one non-deleted album (those land in the
    // album-driven columns below) and anyone still on a pending invite
    // (those are already in the Invited column).
    const accepted = await db.execute<any>(sql`
      SELECT 'artist' AS kind, p.id, p.name, p.email,
             p.created_at AS "createdAt"
      FROM people p
      WHERE p.default_press_id = ${pressId}
        AND NOT EXISTS (
          SELECT 1 FROM albums a
          WHERE a.primary_artist_id = p.id AND a.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM admin_invites ai
          WHERE ai.default_press_id = ${pressId}
            AND lower(ai.email) = lower(p.email)
            AND ai.used_at IS NULL
            AND ai.revoked_at IS NULL
            AND ai.expires_at > NOW()
        )
      UNION ALL
      SELECT 'label' AS kind, l.id, l.name, NULL::text AS email,
             l.created_at AS "createdAt"
      FROM labels l
      WHERE l.default_press_id = ${pressId}
        AND NOT EXISTS (
          SELECT 1 FROM albums a
          WHERE a.label_id = l.id AND a.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM admin_invites ai
          WHERE ai.default_press_id = ${pressId}
            AND ai.role_scope_id = l.id
            AND ai.used_at IS NULL
            AND ai.revoked_at IS NULL
            AND ai.expires_at > NOW()
        )
      ORDER BY "createdAt" DESC
    `);
    res.json({
      albums: albumsList,
      invited: (invited as any).rows ?? [],
      accepted: (accepted as any).rows ?? [],
    });
  });

  // ─── Task #2253 — Press-scoped People ─────────────────────────────
  // Press partners are blocked from /api/admin/people/* by the global
  // deny guard, so the People tab + the scoped Person page read through
  // these endpoints instead (requireAdmin + requirePressScope keeps the
  // cross-press wall intact). A person is "in scope" for a press when
  // they're homed to it (people.default_press_id = :id) OR they're the
  // primary artist on an album awarded to it (pressing_order_requests
  // package snapshot pressId = :id).
  const sqlPersonInPressScope = (pressId: string, personId: string): SQL => sql`
    (
      EXISTS (SELECT 1 FROM people pp WHERE pp.id = ${personId}
                AND pp.deleted_at IS NULL AND pp.default_press_id = ${pressId})
      OR EXISTS (
        SELECT 1 FROM albums a
        JOIN pressing_order_requests por ON por.album_id = a.id
          AND por.status <> 'cancelled'
          AND por.package_snapshot ->> 'pressId' = ${pressId}
        WHERE a.deleted_at IS NULL AND a.primary_artist_id = ${personId}
      )
    )
  `;

  // GET /api/press/:id/albums — GoodTunes releases pressed by this plant,
  // with lifecycle-stage fields so the client can run albumStage(). Only
  // albums that have at least one non-cancelled pressing_order_request
  // scoped to this press are returned. Uses a DISTINCT CTE so an album
  // with multiple pressing requests (revisions, re-orders) appears once.
  // Cross-press isolation enforced by requirePressScope.
  app.get("/api/press/:id/albums", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const rows = await db.execute<any>(sql`
      WITH scoped_albums AS (
        SELECT DISTINCT album_id
          FROM pressing_order_requests
         WHERE status <> 'cancelled'
           AND package_snapshot ->> 'pressId' = ${pressId}
      )
      SELECT a.id, a.title, a.artwork,
             a.is_prepping                AS "isPrepping",
             a.is_hidden                  AS "isHidden",
             a.good_tunes_release_date    AS "goodTunesReleaseDate",
             a.streaming_release_date     AS "streamingReleaseDate",
             COALESCE(p.name, l.name)     AS artist
        FROM albums a
        JOIN scoped_albums sa ON sa.album_id = a.id
        LEFT JOIN people p ON p.id = a.primary_artist_id
        LEFT JOIN labels l ON l.id = a.label_id
       WHERE a.deleted_at IS NULL
         AND a.is_goodtunes_release = true
       ORDER BY a.title ASC
    `);
    res.json(
      ((rows as any).rows ?? []).map((a: any) => ({
        id: a.id as string,
        title: a.title as string,
        artwork: (a.artwork as string | null) ?? null,
        artist: (a.artist as string | null) ?? null,
        isPrepping: Boolean(a.isPrepping),
        isHidden: Boolean(a.isHidden),
        goodTunesReleaseDate: (a.goodTunesReleaseDate as string | null) ?? null,
        streamingReleaseDate: (a.streamingReleaseDate as string | null) ?? null,
      })),
    );
  });

  // GET /api/press/:id/people/search?q= — server-side name search for the
  // NewAlbumArtistDialog globalSearchApiBase typeahead. Requires a non-empty
  // `q` param; returns up to 8 PersonLite matches (ILIKE, prefix-ranked)
  // from the full GoodTunes people catalog so a press partner can find any
  // GoodTunes artist by name — not just the ones already in their roster.
  // Because only matching rows are returned (never the full catalog), a press
  // partner cannot enumerate all people by loading this endpoint.
  // Gated by requirePressScope so only this press's authenticated users can
  // query it.
  app.get("/api/press/:id/people/search", requireAdmin, requirePressScope, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });
    const like = `%${q}%`;
    const prefix = `${q}%`;
    const rows = await db.execute<any>(sql`
      SELECT id, name,
             photo_url        AS "photoUrl",
             itunes_artist_id AS "itunesArtistId"
        FROM people
       WHERE deleted_at IS NULL
         AND name ILIKE ${like}
       ORDER BY
         CASE WHEN name ILIKE ${prefix} THEN 0 ELSE 1 END,
         name ASC
       LIMIT 8
    `);
    res.json(
      ((rows as any).rows ?? []).map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        photoUrl: (r.photoUrl as string | null) ?? null,
        itunesArtistId: (r.itunesArtistId as string | null) ?? null,
      })),
    );
  });

  // GET /api/press/:id/people — the press's artist roster, shaped for
  // the AdminPeople grid/list (PersonLite + derivedRoles + affiliation).
  app.get("/api/press/:id/people", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    const rows = await db.execute<any>(sql`
      SELECT p.id, p.name, p.photo_url AS "photoUrl", p.bio,
             p.label_id AS "labelId", p.itunes_artist_id AS "itunesArtistId",
             p.spotify_url AS "spotifyUrl", p.roles, p.is_group AS "isGroup",
             p.is_artist_promoted AS "isArtistPromoted",
             COALESCE((
               SELECT array_agg(DISTINCT z.r) FROM (
                 SELECT role AS r FROM track_writers    WHERE person_id = p.id AND role IS NOT NULL AND role <> ''
                 UNION SELECT role FROM track_performers WHERE person_id = p.id AND role IS NOT NULL AND role <> ''
                 UNION SELECT role FROM album_credits    WHERE person_id = p.id AND role IS NOT NULL AND role <> ''
               ) z
             ), ARRAY[]::text[]) AS "derivedRoles",
             (EXISTS (SELECT 1 FROM albums a2 WHERE a2.primary_artist_id = p.id AND a2.deleted_at IS NULL)
              OR EXISTS (SELECT 1 FROM person_discography pd WHERE pd.person_id = p.id)
              OR EXISTS (SELECT 1 FROM users u WHERE u.role = 'artist' AND u.role_scope_id = p.id)) AS "isArtistShape"
      FROM people p
      WHERE p.deleted_at IS NULL
        AND (
          p.default_press_id = ${pressId}
          OR EXISTS (
            SELECT 1 FROM albums a
            JOIN pressing_order_requests por ON por.album_id = a.id
              AND por.status <> 'cancelled'
              AND por.package_snapshot ->> 'pressId' = ${pressId}
            WHERE a.deleted_at IS NULL AND a.primary_artist_id = p.id
          )
        )
      ORDER BY p.name ASC
    `);
    const affiliation = press
      ? { entityKind: "manufacturer", entityId: pressId, name: press.name }
      : null;
    const out = (((rows as any).rows ?? []) as any[]).map((p) => {
      const storedRoles: string[] = Array.isArray(p.roles) ? p.roles : [];
      const derived: string[] = Array.isArray(p.derivedRoles) ? p.derivedRoles.slice() : [];
      const isArtist = hasArtistShape({
        isArtistPromoted: !!p.isArtistPromoted,
        isGroup: !!p.isGroup,
        manualRoles: storedRoles,
        hasDerivedCredit: derived.length > 0,
        hasArtistCatalogSignal: !!p.isArtistShape,
      });
      if (isArtist && !derived.some((r) => r.toLowerCase() === "artist")) derived.unshift("Artist");
      return {
        id: p.id,
        name: p.name,
        photoUrl: p.photoUrl ?? null,
        bio: p.bio ?? null,
        labelId: p.labelId ?? null,
        itunesArtistId: p.itunesArtistId ?? null,
        spotifyUrl: p.spotifyUrl ?? null,
        spotifyHasMatch: null,
        affiliation,
        roles: storedRoles,
        derivedRoles: derived,
      };
    });
    res.json(out);
  });

  // GET /api/press/:id/people/:personId — PersonFull-shaped detail for
  // the scoped Person page. 404 when out of scope. Cross-press / PII
  // fields (shippingAddress, another press's invite stamp) are stripped.
  app.get("/api/press/:id/people/:personId", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const personId = String(req.params.personId);
    const scope = await db.execute<{ ok: boolean }>(
      sql`SELECT ${sqlPersonInPressScope(pressId, personId)} AS ok`,
    );
    if (!((scope as any).rows?.[0]?.ok)) return res.status(404).json({ message: "Person not found" });
    const p: any = await storage.getPersonById(personId);
    if (!p) return res.status(404).json({ message: "Person not found" });
    // Derived credit roles + artist shape (mirror /api/admin/people/:id).
    const derived: string[] = [];
    let isArtistSignal = false;
    try {
      const cr = await db.execute<{ role: string }>(sql`
        SELECT DISTINCT role FROM (
          SELECT role FROM track_writers    WHERE person_id = ${personId} AND role IS NOT NULL AND role <> ''
          UNION SELECT role FROM track_performers WHERE person_id = ${personId} AND role IS NOT NULL AND role <> ''
          UNION SELECT role FROM album_credits    WHERE person_id = ${personId} AND role IS NOT NULL AND role <> ''
        ) r ORDER BY role ASC
      `);
      for (const r of ((cr as any).rows ?? [])) if (r.role) derived.push(String(r.role));
      const sig = await db.execute<{ ok: boolean }>(sql`
        SELECT (EXISTS (SELECT 1 FROM albums WHERE primary_artist_id = ${personId} AND deleted_at IS NULL)
                OR EXISTS (SELECT 1 FROM person_discography WHERE person_id = ${personId})
                OR EXISTS (SELECT 1 FROM users WHERE role = 'artist' AND role_scope_id = ${personId})) AS ok
      `);
      isArtistSignal = !!((sig as any).rows?.[0]?.ok);
    } catch (e: any) {
      console.warn(`[press:${pressId} person:${personId}] derived roles lookup failed: ${e?.message}`);
    }
    const storedRoles: string[] = Array.isArray(p.roles) ? p.roles : [];
    const isArtist = hasArtistShape({
      isArtistPromoted: !!p.isArtistPromoted,
      isGroup: !!p.isGroup,
      manualRoles: storedRoles,
      hasDerivedCredit: derived.length > 0,
      hasArtistCatalogSignal: isArtistSignal,
    });
    if (isArtist && !derived.some((r) => r.toLowerCase() === "artist")) derived.unshift("Artist");

    // Invite state for the profile's Invite affordance. The Invite button
    // shows only when there's no live invite AND the person hasn't claimed
    // an account yet; a pending invite surfaces status + resend/revoke/copy;
    // an accepted/claimed person shows a chip. Everything is keyed on the
    // known personId (role_scope_id) — never on email — so two people who
    // share an address are never conflated. try/catch guarded so a lookup
    // failure degrades to "no invite state" rather than 500ing the profile.
    let homed = false;
    let accepted = false;
    let pendingInvite:
      | { inviteId: string; acceptUrl: string; expiresAt: string | null; reviewStatus: string | null }
      | null = null;
    try {
      const st = await db.execute<any>(sql`
        SELECT
          COALESCE((SELECT default_press_id = ${pressId} FROM people WHERE id = ${personId}), false) AS homed,
          EXISTS (SELECT 1 FROM users WHERE role = 'artist' AND role_scope_id = ${personId}) AS has_account,
          EXISTS (SELECT 1 FROM admin_invites WHERE role_scope_id = ${personId} AND used_at IS NOT NULL) AS has_used_invite
      `);
      const strow = ((st as any).rows ?? [])[0] ?? {};
      homed = !!strow.homed;
      accepted = !!(strow.has_account || strow.has_used_invite);
      const inv = await db.execute<any>(sql`
        SELECT id, token, expires_at, review_status
        FROM admin_invites
        WHERE role_scope_id = ${personId}
          AND default_press_id = ${pressId}
          AND role = 'artist'
          AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const irow = ((inv as any).rows ?? [])[0];
      if (irow) {
        pendingInvite = {
          inviteId: irow.id,
          acceptUrl: `${pressInviteAcceptBase(req)}/invite/${irow.token}`,
          expiresAt: irow.expires_at ? new Date(irow.expires_at).toISOString() : null,
          reviewStatus: irow.review_status ?? null,
        };
      }
    } catch (e: any) {
      console.warn(`[press:${pressId} person:${personId}] invite-state lookup failed: ${e?.message}`);
    }

    res.json({
      id: p.id,
      name: p.name,
      photoUrl: p.photoUrl ?? null,
      coverUrl: p.coverUrl ?? null,
      photoLocked: !!p.photoLocked,
      coverLocked: !!p.coverLocked,
      bio: p.bio ?? null,
      labelId: p.labelId ?? null,
      managerId: p.managerId ?? null,
      appleMusicUrl: p.appleMusicUrl ?? null,
      spotifyUrl: p.spotifyUrl ?? null,
      tidalUrl: p.tidalUrl ?? null,
      qobuzUrl: p.qobuzUrl ?? null,
      deezerUrl: p.deezerUrl ?? null,
      pandoraUrl: p.pandoraUrl ?? null,
      itunesArtistId: p.itunesArtistId ?? null,
      instagramUrl: p.instagramUrl ?? null,
      tiktokUrl: p.tiktokUrl ?? null,
      twitterUrl: p.twitterUrl ?? null,
      blueskyUrl: p.blueskyUrl ?? null,
      facebookUrl: p.facebookUrl ?? null,
      websiteUrl: p.websiteUrl ?? null,
      isGroup: !!p.isGroup,
      groupKind: p.groupKind ?? null,
      // Cross-press / PII stripped: never expose the mailing address or
      // another press's invite stamp to a press partner.
      shippingAddress: null,
      shippingAddressStruct: null,
      invitedByPressId: p.invitedByPressId === pressId ? pressId : null,
      artistShareSlug: p.artistShareSlug ?? null,
      shape: isArtist ? "artist" : "contact",
      isArtistPromoted: !!p.isArtistPromoted,
      roles: storedRoles,
      derivedRoles: derived,
      // Invite affordance state (see block above).
      homed,
      accepted,
      pendingInvite,
    });
  });

  // GET /api/press/:id/people/:personId/albums — the artist's GoodTunes
  // releases, each flagged editableByThisPress. Albums homed to another
  // press come back too (so the Releases grid can grey + lock them).
  app.get("/api/press/:id/people/:personId/albums", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const personId = String(req.params.personId);
    const scope = await db.execute<{ ok: boolean }>(
      sql`SELECT ${sqlPersonInPressScope(pressId, personId)} AS ok`,
    );
    if (!((scope as any).rows?.[0]?.ok)) return res.status(404).json({ message: "Person not found" });
    const p: any = await storage.getPersonById(personId);
    const needle = String(p?.name ?? "").trim().toLowerCase();
    const rows = await db.execute<any>(sql`
      SELECT a.id, a.title, a.artist, a.artwork, a.year,
             a.physical_format AS type,
             a.primary_artist_id AS "primaryArtistId",
             a.is_hidden AS "isHidden",
             a.is_goodtunes_release AS "isGoodTunesRelease",
             EXISTS (
               SELECT 1 FROM pressing_order_requests por
               WHERE por.album_id = a.id AND por.status <> 'cancelled'
                 AND por.package_snapshot ->> 'pressId' = ${pressId}
             ) AS "editableByThisPress"
      FROM albums a
      WHERE a.deleted_at IS NULL
        AND a.is_goodtunes_release = true
        AND (a.primary_artist_id = ${personId}
             OR (${needle} <> '' AND LOWER(TRIM(COALESCE(a.artist, ''))) = ${needle}))
      ORDER BY a.year DESC NULLS LAST
    `);
    res.json(
      (((rows as any).rows ?? []) as any[]).map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist ?? null,
        artwork: a.artwork ?? null,
        year: a.year ?? null,
        type: a.type ?? "LP",
        primaryArtistId: a.primaryArtistId ?? null,
        isHidden: !!a.isHidden,
        isGoodTunesRelease: !!a.isGoodTunesRelease,
        editableByThisPress: !!a.editableByThisPress,
      })),
    );
  });

  // POST /api/press/:id/people/:personId/remove — un-home the artist
  // from THIS press. The person record persists (re-adding via Add /
  // search re-links); only default_press_id is cleared (and the invite
  // stamp if it pointed here). History is recorded for the grey-out
  // "switched away" window. A press can NEVER system-delete a person.
  app.post("/api/press/:id/people/:personId/remove", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const personId = String(req.params.personId);
    const scope = await db.execute<{ ok: boolean }>(
      sql`SELECT ${sqlPersonInPressScope(pressId, personId)} AS ok`,
    );
    if (!((scope as any).rows?.[0]?.ok)) return res.status(404).json({ message: "Person not found" });
    const upd = await db.execute<{ id: string }>(sql`
      UPDATE people
         SET default_press_id = NULL,
             invited_by_press_id = CASE WHEN invited_by_press_id = ${pressId}
                                        THEN NULL ELSE invited_by_press_id END
       WHERE id = ${personId} AND default_press_id = ${pressId}
       RETURNING id
    `);
    const unhomed = (((upd as any).rows ?? []) as any[]).length > 0;
    if (unhomed) {
      await db.insert(pressSwitchHistory).values({
        customerKind: "artist",
        customerId: personId,
        fromPressId: pressId,
        toPressId: null,
        reason: "removed_by_press",
      });
    }
    res.json({ ok: true, unhomed });
  });

  // POST /api/press/:id/invite — thin wrapper that delegates into the
  // existing admin-invite handler logic via storage.createAdminInvite,
  // adding the press's defaultPressId stamp. We re-use the same
  // duplicate-email + role validation rules the admin invites page
  // uses by re-implementing the essentials here (small surface).
  const inviteBodySchema = z.object({
    email: z.string().email(),
    role: z.enum(["artist", "label"]),
    name: z.string().min(1).max(200),
    welcomeNote: z.string().max(1000).optional().nullable(),
  });
  // POST /api/press/:id/people/:personId/invite — invite an EXISTING person
  // (already in this press's People roster) to claim their profile / join
  // GoodTunes. Unlike POST /invite (which is email-keyed and can mint a NEW
  // person), this pins the invite to the known personId so no duplicate
  // Person is ever created. It homes the person to this press and emails
  // immediately — the artist counterpart of the label invite, with no
  // streaming search since the identity is already known. (start-album's
  // approval-hold flow is unchanged and still used for draft-album invites.)
  const personInviteBodySchema = z.object({
    email: z.string().email(),
    welcomeNote: z.string().max(1000).optional().nullable(),
  });
  app.post(
    "/api/press/:id/people/:personId/invite",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const personId = String(req.params.personId);
      const scope = await db.execute<{ ok: boolean }>(
        sql`SELECT ${sqlPersonInPressScope(pressId, personId)} AS ok`,
      );
      if (!((scope as any).rows?.[0]?.ok)) return res.status(404).json({ message: "Person not found" });
      const parsed = personInviteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid invite" });
      }
      const { email, welcomeNote } = parsed.data;
      const lower = email.toLowerCase();

      const person: any = await storage.getPersonById(personId);
      if (!person) return res.status(404).json({ message: "Person not found" });

      // Re-query for a live pending invite for THIS person + press so a
      // double-click / race can't mint two invites. If one exists, return it.
      const existing = await db.execute<any>(sql`
        SELECT id, token FROM admin_invites
        WHERE role_scope_id = ${personId}
          AND default_press_id = ${pressId}
          AND role = 'artist'
          AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const existingRow = ((existing as any).rows ?? [])[0];
      if (existingRow) {
        return res.status(200).json({
          id: existingRow.id,
          email: lower,
          acceptUrl: `${pressInviteAcceptBase(req)}/invite/${existingRow.token}`,
          emailDelivered: false,
          alreadyPending: true,
        });
      }

      // Home the person to this press (only if not already homed elsewhere)
      // and stamp provenance. Backfill the email when we don't have one so
      // the invite record and future email-keyed lookups agree.
      await db.execute(sql`
        UPDATE people
           SET default_press_id = COALESCE(default_press_id, ${pressId}),
               invited_by_press_id = COALESCE(invited_by_press_id, ${pressId})
         WHERE id = ${personId}
      `);
      await db.execute(sql`
        UPDATE people SET email = ${lower}
         WHERE id = ${personId} AND (email IS NULL OR email = '')
      `);

      const { sendAdminInviteEmail } = await import("./mail");
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("base64url");
      const INVITE_TTL_DAYS = 14;
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const invite = await storage.createAdminInvite({
        email: lower,
        role: "artist",
        roleScopeId: personId,
        token,
        expiresAt,
        createdByUserId: (req.session as any).userId,
        referrerKind: "manufacturer",
        referrerScopeId: pressId,
        welcomeNote: welcomeNote ?? null,
        // identity-invite → the invitee claims THIS existing Person on
        // accept rather than spawning a new profile.
        inviteRole: "identity",
        targetPersonId: personId,
      } as any);
      await db.execute(sql`
        UPDATE admin_invites SET default_press_id = ${pressId} WHERE id = ${invite.id}
      `);

      const acceptUrl = `${pressInviteAcceptBase(req)}/invite/${token}`;
      const press = await storage.getManufacturerById(pressId);
      const inviterName = press?.name ?? "Your press partner";
      const result = await sendAdminInviteEmail(
        lower,
        acceptUrl,
        inviterName,
        "Artist",
        INVITE_TTL_DAYS,
        press?.logoUrl ?? null,
      );
      res.json({ id: invite.id, email: invite.email, acceptUrl, emailDelivered: result.ok });
    },
  );

  app.post("/api/press/:id/invite", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const parsed = inviteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid invite" });
    }
    const { email, role, name, welcomeNote } = parsed.data;
    const lower = email.toLowerCase();

    // Create the scoped entity first so the invite role_scope_id is real.
    let roleScopeId: string;
    if (role === "artist") {
      const existing = await db.execute<{ id: string }>(sql`
        SELECT id FROM people WHERE LOWER(email) = ${lower} LIMIT 1
      `);
      const row = ((existing as any).rows ?? [])[0];
      if (row?.id) {
        roleScopeId = row.id;
        await db.execute(sql`
          UPDATE people SET default_press_id = ${pressId}
          WHERE id = ${roleScopeId} AND default_press_id IS NULL
        `);
      } else {
        const created = await db.execute<{ id: string }>(sql`
          INSERT INTO people (name, email, invited_by_press_id, default_press_id)
          VALUES (${name}, ${lower}, ${pressId}, ${pressId})
          RETURNING id
        `);
        roleScopeId = (created as any).rows[0].id;
      }
    } else {
      const created = await db.execute<{ id: string }>(sql`
        INSERT INTO labels (name, invited_by_press_id, default_press_id)
        VALUES (${name}, ${pressId}, ${pressId})
        RETURNING id
      `);
      roleScopeId = (created as any).rows[0].id;
    }

    // Mint the invite token and persist with default_press_id stamped.
    const { sendAdminInviteEmail } = await import("./mail");
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("base64url");
    const INVITE_TTL_DAYS = 14;
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invite = await storage.createAdminInvite({
      email: lower,
      role,
      roleScopeId,
      token,
      expiresAt,
      createdByUserId: (req.session as any).userId,
      referrerKind: "manufacturer",
      referrerScopeId: pressId,
      welcomeNote: welcomeNote ?? null,
    } as any);
    await db.execute(sql`
      UPDATE admin_invites SET default_press_id = ${pressId} WHERE id = ${invite.id}
    `);

    const acceptUrl = `${pressInviteAcceptBase(req)}/invite/${token}`;
    const press = await storage.getManufacturerById(pressId);
    const inviterName = press?.name ?? "Your press partner";
    const roleLabel = role === "artist" ? "Artist" : "Label";
    const result = await sendAdminInviteEmail(
      lower,
      acceptUrl,
      inviterName,
      roleLabel,
      INVITE_TTL_DAYS,
      press?.logoUrl ?? null,
    );
    res.json({ id: invite.id, email: invite.email, acceptUrl, emailDelivered: result.ok });
  });

  // POST /api/press/:id/start-album — Task #2044. A press starts a draft
  // album by inviting an artist, with the artist's profile prefilled from
  // a streaming search (Spotify / Apple, via the same admin endpoints the
  // operator's New-Album dialog uses) — NEVER by browsing our People
  // roster. The whole thing is held for operator approval before anything
  // becomes live: we mint the Person (or reuse one by email), create an
  // un-homed draft album, and create the invite with review_status =
  // 'pending_review' (so the email does NOT go out yet — it sends on
  // approve). On approve the operator homes the album to this press and
  // pins the press↔artist relationship; on reject the draft is trashed.
  const startAlbumBodySchema = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(200),
    title: z.string().max(200).optional().nullable(),
    welcomeNote: z.string().max(1000).optional().nullable(),
    // Streaming prefill — all optional (the press can also enter a name
    // manually and skip the search). These mirror the scrape result shape.
    photoUrl: z.string().max(2000).optional().nullable(),
    bio: z.string().max(5000).optional().nullable(),
    spotifyUrl: z.string().max(2000).optional().nullable(),
    appleMusicUrl: z.string().max(2000).optional().nullable(),
    itunesArtistId: z.string().max(64).optional().nullable(),
  });
  app.post("/api/press/:id/start-album", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const parsed = startAlbumBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const { email, name, title, welcomeNote, photoUrl, bio, spotifyUrl, appleMusicUrl, itunesArtistId } = parsed.data;
    const lower = email.toLowerCase();

    // Resolve the artist Person: reuse by email if one already exists
    // (don't let a press overwrite a curated profile), else mint a fresh
    // row from the streaming prefill. We stamp `invited_by_press_id`
    // provenance now, but DON'T pin `default_press_id` on the person —
    // that relationship only goes live when an operator approves.
    const existing = await db.execute<{ id: string }>(sql`
      SELECT id FROM people WHERE LOWER(email) = ${lower} LIMIT 1
    `);
    let personId: string = ((existing as any).rows ?? [])[0]?.id;
    if (!personId) {
      const created = await db.execute<{ id: string }>(sql`
        INSERT INTO people (name, email, invited_by_press_id, photo_url, bio, spotify_url, apple_music_url, itunes_artist_id)
        VALUES (
          ${name}, ${lower}, ${pressId},
          ${photoUrl ?? null}, ${bio ?? null},
          ${spotifyUrl ?? null}, ${appleMusicUrl ?? null}, ${itunesArtistId ?? null}
        )
        RETURNING id
      `);
      personId = (created as any).rows[0].id;
    }

    // Create the un-homed draft album. It stays invisible to the press's
    // Albums tab until the operator approves (which creates the homing
    // pressing_order_request); the invite's preFlightedAlbumId lands the
    // artist straight on the editor once they accept post-approval.
    // Task #2146 — seed the draft from this press's default jacket image
    // (manufacturers.vinyl_placeholder_url) so a press-started album begins
    // with the press's branded art; falls back to the generic placeholder
    // when the press hasn't set one. The artist/operator can swap it later.
    const seedPress = await storage.getManufacturerById(pressId);
    const draft = await storage.createAlbum({
      title: (title && title.trim()) || `${name} — untitled album`,
      artist: name,
      artwork: seedPress?.vinylPlaceholderUrl || "/album-placeholder.svg",
      type: "LP",
      isGoodTunesRelease: true,
      isPrepping: true,
      primaryArtistId: personId,
    } as any);

    // Mint the held invite. createAdminInvite carries the base fields; a
    // follow-up UPDATE stamps the press provenance + identity-invite shape
    // + the pending-review hold (mirrors the /invite endpoint's pattern of
    // a post-insert UPDATE for default_press_id).
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("base64url");
    const INVITE_TTL_DAYS = 14;
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invite = await storage.createAdminInvite({
      email: lower,
      role: "artist",
      roleScopeId: personId,
      token,
      expiresAt,
      createdByUserId: (req.session as any).userId,
      referrerKind: "manufacturer",
      referrerScopeId: pressId,
      welcomeNote: welcomeNote ?? null,
      inviteRole: "identity",
      targetPersonId: personId,
      preFlightedAlbumId: draft.id,
      reviewStatus: "pending_review",
    } as any);
    await db.execute(sql`
      UPDATE admin_invites SET default_press_id = ${pressId} WHERE id = ${invite.id}
    `);

    // No email here — it fires when the operator approves the held invite.
    res.json({
      ok: true,
      held: true,
      inviteId: invite.id,
      albumId: draft.id,
      personId,
    });
  });

  // POST /api/press/:id/invites/:inviteId/resend — mint a fresh token,
  // extend expiry, re-email. Scoped to invites belonging to this press
  // (default_press_id match) so one press can't touch another's queue.
  app.post(
    "/api/press/:id/invites/:inviteId/resend",
    requireAdmin,
    requirePressScope,
    async (req: Request, res: Response) => {
      const pressId = String(req.params.id);
      const inviteId = String(req.params.inviteId);
      const existing = await storage.getAdminInviteById(inviteId);
      if (!existing || (existing as any).defaultPressId !== pressId) {
        return res.status(404).json({ message: "Invite not found" });
      }
      if (existing.usedAt) return res.status(410).json({ message: "Invite already accepted" });
      if ((existing as any).revokedAt) {
        return res.status(410).json({ message: "Invite was revoked — send a new one" });
      }
      const crypto = await import("crypto");
      const newToken = crypto.randomBytes(32).toString("base64url");
      const INVITE_TTL_DAYS = 14;
      const newExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const updated = await storage.resendAdminInvite(existing.id, newToken, newExpiresAt);
      if (!updated) return res.status(500).json({ message: "Resend failed" });
      const acceptUrl = `${pressInviteAcceptBase(req)}/invite/${newToken}`;
      const { sendAdminInviteEmail } = await import("./mail");
      const press = await storage.getManufacturerById(pressId);
      const inviterName = press?.name ?? "Your press partner";
      const roleLabel = updated.role === "artist" ? "Artist" : "Label";
      const result = await sendAdminInviteEmail(
        updated.email,
        acceptUrl,
        inviterName,
        roleLabel,
        INVITE_TTL_DAYS,
        press?.logoUrl ?? null,
      );
      res.json({ id: updated.id, acceptUrl, emailDelivered: result.ok });
    },
  );

  // DELETE /api/press/:id/invites/:inviteId — soft-revoke a pending
  // invite. Same scope check as resend; the audit row stays put.
  app.delete(
    "/api/press/:id/invites/:inviteId",
    requireAdmin,
    requirePressScope,
    async (req: Request, res: Response) => {
      const pressId = String(req.params.id);
      const inviteId = String(req.params.inviteId);
      const existing = await storage.getAdminInviteById(inviteId);
      if (!existing || (existing as any).defaultPressId !== pressId) {
        return res.status(404).json({ message: "Invite not found" });
      }
      if (existing.usedAt) return res.status(410).json({ message: "Invite already accepted" });
      await storage.revokeAdminInvite(inviteId);
      res.json({ ok: true });
    },
  );

  // POST /api/press/:id/albums/:albumId/masters/triggered
  // Manual "trigger now" affordance — but the BUSINESS RULE is that
  // an album only crosses into masters-trigger once earmarked spend
  // ≥ the press's masters-prep threshold. We MUST NOT let a press
  // force the early-start cut prematurely (it commits the artist to
  // costs they haven't approved yet and bypasses the artist-approval
  // gate that the pipeline UI surfaces). So this endpoint becomes a
  // safety net: it only succeeds when the on-read sweep would have
  // stamped the same row, with an explicit super_admin override for
  // edge cases (e.g. a press calls support to manually trigger from a
  // non-standard pricing model). Returns 409 with current/threshold
  // values if the gate isn't met, so the UI can show "$X / $Y to go."
  app.post("/api/press/:id/albums/:albumId/masters/triggered", requireAdmin, requirePressScope, requirePressEditor, async (req: any, res) => {
    const pressId = String(req.params.id);
    const albumId = String(req.params.albumId);
    const album = await assertAlbumBelongsToPress(albumId, pressId);
    if (!album) return res.status(404).json({ message: "Album not on this press" });
    const earmarked = await earmarkedCentsForAlbum(albumId);
    const threshold = await mastersThresholdForAlbum(albumId, pressId);
    const { getUserRole } = await import("./auth/roles");
    const role = await getUserRole(req.session?.userId);
    const isOverride = role?.role === "super_admin" && req.body?.override === true;
    if (!isOverride && (threshold <= 0 || earmarked < threshold)) {
      return res.status(409).json({
        message: threshold <= 0
          ? "This press has no masters-prep cost configured — nothing to trigger."
          : "Earmarked spend has not yet crossed the masters-prep threshold.",
        earmarkedCents: earmarked,
        thresholdCents: threshold,
      });
    }
    await db
      .update(albums)
      .set({ mastersTriggeredAt: new Date() } as any)
      .where(and(eq(albums.id, albumId), isNull(albums.mastersTriggeredAt)));
    notifyArtistMastersReady(album.primary_artist_id, albumId, pressId).catch(() => {});
    res.json({ ok: true, earmarkedCents: earmarked, thresholdCents: threshold });
  });

  // POST /api/press/:id/albums/:albumId/invoice/upload-url —
  // Mint a signed PUT URL the press's browser streams the invoice PDF
  // to, and hand back the canonical `/objects/press-invoices/<id>.pdf`
  // URL the UI then POSTs to /invoice as the second step. We deliberately
  // route under `press-invoices/<albumId>-<uuid>.pdf` (NOT the generic
  // `/uploads/<uuid>` bucket that album art and avatars use) so:
  //   1) operators can spot an invoice in Object Storage by path alone,
  //   2) future retention / compliance sweeps can target just the
  //      pressing-finance ledger without touching user-uploaded media.
  // The shared `/objects/<rest>` proxy in server/routes.ts resolves
  // `/objects/press-invoices/<id>.pdf` → ${PRIVATE_OBJECT_DIR}/press-invoices/<id>.pdf
  // because getObjectEntityFile joins the path tail onto PRIVATE_OBJECT_DIR
  // — so the existing one ACL/serving codepath still handles delivery.
  app.post("/api/press/:id/albums/:albumId/invoice/upload-url", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const albumId = String(req.params.albumId);
    const album = await assertAlbumBelongsToPress(albumId, pressId);
    if (!album) return res.status(404).json({ message: "Album not on this press" });
    const crypto = await import("crypto");
    const objectId = `${albumId}-${crypto.randomUUID()}.pdf`;
    const objectKey = `press-invoices/${objectId}`;
    const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
    const oss = new ObjectStorageService();
    let entityDir = oss.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const fullPath = `${entityDir}${objectKey}`;
    // parseObjectPath + signObjectURL are file-local helpers; reach
    // through the module to avoid duplicating GCS plumbing here.
    const mod = await import("./replit_integrations/object_storage/objectStorage");
    const parseObjectPath = (mod as any).parseObjectPath as
      | ((p: string) => { bucketName: string; objectName: string })
      | undefined;
    const signObjectURL = (mod as any).signObjectURL as
      | ((args: { bucketName: string; objectName: string; method: string; ttlSec: number }) => Promise<string>)
      | undefined;
    if (parseObjectPath && signObjectURL) {
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const uploadUrl = await signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
      return res.json({ uploadUrl, publicUrl: `/objects/${objectKey}` });
    }
    // Helper exports not surfaced — fall back to the generic uploader.
    // Invoice still lands in storage, just under /uploads/<uuid>.
    const uploadUrl = await oss.getObjectEntityUploadURL();
    res.json({ uploadUrl });
  });

  // POST /api/press/:id/albums/:albumId/invoice — upload OR mark
  // "billed outside the system". Body: { url?, totalCents?, note?, outsideSystem? }.
  // Either url+totalCents must be present, OR outsideSystem=true.
  // `url` accepts either a fully-qualified https URL OR the relative
  // `/objects/press-invoices/<id>.pdf` path our signed-upload helper
  // returns. The /objects proxy resolves both to the same backing file,
  // and the client posts the relative form back to avoid leaking the
  // bucket host into the DB.
  const invoiceSchema = z.object({
    url: z
      .string()
      .min(1)
      .refine(
        (s) => /^https?:\/\//.test(s) || s.startsWith("/objects/"),
        "Invoice URL must be an https:// link or an /objects/... path",
      )
      .optional(),
    totalCents: z.number().int().min(0).optional(),
    note: z.string().max(1000).optional(),
    outsideSystem: z.boolean().optional(),
  });
  app.post("/api/press/:id/albums/:albumId/invoice", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const albumId = String(req.params.albumId);
    const album = await assertAlbumBelongsToPress(albumId, pressId);
    if (!album) return res.status(404).json({ message: "Album not on this press" });
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid invoice" });
    const { url, totalCents, note, outsideSystem } = parsed.data;
    if (!outsideSystem && (!url || totalCents == null)) {
      return res.status(400).json({ message: "Either upload an invoice URL + total, or mark billed outside system." });
    }
    await db
      .update(albums)
      .set({
        pressInvoiceUrl: outsideSystem ? null : (url ?? null),
        pressInvoiceTotalCents: outsideSystem ? null : (totalCents ?? null),
        pressInvoiceNote: note ?? null,
        pressInvoiceUploadedAt: new Date(),
        pressInvoiceOutsideSystem: !!outsideSystem,
      } as any)
      .where(eq(albums.id, albumId));

    // Task #534 — uploading (or marking-outside) the invoice is what
    // advances an album from Locked → In production, so fire the
    // pipeline-state-change notification to the press's recipients once
    // per upload. Only on first upload (no prior uploaded_at) so an
    // operator correcting a total doesn't re-spam the press.
    if (!(album as any).pressInvoiceUploadedAt) {
      notifyPipelineStateChange(albumId, pressId, "in_production", "In production").catch(() => {});
    }

    // Variance flag — spec calls for admin alert when invoice total
    // differs from the locked quote by >10%. We compute here (not at
    // read time) so the alert is emitted exactly once per upload and a
    // grep on `[admin-alert]` in the workflow log is enough to surface
    // every flagged variance. UI separately renders the green/yellow/red
    // chip from pipeline-endpoint variance fields on every read.
    if (!outsideSystem && totalCents != null) {
      const locked = await lockedQuoteForAlbum(albumId, pressId);
      const lockedCents = locked?.totalCents ?? null;
      if (lockedCents && lockedCents > 0) {
        const varianceCents = totalCents - lockedCents;
        const variancePct = Math.abs(varianceCents) / lockedCents;
        if (variancePct > 0.1) {
          const dir = varianceCents > 0 ? "over" : "under";
          console.log(`[admin-alert] press-invoice-variance album=${albumId} press=${pressId} locked=${lockedCents} invoice=${totalCents} variance=${varianceCents}c (${(variancePct * 100).toFixed(1)}% ${dir})`);
        }
      }
    }

    // Task #527 — earmark the captured total to the press's Stripe
    // Connect account. `outsideSystem` skips this branch entirely (the
    // press is being paid through a non-GoodTunes channel). Idempotency
    // is per (album, invoice identity): re-POSTing the same invoice
    // (HTTP retry, double-click) collapses onto the same transfer; a
    // corrected invoice (different URL or total) is a new identity and
    // mints a fresh transfer, with the prior transfer state cleared
    // here so a failed/skipped remint can never display stale "✓".
    let transferResult: any = null;
    if (!outsideSystem && totalCents != null && totalCents > 0) {
      transferResult = await mintPressInvoiceTransfer(albumId, pressId, totalCents);
    } else if (outsideSystem) {
      // Switching to "billed outside" clears any prior earmark UI so
      // the operator isn't shown a stale transfer chip on a card that
      // no longer has a system-tracked invoice.
      await db.execute(sql`
        UPDATE albums
        SET press_invoice_transfer_id = NULL,
            press_invoice_transferred_at = NULL,
            press_invoice_transfer_amount_cents = NULL,
            press_invoice_transfer_error = NULL,
            press_invoice_transfer_invoice_key = NULL
        WHERE id = ${albumId}
      `);
    }

    res.json({ ok: true, transfer: transferResult });
  });

  // GET /api/press/:id/payouts — Settings → Payouts data: the press's
  // Stripe Connect account state plus a roll-up of every captured
  // invoice with its variance vs the locked quote and the transfer
  // status. Read-only — actual Connect onboarding still lives on
  // /admin/manufacturers/:id?tab=payouts via the shared payouts panel.
  app.get("/api/press/:id/payouts", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const acctRows = await db.execute<any>(sql`
      SELECT id, stripe_account_id AS "stripeAccountId",
             payouts_enabled AS "payoutsEnabled",
             charges_enabled AS "chargesEnabled",
             details_submitted AS "detailsSubmitted",
             last_synced_at AS "lastSyncedAt"
      FROM payout_accounts
      WHERE owner_kind = 'manufacturer' AND owner_id = ${pressId}
      LIMIT 1
    `);
    const account = ((acctRows as any).rows ?? [])[0] ?? null;
    const invoiceRows = await db.execute<any>(sql`
      SELECT a.id AS "albumId", a.title, a.artwork AS "coverUrl",
             a.press_invoice_total_cents AS "invoiceTotalCents",
             a.press_invoice_uploaded_at AS "invoiceUploadedAt",
             a.press_invoice_outside_system AS "outsideSystem",
             a.press_invoice_transfer_id AS "transferId",
             a.press_invoice_transferred_at AS "transferredAt",
             a.press_invoice_transfer_amount_cents AS "transferAmountCents",
             a.press_invoice_transfer_error AS "transferError",
             por.total_cents AS "lockedTotalCents"
      FROM albums a
      JOIN LATERAL (
        SELECT por.total_cents
        FROM pressing_order_requests por
        WHERE por.album_id = a.id
          AND por.status <> 'cancelled'
          AND por.package_snapshot ->> 'pressId' = ${pressId}
        ORDER BY (por.status = 'approved') DESC, por.submitted_at DESC
        LIMIT 1
      ) por ON true
      WHERE a.deleted_at IS NULL
        AND (a.press_invoice_uploaded_at IS NOT NULL OR a.press_invoice_outside_system = true)
      ORDER BY a.press_invoice_uploaded_at DESC NULLS LAST
      LIMIT 50
    `);
    const invoices = ((invoiceRows as any).rows ?? []).map((r: any) => {
      let varianceCents: number | null = null;
      let variancePct: number | null = null;
      let varianceTier: "ok" | "warn" | "flag" | null = null;
      if (r.invoiceTotalCents != null && r.lockedTotalCents) {
        varianceCents = r.invoiceTotalCents - r.lockedTotalCents;
        variancePct = Math.abs(varianceCents) / r.lockedTotalCents;
        varianceTier = variancePct > 0.1 ? "flag" : variancePct > 0.05 ? "warn" : "ok";
      }
      return { ...r, varianceCents, variancePct, varianceTier };
    });
    res.json({ account, invoices });
  });

  // POST /api/press/:id/albums/:albumId/fulfillment-heads-up — fire a
  // notification to the platform fulfillment partner that a run is
  // imminent. Sends real email via notifyFulfillmentHeadsUp (Resend),
  // and stamps the album row so the dedup gate below catches re-fires
  // that drift <5% from the previous heads-up quantity.
  const headsUpSchema = z.object({ quantity: z.number().int().min(1) });
  app.post("/api/press/:id/albums/:albumId/fulfillment-heads-up", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const albumId = String(req.params.albumId);
    const album = await assertAlbumBelongsToPress(albumId, pressId);
    if (!album) return res.status(404).json({ message: "Album not on this press" });
    const parsed = headsUpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid heads-up" });
    const { quantity } = parsed.data;
    const prevQty = (album as any).fulfillmentHeadsUpQty as number | null;
    const drift = prevQty ? Math.abs(quantity - prevQty) / prevQty : 1;
    if (prevQty != null && drift < 0.05) {
      return res.json({ ok: true, skipped: "quantity within 5% of last heads-up" });
    }
    await db
      .update(albums)
      .set({
        fulfillmentHeadsUpSentAt: new Date(),
        fulfillmentHeadsUpQty: quantity,
      } as any)
      .where(eq(albums.id, albumId));
    notifyFulfillmentHeadsUp(albumId, pressId, quantity, prevQty != null).catch(() => {});
    res.json({ ok: true });
  });

  // GET /api/albums/:albumId/masters/state — small payload the admin
  // PressPanel polls to render the artist-side approval banner. Returns
  // the two trigger timestamps and whether the caller may approve
  // (super_admin OR artist-scope role pinned to this album's primary
  // artist) so the UI can show an "Approve" button or a read-only chip.
  app.get("/api/albums/:albumId/masters/state", requireAdmin, async (req: any, res) => {
    const albumId = String(req.params.albumId);
    const me = req.session?.userId;
    const r = await db.execute<any>(sql`
      SELECT a.id, a.primary_artist_id,
             a.masters_triggered_at, a.masters_approved_by_artist_at
      FROM albums a WHERE a.id = ${albumId} AND a.deleted_at IS NULL LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    if (!row) return res.status(404).json({ message: "Album not found" });
    let canApprove = false;
    if (me) {
      const { getUserRole, findMembershipForScope } = await import("./auth/roles");
      const role = await getUserRole(me);
      // Task #1036 — match against the membership SET, not the primary hat.
      canApprove = role?.role === "super_admin"
        || !!(await findMembershipForScope(me, "artist", row.primary_artist_id));
    }
    res.json({
      mastersTriggeredAt: row.masters_triggered_at,
      mastersApprovedByArtistAt: row.masters_approved_by_artist_at,
      canApprove,
    });
  });

  // POST /api/albums/:albumId/masters/approve — artist-side approval
  // of the early-start cut after we (or the press) flagged the album
  // as masters-triggered. Only the album's primary artist or a
  // super_admin may call this. Stamps mastersApprovedByArtistAt, which
  // advances the album from Masters triggered → Masters approved.
  app.post("/api/albums/:albumId/masters/approve", requireAdmin, async (req: any, res) => {
    const albumId = String(req.params.albumId);
    const me = req.session?.userId;
    if (!me) return res.status(401).json({ message: "Unauthenticated" });
    const r = await db.execute<any>(sql`
      SELECT a.id, a.primary_artist_id, a.masters_triggered_at
      FROM albums a WHERE a.id = ${albumId} AND a.deleted_at IS NULL LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    if (!row) return res.status(404).json({ message: "Album not found" });
    if (!row.masters_triggered_at) {
      return res.status(409).json({ message: "Masters not yet triggered for this album" });
    }
    // Authorize: super_admin OR an artist-role user whose scope is the
    // album's primary artist. Resellers/labels/etc. can't approve.
    const { getUserRole, findMembershipForScope } = await import("./auth/roles");
    const role = await getUserRole(me);
    // Task #1036 — match against the membership SET, not the primary hat.
    const allowed = role?.role === "super_admin"
      || !!(await findMembershipForScope(me, "artist", row.primary_artist_id));
    if (!allowed) return res.status(403).json({ message: "Only the artist may approve early-start cutting" });
    await db
      .update(albums)
      .set({ mastersApprovedByArtistAt: new Date() } as any)
      .where(and(eq(albums.id, albumId), isNull(albums.mastersApprovedByArtistAt)));
    res.json({ ok: true });
  });

  // POST /api/press/:id/customers/:kind/:cid/switch — log a switch from
  // this press to another (or to no press). Body: { toPressId?, reason? }.
  const switchSchema = z.object({
    toPressId: z.string().nullable().optional(),
    reason: z.string().max(500).optional(),
  });
  app.post("/api/press/:id/customers/:kind/:cid/switch", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const fromPressId = String(req.params.id);
    const kind = String(req.params.kind);
    const cid = String(req.params.cid);
    if (kind !== "artist" && kind !== "label") {
      return res.status(400).json({ message: "kind must be artist|label" });
    }
    const parsed = switchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid switch" });
    const toPressId = parsed.data.toPressId ?? null;
    const reason = parsed.data.reason ?? null;
    if (toPressId) {
      const target = await storage.getManufacturerById(toPressId);
      if (!target) return res.status(400).json({ message: "Target press not found" });
    }
    if (kind === "artist") {
      await db.execute(sql`UPDATE people SET default_press_id = ${toPressId} WHERE id = ${cid}`);
    } else {
      await db.execute(sql`UPDATE labels SET default_press_id = ${toPressId} WHERE id = ${cid}`);
    }
    await db.insert(pressSwitchHistory).values({
      customerKind: kind,
      customerId: cid,
      albumId: null,
      fromPressId,
      toPressId,
      reason,
    } as any);
    res.json({ ok: true });
  });

  // PATCH /api/press/:id/profile — name/logo/contact.
  const profileSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    logoUrl: z.string().nullable().optional(),
    // Task #2191 — full-size primary nav logo for the press portal whitelabel.
    navLogoUrl: z.string().nullable().optional(),
    websiteUrl: z.string().url().nullable().optional().or(z.literal("")),
    contactEmail: z.string().email().nullable().optional().or(z.literal("")),
    contactPhone: z.string().max(40).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    // Task #2129 — partners self-toggle their own services from the portal.
    doesVinyl: z.boolean().optional(),
    doesGoodDeed: z.boolean().optional(),
    doesFulfillment: z.boolean().optional(),
  });
  app.patch("/api/press/:id/profile", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid profile" });
    const norm = (v: any) => (v === "" ? null : v);
    const set: Record<string, any> = {};
    if (parsed.data.name !== undefined) set.name = parsed.data.name;
    if (parsed.data.logoUrl !== undefined) set.logoUrl = norm(parsed.data.logoUrl);
    if (parsed.data.navLogoUrl !== undefined) set.navLogoUrl = norm(parsed.data.navLogoUrl);
    if (parsed.data.websiteUrl !== undefined) set.websiteUrl = norm(parsed.data.websiteUrl);
    if (parsed.data.contactEmail !== undefined) set.contactEmail = norm(parsed.data.contactEmail);
    if (parsed.data.contactPhone !== undefined) set.contactPhone = norm(parsed.data.contactPhone);
    if (parsed.data.location !== undefined) set.location = norm(parsed.data.location);
    if (parsed.data.bio !== undefined) set.bio = norm(parsed.data.bio);
    // Task #2129 — capability flags. Merge the incoming toggle over the
    // current row, then enforce the same at-least-one guard the DB CHECK
    // does, returning a friendly message instead of a constraint 500.
    const capsTouched =
      parsed.data.doesVinyl !== undefined ||
      parsed.data.doesGoodDeed !== undefined ||
      parsed.data.doesFulfillment !== undefined;
    if (capsTouched) {
      const current = await storage.getManufacturerById(pressId);
      if (!current) return res.status(404).json({ message: "Press not found" });
      const nextVinyl = parsed.data.doesVinyl ?? (current as any).doesVinyl ?? true;
      const nextGoodDeed = parsed.data.doesGoodDeed ?? (current as any).doesGoodDeed ?? false;
      const nextFulfillment = parsed.data.doesFulfillment ?? (current as any).doesFulfillment ?? false;
      if (!nextVinyl && !nextGoodDeed && !nextFulfillment) {
        return res.status(400).json({
          message: "Keep at least one service on — Vinyl, GoodDeeds, or Fulfillment.",
        });
      }
      set.doesVinyl = nextVinyl;
      set.doesGoodDeed = nextGoodDeed;
      set.doesFulfillment = nextFulfillment;
    }
    if (Object.keys(set).length === 0) return res.json({ ok: true });
    await db.update(manufacturers).set(set).where(eq(manufacturers.id, pressId));
    res.json({ ok: true });
  });

  // POST /api/press/:id/profile/logo-url — sign a PUT URL the browser
  // streams a logo PNG/JPG to. Returns the canonical `/objects/uploads/<id>.<ext>`
  // URL the client then writes back via PATCH /profile { logoUrl }.
  app.post("/api/press/:id/profile/logo-url", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const ext = String(req.body?.ext ?? "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
    const oss = new ObjectStorageService();
    const crypto = await import("crypto");
    let entityDir = oss.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const objectId = `${crypto.randomUUID()}.${ext}`;
    const objectKey = `uploads/${objectId}`;
    const fullPath = `${entityDir}${objectKey}`;
    const mod = await import("./replit_integrations/object_storage/objectStorage");
    const parseObjectPath = (mod as any).parseObjectPath as
      | ((p: string) => { bucketName: string; objectName: string })
      | undefined;
    const signObjectURL = (mod as any).signObjectURL as
      | ((args: { bucketName: string; objectName: string; method: string; ttlSec: number }) => Promise<string>)
      | undefined;
    if (parseObjectPath && signObjectURL) {
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const uploadUrl = await signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
      return res.json({ uploadUrl, publicUrl: `/objects/${objectKey}` });
    }
    const uploadUrl = await oss.getObjectEntityUploadURL();
    res.json({ uploadUrl });
  });

  // ─── Task #533 — Pool-funded early masters cut (3-gate) ──────────────
  //
  // Gate #1 (press auto-trigger consent) lives on the manufacturer and is
  // a one-time super-admin switch. Gate #2 (artist per-album opt-in) is on
  // the album, scoped to the currently-picked tier/format. Gate #3 is the
  // admin approving the Early Cut Review queue row. None of these front
  // GoodTunes capital: the per-album pool must already cover the press's
  // minimum-run floor before a row ever becomes eligible (see
  // server/earlyCut.ts).

  // PATCH /api/admin/manufacturers/:id/auto-trigger-consent — Gate #1.
  // Super-admin only: flips the press's standing consent that pool-funded
  // early cuts may be auto-staged for albums homed to this press.
  app.patch("/api/admin/manufacturers/:id/auto-trigger-consent", requireAdmin, async (req: any, res) => {
    const { getUserRole } = await import("./auth/roles");
    const role = await getUserRole(req.session?.userId);
    if (role?.role !== "super_admin") {
      return res.status(403).json({ message: "Only a super-admin can change a press's auto-trigger consent." });
    }
    const pressId = String(req.params.id);
    const consent = req.body?.consent === true;
    await db.execute(sql`
      UPDATE manufacturers
         SET auto_trigger_consent_at = ${consent ? sql`NOW()` : null},
             auto_trigger_consent_by = ${consent ? req.session.userId : null}
       WHERE id = ${pressId}
    `);
    res.json({ ok: true, consent });
  });

  // GET /api/admin/albums/:albumId/early-cut — eligibility + tier + pool
  // ledger summary + the album's current artist-opt-in state. Powers the
  // SellPanel popover, the AdminAlbum readout, and the AdminManufacturer
  // pool readout.
  app.get("/api/admin/albums/:albumId/early-cut", requireAdmin, async (req, res) => {
    const albumId = String(req.params.albumId);
    const e = await evaluateEarlyCut(albumId);
    const rows = await db.execute<any>(sql`
      SELECT press_pool_accrued_cents::int        AS accrued,
             press_pool_released_cents::int       AS released,
             early_cut_consent_at                 AS consent_at,
             early_cut_consent_for_tier_name      AS consent_tier,
             early_cut_consent_for_format         AS consent_format,
             masters_triggered_at                 AS masters_triggered_at
        FROM albums WHERE id = ${albumId} LIMIT 1
    `);
    const a = ((rows as any).rows ?? [])[0] ?? {};
    res.json({
      tier: e.tier,
      eligible: e.eligible,
      poolReady: e.poolReady,
      unitsSold: e.unitsSold,
      pressFloorTotalCents: e.pressFloorTotalCents,
      poolAccruedCents: Number(a.accrued) || 0,
      poolReleasedCents: Number(a.released) || 0,
      poolAvailableCents: e.poolAvailableCents,
      missingConsents: e.missingConsents,
      mastersTriggeredAt: a.masters_triggered_at ?? null,
      artistConsent: {
        at: a.consent_at ?? null,
        tierName: a.consent_tier ?? null,
        format: a.consent_format ?? null,
        // Whether the stored consent still matches the live tier/format.
        appliesToCurrentTier:
          !!a.consent_at &&
          !!e.tier &&
          a.consent_tier === e.tier.tierName &&
          a.consent_format === e.tier.format,
      },
    });
  });

  // GET /api/admin/manufacturers/:id/early-cut-pools — per-album pool
  // ledger summary for every album homed to this press that has a pool
  // building (accrued > 0). Powers the AdminManufacturer pool readout so
  // the operator can see accrued / released / available per album without
  // opening each album. Same press-homing source as the pipeline:
  // pressing_order_requests.package_snapshot->>'pressId'.
  app.get("/api/admin/manufacturers/:id/early-cut-pools", requireAdmin, async (req, res) => {
    const pressId = String(req.params.id);
    const rows = await db.execute<any>(sqlEarlyCutPoolsForPress(pressId));
    res.json(((rows as any).rows ?? []));
  });

  // POST /api/admin/albums/:albumId/early-cut-consent — Gate #2. The
  // artist opt-in. We snapshot the tier name + format the consent was
  // given against so re-picking a different tier/format silently
  // invalidates it (evaluateEarlyCut compares against the live tier).
  app.post("/api/admin/albums/:albumId/early-cut-consent", requireAdmin, async (req: any, res) => {
    const albumId = String(req.params.albumId);
    const consent = req.body?.consent === true;
    if (!consent) {
      await db.execute(sql`
        UPDATE albums
           SET early_cut_consent_at = NULL,
               early_cut_consent_by_user_id = NULL,
               early_cut_consent_for_tier_name = NULL,
               early_cut_consent_for_format = NULL
         WHERE id = ${albumId}
      `);
      return res.json({ ok: true, consent: false });
    }
    const tier = await resolveAlbumPressTier(albumId);
    if (!tier) {
      return res.status(409).json({
        message: "This album has no resolvable press tier yet — pick a press tier on the Sell tab before opting in.",
      });
    }
    await db.execute(sql`
      UPDATE albums
         SET early_cut_consent_at = NOW(),
             early_cut_consent_by_user_id = ${req.session.userId},
             early_cut_consent_for_tier_name = ${tier.tierName},
             early_cut_consent_for_format = ${tier.format}
       WHERE id = ${albumId}
    `);
    res.json({ ok: true, consent: true, tierName: tier.tierName, format: tier.format });
  });

  // GET /api/admin/early-cut/queue — Gate #3 inbox. Pending review rows
  // across all presses (global admin surface, not press-scoped) joined to
  // album + press display fields.
  app.get("/api/admin/early-cut/queue", requireAdmin, async (_req, res) => {
    const rows = await db.execute<any>(sql`
      SELECT q.id, q.album_id AS "albumId", q.press_id AS "pressId",
             q.status, q.press_floor_total_cents AS "pressFloorTotalCents",
             q.pool_available_cents AS "poolAvailableCents",
             q.units_sold AS "unitsSold", q.tier_name AS "tierName",
             q.format, q.created_at AS "createdAt",
             a.title AS "albumTitle", a.artwork AS "coverUrl",
             m.name AS "pressName"
        FROM press_early_cut_queue q
        JOIN albums a ON a.id = q.album_id
        LEFT JOIN manufacturers m ON m.id = q.press_id
       WHERE q.status = 'pending'
       ORDER BY q.created_at ASC
    `);
    res.json(((rows as any).rows ?? []));
  });

  // POST /api/admin/early-cut/:queueId/approve — Gate #3 fires. Re-checks
  // eligibility (the pool/consents could have changed since the sweep
  // enqueued it), stamps masters_triggered_at via the same path the
  // manual trigger uses, writes a `release` ledger row sized to the press
  // floor, bumps press_pool_released_cents, and mints the #527-style
  // Stripe Connect earmark that releases the floor to the press at the
  // next payout cycle. The masters-cut click is permanent by design.
  app.post("/api/admin/early-cut/:queueId/approve", requireAdmin, async (req: any, res) => {
    const queueId = String(req.params.queueId);
    const qRows = await db.execute<any>(sql`
      SELECT id, album_id, press_id, status
        FROM press_early_cut_queue WHERE id = ${queueId} LIMIT 1
    `);
    const q = ((qRows as any).rows ?? [])[0];
    if (!q) return res.status(404).json({ message: "Queue row not found." });
    if (q.status !== "pending") {
      return res.status(409).json({ message: `This request was already ${q.status}.` });
    }
    const albumId = String(q.album_id);

    // Re-evaluate against live data — never approve a row that has fallen
    // out of eligibility (pool drained by a refund, consent revoked, tier
    // changed, or the cut already triggered another way).
    const e = await evaluateEarlyCut(albumId);
    if (!e.eligible || !e.tier) {
      return res.status(409).json({
        message: "This album is no longer eligible for an early cut.",
        missingConsents: e.missingConsents,
        poolReady: e.poolReady,
      });
    }
    const floorCents = e.pressFloorTotalCents;
    const tier = e.tier;
    // Pay the press that is actually quoting the album *now*, not whatever
    // was snapshotted when the row was enqueued (routing can change while a
    // row waits for approval).
    const pressId = tier.pressId;

    // Atomically claim the row: flip pending → approved in a single
    // conditional UPDATE so two concurrent approvals can't both fall
    // through to the release/earmark side effects. Only the request that
    // actually moves the row proceeds; the loser sees a 409. The claim and
    // every pool/trigger side effect run in ONE transaction so a failure
    // anywhere rolls the claim back too — the row stays `pending` and the
    // approval can simply be retried, never stranded half-applied.
    const { createEarmarkIfAbsent } = await import("./payoutEarmarks");
    let claimed = false;
    let earmarkId: string | null = null;
    try {
      claimed = await db.transaction(async (tx) => {
        const claim = await tx.execute<any>(sql`
          UPDATE press_early_cut_queue
             SET status = 'approved', decided_at = NOW(),
                 decided_by_user_id = ${req.session.userId}
           WHERE id = ${queueId} AND status = 'pending'
          RETURNING id
        `);
        if (((claim as any).rows ?? []).length === 0) return false;

        // 1) Stamp the trigger (idempotent — only when not already triggered).
        await tx
          .update(albums)
          .set({ mastersTriggeredAt: new Date() } as any)
          .where(and(eq(albums.id, albumId), isNull(albums.mastersTriggeredAt)));

        // 2) Pool accounting: record the release and bump the denormalized
        //    running total so the available pool reflects the drawdown.
        await tx.execute(sql`
          INSERT INTO album_press_pool_ledger (album_id, kind, cents, note)
          VALUES (${albumId}, 'release', ${floorCents},
                  ${`Early cut approved — ${tier.format}/${tier.tierName}`})
        `);
        await tx.execute(sql`
          UPDATE albums
             SET press_pool_released_cents = press_pool_released_cents + ${floorCents}
           WHERE id = ${albumId}
        `);

        // 3) #527 Stripe Connect plumbing: hold an earmark for the floor to
        //    the press, released to its connected account at the next payout
        //    cycle. Runs INSIDE the same transaction so a failure here rolls
        //    the claim + release back — the row stays `pending` and the whole
        //    approval is retryable, never approved-and-released with no payout
        //    queued. Idempotent by (sourceKind, sourceRef=queueId).
        const earmark = await createEarmarkIfAbsent(
          {
            sourceKind: "early_cut",
            sourceRef: queueId,
            albumId,
            ownerKind: "manufacturer",
            ownerId: pressId,
            amountCents: floorCents,
            currency: "usd",
            notes: `Early cut floor — ${tier.format}/${tier.tierName}`,
          },
          tx,
        );
        earmarkId = earmark.id;
        return true;
      });
    } catch (err) {
      console.error(`[early-cut] approve tx failed album=${albumId}: ${(err as Error).message}`);
      return res.status(500).json({ message: "Couldn't stage the cut — nothing was changed. Try again." });
    }
    if (!claimed) {
      return res.status(409).json({ message: "This request was already decided." });
    }

    // 4) Tell the artist their cut is starting (fire-and-forget).
    const artistRow = await db.execute<any>(sql`
      SELECT primary_artist_id FROM albums WHERE id = ${albumId} LIMIT 1
    `);
    const artistId = ((artistRow as any).rows ?? [])[0]?.primary_artist_id ?? null;
    notifyArtistMastersReady(artistId, albumId, pressId).catch(() => {});

    res.json({ ok: true, releasedCents: floorCents, earmarkId });
  });

  // POST /api/admin/early-cut/:queueId/decline — soft-defer with reason.
  // The album stays in the pool; a future sweep can re-enqueue it if it's
  // still eligible, so this is a "not now" rather than a permanent block.
  app.post("/api/admin/early-cut/:queueId/decline", requireAdmin, async (req: any, res) => {
    const queueId = String(req.params.queueId);
    const reason = String(req.body?.reason ?? "").slice(0, 1000);
    const qRows = await db.execute<any>(sql`
      SELECT status FROM press_early_cut_queue WHERE id = ${queueId} LIMIT 1
    `);
    const q = ((qRows as any).rows ?? [])[0];
    if (!q) return res.status(404).json({ message: "Queue row not found." });
    if (q.status !== "pending") {
      return res.status(409).json({ message: `This request was already ${q.status}.` });
    }
    await db.execute(sql`
      UPDATE press_early_cut_queue
         SET status = 'declined', decline_reason = ${reason || null},
             decided_at = NOW(), decided_by_user_id = ${req.session.userId}
       WHERE id = ${queueId}
    `);
    res.json({ ok: true });
  });
}

// ─── Side-effect helpers ───────────────────────────────────────────────
// All three helpers run fire-and-forget from the on-read pipeline sweep
// (and from the masters-trigger endpoint), so they MUST swallow their
// own errors — never throw upward, never block the response.

async function notifyArtistMastersReady(artistId: string | null, albumId: string, pressId: string) {
  if (!artistId) return;
  try {
    const r = await db.execute<any>(sql`
      SELECT p.name AS artist_name, p.email AS artist_email,
             a.title AS album_title,
             m.name AS press_name
      FROM albums a
      LEFT JOIN people p ON p.id = ${artistId}
      LEFT JOIN manufacturers m ON m.id = ${pressId}
      WHERE a.id = ${albumId}
      LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    if (!row?.artist_email) {
      console.log(`[notify] masters-ready skip — no email on artist=${artistId} album=${albumId}`);
      return;
    }
    const { sendMastersReadyEmail } = await import("./mail");
    const approveUrl = `${process.env.PUBLIC_ORIGIN || "https://admin.goodtunes.music"}/admin/albums/${albumId}?masters=approve`;
    const result = await sendMastersReadyEmail(
      row.artist_email,
      row.artist_name ?? "there",
      row.album_title ?? "your album",
      row.press_name ?? "the press",
      approveUrl,
    );
    console.log(`[notify] masters-ready artist=${artistId} album=${albumId} press=${pressId} mail=${result.ok ? "sent" : `failed:${result.reason}`}`);
  } catch (e) {
    console.log(`[notify] masters-ready threw: ${(e as Error).message}`);
  }
}

// Build an admin pipeline deep-link for a press, so heads-up emails carry
// a one-click jump straight to the album's pressing pipeline.
function pressPipelineUrl(pressId: string): string {
  const origin = process.env.PUBLIC_ORIGIN || "https://admin.goodtunes.music";
  return `${origin}/admin/manufacturers/${pressId}?tab=pipeline`;
}

// Compute the press's target ship-by date from its standard turnaround
// (week-range preferred, then turnaround_days, then a 4-week default),
// measured from now — the moment the run is locked and the heads-up fires.
function shipByLabelFromTurnaround(row: any): string {
  const weeks =
    (row?.turnaround_weeks_max as number | null) ??
    (row?.turnaround_weeks_min as number | null) ??
    null;
  const days = weeks != null ? weeks * 7 : ((row?.turnaround_days as number | null) ?? 28);
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function notifyFulfillmentHeadsUp(albumId: string, pressId: string, qty: number, isUpdate: boolean) {
  const pipelineUrl = pressPipelineUrl(pressId);
  try {
    const r = await db.execute<any>(sql`
      SELECT a.title AS album_title,
             m.name AS press_name,
             m.turnaround_weeks_min, m.turnaround_weeks_max, m.turnaround_days,
             fp.name AS partner_name,
             fp.contact_email AS partner_email
      FROM albums a
      LEFT JOIN manufacturers m ON m.id = ${pressId}
      LEFT JOIN fulfillment_partners fp ON fp.id = a.fulfillment_partner_id
      WHERE a.id = ${albumId}
      LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    if (!row?.partner_email) {
      console.log(`[notify] fulfillment-heads-up skip — no fulfillment partner email album=${albumId} qty=${qty}`);
      return;
    }
    const shipByLabel = shipByLabelFromTurnaround(row);
    const { sendFulfillmentHeadsUpEmail } = await import("./mail");
    const result = await sendFulfillmentHeadsUpEmail(
      row.partner_email,
      row.partner_name ?? "team",
      row.album_title ?? "an album",
      row.press_name ?? "the press",
      qty,
      isUpdate,
      { shipByLabel, pipelineUrl },
    );
    console.log(`[notify] fulfillment-heads-up album=${albumId} press=${pressId} qty=${qty} update=${isUpdate} mail=${result.ok ? "sent" : `failed:${result.reason}`}`);
  } catch (e) {
    console.log(`[notify] fulfillment-heads-up threw: ${(e as Error).message}`);
  }

  // Task #534 — fan the same heads-up out to every configured
  // notification recipient on the routed fulfillment partner (the
  // legacy single contact_email send above stays for back-compat and
  // is logged to console only). Best-effort; never blocks the request.
  try {
    const r = await db.execute<any>(sql`
      SELECT a.fulfillment_partner_id AS fp_id,
             a.title AS album_title,
             m.name AS press_name,
             m.turnaround_weeks_min, m.turnaround_weeks_max, m.turnaround_days,
             fp.name AS partner_name
      FROM albums a
      LEFT JOIN manufacturers m ON m.id = ${pressId}
      LEFT JOIN fulfillment_partners fp ON fp.id = a.fulfillment_partner_id
      WHERE a.id = ${albumId}
      LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    if (row?.fp_id) {
      const { dispatchPartnerNotification, partnerEmailHtml } = await import("./partnerNotifications");
      const partnerName = row.partner_name ?? "team";
      const albumTitle = row.album_title ?? "an album";
      const pressName = row.press_name ?? "the press";
      const shipByLabel = shipByLabelFromTurnaround(row);
      const verb = isUpdate ? "Updated quantity" : "Incoming run";
      const subject = `${verb}: ${qty} units of ${albumTitle} from ${pressName} — ship by ${shipByLabel}`;
      const bodyLines = [
        isUpdate
          ? "The expected quantity changed:"
          : "Heads-up — a run is on the way:",
        `${qty} units of ${albumTitle}, pressed by ${pressName}.`,
        `Target ship-by date: ${shipByLabel}.`,
      ];
      await dispatchPartnerNotification({
        partnerKind: "fulfillment",
        partnerId: String(row.fp_id),
        eventType: "fulfillment_heads_up",
        subject,
        html: partnerEmailHtml({
          heading: verb,
          bodyLines,
          partnerName,
          cta: { label: "View the pipeline", url: pipelineUrl },
        }),
        text: `${bodyLines.join("\n\n")}\n\nView the pipeline: ${pipelineUrl}`,
        payloadSnapshot: { albumId, pressId, albumTitle, pressName, quantity: qty, isUpdate, shipByLabel, pipelineUrl },
      });
    }
  } catch (e) {
    console.log(`[notify] fulfillment-heads-up recipients threw: ${(e as Error).message}`);
  }
}

// Task #534 — pipeline-state-change fan-out to the press's notification
// recipients (e.g. "in production" when an invoice lands). Best-effort.
async function notifyPipelineStateChange(
  albumId: string,
  pressId: string,
  newStage: string,
  stageLabel: string,
) {
  try {
    const r = await db.execute<any>(sql`
      SELECT a.title AS album_title, m.name AS press_name
      FROM albums a
      LEFT JOIN manufacturers m ON m.id = ${pressId}
      WHERE a.id = ${albumId}
      LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    const albumTitle = row?.album_title ?? "an album";
    const pressName = row?.press_name ?? "the press";
    const { dispatchPartnerNotification, partnerEmailHtml } = await import("./partnerNotifications");
    const subject = `${albumTitle}: now ${stageLabel}`;
    const bodyLines = [
      `${albumTitle} has moved to a new stage in the GoodTunes pressing pipeline.`,
      `New status: ${stageLabel}.`,
    ];
    await dispatchPartnerNotification({
      partnerKind: "manufacturer",
      partnerId: pressId,
      eventType: "pipeline_state_change",
      subject,
      html: partnerEmailHtml({ heading: `Now ${stageLabel}`, bodyLines, partnerName: pressName }),
      text: bodyLines.join("\n\n"),
      payloadSnapshot: { albumId, pressId, albumTitle, newStage, stageLabel },
    });
  } catch (e) {
    console.log(`[notify] pipeline-state-change threw: ${(e as Error).message}`);
  }
}

// Task #527 — Mint a Stripe Connect transfer earmarking the press's
// captured invoice total to its connected account. Looks up the
// press's payout_accounts row (ownerKind='manufacturer', ownerId=pressId);
// if there isn't one, or its payouts aren't enabled, we stamp the
// failure reason on the album so the Payouts subtab can surface a
// "Connect Stripe" CTA.
//
// Idempotency is keyed on (album, invoice identity) — NOT album alone.
// `invoiceKey` is a short hash of the captured invoice's URL + total,
// so:
//   - Re-POSTing the same invoice (HTTP retry, double-click) collapses
//     onto the same Stripe transfer (stable `idempotencyKey`) AND
//     short-circuits server-side once we've already stamped that key
//     on the album.
//   - Uploading a corrected invoice (new URL or new total) is a
//     different invoice identity → mints a NEW transfer. The latest
//     transfer wins on the album row; admins reverse the prior one
//     out-of-band if double-paying is a concern (see Task #532 for
//     the planned auto-reversal flow).
async function mintPressInvoiceTransfer(
  albumId: string,
  pressId: string,
  totalCents: number,
): Promise<{
  status: "transferred" | "skipped" | "failed" | "already_transferred";
  transferId?: string;
  amountCents?: number;
  invoiceKey?: string;
  error?: string;
}> {
  // Invoice identity fingerprint: URL + total. Short hash keeps the
  // Stripe idempotency_key under Stripe's 255-char cap and free of
  // URL-unsafe characters.
  const { createHash } = await import("node:crypto");
  const invoiceRows = await db.execute<any>(sql`
    SELECT press_invoice_url, press_invoice_total_cents,
           press_invoice_transfer_id, press_invoice_transfer_amount_cents,
           press_invoice_transfer_invoice_key
    FROM albums WHERE id = ${albumId} LIMIT 1
  `);
  const albumRow = ((invoiceRows as any).rows ?? [])[0];
  const invoiceUrl: string = albumRow?.press_invoice_url ?? "";
  const invoiceKey = createHash("sha1")
    .update(`${invoiceUrl}|${totalCents}`)
    .digest("hex")
    .slice(0, 16);
  const stripeIdempotencyKey = `press_invoice_${albumId}_${invoiceKey}`;
  const priorTransferId: string | null = albumRow?.press_invoice_transfer_id ?? null;
  const priorInvoiceKey: string | null = albumRow?.press_invoice_transfer_invoice_key ?? null;

  // 1) Server-side short-circuit: same invoice identity already minted
  //    a transfer → return the existing one. (Stripe-side
  //    idempotency_key is the safety net for the same key creating two
  //    transfers; this short-circuit saves the network round-trip.)
  if (priorTransferId && priorInvoiceKey === invoiceKey) {
    return {
      status: "already_transferred",
      transferId: priorTransferId,
      amountCents: Number(albumRow.press_invoice_transfer_amount_cents) || 0,
      invoiceKey,
    };
  }

  // 2) New invoice identity (or first capture) — clear any prior
  //    transfer state so a failed/skipped remint can never display a
  //    stale "✓ earmarked" chip from the previous invoice.
  if (priorTransferId) {
    console.log(`[press-transfer] album=${albumId} press=${pressId} superseding prior transfer ${priorTransferId} (key=${priorInvoiceKey ?? "?"}) → new invoiceKey=${invoiceKey} total=${totalCents}c`);
  }
  await db.execute(sql`
    UPDATE albums
    SET press_invoice_transfer_id = NULL,
        press_invoice_transferred_at = NULL,
        press_invoice_transfer_amount_cents = NULL,
        press_invoice_transfer_error = NULL,
        press_invoice_transfer_invoice_key = NULL
    WHERE id = ${albumId}
  `);

  // Task #543 — Earmark instead of transferring. The press's Stripe
  // account is still resolved on release; we just stamp the invoice
  // identity on the album so the Payouts subtab can show "earmarked,
  // waiting for Bill". Any earlier still-held earmark for this album
  // is auto-cancelled so the queue can't show two competing rows for
  // the same album when a corrected invoice supersedes the first.
  try {
    const { createEarmarkIfAbsent } = await import("./payoutEarmarks");
    // Supersede any held earmark for an earlier invoiceKey on this
    // album — keeps the queue from showing two competing rows when a
    // corrected invoice arrives. Raw SQL because cancelHeldEarmarksForSource
    // matches on sourceRef equality; we need to cancel everything *except*
    // the current key.
    await db.execute(sql`
      UPDATE payout_earmarks
         SET status = 'rejected', rejected_at = NOW(),
             rejection_reason = 'Superseded by corrected invoice'
       WHERE source_kind = 'press_invoice'
         AND album_id = ${albumId}
         AND status IN ('held','failed')
         AND source_ref <> ${invoiceKey}
    `);
    const earmark = await createEarmarkIfAbsent({
      sourceKind: "press_invoice",
      sourceRef: invoiceKey,
      albumId,
      ownerKind: "manufacturer",
      ownerId: pressId,
      amountCents: totalCents,
      currency: "usd",
      notes: `Invoice ${invoiceUrl || "(no url)"}`,
    });
    await db.execute(sql`
      UPDATE albums
      SET press_invoice_transfer_invoice_key = ${invoiceKey},
          press_invoice_transfer_amount_cents = ${totalCents},
          press_invoice_transfer_error = 'Earmarked — pending Bill release'
      WHERE id = ${albumId}
    `);
    console.log(`[press-transfer] album=${albumId} press=${pressId} earmarked=${earmark.id} amount=${totalCents}c key=${invoiceKey}`);
    return { status: "transferred", transferId: earmark.id, amountCents: totalCents, invoiceKey };
  } catch (e: any) {
    const reason = e?.message ?? "Earmark failed";
    await db.execute(sql`
      UPDATE albums SET press_invoice_transfer_error = ${reason}
      WHERE id = ${albumId}
    `);
    console.log(`[press-transfer] album=${albumId} press=${pressId} FAILED — ${reason}`);
    return { status: "failed", error: reason };
  }
}

// Stripe earmark: tag every paid PaymentIntent backing this album with
// the press_id + album_id so the Connect payout cycle can attribute the
// earmarked balance lines correctly. Idempotent by design — Stripe
// metadata writes are full-object replaces but our keys (gt_press_id /
// gt_press_earmark_cents) are stable, and we only run this once per
// album per session (the album-row `cert_earmarked_to_press_id` stamp
// short-circuits further runs even though the pipeline sweep is on-read).
const earmarkedInProcess = new Set<string>();
async function recordPressEarmark(albumId: string, pressId: string, totalCents: number) {
  const key = `${albumId}:${pressId}:${totalCents}`;
  if (earmarkedInProcess.has(key)) return;
  earmarkedInProcess.add(key);
  try {
    const piRows = await db.execute<any>(sqlPaidPaymentIntentsForAlbum(albumId));
    const pis: string[] = ((piRows as any).rows ?? []).map((r: any) => r.pi).filter(Boolean);
    if (pis.length === 0) {
      console.log(`[earmark] album=${albumId} press=${pressId} totalCents=${totalCents} pis=0 (no paid orders yet)`);
      return;
    }
    const { getStripe } = await import("./stripe");
    const stripe = await getStripe();
    let okCount = 0;
    for (const pi of pis) {
      try {
        // Stripe `metadata` updates merge keys (per Stripe docs), so re-running
        // with the same keys is a no-op — safe even if the process restarts
        // and our in-memory dedup forgets.
        await stripe.paymentIntents.update(pi, {
          metadata: {
            gt_press_id: pressId,
            gt_press_album_id: albumId,
            gt_press_earmark_cents: String(totalCents),
          },
        });
        okCount += 1;
      } catch (e) {
        console.log(`[earmark] PI tag failed pi=${pi} reason=${(e as Error).message}`);
      }
    }
    console.log(`[earmark] album=${albumId} press=${pressId} totalCents=${totalCents} tagged=${okCount}/${pis.length}`);
  } catch (e) {
    earmarkedInProcess.delete(key);
    console.log(`[earmark] threw album=${albumId} press=${pressId}: ${(e as Error).message}`);
  }
}

// Album ⇄ press ownership is authoritative off pressing_order_requests:
// an album belongs to a press iff there is a pressing-order-request row
// whose snapshot.pressId matches AND status is not cancelled. This is
// the same source `pressInvitedAlbums` (Task #350) derives its
// per-press credit rollup from. We DELIBERATELY do not authorize off
// people/labels.default_press_id — that's the customer's *next-album*
// default, not the press they assigned the in-flight album to. Using
// default_press_id for authz would let one press act on another press's
// album whenever the artist had toggled their default.
async function assertAlbumBelongsToPress(albumId: string, pressId: string) {
  const r = await db.execute<any>(sql`
    SELECT a.*
    FROM albums a
    WHERE a.id = ${albumId} AND a.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM pressing_order_requests por
        WHERE por.album_id = a.id
          AND por.status <> 'cancelled'
          AND por.package_snapshot ->> 'pressId' = ${pressId}
      )
    LIMIT 1
  `);
  const row = ((r as any).rows ?? [])[0];
  return row ?? null;
}
