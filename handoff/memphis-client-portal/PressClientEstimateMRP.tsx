the lacquers in-house, then plate them — the standard path.',
    isDefault: true,
    cutting: 650, cuttingLabel: 'Lacquer cutting',
    plating: 375, platingLabel: 'Lacquer plating',
  },
  {
    id: 'dmm',
    name: 'DMM (direct metal mastering)',
    blurb: 'Cut straight into copper — no lacquer step, a touch lower on cutting.',
    cutting: 525, cuttingLabel: 'DMM cutting',
    plating: 375, platingLabel: 'DMM plating',
  },
  {
    id: 'lacquer-supplied',
    name: 'Lacquers you supply',
    blurb: 'You send finished lacquers; we skip cutting and only plate them.',
    cutting: 0, cuttingLabel: 'Lacquer cutting (you supply)',
    plating: 375, platingLabel: 'Lacquer plating',
  },
];
const metalworkById = (id: MetalworkId) => METALWORK.find((m) => m.id === id) ?? METALWORK[0];
// The setup lines for a given cutting choice — cutting + plating swap, rest holds.
const setupLinesFor = (id: MetalworkId) => {
  const m = metalworkById(id);
  return [
    { id: 'cutting', name: m.cuttingLabel, amount: m.cutting },
    { id: 'plating', name: m.platingLabel, amount: m.plating },
    ...SETUP_CONSTANT,
  ];
};
const setupTotalFor = (id: MetalworkId) => {
  const m = metalworkById(id);
  return m.cutting + m.plating + SETUP_CONSTANT_TOTAL;
};
const DEFAULT_SETUP_TOTAL = setupTotalFor('lacquer-mrp'); // 1295 — frozen

// ─── Free quantity entry (Brief 2) ───────────────────────────────────
// The six loved tier cards ARE the price breaks. Any run 100–5,000 in steps
// of 100 prices at the break it has EARNED (highest break ≤ qty): 700 → the
// 500-break per-unit, 1,400 → the 1,000-break per-unit.
const QUANTITIES = [100, 300, 500, 1000, 2000, 3000];
const QTY_MIN = 100;
const QTY_MAX = 5000;
const QTY_STEP = 100;
const snapQty = (n: number) => {
  const clamped = Math.min(QTY_MAX, Math.max(QTY_MIN, n));
  return Math.round(clamped / QTY_STEP) * QTY_STEP;
};
// The price break a quantity has earned = highest tier ≤ qty.
const earnedBreak = (qty: number) => {
  let b = QUANTITIES[0];
  for (const q of QUANTITIES) if (qty >= q) b = q;
  return b;
};
// The next break up from the earned one (Brief 4), or null at/above the top.
const nextBreak = (qty: number): number | null => {
  const earned = earnedBreak(qty);
  const idx = QUANTITIES.indexOf(earned);
  return idx >= 0 && idx < QUANTITIES.length - 1 ? QUANTITIES[idx + 1] : null;
};

// Same discount curve as the quote builder, anchored so 1,000 = PDF prices.
function tierScale(qty: number): number {
  const raw = qty <= 100 ? 1.0 : qty <= 300 ? 0.88 : qty <= 500 ? 0.8 : qty <= 1000 ? 0.7 : qty <= 2000 ? 0.62 : 0.55;
  return raw / 0.7; // anchor: 1,000-unit tier matches the PDF exactly
}
// Per-record cost is computed at the EARNED break, not the raw quantity, so a
// 700-unit run honestly shows the 500-break per-unit price.
const unitLineAt = (at1000: number, qty: number) => at1000 * tierScale(earnedBreak(qty));
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

const GOLD = '#D9C153'; // MRP's site gold (Andrew, Aug 21 2026)

