// PressDashboard — the action-first command surface for a GoodTunes PRESS
// partner (a vinyl/CD pressing plant running their shop on GoodTunes).
//
// This is the persona layer one level down from AdminDashboardRedesign:
// it deliberately reuses the SAME design language — light admin slate
// surface, Inter, brand blue #319ED8 for the one filled primary, the same
// hierarchy (greeting + "N items need you" → "Needs your attention" work
// queue → calm divided KPI strip → Trend once + a quieter Recent activity
// rail) — but every surface is scoped to THEIR shop:
//
//   • Shell is the PRESS persona, not the admin rail: logo + "PRESS" tag,
//     a flat nav (Dashboard / Projects / People / Pipeline / Settings)
//     drawn from the real PressPortal tabs, and a press-company user block
//     ("Riverside Pressing / Press · Sign out").
//   • KPIs use the real press vocabulary: Sales · last 30d, Sales · lifetime,
//     Units · last 30d, Customers, Projects in pipeline ("Projects", never
//     "Albums" — renamed vocab).
//   • The work queue is invented from the press domain: new project offers
//     to accept, a test pressing awaiting approval, orders to ship, a
//     payout ready to collect.
//
// All app plumbing is stubbed the same way as AdminDashboardRedesign
// (react-query → static mock data, wouter Link → plain <a>). No existing
// file is modified. Logo import pattern copied from the redesign.

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
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
  ArrowRight,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Library,
  Gift,
  Settings as Cog,
  Bell,
  Truck as TruckIcon,
  FileCheck,
  HeartHandshake,
  TrendingUp,
  Receipt,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';

// ─── Brand tokens (Apple calm visual language) ──────────────────────
// Time-of-day greeting — "Welcome" is first-visit only; after that the
// dashboard greets by the clock.
const timeGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const BLUE = '#319ED8'; // single accent
const INK = '#1d1d1f'; // headline ink
const SUBINK = '#6e6e73'; // calm secondary gray
const HAIRLINE = '#e6e6ea'; // whisper-quiet border
const CANVAS = '#f5f5f7'; // near-white page canvas
const RAIL = '#f5f5f7'; // left-rail surface
const PILL_TRACK = '#f0f0f2'; // segmented-control track
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

// ─── cn ──────────────────────────────────────────────────────────────
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Two-tone section heading — "Lead. " ink + rest gray ─────────────
function SectionHeading({
  lead,
  rest,
  size = 20,
}: {
  lead: string;
  rest: string;
  size?: number;
}) {
  return (
    <h3 style={{ fontSize: size, fontWeight: 600, letterSpacing: '-0.01em' }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: SUBINK, fontWeight: 500 }}>{rest}</span>
    </h3>
  );
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
  style?: CSSProperties;
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

// ─── Data shapes (press-scoped) ──────────────────────────────────────

interface PressKpisData {
  sales30dCents: number;
  salesLifetimeCents: number;
  units30d: number;
  customerCount: number;
  projectsInPipeline: number;
  series: Array<{
    date: string;
    salesCents: number;
    units: number;
    customers: number;
  }>;
  prior: {
    sales30dCents: number;
    salesLifetimeCents: number;
    units30d: number;
    customerCount: number;
    projectsInPipeline: number;
  };
}

// Recent activity is the aggregate BUSINESS story for a press — not a fan
// receipt tape. Every row is a business-shaping event: a new project offer,
// a person onboarded, a run/sales milestone, a pipeline stage change, or an
// invoice/payout event. Never a single fan purchase.
type PressActivityKind = 'offer' | 'roster' | 'milestone' | 'stage' | 'invoice';

interface PressActivityRow {
  id: string;
  kind: PressActivityKind;
  ts: string;
  title: string;
  detail: string;
  href: string;
}

// ─── Mock data (press-scaled) ────────────────────────────────────────

