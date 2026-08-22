// CORNER RULING (Bill, Aug 21 2026): Memphis's corner token = SQUARE across
// the whole MRP skin — buttons, inputs, cards, pills. Only true circles
// (avatars, status icons, the frosted x) stay round.
//
// PressEstimateDownloadMRP — the DOWNLOAD affordance + the print-ready
// estimate document. Otis's brief (estimate-download-spec): MRP's PDF email
// attachment gets replaced by a "Download estimate (PDF)" affordance on the
// client estimate page, and the downloaded file is a DESIGNED print-ready
// estimate — not a bare Excel grid. This mock stacks three things so Bill
// can review them together, with a sticky section nav:
//
//   1. THE AFFORDANCE — a small excerpt of the client estimate page header
//      zone showing where "Download estimate (PDF)" lives. It's a QUIET
//      control; the page's ONE filled gold action stays "Start this project"
//      (house rule: one filled accent action per page/sheet).
//   2. THE DOCUMENT — the print-ready estimate rendered as paper (US Letter
//      proportion, white sheet on a neutral ground). Stacked blocks + one
//      table so it's pdfkit-friendly (no absolute-position collage). Beats
//      the MRP Excel sheet at /tmp/mrp-example-1.png on hierarchy + warmth.
//   3. STATES — mock-only chip toggles: (a) with art vs. without art (press
//      placeholder house art), (b) long build spilling onto a second sheet
//      with honest pagination (repeated column header, "Page 2 of 2").
//
// Reuses the MRP brand chain exactly: gold #D9C153, dark ink on gold,
// square corners, logo asset ../assets/mrp-logo.svg, persona Niina Soleil,
// estimate 071526-02, 1,000 units, $8,375.00. "Estimate" never "quote" in
// client-facing copy. Commas in dollars. Statuses/nudges are word + icon
// (Bill is colorblind). No emojis. Real (R) char.
//
// Self-contained per handoff rules: MOCK_ consts, no cross-mock imports,
// default export, route auto-discovers from filename.

import { useState } from 'react';
import californialandCover from '../assets/californialand-cover.jpg';
import rubyVinylPhoto from '../assets/mrp-ruby-translucent.png';
import niinaLabelArt from '../assets/niina-label-1.png';
import mrpLogoAsset from '../assets/mrp-logo.svg';

// ─── Mock data (from the MRP estimate PDF) ───────────────────────────
const MOCK_CLIENT_FULL = 'Niina Soleil';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_TOKEN = 'est_9f3c-071526-02';
const MOCK_DATE = 'August 24, 2026';
const MOCK_VALID_UNTIL = 'September 23, 2026';
const MOCK_PREPARED_BY = 'Brandon Seavers';
const MOCK_PRESS = 'Memphis Record Pressing';
const MOCK_JOB = 'Californialand';
const MOCK_SPEC = '12" · 140g · Ruby translucent · 1 LP';
const MOCK_QTY = 1000; // the tier Brandon prepared

// Per-unit line items at the prepared tier (same numbers as the estimate page).
const UNIT_LINES = [
  { id: 'vinyl',    name: '12" LP · 140g color vinyl',   note: 'Translucent ruby, single LP',        amount: 2.30 },
  { id: 'labels',   name: 'Center labels · full color',  note: 'Printed before pressing',            amount: 0.25 },
  { id: 'sleeve',   name: 'Inner sleeve · full color',   note: '100# gloss text',                    amount: 0.81 },
  { id: 'jacket',   name: 'Single jacket · full color',  note: '20pt board, semi-gloss',             amount: 0.81 },
  { id: 'insert',   name: 'Insert · 12"×12" full color', note: '100# cover',                         amount: 0.67 },
  { id: 'assembly', name: 'Assembly',                    note: 'Insert placed on top before shrink', amount: 0.36 },
  { id: 'shrink',   name: 'Shrinkwrap',                  note: 'Retail-ready seal',                  amount: 0.17 },
];

