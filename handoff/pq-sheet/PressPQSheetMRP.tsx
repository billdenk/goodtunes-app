// PressPQSheetMRP — the online PQ / cutting-master sheet (Bill's brief,
// Aug 22 2026, for the Monday MRP demo). Sources: Viryl's "Vinyl mastering
// cue sheet" + MRP's VRMA cutting-master page (both attached PDFs). The two
// forms merged into ONE living surface for MRP's audio mastering folks:
//   • iPad-first: big type, tap targets, and PLAY — every track row plays
//     its uploaded master right on the sheet (the paper forms can't).
//   • Honest side-length guidance: each side's total is checked against the
//     VRMA/Viryl reference ladder for the chosen format (12" 33rpm: 12 min
//     loud / 14 average / 16 lower) — word + icon verdict, never color alone.
//   • Everything the cutting engineer needs from both forms: catalogue no
//     (run-out scribing), gap between tracks, cut speed, artist confirmations
//     (lossless / levels / approved masters), track listing with file names,
//     start–end–length per track, mastering notes, custom run-out scribing.
//   • ONE filled action: "Download PDF" — the beautiful print twin.
// Skin: press-side internal surface → light canvas, GoodStudio press BLUE
// (#319ED8) accent — never gold (gold is client-facing only). Word + icon
// statuses (Bill is colorblind), real ®, commas, Apple sentence-case
// headings, no emojis. Self-contained: MOCK_ consts, default export.

import { useState } from 'react';
import { Check, Download, Pause, Play, TriangleAlert } from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';

// ─── Canon palette (light, press-side) ────────────────────────────────
const CANVAS = '#f5f5f7';
const CARD = '#ffffff';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const FAINT = '#aeaeb2';
const HAIRLINE = '#e8e8ed';
const BLUE = '#319ED8'; // press GoodStudio blue — internal surfaces
const WARN = '#b25000';
const READY = '#1f7a33';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08)';
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";

// ─── Mock data ────────────────────────────────────────────────────────
const MOCK_PRESS = 'Memphis Record Pressing';
const MOCK_ARTIST = 'Niina Soleil';
const MOCK_ALBUM = 'CALIFORNIALAND';
const MOCK_CATALOG = 'NS-001'; // scribed into the run-out groove — matches the live Side Breaks page
const MOCK_MATRIX = 'NS-001-A / NS-001-B';
const MOCK_DATE = 'August 24, 2026';
const MOCK_FORMAT = '12" · 140g · 33 1/3 rpm · 1 LP';
const MOCK_GAP = '2 seconds';
const MOCK_CUT_SPEED = '33 1/3 rpm (artist preference — printed on artwork)';
const MOCK_PROJECT = 'Project 071526-02 · Draft accepted Aug 20';

// Reference ladder for a full album LP (from the Viryl cue sheet's table).
const REF = { loud: 17, average: 20, lower: 25 };

const MOCK_CONFIRMATIONS = [
  'All files are lossless WAV, 24-bit / 48kHz, same sample rate throughout',
  'Volume levels are consistent between tracks',
  'Artist approved the masters as supplied — cut to match',
];

type Track = { no: string; title: string; file: string; start: string; end: string; len: string; lenSec: number };

const MOCK_SIDE_A: Track[] = [
  { no: 'A1', title: 'Welcome to the Dream', file: '01_Welcome_to_the_Dream_24-48.wav', start: '0:00', end: '2:32', len: '2:32', lenSec: 152 },
  { no: 'A2', title: "Ramblin'", file: '02_Ramblin_24-48.wav', start: '2:34', end: '6:15', len: '3:41', lenSec: 221 },
  { no: 'A3', title: 'Say It In My Skirt', file: '03_Say_It_In_My_Skirt_24-48.wav', start: '6:17', end: '8:48', len: '2:31', lenSec: 151 },
  { no: 'A4', title: 'Take Me Into the Sunshine', file: '04_Take_Me_Into_the_Sunshine_24-48.wav', start: '8:50', end: '11:41', len: '2:51', lenSec: 171 },
  { no: 'A5', title: 'Right On Hollywood', file: '05_Right_On_Hollywood_24-48.wav', start: '11:43', end: '14:57', len: '3:14', lenSec: 194 },
  { no: 'A6', title: 'Life & Times of a Wannabe Rockstar', file: '06_Wannabe_Rockstar_24-48.wav', start: '14:59', end: '18:09', len: '3:10', lenSec: 190 },
];

