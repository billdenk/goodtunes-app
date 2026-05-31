// Faithful HTML/CSS recreation of the SHIPPED server-side GoodDeed® print PDF
// (server/goodDeedPrintTemplate.ts, PDFKit). Built ONLY to let Bill compare the
// printed certificate as-is vs. with the proposed GoodTunes-orange frame (the
// #FF7C06 edge-to-edge border that now ships on the digital share-card family).
//
// Geometry mirrors the PDF exactly: page 8.5x11" (Letter) / A4, inner mat
// 2250x2850 figpx ratio, square album art filling the mat width, navy brand-bg
// band underneath. The two paper sizes use the template's two DIFFERENT layout
// branches: Letter demotes the provenance to a bottom footnote with a fixed
// signature slot; A4 centres one roomy stack. All pt values are scaled by `s`.
import "./_group.css";

const ART = "/__mockup/images/album-california-way.png";
const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const SIG = "/__mockup/images/will-signature.png";

const NAVY = "var(--brand-bg)";
const ORANGE = "var(--brand-orange)";

type Paper = "letter" | "a4";
type Frame = "navy" | "orange" | "bordered";

const SAMPLE = {
  artist: "Fernando Perdomo",
  title: "Guitar as a Voice",
  genre: "ROCK",
  year: 2024,
  recipient: "Jordan Ellis",
  num: "12",
};

const headline = `This GoodDeed\u00AE certifies that ${SAMPLE.recipient} owns no. ${SAMPLE.num} of ${SAMPLE.title}.`;
const provenance =
  `Digital provenance can be confirmed by accessing the QR code on this GoodDeed\u00AE. ` +
  `In the event ownership was transferred after this certificate was issued, ` +
  `this GoodDeed\u00AE serves as the moment in time in which ${SAMPLE.recipient} possessed ` +
  `ownership of this good.`;
const subline = SAMPLE.genre
  ? `${SAMPLE.genre} \u2022 GOODTUNES RELEASE ${SAMPLE.year}`
  : `GOODTUNES RELEASE ${SAMPLE.year}`;

function dims(paper: Paper, matBoxIn?: [number, number]) {
  const W = paper === "a4" ? 595.28 : 612;
  const H = paper === "a4" ? 841.89 : 792;
  // matBoxIn (inches) lets the caller pin the cert content box (art + band) to a
  // FIXED real-world size centered on the sheet — used so the A4 cert fills a
  // chosen A4 mat opening with even margins (square album art + a taller navy
  // band) instead of using A4's native mat ratio. e.g. a 180x267mm opening on A4
  // = an even 15mm mount on all four sides.
  const matW = matBoxIn ? matBoxIn[0] * 72 : W * (2250 / 2550);
  const matH = matBoxIn ? matBoxIn[1] * 72 : H * (2850 / 3300);
  const matX = (W - matW) / 2;
  const matY = (H - matH) / 2;
  const artH = matW;
  const bandTop = matY + artH;
  const bandH = matH - artH;
  const figToPt = matW / 2250;
  return {
    W, H, matW, matH, matX, matY, artH, bandTop, bandH,
    bandPad: 14, figToPt,
    logoW: 154 * figToPt,
    qrSize: 180 * figToPt,
    thumbSize: 171 * figToPt,
  };
}

// A QR-code stand-in: white quiet zone + navy finder patterns + a deterministic
// module field, so the cert reads as "has a real QR" without encoding anything.
function QrFaux({ size }: { size: number }) {
  const N = 21;
  const cell = size / N;
  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) =>
      r >= br && r < br + 7 && c >= bc && c < bc + 7;
    const ring = (br: number, bc: number) => {
      const rr = r - br, cc = c - bc;
      const edge = rr === 0 || rr === 6 || cc === 0 || cc === 6;
      const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
      return edge || core;
    };
    if (inBox(0, 0)) return ring(0, 0);
    if (inBox(0, N - 7)) return ring(0, N - 7);
    if (inBox(N - 7, 0)) return ring(N - 7, 0);
    return null;
  };
  const cells: JSX.Element[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const f = isFinder(r, c);
      const on = f === null ? ((r * 7 + c * 13 + r * c) % 3 === 0) : f;
      if (on) {
        cells.push(
          <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={NAVY} />,
        );
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
      {cells}
    </svg>
  );
}

