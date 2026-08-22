// CORNER RULING (Bill, Aug 21 2026): Memphis's corner token = SQUARE and
// it applies across the whole MRP skin — buttons, cards, pills included.
// Only true circles (avatars, status icons) stay round.
// ArtistDashboardNextStepsMRP — the MRP-skinned twin of
// ArtistDashboardNextSteps (Bill, Aug 21 2026: "we need this skin for
// Memphis, right?"). Same page, same structure — kept in LOCKSTEP with the
// GoodTunes charcoal original; only the skin changes: MRP white-label
// light canon (pure white canvas, gold #D9C153, black hairlines) and the
// press's mark quietly top right. POWERED BY GoodTunes stays at the rail
// bottom (dark logo needs no invert on light).
//
// Original brief: the
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

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import goodtunesLogo from './assets/goodtunes-logo.png';
import mrpLogo from './assets/mrp-logo.svg';
import { type PortalData, type PortalEstimate } from './PressClientNextStepsMRP';
import { withDevWlParam as wlParam } from "@/hooks/useAuthKind";



// ─── Real portal payload (MOCK_* retired — GET /api/press-client/portal) ──
const SETUP_TOTAL_DOLLARS = 1295; // fixed setup block — same anchor as the estimate page
const moneyFmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// ─── Palette — charcoal admin canon (matches the live dashboard) ─────
const CANVAS = '#ffffff';
const RAIL_BG = '#fbfaf7';
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const BLUE = '#D9C153'; // MRP gold — the ONE earned fill on this page
const LINK = '#9c8a33'; // gold, darkened enough to read as text on white

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
        borderRadius: 0, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        border: `1px solid ${status === 'next' ? 'rgba(255,255,255,0.28)' : HAIRLINE}`,
        background: status === 'next' ? 'rgba(217,193,83,0.22)' : 'transparent',
        color: status === 'waiting' ? SUBINK : INK,
      }}
    >
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

