// NpoFirstRunWithArtist — the EndoFound day-one dashboard in the "assigned
// pairing" state: Niina Soleil is ALREADY a referred artist because the
// GoodTunes team assigned the pairing (mirror of the artist-side "Your cause
// is set — assigned by your GoodTunes team" pattern).
//
// This is a variant of NpoFirstRun.tsx (empty state). The shell, tokens, and
// design language are identical; only the surfaces that reflect the assigned
// artist change:
//
//   • Checklist: "Invite your first artist" is now DONE ("Your first artist is
//     aboard" / "Niina Soleil — assigned by your GoodTunes team") and sits at
//     the bottom with the other done step, per the artist-side convention.
//     Active steps remaining: Share your referral link (now the primary CTA) →
//     Invite your team. Counter updates to 2 of 4.
//   • "Your artists" card: one row — Niina Soleil (photo avatar), a subtle
//     "Assigned by GoodTunes" note, and her status ("Setting up her store").
//     Still zero sales.
//   • KPIs stay em-dash empty (she hasn't sold anything yet); the Dollars
//     donated hint now references her kindly.
//   • Recent activity gains ONE business event above the welcome: "Niina Soleil
//     joined your cause · assigned by GoodTunes".
//   • Donations / ledger stays empty with a kind hint.
//
// No welcome modal in this variant. New file only — NpoFirstRun.tsx is not
// modified.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Users,
  Megaphone,
  UserCheck,
  Mail,
  BookOpen,
  Network,
  Bell,
  CheckCircle2,
  Circle,
  Sparkles,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  HeartHandshake,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import endofoundLogo from '../assets/endofound-logo.jpg';
import jeannePhoto from '../assets/jeanne-rebillard.jpg';
import niinaPhoto from '../assets/niina-soleil.webp';

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

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
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
// Still em-dash empty (Niina hasn't sold anything yet), but the Dollars
// donated hint now references her kindly. Never red zeros or -100% deltas.

type EmptyKpiTile = { id: string; label: string; hint: string };

const EMPTY_KPIS: EmptyKpiTile[] = [
  { id: 'orders', label: 'Orders', hint: 'Your first order lands here' },
  { id: 'newFans', label: 'New fans', hint: 'Grows as Niina finds fans' },
  { id: 'donated', label: 'Dollars donated', hint: "Niina's first sale starts this counter" },
  { id: 'pending', label: 'Pending payout', hint: 'Donations accrue here before payout' },
  { id: 'paidOut', label: 'Paid out', hint: 'Disbursements to your foundation' },
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

// ─── Getting-started checklist ───────────────────────────────────────
// Done items sink to the bottom (artist-side convention). "Invite your first
// artist" is now done because Niina was assigned; the primary CTA shifts to
// "Share your referral link".

type ChecklistStep = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  cta?: string;
};

