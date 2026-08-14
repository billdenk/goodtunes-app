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

// ─── Task #3091 — EasyPost labels for the signing round-trip ─────────
// Buy (a) an outbound label — printer → artist/manager signing address —
// and (b) a prepaid return label addressed to the next destination:
// the printer when a hologram/shrinkwrap leg exists there, else the
// routed fulfillment partner. Idempotent: a stored snapshot is returned
// as-is, never re-bought; an advisory lock serializes concurrent buys.
// Local pickup is recorded honestly as status "skipped".

import type { CertBatchShippingLabels, CertBatchLabelSnapshot, PartnerAddressSnapshot } from "@shared/schema";
import type { EasyPostAddress, EasyPostParcel } from "./easypost";

export type LabelAddressInput = {
  name?: string | null;
  company?: string | null;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
};

// Validate an operator-supplied / partner-derived address into the shape
// EasyPost needs. Returns the missing field names so the route can tell
// the operator exactly what to fill in (reason-coded, never vague).
export function validateLabelAddress(
  a: LabelAddressInput | null | undefined,
): { ok: true; address: EasyPostAddress } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const req = (k: keyof LabelAddressInput) => {
    const v = a?.[k];
    if (typeof v !== "string" || !v.trim()) missing.push(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const name = req("name");
  const street1 = req("street1");
  const city = req("city");
  const state = req("state");
  const zip = req("zip");
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    address: {
      name,
      company: a?.company?.trim() || null,
      street1,
      street2: a?.street2?.trim() || null,
      city,
      state,
      zip,
      country: a?.country?.trim() || "US",
      phone: a?.phone?.trim() || null,
    },
  };
}

// PartnerAddressSnapshot (labels/vendors/fulfillment jsonb) → label input.
export function snapshotToLabelInput(
  name: string,
  snap: PartnerAddressSnapshot | null | undefined,
): LabelAddressInput {
  return {
    name,
    street1: snap?.line1 ?? null,
    street2: snap?.line2 ?? null,
    city: snap?.city ?? null,
    state: snap?.state ?? null,
    zip: snap?.postalCode ?? null,
    country: snap?.country ?? null,
  };
}

// Resolve where the prepaid return label should point. Mirrors the leg-
// ownership rules (Task #3075): hologram/shrinkwrap vendor when assigned
// (usually the printer — MRP-style do-it-alls), else the return-label
// fulfillment partner, else real order routing.
export async function resolveReturnDestination(album: {
  id: string;
  fulfillmentPartnerId: string | null;
  certBatchReturnFulfillmentId: string | null;
}): Promise<
  | {
      kind: "vendor" | "fulfillment_partner";
      id: string;
      name: string;
      addressSnap: PartnerAddressSnapshot | null;
    }
  | null
> {
  const { db } = await import("./db");
  const { albumAddons, vendors, fulfillmentPartners } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");
  const [addon] = await db
    .select({ hologramVendorId: albumAddons.hologramVendorId, printVendorId: albumAddons.printVendorId })
    .from(albumAddons)
    .where(and(eq(albumAddons.albumId, album.id), eq(albumAddons.kind, "signed_cert")))
    .limit(1);
  if (addon?.hologramVendorId) {
    const [v] = await db
      .select({ id: vendors.id, name: vendors.name, locationAddress: vendors.locationAddress })
      .from(vendors)
      .where(eq(vendors.id, addon.hologramVendorId))
      .limit(1);
    if (v) return { kind: "vendor", id: v.id, name: v.name, addressSnap: v.locationAddress ?? null };
  }
  const fpId =
    album.certBatchReturnFulfillmentId ??
    (await resolveBatchFulfillmentRouting({ id: album.id, fulfillmentPartnerId: album.fulfillmentPartnerId }))?.ref
      .id ??
    null;
  if (!fpId) return null;
  const [fp] = await db
    .select({
      id: fulfillmentPartners.id,
      name: fulfillmentPartners.name,
      shippingAddressStruct: fulfillmentPartners.shippingAddressStruct,
      locationAddress: fulfillmentPartners.locationAddress,
    })
    .from(fulfillmentPartners)
    .where(eq(fulfillmentPartners.id, fpId))
    .limit(1);
  if (!fp) return null;
  return {
    kind: "fulfillment_partner",
    id: fp.id,
    name: fp.name,
    addressSnap: fp.shippingAddressStruct ?? fp.locationAddress ?? null,
  };
}

export type PurchaseLabelsResult =
  | { ok: true; labels: CertBatchShippingLabels; alreadyPurchased: boolean }
  | { ok: false; status: number; reason: string; message: string; labels?: CertBatchShippingLabels | null };

