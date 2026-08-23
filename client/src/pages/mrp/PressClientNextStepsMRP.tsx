// CORNER RULING (Bill, Aug 21 2026): Memphis's corner token = SQUARE and
// it applies across the whole MRP skin — inputs, buttons, cards, pills —
// not just chrome. Only true circles (avatars, status icons) stay round.
// PressClientNextStepsMRP — where "Start this project" lands, now as the
// FULL flow (Bill, Aug 21 2026): an MRP-branded login screen, then the
// GoodTunes artist portal (artist tier, NOT super admin — same database,
// same accounts) wearing MRP's white-label skin, with the next-steps
// overview Bill liked as the landing content inside the shell.
// Shell = top bar + left rail per the artist nav canon (Aug 16 2026):
// Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals,
// Shopify, Reports — Team pinned at the rail bottom, no Overview, ⌘K chip
// flush right inside the rail search.
// Canon: MRP white-label = the press's own LIGHT canvas — pure white
// #FFFFFF (Andrew, Aug 21 2026), gold #D9C153 with dark ink on the one
// filled action, black hairlines, MRP logo black. Statuses are always
// word + icon, never color alone (Bill is colorblind). "Estimate", never
// the q-word. Self-contained per handoff rules.

import { setAuthToken } from "@/lib/queryClient";
import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import californialandCover from './assets/californialand-cover.jpg';
import mrpLogoAsset from './assets/mrp-logo.svg';
import goodtunesLogo from './assets/goodtunes-logo.png';
import brandonPhoto from './assets/brandon-seavers.png';
import { withDevWlParam as wlParam } from "@/hooks/useAuthKind";

// ─── Real portal payload (MOCK_* retired — GET /api/press-client/portal) ──
export type PortalEstimate = {
  id: string;
  estimateNo: string | null;
  title: string | null;
  status: string;
  pressName: string | null;
  build: string | null;
  totalCents: number | null;
  quantity: number | null;
  sentAt: string | null;
  acceptedAt: string | null;
  shareToken: string | null;
  preparedBy: string | null;
};
export type PortalData = {
  client: { id: string; displayName: string | null; email: string | null };
  estimates: PortalEstimate[];
};
const SETUP_TOTAL_DOLLARS = 1295; // fixed setup block — same anchor as the estimate page
const moneyFmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// ─── Palette — MRP light canon (twin of PressClientEstimateMRP) ──────
const CANVAS = '#ffffff';
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#D9C153'; // MRP's site gold (Andrew, Aug 21 2026)

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
        background: status === 'next' ? 'rgba(217,193,83,0.14)' : 'transparent',
        color: status === 'waiting' ? SUBINK : INK,
      }}
    >
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

// ─── Steps — the pressing lifecycle from the client's side ───────────
const buildSteps = (estimateNo: string, preparerFirst: string, depositLabel: string | null): { id: string; title: string; body: string; status: StepStatus; meta?: string }[] => [
  {
    id: 'created', status: 'done',
    title: 'Project created',
    body: `Estimate ${estimateNo} is locked as your working numbers. ${preparerFirst} has been notified.`,
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
    ...(depositLabel ? { meta: `${depositLabel} · 50% of the working total` } : {}),
  },
  {
    id: 'production', status: 'waiting',
    title: 'Pressing & packaging',
    body: 'Your run is pressed, labels applied, jackets assembled, insert placed on top, then shrinkwrapped retail-ready.',
  },
  {
    id: 'shipping', status: 'waiting',
    title: 'Shipping',
    body: 'Finished records leave Memphis with tracking the day they clear final inspection.',
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

// ─── MRP's real site chrome (Bill, Aug 21 2026: "wouldn't it have their
// header and footer? like memphisrecordpressing.com/our-story") — pulled
// from their live site: utility bar + logo-left nav with the gold squared
// button, and the dark link-columns footer. Nav links are decorative site
// chrome here; the account chip is the portal's. ───────────────────────
// Full nav from their live site (Bill's screenshot, Aug 21 2026): we'd
// missed About MRP, MRP TV, and News.
const MRP_NAV = ['Home', 'About MRP', 'Products', 'Resources', 'MRP TV', 'MRP University', 'News', 'Shop', 'Contact'];

export function MrpSiteHeader({ signedIn, firstName = '' }: { signedIn: boolean; firstName?: string }) {
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
          help@memphisvinyl.com
        </span>
        <span style={{ flex: 1 }} />
        {/* Their real social glyphs (Instagram · Facebook · YouTube), gold like
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
      {/* Poppins rides with the header so both stages get the real MRP face. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        /* Their site's hover: ink darkens and the gold rule draws in
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
      {/* Main nav — logo left, links, gold squared button (their site pattern) */}
      {/* Sizing matched to the live site (Bill, Aug 21 2026): taller row,
          smaller lighter gray nav with wider tracking and roomier gaps.
          The gold estimate button stays exactly as it was. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 34, height: 80, padding: '0 26px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <img src={mrpLogoAsset} alt="Memphis Record Pressing" style={{ width: 60, height: 60 }} />
        {/* Nav — real values from their stylesheet (Bill, Aug 21 2026):
            12px / 600 / 0.05em uppercase, centered; resting ink is the
            skin's rgba(51,51,51,0.5) — the mid gray, NOT bold #333 (that
            was the top bar's rule). Hover goes near-black on their site. */}
        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {/* "Sign in" rides last and wears the site's active treatment —
              near-black with the gold rule under it (Bill, Aug 21 2026). */}
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
        {/* Their site's gold rectangle — squared, not our pill. Shell-only
            chrome for visitors arriving from the main site; once signed in
            it steps aside for the account chip (Bill, Aug 21 2026). */}
        {!signedIn && (
          <span style={{ padding: '11px 20px', background: GOLD, color: INK, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            Get an estimate
          </span>
        )}
        {signedIn && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: SUBINK }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 600, color: INK }}>
              {(firstName || '?').slice(0, 1).toUpperCase()}
            </span>
            {firstName}
          </span>
        )}
      </div>
    </div>
  );
}

