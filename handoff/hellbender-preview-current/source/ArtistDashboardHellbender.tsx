// ArtistDashboardHellbender — the full artist dashboard wearing Hellbender
// Vinyl's current, light GoodTunes partner shell. This remains the lockstep
// Hellbender twin of
// ArtistDashboard.tsx: same information architecture and content — top bar
// (artist brand left, Feedback / notifications / avatar right, the press's
// mark quietly beside them), the artist rail (Dashboard / People / Projects
// / Overview / Audience / Acquisition / Orders / Buyers / Referrals /
// Shopify / Reports) with POWERED BY GoodTunes at the bottom, greeting +
// range switcher, the COLLAPSIBLE next-steps lifecycle strip, KPI strip,
// trend + activity, top projects + channels + giving — re-skinned per the
// Hellbender canon:
//
//   • Apple-canon light canvas, quiet rail, translucent header and rounded cards.
//   • Hellbender red is reserved for earned partner actions.
//   • Every status = word + icon, never color alone (colorblind-safe).
//   • ONE filled red action on the page — the up-next step's upload.
//   • "Estimate", never the q-word. Real ® character. No emojis.
//
// Client persona: Alex Tebeleff, artist/project How???, 1,000 units at
// $8.37/unit, estimate 071500-02, run with Hellbender Vinyl via
// hellbender.makesvinyl.com. Self-contained: MOCK_ constants, no imports
// from other mockups, default-export component so routes auto-discover.

import { useMemo, useState, type ReactNode } from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  UserPlus,
  Banknote,
  Search,
  LayoutDashboard,
  User,
  Disc3,
  Activity,
  Users,
  Megaphone,
  ShoppingBag,
  UserCheck,
  BarChart3,
  Store,
  TrendingUp,
  Receipt,
  Award,
  MessageSquarePlus,
  Music2,
  Headphones,
  UserPen,
  LogOut,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import hellbenderIcon from '../assets/hellbender-icon.svg';
import howAlbumCover from '../assets/how-album-cover.jpg';
import alexPhoto from '../assets/alex-tebeleff.jpg';

// ─── Palette — Hellbender white-label light canon ────────────────────
const CANVAS = '#f5f5f7';
const CARD = '#ffffff';
const CARD_RAISED = '#f0f0f2';
const RAIL_BG = '#fbfbfd';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = '#e6e6ea';
const RED = '#DF0C15'; // the ONE earned fill on this page
const LINK = '#DF0C15'; // links = red

/* Chivo throughout — Hellbender's real face (their live stylesheet). */
const FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif";

// ─── Button grammar — EXACT from hellbendervinyl.com base.css ────────
// Buttons are FULLY ROUNDED PILLS (--buttons-radius: 40px): uppercase Chivo
// 15px, min-height 45px, padding 0 30px, letter-spacing ~1px. Filled = red
// fill + WHITE text; outlined/secondary = white bg + red text + red border.
// Inputs are (nearly) square: radius 2px, 1px border rgba(0,0,0,0.15).
const INPUT_BORDER = 'rgba(0,0,0,0.15)';
const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  borderRadius: 40, minHeight: 45, padding: '0 30px', fontFamily: FONT,
  fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnFilled: React.CSSProperties = { ...btnBase, background: RED, color: '#ffffff', border: 'none' };
const btnOutline: React.CSSProperties = { ...btnBase, background: 'transparent', color: INK, border: `1px solid ${HAIRLINE}` };

// ─── Mock persona / project ──────────────────────────────────────────
const MOCK_CLIENT_FIRST = 'Alex';
const MOCK_JOB = 'How???';
const MOCK_ESTIMATE_NO = '071500-02';
const MOCK_PREPARED_BY = 'Travis Whitlock';
const MOCK_QTY = '1,000 units';
const MOCK_UNIT = '$8.37 /unit';
const MOCK_TOTAL = '$8,375.00';
const MOCK_DEPOSIT = '$4,187.50';

// ─── Account persona — the signed-in admin ──────────────────────────
const MOCK_USER_NAME = 'Alex Tebeleff';
const MOCK_USER_EMAIL = 'alex@howband.com';

