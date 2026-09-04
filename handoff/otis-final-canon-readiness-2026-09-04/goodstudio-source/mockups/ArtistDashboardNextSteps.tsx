// ArtistDashboardNextSteps — Bill's idea (Aug 21 2026 screenshot): the
// project next-steps live in the COLLAPSIBLE header strip of the real
// artist dashboard — the spot that says "You're all caught up" when
// nothing needs you. Same database, same portal; when a pressing project
// is live, the strip becomes "Next steps" and expands to the lifecycle.
// Structure mirrors the CURRENT live artist dashboard (Otis): dark
// charcoal admin canon, rail = Dashboard / Releases / Orders / Reports /
// Shopify / Referrals with Settings pinned at the bottom and POWERED BY
// GoodTunes under it. Statuses are word + icon, never color alone (Bill
// is colorblind). ONE filled-blue action on the page — the up-next step's
// upload (View orders stays quiet, per the queued blue-button sweep).
// "Estimate", never the q-word. Self-contained per handoff rules.

import { useState } from 'react';
import californialandCover from '../assets/californialand-cover.jpg';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaAvatar from '../assets/niina-soleil.webp';

// ─── Mock data — same project the estimate created ───────────────────
const MOCK_CLIENT_FIRST = 'Niina';
const MOCK_CLIENT_FULL = 'Niina Soleil';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_PREPARED_BY = 'Brandon Seavers';
const MOCK_JOB = 'CALIFORNIALAND';
const MOCK_DEPOSIT = '$3,332.50';

// ─── Palette — charcoal admin canon (matches the live dashboard) ─────
const CANVAS = '#161618';
const RAIL_BG = '#131315';
const CARD = '#1c1c1e';
const CARD_RAISED = '#232326';
const INK = '#f5f5f7';
const SUBINK = '#98989d';
const HAIRLINE = 'rgba(255,255,255,0.08)';
const BLUE = '#319ED8'; // the ONE earned fill on this page
const MRP_GOLD = '#D9C153';

// ─── Status grammar — word + icon, never color alone ─────────────────
type StepStatus = 'done' | 'next' | 'waiting';

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'next') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="5.6" fill="none" stroke={SUBINK} strokeWidth="1.5" />
      <path d="M8 5.2V8l2 1.4" fill="none" stroke={SUBINK} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StatusPill({ status }: { status: StepStatus }) {
  const label = status === 'done' ? 'Done' : status === 'next' ? 'Up next' : 'Waiting';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
        borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        border: `1px solid ${status === 'next' ? 'rgba(255,255,255,0.28)' : HAIRLINE}`,
        background: status === 'next' ? 'rgba(49,158,216,0.14)' : 'transparent',
        color: status === 'waiting' ? SUBINK : INK,
      }}
    >
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

const STEPS: { id: string; title: string; body: string; status: StepStatus; meta?: string }[] = [
  { id: 'created', status: 'done', title: 'Project created', body: `Estimate ${MOCK_ESTIMATE_NO} locked as your working numbers — ${MOCK_PREPARED_BY.split(' ')[0]} has been notified.` },
  { id: 'assets', status: 'next', title: 'Audio & artwork', body: 'Upload your master audio and print-ready art. Every file is checked before anything is cut.' },
  { id: 'test', status: 'waiting', title: 'Test pressing approval', body: 'Test pressings ship to you with 2-day domestic shipping. Production waits for your approval.' },
  { id: 'deposit', status: 'waiting', title: 'Deposit', body: 'A 50% deposit schedules your run; the remainder is billed at completion.', meta: `${MOCK_DEPOSIT} · 50% of the working total` },
  { id: 'production', status: 'waiting', title: 'Pressing & packaging', body: 'Pressed, labeled, assembled, shrinkwrapped retail-ready.' },
  { id: 'shipping', status: 'waiting', title: 'Shipping', body: 'Finished records leave the press with tracking after final inspection.' },
];

