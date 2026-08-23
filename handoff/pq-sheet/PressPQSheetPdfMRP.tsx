// PressPQSheetPdfMRP — the print twin of the online PQ sheet: exactly what
// "Download PDF" produces (Bill asked "What's the PDF look like?", Aug 22
// 2026). Same paper grammar as the estimate PDF mock (US Letter proportion,
// letterhead, hairline rules, pinned footer with page label + the online
// link), but ink-quiet: this is an internal cutting-master document, so the
// accent is a single thin GoodStudio-blue rule under the letterhead — no
// gold (gold is client-facing only). No play buttons on paper — the footer
// tells the engineer where to LISTEN online. Word + icon verdicts carry
// over. Honest pagination: two pages, Side A on 1, Side B + notes on 2.
// Self-contained: MOCK_ consts, no cross-mock imports, default export.

import { Check, TriangleAlert } from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';

// ─── Palette & paper ──────────────────────────────────────────────────
const GROUND = '#eceae3';
const PAPER = '#ffffff';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const RULE_STRONG = 'rgba(0,0,0,0.16)';
const BLUE = '#319ED8';
const BLUE_RULE = 'rgba(49,158,216,0.55)';
const WARN = '#b25000';
const READY = '#1f7a33';
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";
const PAPER_W = 760;
const PAPER_H = Math.round((PAPER_W * 11) / 8.5); // 984

// ─── Mock data (mirrors PressPQSheetMRP exactly) ──────────────────────
const MOCK_PRESS = 'Memphis Record Pressing';
const MOCK_ARTIST = 'Niina Soleil';
const MOCK_ALBUM = 'CALIFORNIALAND';
const MOCK_CATALOG = 'NS-001';
const MOCK_MATRIX = 'NS-001-A / NS-001-B';
const MOCK_DATE = 'August 24, 2026';
const MOCK_FORMAT = '12" · 140g · 33 1/3 rpm · 1 LP';
const MOCK_GAP = '2 seconds';
const MOCK_CUT_SPEED = '33 1/3 rpm (artist preference — printed on artwork)';
const MOCK_PROJECT = 'Project 071526-02';
const MOCK_TOKEN = 'pq-8f3k2m';

const REF = { loud: 17, average: 20, lower: 25 }; // album LP ladder

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

const sideTotal = (t: Track[]) => t.reduce((a, x) => a + x.lenSec, 0);
const fmtMin = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function sideVerdict(sec: number) {
  const min = sec / 60;
  if (min <= REF.loud) return { icon: Check, tone: READY, text: `Within the loud-level guide (${REF.loud} min) — full-level cut` };
  if (min <= REF.average) return { icon: Check, tone: READY, text: `Within the average-level guide (${REF.average} min)` };
  if (min <= REF.lower) return { icon: TriangleAlert, tone: WARN, text: `Past the average-level guide (${REF.average} min) — expect a slightly quieter cut` };
  return { icon: TriangleAlert, tone: WARN, text: `Past the lower-level guide (${REF.lower} min) — talk to the artist before cutting` };
}

// ─── Paper pieces ─────────────────────────────────────────────────────
function Rule({ color = HAIRLINE, mt = 0 }: { color?: string; mt?: number }) {
  return <div aria-hidden style={{ height: 1, background: color, marginTop: mt }} />;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: SUBINK }}>{children}</div>;
}

function Letterhead() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={mrpLogo} alt={MOCK_PRESS} style={{ width: 30, height: 30 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{MOCK_PRESS}</div>
            <div style={{ fontSize: 10.5, color: SUBINK }}>Cutting master — PQ sheet</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10.5, color: SUBINK, lineHeight: 1.6 }}>
          <div>{MOCK_PROJECT}</div>
          <div>{MOCK_DATE}</div>
        </div>
      </div>
      <Rule mt={14} color={BLUE_RULE} />
    </>
  );
}

function DocFoot({ pageLabel }: { pageLabel: string }) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
      <Rule />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 10 }}>
        <div style={{ fontSize: 10, color: SUBINK, lineHeight: 1.6 }}>
          <div>Generated from the artist&rsquo;s uploaded masters and project details · {MOCK_PROJECT}</div>
          {/* the online twin is where you LISTEN — token is the key */}
          <div style={{ color: INK }}>Listen to every track online: memphisvinyl.com/pq/{MOCK_TOKEN}</div>
        </div>
        <div style={{ fontSize: 10.5, color: SUBINK, whiteSpace: 'nowrap' }}>{pageLabel}</div>
      </div>
    </div>
  );
}

