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
// The round cert avatar is the ARTIST (a profile photo), NOT the album artwork —
// every printed GoodDeed shows who made the record, not a second copy of the cover.
const ARTIST = "/__mockup/images/artist-fernando-perdomo.png";
const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const SIG = "/__mockup/images/will-signature.png";

const NAVY = "var(--brand-bg)";
const ORANGE = "var(--brand-orange)";

type Paper = "letter" | "a4";
type Frame = "navy" | "orange" | "bordered";

export type CertSample = {
  artist: string;
  title: string;
  genre: string;
  year: number;
  recipient: string;
  num: string;
};

const SAMPLE: CertSample = {
  artist: "Fernando Perdomo",
  title: "Guitar as a Voice",
  genre: "ROCK",
  year: 2024,
  recipient: "Jordan Ellis",
  num: "12",
};

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
  sample,
  artistPhoto,
  lowerCreditLockup,
  longLockup,
}: {
  paper: Paper;
  frame: Frame;
  art?: string;
  // The round avatar's artist profile photo (defaults to the sample artist).
  artistPhoto?: string;
  // Letter normal-name tile: drop the William credit + footnote + QR-caption
  // lock-up a touch lower so the (1-line-headline) signature squiggle clears the
  // William line, and lift the signature above the credit so its ink reads in
  // front of the name where they meet.
  lowerCreditLockup?: boolean;
  // Letter LONG-name tile: same idea, but a 2-line headline pushes the squiggle
  // lower, so the lock-up drops further (footBottomGap) and the signature is
  // lifted in front so it just touches the TOP of the William line (instead of
  // striking through it). Footnote last line stays locked to the QR caption.
  longLockup?: boolean;
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
  // Per-tile override of the sample artist/title/recipient/etc., merged over the
  // shared default SAMPLE — lets one tile stress-test long names/titles.
  sample?: Partial<CertSample>;
}) {
  const artSrc = art ?? ART;
  const avatarSrc = artistPhoto ?? ARTIST;
  const S: CertSample = { ...SAMPLE, ...sample };
  const headline = `This GoodDeed\u00AE certifies that ${S.recipient} owns no.\u00A0${S.num} of ${S.title}.`;
  // A4 reads this as one naturally-wrapping block (its provenance never sits
  // beside the QR caption, so it needs no manual break).
  const provenance =
    `Digital provenance can be confirmed by accessing the QR code on this GoodDeed\u00AE. ` +
    `In the event ownership was transferred, ` +
    `this GoodDeed\u00AE serves as the moment in time in which ${S.recipient} possessed ` +
    `ownership of this good.`;
  // Letter (US) footnote ONLY: break after "…ownership was transferred," so the
  // next line begins "this GoodDeed® serves…" — keeps "this GoodDeed®" together
  // as a phrase and leaves the line beside the QR caption ending on "…of this
  // good." (never a "GoodDeed®" right next to the caption's own). A4 uses the
  // full natural string above.
  const provenanceFootnote = [
    `Digital provenance can be confirmed by accessing the QR code on this GoodDeed\u00AE. ` +
      `In the event ownership was transferred,`,
    `this GoodDeed\u00AE serves as the moment in time in which ${S.recipient} possessed ownership of this good.`,
  ].map((line, i) => <div key={i}>{line}</div>);
  const subline = S.genre
    ? `${S.genre} \u2022 GOODTUNES RELEASE ${S.year}`
    : `GOODTUNES RELEASE ${S.year}`;
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

  // Letter footnote breathing room + QR lock-up alignment (consumed below in
  // rightColumn and the Letter leftBlock):
  const footBottomGap = longLockup ? -5 : lowerCreditLockup ? 6 : 9; // pt the provenance footnote rises off the band bottom (off the orange border); the credit lock-up sits lower on the normal tile (clear William) and lower still on the long tile (whole bottom cluster pulled down to hug the band bottom; QR caption tracks it via qrCaptionBottomRel so the baselines stay locked)
  const qrCaptionBottomRel = pad + footBottomGap - (longLockup ? -3 : 5); // raise/lower the QR+caption lock-up so the "GoodDeed®" caption baseline lands on the footnote's last line. The long tile needs a different offset than the normal/A4 tiles (whose shared -5 must not change): on the long tile the caption sat ~8pt low, so lift it (+3 instead of -5)

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
          bottom: px(qrCaptionBottomRel),
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
        <img src={avatarSrc} alt={S.artist} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#FFFFFF", fontSize: px(10), fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {S.artist}
        </div>
        <div style={{ color: "#FFFFFF", fontSize: px(14), fontWeight: 700, fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {S.title}
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
  // creditMt = top margin (pt) under the signature squiggle. A4 keeps a small
  // positive gap; Letter passes a negative value so the credit tucks up under the
  // squiggle (a slight overlap is intentional) to free room for the footnote.
  const makeSignatureBlock = (creditMt: number) => (
    <div>
      <img src={SIG} alt="William E. Denk signature" style={{ width: px(110), display: "block" }} />
      <div style={{ color: "#FFFFFF", fontSize: px(6.5), fontFamily: "Helvetica, Arial, sans-serif", marginTop: px(creditMt) }}>
        William E. Denk, CEO/Founder GoodTunes&reg;
      </div>
    </div>
  );

  // ── Letter geometry: headline + signature + the credit/footnote lock-up all
  //    indent to `bodyX` (the column under the artist name). The headline +
  //    signature squiggle flow from headlineYRel (top-anchored, so the squiggle
  //    always sits directly under the headline — one line or two). The William
  //    credit + provenance footnote are a SEPARATE bottom-anchored lock-up off
  //    the orange border, so they always keep their breathing space; when a
  //    2-line headline pushes the squiggle down it simply overlaps the credit's
  //    top (intentional) instead of shoving the footnote past the border (see
  //    LetterBorderThinLong). The PNG carries transparent top padding, so sigGap
  //    tucks the visible squiggle close under the headline.
  const bodyXRel = leftColLeftRel + avatarSize + 10;
  const bodyW = leftColRightRel - bodyXRel;
  const headlineYRel = safeTopRel + avatarSize + 5;
  // pt margin above the signature PNG (its transparent top padding means a slight
  // negative tucks it under the headline). On the long-name tile the signature is
  // part of the bottom cluster (squiggle → William → footnote), so it moves DOWN
  // in tandem with footBottomGap to keep its tail touching the TOP of William
  // while the whole cluster hugs the band bottom.
  const sigGap = longLockup ? 1 : -2;

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
      <div style={{ marginLeft: px(avatarSize + 10), marginTop: px(6) }}>{makeSignatureBlock(2)}</div>
    </div>
  ) : (
    // Letter: title row top-left; headline + signature squiggle flow from the top
    // under the artist name; the William credit + provenance footnote sit as ONE
    // bottom-anchored lock-up off the orange border, its last line sharing the QR
    // caption baseline.
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
      {/* Headline + signature squiggle, top-anchored under the artist name. On
          the normal-name tile (lowerCreditLockup) the William credit is seated just
          under the squiggle here; the long-name tile keeps it in the bottom
          lock-up so a 2-line headline's squiggle can't crash into it. */}
      <div
        style={{
          position: "absolute",
          left: px(bodyXRel),
          top: px(headlineYRel),
          width: px(bodyW),
          // Lift the headline+signature block above the credit lock-up so the
          // squiggle's ink reads continuously IN FRONT of the "William…" line
          // where they meet (instead of the name punching through the stroke).
          // Applies to both the normal tile (clears William) and the long tile
          // (squiggle touches William's top).
          zIndex: lowerCreditLockup || longLockup ? 1 : undefined,
        }}
      >
        <div
          style={{
            color: "#FFFFFF",
            fontSize: px(9.5),
            fontWeight: 700,
            fontFamily: "Helvetica, Arial, sans-serif",
            lineHeight: 1.15,
          }}
        >
          {headline}
        </div>
        <img
          src={SIG}
          alt="William E. Denk signature"
          style={{ width: px(110), display: "block", marginTop: px(sigGap) }}
        />
      </div>
      {/* William credit + provenance footnote: one bottom-anchored lock-up that
          keeps its breathing space off the orange border, its last line on the QR
          caption baseline. On the normal-name tile (lowerCreditLockup) it sits a
          touch lower (footBottomGap) so the signature squiggle clears the William
          line; the long-name tile keeps the squiggle's intentional overlap. */}
      <div
        style={{
          position: "absolute",
          left: px(bodyXRel),
          bottom: px(pad + footBottomGap),
          width: px(bodyW),
        }}
      >
        <div style={{ color: "#FFFFFF", fontSize: px(6.5), fontFamily: "Helvetica, Arial, sans-serif" }}>
          William E. Denk, CEO/Founder GoodTunes&reg;
        </div>
        <div
          style={{
            marginTop: px(3),
            color: "#9AA6CC",
            fontSize: px(6),
            fontFamily: "Helvetica, Arial, sans-serif",
            lineHeight: 1.25,
          }}
        >
          {provenanceFootnote}
        </div>
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
        <img src={artSrc} alt={S.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
  sample,
  artistPhoto,
  lowerCreditLockup,
  longLockup,
}: {
  paper: Paper;
  frame: Frame;
  art?: string;
  artistPhoto?: string;
  lowerCreditLockup?: boolean;
  longLockup?: boolean;
  insetIn?: number;
  bleedIn?: number;
  frameRevealWin?: [number, number];
  layout?: Paper;
  matBoxIn?: [number, number];
  sample?: Partial<CertSample>;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#E9EBF0", padding: 28 }}
    >
      <CertPrint paper={paper} frame={frame} art={art} insetIn={insetIn} bleedIn={bleedIn} frameRevealWin={frameRevealWin} layout={layout} matBoxIn={matBoxIn} sample={sample} artistPhoto={artistPhoto} lowerCreditLockup={lowerCreditLockup} longLockup={longLockup} />
    </div>
  );
}
