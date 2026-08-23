// PQ sheet print twin — the pdfkit render of PressPQSheetPdfMRP.tsx.
//
// Two US-letter pages, same paper grammar as server/quotePdf.ts: a
// letterhead + a thin blue rule (not the estimate's mint band — this is an
// internal cutting-master doc), meta grid, artist confirmations, Side A on
// page 1; Side B, the side-length reference ladder, mastering notes &
// run-out scribing, the cutting-engineer sign-off, and a pinned footer
// with the online token link on page 2. No play buttons on paper — the
// footer tells the engineer where to LISTEN. Word + icon verdicts carry
// over (check / triangle glyphs drawn inline, never color alone).
import PDFDocument from "pdfkit";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { PqPayload, PqSide } from "./pqSheet";

// Palette — mirrors the mock (light internal skin, GoodStudio blue rule).
const INK = "#1d1d1f";
const SUBINK = "#6e6e73";
const FAINT = "#aeaeb2";
const HAIRLINE = "#dcdce1";
const RULE_STRONG = "#c7c7cc";
const BLUE_RULE = "#8fcbe9";
const WARN = "#b25000";
const READY = "#1f7a33";

const PAGE_W = 612; // US Letter @ 72dpi
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOT_Y = PAGE_H - 56;

export async function renderPqPdf(data: PqPayload): Promise<Buffer> {
  // PDFKit doesn't understand SVG directly. Convert the same MRP mark used
  // by the online mock to an in-memory PNG; a missing asset never blocks the
  // document (the text letterhead remains complete).
  let logo: Buffer | null = null;
  try {
    const svg = await readFile(
      path.resolve(process.cwd(), "client/src/pages/mrp/assets/mrp-logo.svg"),
    );
    logo = await sharp(svg).png().toBuffer();
  } catch {}
  const doc = new PDFDocument({ size: "LETTER", margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );
  drawDoc(doc, data, logo);
  doc.end();
  return done;
}

// ── tiny glyphs (word + icon, never color alone) ──────────────────────
function checkGlyph(doc: PDFKit.PDFDocument, x: number, y: number, color: string) {
  doc.save();
  doc.lineWidth(1.5).strokeColor(color);
  doc
    .moveTo(x, y + 4)
    .lineTo(x + 3, y + 7)
    .lineTo(x + 8, y + 1)
    .stroke();
  doc.restore();
}
function triangleGlyph(doc: PDFKit.PDFDocument, x: number, y: number, color: string) {
  doc.save();
  doc.lineWidth(1.2).strokeColor(color);
  doc
    .moveTo(x + 4.5, y)
    .lineTo(x + 9, y + 8)
    .lineTo(x, y + 8)
    .closePath()
    .stroke();
  doc
    .moveTo(x + 4.5, y + 3)
    .lineTo(x + 4.5, y + 6)
    .stroke();
  doc.restore();
}

function letterhead(
  doc: PDFKit.PDFDocument,
  data: PqPayload,
  logo: Buffer | null,
): number {
  let y = MARGIN;
  if (logo) doc.image(logo, MARGIN, y - 3, { fit: [28, 28] });
  const titleX = logo ? MARGIN + 38 : MARGIN;
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(data.press || "Cutting master", titleX, y, { lineBreak: false });
  doc
    .fillColor(SUBINK)
    .font("Helvetica")
    .fontSize(9.5)
    .text("Cutting master \u2014 PQ sheet", titleX, y + 16, { lineBreak: false });
  // right meta
  doc
    .fillColor(SUBINK)
    .font("Helvetica")
    .fontSize(9.5)
    .text(data.date, PAGE_W - MARGIN - 200, y + 2, { width: 200, align: "right" });
  y += 32;
  // thin blue rule
  doc.rect(MARGIN, y, CONTENT_W, 1).fill(BLUE_RULE);
  return y + 1;
}

function eyebrow(doc: PDFKit.PDFDocument, text: string, x: number, y: number) {
  doc
    .fillColor(SUBINK)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(text.toUpperCase(), x, y, { characterSpacing: 0.8, lineBreak: false });
}

function docFoot(doc: PDFKit.PDFDocument, data: PqPayload, pageLabel: string) {
  doc.rect(MARGIN, FOOT_Y, CONTENT_W, 1).fill(HAIRLINE);
  doc
    .fillColor(SUBINK)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      "Generated from the artist\u2019s uploaded masters and project details.",
      MARGIN,
      FOOT_Y + 8,
      { width: CONTENT_W - 120 },
    );
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(7.5)
    .text(`Listen to every track online: ${data.tokenLink}`, MARGIN, FOOT_Y + 19, {
      width: CONTENT_W - 120,
    });
  doc
    .fillColor(SUBINK)
    .font("Helvetica")
    .fontSize(8)
    .text(pageLabel, PAGE_W - MARGIN - 120, FOOT_Y + 8, {
      width: 120,
      align: "right",
    });
}

