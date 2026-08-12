// Task #246 — Signed-cert print batch helpers.
//
// One batch lives on the album row itself (six step timestamps +
// `cert_batch_pdf_asset_url`). The PDF compiles every `in_production`
// reservation into a single merged PDF using the locked
// GoodDeedPrintTemplate so the press receives one multipage document
// — byte-identical, page-per-cert — in GoodDeed-number order.
//
// Task #551 — Was a ZIP of per-cert PDFs; flipped to one multipage
// PDF so the press operator runs a single print job. Output is now
// `application/pdf` and call sites updated in lockstep.

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  certReservations,
  orders,
  signedCertCertificates,
} from "@shared/schema";
import {
  renderGoodDeedBatchPdf,
  type GoodDeedPrintInputs,
} from "./goodDeedPrintTemplate";

export async function generateBatchPdf(
  albumId: string,
  origin: string,
): Promise<{ buffer: Buffer; certCount: number; contentType: string } | null> {
  const reservations = await db
    .select()
    .from(certReservations)
    .where(
      and(
        eq(certReservations.albumId, albumId),
        eq(certReservations.status, "in_production"),
        eq(certReservations.variantKind, "printed"),
      ),
    );
  if (reservations.length === 0) return null;

  const orderIds = reservations.map((r) => r.orderId);

  // Pull cert + order rows together so we can sort by goodDeedNumber
  // before handing to the template. Ascending sequence number is what
  // the press expects — pages match the printed run order.
  const rows = await db
    .select({ cert: signedCertCertificates, order: orders })
    .from(signedCertCertificates)
    .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
    .where(inArray(signedCertCertificates.orderId, orderIds))
    .orderBy(asc(orders.goodDeedNumber));

  if (rows.length === 0) return null;

  const items: GoodDeedPrintInputs[] = rows.map((r) => ({
    albumId,
    sequenceNumber: r.order.goodDeedNumber,
    recipientName:
      (r.cert.confirmedName && r.cert.confirmedName.trim()) ||
      r.order.buyerName ||
      "GoodTunes Fan",
    qrPayload: `${origin}/g/${r.cert.shortId}`,
    paperSize: r.cert.paperSize === "a4" ? "a4" : "letter",
  }));

  const buffer = await renderGoodDeedBatchPdf(items);
  return { buffer, certCount: rows.length, contentType: "application/pdf" };
}

// Six ordered batch steps. Operator advances them as the physical
// batch moves through the world.
export const CERT_BATCH_STEPS = [
  { key: "sent_to_press", label: "Sent to press", column: "certBatchSentToPressAt" as const },
  { key: "at_artist", label: "At artist for signing", column: "certBatchAtArtistAt" as const },
  { key: "returned", label: "Returned from artist", column: "certBatchReturnedAt" as const },
  { key: "hologram", label: "Hologram applied", column: "certBatchHologramAt" as const },
  {
    key: "shipped_to_fulfillment",
    label: "Shipped to fulfillment",
    column: "certBatchShippedToFulfillmentAt" as const,
  },
  { key: "inserted", label: "Inserted into vinyl shipment", column: "certBatchInsertedAt" as const },
] as const;

export type CertBatchStepKey = (typeof CERT_BATCH_STEPS)[number]["key"];

// ─── Task #3075 — per-batch leg ownership ────────────────────────────
// Which party owns each physical leg of the signed-cert batch:
//   print                — the printing vendor
//   hologram_shrinkwrap  — hologram + shrinkwrap applier (printer when it
//                          offers the service, else the fulfillment co.)
//   fulfillment          — receives the batch and ships (return-label
//                          target first, then album routing, then the
//                          platform default warehouse)
// MRP-style do-it-all presses (same vendor on print + hologram legs)
// collapse to a single owner so the operator sees one row, not three.

export type CertLegOwnerRef = { id: string; name: string } | null;

export interface CertLegOwners {
  collapsed: boolean;
  legs: Array<{
    leg: "print" | "hologram_shrinkwrap" | "fulfillment";
    label: string;
    ownerKind: "vendor" | "fulfillment_partner" | null;
    ownerId: string | null;
    ownerName: string | null;
    source: string | null;
  }>;
}