export function ArtistDashboardNextStepsStrip({ onUploadFiles }: { onUploadFiles?: () => void }) {
  const [open, setOpen] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const doneCount = STEPS.filter((step) => step.status === 'done').length;
  const upNext = STEPS.find((step) => step.status === 'next');

  return (
    <section style={{ borderRadius: 14, background: CARD, border: `1px solid ${HAIRLINE}`, overflow: 'hidden', color: INK }} data-open={open} data-testid="next-steps-strip">
      <style>{`
        @property --gt-edge-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        @keyframes gt-edge-travel {
          0% { --gt-edge-angle: 0deg; opacity: 0; }
          6% { opacity: 1; }
          94% { opacity: 1; }
          100% { --gt-edge-angle: 360deg; opacity: 0; }
        }
        @keyframes gt-expand-shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        [data-testid="step-assets"],
        [data-testid="button-next-steps-toggle"] {
          position: relative;
        }
        [data-testid="step-assets"]::after,
        [data-testid="button-next-steps-toggle"]::after {
          background: conic-gradient(from var(--gt-edge-angle), transparent 0deg 350deg, rgba(255,255,255,0.20) 353deg, rgba(255,255,255,0.95) 357deg, transparent 360deg);
          content: "";
          inset: 0;
          padding: 1px;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        [data-open="true"] [data-testid="step-assets"]::after {
          animation: gt-edge-travel 3.6s linear infinite;
        }
        [data-open="false"] [data-testid="button-next-steps-toggle"]::after {
          animation: gt-edge-travel 2.4s linear 3;
        }
        [data-open="false"] [data-testid="next-steps-expand-label"] {
          animation: gt-expand-shimmer 3.2s linear infinite;
          background-image: linear-gradient(90deg, ${SUBINK} 0%, ${SUBINK} 35%, ${MRP_GOLD} 50%, ${SUBINK} 65%, ${SUBINK} 100%);
          background-size: 200% auto;
          background-clip: text;
          color: transparent;
          -webkit-background-clip: text;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="step-assets"]::after,
          [data-testid="button-next-steps-toggle"]::after {
            animation: none;
            background: rgba(255,255,255,0.24);
          }
          [data-testid="next-steps-expand-label"] {
            animation: none;
            background: none;
            color: ${SUBINK};
          }
        }
      `}</style>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="next-steps-content"
        data-testid="button-next-steps-toggle"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: 'transparent', border: 'none', cursor: 'pointer', color: INK, textAlign: 'left' }}
      >
        <img src={californialandCover} alt="" aria-hidden style={{ width: 30, height: 30, borderRadius: 7, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>Next steps. <span style={{ fontWeight: 500, color: SUBINK }}>{MOCK_JOB}.</span></span>
        <span style={{ fontSize: 12.5, color: SUBINK }}>
          {doneCount} of {STEPS.length} done{upNext ? ` · Up next: ${upNext.title}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        <span data-testid="next-steps-expand-label" style={{ fontSize: 12, color: SUBINK }}>{open ? 'Collapse' : 'Expand'}</span>
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}>
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke={SUBINK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        id="next-steps-content"
        aria-hidden={!open}
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
          transition: 'grid-template-rows 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease',
        }}
      >
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            {STEPS.map((step, index) => <div key={step.id} data-testid={`step-${step.id}`}>
              {index > 0 && <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />}
              <div style={{ padding: '13px 18px', display: 'flex', gap: 13, alignItems: 'flex-start', background: step.status === 'next' ? CARD_RAISED : 'transparent' }}>
                <div style={{ width: 18, textAlign: 'center', fontSize: 12, fontWeight: 600, color: step.status === 'waiting' ? SUBINK : INK, paddingTop: 1 }}>{index + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: step.status === 'waiting' ? SUBINK : INK }}>{step.title}</div>
                    <StatusPill status={step.status} />
                  </div>
                  <p style={{ fontSize: 12, color: SUBINK, margin: '4px 0 0', lineHeight: 1.55 }}>{step.body}</p>
                  {step.meta && <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginTop: 4 }}>{step.meta}</div>}
                  {step.id === 'assets' && <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      data-testid="button-upload-files"
                      onClick={() => { if (onUploadFiles) onUploadFiles(); else setUploaded(true); }}
                      style={{ padding: '9px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', background: BLUE, color: '#fff', fontSize: 12.5, fontWeight: 700 }}
                    >
                      Upload audio &amp; artwork
                    </button>
                    {uploaded && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: SUBINK }}><StatusIcon status="done" />Files received — confirmed within 1 business day.</span>}
                  </div>}
                </div>
              </div>
            </div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Rail — the LIVE dashboard's rail, verbatim order ────────────────
const RAIL_ITEMS = ['Dashboard', 'Releases', 'Orders', 'Reports', 'Shopify', 'Referrals'];

function RailIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? INK : SUBINK;
  const common = { fill: 'none', stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'Dashboard': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><rect x="2" y="2" width="5" height="5" rx="1.2" {...common} /><rect x="9" y="2" width="5" height="5" rx="1.2" {...common} /><rect x="2" y="9" width="5" height="5" rx="1.2" {...common} /><rect x="9" y="9" width="5" height="5" rx="1.2" {...common} /></svg>;
    case 'Releases': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="5.6" {...common} /><circle cx="8" cy="8" r="1.4" {...common} /></svg>;
    case 'Orders': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3 4h10l-1 8H4L3 4zM6 6.5V4a2 2 0 0 1 4 0v2.5" {...common} /></svg>;
    case 'Reports': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3.5 13.5v-4M8 13.5v-8M12.5 13.5V7" {...common} /></svg>;
    case 'Shopify': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3.5 5.5h9l-.8 8h-7.4l-.8-8zM5.8 5.5a2.2 2.2 0 0 1 4.4 0" {...common} /></svg>;
    case 'Referrals': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M8 2.5v7M8 2.5L5.5 5M8 2.5L10.5 5M3 9.5v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" {...common} /></svg>;
    default: return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="2.2" {...common} /><path d="M8 2.5v1.8M8 11.7v1.8M2.5 8h1.8M11.7 8h1.8M4.2 4.2l1.3 1.3M10.5 10.5l1.3 1.3M11.8 4.2l-1.3 1.3M5.5 10.5l-1.3 1.3" {...common} /></svg>;
  }
}

function RailRow({ name, active }: { name: string; active: boolean }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      data-testid={`rail-${name.toLowerCase()}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9,
        fontSize: 13, fontWeight: active ? 600 : 500, color: active ? INK : SUBINK,
        background: active ? CARD_RAISED : 'transparent',
        textDecoration: 'none',
      }}
    >
      <RailIcon name={name} active={active} />
      {name}
    </a>
  );
}

