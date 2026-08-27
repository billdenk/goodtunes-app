// CORNER RULING (Cinq skin): Cinq Music's corner token = SQUARE, radius 0
// everywhere — inputs, buttons, cards, pills. Only true circles (avatars,
// status dots) stay round. Matches cinqmusic.com's real site.
// PressClientNextStepsCinq — the Cinq Music white-label twin of
// PressClientNextStepsMRP: a Cinq-branded login screen, then the GoodTunes
// artist portal (artist tier, same database, same accounts) wearing Cinq's
// dark white-label skin, with the next-steps overview as landing content.
// Shell = top bar + left rail per the artist nav canon (Aug 16 2026):
// Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals,
// Shopify, Reports — Team pinned at the rail bottom, ⌘K chip flush right.
// Canon: Cinq white-label = DARK canvas near-black #0C0C0D, deep navy
// #001C30 panels, white text, white hairlines at 14%, headings big
// condensed uppercase (Anton stands in for ABC Gravity Condensed).
// Buttons: 0 radius, uppercase label — outlined white for quiet actions,
// the ONE filled primary per page is solid white with black text.
// Statuses are always word + icon, never color alone (Bill is colorblind).
// "Estimate", never the q-word. Self-contained per handoff rules.

import { useState } from 'react';
import californialandCover from '../assets/soulchef-escapism-cover.webp';
import dougPhoto from '../assets/doug-reinart.png';
import cinqLogo from '../assets/cinq-logo.svg';
import goodtunesLogo from '../assets/goodtunes-logo.png';

// ─── Mock data — same project the estimate page created ──────────────
const MOCK_CLIENT_FIRST = 'SoulChef';
const MOCK_CLIENT_EMAIL = 'soulchef@soulchefmusic.com';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_PREPARED_BY = 'Doug Reinart';
const MOCK_JOB = 'Escapism: Instrumentals';
const MOCK_SPEC = '12" · 140g · Ruby translucent · 1 LP';
const MOCK_QTY = '1,000 units';
const MOCK_UNIT = '$5.37 /unit';
// 1,000 × $5.37 + $1,295 fixed setup = $6,665.00 → 50% deposit.
const MOCK_DEPOSIT = '$3,332.50';

// ─── Palette — Cinq dark canon (from cinqmusic.com) ──────────────────
const CANVAS = '#0C0C0D';
const CARD = '#001C30'; // Cinq's deep navy — feature panels/cards
const CARD_RAISED = 'rgba(255,255,255,0.05)';
const INK = '#FFFFFF';
const SUBINK = 'rgba(255,255,255,0.65)';
const HAIRLINE = 'rgba(255,255,255,0.14)';
const NAVY = '#001C30';

