// Faithful HTML/CSS recreation of the SHIPPED server-side GoodDeed® print PDF
// (server/goodDeedPrintTemplate.ts, PDFKit). Built ONLY to let Bill compare the
// printed certificate as-is vs. with the proposed GoodTunes-orange frame (the
// #FF7C06 edge-to-edge border that now ships on the digital share-card family).
//
// Geometry mirrors the PDF exactly: page 8.5x11" (Letter) / A4, inner mat
// 2250x2850 figpx ratio, square album art filling the mat width, navy #00062B
// band underneath. The two paper sizes use the template's two DIFFERENT layout
// branches: Letter demotes the provenance to a bottom footnote with a fixed
// signature slot; A4 centres one roomy stack. All pt values are scaled by `s`.
import "./_group.css";

const ART = "/__mockup/images/album-california-way.png";
const AVATAR = "/__mockup/images/sample-owner-photo.png";
const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const SIG = "/__mockup/images/will-signature.png";

const NAVY = "#00062B";
const ORANGE = "var(--brand-orange)";

type Paper = "letter" | "a4";
type Frame = "navy" | "orange";

const SAMPLE = {
  artist: "TOMMYGUNN",
  title: "California Way",
  genre: "NEW AGE PUNK",
  year: 2025,
  recipient: "Jordan Ellis",
  num: "12",
};

const headline = `This GoodDeed\u00AE certifies that ${SAMPLE.recipient} owns no. ${SAMPLE.num} of ${SAMPLE.title}.`;
const provenance =
  `Digital provenance can be confirmed by accessing the QR code on this GoodDeed\u00AE. ` +
  `In the event ownership was transferred after this certificate was issued, ` +
  `this GoodDeed\u00AE serves as the moment in time in which ${SAMPLE.recipient} possessed ` +
  `ownership of this good.`;
const subline = `${SAMPLE.genre} \u2022 GOODTUNES RELEASE ${SAMPLE.year}`;

function dims(paper: Paper) {
  const W = paper === "a4" ? 595.28 : 612;
  const H = paper === "a4" ? 841.89 : 792;
  const matW = W * (2250 / 2550);
  const matH = H * (2850 / 3300);
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

export function CertPrint({ paper, frame }: { paper: Paper; frame: Frame }) {
  const s = 0.72; // pt -> px display scale (same for both papers, so A4 reads taller/narrower)
  const d = dims(paper);
  const px = (pt: number) => pt * s;

  // Current = ~9pt navy bleed border (the Bill-approved default). Proposed =
  // a prominent GoodTunes-orange frame that echoes the digital share-card set.
  const borderPt = frame === "orange" ? 16 : 9;
  const frameColor = frame === "orange" ? ORANGE : NAVY;

  // Band-relative safe geometry (origin = band top-left at matX, bandTop).
  const pad = d.bandPad;
  const safeTopRel = pad;
  const safeLeftRel = pad;
  const safeRightRel = d.matW - pad;
  const safeBottomRel = d.bandH - pad;
  const qrColW = Math.max(d.qrSize, d.logoW);
  const qrColRightRel = safeRightRel;
  const qrColLeftRel = qrColRightRel - qrColW;
  const leftColLeftRel = safeLeftRel;
  const leftColRightRel = qrColLeftRel - 14;
  const leftColW = leftColRightRel - leftColLeftRel;

  const isA4 = paper === "a4";

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
        <img src={AVATAR} alt={SAMPLE.artist} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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

  // ── Left content block — the ONE place the two paper layouts diverge.
  const leftBlock = isA4 ? (
    // A4: one vertically-centred stack across the taller band.
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
        gap: px(8),
      }}
    >
      {titleRow}
      {headlineEl("#FFFFFF")}
      <div style={{ color: "#C7CFE8", fontSize: px(7.5), fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1.3 }}>
        {provenance}
      </div>
      {signatureBlock}
    </div>
  ) : (
    // Letter: top-anchored title + headline + fixed signature slot; provenance
    // demoted to a small bottom footnote that shares the QR caption's baseline.
    <>
      <div
        style={{
          position: "absolute",
          left: px(leftColLeftRel),
          top: px(safeTopRel),
          width: px(leftColW),
          display: "flex",
          flexDirection: "column",
          gap: px(5),
        }}
      >
        {titleRow}
        {headlineEl("#FFFFFF")}
        <div style={{ marginTop: px(3) }}>{signatureBlock}</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: px(leftColLeftRel + avatarSize + 10),
          bottom: px(pad),
          width: px(leftColW - avatarSize - 10),
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
      {/* Square album artwork filling the mat width. */}
      <div style={{ position: "absolute", left: px(d.matX), top: px(d.matY), width: px(d.matW), height: px(d.artH), overflow: "hidden" }}>
        <img src={ART} alt={SAMPLE.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      {/* Navy band under the art. */}
      <div style={{ position: "absolute", left: px(d.matX), top: px(d.bandTop), width: px(d.matW), height: px(d.bandH), background: NAVY }}>
        {leftBlock}
        {rightColumn}
      </div>
    </div>
  );
}

export function CertStage({ paper, frame }: { paper: Paper; frame: Frame }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#E9EBF0", padding: 28 }}
    >
      <CertPrint paper={paper} frame={frame} />
    </div>
  );
}