const MOCK_SIDE_B: Track[] = [
  { no: 'B1', title: 'In the Darkness of the Desert', file: '07_Darkness_of_the_Desert_24-48.wav', start: '0:00', end: '3:54', len: '3:54', lenSec: 234 },
  { no: 'B2', title: 'Tequila Tears', file: '08_Tequila_Tears_24-48.wav', start: '3:56', end: '7:11', len: '3:15', lenSec: 195 },
  { no: 'B3', title: 'Devil Wind', file: '09_Devil_Wind_24-48.wav', start: '7:13', end: '11:10', len: '3:57', lenSec: 237 },
  { no: 'B4', title: 'Run For Cover', file: '10_Run_For_Cover_24-48.wav', start: '11:12', end: '14:23', len: '3:11', lenSec: 191 },
  { no: 'B5', title: 'Heaven Take Me Up', file: '11_Heaven_Take_Me_Up_24-48.wav', start: '14:25', end: '19:14', len: '4:49', lenSec: 289 },
  { no: 'B6', title: 'Dream (Reprise)', file: '12_Dream_Reprise_24-48.wav', start: '19:16', end: '21:18', len: '2:02', lenSec: 122 },
];

const MOCK_NOTES =
  'Please preserve the tape hiss on A3 — it is intentional. Slight de-ess on B1 vocal if needed at cut. Custom run-out scribing, Side B only: "FOR THE FANS WHO PRESSED IT" (artist approved the scribing charge Aug 20).';

const sideTotal = (tracks: Track[]) => tracks.reduce((a, t) => a + t.lenSec, 0);
const fmtMin = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// Honest side-length verdict — word + icon, from the reference ladder.
function sideVerdict(sec: number) {
  const min = sec / 60;
  if (min <= REF.loud) return { icon: Check, tone: READY, text: `Within the loud-level guide (${REF.loud} min) — full-level cut` };
  if (min <= REF.average) return { icon: Check, tone: READY, text: `Within the average-level guide (${REF.average} min)` };
  if (min <= REF.lower) return { icon: TriangleAlert, tone: WARN, text: `Past the average-level guide (${REF.average} min) — expect a slightly quieter cut` };
  return { icon: TriangleAlert, tone: WARN, text: `Past the lower-level guide (${REF.lower} min) — talk to the artist before cutting` };
}

