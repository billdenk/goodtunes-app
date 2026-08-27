// CORNER RULING (Bill, Aug 21 2026): the press's corner token = SQUARE and
// it applies across the whole PMP skin — inputs, buttons, cards, pills —
// not just chrome. Only true circles (avatars, status icons) stay round.
// PressClientNextStepsPMP — where "Start this project" lands, now as the
// FULL flow (Bill, Aug 21 2026): a PMP-branded login screen, then the
// GoodTunes artist portal (artist tier, NOT super admin — same database,
// same accounts) wearing PMP's white-label skin, with the next-steps
// overview Bill liked as the landing content inside the shell.
// Shell = top bar + left rail per the artist nav canon (Aug 16 2026):
// Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals,
// Shopify, Reports — Team pinned at the rail bottom, no Overview, ⌘K chip
// flush right inside the rail search.
// Canon: PMP white-label = the press's own LIGHT canvas — pure white
// #FFFFFF (Andrew, Aug 21 2026), green #6CA460 with dark ink on the one
// filled action, black hairlines, PMP logo black. Statuses are always
// word + icon, never color alone (Bill is colorblind). "Estimate", never
// the q-word. Self-contained per handoff rules.

import { useState } from 'react';
import deadAliveCover from '../assets/dead-alive-cover.jpg';
import pmpLogoAsset from '../assets/pmp-icon.svg';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import jonathanPhoto from '../assets/jonathan-hibma.png';

// ─── Mock data — same project the estimate page created ──────────────
const MOCK_CLIENT_FIRST = 'Dead Alive';
const MOCK_CLIENT_EMAIL = 'niina@soleilmusic.com';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_PREPARED_BY = 'Jonathan Hibma';
const MOCK_JOB = 'The Madness of Dr. Ludvig Von Brainmatter';
const MOCK_SPEC = '12" · 140g · Clear Green · 1 LP';
const MOCK_QTY = '1,000 units';
const MOCK_UNIT = '$5.37 /unit';
// 1,000 × $5.37 + $1,295 fixed setup = $6,665.00 → 50% deposit.
const MOCK_DEPOSIT = '$3,332.50';

// ─── Palette — PMP light canon (twin of PressClientEstimatePMP) ──────
const CANVAS = '#ffffff';
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GREEN = '#6CA460'; // PMP's site green (Andrew, Aug 21 2026)

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
        border: `1px solid ${status === 'next' ? 'rgba(0,0,0,0.28)' : HAIRLINE}`,
        background: status === 'next' ? 'rgba(108,164,96,0.14)' : 'transparent',
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

// ─── PMP's real site chrome (Bill, Aug 21 2026: "wouldn't it have their
// header and footer? like physicalmusicproducts.com/our-story") — pulled
// from their live site: utility bar + logo-left nav with the green squared
// button, and the dark link-columns footer. Nav links are decorative site
// chrome here; the account chip is the portal's. ───────────────────────
// Full nav from their live site (Bill's screenshot, Aug 21 2026): we'd
// missed About PMP, PMP TV, and News.
const PMP_NAV = ['Home', 'About PMP', 'Products', 'Resources', 'PMP TV', 'PMP University', 'News', 'Shop', 'Contact'];