export function CertPrint({
  paper,
  frame,
  art,
  insetIn,
  bleedIn,
  frameRevealWin,
  layout,
  matBoxIn,
}: {
  paper: Paper;
  frame: Frame;
  art?: string;
  insetIn?: number;
  bleedIn?: number;
  // [widthIn, heightIn] of a real mat/frame window, drawn centered on the sheet
  // (NOT a uniform inset). e.g. [7.5, 9.5] = the 7.5"x9.5" mat opening.
  frameRevealWin?: [number, number];
  // Which layout BRANCH to use (Letter footnote stack vs A4 centered stack),
  // decoupled from the sheet size so an A4 sheet can carry the approved Letter
  // 7.5:9.5 cert. Defaults to `paper`.
  layout?: Paper;
  // Pin the cert content box (art + band) to a fixed real-world size, centered
  // on the sheet. See dims().
  matBoxIn?: [number, number];
}) {
  const artSrc = art ?? ART;
  const s = 0.72; // pt -> px display scale (same for both papers, so A4 reads taller/narrower)
  const d = dims(paper, matBoxIn);
  const px = (pt: number) => pt * s;

  // Border treatments:
  //  - navy     = ~9pt navy bleed border (the Bill-approved default)
  //  - orange   = prominent GoodTunes-orange bleed frame sitting AT the mat edge
  //  - bordered = inch-spec orange frame that comes `insetIn` INSIDE the mat and
  //    `bleedIn` OUTSIDE it. The art + band content shrink inward to kiss the
  //    inside of that frame, preserving today's padding off the new inner edge.
  const bordered = frame === "bordered";
  const insetPt = (insetIn ?? 0) * 72; // inches -> pt, how far content pulls in
  const borderPt = bordered ? (bleedIn ?? 0) * 72 : frame === "orange" ? 16 : 9;
  const frameColor = frame === "navy" ? NAVY : ORANGE;

  // Inset content box = origin for the art + band. insetPt = 0 leaves today's
  // layout byte-for-byte; band height stays invariant (matH - matW) so the text
  // never reflows — content just shifts in from the new inner frame edge.
  const cX = d.matX + insetPt;
  const cY = d.matY + insetPt;
  const cW = d.matW - insetPt * 2;
  const cArtH = cW;
  const cBandTop = cY + cArtH;
  const cBandH = d.matH - insetPt * 2 - cArtH;

  // Band-relative safe geometry (origin = band top-left at cX, cBandTop).
  const pad = d.bandPad;
  const safeTopRel = pad;
  const safeLeftRel = pad;
  const safeRightRel = cW - pad;
  const safeBottomRel = cBandH - pad;
  const qrColW = Math.max(d.qrSize, d.logoW);
  const qrColRightRel = safeRightRel;
  const qrColLeftRel = qrColRightRel - qrColW;
  const leftColLeftRel = safeLeftRel;
  const leftColRightRel = qrColLeftRel - 14;
  const leftColW = leftColRightRel - leftColLeftRel;

  const isA4 = (layout ?? paper) === "a4";

  // ── Right column (logo top, QR + caption bottom) — anchored to band edges on
  //    BOTH paper sizes, per the template.
  const rightColumn = (
    <>
      <img
        src={LOGO}
        alt="GoodTunes"
        style={{
          position: "absolute",
          left: px(qrColRightRel - d.logoW),
          top: px(safeTopRel),
          width: px(d.logoW),
          display: "block",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: px(qrColLeftRel),
          bottom: px(pad),
          width: px(qrColW),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ background: "#FFFFFF", padding: px(3), lineHeight: 0 }}>
          <QrFaux size={px(d.qrSize)} />
        </div>
        <span
          style={{
            color: "#FFFFFF",
            fontSize: px(7),
            marginTop: px(5),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          GoodDeed&reg;
        </span>
      </div>
    </>
  );

  // ── Avatar + artist/title/genre row (shared shape, sizes differ per branch).
  const avatarSize = isA4 ? d.thumbSize : d.thumbSize + 6;
  const titleRow = (
    <div style={{ display: "flex", alignItems: isA4 ? "flex-start" : "center", gap: px(10) }}>
      <div
        style={{
          width: px(avatarSize),
          height: px(avatarSize),
          borderRadius: "9999px",
          overflow: "hidden",
          flexShrink: 0,
          background: "#1A2052",
        }}
      >
        <img src={artSrc} alt={SAMPLE.artist} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#FFFFFF", fontSize: px(10), fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {SAMPLE.artist}
        </div>
        <div style={{ color: "#FFFFFF", fontSize: px(14), fontWeight: 700, fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {SAMPLE.title}
        </div>
        <div style={{ color: "#A6B2D6", fontSize: px(7), letterSpacing: px(0.6), fontFamily: "Helvetica, Arial, sans-serif", marginTop: px(2), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {subline}
        </div>
      </div>
    </div>
  );

  const headlineEl = (color: string) => (
    <div style={{ color, fontSize: px(9.5), fontWeight: 700, fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1.18 }}>
      {headline}
    </div>
  );
  const signatureBlock = (
    <div>
      <img src={SIG} alt="William E. Denk signature" style={{ width: px(110), display: "block" }} />
      <div style={{ color: "#FFFFFF", fontSize: px(6.5), fontFamily: "Helvetica, Arial, sans-serif", marginTop: px(2) }}>
        William E. Denk, CEO/Founder GoodTunes&reg;
      </div>
    </div>
  );

  // ── Letter geometry: headline + signature + footnote all indent to `bodyX`
  //    (the column under the artist name), and the signature sits at a FIXED
  //    slot ~1.6 line-heights below the headline top — matching the server's
  //    `sigY = headlineY + headLineH * 1.6` permanent slot (Bill-approved),
  //    not flowing with content. Mirrors server/goodDeedPrintTemplate.ts.
  const bodyXRel = leftColLeftRel + avatarSize + 10;
  const bodyW = leftColRightRel - bodyXRel;
  const headlineYRel = safeTopRel + avatarSize + 5;
  const headLineH = 9.5 * 1.15; // ≈ Helvetica-Bold 9.5pt currentLineHeight (1 line)
  const sigYRel = headlineYRel + headLineH * 1.0;
  // QR/footnote shared baseline: server pins the caption 11pt above the band
  // bottom and lands the footnote's last line on that same baseline.
  const captionBottomRel = 11;

  // ── Left content block — the ONE place the two paper layouts diverge.
  const leftBlock = isA4 ? (
    // A4: one vertically-centred stack across the taller band. Server centres
    // the measured stack and uses non-uniform gaps (title→headline 11,
    // headline→prov 3, prov→sig 6), so mirror those exact gaps here.
    <div
      style={{
        position: "absolute",
        left: px(leftColLeftRel),
        top: px(safeTopRel),
        width: px(leftColW),
        height: px(safeBottomRel - safeTopRel),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {titleRow}
      {/* Indent body to align with the text column (under "Fernando Perdomo"),
          i.e. past the avatar + its 10pt gap — not under the avatar itself. */}
      <div style={{ marginLeft: px(avatarSize + 10), marginTop: px(11) }}>{headlineEl("#FFFFFF")}</div>
      <div style={{ marginLeft: px(avatarSize + 10), marginTop: px(3), color: "#C7CFE8", fontSize: px(7.5), fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1.3 }}>
        {provenance}
      </div>
      <div style={{ marginLeft: px(avatarSize + 10), marginTop: px(6) }}>{signatureBlock}</div>
    </div>
  ) : (
    // Letter: title row top-left; headline + fixed signature slot indented to
    // bodyX under the artist name; provenance demoted to a bottom footnote
    // sharing the QR caption baseline.
    <>
      <div
        style={{
          position: "absolute",
          left: px(leftColLeftRel),
          top: px(safeTopRel),
          width: px(leftColW),
        }}
      >
        {titleRow}
      </div>
      <div
        style={{
          position: "absolute",
          left: px(bodyXRel),
          top: px(headlineYRel),
          width: px(bodyW),
          color: "#FFFFFF",
          fontSize: px(9.5),
          fontWeight: 700,
          fontFamily: "Helvetica, Arial, sans-serif",
          lineHeight: 1.15,
        }}
      >
        {headline}
      </div>
      <div style={{ position: "absolute", left: px(bodyXRel), top: px(sigYRel), width: px(bodyW) }}>
        {signatureBlock}
      </div>
      <div
        style={{
          position: "absolute",
          left: px(bodyXRel),
          bottom: px(captionBottomRel),
          width: px(bodyW),
          color: "#9AA6CC",
          fontSize: px(6),
          fontFamily: "Helvetica, Arial, sans-serif",
          lineHeight: 1.25,
        }}
      >
        {provenance}
      </div>
    </>
  );

  return (
    <div
      style={{
        position: "relative",
        width: px(d.W),
        height: px(d.H),
        background: "#FFFFFF",
        boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
        flexShrink: 0,
      }}
    >
      {/* Frame ring just outside the mat (navy bleed today / orange proposed). */}
      <div
        style={{
          position: "absolute",
          left: px(d.matX - borderPt),
          top: px(d.matY - borderPt),
          width: px(d.matW + borderPt * 2),
          height: px(d.matH + borderPt * 2),
          background: frameColor,
        }}
      />
      {/* Square album artwork filling the (inset) content width. */}
      <div style={{ position: "absolute", left: px(cX), top: px(cY), width: px(cW), height: px(cArtH), overflow: "hidden" }}>
        <img src={artSrc} alt={SAMPLE.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      {/* Navy band under the art. */}
      <div style={{ position: "absolute", left: px(cX), top: px(cBandTop), width: px(cW), height: px(cBandH), background: NAVY }}>
        {leftBlock}
        {rightColumn}
      </div>
      {/* TEMPORARY: dashed rectangle = a real mat/frame WINDOW (fixed size,
          centered), e.g. 7.5"x9.5". Everything OUTSIDE this window is hidden
          behind the mat/frame; only what's inside stays visible. */}
      {frameRevealWin != null && (
        <div
          style={{
            position: "absolute",
            left: px((d.W - frameRevealWin[0] * 72) / 2),
            top: px((d.H - frameRevealWin[1] * 72) / 2),
            width: px(frameRevealWin[0] * 72),
            height: px(frameRevealWin[1] * 72),
            border: "1px dashed #FF2D9B",
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

export function CertStage({
  paper,
  frame,
  art,
  insetIn,
  bleedIn,
  frameRevealWin,
  layout,
  matBoxIn,
}: {
  paper: Paper;
  frame: Frame;
  art?: string;
  insetIn?: number;
  bleedIn?: number;
  frameRevealWin?: [number, number];
  layout?: Paper;
  matBoxIn?: [number, number];
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#E9EBF0", padding: 28 }}
    >
      <CertPrint paper={paper} frame={frame} art={art} insetIn={insetIn} bleedIn={bleedIn} frameRevealWin={frameRevealWin} layout={layout} matBoxIn={matBoxIn} />
    </div>
  );
}
