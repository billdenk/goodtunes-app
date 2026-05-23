// Task #217 — Print-ready PDF compositor.
//
// Given source artwork bytes (JPEG/PNG — the formats PDFKit embeds
// without extra deps) and a chosen vendor template, emit a PDF
// sized to (finished + bleed) inches at 72 pt/inch with the artwork
// stretched edge-to-edge so the bleed area carries image, not white.
//
// Intentionally NOT shipped here (must be enforced upstream before
// composition starts):
// - CMYK / spot-color profile conversion. The compositor copies the
//   source bytes through as-is; if the source isn't already in the
//   vendor's required color space, the upload validator FAILs that
//   row and the route refuses to generate.
// - Font embedding / outlining. Same gate: validator checks live
//   on the source asset; the compositor doesn't try to fix bad bytes.
// - Re-embedding source PDF/EPS/PSD/TIFF artwork. Caller must hand
//   a raster JPEG/PNG; the route hard-blocks otherwise instead of
//   silently producing a placeholder wrapper.
//
// No visible trim marks or QC text are drawn into the output —
// real plant templates carry their own dielines on a separate layer,
// and any ink in the live area would print on the finished piece.

import PDFDocument from "pdfkit";
import type { TemplateSpec, VendorSpec } from "@shared/vendorSpecs";

export type CompositeInput = {
  vendor: VendorSpec;
  template: TemplateSpec;
  /** Source artwork bytes. MUST be a JPEG or PNG; route enforces. */
  artBuffer: Buffer;
  /** Image MIME type — used for a final defensive type check. */
  artContentType: string;
  /** Metadata stamped into the PDF /Info dictionary for traceability. */
  album: { title: string; artist: string; catalogCode: string };
};

const PT = 72;

export class UnsupportedArtTypeError extends Error {
  constructor(contentType: string) {
    super(`Print PDF generation requires JPEG or PNG source artwork (got ${contentType}).`);
    this.name = "UnsupportedArtTypeError";
  }
}

export async function composePrintPdf(input: CompositeInput): Promise<Buffer> {
  const { vendor, template, artBuffer, artContentType, album } = input;
  if (!/^image\/(jpe?g|png)$/i.test(artContentType)) {
    throw new UnsupportedArtTypeError(artContentType);
  }

  const pageWpt = (template.finishedInches.w + template.bleedInches * 2) * PT;
  const pageHpt = (template.finishedInches.h + template.bleedInches * 2) * PT;

  const doc = new PDFDocument({
    size: [pageWpt, pageHpt],
    margin: 0,
    info: {
      Title: `${album.artist} — ${album.title} (${template.label})`,
      Author: "GoodTunes Player",
      Subject: `${vendor.label} ${template.label}`,
      Keywords: `pressing,${vendor.id},${template.id},${album.catalogCode}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  // Stretch the source raster to cover the full page (finished + bleed).
  // For non-square templates (gatefold 24"×12") the artist must supply a
  // source whose aspect matches — the validator surfaces a `warn` row
  // when ratios diverge; this compositor does not re-crop.
  doc.image(artBuffer, 0, 0, { width: pageWpt, height: pageHpt });

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

// Vendor filename convention (PMP is strictest):
//   Catalog#_Artist_TemplateType_yyyymmdd.pdf
// Only alphanumerics survive each segment (PMP's regex forbids
// hyphens, spaces, accents). Uppercased so output matches PMP examples.
export function buildPrintFileName(args: {
  catalogCode: string;
  artist: string;
  templateId: string;
  at?: Date;
}): string {
  const date = args.at ?? new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const slug = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  return `${slug(args.catalogCode)}_${slug(args.artist)}_${slug(args.templateId)}_${y}${m}${d}.pdf`;
}
