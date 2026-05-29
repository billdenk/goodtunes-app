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
import { albums, people } from "@shared/schema";

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
  // The primary artist's profile photo — shown in the circular avatar to
  // the left of the artist/title block. Falls back to the album artwork
  // when the album has no linked artist (or that artist has no photo).
  artistPhoto: string | null;
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
  // Pull the primary artist's profile photo for the avatar circle. The
  // `artist` text column stays canonical for the name; the photo just
  // dresses the cert. No linked artist (or no photo) → null, and the
  // template falls back to the album artwork.
  let artistPhoto: string | null = null;
  if (a.primaryArtistId) {
    const [p] = await db
      .select({ photoUrl: people.photoUrl })
      .from(people)
      .where(eq(people.id, a.primaryArtistId));
    artistPhoto = p?.photoUrl ?? null;
  }
  return {
    title: a.title,
    artist: a.artist,
    genre: a.genre ?? null,
    year: Number.isFinite(year as any) ? (year as number) : null,
    artwork: a.artwork ?? null,
    artistPhoto,
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
  avatarBytes: Buffer | null,
  sigPlacement: "dynamic" | "fixed" = "fixed",
  matBorderPt = 9, // ⅛" navy bleed border (Bill-approved default)
  forceNewLayout = false, // preview: run the new (Letter) layout even on A4
): Promise<void> {
  const L = layoutFor(inputs.paperSize);

  // ── Page background = white (paper). Mat margins are just that
  //    background showing through — nothing else to draw on the
  //    outer rim. The Figma spec keeps the print well inside an
  //    8×10 frame mat.
  doc.save();
  doc.rect(0, 0, L.W, L.H).fill("#FFFFFF");
  doc.restore();

  // ── Optional navy bleed border just OUTSIDE the mat opening. The mat
  //    window is sized exactly to the inner design (7.5"×9.5" on Letter),
  //    so a frame that's even slightly off-centre could reveal a sliver of
  //    white paper at an edge. Painting a band of the band-navy (#00062B)
  //    beyond the mat edge builds in `matBorderPt` of misalignment
  //    tolerance for quick framing. The inner design is UNCHANGED — this
  //    only fills what was previously white margin, behind the art + band.
  if (matBorderPt > 0) {
    doc.save();
    doc.rect(
      L.matX - matBorderPt,
      L.matY - matBorderPt,
      L.matW + matBorderPt * 2,
      L.matH + matBorderPt * 2,
    ).fill("#00062B");
    doc.restore();
  }

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

  // ── Right-column geometry (logo top, QR bottom). Figma sizes: logo
  //    154×93 figpx, QR 180×180 figpx, within a ~191-figpx-wide column.
  const figToPt = L.matW / 2250;
  const logoW   = 154 * figToPt;
  const qrSize  = 60 * figToPt * 3;        // ≈ 43pt on letter — matches 180 figpx
  const qrColW  = Math.max(qrSize, logoW);
  const qrColRight = safeRight;
  const qrColLeft  = qrColRight - qrColW;

  // ── Left content column ──
  const leftColLeft  = safeLeft;
  const leftColRight = qrColLeft - 14;
  const leftColW     = leftColRight - leftColLeft;

  // ── Compose the dark-band content as ONE vertically-centred block.
  //    A4's band is taller than Letter's, so anchoring the title row to
  //    the top and the signature to the bottom pooled all the slack in
  //    the middle (Bill, May 2026). Instead we measure the natural stack
  //    height and split the leftover space evenly above/below — nudging
  //    the title group down and lifting the signature up on A4 while
  //    leaving the tight Letter band essentially unchanged.
  const thumbSize    = 171 * figToPt;    // ≈ 41pt on letter
  const titleGap     = 11;               // title row → headline
  const headlineGap  = 3;                // headline → provenance
  // Letter's dark band is too short for the full stack, so the signature
  // block would otherwise sit at the very bottom edge and risk being
  // clipped by the physical mat. On Letter, tuck the signature right up
  // under the provenance ("kiss" it) to lift the name off the bottom; A4
  // has slack to spare so it keeps the roomier gap (Bill, May 2026).
  const provToSigGap = inputs.paperSize === "a4" ? 6 : 1;
  const founderH     = 8;
  const sigW = Math.min(110, leftColW * 0.42);
  const sigH = sigW * SIG_ASPECT;

  const fanName = inputs.recipientName?.trim() || "GoodTunes Fan";
  const goodDeedNum =
    inputs.sequenceNumber != null
      ? String(inputs.sequenceNumber)
      : (inputs.qrPayload.split("/").pop() ?? "").toUpperCase();
  const headline = `This GoodDeed\u00AE certifies that ${fanName} owns no. ${goodDeedNum} of ${album.title}.`;
  // Control where line 2 of the footnote begins via non-breaking spaces:
  //   • A4    → glue "certificate was" so line 2 reads "certificate was issued…"
  //   • Letter→ glue "was issued" so "certificate" ends line 1 and line 2 reads
  //     "was issued…" (Bill, May 2026: a touch more breathing room by the QR).
  const provWrap =
    inputs.paperSize === "a4"
      ? `after this certificate\u00A0was issued, `
      : `after this certificate was\u00A0issued, `;
  const provenance =
    `Digital provenance can be confirmed by accessing the QR code on this GoodDeed\u00AE. ` +
    `In the event ownership was transferred ${provWrap}` +
    `this GoodDeed\u00AE serves as the moment in time in which ${fanName} possessed ` +
    `ownership of this good.`;

  // Measure wrapped heights with the EXACT fonts we draw with so the
  // centring math accounts for long names wrapping to extra lines.
  doc.font("Helvetica-Bold").fontSize(9.5);
  const hHeadline = doc.heightOfString(headline, { width: leftColW, lineGap: 1 });
  doc.font("Helvetica").fontSize(7.5);
  const hProv = doc.heightOfString(provenance, { width: leftColW, lineGap: 1.2 });

  const stackH =
    thumbSize + titleGap + hHeadline + headlineGap + hProv + provToSigGap + sigH + founderH;
  const slack = (safeBottom - safeTop) - stackH;
  const blockTop = safeTop + (slack > 0 ? slack / 2 : 0);

  // ── Logo: top-right, pinned to the band's top safe edge. The right
  //    column (logo + QR + label) stays anchored to the band edges
  //    regardless of paper size — only the LEFT content block centres
  //    on A4 (Bill, May 2026: don't move the logo/QR on A4). ──
  if (fs.existsSync(LOGO_ASSET)) {
    try {
      doc.image(LOGO_ASSET, qrColRight - logoW, safeTop, { width: logoW });
    } catch {}
  }

  const avatarImg = avatarBytes ?? artBytes;

  if (inputs.paperSize === "a4" && !forceNewLayout) {
    // ===== A4: one vertically-centred stack (unchanged) =====
    // ── Circular avatar (artist photo, falling back to album art) +
    //    artist / title / genre block to its right. ──
    const thumbX = leftColLeft;
    const thumbY = blockTop;
    doc.save();
    doc.circle(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2).clip();
    if (avatarImg) {
      try {
        doc.image(avatarImg, thumbX, thumbY, { cover: [thumbSize, thumbSize] });
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
      album.title, titleX, thumbY + 16,
      { width: titleW, lineBreak: false, ellipsis: true },
    );
    const subPieces: string[] = [];
    if (album.genre) subPieces.push(album.genre.toUpperCase());
    subPieces.push(album.year ? `GOODTUNES RELEASE ${album.year}` : "GOODTUNES RELEASE");
    doc.font("Helvetica").fontSize(7).fillColor("#A6B2D6").text(
      subPieces.join(" \u2022 "), titleX, thumbY + 33,
      { width: titleW, characterSpacing: 0.6, lineBreak: false, ellipsis: true },
    );

    // ── Certifying headline + provenance paragraph (constrained to the
    //    left column so they never run under the QR/logo column). ──
    const headlineY = blockTop + thumbSize + titleGap;
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#FFFFFF").text(
      headline, leftColLeft, headlineY,
      { width: leftColW, lineGap: 1 },
    );
    const provenanceY = headlineY + hHeadline + headlineGap;
    doc.font("Helvetica").fontSize(7.5).fillColor("#C7CFE8").text(
      provenance, leftColLeft, provenanceY,
      { width: leftColW, lineGap: 1.2 },
    );

    // ── Signature + founder line (sits just under the paragraph) ──
    const sigY = provenanceY + hProv + provToSigGap;
    if (fs.existsSync(SIGNATURE_ASSET)) {
      try { doc.image(SIGNATURE_ASSET, leftColLeft, sigY, { width: sigW }); } catch {}
    }
    doc.font("Helvetica").fontSize(6.5).fillColor("#FFFFFF").text(
      "William E. Denk, CEO/Founder GoodTunes\u00AE",
      leftColLeft, sigY + sigH + 1,
      { width: leftColW, lineBreak: false },
    );

    // ── QR + "GoodDeed®" label: bottom-right, pinned to the band's
    //    bottom safe edge (caption hugs the bottom). ──
    const labelH  = 12;
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
      qrColLeft, qrY + qrSize + 7,
      { width: qrColW, align: "center", lineBreak: false },
    );
  } else {
    // ===== Letter: body left-aligned/indented under the artist block, =====
    //       signature tucked beneath the headline, and the provenance
    //       demoted to a small footnote that shares the bottom baseline
    //       with the QR caption (Bill, May 2026 mock-up).
    //
    // 1) Slightly larger avatar so it reads above the artist name and
    //    below the genre line.
    const avatarSize = thumbSize + 6;
    const avatarX = leftColLeft;
    // A4 has a taller band, so pull the whole left content block (avatar →
    // founder line) down to start roughly where the genre line ("NEW AGE
    // PUNK…") sat, closing the empty navy gap above the footnote (Bill, A4).
    // Letter's band is tight, so it stays anchored to the top safe edge.
    const contentShift = inputs.paperSize === "a4" ? 36 : 0;
    const avatarTop = safeTop + contentShift;
    doc.save();
    doc.circle(avatarX + avatarSize / 2, avatarTop + avatarSize / 2, avatarSize / 2).clip();
    if (avatarImg) {
      try {
        doc.image(avatarImg, avatarX, avatarTop, { cover: [avatarSize, avatarSize] });
      } catch {
        doc.rect(avatarX, avatarTop, avatarSize, avatarSize).fill("#1A2052");
      }
    } else {
      doc.rect(avatarX, avatarTop, avatarSize, avatarSize).fill("#1A2052");
    }
    doc.restore();

    // Artist / title / genre, vertically centred against the taller avatar.
    const bodyX = avatarX + avatarSize + 10;
    const bodyW = leftColRight - bodyX;
    const textShift = 3;
    doc.font("Helvetica").fontSize(10).fillColor("#FFFFFF").text(
      album.artist, bodyX, avatarTop + 1 + textShift,
      { width: bodyW, lineBreak: false, ellipsis: true },
    );
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#FFFFFF").text(
      album.title, bodyX, avatarTop + 16 + textShift,
      { width: bodyW, lineBreak: false, ellipsis: true },
    );
    const subPieces: string[] = [];
    if (album.genre) subPieces.push(album.genre.toUpperCase());
    subPieces.push(album.year ? `GOODTUNES RELEASE ${album.year}` : "GOODTUNES RELEASE");
    doc.font("Helvetica").fontSize(7).fillColor("#A6B2D6").text(
      subPieces.join(" \u2022 "), bodyX, avatarTop + 33 + textShift,
      { width: bodyW, characterSpacing: 0.6, lineBreak: false, ellipsis: true },
    );

    // 2) Certifying headline, indented to align under the artist name.
    //    Shrink it just enough to hold one line before allowing a wrap.
    let headFont = 9.5;
    doc.font("Helvetica-Bold").fontSize(headFont);
    while (headFont > 8 && doc.widthOfString(headline) > bodyW) {
      headFont -= 0.25;
      doc.fontSize(headFont);
    }
    const headOneLine = doc.widthOfString(headline) <= bodyW;
    const headlineY = avatarTop + avatarSize + 5;
    const headLineH = doc.currentLineHeight();
    const hHeadlineL = headOneLine
      ? headLineH
      : doc.heightOfString(headline, { width: bodyW, lineGap: 1 });
    doc.font("Helvetica-Bold").fontSize(headFont).fillColor("#FFFFFF").text(
      headline, bodyX, headlineY,
      headOneLine ? { width: bodyW, lineBreak: false } : { width: bodyW, lineGap: 1 },
    );

    // 3) Signature at its full size. Bill approved the "fixed" placement:
    //    the signature sits at a permanent slot a fixed ~1.6 lines below the
    //    headline TOP (which never moves), so it always lands in the same
    //    spot — just above the "William E. Denk" name line, like a real
    //    signature block — whether the headline is one line or wraps to two.
    //    - "dynamic" (kept for comparison only): the signature follows the
    //      headline bottom, so a wrapped second line pushes it down.
    const sigWl = 110;
    const sigHl = sigWl * SIG_ASPECT;
    const sigY =
      sigPlacement === "fixed"
        ? headlineY + headLineH * 1.6
        : headlineY + hHeadlineL;
    if (fs.existsSync(SIGNATURE_ASSET)) {
      try { doc.image(SIGNATURE_ASSET, bodyX, sigY, { width: sigWl }); } catch {}
    }
    doc.font("Helvetica").fontSize(6.5).fillColor("#FFFFFF").text(
      "William E. Denk, CEO/Founder GoodTunes\u00AE",
      bodyX, sigY + sigHl + 1,
      { width: bodyW, lineBreak: false },
    );

    // 4) Provenance footnote: full body width so it holds two lines
    //    (ending just past the headline), pushed down toward the band's
    //    bottom edge for breathing room beneath the signature block.
    const bandBottom = L.bandTop + L.bandH;
    const footFont = 6;
    const footW = bodyW;
    doc.font("Helvetica").fontSize(footFont);
    const footFontMetrics = (doc as any)._font;
    const footAscRatio = (footFontMetrics?.ascender ?? 718) / 1000;
    // The QR + "GoodDeed®" caption lock-up is anchored a fixed 11pt above the
    // band's bottom edge (the spot Bill likes), and the provenance footnote is
    // then positioned so the baseline of its LAST line sits exactly on that
    // same caption baseline (Bill, May 2026: align the two baselines).
    const captionBaseline = bandBottom - 11;
    // Distance from a line's baseline down to the bottom of its text box, using
    // PDFKit's real metrics: each line advances by currentLineHeight(true) PLUS
    // the option lineGap (1), and the first baseline sits one ascent below the
    // box top — so the last baseline is (ascent) above (box bottom − that gap).
    const footLineGap = 1;
    const footDescentBelow =
      doc.currentLineHeight(true) + footLineGap - footAscRatio * footFont;
    const hFoot = doc.heightOfString(provenance, { width: footW, lineGap: footLineGap });
    // Place the box so its last line's baseline lands on captionBaseline.
    const footY = captionBaseline - (hFoot - footDescentBelow);
    doc.fillColor("#9AA6CC").text(
      provenance, bodyX, footY,
      { width: footW, lineGap: footLineGap },
    );

    // 5) The QR + "GoodDeed®" caption lock-up, its caption baseline sitting on
    //    the footnote's last-line baseline (captionBaseline) with a constant gap
    //    up to the QR above it.
    const labelFont = 7;
    doc.font("Helvetica").fontSize(labelFont);
    const labelAscRatio = ((doc as any)._font?.ascender ?? 718) / 1000;
    const labelY = captionBaseline - labelAscRatio * labelFont;
    const qrY = labelY - 9 - qrSize;
    const qrX = qrColRight - qrSize;
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
    doc.font("Helvetica").fontSize(labelFont).fillColor("#FFFFFF").text(
      "GoodDeed\u00AE",
      qrColLeft, labelY,
      { width: qrColW, align: "center", lineBreak: false },
    );
  }
}

