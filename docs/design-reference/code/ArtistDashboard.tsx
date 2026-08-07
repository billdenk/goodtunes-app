// ArtistDashboard — the action-first command surface for a GoodTunes ARTIST
// (an independent recording artist running their catalog on GoodTunes).
//
// This is the persona sibling of PressDashboard: it deliberately reuses the
// EXACT same design language — light admin slate surface, Inter, brand blue
// #319ED8 for the one filled primary, the same shell (full-width top bar +
// left rail + "POWERED BY" GoodTunes footer) and the same hierarchy
// (greeting + "N items need you" → collapsed "Needs your attention" work
// queue → calm divided KPI strip → Trend once + a quieter Recent activity
// rail) — but every surface is scoped to the ARTIST persona (Niina Soleil):
//
//   • Shell is the artist persona: Niina's round profile photo + her name on
//     one line (never truncates), an artist rail drawn from the live artist
//     portal (Dashboard / People / Projects / Overview / Audience /
//     Acquisition / Orders / Buyers / Referrals / Reports). NOTE: the live app
//     calls it "Albums" but our canon renames it "Projects".
//   • KPIs use the real artist vocabulary: Sales · last 30d, Sales · lifetime,
//     Plays · last 30d, Listeners, Buyers.
//   • The work queue is invented from the artist domain: a test pressing
//     awaiting approval, a payout ready to collect, a new offer to review.
//   • Recent activity is the aggregate BUSINESS story for an artist — release
//     milestones, payouts, approvals, referrals, certificate batches — never
//     a raw fan feed.
//
// All app plumbing is stubbed the same way as PressDashboard (react-query →
// static mock data, wouter Link → plain <a>). No existing file is modified.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  ArrowUpRight,
  ArrowRight,
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
  FileCheck,
  HeartHandshake,
  TrendingUp,
  Receipt,
  Award,
  ChevronDown,
  CheckCircle2,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  Music2,
  Headphones,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand.webp';
import endofoundLogo from '../assets/endofound-logo.jpg';

// ─── Brand tokens ────────────────────────────────────────────────────
// Time-of-day greeting — "Welcome" is first-visit only; after that the
// dashboard greets by the clock.
const timeGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const BLUE = '#319ED8';
// Apple typographic palette — a small set of grays so the one blue accent
// carries all the weight.
const INK = '#1d1d1f'; // near-black headline ink
const SUBINK = '#6e6e73'; // calm secondary gray
const HAIRLINE = '#e6e6ea'; // whisper-quiet card border
const CANVAS = '#f5f5f7'; // near-white page canvas
const RAIL = '#f5f5f7'; // left-rail surface
const PILL_TRACK = '#f0f0f2'; // segmented control track
const PILL_SHADOW =
  '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)'; // raised active pill

