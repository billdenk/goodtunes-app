// PressDashboardAllDark — proposed super-admin "Press Dashboard" (ALL presses
// combined), built to be at least as robust as the individual press page.
// Comparison mock for the current empty aggregate page.
//
// Canon: charcoal surfaces (never navy), GoodTunes blue accent, press logos on
// white circles (never recolored), no emojis, delta pills are translucent
// washes with a +/- sign (never stark white, never color-only), KPI cards
// share one strict internal grid so labels / numbers / footers align.
//
// Also demonstrates the nav-sync fix Bill asked for: we're on Presses, so the
// left rail has Partners OPEN and Presses ACTIVE.

import { useMemo, useState, type ReactNode } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
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
  ShoppingBag,
  PackageCheck,
  Cog,
  Timer,
  Info,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import hellbenderIcon from '../assets/hellbender-icon.svg';
import pmpLogo from '../assets/pmp-icon.svg';
import virylIcon from '../assets/viryl-icon.svg';

// ─── Charcoal night palette (canon) ──────────────────────────────────
const BLUE = '#319ED8';
const INK = '#f5f5f7';
const SUBINK = '#98989d';
const FAINT = '#6e6e73';
const HAIRLINE = 'rgba(255,255,255,0.10)';
const CANVAS = '#161617';
const RAIL = '#1c1c1e';
const CARD = '#1e1e20';
const CARD_SOFT = '#26262a';
const PILL_ACTIVE = '#3a3a3e';
const POS = '#4cc98a';
const NEG = '#ff6b8a';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

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

// ─── Presses ─────────────────────────────────────────────────────────
type PressKey = 'mrp' | 'hellbender' | 'pmp' | 'viryl';

const PRESSES: Array<{
  key: PressKey;
  name: string;
  short: string;
  city: string;
  logo: string;
  color: string; // per-press series tint for the stacked trend
}> = [
  { key: 'mrp', name: 'Memphis Record Pressing', short: 'Memphis', city: 'Memphis, TN', logo: mrpLogo, color: '#319ED8' },
  { key: 'hellbender', name: 'Hellbender Vinyl', short: 'Hellbender', city: 'Pittsburgh, PA', logo: hellbenderIcon, color: '#8B5CF6' },
  { key: 'pmp', name: 'Physical Music Products', short: 'PMP', city: 'Nashville, TN', logo: pmpLogo, color: '#4cc98a' },
  { key: 'viryl', name: 'Viryl Technologies', short: 'Viryl', city: 'Toronto, ON', logo: virylIcon, color: '#e8b04b' },
];

// Per-press mock stats (30d window). MRP mirrors its live individual page.
const PRESS_STATS: Record<
  PressKey,
  {
    grossCents: number;
    orders: number;
    unitsSold: number;
    openJobs: number;
    inProduction: number;
    completed: number;
    unitsPressed: number;
    turnDays: number | null;
    deltaGross: number;
  }
> = {
  mrp: { grossCents: 56786, orders: 9, unitsSold: 10, openJobs: 3, inProduction: 2, completed: 6, unitsPressed: 1240, turnDays: 38, deltaGross: -46.3 },
  hellbender: { grossCents: 128940, orders: 21, unitsSold: 27, openJobs: 5, inProduction: 4, completed: 11, unitsPressed: 2860, turnDays: 31, deltaGross: 22.8 },
  pmp: { grossCents: 84410, orders: 14, unitsSold: 18, openJobs: 2, inProduction: 3, completed: 9, unitsPressed: 1980, turnDays: 44, deltaGross: 9.4 },
  viryl: { grossCents: 40325, orders: 7, unitsSold: 8, openJobs: 1, inProduction: 1, completed: 4, unitsPressed: 760, turnDays: 27, deltaGross: 3.1 },
};

const TOTAL = (() => {
  const keys = Object.keys(PRESS_STATS) as PressKey[];
  const sum = (f: (s: (typeof PRESS_STATS)[PressKey]) => number) =>
    keys.reduce((a, k) => a + f(PRESS_STATS[k]), 0);
  const turns = keys
    .map((k) => PRESS_STATS[k].turnDays)
    .filter((t): t is number => typeof t === 'number');
  return {
    grossCents: sum((s) => s.grossCents),
    orders: sum((s) => s.orders),
    unitsSold: sum((s) => s.unitsSold),
    openJobs: sum((s) => s.openJobs),
    inProduction: sum((s) => s.inProduction),
    completed: sum((s) => s.completed),
    unitsPressed: sum((s) => s.unitsPressed),
    avgTurnDays: turns.length ? Math.round(turns.reduce((a, b) => a + b, 0) / turns.length) : null,
  };
})();