// Buy outbound + return labels. Partial-failure safe: a successful outbound
// buy is persisted even when the return buy fails, and the re-request only
// buys the missing leg (never double-buys either).
// Session-level advisory lock keyed on the album — shared by EVERY mutation
// of cert_batch_shipping_labels (purchase, signing-address save, skip, clear)
// so no path can read-then-overwrite around a concurrent purchase. Writes
// inside the callback run autocommit and are durable the moment they return.
async function withCertBatchLabelLock<T>(albumId: string, fn: () => Promise<T>): Promise<T> {
  const { pool } = await import("./db");
  const client = await (pool as any).connect();
  const key = "cert-batch-labels:" + albumId;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

export async function purchaseCertBatchLabels(args: {
  albumId: string;
  outboundTo: LabelAddressInput; // artist/manager signing address (operator-confirmed)
  outboundFrom?: LabelAddressInput | null; // override; defaults to the print vendor's address
  returnTo?: LabelAddressInput | null; // override; defaults to the resolved return destination
  parcel?: { weightOz?: number; lengthIn?: number; widthIn?: number; heightIn?: number } | null;
}): Promise<PurchaseLabelsResult> {
  const { db } = await import("./db");
  const { albums, albumAddons, vendors } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");
  const { createUpsShipment, buyShipmentRate, retrieveShipment, easypostConfigured } = await import("./easypost");

  if (!easypostConfigured()) {
    return {
      ok: false,
      status: 503,
      reason: "not_configured",
      message:
        "EasyPost is not configured yet (EASYPOST_API_KEY). Set it up with the gogoods EasyPost dashboard — the UPS account must be added there as a carrier account.",
    };
  }

  // SESSION-level advisory lock (not a transaction): every snapshot write in
  // here must be individually durable — a partial or an intent persisted
  // inside an uncommitted transaction would vanish on a crash, and the next
  // request would re-buy postage. The same lock also guards the address/skip
  // mutations so they can never clobber a mid-flight purchase.
  return await withCertBatchLabelLock(args.albumId, async () => {
    const [album] = await db.select().from(albums).where(eq(albums.id, args.albumId)).limit(1);
    if (!album) return { ok: false as const, status: 404, reason: "not_found", message: "Album not found" };

    const existing = (album.certBatchShippingLabels ?? null) as CertBatchShippingLabels | null;
    if (existing?.status === "purchased" && existing.outbound && existing.return) {
      return { ok: true as const, labels: existing, alreadyPurchased: true };
    }
    // Printer-driven flow: the operator pre-saves the signing address
    // ("pending"), the printer only supplies parcel basics. An explicit
    // outboundTo (operator flow) still wins.
    const outboundToInput: LabelAddressInput =
      args.outboundTo?.street1 ? args.outboundTo : { ...(existing?.signingAddress ?? {}), ...(args.outboundTo ?? {}) };
    if (existing?.status === "skipped") {
      return {
        ok: false as const,
        status: 409,
        reason: "skipped",
        message: "Labels were marked skipped (local pickup). Clear the skip before buying labels.",
        labels: existing,
      };
    }

    // Outbound FROM — the printer holding the batch.
    let outboundFromInput = args.outboundFrom ?? null;
    let printVendorName: string | null = null;
    if (!outboundFromInput || !outboundFromInput.street1) {
      const [addon] = await db
        .select({ printVendorId: albumAddons.printVendorId })
        .from(albumAddons)
        .where(and(eq(albumAddons.albumId, args.albumId), eq(albumAddons.kind, "signed_cert")))
        .limit(1);
      let printVendorId = addon?.printVendorId ?? null;
      if (!printVendorId) {
        const { payoutSettings } = await import("@shared/schema");
        const [settings] = await db.select().from(payoutSettings).limit(1);
        printVendorId = settings?.defaultPrintVendorId ?? null;
      }
      if (printVendorId) {
        const [v] = await db
          .select({ name: vendors.name, locationAddress: vendors.locationAddress })
          .from(vendors)
          .where(eq(vendors.id, printVendorId))
          .limit(1);
        if (v) {
          printVendorName = v.name;
          outboundFromInput = { ...snapshotToLabelInput(v.name, v.locationAddress), ...(args.outboundFrom ?? {}) };
        }
      }
    }
    const fromCheck = validateLabelAddress(outboundFromInput);
    if (!fromCheck.ok) {
      return {
        ok: false as const,
        status: 422,
        reason: "missing_from_address",
        message: `The printer's ship-from address is incomplete (missing: ${fromCheck.missing.join(", ")}). ${printVendorName ? `Fill in ${printVendorName}'s address` : "Assign a print vendor with an address"} or supply outboundFrom explicitly.`,
      };
    }
    const toCheck = validateLabelAddress(outboundToInput);
    if (!toCheck.ok) {
      return {
        ok: false as const,
        status: 422,
        reason: "missing_to_address",
        message: existing?.signingAddress
          ? `The artist/manager signing address is incomplete (missing: ${toCheck.missing.join(", ")}).`
          : "No artist/manager signing address on file — the operator saves it on the cert sale window first, then labels can be created.",
      };
    }

    // Return destination — printer (hologram leg) else fulfillment partner.
    const dest = await resolveReturnDestination({
      id: album.id,
      fulfillmentPartnerId: album.fulfillmentPartnerId ?? null,
      certBatchReturnFulfillmentId: album.certBatchReturnFulfillmentId ?? null,
    });
    if (!dest) {
      return {
        ok: false as const,
        status: 422,
        reason: "no_return_destination",
        message:
          "No return destination could be resolved — assign a hologram/shrinkwrap vendor or a fulfillment partner for this batch first.",
      };
    }
    const returnToInput: LabelAddressInput = {
      ...snapshotToLabelInput(dest.name, dest.addressSnap),
      ...(args.returnTo ?? {}),
    };
    const returnCheck = validateLabelAddress(returnToInput);
    if (!returnCheck.ok) {
      return {
        ok: false as const,
        status: 422,
        reason: "missing_return_address",
        message: `${dest.name}'s return address is incomplete (missing: ${returnCheck.missing.join(", ")}). Fill it in on their partner record or supply returnTo explicitly.`,
      };
    }

    const parcel: EasyPostParcel = {
      weightOz: args.parcel?.weightOz && args.parcel.weightOz > 0 ? args.parcel.weightOz : 48, // ~3 lb cert stack default
      lengthIn: args.parcel?.lengthIn ?? null,
      widthIn: args.parcel?.widthIn ?? null,
      heightIn: args.parcel?.heightIn ?? null,
    };

    const snap = (r: { shipmentId: string; trackingCode: string; labelUrl: string; carrier: string; service: string; rateCents: number; isReturn: boolean }, to: EasyPostAddress): CertBatchLabelSnapshot => ({
      shipmentId: r.shipmentId,
      trackingCode: r.trackingCode,
      labelUrl: r.labelUrl,
      carrier: r.carrier,
      service: r.service,
      rateCents: r.rateCents,
      isReturn: r.isReturn,
      purchasedAt: new Date().toISOString(),
      toName: to.name,
      toCity: to.city ?? null,
      toState: to.state ?? null,
    });

    let outbound = existing?.outbound ?? null;
    let ret = existing?.return ?? null;
    const intents = { outbound: existing?.intents?.outbound ?? null, return: existing?.intents?.return ?? null };

    // Durable snapshot writer — every mid-flight state change commits
    // immediately (autocommit under the session lock), so a crash at ANY
    // point leaves enough state to recover without re-charging.
    const persist = async (status: CertBatchShippingLabels["status"]): Promise<CertBatchShippingLabels> => {
      const labels: CertBatchShippingLabels = {
        status,
        signingAddress: existing?.signingAddress ?? null,
        intents,
        outbound,
        return: ret,
        returnDestination: { kind: dest.kind, id: dest.id, name: dest.name },
      };
      await db.update(albums).set({ certBatchShippingLabels: labels }).where(eq(albums.id, args.albumId));
      return labels;
    };

    // Buy one leg crash-safely:
    //  1. A stored intent (shipment id) means a previous attempt may have
    //     charged before dying — retrieve it and ADOPT the purchase if so.
    //  2. Otherwise create a shipment (free), persist its id durably, THEN
    //     buy. A failed/unknown buy leaves the intent for the next retry to
    //     reconcile — never a blind re-buy.
    const buyLeg = async (
      leg: "outbound" | "return",
      to: EasyPostAddress,
      from: EasyPostAddress,
    ): Promise<{ ok: true; snapshot: CertBatchLabelSnapshot } | { ok: false; reason: string; message: string }> => {
      if (intents[leg]) {
        const got = await retrieveShipment(intents[leg] as string);
        if (!got.ok) {
          return { ok: false, reason: `${leg}_${got.reason}`, message: `Could not verify the earlier ${leg} label attempt (shipment ${intents[leg]}): ${got.message}. Not re-buying until EasyPost is reachable.` };
        }
        if (got.purchased) return { ok: true, snapshot: snap(got.purchased, to) };
        intents[leg] = null; // shipment exists but was never bought — safe to start fresh
      }
      const created = await createUpsShipment({
        to,
        from,
        parcel,
        isReturn: leg === "return",
        reference: `cert-batch-${leg}-${args.albumId}`,
      });
      if (!created.ok) return { ok: false, reason: `${leg}_${created.reason}`, message: created.message };
      intents[leg] = created.shipmentId;
      await persist(outbound ? "partial" : "pending"); // durable intent BEFORE money moves
      const bought = await buyShipmentRate(created.shipmentId, created.rate);
      if (!bought.ok) {
        // Intent stays persisted — the retry retrieves this shipment first.
        return { ok: false, reason: `${leg}_${bought.reason}`, message: bought.message };
      }
      return { ok: true, snapshot: snap(bought, to) };
    };

    if (!outbound) {
      const r = await buyLeg("outbound", toCheck.address, fromCheck.address);
      if (!r.ok) {
        await persist("pending"); // nothing bought yet — keep the printer's create button live
        return { ok: false as const, status: 502, reason: r.reason, message: `Outbound label failed: ${r.message}` };
      }
      outbound = r.snapshot;
      await persist("partial");
    }

    if (!ret) {
      // Prepaid return: from the artist back to the next destination.
      const r = await buyLeg("return", returnCheck.address, toCheck.address);
      if (!r.ok) {
        const labels = await persist("partial");
        return {
          ok: false as const,
          status: 502,
          reason: r.reason,
          message: `Return label failed (outbound label was bought and saved): ${r.message}`,
          labels,
        };
      }
      ret = r.snapshot;
    }

    const labels = await persist("purchased");
    return { ok: true as const, labels, alreadyPurchased: false };
  });
}

// After a fresh purchase whose return targets a fulfillment partner, mirror
// carrier+tracking into the Task #3075 return-label fields and fire that
// partner's one-shot inbound heads-up email. Shared by the admin route AND
// the printer-portal route (Bill's flow: the printer clicks the button).
// NOTE: saveCertBatchReturnLabel alone would consume the one-shot notify
// claim without sending anything — always dispatch when claimed.
export async function mirrorReturnTrackingAndNotify(
  albumId: string,
  labels: CertBatchShippingLabels,
  // Test seam (like materializeOrderFromSession's {stripe}): inject the email
  // dispatcher so the commit-then-mirror retry boundary is testable offline.
  deps?: { dispatch?: (args: any) => Promise<any> },
): Promise<{ notifyProblem: string | null }> {
  if (!labels.return || labels.returnDestination?.kind !== "fulfillment_partner") {
    return { notifyProblem: null };
  }
  const fpId = labels.returnDestination.id;
  const carrier = labels.return.carrier;
  const trackingNumber = labels.return.trackingCode;
  try {
    const { claimed } = await saveCertBatchReturnLabel({
      albumId,
      fulfillmentPartnerId: fpId,
      carrier,
      trackingNumber,
    });
    if (!claimed) return { notifyProblem: null };
    const { db } = await import("./db");
    const { albums, certReservations } = await import("@shared/schema");
    const { and, eq } = await import("drizzle-orm");
    const [album] = await db.select({ title: albums.title, artist: albums.artist }).from(albums).where(eq(albums.id, albumId)).limit(1);
    const reservations = await db
      .select({ id: certReservations.id })
      .from(certReservations)
      .where(
        and(
          eq(certReservations.albumId, albumId),
          eq(certReservations.status, "in_production"),
          eq(certReservations.variantKind, "printed"),
        ),
      );
    const batchSize = reservations.length;
    const albumTitle = album?.title ?? "an album";
    const bodyLines = [
      `A signed GoodDeed certificate batch for ${albumTitle}${album?.artist ? ` by ${album.artist}` : ""} is inbound to your dock.`,
      `Batch size: ${batchSize} signed certificate${batchSize === 1 ? "" : "s"}.`,
      `Tracking: ${carrier} ${trackingNumber} (prepaid return label rides with the batch).`,
      "Apply the GoodTunes-supplied holographic stickers, shrinkwrap, and ship per your GoodDeed service agreement.",
    ];
    try {
      const { dispatchPartnerNotification, partnerEmailHtml } = await import("./partnerNotifications");
      const dispatch = deps?.dispatch ?? dispatchPartnerNotification;
      await dispatch({
        partnerKind: "fulfillment",
        partnerId: fpId,
        eventType: "fulfillment_heads_up",
        subject: `Inbound signed cert batch: ${albumTitle} (${batchSize} certs)`,
        html: partnerEmailHtml({
          heading: "Signed cert batch inbound",
          bodyLines,
          partnerName: labels.returnDestination.name ?? "your team",
        }),
        text: bodyLines.join("\n\n"),
        payloadSnapshot: { albumId, albumTitle, batchSize, carrier, trackingNumber },
      });
      return { notifyProblem: null };
    } catch (e: any) {
      await releaseCertBatchNotifyClaim(albumId, fpId).catch(() => {});
      return { notifyProblem: e?.message ?? "Heads-up email failed" };
    }
  } catch (e: any) {
    return { notifyProblem: e?.message ?? "Return tracking mirror failed" };
  }
}

// Operator pre-saves the artist/manager signing address so the PRINTER can
// create both labels from their portal after packing (they know box + weight).
export async function saveCertBatchSigningAddress(
  albumId: string,
  address: LabelAddressInput,
): Promise<{ ok: boolean; message?: string; missing?: string[] }> {
  const check = validateLabelAddress(address);
  if (!check.ok) return { ok: false, missing: check.missing, message: `Missing: ${check.missing.join(", ")}` };
  const { db } = await import("./db");
  const { albums } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  // Same lock as the purchase path: without it, a save that reads "no labels"
  // just before a printer purchase commits would overwrite the bought snapshot
  // with `pending` — and the next request would re-buy postage.
  return await withCertBatchLabelLock(albumId, async () => {
    const [album] = await db
      .select({ labels: albums.certBatchShippingLabels })
      .from(albums)
      .where(eq(albums.id, albumId))
      .limit(1);
    if (!album) return { ok: false, message: "Album not found" };
    const existing = (album.labels ?? null) as CertBatchShippingLabels | null;
    if (existing?.outbound || existing?.return) {
      return { ok: false, message: "Labels already purchased — the signing address can no longer change." };
    }
    const next: CertBatchShippingLabels = {
      status: existing?.status === "skipped" ? "skipped" : "pending",
      skippedReason: existing?.skippedReason ?? null,
      intents: existing?.intents ?? null, // never drop a possibly-charged shipment intent
      signingAddress: {
        name: address.name ?? null,
        street1: address.street1 ?? null,
        street2: address.street2 ?? null,
        city: address.city ?? null,
        state: address.state ?? null,
        zip: address.zip ?? null,
        country: address.country ?? "US",
        phone: address.phone ?? null,
      },
      outbound: null,
      return: null,
      returnDestination: existing?.returnDestination ?? null,
    };
    await db.update(albums).set({ certBatchShippingLabels: next }).where(eq(albums.id, albumId));
    return { ok: true };
  });
}

// Local-pickup escape hatch — records honestly that no labels are needed.
// Refuses to overwrite purchased labels (that would hide bought postage).
export async function skipCertBatchLabels(albumId: string, reason: string): Promise<{ ok: boolean; message?: string }> {
  const { db } = await import("./db");
  const { albums } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  return await withCertBatchLabelLock(albumId, async () => {
    const [album] = await db.select({ labels: albums.certBatchShippingLabels }).from(albums).where(eq(albums.id, albumId)).limit(1);
    if (!album) return { ok: false, message: "Album not found" };
    const existing = album.labels as CertBatchShippingLabels | null;
    if (existing?.outbound || existing?.return) {
      return { ok: false, message: "Labels were already purchased — cannot mark skipped." };
    }
    if (existing?.intents?.outbound || existing?.intents?.return) {
      return {
        ok: false,
        message:
          "A label purchase attempt is in flight for this batch — retry the purchase (it reconciles safely) before marking it local pickup.",
      };
    }
    await db
      .update(albums)
      .set({
        certBatchShippingLabels: {
          status: "skipped",
          skippedReason: reason,
          signingAddress: existing?.signingAddress ?? null,
          outbound: null,
          return: null,
          returnDestination: null,
        } satisfies CertBatchShippingLabels,
      })
      .where(eq(albums.id, albumId));
    return { ok: true };
  });
}

export async function clearCertBatchLabelSkip(albumId: string): Promise<void> {
  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");
  await withCertBatchLabelLock(albumId, async () => {
    // Keep a saved signing address across the un-skip instead of nulling the
    // whole blob; the status guard means a purchase can never be wiped.
    await db.execute(sql`
      UPDATE albums SET cert_batch_shipping_labels =
        CASE
          WHEN cert_batch_shipping_labels -> 'signingAddress' IS NOT NULL
               AND cert_batch_shipping_labels ->> 'signingAddress' <> 'null'
          THEN jsonb_set(cert_batch_shipping_labels::jsonb, '{status}', '"pending"') - 'skippedReason'
          ELSE NULL
        END
      WHERE id = ${albumId} AND cert_batch_shipping_labels ->> 'status' = 'skipped'
    `);
  });
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