export function resolveCertLegOwners(args: {
  printVendor: CertLegOwnerRef;
  hologramVendor: CertLegOwnerRef;
  returnFulfillment: CertLegOwnerRef;
  albumFulfillment: CertLegOwnerRef;
  defaultFulfillment: CertLegOwnerRef;
}): CertLegOwners {
  const { printVendor, hologramVendor, returnFulfillment, albumFulfillment, defaultFulfillment } = args;

  // When the printer doesn't do hologram+shrinkwrap, that leg falls to
  // whichever fulfillment company the return label targets.
  const hologramOwner: { kind: "vendor" | "fulfillment_partner"; ref: CertLegOwnerRef; source: string } =
    hologramVendor
      ? { kind: "vendor", ref: hologramVendor, source: "vendor_assignment" }
      : returnFulfillment
        ? { kind: "fulfillment_partner", ref: returnFulfillment, source: "return_label" }
        : { kind: "vendor", ref: null, source: "" };

  const fulfillOwner: { ref: CertLegOwnerRef; source: string } = returnFulfillment
    ? { ref: returnFulfillment, source: "return_label" }
    : albumFulfillment
      ? { ref: albumFulfillment, source: "album_routing" }
      : defaultFulfillment
        ? { ref: defaultFulfillment, source: "platform_default" }
        : { ref: null, source: "" };

  // Do-it-all collapse: same vendor prints AND applies hologram.
  const collapsed = !!(printVendor && hologramVendor && printVendor.id === hologramVendor.id);

  return {
    collapsed,
    legs: [
      {
        leg: "print",
        label: collapsed ? "Print + hologram + shrinkwrap" : "Print",
        ownerKind: printVendor ? "vendor" : null,
        ownerId: printVendor?.id ?? null,
        ownerName: printVendor?.name ?? null,
        source: printVendor ? "vendor_assignment" : null,
      },
      ...(collapsed
        ? []
        : [
            {
              leg: "hologram_shrinkwrap" as const,
              label: "Hologram + shrinkwrap",
              ownerKind: hologramOwner.ref ? hologramOwner.kind : null,
              ownerId: hologramOwner.ref?.id ?? null,
              ownerName: hologramOwner.ref?.name ?? null,
              source: hologramOwner.ref ? hologramOwner.source : null,
            },
          ]),
      {
        leg: "fulfillment",
        label: "Fulfillment (receive + ship)",
        ownerKind: fulfillOwner.ref ? "fulfillment_partner" : null,
        ownerId: fulfillOwner.ref?.id ?? null,
        ownerName: fulfillOwner.ref?.name ?? null,
        source: fulfillOwner.ref ? fulfillOwner.source : null,
      },
    ],
  };
}

// Resolve where the batch actually lands when no return label targets a
// specific partner. MUST mirror real order routing (pickFulfillmentPartner
// in orderDesk.ts): live album_fulfillment_splits first, then the per-album
// override, then default-flagged / oldest live partner. Returns the ref +
// which rung of the chain produced it.
export async function resolveBatchFulfillmentRouting(album: {
  id: string;
  fulfillmentPartnerId: string | null;
}): Promise<{ ref: { id: string; name: string }; source: "album_routing" | "platform_default" } | null> {
  const { pickFulfillmentPartner, pickAllFulfillmentPartners } = await import("./orderDesk");
  const routedId = await pickFulfillmentPartner({
    albumId: album.id,
    fulfillmentPartnerId: null,
  } as any);
  if (!routedId) return null;
  const { db } = await import("./db");
  const { fulfillmentPartners } = await import("@shared/schema");
  const { sql } = await import("drizzle-orm");
  const [p] = await db
    .select({ id: fulfillmentPartners.id, name: fulfillmentPartners.name })
    .from(fulfillmentPartners)
    .where(sql`${fulfillmentPartners.id} = ${routedId} AND ${fulfillmentPartners.deletedAt} IS NULL`)
    .limit(1);
  if (!p) return null;
  const splitIds = (await pickAllFulfillmentPartners(album.id)).map((s) => s.partnerId);
  const source: "album_routing" | "platform_default" =
    splitIds.includes(routedId) || routedId === album.fulfillmentPartnerId
      ? "album_routing"
      : "platform_default";
  return { ref: { id: p.id, name: p.name }, source };
}