// Extra component lines for the LONG-BUILD state (deluxe gatefold, etc.) —
// these push the table past one page so we can show honest pagination.
const LONG_EXTRA_LINES = [
  { id: 'gatefold',  name: 'Gatefold jacket upgrade · full color', note: '24pt board, matte lam',           amount: 1.12 },
  { id: 'spotgloss', name: 'Spot-gloss varnish · jacket front',    note: 'On matte laminate',               amount: 0.44 },
  { id: 'obi',       name: 'Obi strip · full color',               note: '100# cover, wraps left edge',     amount: 0.29 },
  { id: 'poster',    name: 'Poster insert · 24"×24"',              note: '80# gloss text, folded to 12"',   amount: 0.58 },
  { id: 'download',  name: 'Digital download card',                note: 'Printed 2/0, unique codes',       amount: 0.21 },
  { id: 'polylined', name: 'Poly-lined inner sleeve upgrade',      note: 'Anti-static, rice-paper look',    amount: 0.34 },
  { id: 'numbered',  name: 'Hand-numbered jacket stamp',           note: 'Sequential, gold foil',           amount: 0.19 },
  { id: 'stickerfc', name: 'Front-cover hype sticker',             note: '3" round, full color',            amount: 0.11 },
  { id: 'testext',   name: 'Extra test pressings',                 note: 'Two additional sets',             amount: 0.09 },
  { id: 'mastering', name: 'Per-side mastering pass',              note: 'Lacquer-optimized EQ',            amount: 0.15 },
];

const SETUP_LINES = [
  { id: 'cutting',  name: 'Lacquer cutting', amount: 650 },
  { id: 'plating',  name: 'Lacquer plating', amount: 375 },
  { id: 'test',     name: 'Test pressing',   note: 'Includes 2-day domestic shipping', amount: 175 },
  { id: 'stampers', name: 'Stampers',        amount: 0 },
  { id: 'color',    name: 'Color setup fee', amount: 95 },
];
const SETUP_TOTAL = SETUP_LINES.reduce((a, l) => a + l.amount, 0);

// Run-option quantities for the comparison sheet (Bill, Aug 22 2026). The
// prepared run keeps the story; other sizes get ONE compact comparison sheet
// — never re-quoted page-per-page (Hellbender) or crammed into columns on the
// main table (MRP's Excel sheet). Factors scale the per-unit cost: smaller
// runs carry setup across fewer records, bigger runs only get cheaper.
const RUN_OPTIONS = [
  { qty: 500, factor: 1.18 },
  { qty: 1000, factor: 1.0, prepared: true },
  { qty: 2000, factor: 0.86 },
];

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const money2 = (n: number) => `$${n.toFixed(2)}`;

// ─── Palette (MRP white-label skin) ──────────────────────────────────
const GROUND = '#eceae3';   // neutral ground behind the paper
const CANVAS = '#ffffff';
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const RULE_STRONG = 'rgba(0,0,0,0.16)';
const GOLD = '#D9C153';
const GOLD_TINT_TOP = 'rgba(217,193,83,0.12)';
const GOLD_RULE = 'rgba(217,193,83,0.55)';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";

// US Letter proportion: 8.5 × 11 → height = width * 11/8.5.
const PAPER_W = 760;
const PAPER_H = Math.round((PAPER_W * 11) / 8.5); // 984

// ─── Small shared pieces ─────────────────────────────────────────────
function Rule({ color = HAIRLINE, mt = 0, mb = 0 }: { color?: string; mt?: number; mb?: number }) {
  return <div aria-hidden style={{ height: 1, background: color, marginTop: mt, marginBottom: mb }} />;
}

// Section-label eyebrow — word, uppercase, tracked.
function Eyebrow({ children, color = SUBINK }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color }}>
      {children}
    </div>
  );
}

// Word + icon status (never color alone — Bill is colorblind).
function DownloadIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" />
    </svg>
  );
}
function PdfIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
      <path d="M9.2 13.5h1.1M9.2 13.5v3M12.5 13.5h1.4M12.5 16.5v-3M12.5 15h1.1" />
    </svg>
  );
}
function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

