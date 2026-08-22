// CORNER RULING (Bill, Aug 21 2026): Memphis's corner token = SQUARE across
// the whole MRP skin — buttons, inputs, cards, pills. Only true circles
// (avatars, status icons, the frosted x) stay round.
// PressClientEstimateMRP — the WHITE-LABEL (Memphis Record Pressing) flavor
// of the client estimate page. Bill's ask (Aug 21 2026): same dark page,
// MRP's look and feel — gold accent #D9C153 (eyedropped from
// memphisrecordpressing.com — Andrew, Aug 21 2026) replaces GoodTunes blue; filled gold actions carry dark ink
// like MRP's own "GET A QUOTE" button. Layout, copy, numbers, and wiring are
// otherwise identical to PressClientEstimate — keep the two in lockstep.
// UNLOCKED by Bill (Aug 18 2026) — the Aug-16 lock stands for layout, but
// Bill ok'd wiring the actions: Share is a quiet dialog (private link, no
// account), Ask a question is Brandon's card, Start this project is a
// confirm sheet, and the GoodTunes hook became ONE quiet line under the
// total. Everything else stays pixel-identical.
// PressClientEstimate — the estimate a press client actually receives.
// Bill's brief (Aug 16 2026): based on the real MRP quote PDF
// (071526-02, Niina Soleil single LP). One page, client-facing, dark.
// - Click any quantity tier and every price updates live.
// - "Setup costs" is one line; the chevron reveals the fixed-cost breakdown.
// - "Prepared for" name comes from the client record (Spotify import etc. —
//   mocked here as Alma Rivera).
// - Action at the bottom is a placeholder "Start this project" (exact
//   action TBD with Bill).
// Self-contained per handoff rules. Numbers from the MRP PDF at 1,000 units;
// other tiers scale with the standard qty curve.

import { useCallback, useMemo, useRef, useState } from 'react';
import californialandCover from './assets/californialand-cover.jpg';
import rubyVinylPhoto from './assets/mrp-ruby-translucent.png';
import innerSleeveArt from './assets/californialand-inner-sleeve.png';
import niinaLabelArt from './assets/niina-label-1.png';
import mrpLogoAsset from './assets/mrp-logo.svg';
import brandonPhoto from './assets/brandon-seavers.png';

// ─── Mock data (from the MRP estimate PDF) ───────────────────────────
const MOCK_CLIENT_FIRST = 'Niina';
const MOCK_CLIENT_FULL = 'Niina Soleil';
const MOCK_CLIENT_EMAIL = 'niina@soleilmusic.com';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_DATE = 'August 24, 2026';
const MOCK_VALID_UNTIL = 'September 23, 2026';
const MOCK_PREPARED_BY = 'Brandon Seavers';
const MOCK_JOB = 'Californialand';
const MOCK_SPEC = '12" · 140g · Ruby translucent · 1 LP';

// Per-unit line items at the 1,000-unit tier (PDF "DESCRIPTION" block).
const UNIT_LINES = [
  { id: 'vinyl',    name: '12" LP · 140g color vinyl',            note: 'Translucent ruby, single LP',                 at1000: 2.30 },
  { id: 'labels',   name: 'Center labels · full color',           note: 'Printed before pressing',                     at1000: 0.25 },
  { id: 'sleeve',   name: 'Inner sleeve · full color',            note: '100# gloss text',                             at1000: 0.81 },
  { id: 'jacket',   name: 'Single jacket · full color',           note: '20pt board, semi-gloss',                      at1000: 0.81 },
  { id: 'insert',   name: 'Insert · 12"×12" full color',          note: '100# cover',                                  at1000: 0.67 },
  { id: 'assembly', name: 'Assembly',                             note: 'Insert placed on top before shrink',          at1000: 0.36 },
  { id: 'shrink',   name: 'Shrinkwrap',                           note: 'Retail-ready seal',                           at1000: 0.17 },
];

// Fixed setup costs (PDF "FIXED SETUP COSTS" block) — quantity-independent.
const SETUP_LINES = [
  { id: 'cutting',  name: 'Lacquer cutting',   amount: 650 },
  { id: 'plating',  name: 'Lacquer plating',   amount: 375 },
  { id: 'test',     name: 'Test pressing',     amount: 175, note: 'Includes 2-day domestic shipping' },
  { id: 'stampers', name: 'Stampers',          amount: 0 },
  { id: 'color',    name: 'Color setup fee',   amount: 95 },
];
const SETUP_TOTAL = SETUP_LINES.reduce((a, l) => a + l.amount, 0);