// ─── Canon account dropdown — local useState popover (self-contained;
// mirrors the UserMenu in ArtistReleasesIndex, Hellbender square skin) ─
function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'Light' | 'Dark' | 'System'>('Light');
  const items: { label: string; icon: typeof UserPen }[] = [
    { label: 'Edit profile', icon: UserPen },
    { label: 'Invite teammate', icon: UserPlus },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="button-user-menu"
        style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${HAIRLINE}`, padding: 0, cursor: 'pointer', background: 'transparent', display: 'block' }}
      >
        <img src={alexPhoto} alt={MOCK_USER_NAME} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </button>
      {open && (
        <div
          data-testid="menu-user"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, width: 300, background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.12)', fontFamily: FONT }}
        >
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{MOCK_USER_NAME}</div>
            <div style={{ fontSize: 11.5, color: SUBINK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{MOCK_USER_EMAIL}</div>
          </div>
          <div style={{ padding: '4px 0' }}>
            {items.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => setOpen(false)}
                data-testid={`menu-item-${label.toLowerCase().replace(/\s+/g, '-')}`}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}
              >
                <Icon style={{ width: 15, height: 15, flexShrink: 0, color: SUBINK }} />
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'block', padding: '10px 14px', borderTop: `1px solid ${HAIRLINE}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: SUBINK, marginBottom: 6 }}>APPEARANCE</div>
            <div style={{ display: 'flex', background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, borderRadius: 999, padding: 2 }} role="radiogroup" aria-label="Appearance">
              {(['Light', 'Dark', 'System'] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m)}
                    data-testid={`appearance-${m.toLowerCase()}`}
                    style={{
                      padding: '3px 9px', borderRadius: 40, fontSize: 11.5, cursor: 'pointer', fontFamily: FONT,
                      fontWeight: active ? 700 : 400,
                       background: active ? CARD : 'transparent',
                       border: '1px solid transparent',
                       boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                      color: active ? INK : SUBINK,
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: '4px 0', borderTop: `1px solid ${HAIRLINE}` }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid="menu-item-sign-out"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}
            >
              <LogOut style={{ width: 15, height: 15, flexShrink: 0, color: SUBINK }} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const timeGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// ─── money / number formatting ───────────────────────────────────────
const DASH = '—';
function fmtUsd(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return DASH;
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DASH;
  return n.toLocaleString('en-US');
}
function fmtRel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${Math.max(s, 1)}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

// Stubbed link — plain anchor that never navigates.
function A({
  children,
  style,
  'data-testid': testId,
}: {
  children?: ReactNode;
  style?: React.CSSProperties;
  'data-testid'?: string;
}) {
  return (
    <a href="#" onClick={(e) => e.preventDefault()} style={{ textDecoration: 'none', color: 'inherit', ...style }} data-testid={testId}>
      {children}
    </a>
  );
}

// ─── KPI / series mock data (indie-artist-scaled, same as the twin) ──
interface SeriesPoint { date: string; salesCents: number; plays: number; listeners: number }

function buildSeries(): SeriesPoint[] {
  const now = Date.now();
  const out: SeriesPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.3 : 1;
    const drift = 1 + (29 - i) * 0.01;
    const drop = i <= 14 && i >= 11 ? 1.7 : 1;
    const wobble = 0.85 + (Math.sin(i * 1.7) + Math.cos(i * 0.6)) * 0.12;
    const base = weekend * drift * drop * wobble;
    const plays = Math.max(20, Math.round(180 * base));
    const salesCents = Math.round((plays / 20) * (2400 + Math.sin(i) * 400));
    const listeners = Math.max(10, Math.round(plays * 0.55 * (0.9 + wobble * 0.2)));
    out.push({ date: d.toISOString().slice(0, 10), salesCents, plays, listeners });
  }
  return out;
}

const MOCK_SERIES = buildSeries();
const MOCK_PRIOR_SERIES = MOCK_SERIES.map((s) => ({
  date: s.date,
  salesCents: Math.round(s.salesCents * 0.87),
  plays: Math.round(s.plays * 0.83),
  listeners: Math.round(s.listeners * 0.85),
}));

const sum = (arr: SeriesPoint[], k: keyof Omit<SeriesPoint, 'date'>) =>
  arr.reduce((a, s) => a + (s[k] as number), 0);

