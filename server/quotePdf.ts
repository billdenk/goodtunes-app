// Task #707 — Quote PDF export.
//
// Renders a clean, branded GoodTunes quote PDF from a payload built on
// the client (SellPanel → SkuRow's Pricing section). The pricing math
// is single-sourced on the client (the `breakdown` / `blockEconomics`
// helpers in SellPanel.tsx); this module is pure layout — it never
// recomputes a number, it only lays out the figures it's handed so the
// PDF can never drift from what the operator sees on screen.
//
// One format per export: the package summary (format · color · tracks ·
// press) sits up top, then every pricing option (Option 1, Option 2 …)
// is laid out as a side-by-side comparison column so an artist can read
// "$35 @ 500 vs. $45 @ 1,000" at a glance.
import PDFDocument from "pdfkit";

// Brand palette (mirrors client/src/index.css + replit.md "Brand").
const NAVY = "#00062B";
const BLUE = "#319ED8";
const MINT = "#4AFFCA";
const PINK = "#FF5470";
const SLATE_900 = "#0f172a";
const SLATE_600 = "#475569";
const SLATE_500 = "#64748b";
const SLATE_400 = "#94a3b8";
const SLATE_200 = "#e2e8f0";
const SLATE_100 = "#f1f5f9";
const SLATE_50 = "#f8fafc";

export type QuoteOption = {
  label: string;
  priceCents: number | null;
  qty: number;
  manufacturingCents: number;
  publishingCents: number;
  publishingTrackCount: number | null;
  paymentProcessingCents: number;
  goodtunesCents: number;
  costPerUnitCents: number | null;
  profitCents: number | null;
  totalCents: number | null;
  needsQuote: boolean;
};

export type QuotePdfData = {
  album: { title: string; artist: string };
  format: { label: string };
  pkg: {
    colorName?: string | null;
    trackCount?: number | null;
    jacketLabel?: string | null;
    pressName?: string | null;
  };
  options: QuoteOption[];
};

const DOLLAR_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const neg = cents < 0;
  const s = DOLLAR_FMT.format(Math.abs(cents) / 100);
  return neg ? `-${s}` : s;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// pdfkit is callback-driven; collect chunks and resolve with a Buffer.
export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );
  drawQuote(doc, data);
  doc.end();
  return done;
}

const PAGE_W = 612; // Letter @ 72dpi
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

function drawQuote(doc: PDFKit.PDFDocument, data: QuotePdfData) {
  const now = new Date();

  // ── Header band ────────────────────────────────────────────────
  const bandH = 84;
  doc.rect(0, 0, PAGE_W, bandH).fill(NAVY);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("GoodTunes\u00ae", MARGIN, 26, { lineBreak: false });
  doc
    .fillColor(MINT)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("PRICING QUOTE", MARGIN, 54, { lineBreak: false });
  // Right-aligned date.
  doc
    .fillColor("#cbd5e1")
    .font("Helvetica")
    .fontSize(9)
    .text(fmtDate(now), PAGE_W - MARGIN - 200, 56, {
      width: 200,
      align: "right",
    });
  // Mint accent rule under the band.
  doc.rect(0, bandH, PAGE_W, 3).fill(MINT);

  // ── Album title + artist ───────────────────────────────────────
  let y = bandH + 26;
  doc
    .fillColor(SLATE_900)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(data.album.title || "Untitled release", MARGIN, y, {
      width: CONTENT_W,
    });
  y = doc.y + 2;
  doc
    .fillColor(SLATE_500)
    .font("Helvetica")
    .fontSize(12)
    .text(data.album.artist || "Unknown artist", MARGIN, y, {
      width: CONTENT_W,
    });
  y = doc.y + 18;

  // ── Package summary card ───────────────────────────────────────
  y = drawPackageCard(doc, data, y);
  y += 22;

  // ── Pricing options heading ────────────────────────────────────
  doc
    .fillColor(SLATE_900)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Pricing", MARGIN, y);
  const optionCount = data.options.length;
  doc
    .fillColor(SLATE_400)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      optionCount > 1
        ? `${optionCount} options \u00b7 compare price \u00d7 run size`
        : "Estimated economics per unit",
      MARGIN,
      y + 3,
      { width: CONTENT_W, align: "right" },
    );
  y += 24;

  // ── Option comparison columns ──────────────────────────────────
  drawOptionColumns(doc, data.options, y);

  // ── Footer ─────────────────────────────────────────────────────
  drawFooter(doc, now);
}