// 30-day stacked series, one lane per press.
function buildTrend() {
  const now = Date.now();
  const out: Array<Record<string, number | string>> = [];
  const base: Record<PressKey, number> = { mrp: 42, hellbender: 96, pmp: 64, viryl: 30 };
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    const row: Record<string, number | string> = { date: d.toISOString().slice(0, 10) };
    (Object.keys(base) as PressKey[]).forEach((k, idx) => {
      const wobble = 0.7 + Math.abs(Math.sin(i * 0.9 + idx * 2.1)) * 0.9;
      const lift = i < 6 ? 1.5 : 1; // the recent bump Bill sees on MRP's page
      row[k] = Math.round(base[k] * wobble * lift * 100); // cents
    });
    out.push(row);
  }
  return out;
}
const TREND = buildTrend();

// Activity across all presses, press-attributed.
type ActKind = 'sale' | 'job' | 'complete';
const ACT_ICON: Record<ActKind, { Icon: typeof ShoppingBag; color: string }> = {
  sale: { Icon: ShoppingBag, color: BLUE },
  job: { Icon: Cog, color: SUBINK },
  complete: { Icon: PackageCheck, color: POS },
};

const ACTIVITY: Array<{
  kind: ActKind;
  press: PressKey;
  title: string;
  detail: string;
  when: string;
}> = [
  { kind: 'sale', press: 'mrp', title: 'Philip Tite bought Hope', detail: 'Nightbirde · $98.62', when: '15h ago' },
  { kind: 'job', press: 'hellbender', title: 'Job #H-2214 moved to production', detail: 'Golden Hour · 500 units · 12" LP', when: '17h ago' },
  { kind: 'sale', press: 'mrp', title: 'Tracie McGuire bought Hope', detail: 'Nightbirde · $89.87', when: '19h ago' },
  { kind: 'complete', press: 'pmp', title: 'Job #P-887 completed', detail: 'Slow Static · 300 units · shipped to fulfillment', when: '1d ago' },
  { kind: 'sale', press: 'hellbender', title: 'Renata Cruz bought Deep Cuts, Vol. II', detail: 'Harbor Lights · $62.00', when: '1d ago' },
  { kind: 'job', press: 'viryl', title: 'Job #V-104 opened', detail: 'Paper Moon · 250 units · 7" single', when: '2d ago' },
  { kind: 'sale', press: 'pmp', title: 'Peter Malek bought Hope', detail: 'Nightbirde · $35.31', when: '2d ago' },
  { kind: 'complete', press: 'hellbender', title: 'Job #H-2190 completed', detail: 'Nightswim · 1,000 units · test pressings approved', when: '3d ago' },
];

// ─── Small shared pieces ─────────────────────────────────────────────

function PressAvatar({ logo, size = 36 }: { logo: string; size?: number }) {
  return (
    <span
      className="rounded-full overflow-hidden flex-shrink-0 bg-white inline-flex"
      style={{ width: size, height: size, border: `1px solid ${HAIRLINE}` }}
    >
      <img src={logo} alt="" className="w-full h-full" style={{ objectFit: 'contain', padding: 4 }} />
    </span>
  );
}

// Delta chip — translucent wash + sign, NEVER a stark white pill, never
// color-only (the +/- sign carries the meaning).
function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[12px]" style={{ color: FAINT }}>vs prior: {DASH}</span>;
  const positive = pct >= 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: SUBINK }}>
      vs prior
      <span
        className="inline-flex items-center px-2 h-[20px] rounded-full font-semibold tabular-nums text-[11.5px]"
        style={{
          color: positive ? POS : NEG,
          backgroundColor: positive ? 'rgba(76,201,138,0.14)' : 'rgba(255,107,138,0.14)',
        }}
      >
        {positive ? '+' : ''}
        {pct.toFixed(1)}%
      </span>
    </span>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 72, height: 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="none" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// KPI card on a strict internal grid: label row (fixed), value row (fixed
