// CORNER RULING (Bill, Aug 21 2026): Memphis's corner token = SQUARE and
// it applies across the whole MRP skin — buttons, cards, pills included.
// Only true circles (avatars, status dots) stay round.
//
// ArtistDashboardMRP — the FULL artist dashboard wearing Memphis Record
// Pressing's white-label skin. This is the lockstep MRP twin of
// ArtistDashboard.tsx: same information architecture and content — top bar
// (artist brand left, Feedback / notifications / avatar right, the press's
// mark quietly beside them), the artist rail (Dashboard / People / Projects
// / Overview / Audience / Acquisition / Orders / Buyers / Referrals /
// Shopify / Reports) with POWERED BY GoodTunes at the bottom, greeting +
// range switcher, the COLLAPSIBLE next-steps lifecycle strip (treatment
// reused from ArtistDashboardNextStepsMRP), KPI strip, trend + activity,
// top projects + channels + giving — re-skinned per the MRP canon:
//
//   • Canvas pure white #FFFFFF, ink #1d1d1f, subink #6e6e73.
//   • Gold #D9C153 ALWAYS with dark ink text on gold fills — never white.
//   • Poppins throughout (Google Fonts @import in a <style> tag).
//   • Square corners across the skin; only true circles stay round.
//   • Every status = word + icon, never color alone (colorblind-safe).
//   • ONE filled gold action on the page — the up-next step's upload.
//   • "Estimate", never the q-word. Real ® character. No emojis.
//
// Client persona: artist Niina Soleil, project Customsland, 1,000 units at
// $8.37/unit, estimate 071500-02, run with Memphis Record Pressing via
// mrp.pressesvinyl.com. Self-contained: MOCK_ constants, no imports from
// other mockups, default-export component so routes auto-discover.

import { setAuthToken } from "@/lib/queryClient";
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
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
  Bell,
  TrendingUp,
  Receipt,
  Award,
  MessageSquarePlus,
  Music2,
  Headphones,
} from 'lucide-react';
import goodtunesLogo from './assets/goodtunes-logo.png';
import mrpLogo from './assets/mrp-logo.svg';
import { type PortalData, type PortalEstimate } from './PressClientNextStepsMRP';
import { withDevWlParam as wlParam } from "@/hooks/useAuthKind";



// ─── Palette — MRP white-label light canon ───────────────────────────
const CANVAS = '#ffffff';
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const RAIL_BG = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#D9C153'; // the ONE earned fill on this page
const LINK = '#9c8a33'; // gold darkened enough to read as text on white

/* Poppins throughout — MRP's real face (their live stylesheet). */
const FONT = "'Poppins', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// ─── Real dashboard payload (MOCK_* retired — GET /api/press-client/dashboard) ──
export type DashboardData = {
  range: string;
  kpis: {
    salesRangeCents: number; salesLifetimeCents: number; playsRange: number;
    listenerCount: number; buyerCount: number;
    prior: { salesRangeCents: number; salesLifetimeCents: number; playsRange: number; listenerCount: number; buyerCount: number };
  };
  series: { date: string; salesCents: number; plays: number; listeners: number }[];
  activity: { id: string; kind: ActivityKind; ts: string; title: string; detail: string }[];
  topProjects: { id: string; title: string; format: string; units: number; salesCents: number }[];
  channels: { id: string; label: string; salesCents: number; share: number }[];
  giving: { org: string; raisedCents: number } | null;
};
const SETUP_TOTAL_DOLLARS = 1295; // fixed setup block — same anchor as the estimate page
const moneyFmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

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

// Link — real navigation (wired per the handoff "Must work" list).
function A({
  children,
  style,
  href,
  onNavigate,
  'data-testid': testId,
}: {
  children?: ReactNode;
  style?: React.CSSProperties;
  href?: string;
  onNavigate?: (path: string) => void;
  'data-testid'?: string;
}) {
  return (
    <a
      href={href ?? '#'}
      onClick={(e) => {
        e.preventDefault();
        if (href && onNavigate) onNavigate(href);
      }}
      style={{ textDecoration: 'none', color: 'inherit', ...style }}
      data-testid={testId}
    >
      {children}
    </a>
  );
}