// Atomically persist the return-label fields AND claim the one-shot
// inbound heads-up. The row lock (FOR UPDATE in the CTE) serializes
// concurrent saves so exactly one caller gets claimed=true for a given
// partner; re-targeting a different partner (or renotify=true) re-claims.
// Clearing the partner resets the guard.
export async function saveCertBatchReturnLabel(args: {
  albumId: string;
  fulfillmentPartnerId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  renotify?: boolean;
}): Promise<{ claimed: boolean }> {
  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");
  const { albumId, fulfillmentPartnerId: fid, carrier, trackingNumber, renotify } = args;
  const out = await db.execute(sql`
    WITH prev AS (
      SELECT cert_batch_return_notified_at AS old_notified,
             cert_batch_return_fulfillment_id AS old_fid
      FROM albums WHERE id = ${albumId} FOR UPDATE
    )
    UPDATE albums a SET
      cert_batch_return_fulfillment_id = ${fid},
      cert_batch_return_carrier = ${carrier},
      cert_batch_return_tracking = ${trackingNumber},
      cert_batch_return_notified_at = CASE
        WHEN ${fid}::varchar IS NULL THEN NULL
        WHEN prev.old_notified IS NULL
          OR prev.old_fid IS DISTINCT FROM ${fid}::varchar
          OR ${renotify === true} THEN now()
        ELSE prev.old_notified END
    FROM prev
    WHERE a.id = ${albumId}
    RETURNING (
      ${fid}::varchar IS NOT NULL AND (
        prev.old_notified IS NULL
        OR prev.old_fid IS DISTINCT FROM ${fid}::varchar
        OR ${renotify === true}
      )
    ) AS claimed
  `);
  const row = (out as any).rows?.[0];
  return { claimed: row?.claimed === true };
}

// On dispatch failure, release the claim (only if nothing re-targeted in
// the meantime) so a later save can retry the notification.
export async function releaseCertBatchNotifyClaim(albumId: string, fulfillmentPartnerId: string) {
  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    UPDATE albums SET cert_batch_return_notified_at = NULL
    WHERE id = ${albumId} AND cert_batch_return_fulfillment_id = ${fulfillmentPartnerId}
  `);
}

// ─── Task #3075 — fulfillment GoodDeed service ladder validation ─────
// Mirrors vendorGoodDeedPricing.validateUpsert's tier rules for the
// fulfillment partner's receive/hologram/shrinkwrap/ship service.
export interface FulfillmentGoodDeedService {
  active: boolean;
  tiers: Array<{ qty: number; perUnitCents: number }>;
  setupFeeCents?: number;
  leadTimeDays?: number;
  notes?: string | null;
}

export function validateFulfillmentGoodDeedService(input: any): string | null {
  if (typeof input !== "object" || input === null) return "Invalid body";
  if (typeof input.active !== "boolean") return "active must be a boolean";
  if (!Array.isArray(input.tiers) || input.tiers.length === 0) {
    return "At least one tier is required";
  }
  const seen = new Set<number>();
  for (const t of input.tiers) {
    if (!Number.isInteger(t?.qty) || t.qty <= 0) return "Tier qty must be a positive integer";
    if (!Number.isInteger(t?.perUnitCents) || t.perUnitCents < 0) return "Tier price must be ≥ $0";
    if (seen.has(t.qty)) return "Duplicate tier quantity";
    seen.add(t.qty);
  }
  if (input.setupFeeCents != null && (!Number.isInteger(input.setupFeeCents) || input.setupFeeCents < 0)) {
    return "Setup fee must be ≥ $0";
  }
  if (input.leadTimeDays != null && (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0)) {
    return "Lead time must be ≥ 0 days";
  }
  return null;
}