const MOCK_KPIS = {
  sales30dCents: sum(MOCK_SERIES, 'salesCents'),
  salesLifetimeCents: 3_184_500,
  plays30d: sum(MOCK_SERIES, 'plays'),
  listenerCount: 4_820,
  buyerCount: 738,
  prior: {
    sales30dCents: sum(MOCK_PRIOR_SERIES, 'salesCents'),
    salesLifetimeCents: 2_910_000,
    plays30d: sum(MOCK_PRIOR_SERIES, 'plays'),
    listenerCount: 4_390,
    buyerCount: 691,
  },
};

// ─── Activity — the aggregate business story, never a raw fan feed ───
type ActivityKind = 'milestone' | 'invoice' | 'stage' | 'roster' | 'certificate';
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const MOCK_ACTIVITY: { id: string; kind: ActivityKind; ts: string; title: string; detail: string }[] = [
  { id: 'a1', kind: 'stage', ts: ago(18), title: `${MOCK_JOB} project created`, detail: `Estimate ${MOCK_ESTIMATE_NO} locked as working numbers · ${MOCK_QTY}` },
  { id: 'a2', kind: 'invoice', ts: ago(64), title: 'Payout cleared · $1,240.00', detail: 'Last cycle · net of platform fees' },
  { id: 'a3', kind: 'milestone', ts: ago(120), title: 'How??? passed 500 units', detail: 'Your best-selling project · $6,400.00 lifetime' },
  { id: 'a4', kind: 'roster', ts: ago(240), title: 'New referral joined', detail: 'Delta Rae accepted your invite · 1 project homed' },
  { id: 'a5', kind: 'certificate', ts: ago(410), title: 'GoodDeed® certificate batch shipped', detail: '42 certificates · Motel Lights preorder' },
  { id: 'a6', kind: 'milestone', ts: ago(720), title: 'Motel Lights passed 10k plays', detail: '2,100 unique listeners this month' },
  { id: 'a7', kind: 'stage', ts: ago(1150), title: 'Sun Damage moved to in production', detail: 'Run of 200 started · vinyl' },
  { id: 'a8', kind: 'invoice', ts: ago(1980), title: 'Payout cleared · $980.00', detail: 'Prior cycle · net of platform fees' },
  { id: 'a9', kind: 'roster', ts: ago(2640), title: 'New referral joined', detail: 'The Hollow Coves accepted your invite' },
];

// ─── Catalog / channels mock data ────────────────────────────────────
const MOCK_TOP_PROJECTS: { id: string; title: string; format: string; units: number; salesCents: number; cover?: string }[] = [
  { id: 'customsland', title: MOCK_JOB, format: 'Vinyl LP · in production at Hellbender Vinyl', units: 0, salesCents: 0, cover: howAlbumCover },
  { id: 'californialand', title: 'How???', format: 'Vinyl LP · repress', units: 512, salesCents: 640_000 },
  { id: 'motel-lights', title: 'Motel Lights', format: 'Vinyl LP', units: 284, salesCents: 356_000 },
  { id: 'sun-damage', title: 'Sun Damage', format: 'Vinyl LP · in production', units: 176, salesCents: 214_000 },
  { id: 'paper-tigers', title: 'Paper Tigers', format: 'Cassette', units: 98, salesCents: 78_000 },
];

const MOCK_CHANNELS: { id: string; label: string; icon: typeof Headphones; salesCents: number; share: number }[] = [
  { id: 'store', label: 'Artist store', icon: ShoppingBag, salesCents: 356_000, share: 40 },
  { id: 'streaming', label: 'Streaming referrals', icon: Headphones, salesCents: 214_000, share: 24 },
  { id: 'social', label: 'Social & campaigns', icon: Megaphone, salesCents: 124_000, share: 14 },
  { id: 'shopify', label: 'Shopify store', icon: Store, salesCents: 118_000, share: 13 },
  { id: 'shows', label: 'Live shows', icon: Music2, salesCents: 80_000, share: 9 },
];

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
        borderRadius: 0, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
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

