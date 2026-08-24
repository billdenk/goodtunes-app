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
import crypto from "crypto";
import { sendPressClientEstimateEmail, resolvePressEstimateAccent } from "./mail";
import { type PressEmailBrand } from "./mail";
import { extractPaletteFromHtml } from "./brandPalette";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import * as dnsLookup from "dns/promises";
import { db } from "./db";
import { storage } from "./storage";
import {
  albums,
  people,
  labels,
  manufacturers,
  pressSwitchHistory,
  pressColorTiers,
  pressEstimates,
} from "@shared/schema";
import { evaluateEarlyCut, syncEarlyCutQueue, resolveAlbumPressTier } from "./earlyCut";
import { signPqToken, verifyPqToken, buildPqPayload } from "./pqSheet";
import { renderPqPdf } from "./pqSheetPdf";
import { sqlPersonIdByContactEmail } from "./partnerInvites";
import { hasArtistShape } from "./lib/personArtistShape";
import { stripAppleMusicBoilerplate } from "@shared/appleMusicBio";
import { computeQuotePendingIds, invalidQuoteBuilderState, computeQuoteEmailBreakdown } from "@shared/quotePricing";
import { registerPressTemplateFlowRoutes } from "./pressTemplatesPortal";
import { registerPressComponentRoutes } from "./pressComponents";
import {
  isValidWhitelabelSlug,
  whitelabelOriginForSlug,
  whitelabelHostForSlug,
  parseWhitelabelHost,
  WHITELABEL_APEX_DOMAINS,
  validateCustomWhitelabelDomain,
  isCustomWhitelabelCandidateHost,
  CUSTOM_DOMAIN_CNAME_TARGET,
  WHITELABEL_PRIMARY_APEX,
} from "@shared/whitelabelHost";

// SSRF-safe fetch helpers (mirrors the same logic in routes.ts registerRoutes).
function ppIsPrivateIp(ip: string): boolean {
  const net = require("net") as typeof import("net");
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80:")) return true;
    const dot = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dot) return ppIsPrivateIp(dot[1]);
    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return ppIsPrivateIp(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
    }
  }
  return false;
}
async function ppAssertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Disallowed protocol: ${u.protocol}`);
  const all = await dnsLookup.lookup(u.hostname, { all: true });
  for (const { address } of all) {
    if (ppIsPrivateIp(address)) throw new Error(`Refusing to fetch private/loopback host (${address})`);
  }
}

function ppAbsoluteUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== "string") return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) {
    const base = (process.env.PUBLIC_ORIGIN || "https://admin.goodtunes.music").replace(/\/+$/, "");
    return `${base}${u}`;
  }
  return null;
}
async function ppSafeFetch(url: string, init?: RequestInit, maxHops = 5): Promise<globalThis.Response> {
  let current = url;
  for (let i = 0; i <= maxHops; i++) {
    await ppAssertPublic(new URL(current));
    const res = await fetch(current, { ...(init || {}), redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect with no Location header");
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

// Pipeline stage IDs the Pipeline tab renders columns for. Derived in
// `deriveStage` below — never persisted on the album row.
// Pipeline stages, in order. Per the task spec, "Masters triggered" is a
// SINGLE stage that an album enters only AFTER artist approval of the
// early-start cut — not when the threshold is crossed. `mastersTriggeredAt`
// is still stamped at threshold-cross so we can show "awaiting approval"
// inline in Selling and avoid re-notifying, but the stage transition is
// gated on `mastersApprovedByArtistAt`.
export const PRESS_STAGES = [
  "invited",                   // admin_invites pending (no album yet)
  "accepted",                  // partner exists, no album yet
  "awaiting_pressing_order",   // album assigned to press (SKU stamp) but no pressing order yet
  "design",                    // album exists, sellQuoteLockedAt is null
  "sunrise_set",               // quote locked, signed_cert_window_opens_at in future
  "selling",                   // window open (may have threshold crossed, awaiting approval)
  "masters_triggered",         // artist approved early-start cut
  "locked",                    // preorder window closed, no press invoice yet
  "in_production",             // locked + (invoice uploaded OR billed outside system)
  "shipped",                   // certBatchShippedToFulfillmentAt set
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
// Canonical "is this person in this press's scope?" predicate. Module-level
// export so the press Add-artist route in routes.ts can reuse the SAME
// definition for its dedupe-reuse scope check (Task #3207) instead of
// re-deriving it. A person is "in scope" for a press when they're homed to
// it (people.default_press_id = :id), OR they're the primary artist on an
// album awarded to it (pressing_order_requests package snapshot pressId), OR
// they're one of the press's own Staff contacts (entity_contacts).
export function sqlPersonInPressScopeFor(pressId: string, personId: string): SQL {
  return sql`
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
      -- The press's own Staff contacts (Settings → Staff) are in scope too:
      -- the Contacts panel deep-links each row to the scoped Person page,
      -- which 404'd before this branch because contacts are neither homed
      -- nor primary artists on awarded albums.
      OR EXISTS (
        SELECT 1 FROM entity_contacts ec
        JOIN people pp ON pp.id = ec.person_id AND pp.deleted_at IS NULL
        WHERE ec.entity_kind = 'manufacturer'
          AND ec.entity_id = ${pressId}
          AND ec.person_id = ${personId}
      )
    )
  `;
}

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
      ),
      pre_pressing AS (
        SELECT DISTINCT sku.album_id AS id
        FROM album_skus sku
        JOIN albums a ON a.id = sku.album_id AND a.deleted_at IS NULL
        WHERE sku.press_id = ${pressId}
          AND a.is_goodtunes_release = true
          -- SPIN Promos are digital-only legacy releases with no manufacturing
          -- surfaces, so they never belong in a press's pre-pressing queue.
          AND a.is_spin_promo = false
          AND NOT EXISTS (
            SELECT 1 FROM pressing_order_requests por
            WHERE por.album_id = a.id
              AND por.status <> 'cancelled'
              AND por.package_snapshot ->> 'pressId' = ${pressId}
          )
      )
      SELECT
        (SELECT COUNT(DISTINCT primary_artist_id) FROM press_albums WHERE primary_artist_id IS NOT NULL)::int
          + (SELECT COUNT(DISTINCT label_id) FROM press_albums WHERE label_id IS NOT NULL)::int AS customer_count,
        (SELECT COUNT(*) FROM admin_invites
           WHERE default_press_id = ${pressId}
             AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW())::int AS pending_invites,
        ((SELECT COUNT(*) FROM press_albums) + (SELECT COUNT(*) FROM pre_pressing))::int AS total_albums,
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
             a.submitted_to_press_at, a.is_prepping,
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

// ── Press invite / start-album raw SQL ──────────────────────────────
// Exported so scripts/db-query-smoke.ts can EXPLAIN-validate them. These
// flows previously referenced phantom `people.email` / `people.created_at`
// columns (people only has `contact_email`, and no created_at) and 500'd
// the press invite flow in production.

// "Accepted" column — customers (artists + labels) who signed up against
// this press but haven't created an album yet. People carry no creation
// timestamp, so artist rows sort after labels (NULLS LAST) by name.
export function sqlPressAcceptedCustomers(pressId: string): SQL {
  return sql`
      SELECT 'artist' AS kind, p.id, p.name, p.contact_email AS email,
             NULL::timestamptz AS "createdAt"
      FROM people p
      WHERE p.default_press_id = ${pressId}
        AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM albums a
          WHERE a.primary_artist_id = p.id AND a.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM admin_invites ai
          WHERE ai.default_press_id = ${pressId}
            AND lower(ai.email) = lower(p.contact_email)
            AND ai.used_at IS NULL
            AND ai.revoked_at IS NULL
            AND ai.expires_at > NOW()
        )
      UNION ALL
      SELECT 'label' AS kind, l.id, l.name, NULL::text AS email,
             l.created_at AS "createdAt"
      FROM labels l
      WHERE l.default_press_id = ${pressId}
        AND l.deleted_at IS NULL
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
      ORDER BY "createdAt" DESC NULLS LAST, name ASC
  `;
}

// Backfill contact_email on a person only when it's still empty, so the
// invite record and future email-keyed lookups agree without clobbering
// a curated address.
export function sqlBackfillPersonContactEmail(personId: string, emailLower: string): SQL {
  return sql`
    UPDATE people SET contact_email = ${emailLower}
     WHERE id = ${personId} AND (contact_email IS NULL OR contact_email = '')
  `;
}

export function sqlInsertPressInvitedPerson(name: string, emailLower: string, pressId: string): SQL {
  return sql`
    INSERT INTO people (name, contact_email, invited_by_press_id, default_press_id)
    VALUES (${name}, ${emailLower}, ${pressId}, ${pressId})
    RETURNING id
  `;
}

export function sqlInsertStartAlbumPerson(args: {
  name: string;
  emailLower: string;
  pressId: string;
  photoUrl: string | null;
  bio: string | null;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  itunesArtistId: string | null;
}): SQL {
  return sql`
    INSERT INTO people (name, contact_email, invited_by_press_id, photo_url, bio, spotify_url, apple_music_url, itunes_artist_id)
    VALUES (
      ${args.name}, ${args.emailLower}, ${args.pressId},
      ${args.photoUrl}, ${args.bio},
      ${args.spotifyUrl}, ${args.appleMusicUrl}, ${args.itunesArtistId}
    )
    RETURNING id
  `;
}

export function sqlMastersReadyNotifyRow(artistId: string, albumId: string, pressId: string): SQL {
  return sql`
    SELECT p.name AS artist_name, p.contact_email AS artist_email,
           a.title AS album_title,
           m.name AS press_name
    FROM albums a
    LEFT JOIN people p ON p.id = ${artistId}
    LEFT JOIN manufacturers m ON m.id = ${pressId}
    WHERE a.id = ${albumId}
    LIMIT 1
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

// Task #3258 — the branded origin for a press's customer-facing links.
// Returns https://<slug>.makesvinyl.com when the press has a white-label
// slug saved, else null (caller falls back to the request host). Production
// only: in dev / *.replit.dev the branded host isn't routable, and a minted
// link must open in the environment that minted it.
export function whitelabelOriginForPress(press: { whiteLabelSlug?: string | null; customDomain?: string | null; customDomainStatus?: string | null } | null | undefined): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  // Task #3339 — an ACTIVE bring-your-own custom domain wins over the
  // makesvinyl slug (fallback chain: custom → slug → request host). Only
  // 'active' counts: before the operator links the host in Replit Domains
  // there's no TLS, so a minted link there would be broken.
  const cd = (press as any)?.customDomain;
  if (
    typeof cd === "string" &&
    (press as any)?.customDomainStatus === "active" &&
    validateCustomWhitelabelDomain(cd).ok
  ) {
    return `https://${cd.toLowerCase()}`;
  }
  const slug = (press as any)?.whiteLabelSlug;
  if (typeof slug !== "string" || !isValidWhitelabelSlug(slug)) return null;
  return whitelabelOriginForSlug(slug);
}