const MRP_FOOTER_COLS: { head: string; rows: string[] }[] = [
  { head: 'Most used links', rows: ['Vinyl Records', 'Deluxe Vinyl Packaging', 'Short-Run Record Pressing', 'Forms & Templates', 'Audio File Prep', 'Art File Prep'] },
  { head: 'Contact us', rows: ['Phone: (901) 821-9099', 'Email: help@memphisvinyl.com', 'Careers'] },
  { head: 'Privacy & security', rows: ['Privacy Notice'] },
  { head: 'Locations', rows: ['Pressing & Customer Service: 3015 Brother Blvd, Bartlett, TN 38133', 'Packaging & Shipping: 7625 Appling Center Dr #103, Memphis, TN 38133'] },
];

// Inside the app the footer reduces to just the black bar — Memphis and us.
// The full column footer belongs to the site/login only (Bill, Aug 21 2026).
export function MrpSiteFooter({ compact = false }: { compact?: boolean }) {
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
        Memphis Record Pressing · memphisvinyl.com
        <span style={{ flex: 1 }} />
        {/* Powered by GoodTunes® — right side, under the rule (Bill,
            Aug 21 2026). White logo via CSS invert (only dark assets exist). */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(245,245,247,0.55)' }}>
          Powered by
          <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: 'invert(1) brightness(2)', opacity: 0.85 }} />
        </span>
      </div>
    </footer>
  );
}

