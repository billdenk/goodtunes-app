// CORNER RULING (Bill, Aug 22 2026, stylesheet-first from hellbendervinyl.com):
// buttons are fully-rounded PILLS (--buttons-radius 40px) with white text;
// inputs are nearly square (2px); cards/media stay square (0); status/variant
// pills are rounded (40px). Only true circles (avatars, status dots) stay round.
// PressClientNextStepsHellbender — where "Start this project" lands, now as the
// FULL flow (Bill, Aug 21 2026): an Hellbender-branded login screen, then the
// GoodTunes artist portal (artist tier, NOT super admin — same database,
// same accounts) wearing Hellbender's white-label skin, with the next-steps
// overview Bill liked as the landing content inside the shell.
// Shell = top bar + left rail per the artist nav canon (Aug 16 2026):
// Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals,
// Shopify, Reports — Team pinned at the rail bottom, no Overview, ⌘K chip
// flush right inside the rail search.
// Canon: Hellbender white-label = the press's own LIGHT canvas — pure white
// #FFFFFF (Andrew, Aug 21 2026), red #DF0C15 with dark ink on the one
// filled action, black hairlines, Hellbender logo black. Statuses are always
// word + icon, never color alone (Bill is colorblind). "Estimate", never
// the q-word. Self-contained per handoff rules.

import { useState } from 'react';
import { Search, User, ShoppingBag, ChevronDown, ArrowRight, Facebook, Instagram, Youtube, Music2, Twitter, Star, X, MapPin } from 'lucide-react';
import howAlbumCover from '../assets/how-album-cover.jpg';
import hellbenderLogo from '../assets/hellbender-full.svg';
import hellbenderTextLogo from '../assets/hellbender-text-logo.png';
import hellbenderBbbSeal from '../assets/hellbender-bbb-seal.png';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import travisPhoto from '../assets/travis-whitlock.webp';

// ─── Mock data — same project the estimate page created ──────────────
const MOCK_CLIENT_FIRST = 'Alex';
const MOCK_CLIENT_EMAIL = 'alex@howband.com';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_PREPARED_BY = 'Travis Whitlock';
const MOCK_JOB = 'How???';
const MOCK_SPEC = '12" · 140g · Emerald translucent · 1 LP';
const MOCK_QTY = '1,000 units';
const MOCK_UNIT = '$5.37 /unit';
// 1,000 × $5.37 + $1,295 fixed setup = $6,665.00 → 50% deposit.
const MOCK_DEPOSIT = '$3,332.50';

// ─── Palette — Hellbender light canon (twin of PressClientEstimateHellbender) ──────
const CANVAS = '#ffffff';
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#DF0C15'; // Hellbender's site red (Andrew, Aug 21 2026)

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
        borderRadius: 40, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
        border: `1px solid ${status === 'next' ? 'rgba(0,0,0,0.28)' : HAIRLINE}`,
        background: status === 'next' ? 'rgba(223,12,21,0.10)' : 'transparent',
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
    body: 'Finished records leave Hellbender with tracking the day they clear final inspection.',
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

// ─── Hellbender's real site chrome (Bill, Aug 21 2026: "wouldn't it have their
// header and footer? like hellbendervinyl.com/our-story") — pulled
// from their live site: utility bar + logo-left nav with the red squared
// button, and the dark link-columns footer. Nav links are decorative site
// chrome here; the account chip is the portal's. ───────────────────────
// Full nav from their live site (Bill's screenshot, Aug 21 2026): we'd
// missed About Hellbender, Hellbender TV, and News.
const MRP_NAV = ['Home', 'About', 'Products', 'Resources', 'Videos', 'Learn', 'News', 'Shop', 'Contact'];

function MrpSiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#ffffff' }}>
      {/* Utility bar */}
      {/* Utility bar — values pulled from their live stylesheet (Bill, Aug 21
          2026): 40px row, 12px / 400 / 0.07em body type, #333 ink. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 40, padding: '0 26px', borderBottom: `1px solid ${HAIRLINE}`, fontSize: 12, fontWeight: 400, letterSpacing: '0.07em', color: '#333333' }}>
        <span>Let&rsquo;s talk about your project</span>
        <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: HAIRLINE }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#333333' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="2" y="4.5" width="20" height="15" rx="2" />
            <path d="M2.5 6.5L12 13l9.5-6.5" />
          </svg>
          help@hellbendervinyl.com
        </span>
        <span style={{ flex: 1 }} />
        {/* Their real social glyphs (Instagram · Facebook · YouTube), red like
            the live site — front-door chrome only. Signed in, they drop away
            so nothing pulls off the page's intent (Bill, Aug 21 2026). */}
        {!signedIn && (
          /* Sized + celled like the live site: larger glyphs, hairline
             dividers between each (Bill, Aug 21 2026 screenshot). */
          <span style={{ display: 'flex', alignItems: 'stretch', alignSelf: 'stretch' }} aria-hidden>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8">
                <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
                <circle cx="12" cy="12" r="4.2" />
                <circle cx="17.6" cy="6.4" r="1.2" fill={GOLD} stroke="none" />
              </svg>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={GOLD}>
                <path d="M14 22v-8h2.8l.5-3.4H14V8.4c0-1 .3-1.7 1.7-1.7h1.8V3.6c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.6H7.6V14h2.9v8h3.5z" />
              </svg>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={GOLD}>
                <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.5 12 4.5 12 4.5s-7 0-8.9.6A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.2zM9.8 15.3V8.7l6 3.3-6 3.3z" />
              </svg>
            </span>
          </span>
        )}
      </div>
      {/* Chivo rides with the header so both stages get the real Hellbender face. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chivo:wght@400;700&display=swap');
        /* Their site's hover: ink darkens and the red rule draws in
           left-to-right — every item, flyout or not (Bill, Aug 21 2026). */
        .mrp-nav-link { position: relative; transition: color 0.2s ease; }
        .mrp-nav-link::after {
          content: ''; position: absolute; left: 0; right: 0; bottom: -6px; height: 2px;
          background: ${GOLD}; transform: scaleX(0); transform-origin: left center;
          transition: transform 0.25s ease;
        }
        .mrp-nav-link:hover { color: #111111; }
        .mrp-nav-link:hover::after, .mrp-nav-link.is-active::after { transform: scaleX(1); }
      `}</style>
      {/* Main nav — logo left, links, red squared button (their site pattern) */}
      {/* Sizing matched to the live site (Bill, Aug 21 2026): taller row,
          smaller lighter gray nav with wider tracking and roomier gaps.
          The red estimate button stays exactly as it was. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 34, height: 80, padding: '0 26px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <img src={hellbenderLogo} alt="Hellbender Vinyl" style={{ width: 60, height: 60 }} />
        {/* Nav — real values from their stylesheet (Bill, Aug 21 2026):
            12px / 600 / 0.05em uppercase, centered; resting ink is the
            skin's rgba(51,51,51,0.5) — the mid gray, NOT bold #333 (that
            was the top bar's rule). Hover goes near-black on their site. */}
        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {/* "Sign in" rides last and wears the site's active treatment —
              near-black with the red rule under it (Bill, Aug 21 2026). */}
          {[...MRP_NAV, 'Sign in'].map((l) => {
            const active = l === 'Sign in';
            return (
              <a
                key={l}
                href="#"
                onClick={(e) => e.preventDefault()}
                className={`mrp-nav-link${active ? ' is-active' : ''}`}
                style={{
                  color: active ? '#111111' : 'rgba(51,51,51,0.5)', textDecoration: 'none',
                  fontWeight: active ? 700 : undefined,
                }}
              >
                {l}
              </a>
            );
          })}
        </nav>
        {/* Their site's red rectangle — squared, not our pill. Shell-only
            chrome for visitors arriving from the main site; once signed in
            it steps aside for the account chip (Bill, Aug 21 2026). */}
        {!signedIn && (
          <span style={{ minHeight: 45, display: 'inline-flex', alignItems: 'center', padding: '0 26px', borderRadius: 40, background: GOLD, color: '#ffffff', fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            Get an estimate
          </span>
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
  );
}

const MRP_FOOTER_COLS: { head: string; rows: string[] }[] = [
  { head: 'Most used links', rows: ['Vinyl Records', 'Deluxe Vinyl Packaging', 'Short-Run Record Pressing', 'Forms & Templates', 'Audio File Prep', 'Art File Prep'] },
  { head: 'Contact us', rows: ['Phone: (412) 224-2000', 'Email: help@hellbendervinyl.com', 'Careers'] },
  { head: 'Privacy & security', rows: ['Privacy Notice'] },
  { head: 'Locations', rows: ['Pressing & Customer Service: 5794 Butler Street, Pittsburgh, PA 15201', 'Packaging & Shipping: 5794 Butler Street, Pittsburgh, PA 15201'] },
];

// Inside the app the footer reduces to just the black bar — Hellbender and us.
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
        <img src={hellbenderLogo} alt="" aria-hidden style={{ width: 26, height: 26, filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        Hellbender Vinyl · hellbendervinyl.com
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

// ─── Sign-in page chrome — matched to the REAL hellbendervinyl.com header
// and footer (Bill, Aug 22 2026, stylesheet-first). Used ONLY on the sign-in
// screen; the portal keeps MrpSiteHeader / MrpSiteFooter untouched. ──────
const SIGNIN_FONT = "'Chivo', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function SigninSiteHeader() {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#ffffff', fontFamily: SIGNIN_FONT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chivo:wght@400;700&display=swap');
        /* .header__menu-item — black ink, underline on hover (their site CSS). */
        .hb-nav-item { position: relative; color: ${INK}; text-decoration: none; transition: color 0.15s ease; }
        .hb-nav-item::after {
          content: ''; position: absolute; left: 0; right: 0; bottom: -3px; height: 1.5px;
          background: currentColor; transform: scaleX(0); transform-origin: left center;
          transition: transform 0.2s ease;
        }
        .hb-nav-item:hover::after { transform: scaleX(1); }
        /* .header__menu-item padding 1.2rem — the row breathes. */
        .hb-nav-item { padding: 12px; }
        .hb-icon-btn { display: inline-flex; align-items: center; justify-content: center; background: none; border: none; padding: 10px; cursor: pointer; color: ${INK}; }
      `}</style>
      {/* Announcement bar — red, 38px, centered white Chivo Title Case (NOT
          uppercase/heavy): ~13px, weight 600, letter-spacing 1px (their site). */}
      <div style={{ background: GOLD, color: '#ffffff', minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '1px', textAlign: 'center' }}>
        Sign Up for Our Newsletter &amp; Get a Free Shirt! <ArrowRight size={15} strokeWidth={2} style={{ verticalAlign: '-2px', marginLeft: 6 }} aria-hidden />
      </div>
      {/* Header row (~80px). Their real 300px-wide red wordmark image (the
          circled hb mark is baked in) — no hand-set type, no separate circle. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 40, height: 80, padding: '0 30px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <a href="#" onClick={(e) => e.preventDefault()} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }} data-testid="signin-logo">
          <img src={hellbenderTextLogo} alt="Hellbender Vinyl" style={{ width: 300, maxWidth: '100%', height: 'auto', display: 'block' }} />
        </a>
        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 26, fontSize: 18, fontWeight: 600 }}>
          <a href="#" onClick={(e) => e.preventDefault()} className="hb-nav-item">Order Online</a>
          <a href="#" onClick={(e) => e.preventDefault()} className="hb-nav-item">Request a Custom Estimate</a>
          <a href="#" onClick={(e) => e.preventDefault()} className="hb-nav-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            More <ChevronDown size={19} strokeWidth={1.8} aria-hidden />
          </a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button type="button" className="hb-icon-btn" aria-label="Search" data-testid="signin-search"><Search size={20} strokeWidth={1.5} /></button>
          <button type="button" className="hb-icon-btn" aria-label="Account" data-testid="signin-account"><User size={20} strokeWidth={1.5} /></button>
          <button type="button" className="hb-icon-btn" aria-label="Cart" data-testid="signin-bag"><ShoppingBag size={20} strokeWidth={1.5} /></button>
        </div>
      </div>
    </div>
  );
}

/* Google review widget, recreated faithfully: a four-color ring (blue/red/
   yellow/green arcs, ~8px) with ALL content stacked INSIDE it — "Google"
   wordmark in per-letter brand colors, 5 gold stars, big 5.0, "average rating". */
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

/* Payment brand marks — 44×26, radius 4. Most are WHITE with a 1px #ddd
   border and a brand-colored word/mark; only AMEX and shop are filled.
   Shape + brand WORD on every one, never color alone (Bill is colorblind). */
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

export default function PressClientNextStepsHellbender() {
  const [stage, setStage] = useState<'login' | 'portal'>('login');
  const [password, setPassword] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const firstName = MOCK_PREPARED_BY.split(' ')[0];
  const earned = password.trim() !== '';
  /* Their real stylesheet is Chivo throughout (Bill, Aug 21 2026) —
     the whole Hellbender-skinned page wears it, not our SF stack. */
  const font = "'Chivo', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

  // ── Stage 1 — Hellbender-branded login. Same GoodTunes account system, same
  // database — only the skin belongs to the press. ──
  if (stage === 'login') {
    return (
      <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
        <SigninSiteHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px 64px' }}>
        <div style={{ width: 380, maxWidth: '100%', textAlign: 'center' }}>
          {/* No logo on the card — the site header already carries it (Bill, Aug 21 2026). */}
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>Sign in</h1>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '8px 0 0', lineHeight: 1.6 }}>
            Your account was created when you started {MOCK_JOB}.
          </p>
          <div style={{ marginTop: 26, display: 'grid', gap: 10, textAlign: 'left' }}>
            <input
              style={{ width: '100%', height: 45, borderRadius: 2, padding: '0 12px', fontSize: 14, background: '#ffffff', border: '1px solid rgba(0,0,0,0.15)', color: INK, outline: 'none' }}
              defaultValue={MOCK_CLIENT_EMAIL}
              type="email"
              data-testid="input-login-email"
            />
            <input
              style={{ width: '100%', height: 45, borderRadius: 2, padding: '0 12px', fontSize: 14, background: '#ffffff', border: '1px solid rgba(0,0,0,0.15)', color: INK, outline: 'none' }}
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-login-password"
            />
          </div>
          {/* Earns its red once a password is typed (canon). */}
          <button
            type="button"
            disabled={!earned}
            onClick={() => { if (earned) setStage('portal'); }}
            data-testid="button-login"
            style={{
              marginTop: 18, width: '100%', minHeight: 45, padding: '0 30px', borderRadius: 40,
              fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              cursor: earned ? 'pointer' : 'not-allowed',
              background: earned ? GOLD : 'transparent',
              border: earned ? '1px solid transparent' : `1px solid ${HAIRLINE}`,
              color: earned ? '#ffffff' : SUBINK,
            }}
          >
            Sign in
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: SUBINK }}>Forgot your password?</div>
        </div>
        </div>
        <SigninSiteFooter />
      </div>
    );
  }

  // ── Stage 2 — the artist portal, Hellbender skin: top bar + left rail wrap
  // the next-steps overview. ──
  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>

      {/* ── Hellbender's own site header wears the portal (Bill, Aug 21 2026) ── */}
      <MrpSiteHeader signedIn />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav canon, Team pinned at the bottom ── */}
        <nav style={{ width: 218, flexShrink: 0, background: CANVAS, borderRight: `1px solid ${HAIRLINE}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Canon search — ⌘K chip flush right INSIDE the bar */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              placeholder="Search"
              data-testid="input-rail-search"
              style={{ width: '100%', height: 34, borderRadius: 2, padding: '0 44px 0 12px', fontSize: 12.5, background: CARD_RAISED, border: '1px solid rgba(0,0,0,0.15)', color: INK, outline: 'none' }}
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
                {MOCK_JOB} is underway at Hellbender Vinyl.
              </p>

              {/* Project card — the estimate carried forward */}
              <div style={{ marginTop: 28, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', padding: 20, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
                <img src={howAlbumCover} alt={`${MOCK_JOB} cover art`} style={{ width: 64, height: 64, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
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
                  onClick={() => { window.location.hash = '#/PressClientEstimateHellbender'; }}
                  style={{ minHeight: 40, padding: '0 24px', borderRadius: 40, background: '#ffffff', border: `1px solid ${GOLD}`, color: GOLD, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
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
                                minHeight: 45, padding: '0 30px', borderRadius: 40, border: 'none', cursor: 'pointer',
                                background: GOLD, color: '#ffffff', fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
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

            {/* ── Travis — the human on the other end ── */}
            <section style={{ marginTop: 28, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 46, height: 46, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                <img src={travisPhoto} alt={MOCK_PREPARED_BY} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{MOCK_PREPARED_BY} is your contact for this run.</div>
                <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>Replies within 1 business day · Hellbender Vinyl</div>
              </div>
              {/* Quiet gray-outline — side actions never take the fill. */}
              <button
                type="button"
                data-testid="button-ask-travis"
                style={{ minHeight: 40, padding: '0 24px', borderRadius: 40, background: '#ffffff', border: `1px solid ${GOLD}`, color: GOLD, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Ask {firstName} a question
              </button>
            </section>

          </div>
        </main>
      </div>

      {/* ── In-app, the footer is just the black bar — Hellbender and us ── */}
      <MrpSiteFooter compact />
    </div>
  );
}
