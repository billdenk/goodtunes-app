// ArtistArtworkStudio — the "just upload images" artwork flow (Bill's brief,
// Aug 2026): instead of downloading a press template PDF, the artist drags in
// plain images for each piece of their package. The platform then:
//
//   1. Shows each piece with TRIM, BLEED and TEXT-SAFE overlays so the artist
//      can see exactly what survives the cut.
//   2. Runs an automatic pre-press check — CMYK vs RGB, fonts outlined,
//      bleed present, resolution — shown as dot + label rows (Bill is
//      colorblind: overlays also differ by LINE STYLE, never color alone).
//   3. On approval, maps everything into the chosen press's PDF template and
//      sends it — the artist never touches the template.
//
// Package pieces for a 12" vinyl: Front (square), Back (square), Inner sleeve
// front/back (square), Center labels A/B (round — square upload is fine, we
// show the circle), Spine (the one strip). Today's escape hatch — "prefer the
// template? download the press PDF" — stays as a quiet text link.
//
// Apple canon: #f5f5f7 canvas, white rounded-2xl cards + 1px #e6e6ea hairline,
// one blue accent (#319ED8), ONE filled blue pill per screen, ink/subink
// two-tone type, real ® character, no emojis, dot + label statuses.
//
// Standalone mock: MOCK_ consts, real useState, data-testid on interactive
// elements. All plumbing stubbed. No existing file is modified.

import { useState } from 'react';
import { Check, UploadCloud, Download, Eye, Disc3 } from 'lucide-react';
import { ArtistShell, PageHeading } from './ArtistProjects';

// ─── Brand tokens (Apple canon — verbatim from sibling mocks) ────────
const BLUE = '#319ED8';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = '#e6e6ea';
const GREEN = '#1c8a5b';
const AMBER = '#b8860b';

// ─── Mock data ───────────────────────────────────────────────────────
const MOCK_PRESS = 'MRP';

type PieceShape = 'square' | 'round' | 'strip';

type Piece = {
  id: string;
  name: string;
  shape: PieceShape;
  hint: string;
  uploaded: boolean;
};

const MOCK_PIECES: Piece[] = [
  { id: 'front', name: 'Front cover', shape: 'square', hint: 'Square image', uploaded: true },
  { id: 'back', name: 'Back cover', shape: 'square', hint: 'Square image', uploaded: true },
  { id: 'sleeve-front', name: 'Inner sleeve — front', shape: 'square', hint: 'Square image', uploaded: true },
  { id: 'sleeve-back', name: 'Inner sleeve — back', shape: 'square', hint: 'Square image', uploaded: false },
  { id: 'label-a', name: 'Center label — Side A', shape: 'round', hint: 'Square is fine — we show the circle', uploaded: true },
  { id: 'label-b', name: 'Center label — Side B', shape: 'round', hint: 'Square is fine — we show the circle', uploaded: false },
  { id: 'spine', name: 'Spine', shape: 'strip', hint: 'The one strip — text only is fine', uploaded: false },
];

type CheckStatus = 'pass' | 'fixing' | 'waiting';

type PreflightCheck = {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
};

const MOCK_CHECKS: PreflightCheck[] = [
  { id: 'color', label: 'Color', detail: 'Front cover was RGB — we converted it to CMYK for press', status: 'fixing' },
  { id: 'fonts', label: 'Fonts', detail: 'All text is outlined', status: 'pass' },
  { id: 'bleed', label: 'Bleed', detail: 'Edges extended to full bleed on every piece', status: 'pass' },
  { id: 'resolution', label: 'Resolution', detail: 'Waiting on 3 pieces', status: 'waiting' },
];

// ─── Dot + label (never color-only) ──────────────────────────────────
function CheckDot({ status }: { status: CheckStatus }) {
  const color = status === 'pass' ? GREEN : status === 'fixing' ? AMBER : '#aeaeb2';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

const CHECK_LABEL: Record<CheckStatus, string> = {
  pass: 'Good to go',
  fixing: 'We fixed it',
  waiting: 'Waiting',
};

// ─── Mock cover art (pure CSS — no binary assets) ────────────────────
function MockArt({ round }: { round?: boolean }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(135deg, #2b3a55 0%, #4a5f82 45%, #b8845f 100%)',
        borderRadius: round ? '50%' : 0,
      }}
    >
      {/* a quiet "title" bar to make the safe area meaningful */}
      <div
        style={{
          position: 'absolute',
          left: '18%',
          right: '18%',
          bottom: '20%',
          height: 8,
          borderRadius: 4,
          backgroundColor: 'rgba(255,255,255,0.85)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '18%',
          right: '40%',
          bottom: '14%',
          height: 5,
          borderRadius: 3,
          backgroundColor: 'rgba(255,255,255,0.5)',
        }}
      />
    </div>
  );
}