// The record composition — square jacket + disc peek. Static (this is paper).
// `withArt=false` swaps in the press placeholder house art.
function RecordMock({ size, withArt }: { size: number; withArt: boolean }) {
  const disc = Math.round(size * 0.94);
  if (!withArt) {
    // No art yet → the press's OWN branding stands in (Bill, Aug 22 2026):
    // the press logo on the press's chosen hex color, on both the jacket and
    // the center label — never a hatched "to come" plate.
    return (
      <div style={{ position: 'relative', width: Math.round(size * 1.5), height: size, display: 'flex', justifyContent: 'center' }} aria-hidden>
        <div style={{ position: 'absolute', left: Math.round(size * 0.42), top: size * 0.03, width: disc, height: disc, borderRadius: '50%', background: '#111', border: `1px solid ${HAIRLINE}` }}>
          <div style={{ position: 'absolute', inset: '8%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.10)' }} />
          {/* center label — press hex + press logo */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '38%', height: '38%', borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={mrpLogoAsset} alt="" style={{ width: '62%', height: '62%', objectFit: 'contain' }} />
          </div>
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#111' }} />
        </div>
        {/* jacket — press hex + press logo */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: size, height: size,
          background: GOLD, border: `1px solid ${HAIRLINE}`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
        }}>
          <img src={mrpLogoAsset} alt="" style={{ width: '46%', height: '46%', objectFit: 'contain' }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', width: Math.round(size * 1.5), height: size, display: 'flex', justifyContent: 'center' }} aria-hidden>
      {/* disc peek */}
      <div style={{ position: 'absolute', left: Math.round(size * 0.42), top: size * 0.03, width: disc, height: disc, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
        <img src={rubyVinylPhoto} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '40%', height: '40%', borderRadius: '50%', overflow: 'hidden' }}>
          <img src={niinaLabelArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#161617' }} />
        </div>
      </div>
      {/* square jacket */}
      <img src={californialandCover} alt="Californialand cover" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: 0, objectFit: 'cover', boxShadow: '0 8px 28px rgba(0,0,0,0.22)' }} />
    </div>
  );
}

// ─── The affordance excerpt (section 1) ──────────────────────────────
// A cropped slice of the estimate page header zone: estimate meta, prepared-
// for line, and the action row. The one filled gold action stays "Start this
// project"; "Download estimate (PDF)" is a QUIET control beside the share
// links. Renders inside a mock browser frame so Bill reads it as "on page".
function AffordanceExcerpt() {
  return (
    <div style={{ borderRadius: 0, overflow: 'hidden', border: `1px solid ${HAIRLINE}`, background: CANVAS, boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }}>
      {/* mock browser chrome */}
      <div style={{ height: 34, background: CARD_RAISED, borderBottom: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#e0ddd2' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#e0ddd2' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#e0ddd2' }} />
        <div style={{ marginLeft: 10, height: 20, flex: 1, maxWidth: 340, background: CANVAS, border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 10.5, color: SUBINK }}>
          memphisvinyl.com/estimate/{MOCK_TOKEN}
        </div>
      </div>

      {/* cropped page content */}
      <div style={{ padding: '26px 30px 30px' }}>
        {/* estimate meta — top right */}
        <div style={{ textAlign: 'right', fontSize: 11.5, color: SUBINK, lineHeight: 1.7 }}>
          <div>Estimate <span style={{ color: INK, fontWeight: 600 }}>{MOCK_ESTIMATE_NO}</span></div>
          <div>Valid until <span style={{ color: INK }}>{MOCK_VALID_UNTIL}</span></div>
        </div>

        {/* prepared for */}
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 50, height: 50, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }} aria-hidden>
            <img src={californialandCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </span>
          <div>
            <Eyebrow>Prepared for</Eyebrow>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, marginTop: 4 }}>{MOCK_CLIENT_FULL}</div>
            <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 5 }}>{MOCK_JOB} — {MOCK_SPEC}</div>
          </div>
        </div>

        <Rule mt={24} />

        {/* the action row — mirrors the live estimate page footer.
            QUIET: Share · Download estimate (PDF) · Ask a question.
            FILLED (the one accent action): Start this project. */}
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
          <button type="button" style={quietLink} data-testid="affordance-share">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v13" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>
            Share
          </button>

          {/* THE AFFORDANCE — the download control, quiet on purpose */}
          <button type="button" style={quietLink} data-testid="affordance-download">
            <DownloadIcon size={14} />
            Download estimate (PDF)
          </button>

          <button type="button" style={quietLink} data-testid="affordance-ask">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Ask {MOCK_PREPARED_BY.split(' ')[0]} a question
          </button>

          <button
            type="button"
            data-testid="affordance-start"
            style={{ padding: '11px 24px', borderRadius: 0, border: 'none', cursor: 'pointer', background: GOLD, color: INK, fontSize: 14, fontWeight: 700 }}
          >
            Start this project
          </button>
        </div>
      </div>
    </div>
  );
}

const quietLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
  padding: 0, cursor: 'pointer', fontSize: 13, color: SUBINK,
};

