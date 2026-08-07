// PressFirstRun — the DAY-ONE experience for a brand-new GoodTunes PRESS
// partner (Memphis Record Pressing, just onboarded, ZERO clients yet).
//
// This is the empty-state sibling of PressDashboard: it reuses the EXACT
// same shell (full-width top bar with the MRP logo + Feedback/bell/Brandon
// avatar dropdown, the press left rail, the "POWERED BY" GoodTunes footer,
// and the bottom scroll-fade) and the same light slate design language, but
// every data surface is scoped to a partner with nothing in it yet. The goal
// is that the empty dashboard reads as READY, not as failure:
//
//   • No attention queue, no "Review offers" CTA — there's nothing to act on.
//   • The KPI strip keeps its 5 press tiles but shows em-dashes with quiet
//     "your first X lands here" microcopy — never red zeros or -100% deltas.
//   • The Trend / Production areas are replaced by a "Getting started"
//     checklist ordered by press priority (invite a client → set up stages →
//     invite team → partnership live) that pulls the partner forward.
//   • Recent activity holds a single friendly "Memphis Record Pressing joined
//     GoodTunes" business event.
//   • "Production snapshot" and "Top clients" keep their card shapes but empty.
//
// On top of the empty dashboard, a LIGHT welcome modal (Apple-Music-style
// dim-and-blur treatment, adapted to our light mode, INLINE styles for the
// backdrop) opens on first load and can be dismissed to reveal the dashboard.
//
// New file only — no existing file is modified.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Library,
  Gift,
  Settings as Cog,
  Bell,
  CheckCircle2,
  Circle,
  Sparkles,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  Layers,
  Trophy,
  X,
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
const BLUE = '#319ED8';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = '#e6e6ea';
const CANVAS = '#f5f5f7';
const RAIL = '#f5f5f7';
const PILL_TRACK = '#f0f0f2';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function SectionHeading({ lead, rest, size = 20 }: { lead: string; rest: string; size?: number }) {
  return (
    <h3 style={{ fontSize: size, fontWeight: 600, letterSpacing: '-0.01em' }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: SUBINK, fontWeight: 500 }}>{rest}</span>
    </h3>
  );
}

const DASH = '—';

// ─── Range switcher (kept for shell parity; static) ──────────────────

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

// ─── Empty KPI strip ─────────────────────────────────────────────────
// Same 5 press tiles as PressDashboard, but each value is an em-dash with a
// quiet "your first X lands here" line. Deliberately NOT red zeros or -100%
// deltas — an empty partner account should read as ready, not failed.

type EmptyKpiTile = { id: string; label: string; hint: string };

const EMPTY_KPIS: EmptyKpiTile[] = [
  { id: 'sales30d', label: 'Sales · last 30d', hint: 'Your first order lands here' },
  { id: 'salesLifetime', label: 'Sales · lifetime', hint: 'Tracks every dollar you press' },
  { id: 'units30d', label: 'Units · last 30d', hint: 'Records pressed will tally here' },
  { id: 'customers', label: 'Customers', hint: 'Grows as clients come aboard' },
  { id: 'pipeline', label: 'Projects in pipeline', hint: 'Your first project shows here' },
];