const STAT_CARDS = [
  { label: 'Sales · last 30d', value: '$0', sub: '— vs prior' },
  { label: 'Sales · lifetime', value: '$0', sub: '' },
  { label: 'Fan plays · last 30d', value: '0', sub: '— vs prior' },
  { label: 'Listeners', value: '1', sub: '+0.0% vs prior' },
  { label: 'Buyers', value: '0', sub: '— vs prior' },
];

export default function ArtistDashboardNextSteps() {
  const [range, setRange] = useState('30d');
  const upNext = STEPS.find((s) => s.status === 'next');
  const font = "-apple-system, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex' }}>

      {/* ── Left rail — live structure: Settings pinned, POWERED BY under ── */}
      <nav style={{ width: 200, flexShrink: 0, background: RAIL_BG, borderRight: `1px solid ${HAIRLINE}`, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 0, height: '100dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 6px 14px' }}>
          <img src={niinaAvatar} alt="" aria-hidden style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{MOCK_CLIENT_FULL}</span>
        </div>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            placeholder="Search…"
            data-testid="input-rail-search"
            style={{ width: '100%', height: 32, borderRadius: 9, padding: '0 40px 0 12px', fontSize: 12.5, background: CARD, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
          />
          <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 600, color: SUBINK, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, borderRadius: 5, padding: '1px 5px' }}>
            ⌘K
          </span>
        </div>
        {RAIL_ITEMS.map((r) => <RailRow key={r} name={r} active={r === 'Dashboard'} />)}
        <div style={{ flex: 1 }} />
        <RailRow name="Settings" active={false} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 12px 4px', borderTop: `1px solid ${HAIRLINE}`, marginTop: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: SUBINK }}>POWERED BY</span>
          {/* Only dark logo assets exist — white via CSS invert (canon). */}
          <img src={goodtunesLogo} alt="GoodTunes" style={{ height: 16, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        </div>
      </nav>

      {/* ── Main ── */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '30px 28px 60px' }}>

          {/* Greeting row + range pills */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, margin: 0 }}>Good morning, {MOCK_CLIENT_FIRST}</h1>
              <p style={{ fontSize: 13, color: SUBINK, margin: '6px 0 0' }}>One project is moving — {upNext ? `up next: ${upNext.title.toLowerCase()}.` : 'nothing needs you right now.'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 999, padding: 3 }}>
                {['Today', '7d', '30d', '90d', 'All'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    data-testid={`range-${r.toLowerCase()}`}
                    style={{
                      padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: range === r ? CARD_RAISED : 'transparent',
                      border: range === r ? `1px solid ${HAIRLINE}` : '1px solid transparent',
                      color: range === r ? INK : SUBINK,
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {/* Quiet outline — the page's one fill belongs to the up-next step. */}
              <button type="button" data-testid="button-view-orders" style={{ padding: '8px 16px', borderRadius: 999, background: 'transparent', border: `1px solid rgba(255,255,255,0.22)`, color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                View orders
              </button>
            </div>
          </div>

          {/* ── THE strip — "You're all caught up" becomes Next steps when a
              project is live. Collapsible; word + icon carries the state. ── */}
          <div style={{ marginTop: 22 }}><ArtistDashboardNextStepsStrip /></div>

          {/* ── Stats row — live dashboard structure, quiet zeros ── */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            {STAT_CARDS.map((c) => (
              <div key={c.label} style={{ borderRadius: 14, background: CARD, border: `1px solid ${HAIRLINE}`, padding: '16px 16px 18px' }}>
                <div style={{ fontSize: 12, color: SUBINK }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginTop: 10 }}>{c.value}</div>
                {c.sub && <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 8 }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* ── Bottom row — chart placeholder + Top projects ── */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <div style={{ borderRadius: 14, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Plays. <span style={{ color: SUBINK, fontWeight: 500 }}>The tracks fans love.</span></div>
              <div style={{ marginTop: 18, height: 120, borderBottom: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'flex-end' }} aria-hidden>
                <div style={{ width: '100%', height: 1, background: 'rgba(49,158,216,0.5)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: SUBINK, marginTop: 6 }} aria-hidden>
                <span>07-22</span><span>07-27</span><span>08-01</span><span>08-06</span><span>08-11</span><span>08-17</span>
              </div>
            </div>
            <div style={{ borderRadius: 14, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Top projects. <span style={{ color: SUBINK, fontWeight: 500 }}>Ranked by sales.</span></div>
                <span style={{ fontSize: 12.5, color: BLUE, fontWeight: 600 }}>View all</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ fontSize: 12.5, color: SUBINK, width: 12 }}>1</span>
                <img src={californialandCover} alt={`${MOCK_JOB} cover art`} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{MOCK_JOB}</div>
                  <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>{MOCK_CLIENT_FULL}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>$0</div>
                  <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>0 units</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