// ─── The document: shared header block (top of every sheet, page 1) ──
function DocLetterhead() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img src={mrpLogoAsset} alt={MOCK_PRESS} style={{ width: 46, height: 46 }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2, color: INK }}>{MOCK_PRESS}</div>
          <div style={{ fontSize: 10.5, color: SUBINK, marginTop: 3, lineHeight: 1.6 }}>
            3015 Brother Blvd · Memphis, TN 38133<br />901.821.9099 · memphisvinyl.com
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <Eyebrow color={GOLD}>Estimate</Eyebrow>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 2 }}>{MOCK_ESTIMATE_NO}</div>
      </div>
    </div>
  );
}

// One table row (per-record / setup line). `dense` for setup sub-lines.
function LineRow({ name, note, right, dense }: { name: string; note?: string; right: string; dense?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: dense ? '4px 0' : '5px 0', borderTop: `1px solid ${HAIRLINE}` }}>
      <div style={{ lineHeight: 1.25 }}>
        <div style={{ fontSize: dense ? 11.5 : 12.5, color: dense ? SUBINK : INK, fontWeight: dense ? 400 : 500 }}>{name}</div>
        {note && <div style={{ fontSize: 10.5, color: SUBINK, marginTop: 0 }}>{note}</div>}
      </div>
      <div style={{ fontSize: dense ? 11.5 : 12.5, color: dense ? SUBINK : INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{right}</div>
    </div>
  );
}

// The single table's column header — repeated on page 2 for honest pagination.
function TableHeader({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '7px 0 9px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: SUBINK }}>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: SUBINK }}>Per unit</div>
    </div>
  );
}

// Prepared-by + fine-print footer block for the paper. Pinned to the bottom
// of the sheet via flex (content above; footer never overlaps).
function DocFootBlock({ pageLabel }: { pageLabel: string }) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
      <Rule />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 10 }}>
        <div style={{ fontSize: 10, color: SUBINK, lineHeight: 1.6 }}>
          <div>Prices valid until {MOCK_VALID_UNTIL}. This estimate is valid for 30 days.</div>
          <div>All orders are subject to +/- 10% and billed accordingly.</div>
          <div>Estimate {MOCK_ESTIMATE_NO} · {MOCK_TOKEN}</div>
          {/* the approved link line — token IS the key; view without sign-in */}
          <div style={{ color: INK }}>View this estimate online: memphisvinyl.com/estimate/{MOCK_TOKEN}</div>
        </div>
        <div style={{ fontSize: 10.5, color: SUBINK, whiteSpace: 'nowrap' }}>{pageLabel}</div>
      </div>
    </div>
  );
}