// ─── The big preview: trim / bleed / safe overlays ───────────────────
// Colorblind-safe: each guide has its own LINE STYLE, not just a color.
//   Bleed  — dotted gray, outermost
//   Trim   — solid ink, the cut
//   Safe   — dashed blue, keep text inside
function ArtworkPreview({ round }: { round: boolean }) {
  const guide = (inset: string, style: React.CSSProperties) => (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset,
        borderRadius: round ? '50%' : 0,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
  return (
    <div
      className="relative mx-auto"
      style={{ width: 300, height: 300 }}
      data-testid="artwork-preview"
    >
      {/* art extends to full bleed (the whole box) */}
      <MockArt round={round} />
      {/* bleed edge — dotted */}
      {guide('0px', { border: '2px dotted #a1a1a6' })}
      {/* trim — solid */}
      {guide('16px', { border: '2px solid rgba(29,29,31,0.9)' })}
      {/* text-safe — dashed blue */}
      {guide('38px', { border: `2px dashed ${BLUE}` })}
    </div>
  );
}

function GuideLegend() {
  const Item = ({
    swatch,
    label,
    note,
  }: {
    swatch: React.CSSProperties;
    label: string;
    note: string;
  }) => (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        style={{ width: 22, height: 0, flexShrink: 0, ...swatch }}
      />
      <span className="text-[12.5px]" style={{ color: INK }}>
        <span className="font-medium">{label}</span>
        <span style={{ color: SUBINK }}> — {note}</span>
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2" data-testid="guide-legend">
      <Item
        swatch={{ borderTop: '2px dotted #a1a1a6' }}
        label="Bleed"
        note="your image should reach this edge"
      />
      <Item
        swatch={{ borderTop: '2px solid rgba(29,29,31,0.9)' }}
        label="Trim"
        note="where the cut happens"
      />
      <Item
        swatch={{ borderTop: `2px dashed ${BLUE}` }}
        label="Text safe"
        note="keep words and faces inside"
      />
    </div>
  );
}

// ─── Upload slot tile ────────────────────────────────────────────────
function PieceTile({
  piece,
  selected,
  onSelect,
}: {
  piece: Piece;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-2xl bg-white transition-colors"
      style={{
        border: selected ? `1.5px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
        padding: '14px 16px',
        cursor: 'pointer',
      }}
      data-testid={`tile-piece-${piece.id}`}
    >
      <div className="flex items-center gap-3">
        {/* shape glyph */}
        <span
          aria-hidden
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 34, height: 34 }}
        >
          {piece.shape === 'strip' ? (
            <span
              style={{
                width: 8,
                height: 28,
                borderRadius: 2,
                border: `1.5px solid ${piece.uploaded ? BLUE : '#aeaeb2'}`,
                backgroundColor: piece.uploaded ? '#f0f7fc' : 'transparent',
              }}
            />
          ) : (
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: piece.shape === 'round' ? '50%' : 5,
                border: `1.5px solid ${piece.uploaded ? BLUE : '#aeaeb2'}`,
                backgroundColor: piece.uploaded ? '#f0f7fc' : 'transparent',
              }}
            />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span
            className="block text-[13.5px] font-medium truncate"
            style={{ color: INK, letterSpacing: '-0.01em' }}
          >
            {piece.name}
          </span>
          <span className="block text-[11.5px] truncate" style={{ color: SUBINK }}>
            {piece.hint}
          </span>
        </span>
        {piece.uploaded ? (
          <span
            className="inline-flex items-center gap-1 text-[12px] flex-shrink-0"
            style={{ color: GREEN }}
          >
            <Check className="w-3.5 h-3.5" />
            Added
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[12px] flex-shrink-0"
            style={{ color: SUBINK }}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Drop image
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export function ArtistArtworkStudio() {
  const [selectedId, setSelectedId] = useState('front');
  const selected = MOCK_PIECES.find((p) => p.id === selectedId) ?? MOCK_PIECES[0];
  const uploadedCount = MOCK_PIECES.filter((p) => p.uploaded).length;
  const allUploaded = uploadedCount === MOCK_PIECES.length;

  return (
    <ArtistShell>
      <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
        <div style={{ paddingTop: 8 }}>
          <PageHeading
            lead="Your artwork."
            rest="We’ll handle the templates."
            testId="heading-artwork-studio"
          />
          <p
            className="text-[15px] leading-relaxed"
            style={{ color: SUBINK, marginTop: 10, maxWidth: 560 }}
          >
            Just drop in your images — square for the covers and sleeves, and a
            square works for the round labels too. We&rsquo;ll show you exactly
            where the cut lands, check everything for press, and place it all
            into {MOCK_PRESS}&rsquo;s template for you.
          </p>
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: '340px 1fr', marginTop: 28 }}>
          {/* Left — the pieces of this package */}
          <div className="flex flex-col gap-2.5" data-testid="list-pieces">
            <div
              className="text-[12px] font-medium uppercase"
              style={{ color: SUBINK, letterSpacing: '0.06em', marginBottom: 2 }}
            >
              Your package — {uploadedCount} of {MOCK_PIECES.length} added
            </div>
            {MOCK_PIECES.map((p) => (
              <PieceTile
                key={p.id}
                piece={p}
                selected={p.id === selectedId}
                onSelect={() => setSelectedId(p.id)}
              />
            ))}
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{
                color: SUBINK,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 2px 0',
              }}
              data-testid="link-download-template"
            >
              <Download className="w-3.5 h-3.5" />
              Prefer the template? Download {MOCK_PRESS}&rsquo;s PDF
            </button>
          </div>

          {/* Right — preview with guides + pre-press check */}
          <div className="flex flex-col gap-4">
            <section
              className="rounded-2xl bg-white"
              style={{ border: `1px solid ${HAIRLINE}`, padding: '28px 32px' }}
              data-testid="card-preview"
            >
              <div className="flex items-center justify-between">
                <h2
                  className="text-[15px] font-semibold"
                  style={{ color: INK, letterSpacing: '-0.01em' }}
                >
                  {selected.name}
                </h2>
                <span
                  className="inline-flex items-center gap-1.5 text-[12.5px]"
                  style={{ color: SUBINK }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  How the press sees it
                </span>
              </div>

              <div className="flex items-center gap-8" style={{ marginTop: 22 }}>
                {selected.uploaded ? (
                  <ArtworkPreview round={selected.shape === 'round'} />
                ) : (
                  <div
                    className="flex flex-col items-center justify-center text-center flex-shrink-0"
                    style={{
                      width: 300,
                      height: 300,
                      borderRadius: selected.shape === 'round' ? '50%' : 12,
                      border: `2px dashed ${HAIRLINE}`,
                      backgroundColor: '#fafafa',
                    }}
                    data-testid="dropzone-empty"
                  >
                    <UploadCloud className="w-7 h-7" style={{ color: '#aeaeb2' }} />
                    <div
                      className="text-[13.5px] font-medium"
                      style={{ color: INK, marginTop: 10 }}
                    >
                      Drop an image here
                    </div>
                    <div
                      className="text-[12px]"
                      style={{ color: SUBINK, marginTop: 3, maxWidth: 200 }}
                    >
                      {selected.hint}
                    </div>
                  </div>
                )}
                <GuideLegend />
              </div>
            </section>

            <section
              className="rounded-2xl bg-white"
              style={{ border: `1px solid ${HAIRLINE}`, padding: '22px 32px' }}
              data-testid="card-preflight"
            >
              <h2
                className="text-[15px] font-semibold"
                style={{ color: INK, letterSpacing: '-0.01em' }}
              >
                Ready-for-press check.
              </h2>
              <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 3 }}>
                We run these automatically — you never have to think about them.
              </p>
              <div style={{ marginTop: 14 }}>
                {MOCK_CHECKS.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3"
                    style={{
                      paddingTop: 11,
                      paddingBottom: 11,
                      borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined,
                    }}
                    data-testid={`check-${c.id}`}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0"
                      style={{ color: INK, width: 150 }}
                    >
                      <CheckDot status={c.status} />
                      {c.label}
                      <span className="font-normal" style={{ color: SUBINK }}>
                        · {CHECK_LABEL[c.status]}
                      </span>
                    </span>
                    <span className="text-[12.5px] truncate" style={{ color: SUBINK }}>
                      {c.detail}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* One upload, every format — Bill's brief: once the squares are
                in, CD and cassette are one click each. The J-card can be
                personalized, or the album cover wraps it "in a pinch". These
                are quiet text buttons — the ONE blue pill stays Approve. */}
            <section
              className="rounded-2xl bg-white"
              style={{ border: `1px solid ${HAIRLINE}`, padding: '22px 32px' }}
              data-testid="card-other-formats"
            >
              <h2
                className="text-[15px] font-semibold"
                style={{ color: INK, letterSpacing: '-0.01em' }}
              >
                One upload, every format.
              </h2>
              <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 3 }}>
                These same squares can dress your other formats — no re-uploading,
                ever.
              </p>
              <div style={{ marginTop: 14 }}>
                <div
                  className="flex items-center gap-3"
                  style={{ paddingTop: 11, paddingBottom: 11 }}
                  data-testid="format-cd"
                >
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: '#f2f2f5',
                      border: `1px solid ${HAIRLINE}`,
                    }}
                  >
                    <Disc3 className="w-4.5 h-4.5" style={{ color: SUBINK, width: 18, height: 18 }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className="block text-[13.5px] font-medium"
                      style={{ color: INK, letterSpacing: '-0.01em' }}
                    >
                      CD
                    </span>
                    <span className="block text-[12px]" style={{ color: SUBINK }}>
                      Your front, back and labels map straight onto the jewel case
                      and disc.
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => e.preventDefault()}
                    className="text-[13px] font-medium flex-shrink-0"
                    style={{ color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    data-testid="button-make-cd"
                  >
                    Make the CD set
                  </button>
                </div>
                <div
                  className="flex items-center gap-3"
                  style={{ paddingTop: 11, paddingBottom: 11, borderTop: `1px solid ${HAIRLINE}` }}
                  data-testid="format-cassette"
                >
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: '#f2f2f5',
                      border: `1px solid ${HAIRLINE}`,
                    }}
                  >
                    {/* cassette glyph — a wide rounded rect with two reels */}
                    <span
                      style={{
                        position: 'relative',
                        width: 20,
                        height: 13,
                        borderRadius: 3,
                        border: `1.5px solid ${SUBINK}`,
                        display: 'inline-block',
                      }}
                    >
                      <span style={{ position: 'absolute', left: 3, top: 3.5, width: 4, height: 4, borderRadius: '50%', border: `1.2px solid ${SUBINK}` }} />
                      <span style={{ position: 'absolute', right: 3, top: 3.5, width: 4, height: 4, borderRadius: '50%', border: `1.2px solid ${SUBINK}` }} />
                    </span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className="block text-[13.5px] font-medium"
                      style={{ color: INK, letterSpacing: '-0.01em' }}
                    >
                      Cassette
                    </span>
                    <span className="block text-[12px]" style={{ color: SUBINK }}>
                      We&rsquo;ll wrap your cover onto the J-card — or personalize
                      it whenever you like.
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => e.preventDefault()}
                    className="text-[13px] font-medium flex-shrink-0"
                    style={{ color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    data-testid="button-make-cassette"
                  >
                    Make the cassette set
                  </button>
                </div>
              </div>
            </section>

            {/* Approve — the ONE blue pill. Disabled until all pieces are in. */}
            <div className="flex items-center justify-between" style={{ paddingBottom: 8 }}>
              <p className="text-[12.5px] leading-snug" style={{ color: SUBINK, maxWidth: 420 }}>
                When everything&rsquo;s in, you&rsquo;ll get one final proof to
                approve — then we place it into {MOCK_PRESS}&rsquo;s template and
                send it straight to press.
              </p>
              <button
                type="button"
                disabled={!allUploaded}
                onClick={(e) => e.preventDefault()}
                className="inline-flex items-center gap-1.5 rounded-full px-6 h-9 text-[14px] font-medium text-white flex-shrink-0"
                style={{
                  backgroundColor: allUploaded ? BLUE : '#c7c7cc',
                  cursor: allUploaded ? 'pointer' : 'default',
                }}
                data-testid="button-approve-artwork"
              >
                Approve artwork
              </button>
            </div>
          </div>
        </div>
      </div>
    </ArtistShell>
  );
}

export default ArtistArtworkStudio;