// ─── The lifecycle steps — How???, the estimate carried forward ──────
const MOCK_STEPS: { id: string; title: string; body: string; status: StepStatus; meta?: string }[] = [
  { id: 'created', status: 'done', title: 'Project created', body: `Estimate ${MOCK_ESTIMATE_NO} locked as your working numbers — ${MOCK_PREPARED_BY.split(' ')[0]} has been notified. ${MOCK_QTY} · ${MOCK_UNIT} · ${MOCK_TOTAL} working total.` },
  { id: 'assets', status: 'next', title: 'Audio & artwork', body: 'Upload your master audio and print-ready art. Every file is checked before anything is cut.' },
  { id: 'test', status: 'waiting', title: 'Test pressing approval', body: 'Test pressings ship to you with 2-day domestic shipping. Production waits for your approval.' },
  { id: 'deposit', status: 'waiting', title: 'Deposit', body: 'A 50% deposit schedules your run; the remainder is billed at completion.', meta: `${MOCK_DEPOSIT} · 50% of the working total` },
  { id: 'production', status: 'waiting', title: 'Pressing & packaging', body: 'Pressed, labeled, assembled, shrinkwrapped retail-ready.' },
  { id: 'shipping', status: 'waiting', title: 'Shipping', body: 'Finished records leave Pittsburgh with tracking after final inspection.' },
];

// ─── Rail — the artist portal's nav, verbatim order ──────────────────
const ARTIST_NAV: { label: string; icon: typeof LayoutDashboard; active?: boolean }[] = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Releases', icon: Disc3 },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