// Andrew (Aug 26 2026): the logged-in chrome keeps this structure but the
// bar goes BLACK — the site's style, not its structure. White ink, green stays.
function PmpSiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#000000' }}>
      {/* Utility bar */}
      {/* Utility bar — values pulled from their live stylesheet (Bill, Aug 21
          2026): 40px row, 12px / 400 / 0.07em body type, #333 ink. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 40, padding: '0 26px', borderBottom: '1px solid rgba(255,255,255,0.14)', fontSize: 12, fontWeight: 400, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.72)' }}>
        <span>Let&rsquo;s talk about your project</span>
        <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.14)' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.72)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="2" y="4.5" width="20" height="15" rx="2" />
            <path d="M2.5 6.5L12 13l9.5-6.5" />
          </svg>
          help@physicalmusicproducts.com
        </span>
        <span style={{ flex: 1 }} />
        {/* Their real social glyphs (Instagram · Facebook · YouTube), green like
            the live site — front-door chrome only. Signed in, they drop away
            so nothing pulls off the page's intent (Bill, Aug 21 2026). */}
        {!signedIn && (
          /* Sized + celled like the live site: larger glyphs, hairline
             dividers between each (Bill, Aug 21 2026 screenshot). */
          <span style={{ display: 'flex', alignItems: 'stretch', alignSelf: 'stretch' }} aria-hidden>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8">
                <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
                <circle cx="12" cy="12" r="4.2" />
                <circle cx="17.6" cy="6.4" r="1.2" fill={GREEN} stroke="none" />
              </svg>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={GREEN}>
                <path d="M14 22v-8h2.8l.5-3.4H14V8.4c0-1 .3-1.7 1.7-1.7h1.8V3.6c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.6H7.6V14h2.9v8h3.5z" />
              </svg>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={GREEN}>
                <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.5 12 4.5 12 4.5s-7 0-8.9.6A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.2zM9.8 15.3V8.7l6 3.3-6 3.3z" />
              </svg>
            </span>
          </span>
        )}
      </div>
      {/* Poppins rides with the header so both stages get the real PMP face. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        /* Their site's hover: ink darkens and the green rule draws in
           left-to-right — every item, flyout or not (Bill, Aug 21 2026). */
        .pmp-nav-link { position: relative; transition: color 0.2s ease; }
        .pmp-nav-link::after {
          content: ''; position: absolute; left: 0; right: 0; bottom: -6px; height: 2px;
          background: ${GREEN}; transform: scaleX(0); transform-origin: left center;
          transition: transform 0.25s ease;
        }
        .pmp-nav-link:hover { color: #ffffff; }
        .pmp-nav-link:hover::after, .pmp-nav-link.is-active::after { transform: scaleX(1); }
      `}</style>
      {/* Main nav — logo left, links, green squared button (their site pattern) */}
      {/* Sizing matched to the live site (Bill, Aug 21 2026): taller row,
          smaller lighter gray nav with wider tracking and roomier gaps.
          The green estimate button stays exactly as it was. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 34, height: 80, padding: '0 26px', borderBottom: '1px solid rgba(255,255,255,0.14)' }}>
        {/* Dark artwork → true white via brightness(0) first (Bill caught plain invert's tint twice). */}
        <img src={pmpLogoAsset} alt="Physical Music Products" style={{ width: 60, height: 60, filter: 'brightness(0) invert(1)' }} />
        {/* Nav — real values from their stylesheet (Bill, Aug 21 2026):
            12px / 600 / 0.05em uppercase, centered; resting ink is the
            skin's rgba(51,51,51,0.5) — the mid gray, NOT bold #333 (that
            was the top bar's rule). Hover goes near-black on their site. */}
        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {/* "Sign in" rides last and wears the site's active treatment —
              near-black with the green rule under it (Bill, Aug 21 2026). */}
          {[...PMP_NAV, 'Sign in'].map((l) => {
            const active = l === 'Sign in';
            return (
              <a
                key={l}
                href="#"
                onClick={(e) => e.preventDefault()}
                className={`pmp-nav-link${active ? ' is-active' : ''}`}
                style={{
                  color: active ? '#ffffff' : 'rgba(255,255,255,0.55)', textDecoration: 'none',
                  fontWeight: active ? 700 : undefined,
                }}
              >
                {l}
              </a>
            );
          })}
        </nav>
        {/* Their site's green rectangle — squared, not our pill. Shell-only
            chrome for visitors arriving from the main site; once signed in
            it steps aside for the account chip (Bill, Aug 21 2026). */}
        {!signedIn && (
          <span style={{ padding: '11px 20px', background: GREEN, color: INK, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            Get an estimate
          </span>
        )}
        {signedIn && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'rgba(255,255,255,0.8)' }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 600, color: '#ffffff' }}>
              N
            </span>
            {MOCK_CLIENT_FIRST}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── The site's real front door (Andrew's screenshot, Aug 26 2026):
// solid black bar, white groove mark + wordmark, then About us · Instagram ·
// Facebook · cart, and the OUTLINED green "Get in touch". The sign-in page
// wears exactly this; the portal keeps its logged-in chrome. ───────────
function PmpSiteHeaderBlack() {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#000000', display: 'flex', alignItems: 'center', height: 64, padding: '0 22px' }}>
      {/* pmp-icon.svg is dark artwork — brightness(0) first forces true
          white (plain invert leaves a tint; Bill caught it twice). */}
      <img src={pmpLogoAsset} alt="" aria-hidden style={{ width: 42, height: 42, filter: 'brightness(0) invert(1)' }} />
      <span style={{ marginLeft: 14, fontSize: 16, fontWeight: 600, letterSpacing: 0.2, color: '#ffffff' }}>Physical Music Products</span>
      <span style={{ flex: 1 }} />
      <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#ffffff', textDecoration: 'none' }}>
        About us
      </a>
      {/* Socials ride white on black up here (the utility-bar green ones
          belong to the light chrome). */}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8" aria-hidden style={{ marginLeft: 22 }}>
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.6" cy="6.4" r="1.2" fill="#ffffff" stroke="none" />
      </svg>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="#ffffff" aria-hidden style={{ marginLeft: 16 }}>
        <path d="M14 22v-8h2.8l.5-3.4H14V8.4c0-1 .3-1.7 1.7-1.7h1.8V3.6c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.6H7.6V14h2.9v8h3.5z" />
      </svg>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#ffffff', marginLeft: 20 }} aria-hidden>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8">
          <circle cx="9.2" cy="20" r="1.3" />
          <circle cx="17.3" cy="20" r="1.3" />
          <path d="M2.5 3.5h3L8 15.5h10.4l2.1-8.6H6.1" />
        </svg>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>0</span>
      </span>
      {/* Their outlined rectangle — green rule + green ink on black, squared.
          Not a filled action, so the page's one green fill stays Sign in. */}
      <span style={{ marginLeft: 22, padding: '11px 20px', border: `1px solid ${GREEN}`, color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Get in touch
      </span>
    </div>
  );
}

// Footer, two lives (Andrew, Aug 26 2026): the sign-in page's footer goes
// GREEN and carries ONLY the mark, the name, the domain, and "powered by
// GoodTunes" — the link columns are gone. Signed in, it stays the compact
// black bar — the press and us.
function PmpSiteFooter({ compact = false }: { compact?: boolean }) {
  const onGreen = !compact;
  const ink = onGreen ? 'rgba(0,0,0,0.78)' : 'rgba(245,245,247,0.55)';
  return (
    <footer style={{ background: onGreen ? GREEN : '#111112', padding: onGreen ? '24px 26px' : '18px 26px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: ink }}>
        {/* Dark artwork sits as-is on green; on black, brightness(0) first
            forces true white (plain invert leaves a tint — Bill caught it twice). */}
        <img src={pmpLogoAsset} alt="" aria-hidden style={{ width: 26, height: 26, filter: onGreen ? 'none' : 'brightness(0) invert(1)', opacity: onGreen ? 0.9 : 0.85 }} />
        Physical Music Products · physicalmusicproducts.com
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: ink }}>
          Powered by
          <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: onGreen ? 'none' : 'brightness(0) invert(1)', opacity: onGreen ? 0.9 : 0.85 }} />
        </span>
      </div>
    </footer>
  );
}

export default function PressClientNextStepsPMP() {
  const [stage, setStage] = useState<'login' | 'portal'>('login');
  const [password, setPassword] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const firstName = MOCK_PREPARED_BY.split(' ')[0];
  const earned = password.trim() !== '';
  /* Their real stylesheet is Poppins throughout (Bill, Aug 21 2026) —
     the whole PMP-skinned page wears it, not our SF stack. */
  const font = "'Poppins', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

  // ── Stage 1 — PMP-branded login. Same GoodTunes account system, same
  // database — only the skin belongs to the press. ──
  if (stage === 'login') {
    return (
      <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
        {/* Sign-in wears the site's exact black header (Andrew, Aug 26 2026). */}
        <PmpSiteHeaderBlack />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px 64px' }}>
        <div style={{ width: 380, maxWidth: '100%', textAlign: 'center' }}>
          {/* No logo on the card — the site header already carries it (Bill, Aug 21 2026). */}
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>Sign in</h1>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '8px 0 0', lineHeight: 1.6 }}>
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
          {/* Earns its green once a password is typed (canon). */}
          <button
            type="button"
            disabled={!earned}
            onClick={() => { if (earned) setStage('portal'); }}
            data-testid="button-login"
            style={{
              marginTop: 18, width: '100%', padding: '12px 0', borderRadius: 0, fontSize: 14, fontWeight: 700,
              cursor: earned ? 'pointer' : 'not-allowed',
              background: earned ? GREEN : 'transparent',
              border: earned ? '1px solid transparent' : `1px solid ${HAIRLINE}`,
              color: earned ? INK : SUBINK,
            }}
          >
            Sign in
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: SUBINK }}>Forgot your password?</div>
        </div>
        </div>
        <PmpSiteFooter />
      </div>
    );
  }

  // ── Stage 2 — the artist portal, PMP skin: top bar + left rail wrap
  // the next-steps overview. ──
  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>

      {/* ── PMP's own site header wears the portal (Bill, Aug 21 2026) ── */}
      <PmpSiteHeader signedIn />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav canon, Team pinned at the bottom ── */}
        <nav style={{ width: 218, flexShrink: 0, borderRight: `1px solid ${HAIRLINE}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
          {/* Team follows the list — the pushed-to-bottom spacer left a big
              empty stretch Andrew flagged (Aug 26 2026). Hairline keeps the
              separation. */}
          <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '10px 4px' }} />
          <RailRow name="Team" active={false} />
        </nav>

        {/* ── Main — the next-steps overview Bill liked ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 24px 60px' }}>

            <section style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: SUBINK }}>
                Your project is live
              </div>
              <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.8, margin: '10px 0 0', lineHeight: 1.15 }}>
                Welcome, {MOCK_CLIENT_FIRST}.
              </h1>
              <p style={{ fontSize: 15, color: SUBINK, margin: '10px 0 0', lineHeight: 1.6 }}>
                {MOCK_JOB} is underway at Physical Music Products.
              </p>

              {/* Project card — the estimate carried forward */}
              <div style={{ marginTop: 28, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', padding: 20, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
                <img src={deadAliveCover} alt={`${MOCK_JOB} cover art`} style={{ width: 64, height: 64, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>{MOCK_JOB}</div>
                  <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>{MOCK_SPEC}</div>
                  <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>
                    {MOCK_QTY} · {MOCK_UNIT} · Estimate <span style={{ fontWeight: 600, color: INK }}>{MOCK_ESTIMATE_NO}</span>
                  </div>
                </div>
                {/* Quiet — the estimate stays one click away inside the portal. */}
                <button
                  type="button"
                  data-testid="button-view-estimate"
                  onClick={() => { window.location.hash = '#/PressClientEstimatePMP'; }}
                  style={{ padding: '8px 16px', borderRadius: 0, background: 'transparent', border: `1px solid ${HAIRLINE}`, color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  View estimate
                </button>
              </div>
            </section>

            {/* ── Next steps — word + icon status, one filled action ── */}
            <section style={{ marginTop: 40 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, margin: 0 }}>What happens next</h2>
              <div style={{ marginTop: 16, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                {STEPS.map((s, i) => (
                  <div key={s.id} data-testid={`step-${s.id}`}>
                    {i > 0 && <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />}
                    <div style={{ padding: '18px 18px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', background: s.status === 'next' ? CARD_RAISED : 'transparent' }}>
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
                        {/* The page's ONE filled action lives on the up-next step. */}
                        {s.id === 'assets' && (
                          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              data-testid="button-upload-files"
                              onClick={() => setUploaded(true)}
                              style={{
                                padding: '10px 22px', borderRadius: 0, border: 'none', cursor: 'pointer',
                                background: GREEN, color: INK, fontSize: 13.5, fontWeight: 700,
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

            {/* ── Jonathan — the human on the other end ── */}
            <section style={{ marginTop: 28, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 46, height: 46, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                <img src={jonathanPhoto} alt={MOCK_PREPARED_BY} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{MOCK_PREPARED_BY} is your contact for this run.</div>
                <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>Replies within 1 business day · Physical Music Products</div>
              </div>
              {/* Quiet gray-outline — side actions never take the fill. */}
              <button
                type="button"
                data-testid="button-ask-jonathan"
                style={{ padding: '8px 16px', borderRadius: 0, background: 'transparent', border: `1px solid ${HAIRLINE}`, color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Ask {firstName} a question
              </button>
            </section>

          </div>
        </main>
      </div>

      {/* ── In-app, the footer is just the black bar — the press and us ── */}
      <PmpSiteFooter compact />
    </div>
  );
}