function sideTable(
  doc: PDFKit.PDFDocument,
  side: PqSide,
  y: number,
): number {
  // header
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(`Side ${side.side}`, MARGIN, y, { lineBreak: false });
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`${side.total} total`, PAGE_W - MARGIN - 120, y + 2, {
      width: 120,
      align: "right",
    });
  y += 18;
  // verdict — word + icon
  if (side.verdict.icon === "check")
    checkGlyph(doc, MARGIN, y + 1, side.verdict.status === "ready" ? READY : WARN);
  else triangleGlyph(doc, MARGIN, y, WARN);
  doc
    .fillColor(SUBINK)
    .font("Helvetica")
    .fontSize(9)
    .text(side.verdict.text, MARGIN + 14, y, { width: CONTENT_W - 14 });
  y += 16;
  // column heads
  doc.rect(MARGIN, y + 11, CONTENT_W, 1).fill(RULE_STRONG);
  doc
    .fillColor(SUBINK)
    .font("Helvetica-Bold")
    .fontSize(7.5);
  doc.text("NO.", MARGIN, y, { lineBreak: false, characterSpacing: 0.6 });
  doc.text("TRACK TITLE / FILE", MARGIN + 34, y, { lineBreak: false, characterSpacing: 0.6 });
  doc.text("START \u2013 END", PAGE_W - MARGIN - 150, y, {
    width: 100,
    align: "right",
    characterSpacing: 0.6,
  });
  doc.text("LENGTH", PAGE_W - MARGIN - 46, y, {
    width: 46,
    align: "right",
    characterSpacing: 0.6,
  });
  y += 16;
  // rows
  for (const tr of side.tracks) {
    doc
      .fillColor(SUBINK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(tr.no, MARGIN, y, { lineBreak: false });
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(tr.title, MARGIN + 34, y, { width: CONTENT_W - 34 - 160, lineBreak: false });
    doc
      .fillColor(SUBINK)
      .font("Helvetica")
      .fontSize(8.5)
      .text(tr.file, MARGIN + 34, y + 12, { width: CONTENT_W - 34 - 160, lineBreak: false });
    doc
      .fillColor(SUBINK)
      .font("Helvetica")
      .fontSize(9.5)
      .text(`${tr.start} \u2013 ${tr.end}`, PAGE_W - MARGIN - 150, y + 3, {
        width: 100,
        align: "right",
      });
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(tr.len, PAGE_W - MARGIN - 46, y + 3, { width: 46, align: "right" });
    y += 26;
    doc.rect(MARGIN, y - 4, CONTENT_W, 1).fill(HAIRLINE);
  }
  return y;
}