const CHECKLIST: ChecklistStep[] = [
  {
    id: 'referral-link',
    title: 'Share your referral link',
    detail: 'Send one link and let more artists join your cause without individual invites.',
    done: false,
    cta: 'Share link',
  },
  {
    id: 'team',
    title: 'Invite your team',
    detail: 'Add staff and ambassadors so everyone can help grow your roster.',
    done: false,
  },
  {
    id: 'first-artist',
    title: 'Your first artist is aboard',
    detail: 'Niina Soleil — assigned by your GoodTunes team.',
    done: true,
  },
  {
    id: 'live',
    title: 'Your foundation is live on GoodTunes',
    detail: 'Endometriosis Foundation of America is set up and ready to receive donations.',
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
          <h3 className="text-[20px]" style={{ letterSpacing: '-0.01em' }}>
            <span style={{ color: INK, fontWeight: 600 }}>Getting started. </span>
            <span style={{ color: SUBINK, fontWeight: 500 }}>A few quick steps.</span>
          </h3>
          <p className="text-[13.5px] mt-0.5" style={{ color: SUBINK }}>
            Complete these to start raising donations.
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
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Recent activity (assigned-artist event above the welcome) ───────

function ActivityFeed() {
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="dashboard-activity-feed"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[20px]" style={{ letterSpacing: '-0.01em' }}>
          <span style={{ color: INK, fontWeight: 600 }}>As it happens. </span>
          <span style={{ color: SUBINK, fontWeight: 500 }}>Recent activity.</span>
        </h3>
      </div>
      <ul className="space-y-1 flex-1 min-h-0">
        {/* Business event: the assigned pairing. */}
        <li data-testid="activity-niina-joined">
          <div className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl">
            <span className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }}>
              <img
                src={niinaPhoto}
                alt="Niina Soleil"
                className="w-full h-full object-cover"
              />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px]" style={{ color: INK }}>
                Niina Soleil joined your cause · assigned by GoodTunes
              </div>
              <div className="text-[12px]" style={{ color: SUBINK }}>Setting up her store</div>
            </div>
            <div className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: '#a1a1a6' }}>
              now
            </div>
          </div>
        </li>
        {/* Welcome event. */}
        <li data-testid="activity-welcome">
          <div className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl">
            <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f2f2f5' }}>
              <Sparkles className="w-4 h-4" style={{ color: SUBINK }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px]" style={{ color: INK }}>
                Endometriosis Foundation joined GoodTunes · Welcome!
              </div>
              <div className="text-[12px]" style={{ color: SUBINK }}>Your foundation is set up</div>
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

// ─── Your artists (one assigned artist row) ──────────────────────────

function ArtistsCard() {
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="your-artists"
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="min-w-0">
          <h3 className="text-[17px]" style={{ letterSpacing: '-0.01em' }}>
            <span style={{ color: INK, fontWeight: 600 }}>Your artists. </span>
            <span style={{ color: SUBINK, fontWeight: 500 }}>Your roster.</span>
          </h3>
          <p className="text-[12.5px]" style={{ color: SUBINK }}>Artists referred by your foundation</p>
        </div>
        <span
          className="text-[12px] font-semibold tabular-nums rounded-full px-3 py-1 flex-shrink-0"
          style={{ backgroundColor: PILL_TRACK, color: SUBINK }}
        >
          1
        </span>
      </div>
      <ul className="flex-1 min-h-0">
        <li
          className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-xl"
          data-testid="artist-niina-soleil"
        >
          <span className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }}>
            <img
              src={niinaPhoto}
              alt="Niina Soleil"
              className="w-full h-full object-cover"
            />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-semibold truncate" style={{ color: INK }}>
                Niina Soleil
              </span>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 flex-shrink-0"
                style={{ backgroundColor: PILL_TRACK, color: SUBINK }}
              >
                Assigned by GoodTunes
              </span>
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: SUBINK }}>Setting up her store</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[16px] font-semibold tabular-nums leading-none" style={{ color: '#d2d2d7' }}>
              {DASH}
            </div>
            <div className="text-[11px] mt-1" style={{ color: '#a1a1a6' }}>in donations</div>
          </div>
        </li>
      </ul>
      <p className="text-[12px] mt-1 pt-3 leading-snug" style={{ color: '#a1a1a6', borderTop: `1px solid ${HAIRLINE}` }}>
        Donations start posting once Niina makes her first sale.
      </p>
    </div>
  );
}

// ─── Donations / ledger (empty card shape) ───────────────────────────