// ─── cn ──────────────────────────────────────────────────────────────
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── money / number formatting ───────────────────────────────────────
function formatUsdCents(
  cents: number,
  opts?: { maximumFractionDigits?: number },
): string {
  const max = opts?.maximumFractionDigits ?? 2;
  const min = max === 0 ? 0 : 2;
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })}`;
}

const DASH = '—';

function fmtUsd(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return DASH;
  if (Math.abs(cents) >= 100_000_00) {
    return `$${(cents / 100_000).toFixed(1)}k`;
  }
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

// Stubbed wouter Link — plain anchor that never navigates.
function Link({
  href: _href,
  children,
  className,
  style,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'data-testid'?: string;
}) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={className}
      style={style}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </a>
  );
}

// ─── Data shapes (artist-scoped) ─────────────────────────────────────

interface ArtistKpisData {
  sales30dCents: number;
  salesLifetimeCents: number;
  plays30d: number;
  listenerCount: number;
  buyerCount: number;
  series: Array<{
    date: string;
    salesCents: number;
    plays: number;
    listeners: number;
  }>;
  prior: {
    sales30dCents: number;
    salesLifetimeCents: number;
    plays30d: number;
    listenerCount: number;
    buyerCount: number;
  };
}

// Recent activity is the aggregate BUSINESS story for an artist — not a raw
// fan feed. Every row is a business-shaping event: a release/sales milestone,
// a payout, an approval, a referral, or a fulfillment/certificate event.
// Never a single fan purchase.
type ArtistActivityKind =
  | 'milestone'
  | 'invoice'
  | 'stage'
  | 'roster'
  | 'certificate';

interface ArtistActivityRow {
  id: string;
  kind: ArtistActivityKind;
  ts: string;
  title: string;
  detail: string;
  href: string;
}

// ─── Mock data (indie-artist-scaled) ─────────────────────────────────

function buildSeries(): ArtistKpisData['series'] {
  const now = Date.now();
  const out: ArtistKpisData['series'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.3 : 1;
    const drift = 1 + (29 - i) * 0.01;
    const drop = i <= 14 && i >= 11 ? 1.7 : 1; // a release-week bump
    const wobble = 0.85 + (Math.sin(i * 1.7) + Math.cos(i * 0.6)) * 0.12;
    const base = weekend * drift * drop * wobble;
    const plays = Math.max(20, Math.round(180 * base));
    const salesCents = Math.round((plays / 20) * (2400 + Math.sin(i) * 400));
    const listeners = Math.max(10, Math.round(plays * 0.55 * (0.9 + wobble * 0.2)));
    out.push({ date: d.toISOString().slice(0, 10), salesCents, plays, listeners });
  }
  return out;
}

function buildPriorSeries(): ArtistKpisData['series'] {
  return buildSeries().map((s) => ({
    date: s.date,
    salesCents: Math.round(s.salesCents * 0.87),
    plays: Math.round(s.plays * 0.83),
    listeners: Math.round(s.listeners * 0.85),
  }));
}

const CURRENT_SERIES = buildSeries();
const PRIOR_SERIES = buildPriorSeries();

function sumKey<K extends keyof ArtistKpisData['series'][number]>(
  series: ArtistKpisData['series'],
  key: K,
): number {
  return series.reduce((acc, s) => acc + (s[key] as number), 0);
}

const SALES_30D = sumKey(CURRENT_SERIES, 'salesCents');
const PRIOR_SALES_30D = sumKey(PRIOR_SERIES, 'salesCents');

const MOCK_KPIS: ArtistKpisData = {
  sales30dCents: SALES_30D,
  salesLifetimeCents: 3_184_500,
  plays30d: sumKey(CURRENT_SERIES, 'plays'),
  listenerCount: 4_820,
  buyerCount: 738,
  series: CURRENT_SERIES,
  prior: {
    sales30dCents: PRIOR_SALES_30D,
    salesLifetimeCents: 2_910_000,
    plays30d: sumKey(PRIOR_SERIES, 'plays'),
    listenerCount: 4_390,
    buyerCount: 691,
  },
};

const MOCK_PRIOR_KPIS: ArtistKpisData = {
  ...MOCK_KPIS,
  series: PRIOR_SERIES,
};

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const MOCK_ACTIVITY: ArtistActivityRow[] = [
  {
    id: 'a1', kind: 'milestone', ts: ago(18),
    title: 'CALIFORNIALAND passed 500 units',
    detail: 'Your best-selling project · $6.4k lifetime',
    href: '/artist/reports',
  },
  {
    id: 'a2', kind: 'invoice', ts: ago(64),
    title: 'Payout cleared · $1,240.00',
    detail: 'Last cycle · net of platform fees',
    href: '/artist/overview?tab=payouts',
  },
  {
    id: 'a3', kind: 'stage', ts: ago(120),
    title: 'Test pressing approved — CALIFORNIALAND repress',
    detail: 'Run of 300 cleared for production',
    href: '/artist/projects',
  },
  {
    id: 'a4', kind: 'roster', ts: ago(240),
    title: 'New referral joined',
    detail: 'Delta Rae accepted your invite · 1 project homed',
    href: '/artist/referrals',
  },
  {
    id: 'a5', kind: 'certificate', ts: ago(410),
    title: 'GoodDeed® certificate batch shipped',
    detail: '42 certificates · Motel Lights preorder',
    href: '/artist/orders',
  },
  {
    id: 'a6', kind: 'milestone', ts: ago(720),
    title: 'Motel Lights passed 10k plays',
    detail: '2,100 unique listeners this month',
    href: '/artist/audience',
  },
  {
    id: 'a7', kind: 'stage', ts: ago(1150),
    title: 'Sun Damage → in production',
    detail: 'Run of 200 started · vinyl',
    href: '/artist/projects',
  },
  {
    id: 'a8', kind: 'invoice', ts: ago(1980),
    title: 'Payout cleared · $980.00',
    detail: 'Prior cycle · net of platform fees',
    href: '/artist/overview?tab=payouts',
  },
  {
    id: 'a9', kind: 'roster', ts: ago(2640),
    title: 'New referral joined',
    detail: 'The Hollow Coves accepted your invite',
    href: '/artist/referrals',
  },
];

// ─── Range switcher ──────────────────────────────────────────────────

type RangeKey = 'today' | '7d' | '30d' | '90d' | 'all';

function RangeSwitcher({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
}) {
  const opts: Array<{ v: RangeKey; label: string }> = [
    { v: 'today', label: 'Today' },
    { v: '7d', label: '7d' },
    { v: '30d', label: '30d' },
    { v: '90d', label: '90d' },
    { v: 'all', label: 'All' },
  ];
  return (
    <div
      className="inline-flex items-center p-1 rounded-full"
      style={{ backgroundColor: PILL_TRACK, gap: 2 }}
      data-testid="dashboard-range-switcher"
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={active}
            data-testid={`button-range-${o.v}`}
            className="px-3.5 h-8 text-[13px] rounded-full transition-all"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? INK : SUBINK,
              backgroundColor: active ? '#ffffff' : undefined,
              boxShadow: active ? PILL_SHADOW : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Severity token map ──────────────────────────────────────────────

type Severity = 'critical' | 'warning' | 'ready';

const SEVERITY: Record<
  Severity,
  { accent: string; wash: string; label: string }
> = {
  critical: { accent: '#e0245e', wash: '#fdeef2', label: 'Needs action' },
  warning: { accent: '#c98a00', wash: '#fdf6e8', label: 'To review' },
  ready: { accent: '#1c8a5b', wash: '#eaf7f0', label: 'Ready to run' },
};

// ─── Work queue (the hero, artist-scoped) ────────────────────────────

type QueueItem = {
  id: string;
  severity: Severity;
  icon: typeof FileCheck;
  title: string;
  detail: string;
  metric: string;
  action: string;
  primary?: boolean;
  href: string;
};

const ARTIST_QUEUE: QueueItem[] = [
  {
    id: 'test-pressing',
    severity: 'critical',
    icon: FileCheck,
    title: 'Test pressing awaiting your approval',
    detail: 'CALIFORNIALAND repress · in your queue for 3 days. Production is blocked until you sign off.',
    metric: '1 · blocking',
    action: 'Review test pressing',
    primary: true,
    href: '/artist/projects?stage=test_pressing',
  },
  {
    id: 'new-offer',
    severity: 'warning',
    icon: HeartHandshake,
    title: 'New pressing offer awaiting your review',
    detail: 'A plant has quoted your Sun Damage vinyl run. Review terms to move it into production.',
    metric: '1 offer',
    action: 'Review offer',
    href: '/artist/projects?stage=offers',
  },
  {
    id: 'payout-ready',
    severity: 'ready',
    icon: Banknote,
    title: `${fmtUsd(124000)} payout ready to collect`,
    detail: 'Cleared sales from the last cycle, minus platform fees. Your Stripe account is connected.',
    metric: fmtUsd(124000),
    action: 'View payouts',
    primary: true,
    href: '/artist/overview?tab=payouts',
  },
];

function WorkQueueRow({ item }: { item: QueueItem }) {
  const sev = SEVERITY[item.severity];
  const Icon = item.icon;
  return (
    <div
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
      data-testid={`queue-row-${item.id}`}
    >
      <span
        className="w-10 h-10 rounded-full inline-flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: sev.wash }}
      >
        <Icon className="w-[18px] h-[18px]" style={{ color: sev.accent }} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: sev.accent }}
          />
          <span className="text-[14px] font-semibold truncate" style={{ color: INK, letterSpacing: '-0.01em' }}>
            {item.title}
          </span>
        </div>
        <p className="text-[12.5px] mt-0.5 truncate" style={{ color: SUBINK }}>{item.detail}</p>
      </div>

      <span
        className="hidden md:inline-flex items-center gap-1.5 text-[12px] font-semibold flex-shrink-0"
        style={{ color: sev.accent }}
      >
        {sev.label}
      </span>

      {item.primary ? (
        <button
          type="button"
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-[14px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: BLUE }}
          data-testid={`queue-action-${item.id}`}
        >
          {item.action}
          <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-[14px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
          data-testid={`queue-action-${item.id}`}
        >
          {item.action}
        </button>
      )}
    </div>
  );
}

function WorkQueue({ items }: { items: QueueItem[] }) {
  const criticalCount = items.filter((i) => i.severity === 'critical').length;
  // Default COLLAPSED — the header is the always-visible summary/toggle, so
  // problems don't sit front-and-center until the artist opens the queue.
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <section
        className="rounded-2xl bg-white p-12 flex flex-col items-center text-center"
        style={{ border: `1px solid ${HAIRLINE}` }}
        data-testid="work-queue-empty"
      >
        <span
          className="w-14 h-14 rounded-full inline-flex items-center justify-center"
          style={{ backgroundColor: '#eaf7f0' }}
        >
          <CheckCircle2 className="w-7 h-7" style={{ color: '#1c8a5b' }} />
        </span>
        <h3 className="mt-4 text-[22px] font-semibold" style={{ color: INK }}>
          You're all caught up.
        </h3>
        <p className="mt-2 text-[15px] max-w-md leading-relaxed" style={{ color: SUBINK }}>
          No approvals due, offers to review, or payouts to collect. New work
          will appear here the moment it needs you.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl bg-white overflow-hidden"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="work-queue"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="work-queue-rows"
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 focus:outline-none"
        style={{ borderBottom: expanded ? `1px solid ${HAIRLINE}` : undefined }}
        data-testid="work-queue-toggle"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[13px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
            Needs your attention
          </span>
          {criticalCount > 0 && (
            <span
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: '#e0245e' }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#e0245e' }} />
              {criticalCount} critical
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[12.5px] tabular-nums" style={{ color: SUBINK }}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200"
            style={{ color: '#a1a1a6', transform: expanded ? 'none' : 'rotate(-90deg)' }}
          />
        </div>
      </button>

      <div
        id="work-queue-rows"
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div style={{ borderTop: 'none' }}>
            {items.map((item, i) => (
              <div key={item.id} style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}>
                <WorkQueueRow item={item} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Compact KPI strip ───────────────────────────────────────────────

type KpiTile = {
  id: string;
  label: string;
  value: string;
  cur: number;
  prior: number;
  href: string;
};

function deltaPct(cur: number, prior: number): { text: string; positive: boolean } {
  if (prior === 0) return { text: cur > 0 ? '+∞' : '—', positive: cur >= 0 };
  const pct = ((cur - prior) / prior) * 100;
  const positive = pct >= 0;
  return { text: `${positive ? '+' : ''}${pct.toFixed(1)}%`, positive };
}

function fmtKpiNum(value: number): string {
  return value >= 10_000
    ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`
    : value.toLocaleString();
}
function fmtKpiUsd(cents: number): string {
  return cents >= 1_000_000
    ? formatUsdCents(cents, { maximumFractionDigits: 0 })
    : formatUsdCents(cents);
}

