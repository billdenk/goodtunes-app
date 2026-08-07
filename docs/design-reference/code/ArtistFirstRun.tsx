// ArtistFirstRun — the DAY-ONE experience for a brand-new GoodTunes ARTIST
// (Niina Soleil, just onboarded, zero sales yet).
//
// This is the empty-state sibling of ArtistDashboard: it reuses the EXACT
// same shell (full-width top bar + left rail + "POWERED BY" GoodTunes footer
// + bottom scroll-fade) and the same light slate design language, but every
// data surface is scoped to a brand-new account with nothing in it yet. The
// goal is that the empty dashboard reads as READY, not as failure:
//
//   • No attention queue, no "View payouts" CTA — there's nothing to act on.
//   • The KPI strip keeps its 5 tiles but shows em-dashes with quiet
//     "your first X will show here" microcopy — never red zeros or -100%.
//   • The Trend area is replaced by a "Getting started" checklist (4 steps,
//     first done) that pulls the artist forward.
//   • Recent activity holds a single friendly "You joined GoodTunes" event.
//   • "Where sales come from" and Giving keep their card shapes but empty.
//
// On top of the empty dashboard, a LIGHT welcome modal (Apple-Music-style
// dim-and-blur treatment, adapted to our light mode) opens on first load and
// can be dismissed to reveal the empty dashboard behind it.
//
// All app plumbing is stubbed the same way as ArtistDashboard (wouter Link →
// plain <a>, static content). No existing file is modified.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  UserPlus,
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
  CheckCircle2,
  Circle,
  Sparkles,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  Music2,
  Headphones,
  X,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import endofoundLogo from '../assets/endofound-logo.jpg';

// ─── Brand tokens ────────────────────────────────────────────────────
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

const DASH = '—';

// Stubbed wouter Link — plain anchor that never navigates.
function Link({
  href: _href,
  children,
  className,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={className}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </a>
  );
}

// ─── Range switcher (kept for shell parity; single option, static) ───

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

// ─── Empty KPI strip ─────────────────────────────────────────────────
// Same 5 tiles as the live dashboard, but each value is an em-dash with a
// quiet "your first X shows here" line. Deliberately NOT red zeros or -100%
// deltas — an empty account should read as ready, not failed.

type EmptyKpiTile = { id: string; label: string; hint: string };