function buildStripSteps(estimateNo: string, preparerFirst: string, depositLabel: string | null): { id: string; title: string; body: string; status: StepStatus; meta?: string }[] {
  return [
    { id: 'created', status: 'done', title: 'Project created', body: `Estimate ${estimateNo} locked as your working numbers — ${preparerFirst} has been notified.` },
    { id: 'assets', status: 'next', title: 'Audio & artwork', body: 'Upload your master audio and print-ready art. Every file is checked before anything is cut.' },
    { id: 'test', status: 'waiting', title: 'Test pressing approval', body: 'Test pressings ship to you with 2-day domestic shipping. Production waits for your approval.' },
    { id: 'deposit', status: 'waiting', title: 'Deposit', body: 'A 50% deposit schedules your run; the remainder is billed at completion.', meta: depositLabel ? `${depositLabel} · 50% of the working total` : undefined },
    { id: 'production', status: 'waiting', title: 'Pressing & packaging', body: 'Pressed, labeled, assembled, shrinkwrapped retail-ready.' },
    { id: 'shipping', status: 'waiting', title: 'Shipping', body: 'Finished records leave the press with tracking after final inspection.' },
  ];
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
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 0,
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

export default function ArtistDashboardNextStepsMRP() {
  // Expanded on first visit — a live project is exactly when the strip
  // has something to say. Collapses to one quiet line.
  const [open, setOpen] = useState(true);
  const [uploaded, setUploaded] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [range, setRange] = useState('30d');

  const { data: portal } = useQuery<PortalData>({ queryKey: [wlParam('/api/press-client/portal')], retry: false });
  const project: PortalEstimate | null = useMemo(() => {
    const list = portal?.estimates ?? [];
    return list.find((e) => e.status === 'Converted') ?? list[0] ?? null;
  }, [portal]);
  const clientFull = portal?.client.displayName || portal?.client.email || '';
  const clientFirst = clientFull.split(' ')[0] || 'there';
  const estimateNo = project?.estimateNo ?? '—';
  const jobTitle = project?.title ?? 'Your project';
  const preparerFirst = (project?.preparedBy || project?.pressName || 'the press').split(' ')[0];
  const depositLabel = project?.totalCents ? moneyFmt(project.totalCents / 200) : null;
  const STEPS = useMemo(() => buildStripSteps(estimateNo, preparerFirst, depositLabel), [estimateNo, preparerFirst, depositLabel]);
  const doneCount = STEPS.filter((s) => s.status === 'done').length;
  const upNext = STEPS.find((s) => s.status === 'next');

  // Honest zeros — a fresh press client has no fan-sales history yet.
  const STAT_CARDS = [
    { label: 'Sales · last 30d', value: '$0', sub: '— vs prior' },
    { label: 'Sales · lifetime', value: '$0', sub: '' },
    { label: 'Fan plays · last 30d', value: '0', sub: '— vs prior' },
    { label: 'Listeners', value: '0', sub: '— vs prior' },
    { label: 'Buyers', value: '0', sub: '— vs prior' },
  ];

  const doUpload = async (file: File) => {
    if (!project || uploadBusy) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/press-client/estimates/${project.id}/files`, { method: 'POST', credentials: 'include', body: fd });
      if (res.ok) setUploaded(true);
    } finally { setUploadBusy(false); }
  };
  const font = "-apple-system, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex' }}>

      {/* ── Left rail — live structure: Settings pinned, POWERED BY under ── */}
      <nav style={{ width: 200, flexShrink: 0, background: RAIL_BG, borderRight: `1px solid ${HAIRLINE}`, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 0, height: '100dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 6px 14px' }}>
          <span aria-hidden style={{ width: 26, height: 26, borderRadius: '50%', background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: INK }}>
            {(clientFull || '?').slice(0, 1).toUpperCase()}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{clientFull}</span>
        </div>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            placeholder="Search…"
            data-testid="input-rail-search"
            style={{ width: '100%', height: 32, borderRadius: 0, padding: '0 40px 0 12px', fontSize: 12.5, background: CARD, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
          />
          <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 600, color: SUBINK, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '1px 5px' }}>
            ⌘K
          </span>
        </div>
        {RAIL_ITEMS.map((r) => <RailRow key={r} name={r} active={r === 'Dashboard'} />)}
        <div style={{ flex: 1 }} />
        <RailRow name="Settings" active={false} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 12px 4px', borderTop: `1px solid ${HAIRLINE}`, marginTop: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: SUBINK }}>POWERED BY</span>
          {/* Only dark logo assets exist — white via CSS invert (canon). */}
          <img src={goodtunesLogo} alt="GoodTunes" style={{ height: 16, width: 'auto', opacity: 0.9 }} />
        </div>
      </nav>

      {/* ── Main ── */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '30px 28px 60px' }}>

          {/* Greeting row + range pills */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, margin: 0 }}>Good morning, {clientFirst}</h1>
              <p style={{ fontSize: 13, color: SUBINK, margin: '6px 0 0' }}>One project is moving — {upNext ? `up next: ${upNext.title.toLowerCase()}.` : 'nothing needs you right now.'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: 3 }}>
                {['Today', '7d', '30d', '90d', 'All'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    data-testid={`range-${r.toLowerCase()}`}
                    style={{
                      padding: '5px 13px', borderRadius: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer',
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
              <button type="button" data-testid="button-view-orders" style={{ padding: '8px 16px', borderRadius: 0, background: 'transparent', border: `1px solid rgba(0,0,0,0.22)`, color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                View orders
              </button>
              {/* The press's mark, quietly top right (Bill, Aug 21 2026). */}
              <img src={mrpLogo} alt="Memphis Record Pressing" data-testid="img-press-mark" style={{ width: 34, height: 34 }} />
            </div>
          </div>

          {/* ── THE strip — "You're all caught up" becomes Next steps when a
              project is live. Collapsible; word + icon carries the state. ── */}
          <section style={{ marginTop: 22, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }} data-testid="next-steps-strip">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              data-testid="button-next-steps-toggle"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: 'transparent', border: 'none', cursor: 'pointer', color: INK, textAlign: 'left' }}
            >
              <span aria-hidden style={{ width: 30, height: 30, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
                  <circle cx="8" cy="8" r="5.6" fill="none" stroke={SUBINK} strokeWidth="1.5" />
                  <circle cx="8" cy="8" r="1.4" fill="none" stroke={SUBINK} strokeWidth="1.5" />
                </svg>
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Next steps — {jobTitle}.</span>
              <span style={{ fontSize: 12.5, color: SUBINK }}>
                {doneCount} of {STEPS.length} done{upNext ? ` · Up next: ${upNext.title}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: SUBINK }}>{open ? 'Collapse' : 'Expand'}</span>
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}>
                <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke={SUBINK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {open && (
              <div style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                {STEPS.map((s, i) => (
                  <div key={s.id} data-testid={`step-${s.id}`}>
                    {i > 0 && <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />}
                    <div style={{ padding: '13px 18px', display: 'flex', gap: 13, alignItems: 'flex-start', background: s.status === 'next' ? CARD_RAISED : 'transparent' }}>
                      <div style={{ width: 18, textAlign: 'center', fontSize: 12, fontWeight: 600, color: s.status === 'waiting' ? SUBINK : INK, paddingTop: 1 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: s.status === 'waiting' ? SUBINK : INK }}>{s.title}</div>
                          <StatusPill status={s.status} />
                        </div>
                        <p style={{ fontSize: 12, color: SUBINK, margin: '4px 0 0', lineHeight: 1.55 }}>{s.body}</p>
                        {s.meta && <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginTop: 4 }}>{s.meta}</div>}
                        {s.id === 'assets' && (
                          <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            {/* The page's ONE filled blue — earned by the live project. */}
                            <input
                              ref={fileRef}
                              type="file"
                              style={{ display: 'none' }}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f); e.target.value = ''; }}
                              data-testid="input-upload-file"
                            />
                            <button
                              type="button"
                              data-testid="button-upload-files"
                              disabled={uploadBusy || !project}
                              onClick={() => fileRef.current?.click()}
                              style={{ padding: '9px 20px', borderRadius: 0, border: 'none', cursor: 'pointer', background: BLUE, color: INK, fontSize: 12.5, fontWeight: 700, opacity: uploadBusy ? 0.6 : 1 }}
                            >
                              {uploadBusy ? 'Uploading…' : 'Upload audio & artwork'}
                            </button>
                            {uploaded && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: SUBINK }}>
                                <StatusIcon status="done" />
                                Files received — confirmed within 1 business day.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Stats row — live dashboard structure, quiet zeros ── */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            {STAT_CARDS.map((c) => (
              <div key={c.label} style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: '16px 16px 18px' }}>
                <div style={{ fontSize: 12, color: SUBINK }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginTop: 10 }}>{c.value}</div>
                {c.sub && <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 8 }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* ── Bottom row — chart placeholder + Top projects ── */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>The last 30 days. <span style={{ color: SUBINK, fontWeight: 500 }}>Daily fan plays.</span></div>
              <div style={{ marginTop: 18, height: 120, borderBottom: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'flex-end' }} aria-hidden>
                <div style={{ width: '100%', height: 1, background: 'rgba(217,193,83,0.9)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: SUBINK, marginTop: 6 }} aria-hidden>
                <span>07-22</span><span>07-27</span><span>08-01</span><span>08-06</span><span>08-11</span><span>08-17</span>
              </div>
            </div>
            <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Top projects. <span style={{ color: SUBINK, fontWeight: 500 }}>Ranked by sales.</span></div>
                <span style={{ fontSize: 12.5, color: LINK, fontWeight: 600 }}>View all</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ fontSize: 12.5, color: SUBINK, width: 12 }}>1</span>
                <span aria-hidden style={{ width: 40, height: 40, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
                    <circle cx="8" cy="8" r="6.4" fill="none" stroke="#c7c7cc" strokeWidth="1.2" />
                    <circle cx="8" cy="8" r="1.6" fill="none" stroke="#c7c7cc" strokeWidth="1.2" />
                  </svg>
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{jobTitle}</div>
                  <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>{clientFull}</div>
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
