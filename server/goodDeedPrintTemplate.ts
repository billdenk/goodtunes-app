// Task #551 — Locked GoodDeed print template.
//
// This is the ONE PDF generator used by both the fan-print path
// (/api/orders/:orderId/cert/pdf) and the press-print batch path
// (/api/admin/albums/:id/cert-batch/pdf). For the same inputs
// `{ albumId, sequenceNumber, recipientName, qrPayload, paperSize }`
// the bytes are identical regardless of which surface kicked it off —
// the fan sees the same artifact the press prints, and the post-sale
// digital download matches the physical cert the fan unwraps.
//
// Layout matches the Figma spec at
// https://www.figma.com/design/uE9OTQXsIpHzDjkTlAHOdJ?node-id=506-148490
// (Bill, May 2026):
//   * Letter 8.5×11" page, white mat with margins on ALL four sides
//     (no bleed past the mat — artwork and dark band both live inside).
//   * Inner mat ≈ 7.5×9.5" (2250×2850 figpx ÷ 300 dpi).
//   * Square album art fills the mat width; remaining height under the
//     square is the dark navy band.
//   * Inside the dark band: circular artist thumb + artist/title/genre
//     on the left, GoodTunes logo top-right + QR + "GoodDeed®" caption
//     bottom-right, certifying paragraph + signature spanning the
//     middle.
//
// Callers MUST NOT build their own pdfkit doc and start drawing
// cert chrome — go through renderGoodDeedPdf() or
// renderGoodDeedBatchPdf().

import PDFDocument from "pdfkit";
// qrcode ships no bundled types; same pattern as server/auth/totp.ts.
// @ts-ignore
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { albums } from "@shared/schema";

const SIGNATURE_ASSET = path.resolve(
  process.cwd(),
  "attached_assets",
  "signature-GoodDeed_1779414807544.png",
);
const LOGO_ASSET = path.resolve(
  process.cwd(),
  "attached_assets",
  "2025_GoodTunes_Logo-icon-dark-02_1778271548074.png",
);
const LOGO_ASPECT = 2722 / 4500; // h/w from the source PNG
const SIG_ASPECT = 254 / 1048;

// ─── Public input type ───────────────────────────────────────────────
export type GoodDeedPrintInputs = {
  albumId: string;
  sequenceNumber: number | null; // GoodDeed # — null falls back to qrPayload tail
  recipientName: string;
  qrPayload: string; // full URL — what the QR encodes
  paperSize: "letter" | "a4";
};

// Resolved album fields the template needs. Snapshotted so a downstream
// album rename can't quietly mutate an already-printed cert.
export type GoodDeedAlbumSnapshot = {
  title: string;
  artist: string;
  genre: string | null;
  year: number | null;
  artwork: string | null;
};

// ─── Layout ──────────────────────────────────────────────────────────
// Figma spec: page 2550×3300 figpx, inner mat 2250×2850 figpx, art
// 2250×2250 figpx (square), dark band fills the remaining 2250×600
// figpx under the square. We hold the same ratios on Letter (612×792
// pt) and A4 (595.28×841.89 pt) so the spec is paper-size agnostic.
type LayoutDims = {
  W: number; H: number;
  matW: number; matH: number;
  matX: number; matY: number;
  artH: number;        // square art height (= matW)
  bandTop: number;     // y of dark band top (within page)
  bandH: number;       // dark band height
  bandPad: number;     // inner safe padding inside dark band
};

function layoutFor(paperSize: "letter" | "a4"): LayoutDims {
  const W = paperSize === "a4" ? 595.28 : 612;
  const H = paperSize === "a4" ? 841.89 : 792;
  // 2250/2550 wide × 2850/3300 tall — matches Figma exactly on Letter.
  const matW = W * (2250 / 2550);
  const matH = H * (2850 / 3300);
  const matX = (W - matW) / 2;
  const matY = (H - matH) / 2;
  const artH = matW;                  // square art = mat width
  const bandTop = matY + artH;
  const bandH = matH - artH;
  return { W, H, matW, matH, matX, matY, artH, bandTop, bandH, bandPad: 14 };
}