// ─── Public API ──────────────────────────────────────────────────────

// Render ONE GoodDeed as a single-page PDF Buffer. `opts.sigPlacement`
// is a layout knob (default "dynamic") used by the sample generator to
// preview the fixed-vs-dynamic signature slot; production callers omit it.
export async function renderGoodDeedPdf(
  inputs: GoodDeedPrintInputs,
  opts?: { sigPlacement?: "dynamic" | "fixed"; matBorderPt?: number; forceNewLayout?: boolean },
): Promise<Buffer> {
  const album = await loadAlbumSnapshot(inputs.albumId);
  if (!album) throw new Error(`Album not found: ${inputs.albumId}`);
  const artBytes = await fetchArtworkBytes(album.artwork);
  const avatarBytes = await fetchArtworkBytes(album.artistPhoto);
  const size = inputs.paperSize === "a4" ? "A4" : "LETTER";
  const doc = new PDFDocument({ size, margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  await drawGoodDeedOnto(doc, inputs, album, artBytes, avatarBytes, opts?.sigPlacement ?? "fixed", opts?.matBorderPt ?? 9, opts?.forceNewLayout ?? false);
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
  const avatarCache = new Map<string, Buffer | null>();
  for (const it of items) {
    if (!albumCache.has(it.albumId)) {
      const a = await loadAlbumSnapshot(it.albumId);
      if (!a) throw new Error(`Album not found: ${it.albumId}`);
      albumCache.set(it.albumId, a);
      artCache.set(it.albumId, await fetchArtworkBytes(a.artwork));
      avatarCache.set(it.albumId, await fetchArtworkBytes(a.artistPhoto));
    }
  }

  const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  for (const it of items) {
    doc.addPage({ size: it.paperSize === "a4" ? "A4" : "LETTER", margin: 0 });
    await drawGoodDeedOnto(
      doc,
      it,
      albumCache.get(it.albumId)!,
      artCache.get(it.albumId) ?? null,
      avatarCache.get(it.albumId) ?? null,
    );
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
  const avatarBytes = await fetchArtworkBytes(album.artistPhoto);
  await drawGoodDeedOnto(doc, inputs, album, artBytes, avatarBytes);
}
