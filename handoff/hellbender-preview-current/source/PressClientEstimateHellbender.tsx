// CORNER RULING (Bill, Aug 22 2026, stylesheet-first from hellbendervinyl.com):
// buttons are fully-rounded PILLS (--buttons-radius 40px) with white text;
// inputs are nearly square (2px); cards/media/popups stay square (0); status/
// variant pills are rounded (40px). Only true circles (avatars, status dots,
// the frosted x) stay fully round.
// PressClientEstimateHellbender — the WHITE-LABEL (Hellbender Vinyl) flavor
// of the client estimate page. Bill's ask (Aug 21 2026): same dark page,
// Hellbender's look and feel — red accent #DF0C15 (eyedropped from
// hellbendervinyl.com — Andrew, Aug 21 2026) replaces GoodTunes blue; filled red actions carry dark ink
// like Hellbender's own "GET A QUOTE" button. Layout, copy, numbers, and wiring are
// otherwise identical to PressClientEstimate — keep the two in lockstep.
// UNLOCKED by Bill (Aug 18 2026) — the Aug-16 lock stands for layout, but
// Bill ok'd wiring the actions: Share is a quiet dialog (private link, no
// account), Ask a question is Travis's card, Start this project is a
// confirm sheet, and the GoodTunes hook became ONE quiet line under the
// total. Everything else stays pixel-identical.
// PressClientEstimate — the estimate a press client actually receives.
// Bill's brief (Aug 16 2026): based on the real Hellbender quote PDF
// (071526-02, How??? single LP). One page, client-facing, dark.
// - Click any quantity tier and every price updates live.
// - "Setup costs" is one line; the chevron reveals the fixed-cost breakdown.
// - "Prepared for" name comes from the client record (Spotify import etc. —
//   mocked here as Alma Rivera).
// - Action at the bottom is a placeholder "Start this project" (exact
//   action TBD with Bill).
// Self-contained per handoff rules. Numbers from the Hellbender PDF at 1,000 units;
// other tiers scale with the standard qty curve.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Facebook, Instagram, MapPin, Music2, Star, Twitter, X, Youtube } from 'lucide-react';
import howAlbumCover from '@/pages/hellbender/assets/how-album-cover.jpg';
import innerSleeveArt from '@/pages/hellbender/assets/how-album-cover.jpg';
import hellbenderMark from '@/assets/artist-portal/hellbender-icon.svg';
import hellbenderLogo from '@/pages/hellbender/assets/hellbender-full.svg';
import travisPhoto from '@/pages/hellbender/assets/travis-whitlock.webp';
import hellbenderBbbSeal from '@/pages/hellbender/assets/hellbender-bbb-seal.png';
import goodtunesLogo from '@/pages/hellbender/assets/goodtunes-logo.png';

// ─── Mock data (from the Hellbender estimate PDF) ───────────────────────────
const MOCK_CLIENT_FIRST = 'Alex';
const MOCK_CLIENT_FULL = 'Alex Tebeleff';
const MOCK_CLIENT_EMAIL = 'alex@howband.com';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_DATE = 'August 24, 2026';
const MOCK_VALID_UNTIL = 'September 23, 2026';
const MOCK_PREPARED_BY = 'Travis Whitlock';
const MOCK_JOB = 'How???';
const MOCK_SPEC = '12" · 140g · Emerald translucent · 1 LP';