function buildSeries(): PressKpisData['series'] {
  const now = Date.now();
  const out: PressKpisData['series'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.3 : 1;
    const drift = 1 + (29 - i) * 0.01;
    const drop = i <= 14 && i >= 11 ? 1.7 : 1; // a release-week bump
    const wobble = 0.85 + (Math.sin(i * 1.7) + Math.cos(i * 0.6)) * 0.12;
    const base = weekend * drift * drop * wobble;
    const units = Math.max(1, Math.round(9 * base));
    const salesCents = Math.round(units * (2900 + Math.sin(i) * 500));
    const customers = Math.max(1, Math.round(units * 0.7 * (0.9 + wobble * 0.2)));
    out.push({ date: d.toISOString().slice(0, 10), salesCents, units, customers });
  }
  return out;
}

function buildPriorSeries(): PressKpisData['series'] {
  return buildSeries().map((s) => ({
    date: s.date,
    salesCents: Math.round(s.salesCents * 0.84),
    units: Math.round(s.units * 0.86),
    customers: Math.round(s.customers * 0.82),
  }));
}

const CURRENT_SERIES = buildSeries();
const PRIOR_SERIES = buildPriorSeries();

function sumKey<K extends keyof PressKpisData['series'][number]>(
  series: PressKpisData['series'],
  key: K,
): number {
  return series.reduce((acc, s) => acc + (s[key] as number), 0);
}

const SALES_30D = sumKey(CURRENT_SERIES, 'salesCents');
const PRIOR_SALES_30D = sumKey(PRIOR_SERIES, 'salesCents');

const MOCK_KPIS: PressKpisData = {
  sales30dCents: SALES_30D,
  salesLifetimeCents: 4_218_400,
  units30d: sumKey(CURRENT_SERIES, 'units'),
  customerCount: 612,
  projectsInPipeline: 14,
  series: CURRENT_SERIES,
  prior: {
    sales30dCents: PRIOR_SALES_30D,
    salesLifetimeCents: 3_940_000,
    units30d: sumKey(PRIOR_SERIES, 'units'),
    customerCount: 571,
    projectsInPipeline: 12,
  },
};

