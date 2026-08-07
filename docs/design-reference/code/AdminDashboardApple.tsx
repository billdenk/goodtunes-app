// AdminDashboardApple — an Apple-store-inspired ALTERNATE skin of the
// GoodTunes operator dashboard. SAME product, SAME mock data, SAME modules
// as AdminDashboardRedesign.tsx (KPIs, work queue, trend, activity feed,
// ranked lists / sales-by-press, people & partner events). Nothing new is
// invented and nothing is dropped — this is purely a re-skin.
//
// Design hypothesis, borrowed from apple.com/shop store pages:
//   • Typography leads. Huge, unhurried headlines set the pace; two-tone
//     headings ("Model. Choose your size.") give each section a calm voice
//     — a bold black clause followed by a quiet gray clause.
//   • Generous air. Wide margins, tall section rhythm, big line-height.
//   • Soft rounded cards on a near-white canvas. Quiet grays everywhere,
//     one deliberate accent (GoodTunes blue) used sparingly.
//   • Nothing shouts. Numbers are large and elegant, not loud. Severity is
//     communicated with restraint.
//
// Light mode only. All app plumbing is stubbed exactly like the redesign
// (react-query → static mock data, wouter Link → plain <a>). No existing
// file is modified.

import {
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import {
  ShoppingBag,
  UserPlus,
  Banknote,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  BarChart3,
  Bell,
  Guitar,
  PackagePlus,
  Tags,
  Briefcase,
  HeartHandshake,
  Factory,
  Hammer,
  Store,
  Truck,
  ListOrdered,
  BadgeCheck,
  ListChecks,
  MessageSquare,
  DollarSign,
  Receipt,
  Mail,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Truck as TruckIcon,
  CreditCard,
  Timer,
  CheckCircle2,
  Mic2,
  LogOut,
  UserPen,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import californialandCover from '../assets/californialand-cover.jpg';
import mrpLogo from '../assets/mrp-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import pressHellbender from '../assets/press-hellbender.jpg';
import pressPmp from '../assets/press-pmp.jpg';
import pressPressingBusiness from '../assets/press-pressing-business.jpg';

// ─── Brand tokens ────────────────────────────────────────────────────
// Time-of-day greeting — "Welcome" is for the very first visit only; after
// that, the dashboard greets by the clock.
const timeGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const BLUE = '#319ED8';
// The Apple-store typographic system leans on a very small palette of
// grays for text so the one blue accent carries all the weight.
const INK = '#1d1d1f'; // near-black headline ink (Apple text color)
const SUBINK = '#6e6e73'; // calm secondary gray (Apple secondary label)
const HAIRLINE = '#e6e6ea'; // whisper-quiet card border
const CANVAS = '#fbfbfd'; // near-white page canvas (Apple background)

// ─── cn ──────────────────────────────────────────────────────────────
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── money / number formatting (unchanged from redesign) ─────────────
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

// ─── Section heading — the Apple two-tone device ─────────────────────
// "Bold clause. Quiet clause." — a strong first phrase in ink followed by
// a soft gray continuation, exactly like "Model. Choose your size."
function SectionHeading({
  lead,
  rest,
  size = 'lg',
  action,
}: {
  lead: string;
  rest: string;
  size?: 'lg' | 'md';
  action?: ReactNode;
}) {
  const fontSize = size === 'lg' ? 30 : 22;
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <h2
        style={{
          fontSize,
          lineHeight: 1.12,
          letterSpacing: '-0.02em',
          fontWeight: 600,
        }}
      >
        <span style={{ color: INK }}>{lead} </span>
        <span style={{ color: SUBINK, fontWeight: 500 }}>{rest}</span>
      </h2>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}

// ─── Data shapes (unchanged) ─────────────────────────────────────────

interface KpisData {
  gmvCents: number;
  netCents: number;
  orderCount: number;
  newSignups: number;
  plays: number;
  series: Array<{
    date: string;
    gmvCents: number;
    orders: number;
    signups: number;
    plays: number;
  }>;
  prior?: {
    gmvCents?: number;
    netCents?: number;
    orderCount?: number;
    newSignups?: number;
    plays?: number;
  };
}

interface OpsData {
  stuckFulfillments: { count: number };
  failedCheckouts: { last24hCount: number; last7dCount: number };
  stuckPayoutCount: number;
}

interface OrderRow {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string | null;
  shippedAt: string | null;
  payoutStatus: string | null;
  payoutAmountCents: number | null;
  payoutTransferredAt?: string | null;
  albumTitle: string;
  albumArtist: string;
  customerName: string | null;
  customerEmail: string;
  customerId: string;
}

interface CustomerRow {
  id: string;
  displayName: string | null;
  username: string | null;
  realName: string | null;
  email: string;
  createdAt: string | null;
}

// ─── Mock data (copied verbatim from the redesign) ───────────────────

function buildSeries(): KpisData['series'] {
  const now = Date.now();
  const out: KpisData['series'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.35 : 1;
    const drift = 1 + (29 - i) * 0.012;
    const promo = i <= 12 && i >= 9 ? 1.9 : 1;
    const wobble = 0.85 + (Math.sin(i * 1.7) + Math.cos(i * 0.6)) * 0.12;
    const base = weekend * drift * promo * wobble;
    const orders = Math.max(2, Math.round(28 * base));
    const gmvCents = Math.round(orders * (3200 + Math.sin(i) * 600));
    const signups = Math.max(1, Math.round(orders * 0.55 * (0.9 + wobble * 0.2)));
    const plays = Math.round(orders * 46 * (0.9 + weekend * 0.15));
    out.push({ date: d.toISOString().slice(0, 10), gmvCents, orders, signups, plays });
  }
  return out;
}

function buildPriorSeries(): KpisData['series'] {
  return buildSeries().map((s) => ({
    date: s.date,
    gmvCents: Math.round(s.gmvCents * 0.86),
    orders: Math.round(s.orders * 0.88),
    signups: Math.round(s.signups * 0.83),
    plays: Math.round(s.plays * 0.9),
  }));
}

const CURRENT_SERIES = buildSeries();
const PRIOR_SERIES = buildPriorSeries();

function sum<K extends keyof KpisData['series'][number]>(
  series: KpisData['series'],
  key: K,
): number {
  return series.reduce((acc, s) => acc + (s[key] as number), 0);
}

const MOCK_KPIS: KpisData = {
  gmvCents: sum(CURRENT_SERIES, 'gmvCents'),
  netCents: Math.round(sum(CURRENT_SERIES, 'gmvCents') * 0.42),
  orderCount: sum(CURRENT_SERIES, 'orders'),
  newSignups: sum(CURRENT_SERIES, 'signups'),
  plays: sum(CURRENT_SERIES, 'plays'),
  series: CURRENT_SERIES,
  prior: {
    gmvCents: sum(PRIOR_SERIES, 'gmvCents'),
    netCents: Math.round(sum(PRIOR_SERIES, 'gmvCents') * 0.4),
    orderCount: sum(PRIOR_SERIES, 'orders'),
    newSignups: sum(PRIOR_SERIES, 'signups'),
    plays: sum(PRIOR_SERIES, 'plays'),
  },
};

const MOCK_PRIOR_KPIS: KpisData = {
  gmvCents: sum(PRIOR_SERIES, 'gmvCents'),
  netCents: Math.round(sum(PRIOR_SERIES, 'gmvCents') * 0.4),
  orderCount: sum(PRIOR_SERIES, 'orders'),
  newSignups: sum(PRIOR_SERIES, 'signups'),
  plays: sum(PRIOR_SERIES, 'plays'),
  series: PRIOR_SERIES,
};

const MOCK_OPS: OpsData = {
  stuckFulfillments: { count: 3 },
  failedCheckouts: { last24hCount: 5, last7dCount: 22 },
  stuckPayoutCount: 2,
};

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const MOCK_ORDERS: OrderRow[] = [
  {
    id: 'o1', status: 'paid', totalCents: 4200, createdAt: ago(4), shippedAt: null,
    payoutStatus: null, payoutAmountCents: null, albumTitle: 'Nightswim',
    albumArtist: 'Ivy & The Lanterns', customerName: 'Maya Ellison',
    customerEmail: 'maya.ellison@gmail.com', customerId: 'c1',
  },
  {
    id: 'o2', status: 'shipped', totalCents: 3600, createdAt: ago(37), shippedAt: ago(20),
    payoutStatus: 'transferred', payoutAmountCents: 1800, payoutTransferredAt: ago(18),
    albumTitle: 'Slow Static', albumArtist: 'Harbor Lights', customerName: 'Devin Park',
    customerEmail: 'devin.park@fastmail.com', customerId: 'c2',
  },
  {
    id: 'o3', status: 'paid', totalCents: 5400, createdAt: ago(72), shippedAt: null,
    payoutStatus: null, payoutAmountCents: null, albumTitle: 'Golden Hour',
    albumArtist: 'Ivy & The Lanterns', customerName: null,
    customerEmail: 'listener_8842@proton.me', customerId: 'c3',
  },
  {
    id: 'o4', status: 'shipped', totalCents: 2800, createdAt: ago(155), shippedAt: ago(140),
    payoutStatus: 'transferred', payoutAmountCents: 1400, payoutTransferredAt: ago(130),
    albumTitle: 'Paper Moon', albumArtist: 'The Foxglove Set', customerName: 'Priya Nair',
    customerEmail: 'priya.nair@outlook.com', customerId: 'c4',
  },
  {
    id: 'o5', status: 'paid', totalCents: 3900, createdAt: ago(260), shippedAt: null,
    payoutStatus: null, payoutAmountCents: null, albumTitle: 'Weekend Drive',
    albumArtist: 'Cassette Season', customerName: 'Theo Brandt',
    customerEmail: 'theo.brandt@gmail.com', customerId: 'c5',
  },
  {
    id: 'o6', status: 'shipped', totalCents: 6200, createdAt: ago(410), shippedAt: ago(390),
    payoutStatus: 'transferred', payoutAmountCents: 3100, payoutTransferredAt: ago(360),
    albumTitle: 'Deep Cuts, Vol. II', albumArtist: 'Harbor Lights', customerName: 'Renata Cruz',
    customerEmail: 'renata.cruz@gmail.com', customerId: 'c6',
  },
];

const MOCK_CUSTOMERS: CustomerRow[] = [
  { id: 'c7', displayName: 'Jonah W.', username: 'jonahw', realName: 'Jonah Weiss', email: 'jonah.weiss@gmail.com', createdAt: ago(12) },
  { id: 'c8', displayName: null, username: 'seaglass', realName: null, email: 'seaglass.audio@gmail.com', createdAt: ago(58) },
  { id: 'c9', displayName: 'Amara O.', username: null, realName: 'Amara Okoye', email: 'amara.okoye@hey.com', createdAt: ago(120) },
  { id: 'c10', displayName: null, username: null, realName: null, email: 'newlistener_5521@proton.me', createdAt: ago(200) },
  { id: 'c11', displayName: 'Luca M.', username: 'lucam', realName: 'Luca Moretti', email: 'luca.moretti@gmail.com', createdAt: ago(320) },
];

// ─── Referral payouts mock (unchanged) ───────────────────────────────

type ReferralPayoutBatch = {
  ownerKind: 'person' | 'organization';
  ownerId: string;
  ownerName: string | null;
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
  currency: string;
  creditIds: string[];
  totalCents: number;
  units: number;
};
type ReferralPayoutsPending = {
  batches: ReferralPayoutBatch[];
  totalCents: number;
  payableCount: number;
  blockedCount: number;
};

const MOCK_REFERRAL_PAYOUTS: ReferralPayoutsPending = {
  batches: [
    {
      ownerKind: 'person', ownerId: 'p1', ownerName: 'Ivy & The Lanterns',
      stripeAccountId: 'acct_1P2x', payoutsEnabled: true, currency: 'usd',
      creditIds: ['cr1', 'cr2', 'cr3'], totalCents: 18400, units: 46,
    },
    {
      ownerKind: 'organization', ownerId: 'n1', ownerName: 'Harmony for Schools',
      stripeAccountId: 'acct_9Q7z', payoutsEnabled: true, currency: 'usd',
      creditIds: ['cr4', 'cr5'], totalCents: 9600, units: 24,
    },
    {
      ownerKind: 'person', ownerId: 'p2', ownerName: 'Cassette Season',
      stripeAccountId: null, payoutsEnabled: false, currency: 'usd',
      creditIds: ['cr6'], totalCents: 4200, units: 12,
    },
  ],
  totalCents: 28000,
  payableCount: 2,
  blockedCount: 1,
};

// ─── Range switcher — Apple segmented pill ───────────────────────────

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
    { v: '7d', label: '7 days' },
    { v: '30d', label: '30 days' },
    { v: '90d', label: '90 days' },
    { v: 'all', label: 'All' },
  ];
  return (
    <div
      className="inline-flex items-center p-1 rounded-full"
      style={{ backgroundColor: '#f0f0f2', gap: 2 }}
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
              backgroundColor: active ? '#ffffff' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Severity tokens — restrained, Apple-quiet ───────────────────────

type Severity = 'critical' | 'warning' | 'ready';

const SEVERITY: Record<
  Severity,
  { accent: string; wash: string; label: string }
> = {
  critical: { accent: '#e0245e', wash: '#fdeef2', label: 'Needs action' },
  warning: { accent: '#c98a00', wash: '#fdf6e8', label: 'In transit' },
  ready: { accent: '#1c8a5b', wash: '#eaf7f0', label: 'Ready to run' },
};

// ─── Work queue (the hero, re-skinned as calm attention cards) ───────

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

function buildQueue(
  ops: OpsData,
  payouts: ReferralPayoutsPending,
): QueueItem[] {
  const items: QueueItem[] = [];

  if (ops.stuckFulfillments.count > 0) {
    const n = ops.stuckFulfillments.count;
    items.push({
      id: 'stuck-fulfillments',
      severity: 'critical',
      icon: TruckIcon,
      title: `${n} order${n === 1 ? '' : 's'} failed to reach fulfillment`,
      detail: 'Paid, but never pushed to the press. Fans are waiting.',
      metric: `${n} order${n === 1 ? '' : 's'}`,
      action: 'Push to fulfillment',
      primary: true,
      href: '/admin/orders?needsPush=1',
    });
  }

  const failed = ops.failedCheckouts.last24hCount ?? 0;
  if (failed > 0) {
    items.push({
      id: 'failed-checkouts',
      severity: 'critical',
      icon: CreditCard,
      title: `${failed} checkout${failed === 1 ? '' : 's'} failed in the last 24h`,
      detail: `${ops.failedCheckouts.last7dCount} in the last 7 days. Lost revenue if unresolved.`,
      metric: `${failed} · 24h`,
      action: 'Investigate',
      href: '/admin/reports',
    });
  }

  if (ops.stuckPayoutCount > 0) {
    const n = ops.stuckPayoutCount;
    items.push({
      id: 'stuck-payouts',
      severity: 'warning',
      icon: Timer,
      title: `${n} payout${n === 1 ? '' : 's'} stuck in transit`,
      detail: 'Transfer created but not confirmed by Stripe. Retry or inspect.',
      metric: `${n} stuck`,
      action: 'Review',
      href: '/admin/reports',
    });
  }

  if (payouts.payableCount > 0) {
    items.push({
      id: 'payouts-ready',
      severity: 'ready',
      icon: Banknote,
      title: `${fmtUsd(payouts.totalCents)} in referral payouts ready to run`,
      detail: `${payouts.payableCount} payee${payouts.payableCount === 1 ? '' : 's'} clear${
        payouts.blockedCount > 0 ? `, ${payouts.blockedCount} blocked on Stripe setup` : ''
      }.`,
      metric: fmtUsd(payouts.totalCents),
      action: 'Run payouts',
      primary: true,
      href: '/admin/reports',
    });
  }

  return items;
}

// A full attention card — icon, title, description, and action always
// visible. These are the calm hero cards; the section header above them
// collapses the whole set down to a single bar.
function WorkQueueCard({
  item,
  onOpen,
}: {
  item: QueueItem;
  onOpen?: () => void;
}) {
  const sev = SEVERITY[item.severity];
  const Icon = item.icon;
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid={`queue-card-${item.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="w-10 h-10 rounded-full inline-flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: sev.wash }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: sev.accent }} />
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold flex-shrink-0"
          style={{ color: sev.accent }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ backgroundColor: sev.accent }}
          />
          {sev.label}
        </span>
      </div>

      <h3
        className="mt-4 text-[17px] font-semibold leading-snug"
        style={{ color: INK, letterSpacing: '-0.01em' }}
      >
        {item.title}
      </h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed flex-1" style={{ color: SUBINK }}>
        {item.detail}
      </p>

      <div className="mt-4">
        {item.primary ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: BLUE }}
            data-testid={`queue-action-${item.id}`}
          >
            {item.action}
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium transition-colors hover:opacity-70"
            style={{ color: BLUE }}
            data-testid={`queue-action-${item.id}`}
          >
            {item.action}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function WorkQueue({
  ops,
  payouts,
  onRunPayouts,
}: {
  ops: OpsData;
  payouts: ReferralPayoutsPending;
  onRunPayouts: () => void;
}) {
  const items = useMemo(() => buildQueue(ops, payouts), [ops, payouts]);
  // Per-row expanded state; all rows start compact.
  // Whole-section collapse via the header.
  const [sectionOpen, setSectionOpen] = useState(true);

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
          No failed fulfillments, checkouts, or stuck payouts. New work will
          appear here the moment it needs you.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="work-queue">
      {/* Single quiet bar — collapses the whole card set, Apple-style */}
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        aria-expanded={sectionOpen}
        aria-controls="work-queue-rows"
        className="w-full flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
        style={{ border: `1px solid ${HAIRLINE}` }}
        data-testid="work-queue-section-toggle"
      >
        <span className="text-[13px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
          Needs your attention
        </span>
        <span className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[12.5px] tabular-nums" style={{ color: SUBINK }}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200"
            style={{ color: '#a1a1a6', transform: sectionOpen ? 'none' : 'rotate(-90deg)' }}
          />
        </span>
      </button>

      <div
        id="work-queue-rows"
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: sectionOpen ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="grid gap-4 pt-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
          >
            {items.map((item) => (
              <div key={item.id}>
                <WorkQueueCard
                  item={item}
                  onOpen={item.id === 'payouts-ready' ? onRunPayouts : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── KPI board — big, unhurried numbers ──────────────────────────────

type KpiTile = {
  id: string;
  label: string;
  value: string;
  cur: number | null;
  prior: number | null;
  href: string;
};

function deltaPct(cur: number, prior: number): { text: string; positive: boolean } {
  if (prior === 0) return { text: cur > 0 ? '+∞' : '—', positive: cur >= 0 };
  const pct = ((cur - prior) / prior) * 100;
  const positive = pct >= 0;
  return { text: `${positive ? '+' : ''}${pct.toFixed(1)}%`, positive };
}

function formatKpi(id: string, value: number): string {
  if (id === 'gross' || id === 'net') {
    return value >= 1_000_000
      ? formatUsdCents(value, { maximumFractionDigits: 0 })
      : formatUsdCents(value);
  }
  return value >= 10_000
    ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`
    : value.toLocaleString();
}

function KpiBoard({ kpis }: { kpis: KpisData }) {
  const prior = kpis.prior ?? {};
  const tiles: KpiTile[] = [
    { id: 'gross', label: 'Gross sales', value: formatKpi('gross', kpis.gmvCents), cur: kpis.gmvCents, prior: prior.gmvCents ?? null, href: '/admin/reports?tab=revenue' },
    { id: 'net', label: 'Net revenue', value: formatKpi('net', kpis.netCents), cur: kpis.netCents, prior: prior.netCents ?? null, href: '/admin/reports?tab=revenue' },
    { id: 'orders', label: 'Orders', value: formatKpi('orders', kpis.orderCount), cur: kpis.orderCount, prior: prior.orderCount ?? null, href: '/admin/orders' },
    { id: 'newFans', label: 'New fans', value: formatKpi('newFans', kpis.newSignups), cur: kpis.newSignups, prior: prior.newSignups ?? null, href: '/admin/customers' },
    { id: 'plays', label: 'Plays', value: formatKpi('plays', kpis.plays), cur: kpis.plays, prior: prior.plays ?? null, href: '/admin/reports?tab=plays' },
  ];

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
      data-testid="kpi-strip"
    >
      {tiles.map((t) => {
        const showDelta = t.cur !== null && t.prior !== null;
        const d = showDelta ? deltaPct(t.cur as number, t.prior as number) : null;
        return (
          <Link
            key={t.id}
            href={t.href}
            data-testid={`kpi-${t.id}`}
            className="group rounded-2xl bg-white p-6 flex flex-col transition-shadow hover:shadow-sm"
            style={{ border: `1px solid ${HAIRLINE}` }}
          >
            <div className="text-[13px] font-medium" style={{ color: SUBINK }}>
              {t.label}
            </div>
            <div
              className="mt-3 tabular-nums"
              style={{
                fontSize: 38,
                lineHeight: 1,
                fontWeight: 600,
                letterSpacing: '-0.03em',
                color: INK,
              }}
            >
              {t.value}
            </div>
            {d && (
              <div className="mt-3 flex items-center gap-1.5 text-[13px]">
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: d.positive ? '#1c8a5b' : '#e0245e' }}
                >
                  {d.text}
                </span>
                <span style={{ color: SUBINK }}>vs prior</span>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Trend chart — a single, generous, softly-filled area ────────────

type ChartMetric = 'gmv' | 'orders' | 'signups' | 'plays';

function TrendChart({ kpis, prior }: { kpis: KpisData; prior: KpisData }) {
  const [metric, setMetric] = useState<ChartMetric>('gmv');
  const series = kpis.series ?? [];
  const priorSeries = prior.series ?? [];

  const merged = useMemo(() => {
    return series.map((s, i) => {
      const p = priorSeries[i];
      const key =
        metric === 'gmv'
          ? 'gmvCents'
          : metric === 'orders'
            ? 'orders'
            : metric === 'signups'
              ? 'signups'
              : 'plays';
      const currentVal = (s as Record<string, number | string>)[key];
      const priorVal = p ? (p as Record<string, number | string>)[key] : undefined;
      return {
        date: s.date ?? '',
        current: typeof currentVal === 'number' ? currentVal : 0,
        prior: typeof priorVal === 'number' ? priorVal : null,
      };
    });
  }, [series, priorSeries, metric]);

  const isCurrency = metric === 'gmv';
  const opts: Array<{ v: ChartMetric; label: string }> = [
    { v: 'gmv', label: 'GMV' },
    { v: 'orders', label: 'Orders' },
    { v: 'signups', label: 'New fans' },
    { v: 'plays', label: 'Plays' },
  ];

  return (
    <div
      className="rounded-2xl bg-white p-7 h-full flex flex-col"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-trend-chart"
    >
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h3 className="text-[20px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
            The last 30 days.
          </h3>
          <p className="text-[13.5px] mt-0.5" style={{ color: SUBINK }}>
            This period, measured against the one before.
          </p>
        </div>
        <div
          className="inline-flex items-center p-1 rounded-full"
          style={{ backgroundColor: '#f0f0f2', gap: 2 }}
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
                className="px-3 h-7 text-[12.5px] rounded-full transition-all"
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? INK : SUBINK,
                  backgroundColor: active ? '#ffffff' : 'transparent',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-[280px] flex flex-col">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="appleTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BLUE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#c7c7cc"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(v: string) => (v ? v.slice(5) : '')}
            />
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
            <Area
              type="monotone"
              dataKey="prior"
              stroke="#c7c7cc"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="none"
              dot={false}
              name="Prior period"
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="current"
              stroke={BLUE}
              strokeWidth={2.5}
              fill="url(#appleTrendFill)"
              dot={false}
              name="This period"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Recent activity ─────────────────────────────────────────────────

type FeedKind =
  | 'order'
  | 'signup'
  | 'payout'
  | 'artist'
  | 'client'
  | 'npo'
  | 'reseller'
  | 'project';

type FeedCategory = 'sales' | 'growth' | 'ops';

const KIND_CATEGORY: Record<FeedKind, FeedCategory> = {
  order: 'sales',
  payout: 'ops',
  signup: 'growth',
  artist: 'growth',
  client: 'growth',
  npo: 'growth',
  reseller: 'growth',
  project: 'growth',
};

interface FeedItem {
  kind: FeedKind;
  ts: Date;
  title: string;
  detail: string;
  href: string;
  art?: string;
  artId?: string;
  avatar?: string;
  avatarPad?: boolean;
}

const FEED_ICON: Record<
  FeedKind,
  { Icon: typeof ShoppingBag; color: string }
> = {
  order: { Icon: ShoppingBag, color: SUBINK },
  payout: { Icon: Banknote, color: SUBINK },
  signup: { Icon: UserPlus, color: BLUE },
  artist: { Icon: Mic2, color: BLUE },
  client: { Icon: Factory, color: BLUE },
  npo: { Icon: HeartHandshake, color: '#1c8a5b' },
  reseller: { Icon: Store, color: BLUE },
  project: { Icon: Disc3, color: BLUE },
};

// Icon tiles are reserved for impersonal events (rounded squares).
function ActivityIcon({ kind }: { kind: FeedKind }) {
  const map = FEED_ICON[kind];
  const Icon = map.Icon;
  return (
    <span
      className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#f2f2f5' }}
    >
      <Icon className="w-4 h-4" style={{ color: map.color }} />
    </span>
  );
}

const MOCK_GROWTH_EVENTS: FeedItem[] = [
  {
    kind: 'artist',
    ts: new Date(Date.now() - 26 * 60_000),
    title: 'New artist onboarded — Niina Soleil',
    detail: 'Ready to publish their first project',
    href: '/admin/people',
    avatar: niinaPhoto,
  },
  {
    kind: 'client',
    ts: new Date(Date.now() - 95 * 60_000),
    title: 'Memphis Record Pressing added a client',
    detail: 'The Foxglove Set',
    href: '/admin/partners',
    avatar: mrpLogo,
    avatarPad: true,
  },
  {
    kind: 'client',
    ts: new Date(Date.now() - 340 * 60_000),
    title: 'Memphis Record Pressing joined as a pressing partner',
    detail: 'Memphis, TN',
    href: '/admin/partners',
    avatar: mrpLogo,
    avatarPad: true,
  },
  {
    kind: 'npo',
    ts: new Date(Date.now() - 180 * 60_000),
    title: 'Harmony Foundation (NPO) accepted your invite',
    detail: 'Payouts can now be enabled',
    href: '/admin/partners',
  },
  {
    kind: 'reseller',
    ts: new Date(Date.now() - 300 * 60_000),
    title: 'New reseller joined — Spin Alley Records',
    detail: 'Awaiting first catalog assignment',
    href: '/admin/partners',
  },
  {
    kind: 'project',
    ts: new Date(Date.now() - 20 * 60_000),
    title: 'New project added — CALIFORNIALAND',
    detail: 'Niina Soleil',
    href: '/admin/projects',
    art: californialandCover,
    artId: 'p-californialand',
  },
];

const FEED_CHIPS: Array<{ v: 'all' | FeedCategory; label: string }> = [
  { v: 'all', label: 'All' },
  { v: 'sales', label: 'Sales' },
  { v: 'growth', label: 'Added' },
  { v: 'ops', label: 'Ops' },
];

function ActivityFeed({
  orders,
  customers,
}: {
  orders: OrderRow[];
  customers: CustomerRow[];
}) {
  const [filter, setFilter] = useState<'all' | FeedCategory>('all');

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    for (const o of orders) {
      if (o.status === 'paid' || o.status === 'shipped') {
        const ts = o.createdAt ? new Date(o.createdAt) : null;
        if (ts) {
          out.push({
            kind: 'order',
            ts,
            title: `${o.customerName || o.customerEmail} bought ${o.albumTitle}`,
            detail: `${o.albumArtist} · ${fmtUsd(o.totalCents)}`,
            href: '/admin/orders',
          });
        }
      }
      if (o.payoutStatus === 'transferred' && o.payoutTransferredAt && o.payoutAmountCents) {
        out.push({
          kind: 'payout',
          ts: new Date(o.payoutTransferredAt),
          title: `Payout sent · ${fmtUsd(o.payoutAmountCents)}`,
          detail: `${o.albumArtist} — ${o.albumTitle}`,
          href: '/admin/reports',
        });
      }
    }
    for (const c of customers) {
      if (!c.createdAt) continue;
      out.push({
        kind: 'signup',
        ts: new Date(c.createdAt),
        title: `${c.displayName || c.username || c.realName || c.email} joined`,
        detail: c.email,
        href: `/admin/customers/${c.id}`,
      });
    }
    for (const g of MOCK_GROWTH_EVENTS) out.push(g);
    out.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    return out;
  }, [orders, customers]);

  const visible = useMemo(
    () =>
      (filter === 'all'
        ? items
        : items.filter((it) => KIND_CATEGORY[it.kind] === filter)
      ).slice(0, 14),
    [items, filter],
  );

  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-activity-feed"
    >
      <h3 className="text-[20px] font-semibold flex-shrink-0" style={{ color: INK, letterSpacing: '-0.01em' }}>
        As it happens.
      </h3>

      <div
        className="flex items-center gap-2 mt-4 mb-3 flex-shrink-0"
        role="tablist"
        aria-label="Filter activity"
      >
        {FEED_CHIPS.map((chip) => {
          const active = filter === chip.v;
          return (
            <button
              key={chip.v}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(chip.v)}
              data-testid={`activity-chip-${chip.v}`}
              className="px-3 h-7 rounded-full text-[12.5px] transition-colors"
              style={{
                fontWeight: active ? 600 : 500,
                color: active ? '#ffffff' : SUBINK,
                backgroundColor: active ? INK : '#f2f2f5',
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto -mx-1.5 px-1.5">
        {visible.length === 0 ? (
          <li className="px-1.5 py-8 text-center text-[13px]" style={{ color: SUBINK }}>
            No activity in this category yet.
          </li>
        ) : (
          visible.map((it, i) => (
            <li key={`${it.kind}-${i}`} data-testid={`activity-${it.kind}-${i}`}>
              <Link
                href={it.href}
                className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {it.avatar ? (
                  // People → face photo on a circle; partner logos → WHITE
                  // circle, object-contain, slight inline padding, never recolored.
                  <span
                    className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-white"
                    style={{ border: `1px solid ${HAIRLINE}` }}
                  >
                    <img
                      src={it.avatar}
                      alt=""
                      className="w-full h-full"
                      style={
                        it.avatarPad
                          ? { objectFit: 'contain', padding: '3px' }
                          : { objectFit: 'cover' }
                      }
                    />
                  </span>
                ) : it.kind === 'project' ? (
                  <ProjectThumb id={it.artId ?? it.href} art={it.art} size="sm" />
                ) : (
                  <ActivityIcon kind={it.kind} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] truncate" style={{ color: INK }}>
                    {it.title}
                  </div>
                  <div className="text-[12px] truncate" style={{ color: SUBINK }}>
                    {it.detail}
                  </div>
                </div>
                <div className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: '#a1a1a6' }}>
                  {fmtRel(it.ts)}
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ─── Ranked lists (Top projects · Sales by press) ────────────────────

type RankRow = {
  id: string;
  title: string;
  subtitle: string;
  revenueCents: number;
  units: number;
  deltaPct: number;
  art?: string;
  logo?: string;
};

// Projects get a small ROUNDED-RECT thumbnail; presses get a CIRCLE logo.
const THUMB_GRADIENTS: Array<[string, string]> = [
  ['#319ED8', '#1E5F8C'],
  ['#5B8DEF', '#7F10A7'],
  ['#0EA5A5', '#0F766E'],
  ['#F97362', '#B91C4B'],
  ['#F5A623', '#C2410C'],
  ['#8B5CF6', '#4338CA'],
];

function gradientFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return THUMB_GRADIENTS[h % THUMB_GRADIENTS.length];
}

function ProjectThumb({
  id,
  art,
  size = 'md',
}: {
  id: string;
  art?: string;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'w-9 h-9 rounded-lg' : 'w-11 h-11 rounded-xl';
  if (art) {
    return (
      <span
        className={cn('overflow-hidden flex-shrink-0', dim)}
        style={{ border: `1px solid ${HAIRLINE}` }}
      >
        <img src={art} alt="" className="w-full h-full object-cover" />
      </span>
    );
  }
  const [from, to] = gradientFor(id);
  return (
    <span
      className={cn('flex-shrink-0', dim)}
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
      }}
      aria-hidden="true"
    />
  );
}

// Press partner logo — always a WHITE CIRCLE, object-contain + padding,
// never recolored.
function PressAvatar({ logo, size = 'md' }: { logo?: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  return (
    <span
      className={cn('rounded-full overflow-hidden flex-shrink-0 bg-white', dim)}
      style={{ border: `1px solid ${HAIRLINE}` }}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          className="w-full h-full"
          style={{ objectFit: 'contain', padding: '4px' }}
        />
      ) : null}
    </span>
  );
}

const MOCK_TOP_PROJECTS: RankRow[] = [
  { id: 'p-californialand', title: 'CALIFORNIALAND', subtitle: 'Niina Soleil', revenueCents: 984000, units: 231, deltaPct: 18.4, art: californialandCover },
  { id: 'p-nightswim', title: 'Nightswim', subtitle: 'Ivy & The Lanterns', revenueCents: 712000, units: 168, deltaPct: 12.1 },
  { id: 'p-slow-static', title: 'Slow Static', subtitle: 'Harbor Lights', revenueCents: 546000, units: 149, deltaPct: 6.7 },
  { id: 'p-weekend-drive', title: 'Weekend Drive', subtitle: 'Cassette Season', revenueCents: 418000, units: 121, deltaPct: -3.2 },
  { id: 'p-paper-moon', title: 'Paper Moon', subtitle: 'The Foxglove Set', revenueCents: 309000, units: 98, deltaPct: 4.5 },
];

const MOCK_SALES_BY_PRESS: RankRow[] = [
  { id: 'press-mrp', title: 'Memphis Record Pressing', subtitle: 'Memphis, TN', revenueCents: 1248000, units: 372, deltaPct: 14.9, logo: mrpLogo },
  { id: 'press-hellbender', title: 'Hellbender Vinyl', subtitle: 'Pittsburgh, PA', revenueCents: 926000, units: 288, deltaPct: 8.2, logo: pressHellbender },
  { id: 'press-pmp', title: 'Physical Music Products', subtitle: 'Nashville, TN', revenueCents: 654000, units: 201, deltaPct: 2.1, logo: pressPmp },
  { id: 'press-pressing-business', title: 'Pressing Business', subtitle: 'Denver, CO', revenueCents: 503700, units: 190, deltaPct: -6.8, logo: pressPressingBusiness },
];

function RankedRow({
  row,
  rank,
  max,
  variant,
}: {
  row: RankRow;
  rank: number;
  max: number;
  variant: 'project' | 'press';
}) {
  const pct = max > 0 ? Math.max(4, Math.round((row.revenueCents / max) * 100)) : 0;
  const positive = row.deltaPct >= 0;
  return (
    <li data-testid={`rank-row-${row.id}`}>
      <Link
        href="/admin/reports"
        className="block -mx-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3.5">
          <span
            className="text-[13px] font-semibold tabular-nums w-4 flex-shrink-0 text-right"
            style={{ color: '#c7c7cc' }}
          >
            {rank}
          </span>
          {variant === 'press' ? (
            <PressAvatar logo={row.logo} />
          ) : (
            <ProjectThumb id={row.id} art={row.art} />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium truncate" style={{ color: INK }}>
              {row.title}
            </div>
            <div className="text-[12.5px] truncate" style={{ color: SUBINK }}>
              {row.subtitle}
            </div>
          </div>
          <span className="text-[15px] font-semibold tabular-nums flex-shrink-0 pl-2" style={{ color: INK }}>
            {fmtUsd(row.revenueCents)}
          </span>
        </div>
        {/* Bar indents to align exactly with the title text:
            rank (16) + gap (14) + avatar (44) + gap (14) = 88 */}
        <div className="flex items-center gap-3 mt-2.5" style={{ paddingLeft: 88 }}>
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: '#f0f0f2' }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: BLUE }}
            />
          </div>
          <span className="text-[12px] tabular-nums flex-shrink-0 w-16 text-right" style={{ color: SUBINK }}>
            {fmtNum(row.units)} units
          </span>
          <span
            className="text-[12px] font-semibold tabular-nums flex-shrink-0 w-14 text-right"
            style={{ color: positive ? '#1c8a5b' : '#e0245e' }}
          >
            {positive ? '+' : ''}
            {row.deltaPct.toFixed(1)}%
          </span>
        </div>
      </Link>
    </li>
  );
}

function RankedListPanel({
  lead,
  rest,
  rows,
  testId,
  variant,
}: {
  lead: string;
  rest: string;
  rows: RankRow[];
  testId: string;
  variant: 'project' | 'press';
}) {
  const max = Math.max(...rows.map((r) => r.revenueCents), 1);
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid={testId}
    >
      <div className="flex items-end justify-between gap-3 mb-4 flex-shrink-0">
        <h3 className="text-[20px] font-semibold" style={{ letterSpacing: '-0.01em' }}>
          <span style={{ color: INK }}>{lead} </span>
          <span style={{ color: SUBINK, fontWeight: 500 }}>{rest}</span>
        </h3>
        <Link
          href="/admin/reports"
          className="text-[13.5px] font-medium flex-shrink-0 transition-opacity hover:opacity-70"
          style={{ color: BLUE }}
        >
          View all
        </Link>
      </div>
      <ul className="space-y-0.5">
        {rows.map((row, i) => (
          <RankedRow key={row.id} row={row} rank={i + 1} max={max} variant={variant} />
        ))}
      </ul>
    </div>
  );
}

// ─── Payouts drawer (opened from the queue / header) ─────────────────

function PayoutsPreview({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const data = MOCK_REFERRAL_PAYOUTS;
  if (!open) return null;
  return (
    <section
      className="rounded-2xl bg-white overflow-hidden"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="payouts-preview"
    >
      <div
        className="flex items-start justify-between gap-4 px-6 py-5"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <div className="min-w-0">
          <h3 className="text-[18px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
            Referral payouts — {fmtUsd(data.totalCents)} across {data.payableCount} payee
            {data.payableCount === 1 ? '' : 's'}
          </h3>
          <p className="text-[13.5px] mt-1" style={{ color: SUBINK }}>
            Stripe Transfers to artists, ambassadors, and non-profits with connected payouts.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" variant="ghost" onClick={onClose} style={{ color: SUBINK }}>
            Close
          </Button>
          <button
            type="button"
            className="inline-flex items-center text-[14px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: BLUE }}
            data-testid="button-run-payouts"
          >
            Run payouts
          </button>
        </div>
      </div>
      <ul>
        {data.batches.map((b, idx) => {
          const isBlocked = !b.stripeAccountId || !b.payoutsEnabled;
          const reason = !b.stripeAccountId
            ? 'No connected Stripe account'
            : !b.payoutsEnabled
              ? 'Payouts not enabled on Stripe'
              : null;
          return (
            <li
              key={`${b.ownerKind}-${b.ownerId}`}
              className="px-6 py-4 flex items-center gap-4"
              style={idx > 0 ? { borderTop: `1px solid ${HAIRLINE}` } : undefined}
              data-testid={`row-referral-payout-${b.ownerKind}-${b.ownerId}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-medium truncate" style={{ color: INK }}>
                  {b.ownerName || `(unnamed ${b.ownerKind})`}
                  <span className="ml-2 text-[11px] uppercase tracking-wide" style={{ color: '#a1a1a6' }}>
                    {b.ownerKind}
                  </span>
                </div>
                <div className="text-[12.5px] mt-0.5" style={{ color: SUBINK }}>
                  {b.creditIds.length} credit{b.creditIds.length === 1 ? '' : 's'} · {b.units} unit
                  {b.units === 1 ? '' : 's'}
                  {reason ? <span style={{ color: '#c98a00' }}> · {reason}</span> : null}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[15px] font-semibold tabular-nums" style={{ color: INK }}>
                  {fmtUsd(b.totalCents)}
                </div>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold mt-1"
                  style={
                    isBlocked
                      ? { backgroundColor: '#fdf6e8', color: '#c98a00' }
                      : { backgroundColor: '#eaf7f0', color: '#1c8a5b' }
                  }
                >
                  {isBlocked ? 'Blocked' : 'Ready'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Stub shell (nav + logo copied; re-skinned Apple-calm) ───────────

type NavLeaf = { label: string; icon?: typeof LayoutDashboard; count?: number };
type NavEntry =
  | { kind: 'item'; label: string; icon?: typeof LayoutDashboard; count?: number }
  | { kind: 'group'; label: string; defaultOpen?: boolean; items: NavLeaf[] };

const NAV_MODEL: NavEntry[] = [
  { kind: 'item', label: 'Dashboard', icon: LayoutDashboard },
  { kind: 'item', label: 'People', icon: Users, count: 223 },
  {
    kind: 'group',
    label: 'Catalog',
    defaultOpen: true,
    items: [
      { label: 'Projects', icon: Disc3, count: 80 },
      { label: 'Gear', icon: Guitar, count: 51 },
      { label: 'Custom add-ons', icon: PackagePlus },
    ],
  },
  {
    kind: 'group',
    label: 'Partners',
    items: [
      { label: 'Labels', icon: Tags },
      { label: 'Managers', icon: Briefcase },
      { label: 'NPOs', icon: HeartHandshake },
      { label: 'Presses', icon: Factory },
      { label: 'Makers', icon: Hammer },
      { label: 'Resellers', icon: Store },
      { label: 'Fulfillment', icon: Truck },
    ],
  },
  {
    kind: 'group',
    label: 'Queues',
    items: [
      { label: 'Press orders', icon: ListOrdered },
      { label: 'Fan orders', icon: ShoppingBag },
      { label: 'Cert names', icon: BadgeCheck },
      { label: 'Jobs', icon: ListChecks },
      { label: 'Feedback', icon: MessageSquare },
    ],
  },
  { kind: 'group', label: 'Audience', items: [{ label: 'Customers', icon: Users }] },
  { kind: 'item', label: 'Reports', icon: BarChart3 },
  { kind: 'item', label: 'GoodDeed®', icon: DollarSign },
  { kind: 'item', label: 'Publishing', icon: BookOpen },
  {
    kind: 'group',
    label: 'System',
    items: [
      { label: 'Platform pricing', icon: DollarSign },
      { label: 'Payment requests', icon: Receipt },
      { label: 'Invites', icon: Mail },
    ],
  },
];

function NavRow({
  label,
  icon: Icon,
  count,
  active,
  indent,
}: {
  label: string;
  icon?: typeof LayoutDashboard;
  count?: number;
  active?: boolean;
  indent?: boolean;
}) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        // NOTE: arbitrary classes (bg-black/[0.04]) silently fail in this
        // sandbox — stick to standard utilities for the hover tint.
        !active && 'hover:bg-slate-200',
        indent && 'ml-4',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        // Active row = raised white pill on the gray rail — same treatment
        // as the segmented controls in the dashboard. Leave background
        // undefined when inactive: an inline `transparent` would override
        // the hover:bg-* class (inline styles always win).
        backgroundColor: active ? '#ffffff' : undefined,
        boxShadow: active
          ? '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)'
          : undefined,
      }}
    >
      {Icon ? (
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}
      <span className="truncate flex-1">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[11.5px] tabular-nums" style={{ color: '#a1a1a6' }}>{count}</span>
      )}
    </a>
  );
}

const ADMIN_USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-9 h-9 rounded-full text-white text-[13px] font-semibold flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 transition-shadow"
          style={{ backgroundColor: INK }}
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          BG
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0"
        data-testid="menu-user"
      >
        <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="text-[14px] font-semibold" style={{ color: INK }}>Bill G.</div>
          <div className="text-[12px] truncate" style={{ color: SUBINK }}>bill@goodtunes.co</div>
        </div>
        <div className="py-1">
          {ADMIN_USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-4 h-9 text-[13.5px] hover:bg-slate-50 transition-colors"
                style={{ color: INK }}
                data-testid={`menu-item-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-4 h-9 text-[13.5px] hover:bg-slate-50 transition-colors"
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

function StubShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NAV_MODEL.filter((e) => e.kind === 'group').map((g) => [
        g.label,
        !!(g as Extract<NavEntry, { kind: 'group' }>).defaultOpen,
      ]),
    ),
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setAtBottom(entry.isIntersecting),
      { threshold: 0.99 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      className="h-screen overflow-hidden flex flex-col font-sans"
      style={{ backgroundColor: CANVAS, color: INK }}
    >
      {/* Sticky, translucent, blurred top bar — inline styles (Tailwind
          backdrop utilities are unreliable in this sandbox). */}
      <header
        className="h-16 flex-shrink-0 flex items-center justify-between gap-4 pl-4 pr-8 sticky top-0 z-40"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center min-w-0">
          <img
            src={goodtunesLogo}
            alt="GoodTunes"
            className="h-7 w-auto object-contain flex-shrink-0"
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            aria-label="Notifications"
          >
            <Bell className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Apple-style rail: quiet gray surface (like System Settings),
            white raised pill on the active item, no hard chrome. */}
        <aside
          className="w-64 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: '#f5f5f7', borderRight: `1px solid ${HAIRLINE}` }}
        >
          <div className="px-3 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: '#a1a1a6' }} />
              <input
                className="w-full h-9 pl-9 pr-2 rounded-full text-[13px] focus:outline-none"
                style={{
                  backgroundColor: '#ffffff',
                  color: INK,
                  border: `1px solid ${HAIRLINE}`,
                }}
                placeholder="Search admin…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-3 pt-3 pb-4 space-y-0.5 overflow-y-auto">
            {NAV_MODEL.map((entry) =>
              entry.kind === 'item' ? (
                <NavRow
                  key={entry.label}
                  label={entry.label}
                  icon={entry.icon}
                  count={entry.count}
                  active={entry.label === 'Dashboard'}
                />
              ) : (
                <div key={entry.label}>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [entry.label]: !o[entry.label] }))}
                    className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13.5px] font-medium transition-colors hover:bg-slate-200"
                    style={{ color: SUBINK }}
                  >
                    {open[entry.label] ? (
                      <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                    )}
                    <span className="truncate">{entry.label}</span>
                  </button>
                  {open[entry.label] && (
                    <div className="space-y-0.5 mt-0.5">
                      {entry.items.map((item) => (
                        <NavRow
                          key={item.label}
                          label={item.label}
                          icon={item.icon}
                          count={item.count}
                          indent
                        />
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col relative">
          <div className="flex-1 min-h-0 overflow-y-auto relative" data-testid="scroll-viewport">
            <div className="mx-auto w-full max-w-[1240px] px-8 sm:px-12 pt-12 pb-20">
              {children}
              <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
            </div>
          </div>

          <div
            aria-hidden="true"
            data-testid="scroll-fade"
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-16 transition-opacity duration-300',
              atBottom ? 'opacity-0' : 'opacity-100',
            )}
            style={{
              backgroundImage: `linear-gradient(to top, ${CANVAS}, transparent)`,
            }}
          />
        </main>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export function AdminDashboardApple() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [payoutsOpen, setPayoutsOpen] = useState(false);

  const kpis = MOCK_KPIS;
  const priorKpis = MOCK_PRIOR_KPIS;
  const ops = MOCK_OPS;
  const payouts = MOCK_REFERRAL_PAYOUTS;
  const recentOrders = MOCK_ORDERS;
  const recentCustomers = MOCK_CUSTOMERS;

  const openItems = buildQueue(ops, payouts).length;

  return (
    <StubShell>
      <div className="flex flex-col gap-20">
        {/* HERO — a huge, unhurried Apple-store headline */}
        <section className="flex flex-col gap-8">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1
                data-testid="heading-admin-dashboard"
                style={{
                  fontSize: 30,
                  lineHeight: 1.12,
                  letterSpacing: '-0.03em',
                  fontWeight: 600,
                  color: INK,
                }}
              >
                {timeGreeting()}, Bill.
              </h1>
              <p
                className="mt-1"
                style={{
                  fontSize: 14,
                  lineHeight: 1.4,
                  letterSpacing: '-0.01em',
                  fontWeight: 400,
                  color: SUBINK,
                }}
              >
                {openItems > 0 ? (
                  <>
                    <span style={{ color: INK, fontWeight: 500 }}>
                      {openItems} thing{openItems === 1 ? '' : 's'}
                    </span>{' '}
                    need you before anything else.
                  </>
                ) : (
                  'Nothing needs you right now — the store is running clean.'
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <RangeSwitcher value={range} onChange={setRange} />
              <button
                type="button"
                onClick={() => setPayoutsOpen((v) => !v)}
                className="inline-flex items-center gap-2 text-[14px] font-medium rounded-full px-5 h-10 text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: BLUE }}
                data-testid="button-header-run-payouts"
              >
                <Banknote className="w-4 h-4" />
                Run payouts
              </button>
            </div>
          </div>

          {/* The work queue — calm attention cards */}
          <WorkQueue
            ops={ops}
            payouts={payouts}
            onRunPayouts={() => setPayoutsOpen(true)}
          />

          {/* Payouts preview (opens from the queue / header) */}
          <PayoutsPreview open={payoutsOpen} onClose={() => setPayoutsOpen(false)} />
        </section>

        {/* THE NUMBERS — big, elegant KPI board */}
        <section className="flex flex-col gap-6">
          <SectionHeading lead="The numbers." rest="At a glance." />
          <KpiBoard kpis={kpis} />
        </section>

        {/* THE STORY — trend + live activity */}
        <section className="flex flex-col gap-6">
          <SectionHeading lead="The story." rest="How the last month moved." />
          <div
            className="grid gap-6 items-stretch"
            style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}
          >
            <div className="min-h-0">
              <TrendChart kpis={kpis} prior={priorKpis} />
            </div>
            {/* Feed matches the chart card's height exactly: the cell is
                relative and the feed fills it absolutely, scrolling inside. */}
            <div className="relative min-h-0">
              <div className="absolute inset-0">
                <ActivityFeed orders={recentOrders} customers={recentCustomers} />
              </div>
            </div>
          </div>
        </section>

        {/* WHO'S WINNING — ranked projects + sales by press */}
        <section className="flex flex-col gap-6">
          <SectionHeading lead="Who's winning." rest="The catalog and the presses behind it." />
          <div
            className="grid gap-6 items-stretch"
            style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}
          >
            <div className="min-h-0">
              <RankedListPanel
                lead="Top projects."
                rest="By revenue."
                rows={MOCK_TOP_PROJECTS}
                testId="panel-top-projects"
                variant="project"
              />
            </div>
            <div className="min-h-0">
              <RankedListPanel
                lead="Sales by press."
                rest="Your partners."
                rows={MOCK_SALES_BY_PRESS}
                testId="panel-sales-by-press"
                variant="press"
              />
            </div>
          </div>
        </section>
      </div>
    </StubShell>
  );
}

export default AdminDashboardApple;