function EmptyDonations() {
  return (
    <div
      className="rounded-2xl bg-white p-6 flex flex-col h-full"
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid="donations-ledger"
    >
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="min-w-0">
          <h3 className="text-[17px]" style={{ letterSpacing: '-0.01em' }}>
            <span style={{ color: INK, fontWeight: 600 }}>Donations. </span>
            <span style={{ color: SUBINK, fontWeight: 500 }}>Every dollar raised.</span>
          </h3>
          <p className="text-[12.5px]" style={{ color: SUBINK }}>By project, line by line</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-8">
        <span className="w-14 h-14 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: '#f2f2f5' }}>
          <HeartHandshake className="w-6 h-6" style={{ color: SUBINK }} />
        </span>
        <p className="mt-4 text-[15px] font-semibold" style={{ color: INK }}>
          Your donation ledger is empty
        </p>
        <p className="mt-1.5 text-[13px] max-w-xs leading-relaxed" style={{ color: SUBINK }}>
          As Niina sells, each donation will post here — line by line.
        </p>
      </div>
    </div>
  );
}

// ─── NPO persona shell (rail + POWERED BY footer + scroll-fade) ──────

type NpoNavItem = { label: string; icon: typeof LayoutDashboard; count?: number; active?: boolean };

// Mirrors the live NPO portal's rail, in order. CANON: "Album" → "Project",
// so the ledger reads "Project ledger".
const NPO_NAV: NpoNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Your artists', icon: Users, count: 1 },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Invites', icon: Mail },
  { label: 'Project ledger', icon: BookOpen },
  { label: 'Team tree', icon: Network },
];

function NavRow({ label, icon: Icon, count, active }: NpoNavItem) {
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

const PARTNER_NAME = 'Endometriosis Foundation of America';
const USER_FIRST_NAME = 'Jeanne';
const USER_EMAIL = 'jeanne@endofound.org';
const USER_INITIALS = 'JR'; // photo fallback only

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
            src={jeannePhoto}
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

function NpoShell({ children }: { children: ReactNode }) {
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
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      {/* Full-width top bar — circular EndoFound logo + "EndoFound" left;
          Feedback, bell, Jeanne avatar right. The wordmark is the partner
          brand; never truncates. */}
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 bg-white pl-4 pr-6"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-9 w-9 rounded-full overflow-hidden bg-white flex items-center justify-center flex-shrink-0"
            style={{ border: `1px solid ${HAIRLINE}` }}
          >
            <img
              src={endofoundLogo}
              alt={PARTNER_NAME}
              className="h-full w-full object-cover"
            />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            EndoFound
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            className="text-white hover:opacity-90"
            style={{ backgroundColor: BLUE, borderColor: BLUE }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[#e8e8ed] hover:bg-[#dcdce0] transition-colors"
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
            {NPO_NAV.map((item) => (
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
            style={{ backgroundImage: `linear-gradient(to top, ${CANVAS}, transparent)` }}
          />
        </main>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export function NpoFirstRunWithArtist() {
  const [range, setRange] = useState<RangeKey>('30d');

  return (
    <NpoShell>
      <div className="flex flex-col gap-5">
        {/* Header — welcome greeting, no queue, no CTA */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1
              className="text-[30px] font-semibold"
              style={{ color: INK, letterSpacing: '-0.02em', lineHeight: 1.12 }}
              data-testid="heading-npo-firstrun"
            >
              Welcome, Jeanne
            </h1>
            <p className="text-[14px] mt-1" style={{ color: SUBINK }}>
              Your home base is ready — Niina Soleil is aboard, and donations
              from the artists you refer will land here.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <RangeSwitcher value={range} onChange={setRange} />
          </div>
        </div>

        {/* Empty KPI strip — em-dashes + quiet microcopy, never red zeros */}
        <EmptyKpiStrip />

        {/* Getting started + activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <div className="lg:col-span-2 min-h-0">
            <GettingStarted steps={CHECKLIST} />
          </div>
          <div className="min-h-0 max-h-[420px]">
            <ActivityFeed />
          </div>
        </div>

        {/* Bottom row — Your artists (Niina) + empty Donations ledger */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <ArtistsCard />
          <EmptyDonations />
        </div>
      </div>
    </NpoShell>
  );
}

export default NpoFirstRunWithArtist;