function EmptyKpiStrip() {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      data-testid="kpi-strip"
    >
      {EMPTY_KPIS.map((t) => (
        <div
          key={t.id}
          data-testid={`kpi-${t.id}`}
          className="rounded-2xl bg-white p-5 flex flex-col"
          style={{ border: `1px solid ${HAIRLINE}` }}
        >
          <div className="text-[12.5px] font-medium truncate" style={{ color: SUBINK }}>
            {t.label}
          </div>
          <div
            className="mt-2.5 tabular-nums"
            style={{ fontSize: 30, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.03em', color: '#c7c7cc' }}
          >
            {DASH}
          </div>
          <div className="mt-2.5 text-[11.5px] leading-snug" style={{ color: '#a1a1a6' }}>{t.hint}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Getting-started checklist (replaces Trend/Production areas) ─────
// Ordered by press priority. No numbers, no specific client names.

type ChecklistStep = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  cta?: string;
};

const CHECKLIST: ChecklistStep[] = [
  {
    id: 'invite-client',
    title: 'Invite your first client',
    detail: 'Bring an artist or label aboard so their orders flow straight to you.',
    done: false,
    cta: 'Invite a client',
  },
  {
    id: 'stages',
    title: 'Set up your production stages',
    detail: 'Map your pipeline — design, test pressing, in production, shipped — so every run has a home.',
    done: false,
  },
  {
    id: 'team',
    title: 'Invite your team',
    detail: 'Add the people on your floor so approvals and hand-offs stay in one place.',
    done: false,
  },
  {
    id: 'partnership',
    title: 'Your GoodTunes partnership is live',
    detail: 'Memphis Record Pressing is set up and ready to take on work.',
    done: true,
  },
];

function GettingStarted({ steps }: { steps: ChecklistStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div
      className="rounded-2xl bg-white p-6 h-full flex flex-col"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="getting-started"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionHeading lead="Getting started." rest="A few steps to get rolling." />
        <span
          className="text-[11.5px] font-semibold tabular-nums rounded-full px-2.5 py-1"
          style={{ backgroundColor: PILL_TRACK, color: SUBINK }}
        >
          {doneCount} of {steps.length}
        </span>
      </div>

      <ul className="flex-1">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className="flex items-start gap-3 py-4"
            style={i > 0 ? { borderTop: `1px solid ${HAIRLINE}` } : undefined}
            data-testid={`step-${s.id}`}
          >
            {s.done ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#1c8a5b' }} />
            ) : (
              <Circle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#c7c7cc' }} />
            )}
            <div className="flex-1 min-w-0">
              <div
                className="text-[14px] font-semibold"
                style={{ color: s.done ? SUBINK : INK, letterSpacing: '-0.01em' }}
              >
                {s.title}
              </div>
              <p className="text-[12.5px] mt-0.5" style={{ color: SUBINK }}>{s.detail}</p>
            </div>
            {s.cta && (
              <button
                type="button"
                className="flex-shrink-0 inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: BLUE }}
                data-testid={`step-cta-${s.id}`}
              >
                {s.cta}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Recent activity (single welcome business event) ─────────────────

function WelcomeActivity() {
  return (
    <div
      className="rounded-2xl bg-white p-5 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-activity-feed"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <SectionHeading lead="As it happens." rest="Recent activity." size={16} />
      </div>
      <ul className="space-y-0.5 flex-1 min-h-0">
        <li data-testid="activity-welcome">
          <div className="flex items-start gap-2.5 -mx-1.5 px-1.5 py-2 rounded-xl">
            <span
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#f2f2f5' }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: SUBINK }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px]" style={{ color: INK }}>
                Memphis Record Pressing joined GoodTunes · Welcome!
              </div>
              <div className="text-[11.5px]" style={{ color: SUBINK }}>Your shop is set up</div>
            </div>
            <div className="text-[11px] tabular-nums flex-shrink-0 pt-0.5" style={{ color: '#a1a1a6' }}>
              now
            </div>
          </div>
        </li>
      </ul>
      <p className="text-[11.5px] mt-2 pt-3 leading-snug" style={{ color: '#a1a1a6', borderTop: `1px solid ${HAIRLINE}` }}>
        Business events will land here as things happen.
      </p>
    </div>
  );
}

// ─── Production snapshot (empty card shape) ──────────────────────────

function EmptyProductionSnapshot() {
  return (
    <div
      className="rounded-2xl bg-white p-5 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="production-snapshot"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <SectionHeading lead="On the floor." rest="Runs right now." size={16} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-8">
        <span
          className="w-12 h-12 rounded-full inline-flex items-center justify-center"
          style={{ backgroundColor: '#f2f2f5' }}
        >
          <Layers className="w-5 h-5" style={{ color: '#a1a1a6' }} />
        </span>
        <p className="mt-3.5 text-[13.5px] font-semibold" style={{ color: INK }}>
          No runs on the floor yet
        </p>
        <p className="mt-1 text-[12px] max-w-xs leading-snug" style={{ color: SUBINK }}>
          Once a client's order kicks off, your stages will fill in here.
        </p>
      </div>
    </div>
  );
}

// ─── Top clients (empty card shape) ──────────────────────────────────

function EmptyTopClients() {
  return (
    <div
      className="rounded-2xl bg-white p-5 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="top-clients"
    >
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <SectionHeading lead="Top clients." rest="By revenue this period." size={16} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-8">
        <span
          className="w-12 h-12 rounded-full inline-flex items-center justify-center"
          style={{ backgroundColor: '#f2f2f5' }}
        >
          <Trophy className="w-5 h-5" style={{ color: '#a1a1a6' }} />
        </span>
        <p className="mt-3.5 text-[13.5px] font-semibold" style={{ color: INK }}>
          Your clients will rank here
        </p>
        <p className="mt-1 text-[12px] max-w-xs leading-snug" style={{ color: SUBINK }}>
          Invite your first client to start tracking who drives the most work.
        </p>
      </div>
    </div>
  );
}

// ─── Press persona shell (rail + POWERED BY footer + scroll-fade) ────

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // True when the bottom sentinel is visible — user has reached the very
  // bottom, so the fade should hide.
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
    <div
      className="h-screen overflow-hidden flex flex-col font-sans"
      style={{ backgroundColor: CANVAS, color: INK }}
    >
      {/* Full-width top bar — sticky translucent white; MRP brand left; Feedback, bell, Brandon avatar right. */}
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
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
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

        <main className="relative flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
            <div className="mx-auto w-full max-w-[1440px] px-6 sm:px-8 pt-6 pb-12">
              {children}
            </div>
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          </div>
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-16 transition-opacity duration-200',
              atBottom ? 'opacity-0' : 'opacity-100',
            )}
            style={{ backgroundImage: `linear-gradient(to top, ${CANVAS}, rgba(245,245,247,0))` }}
          />
        </main>
      </div>
    </div>
  );
}

// ─── Welcome modal (light Apple-Music-style dim-and-blur treatment) ──

function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      data-testid="welcome-modal"
    >
      {/* Backdrop — dims and lightly blurs the page behind so the empty
          dashboard stays visible/recognizable (Apple Music treatment, light).
          Inline styles: Tailwind backdrop classes did not apply here. */}
      <button
        type="button"
        aria-label="Dismiss welcome"
        onClick={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
        data-testid="welcome-backdrop"
      />
      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-8 text-center"
        style={{ border: `1px solid ${HAIRLINE}`, boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
          style={{ color: '#a1a1a6' }}
          data-testid="button-welcome-close"
        >
          <X className="w-4 h-4" />
        </button>

        <img
          src={goodtunesLogo}
          alt="GoodTunes"
          className="w-auto mx-auto"
          style={{ height: 40, marginBottom: 24 }}
        />

        <h2
          id="welcome-title"
          style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: INK }}
        >
          Welcome, Brandon!
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: SUBINK }}>
          This is your shop's home base. Your clients, their orders, and every
          run on your floor all live in one place — right here.
        </p>

        {/* Extra breathing room so the body text and primary button never touch. */}
        <div className="flex flex-col gap-2" style={{ marginTop: 28 }}>
          <button
            type="button"
            className="w-full h-10 rounded-full text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: BLUE }}
            onClick={onClose}
            data-testid="button-welcome-primary"
          >
            Invite my first client
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-9 text-[13px] font-medium transition-opacity hover:opacity-70"
            style={{ color: SUBINK }}
            data-testid="button-welcome-secondary"
          >
            I'll look around first
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export function PressFirstRun({ showWelcome = true }: { showWelcome?: boolean } = {}) {
  const [range, setRange] = useState<RangeKey>('30d');
  // Welcome modal starts open (unless showWelcome is false); can be dismissed
  // to reveal the empty dashboard.
  const [welcomeOpen, setWelcomeOpen] = useState(showWelcome);

  return (
    <>
      <PressShell>
        <div className="flex flex-col gap-5">
          {/* Header — welcome greeting, no attention line, no Review-offers CTA */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1
                style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', color: INK }}
                data-testid="heading-press-firstrun"
              >
                Welcome, Brandon
              </h1>
              <p className="text-[13.5px] mt-1" style={{ color: SUBINK }}>
                Your shop is ready — here's how to bring in your first work.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <RangeSwitcher value={range} onChange={setRange} />
            </div>
          </div>

          {/* Empty KPI strip — em-dashes + quiet microcopy, never red zeros */}
          <EmptyKpiStrip />

          {/* Getting started replaces Trend/Production; activity recedes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            <div className="lg:col-span-2 min-h-0">
              <GettingStarted steps={CHECKLIST} />
            </div>
            <div className="min-h-0 max-h-[420px]">
              <WelcomeActivity />
            </div>
          </div>

          {/* Bottom row — empty Production snapshot + Top clients */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <EmptyProductionSnapshot />
            <EmptyTopClients />
          </div>
        </div>
      </PressShell>

      {welcomeOpen && <WelcomeModal onClose={() => setWelcomeOpen(false)} />}
    </>
  );
}

export default PressFirstRun;