// ─── Helpers ─────────────────────────────────────────────────────────
async function fetchArtworkBytes(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const full = /^https?:\/\//.test(url)
      ? url
      : `http://127.0.0.1:${process.env.PORT ?? 5000}${url.startsWith("/") ? "" : "/"}${url}`;
    const r = await fetch(full);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadAlbumSnapshot(albumId: string): Promise<GoodDeedAlbumSnapshot | null> {
  const [a] = await db.select().from(albums).where(eq(albums.id, albumId));
  if (!a) return null;
  const year =
    a.year ?? (a.goodTunesReleaseDate ? Number(a.goodTunesReleaseDate.slice(0, 4)) : null);
  return {
    title: a.title,
    artist: a.artist,
    genre: a.genre ?? null,
    year: Number.isFinite(year as any) ? (year as number) : null,
    artwork: a.artwork ?? null,
  };
}

// ─── Core drawing routine ────────────────────────────────────────────
// Draws one GoodDeed onto an already-added page of `doc`. The page MUST
// have been added at the matching paper size before this is called.
async function drawGoodDeedOnto(
  doc: PDFKit.PDFDocument,
  inputs: GoodDeedPrintInputs,
  album: GoodDeedAlbumSnapshot,
  artBytes: Buffer | null,
): Promise<void> {
  const L = layoutFor(inputs.paperSize);

  // ── Page background = white (paper). Mat margins are just that
  //    background showing through — nothing else to draw on the
  //    outer rim. The Figma spec keeps the print well inside an
  //    8×10 frame mat.
  doc.save();
  doc.rect(0, 0, L.W, L.H).fill("#FFFFFF");
  doc.restore();

  // ── Square album artwork inside the mat (no bleed) ──
  if (artBytes) {
    try {
      doc.image(artBytes, L.matX, L.matY, {
        cover: [L.matW, L.artH],
        align: "center",
        valign: "center",
      });
    } catch {
      doc.rect(L.matX, L.matY, L.matW, L.artH).fill("#EEEEEE");
    }
  } else {
    doc.rect(L.matX, L.matY, L.matW, L.artH).fill("#EEEEEE");
  }

  // ── Dark band, contained within the mat ──
  doc.save();
  doc.rect(L.matX, L.bandTop, L.matW, L.bandH).fill("#00062B");
  doc.restore();

  const safeLeft   = L.matX  + L.bandPad;
  const safeRight  = L.matX  + L.matW - L.bandPad;
  const safeTop    = L.bandTop + L.bandPad;
  const safeBottom = L.bandTop + L.bandH - L.bandPad;
  const colWidth   = safeRight - safeLeft;

  // ── Right column: GoodTunes logo (top), QR + "GoodDeed®" label
  //    (bottom). Figma sizes: logo 154×93 figpx, QR 180×180 figpx,
  //    label 30 figpx tall, all within a 191-figpx-wide column.
  const figToPt = L.matW / 2250;
  const logoW   = 154 * figToPt;
  const logoH   = logoW * LOGO_ASPECT;
  const qrSize  = 60 * figToPt * 3;        // ≈ 43pt on letter — matches 180 figpx
  const qrColW  = Math.max(qrSize, logoW);
  const qrColRight = safeRight;
  const qrColLeft  = qrColRight - qrColW;

  // Logo top-right
  if (fs.existsSync(LOGO_ASSET)) {
    try {
      doc.image(LOGO_ASSET, qrColRight - logoW, safeTop, { width: logoW });
    } catch {}
  }

  // QR bottom-right with a small white frame and "GoodDeed®" label
  //    beneath it (caption hugs the bottom safe edge).
  const labelH  = 9;
  const qrX     = qrColRight - qrSize;
  const qrY     = safeBottom - qrSize - labelH - 2;
  doc.save();
  doc.rect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6).fill("#FFFFFF");
  doc.restore();
  try {
    const qrPng = await QRCode.toBuffer(inputs.qrPayload, {
      margin: 0,
      width: 480,
      color: { dark: "#00062B", light: "#FFFFFF" },
    });
    doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });
  } catch {}
  doc.font("Helvetica").fontSize(7).fillColor("#FFFFFF").text(
    "GoodDeed\u00AE",
    qrColLeft, qrY + qrSize + 4,
    { width: qrColW, align: "center", lineBreak: false },
  );

  // ── Left content column ──
  const leftColLeft  = safeLeft;
  const leftColRight = qrColLeft - 14;
  const leftColW     = leftColRight - leftColLeft;

  // Circular avatar (artist thumb) + artist/title/genre block to its
  // right. Figma sizes: thumb 171 figpx, artist row baseline at the
  // top of the band's safe area.
  const thumbSize = 171 * figToPt;       // ≈ 41pt on letter
  const thumbX = leftColLeft;
  const thumbY = safeTop;
  doc.save();
  doc.circle(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2).clip();
  if (artBytes) {
    try {
      doc.image(artBytes, thumbX, thumbY, { cover: [thumbSize, thumbSize] });
    } catch {
      doc.rect(thumbX, thumbY, thumbSize, thumbSize).fill("#1A2052");
    }
  } else {
    doc.rect(thumbX, thumbY, thumbSize, thumbSize).fill("#1A2052");
  }
  doc.restore();

  const titleX = thumbX + thumbSize + 10;
  const titleW = leftColRight - titleX;

  doc.font("Helvetica").fontSize(10).fillColor("#FFFFFF").text(
    album.artist, titleX, thumbY + 1,
    { width: titleW, lineBreak: false, ellipsis: true },
  );
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#FFFFFF").text(
    album.title, titleX, thumbY + 13,
    { width: titleW, lineBreak: false, ellipsis: true },
  );
  const subPieces: string[] = [];
  if (album.genre) subPieces.push(album.genre.toUpperCase());
  subPieces.push(album.year ? `GOODTUNES RELEASE ${album.year}` : "GOODTUNES RELEASE");
  doc.font("Helvetica").fontSize(7).fillColor("#A6B2D6").text(
    subPieces.join("\u2022"), titleX, thumbY + 29,
    { width: titleW, characterSpacing: 0.6, lineBreak: false, ellipsis: true },
  );

  // ── Certifying paragraph block (spans full band width below the
  //    title row so long fan names + long album titles don't crowd
  //    the QR). Figma anchors this at ~y=2467 figpx page-relative,
  //    which is ~67pt below the band top on letter.
  const fanName = inputs.recipientName?.trim() || "GoodTunes Fan";
  const goodDeedNum =
    inputs.sequenceNumber != null
      ? String(inputs.sequenceNumber)
      : (inputs.qrPayload.split("/").pop() ?? "").toUpperCase();
  const headlineY = thumbY + thumbSize + 8;

  const headline = `This GoodDeed\u00AE certifies that ${fanName} owns no. ${goodDeedNum} of ${album.title}.`;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#FFFFFF").text(
    headline, leftColLeft, headlineY,
    { width: colWidth, lineGap: 1 },
  );
  const provenanceY = doc.y + 3;
  const provenance =
    `Digital provenance can be confirmed by accessing the QR code on this GoodDeed\u00AE. ` +
    `In the event that ownership has been transferred since this certificate was issued, ` +
    `this GoodDeed\u00AE will serve as the moment in time in which ${fanName} possessed ` +
    `ownership of this good.`;
  doc.font("Helvetica").fontSize(7.5).fillColor("#C7CFE8").text(
    provenance, leftColLeft, provenanceY,
    { width: colWidth, lineGap: 1.2 },
  );

  // ── Signature + founder line, bottom-left ──
  const sigW = Math.min(110, leftColW * 0.42);
  const sigH = sigW * SIG_ASPECT;
  const founderH = 8;
  const sigY = safeBottom - sigH - founderH - 2;
  if (fs.existsSync(SIGNATURE_ASSET)) {
    try { doc.image(SIGNATURE_ASSET, leftColLeft, sigY, { width: sigW }); } catch {}
  }
  doc.font("Helvetica").fontSize(6.5).fillColor("#FFFFFF").text(
    "William E. Denk, CEO/Founder GoodTunes\u00AE",
    leftColLeft, sigY + sigH + 1,
    { width: leftColW, lineBreak: false },
  );
}

