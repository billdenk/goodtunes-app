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