// baseline), footer row pinned to the bottom — so six cards in a row align
// perfectly no matter how much helper text each one carries.
function KpiCard({
  label,
  value,
  delta,
  spark,
  note,
}: {
  label: string;
  value: string;
  delta: number | null;
  spark?: number[];
  note?: string;
}) {
  return (
    <div
      className="rounded-2xl flex flex-col"
      style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, padding: 20, minHeight: 150 }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase" style={{ color: SUBINK, letterSpacing: '0.08em' }}>
          {label}
        </span>
        <Info className="w-3 h-3" style={{ color: FAINT }} />
      </div>
      <div
        className="tabular-nums"
        style={{ fontSize: 30, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.02em', color: INK, marginTop: 14 }}
      >
        {value}
      </div>
      {note ? (
        <div className="text-[11.5px] leading-snug" style={{ color: FAINT, marginTop: 6 }}>
          {note}
        </div>
      ) : null}
      <div className="flex items-end justify-between gap-2 mt-auto" style={{ paddingTop: 12 }}>
        <DeltaChip pct={delta} />
        {spark ? <Sparkline data={spark} color={BLUE} /> : <span />}
      </div>
    </div>
  );
}

// ─── Rail (nav-sync demo: Partners OPEN, Presses ACTIVE) ─────────────

type NavLeaf = { label: string; icon?: typeof LayoutDashboard; count?: number; active?: boolean };
type NavEntry =
  | { kind: 'item'; label: string; icon?: typeof LayoutDashboard; count?: number }
  | { kind: 'group'; label: string; open?: boolean; items: NavLeaf[] };

const NAV: NavEntry[] = [
  { kind: 'item', label: 'Dashboard', icon: LayoutDashboard },
  { kind: 'item', label: 'People', icon: Users, count: 223 },
  {
    kind: 'group',
    label: 'Catalog',
    items: [
      { label: 'Projects', icon: Disc3, count: 80 },
      { label: 'Gear', icon: Guitar, count: 51 },
      { label: 'Custom add-ons', icon: PackagePlus },
    ],
  },
  {
    kind: 'group',
    label: 'Partners',
    open: true,
    items: [
      { label: 'Labels', icon: Tags },
      { label: 'Managers', icon: Briefcase },
      { label: 'NPOs', icon: HeartHandshake },
      { label: 'Presses', icon: Factory, active: true },
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

function NavRow({ label, icon: Icon, count, active, indent }: NavLeaf & { indent?: boolean }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && 'hover:bg-white/5',
        indent && 'ml-4',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? PILL_ACTIVE : undefined,
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)' : undefined,
      }}
    >
      {Icon ? (
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : FAINT }} />
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}
      <span className="truncate flex-1">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[11.5px] tabular-nums" style={{ color: FAINT }}>{count}</span>
      )}
    </a>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen overflow-hidden flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <header
        className="h-16 flex-shrink-0 flex items-center justify-between gap-4 pl-4 pr-8 sticky top-0 z-40"
        style={{
          backgroundColor: 'rgba(22,22,23,0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <img
          src={goodtunesLogo}
          alt="GoodTunes"
          className="h-7 w-auto object-contain flex-shrink-0"
          style={{ filter: 'invert(1) brightness(2)' }}
        />
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: SUBINK }}
            aria-label="Notifications"
          >
            <Bell style={{ width: 18, height: 18 }} />
          </button>
          <span
            className="w-9 h-9 rounded-full text-[13px] font-semibold flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: PILL_ACTIVE, color: INK }}
          >
            BG
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-64 flex-shrink-0 flex flex-col" style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}>
          <div className="px-3 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: FAINT }} />
              <input
                className="w-full h-9 pl-9 pr-2 rounded-full text-[13px] focus:outline-none"
                style={{ backgroundColor: CARD_SOFT, color: INK, border: `1px solid ${HAIRLINE}` }}
                placeholder="Search admin…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-3 pt-3 pb-4 space-y-0.5 overflow-y-auto">
            {NAV.map((entry) =>
              entry.kind === 'item' ? (
                <NavRow key={entry.label} label={entry.label} icon={entry.icon} count={entry.count} />
              ) : (
                <div key={entry.label}>
                  <div
                    className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13.5px] font-medium"
                    style={{ color: SUBINK }}
                  >
                    {entry.open ? (
                      <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FAINT }} />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FAINT }} />
                    )}
                    <span className="truncate">{entry.label}</span>
                  </div>
                  {entry.open && (
                    <div className="space-y-0.5 mt-0.5">
                      {entry.items.map((item) => (
                        <NavRow key={item.label} {...item} indent />
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1240px] px-8 sm:px-12 pt-10 pb-20">{children}</div>
        </main>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

type RangeKey = 'today' | '7d' | '30d' | '90d' | 'all';

function RangeSwitcher({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const opts: Array<{ v: RangeKey; label: string }> = [
    { v: 'today', label: 'Today' },
    { v: '7d', label: '7d' },
    { v: '30d', label: '30d' },
    { v: '90d', label: '90d' },
    { v: 'all', label: 'All' },
  ];
  return (
    <div className="inline-flex items-center p-1 rounded-full" style={{ backgroundColor: CARD_SOFT, gap: 2 }}>
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className="px-3 h-7 text-[12.5px] rounded-full transition-all"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? INK : SUBINK,
              backgroundColor: active ? PILL_ACTIVE : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const SPARK: Record<string, number[]> = {
  gross: [4, 5, 4, 6, 5, 7, 9, 12],
  orders: [2, 3, 2, 4, 3, 5, 6, 8],
  pressed: [30, 34, 31, 38, 36, 44, 52, 60],
};

export function PressDashboardAllDark() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [pressFilter, setPressFilter] = useState<'all' | PressKey>('all');

  const activity = useMemo(
    () => (pressFilter === 'all' ? ACTIVITY : ACTIVITY.filter((a) => a.press === pressFilter)),
    [pressFilter],
  );

  const maxGross = Math.max(...PRESSES.map((p) => PRESS_STATS[p.key].grossCents));

  return (
    <Shell>
      <div className="flex flex-col gap-14">
        {/* Heading */}
        <section className="flex flex-col gap-8">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="inline-flex items-center p-1 rounded-full mb-5" style={{ backgroundColor: CARD_SOFT, gap: 2 }}>
                {(['Dashboard', 'Presses'] as const).map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    className="px-3.5 h-7 text-[12.5px] rounded-full"
                    style={{
                      fontWeight: i === 0 ? 600 : 500,
                      color: i === 0 ? INK : SUBINK,
                      backgroundColor: i === 0 ? PILL_ACTIVE : 'transparent',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <h1 style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.02em', fontWeight: 600 }}>
                <span style={{ color: INK }}>Every press. </span>
                <span style={{ color: SUBINK, fontWeight: 500 }}>One pulse.</span>
              </h1>
              <p className="mt-1 text-[14px]" style={{ color: SUBINK }}>
                All pressing plants combined — {PRESSES.length} presses reporting.
              </p>
            </div>
            <RangeSwitcher value={range} onChange={setRange} />
          </div>

          {/* KPI row — strict grid so every card aligns */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <KpiCard label="Gross sales" value={fmtUsd(TOTAL.grossCents)} delta={4.8} spark={SPARK.gross} note="Across all presses' releases" />
            <KpiCard label="Orders" value={fmtNum(TOTAL.orders)} delta={-8.9} spark={SPARK.orders} />
            <KpiCard label="Units pressed" value={fmtNum(TOTAL.unitsPressed)} delta={12.6} spark={SPARK.pressed} note="Finished units off the line" />
            <KpiCard label="Open jobs" value={fmtNum(TOTAL.openJobs)} delta={null} note={`${TOTAL.inProduction} in production now`} />
            <KpiCard label="Completed" value={fmtNum(TOTAL.completed)} delta={22.0} note="Jobs finished this window" />
            <KpiCard label="Avg turn-time" value={TOTAL.avgTurnDays ? `${TOTAL.avgTurnDays} days` : DASH} delta={null} note="Order to out the door, averaged" />
          </div>
        </section>

        {/* Trend + activity */}
        <section className="flex flex-col gap-6">
          <h2 style={{ fontSize: 22, letterSpacing: '-0.02em', fontWeight: 600 }}>
            <span style={{ color: INK }}>The story. </span>
            <span style={{ color: SUBINK, fontWeight: 500 }}>Every plant, one chart.</span>
          </h2>
          <div className="grid gap-6 items-stretch" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
            {/* Stacked per-press trend */}
            <div className="rounded-2xl p-7 flex flex-col" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
              <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div>
                  <h3 className="text-[17px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
                    Daily sales by press
                  </h3>
                  <p className="text-[12.5px] mt-0.5" style={{ color: SUBINK }}>
                    Stacked — the total is the top line.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {PRESSES.map((p) => (
                    <span key={p.key} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: SUBINK }}>
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                      {p.short}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={TREND} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      stroke={FAINT}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={40}
                      tickFormatter={(v: string) => (v ? v.slice(5) : '')}
                    />
                    <YAxis
                      stroke={FAINT}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tickFormatter={(v: number) => `$${Math.round(v / 100)}`}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [fmtUsd(v), PRESSES.find((p) => p.key === name)?.short ?? name]}
                      cursor={{ stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1 }}
                      contentStyle={{
                        borderRadius: 12,
                        backgroundColor: '#26262a',
                        border: `1px solid ${HAIRLINE}`,
                        boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
                        fontSize: 12,
                        color: INK,
                      }}
                      itemStyle={{ color: INK }}
                      labelStyle={{ color: SUBINK }}
                    />
                    {PRESSES.map((p) => (
                      <Area
                        key={p.key}
                        type="monotone"
                        dataKey={p.key}
                        stackId="1"
                        stroke={p.color}
                        strokeWidth={1.5}
                        fill={p.color}
                        fillOpacity={0.18}
                        dot={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Activity, press-attributed, filterable */}
            <div className="rounded-2xl p-6 flex flex-col min-h-0" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
              <h3 className="text-[17px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
                As it happens.
              </h3>
              <div className="flex items-center gap-2 mt-3 mb-2 flex-wrap">
                {([{ v: 'all' as const, label: 'All' }, ...PRESSES.map((p) => ({ v: p.key, label: p.short }))]).map((chip) => {
                  const active = pressFilter === chip.v;
                  return (
                    <button
                      key={chip.v}
                      type="button"
                      onClick={() => setPressFilter(chip.v)}
                      className="px-2.5 h-6 rounded-full text-[11.5px] transition-colors"
                      style={{
                        fontWeight: active ? 600 : 500,
                        color: active ? CANVAS : SUBINK,
                        backgroundColor: active ? INK : CARD_SOFT,
                      }}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              <ul className="space-y-0.5 flex-1 min-h-0 overflow-y-auto -mx-1.5 px-1.5">
                {activity.map((a, i) => {
                  const press = PRESSES.find((p) => p.key === a.press)!;
                  const { Icon, color } = ACT_ICON[a.kind];
                  return (
                    <li key={i} className="flex items-center gap-3 -mx-1 px-1 py-2 rounded-xl transition-colors hover:bg-white/5">
                      <span className="relative flex-shrink-0">
                        <span
                          className="w-9 h-9 rounded-xl inline-flex items-center justify-center"
                          style={{ backgroundColor: CARD_SOFT }}
                        >
                          <Icon className="w-4 h-4" style={{ color }} />
                        </span>
                        <span className="absolute -bottom-1 -right-1">
                          <PressAvatar logo={press.logo} size={18} />
                        </span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] truncate" style={{ color: INK }}>{a.title}</span>
                        <span className="block text-[11.5px] truncate" style={{ color: SUBINK }}>
                          {press.short} · {a.detail}
                        </span>
                      </span>
                      <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: FAINT }}>{a.when}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Press leaderboard */}
        <section className="flex flex-col gap-6">
          <h2 style={{ fontSize: 22, letterSpacing: '-0.02em', fontWeight: 600 }}>
            <span style={{ color: INK }}>Press by press. </span>
            <span style={{ color: SUBINK, fontWeight: 500 }}>Tap one for its full dashboard.</span>
          </h2>
          <div className="rounded-2xl" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
            {PRESSES.slice()
              .sort((a, b) => PRESS_STATS[b.key].grossCents - PRESS_STATS[a.key].grossCents)
              .map((p, idx) => {
                const s = PRESS_STATS[p.key];
                const pct = Math.max(4, Math.round((s.grossCents / maxGross) * 100));
                return (
                  <a
                    key={p.key}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-white/5"
                    style={idx > 0 ? { borderTop: `1px solid ${HAIRLINE}` } : undefined}
                  >
                    <span className="text-[13px] font-semibold tabular-nums w-4 text-right flex-shrink-0" style={{ color: FAINT }}>
                      {idx + 1}
                    </span>
                    <PressAvatar logo={p.logo} size={40} />
                    <span className="min-w-0" style={{ width: 220 }}>
                      <span className="block text-[14.5px] font-medium truncate" style={{ color: INK }}>{p.name}</span>
                      <span className="block text-[12px] truncate" style={{ color: SUBINK }}>{p.city}</span>
                    </span>
                    <span className="flex-1 min-w-0 px-2">
                      <span className="block h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: CARD_SOFT }}>
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                      </span>
                    </span>
                    <span className="text-[12.5px] tabular-nums w-24 text-right flex-shrink-0" style={{ color: SUBINK }}>
                      {fmtNum(s.unitsPressed)} pressed
                    </span>
                    <span className="text-[12.5px] tabular-nums w-20 text-right flex-shrink-0" style={{ color: SUBINK }}>
                      {s.openJobs} open
                    </span>
                    <span className="text-[12.5px] tabular-nums w-20 text-right flex-shrink-0" style={{ color: SUBINK }}>
                      {s.turnDays ? `${s.turnDays}d turn` : DASH}
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums w-24 text-right flex-shrink-0" style={{ color: INK }}>
                      {fmtUsd(s.grossCents)}
                    </span>
                    <span className="w-16 text-right flex-shrink-0">
                      <DeltaChip pct={s.deltaGross} />
                    </span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
                  </a>
                );
              })}
          </div>
        </section>
      </div>
    </Shell>
  );
}

export default PressDashboardAllDark;