export default function PressClientNextStepsMRP() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  // Real session check — 401 means the login stage renders.
  const { data: portal, isLoading } = useQuery<PortalData>({
    queryKey: [wlParam('/api/press-client/portal')],
    retry: false,
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askMsg, setAskMsg] = useState('');
  const [askSent, setAskSent] = useState(false);
  const [search, setSearch] = useState('');

  const stage: 'login' | 'portal' = portal ? 'portal' : 'login';

  // The client's live project — the accepted (Converted) estimate wins;
  // otherwise the most recent one they were sent.
  const project = useMemo(() => {
    const list = portal?.estimates ?? [];
    return list.find((e) => e.status === 'Converted') ?? list[0] ?? null;
  }, [portal]);
  const clientFirst = (portal?.client.displayName || portal?.client.email || '').split(' ')[0];
  const preparedBy = project?.preparedBy || project?.pressName || '';
  const firstName = preparedBy.split(' ')[0] || 'the press';
  const estimateNo = project?.estimateNo ?? '—';
  const jobTitle = project?.title ?? 'Your project';
  const spec = project?.build ?? '';
  const qtyLabel = project?.quantity ? `${project.quantity.toLocaleString()} units` : null;
  const unitLabel = useMemo(() => {
    if (!project?.totalCents || !project.quantity) return null;
    const unit = (project.totalCents / 100 - SETUP_TOTAL_DOLLARS) / project.quantity;
    return unit > 0 ? `$${unit.toFixed(2)} /unit` : null;
  }, [project]);
  const depositLabel = project?.totalCents ? moneyFmt(project.totalCents / 200) : null;
  const steps = useMemo(() => buildSteps(estimateNo, firstName, depositLabel), [estimateNo, firstName, depositLabel]);
  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (portal?.estimates ?? []).filter(
      (e) => (e.title ?? '').toLowerCase().includes(q) || (e.estimateNo ?? '').toLowerCase().includes(q),
    ).slice(0, 6);
  }, [search, portal]);

  const doLogin = async () => {
    if (!earned || loginBusy) return;
    setLoginBusy(true); setLoginError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), username: email.trim(), password, kind: 'customer' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setLoginError(json?.message || 'Check your email and password.'); return; }
      if (json?.token) setAuthToken(json.token);
      await queryClient.invalidateQueries({ queryKey: [wlParam('/api/press-client/portal')] });
    } catch {
      setLoginError('Something went wrong — please try again.');
    } finally { setLoginBusy(false); }
  };

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

  const sendAsk = async () => {
    if (askMsg.trim() === '' || !project?.shareToken) return;
    const res = await fetch(`/api/estimate-link/${project.shareToken}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: askMsg.trim(), email: portal?.client.email ?? undefined, name: portal?.client.displayName ?? undefined }),
    });
    if (res.ok) setAskSent(true);
  };

  const earned = password.trim() !== '';
  /* Their real stylesheet is Poppins throughout (Bill, Aug 21 2026) —
     the whole MRP-skinned page wears it, not our SF stack. */
  const font = "'Poppins', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

  if (isLoading) {
    return <div style={{ minHeight: '100dvh', background: CANVAS }} />;
  }

  // ── Stage 1 — MRP-branded login. Same GoodTunes account system, same
  // database — only the skin belongs to the press. ──
  if (stage === 'login') {
    return (
      <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
        <MrpSiteHeader signedIn={false} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px 64px' }}>
        <div style={{ width: 380, maxWidth: '100%', textAlign: 'center' }}>
          {/* No logo on the card — the site header already carries it (Bill, Aug 21 2026). */}
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>Sign in</h1>
          <p style={{ fontSize: 13.5, color: SUBINK, margin: '8px 0 0', lineHeight: 1.6 }}>
            Your account was created when you started your project.
          </p>
          <div style={{ marginTop: 26, display: 'grid', gap: 10, textAlign: 'left' }}>
            <input
              style={{ width: '100%', height: 40, borderRadius: 0, padding: '0 12px', fontSize: 13.5, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          {/* Earns its gold once a password is typed (canon). */}
          <button
            type="button"
            disabled={!earned}
            onClick={doLogin}
            data-testid="button-login"
            style={{
              marginTop: 18, width: '100%', padding: '12px 0', borderRadius: 0, fontSize: 14, fontWeight: 700,
              cursor: earned ? 'pointer' : 'not-allowed',
              background: earned ? GOLD : 'transparent',
              border: earned ? '1px solid transparent' : `1px solid ${HAIRLINE}`,
              color: earned ? INK : SUBINK,
            }}
          >
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
          {loginError && <div style={{ marginTop: 12, fontSize: 12, color: '#b3261e' }}>{loginError}</div>}
          <div style={{ marginTop: 14, fontSize: 12, color: SUBINK }}>Forgot your password?</div>
        </div>
        </div>
        <MrpSiteFooter />
      </div>
    );
  }

  // ── Stage 2 — the artist portal, MRP skin: top bar + left rail wrap
  // the next-steps overview. ──
  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>

      {/* ── MRP's own site header wears the portal (Bill, Aug 21 2026) ── */}
      <MrpSiteHeader signedIn firstName={clientFirst} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav canon, Team pinned at the bottom ── */}
        <nav style={{ width: 218, flexShrink: 0, borderRight: `1px solid ${HAIRLINE}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Canon search — ⌘K chip flush right INSIDE the bar */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-rail-search"
              style={{ width: '100%', height: 34, borderRadius: 0, padding: '0 44px 0 12px', fontSize: 12.5, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
            />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, fontWeight: 600, color: SUBINK, background: CANVAS, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '2px 5px' }}>
              ⌘K
            </span>
            {searchHits.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.10)' }} data-testid="rail-search-results">
                {searchHits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => { if (h.shareToken) navigate(`/e/${h.shareToken}`); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: INK }}
                  >
                    <div style={{ fontWeight: 600 }}>{h.title ?? h.estimateNo}</div>
                    <div style={{ fontSize: 11, color: SUBINK }}>Estimate {h.estimateNo} · {h.status}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {RAIL_ITEMS.map((r) => <RailRow key={r} name={r} active={r === 'Dashboard'} />)}
          <div style={{ flex: 1 }} />
          {/* Team pinned at rail bottom (artist nav canon) */}
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
                Welcome, {clientFirst}.
              </h1>
              <p style={{ fontSize: 15, color: SUBINK, margin: '10px 0 0', lineHeight: 1.6 }}>
                {jobTitle} is underway at {project?.pressName ?? 'the press'}.
              </p>

              {/* Project card — the estimate carried forward */}
              <div style={{ marginTop: 28, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', padding: 20, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
                <img src={californialandCover} alt={`${jobTitle} cover art`} style={{ width: 64, height: 64, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>{jobTitle}</div>
                  {spec && <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>{spec}</div>}
                  <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>
                    {[qtyLabel, unitLabel].filter(Boolean).join(' · ')}{(qtyLabel || unitLabel) ? ' · ' : ''}Estimate <span style={{ fontWeight: 600, color: INK }}>{estimateNo}</span>
                  </div>
                </div>
                {/* Quiet — the estimate stays one click away inside the portal. */}
                <button
                  type="button"
                  data-testid="button-view-estimate"
                  onClick={() => { if (project?.shareToken) navigate(`/e/${project.shareToken}`); }}
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
                {steps.map((s, i) => (
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
                              onClick={() => fileRef.current?.click()}
                              style={{
                                padding: '10px 22px', borderRadius: 0, border: 'none', cursor: 'pointer',
                                background: GOLD, color: INK, fontSize: 13.5, fontWeight: 700,
                              }}
                            >
                              {uploadBusy ? 'Uploading…' : <>Upload audio &amp; artwork</>}
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

            {/* ── Brandon — the human on the other end ── */}
            <section style={{ marginTop: 28, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 46, height: 46, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                <img src={brandonPhoto} alt={preparedBy} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{preparedBy} is your contact for this run.</div>
                <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>Replies within 1 business day · {project?.pressName ?? ''}</div>
              </div>
              {/* Quiet gray-outline — side actions never take the fill. */}
              <button
                type="button"
                data-testid="button-ask-brandon"
                onClick={() => { setAskOpen(true); setAskSent(false); setAskMsg(''); }}
                style={{ padding: '8px 16px', borderRadius: 0, background: 'transparent', border: `1px solid ${HAIRLINE}`, color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Ask {firstName} a question
              </button>
            </section>

            {/* ── Ask sheet — same message channel as the estimate page ── */}
            {askOpen && (
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 24 }}
                onClick={() => setAskOpen(false)}
                data-testid="sheet-ask-brandon"
              >
                <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: 400, maxWidth: '100%', borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, boxShadow: '0 32px 80px rgba(0,0,0,0.18)', padding: 26 }}>
                  {askSent ? (
                    <div style={{ textAlign: 'center', padding: '6px 0', fontSize: 15.5, fontWeight: 600 }}>Your message has been sent to {firstName}.</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>How can I help?</div>
                      <textarea
                        style={{ width: '100%', height: 96, borderRadius: 0, padding: '10px 12px', fontSize: 13.5, background: CANVAS, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none', resize: 'none', marginTop: 16, lineHeight: 1.5 }}
                        placeholder="Ask about pricing, timing, specs — anything"
                        value={askMsg}
                        onChange={(e) => setAskMsg(e.target.value)}
                        data-testid="input-ask-brandon-message"
                      />
                      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          disabled={askMsg.trim() === ''}
                          onClick={sendAsk}
                          style={{ padding: '10px 22px', borderRadius: 0, fontSize: 13.5, fontWeight: 600, cursor: askMsg.trim() ? 'pointer' : 'not-allowed', background: askMsg.trim() ? GOLD : 'transparent', border: askMsg.trim() ? '1px solid transparent' : `1px solid ${HAIRLINE}`, color: askMsg.trim() ? INK : SUBINK }}
                          data-testid="button-ask-brandon-send"
                        >
                          Send
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── In-app, the footer is just the black bar — Memphis and us ── */}
      <MrpSiteFooter compact />
    </div>
  );
}