function drawPackageCard(
  doc: PDFKit.PDFDocument,
  data: QuotePdfData,
  y: number,
): number {
  const rows: { label: string; value: string }[] = [
    { label: "Format", value: data.format.label },
  ];
  if (data.pkg.colorName)
    rows.push({ label: "Color", value: data.pkg.colorName });
  if (data.pkg.trackCount != null)
    rows.push({
      label: "Tracks",
      value: `${data.pkg.trackCount} ${data.pkg.trackCount === 1 ? "track" : "tracks"}`,
    });
  if (data.pkg.jacketLabel)
    rows.push({ label: "Jacket", value: data.pkg.jacketLabel });
  if (data.pkg.pressName)
    rows.push({ label: "Press", value: data.pkg.pressName });

  const padX = 16;
  const padY = 14;
  // 2-column grid of label/value pairs.
  const cols = 2;
  const colW = (CONTENT_W - padX * 2) / cols;
  const rowH = 34;
  const gridRows = Math.ceil(rows.length / cols);
  const cardH = padY * 2 + gridRows * rowH - 8;

  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 10).fill(SLATE_50);
  doc
    .roundedRect(MARGIN, y, CONTENT_W, cardH, 10)
    .lineWidth(1)
    .stroke(SLATE_200);

  // Left accent bar.
  doc.rect(MARGIN, y + 12, 3, cardH - 24).fill(BLUE);

  rows.forEach((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = MARGIN + padX + col * colW;
    const cy = y + padY + row * rowH;
    doc
      .fillColor(SLATE_400)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(r.label.toUpperCase(), cx, cy, {
        width: colW - 12,
        characterSpacing: 0.5,
      });
    doc
      .fillColor(SLATE_900)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(r.value, cx, cy + 11, { width: colW - 12, lineBreak: false });
  });

  return y + cardH;
}

function drawOptionColumns(
  doc: PDFKit.PDFDocument,
  options: QuoteOption[],
  startY: number,
) {
  if (options.length === 0) return;
  const gap = 14;
  // Up to 3 columns per row; wrap beyond that.
  const perRow = Math.min(3, options.length);
  const colW = (CONTENT_W - gap * (perRow - 1)) / perRow;

  let y = startY;
  for (let i = 0; i < options.length; i += perRow) {
    const slice = options.slice(i, i + perRow);
    let maxH = 0;
    slice.forEach((opt, j) => {
      const x = MARGIN + j * (colW + gap);
      const h = drawOptionCard(doc, opt, x, y, colW);
      if (h > maxH) maxH = h;
    });
    y += maxH + gap;
  }
}