// Build the public origin (proto + host) for invite accept links. The
// press portal puts the resulting URL on a "Copy link" affordance so
// the operator can paste it into Messenger / iMessage / Slack when
// email delivery is iffy.
// Task #3258 — when the press has a white-label subdomain configured, the
// invite link lives on that branded host instead of the host serving this
// request (the /invite route ships in the same SPA bundle on every host).
async function pressInviteAcceptBase(req: Request, pressId?: string): Promise<string> {
  if (pressId) {
    try {
      const press = await storage.getManufacturerById(pressId);
      const branded = whitelabelOriginForPress(press);
      if (branded) return branded;
    } catch { /* fall back to request host */ }
  }
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (req as any).protocol ||
    "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// ── Task: Monday-demo Stripe payment tap. The artist pays their press bill
// off the accepted estimate. Two seams below are hermetic-testable: they take
// an injected minimal Stripe surface ({ checkout, sessions }) exactly like
// materializeOrderFromSession, so route tests never touch a live account.
//
// Money is ALWAYS derived server-side from payload.totalCents — the client
// never names the amount. The share token is the credential (same model as
// the public estimate GET); we never echo the raw token into Stripe metadata,
// only a SHA-256 hash of it, so a leaked Stripe dashboard can't replay the link.
export type PayEstimateStripe = {
  checkout: {
    sessions: {
      create: (params: any) => Promise<{ id: string; url: string | null }>;
      retrieve: (id: string) => Promise<{ id: string; payment_status?: string | null; amount_total?: number | null }>;
    };
  };
};

function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export type PayEstimateRow = {
  id: string;
  title: string | null;
  display_id: string | null;
  status: string | null;
  press_name: string | null;
  payload: Record<string, any> | null;
};

// Atomic jsonb merge write — mirrors the other payload writes in this file
// (start/ask). Merges the given keys into press_estimates.payload without
// clobbering concurrent writers to sibling keys.
async function mergeEstimatePayload(estimateId: string, patch: Record<string, any>) {
  await db.execute(sql`
    UPDATE press_estimates
    SET payload = COALESCE(payload, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
        updated_at = now()
    WHERE id = ${estimateId}
  `);
}

// Creates (or refuses to create) a Checkout session to pay an accepted
// estimate. Returns a discriminated result the route maps to HTTP. Amount is
// server-side from payload.totalCents; already-paid estimates 409.
export async function createEstimatePaySession(opts: {
  row: PayEstimateRow;
  token: string;
  origin: string;
  stripe: PayEstimateStripe;
}): Promise<
  | { ok: true; url: string | null; sessionId: string }
  | { ok: false; status: number; message: string }
> {
  const { row, token, origin, stripe } = opts;
  const payload = (row.payload ?? {}) as Record<string, any>;

  // Pay only after the estimate is accepted (Converted). Not before.
  if (row.status !== "Converted") {
    return { ok: false, status: 409, message: "This estimate hasn't been accepted yet." };
  }
  // Idempotent-ish: once paid, never re-charge.
  if (payload.paidAt) {
    return { ok: false, status: 409, message: "This estimate is already paid." };
  }

  const amountCents = Number(payload.totalCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, status: 422, message: "This estimate has no amount to pay yet — ask the press to update it." };
  }
  const amountInt = Math.round(amountCents);

  const displayId = String(row.display_id ?? "").trim();
  const jobTitle = String(row.title ?? "your record").trim() || "your record";
  const lineName = `Estimate ${displayId || "—"} — ${jobTitle}`;

  // Reuse the pending session instead of minting a new one on every tap —
  // repeated/concurrent calls must not overwrite paySessionId (an earlier
  // session someone already paid would become unconfirmable) or open a
  // second charge path.
  if (payload.paySessionId) {
    try {
      const prev = await stripe.checkout.sessions.retrieve(payload.paySessionId);
      if (prev?.payment_status === "paid") {
        // Paid out-of-band (e.g. browser never returned) — stamp and refuse.
        await mergeEstimatePayload(row.id, {
          paidAt: new Date().toISOString(),
          paidAmountCents:
            typeof prev.amount_total === "number" && prev.amount_total > 0
              ? prev.amount_total
              : amountInt,
          paidVia: "stripe",
        });
        return { ok: false, status: 409, message: "This estimate is already paid." };
      }
      if (prev?.status === "open" && prev.url) {
        return { ok: true, url: prev.url, sessionId: prev.id };
      }
      // Expired/complete-unpaid → fall through and mint a fresh session.
    } catch {
      // Session unretrievable (e.g. test-mode wipe) → mint a fresh one.
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountInt,
          product_data: {
            name: lineName,
            description: `Pressing payment for ${row.press_name ?? "your press"}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      gt_kind: "press_estimate_pay",
      pressEstimateId: row.id,
      shareTokenHash: hashShareToken(token),
    },
    payment_intent_data: {
      metadata: {
        gt_kind: "press_estimate_pay",
        pressEstimateId: row.id,
        shareTokenHash: hashShareToken(token),
      },
    },
    success_url: `${origin}/e/${token}/accepted?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/e/${token}/accepted`,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
  });

  // Persist the session id (atomic merge) so pay-status can bind the returned
  // session to THIS estimate — fail-closed on any mismatch later.
  await mergeEstimatePayload(row.id, { paySessionId: session.id });

  return { ok: true, url: session.url, sessionId: session.id };
}

// Confirms payment on return from Checkout. Fail-closed: stamps paidAt ONLY
// when Stripe says the session is paid AND the session id matches the one we
// persisted for this estimate. Never trusts the client for the amount.
export async function confirmEstimatePayStatus(opts: {
  row: PayEstimateRow;
  sessionId: string;
  stripe: PayEstimateStripe;
}): Promise<
  | { ok: true; paid: boolean; amountCents: number | null }
  | { ok: false; status: number; message: string }
> {
  const { row, sessionId, stripe } = opts;
  const payload = (row.payload ?? {}) as Record<string, any>;
  const serverAmountCents =
    Number.isFinite(Number(payload.totalCents)) && Number(payload.totalCents) > 0
      ? Math.round(Number(payload.totalCents))
      : null;

  // Already stamped — report it without re-hitting Stripe.
  if (payload.paidAt) {
    return { ok: true, paid: true, amountCents: payload.paidAmountCents ?? serverAmountCents };
  }

  const sid = String(sessionId ?? "").trim();
  if (!sid) return { ok: false, status: 400, message: "Missing session id." };

  // Bind the returned session to this estimate. Primary binding is the
  // persisted paySessionId; as recovery for a session that was superseded
  // before its payer returned, also accept a session whose server-minted
  // metadata names THIS estimate. Anything else: refuse, don't stamp.
  const session = await stripe.checkout.sessions.retrieve(sid);
  const boundById = !!payload.paySessionId && session?.id === payload.paySessionId;
  const boundByMetadata =
    session?.metadata?.gt_kind === "press_estimate_pay" &&
    session?.metadata?.pressEstimateId === row.id;
  const trulyPaid = session?.payment_status === "paid" && (boundById || boundByMetadata);
  if (!trulyPaid) {
    return { ok: true, paid: false, amountCents: serverAmountCents };
  }

  const amountCents =
    typeof session.amount_total === "number" && session.amount_total > 0
      ? session.amount_total
      : serverAmountCents;

  await mergeEstimatePayload(row.id, {
    paidAt: new Date().toISOString(),
    paidAmountCents: amountCents,
    paidVia: "stripe",
  });

  return { ok: true, paid: true, amountCents };
}

export function registerPressPortalRoutes(
  app: Express,
  requireAdmin: any,
  requirePressScope: any,
  deps: { getStripe?: () => Promise<PayEstimateStripe> } = {},
) {
  // Fresh client per request in production. Tests may inject a hermetic stub;
  // the default never caches connector credentials or the Stripe client.
  const getPayStripe =
    deps.getStripe ??
    (async () => {
      const { getStripe } = await import("./stripe");
      return (await getStripe()) as unknown as PayEstimateStripe;
    });
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
    // Task #3049 — resolve the caller from the bearer stamp (req.adminUserId,
    // set by commerce.ts requireAdmin) OR the session; the admin SPA is
    // bearer-only, so a session-only read 403'd every press mutation here.
    const callerId =
      ((req as any).adminUserId as string | undefined) ?? req.session?.userId;
    const ok = callerId
      ? await pressUserCanEdit(callerId, String(req.params.id))
      : false;
    if (!ok) {
      return res.status(403).json({
        message:
          "Staff accounts can view the press and invite artists, but only an Owner/Admin can change settings or operations.",
      });
    }
    next();
  };

  // ── Task #3291 — paid-feature unveil gate (Estimates + White Label) ────
  // Both features are hidden until an operator flips the per-press
  // manufacturers.estimates_white_label_enabled switch. Fail closed for
  // press-scoped callers; platform staff always pass — INCLUDING under
  // "View as press", which is why this reads the RAW users.role of the
  // authenticated caller (req.adminUserId / session) instead of
  // getUserRole(): the view-as hat rides an ALS override that would make
  // a super admin look like a press member, but a view-as token can only
  // be minted by a live super admin, so the real caller is trusted.
  // The public estimate-link and /api/whitelabel/branding routes are
  // deliberately NOT gated (they serve fans/recipients, not press users).
  const callerIsPlatformStaff = async (req: Request): Promise<boolean> => {
    const callerId =
      ((req as any).adminUserId as string | undefined) ?? req.session?.userId;
    if (!callerId) return false;
    const r = await db.execute<any>(
      sql`SELECT role FROM users WHERE id = ${callerId} LIMIT 1`,
    );
    const role = ((r as any).rows ?? [])[0]?.role;
    return role === "super_admin" || role === "admin";
  };
  const pressIsUnveiled = async (pressId: string): Promise<boolean> => {
    const r = await db.execute<any>(sql`
      SELECT estimates_white_label_enabled AS unveiled
      FROM manufacturers WHERE id = ${pressId} LIMIT 1
    `);
    return ((r as any).rows ?? [])[0]?.unveiled === true;
  };
  const passesUnveil = async (req: Request): Promise<boolean> =>
    (await callerIsPlatformStaff(req)) ||
    (await pressIsUnveiled(String(req.params.id)));
  const UNVEIL_403 = "Estimates and White Label aren't enabled for this press yet.";
  // Middleware form for the estimate-only / branding routes. The shared
  // estimates CRUD routes (which also carry kind=package saved builds)
  // instead call passesUnveil() inline once the kind is known — Packages
  // must keep working for every press.
  const requireUnveiled = async (req: Request, res: Response, next: any) => {
    if (await passesUnveil(req)) return next();
    return res.status(403).json({ message: UNVEIL_403 });
  };

  // Press-templates flow (Ruby handoff) — templates index / upload /
  // ingestion / certification API, in its own module.
  registerPressTemplateFlowRoutes(app, requireAdmin, requirePressScope, requirePressEditor);

  // Press Components (Ruby handoff) — Vinyl / Center Labels / Stickers /
  // component Pricing setup surfaces, in their own module.
  registerPressComponentRoutes(app, requireAdmin, requirePressScope, requirePressEditor);

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
      // Task #2750 — light-background variants + Square/Tall format.
      lightLogoUrl: (press as any).lightLogoUrl ?? null,
      lightNavLogoUrl: (press as any).lightNavLogoUrl ?? null,
      squareLogoUrl: (press as any).squareLogoUrl ?? null,
      lightSquareLogoUrl: (press as any).lightSquareLogoUrl ?? null,
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
      // handoff/press-settings-templates-policy (Bill, Aug 15 2026) —
      // Settings › Profile Templates policy toggle round-trips off /me.
      requireCertifiedTemplates: (press as any).requireCertifiedTemplates === true,
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
      // Center-label branding for the vinyl color setup disc preview.
      // Null logo = plain generic label (labelBgColor still honored).
      labelLogoUrl: (press as any).labelLogoUrl ?? null,
      labelBgColor: (press as any).labelBgColor ?? null,
      // Task #3291 — paid Estimates + White Label unveil flag. The portal
      // hides the Create/Estimates rail section and the Settings White
      // Label sub-tab when false (unless the viewer is a super admin or a
      // view-as session); the server routes fail closed regardless.
      estimatesWhiteLabelEnabled: (press as any).estimatesWhiteLabelEnabled === true,
    });
  });

  // ── Task #3257 — press white-label branding config ─────────────────────
  // GET returns the saved brand (accent hex, corner style, contact line)
  // plus canEdit so the White Label tab renders read-only for Staff. PUT is
  // editor-gated; every field nullable (null = fall back to GoodTunes
  // defaults on the customer-facing surfaces).
  app.get("/api/press/:id/branding", requireAdmin, requirePressScope, requireUnveiled, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    const { pressUserCanEdit } = await import("./auth/partnerPermissions");
    const canEdit = await pressUserCanEdit(req.session.userId!, pressId);
    res.json({
      accentColor: (press as any).brandAccentColor ?? null,
      cornerStyle: (press as any).brandCornerStyle ?? null,
      contactLine: (press as any).brandContactLine ?? null,
      // Task #3258 — assigned white-label subdomain (label only) plus the
      // full host we mint links on, and the apex family for the DNS card.
      whiteLabelSlug: (press as any).whiteLabelSlug ?? null,
      whiteLabelHost: (press as any).whiteLabelSlug ? whitelabelHostForSlug((press as any).whiteLabelSlug) : null,
      // Task #3280 — previous-slug alias (still skins already-sent links).
      previousWhiteLabelSlug: (press as any).previousWhiteLabelSlug ?? null,
      whitelabelApexDomains: [...WHITELABEL_APEX_DOMAINS],
      // Task #3339 — bring-your-own custom domain record + the exact CNAME
      // target the tab's setup instructions render.
      customDomain: (press as any).customDomain ?? null,
      customDomainStatus: (press as any).customDomain ? ((press as any).customDomainStatus ?? "pending_dns") : null,
      customDomainVerifiedAt: (press as any).customDomainVerifiedAt ?? null,
      customDomainCnameTarget: CUSTOM_DOMAIN_CNAME_TARGET,
      canEdit,
    });
  });

  const brandingBodySchema = z.object({
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a #RRGGBB hex").nullable().optional(),
    cornerStyle: z.enum(["rounded", "square"]).nullable().optional(),
    contactLine: z.string().trim().max(160, "Keep the contact line short — one line").nullable().optional(),
    // Task #3258 — the press's makesvinyl.com subdomain label. Lowercased on
    // write; format + reserved-word validated below; uniqueness enforced
    // with an explicit case-insensitive check (friendly 409 beats 23505).
    whiteLabelSlug: z.string().trim().toLowerCase().max(40).nullable().optional(),
    // Task #3339 — bring-your-own custom domain (subdomain of the press's
    // own domain). Validated below via validateCustomWhitelabelDomain.
    customDomain: z.string().trim().toLowerCase().max(253).nullable().optional(),
  });
  app.put("/api/press/:id/branding", requireAdmin, requirePressScope, requireUnveiled, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const body = brandingBodySchema.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: body.error.issues[0]?.message ?? "Invalid branding" });
    const existing = await resolvePress(pressId);
    if (!existing) return res.status(404).json({ message: "Press not found" });
    const set: Record<string, any> = {};
    if (body.data.accentColor !== undefined) set.brandAccentColor = body.data.accentColor;
    if (body.data.cornerStyle !== undefined) set.brandCornerStyle = body.data.cornerStyle;
    if (body.data.contactLine !== undefined) set.brandContactLine = body.data.contactLine ? body.data.contactLine : null;
    if (body.data.whiteLabelSlug !== undefined) {
      const slug = body.data.whiteLabelSlug ? body.data.whiteLabelSlug : null;
      if (slug !== null) {
        if (!isValidWhitelabelSlug(slug)) {
          return res.status(400).json({ message: "Subdomain must be 2–40 lowercase letters, numbers, or hyphens (and not a reserved word)." });
        }
        // Friendly uniqueness check — one slug maps to exactly one press.
        const clash = await db.execute<any>(sql`
          SELECT id FROM manufacturers
          WHERE lower(white_label_slug) = ${slug} AND id <> ${pressId}
          LIMIT 1
        `);
        if (((clash as any).rows ?? []).length > 0) {
          return res.status(409).json({ message: "That subdomain is already taken by another press." });
        }
      }
      set.whiteLabelSlug = slug;
      // Task #3280 — a rename (or removal) must not silently break links
      // already sent on the OLD subdomain: park the outgoing slug as a
      // previous-slug alias so /api/whitelabel/branding still resolves the
      // skin there. Current slugs always win over aliases; re-claiming your
      // own alias just swaps the two.
      const oldSlug = (existing.whiteLabelSlug ?? "").toLowerCase() || null;
      if (oldSlug && oldSlug !== slug) {
        set.previousWhiteLabelSlug = oldSlug;
      } else if (oldSlug && oldSlug === slug) {
        // No-op save of the same slug — leave the alias untouched.
        delete set.previousWhiteLabelSlug;
      }
      if (slug !== null) {
        // If the claimed slug was some OTHER press's parked alias, the new
        // owner takes it outright — clear the stale alias so the old press's
        // links stop skinning as them (the links still open, neutral shell).
        await db.execute(sql`
          UPDATE manufacturers SET previous_white_label_slug = NULL
          WHERE lower(previous_white_label_slug) = ${slug} AND id <> ${pressId}
        `);
        // And if the press re-claims its own alias, don't keep it duplicated.
        if ((existing.previousWhiteLabelSlug ?? "").toLowerCase() === slug) {
          set.previousWhiteLabelSlug = oldSlug && oldSlug !== slug ? oldSlug : null;
        }
      }
    }
    // Task #3339 — bring-your-own custom domain. Null clears the record
    // (clean fallback to the makesvinyl slug); a value is validated (400),
    // uniqueness-checked across presses (409), and any CHANGE resets the
    // status ladder to pending_dns (fail-closed until re-verified +
    // operator-relinked).
    if (body.data.customDomain !== undefined) {
      const rawCd = body.data.customDomain ? body.data.customDomain : null;
      if (rawCd === null) {
        set.customDomain = null;
        set.customDomainStatus = null;
        set.customDomainVerifiedAt = null;
      } else {
        const v = validateCustomWhitelabelDomain(rawCd);
        if (!v.ok) return res.status(400).json({ message: v.message });
        const clash = await db.execute<any>(sql`
          SELECT id FROM manufacturers
          WHERE lower(custom_domain) = ${v.host} AND id <> ${pressId}
          LIMIT 1
        `);
        if (((clash as any).rows ?? []).length > 0) {
          return res.status(409).json({ message: "That domain is already claimed by another press." });
        }
        const oldCd = ((existing as any).customDomain ?? "").toLowerCase() || null;
        set.customDomain = v.host;
        if (oldCd !== v.host) {
          set.customDomainStatus = "pending_dns";
          set.customDomainVerifiedAt = null;
        }
      }
    }
    if (Object.keys(set).length === 0) return res.status(400).json({ message: "Nothing to save" });
    const [row] = await db
      .update(manufacturers)
      .set(set)
      .where(eq(manufacturers.id, pressId))
      .returning({
        accentColor: manufacturers.brandAccentColor,
        cornerStyle: manufacturers.brandCornerStyle,
        contactLine: manufacturers.brandContactLine,
        whiteLabelSlug: manufacturers.whiteLabelSlug,
        previousWhiteLabelSlug: manufacturers.previousWhiteLabelSlug,
        customDomain: manufacturers.customDomain,
        customDomainStatus: manufacturers.customDomainStatus,
        customDomainVerifiedAt: manufacturers.customDomainVerifiedAt,
      });
    if (!row) return res.status(404).json({ message: "Press not found" });
    res.json(row);
  });

  // ── Task #3339 — custom-domain verify / activate / operator queue ───────
  // "Verify domain" does a REAL DNS check: the press's hostname must resolve
  // to us (CNAME to makesvinyl.com / pressesvinyl.com or the same A records
  // as the primary apex). Passing advances pending_dns → pending_activation;
  // ACTIVATION is a separate explicit operator action (the hostname must be
  // linked in Replit Deployments → Domains by hand — one TLS cert per host —
  // so flipping active before that would mint broken https links).
  const checkCustomDomainDns = async (
    host: string,
  ): Promise<{ ok: boolean; detail: string }> => {
    const dns = await import("node:dns/promises");
    // CNAME chain first — the instructed setup.
    try {
      const cnames = await dns.resolveCname(host);
      const hit = cnames.find((c) => {
        const t = c.toLowerCase().replace(/\.$/, "");
        return (
          WHITELABEL_APEX_DOMAINS.some((apex) => t === apex || t.endsWith(`.${apex}`)) ||
          t.endsWith(".replit.app") || t.endsWith(".repl.co")
        );
      });
      if (hit) return { ok: true, detail: `CNAME → ${hit}` };
      if (cnames.length > 0) {
        return { ok: false, detail: `Found a CNAME to ${cnames[0]}, which isn't us — point it at ${CUSTOM_DOMAIN_CNAME_TARGET}.` };
      }
    } catch { /* no CNAME — fall through to A-record comparison */ }
    // A-record fallback: some providers flatten CNAMEs.
    try {
      const [theirs, ours] = await Promise.all([
        dns.resolve4(host),
        dns.resolve4(WHITELABEL_PRIMARY_APEX),
      ]);
      if (theirs.some((ip) => ours.includes(ip))) {
        return { ok: true, detail: "A records match our deployment." };
      }
      return { ok: false, detail: `The hostname resolves to ${theirs[0] ?? "another address"}, not our deployment — add a CNAME to ${CUSTOM_DOMAIN_CNAME_TARGET}.` };
    } catch {
      return { ok: false, detail: `We couldn't find a DNS record for that hostname yet — add a CNAME to ${CUSTOM_DOMAIN_CNAME_TARGET} and allow time for DNS to propagate.` };
    }
  };

  app.post("/api/press/:id/custom-domain/verify", requireAdmin, requirePressScope, requireUnveiled, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    const host = ((press as any).customDomain ?? "").toLowerCase();
    if (!host) return res.status(400).json({ message: "Save a custom domain first." });
    const status = (press as any).customDomainStatus ?? "pending_dns";
    const dnsResult = await checkCustomDomainDns(host);
    if (dnsResult.ok && status === "pending_dns") {
      await db.execute(sql`
        UPDATE manufacturers
        SET custom_domain_status = 'pending_activation', custom_domain_verified_at = now()
        WHERE id = ${pressId} AND lower(custom_domain) = ${host}
      `);
      return res.json({ verified: true, status: "pending_activation", detail: dnsResult.detail });
    }
    if (dnsResult.ok) {
      return res.json({ verified: true, status, detail: dnsResult.detail });
    }
    return res.json({ verified: false, status, detail: dnsResult.detail });
  });

  // Operator-only activation flip. requireAdmin admits ALL partner accounts,
  // so this re-checks the raw platform-staff role explicitly — a press can
  // never self-activate (TLS isn't real until the Replit Domains link).
  app.post("/api/press/:id/custom-domain/activate", requireAdmin, requirePressScope, async (req, res) => {
    if (!(await callerIsPlatformStaff(req))) {
      return res.status(403).json({ message: "Only platform operators can activate a custom domain (the hostname must be linked in Replit Domains first)." });
    }
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    if (!(press as any).customDomain) return res.status(400).json({ message: "This press has no custom domain saved." });
    const active = req.body?.active !== false;
    // State machine is one-way-honest: activation requires the DNS check to
    // have PASSED (pending_activation + verified_at stamped). An operator
    // can't shortcut pending_dns straight to active — the hostname wouldn't
    // even be provably pointed at us yet.
    const curStatus = (press as any).customDomainStatus ?? "pending_dns";
    const verifiedAt = (press as any).customDomainVerifiedAt ?? null;
    if (active && (curStatus !== "pending_activation" || !verifiedAt)) {
      return res.status(409).json({ message: "DNS hasn't been verified for this domain yet — have the press hit Verify domain (or run it from their White Label tab) first." });
    }
    // Deactivate is only meaningful for a domain that already reached
    // active (or is sitting verified at pending_activation — a no-op there).
    // It must NEVER touch pending_dns or synthesize a verification stamp:
    // verified_at is written by the DNS check alone.
    if (!active && curStatus === "pending_dns") {
      return res.status(409).json({ message: "This domain hasn't been verified yet — there's nothing to deactivate." });
    }
    await db.execute(sql`
      UPDATE manufacturers
      SET custom_domain_status = ${active ? "active" : "pending_activation"}
      WHERE id = ${pressId}
    `);
    return res.json({ status: active ? "active" : "pending_activation" });
  });

  // Operator god-view queue: every press with a custom-domain request, so
  // operators know which hostnames still need linking in Replit Domains.
  app.get("/api/admin/custom-domain-requests", requireAdmin, async (req, res) => {
    if (!(await callerIsPlatformStaff(req))) {
      return res.status(403).json({ message: "Operators only." });
    }
    const r = await db.execute<any>(sql`
      SELECT id, name, custom_domain, custom_domain_status, custom_domain_verified_at, white_label_slug
      FROM manufacturers
      WHERE custom_domain IS NOT NULL
      ORDER BY (custom_domain_status = 'pending_activation') DESC, name ASC
    `);
    return res.json(((r as any).rows ?? []).map((m: any) => ({
      pressId: m.id,
      pressName: m.name,
      customDomain: m.custom_domain,
      status: m.custom_domain_status ?? "pending_dns",
      verifiedAt: m.custom_domain_verified_at ?? null,
      whiteLabelSlug: m.white_label_slug ?? null,
    })));
  });

  // ── Task #3258 — public white-label host branding ───────────────────────
  // No auth: the login / neutral landing / invite surfaces on a press
  // subdomain (mrp.makesvinyl.com) need the skin before any session exists.
  // Resolves the REQUEST host's slug → press and returns only what those
  // surfaces render (name, logos, accent, corner, contact line) — nothing
  // operator-internal, no pricing, no press id enumeration by slug guessing
  // beyond what the public estimate page already shows.
  // Dev fallback: `?slug=` lets the branded surfaces be exercised on hosts
  // that can't carry a subdomain (*.replit.dev) — non-production only.
  app.get("/api/whitelabel/branding", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const rawHost = ((req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.headers.host || "").trim();
    const parsed = parseWhitelabelHost(rawHost);
    let slug = parsed?.slug ?? null;
    if (!slug && process.env.NODE_ENV !== "production") {
      const qs = String(req.query.slug ?? "").trim().toLowerCase();
      if (qs && isValidWhitelabelSlug(qs)) slug = qs;
    }
    // Task #3339 — a host OUTSIDE the makesvinyl family may be a press's
    // own custom domain. Fail-closed: only an ACTIVE (operator-linked)
    // record serves the skin; unknown/pending custom hosts stay neutral.
    let customWhere: ReturnType<typeof sql> | null = null;
    if (!parsed && !slug) {
      const candidate = rawHost.toLowerCase().split(":")[0];
      if (isCustomWhitelabelCandidateHost(candidate)) {
        customWhere = sql`lower(custom_domain) = ${candidate} AND custom_domain_status = 'active'`;
      }
      // Not a white-label host at all (and no custom-domain match possible)
      // → the client shouldn't be asking, but answer honestly, not an error.
      if (!customWhere) return res.json({ whitelabel: false, known: false });
    } else if (!slug) {
      return res.json({ whitelabel: true, known: false });
    }
    // Task #3280 — current slugs win; a press's parked previous slug (see
    // previous_white_label_slug, written on rename) still resolves branding
    // so links sent before a rename keep their skin instead of dropping to
    // the neutral shell.
    const found = await db.execute<any>(sql`
      SELECT id, name, logo_url, light_logo_url, nav_logo_url, light_nav_logo_url,
             square_logo_url, light_square_logo_url,
             brand_accent_color, brand_corner_style, brand_contact_line,
             email_branding
      FROM manufacturers
      WHERE ${customWhere ?? sql`lower(white_label_slug) = ${slug} OR lower(previous_white_label_slug) = ${slug}`}
      ORDER BY ${customWhere ? sql`1` : sql`(lower(white_label_slug) = ${slug}) DESC`}
      LIMIT 1
    `);
    const m = ((found as any).rows ?? [])[0];
    // Unknown subdomain → neutral page, never an error. An unknown/pending
    // CUSTOM host answers whitelabel:false so the client renders neutral too.
    if (!m) return res.json({ whitelabel: !customWhere, known: false });
    res.json({
      whitelabel: true,
      known: true,
      pressName: m.name ?? null,
      // Dark-surface logo first (customer shell is dark), light variants too.
      logoUrl: m.logo_url ?? m.nav_logo_url ?? m.square_logo_url ?? null,
      lightLogoUrl: m.light_logo_url ?? m.light_nav_logo_url ?? m.light_square_logo_url ?? null,
      accentColor: m.brand_accent_color ?? null,
      cornerStyle: m.brand_corner_style ?? null,
      contactLine: m.brand_contact_line ?? null,
      // Tab identity (favicon) — square mark preferred, any logo as fallback.
      squareLogoUrl: m.square_logo_url ?? m.light_square_logo_url ?? m.logo_url ?? m.light_logo_url ?? null,
      // Ruby handoff b912fb6 — presses with email branding configured get
      // the light MRP skin on their customer-facing surfaces (landing,
      // sign-in, estimate page, client portal). Data-driven, never a
      // press-name string match. Null = current dark/neutral surfaces.
      skin: m.email_branding ? "mrp-light" : null,
    });
  });

  // POST /api/press/:id/brand-suggest — Task #3257. Paste-a-URL prefill for
  // the White Label tab: SSRF-safe fetch of the press's own site, returning
  // a logo candidate + a suggested accent palette (theme-color + frequent
  // saturated hexes). SUGGESTION ONLY — nothing here persists; the operator
  // confirms in the tab and saves via PUT /branding.
  app.post("/api/press/:id/brand-suggest", requireAdmin, requirePressScope, requireUnveiled, async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "A full https:// URL is required" });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: "Malformed URL" }); }
    const host = parsed.hostname.replace(/^www\./, "");
    if (/(^|\.)instagram\.com$/.test(host) || /(^|\.)facebook\.com$/.test(host)) {
      return res.status(400).json({ message: "Instagram/Facebook pages can't be scraped — paste the press's own website." });
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const html = await ppSafeFetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GoodTunesBot/1.0; +https://goodtunes.app)",
          "Accept": "text/html,application/xhtml+xml",
        },
      }).then((r: globalThis.Response) => {
        if (!r.ok) throw new Error(`Page returned ${r.status}`);
        return r.text();
      }).finally(() => clearTimeout(t));

      // Same meta/logo resolution the label scrape uses.
      const meta: Record<string, string> = {};
      const re1 = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
      const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']([^"']+)["'][^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = re1.exec(html))) { const k = m[1].toLowerCase(); if (!(k in meta)) meta[k] = m[2]; }
      while ((m = re2.exec(html))) { const k = m[2].toLowerCase(); if (!(k in meta)) meta[k] = m[1]; }

      let logoUrl: string | null = null;
      const touchA = /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html);
      const touchB = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i.exec(html);
      if (touchA) logoUrl = touchA[1];
      else if (touchB) logoUrl = touchB[1];
      if (!logoUrl) logoUrl = meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || null;
      if (!logoUrl) {
        const iconA = /<link[^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html);
        const iconB = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]*>/i.exec(html);
        if (iconA) logoUrl = iconA[1];
        else if (iconB) logoUrl = iconB[1];
      }
      if (logoUrl?.startsWith("//")) logoUrl = `https:${logoUrl}`;
      if (logoUrl?.startsWith("/")) logoUrl = `${parsed.origin}${logoUrl}`;

      const palette = extractPaletteFromHtml(html);
      return res.json({ domain: host, websiteUrl: meta["og:url"] || url, logoUrl, palette });
    } catch (e: any) {
      return res.status(502).json({ message: e?.message || "Failed to read page" });
    }
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
    const acceptUrlBase = await pressInviteAcceptBase(req, pressId);
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
        // Task #2574 — Shopify+ "Submitted to press": the operator has
        // formally submitted the package for this press to review (the
        // package stays operator-editable; press view stays read-only).
        // Distinct from merely having a SKU/pressing-order assigned —
        // this is a deliberate signal layered on top of the derived
        // manufacturing stage, not a stage of its own. Only shown while
        // still pre-release (is_prepping) so a released album's history
        // timestamp doesn't re-badge it.
        // Task #2593 — also expose isDigitalLive when the album has
        // advanced to "At press" (is_prepping=false + submitted_to_press_at
        // set) so the press portal can show a "Digital live" chip.
        submittedForReview: !!(a.submitted_to_press_at && a.is_prepping),
        submittedToPressAt: a.submitted_to_press_at ?? null,
        isDigitalLive: !!(a.submitted_to_press_at && !a.is_prepping),
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
    const inviteBase = await pressInviteAcceptBase(req, pressId);
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
    const accepted = await db.execute<any>(sqlPressAcceptedCustomers(pressId));
    // Pre-pressing albums: assigned to this press via SKU stamp but no
    // pressing order yet. These get a synthetic stage "awaiting_pressing_order"
    // so the Pipeline board can surface them in a leading column.
    const prePressingRows = await db.execute<any>(sql`
      SELECT DISTINCT ON (a.id)
             a.id, a.title, a.artwork AS "coverUrl", a.physical_format AS format,
             a.primary_artist_id, a.label_id,
             COALESCE(p.name, l.name) AS owner_name,
             COALESCE(a.primary_artist_id, a.label_id) AS owner_id,
             CASE WHEN a.primary_artist_id IS NOT NULL THEN 'artist' ELSE 'label' END AS owner_kind,
             COALESCE(sold.units_sold, 0) AS units_sold
      FROM album_skus sku
      JOIN albums a ON a.id = sku.album_id AND a.deleted_at IS NULL
      LEFT JOIN people p ON p.id = a.primary_artist_id
      LEFT JOIN labels l ON l.id = a.label_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(oi.quantity), 0)::int AS units_sold
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.kind = 'format' AND o.album_id = a.id
          AND o.status IN ('paid','shipped') AND o.refunded_at IS NULL
      ) sold ON true
      WHERE sku.press_id = ${pressId}
        AND a.is_goodtunes_release = true
        -- SPIN Promos are digital-only legacy releases with no manufacturing
        -- surfaces, so they never belong in a press's pre-pressing queue.
        AND a.is_spin_promo = false
        AND NOT EXISTS (
          SELECT 1 FROM pressing_order_requests por
          WHERE por.album_id = a.id
            AND por.status <> 'cancelled'
            AND por.package_snapshot ->> 'pressId' = ${pressId}
        )
      ORDER BY a.id, a.title
    `);
    for (const r of ((prePressingRows as any).rows ?? [])) {
      albumsList.push({
        id: r.id,
        title: r.title,
        coverUrl: r.coverUrl,
        format: r.format,
        ownerName: r.owner_name,
        ownerId: r.owner_id,
        ownerKind: r.owner_kind,
        stage: "awaiting_pressing_order" as PressStage,
        stageEnteredAt: null,
        lockedAt: null,
        sunriseDate: null,
        windowOpensAt: null,
        windowClosesAt: null,
        mastersTriggeredAt: null,
        mastersApprovedByArtistAt: null,
        pressInvoiceUrl: null,
        pressInvoiceTotalCents: null,
        pressInvoiceUploadedAt: null,
        pressInvoiceOutsideSystem: false,
        pressInvoiceTransferId: null,
        pressInvoiceTransferredAt: null,
        pressInvoiceTransferAmountCents: null,
        pressInvoiceTransferError: null,
        invoiceVarianceCents: null,
        invoiceVariancePct: null,
        invoiceVarianceTier: null,
        shippedAt: null,
        fulfillmentHeadsUpSentAt: null,
        fulfillmentHeadsUpQty: null,
        lastNotifiedAt: null,
        lockedQuantity: null,
        lockedTotalCents: null,
        unitsSoldToDate: r.units_sold ?? 0,
      });
    }
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
  // (Task #3207) The predicate itself now lives at module level as
  // sqlPersonInPressScopeFor so routes.ts's press Add-artist dedupe path
  // can reuse the same definition; this alias keeps local call sites terse.
  const sqlPersonInPressScope = sqlPersonInPressScopeFor;

  // GET /api/press/:id/albums — GoodTunes releases assigned to this plant.
  // Includes both:
  //   (a) albums with a non-cancelled pressing order for this press, and
  //   (b) albums assigned via SKU stamp (album_skus.press_id) but with no
  //       pressing order yet — these get awaitingPressingOrder=true so the
  //       client can badge them.
  // Uses a DISTINCT CTE so an album with multiple pressing requests appears
  // once. Cross-press isolation enforced by requirePressScope.
  app.get("/api/press/:id/albums", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const rows = await db.execute<any>(sql`
      WITH scoped_por AS (
        SELECT DISTINCT album_id
          FROM pressing_order_requests
         WHERE status <> 'cancelled'
           AND package_snapshot ->> 'pressId' = ${pressId}
      ),
      scoped_sku AS (
        SELECT DISTINCT sku.album_id
          FROM album_skus sku
          JOIN albums a ON a.id = sku.album_id AND a.deleted_at IS NULL
         WHERE sku.press_id = ${pressId}
           AND a.is_goodtunes_release = true
           -- SPIN Promos are digital-only legacy releases with no manufacturing
           -- surfaces, so they never belong in a press's awaiting-pressing list.
           AND a.is_spin_promo = false
           AND NOT EXISTS (
             SELECT 1 FROM pressing_order_requests por
              WHERE por.album_id = a.id
                AND por.status <> 'cancelled'
                AND por.package_snapshot ->> 'pressId' = ${pressId}
           )
      )
      SELECT a.id, a.title, a.artwork,
             a.is_prepping                AS "isPrepping",
             a.submitted_to_press_at      AS "submittedToPressAt",
             a.is_hidden                  AS "isHidden",
             a.good_tunes_release_date    AS "goodTunesReleaseDate",
             a.streaming_release_date     AS "streamingReleaseDate",
             COALESCE(p.name, l.name)     AS artist,
             false                        AS "awaitingPressingOrder"
        FROM albums a
        JOIN scoped_por sa ON sa.album_id = a.id
        LEFT JOIN people p ON p.id = a.primary_artist_id
        LEFT JOIN labels l ON l.id = a.label_id
       WHERE a.deleted_at IS NULL
         AND a.is_goodtunes_release = true
      UNION ALL
      SELECT a.id, a.title, a.artwork,
             a.is_prepping                AS "isPrepping",
             a.submitted_to_press_at      AS "submittedToPressAt",
             a.is_hidden                  AS "isHidden",
             a.good_tunes_release_date    AS "goodTunesReleaseDate",
             a.streaming_release_date     AS "streamingReleaseDate",
             COALESCE(p.name, l.name)     AS artist,
             true                         AS "awaitingPressingOrder"
        FROM albums a
        JOIN scoped_sku sk ON sk.album_id = a.id
        LEFT JOIN people p ON p.id = a.primary_artist_id
        LEFT JOIN labels l ON l.id = a.label_id
       WHERE a.deleted_at IS NULL
       ORDER BY title ASC
    `);
    res.json(
      ((rows as any).rows ?? []).map((a: any) => ({
        id: a.id as string,
        title: a.title as string,
        artwork: (a.artwork as string | null) ?? null,
        artist: (a.artist as string | null) ?? null,
        isPrepping: Boolean(a.isPrepping),
        isHidden: Boolean(a.isHidden),
        submittedToPressAt: a.submittedToPressAt
          ? new Date(a.submittedToPressAt).toISOString()
          : null,
        goodTunesReleaseDate: (a.goodTunesReleaseDate as string | null) ?? null,
        streamingReleaseDate: (a.streamingReleaseDate as string | null) ?? null,
        awaitingPressingOrder: Boolean(a.awaitingPressingOrder),
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

    // Staff detection (Bill, 2026-08-11) — a person on the press's own
    // contact roster (entity_contacts, manufacturer kind) is STAFF, not a
    // client artist. Staff get their business title + contact info back so
    // the portal Overview can show it; artists/other contacts don't (the
    // PII-stripping contract below stays for them).
    let staff = false;
    let staffTitle: string | null = null;
    try {
      const strow = await db.execute<{ role: string | null }>(sql`
        SELECT role FROM entity_contacts
        WHERE entity_kind = 'manufacturer' AND entity_id = ${pressId} AND person_id = ${personId}
        LIMIT 1
      `);
      const row = ((strow as any).rows ?? [])[0];
      if (row !== undefined) {
        staff = true;
        staffTitle = row.role ? String(row.role) : null;
      }
    } catch (e: any) {
      console.warn(`[press:${pressId} person:${personId}] staff lookup failed: ${e?.message}`);
    }

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
          acceptUrl: `${await pressInviteAcceptBase(req, pressId)}/invite/${irow.token}`,
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
      // another press's invite stamp to a press partner. EXCEPTION (Bill,
      // 2026-08-11): the press's OWN staff — their work contact info is
      // exactly what the portal Overview should show.
      shippingAddress: staff ? (p.shippingAddress ?? null) : null,
      shippingAddressStruct: null,
      staff,
      staffTitle,
      contactEmail: staff ? (p.contactEmail ?? null) : null,
      contactPhone: staff ? (p.contactPhone ?? null) : null,
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
    // Staff (Bill, 2026-08-11): a roster-only staff contact isn't "homed"
    // (default_press_id is null) — removing them means detaching the
    // entity_contacts row, or the profile stays discoverable after the
    // "Removed" toast. Artists get the un-home path above; both count.
    const staffDel = await db.execute<{ person_id: string }>(sql`
      DELETE FROM entity_contacts
       WHERE entity_kind = 'manufacturer' AND entity_id = ${pressId} AND person_id = ${personId}
       RETURNING person_id
    `);
    const staffDetached = (((staffDel as any).rows ?? []) as any[]).length > 0;
    const unhomed = (((upd as any).rows ?? []) as any[]).length > 0;
    // A person can be in scope without being homed here or on the staff
    // roster (e.g. awarded-album scope, homed at another press). That stays
    // a truthful no-op 200 — the flags tell the client what happened.
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

  // Task #3191 — POST /api/press/:id/people/:personId/claim — bring an
  // EXISTING catalog person into this press's scope (home them here).
  // Closes the re-add dead-end: after "remove from press" (which only
  // un-homes), re-adding the same artist hit the duplicate guard, which
  // navigated to a person page that 404s out-of-scope. The client now
  // offers "add them to your press" and calls this instead.
  //
  // Rules:
  //   • person must exist (not soft-deleted) → else 404;
  //   • already homed HERE → truthful no-op ({ alreadyHomed: true });
  //   • homed at ANOTHER press → 409 (a press can never grab another
  //     press's client; that flow stays operator-mediated);
  //   • un-homed → stamp default_press_id and record press_switch_history
  //     (mirrors the remove endpoint's history semantics).
  app.post("/api/press/:id/people/:personId/claim", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const personId = String(req.params.personId);
    const cur = await db.execute<{ default_press_id: string | null }>(sql`
      SELECT default_press_id FROM people WHERE id = ${personId} AND deleted_at IS NULL
    `);
    const row = ((cur as any).rows ?? [])[0];
    if (!row) return res.status(404).json({ message: "Person not found" });
    if (row.default_press_id === pressId) {
      return res.json({ ok: true, homed: true, alreadyHomed: true });
    }
    if (row.default_press_id) {
      return res.status(409).json({
        message: "This artist is currently represented by another press. Contact GoodTunes to move them.",
      });
    }
    // Race-safe: only stamp when still un-homed (a concurrent claim or
    // invite-accept may have homed them since the read above).
    const upd = await db.execute<{ id: string }>(sql`
      UPDATE people SET default_press_id = ${pressId}
       WHERE id = ${personId} AND default_press_id IS NULL AND deleted_at IS NULL
       RETURNING id
    `);
    const homedNow = (((upd as any).rows ?? []) as any[]).length > 0;
    if (!homedNow) {
      return res.status(409).json({
        message: "This artist was just claimed by another press. Try again.",
      });
    }
    await db.insert(pressSwitchHistory).values({
      customerKind: "artist",
      customerId: personId,
      fromPressId: null,
      toPressId: pressId,
      reason: "added_by_press",
    });
    res.json({ ok: true, homed: true, alreadyHomed: false });
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
    // Task #2756 — pre-seeded label metadata scraped from the label's website
    websiteUrl: z.string().url().max(2000).optional().nullable(),
    domain: z.string().max(255).optional().nullable(),
    logoUrl: z.string().max(2000).optional().nullable(),
  });

  // POST /api/press/:id/scrape-label — session-compatible label scrape so the
  // press invite dialog can pre-fill name + logo from a website URL without
  // needing a bearer token (the main /api/admin/labels/scrape is bearer-only).
  // Delegates into the same OG/apple-touch-icon logic, SSRF-gated via
  // safeFetch (imported lazily from the main routes build).
  app.post("/api/press/:id/scrape-label", requireAdmin, requirePressScope, async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "A full https:// URL is required" });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: "Malformed URL" }); }
    const host = parsed.hostname.replace(/^www\./, "");
    if (/(^|\.)instagram\.com$/.test(host) || /(^|\.)facebook\.com$/.test(host)) {
      return res.status(400).json({ message: "Instagram/Facebook pages can't be scraped — paste the label's own website." });
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const html = await ppSafeFetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GoodTunesBot/1.0; +https://goodtunes.app)",
          "Accept": "text/html,application/xhtml+xml",
        },
      }).then((r: globalThis.Response) => {
        if (!r.ok) throw new Error(`Page returned ${r.status}`);
        return r.text();
      }).finally(() => clearTimeout(t));

      const meta: Record<string, string> = {};
      const re1 = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
      const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']([^"']+)["'][^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = re1.exec(html))) { const k = m[1].toLowerCase(); if (!(k in meta)) meta[k] = m[2]; }
      while ((m = re2.exec(html))) { const k = m[2].toLowerCase(); if (!(k in meta)) meta[k] = m[1]; }

      let logoUrl: string | null = null;
      const touchA = /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html);
      const touchB = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i.exec(html);
      if (touchA) logoUrl = touchA[1];
      else if (touchB) logoUrl = touchB[1];
      if (!logoUrl) logoUrl = meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || null;
      if (!logoUrl) {
        const iconA = /<link[^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html);
        const iconB = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]*>/i.exec(html);
        if (iconA) logoUrl = iconA[1];
        else if (iconB) logoUrl = iconB[1];
      }
      if (logoUrl?.startsWith("//")) logoUrl = `https:${logoUrl}`;
      if (logoUrl?.startsWith("/")) logoUrl = `${parsed.origin}${logoUrl}`;

      let name = meta["og:title"] || meta["twitter:title"] || null;
      if (name) {
        name = name
          .replace(/\s*[|·–—-]\s*(?:home|official\s+site|official|records|music|label|the\s+official\s+site).*$/i, "")
          .trim();
      }

      return res.json({ name, domain: host, logoUrl, websiteUrl: meta["og:url"] || url });
    } catch (e: any) {
      return res.status(502).json({ message: e?.message || "Failed to read page" });
    }
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
          acceptUrl: `${await pressInviteAcceptBase(req, pressId)}/invite/${existingRow.token}`,
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
      await db.execute(sqlBackfillPersonContactEmail(personId, lower));

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

      const acceptUrl = `${await pressInviteAcceptBase(req, pressId)}/invite/${token}`;
      const press = await storage.getManufacturerById(pressId);
      const inviterName = press?.name ?? "Your press partner";
      const result = await sendAdminInviteEmail(
        lower,
        acceptUrl,
        inviterName,
        "Artist",
        INVITE_TTL_DAYS,
        press?.logoUrl ?? null,
        undefined,
        pressEmailBrand(press),
      );
      res.json({ id: invite.id, email: invite.email, acceptUrl, emailDelivered: result.ok });
    },
  );

  // requirePressEditor matches the existing-person invite path — this
  // email-keyed path previously skipped the edit gate (review finding).
  app.post("/api/press/:id/invite", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const parsed = inviteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid invite" });
    }
    const { email, role, name, welcomeNote, websiteUrl, domain, logoUrl } = parsed.data;
    const lower = email.toLowerCase();

    // Create the scoped entity first so the invite role_scope_id is real.
    let roleScopeId: string;
    if (role === "artist") {
      const existing = await db.execute<{ id: string }>(sqlPersonIdByContactEmail(lower));
      const row = ((existing as any).rows ?? [])[0];
      if (row?.id) {
        roleScopeId = row.id;
        await db.execute(sql`
          UPDATE people SET default_press_id = ${pressId}
          WHERE id = ${roleScopeId} AND default_press_id IS NULL
        `);
      } else {
        const created = await db.execute<{ id: string }>(
          sqlInsertPressInvitedPerson(name, lower, pressId),
        );
        roleScopeId = (created as any).rows[0].id;
      }
    } else {
      const created = await db.execute<{ id: string }>(sql`
        INSERT INTO labels (name, website_url, domain, logo_url, invited_by_press_id, default_press_id)
        VALUES (${name}, ${websiteUrl ?? null}, ${domain ?? null}, ${logoUrl ?? null}, ${pressId}, ${pressId})
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

    const acceptUrl = `${await pressInviteAcceptBase(req, pressId)}/invite/${token}`;
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
      undefined,
      pressEmailBrand(press),
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
    const existing = await db.execute<{ id: string }>(sqlPersonIdByContactEmail(lower));
    let personId: string = ((existing as any).rows ?? [])[0]?.id;
    if (!personId) {
      const created = await db.execute<{ id: string }>(
        sqlInsertStartAlbumPerson({
          name,
          emailLower: lower,
          pressId,
          photoUrl: photoUrl ?? null,
          bio: stripAppleMusicBoilerplate(bio) || null,
          spotifyUrl: spotifyUrl ?? null,
          appleMusicUrl: appleMusicUrl ?? null,
          itunesArtistId: itunesArtistId ?? null,
        }),
      );
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
      // Creation provenance — this draft was minted by the press portal's
      // own start-album flow, so the press is the recorded creator. This is
      // what later lets the press delete its own unsold test records (and
      // ONLY those) from the portal.
      createdByUserId: (req.session as any).userId,
      createdByScopeKind: "manufacturer",
      createdByScopeId: pressId,
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
      const acceptUrl = `${await pressInviteAcceptBase(req, pressId)}/invite/${newToken}`;
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
        undefined,
        pressEmailBrand(press),
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
  // status. Connect onboarding is managed inline in the press portal
  // via PayoutAccountPanel calling the shared /api/admin/payouts/* routes.
  // ── Press "Create" flow: estimates + packages (Ruby handoff, Aug 17 2026)
  // One table (press_estimates), discriminated by kind. The full builder
  // state + display fields live in payload jsonb; the server owns the
  // human-facing estimate number (press initials + MMDDYY + per-day seq).
  const estimateKindSchema = z.enum(["estimate", "package"]);
  const estimatePayloadSchema = z.record(z.any());
  const ESTIMATE_STATUSES = ["Draft", "Sent", "Viewed", "Converted", "Abandoned"] as const;
  // 'archived' (Ruby handoff, Aug 19 2026): a package leaves the artist rail
  // but keeps its estimate history — distinct from hard delete below.
  const PACKAGE_STATUSES = ["draft", "live", "archived"] as const;

  function pressInitials(name: string): string {
    const letters = (name || "")
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
      .filter(Boolean)
      .map((w) => w[0].toUpperCase());
    const initials = letters.join("").slice(0, 3);
    return initials || "GT";
  }

  // Every estimates route resolves the press first — requirePressScope lets
  // super-admins through for ANY id, so without this a typo'd/nonexistent
  // press id would read empty lists or mint orphan rows.
  async function resolvePress(pressId: string): Promise<{
    name: string;
    contactEmail: string | null;
    location: string | null;
    websiteUrl: string | null;
    logoUrl: string | null;
    lightLogoUrl: string | null;
    emailBranding: { accent?: string; buttonInk?: string } | null;
    brandAccentColor: string | null;
    brandCornerStyle: string | null;
    brandContactLine: string | null;
    whiteLabelSlug: string | null;
    previousWhiteLabelSlug: string | null;
    customDomain: string | null;
    customDomainStatus: string | null;
    customDomainVerifiedAt: Date | null;
  } | null> {
    // Task #3257 — also carry the white-label brand fields so the send
    // paths can skin customer-facing emails without a second lookup.
    const rows = await db
      .select({
        name: manufacturers.name,
        contactEmail: manufacturers.contactEmail,
        location: manufacturers.location,
        websiteUrl: manufacturers.websiteUrl,
        logoUrl: manufacturers.logoUrl,
        lightLogoUrl: manufacturers.lightLogoUrl,
        emailBranding: manufacturers.emailBranding,
        brandAccentColor: manufacturers.brandAccentColor,
        brandCornerStyle: manufacturers.brandCornerStyle,
        brandContactLine: manufacturers.brandContactLine,
        // Task #3258 — the estimate send/resend paths mint the /e/:token
        // link on the press's white-label host when a slug is assigned.
        whiteLabelSlug: manufacturers.whiteLabelSlug,
        // Task #3280 — carried so the branding PUT can park the outgoing
        // slug as the previous-slug alias on rename.
        previousWhiteLabelSlug: manufacturers.previousWhiteLabelSlug,
        // Task #3339 — an ACTIVE custom domain must win over the slug in
        // every send/resend-minted link (whitelabelOriginForPress reads it).
        customDomain: manufacturers.customDomain,
        customDomainStatus: manufacturers.customDomainStatus,
        customDomainVerifiedAt: manufacturers.customDomainVerifiedAt,
      })
      .from(manufacturers)
      .where(eq(manufacturers.id, pressId))
      .limit(1);
    return rows[0] ?? null;
  }

  app.get("/api/press/:id/estimates", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    if (!(await resolvePress(pressId))) return res.status(404).json({ message: "Press not found" });
    const kindParse = estimateKindSchema.safeParse(req.query.kind ?? "estimate");
    if (!kindParse.success) return res.status(400).json({ message: "kind must be estimate|package" });
    // Task #3291 — kind=package (saved builds) stays open to every press;
    // only the paid Estimates side is unveil-gated.
    if (kindParse.data === "estimate" && !(await passesUnveil(req))) {
      return res.status(403).json({ message: UNVEIL_403 });
    }
    const rows = await db
      .select()
      .from(pressEstimates)
      .where(and(eq(pressEstimates.pressId, pressId), eq(pressEstimates.kind, kindParse.data)))
      .orderBy(sql`${pressEstimates.updatedAt} DESC`);
    res.json({ rows });
  });

  app.post("/api/press/:id/estimates", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const body = z
      .object({
        kind: estimateKindSchema,
        title: z.string().trim().min(1).max(200),
        status: z.string().trim().max(40).optional(),
        payload: estimatePayloadSchema.optional(),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid estimate body" });
    const { kind, title, status, payload } = body.data;
    // Task #3291 — creating an ESTIMATE requires the unveil flag; packages
    // (saved builds) are not part of the paid feature.
    if (kind === "estimate" && !(await passesUnveil(req))) {
      return res.status(403).json({ message: UNVEIL_403 });
    }
    const press = await resolvePress(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    const allowed = kind === "estimate" ? ESTIMATE_STATUSES : PACKAGE_STATUSES;
    // Reject a supplied-but-invalid status outright (never silently coerce);
    // an absent status gets the kind's default.
    if (status !== undefined && !(allowed as readonly string[]).includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    // "Sent" is a server-owned transition (the /send route runs the honest-
    // pricing gate + share-link mint) — never creatable directly.
    if (kind === "estimate" && status === "Sent") {
      return res.status(409).json({ message: "Estimates are sent via the send endpoint, not created as Sent." });
    }
    const finalStatus = status ?? (kind === "estimate" ? "Draft" : "draft");

    // displayId minting is serialized per press with a pg advisory xact lock
    // (two concurrent creates would otherwise COUNT the same seq); the
    // partial unique index on (press_id, display_id) backstops it.
    const row = await db.transaction(async (tx) => {
      let displayId: string | null = null;
      if (kind === "estimate") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"press_estimates:" + pressId}))`);
        const prefix = pressInitials(press.name);
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const yy = String(now.getFullYear() % 100).padStart(2, "0");
        const stamp = `${prefix}-${mm}${dd}${yy}`;
        const countRows = await tx.execute<any>(sql`
          SELECT count(*)::int AS n FROM press_estimates
          WHERE press_id = ${pressId} AND kind = 'estimate' AND display_id LIKE ${stamp + "-%"}
        `);
        const n = (((countRows as any).rows ?? [])[0]?.n ?? 0) + 1;
        displayId = `${stamp}-${String(n).padStart(2, "0")}`;
      }
      const [inserted] = await tx
        .insert(pressEstimates)
        .values({ pressId, kind, title, status: finalStatus, payload: payload ?? {}, displayId })
        .returning();
      return inserted;
    });
    res.status(201).json(row);
  });

  app.put("/api/press/:id/estimates/:estimateId", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const estimateId = String(req.params.estimateId);
    const body = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        status: z.string().trim().max(40).optional(),
        payload: estimatePayloadSchema.optional(),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid estimate body" });
    if (!(await resolvePress(pressId))) return res.status(404).json({ message: "Press not found" });
    const existing = await db
      .select()
      .from(pressEstimates)
      .where(and(eq(pressEstimates.id, estimateId), eq(pressEstimates.pressId, pressId)))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ message: "Estimate not found" });
    // Task #3291 — mutating an ESTIMATE row requires the unveil flag.
    if (existing[0].kind === "estimate" && !(await passesUnveil(req))) {
      return res.status(403).json({ message: UNVEIL_403 });
    }
    const allowed = existing[0].kind === "estimate" ? ESTIMATE_STATUSES : PACKAGE_STATUSES;
    if (body.data.status && !(allowed as readonly string[]).includes(body.data.status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    // "Sent" is a server-owned transition (the /send route runs the honest-
    // pricing gate) — a direct status write may not flip a draft to Sent.
    if (existing[0].kind === "estimate" && body.data.status === "Sent" && existing[0].status !== "Sent") {
      return res.status(409).json({ message: "Estimates are sent via the send endpoint, not by writing status directly." });
    }
    // Send is one-way: once an estimate has left Draft it can never be
    // downgraded back to Draft (that would reopen the payload for edits while
    // the artist's share link still resolves to it).
    if (existing[0].kind === "estimate" && body.data.status === "Draft" && existing[0].status !== "Draft") {
      return res.status(409).json({ message: "A sent estimate can't go back to draft — duplicate it into a new draft instead." });
    }
    // Once an estimate leaves Draft (Sent/Viewed/…), its payload is immutable:
    // replacing the build after the artist received the quote would silently
    // change what was quoted (and could strip the builder state the pricing
    // gate verified). Duplicate into a new draft instead.
    if (existing[0].kind === "estimate" && body.data.payload !== undefined && existing[0].status !== "Draft") {
      return res.status(409).json({ message: "A sent estimate's build can't be edited — duplicate it into a new draft instead." });
    }
    // Optimistic concurrency: the checks above validated against the status
    // we READ — the write only lands if the row still has that status, so a
    // concurrent /send (Draft→Sent) can't be overwritten by a stale draft
    // save. Losing the race is a 409, same as failing the checks.
    const [row] = await db
      .update(pressEstimates)
      .set({
        ...(body.data.title !== undefined ? { title: body.data.title } : {}),
        ...(body.data.status !== undefined ? { status: body.data.status } : {}),
        ...(body.data.payload !== undefined ? { payload: body.data.payload } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(pressEstimates.id, estimateId), eq(pressEstimates.pressId, pressId), eq(pressEstimates.status, existing[0].status)))
      .returning();
    if (!row) return res.status(409).json({ message: "This estimate changed while you were editing — reload and try again." });
    res.json(row);
  });

  // Hard delete (Ruby handoff, Aug 19 2026) — the packages index offers
  // Delete beside Archive; archive is the history-keeping path, delete is
  // the real removal. Scoped to the press like every other estimates route.
  app.delete("/api/press/:id/estimates/:estimateId", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const estimateId = String(req.params.estimateId);
    if (!(await resolvePress(pressId))) return res.status(404).json({ message: "Press not found" });
    // Task #3291 — deleting an ESTIMATE row requires the unveil flag
    // (kind resolved first; package deletes stay open).
    const kindRows = await db
      .select({ kind: pressEstimates.kind })
      .from(pressEstimates)
      .where(and(eq(pressEstimates.id, estimateId), eq(pressEstimates.pressId, pressId)))
      .limit(1);
    if (!kindRows[0]) return res.status(404).json({ message: "Estimate not found" });
    if (kindRows[0].kind === "estimate" && !(await passesUnveil(req))) {
      return res.status(403).json({ message: UNVEIL_403 });
    }
    const [row] = await db
      .delete(pressEstimates)
      .where(and(eq(pressEstimates.id, estimateId), eq(pressEstimates.pressId, pressId)))
      .returning({ id: pressEstimates.id });
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    res.json({ ok: true, id: row.id });
  });

  // Task #3359 — resolve the artwork source for an estimate's email mockup.
  // Precedence: the choice persisted on the payload at first send
  // (`mockupArtUrl`, which may be explicitly null = house jacket) → a stored
  // artwork URL on the payload → the associated artist's album artwork when
  // UNAMBIGUOUS (exactly one distinct non-placeholder artwork across their
  // albums) → null (house-jacket fallback). Legacy sent rows (no persisted
  // key) resolve live with the same rules.
  const resolveEstimateMockupArt = async (payload: Record<string, any>): Promise<string | null> => {
    if ("mockupArtUrl" in payload) {
      const v = payload.mockupArtUrl;
      return typeof v === "string" && v.trim() ? v.trim() : null;
    }
    const stored = payload.artworkUrl;
    if (typeof stored === "string" && stored.trim()) return stored.trim();
    const pid = typeof payload.artistPersonId === "string" ? payload.artistPersonId.trim() : "";
    if (pid) {
      const r = await db.execute<any>(sql`
        SELECT DISTINCT artwork FROM albums
        WHERE primary_artist_id = ${pid} AND deleted_at IS NULL
          AND artwork IS NOT NULL AND artwork <> '' AND artwork NOT LIKE '/album-placeholder%'
        LIMIT 2
      `);
      const rows = ((r as any).rows ?? []) as Array<{ artwork: string }>;
      if (rows.length === 1) return String(rows[0].artwork);
    }
    return null;
  };

  // Public, no-auth read of a sent estimate by its private share token
  // (Ruby handoff, Aug 19 2026). Returns a sanitized view — enough to render
  // the client estimate page, nothing operator-internal. First open flips
  // Sent → Viewed so the press sees engagement on their index.
  app.get("/api/estimate-link/:token", async (req, res) => {
    const token = String(req.params.token ?? "").trim();
    if (token.length < 24 || token.length > 128) return res.status(404).json({ message: "Estimate not found" });
    const found = await db.execute<any>(sql`
      SELECT e.*, m.name AS press_name,
             m.logo_url AS press_logo_url,
             m.light_logo_url AS press_light_logo_url,
             m.brand_accent_color AS brand_accent_color,
             m.brand_corner_style AS brand_corner_style,
             m.brand_contact_line AS brand_contact_line,
             m.email_branding AS email_branding,
             m.location AS press_location,
             m.website_url AS press_website_url
      FROM press_estimates e
      JOIN manufacturers m ON m.id = e.press_id
      WHERE e.kind = 'estimate' AND e.payload->>'shareToken' = ${token}
      LIMIT 1
    `);
    const row = ((found as any).rows ?? [])[0];
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    const payload = (row.payload ?? {}) as Record<string, any>;
    if (row.status === "Sent") {
      await db
        .update(pressEstimates)
        .set({ status: "Viewed", updatedAt: new Date() })
        .where(and(eq(pressEstimates.id, row.id), eq(pressEstimates.status, "Sent")));
    }
    res.json({
      title: row.title,
      displayId: row.display_id,
      status: row.status === "Sent" ? "Viewed" : row.status,
      createdAt: row.created_at,
      sentAt: payload.sentAt ?? null,
      pressName: row.press_name,
      clientName: payload.clientName ?? null,
      preparedBy: payload.preparedBy ?? null,
      build: payload.build ?? null,
      size: payload.size ?? null,
      totalCents: payload.totalCents ?? null,
      builderState: payload.builderState ?? null,
      acceptedAt: payload.acceptedAt ?? null,
      // Payment tap (Monday demo) — display-only: has this bill been paid?
      // Never exposes the Stripe session id or amount internals.
      paidAt: payload.paidAt ?? null,
      clientEmail:
        (Array.isArray(payload.sentTo) ? payload.sentTo.find((r: any) => String(r?.email ?? "").includes("@"))?.email : null) ?? null,
      // Task #3257 — white-label brand for the public viewer. Display-only
      // fields; all-null = the page renders its GoodTunes/neutral defaults.
      brand: {
        logoUrl: row.press_logo_url ?? null, // dark-background logo (viewer is dark)
        lightLogoUrl: row.press_light_logo_url ?? null,
        accentColor: row.brand_accent_color ?? null,
        cornerStyle: row.brand_corner_style ?? null,
        contactLine: row.brand_contact_line ?? null,
        // Ruby handoff b912fb6 — light MRP skin for presses with email
        // branding set. Data-driven, never a press-name match.
        skin: row.email_branding ? "mrp-light" : null,
        locationLine: [row.press_location, String(row.press_website_url ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim()].filter(Boolean).join(" · ") || null,
      },
    });
  });

  // Task #3359 — public mockup PNG for the estimate email: the album jacket
  // with the quoted vinyl color peeking out, composited server-side
  // (server/estimateMockup.ts). Email clients fetch images unauthenticated,
  // so like the estimate page itself this is keyed only to the private share
  // token. Cached in-memory per token; ~15 min TTL.
  app.get("/api/estimate-link/:token/mockup.png", async (req, res) => {
    const token = String(req.params.token ?? "").trim();
    if (token.length < 24 || token.length > 128) return res.status(404).json({ message: "Not found" });
    const found = await db.execute<any>(sql`
      SELECT e.payload, m.name AS press_name, m.logo_url AS press_logo_url
      FROM press_estimates e
      JOIN manufacturers m ON m.id = e.press_id
      WHERE e.kind = 'estimate' AND e.payload->>'shareToken' = ${token}
      LIMIT 1
    `);
    const row = ((found as any).rows ?? [])[0];
    if (!row) return res.status(404).json({ message: "Not found" });
    try {
      const payload = (row.payload ?? {}) as Record<string, any>;
      const artUrl = await resolveEstimateMockupArt(payload);
      const colorName = typeof payload.builderState?.colorName === "string" ? payload.builderState.colorName : null;
      const { getEstimateMockupPng } = await import("./estimateMockup");
      const buf = await getEstimateMockupPng(token, {
        artUrl,
        pressName: String(row.press_name ?? ""),
        pressLogoUrl: row.press_logo_url ?? null,
        colorName,
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (err) {
      // Render failure = 404, never a broken half-image. The send path only
      // embeds the URL after a successful warm render, so this is rare.
      console.error("[estimate-mockup] render failed:", err);
      res.status(404).json({ message: "Not found" });
    }
  });

  // ── PQ / cutting-master sheet (Ruby handoff handoff/pq-sheet) ──────────
  // Signed-out, token-keyed read of ONE album's cutting-master data. The
  // token is a stateless HMAC (server/pqSheet.ts) — no DB column, the link
  // IS the credential, exactly like the estimate /e/:token model. Three
  // public reads (payload, per-track playback URL, PDF twin) + one press-
  // authed helper that mints the link for the album view.
  const pqOrigin = (req: Request): string => {
    const proto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ||
      req.protocol ||
      "https";
    const host =
      (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.get("host");
    return `${proto}://${host}`;
  };
  // Resolve the assigned press name for an album, if any, off the SKU stamp
  // (album_skus.press_id) or the pressing order snapshot. Display-only.
  const pqPressNameForAlbum = async (albumId: string): Promise<string | null> => {
    const r = await db.execute<any>(sql`
      SELECT m.name AS name
      FROM album_skus sku
      JOIN manufacturers m ON m.id = sku.press_id
      WHERE sku.album_id = ${albumId} AND sku.press_id IS NOT NULL
      LIMIT 1
    `);
    return ((r as any).rows ?? [])[0]?.name ?? null;
  };

  app.get("/api/pq/:token", async (req, res) => {
    const albumId = verifyPqToken(req.params.token);
    if (!albumId) return res.status(404).json({ message: "PQ sheet not found" });
    const token = String(req.params.token);
    const payload = await buildPqPayload(albumId, pqOrigin(req), token);
    if (!payload) return res.status(404).json({ message: "PQ sheet not found" });
    payload.press = await pqPressNameForAlbum(albumId);
    res.json(payload);
  });

  // Tap-to-play — mint a short-lived signed Mux playback URL for ONE track
  // on the sheet. Reuses the existing signed-Mux machinery; 404s honestly
  // when the track has no ready Mux asset (no fallback to the raw master).
  app.get("/api/pq/:token/play/:songId", async (req, res) => {
    const albumId = verifyPqToken(req.params.token);
    if (!albumId) return res.status(404).json({ message: "PQ sheet not found" });
    const songId = String(req.params.songId);
    const r = await db.execute<any>(sql`
      SELECT id, mux_playback_id, mux_status FROM songs
      WHERE id = ${songId} AND album_id = ${albumId} LIMIT 1
    `);
    const song = ((r as any).rows ?? [])[0];
    if (!song) return res.status(404).json({ message: "Track not found" });
    const { signPlaybackUrl, isMuxConfigured } = await import("./mux");
    if (
      !isMuxConfigured() ||
      !song.mux_playback_id ||
      song.mux_status !== "ready"
    ) {
      return res
        .status(404)
        .json({ message: "This track isn't ready to play online yet" });
    }
    try {
      const url = await signPlaybackUrl(song.mux_playback_id);
      res.json({ url, expiresInSec: 3600 });
    } catch (err: any) {
      console.error("[pq-play] sign failed", err?.message);
      res.status(500).json({ message: "Failed to sign playback URL" });
    }
  });

  // The print twin — streamed pdfkit doc (no play buttons; footer links
  // back to the online sheet to listen).
  app.get("/api/pq/:token/pdf", async (req, res) => {
    const albumId = verifyPqToken(req.params.token);
    if (!albumId) return res.status(404).json({ message: "PQ sheet not found" });
    const token = String(req.params.token);
    const payload = await buildPqPayload(albumId, pqOrigin(req), token);
    if (!payload) return res.status(404).json({ message: "PQ sheet not found" });
    payload.press = await pqPressNameForAlbum(albumId);
    try {
      const pdf = await renderPqPdf(payload);
      const safe = (payload.album || "album").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="pq-${safe}.pdf"`,
      );
      res.send(pdf);
    } catch (err: any) {
      console.error("[pq-pdf] render failed", err?.message, err?.stack);
      res.status(500).json({ message: "Failed to render PQ PDF" });
    }
  });

  // Press-authed helper — returns the token URL for the album view. Gate:
  // platform operator OR the assigned press (album_skus.press_id) via a
  // manufacturer membership. NOT public (unlike the reads above).
  app.get("/api/admin/albums/:id/pq-link", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    const callerId =
      ((req as any).adminUserId as string | undefined) ?? req.session?.userId;
    if (!callerId) return res.status(401).json({ message: "Unauthorized" });
    const { getUserRole, findMembershipForScope } = await import("./auth/roles");
    const info = await getUserRole(callerId);
    let allowed = info?.role === "super_admin" || info?.role === "admin";
    if (!allowed) {
      // Assigned press: any manufacturer this caller is a member of that is
      // stamped on one of the album's SKUs.
      const r = await db.execute<any>(sql`
        SELECT DISTINCT sku.press_id AS press_id
        FROM album_skus sku
        WHERE sku.album_id = ${albumId} AND sku.press_id IS NOT NULL
      `);
      for (const row of (r as any).rows ?? []) {
        if (await findMembershipForScope(callerId, "manufacturer", String(row.press_id))) {
          allowed = true;
          break;
        }
      }
    }
    if (!allowed) return res.status(403).json({ message: "Forbidden" });
    const [album] = await db
      .select({ id: albums.id })
      .from(albums)
      .where(eq(albums.id, albumId))
      .limit(1);
    if (!album) return res.status(404).json({ message: "Album not found" });
    const token = signPqToken(albumId);
    res.json({ token, url: `${pqOrigin(req)}/pq/${token}` });
  });

  // ── Task #3295 (Ruby handoff b912fb6) — client actions off the private
  // estimate token. The token is the credential: it was minted at send time
  // and mailed only to the estimate's recipients. All three endpoints load
  // the estimate the same way the GET does and refuse unknown tokens.
  const loadEstimateByToken = async (tokenRaw: unknown) => {
    const token = String(tokenRaw ?? "").trim();
    if (token.length < 24 || token.length > 128) return null;
    const found = await db.execute<any>(sql`
      SELECT e.*, m.id AS press_id, m.name AS press_name, m.contact_email AS press_contact_email,
             m.email_branding AS email_branding, m.logo_url AS press_logo_url,
             m.location AS press_location, m.website_url AS press_website_url,
             m.white_label_slug AS white_label_slug,
             m.custom_domain AS custom_domain, m.custom_domain_status AS custom_domain_status
      FROM press_estimates e
      JOIN manufacturers m ON m.id = e.press_id
      WHERE e.kind = 'estimate' AND e.payload->>'shareToken' = ${token}
      LIMIT 1
    `);
    return ((found as any).rows ?? [])[0] ?? null;
  };
  const estimateLinkUrl = (req: Request, row: any, token: string) => {
    const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
    const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.get("host");
    // Task #3339 — an ACTIVE custom domain wins over the makesvinyl slug for
    // freshly minted ask/share email links too (same chain as /send).
    const branded = whitelabelOriginForPress({
      whiteLabelSlug: row.white_label_slug,
      customDomain: row.custom_domain,
      customDomainStatus: row.custom_domain_status,
    } as any);
    return `${branded ?? `${proto}://${host}`}/e/${token}`;
  };

  // "Ask a question" — sends a REAL message to the press: email to the
  // preparing contact (fallback: press contact email), Reply-To = client.
  app.post("/api/estimate-link/:token/ask", async (req, res) => {
    const row = await loadEstimateByToken(req.params.token);
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    const body = z
      .object({
        name: z.string().trim().max(120).optional().default(""),
        email: z.string().trim().email().max(200).optional(),
        message: z.string().trim().min(1).max(4000),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "A question is required" });
    const payload = (row.payload ?? {}) as Record<string, any>;
    const sentTo: Array<{ name?: string; email?: string }> = Array.isArray(payload.sentTo) ? payload.sentTo : [];
    // Resolve the press-side recipient: the preparer's email if we can find
    // it, else the press contact email. No recipient = honest 503, never a
    // silent drop.
    let toEmail: string | null = null;
    const preparedBy = typeof payload.preparedBy === "string" ? payload.preparedBy.trim() : "";
    if (preparedBy) {
      const u = await db.execute<any>(sql`SELECT email FROM users WHERE display_name = ${preparedBy} AND email LIKE '%@%' LIMIT 1`);
      toEmail = ((u as any).rows ?? [])[0]?.email ?? null;
    }
    if (!toEmail && typeof row.press_contact_email === "string" && row.press_contact_email.includes("@")) toEmail = row.press_contact_email;
    if (!toEmail) return res.status(503).json({ message: "This press has no contact email on file yet — reply to the estimate email instead." });
    const clientEmail = body.data.email ?? (sentTo.find((r) => r?.email?.includes("@"))?.email ?? "");
    const clientName = body.data.name || String(payload.clientName ?? "").trim() || clientEmail || "Your client";
    const { sendPressClientQuestionEmail } = await import("./mail");
    const token = String(req.params.token).trim();
    const result = await sendPressClientQuestionEmail(toEmail, {
      pressName: row.press_name,
      estimateNo: String(row.display_id ?? row.title ?? ""),
      jobTitle: String(row.title ?? "your record"),
      clientName,
      clientEmail: clientEmail || "no-reply@goodtunes.music",
      message: body.data.message,
      linkUrl: estimateLinkUrl(req, row, token),
    });
    if (!result.ok) return res.status(502).json({ message: "We couldn't deliver your question — please try again or reply to the estimate email." });
    res.json({ ok: true });
  });

  // "Share" — sends the real estimate email (press-skinned) to a recipient
  // the client chooses. Reuses the exact same composition as /send.
  app.post("/api/estimate-link/:token/share", async (req, res) => {
    const row = await loadEstimateByToken(req.params.token);
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    const body = z
      .object({ name: z.string().trim().max(120).optional().default(""), email: z.string().trim().email().max(200) })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "A valid email address is required" });
    const payload = (row.payload ?? {}) as Record<string, any>;
    const { loadPressComponents } = await import("./pressComponents");
    const configs = await loadPressComponents(String(row.press_id));
    const breakdown = computeQuoteEmailBreakdown(payload.builderState ?? null, configs.pricing?.rows ?? []);
    const accent = resolvePressEstimateAccent(row.email_branding ?? null);
    const pressDomain = String(row.press_website_url ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    const token = String(req.params.token).trim();
    const result = await sendPressClientEstimateEmail(body.data.email, {
      clientName: body.data.name || body.data.email,
      clientEmail: body.data.email,
      estimateNo: String(row.display_id ?? "").trim() || String(row.title ?? ""),
      sentAt: payload.sentAt ?? null,
      preparedBy: typeof payload.preparedBy === "string" ? payload.preparedBy : null,
      pressName: row.press_name,
      jobTitle: String(row.title ?? "your record").trim() || "your record",
      specLine: typeof payload.build === "string" && payload.build.trim() ? payload.build.trim() : null,
      linkUrl: estimateLinkUrl(req, row, token),
      breakdown,
      accent,
      skin: row.email_branding ? ("light" as const) : ("dark" as const),
      pressLocationLine: [row.press_location, pressDomain].filter(Boolean).join(" · ") || null,
      pressLogoUrl: row.press_logo_url && /^https:\/\//i.test(row.press_logo_url) ? row.press_logo_url : null,
      replyToEmail: typeof row.press_contact_email === "string" && row.press_contact_email.includes("@") ? row.press_contact_email : null,
    } as any);
    if (!result.ok) return res.status(502).json({ message: "We couldn't send that share email — please try again." });
    res.json({ ok: true });
  });

  // "Start this project" — flips the estimate to Converted (one-way; the
  // estimate becomes the project's working numbers) and, when the client
  // isn't signed in yet, creates their real customer account off the
  // create-account form and signs them in (host-scoped session + bearer).
  // Estimate math itself never changes here.
  app.post("/api/estimate-link/:token/start", async (req, res) => {
    const row = await loadEstimateByToken(req.params.token);
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    const body = z
      .object({
        name: z.string().trim().max(200).optional().default(""),
        email: z.string().trim().email().max(200).optional(),
        // Length is validated per-mode below: create requires ≥8 (new
        // password), signin accepts whatever the existing account uses.
        password: z.string().min(1).max(200).optional(),
        mode: z.enum(["create", "signin"]).optional().default("create"),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Check the account details — password must be at least 8 characters" });
    const payload = (row.payload ?? {}) as Record<string, any>;

    // Same scrypt `hex.salt` format the customer create paths write.
    const passwordMatches = async (supplied: string, stored: string | null | undefined): Promise<boolean> => {
      if (!stored || !stored.includes(".")) return false;
      const { scrypt, timingSafeEqual } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);
      const [hashedHex, salt] = stored.split(".");
      const hashedBuf = Buffer.from(hashedHex, "hex");
      const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
      return hashedBuf.length === suppliedBuf.length && timingSafeEqual(hashedBuf, suppliedBuf);
    };

    // Resolve (session OR stored bearer), sign in, or create the customer
    // account. Bearer matters on white-label hosts where the session cookie
    // is host-scoped — a returning customer often arrives with only their
    // stored token (same session-or-bearer rule as resolvePortalClient).
    let customerId: string | null = null;
    let token: string | null = null;
    let sessionTouched = false;
    if (req.session?.userId && req.session?.kind === "customer") {
      customerId = req.session.userId;
    } else {
      const authHeader = String(req.headers.authorization ?? "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearer) {
        const t = await storage.getAuthBy(bearer).catch(() => undefined);
        if (t && t.kind === "customer") customerId = t.userId;
      }
    }
    if (!customerId && body.data.email && body.data.password) {
      const emailNorm = body.data.email.toLowerCase();
      const existing = await storage.getCustomerByEmail(emailNorm);
      if (body.data.mode === "signin") {
        // Sign-in variant: an existing customer proves the password and the
        // project starts under their account. Wrong password is an honest
        // 401 — deliberately distinct from ACCOUNT_EXISTS.
        if (!existing || !(await passwordMatches(body.data.password, (existing as any).password))) {
          return res.status(401).json({ message: "That email and password don't match — try again.", code: "INVALID_CREDENTIALS" });
        }
        customerId = existing.id;
        token = crypto.randomBytes(32).toString("hex");
        await storage.createAuthToken(token, existing.id, "customer");
        if (req.session) {
          req.session.userId = existing.id;
          req.session.kind = "customer";
          sessionTouched = true;
        }
      } else {
        if (existing) {
          return res.status(409).json({ message: "An account with that email already exists — sign in instead.", code: "ACCOUNT_EXISTS" });
        }
        if (body.data.password.length < 8) {
          return res.status(400).json({ message: "Check the account details — password must be at least 8 characters" });
        }
        const { scrypt, randomBytes } = await import("crypto");
        const { promisify } = await import("util");
        const scryptAsync = promisify(scrypt);
        const salt = randomBytes(16).toString("hex");
        const buf = (await scryptAsync(body.data.password, salt, 64)) as Buffer;
        const hashed = `${buf.toString("hex")}.${salt}`;
        // Username from the email local part, uniquified — mirrors the
        // restricted-insert customer create paths.
        const base = emailNorm.split("@")[0].replace(/[^a-z0-9_]/g, "").slice(0, 24) || "client";
        let username = base;
        for (let i = 0; i < 5; i++) {
          if (!(await storage.getCustomerByUsername(username))) break;
          username = `${base}${crypto.randomBytes(2).toString("hex")}`;
        }
        const displayName = body.data.name || String(payload.clientName ?? "").trim() || emailNorm;
        const c = await storage.createCustomer({ username, email: emailNorm, displayName, realName: body.data.name || null, password: hashed });
        // Account was created from a real estimate email link — mark signup
        // complete (name + deliverable email collected up-front).
        await storage.updateCustomer(c.id, { handle: username, signupCompletedAt: new Date() } as any).catch(() => {});
        customerId = c.id;
        if (req.session) {
          req.session.userId = c.id;
          req.session.kind = "customer";
          sessionTouched = true;
        }
        token = crypto.randomBytes(32).toString("hex");
        await storage.createAuthToken(token, c.id, "customer");
      }
    }
    // Await the session write before responding — the accepted page's
    // immediate auth check must not race a half-saved session.
    if (sessionTouched && typeof (req.session as any)?.save === "function") {
      await new Promise<void>((resolve) => (req.session as any).save(() => resolve()));
    }

    // One-way claim: only a live (Sent/Viewed) estimate can convert; a
    // Converted row returns ok (idempotent confirm), Draft/Abandoned refuse.
    if (row.status === "Converted") return res.json({ ok: true, alreadyStarted: true, token });
    if (row.status !== "Sent" && row.status !== "Viewed") {
      return res.status(409).json({ message: "This estimate isn't live anymore — ask the press to re-send it." });
    }
    const nextPayload: Record<string, any> = {
      ...payload,
      acceptedAt: new Date().toISOString(),
      ...(customerId ? { acceptedByCustomerId: customerId } : {}),
    };
    const [updated] = await db
      .update(pressEstimates)
      .set({ status: "Converted", payload: nextPayload, updatedAt: new Date() })
      .where(and(eq(pressEstimates.id, row.id), sql`${pressEstimates.status} IN ('Sent','Viewed')`))
      .returning({ id: pressEstimates.id });
    if (!updated) return res.status(409).json({ message: "This estimate just changed — reload the page." });
    res.json({ ok: true, token });
  });

  // "Pay" — mints a Stripe Checkout session for an accepted (Converted)
  // estimate. Amount is server-side from payload.totalCents; the client never
  // names the price. Same credential model as the public GET (the token is
  // the secret). Success returns to the accepted page with ?paid=1.
  app.post("/api/estimate-link/:token/pay-session", async (req, res) => {
    const row = await loadEstimateByToken(req.params.token);
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    const token = String(req.params.token).trim();
    const payload = (row.payload ?? {}) as Record<string, any>;
    // Reject deterministic business-rule failures before asking the connector
    // for a client. This keeps 409/422 honest even during a Stripe outage.
    if (row.status !== "Converted") {
      return res.status(409).json({ message: "This estimate hasn't been accepted yet." });
    }
    if (payload.paidAt) {
      return res.status(409).json({ message: "This estimate is already paid." });
    }
    const amountCents = Number(payload.totalCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(422).json({ message: "This estimate has no amount to pay yet — ask the press to update it." });
    }
    try {
      const stripe = await getPayStripe();
      // Same-origin return URLs — the accepted page ships in the SPA on every
      // host, so we return the artist to the exact host they paid from.
      const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || (req as any).protocol || "https";
      const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.get("host");
      const origin = `${proto}://${host}`;
      const result = await createEstimatePaySession({
        row: {
          id: row.id,
          title: row.title,
          display_id: row.display_id,
          status: row.status,
          press_name: row.press_name,
          payload: row.payload ?? {},
        },
        token,
        origin,
        stripe,
      });
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      return res.json({ url: result.url, sessionId: result.sessionId });
    } catch (e: any) {
      return res.status(502).json({ message: "We couldn't start the payment — please try again." });
    }
  });

  // "Pay status" — confirms a Checkout return. Fail-closed: only stamps paidAt
  // when Stripe reports the session paid AND its id matches the one we minted.
  app.get("/api/estimate-link/:token/pay-status", async (req, res) => {
    const row = await loadEstimateByToken(req.params.token);
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    const sessionId = String(req.query.session_id ?? "").trim();
    const payload = (row.payload ?? {}) as Record<string, any>;
    const amountCents =
      Number.isFinite(Number(payload.totalCents)) && Number(payload.totalCents) > 0
        ? Math.round(Number(payload.totalCents))
        : null;
    if (payload.paidAt) {
      return res.json({ paid: true, amountCents: payload.paidAmountCents ?? amountCents });
    }
    if (!sessionId) return res.status(400).json({ message: "Missing session id." });
    // Fail closed before Stripe: a session not minted for this row can never
    // stamp payment, even if it belongs to another paid Checkout.
    if (!payload.paySessionId || payload.paySessionId !== sessionId) {
      return res.json({ paid: false, amountCents });
    }
    try {
      const stripe = await getPayStripe();
      const result = await confirmEstimatePayStatus({
        row: {
          id: row.id,
          title: row.title,
          display_id: row.display_id,
          status: row.status,
          press_name: row.press_name,
          payload: row.payload ?? {},
        },
        sessionId,
        stripe,
      });
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      return res.json({ paid: result.paid, amountCents: result.amountCents });
    } catch (e: any) {
      return res.status(502).json({ message: "We couldn't confirm the payment — please try again." });
    }
  });

  // Signed-in client's portal data (dashboard / next-steps / project home).
  // Matches estimates to the customer by acceptedByCustomerId OR by a sentTo
  // recipient email equal to the account email — real data only, honest
  // zeros for a fresh client.
  // #3295 review gate — the client portal is a WHITE-LABEL surface, so its
  // reads must be scoped to the ONE press the request's host belongs to.
  // A client with estimates at two presses only ever sees the host press's
  // projects on that press's portal. In development (*.replit.dev can't
  // carry a white-label subdomain) an explicit ?wl=<slug> query mirrors the
  // client's ?gtwl override; never honored in production.
  async function resolvePortalPressForRequest(req: Request): Promise<{ id: string } | null> {
    const { parseWhitelabelHost } = await import("@shared/whitelabelHost");
    const rawHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
    let slug = parseWhitelabelHost(rawHost)?.slug ?? null;
    if (!slug && process.env.NODE_ENV !== "production") {
      const q = String(req.query.wl ?? "").trim().toLowerCase();
      if (q) slug = q;
    }
    if (!slug) {
      // Task #3339 — an ACTIVE press custom domain scopes the portal the
      // same way its makesvinyl subdomain does. Fail-closed on status.
      const host = rawHost.toLowerCase().split(":")[0];
      if (isCustomWhitelabelCandidateHost(host)) {
        const cr = await db.execute<any>(sql`
          SELECT id FROM manufacturers
          WHERE lower(custom_domain) = ${host} AND custom_domain_status = 'active'
          LIMIT 1
        `);
        const crow = ((cr as any).rows ?? [])[0];
        if (crow) return { id: String(crow.id) };
      }
      return null;
    }
    const r = await db.execute<any>(sql`
      SELECT id FROM manufacturers
      WHERE lower(white_label_slug) = ${slug} OR lower(previous_white_label_slug) = ${slug}
      ORDER BY (lower(white_label_slug) = ${slug}) DESC
      LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    return row ? { id: String(row.id) } : null;
  }

  // Resolve the signed-in client identity for the white-label portal reads.
  // Customers are the original audience; Task #3331 adds admin-kind partner
  // accounts (press-invited artists land in this portal right after invite
  // accept, and they are ADMIN kind). For admins we synthesize the same
  // {id, displayName, email} shape from the users row — estimates then match
  // by sentTo email (their acceptedByCustomerId never points at an admin id),
  // and every read below stays scoped to the request host's press.
  async function resolvePortalClient(req: Request): Promise<{ id: string; displayName: string | null; email: string | null } | null> {
    const userId = req.session?.userId;
    const kind = req.session?.kind;
    let customer = kind === "customer" && userId ? await storage.getCustomer(userId) : null;
    let adminUserId = kind === "admin" && userId ? userId : null;
    if (!customer && !adminUserId) {
      // Bearer fallback (host-scoped sessions can lag right after signup).
      const authHeader = String(req.headers.authorization ?? "");
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearer) {
        const t = await storage.getAuthBy(bearer);
        if (t && t.kind === "customer") customer = await storage.getCustomer(t.userId);
        else if (t && t.kind === "admin") adminUserId = t.userId;
      }
    }
    if (customer) return { id: customer.id, displayName: (customer as any).displayName ?? null, email: (customer as any).email ?? null };
    if (adminUserId) {
      const u = await storage.getUser(adminUserId);
      if (u) return { id: u.id, displayName: (u as any).displayName ?? null, email: (u as any).email ?? null };
    }
    return null;
  }

  app.get("/api/press-client/portal", async (req, res) => {
    const customer = await resolvePortalClient(req);
    if (!customer) return res.status(401).json({ message: "Unauthorized" });
    const hostPress = await resolvePortalPressForRequest(req);
    if (!hostPress) return res.status(404).json({ message: "Not found" });
    const email = String(customer.email ?? "").toLowerCase();
    const rows = await db.execute<any>(sql`
      SELECT e.id, e.display_id, e.title, e.status, e.created_at, e.updated_at, e.payload,
             m.name AS press_name, m.email_branding AS email_branding
      FROM press_estimates e
      JOIN manufacturers m ON m.id = e.press_id
      WHERE e.kind = 'estimate'
        AND e.press_id = ${hostPress.id}
        AND (e.payload->>'acceptedByCustomerId' = ${customer.id}
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(e.payload->'sentTo','[]'::jsonb)) r
               WHERE lower(r->>'email') = ${email}
             ))
      ORDER BY e.updated_at DESC
      LIMIT 50
    `);
    const list = ((rows as any).rows ?? []).map((r: any) => {
      const p = (r.payload ?? {}) as Record<string, any>;
      return {
        id: r.id,
        estimateNo: r.display_id ?? null,
        title: r.title ?? null,
        status: r.status,
        pressName: r.press_name ?? null,
        build: p.build ?? null,
        totalCents: p.totalCents ?? null,
        quantity: p.builderState?.quantity ?? null,
        sentAt: p.sentAt ?? null,
        acceptedAt: p.acceptedAt ?? null,
        shareToken: typeof p.shareToken === "string" ? p.shareToken : null,
        preparedBy: p.preparedBy ?? null,
      };
    });
    res.json({
      client: { id: customer.id, displayName: customer.displayName, email: customer.email },
      estimates: list,
    });
  });

  // Signed-in client's dashboard data — real data only, honest zeros for a
  // fresh press client (no fabricated sales/plays). The range switcher
  // re-queries this endpoint; series length follows the range. Activity is
  // the estimate lifecycle (created / sent / accepted / files uploaded).
  app.get("/api/press-client/dashboard", async (req, res) => {
    // Task #3331 — shared resolver: customers AND admin-kind press-invited
    // artists (see resolvePortalClient above).
    const customer = await resolvePortalClient(req);
    if (!customer) return res.status(401).json({ message: "Unauthorized" });
    const hostPress = await resolvePortalPressForRequest(req);
    if (!hostPress) return res.status(404).json({ message: "Not found" });
    const email = String(customer.email ?? "").toLowerCase();
    const range = String(req.query.range ?? "30d");
    const days = range === "today" ? 1 : range === "7d" ? 7 : range === "90d" ? 90 : range === "all" ? 365 : 30;
    const rows = await db.execute<any>(sql`
      SELECT e.id, e.display_id, e.title, e.status, e.created_at, e.payload,
             m.name AS press_name
      FROM press_estimates e
      JOIN manufacturers m ON m.id = e.press_id
      WHERE e.kind = 'estimate'
        AND e.press_id = ${hostPress.id}
        AND (e.payload->>'acceptedByCustomerId' = ${customer.id}
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(e.payload->'sentTo','[]'::jsonb)) r
               WHERE lower(r->>'email') = ${email}
             ))
      ORDER BY e.updated_at DESC
      LIMIT 50
    `);
    const ests = ((rows as any).rows ?? []) as any[];
    // Series — honest zeros; press clients have no linked fan-sales data yet.
    const series: { date: string; salesCents: number; plays: number; listeners: number }[] = [];
    const now = Date.now();
    for (let i = days - 1; i >= 0; i--) {
      series.push({ date: new Date(now - i * 86400_000).toISOString().slice(0, 10), salesCents: 0, plays: 0, listeners: 0 });
    }
    const activity: { id: string; kind: string; ts: string; title: string; detail: string }[] = [];
    const topProjects: { id: string; title: string; format: string; units: number; salesCents: number }[] = [];
    for (const r of ests) {
      const p = (r.payload ?? {}) as Record<string, any>;
      const no = r.display_id ?? "";
      const title = r.title ?? "Untitled project";
      if (r.created_at) activity.push({ id: `${r.id}-created`, kind: "stage", ts: new Date(r.created_at).toISOString(), title: `Estimate ${no} prepared`, detail: `${title} · ${r.press_name ?? ""}` });
      if (p.sentAt) activity.push({ id: `${r.id}-sent`, kind: "stage", ts: p.sentAt, title: `Estimate ${no} sent to you`, detail: title });
      if (p.acceptedAt) activity.push({ id: `${r.id}-accepted`, kind: "milestone", ts: p.acceptedAt, title: `${title} project created`, detail: `Estimate ${no} locked as working numbers` });
      for (const f of Array.isArray(p.clientFiles) ? p.clientFiles : []) {
        if (f?.uploadedAt) activity.push({ id: `${r.id}-file-${f.uploadedAt}`, kind: "certificate", ts: f.uploadedAt, title: `File received — ${f.name ?? "upload"}`, detail: `${title} · Estimate ${no}` });
      }
      topProjects.push({
        id: r.id,
        title,
        format: `${p.build ?? "Vinyl"}${r.status === "Converted" ? ` · in production at ${r.press_name ?? "the press"}` : ""}`,
        units: 0,
        salesCents: 0,
      });
    }
    activity.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    const zero = { salesRangeCents: 0, salesLifetimeCents: 0, playsRange: 0, listenerCount: 0, buyerCount: 0 };
    res.json({
      range,
      kpis: { ...zero, prior: { ...zero } },
      series,
      activity: activity.slice(0, 12),
      topProjects: topProjects.slice(0, 5),
      channels: [],
      giving: null,
    });
  });

  // Real client file upload (Ruby handoff "Must work": Upload files opens a
  // real upload). Customer-authed; the file streams to Object Storage under
  // the shared uploads convention and its URL is appended to the estimate's
  // payload.clientFiles so the press sees what the client sent.
  {
    const multerP = import("multer").then((m) => m.default);
    const uploadMiddleware = async (req: Request, res: Response, next: Function) => {
      const multer = await multerP;
      const clientUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
      clientUpload.single("file")(req as any, res as any, next as any);
    };
    app.post("/api/press-client/estimates/:id/files", uploadMiddleware, async (req, res) => {
      const { randomUUID } = await import("node:crypto");
      const { ObjectStorageService, objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      const { setObjectAclPolicy } = await import("./replit_integrations/object_storage/objectAcl");
      const objectStorage = new ObjectStorageService();
      const userId = req.session?.userId;
      const kind = req.session?.kind;
      let customer = kind === "customer" && userId ? await storage.getCustomer(userId) : null;
      if (!customer) {
        const authHeader = String(req.headers.authorization ?? "");
        const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (bearer) {
          const t = await storage.getAuthBy(bearer);
          if (t && t.kind === "customer") customer = await storage.getCustomer(t.userId);
        }
      }
      if (!customer) return res.status(401).json({ message: "Unauthorized" });
      const f = (req as any).file as { originalname: string; mimetype: string; buffer: Buffer } | undefined;
      if (!f) return res.status(400).json({ message: "No file uploaded" });
      const estimateId = String(req.params.id);
      const rows = await db.select().from(pressEstimates).where(eq(pressEstimates.id, estimateId)).limit(1);
      const row = rows[0];
      if (!row || row.kind !== "estimate") return res.status(404).json({ message: "Estimate not found" });
      const payload = (row.payload ?? {}) as Record<string, any>;
      const email = String(customer.email ?? "").toLowerCase();
      const sentTo: Array<{ email?: string }> = Array.isArray(payload.sentTo) ? payload.sentTo : [];
      const mine = payload.acceptedByCustomerId === customer.id || sentTo.some((r) => String(r?.email ?? "").toLowerCase() === email);
      if (!mine) return res.status(404).json({ message: "Estimate not found" });
      const ext = (f.originalname.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
      const id = `${randomUUID()}${ext}`;
      const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
      const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
      const firstSlash = trimmed.indexOf("/");
      const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
      const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
      const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      await file.save(f.buffer, { contentType: f.mimetype || "application/octet-stream", resumable: false });
      // PRIVATE by construction — client masters/artwork must never be
      // readable via the generic public /objects route (review gate,
      // #3295). Reads go through the authed download route below.
      await setObjectAclPolicy(file, { owner: customer.id, visibility: "private" });
      const url = `/api/press-client/estimates/${estimateId}/files/${id}`;
      const entry = { name: f.originalname, url, objectId: id, uploadedAt: new Date().toISOString(), byCustomerId: customer.id };
      const clientFiles = Array.isArray(payload.clientFiles) ? [...payload.clientFiles, entry] : [entry];
      await db
        .update(pressEstimates)
        .set({ payload: { ...payload, clientFiles }, updatedAt: new Date() })
        .where(eq(pressEstimates.id, estimateId));
      res.json({ ok: true, file: entry });
    });

    // Authed download of a client-uploaded file. Readable ONLY by (a) the
    // client the estimate belongs to (accepted-by or sentTo email match) or
    // (b) an operator/press user scoped to the estimate's press. Never
    // served via the public /objects route (files are stored private).
    app.get("/api/press-client/estimates/:id/files/:objectId", async (req, res) => {
      const userId = req.session?.userId;
      const kind = req.session?.kind;
      let auth: { userId: string; kind: "admin" | "customer" } | null =
        userId && kind ? { userId, kind: kind as any } : null;
      if (!auth) {
        const authHeader = String(req.headers.authorization ?? "");
        const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (bearer) auth = (await storage.getAuthBy(bearer)) ?? null;
      }
      if (!auth) return res.status(401).json({ message: "Unauthorized" });
      const estimateId = String(req.params.id);
      const objectId = String(req.params.objectId);
      const rows = await db.select().from(pressEstimates).where(eq(pressEstimates.id, estimateId)).limit(1);
      const row = rows[0];
      if (!row || row.kind !== "estimate") return res.status(404).json({ message: "Not found" });
      const payload = (row.payload ?? {}) as Record<string, any>;
      const clientFiles: Array<{ objectId?: string; name?: string }> = Array.isArray(payload.clientFiles) ? payload.clientFiles : [];
      const entry = clientFiles.find((e) => e?.objectId === objectId);
      if (!entry) return res.status(404).json({ message: "Not found" });
      let allowed = false;
      if (auth.kind === "customer") {
        const customer = await storage.getCustomer(auth.userId);
        const email = String(customer?.email ?? "").toLowerCase();
        const sentTo: Array<{ email?: string }> = Array.isArray(payload.sentTo) ? payload.sentTo : [];
        allowed = !!customer && (payload.acceptedByCustomerId === customer.id
          || sentTo.some((r) => String(r?.email ?? "").toLowerCase() === email));
      } else {
        // Operator or press user — super_admin/admin see everything;
        // partner accounts must hold a membership on THIS press.
        const { getUserRole, findMembershipForScope } = await import("./auth/roles");
        const role = await getUserRole(auth.userId);
        allowed = role?.role === "super_admin" || role?.role === "admin"
          || !!(await findMembershipForScope(auth.userId, "manufacturer", row.pressId));
      }
      if (!allowed) return res.status(404).json({ message: "Not found" });
      const { ObjectStorageService, objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      const objectStorage = new ObjectStorageService();
      const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
      const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
      const firstSlash = trimmed.indexOf("/");
      const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
      const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
      const file = objectStorageClient.bucket(bucketName).file(`${prefix ? `${prefix}/` : ""}uploads/${objectId}`);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ message: "Not found" });
      const [meta] = await file.getMetadata();
      res.setHeader("Content-Type", String(meta.contentType ?? "application/octet-stream"));
      // RFC 5987: ASCII fallback in `filename`, UTF-8 original in
      // `filename*` — a raw non-ASCII name makes Node reject the header
      // (ERR_INVALID_CHAR → 500).
      const rawName = String(entry.name ?? objectId);
      const asciiName = rawName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "") || objectId;
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
      );
      file.createReadStream().on("error", () => { if (!res.headersSent) res.status(500).end(); else res.end(); }).pipe(res);
    });
  }

  // Send an estimate to the artist (Ruby handoff, Aug 19 2026). Requires an
  // artist association (name at minimum) and at least one valid recipient
  // email. Mints the private share token on first send (reused after), stamps
  // sentTo + clientName into the payload, flips status to Sent, and mails a
  // one-line email per recipient with the tokenized link. The link is
  // VIEW-only — it never authorizes checkout (preview-pass law).
  const sendRecipientSchema = z.object({
    name: z.string().trim().max(120).optional().default(""),
    email: z.string().trim().email().max(200),
  });
  app.post("/api/press/:id/estimates/:estimateId/send", requireAdmin, requirePressScope, requireUnveiled, requirePressEditor, async (req, res) => {
    const pressId = String(req.params.id);
    const estimateId = String(req.params.estimateId);
    const body = z
      .object({
        artistName: z.string().trim().min(1).max(200),
        artistPersonId: z.string().trim().max(80).optional(),
        recipients: z.array(sendRecipientSchema).min(1).max(4),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Artist association and at least one valid recipient email are required" });
    const press = await resolvePress(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    const existing = await db
      .select()
      .from(pressEstimates)
      .where(and(eq(pressEstimates.id, estimateId), eq(pressEstimates.pressId, pressId)))
      .limit(1);
    const row = existing[0];
    if (!row) return res.status(404).json({ message: "Estimate not found" });
    if (row.kind !== "estimate") return res.status(400).json({ message: "Only estimates can be sent" });

    const payload = (row.payload ?? {}) as Record<string, any>;

    // The preparing contact — resolved up-front so BOTH the first send and
    // a resend can address the email honestly. From stays a GoodTunes
    // address with "<contact> · via GoodTunes®" as the display name;
    // Reply-To carries the contact's real email so "Just reply" reaches
    // them (falls back to the press contact email, then the platform
    // default). True per-press sending domains are flagged later work.
    const callerId = ((req as any).adminUserId as string | undefined) ?? req.session?.userId;
    let senderName = "";
    let senderEmail: string | null = null;
    if (callerId) {
      const u = await db.execute<any>(sql`SELECT display_name AS name, email FROM users WHERE id = ${callerId} LIMIT 1`);
      const uRow = ((u as any).rows ?? [])[0];
      senderName = String(uRow?.name ?? uRow?.email ?? "").trim();
      const em = String(uRow?.email ?? "").trim();
      senderEmail = em.includes("@") ? em : null;
    }
    const replyToEmail = senderEmail ?? (press.contactEmail && press.contactEmail.includes("@") ? press.contactEmail : null);
    const accent = resolvePressEstimateAccent(press.emailBranding);
    const pressDomain = String(press.websiteUrl ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    const pressLocationLine = [press.location, pressDomain].filter(Boolean).join(" · ") || null;
    const pressLogoUrl = press.logoUrl && /^https:\/\//i.test(press.logoUrl) ? press.logoUrl : null;

    // Fully-expanded numbers for the ONE prepared quantity — recomputed from
    // the stored builder state + the press's CURRENT pricing rows (same
    // source the /send gate trusts). Null (legacy/unverifiable state) omits
    // the totals card rather than rendering wrong or partial numbers.
    // Task #3359 — warm the mockup render and return its public URL, or null
    // when nothing can be produced (the email then renders exactly as before
    // — never a broken image). The render itself always has a drawn fallback
    // (house jacket + neutral disc), so null only happens on a hard failure
    // (e.g. canvas unavailable).
    const mockupUrlFor = async (base: string, tok: string, freshPayload: Record<string, any>): Promise<string | null> => {
      try {
        const artUrl = await resolveEstimateMockupArt(freshPayload);
        const colorName = typeof freshPayload.builderState?.colorName === "string" ? freshPayload.builderState.colorName : null;
        const { getEstimateMockupPng } = await import("./estimateMockup");
        await getEstimateMockupPng(tok, {
          artUrl,
          pressName: press.name,
          pressLogoUrl: press.logoUrl ?? null,
          colorName,
        });
        return `${base}/api/estimate-link/${tok}/mockup.png`;
      } catch (err) {
        console.error("[estimate-mockup] send-path warm render failed:", err);
        return null;
      }
    };

    const composeEstimateEmail = async (
      freshRow: typeof row,
      freshPayload: Record<string, any>,
      linkUrl: string,
      recipient: { name: string; email: string },
      preparedByName: string | null,
      mockupUrl: string | null,
    ) => {
      const { loadPressComponents } = await import("./pressComponents");
      const configs = await loadPressComponents(pressId);
      const breakdown = computeQuoteEmailBreakdown(freshPayload.builderState ?? null, configs.pricing?.rows ?? []);
      const jobTitle = String(freshRow.title ?? "your record").trim() || "your record";
      const clientName = String(freshPayload.clientName ?? recipient.name ?? "").trim() || recipient.email;
      const preparedBy = preparedByName || (typeof freshPayload.preparedBy === "string" ? freshPayload.preparedBy : null);
      return {
        clientName,
        clientEmail: recipient.email,
        estimateNo: String(freshRow.displayId ?? "").trim() || jobTitle,
        sentAt: freshPayload.sentAt ?? null,
        preparedBy,
        pressName: press.name,
        jobTitle,
        specLine: typeof freshPayload.build === "string" && freshPayload.build.trim() ? freshPayload.build.trim() : null,
        linkUrl,
        breakdown,
        accent,
        // MRP light skin (Ruby handoff b912fb6) for presses with email
        // branding configured — data-driven, never a press-name match.
        skin: press.emailBranding ? ("light" as const) : ("dark" as const),
        pressLocationLine,
        pressLogoUrl,
        mockupUrl,
        replyToEmail,
        fromDisplayName: `${(preparedBy || press.name).trim()} · via GoodTunes®`,
      };
    };

    // Send is one-way and a sent estimate is immutable: calling /send again on
    // a Sent/Viewed/… row is a RESEND — it re-emails the already-minted link
    // and never touches status or payload (a re-send must not regress Viewed
    // back to Sent, nor restamp recipients/names onto the quoted build).
    const resendExisting = async (freshRow: typeof row) => {
      const freshPayload = (freshRow.payload ?? {}) as Record<string, any>;
      const existingToken = typeof freshPayload.shareToken === "string" && freshPayload.shareToken.length >= 24 ? freshPayload.shareToken : null;
      if (!existingToken) return res.status(409).json({ message: "This estimate was sent without a share link — duplicate it into a new draft and send that instead." });
      // Task #3258 — branded host when the press has a white-label slug.
      const proto0 = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
      const host0 = (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.get("host");
      const base0 = whitelabelOriginForPress(press) ?? `${proto0}://${host0}`;
      const linkUrl0 = `${base0}/e/${existingToken}`;
      const mockupUrl0 = await mockupUrlFor(base0, existingToken, freshPayload);
      const recipients0 = body.data.recipients.map((r) => ({ name: r.name, email: r.email }));
      const results0 = await Promise.all(
        recipients0.map(async (r) => sendPressClientEstimateEmail(r.email, await composeEstimateEmail(freshRow, freshPayload, linkUrl0, r, null, mockupUrl0))),
      );
      const sentCount0 = results0.filter((r) => r.ok).length;
      return res.json({ row: freshRow, shareToken: existingToken, linkUrl: linkUrl0, sentCount: sentCount0, attempted: recipients0.length, resend: true });
    };
    if (row.status !== "Draft") return resendExisting(row);

    // Honest-quote gate (Task #3243): a build with components awaiting real
    // pricing can be drafted and iterated, but never sent as a firm quote —
    // its total would silently omit (or once fabricated) those lines.
    // Completeness is SERVER-owned: recomputed here from the stored builder
    // state + the press's CURRENT pricing rows (never the client-supplied
    // pricingPending flag, which is display-only).
    // FAIL CLOSED: no builder state = nothing to verify against, so nothing
    // sends. The client-supplied pricingPending flag is display-only and is
    // never consulted here.
    const builderState = payload.builderState;
    const invalidReason = invalidQuoteBuilderState(builderState);
    if (invalidReason) {
      return res.status(409).json({ message: `This estimate's saved build can't be verified (${invalidReason}) — re-save it from the estimate builder before sending.` });
    }
    const { loadPressComponents } = await import("./pressComponents");
    const configs = await loadPressComponents(pressId);
    const pendingIds = computeQuotePendingIds(builderState, configs.pricing?.rows ?? []);
    if (pendingIds.length > 0) {
      return res.status(409).json({
        message: "This build includes components awaiting pricing — it can be saved as a draft, but not sent as a firm quote yet.",
        pendingLineIds: pendingIds,
      });
    }
    const shareToken: string = typeof payload.shareToken === "string" && payload.shareToken.length >= 24
      ? payload.shareToken
      : crypto.randomBytes(24).toString("base64url");
    const sentTo = body.data.recipients.map((r) => ({ name: r.name, email: r.email }));
    // Task #3359 — resolve + persist the mockup artwork choice at first send
    // (string URL or explicit null = house jacket) so resends and the public
    // mockup route stay consistent even if the artist's catalog changes.
    const mockupArtUrl = await resolveEstimateMockupArt({
      ...payload,
      ...(body.data.artistPersonId ? { artistPersonId: body.data.artistPersonId } : {}),
    });
    const nextPayload: Record<string, any> = {
      ...payload,
      mockupArtUrl,
      shareToken,
      sentTo,
      sentAt: new Date().toISOString(),
      clientName: body.data.artistName,
      ...(body.data.artistPersonId ? { artistPersonId: body.data.artistPersonId } : {}),
      builderState: payload.builderState
        ? { ...payload.builderState, clientName: body.data.artistName }
        : payload.builderState,
    };
    // Sender ("Prepared by") was resolved up-top (with their reply-to email)
    // BEFORE the one-way claim so the claim is the ONLY write that ever
    // touches a Sent payload.
    if (senderName) nextPayload.preparedBy = senderName;
    // Atomic one-way claim: only a row still in Draft can be transitioned.
    // If a concurrent /send won the race, we lose the claim, reload the row
    // and fall through to the resend path so every caller emails the ONE
    // persisted token (never a second, dead link).
    const [updated] = await db
      .update(pressEstimates)
      .set({ status: "Sent", payload: nextPayload, updatedAt: new Date() })
      .where(and(eq(pressEstimates.id, estimateId), eq(pressEstimates.pressId, pressId), eq(pressEstimates.status, "Draft")))
      .returning();
    if (!updated) {
      const fresh = await db
        .select()
        .from(pressEstimates)
        .where(and(eq(pressEstimates.id, estimateId), eq(pressEstimates.pressId, pressId)))
        .limit(1);
      if (!fresh[0]) return res.status(404).json({ message: "Estimate not found" });
      return resendExisting(fresh[0]);
    }

    // Private link lives on the press's white-label host when one is
    // configured (Task #3258), else on the host that served this request —
    // the client route (/e/:token) ships in the same SPA bundle on every host.
    const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
    const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.get("host");
    const linkUrl = `${whitelabelOriginForPress(press) ?? `${proto}://${host}`}/e/${shareToken}`;

    // Best-effort mail — a transport failure must not lose the Sent state,
    // but the caller needs to know (mail.ts records failures for ops).
    const mockupUrl = await mockupUrlFor(whitelabelOriginForPress(press) ?? `${proto}://${host}`, shareToken, nextPayload);
    const results = await Promise.all(
      sentTo.map(async (r) => sendPressClientEstimateEmail(r.email, await composeEstimateEmail(updated, nextPayload, linkUrl, r, senderName || null, mockupUrl))),
    );
    const sentCount = results.filter((r) => r.ok).length;
    res.json({ row: updated, shareToken, linkUrl, sentCount, attempted: sentTo.length });
  });

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
    // Task #2750 — light-background variants + Square/Tall format.
    lightLogoUrl: z.string().nullable().optional(),
    lightNavLogoUrl: z.string().nullable().optional(),
    squareLogoUrl: z.string().nullable().optional(),
    lightSquareLogoUrl: z.string().nullable().optional(),
    websiteUrl: z.string().url().nullable().optional().or(z.literal("")),
    contactEmail: z.string().email().nullable().optional().or(z.literal("")),
    contactPhone: z.string().max(40).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    // handoff/press-settings-templates-policy (Bill, Aug 15 2026) — per-press
    // "require a passing test before a template goes live" policy toggle.
    requireCertifiedTemplates: z.boolean().optional(),
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
    // Task #2750 — light-background variants + Square/Tall format.
    if (parsed.data.lightLogoUrl !== undefined) set.lightLogoUrl = norm(parsed.data.lightLogoUrl);
    if (parsed.data.lightNavLogoUrl !== undefined) set.lightNavLogoUrl = norm(parsed.data.lightNavLogoUrl);
    if (parsed.data.squareLogoUrl !== undefined) set.squareLogoUrl = norm(parsed.data.squareLogoUrl);
    if (parsed.data.lightSquareLogoUrl !== undefined) set.lightSquareLogoUrl = norm(parsed.data.lightSquareLogoUrl);
    if (parsed.data.websiteUrl !== undefined) set.websiteUrl = norm(parsed.data.websiteUrl);
    if (parsed.data.contactEmail !== undefined) set.contactEmail = norm(parsed.data.contactEmail);
    if (parsed.data.contactPhone !== undefined) set.contactPhone = norm(parsed.data.contactPhone);
    if (parsed.data.location !== undefined) set.location = norm(parsed.data.location);
    if (parsed.data.bio !== undefined) set.bio = norm(parsed.data.bio);
    if (parsed.data.requireCertifiedTemplates !== undefined) set.requireCertifiedTemplates = parsed.data.requireCertifiedTemplates;
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
    // Task #3254 — a logo uploaded via the signed-PUT flow lands in GCS with
    // NO ACL, and /objects/uploads/:id refuses anything not explicitly
    // public. Publish + VERIFY the ACL BEFORE persisting the URL; if
    // publication fails, fail the save so a broken URL is never stored.
    // Pasted absolute external URLs pass through untouched.
    const { collectUploadObjectUrls, publishUploadObjectsOrThrow, LogoAclPublishError } =
      await import("./logoAclPublish");
    const logoUrlsToPublish = collectUploadObjectUrls([
      set.logoUrl, set.navLogoUrl,
      set.lightLogoUrl, set.lightNavLogoUrl,
      set.squareLogoUrl, set.lightSquareLogoUrl,
    ]);
    if (logoUrlsToPublish.length > 0) {
      try {
        await publishUploadObjectsOrThrow(logoUrlsToPublish);
      } catch (e) {
        console.error("[press-logo-acl] refusing to persist unpublished logo", e);
        return res.status(e instanceof LogoAclPublishError ? 422 : 502).json({
          message: e instanceof LogoAclPublishError
            ? e.message
            : "Couldn't publish the uploaded logo — try again in a moment.",
        });
      }
    }
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

  // ─── Press acquisition funnel routes ─────────────────────────────────
  // Mirrors /api/partner/reports/funnel* but gated by requirePressScope
  // instead of requireReportScope (which explicitly 403s manufacturer
  // role). Builds the same ReportContext with the press's manufacturer
  // scope so partnerFunnelReleases / partnerAcquisitionFunnel return only
  // albums whose pressing_order_requests reference this press.
  function parsePressRange(req: Request): { from: Date; to: Date } {
    const fromStr = String(req.query.from || "");
    const toStr = String(req.query.to || "");
    const now = new Date();
    const to = toStr ? new Date(toStr) : now;
    const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 86400_000);
    from.setUTCHours(0, 0, 0, 0);
    const toEnd = new Date(to);
    toEnd.setUTCHours(23, 59, 59, 999);
    return { from, to: toEnd };
  }

  app.get("/api/press/:id/funnel/releases", requireAdmin, requirePressScope, async (req, res) => {
    const { partnerFunnelReleases } = await import("./reports/index");
    const pressId = String(req.params.id);
    try {
      const ctx = {
        scope: { role: "manufacturer" as const, roleScopeId: pressId },
        ...parsePressRange(req),
        albumId: null,
      };
      const data = await partnerFunnelReleases(ctx);
      res.json(data);
    } catch (e: any) {
      console.error("[press/funnel/releases]", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/press/:id/funnel", requireAdmin, requirePressScope, async (req, res) => {
    const { partnerAcquisitionFunnel } = await import("./reports/index");
    const pressId = String(req.params.id);
    try {
      const ctx = {
        scope: { role: "manufacturer" as const, roleScopeId: pressId },
        ...parsePressRange(req),
        albumId: null,
      };
      const data = await partnerAcquisitionFunnel(ctx, {
        albumId: String(req.query.albumId || ""),
        excludeInternal: req.query.excludeInternal === "1" || req.query.excludeInternal === "true",
      });
      res.json(data);
    } catch (e: any) {
      console.error("[press/funnel]", e);
      res.status(500).json({ message: e.message });
    }
  });
}

// ─── Side-effect helpers ───────────────────────────────────────────────
// All three helpers run fire-and-forget from the on-read pipeline sweep
// (and from the masters-trigger endpoint), so they MUST swallow their
// own errors — never throw upward, never block the response.

async function notifyArtistMastersReady(artistId: string | null, albumId: string, pressId: string) {
  if (!artistId) return;
  try {
    const r = await db.execute<any>(sqlMastersReadyNotifyRow(artistId, albumId, pressId));
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

export function pressEmailBrand(press: any): PressEmailBrand | null {
  if (!press) return null;
  const accentColor = press.brandAccentColor ?? null;
  const cornerStyle = press.brandCornerStyle ?? null;
  const contactLine = press.brandContactLine ?? null;
  if (!accentColor && !cornerStyle && !contactLine) return null;
  // Email cards are white — prefer the light-background logo variants.
  const logoUrl = ppAbsoluteUrl(press.lightLogoUrl ?? press.lightNavLogoUrl ?? press.lightSquareLogoUrl ?? press.logoUrl ?? null);
  return { pressName: press.name ?? null, logoUrl, accentColor, cornerStyle, contactLine };
}