const MOCK_PRIOR_KPIS: PressKpisData = {
  ...MOCK_KPIS,
  series: PRIOR_SERIES,
};

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const MOCK_ACTIVITY: PressActivityRow[] = [
  {
    id: 'a1', kind: 'offer', ts: ago(14),
    title: "New project offer · 'Paper Moon'",
    detail: 'The Foxglove Set chose your pressing',
    href: '/press/pipeline?stage=invited',
  },
  {
    id: 'a2', kind: 'milestone', ts: ago(52),
    title: 'Nightswim passed 100 units',
    detail: 'Ivy & The Lanterns · $4.2k in sales',
    href: '/press/reports',
  },
  {
    id: 'a3', kind: 'stage', ts: ago(96),
    title: 'Golden Hour → test pressing approved',
    detail: 'Ivy & The Lanterns · cleared for production',
    href: '/press/pipeline',
  },
  {
    id: 'a4', kind: 'invoice', ts: ago(180),
    title: 'Invoice #1042 paid · $1,180.00',
    detail: 'Harbor Lights — Slow Static pressing run',
    href: '/press/settings?tab=payouts',
  },
  {
    id: 'a5', kind: 'roster', ts: ago(320),
    title: 'Ivy & The Lanterns joined your roster',
    detail: 'Accepted your invite · 2 projects homed',
    href: '/press/people',
  },
  {
    id: 'a6', kind: 'stage', ts: ago(640),
    title: 'Ember & Ash → in production',
    detail: 'The Foxglove Set · run of 300 started',
    href: '/press/pipeline',
  },
  {
    id: 'a7', kind: 'milestone', ts: ago(1180),
    title: 'Slow Static passed 250 units',
    detail: 'Harbor Lights · $8.9k in sales',
    href: '/press/reports',
  },
  {
    id: 'a8', kind: 'invoice', ts: ago(1900),
    title: 'Payout cleared · $4,340.00',
    detail: 'Last cycle · net of platform fees',
    href: '/press/settings?tab=payouts',
  },
  {
    id: 'a9', kind: 'roster', ts: ago(2600),
    title: 'Cassette Season joined your roster',
    detail: 'Accepted your invite · 1 project homed',
    href: '/press/people',
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
            className="px-3.5 h-8 text-[12.5px] rounded-full transition-all"
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
  warning: { accent: '#c98a00', wash: '#fdf6e8', label: 'In transit' },
  ready: { accent: '#1c8a5b', wash: '#eaf7f0', label: 'Ready to run' },
};

// ─── Work queue (the hero, press-scoped) ─────────────────────────────

type QueueItem = {
  id: string;
  severity: Severity;
  icon: typeof TruckIcon;
  title: string;
  detail: string;
  metric: string;
  action: string;
  primary?: boolean;
  href: string;
};

const PRESS_QUEUE: QueueItem[] = [
  {
    id: 'test-pressing',
    severity: 'critical',
    icon: FileCheck,
    title: 'Test pressing for Nightswim awaiting your approval',
    detail: 'Ivy & The Lanterns · in Sunrise set for 3 days. Production is blocked until you sign off.',
    metric: '1 · blocking',
    action: 'Review test pressing',
    primary: true,
    href: '/press/pipeline?stage=sunrise_set',
  },
  {
    id: 'new-offers',
    severity: 'warning',
    icon: HeartHandshake,
    title: '3 new project offers awaiting acceptance',
    detail: 'Artists have chosen your pressing. Accept to add them to your pipeline.',
    metric: '3 offers',
    action: 'Review offers',
    href: '/press/pipeline?stage=invited',
  },
  {
    id: 'ship-orders',
    severity: 'warning',
    icon: TruckIcon,
    title: '8 orders paid and ready to ship',
    detail: 'Pressed and in stock. Print labels and mark shipped to release fan payouts.',
    metric: '8 orders',
    action: 'Fulfill orders',
    href: '/press/pipeline?stage=fulfillment',
  },
  {
    id: 'payout-ready',
    severity: 'ready',
    icon: Banknote,
    title: `${fmtUsd(184200)} payout ready to collect`,
    detail: 'Cleared sales from the last cycle, minus platform fees. Your Stripe account is connected.',
    metric: fmtUsd(184200),
    action: 'View payout',
    primary: true,
    href: '/press/settings?tab=payouts',
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
        className="hidden md:inline-flex items-center gap-1.5 text-[11.5px] font-semibold tabular-nums flex-shrink-0"
        style={{ color: sev.accent }}
      >
        {item.metric}
      </span>

      {item.primary ? (
        <button
          type="button"
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-[13.5px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: BLUE }}
          data-testid={`queue-action-${item.id}`}
        >
          {item.action}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-[13.5px] font-medium transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
          data-testid={`queue-action-${item.id}`}
        >
          {item.action}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function WorkQueue({ items }: { items: QueueItem[] }) {
  const criticalCount = items.filter((i) => i.severity === 'critical').length;
  // Default COLLAPSED — the header is the always-visible summary/toggle, so
  // problems don't sit front-and-center until the operator opens the queue.
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    // Same slim shell as the collapsed queue — good news should take LESS
    // room than problems, not a hero card. One quiet line, nothing to open.
    return (
      <section
        className="rounded-2xl bg-white flex items-center gap-2.5 px-5 py-3.5"
        style={{ border: `1px solid ${HAIRLINE}` }}
        data-testid="work-queue-empty"
      >
        <span
          className="w-6 h-6 rounded-full inline-flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#eaf7f0' }}
        >
          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#1c8a5b' }} />
        </span>
        <h2 className="text-[13px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
          You're all caught up
        </h2>
        <p className="text-[13px] truncate" style={{ color: SUBINK }}>
          — no offers to accept, approvals due, or orders to ship. New work appears here the moment it needs you.
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
        style={expanded ? { borderBottom: `1px solid ${HAIRLINE}` } : undefined}
        data-testid="work-queue-toggle"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-[13px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
            Needs your attention
          </h2>
          {criticalCount > 0 && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: '#fdeef2', color: '#e0245e' }}
            >
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
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div style={{ borderTop: expanded ? 'none' : undefined }}>
            {items.map((item, i) => (
              <div key={item.id} style={i > 0 ? { borderTop: `1px solid ${HAIRLINE}` } : undefined}>
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

function KpiStrip({ kpis }: { kpis: PressKpisData }) {
  const p = kpis.prior;
  const tiles: KpiTile[] = [
    { id: 'sales30d', label: 'Sales · last 30d', value: fmtKpiUsd(kpis.sales30dCents), cur: kpis.sales30dCents, prior: p.sales30dCents, href: '/press/reports' },
    { id: 'salesLifetime', label: 'Sales · lifetime', value: fmtKpiUsd(kpis.salesLifetimeCents), cur: kpis.salesLifetimeCents, prior: p.salesLifetimeCents, href: '/press/reports' },
    { id: 'units30d', label: 'Units · last 30d', value: fmtKpiNum(kpis.units30d), cur: kpis.units30d, prior: p.units30d, href: '/press/reports?tab=units' },
    { id: 'customers', label: 'Customers', value: fmtKpiNum(kpis.customerCount), cur: kpis.customerCount, prior: p.customerCount, href: '/press/people' },
    { id: 'pipeline', label: 'Projects in pipeline', value: fmtKpiNum(kpis.projectsInPipeline), cur: kpis.projectsInPipeline, prior: p.projectsInPipeline, href: '/press/pipeline' },
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
            <div className="text-[12.5px] font-medium" style={{ color: SUBINK }}>
              {t.label}
            </div>
            <div
              className="mt-2.5 tabular-nums"
              style={{ fontSize: 30, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.03em', color: INK }}
            >
              {t.value}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px]">
              <span
                className="font-semibold tabular-nums"
                style={{ color: d.positive ? '#1c8a5b' : '#dc2626' }}
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

type ChartMetric = 'sales' | 'units' | 'customers';

function TrendChart({ kpis, prior }: { kpis: PressKpisData; prior: PressKpisData }) {
  const [metric, setMetric] = useState<ChartMetric>('sales');
  const series = kpis.series ?? [];
  const priorSeries = prior.series ?? [];

  const merged = useMemo(() => {
    return series.map((s, i) => {
      const pt = priorSeries[i];
      const key =
        metric === 'sales' ? 'salesCents' : metric === 'units' ? 'units' : 'customers';
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
    { v: 'units', label: 'Units' },
    { v: 'customers', label: 'Customers' },
  ];

  return (
    <div
      className="rounded-2xl bg-white p-6 h-full flex flex-col"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-trend-chart"
    >
      <div className="flex items-start justify-between mb-5 flex-wrap gap-2">
        <SectionHeading lead="The last 30 days." rest="This period vs the one before." />
        <div
          className="inline-flex items-center p-1 rounded-full"
          style={{ backgroundColor: PILL_TRACK, gap: 2 }}
        >
          {opts.map((o) => {
            const active = metric === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setMetric(o.v)}
                aria-pressed={active}
                data-testid={`button-chart-metric-${o.v}`}
                className="px-3 h-7 text-[12px] rounded-full transition-all"
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
            <CartesianGrid stroke="#eeeef0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke="#c7c7cc" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v: string) => (v ? v.slice(5) : '')} />
            <YAxis
              stroke="#c7c7cc"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)}
            />
            <Tooltip
              formatter={(v: number) => (isCurrency ? fmtUsd(v) : fmtNum(v))}
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${HAIRLINE}`,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                fontSize: 12,
              }}
              labelStyle={{ color: INK }}
            />
            <Line
              type="monotone" dataKey="prior" stroke="#c7c7cc" strokeWidth={1.5}
              strokeDasharray="4 4" dot={false} name="Prior period" connectNulls
            />
            <Line
              type="monotone" dataKey="current" stroke={BLUE} strokeWidth={2.5}
              dot={false} name="This period"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Recent activity (recedes) ───────────────────────────────────────

function ActivityIcon({ kind }: { kind: PressActivityKind }) {
  const map = {
    offer: HeartHandshake,
    roster: UserPlus,
    milestone: TrendingUp,
    stage: Disc3,
    invoice: Receipt,
  }[kind];
  const Icon = map;
  return (
    <span
      className="w-7 h-7 rounded-lg inline-flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#f2f2f5' }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: SUBINK }} />
    </span>
  );
}

function ActivityFeed({ activity }: { activity: PressActivityRow[] }) {
  const items = useMemo(() => {
    return [...activity]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 12);
  }, [activity]);

  return (
    <div
      className="rounded-2xl bg-white p-5 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-activity-feed"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <SectionHeading lead="As it happens." rest="Recent activity." size={16} />
        <Link
          href="/press/pipeline"
          className="text-[12px] font-medium transition-opacity hover:opacity-70"
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
              className="flex items-start gap-2.5 -mx-1.5 px-1.5 py-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <ActivityIcon kind={it.kind} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] truncate" style={{ color: INK }}>{it.title}</div>
                <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>{it.detail}</div>
              </div>
              <div className="text-[11px] tabular-nums flex-shrink-0 pt-0.5" style={{ color: '#a1a1a6' }}>
                {fmtRel(new Date(it.ts))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Bottom row: Production snapshot + Top clients ───────────────────

type ProductionStage = {
  id: string;
  label: string;
  count: number;
};

// Four plant-floor stages, left→right, with 30d counts. The busiest stage
// gets brand blue; the rest stay a calm slate to keep the strip quiet.
const PRODUCTION_STAGES: ProductionStage[] = [
  { id: 'design', label: 'Design', count: 3 },
  { id: 'test-pressing', label: 'Test pressing', count: 2 },
  { id: 'in-production', label: 'In production', count: 5 },
  { id: 'shipped', label: 'Shipped · 30d', count: 12 },
];

type ProductionCallout = {
  id: string;
  project: string;
  note: string;
  meta: string;
};

// Runs closest to needing a hand — the "what should I look at" line items.
const PRODUCTION_CALLOUTS: ProductionCallout[] = [
  { id: 'golden-hour', project: 'Golden Hour', note: 'test pressing awaiting client approval', meta: '2d' },
  { id: 'paper-moon', project: 'Paper Moon', note: 'design revision due', meta: 'today' },
  { id: 'nightswim', project: 'Nightswim', note: 'lacquers cut — ready to plate', meta: '1d' },
];

function ProductionSnapshot() {
  const busiest = useMemo(() => {
    return PRODUCTION_STAGES.reduce((a, b) => (b.count > a.count ? b : a)).id;
  }, []);

  return (
    <div
      className="rounded-2xl bg-white p-5 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="production-snapshot"
    >
      <div className="flex items-center justify-between mb-3.5 flex-shrink-0">
        <SectionHeading lead="On the floor." rest="Runs right now." size={16} />
        <Link
          href="/press/pipeline"
          className="text-[12px] font-medium transition-opacity hover:opacity-70 flex-shrink-0"
          style={{ color: BLUE }}
        >
          View pipeline
        </Link>
      </div>

      {/* Four equal stage segments */}
      <div className="grid grid-cols-4 gap-2">
        {PRODUCTION_STAGES.map((stage) => {
          const isBusiest = stage.id === busiest;
          return (
            <div
              key={stage.id}
              className="rounded-xl px-2.5 py-2.5 flex flex-col gap-1.5"
              style={{ backgroundColor: '#f7f7f9', border: `1px solid ${HAIRLINE}` }}
              data-testid={`stage-${stage.id}`}
            >
              <span
                className="h-1 w-6 rounded-full"
                style={{ backgroundColor: isBusiest ? BLUE : '#c7c7cc' }}
              />
              <span className="text-[20px] font-semibold tabular-nums leading-none" style={{ color: INK }}>
                {stage.count}
              </span>
              <span className="text-[10.5px] leading-tight" style={{ color: SUBINK }}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Callouts — runs closest to needing action */}
      <ul className="mt-3 space-y-0.5 flex-1 min-h-0">
        {PRODUCTION_CALLOUTS.map((c) => (
          <li key={c.id} data-testid={`callout-${c.id}`}>
            <Link
              href="/press/pipeline"
              className="flex items-center gap-2 -mx-1.5 px-1.5 py-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#c7c7cc' }} />
              <span className="text-[12.5px] truncate flex-1 min-w-0" style={{ color: SUBINK }}>
                <span className="font-medium" style={{ color: INK }}>{c.project}</span>
                <span style={{ color: '#a1a1a6' }}> — </span>
                {c.note}
              </span>
              <span className="text-[10.5px] tabular-nums flex-shrink-0" style={{ color: '#a1a1a6' }}>
                {c.meta}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TopClient = {
  id: string;
  name: string;
  initials: string;
  projects: number;
  revenueCents: number;
  deltaPct: number;
};

// Ranked by this-period revenue. Reuses the invented client roster.
const TOP_CLIENTS: TopClient[] = [
  { id: 'foxglove', name: 'The Foxglove Set', initials: 'FS', projects: 3, revenueCents: 1284000, deltaPct: 18.4 },
  { id: 'ivy', name: 'Ivy & The Lanterns', initials: 'IL', projects: 4, revenueCents: 972000, deltaPct: 11.2 },
  { id: 'harbor', name: 'Harbor Lights', initials: 'HL', projects: 2, revenueCents: 648000, deltaPct: 5.1 },
  { id: 'cassette', name: 'Cassette Season', initials: 'CS', projects: 2, revenueCents: 421000, deltaPct: -3.4 },
  { id: 'ember', name: 'Ember & Ash', initials: 'EA', projects: 1, revenueCents: 268000, deltaPct: 6.9 },
];

function TopClients() {
  return (
    <div
      className="rounded-2xl bg-white p-5 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="top-clients"
    >
      <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
        <SectionHeading lead="Top clients." rest="By revenue this period." size={16} />
        <Link
          href="/press/clients"
          className="text-[12px] font-medium transition-opacity hover:opacity-70 flex-shrink-0"
          style={{ color: BLUE }}
        >
          View all
        </Link>
      </div>
      <ul className="space-y-0.5">
        {TOP_CLIENTS.map((c) => {
          const positive = c.deltaPct >= 0;
          return (
            <li key={c.id} data-testid={`client-${c.id}`}>
              <Link
                href="/press/clients"
                className="flex items-center gap-2.5 -mx-2 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <span
                  className="h-9 w-9 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#f2f2f5', color: SUBINK }}
                >
                  {c.initials}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium truncate" style={{ color: INK }}>{c.name}</div>
                  <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>
                    {c.projects} project{c.projects === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 pl-2">
                  <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: INK }}>
                    {fmtUsd(c.revenueCents)}
                  </span>
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: positive ? '#1c8a5b' : '#dc2626' }}
                  >
                    {positive ? '+' : ''}
                    {c.deltaPct.toFixed(1)}%
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Press persona shell (flat nav, PRESS tag) ───────────────────────

type PressNavItem = { label: string; icon: typeof LayoutDashboard; count?: number; active?: boolean };

// Mirrors the live press portal's rail, in order.
const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Catalog', icon: Library },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function NavRow({ label, icon: Icon, count, active }: PressNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && 'hover:bg-slate-200',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? '#ffffff' : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[11px] tabular-nums" style={{ color: '#a1a1a6' }}>{count}</span>
      )}
    </a>
  );
}

const PARTNER_NAME = 'Memphis Record Pressing';
const USER_FIRST_NAME = 'Brandon';
const USER_EMAIL = 'brandon@memphisrecordpressing.com';
const USER_INITIALS = 'BS'; // photo fallback only

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
          className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow"
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img
            src={brandonPhoto}
            alt={USER_INITIALS}
            className="w-full h-full object-cover"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 rounded-2xl"
        style={{ border: `1px solid ${HAIRLINE}` }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: INK }}>{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>{USER_EMAIL}</div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
                style={{ color: INK }}
                data-testid={`menu-item-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
            style={{ color: INK }}
            data-testid="menu-item-sign-out"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PressShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="h-screen overflow-hidden flex flex-col font-sans"
      style={{ backgroundColor: CANVAS, color: INK }}
    >
      {/* Full-width top bar — sticky, translucent white with blur, hairline
          bottom border. Left: partner brand; right: feedback, bell, avatar. */}
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6"
        style={{
          backgroundColor: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-9 w-9 rounded-full overflow-hidden bg-white flex items-center justify-center flex-shrink-0"
            style={{ border: `1px solid ${HAIRLINE}` }}
          >
            <img src={mrpLogo} alt={PARTNER_NAME} className="w-full h-full object-contain p-0.5" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK, letterSpacing: '-0.01em' }}>
            {PARTNER_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors"
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
            {PRESS_NAV.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
          </nav>
          {/* Platform attribution — GoodTunes recedes to a "powered by" mark. */}
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: '#a1a1a6' }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" />
          </div>
        </aside>

        <ScrollFadeMain>{children}</ScrollFadeMain>
      </div>
    </div>
  );
}

// The content scrolls inside <main>; a fixed-to-viewport-bottom gradient makes
// long pages fade out instead of looking hard-cut, and disappears once a
// sentinel at the very end scrolls into view (IntersectionObserver).
function ScrollFadeMain({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAtBottom(entry.isIntersecting),
      { root, rootMargin: '0px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <main ref={scrollRef} className="flex-1 min-w-0 relative overflow-y-auto">
      <div className="mx-auto w-full max-w-[1440px] px-6 sm:px-8 pt-6 pb-12">
        {children}
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none sticky bottom-0 left-0 right-0 -mt-16 h-16 transition-opacity duration-300',
          atBottom ? 'opacity-0' : 'opacity-100',
        )}
        style={{ backgroundImage: `linear-gradient(to top, ${CANVAS}, rgba(245,245,247,0))` }}
        data-testid="scroll-fade"
      />
    </main>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export function PressDashboard() {
  const [range, setRange] = useState<RangeKey>('30d');

  const kpis = MOCK_KPIS;
  const priorKpis = MOCK_PRIOR_KPIS;
  const queue = PRESS_QUEUE;
  const activity = MOCK_ACTIVITY;

  const openItems = queue.length;

  return (
    <PressShell>
      <div className="flex flex-col gap-5">
        {/* Header — greeting + "N items need you" + the one primary action */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', color: INK }} data-testid="heading-press-dashboard">
              {timeGreeting()}, Brandon
            </h1>
            <p className="text-[13.5px] mt-1" style={{ color: SUBINK }}>
              {openItems > 0 ? (
                <>
                  <span className="font-semibold" style={{ color: INK }}>{openItems} item{openItems === 1 ? '' : 's'}</span>{' '}
                  need you before anything else.
                </>
              ) : (
                'Nothing needs you right now — the shop is running clean.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <RangeSwitcher value={range} onChange={setRange} />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BLUE }}
              data-testid="button-header-review-offers"
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              Review offers
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

        {/* Bottom row — floor snapshot + top clients, admin bottom-row rhythm */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <ProductionSnapshot />
          <TopClients />
        </div>
      </div>
    </PressShell>
  );
}

export default PressDashboard;