// ─── Status grammar — word + icon, never color alone ─────────────────
type StepStatus = 'done' | 'next' | 'waiting';

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'next') {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="5.6" fill="none" stroke={SUBINK} strokeWidth="1.5" />
      <path d="M8 5.2V8l2 1.4" fill="none" stroke={SUBINK} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StatusPill({ status }: { status: StepStatus }) {
  const label = status === 'done' ? 'Done' : status === 'next' ? 'Up next' : 'Waiting';
  return (
    <span
      data-testid={`pill-${label.toLowerCase().replace(' ', '-')}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px',
        borderRadius: 0, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
        border: `1px solid ${status === 'next' ? 'rgba(255,255,255,0.45)' : HAIRLINE}`,
        background: status === 'next' ? 'rgba(255,255,255,0.10)' : 'transparent',
        color: status === 'waiting' ? SUBINK : INK,
      }}
    >
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

// ─── Steps — the pressing lifecycle from the client's side ───────────
const STEPS: { id: string; title: string; body: string; status: StepStatus; meta?: string }[] = [
  {
    id: 'created', status: 'done',
    title: 'Project created',
    body: `Estimate ${MOCK_ESTIMATE_NO} is locked as your working numbers. ${MOCK_PREPARED_BY.split(' ')[0]} has been notified.`,
  },
  {
    id: 'assets', status: 'next',
    title: 'Audio & artwork',
    body: 'Upload your master audio and print-ready art — jacket, labels, inner sleeve and insert. We check every file before anything is cut.',
  },
  {
    id: 'test', status: 'waiting',
    title: 'Test pressing approval',
    body: 'Once lacquers are cut and plated, test pressings ship to you with 2-day domestic shipping. Production waits for your approval.',
  },
  {
    id: 'deposit', status: 'waiting',
    title: 'Deposit',
    body: 'A 50% deposit schedules your run. The remainder is billed at completion, per final order specifications.',
    meta: `${MOCK_DEPOSIT} · 50% of the working total`,
  },
  {
    id: 'production', status: 'waiting',
    title: 'Pressing & packaging',
    body: 'Your run is pressed, labels applied, jackets assembled, insert placed on top, then shrinkwrapped retail-ready.',
  },
  {
    id: 'shipping', status: 'waiting',
    title: 'Shipping',
    body: 'Finished records leave the plant with tracking the day they clear final inspection.',
  },
];

// ─── Rail — artist nav canon order, Team pinned at the bottom ────────
const RAIL_ITEMS = ['Dashboard', 'Releases', 'Audience', 'Acquisition', 'Orders', 'Buyers', 'Referrals', 'Shopify', 'Reports'];

function RailIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? INK : SUBINK;
  const common = { fill: 'none', stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'Dashboard': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><rect x="2" y="2" width="5" height="5" rx="1.2" {...common} /><rect x="9" y="2" width="5" height="5" rx="1.2" {...common} /><rect x="2" y="9" width="5" height="5" rx="1.2" {...common} /><rect x="9" y="9" width="5" height="5" rx="1.2" {...common} /></svg>;
    case 'Releases': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="5.6" {...common} /><circle cx="8" cy="8" r="1.4" {...common} /></svg>;
    case 'Audience': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="5.5" cy="6" r="2.2" {...common} /><circle cx="10.8" cy="6.6" r="1.7" {...common} /><path d="M2 13c0-2 1.6-3.4 3.5-3.4S9 11 9 13M9.6 12.9c.2-1.6 1.2-2.6 2.6-2.6 1 0 1.8.5 2.2 1.3" {...common} /></svg>;
    case 'Acquisition': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M2 12l4-4 3 3 5-6M14 5v3.5M14 5h-3.5" {...common} /></svg>;
    case 'Orders': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3 4h10l-1 8H4L3 4zM6 6.5V4a2 2 0 0 1 4 0v2.5" {...common} /></svg>;
    case 'Buyers': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="5.5" r="2.4" {...common} /><path d="M3.5 13.5c.5-2.4 2.2-3.8 4.5-3.8s4 1.4 4.5 3.8" {...common} /></svg>;
    case 'Referrals': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M8 2.5v7M8 2.5L5.5 5M8 2.5L10.5 5M3 9.5v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" {...common} /></svg>;
    case 'Shopify': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3.5 5.5h9l-.8 8h-7.4l-.8-8zM5.8 5.5a2.2 2.2 0 0 1 4.4 0" {...common} /></svg>;
    case 'Reports': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3.5 13.5v-4M8 13.5v-8M12.5 13.5V7" {...common} /></svg>;
    default: return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="5.5" cy="6" r="2.2" {...common} /><circle cx="11" cy="6" r="2.2" {...common} /><path d="M2 13.5c.4-2 1.8-3.2 3.5-3.2s3.1 1.2 3.5 3.2M9.7 11.2c.4-.5 1-.9 1.8-.9 1.4 0 2.6 1 3 3.2" {...common} /></svg>;
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
        border: active ? `1px solid ${HAIRLINE}` : '1px solid transparent',
        textDecoration: 'none',
      }}
    >
      <RailIcon name={name} active={active} />
      {name}
    </a>
  );
}

// ─── Cinq's real site chrome — from cinqmusic.com: black bar, uppercase
// 12px nav split around the centered round Cinq mark with "CINQ" tiny
// under it; CONTACT US and an outlined LOG IN button on the right.
// Nav links are decorative site chrome here; the account chip is the
// portal's. ────────────────────────────────────────────────────────────
const CINQ_NAV_LEFT = ['Home', 'Services', 'About', 'News'];

function CinqSiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#000000', borderBottom: `1px solid ${HAIRLINE}` }}>
      {/* Inter body + Anton headings ride with the header so both stages
          get the Cinq face. Anton stands in for ABC Gravity Condensed. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Anton&display=swap');
        .cinq-nav-link { transition: opacity 0.2s ease; }
        .cinq-nav-link:hover { opacity: 1; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', height: 76, padding: '0 26px' }}>
        {/* Left nav — uppercase 12px, like their live site */}
        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 26, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {CINQ_NAV_LEFT.map((l) => (
            <a
              key={l}
              href="#"
              onClick={(e) => e.preventDefault()}
              className="cinq-nav-link"
              style={{ color: INK, opacity: 0.7, textDecoration: 'none' }}
            >
              {l}
            </a>
          ))}
        </nav>
        {/* Centered round Cinq mark with tiny "CINQ" under it — never invert;
            the mark is white on transparent, made for dark. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <img src={cinqLogo} alt="Cinq Music" style={{ width: 40, height: 40 }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: INK }}>Cinq</span>
        </div>
        {/* Right side — CONTACT US, then the outlined LOG IN button (their
            grammar). Signed in, they step aside for the account chip. */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 26 }}>
          {!signedIn && (
            <>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="cinq-nav-link"
                style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK, opacity: 0.7, textDecoration: 'none' }}
              >
                Contact us
              </a>
              <span style={{ padding: '10px 20px', border: `1px solid rgba(255,255,255,0.55)`, color: INK, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 0 }}>
                Log in
              </span>
            </>
          )}
          {signedIn && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: SUBINK }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 600, color: INK }}>
                N
              </span>
              {MOCK_CLIENT_FIRST}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const CINQ_FOOTER_COLS: { head: string; rows: string[] }[] = [
  { head: 'Company', rows: ['Services', 'About', 'News'] },
  { head: 'Requests', rows: ['General request', 'Artist request', 'Synch license', 'Catalogs', 'Press contact'] },
  { head: 'Social', rows: ['Instagram', 'YouTube', 'X', 'LinkedIn'] },
  { head: 'Legal', rows: ['Privacy', 'Terms'] },
];

// Inside the app the footer reduces to just the compact black bar — Cinq
// and us. The full navy column footer belongs to the site/login only.
function CinqSiteFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer style={{ background: '#000000', color: INK, padding: '18px 26px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>
          <img src={cinqLogo} alt="" aria-hidden style={{ width: 26, height: 26, opacity: 0.85 }} />
          Cinq Music · cinqmusic.com
          <span style={{ flex: 1 }} />
          {/* Powered by GoodTunes® — whitened for the dark bar; brightness(0)
              first forces true white, plain invert leaves a tint. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
            Powered by
            <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
          </span>
        </div>
      </footer>
    );
  }
  return (
    <footer style={{ background: NAVY, color: INK, padding: '44px 26px 36px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) repeat(auto-fit, minmax(140px, 1fr))', gap: 30 }}>
        {/* Cinq mark + cities line, left — from their real footer */}
        <div>
          <img src={cinqLogo} alt="Cinq Music" style={{ width: 44, height: 44 }} />
          <div style={{ marginTop: 14, fontSize: 12.5, color: SUBINK, lineHeight: 1.7, maxWidth: 240 }}>
            Los Angeles, New York, Orlando, Bogota, Medellin, Seoul, Minsk, Colombo
          </div>
        </div>
        {CINQ_FOOTER_COLS.map((c) => (
          <div key={c.head}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: INK }}>{c.head}</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {c.rows.map((r) => (
                <div key={r} style={{ fontSize: 12.5, color: SUBINK, lineHeight: 1.55 }}>{r}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1080, margin: '34px auto 0', paddingTop: 18, borderTop: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>
        Cinq Music · cinqmusic.com
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
          Powered by
          <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        </span>
      </div>
    </footer>
  );
}

export default function PressClientNextStepsCinq() {
  const [stage, setStage] = useState<'login' | 'portal'>('login');
  const [password, setPassword] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const firstName = MOCK_PREPARED_BY.split(' ')[0];
  const earned = password.trim() !== '';
  // Inter throughout — Cinq's body face; Anton reserved for the big
  // condensed uppercase headings.
  const font = "'Inter', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const headingFont = "'Anton', 'Arial Narrow', sans-serif";

  // ── Stage 1 — Cinq-branded login. Same GoodTunes account system, same
  // database — only the skin belongs to the label. ──
  if (stage === 'login') {
    return (
      <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
        <CinqSiteHeader signedIn={false} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px 64px' }}>
        <div style={{ width: 380, maxWidth: '100%', textAlign: 'center' }}>
          {/* No logo on the card — the site header already carries it. */}
          <h1 style={{ fontFamily: headingFont, fontSize: 40, fontWeight: 700, letterSpacing: '-0.01em', textTransform: 'uppercase', margin: 0, lineHeight: 0.95 }}>Sign in</h1>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '10px 0 0', lineHeight: 1.6 }}>
            Your account was created when you started {MOCK_JOB}.
          </p>
          <div style={{ marginTop: 26, display: 'grid', gap: 10, textAlign: 'left' }}>
            <input
              style={{ width: '100%', height: 40, borderRadius: 0, padding: '0 12px', fontSize: 13.5, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
              defaultValue={MOCK_CLIENT_EMAIL}
              type="email"
              data-testid="input-login-email"
            />
            <input
              style={{ width: '100%', height: 40, borderRadius: 0, padding: '0 12px', fontSize: 13.5, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-login-password"
            />
          </div>
          {/* Earns its white fill once a password is typed (canon) — the
              page's one filled action: solid white, black text. */}
          <button
            type="button"
            disabled={!earned}
            onClick={() => { if (earned) setStage('portal'); }}
            data-testid="button-login"
            style={{
              marginTop: 18, width: '100%', padding: '12px 0', borderRadius: 0, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: earned ? 'pointer' : 'not-allowed',
              background: earned ? '#FFFFFF' : 'transparent',
              border: earned ? '1px solid transparent' : `1px solid ${HAIRLINE}`,
              color: earned ? '#000000' : SUBINK,
            }}
          >
            Sign in
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: SUBINK }}>Forgot your password?</div>
        </div>
        </div>
        <CinqSiteFooter />
      </div>
    );
  }

  // ── Stage 2 — the artist portal, Cinq skin: top bar + left rail wrap
  // the next-steps overview. ──
  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>

      {/* ── Cinq's own site header wears the portal ── */}
      <CinqSiteHeader signedIn />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav canon, Team pinned at the bottom ── */}
        <nav style={{ width: 218, flexShrink: 0, background: CANVAS, borderRight: `1px solid ${HAIRLINE}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Canon search — ⌘K chip flush right INSIDE the bar */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              placeholder="Search"
              data-testid="input-rail-search"
              style={{ width: '100%', height: 34, borderRadius: 0, padding: '0 44px 0 12px', fontSize: 12.5, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
            />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, fontWeight: 600, color: SUBINK, background: CANVAS, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '2px 5px' }}>
              ⌘K
            </span>
          </div>
          {RAIL_ITEMS.map((r) => <RailRow key={r} name={r} active={r === 'Dashboard'} />)}
          <div style={{ borderTop: `1px solid ${HAIRLINE}`, marginTop: 8, paddingTop: 8 }}>
            <RailRow name="Team" active={false} />
          </div>
        </nav>

        {/* ── Main — the next-steps overview ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 24px 60px' }}>

            <section style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: SUBINK }}>
                Your project is live
              </div>
              {/* Their h1s are enormous — big condensed uppercase */}
              <h1 style={{ fontFamily: headingFont, fontSize: 48, fontWeight: 700, letterSpacing: '-0.01em', textTransform: 'uppercase', margin: '10px 0 0', lineHeight: 0.95 }}>
                Welcome, {MOCK_CLIENT_FIRST}.
              </h1>
              <p style={{ fontSize: 15, color: SUBINK, margin: '10px 0 0', lineHeight: 1.6 }}>
                {MOCK_JOB} is underway at Cinq Music.
              </p>

              {/* Project card — the estimate carried forward, on navy */}
              <div style={{ marginTop: 28, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', padding: 20, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
                <img src={californialandCover} alt={`${MOCK_JOB} cover art`} style={{ width: 64, height: 64, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>{MOCK_JOB}</div>
                  <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>{MOCK_SPEC}</div>
                  <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>
                    {MOCK_QTY} · {MOCK_UNIT} · Estimate <span style={{ fontWeight: 600, color: INK }}>{MOCK_ESTIMATE_NO}</span>
                  </div>
                </div>
                {/* Quiet — outlined white, uppercase, Cinq's button grammar. */}
                <button
                  type="button"
                  data-testid="button-view-estimate"
                  style={{ padding: '8px 16px', borderRadius: 0, background: 'transparent', border: `1px solid rgba(255,255,255,0.45)`, color: INK, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  View estimate
                </button>
              </div>
            </section>

            {/* ── Next steps — word + icon status, one filled action ── */}
            <section style={{ marginTop: 40 }}>
              <h2 style={{ fontFamily: headingFont, fontSize: 26, fontWeight: 600, letterSpacing: '-0.005em', textTransform: 'uppercase', margin: 0 }}>What happens next</h2>
              <div style={{ marginTop: 16, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
                {STEPS.map((s, i) => (
                  <div key={s.id} data-testid={`step-${s.id}`}>
                    {i > 0 && <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />}
                    <div style={{ padding: '18px 18px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', background: s.status === 'next' ? 'rgba(255,255,255,0.06)' : 'transparent' }}>
                      <div style={{ width: 22, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: s.status === 'waiting' ? SUBINK : INK, paddingTop: 2 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 600, color: s.status === 'waiting' ? SUBINK : INK }}>{s.title}</div>
                          <StatusPill status={s.status} />
                        </div>
                        <p style={{ fontSize: 12.5, color: SUBINK, margin: '6px 0 0', lineHeight: 1.6 }}>{s.body}</p>
                        {s.meta && (
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, marginTop: 6 }}>{s.meta}</div>
                        )}
                        {/* The page's ONE filled action lives on the up-next
                            step — solid white, black text, uppercase. */}
                        {s.id === 'assets' && (
                          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              data-testid="button-upload-files"
                              onClick={() => setUploaded(true)}
                              style={{
                                padding: '10px 22px', borderRadius: 0, border: 'none', cursor: 'pointer',
                                background: '#FFFFFF', color: '#000000', fontSize: 12, fontWeight: 700,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                              }}
                            >
                              Upload audio &amp; artwork
                            </button>
                            {uploaded && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: SUBINK }}>
                                <StatusIcon status="done" />
                                Files received — we&rsquo;ll confirm within 1 business day.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Doug — the human on the other end ── */}
            <section style={{ marginTop: 28, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Doug's headshot — true circle (Bill, Aug 21 2026). */}
              <span style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, border: `1px solid ${HAIRLINE}`, overflow: 'hidden', display: 'flex' }}>
                <img src={dougPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{MOCK_PREPARED_BY} is your contact for this run.</div>
                <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>Replies within 1 business day · Cinq Music</div>
              </div>
              {/* Quiet outlined — side actions never take the fill. */}
              <button
                type="button"
                data-testid="button-ask-doug.reinart"
                style={{ padding: '8px 16px', borderRadius: 0, background: 'transparent', border: `1px solid rgba(255,255,255,0.45)`, color: INK, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Ask {firstName} a question
              </button>
            </section>

          </div>
        </main>
      </div>

      {/* ── In-app, the footer is just the compact black bar — Cinq and us ── */}
      <CinqSiteFooter compact />
    </div>
  );
}