function NavRow({ label, icon: Icon, active }: { label: string; icon: typeof LayoutDashboard; active?: boolean }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      data-testid={`rail-${label.toLowerCase()}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10,
        fontSize: 13, fontWeight: active ? 700 : 400, color: active ? INK : SUBINK,
        background: active ? CARD : 'transparent',
        border: active ? `1px solid ${HAIRLINE}` : '1px solid transparent',
        textDecoration: 'none',
      }}
    >
      <Icon style={{ width: 15, height: 15, flexShrink: 0, color: active ? INK : SUBINK }} />
      {label}
    </a>
  );
}

// ─── KPI strip ───────────────────────────────────────────────────────
function deltaPct(cur: number, prior: number): { text: string; positive: boolean } {
  if (prior === 0) return { text: DASH, positive: true };
  const pct = ((cur - prior) / prior) * 100;
  const positive = pct >= 0;
  return { text: `${positive ? '+' : ''}${pct.toFixed(1)}%`, positive };
}
function fmtKpiNum(value: number): string {
  return value >= 10_000 ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k` : value.toLocaleString('en-US');
}
function fmtKpiUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents >= 1_000_000 ? 0 : 2,
    maximumFractionDigits: cents >= 1_000_000 ? 0 : 2,
  })}`;
}

function KpiStrip() {
  const k = MOCK_KPIS;
  const p = k.prior;
  const tiles = [
    { id: 'sales30d', label: 'Sales · last 30d', value: fmtKpiUsd(k.sales30dCents), cur: k.sales30dCents, prior: p.sales30dCents },
    { id: 'salesLifetime', label: 'Sales · lifetime', value: fmtKpiUsd(k.salesLifetimeCents), cur: k.salesLifetimeCents, prior: p.salesLifetimeCents },
    { id: 'plays30d', label: 'Plays · last 30d', value: fmtKpiNum(k.plays30d), cur: k.plays30d, prior: p.plays30d },
    { id: 'listeners', label: 'Listeners', value: fmtKpiNum(k.listenerCount), cur: k.listenerCount, prior: p.listenerCount },
    { id: 'buyers', label: 'Buyers', value: fmtKpiNum(k.buyerCount), cur: k.buyerCount, prior: p.buyerCount },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }} data-testid="kpi-strip">
      {tiles.map((t) => {
        const d = deltaPct(t.cur, t.prior);
        return (
          <div key={t.id} data-testid={`kpi-${t.id}`} style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: '16px 16px 18px' }}>
            <div style={{ fontSize: 12, color: SUBINK }}>{t.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{t.value}</div>
            {/* Delta reads as word + arrow glyph — never color alone. */}
            <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 8 }}>
              <span style={{ fontWeight: 700, color: INK }}>{d.text === DASH ? DASH : `${d.positive ? '▲' : '▼'} ${d.text}`}</span> vs prior
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Trend chart ─────────────────────────────────────────────────────
type ChartMetric = 'sales' | 'plays' | 'listeners';

function TrendChart() {
  const [metric, setMetric] = useState<ChartMetric>('sales');
  const merged = useMemo(() => {
    const key = metric === 'sales' ? 'salesCents' : metric === 'plays' ? 'plays' : 'listeners';
    return MOCK_SERIES.map((s, i) => ({
      date: s.date,
      current: s[key as keyof SeriesPoint] as number,
      prior: (MOCK_PRIOR_SERIES[i]?.[key as keyof SeriesPoint] as number) ?? null,
    }));
  }, [metric]);
  const isCurrency = metric === 'sales';
  const opts: { v: ChartMetric; label: string }[] = [
    { v: 'sales', label: 'Sales' },
    { v: 'plays', label: 'Plays' },
    { v: 'listeners', label: 'Listeners' },
  ];
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }} data-testid="dashboard-trend-chart">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          The last 30 days. <span style={{ color: SUBINK, fontWeight: 400 }}>This period vs prior.</span>
        </div>
        <div style={{ display: 'flex', background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: 3 }}>
          {opts.map((o) => {
            const active = metric === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setMetric(o.v)}
                aria-pressed={active}
                data-testid={`button-chart-metric-${o.v}`}
                style={{
                  padding: '4px 12px', borderRadius: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: active ? CARD_RAISED : 'transparent',
                  border: active ? `1px solid ${HAIRLINE}` : '1px solid transparent',
                  color: active ? INK : SUBINK,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#c7c7cc" fontSize={11} />
            <YAxis stroke="#c7c7cc" fontSize={11} tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)} />
            <Tooltip formatter={(v: number) => (isCurrency ? fmtUsd(v) : fmtNum(v))} labelStyle={{ color: INK }} contentStyle={{ borderRadius: 0, border: `1px solid ${HAIRLINE}`, fontFamily: FONT, fontSize: 12 }} />
            <Line type="monotone" dataKey="prior" stroke="#c7c7cc" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Prior period" connectNulls />
            <Line type="monotone" dataKey="current" stroke={RED} strokeWidth={2} dot={false} name="This period" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Activity feed ───────────────────────────────────────────────────
function ActivityIconBadge({ kind }: { kind: ActivityKind }) {
  const Icon = { milestone: TrendingUp, invoice: Receipt, stage: Disc3, roster: UserPlus, certificate: Award }[kind];
  return (
    <span style={{ width: 34, height: 34, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon style={{ width: 15, height: 15, color: SUBINK }} />
    </span>
  );
}

function ActivityFeed() {
  const items = useMemo(
    () => [...MOCK_ACTIVITY].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 12),
    [],
  );
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }} data-testid="dashboard-activity-feed">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>As it happens.</div>
        <A style={{ fontSize: 12.5, color: LINK, fontWeight: 700 }} data-testid="link-activity-view-all">View all</A>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {items.map((it, i) => (
          <li key={it.id} data-testid={`activity-${it.kind}-${i}`} style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
              <ActivityIconBadge kind={it.kind} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                <div style={{ fontSize: 11.5, color: SUBINK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.detail}</div>
              </div>
              <div style={{ fontSize: 11, color: SUBINK, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtRel(new Date(it.ts))}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Top projects ────────────────────────────────────────────────────
function TopProjects() {
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }} data-testid="dashboard-top-projects">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Top projects. <span style={{ color: SUBINK, fontWeight: 400 }}>Ranked by sales.</span></div>
        <A style={{ fontSize: 12.5, color: LINK, fontWeight: 700 }} data-testid="link-projects-view-all">View all</A>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
        {MOCK_TOP_PROJECTS.map((r, i) => (
          <li key={r.id} data-testid={`project-${r.id}`} style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: SUBINK, width: 14, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              {r.cover ? (
                <img src={r.cover} alt={`${r.title} cover art`} style={{ width: 40, height: 40, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}`, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 40, height: 40, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Music2 style={{ width: 15, height: 15, color: SUBINK }} />
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                <div style={{ fontSize: 11.5, color: SUBINK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.format}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(r.salesCents)}</div>
                <div style={{ fontSize: 11.5, color: SUBINK, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.units)} units</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Where sales come from ───────────────────────────────────────────