// ─── Series shape (real data rides in from the dashboard endpoint) ──
interface SeriesPoint { date: string; salesCents: number; plays: number; listeners: number }

// ─── Activity — the aggregate business story, never a raw fan feed ───
type ActivityKind = 'milestone' | 'invoice' | 'stage' | 'roster' | 'certificate';

// Channel icon resolution — the endpoint sends ids, the skin picks glyphs.
const CHANNEL_ICONS: Record<string, typeof Headphones> = {
  store: ShoppingBag,
  streaming: Headphones,
  social: Megaphone,
  shopify: Store,
  shows: Music2,
};

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

// ─── The lifecycle steps — the client's real estimate carried forward ─
function buildDashSteps(
  estimateNo: string,
  preparerFirst: string,
  qtyLabel: string | null,
  unitLabel: string | null,
  totalLabel: string | null,
  depositLabel: string | null,
): { id: string; title: string; body: string; status: StepStatus; meta?: string }[] {
  const numbers = [qtyLabel, unitLabel, totalLabel ? `${totalLabel} working total` : null].filter(Boolean).join(' · ');
  return [
    { id: 'created', status: 'done', title: 'Project created', body: `Estimate ${estimateNo} locked as your working numbers — ${preparerFirst} has been notified.${numbers ? ` ${numbers}.` : ''}` },
    { id: 'assets', status: 'next', title: 'Audio & artwork', body: 'Upload your master audio and print-ready art. Every file is checked before anything is cut.' },
    { id: 'test', status: 'waiting', title: 'Test pressing approval', body: 'Test pressings ship to you with 2-day domestic shipping. Production waits for your approval.' },
    { id: 'deposit', status: 'waiting', title: 'Deposit', body: 'A 50% deposit schedules your run; the remainder is billed at completion.', meta: depositLabel ? `${depositLabel} · 50% of the working total` : undefined },
    { id: 'production', status: 'waiting', title: 'Pressing & packaging', body: 'Pressed, labeled, assembled, shrinkwrapped retail-ready.' },
    { id: 'shipping', status: 'waiting', title: 'Shipping', body: 'Finished records leave Memphis with tracking after final inspection.' },
  ];
}

// ─── Rail — the artist portal's nav, verbatim order ──────────────────
const ARTIST_NAV: { label: string; icon: typeof LayoutDashboard; active?: boolean }[] = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'People', icon: User },
  { label: 'Projects', icon: Disc3 },
  { label: 'Overview', icon: Activity },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

// Rows with a real page navigate; the rest stay inert until their screens
// are built (Aug 24 2026, Andrew's Memphis demo).
const RAIL_LINKS: Record<string, string> = { Dashboard: '/dashboard', Projects: '/projects' };