function drawDoc(
  doc: PDFKit.PDFDocument,
  data: PqPayload,
  logo: Buffer | null,
) {
  // ── PAGE 1 — identity, setup, Side A ──
  let y = letterhead(doc, data, logo);
  y += 18;
  eyebrow(doc, "Cutting master", MARGIN, y);
  y += 12;
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(data.album, MARGIN, y, { width: CONTENT_W, lineBreak: true });
  y = doc.y + 1;
  doc
    .fillColor(SUBINK)
    .font("Helvetica")
    .fontSize(10.5)
    .text(`${data.artist} \u00b7 ${data.format}`, MARGIN, y, { width: CONTENT_W });
  y = doc.y + 16;

  // meta grid (2 columns)
  const meta: [string, string][] = [
    ["Catalogue no \u2014 run-out scribing", data.catalog],
    ["Matrix numbers", data.matrix],
    ["Gap between tracks", data.gap],
    ["Cut speed", data.cutSpeed],
  ];
  const boxTop = y;
  const colW = CONTENT_W / 2;
  meta.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = MARGIN + 14 + col * colW;
    const cy = boxTop + 12 + row * 34;
    eyebrow(doc, k, cx, cy);
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(v, cx, cy + 11, { width: colW - 28, lineBreak: false });
  });
  const boxH = 12 + Math.ceil(meta.length / 2) * 34;
  doc.rect(MARGIN, boxTop, CONTENT_W, boxH).lineWidth(1).stroke(HAIRLINE);
  y = boxTop + boxH + 18;

  // confirmations
  eyebrow(doc, "Confirmed by the artist", MARGIN, y);
  y += 12;
  for (const c of data.confirmations) {
    if (c.confirmed) checkGlyph(doc, MARGIN, y + 1, READY);
    else triangleGlyph(doc, MARGIN, y, FAINT);
    doc
      .fillColor(c.confirmed ? INK : SUBINK)
      .font("Helvetica")
      .fontSize(10)
      .text(c.label, MARGIN + 14, y, { width: CONTENT_W - 14 });
    y += 16;
  }
  y += 8;

  if (data.sides[0]) sideTable(doc, data.sides[0], y);
  docFoot(doc, data, "Page 1 of 2");

  // ── PAGE 2 — Side B (+ any extra sides), reference, notes, sign-off ──
  doc.addPage({ size: "LETTER", margin: 0 });
  y = letterhead(doc, data, logo);
  y += 18;

  for (const side of data.sides.slice(1)) {
    y = sideTable(doc, side, y) + 14;
  }
  if (data.sides.length <= 1) {
    doc
      .fillColor(SUBINK)
      .font("Helvetica")
      .fontSize(10)
      .text("This cut has a single side.", MARGIN, y);
    y += 20;
  }

  // reference ladder
  eyebrow(doc, "Side length reference \u2014 album LP, 33\u2153 rpm", MARGIN, y);
  y += 13;
  const ref = data.reference;
  doc.font("Helvetica").fontSize(10.5);
  let rx = MARGIN;
  const seg = (bold: string, rest: string) => {
    doc.fillColor(INK).font("Helvetica-Bold").text(bold, rx, y, { lineBreak: false });
    rx += doc.widthOfString(bold) + 3;
    doc.fillColor(SUBINK).font("Helvetica").text(rest, rx, y, { lineBreak: false });
    rx += doc.widthOfString(rest) + 20;
  };
  seg(`${ref.loud} min`, "loud level");
  seg(`${ref.average} min`, "average level");
  seg(`${ref.lower} min`, "lower level");
  y += 24;

  // notes
  eyebrow(doc, "Mastering notes & run-out scribing", MARGIN, y);
  y += 12;
  doc
    .fillColor(data.notes ? INK : SUBINK)
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      data.notes ??
        "No mastering notes recorded for this cut. Add notes on the project before sending to the lathe.",
      MARGIN,
      y,
      { width: CONTENT_W - 40, lineGap: 3 },
    );
  y = doc.y + 26;

  // sign-off
  const half = (CONTENT_W - 40) * 0.66;
  doc.rect(MARGIN, y + 22, half, 1).fill(RULE_STRONG);
  doc.rect(MARGIN + half + 40, y + 22, CONTENT_W - half - 40, 1).fill(RULE_STRONG);
  eyebrow(doc, "Cutting engineer", MARGIN, y + 28);
  eyebrow(doc, "Date cut", MARGIN + half + 40, y + 28);

  docFoot(doc, data, "Page 2 of 2");
}