// ─── A full paper sheet wrapper ──────────────────────────────────────
// Flex column: sheet content flows top-down, the footer block sits at the
// bottom. Fixed US Letter proportion; content is tuned to fit.
function Paper({ children, testid }: { children: React.ReactNode; testid: string }) {
  return (
    <div
      data-testid={testid}
      style={{
        width: PAPER_W, height: PAPER_H, background: CANVAS,
        boxShadow: '0 18px 50px rgba(0,0,0,0.16)', border: `1px solid ${HAIRLINE}`,
        display: 'flex', flexDirection: 'column', padding: '40px 44px 30px', overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// The FULL document. `withArt` swaps the record mock; `longBuild` adds the
// extra component lines (which flow onto a second sheet with repeated header).
function DocumentSheets({ withArt, longBuild, multiQty, presaleCta }: { withArt: boolean; longBuild: boolean; multiQty: boolean; presaleCta: PresaleCta }) {
  const unitLines = longBuild ? [...UNIT_LINES, ...LONG_EXTRA_LINES] : UNIT_LINES;
  const unitCost = unitLines.reduce((a, l) => a + l.amount, 0);
  const subtotal = unitCost * MOCK_QTY;
  const total = subtotal + SETUP_TOTAL;

  // Honest page count: run options add ONE final sheet, never squeezed in.
  const pageCount = 1 + (longBuild ? 1 : 0) + (multiQty ? 1 : 0);
  const pageOf = (n: number) => `Page ${n} of ${pageCount}`;

  // Page-1 line budget for the long build: keep first N lines on page 1,
  // spill the rest onto page 2 (honest pagination, repeated column header).
  const PAGE1_LINES = 8;
  const page1Lines = longBuild ? unitLines.slice(0, PAGE1_LINES) : unitLines;
  const page2Lines = longBuild ? unitLines.slice(PAGE1_LINES) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
      {/* ── PAGE 1 ── */}
      <Paper testid="doc-page-1">
        <DocLetterhead />
        <Rule mt={18} color={GOLD_RULE} />

        {/* prepared-for + record mock, side by side (stacked blocks) */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <Eyebrow>Prepared for</Eyebrow>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, marginTop: 4 }}>{MOCK_CLIENT_FULL}</div>
            <div style={{ fontSize: 12, color: SUBINK, marginTop: 6, lineHeight: 1.6 }}>
              {MOCK_JOB}<br />{MOCK_SPEC}
            </div>
          </div>
          {/* Bigger art (Bill, Aug 22 2026): the record mock earns the white
              space on page 1 instead of leaving it empty. */}
          <RecordMock size={150} withArt={withArt} />
        </div>

        {/* the ONE table: per-record breakdown */}
        <div style={{ marginTop: 18 }}>
          <TableHeader label={longBuild ? 'Per record — continued below' : 'Per record'} />
          <div style={{ borderBottom: `1px solid ${HAIRLINE}` }} />
          {page1Lines.map((l) => (
            <LineRow key={l.id} name={l.name} note={l.note} right={money2(l.amount)} />
          ))}
          {!longBuild && (
            <>
              {/* setup lines live in the same table on the single-page build */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0 2px', borderTop: `2px solid ${RULE_STRONG}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>Setup costs</div>
                <div style={{ fontSize: 10.5, color: SUBINK }}>One-time · same at any run size</div>
              </div>
              {SETUP_LINES.map((l) => (
                <LineRow key={l.id} name={l.name} note={l.note} right={l.amount === 0 ? 'Included' : money(l.amount)} dense />
              ))}
              <TotalsBlock unitCost={unitCost} subtotal={subtotal} total={total} />
              <PresaleCallout cta={presaleCta} />
            </>
          )}
        </div>

        {/* prepared-by block (only on page 1) */}
        <div style={{ marginTop: 16 }}>
          <Rule />
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <Eyebrow>Prepared by</Eyebrow>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{MOCK_PREPARED_BY}</div>
              <div style={{ fontSize: 11, color: SUBINK, marginTop: 1 }}>{MOCK_PRESS} · {MOCK_DATE}</div>
            </div>
            {longBuild && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: SUBINK }}>
                <span style={{ display: 'inline-flex' }}><ArrowContinue /></span>
                Breakdown continues on page 2
              </div>
            )}
          </div>
        </div>

        <DocFootBlock pageLabel={pageOf(1)} />
      </Paper>

      {/* ── PAGE 2 (long build only) ── honest pagination ── */}
      {longBuild && (
        <Paper testid="doc-page-2">
          {/* slim running header so page 2 stands on its own */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={mrpLogoAsset} alt="" style={{ width: 26, height: 26 }} aria-hidden />
              <div style={{ fontSize: 12, fontWeight: 600 }}>{MOCK_PRESS}</div>
            </div>
            <div style={{ fontSize: 11, color: SUBINK }}>Estimate {MOCK_ESTIMATE_NO} · {MOCK_JOB}</div>
          </div>
          <Rule mt={14} color={GOLD_RULE} />

          {/* repeated column header — the honest-pagination requirement */}
          <div style={{ marginTop: 16 }}>
            <TableHeader label="Per record — continued" />
            <div style={{ borderBottom: `1px solid ${HAIRLINE}` }} />
            {page2Lines.map((l) => (
              <LineRow key={l.id} name={l.name} note={l.note} right={money2(l.amount)} />
            ))}

            {/* setup lines close out the table on page 2 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0 3px', borderTop: `2px solid ${RULE_STRONG}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>Setup costs</div>
              <div style={{ fontSize: 10.5, color: SUBINK }}>One-time · same at any run size</div>
            </div>
            {SETUP_LINES.map((l) => (
              <LineRow key={l.id} name={l.name} note={l.note} right={l.amount === 0 ? 'Included' : money(l.amount)} dense />
            ))}

            <TotalsBlock unitCost={unitCost} subtotal={subtotal} total={total} />
            <PresaleCallout cta={presaleCta} />
          </div>

          <DocFootBlock pageLabel={pageOf(2)} />
        </Paper>
      )}

      {/* ── RUN OPTIONS (final sheet, multi-quantity only) ──
          The learned answer to MRP's crammed quantity columns and
          Hellbender's page-per-option re-quotes: the story stays with the
          prepared run; other sizes get ONE compact comparison. */}
      {multiQty && (
        <Paper testid="doc-page-options">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={mrpLogoAsset} alt="" style={{ width: 26, height: 26 }} aria-hidden />
              <div style={{ fontSize: 12, fontWeight: 600 }}>{MOCK_PRESS}</div>
            </div>
            <div style={{ fontSize: 11, color: SUBINK }}>Estimate {MOCK_ESTIMATE_NO} · {MOCK_JOB}</div>
          </div>
          <Rule mt={14} color={GOLD_RULE} />

          <div style={{ marginTop: 18 }}>
            <Eyebrow>Run options</Eyebrow>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, marginTop: 5 }}>
              The same build, at other run sizes.
            </div>
            <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 6, lineHeight: 1.6, maxWidth: 520 }}>
              Setup is one-time and identical at every size — bigger runs only spread it thinner.
              This estimate is priced for the prepared run below.
            </div>

            {/* comparison table — one row per quantity; the prepared run is
                marked with a word + check, never color alone */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr 1fr 1.2fr', gap: 12, padding: '7px 0 9px' }}>
                {['Quantity', 'Per unit', 'Run subtotal', 'Setup', 'Total'].map((h, i) => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: SUBINK, textAlign: i === 0 ? 'left' : 'right' }}>{h}</div>
                ))}
              </div>
              {RUN_OPTIONS.map((o) => {
                const perUnit = unitCost * o.factor;
                const runSub = perUnit * o.qty;
                const runTotal = runSub + SETUP_TOTAL;
                return (
                  <div
                    key={o.qty}
                    style={{
                      display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr 1fr 1.2fr', gap: 12, alignItems: 'baseline',
                      padding: '10px 12px', borderTop: `1px solid ${HAIRLINE}`,
                      background: o.prepared ? `linear-gradient(180deg, ${GOLD_TINT_TOP} 0%, ${CARD} 100%)` : 'transparent',
                      border: o.prepared ? `1px solid ${GOLD_RULE}` : undefined,
                      margin: o.prepared ? '4px 0' : 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{o.qty.toLocaleString()}</span>
                      {o.prepared && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#8a7a1f' }}>
                          <CheckIcon size={11} /> This estimate
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money2(perUnit)}</div>
                    <div style={{ fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(runSub)}</div>
                    <div style={{ fontSize: 12.5, color: SUBINK, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(SETUP_TOTAL)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(runTotal)}</div>
                  </div>
                );
              })}
              <div style={{ borderTop: `1px solid ${HAIRLINE}` }} />
              <div style={{ fontSize: 10.5, color: SUBINK, marginTop: 10, lineHeight: 1.6 }}>
                Want one of these instead? Reply to {MOCK_PREPARED_BY.split(' ')[0]} or choose the quantity on your estimate page — no new paperwork needed.
              </div>
            </div>
          </div>

          <DocFootBlock pageLabel={pageOf(pageCount)} />
        </Paper>
      )}
    </div>
  );
}

function ArrowContinue() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
    </svg>
  );
}