// ─── Public API ──────────────────────────────────────────────────────

// Render ONE GoodDeed as a single-page PDF Buffer.
export async function renderGoodDeedPdf(inputs: GoodDeedPrintInputs): Promise<Buffer> {
  const album = await loadAlbumSnapshot(inputs.albumId);
  if (!album) throw new Error(`Album not found: ${inputs.albumId}`);
  const artBytes = await fetchArtworkBytes(album.artwork);
  const size = inputs.paperSize === "a4" ? "A4" : "LETTER";
  const doc = new PDFDocument({ size, margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  await drawGoodDeedOnto(doc, inputs, album, artBytes);
  doc.end();
  return done;
}

// Render N GoodDeeds as one multipage PDF, in the order callers pass
// them (callers MUST sort by sequenceNumber before invoking — the
// press-print path does so).
export async function renderGoodDeedBatchPdf(items: GoodDeedPrintInputs[]): Promise<Buffer> {
  if (items.length === 0) throw new Error("renderGoodDeedBatchPdf: no items");

  // Snapshot albums + artwork up front. Two items for the same album
  // re-use the same fetch.
  const albumCache = new Map<string, GoodDeedAlbumSnapshot>();
  const artCache = new Map<string, Buffer | null>();
  for (const it of items) {
    if (!albumCache.has(it.albumId)) {
      const a = await loadAlbumSnapshot(it.albumId);
      if (!a) throw new Error(`Album not found: ${it.albumId}`);
      albumCache.set(it.albumId, a);
      artCache.set(it.albumId, await fetchArtworkBytes(a.artwork));
    }
  }

  const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  for (const it of items) {
    doc.addPage({ size: it.paperSize === "a4" ? "A4" : "LETTER", margin: 0 });
    await drawGoodDeedOnto(doc, it, albumCache.get(it.albumId)!, artCache.get(it.albumId) ?? null);
  }
  doc.end();
  return done;
}

// Re-export so the legacy certificates.ts callers can still draw onto
// a doc they own (admin print-queue batch-download mixes paper sizes
// per cert and assembles the merged doc itself).
export async function drawGoodDeedPageOnto(
  doc: PDFKit.PDFDocument,
  inputs: GoodDeedPrintInputs,
): Promise<void> {
  const album = await loadAlbumSnapshot(inputs.albumId);
  if (!album) throw new Error(`Album not found: ${inputs.albumId}`);
  const artBytes = await fetchArtworkBytes(album.artwork);
  await drawGoodDeedOnto(doc, inputs, album, artBytes);
}