function SalesChannels() {
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }} data-testid="dashboard-sales-channels">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Where sales come from.</div>
        <A style={{ fontSize: 12.5, color: LINK, fontWeight: 700 }} data-testid="link-channels-view-all">View all</A>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 13 }}>
        {MOCK_CHANNELS.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.id} data-testid={`channel-${r.id}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 30, height: 30, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon style={{ width: 13, height: 13, color: SUBINK }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(r.salesCents)}</span>
                  </div>
                  {/* Bar + the % number — the number carries the value, not the color. */}
                  <div style={{ marginTop: 6, height: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.share}%`, background: RED }} />
                  </div>
                </div>
                <span style={{ fontSize: 11, color: SUBINK, width: 30, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.share}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Giving ──────────────────────────────────────────────────────────
function GivingCard() {
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }} data-testid="dashboard-giving">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Giving.</div>
        <A style={{ fontSize: 12.5, color: LINK, fontWeight: 700 }} data-testid="link-giving-view-impact">View impact</A>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Award style={{ width: 16, height: 16, color: SUBINK }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 400, lineHeight: 1.45 }}>Supporting Endometriosis Foundation of America</div>
          <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>
            <span style={{ fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>$486.00</span> raised from your sales · via GoodDeed®
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Simple portal footer — the MRP twins' compact bar, but on
// Hellbender red instead of black (Bill's call). White mark + ink on red.
function HbSimpleFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${HAIRLINE}`, background: RAIL_BG, color: SUBINK, padding: '14px 26px' }} data-testid="portal-footer">
      <div style={{ maxWidth: 1240, margin: '0 auto', fontSize: 11.5 }}>
        {MOCK_JOB} is running with Hellbender Vinyl · hellbendervinyl.com
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export default function ArtistDashboardHellbender() {
  // The strip opens on first visit — a live project is exactly when it has
  // something to say. Collapses to one quiet line.
  const [open, setOpen] = useState(true);
  const [uploaded, setUploaded] = useState(false);
  const [range, setRange] = useState('30d');
  const doneCount = MOCK_STEPS.filter((s) => s.status === 'done').length;
  const upNext = MOCK_STEPS.find((s) => s.status === 'next');

  return (
    <div data-testid="artist-dashboard-shell" style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        [data-testid="artist-dashboard-shell"] button { border-radius: 999px !important; }
        [data-testid="artist-dashboard-shell"] [data-testid^="dashboard-"],
        [data-testid="artist-dashboard-shell"] [data-testid^="kpi-"],
        [data-testid="artist-dashboard-shell"] [data-testid="next-steps-strip"] { border-radius: 16px !important; }
        @media (max-width: 767px) {
          [data-testid="artist-dashboard-shell"] nav { display: none !important; }
          [data-testid="artist-dashboard-shell"] main > div { padding: 24px 20px 64px !important; }
        }
      `}</style>

      {/* ── Top bar — signed-in canon: press brand left; quiet Feedback +
          account avatar (canon dropdown) right. Nothing else. ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 20px', background: 'rgba(251,251,253,0.72)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src={hellbenderIcon} alt="" aria-hidden style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0, filter: 'brightness(0) saturate(100%) invert(14%) sepia(99%) saturate(6155%) hue-rotate(354deg) brightness(98%) contrast(101%)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap' }}>Hellbender Vinyl</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <button type="button" data-testid="button-feedback" style={{ ...btnOutline, border: '1px solid transparent', background: 'transparent', color: SUBINK }}>
            <MessageSquarePlus style={{ width: 16, height: 16 }} />
            Feedback
          </button>
          <AccountMenu />
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav, POWERED BY GoodTunes at the bottom ── */}
        <nav style={{ width: 244, flexShrink: 0, background: RAIL_BG, borderRight: `1px solid ${HAIRLINE}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 56, height: 'calc(100dvh - 56px)', overflowY: 'auto' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: SUBINK }} />
            <input
              placeholder="Search…"
              data-testid="input-rail-search"
              style={{ width: '100%', height: 32, borderRadius: 2, padding: '0 44px 0 30px', fontSize: 12.5, background: CARD, border: `1px solid ${INPUT_BORDER}`, color: INK, outline: 'none', fontFamily: FONT }}
            />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: SUBINK, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '1px 5px' }}>
              ⌘K
            </span>
          </div>
          {ARTIST_NAV.map((item) => <NavRow key={item.label} {...item} />)}
          <div style={{ borderTop: `1px solid ${HAIRLINE}`, marginTop: 'auto', paddingTop: 8 }}>
            <NavRow label="Settings" icon={User} />
          </div>
          {/* Platform attribution — GoodTunes recedes to a "powered by" mark. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 12px 4px', borderTop: `1px solid ${HAIRLINE}`, marginTop: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: SUBINK }}>POWERED BY</span>
            {/* Dark logo needs no invert on light. */}
            <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 16, width: 'auto', opacity: 0.9 }} />
          </div>
        </nav>

        {/* ── Main ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 40px 96px' }}>

            {/* Greeting row + range pills + quiet outline action */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, margin: 0 }} data-testid="heading-artist-dashboard">
                  {timeGreeting()}, {MOCK_CLIENT_FIRST}
                </h1>
                <p style={{ fontSize: 13, color: SUBINK, margin: '6px 0 0' }}>
                  One project is moving — {upNext ? `up next: ${upNext.title.toLowerCase()}.` : 'nothing needs you right now.'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: 3 }} data-testid="dashboard-range-switcher">
                  {['Today', '7d', '30d', '90d', 'All'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      aria-pressed={range === r}
                      data-testid={`range-${r.toLowerCase()}`}
                      style={{
                        padding: '5px 13px', borderRadius: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                        background: range === r ? CARD_RAISED : 'transparent',
                        border: range === r ? `1px solid ${HAIRLINE}` : '1px solid transparent',
                        color: range === r ? INK : SUBINK,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {/* Quiet outline — the page's one red fill belongs to the up-next step. */}
                <button type="button" data-testid="button-header-view-payouts" style={btnOutline}>
                  <Banknote style={{ width: 16, height: 16 }} />
                  View payouts
                </button>
              </div>
            </div>

            {/* ── THE strip — "You're all caught up" becomes Next steps when a
                project is live. Collapsible; word + icon carries the state. ── */}
            <section style={{ marginTop: 22, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }} data-testid="next-steps-strip">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                data-testid="button-next-steps-toggle"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: 'transparent', border: 'none', cursor: 'pointer', color: INK, textAlign: 'left', fontFamily: FONT }}
              >
                <img src={howAlbumCover} alt="" aria-hidden style={{ width: 30, height: 30, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Next steps. <span style={{ fontWeight: 500, color: SUBINK }}>{MOCK_JOB}.</span></span>
                <span style={{ fontSize: 12.5, color: SUBINK }}>
                  {doneCount} of {MOCK_STEPS.length} done{upNext ? ` · Up next: ${upNext.title}` : ''} · Estimate {MOCK_ESTIMATE_NO}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: SUBINK }}>{open ? 'Collapse' : 'Expand'}</span>
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}>
                  <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke={SUBINK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && (
                <div style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  {MOCK_STEPS.map((s, i) => (
                    <div key={s.id} data-testid={`step-${s.id}`}>
                      {i > 0 && <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />}
                      <div style={{ padding: '13px 18px', display: 'flex', gap: 13, alignItems: 'flex-start', background: s.status === 'next' ? CARD_RAISED : 'transparent' }}>
                        <div style={{ width: 18, textAlign: 'center', fontSize: 12, fontWeight: 700, color: s.status === 'waiting' ? SUBINK : INK, paddingTop: 1 }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: s.status === 'waiting' ? SUBINK : INK }}>{s.title}</div>
                            <StatusPill status={s.status} />
                          </div>
                          <p style={{ fontSize: 12, color: SUBINK, margin: '4px 0 0', lineHeight: 1.55 }}>{s.body}</p>
                          {s.meta && <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginTop: 4 }}>{s.meta}</div>}
                          {s.id === 'assets' && (
                            <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              {/* The page's ONE filled red — earned by the live project.
                                  White text on red, never dark ink. */}
                              <button
                                type="button"
                                data-testid="button-upload-files"
                                onClick={() => setUploaded(true)}
                                style={btnFilled}
                              >
                                Upload audio &amp; artwork
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

            {/* ── KPI strip ── */}
            <div style={{ marginTop: 20 }}>
              <KpiStrip />
            </div>

            {/* ── Trend + activity ── */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 14, alignItems: 'stretch' }}>
              <TrendChart />
              <div style={{ maxHeight: 420, minHeight: 0 }}>
                <ActivityFeed />
              </div>
            </div>

            {/* ── Bottom row — top projects + channels + giving ── */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 14, alignItems: 'stretch' }}>
              <TopProjects />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SalesChannels />
                <GivingCard />
              </div>
            </div>

            {/* Quiet provenance line — the run's home. */}
            <p style={{ marginTop: 26, fontSize: 11.5, color: SUBINK }}>
              {MOCK_JOB} is running with Hellbender Vinyl · hellbendervinyl.com
            </p>
          </div>
        </main>
      </div>

      <HbSimpleFooter />
    </div>
  );
}