const QUANTITIES = [100, 300, 500, 1000, 2000, 3000];

// Same discount curve as the quote builder, anchored so 1,000 = PDF prices.
function tierScale(qty: number): number {
  const raw = qty <= 100 ? 1.0 : qty <= 300 ? 0.88 : qty <= 500 ? 0.8 : qty <= 1000 ? 0.7 : qty <= 2000 ? 0.62 : 0.55;
  return raw / 0.7; // anchor: 1,000-unit tier matches the PDF exactly
}
const unitLineAt = (at1000: number, qty: number) => at1000 * tierScale(qty);
const unitCostAt = (qty: number) => UNIT_LINES.reduce((a, l) => a + unitLineAt(l.at1000, qty), 0);

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const money2 = (n: number) => `$${n.toFixed(2)}`;

// ─── Palette (canon charcoal, dark-only — this is what the client gets) ──
const CANVAS = '#ffffff'; // MRP pages are pure white (Andrew, Aug 21 2026)
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const BLUE = '#D9C153'; // MRP white-label accent — gold replaces GoodTunes blue everywhere

// Hover spin + rewind (self-contained lite copy of the builder's hook).
const SPIN_DPS = 360 / 8000;
function useSpin() {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const [showRewind, setShowRewind] = useState(false);
  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null; lastRef.current = null;
  }, []);
  const loop = useCallback((ts: number) => {
    if (lastRef.current !== null) {
      angleRef.current += (ts - lastRef.current) * SPIN_DPS;
      if (bodyRef.current) bodyRef.current.style.transform = `rotate(${angleRef.current}deg)`;
    }
    lastRef.current = ts;
    rafRef.current = requestAnimationFrame(loop);
  }, []);
  const onEnter = useCallback(() => { setShowRewind(false); stop(); rafRef.current = requestAnimationFrame(loop); }, [loop, stop]);
  const onLeave = useCallback(() => {
    stop();
    if (((angleRef.current % 360) + 360) % 360 > 0.5) setShowRewind(true);
  }, [stop]);
  const rewind = useCallback(() => {
    stop();
    const from = angleRef.current;
    const target = Math.floor(from / 360) * 360;
    const t0 = performance.now();
    const step = (ts: number) => {
      const t = Math.min(1, (ts - t0) / 700);
      angleRef.current = from + (target - from) * (1 - Math.pow(1 - t, 3));
      if (bodyRef.current) bodyRef.current.style.transform = `rotate(${angleRef.current}deg)`;
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else { angleRef.current = 0; setShowRewind(false); }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [stop]);
  return { bodyRef, onEnter, onLeave, showRewind, rewind };
}

const BLUE_TINT_TOP = 'rgba(217,193,83,0.12)';
// Inset hairline — lines stop short of the card edges (Bill, Aug 16 2026).
function InsetRule() {
  return <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}>
      <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke={SUBINK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Canon circled × — frosted circle, hairline ring. ONE dismissal grammar
// across every sheet on this page (Bill, Aug 19 2026).
function CloseX({ onClose, testid }: { onClose: () => void; testid: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      data-testid={testid}
      style={{
        position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        background: 'rgba(30,30,32,0.55)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(0,0,0,0.18)', color: '#1d1d1f',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// ─── Quiet Apple sheet — shared by the wired actions (Bill, Aug 18) ──
// Dismissal is the canon circled × top-right (Bill, Aug 19) — no text
// Cancel/Close buttons anywhere.
function Sheet({ children, onClose, testid, width = 400 }: { children: React.ReactNode; onClose: () => void; testid: string; width?: number }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 24 }}
      onClick={onClose}
      data-testid={testid}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width, maxWidth: '100%', borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, boxShadow: '0 32px 80px rgba(0,0,0,0.18)', padding: 26 }}
      >
        <CloseX onClose={onClose} testid={`${testid}-close`} />
        {children}
      </div>
    </div>
  );
}

// Field + button treatments (dark, canon quiet).
const fieldStyle: React.CSSProperties = {
  width: '100%', height: 38, borderRadius: 0, padding: '0 12px', fontSize: 13.5,
  background: CANVAS, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none',
};
// Confirm earns its blue only once the user has done something actionable.
const confirmBtn = (earned: boolean): React.CSSProperties => ({
  padding: '10px 22px', borderRadius: 0, fontSize: 13.5, fontWeight: 600,
  cursor: earned ? 'pointer' : 'not-allowed',
  background: earned ? BLUE : 'transparent',
  border: earned ? '1px solid transparent' : `1px solid ${HAIRLINE}`,
  color: earned ? '#1d1d1f' : SUBINK,
});

export default function PressClientEstimateMRP() {
  const [qty, setQty] = useState(1000);
  const [setupOpen, setSetupOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Wired actions (Bill, Aug 18 2026)
  const [shareOpen, setShareOpen] = useState(false);
  const [shareName, setShareName] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [shareSent, setShareSent] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askMsg, setAskMsg] = useState('');
  const [askSent, setAskSent] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  // The link-not-login rule flips HERE (Bill, Aug 19 2026): viewing was
  // login-free; starting the project is where the account begins.
  const [startStep, setStartStep] = useState<'confirm' | 'account' | 'done'>('confirm');
  const [acctName, setAcctName] = useState(MOCK_CLIENT_FULL);
  const [acctEmail, setAcctEmail] = useState(MOCK_CLIENT_EMAIL);
  const [acctPassword, setAcctPassword] = useState('');
  const [hookOpen, setHookOpen] = useState(false);
  const spin = useSpin();

  const shareEarned = /.+@.+\..+/.test(shareEmail.trim());
  const closeShare = () => { setShareOpen(false); setShareSent(false); setShareName(''); setShareEmail(''); };
  const closeAsk = () => { setAskOpen(false); setAskSent(false); setAskMsg(''); };
  const closeStart = () => {
    setStartOpen(false); setStartStep('confirm');
    setAcctName(MOCK_CLIENT_FULL); setAcctEmail(MOCK_CLIENT_EMAIL); setAcctPassword('');
  };
  const firstName = MOCK_PREPARED_BY.split(' ')[0];

  const unitCost = useMemo(() => unitCostAt(qty), [qty]);
  const subtotal = unitCost * qty;
  const total = subtotal + SETUP_TOTAL;

  return (
    <div style={{ minHeight: '100vh', background: CANVAS, color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ── Header: estimate meta only — the press identity moved to the
            footer (Bill, Aug 19 2026) so the top doesn't compete with the
            artist's cover/identity. ── */}
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 24 }}>
          <div style={{ textAlign: 'right', fontSize: 12, color: SUBINK, lineHeight: 1.7 }}>
            <div>Estimate <span style={{ color: INK, fontWeight: 600 }}>{MOCK_ESTIMATE_NO}</span></div>
            <div>{MOCK_DATE}</div>
            <div>Valid until <span style={{ color: INK }}>{MOCK_VALID_UNTIL}</span></div>
          </div>
        </header>

        {/* ── Prepared for ── */}
        <section style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }} aria-hidden>
            <img src={californialandCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </span>
          <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: SUBINK }}>Prepared for</div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.4, margin: '6px 0 0' }}>{MOCK_CLIENT_FULL}</h1>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '8px 0 0' }}>
            {MOCK_JOB} — {MOCK_SPEC} · Prepared by {MOCK_PREPARED_BY}
          </p>
          </div>
        </section>

        {/* ── The record ── */}
        <section style={{ marginTop: 36, display: 'flex', justifyContent: 'center' }}>
          <div className="group" style={{ position: 'relative', width: 430, height: 296 }} data-testid="estimate-album-stage">
            {/* record — spins on hover under a fixed shine */}
            <div
              className="absolute transition-transform duration-500 ease-out group-hover:translate-x-8"
              style={{ left: 128, top: 6, width: 280, height: 280 }}
              onPointerEnter={spin.onEnter}
              onPointerLeave={spin.onLeave}
            >
              <div style={{ position: 'relative', width: 280, height: 280, borderRadius: '50%', overflow: 'hidden' }}>
                <div ref={spin.bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', willChange: 'transform' }}>
                  <img src={rubyVinylPhoto} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }} />
                  {/* her label — covers the photo's baked-in MRP label, spins with the record */}
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '40%', height: '40%', borderRadius: '50%', overflow: 'hidden' }}>
                    <img src={niinaLabelArt} alt="" aria-hidden style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: '50%', background: '#161617' }} />
                  </div>
                </div>
                {/* fixed sheen — same highlight pass as the builder page */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundColor: '#ffffff', opacity: 0.6,
                  maskImage: 'url(/__mockup/vinyl-layers/vinyl-highlights.png)',
                  WebkitMaskImage: 'url(/__mockup/vinyl-layers/vinyl-highlights.png)',
                  maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
                  maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
                }} />
              </div>
            </div>
            {/* inner sleeve — peeking between jacket and record */}
            <div className="absolute transition-transform duration-500 ease-out group-hover:translate-x-5" style={{ left: 26, top: 5, width: 284, height: 284, borderRadius: 0, overflow: 'hidden', border: '1px solid #222', boxShadow: '0 1px 8px rgba(0,0,0,0.4)' }} aria-hidden>
              <img src={innerSleeveArt} alt="" aria-hidden style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <img
              src={californialandCover}
              alt="Californialand cover"
              style={{ position: 'absolute', left: 0, top: 0, width: 288, height: 288, borderRadius: 0, objectFit: 'cover', boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 2 }}
            />
            {/* rewind */}
            <button
              type="button"
              onClick={spin.rewind}
              aria-label="Rewind record to start"
              data-testid="estimate-rewind"
              style={{
                position: 'absolute', right: 8, bottom: 2, zIndex: 5,
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: CARD, border: `1px solid ${HAIRLINE}`, color: SUBINK, cursor: 'pointer',
                opacity: spin.showRewind ? 1 : 0, pointerEvents: spin.showRewind ? 'auto' : 'none',
                transform: spin.showRewind ? 'scale(1)' : 'scale(0.9)', transition: 'all 0.25s ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </section>

        {/* ── Quantity tiers — tap a price, everything updates ── */}
        <section style={{ marginTop: 40 }}>
          <div style={{ fontSize: 13.5, color: SUBINK, marginBottom: 14 }}>
            Tap a run size — every price below follows.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {QUANTITIES.map((q) => {
              const active = q === qty;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQty(q)}
                  aria-pressed={active}
                  data-testid={`estimate-qty-${q}`}
                  style={{
                    padding: '14px 10px',
                    borderRadius: 0,
                    background: active ? CARD_RAISED : CARD,
                    border: active ? `1.5px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    color: INK,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700, color: active ? BLUE : INK }}>{q.toLocaleString()}</div>
                  <div style={{ fontSize: 10.5, color: SUBINK, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 1 }}>units</div>
                  <div style={{ fontSize: 12.5, marginTop: 6, color: active ? BLUE : SUBINK, fontVariantNumeric: 'tabular-nums' }}>
                    {money2(unitCostAt(q))} /unit
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Totals ── */}
        <section style={{ marginTop: 16, borderRadius: 0, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }}>
          {/* Per record — chevron expands the full cost breakdown (Bill, Aug 16) */}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            data-testid="estimate-details-toggle"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%',
              padding: '13px 18px', background: CARD, border: 'none', cursor: 'pointer', color: INK, textAlign: 'left',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Per record</span>
                <Chevron open={detailsOpen} />
              </div>
              <div style={{ fontSize: 12, color: SUBINK, marginTop: 1 }}>This exact build, at this run</div>
            </div>
            <div style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{money2(unitCost)}</div>
          </button>
          {detailsOpen && (
            <div style={{ background: CANVAS }}>
              {UNIT_LINES.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 18px 10px 34px', borderTop: `1px solid ${HAIRLINE}` }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: INK, fontWeight: 500 }}>{l.name}</div>
                    <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 1 }}>{l.note}</div>
                  </div>
                  <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {money2(unitLineAt(l.at1000, qty))} <span style={{ color: SUBINK, fontSize: 11 }}>/unit</span>
                  </div>
                </div>
              ))}
              {/* Setup costs — nested expander, still collapsible in here */}
              <button
                type="button"
                onClick={() => setSetupOpen((v) => !v)}
                aria-expanded={setupOpen}
                data-testid="estimate-setup-toggle"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%',
                  padding: '10px 18px 10px 34px', background: 'transparent', border: 'none', borderTop: `1px solid ${HAIRLINE}`,
                  cursor: 'pointer', color: INK, textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>Setup costs</span>
                    <Chevron open={setupOpen} />
                  </div>
                  <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 1 }}>One-time · same at any run size</div>
                </div>
                <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(SETUP_TOTAL)}</div>
              </button>
              {setupOpen && SETUP_LINES.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '8px 18px 8px 50px', borderTop: `1px solid ${HAIRLINE}` }}>
                  <div>
                    <div style={{ fontSize: 12, color: SUBINK }}>{l.name}</div>
                    {l.note && <div style={{ fontSize: 11, color: SUBINK, marginTop: 1, opacity: 0.75 }}>{l.note}</div>}
                  </div>
                  <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: SUBINK }}>
                    {l.amount === 0 ? 'Included' : money(l.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: CARD }}>{detailsOpen ? <div aria-hidden style={{ height: 1, background: HAIRLINE }} /> : <InsetRule />}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 18px', background: CARD }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Run</div>
              <div style={{ fontSize: 12, color: SUBINK, marginTop: 1 }}>Pressed and packed</div>
            </div>
            <div style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{qty.toLocaleString()} units · {money(subtotal)}</div>
          </div>
          <div style={{ background: CARD }}><InsetRule /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 18px', background: CARD }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Setup</div>
              <div style={{ fontSize: 12, color: SUBINK, marginTop: 1 }}>One-time</div>
            </div>
            <div style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{money(SETUP_TOTAL)}</div>
          </div>
          <div style={{ padding: '18px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${BLUE_TINT_TOP} 0%, ${CARD} 100%)` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: BLUE }}>Estimate total</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 2 }}>If {MOCK_CLIENT_FIRST} presses the full run</div>
              </div>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</div>
            </div>
            {/* The GoodTunes hook — ONE quiet line at the moment of maximum
                price awareness (Bill, Aug 18 2026). No banner, no ad.
                Apple Intelligence-style gradient sweep INSIDE the type (Bill,
                Aug 19 2026) — a slow shimmer draws the eye once, calmly;
                never opacity pulsing (blinking begs). Honors reduced motion. */}
            <style>{`
              @keyframes gt-hook-sweep { 0% { background-position: 130% 0; } 100% { background-position: -30% 0; } }
              .gt-hook-shimmer {
                background: linear-gradient(100deg, #86868b 0%, #86868b 38%, #ecdb8a 48%, #D9C153 50%, #ecdb8a 52%, #86868b 62%, #86868b 100%);
                background-size: 280% 100%;
                -webkit-background-clip: text; background-clip: text;
                -webkit-text-fill-color: transparent; color: transparent;
                animation: gt-hook-sweep 6s ease-in-out infinite;
              }
              @media (prefers-reduced-motion: reduce) {
                .gt-hook-shimmer { animation: none; background-position: 50% 0; }
              }
            `}</style>
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setHookOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14 }}
                data-testid="estimate-goodtunes-hook"
              >
                <span className="gt-hook-shimmer">Get this for $0 out of pocket. Learn more →</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── Action ── */}
        {/* Apple rule (Bill, Aug 16 2026): primary action sits on the right. */}
        <section style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22 }}>
            {/* quiet links grouped together, left of the button, centered on it */}
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              data-testid="estimate-share"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: SUBINK }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v13" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>
              Share
            </button>
            <button
              type="button"
              onClick={() => setAskOpen(true)}
              data-testid="estimate-ask-question"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: SUBINK }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Ask {MOCK_PREPARED_BY.split(' ')[0]} a question
            </button>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setStartOpen(true)}
                data-testid="estimate-start-project"
                style={{
                  padding: '12px 26px', borderRadius: 0, border: 'none', cursor: 'pointer',
                  background: BLUE, color: '#1d1d1f', fontSize: 14.5, fontWeight: 700,
                }}
              >
                Start this project
              </button>
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 10, textAlign: 'center', fontSize: 11.5, fontWeight: 400, color: 'rgba(0,0,0,0.38)', whiteSpace: 'nowrap' }}>
                Saved to your account
              </div>
            </div>
          </div>
          <div style={{ height: 26 }} aria-hidden />
        </section>

        {/* ── Terms ── */}
        <footer style={{ marginTop: 40, fontSize: 11.5, color: SUBINK, lineHeight: 1.7, textAlign: 'center' }}>
          {/* Press identity — letterhead-style close (moved from the header,
              Bill, Aug 19 2026). Quiet: modest logo, subink address. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingBottom: 22, marginBottom: 22, borderBottom: `1px solid ${HAIRLINE}` }}>
            <img src={mrpLogoAsset} alt="Memphis Record Pressing" style={{ width: 40, height: 40, opacity: 0.9 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>Memphis Record Pressing</div>
              <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>3015 Brother Blvd · Memphis, TN · memphisvinyl.com</div>
            </div>
          </div>
          {/* Each sentence on its own line (Bill, Aug 19 2026). */}
          <p style={{ margin: 0 }}>All orders are subject to +/- 10% and billed accordingly.</p>
          <p style={{ margin: '2px 0 0' }}>Listed prices may change per final order specifications.</p>
          <p style={{ margin: '2px 0 0' }}>This estimate is valid for 30 days.</p>
        </footer>
      </div>

      {/* ── Share — private link, no account needed ── */}
      {shareOpen && (
        <Sheet onClose={closeShare} testid="sheet-share">
          {shareSent ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Sent to {shareName.trim() || shareEmail.trim()}</div>
              <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 6 }}>They can open the estimate right away.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>Share this estimate</div>
              <p style={{ fontSize: 12.5, color: SUBINK, margin: '6px 0 0', lineHeight: 1.6 }}>
                They&rsquo;ll get a private link — no account needed.
              </p>
              <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
                <input style={fieldStyle} placeholder="Name" value={shareName} onChange={(e) => setShareName(e.target.value)} data-testid="input-share-name" />
                <input style={fieldStyle} placeholder="Email" type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} data-testid="input-share-email" />
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={!shareEarned}
                  style={confirmBtn(shareEarned)}
                  onClick={() => { if (!shareEarned) return; setShareSent(true); window.setTimeout(closeShare, 1400); }}
                  data-testid="button-share-send"
                >
                  Send link
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}

      {/* ── Ask a question — Brandon's card ── */}
      {askOpen && (
        <Sheet onClose={closeAsk} testid="sheet-ask">
          {askSent ? (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Your message has been sent to {firstName}.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 52, height: 52, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                  <img src={brandonPhoto} alt={MOCK_PREPARED_BY} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>How can I help?</div>
                  <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>{MOCK_PREPARED_BY} · Memphis Record Pressing</div>
                </div>
              </div>
              <textarea
                style={{ ...fieldStyle, height: 96, padding: '10px 12px', resize: 'none', marginTop: 16, lineHeight: 1.5 }}
                placeholder="Ask about pricing, timing, specs — anything"
                value={askMsg}
                onChange={(e) => setAskMsg(e.target.value)}
                data-testid="input-ask-message"
              />
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={askMsg.trim() === ''}
                  style={confirmBtn(askMsg.trim() !== '')}
                  onClick={() => { if (askMsg.trim() !== '') setAskSent(true); }}
                  data-testid="button-ask-send"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}

      {/* ── Start this project — confirm → create account → done ──
          Bill (Aug 19 2026): starting the project is where account creation
          begins; the estimate itself stayed link-not-login. */}
      {startOpen && (
        <Sheet onClose={closeStart} testid="sheet-start" width={430}>
          {startStep === 'done' ? (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Project created — {firstName} will be in touch.</div>
              <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 6 }}>Welcome, {acctName.trim().split(' ')[0]} — your account is ready.</div>
              {/* The flow continues — done state hands off to the MRP-branded
                  next-steps page (Bill, Aug 21 2026). */}
              <button
                type="button"
                data-testid="button-see-next-steps"
                onClick={() => { window.location.hash = '#/PressClientNextStepsMRP'; }}
                style={{
                  marginTop: 18, padding: '11px 24px', borderRadius: 0, border: 'none', cursor: 'pointer',
                  background: BLUE, color: '#1d1d1f', fontSize: 13.5, fontWeight: 700,
                }}
              >
                See what happens next
              </button>
            </div>
          ) : startStep === 'account' ? (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.25, paddingRight: 30 }}>
                Create your account.
              </div>
              <p style={{ fontSize: 13.5, color: SUBINK, margin: '10px 0 0', lineHeight: 1.65 }}>
                Your project needs a home. This is where you&rsquo;ll track pressing, approvals and payments.
              </p>
              <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
                <input style={fieldStyle} placeholder="Name" value={acctName} onChange={(e) => setAcctName(e.target.value)} data-testid="input-account-name" />
                <input style={fieldStyle} placeholder="Email" type="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} data-testid="input-account-email" />
                <input style={fieldStyle} placeholder="Password" type="password" value={acctPassword} onChange={(e) => setAcctPassword(e.target.value)} data-testid="input-account-password" />
              </div>
              <div style={{ marginTop: 20 }}>
                {/* Earns its blue once a password is typed (canon). */}
                <button
                  type="button"
                  disabled={acctPassword.trim() === ''}
                  style={{ ...confirmBtn(acctPassword.trim() !== ''), width: '100%' }}
                  onClick={() => { if (acctPassword.trim() !== '') setStartStep('done'); }}
                  data-testid="button-create-account"
                >
                  Create account &amp; start project
                </button>
                <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11.5, color: SUBINK }}>
                  {firstName} will be notified the moment your project is live.
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Apple heading: large bold headline, calmer subline below
                  (Bill, Aug 19 2026) — never heading and copy at one weight. */}
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.25, paddingRight: 30 }}>
                Start {MOCK_JOB} with Memphis Record Pressing
              </div>
              <p style={{ fontSize: 13.5, color: SUBINK, margin: '10px 0 0', lineHeight: 1.65 }}>
                This locks the estimate as your working numbers, creates the project draft,
                and lets {firstName} know you&rsquo;re ready. Nothing is billed yet.
              </p>
              <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
                {/* Earned blue — the user opened the confirm deliberately.
                    Advances to account creation, not straight to done. */}
                <button type="button" style={confirmBtn(true)} onClick={() => setStartStep('account')} data-testid="button-start-confirm">
                  Start project
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}

      {/* ── GoodTunes® explainer — App Store-style story card (Bill, Aug 19) ──
          Large rounded square: full-bleed ruby-vinyl graphic on top, type
          below, frosted circled × over the graphic, ONE filled-blue forward
          action at the bottom. */}
      {hookOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 24 }}
          onClick={() => setHookOpen(false)}
          data-testid="sheet-goodtunes"
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="rounded-none"
            style={{ position: 'relative', width: 520, maxWidth: '90vw', overflow: 'hidden', background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, boxShadow: '0 32px 80px rgba(0,0,0,0.18)' }}
          >
            {/* Top half — full-bleed graphic, gradient into the card body */}
            <div style={{ position: 'relative', height: 280, overflow: 'hidden' }} aria-hidden>
              <img
                src={rubyVinylPhoto}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.15)' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0) 45%, ${CARD_RAISED} 100%)` }} />
            </div>
            {/* Canon circled × — frosted, over the graphic (Apple sheets) */}
            <CloseX onClose={() => setHookOpen(false)} testid="button-goodtunes-close" />
            {/* Bottom half — headline + the three lines + one forward action */}
            <div style={{ padding: '4px 30px 28px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>GoodTunes® fan-funded pressing</div>
              <div style={{ fontSize: 13.5, color: SUBINK, marginTop: 12, lineHeight: 1.7 }}>
                <p style={{ margin: 0 }}>Your fans pre-order the record before it&rsquo;s pressed.</p>
                <p style={{ margin: '6px 0 0' }}>The run funds itself — same build, same press, $0 up front.</p>
                <p style={{ margin: '6px 0 0' }}>You keep the estimate you&rsquo;re looking at; only the payer changes.</p>
              </div>
              {/* ONE primary — the single forward action of an informational card */}
              <button
                type="button"
                data-testid="button-goodtunes-learn"
                style={{
                  marginTop: 22, width: '100%', padding: '12px 0', borderRadius: 0, border: 'none',
                  cursor: 'pointer', background: BLUE, color: '#1d1d1f', fontSize: 14.5, fontWeight: 700,
                }}
              >
                Learn more
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