function NavRow({ label, icon: Icon, active }: { label: string; icon: typeof LayoutDashboard; active?: boolean }) {
  const [, navigate] = useLocation();
  const to = RAIL_LINKS[label];
  return (
    <a
      href={to ?? '#'}
      onClick={(e) => { e.preventDefault(); if (to) navigate(to); }}
      data-testid={`rail-${label.toLowerCase()}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 0,
        fontSize: 13, fontWeight: active ? 600 : 500, color: active ? INK : SUBINK,
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

function KpiStrip({ kpis, rangeLabel }: { kpis: DashboardData['kpis']; rangeLabel: string }) {
  const k = kpis;
  const p = k.prior;
  const tiles = [
    { id: 'sales30d', label: `Sales · ${rangeLabel}`, value: fmtKpiUsd(k.salesRangeCents), cur: k.salesRangeCents, prior: p.salesRangeCents },
    { id: 'salesLifetime', label: 'Sales · lifetime', value: fmtKpiUsd(k.salesLifetimeCents), cur: k.salesLifetimeCents, prior: p.salesLifetimeCents },
    { id: 'plays30d', label: `Plays · ${rangeLabel}`, value: fmtKpiNum(k.playsRange), cur: k.playsRange, prior: p.playsRange },
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
              <span style={{ fontWeight: 600, color: INK }}>{d.text === DASH ? DASH : `${d.positive ? '▲' : '▼'} ${d.text}`}</span> vs prior
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Trend chart ─────────────────────────────────────────────────────
type ChartMetric = 'sales' | 'plays' | 'listeners';

function TrendChart({ series, rangeTitle }: { series: SeriesPoint[]; rangeTitle: string }) {
  const [metric, setMetric] = useState<ChartMetric>('sales');
  const merged = useMemo(() => {
    const key = metric === 'sales' ? 'salesCents' : metric === 'plays' ? 'plays' : 'listeners';
    return series.map((s) => ({
      date: s.date,
      current: s[key as keyof SeriesPoint] as number,
      prior: null as number | null,
    }));
  }, [metric, series]);
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
          {rangeTitle} <span style={{ color: SUBINK, fontWeight: 500 }}>This period.</span>
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
                  padding: '4px 12px', borderRadius: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer',
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
            <Line type="monotone" dataKey="current" stroke={GOLD} strokeWidth={2} dot={false} name="This period" />
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

function ActivityFeed({ activity, onNavigate }: { activity: DashboardData['activity']; onNavigate: (p: string) => void }) {
  const items = useMemo(
    () => [...activity].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 12),
    [activity],
  );
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }} data-testid="dashboard-activity-feed">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>As it happens.</div>
        <A href="/projects" onNavigate={onNavigate} style={{ fontSize: 12.5, color: LINK, fontWeight: 600 }} data-testid="link-activity-view-all">View all</A>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {items.length === 0 && (
          <li style={{ fontSize: 12.5, color: SUBINK, padding: '9px 0' }}>Nothing yet — activity lands here as your project moves.</li>
        )}
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
function TopProjects({ projects, onNavigate }: { projects: DashboardData['topProjects']; onNavigate: (p: string) => void }) {
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20, height: '100%', display: 'flex', flexDirection: 'column' }} data-testid="dashboard-top-projects">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Top projects. <span style={{ color: SUBINK, fontWeight: 500 }}>Ranked by sales.</span></div>
        <A href="/projects" onNavigate={onNavigate} style={{ fontSize: 12.5, color: LINK, fontWeight: 600 }} data-testid="link-projects-view-all">View all</A>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
        {projects.length === 0 && (
          <li style={{ fontSize: 12.5, color: SUBINK, padding: '10px 0' }}>No projects yet.</li>
        )}
        {projects.map((r, i) => (
          <li key={r.id} data-testid={`project-${r.id}`} style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: SUBINK, width: 14, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <span style={{ width: 40, height: 40, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Music2 style={{ width: 15, height: 15, color: SUBINK }} />
              </span>
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
function SalesChannels({ channels, onNavigate }: { channels: DashboardData['channels']; onNavigate: (p: string) => void }) {
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }} data-testid="dashboard-sales-channels">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Where sales come from.</div>
        <A href="/projects" onNavigate={onNavigate} style={{ fontSize: 12.5, color: LINK, fontWeight: 600 }} data-testid="link-channels-view-all">View all</A>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 13 }}>
        {channels.length === 0 && (
          <li style={{ fontSize: 12.5, color: SUBINK }}>No sales yet — channels appear once your records start selling.</li>
        )}
        {channels.map((r) => {
          const Icon = CHANNEL_ICONS[r.id] ?? Music2;
          return (
            <li key={r.id} data-testid={`channel-${r.id}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 30, height: 30, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon style={{ width: 13, height: 13, color: SUBINK }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(r.salesCents)}</span>
                  </div>
                  {/* Bar + the % number — the number carries the value, not the color. */}
                  <div style={{ marginTop: 6, height: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.share}%`, background: GOLD }} />
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
function GivingCard({ giving, onNavigate }: { giving: DashboardData['giving']; onNavigate: (p: string) => void }) {
  return (
    <div style={{ borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, padding: 20 }} data-testid="dashboard-giving">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Giving.</div>
        <A href="/projects" onNavigate={onNavigate} style={{ fontSize: 12.5, color: LINK, fontWeight: 600 }} data-testid="link-giving-view-impact">View impact</A>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Award style={{ width: 16, height: 16, color: SUBINK }} />
        </span>
        <div style={{ minWidth: 0 }}>
          {giving ? (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45 }}>Supporting {giving.org}</div>
              <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>
                <span style={{ fontWeight: 600, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(giving.raisedCents)}</span> raised from your sales · via GoodDeed®
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: SUBINK, lineHeight: 1.45 }}>Nothing raised yet — giving via GoodDeed® starts with your first sales.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
const RANGE_PARAM: Record<string, string> = { Today: 'today', '7d': '7d', '30d': '30d', '90d': '90d', All: 'all' };
const RANGE_LABEL: Record<string, string> = { Today: 'today', '7d': 'last 7d', '30d': 'last 30d', '90d': 'last 90d', All: 'all time' };
const RANGE_TITLE: Record<string, string> = { Today: 'Today.', '7d': 'The last 7 days.', '30d': 'The last 30 days.', '90d': 'The last 90 days.', All: 'All time.' };

export default function ArtistDashboardMRP() {
  // The strip opens on first visit — a live project is exactly when it has
  // something to say. Collapses to one quiet line.
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(true);
  const [uploaded, setUploaded] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [range, setRange] = useState('30d');
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: portal } = useQuery<PortalData>({ queryKey: [wlParam('/api/press-client/portal')], retry: false });
  const rangeParam = RANGE_PARAM[range] ?? '30d';
  const { data: dash } = useQuery<DashboardData>({
    queryKey: [wlParam(`/api/press-client/dashboard?range=${rangeParam}`)],
    retry: false,
  });

  // The client's live project — the accepted (Converted) estimate wins.
  const project: PortalEstimate | null = useMemo(() => {
    const list = portal?.estimates ?? [];
    return list.find((e) => e.status === 'Converted') ?? list[0] ?? null;
  }, [portal]);
  const clientFull = portal?.client.displayName || portal?.client.email || '';
  const clientFirst = clientFull.split(' ')[0] || 'there';
  const estimateNo = project?.estimateNo ?? '—';
  const jobTitle = project?.title ?? 'Your project';
  const preparerFirst = (project?.preparedBy || project?.pressName || 'the press').split(' ')[0];
  const qtyLabel = project?.quantity ? `${project.quantity.toLocaleString()} units` : null;
  const unitLabel = useMemo(() => {
    if (!project?.totalCents || !project.quantity) return null;
    const unit = (project.totalCents / 100 - SETUP_TOTAL_DOLLARS) / project.quantity;
    return unit > 0 ? `$${unit.toFixed(2)} /unit` : null;
  }, [project]);
  const totalLabel = project?.totalCents ? moneyFmt(project.totalCents / 100) : null;
  const depositLabel = project?.totalCents ? moneyFmt(project.totalCents / 200) : null;
  const steps = useMemo(
    () => buildDashSteps(estimateNo, preparerFirst, qtyLabel, unitLabel, totalLabel, depositLabel),
    [estimateNo, preparerFirst, qtyLabel, unitLabel, totalLabel, depositLabel],
  );
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const upNext = steps.find((s) => s.status === 'next');
  const pressName = project?.pressName ?? 'the press';
  const kpis: DashboardData['kpis'] = dash?.kpis ?? {
    salesRangeCents: 0, salesLifetimeCents: 0, playsRange: 0, listenerCount: 0, buyerCount: 0,
    prior: { salesRangeCents: 0, salesLifetimeCents: 0, playsRange: 0, listenerCount: 0, buyerCount: 0 },
  };

  const doUpload = async (file: File) => {
    if (!project || uploadBusy) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/press-client/estimates/${project.id}/files`, { method: 'POST', credentials: 'include', body: fd });
      if (res.ok) {
        setUploaded(true);
        await queryClient.invalidateQueries({ queryKey: [wlParam(`/api/press-client/dashboard?range=${rangeParam}`)] });
      }
    } finally { setUploadBusy(false); }
  };

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      {/* Poppins — MRP's real face rides with the skin. */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');`}</style>

      {/* ── Top bar — artist brand left; Feedback / bell / avatar right,
          the press's mark quietly beside them (NextStepsMRP pattern). ── */}
      <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 20px 0 12px', background: CANVAS, borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: INK, flexShrink: 0 }}>
            {(clientFull || '?').slice(0, 1).toUpperCase()}
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{clientFull}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, position: 'relative' }}>
          <button type="button" data-testid="button-feedback" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 0, background: 'transparent', border: `1px solid ${HAIRLINE}`, color: SUBINK, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
            <MessageSquarePlus style={{ width: 14, height: 14 }} />
            Feedback
          </button>
          <button type="button" aria-label="Notifications" aria-expanded={bellOpen} onClick={() => { setBellOpen((v) => !v); setMenuOpen(false); }} data-testid="button-notifications" style={{ width: 32, height: 32, borderRadius: 0, background: 'transparent', border: 'none', color: SUBINK, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell style={{ width: 16, height: 16 }} />
          </button>
          <button type="button" aria-label="Account menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen((v) => !v); setBellOpen(false); }} data-testid="button-user-menu" style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${HAIRLINE}`, padding: 0, cursor: 'pointer', background: CARD_RAISED, fontSize: 12.5, fontWeight: 600, color: INK }}>
            {(clientFull || '?').slice(0, 1).toUpperCase()}
          </button>
          {/* The press's mark, quietly top right (Bill, Aug 21 2026). */}
          <img src={mrpLogo} alt="Memphis Record Pressing" data-testid="img-press-mark" style={{ width: 34, height: 34 }} />
          {bellOpen && (
            <div data-testid="panel-notifications" style={{ position: 'absolute', top: 44, right: 40, width: 260, background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 0, boxShadow: '0 12px 32px rgba(0,0,0,0.10)', padding: '14px 16px', zIndex: 40 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Notifications</div>
              {(dash?.activity ?? []).slice(0, 4).map((a) => (
                <div key={a.id} style={{ marginTop: 10, fontSize: 12, color: INK }}>
                  {a.title}
                  <div style={{ fontSize: 11, color: SUBINK }}>{fmtRel(new Date(a.ts))}</div>
                </div>
              ))}
              {(dash?.activity ?? []).length === 0 && <div style={{ marginTop: 10, fontSize: 12, color: SUBINK }}>You're all caught up.</div>}
            </div>
          )}
          {menuOpen && (
            <div data-testid="panel-user-menu" style={{ position: 'absolute', top: 44, right: 0, width: 220, background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 0, boxShadow: '0 12px 32px rgba(0,0,0,0.10)', padding: '6px 0', zIndex: 40 }}>
              <div style={{ padding: '8px 14px', fontSize: 12, color: SUBINK, borderBottom: `1px solid ${HAIRLINE}` }}>
                Signed in as <span style={{ fontWeight: 600, color: INK }}>{portal?.client.email ?? ''}</span>
              </div>
              {project?.shareToken && (
                <button type="button" data-testid="menu-view-estimate" onClick={() => navigate(`/e/${project.shareToken}`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                  View estimate
                </button>
              )}
              <button
                type="button"
                data-testid="menu-sign-out"
                onClick={async () => {
                  setAuthToken(null);
                  await fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
                  await queryClient.invalidateQueries();
                  navigate('/next-steps');
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav, POWERED BY GoodTunes at the bottom ── */}
        <nav style={{ width: 218, flexShrink: 0, background: RAIL_BG, borderRight: `1px solid ${HAIRLINE}`, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 0, height: 'calc(100dvh - 56px)', overflowY: 'auto' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: SUBINK }} />
            <input
              placeholder="Search…"
              data-testid="input-rail-search"
              style={{ width: '100%', height: 32, borderRadius: 0, padding: '0 44px 0 30px', fontSize: 12.5, background: CARD, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none', fontFamily: FONT }}
            />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 600, color: SUBINK, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '1px 5px' }}>
              ⌘K
            </span>
          </div>
          {ARTIST_NAV.map((item) => <NavRow key={item.label} {...item} />)}
          <div style={{ flex: 1 }} />
          {/* Platform attribution — GoodTunes recedes to a "powered by" mark. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 12px 4px', borderTop: `1px solid ${HAIRLINE}`, marginTop: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: SUBINK }}>POWERED BY</span>
            {/* Dark logo needs no invert on light. */}
            <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 16, width: 'auto', opacity: 0.9 }} />
          </div>
        </nav>

        {/* ── Main ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 28px 60px' }}>

            {/* Greeting row + range pills + quiet outline action */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, margin: 0 }} data-testid="heading-artist-dashboard">
                  {timeGreeting()}, {clientFirst}
                </h1>
                <p style={{ fontSize: 13, color: SUBINK, margin: '6px 0 0' }}>
                  {project ? `One project is moving — ${upNext ? `up next: ${upNext.title.toLowerCase()}.` : 'nothing needs you right now.'}` : 'Nothing needs you right now.'}
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
                        padding: '5px 13px', borderRadius: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                        background: range === r ? CARD_RAISED : 'transparent',
                        border: range === r ? `1px solid ${HAIRLINE}` : '1px solid transparent',
                        color: range === r ? INK : SUBINK,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {/* Quiet outline — the page's one gold fill belongs to the up-next step. */}
                <button type="button" data-testid="button-header-view-payouts" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(0,0,0,0.22)', color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                  <Banknote style={{ width: 14, height: 14 }} />
                  View payouts
                </button>
              </div>
            </div>

            {/* ── THE strip — "You're all caught up" becomes Next steps when a
                project is live. Collapsible; word + icon carries the state.
                Treatment reused from ArtistDashboardNextStepsMRP. ── */}
            <section style={{ marginTop: 22, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }} data-testid="next-steps-strip">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                data-testid="button-next-steps-toggle"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: 'transparent', border: 'none', cursor: 'pointer', color: INK, textAlign: 'left', fontFamily: FONT }}
              >
                <span aria-hidden style={{ width: 30, height: 30, borderRadius: 0, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Disc3 style={{ width: 15, height: 15, color: SUBINK }} />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Next steps — {jobTitle}.</span>
                <span style={{ fontSize: 12.5, color: SUBINK }}>
                  {doneCount} of {steps.length} done{upNext ? ` · Up next: ${upNext.title}` : ''} · Estimate {estimateNo}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: SUBINK }}>{open ? 'Collapse' : 'Expand'}</span>
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}>
                  <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke={SUBINK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && (
                <div style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  {steps.map((s, i) => (
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
                              {/* The page's ONE filled gold — earned by the live project.
                                  Dark ink on gold, never white. */}
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
                                style={{ padding: '9px 20px', borderRadius: 0, border: 'none', cursor: 'pointer', background: GOLD, color: INK, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, opacity: uploadBusy ? 0.6 : 1 }}
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

            {/* ── KPI strip ── */}
            <div style={{ marginTop: 20 }}>
              <KpiStrip kpis={kpis} rangeLabel={RANGE_LABEL[range] ?? 'last 30d'} />
            </div>

            {/* ── Trend + activity ── */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 14, alignItems: 'stretch' }}>
              <TrendChart series={dash?.series ?? []} rangeTitle={RANGE_TITLE[range] ?? 'The last 30 days.'} />
              <div style={{ maxHeight: 420, minHeight: 0 }}>
                <ActivityFeed activity={dash?.activity ?? []} onNavigate={navigate} />
              </div>
            </div>

            {/* ── Bottom row — top projects + channels + giving ── */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 14, alignItems: 'stretch' }}>
              <TopProjects projects={dash?.topProjects ?? []} onNavigate={navigate} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SalesChannels channels={dash?.channels ?? []} onNavigate={navigate} />
                <GivingCard giving={dash?.giving ?? null} onNavigate={navigate} />
              </div>
            </div>

            {/* Quiet provenance line — the run's home. */}
            {project && (
              <p style={{ marginTop: 26, fontSize: 11.5, color: SUBINK }}>
                {jobTitle} is running with {pressName} · {typeof window !== 'undefined' ? window.location.host : ''}
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