// Returns the rendered height of the card.
function drawOptionCard(
  doc: PDFKit.PDFDocument,
  opt: QuoteOption,
  x: number,
  y: number,
  w: number,
): number {
  const padX = 12;
  const innerW = w - padX * 2;
  const headerH = 26;

  // Pre-measure: fixed sections.
  const lines: { label: string; value: string; muted?: boolean }[] = [
    { label: "Manufacturing", value: money(opt.manufacturingCents), muted: true },
    {
      label:
        opt.publishingTrackCount != null
          ? `Publishing (${opt.publishingTrackCount} trk)`
          : "Publishing",
      value: money(opt.publishingCents),
      muted: true,
    },
    { label: "Payment processing", value: money(opt.paymentProcessingCents), muted: true },
    { label: "GoodTunes", value: money(opt.goodtunesCents), muted: true },
  ];

  const lineH = 14;
  const loss = opt.profitCents != null && opt.profitCents < 0;

  // Compute total height.
  let cur = headerH + 12; // header + top pad
  cur += 30; // retail price block
  cur += 24; // qty block
  cur += 8; // divider gap
  cur += lines.length * lineH;
  cur += 22; // cost/unit row
  cur += 26; // profit row
  cur += 30; // total band
  cur += 12; // bottom pad
  const cardH = cur;

  // Card background + border.
  doc.roundedRect(x, y, w, cardH, 10).fill("#ffffff");
  doc.roundedRect(x, y, w, cardH, 10).lineWidth(1).stroke(SLATE_200);

  // Header band.
  doc.save();
  doc.roundedRect(x, y, w, headerH, 10).clip();
  doc.rect(x, y, w, headerH).fill(NAVY);
  doc.restore();
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(opt.label.toUpperCase(), x + padX, y + 8, {
      width: innerW,
      characterSpacing: 0.5,
      lineBreak: false,
    });

  let cy = y + headerH + 10;

  // Retail price.
  doc
    .fillColor(SLATE_400)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text("RETAIL PRICE", x + padX, cy, { characterSpacing: 0.5 });
  doc
    .fillColor(SLATE_900)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(money(opt.priceCents), x + padX, cy + 9, { lineBreak: false });
  cy += 32;

  // Quantity.
  doc
    .fillColor(SLATE_500)
    .font("Helvetica")
    .fontSize(9)
    .text("Run size", x + padX, cy, { lineBreak: false });
  doc
    .fillColor(SLATE_900)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`${opt.qty.toLocaleString()} units`, x + padX, cy, {
      width: innerW,
      align: "right",
      lineBreak: false,
    });
  cy += 18;

  // Divider.
  doc
    .moveTo(x + padX, cy)
    .lineTo(x + w - padX, cy)
    .lineWidth(1)
    .stroke(SLATE_100);
  cy += 8;

  // Cost breakdown lines.
  for (const ln of lines) {
    const isMfgQuote = ln.label === "Manufacturing" && opt.needsQuote;
    doc
      .fillColor(isMfgQuote ? BLUE : SLATE_600)
      .font("Helvetica")
      .fontSize(8.5)
      .text(ln.label, x + padX, cy, { lineBreak: false });
    doc
      .fillColor(isMfgQuote ? BLUE : SLATE_600)
      .font("Helvetica")
      .fontSize(8.5)
      .text(isMfgQuote ? "needs quote" : ln.value, x + padX, cy, {
        width: innerW,
        align: "right",
        lineBreak: false,
      });
    cy += lineH;
  }

  // Cost / unit.
  cy += 2;
  doc
    .moveTo(x + padX, cy - 1)
    .lineTo(x + w - padX, cy - 1)
    .lineWidth(1)
    .stroke(SLATE_100);
  cy += 4;
  doc
    .fillColor(SLATE_900)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text("Cost / unit", x + padX, cy, { lineBreak: false });
  doc
    .fillColor(SLATE_900)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(money(opt.costPerUnitCents), x + padX, cy, {
      width: innerW,
      align: "right",
      lineBreak: false,
    });
  cy += 18;

  // Profit / unit (accent).
  doc
    .fillColor(SLATE_500)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text("Profit / unit", x + padX, cy + 4, { lineBreak: false });
  doc
    .fillColor(loss ? PINK : "#0f9d6b")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(money(opt.profitCents), x + padX, cy, {
      width: innerW,
      align: "right",
      lineBreak: false,
    });
  cy += 26;

  // Total band.
  const bandY = y + cardH - 12 - 22;
  doc.roundedRect(x + padX, bandY, innerW, 24, 6).fill(loss ? "#fff1f3" : "#eefbf5");
  doc
    .fillColor(SLATE_600)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("TOTAL", x + padX + 8, bandY + 8, {
      characterSpacing: 0.5,
      lineBreak: false,
    });
  doc
    .fillColor(loss ? PINK : "#0f9d6b")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(money(opt.totalCents), x + padX, bandY + 6, {
      width: innerW - 8,
      align: "right",
      lineBreak: false,
    });

  return cardH;
}

function drawFooter(doc: PDFKit.PDFDocument, now: Date) {
  const footY = 720;
  doc
    .moveTo(MARGIN, footY)
    .lineTo(PAGE_W - MARGIN, footY)
    .lineWidth(1)
    .stroke(SLATE_200);
  doc
    .fillColor(SLATE_400)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      "Estimate only. Figures are projections at the quantities and prices shown and are not a binding offer. Manufacturing costs depend on the final press, color, and run size.",
      MARGIN,
      footY + 8,
      { width: CONTENT_W - 120 },
    );
  doc
    .fillColor(SLATE_400)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      `Generated ${now.toLocaleString("en-US")}`,
      PAGE_W - MARGIN - 160,
      footY + 8,
      { width: 160, align: "right" },
    );
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("GoodTunes\u00ae", PAGE_W - MARGIN - 160, footY + 24, {
      width: 160,
      align: "right",
    });
}