// Per-unit line items at the 1,000-unit tier (PDF "DESCRIPTION" block).
const UNIT_LINES = [
  { id: 'vinyl',    name: '12" LP · 140g color vinyl',            note: 'Translucent emerald, single LP',                 at1000: 2.30 },
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
const CANVAS = '#ffffff'; // Hellbender pages are pure white (Andrew, Aug 21 2026)
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const BLUE = '#DF0C15'; // Hellbender white-label accent — red replaces GoodTunes blue everywhere

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

const BLUE_TINT_TOP = 'rgba(223,12,21,0.10)';
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

// Corner grammar — authoritative from hellbendervinyl.com stylesheets
// (Bill, Aug 22 2026): buttons are fully-rounded pills (--buttons-radius 40px),
// inputs nearly square (2px), cards/media square (0).
const BTN_RADIUS = 40;
const INPUT_RADIUS = 2;

// Inputs — nearly square (2px), 1px border at rgba(0,0,0,0.15).
const fieldStyle: React.CSSProperties = {
  width: '100%', height: 45, borderRadius: INPUT_RADIUS, padding: '0 12px', fontSize: 14,
  background: CANVAS, border: '1px solid rgba(0,0,0,0.15)', color: INK, outline: 'none',
};
// Confirm — pill, uppercase Chivo. Earns its red once the user acts.
const confirmBtn = (earned: boolean): React.CSSProperties => ({
  minHeight: 45, padding: '0 30px', borderRadius: BTN_RADIUS, fontSize: 15, fontWeight: 700,
  letterSpacing: 1, textTransform: 'uppercase',
  cursor: earned ? 'pointer' : 'not-allowed',
  background: earned ? BLUE : 'transparent',
  border: earned ? '1px solid transparent' : `1px solid ${HAIRLINE}`,
  color: earned ? '#ffffff' : SUBINK,
});

const GOLD = '#DF0C15'; // Hellbender's site red (Andrew, Aug 21 2026)

const SIGNIN_FONT = "'Chivo', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function GoogleReviewWidget() {
  const C = { blue: '#4285F4', red: '#EA4335', yellow: '#FBBC05', green: '#34A853' };
  const SIZE = 145;
  // Four 90° arcs, ordered blue→red→yellow→green, inset for the 8px stroke.
  const R = SIZE / 2 - 6, CX = SIZE / 2, CY = SIZE / 2;
  const arc = (startDeg: number) => {
    const s = (startDeg * Math.PI) / 180, e = ((startDeg + 90) * Math.PI) / 180;
    return `M ${CX + R * Math.cos(s)} ${CY + R * Math.sin(s)} A ${R} ${R} 0 0 1 ${CX + R * Math.cos(e)} ${CY + R * Math.sin(e)}`;
  };
  const google = [['G', C.blue], ['o', C.red], ['o', C.yellow], ['g', C.blue], ['l', C.green], ['e', C.red]] as const;
  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Google reviews: 5.0 average rating out of 5" style={{ position: 'absolute', inset: 0 }}>
        <path d={arc(-90)} fill="none" stroke={C.blue} strokeWidth={8} strokeLinecap="round" />
        <path d={arc(0)} fill="none" stroke={C.red} strokeWidth={8} strokeLinecap="round" />
        <path d={arc(90)} fill="none" stroke={C.yellow} strokeWidth={8} strokeLinecap="round" />
        <path d={arc(180)} fill="none" stroke={C.green} strokeWidth={8} strokeLinecap="round" />
      </svg>
      {/* Content centered INSIDE the ring. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, textAlign: 'center' }} aria-hidden>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1 }}>
          {google.map(([ch, col], i) => <span key={i} style={{ color: col }}>{ch}</span>)}
        </div>
        <div style={{ display: 'inline-flex', gap: 1 }}>
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={13} fill="#FBBC05" stroke="none" />)}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>5.0</div>
        <div style={{ fontSize: 11, color: SUBINK, lineHeight: 1 }}>average rating</div>
      </div>
    </div>
  );
}

type PayBrand =
  | 'amazon' | 'amex' | 'applepay' | 'diners' | 'discover'
  | 'gpay' | 'mastercard' | 'paypal' | 'shop' | 'visa';

function PaymentBadge({ brand, label }: { brand: PayBrand; label: string }) {
  const shell = (children: React.ReactNode, extra?: React.CSSProperties): React.ReactElement => (
    <span
      role="img"
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2,
        width: 44, height: 26, borderRadius: 4, background: '#ffffff',
        border: `1px solid #dddddd`, overflow: 'hidden', whiteSpace: 'nowrap',
        ...extra,
      }}
    >
      {children}
    </span>
  );
  switch (brand) {
    case 'amex':
      return shell(<span style={{ color: '#ffffff', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em' }}>AMEX</span>, { background: '#016FD0', border: 'none' });
    case 'shop':
      return shell(<span style={{ color: '#ffffff', fontSize: 10, fontWeight: 800 }}>shop</span>, { background: '#5A31F4', border: 'none' });
    case 'amazon':
      return shell(
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
          <span style={{ color: '#000000', fontSize: 8.5, fontWeight: 700 }}>amazon</span>
          <span style={{ width: 22, height: 5, borderBottom: '2px solid #FF9900', borderRadius: '0 0 11px 11px' }} aria-hidden />
        </span>,
      );
    case 'applepay':
      return shell(
        <>
          <svg width={9} height={11} viewBox="0 0 14 17" fill="#000000" aria-hidden>
            <path d="M11.2 9c0-1.6 1.3-2.4 1.4-2.4-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.1-.6c-1.1 0-2.1.6-2.7 1.6-1.1 2-.3 4.9.8 6.5.5.8 1.2 1.7 2 1.6.8 0 1.1-.5 2.1-.5s1.2.5 2.1.5 1.4-.8 1.9-1.5c.6-.9.9-1.7.9-1.8-.1 0-1.7-.7-1.7-2.7zM9.5 4.2c.4-.5.7-1.2.6-1.9-.6 0-1.4.4-1.8.9-.4.4-.8 1.1-.7 1.8.7.1 1.4-.3 1.9-.8z" />
          </svg>
          <span style={{ color: '#000000', fontSize: 9.5, fontWeight: 600 }}>Pay</span>
        </>,
      );
    case 'diners':
      return shell(
        <>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#0079BE' }} aria-hidden />
          <span style={{ color: '#0079BE', fontSize: 8, fontWeight: 700 }}>Diners</span>
        </>,
      );
    case 'discover':
      return shell(
        <>
          <span style={{ color: '#000000', fontSize: 8, fontWeight: 700 }}>Disc</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6000' }} aria-hidden />
          <span style={{ color: '#000000', fontSize: 8, fontWeight: 700 }}>ver</span>
        </>,
      );
    case 'gpay':
      return shell(
        <>
          <span style={{ color: '#4285F4', fontSize: 10, fontWeight: 700 }}>G</span>
          <span style={{ color: '#5F6368', fontSize: 9, fontWeight: 600 }}>Pay</span>
        </>,
      );
    case 'mastercard':
      return shell(
        <>
          <span style={{ position: 'relative', display: 'inline-block', width: 20, height: 12 }} aria-hidden>
            <span style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 12, borderRadius: '50%', background: '#EB001B' }} />
            <span style={{ position: 'absolute', left: 8, top: 0, width: 12, height: 12, borderRadius: '50%', background: '#F79E1B', opacity: 0.85 }} />
          </span>
          <span style={{ color: '#000000', fontSize: 7, fontWeight: 700 }}>MC</span>
        </>,
      );
    case 'paypal':
      return shell(
        <span style={{ fontSize: 9, fontWeight: 800, fontStyle: 'italic' }}>
          <span style={{ color: '#003087' }}>Pay</span><span style={{ color: '#0070E0' }}>Pal</span>
        </span>,
      );
    case 'visa':
      return shell(<span style={{ color: '#1A1F71', fontSize: 11, fontWeight: 800, fontStyle: 'italic', letterSpacing: '0.02em' }}>VISA</span>);
    default:
      return shell(<span style={{ color: '#000000', fontSize: 8, fontWeight: 700 }}>{label}</span>);
  }
}

function SigninSiteFooter() {
  // Outline lucide glyphs — MapPin stands in for Pinterest's pin.
  const socials = [
    { icon: Facebook, label: 'Facebook' },
    { icon: Instagram, label: 'Instagram' },
    { icon: Youtube, label: 'YouTube' },
    { icon: Music2, label: 'TikTok' },
    { icon: Twitter, label: 'X' },
    { icon: MapPin, label: 'Pinterest' },
  ];
  // Real-site payment lineup — each renders as its own brand mark.
  const payments: { brand: PayBrand; label: string }[] = [
    { brand: 'amazon', label: 'Amazon' },
    { brand: 'amex', label: 'American Express' },
    { brand: 'applepay', label: 'Apple Pay' },
    { brand: 'diners', label: 'Diners Club' },
    { brand: 'discover', label: 'Discover' },
    { brand: 'gpay', label: 'Google Pay' },
    { brand: 'mastercard', label: 'Mastercard' },
    { brand: 'paypal', label: 'PayPal' },
    { brand: 'shop', label: 'Shop Pay' },
    { brand: 'visa', label: 'Visa' },
  ];
  return (
    <footer style={{ position: 'relative', background: '#ffffff', color: INK, borderTop: `1px solid ${HAIRLINE}`, fontFamily: SIGNIN_FONT }}>
      {/* Extra bottom padding keeps the copyright/payment rows clear of the
          pinned bottom-left teaser tab. */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '52px 30px 64px' }}>
        {/* Four-block row: BBB seal · Google widget · Pittsburgh/Philadelphia ·
            Portland/Inquiries — all centered like the live site. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32, alignItems: 'start', justifyItems: 'center' }}>
          {/* BBB — the real black torch seal, natural vertical proportion. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
            <img src={hellbenderBbbSeal} alt="BBB Accredited Business" style={{ width: 68, height: 'auto', display: 'block' }} />
            <span style={{ fontSize: 12, color: SUBINK }}>Rating: A+</span>
          </div>
          {/* Google review widget. */}
          <GoogleReviewWidget />
          {/* Pittsburgh / Philadelphia — centered, city names bold, each line broken. */}
          <div style={{ fontSize: 14.5, lineHeight: 1.65, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Pittsburgh</div>
            <div style={{ color: SUBINK }}>5794 Butler Street</div>
            <div style={{ color: SUBINK }}>Pittsburgh, PA 15201</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 14 }}>Philadelphia</div>
            <div style={{ color: SUBINK }}>300 E Godfrey Avenue</div>
            <div style={{ color: SUBINK }}>Philadelphia, PA 19120</div>
          </div>
          {/* Portland / All Inquiries — centered, red underlined mailto. */}
          <div style={{ fontSize: 14.5, lineHeight: 1.65, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Portland</div>
            <div style={{ color: SUBINK }}>16735 SE Kens Court, Suite A</div>
            <div style={{ color: SUBINK }}>Milwaukie, OR 97267</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 14 }}>All Inquiries</div>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ color: GOLD, textDecoration: 'underline' }} data-testid="signin-footer-email">hello@hellbendervinyl.com</a>
          </div>
        </div>

        {/* Newsletter (left) + socials (right). */}
        <div style={{ marginTop: 34, paddingTop: 26, borderTop: `1px solid ${HAIRLINE}`, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 420, flex: '1 1 320px' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Sign Up for Our Newsletter &amp; Get a Free Shirt!</div>
            {/* Square field, placeholder "Email", arrow sits INSIDE at the right. */}
            <div style={{ position: 'relative', marginTop: 12, width: 300, maxWidth: '100%' }}>
              <input
                type="email"
                placeholder="Email"
                aria-label="Email"
                data-testid="signin-newsletter-email"
                style={{ width: '100%', height: 45, borderRadius: 2, padding: '0 44px 0 12px', fontSize: 14, background: '#ffffff', border: '1px solid rgba(0,0,0,0.15)', color: INK, outline: 'none' }}
              />
              <button
                type="button"
                aria-label="Subscribe"
                data-testid="signin-newsletter-submit"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 34, height: 37, borderRadius: 2, background: 'transparent', border: 'none', color: INK, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ArrowRight size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {socials.map(({ icon: Icon, label }) => (
              <a key={label} href="#" onClick={(e) => e.preventDefault()} aria-label={label} style={{ display: 'inline-flex', color: INK }}>
                <Icon size={17} strokeWidth={1.8} aria-hidden />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom — copyright FIRST, then the payment badge row (real-site order). */}
        <div style={{ marginTop: 26, paddingTop: 18, borderTop: `1px solid ${HAIRLINE}` }}>
          <div style={{ textAlign: 'center', fontSize: 12, color: SUBINK, lineHeight: 1.7 }}>
            © 2026 Hellbender Vinyl · Refund policy · Privacy policy · Terms of service · Shipping policy · Contact information
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
            {payments.map((p) => (
              <PaymentBadge key={p.brand} brand={p.brand} label={p.label} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-left black teaser tab — static, non-functional. lucide X, not a glyph. */}
      <div
        aria-hidden
        style={{ position: 'absolute', left: 0, bottom: 0, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#000000', color: '#ffffff', padding: '10px 16px', fontSize: 13, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
      >
        <X size={16} strokeWidth={2.4} />
        Get a Free T-Shirt!
      </div>
    </footer>
  );
}

export default function PressClientEstimateHellbender() {
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

  // Sticky-bar CTA guard — repeat the ONE filled action up top only once the
  // page's original "Start this project" button has scrolled off-screen, so
  // exactly one filled accent action is visible at any moment (canon).
  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);
  useEffect(() => {
    const el = startBtnRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setShowStickyCta(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);


  return (
    <div style={{ minHeight: '100vh', background: CANVAS, color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif" }}>
      {/* ── Sticky summary bar — THE page header (Bill, Aug 26 2026, pin #363):
          logo + live specs left, live price right; the filled CTA repeats here
          only once the original has scrolled off (canon: one filled action). ── */}
      <header
        data-testid="estimate-sticky-bar"
        style={{
          position: 'sticky', top: 0, zIndex: 40, height: 56, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 16,
          padding: '0 20px', borderBottom: `1px solid ${HAIRLINE}`,
          background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <img src={hellbenderLogo} alt="Hellbender Vinyl" style={{ width: 30, height: 30, flexShrink: 0 }} />
          <div
            data-testid="estimate-sticky-specs"
            style={{ fontSize: 12.5, color: SUBINK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}
          >
            {MOCK_SPEC} · {qty.toLocaleString()} units
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontVariantNumeric: 'tabular-nums' }}>
            <span data-testid="estimate-sticky-unit" style={{ fontSize: 12.5, color: SUBINK, whiteSpace: 'nowrap' }}>
              {money2(unitCost)} /unit
            </span>
            <span aria-hidden style={{ color: HAIRLINE }}>·</span>
            <span data-testid="estimate-sticky-total" style={{ fontSize: 15, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>
              {money(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStartOpen(true)}
            data-testid="estimate-sticky-cta"
            aria-hidden={!showStickyCta}
            tabIndex={showStickyCta ? 0 : -1}
            className="estimate-sticky-cta"
            style={{
              padding: '8px 20px', borderRadius: BTN_RADIUS, background: BLUE, color: '#ffffff', fontSize: 12.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              whiteSpace: 'nowrap', cursor: 'pointer', border: 'none',
              opacity: showStickyCta ? 1 : 0,
              transform: showStickyCta ? 'translateX(0)' : 'translateX(8px)',
              pointerEvents: showStickyCta ? 'auto' : 'none',
              maxWidth: showStickyCta ? 240 : 0,
              marginLeft: showStickyCta ? 0 : -16,
              overflow: 'hidden',
              transition: 'opacity 0.25s ease, transform 0.25s ease, max-width 0.25s ease, margin-left 0.25s ease',
            }}
          >
            Start this project
          </button>
        </div>
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
            <img src={howAlbumCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                  <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#20B957' }} />
                  <img src="/__mockup/vinyl-layers/translucent-vinyl.png" alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'multiply', opacity: 0.52 }} />
                  {/* Hellbender center label — consistent across every journey screen. */}
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '40%', height: '40%', borderRadius: '50%', overflow: 'hidden' }}>
                    <img src={hellbenderMark} alt="" aria-hidden style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
              src={howAlbumCover}
              alt="How??? cover"
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
                background: linear-gradient(100deg, #86868b 0%, #86868b 38%, #f08a8f 48%, #DF0C15 50%, #f08a8f 52%, #86868b 62%, #86868b 100%);
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
                ref={startBtnRef}
                data-testid="estimate-start-project"
                style={{
                  minHeight: 45, padding: '0 30px', borderRadius: BTN_RADIUS, border: 'none', cursor: 'pointer',
                  background: BLUE, color: '#ffffff', fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
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
            <img src={hellbenderLogo} alt="Hellbender Vinyl" style={{ width: 40, height: 40, opacity: 0.9 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>Hellbender Vinyl</div>
              <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>5794 Butler Street · Pittsburgh, PA · hellbendervinyl.com</div>
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

      {/* ── Ask a question — Travis's card ── */}
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
                  <img src={travisPhoto} alt={MOCK_PREPARED_BY} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>How can I help?</div>
                  <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>{MOCK_PREPARED_BY} · Hellbender Vinyl</div>
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
              {/* The flow continues — done state hands off to the Hellbender-branded
                  next-steps page (Bill, Aug 21 2026). */}
              <button
                type="button"
                data-testid="button-see-next-steps"
                onClick={() => { window.location.hash = '#/PressClientNextStepsHellbender'; }}
                style={{
                  marginTop: 18, minHeight: 45, padding: '0 30px', borderRadius: BTN_RADIUS, border: 'none', cursor: 'pointer',
                  background: BLUE, color: '#ffffff', fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
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
                Start {MOCK_JOB} with Hellbender Vinyl
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
          Large rounded square: full-bleed emerald-vinyl graphic on top, type
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
            <div style={{ position: 'relative', height: 280, overflow: 'hidden', background: '#161617' }} aria-hidden>
              <div style={{ position: 'absolute', left: '50%', top: 30, transform: 'translateX(-50%)', width: 340, height: 340, borderRadius: '50%', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#20B957' }} />
                <img src="/__mockup/vinyl-layers/translucent-vinyl.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'multiply', opacity: 0.52 }} />
                <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '40%', height: '40%', borderRadius: '50%', overflow: 'hidden' }}>
                  <img src={hellbenderMark} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: '50%', background: '#161617' }} />
                </div>
              </div>
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
                  marginTop: 22, width: '100%', minHeight: 45, padding: '0 30px', borderRadius: BTN_RADIUS, border: 'none',
                  cursor: 'pointer', background: BLUE, color: '#ffffff', fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                }}
              >
                Learn more
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Site footer — the login page’s full footer rides the estimate too (Bill, Aug 26 2026). */}
      <SigninSiteFooter />
    </div>
  );
}