function KpiStrip({ kpis }: { kpis: ArtistKpisData }) {
  const p = kpis.prior;
  const tiles: KpiTile[] = [
    { id: 'sales30d', label: 'Sales · last 30d', value: fmtKpiUsd(kpis.sales30dCents), cur: kpis.sales30dCents, prior: p.sales30dCents, href: '/artist/reports' },
    { id: 'salesLifetime', label: 'Sales · lifetime', value: fmtKpiUsd(kpis.salesLifetimeCents), cur: kpis.salesLifetimeCents, prior: p.salesLifetimeCents, href: '/artist/reports' },
    { id: 'plays30d', label: 'Plays · last 30d', value: fmtKpiNum(kpis.plays30d), cur: kpis.plays30d, prior: p.plays30d, href: '/artist/overview' },
    { id: 'listeners', label: 'Listeners', value: fmtKpiNum(kpis.listenerCount), cur: kpis.listenerCount, prior: p.listenerCount, href: '/artist/audience' },
    { id: 'buyers', label: 'Buyers', value: fmtKpiNum(kpis.buyerCount), cur: kpis.buyerCount, prior: p.buyerCount, href: '/artist/buyers' },
  ];

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      data-testid="kpi-strip"
    >
      {tiles.map((t) => {
        const d = deltaPct(t.cur, t.prior);
        return (
          <Link
            key={t.id}
            href={t.href}
            data-testid={`kpi-${t.id}`}
            className="group rounded-2xl bg-white p-5 flex flex-col transition-shadow hover:shadow-sm"
            style={{ border: `1px solid ${HAIRLINE}` }}
          >
            <div className="flex items-center gap-1 text-[13px] font-medium" style={{ color: SUBINK }}>
              <span className="truncate">{t.label}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div
              className="mt-3 tabular-nums"
              style={{ fontSize: 32, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.03em', color: INK }}
            >
              {t.value}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[13px]">
              <span
                className="font-semibold tabular-nums"
                style={{ color: d.positive ? '#1c8a5b' : '#e0245e' }}
              >
                {d.text}
              </span>
              <span style={{ color: SUBINK }}>vs prior</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Trend chart (earns its size once) ───────────────────────────────

type ChartMetric = 'sales' | 'plays' | 'listeners';

function TrendChart({ kpis, prior }: { kpis: ArtistKpisData; prior: ArtistKpisData }) {
  const [metric, setMetric] = useState<ChartMetric>('sales');
  const series = kpis.series ?? [];
  const priorSeries = prior.series ?? [];

  const merged = useMemo(() => {
    return series.map((s, i) => {
      const pt = priorSeries[i];
      const key =
        metric === 'sales' ? 'salesCents' : metric === 'plays' ? 'plays' : 'listeners';
      const currentVal = (s as Record<string, number | string>)[key];
      const priorVal = pt ? (pt as Record<string, number | string>)[key] : undefined;
      return {
        date: s.date ?? '',
        current: typeof currentVal === 'number' ? currentVal : 0,
        prior: typeof priorVal === 'number' ? priorVal : null,
      };
    });
  }, [series, priorSeries, metric]);

  const isCurrency = metric === 'sales';
  const opts: Array<{ v: ChartMetric; label: string }> = [
    { v: 'sales', label: 'Sales' },
    { v: 'plays', label: 'Plays' },
    { v: 'listeners', label: 'Listeners' },
  ];

  return (
    <div
      className="rounded-2xl bg-white p-6 h-full flex flex-col"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-trend-chart"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-[20px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
            <span style={{ color: INK }}>The last 30 days. </span>
            <span style={{ color: SUBINK, fontWeight: 500 }}>This period vs prior.</span>
          </h3>
        </div>
        <div className="inline-flex items-center p-1 rounded-full" style={{ backgroundColor: PILL_TRACK, gap: 2 }}>
          {opts.map((o) => {
            const active = metric === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setMetric(o.v)}
                aria-pressed={active}
                data-testid={`button-chart-metric-${o.v}`}
                className="px-3 h-7 text-[12.5px] rounded-full transition-all"
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? INK : SUBINK,
                  backgroundColor: active ? '#ffffff' : undefined,
                  boxShadow: active ? PILL_SHADOW : undefined,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-[260px] flex flex-col">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eeeef0" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#c7c7cc" fontSize={11} />
            <YAxis
              stroke="#c7c7cc"
              fontSize={11}
              tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)}
            />
            <Tooltip
              formatter={(v: number) => (isCurrency ? fmtUsd(v) : fmtNum(v))}
              labelStyle={{ color: INK }}
            />
            <Line
              type="monotone" dataKey="prior" stroke="#c7c7cc" strokeWidth={1.5}
              strokeDasharray="4 3" dot={false} name="Prior period" connectNulls
            />
            <Line
              type="monotone" dataKey="current" stroke={BLUE} strokeWidth={2}
              dot={false} name="This period"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Recent activity (recedes) ───────────────────────────────────────

function ActivityIcon({ kind }: { kind: ArtistActivityKind }) {
  const map = {
    milestone: { Icon: TrendingUp },
    invoice: { Icon: Receipt },
    stage: { Icon: Disc3 },
    roster: { Icon: UserPlus },
    certificate: { Icon: Award },
  }[kind];
  const Icon = map.Icon;
  return (
    <span
      className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#f2f2f5' }}
    >
      <Icon className="w-4 h-4" style={{ color: SUBINK }} />
    </span>
  );
}

function ActivityFeed({ activity }: { activity: ArtistActivityRow[] }) {
  const items = useMemo(() => {
    return [...activity]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 12);
  }, [activity]);

  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-activity-feed"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[20px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
          As it happens.
        </h3>
        <Link
          href="/artist/overview"
          className="text-[13px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
        >
          View all
        </Link>
      </div>
      <ul className="space-y-0.5 flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {items.map((it, i) => (
          <li key={i} data-testid={`activity-${it.kind}-${i}`}>
            <Link
              href={it.href}
              className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <ActivityIcon kind={it.kind} />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate" style={{ color: INK }}>{it.title}</div>
                <div className="text-[12px] truncate" style={{ color: SUBINK }}>{it.detail}</div>
              </div>
              <div className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: '#a1a1a6' }}>
                {fmtRel(new Date(it.ts))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Bottom row: Top projects + Where sales come from ────────────────

type ProjectRow = {
  id: string;
  title: string;
  format: string;
  units: number;
  salesCents: number;
  cover?: string;
};

const TOP_PROJECTS: ProjectRow[] = [
  { id: 'californialand', title: 'CALIFORNIALAND', format: 'Vinyl LP · repress', units: 512, salesCents: 640_000, cover: californialandCover },
  { id: 'motel-lights', title: 'Motel Lights', format: 'Vinyl LP', units: 284, salesCents: 356_000 },
  { id: 'sun-damage', title: 'Sun Damage', format: 'Vinyl LP · in production', units: 176, salesCents: 214_000 },
  { id: 'paper-tigers', title: 'Paper Tigers', format: 'Cassette', units: 98, salesCents: 78_000 },
];

function TopProjects({ rows }: { rows: ProjectRow[] }) {
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-top-projects"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[20px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
          Top projects.
        </h3>
        <Link
          href="/artist/projects"
          className="text-[13px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
        >
          View all
        </Link>
      </div>
      <ul className="flex-1">
        {rows.map((r, i) => (
          <li key={r.id} data-testid={`project-${r.id}`} style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}>
            <Link
              href="/artist/projects"
              className="flex items-center gap-3 -mx-2 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <span className="text-[12px] font-semibold tabular-nums w-4 flex-shrink-0 text-center" style={{ color: '#a1a1a6' }}>
                {i + 1}
              </span>
              {r.cover ? (
                <span className="h-10 w-10 rounded-xl overflow-hidden flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }}>
                  <img src={r.cover} alt={r.title} className="h-full w-full object-cover" />
                </span>
              ) : (
                <span className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f2f2f5' }}>
                  <Music2 className="w-4 h-4" style={{ color: SUBINK }} />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate" style={{ color: INK }}>{r.title}</div>
                <div className="text-[12px] truncate" style={{ color: SUBINK }}>{r.format}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: INK }}>
                  {fmtUsd(r.salesCents)}
                </div>
                <div className="text-[11px] tabular-nums" style={{ color: SUBINK }}>
                  {fmtNum(r.units)} units
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ChannelRow = { id: string; label: string; icon: typeof Headphones; salesCents: number; share: number };

const SALES_CHANNELS: ChannelRow[] = [
  { id: 'store', label: 'GoodTunes store', icon: ShoppingBag, salesCents: 356_000, share: 40 },
  { id: 'streaming', label: 'Streaming referrals', icon: Headphones, salesCents: 214_000, share: 24 },
  { id: 'social', label: 'Social & campaigns', icon: Megaphone, salesCents: 124_000, share: 14 },
  { id: 'shopify', label: 'Shopify store', icon: Store, salesCents: 118_000, share: 13 },
  { id: 'shows', label: 'Live shows', icon: Music2, salesCents: 80_000, share: 9 },
];

function SalesChannels({ rows }: { rows: ChannelRow[] }) {
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-sales-channels"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[17px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
          Where sales come from.
        </h3>
        <Link
          href="/artist/acquisition"
          className="text-[13px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
        >
          View all
        </Link>
      </div>
      <ul className="flex-1 flex flex-col justify-center gap-3.5">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.id} data-testid={`channel-${r.id}`}>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f2f2f5' }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: SUBINK }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium truncate" style={{ color: INK }}>{r.label}</span>
                    <span className="text-[12.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: INK }}>
                      {fmtUsd(r.salesCents)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#f0f0f2' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${r.share}%`, backgroundColor: BLUE }}
                    />
                  </div>
                </div>
                <span className="text-[11px] tabular-nums w-8 text-right flex-shrink-0" style={{ color: SUBINK }}>
                  {r.share}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Giving (EndoFound) ──────────────────────────────────────────────
// Compact cause card in our calm slate language. The EndoFound purple is
// used ONLY as a tiny accent: a thin left border + the raised stat number.
// No purple backgrounds.

function GivingCard() {
  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-giving"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[17px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
          Giving.
        </h3>
        <Link
          href="/artist/giving"
          className="text-[13px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
        >
          View impact
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0 bg-white inline-flex items-center justify-center" style={{ border: `1px solid ${HAIRLINE}` }}>
          <img
            src={endofoundLogo}
            alt="Endometriosis Foundation of America"
            className="h-full w-full object-contain"
            style={{ padding: '3px' }}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-snug" style={{ color: INK }}>
            Supporting Endometriosis Foundation of America
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: SUBINK }}>
            <span className="font-semibold tabular-nums" style={{ color: INK }}>
              {fmtUsd(48600)}
            </span>{' '}
            raised from your sales · via GoodDeed®
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Artist persona shell (rail + POWERED BY footer) ─────────────────

type ArtistNavItem = { label: string; icon: typeof LayoutDashboard; count?: number; active?: boolean };

// Mirrors the live artist portal's rail, in order. NOTE: the live app calls
// the projects tab "Albums" — our canon renames it "Projects".
const ARTIST_NAV: ArtistNavItem[] = [
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

function NavRow({ label, icon: Icon, count, active }: ArtistNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors',
        active ? 'hover:bg-white' : 'hover:bg-slate-200',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? '#ffffff' : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? BLUE : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[11px] tabular-nums" style={{ color: '#a1a1a6' }}>{count}</span>
      )}
    </a>
  );
}

const ARTIST_NAME = 'Niina Soleil';
const USER_FIRST_NAME = 'Niina';
const USER_EMAIL = 'niina@niinasoleil.com';
const USER_INITIALS = 'NS'; // photo fallback only

// Signed-in user menu — mirrors the live portal's avatar dropdown.
const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden focus:outline-none transition-shadow"
          style={{ border: `1px solid ${HAIRLINE}` }}
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img
            src={niinaPhoto}
            alt={USER_INITIALS}
            className="w-full h-full object-cover"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0"
        data-testid="menu-user"
      >
        <div className="px-3 py-3 border-b border-slate-200">
          <div className="text-[13.5px] font-semibold text-slate-900">{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] text-slate-500 truncate">{USER_EMAIL}</div>
        </div>
        <div className="py-1">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
                data-testid={`menu-item-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1 border-t border-slate-200">
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
            data-testid="menu-item-sign-out"
          >
            <LogOut className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ArtistShell({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // True when the bottom sentinel is visible — i.e. the user has scrolled to
  // the very bottom, so the fade should hide.
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setAtBottom(entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      {/* Full-width top bar — spans the whole viewport, above both columns.
          Left: the artist's own brand (round profile photo + name on one
          line, never truncates). Right: Feedback, notifications, and the
          signed-in user's avatar. */}
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 bg-white pl-3 pr-6"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={niinaPhoto}
            alt={ARTIST_NAME}
            className="h-9 w-9 rounded-full object-cover flex-shrink-0"
            style={{ border: `1px solid ${HAIRLINE}` }}
          />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {ARTIST_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            style={{ color: SUBINK, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: '#a1a1a6' }} />
              <input
                className="w-full h-9 pl-8 pr-2 rounded-full bg-white text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {ARTIST_NAV.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
          </nav>
          {/* Platform attribution — GoodTunes recedes to a "powered by" mark.
              (The user block moved to the top-bar avatar menu, matching live.) */}
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: '#a1a1a6' }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" />
          </div>
        </aside>

        <main className="relative flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
            <div className="mx-auto w-full max-w-[1440px] px-6 sm:px-8 pt-6 pb-12">
              {children}
            </div>
            {/* Sentinel — when it enters the viewport the user has reached the
                very bottom, so the fade hides. */}
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          </div>
          {/* Bottom scroll-fade — pointer-events-none gradient pinned to the
              bottom of the scroll viewport. Hidden once the bottom is reached. */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-16 transition-opacity duration-200',
              atBottom ? 'opacity-0' : 'opacity-100',
            )}
            style={{ backgroundImage: `linear-gradient(to top, ${CANVAS}, transparent)` }}
          />
        </main>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export function ArtistDashboard() {
  const [range, setRange] = useState<RangeKey>('30d');

  const kpis = MOCK_KPIS;
  const priorKpis = MOCK_PRIOR_KPIS;
  const queue = ARTIST_QUEUE;
  const activity = MOCK_ACTIVITY;

  const openItems = queue.length;

  return (
    <ArtistShell>
      <div className="flex flex-col gap-5">
        {/* Header — greeting + "N items need you" + the one primary action */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1
              className="text-[30px] font-semibold"
              style={{ color: INK, letterSpacing: '-0.02em', lineHeight: 1.12 }}
              data-testid="heading-artist-dashboard"
            >
              {timeGreeting()}, Niina
            </h1>
            <p className="text-[14px] mt-1" style={{ color: SUBINK }}>
              {openItems > 0 ? (
                <>
                  <span className="font-semibold" style={{ color: INK }}>{openItems} item{openItems === 1 ? '' : 's'}</span>{' '}
                  need you before anything else.
                </>
              ) : (
                'Nothing needs you right now — your catalog is running clean.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <RangeSwitcher value={range} onChange={setRange} />
            <button
              type="button"
              className="inline-flex items-center gap-2 text-[14px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BLUE }}
              data-testid="button-header-view-payouts"
            >
              <Banknote className="w-4 h-4" />
              View payouts
            </button>
          </div>
        </div>

        {/* HERO: the work queue */}
        <WorkQueue items={queue} />

        {/* Calm, compact KPI strip */}
        <KpiStrip kpis={kpis} />

        {/* Trend earns its size once; activity recedes into a narrow rail */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <div className="lg:col-span-2 min-h-0">
            <TrendChart kpis={kpis} prior={priorKpis} />
          </div>
          <div className="min-h-0 max-h-[420px]">
            <ActivityFeed activity={activity} />
          </div>
        </div>

        {/* Bottom row — top projects ranked list + where sales come from */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <div className="lg:col-span-2 min-h-0">
            <TopProjects rows={TOP_PROJECTS} />
          </div>
          <div className="min-h-0 flex flex-col gap-5">
            <SalesChannels rows={SALES_CHANNELS} />
            <GivingCard />
          </div>
        </div>
      </div>
    </ArtistShell>
  );
}

export default ArtistDashboard;