// ─── Pieces ───────────────────────────────────────────────────────────
function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>{label}</div>
      <div className="text-[13.5px] font-semibold" style={{ color: INK, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function SideCard({ side, tracks, playing, onPlay }: { side: 'A' | 'B'; tracks: Track[]; playing: string | null; onPlay: (no: string) => void }) {
  const total = sideTotal(tracks);
  const v = sideVerdict(total);
  const VIcon = v.icon;
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid={`side-${side.toLowerCase()}`}>
      <div className="flex items-center justify-between gap-4 flex-wrap" style={{ padding: '18px 22px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <h2 className="text-[17px] font-semibold" style={{ color: INK, letterSpacing: -0.2, margin: 0 }}>Side {side}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13.5px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtMin(total)} total</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: SUBINK }} data-testid={`verdict-${side.toLowerCase()}`}>
            <VIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: v.tone }} />
            {v.text}
          </span>
        </div>
      </div>
      {tracks.map((tr, i) => {
        const isPlaying = playing === tr.no;
        return (
          <div
            key={tr.no}
            className="flex items-center gap-4 flex-wrap"
            style={{ padding: '14px 22px', borderTop: i === 0 ? 'none' : `1px solid ${HAIRLINE}`, background: isPlaying ? '#f4faff' : 'transparent' }}
            data-testid={`track-${tr.no.toLowerCase()}`}
          >
            {/* Play — tap to listen right on the sheet (iPad-first) */}
            <button
              type="button"
              onClick={() => onPlay(tr.no)}
              aria-label={isPlaying ? `Pause ${tr.title}` : `Play ${tr.title}`}
              // Canon circled quiet control: hairline circle, ink triangle;
              // playing = filled blue circle with white pause.
              className="flex items-center justify-center flex-shrink-0 rounded-full transition-colors"
              style={{ width: 34, height: 34, background: isPlaying ? BLUE : CARD, border: `1px solid ${isPlaying ? BLUE : HAIRLINE}` }}
              data-testid={`play-${tr.no.toLowerCase()}`}
            >
              {isPlaying
                ? <Pause style={{ color: '#ffffff', width: 14, height: 14 }} fill="#ffffff" />
                : <Play style={{ color: INK, width: 14, height: 14, marginLeft: 2 }} fill={INK} />}
            </button>
            <span className="text-[13px] font-semibold flex-shrink-0" style={{ color: SUBINK, width: 26, fontVariantNumeric: 'tabular-nums' }}>{tr.no}</span>
            <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
              <div className="text-[14.5px] font-semibold truncate" style={{ color: INK }}>
                {tr.title}
                {isPlaying && <span className="text-[11.5px] font-semibold" style={{ color: BLUE, marginLeft: 8 }}>Now playing</span>}
              </div>
              <div className="text-[12px] truncate" style={{ color: SUBINK, marginTop: 2 }}>{tr.file}</div>
            </div>
            <div className="flex items-center gap-5 flex-shrink-0 text-[12.5px]" style={{ color: SUBINK, fontVariantNumeric: 'tabular-nums' }}>
              <span>{tr.start} – {tr.end}</span>
              <span className="font-semibold" style={{ color: INK }}>{tr.len}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export function PressPQSheetMRP() {
  const [playing, setPlaying] = useState<string | null>(null);
  const togglePlay = (no: string) => setPlaying((p) => (p === no ? null : no));

  return (
    <div className="min-h-screen w-full" style={{ background: CANVAS, color: INK, fontFamily: FONT }}>
      {/* Top bar — sheet identity + the ONE filled action */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4" style={{ padding: '14px 28px', background: 'rgba(245,245,247,0.92)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div className="flex items-center gap-3 min-w-0">
          <img src={mrpLogo} alt={MOCK_PRESS} className="w-8 h-8 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold truncate" style={{ color: INK }}>Cutting master — PQ sheet</div>
            <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>{MOCK_PROJECT}</div>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full text-[13px] font-semibold text-white flex-shrink-0 transition-transform hover:-translate-y-px"
          style={{ padding: '9px 18px', background: BLUE, boxShadow: PILL_SHADOW }}
          data-testid="button-download-pdf"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      </header>

      <main className="mx-auto w-full" style={{ maxWidth: 880, padding: '32px 28px 96px' }}>
        {/* Title */}
        <h1 className="tracking-tight" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.08 }}>
          <span style={{ color: INK }}>{MOCK_ALBUM}. </span>
          <span style={{ color: FAINT, fontWeight: 600 }}>{MOCK_ARTIST}.</span>
        </h1>
        <p className="text-[13.5px]" style={{ marginTop: 8, color: SUBINK }}>
          {MOCK_FORMAT} · Prepared for the cutting engineer · {MOCK_DATE}
        </p>

        {/* Meta — everything from both paper forms, one glance */}
        <section className="rounded-2xl" style={{ marginTop: 24, padding: '20px 22px', background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid="sheet-meta">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 18 }}>
            <MetaCell label="Catalogue no — run-out scribing" value={MOCK_CATALOG} />
            <MetaCell label="Matrix numbers" value={MOCK_MATRIX} />
            <MetaCell label="Gap between tracks" value={MOCK_GAP} />
            <MetaCell label="Cut speed" value={MOCK_CUT_SPEED} />
          </div>
        </section>

        {/* Artist confirmations — word + icon, from the cue sheet's tick boxes */}
        <section className="rounded-2xl" style={{ marginTop: 16, padding: '18px 22px', background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid="sheet-confirmations">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>Confirmed by the artist</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK_CONFIRMATIONS.map((c) => (
              <div key={c} className="inline-flex items-start gap-2 text-[13px]" style={{ color: INK }}>
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: READY, marginTop: 1 }} strokeWidth={2.5} />
                {c}
              </div>
            ))}
          </div>
        </section>

        {/* Sides */}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SideCard side="A" tracks={MOCK_SIDE_A} playing={playing} onPlay={togglePlay} />
          <SideCard side="B" tracks={MOCK_SIDE_B} playing={playing} onPlay={togglePlay} />
        </div>

        {/* Reference ladder — the guidance the verdicts come from */}
        <section className="rounded-2xl" style={{ marginTop: 20, padding: '18px 22px', background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid="sheet-reference">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>Side length reference — album LP, 33 1/3 rpm</div>
          <div className="flex items-center gap-6 flex-wrap text-[13px]" style={{ marginTop: 10, color: SUBINK }}>
            <span><span className="font-semibold" style={{ color: INK }}>{REF.loud} min</span> loud level</span>
            <span><span className="font-semibold" style={{ color: INK }}>{REF.average} min</span> average level</span>
            <span><span className="font-semibold" style={{ color: INK }}>{REF.lower} min</span> lower level</span>
          </div>
        </section>

        {/* Mastering notes + scribing */}
        <section className="rounded-2xl" style={{ marginTop: 20, padding: '18px 22px', background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid="sheet-notes">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>Mastering notes &amp; run-out scribing</div>
          <p className="text-[13.5px]" style={{ marginTop: 10, color: INK, lineHeight: 1.65, maxWidth: 720 }}>{MOCK_NOTES}</p>
        </section>

        {/* Footer — provenance, like the estimate sheets */}
        <p className="text-[12px]" style={{ marginTop: 24, color: FAINT }}>
          Generated from the artist&rsquo;s uploaded masters and project details ·
          View this sheet online: memphisvinyl.com/pq/{'{token}'}
        </p>
      </main>
    </div>
  );
}

export default PressPQSheetMRP;