// Run subtotal, per-unit, and the gold-tinted total — the numbers that beat
// the Excel sheet on hierarchy.
// ─── The $0-out-of-pocket presale callout (Bill, Aug 22 2026) ───────
// Sits directly under the estimate total — the moment the number lands is
// the moment the reader wants a way around it. Printed line, not a button
// (this is paper); quiet gold-ruled box so the total band stays loudest.
// Three CTA wordings to compare; `cta` picks one.
export type PresaleCta = 'ask' | 'how' | 'presale';
const PRESALE_CTAS: Record<PresaleCta, string> = {
  ask: `Ask ${MOCK_PREPARED_BY.split(' ')[0]} how`,
  how: 'See how it works — memphisvinyl.com/presale',
  presale: 'Start a presale on your estimate page',
};
function PresaleCallout({ cta }: { cta: PresaleCta }) {
  return (
    <div style={{ marginTop: 10, padding: '11px 16px', border: `1px solid ${GOLD_RULE}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }} data-testid="doc-presale-callout">
      <div style={{ lineHeight: 1.55 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Want this run with $0 out of pocket — and no financing? </span>
        <span style={{ fontSize: 11.5, color: SUBINK }}>Fans preorder first; the presale covers the press bill before anything ships.</span>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', color: '#8a7a1f' }}>{PRESALE_CTAS[cta]} →</div>
    </div>
  );
}

function TotalsBlock({ unitCost, subtotal, total }: { unitCost: number; subtotal: number; total: number }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '9px 0 3px', borderTop: `2px solid ${RULE_STRONG}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Run subtotal</div>
        <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{MOCK_QTY.toLocaleString()} units · {money(subtotal)}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '2px 0' }}>
        <div style={{ fontSize: 12, color: SUBINK }}>Per unit (all-in, before setup) · setup {money(SETUP_TOTAL)} one-time</div>
        <div style={{ fontSize: 12, color: SUBINK, fontVariantNumeric: 'tabular-nums' }}>{money2(unitCost)}</div>
      </div>
      {/* the total — gold-tinted band, the loudest thing on the page */}
      <div style={{ marginTop: 8, padding: '12px 16px', background: `linear-gradient(180deg, ${GOLD_TINT_TOP} 0%, ${CARD} 100%)`, border: `1px solid ${GOLD_RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: '#8a7a1f' }}>Estimate total</div>
          <div style={{ fontSize: 11, color: SUBINK, marginTop: 2 }}>Prepared quantity · {MOCK_QTY.toLocaleString()} units</div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.6, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</div>
      </div>
    </>
  );
}

// ─── Mock-only state chip ────────────────────────────────────────────
function Chip({ active, onClick, icon, children, testid }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; testid: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 0, cursor: 'pointer',
        fontSize: 12.5, fontWeight: 600,
        background: active ? GOLD : CANVAS,
        color: active ? INK : SUBINK,
        border: active ? `1.5px solid ${GOLD}` : `1px solid ${HAIRLINE}`,
      }}
    >
      <span style={{ display: 'inline-flex', width: 15, justifyContent: 'center' }}>{active ? <CheckIcon /> : icon}</span>
      {children}
    </button>
  );
}

// ─── Sticky section nav ──────────────────────────────────────────────
const SECTIONS = [
  { id: 'affordance', label: 'The affordance' },
  { id: 'document', label: 'The document' },
  { id: 'states', label: 'States' },
];

export default function PressEstimateDownloadMRP() {
  const [withArt, setWithArt] = useState(true);
  // Two pages is the DEFAULT (Bill, Aug 22 2026): PDFs are meant to be
  // printable, so the document leads with the honest two-sheet build.
  const [longBuild, setLongBuild] = useState(true);
  const [multiQty, setMultiQty] = useState(false);
  const [presaleCta, setPresaleCta] = useState<PresaleCta>('ask');

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ minHeight: '100vh', background: GROUND, color: INK, fontFamily: FONT }}>
      {/* ── Sticky section nav (plain scroll fallback still works) ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(236,234,227,0.86)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <img src={mrpLogoAsset} alt="" style={{ width: 24, height: 24 }} aria-hidden />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Download estimate</span>
          </div>
          <nav style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                data-testid={`nav-${s.id}`}
                style={{ padding: '7px 13px', borderRadius: 0, border: `1px solid ${HAIRLINE}`, background: CANVAS, cursor: 'pointer', fontSize: 12.5, color: SUBINK, fontWeight: 500 }}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 100px' }}>
        {/* ── SECTION 1: THE AFFORDANCE ── */}
        <section id="affordance" style={{ scrollMarginTop: 72 }}>
          <Eyebrow color={GOLD}>Section 1</Eyebrow>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, margin: '6px 0 0' }}>
            The affordance <span style={{ color: SUBINK, fontWeight: 700 }}>where download lives.</span>
          </h2>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '10px 0 0', lineHeight: 1.6, maxWidth: 620 }}>
            This replaces the emailed PDF attachment. On the client estimate page, downloading is a quiet control
            beside Share and Ask — the one filled action stays{' '}
            <span style={{ color: INK, fontWeight: 600 }}>Start this project</span>.
          </p>
          <div style={{ marginTop: 22 }}>
            <AffordanceExcerpt />
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: SUBINK }}>
            <span style={{ display: 'inline-flex', color: INK }}><DownloadIcon size={14} /></span>
            Reads as <span style={{ color: INK, fontWeight: 600 }}>&ldquo;Download estimate (PDF)&rdquo;</span> — the word carries the meaning; the icon confirms it. Never a bare glyph.
          </div>
        </section>

        {/* ── SECTION 2: THE DOCUMENT ── */}
        <section id="document" style={{ scrollMarginTop: 72, marginTop: 56 }}>
          <Eyebrow color={GOLD}>Section 2</Eyebrow>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, margin: '6px 0 0' }}>
            The document <span style={{ color: SUBINK, fontWeight: 700 }}>the client downloads.</span>
          </h2>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '10px 0 0', lineHeight: 1.6, maxWidth: 620 }}>
            A print-ready estimate on US&nbsp;Letter — MRP letterhead, the record mock-up, one expanded table, and a
            prepared-by block. Stacked blocks and a single table, so it renders straight from pdfkit.
          </p>
          <div style={{ marginTop: 30 }}>
            <DocumentSheets withArt={withArt} longBuild={longBuild} multiQty={multiQty} presaleCta={presaleCta} />
          </div>
        </section>

        {/* ── SECTION 3: STATES ── */}
        <section id="states" style={{ scrollMarginTop: 72, marginTop: 56 }}>
          <Eyebrow color={GOLD}>Section 3</Eyebrow>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, margin: '6px 0 0' }}>
            States <span style={{ color: SUBINK, fontWeight: 700 }}>the document has to handle.</span>
          </h2>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '10px 0 6px', lineHeight: 1.6, maxWidth: 620 }}>
            Mock-only toggles. Flip them and the paper above re-renders — with or without artwork, single sheet or a
            long build that spills honestly onto page&nbsp;2.
          </p>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: SUBINK, marginBottom: 8, fontWeight: 600 }}>Artwork</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Chip active={withArt} onClick={() => setWithArt(true)} testid="chip-with-art" icon={<ArtIcon />}>With art</Chip>
                <Chip active={!withArt} onClick={() => setWithArt(false)} testid="chip-without-art" icon={<PlaceholderIcon />}>Without art — house placeholder</Chip>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: SUBINK, marginBottom: 8, fontWeight: 600 }}>Build length</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Chip active={longBuild} onClick={() => setLongBuild(true)} testid="chip-long-build" icon={<TwoPageIcon />}>Two sheets — default</Chip>
                <Chip active={!longBuild} onClick={() => setLongBuild(false)} testid="chip-single-page" icon={<OnePageIcon />}>Short build — single sheet</Chip>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: SUBINK, marginBottom: 8, fontWeight: 600 }}>Quantities</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Chip active={!multiQty} onClick={() => setMultiQty(false)} testid="chip-one-run" icon={<OnePageIcon />}>One run — as prepared</Chip>
                <Chip active={multiQty} onClick={() => setMultiQty(true)} testid="chip-run-options" icon={<TwoPageIcon />}>Run options — comparison sheet</Chip>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: SUBINK, marginBottom: 8, fontWeight: 600 }}>Presale CTA — under the total</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Chip active={presaleCta === 'ask'} onClick={() => setPresaleCta('ask')} testid="chip-cta-ask" icon={<CheckIcon size={12} />}>&ldquo;Ask Brandon how&rdquo;</Chip>
                <Chip active={presaleCta === 'how'} onClick={() => setPresaleCta('how')} testid="chip-cta-how" icon={<CheckIcon size={12} />}>&ldquo;See how it works&rdquo; + URL</Chip>
                <Chip active={presaleCta === 'presale'} onClick={() => setPresaleCta('presale')} testid="chip-cta-presale" icon={<CheckIcon size={12} />}>&ldquo;Start a presale&rdquo; — estimate page</Chip>
              </div>
            </div>
          </div>

          {/* what the active state means — word + icon, honest note */}
          <div style={{ marginTop: 22, padding: '14px 16px', background: CANVAS, border: `1px solid ${HAIRLINE}`, borderRadius: 0, display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 620 }}>
            <span style={{ display: 'inline-flex', color: INK, marginTop: 1 }}><PdfIcon size={18} /></span>
            <div style={{ fontSize: 12.5, color: SUBINK, lineHeight: 1.6 }}>
              <span style={{ color: INK, fontWeight: 600 }}>
                {longBuild ? 'Two-sheet estimate' : 'One-sheet estimate'}{withArt ? ', with artwork.' : ', artwork to come.'}
              </span>{' '}
              {longBuild
                ? 'Component lines spill onto page 2; the column header repeats and the footer reads “Page 2 of 2.”'
                : 'Everything fits on a single US Letter page; the footer reads “Page 1 of 1.”'}
              {' '}
              {withArt ? '' : 'MRP\u2019s logo on its house color stands in — jacket and center label — until Niina uploads final art.'}
              {multiQty ? ' A final Run options sheet compares 500 / 1,000 / 2,000 — the prepared run is marked \u201cThis estimate.\u201d' : ''}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── State-chip icons (word + icon, never color alone) ───────────────
function ArtIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="0" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function PlaceholderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2.5" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="0" />
    </svg>
  );
}
function OnePageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
    </svg>
  );
}
function TwoPageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3h6l4 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M15 3v5h4" /><path d="M5 7v12a2 2 0 0 0 2 2h8" />
    </svg>
  );
}