function Paper({ children, testid }: { children: React.ReactNode; testid: string }) {
  return (
    <div
      data-testid={testid}
      style={{
        width: PAPER_W, height: PAPER_H, background: PAPER,
        boxShadow: '0 18px 50px rgba(0,0,0,0.16)', border: `1px solid ${HAIRLINE}`,
        display: 'flex', flexDirection: 'column', padding: '40px 44px 30px', overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function SideTable({ side, tracks }: { side: 'A' | 'B'; tracks: Track[] }) {
  const total = sideTotal(tracks);
  const v = sideVerdict(total);
  const VIcon = v.icon;
  return (
    <div data-testid={`pdf-side-${side.toLowerCase()}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>Side {side}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtMin(total)} total</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 10.5, color: SUBINK }}>
        <VIcon style={{ width: 12, height: 12, color: v.tone, flexShrink: 0 }} />
        {v.text}
      </div>
      {/* column heads */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingBottom: 6, borderBottom: `2px solid ${RULE_STRONG}`, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: SUBINK }}>
        <span style={{ width: 26 }}>No.</span>
        <span style={{ flex: 1 }}>Track title / file</span>
        <span style={{ width: 92, textAlign: 'right' }}>Start – end</span>
        <span style={{ width: 46, textAlign: 'right' }}>Length</span>
      </div>
      {tracks.map((tr) => (
        <div key={tr.no} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
          <span style={{ width: 26, fontSize: 11, fontWeight: 700, color: SUBINK, fontVariantNumeric: 'tabular-nums' }}>{tr.no}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: INK }}>{tr.title}</span>
            <span style={{ display: 'block', fontSize: 10, color: SUBINK, marginTop: 1 }}>{tr.file}</span>
          </span>
          <span style={{ width: 92, textAlign: 'right', fontSize: 11, color: SUBINK, fontVariantNumeric: 'tabular-nums' }}>{tr.start} – {tr.end}</span>
          <span style={{ width: 46, textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{tr.len}</span>
        </div>
      ))}
    </div>
  );
}

// ─── The document ─────────────────────────────────────────────────────
export function PressPQSheetPdfMRP() {
  return (
    <div style={{ minHeight: '100vh', width: '100%', background: GROUND, fontFamily: FONT, color: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, padding: '40px 24px 80px' }}>
      {/* quiet framing strip — what this preview IS */}
      <div style={{ fontSize: 12, color: SUBINK, textAlign: 'center' }}>
        What &ldquo;Download PDF&rdquo; produces — the print twin of the online PQ sheet
      </div>

      {/* ── PAGE 1 — identity, setup, Side A ── */}
      <Paper testid="pdf-page-1">
        <Letterhead />

        <div style={{ marginTop: 18 }}>
          <Eyebrow>Cutting master</Eyebrow>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, marginTop: 4 }}>
            {MOCK_ALBUM} <span style={{ color: SUBINK, fontWeight: 600 }}>· {MOCK_ARTIST}</span>
          </div>
          <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 5 }}>{MOCK_FORMAT}</div>
        </div>

        {/* meta grid */}
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', padding: '14px 16px', border: `1px solid ${HAIRLINE}` }}>
          {[
            ['Catalogue no — run-out scribing', MOCK_CATALOG],
            ['Matrix numbers', MOCK_MATRIX],
            ['Gap between tracks', MOCK_GAP],
            ['Cut speed', MOCK_CUT_SPEED],
          ].map(([k, val]) => (
            <div key={k}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: SUBINK }}>{k}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* confirmations */}
        <div style={{ marginTop: 16 }}>
          <Eyebrow>Confirmed by the artist</Eyebrow>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {MOCK_CONFIRMATIONS.map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, color: INK }}>
                <Check style={{ width: 13, height: 13, color: READY, flexShrink: 0, marginTop: 1 }} strokeWidth={2.5} />
                {c}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <SideTable side="A" tracks={MOCK_SIDE_A} />
        </div>

        <DocFoot pageLabel="Page 1 of 2" />
      </Paper>

      {/* ── PAGE 2 — Side B, reference, notes, sign-off ── */}
      <Paper testid="pdf-page-2">
        <Letterhead />

        <div style={{ marginTop: 20 }}>
          <SideTable side="B" tracks={MOCK_SIDE_B} />
        </div>

        {/* reference ladder */}
        <div style={{ marginTop: 20 }}>
          <Eyebrow>Side length reference — album LP, 33 1/3 rpm</Eyebrow>
          <div style={{ display: 'flex', gap: 24, marginTop: 8, fontSize: 11.5, color: SUBINK }}>
            <span><span style={{ fontWeight: 700, color: INK }}>{REF.loud} min</span> loud level</span>
            <span><span style={{ fontWeight: 700, color: INK }}>{REF.average} min</span> average level</span>
            <span><span style={{ fontWeight: 700, color: INK }}>{REF.lower} min</span> lower level</span>
          </div>
        </div>

        {/* notes */}
        <div style={{ marginTop: 20 }}>
          <Eyebrow>Mastering notes &amp; run-out scribing</Eyebrow>
          <p style={{ fontSize: 11.5, color: INK, lineHeight: 1.65, marginTop: 8, maxWidth: 620 }}>{MOCK_NOTES}</p>
        </div>

        {/* engineer sign-off — paper earns its keep on the bench */}
        <div style={{ marginTop: 28, display: 'flex', gap: 40 }}>
          {['Cutting engineer', 'Date cut'].map((label) => (
            <div key={label} style={{ flex: label === 'Cutting engineer' ? 2 : 1 }}>
              <div style={{ height: 26, borderBottom: `1px solid ${RULE_STRONG}` }} />
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: SUBINK, marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>

        <DocFoot pageLabel="Page 2 of 2" />
      </Paper>
    </div>
  );
}

export default PressPQSheetPdfMRP;