const EMPTY_KPIS: EmptyKpiTile[] = [
  { id: 'sales30d', label: 'Sales · last 30d', hint: 'Your first sale will show here' },
  { id: 'salesLifetime', label: 'Sales · lifetime', hint: 'Tracks every dollar you earn' },
  { id: 'plays30d', label: 'Plays · last 30d', hint: 'Plays appear once your music is live' },
  { id: 'listeners', label: 'Listeners', hint: 'Grows as fans find you' },
  { id: 'buyers', label: 'Buyers', hint: 'Your first buyer will show here' },
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
          <div className="text-[13px] font-medium truncate" style={{ color: SUBINK }}>
            {t.label}
          </div>
          <div
            className="mt-3 tabular-nums"
            style={{ fontSize: 32, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.03em', color: '#d2d2d7' }}
          >
            {DASH}
          </div>
          <div className="mt-3 text-[12px] leading-snug" style={{ color: '#a1a1a6' }}>{t.hint}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Getting-started checklist (replaces the Trend chart) ────────────

type ChecklistStep = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  cta?: string;
  // Mutually-exclusive options rendered as side-by-side choice buttons
  // (e.g. "Shopify store" vs "GoodTunes Direct").
  choices?: string[];
};

const CHECKLIST: ChecklistStep[] = [
  {
    id: 'channel',
    title: 'How will you sell?',
    detail: 'Already have a Shopify store? Connect it — or sell with GoodTunes® Direct.',
    done: false,
    choices: ['Connect Shopify', 'Use GoodTunes® Direct'],
  },
  {
    id: 'project',
    title: 'Add your first project',
    detail: 'Upload your music and set up your first release.',
    done: false,
    cta: 'Add a project',
  },
  {
    id: 'people',
    title: 'Invite your people',
    detail: 'Bandmates, managers, and collaborators — bring your team in.',
    done: false,
  },
  {
    id: 'cause',
    title: 'Your cause is set',
    detail: 'Endometriosis Foundation of America — assigned by your GoodTunes team.',
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
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-[20px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
            Getting started.
          </h3>
          <p className="text-[13.5px] mt-0.5" style={{ color: SUBINK }}>
            A few quick steps to get your home base rolling.
          </p>
        </div>
        <span
          className="text-[12px] font-semibold tabular-nums rounded-full px-3 py-1"
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
            style={{ borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}
            data-testid={`step-${s.id}`}
          >
            {s.done ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#1c8a5b' }} />
            ) : (
              <Circle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#d2d2d7' }} />
            )}
            <div className="flex-1 min-w-0">
              <div
                className="text-[14px] font-semibold"
                style={{ color: s.done ? SUBINK : INK }}
              >
                {s.title}
              </div>
              <p className="text-[12.5px] mt-0.5" style={{ color: SUBINK }}>{s.detail}</p>
            </div>
            {s.cta && (
              <button
                type="button"
                className="flex-shrink-0 inline-flex items-center text-[14px] font-medium rounded-full px-4 h-9 text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: BLUE }}
                data-testid={`step-cta-${s.id}`}
              >
                {s.cta}
              </button>
            )}
            {s.choices && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {s.choices.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-9 px-4 rounded-full bg-white text-[13px] font-medium transition-colors hover:bg-slate-50"
                    style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
                    data-testid={`step-choice-${s.id}-${c.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Recent activity (single welcome event) ──────────────────────────

function WelcomeActivity() {
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
      </div>
      <ul className="space-y-1 flex-1 min-h-0">
        <li data-testid="activity-welcome">
          <div className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl">
            <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f2f2f5' }}>
              <Sparkles className="w-4 h-4" style={{ color: SUBINK }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px]" style={{ color: INK }}>You joined GoodTunes · Welcome!</div>
              <div className="text-[12px]" style={{ color: SUBINK }}>Your home base is set up</div>
            </div>
            <div className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: '#a1a1a6' }}>
              now
            </div>
          </div>
        </li>
      </ul>
      <p className="text-[12px] mt-2 pt-3 leading-snug" style={{ color: '#a1a1a6', borderTop: `1px solid ${HAIRLINE}` }}>
        Business events will land here as things happen.
      </p>
    </div>
  );
}

// ─── Where sales come from (empty) ───────────────────────────────────

type EmptyChannel = { id: string; label: string; icon: typeof Headphones };

const EMPTY_CHANNELS: EmptyChannel[] = [
  { id: 'store', label: 'GoodTunes store', icon: ShoppingBag },
  { id: 'streaming', label: 'Streaming referrals', icon: Headphones },
  { id: 'social', label: 'Social & campaigns', icon: Megaphone },
  // "Shopify store" joins this list only after the artist connects Shopify.
  { id: 'shows', label: 'Live shows', icon: Music2 },
];

function EmptySalesChannels() {
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
      </div>
      <ul className="flex-1 flex flex-col justify-center gap-3.5">
        {EMPTY_CHANNELS.map((r) => {
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
                    <span className="text-[12.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: '#d2d2d7' }}>
                      {DASH}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#f0f0f2' }} />
                </div>
                <span className="text-[11px] tabular-nums w-8 text-right flex-shrink-0" style={{ color: '#d2d2d7' }}>
                  {DASH}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Giving (EndoFound, empty form) ──────────────────────────────────

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
            Every sale gives back
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Artist persona shell (rail + POWERED BY footer + scroll-fade) ───

type ArtistNavItem = { label: string; icon: typeof LayoutDashboard; count?: number; active?: boolean };

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
  // NOTE: no "Shopify" rail item on day one — it only appears AFTER the
  // artist chooses "Connect Shopify" in the Getting-started checklist and
  // enters their store address (see ArtistDashboard for the connected state).
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
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] transition-colors"
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
            style={{ backgroundImage: `linear-gradient(to top, ${CANVAS}, transparent)` }}
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
          dashboard stays visible/recognizable (Apple Music treatment, light). */}
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
        style={{ border: `1px solid ${HAIRLINE}`, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}
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
          className="text-[24px] font-semibold"
          style={{ color: INK, letterSpacing: '-0.02em' }}
        >
          Welcome, Niina!
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed" style={{ color: SUBINK }}>This is your home base. Every sale, every play, and every dollar you raise for you and, if you choose, for a non-profit (that comes out of our pocket) shows up right here.</p>

        <div className="flex flex-col gap-2" style={{ marginTop: 28 }}>
          <button
            type="button"
            className="w-full inline-flex items-center justify-center text-[14px] font-medium rounded-full h-10 text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: BLUE }}
            onClick={onClose}
            data-testid="button-welcome-primary"
          >
            Set up my first project
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

export function ArtistFirstRun({ showWelcome = true }: { showWelcome?: boolean } = {}) {
  const [range, setRange] = useState<RangeKey>('30d');
  // Welcome modal starts open (unless showWelcome is false); can be dismissed
  // to reveal the empty dashboard.
  const [welcomeOpen, setWelcomeOpen] = useState(showWelcome);

  return (
    <>
      <ArtistShell>
        <div className="flex flex-col gap-5">
          {/* Header — welcome greeting, no attention line, no payout CTA */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1
                className="text-[30px] font-semibold"
                style={{ color: INK, letterSpacing: '-0.02em', lineHeight: 1.12 }}
                data-testid="heading-artist-firstrun"
              >
                Welcome, Niina
              </h1>
              <p className="text-[14px] mt-1" style={{ color: SUBINK }}>
                Your home base is ready — here's how to get rolling.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <RangeSwitcher value={range} onChange={setRange} />
            </div>
          </div>

          {/* Empty KPI strip — em-dashes + quiet microcopy, never red zeros */}
          <EmptyKpiStrip />

          {/* Getting started replaces the Trend chart; activity recedes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            <div className="lg:col-span-2 min-h-0">
              <GettingStarted steps={CHECKLIST} />
            </div>
            <div className="min-h-0 max-h-[420px]">
              <WelcomeActivity />
            </div>
          </div>

          {/* Bottom row — empty channels + Giving (both empty form) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            <div className="lg:col-span-2 min-h-0">
              <EmptySalesChannels />
            </div>
            <div className="min-h-0 flex flex-col gap-5">
              <GivingCard />
            </div>
          </div>
        </div>
      </ArtistShell>

      {welcomeOpen && <WelcomeModal onClose={() => setWelcomeOpen(false)} />}
    </>
  );
}

export default ArtistFirstRun;