const MRP_FOOTER_COLS: { head: string; rows: string[] }[] = [
  { head: 'Most used links', rows: ['Vinyl Records', 'Deluxe Vinyl Packaging', 'Short-Run Record Pressing', 'Forms & Templates', 'Audio File Prep', 'Art File Prep'] },
  { head: 'Contact us', rows: ['Phone: (901) 821-9099', 'Email: help@memphisrecordpressing.com', 'Careers'] },
  { head: 'Privacy & security', rows: ['Privacy Notice'] },
  { head: 'Locations', rows: ['Pressing & Customer Service: 3015 Brother Blvd, Bartlett, TN 38133', 'Packaging & Shipping: 7625 Appling Center Dr #103, Memphis, TN 38133'] },
];

// Inside the app the footer reduces to just the black bar — Memphis and us.
// The full column footer belongs to the site/login only (Bill, Aug 21 2026).
function MrpSiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer style={{ background: '#111112', color: '#f5f5f7', padding: compact ? '18px 26px' : '44px 26px 36px' }}>
      {!compact && (
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 30 }}>
        {MRP_FOOTER_COLS.map((c) => (
          <div key={c.head}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD }}>{c.head}</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {c.rows.map((r) => (
                <div key={r} style={{ fontSize: 12.5, color: 'rgba(245,245,247,0.75)', lineHeight: 1.55 }}>{r}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
      <div style={{ maxWidth: 1080, margin: compact ? '0 auto' : '34px auto 0', paddingTop: compact ? 0 : 18, borderTop: compact ? 'none' : '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'rgba(245,245,247,0.55)' }}>
        {/* brightness(0) first forces true white — plain invert leaves a
            non-brand tint on non-pure-black pixels (Bill caught it twice). */}
        <img src={mrpLogoAsset} alt="" aria-hidden style={{ width: 26, height: 26, filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        Memphis Record Pressing · memphisrecordpressing.com
        <span style={{ flex: 1 }} />
        {/* Powered by GoodTunes® — right side, under the rule (Bill,
            Aug 21 2026). White logo via CSS invert (only dark assets exist). */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(245,245,247,0.55)' }}>
          Powered by
          <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        </span>
      </div>
    </footer>
  );
}

export default function PressClientEstimateMRP() {
  const [qty, setQty] = useState(1000);
  // Free-entry field (Brief 2) — string so typing can be partial; commits on
  // blur/Enter. The card is a first-class companion to the six tier cards.
  const [qtyInput, setQtyInput] = useState('1000');
  const [setupOpen, setSetupOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Metalwork cutting choice (Brief 3) — default keeps the frozen setup.
  const [metalwork, setMetalwork] = useState<MetalworkId>('lacquer-mrp');
  const [setupFlash, setSetupFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
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

  // ── Sticky CTA guard (Bill, Aug 24 2026) ──
  // Repeat the ONE filled action in the sticky bar, but only once the page's
  // original "Start this project" button has scrolled off-screen — so exactly
  // one filled accent action is visible at any moment. Watched with an
  // IntersectionObserver; the sticky copy fades/slides in (reduced-motion
  // honored via CSS below).
  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);
  useEffect(() => {
    const el = startBtnRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shareEarned = /.+@.+\..+/.test(shareEmail.trim());
  const closeShare = () => { setShareOpen(false); setShareSent(false); setShareName(''); setShareEmail(''); };
  const closeAsk = () => { setAskOpen(false); setAskSent(false); setAskMsg(''); };
  const closeStart = () => {
    setStartOpen(false); setStartStep('confirm');
    setAcctName(MOCK_CLIENT_FULL); setAcctEmail(MOCK_CLIENT_EMAIL); setAcctPassword('');
  };
  const firstName = MOCK_PREPARED_BY.split(' ')[0];

  // Commit a free-entry quantity: snap to steps of 100, clamp 100–5,000,
  // sync every price on the page exactly as a tier click does.
  const commitQty = useCallback((raw: string) => {
    const parsed = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    const next = Number.isFinite(parsed) ? snapQty(parsed) : qty;
    setQty(next);
    setQtyInput(String(next));
  }, [qty]);
  // Tier clicks flow through the same setter so the free-entry field mirrors.
  const applyQty = useCallback((next: number) => {
    const snapped = snapQty(next);
    setQty(snapped);
    setQtyInput(String(snapped));
  }, []);
  const stepQty = useCallback((dir: 1 | -1) => {
    applyQty(qty + dir * QTY_STEP);
  }, [qty, applyQty]);

  // Metalwork change → reprice + a brief flash on the setup block (Brief 3).
  const chooseMetalwork = useCallback((id: MetalworkId) => {
    setMetalwork(id);
    setSetupFlash(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSetupFlash(false), 900);
  }, []);

  const unitCost = useMemo(() => unitCostAt(qty), [qty]);
  const subtotal = unitCost * qty;
  const setupTotal = useMemo(() => setupTotalFor(metalwork), [metalwork]);
  const setupLines = useMemo(() => setupLinesFor(metalwork), [metalwork]);
  const setupDelta = setupTotal - DEFAULT_SETUP_TOTAL; // vs. press default
  const total = subtotal + setupTotal;

  // Brief 4 — next-price-break callout. The delta is the honest per-record
  // drop the customer would earn by moving up to the next break.
  const nextBrk = nextBreak(qty);
  const perRecordDrop = nextBrk !== null ? unitCost - unitCostAt(nextBrk) : 0;
  const showBreakCallout = nextBrk !== null && perRecordDrop > 0.005;

  return (
    <div style={{ minHeight: '100vh', background: CANVAS, color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif" }}>


      {/* ── Sticky spec bar (Bill, Aug 24 2026): Memphis logo top-left like the
          sibling MRP client mocks — 56px, hairline bottom border, frosted
          backdrop-blur — carrying a LIVE spec + price summary so the numbers
          stay visible while the client reads the detail below. Specs are a
          compact interpunct run; per-unit + total are right-aligned and move
          in lockstep with the page's qty/metalwork state. The page's one
          filled action ("Start this project") stays below; the bar is quiet
          and action-free (canon: no second filled action). ── */}
      <header
        data-testid="estimate-sticky-bar"
        style={{
          position: 'sticky', top: 0, zIndex: 40, height: 56, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 16,
          padding: '0 20px', borderBottom: `1px solid ${HAIRLINE}`,
          background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* Memphis logo + live specs — one quiet interpunct run */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <img src={mrpLogoAsset} alt="Memphis Record Pressing" style={{ width: 34, height: 34, flexShrink: 0 }} />
          <div
            data-testid="estimate-sticky-specs"
            style={{ fontSize: 12.5, color: SUBINK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}
          >
            {MOCK_SPEC} · {qty.toLocaleString()} units
          </div>
        </div>
        {/* Right cluster — live price sits LEFT of the CTA; the filled action
            appears only once the original has scrolled off (canon guard). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {/* Live price — per-unit then total, updates in lockstep */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontVariantNumeric: 'tabular-nums' }}>
            <span data-testid="estimate-sticky-unit" style={{ fontSize: 12.5, color: SUBINK, whiteSpace: 'nowrap' }}>
              {money2(unitCost)} /unit
            </span>
            <span aria-hidden style={{ color: HAIRLINE }}>·</span>
            <span data-testid="estimate-sticky-total" style={{ fontSize: 15, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>
              {money(total)}
            </span>
          </div>
          {/* Sticky filled CTA — fades/slides in when the original is off-screen.
              width/margin collapse when hidden so the price stays flush right. */}
          <button
            type="button"
            onClick={() => setStartOpen(true)}
            data-testid="estimate-sticky-cta"
            aria-hidden={!showStickyCta}
            tabIndex={showStickyCta ? 0 : -1}
            className="estimate-sticky-cta"
            style={{
              padding: '8px 18px', borderRadius: 0, border: 'none',
              background: BLUE, color: '#1d1d1f', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              cursor: 'pointer',
              opacity: showStickyCta ? 1 : 0,
              transform: showStickyCta ? 'translateX(0)' : 'translateX(8px)',
              pointerEvents: showStickyCta ? 'auto' : 'none',
              maxWidth: showStickyCta ? 200 : 0,
              marginLeft: showStickyCta ? 0 : -16,
              overflow: 'hidden',
              transition: 'opacity 0.25s ease, transform 0.25s ease, max-width 0.25s ease, margin-left 0.25s ease',
            }}
          >
            Start this project
          </button>
        </div>
        {/* Reduced motion: no slide, just an instant appear/disappear. */}
        <style>{`
          @media (prefers-reduced-motion: reduce) {
            .estimate-sticky-cta { transition: none !important; transform: none !important; }
          }
        `}</style>
      </header>

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
            {/* inner sleeve — peeking between jacket and record. Sits a hair INSIDE the
                jacket bottom (top 2 + 284 = 286 < 288) — it must never dip below the
                cover (Bill, Aug 26 2026, pin #360). */}
            <div className="absolute transition-transform duration-500 ease-out group-hover:translate-x-5" style={{ left: 26, top: 2, width: 284, height: 284, borderRadius: 0, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.4)' }} aria-hidden>
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
            Tap a run size — or enter your own below. Every price follows.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {QUANTITIES.map((q) => {
              const active = q === qty;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => applyQty(q)}
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

          {/* ── Your quantity — free entry (Brief 2). A first-class companion
              to the tier cards: type or step in 100s, 100–5,000. It prices at
              the break it earns, and is "active" whenever the run isn't sitting
              exactly on one of the six tiers. ── */}
          {(() => {
            const onTier = QUANTITIES.includes(qty);
            const active = !onTier;
            const brk = earnedBreak(qty);
            return (
              <div
                data-testid="estimate-qty-custom"
                style={{
                  marginTop: 10, padding: '16px 18px', borderRadius: 0,
                  background: active ? CARD_RAISED : CARD,
                  border: active ? `1.5px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* word + icon, never color alone (Bill is colorblind) */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? BLUE : SUBINK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: active ? BLUE : INK }}>Your quantity</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 3 }}>
                    Any run 100–5,000, in steps of 100. Priced at the {brk.toLocaleString()}-unit break.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* stepper — square corners, quiet hairline */}
                  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${HAIRLINE}`, borderRadius: 0, background: CANVAS }}>
                    <button
                      type="button"
                      onClick={() => stepQty(-1)}
                      disabled={qty <= QTY_MIN}
                      aria-label="Decrease quantity by 100"
                      data-testid="estimate-qty-step-down"
                      style={{
                        width: 34, height: 38, border: 'none', background: 'transparent',
                        cursor: qty <= QTY_MIN ? 'not-allowed' : 'pointer',
                        color: qty <= QTY_MIN ? 'rgba(0,0,0,0.25)' : INK, fontSize: 18, lineHeight: 1,
                      }}
                    >
                      −
                    </button>
                    <input
                      value={qtyInput}
                      inputMode="numeric"
                      onChange={(e) => setQtyInput(e.target.value)}
                      onBlur={(e) => commitQty(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitQty((e.target as HTMLInputElement).value); }}
                      aria-label="Quantity"
                      data-testid="input-qty-custom"
                      style={{
                        width: 72, height: 38, textAlign: 'center', border: 'none',
                        borderLeft: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`,
                        background: 'transparent', color: INK, fontSize: 15, fontWeight: 700,
                        outline: 'none', fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => stepQty(1)}
                      disabled={qty >= QTY_MAX}
                      aria-label="Increase quantity by 100"
                      data-testid="estimate-qty-step-up"
                      style={{
                        width: 34, height: 38, border: 'none', background: 'transparent',
                        cursor: qty >= QTY_MAX ? 'not-allowed' : 'pointer',
                        color: qty >= QTY_MAX ? 'rgba(0,0,0,0.25)' : INK, fontSize: 18, lineHeight: 1,
                      }}
                    >
                      +
                    </button>
                  </div>
                  <div style={{ fontSize: 12.5, color: active ? BLUE : SUBINK, fontVariantNumeric: 'tabular-nums', minWidth: 78, textAlign: 'right' }}>
                    {money2(unitCostAt(qty))} /unit
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── Metalwork — how the masters get cut (Brief 3) ──
            Radio-card row that fits the page grammar. One-line explanation per
            choice, a "Press default" tag on the first, honest setup deltas.
            Choosing reprices the setup block + full-run total below. ── */}
        <section style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13.5, color: SUBINK, marginBottom: 12 }}>
            Choose how your masters are cut — the setup cost adjusts to match.
          </div>
          <div style={{ display: 'grid', gap: 10 }} role="radiogroup" aria-label="Metalwork cutting">
            {METALWORK.map((m) => {
              const selected = m.id === metalwork;
              const delta = setupTotalFor(m.id) - DEFAULT_SETUP_TOTAL;
              const deltaLabel =
                delta === 0 ? 'Included in setup'
                : delta < 0 ? `${money(Math.abs(delta))} less setup`
                : `${money(delta)} more setup`;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => chooseMetalwork(m.id)}
                  data-testid={`metalwork-${m.id}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14, width: '100%', textAlign: 'left',
                    padding: '14px 16px', borderRadius: 0, cursor: 'pointer', color: INK,
                    background: selected ? CARD_RAISED : CARD,
                    border: selected ? `1.5px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                  }}
                >
                  {/* radio dot — round is allowed (true circle), word carries meaning too */}
                  <span
                    aria-hidden
                    style={{
                      marginTop: 2, width: 18, height: 18, flexShrink: 0, borderRadius: '50%',
                      border: selected ? `5px solid ${BLUE}` : `1.5px solid ${HAIRLINE}`,
                      background: CANVAS, boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</span>
                      {m.isDefault && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                          color: INK, background: BLUE, padding: '2px 7px', borderRadius: 0,
                        }}>
                          Press default
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: SUBINK, marginTop: 3, lineHeight: 1.5 }}>{m.blurb}</div>
                  </div>
                  <div style={{ fontSize: 12, color: SUBINK, whiteSpace: 'nowrap', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {deltaLabel}
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
                <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(setupTotal)}</div>
              </button>
              {setupOpen && setupLines.map((l) => (
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
          {/* Setup — reprices + flashes when the metalwork choice changes */}
          <div
            data-testid="estimate-setup-row"
            style={{
              display: 'flex', justifyContent: 'space-between', padding: '13px 18px',
              background: setupFlash ? BLUE_TINT_TOP : CARD,
              transition: 'background-color 0.5s ease',
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Setup</div>
              <div style={{ fontSize: 12, color: SUBINK, marginTop: 1 }}>
                One-time · {metalworkById(metalwork).name}
                {setupDelta !== 0 && (
                  <span style={{ color: INK }}>
                    {' '}({setupDelta < 0 ? '−' : '+'}{money(Math.abs(setupDelta))} vs. press default)
                  </span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{money(setupTotal)}</div>
          </div>
          <div style={{ padding: '18px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${BLUE_TINT_TOP} 0%, ${CARD} 100%)` }}>
            {/* ── Totals band, Bill's layout (Aug 22 2026): the press's math
                owns the RIGHT (label above the number, Apple label-over-value),
                the GoodTunes offer owns the LEFT as a larger soft box. Arrow
                rule: an arrow only on a link, always →, never decorative —
                the old up-arrow glyph is gone (three arrows was noise). ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
              {/* GoodTunes hook — ONE ask on the page (Bill, Aug 22 2026):
                  "Start this project" stays the only filled action; this box
                  is a DISCLOSURE, not a competing ask. Bolder headline + a
                  circled "+" that opens it right here (no modal). Opening is
                  tracked: seen → later nudges become a friendly reminder;
                  unseen → the box keeps hinting. No per-unit numbers inside —
                  what GoodTunes does, and that they can earn more once the
                  project starts. */}
              {/* Square corners (Bill, Aug 22 2026): the box follows the press
                  skin's corner style — MRP is square everywhere, so is this.
                  Only the "+" glyph stays a circle. */}
              <div style={{ background: 'rgba(255,255,255,0.75)', border: `1px solid ${HAIRLINE}`, borderRadius: 0, maxWidth: 360, alignSelf: 'stretch' }}>
                <button
                  type="button"
                  onClick={() => setHookOpen(!hookOpen)}
                  aria-expanded={hookOpen}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', padding: '14px 18px', cursor: 'pointer', textAlign: 'left' }}
                  data-testid="estimate-goodtunes-hook"
                >
                  {/* Echoes the email word-for-word (Bill, Aug 22 2026): the
                      email says "You're eligible to get this for $0 out of
                      pocket" — the page opens with the same sentence, so
                      arriving from the email feels like a continuation. */}
                  <span className="gt-hook-shimmer" style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.35 }}>
                    You&rsquo;re eligible to get this for $0 out of pocket.
                  </span>
                  {/* the "+" — circled, rotates to × when open */}
                  <span aria-hidden style={{ marginLeft: 'auto', width: 24, height: 24, flexShrink: 0, borderRadius: '50%', border: `1px solid ${HAIRLINE}`, background: CARD, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: hookOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                      <path d="M12 5v14" /><path d="M5 12h14" />
                    </svg>
                  </span>
                </button>
                {hookOpen && (
                  <div style={{ padding: '0 18px 16px' }} data-testid="estimate-goodtunes-expanded">
                    <div style={{ fontSize: 12.5, color: SUBINK, lineHeight: 1.65 }}>
                      Our partners at GoodTunes® will host the pre-order for your fans,
                      handle every order and GoodDeed® certificate, and pay the press bill
                      directly — same build, same press, $0 up front.
                    </div>
                    <div style={{ fontSize: 12.5, color: INK, fontWeight: 600, marginTop: 8 }}>
                      And you can earn more once you start the project.
                    </div>
                    <div style={{ fontSize: 11, color: SUBINK, marginTop: 10 }}>
                      Nothing to decide now — when you start this project, you&rsquo;ll
                      choose who pays for the pressing.
                    </div>
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: BLUE }}>Estimate total</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 2 }}>If {MOCK_CLIENT_FIRST} presses the full run</div>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{money(total)}</div>

                {/* Next price break — quiet one-line link under the price.
                    "Switch to…" says what happens (no software jargon). */}
                {showBreakCallout && nextBrk !== null && (
                  <button
                    type="button"
                    onClick={() => applyQty(nextBrk)}
                    data-testid="estimate-next-break"
                    style={{
                      marginTop: 4, display: 'inline-flex', alignItems: 'baseline', gap: 6,
                      padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: SUBINK,
                    }}
                  >
                    <span style={{ fontSize: 12, lineHeight: 1.4 }}>
                      Next break: {money2(unitCostAt(nextBrk))} each{' '}
                      <span style={{ color: INK, fontWeight: 600 }}>Switch to {nextBrk.toLocaleString()} units →</span>
                    </span>
                  </button>
                )}
              </div>
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
                ref={startBtnRef}
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
              <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>3015 Brother Blvd · Memphis, TN · memphisrecordpressing.com</div>
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

      {/* Site footer — the login page’s full footer rides the estimate too (Bill, Aug 26 2026). */}
      <MrpSiteFooter />
    </div>
  );
}
