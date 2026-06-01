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

// Dashed pink mat/frame WINDOW guide. Bill asked to hide it on all tiles now
// that the layout is settled — flip to `true` to bring the guide back if we ever
// need to re-check the mat opening. (The frameRevealWin geometry stays wired so
// nothing else has to change.)
const SHOW_FRAME_WINDOW = false;

// PRINT (signed GoodDeed) ONLY: the printed/signed copies get a holographic
// authenticity sticker applied by fulfillment, in place of the GoodTunes logo.
// The `signed` cert variant swaps the logo for a thin faint-white rounded-rect
// PLACEMENT GUIDE so there's no question where the sticker goes. Sized a hair
// under the real 0.8"w x 0.75"h sticker so the sticker fully covers the guide.
// The free PDF (everyone gets with a purchase) keeps the logo (signed = false).
const HOLO_W_IN = 0.78;
const HOLO_H_IN = 0.73;
// pt of white padding around the QR plate. The plate overflows its centered
// column by this on each side, so the QR's VISIBLE right edge sits this far
// right of the column edge (qrColRightRel). The holo guide's right edge anchors
// to the plate edge (qrColRightRel + this), NOT the column edge, so the two read
// as flush. Shared by the QR plate padding + the holo offset so they can't drift.
const QR_PLATE_PAD = 3;

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
  signed,
}: {
  paper: Paper;
  frame: Frame;
  art?: string;
  // PRINT (signed GoodDeed) variant: swap the GoodTunes logo for the holographic
  // sticker placement guide (thin faint-white rounded rect). Free PDF leaves this
  // false and keeps the logo.
  signed?: boolean;
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
  const footBottomGap = longLockup || lowerCreditLockup ? -5 : 9; // pt the provenance footnote rises off the band bottom (off the orange border). The normal Letter tile now hugs the band bottom like the long tile (Bill: pull the provenance footer + QR/GoodDeed lock-up down to match the long), with the William credit lifted OUT of this lock-up to stay tucked under the signature squiggle. QR caption tracks this via qrCaptionBottomRel so the baselines stay locked.
  const qrCaptionBottomRel = pad + footBottomGap - (longLockup || lowerCreditLockup ? 3 : 5); // raise/lower the QR+caption lock-up so the bottom of the "GoodDeed®" caption sits on the footnote's last-line baseline. The normal Letter + long tiles share the bottom-hugging footer so they share the -3 offset; A4 keeps -5.

  const isA4 = (layout ?? paper) === "a4";

  // ── Right column (logo top, QR + caption bottom) — anchored to band edges on
  //    BOTH paper sizes, per the template.
  // Holo sticker placement guide (PRINT/signed only). Right edge in line with the
  // QR's right edge; top inset from the band top by the SAME gap the QR right edge
  // sits in from the band's right edge (= bandPad), so it tucks symmetrically into
  // the top-right corner where the logo used to be.
  const holoW = HOLO_W_IN * 72;
  const holoH = HOLO_H_IN * 72;
  const rightColumn = (
    <>
      {signed ? (
        <div
          style={{
            position: "absolute",
            left: px(qrColRightRel + QR_PLATE_PAD - holoW),
            top: px(safeTopRel),
            width: px(holoW),
            height: px(holoH),
            border: "1px solid rgba(255,255,255,0.28)",
            borderRadius: px(5),
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        />
      ) : (
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
      )}
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
        <div style={{ background: "#FFFFFF", padding: px(QR_PLATE_PAD), lineHeight: 0 }}>
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
  // creditMt = top margin (pt) under the signature squiggle. The SIG png carries
  // ~3.8pt of transparent bottom padding (16px of 132 at px(110) width), so a
  // small NEGATIVE value pulls the credit up under the visible squiggle ink.
  // Both A4 and Letter now tuck the credit close under the squiggle (Bill's ask:
  // match the Letter's tucked credit on A4).
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
  // negative tucks it under the headline). It is the ONLY lever on the squiggle↔William
  // overlap and must MATCH on both Letter tiles. On the long-name tile the 2-line
  // headline drops the top-anchored squiggle ~11pt AND the bottom-anchored William
  // credit also drops ~11pt (footBottomGap 6→-5), so those two drops cancel — leaving
  // sigGap alone to set how the squiggle meets "William…". Keep it equal on both tiles
  // (do NOT couple it to footBottomGap); long previously used +1 and sat ~3pt low.
  const sigGap = -2;

  // A4-only: the provenance is demoted to a bottom-anchored footnote (like the
  // Letter) instead of a mid-stack paragraph. a4ProvBottom is its box bottom off
  // the band bottom — start level with the QR "GoodDeed®" caption and tune so the
  // footnote's LAST line baseline lands on the caption baseline. a4ProvReserve is
  // the bottom band height kept clear so the centred upper block (title + headline
  // + signature) never overlaps the footnote.
  const a4ProvBottom = qrCaptionBottomRel;
  const a4ProvReserve = 44;

  // ── Left content block — the ONE place the two paper layouts diverge.
  const leftBlock = isA4 ? (
    // A4: title + headline + signature/credit centre as an UPPER block; the
    // provenance is demoted to a bottom-anchored footnote (like the Letter) whose
    // last line shares the QR "GoodDeed®" caption baseline. The upper block centres
    // in the band height ABOVE the reserved footnote zone (a4ProvReserve) so the
    // two never collide.
    <>
      <div
        style={{
          position: "absolute",
          left: px(leftColLeftRel),
          top: px(safeTopRel),
          width: px(leftColW),
          height: px(safeBottomRel - safeTopRel - a4ProvReserve),
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {titleRow}
        {/* Indent body to align with the text column (under "Fernando Perdomo"),
            i.e. past the avatar + its 10pt gap — not under the avatar itself. */}
        <div style={{ marginLeft: px(avatarSize + 10), marginTop: px(11) }}>{headlineEl("#FFFFFF")}</div>
        <div style={{ marginLeft: px(avatarSize + 10), marginTop: px(6) }}>{makeSignatureBlock(-4)}</div>
      </div>
      {/* Provenance footnote — bottom-anchored, 7pt, last line on the GoodDeed
          caption baseline (a4ProvBottom tuned to match). Indented to the body text
          column like the headline/signature above. */}
      <div
        style={{
          position: "absolute",
          left: px(leftColLeftRel + avatarSize + 10),
          bottom: px(a4ProvBottom),
          width: px(leftColW - (avatarSize + 10)),
          color: "#C7CFE8",
          fontSize: px(7),
          fontFamily: "Helvetica, Arial, sans-serif",
          lineHeight: 1.3,
        }}
      >
        {provenance}
      </div>
    </>
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
        {/* Normal Letter tile: the William credit is lifted OUT of the bottom
            lock-up and tucked under the signature squiggle so it stays put while
            the provenance footer + QR/GoodDeed lock-up drops to the band bottom
            (Bill's ask — match the long tile's tighter footer spacing). The long
            tile keeps the credit in the bottom lock-up (its 2-line headline drops
            the squiggle down to meet it there). */}
        {lowerCreditLockup && (
          <div style={{ color: "#FFFFFF", fontSize: px(6.5), fontFamily: "Helvetica, Arial, sans-serif", marginTop: px(-2) }}>
            William E. Denk, CEO/Founder GoodTunes&reg;
          </div>
        )}
      </div>
      {/* Bottom-anchored provenance lock-up, its last line on the QR caption
          baseline. On the long-name tile it ALSO carries the William credit (the
          2-line headline drops the squiggle to meet it here). On the normal-name
          tile (lowerCreditLockup) the credit is lifted up under the signature
          squiggle and ONLY the provenance footer rides this bottom lock-up, so it
          hugs the band bottom matching the long tile (Bill's ask). */}
      <div
        style={{
          position: "absolute",
          left: px(bodyXRel),
          bottom: px(pad + footBottomGap),
          width: px(bodyW),
        }}
      >
        {!lowerCreditLockup && (
          <div style={{ color: "#FFFFFF", fontSize: px(6.5), fontFamily: "Helvetica, Arial, sans-serif" }}>
            William E. Denk, CEO/Founder GoodTunes&reg;
          </div>
        )}
        <div
          style={{
            marginTop: lowerCreditLockup ? 0 : px(3),
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
      {SHOW_FRAME_WINDOW && frameRevealWin != null && (
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
  signed,
}: {
  paper: Paper;
  frame: Frame;
  art?: string;
  artistPhoto?: string;
  lowerCreditLockup?: boolean;
  longLockup?: boolean;
  signed?: boolean;
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
      <CertPrint paper={paper} frame={frame} art={art} insetIn={insetIn} bleedIn={bleedIn} frameRevealWin={frameRevealWin} layout={layout} matBoxIn={matBoxIn} sample={sample} artistPhoto={artistPhoto} lowerCreditLockup={lowerCreditLockup} longLockup={longLockup} signed={signed} />
    </div>
  );
}
