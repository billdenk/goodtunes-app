// ArtistProjectPackage — the moment Niina's music becomes a real record.
//
// This is a FULL PAGE inside the artist shell (same top bar + left rail +
// "POWERED BY" footer conventions as ArtistFirstRun) for the CALIFORNIALAND
// project. One long scrolling page, restyled from the reference screenshots so
// designing a package feels like designing a record, not filling in a form.
//
// Bill's requirements, all honored below:
//   • Printer = Memphis Record Pressing, "You were invited by…" line.
//   • Tracks defaults to 10, with a gentle callout that you can add more/fewer.
//   • Vinyl COLOR picker — translucent swatch row, "T01 Ruby"-style selection —
//     driving a LIVE album mockup that uses the real cover art.
//   • Pricing block: retail price, quantity, per-unit profit, total, with the
//     GoodDeed contribution (on/off, 25% of 250 of 1,000 math) folded right
//     into the pricing story and a prominent combined artist-net total.
//   • Optional add-ons: GoodDeed Certificate, 7×7 Booklet, CD, Custom.
//   • A STICKY right rail that follows the scroll carrying the live vinyl/cover
//     mockup and the running artist-net profit total.
//
// The page draws its accent from the ruby vinyl + cover art so it reads warm
// and celebratory. No emojis. Brand blue #319ED8 for primary actions. Circles
// for people/partner logos; rounded rectangles for album thumbnails. No
// existing file is modified.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  Lock,
  Info,
  Plus,
  Minus,
  Copy,
  Download,
  Check,
  ChevronDown,
  Award,
  BookOpen,
  Disc,
  Gift,
  Heart,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import { Switch } from '@workspace/goodtunes-design-system/components/ui/switch';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import mrpLogo from '../assets/mrp-logo.png';
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Brand tokens ────────────────────────────────────────────────────
const BLUE = '#319ED8';
const RUBY = '#C81E38'; // drawn from the ruby vinyl + cover — the page's warmth
const RUBY_SOFT = 'rgba(200, 30, 56, 0.06)';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

// ─── Shell primitives (mirrors ArtistFirstRun conventions) ───────────

type ArtistNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const ARTIST_NAV: ArtistNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'People', icon: User },
  { label: 'Projects', icon: Disc3, active: true },
  { label: 'Overview', icon: Activity },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Reports', icon: BarChart3 },
];

function NavRow({ label, icon: Icon, active }: ArtistNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2 h-8 rounded-md text-[13px] font-medium transition-colors',
        active
          ? 'bg-slate-100 text-slate-900'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0 text-slate-400" />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

const ARTIST_NAME = 'Niina Soleil';
const USER_FIRST_NAME = 'Niina';
const USER_EMAIL = 'niina@niinasoleil.com';
const USER_INITIALS = 'NS';

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
          <img src={niinaPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-0" data-testid="menu-user">
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
  return (
    <div className="h-screen flex flex-col font-sans text-slate-900" style={{ backgroundColor: '#f5f5f7' }}>
      <header className="h-14 flex-shrink-0 flex items-center justify-between gap-4 bg-white border-b border-slate-200 pl-3 pr-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={niinaPhoto}
            alt={ARTIST_NAME}
            className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200 flex-shrink-0"
          />
          <span className="text-[15px] font-semibold text-slate-900 whitespace-nowrap">
            {ARTIST_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            className="text-white hover:opacity-90 rounded-full"
            style={{ backgroundColor: BLUE, borderColor: BLUE }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="px-2 py-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full h-8 pl-8 pr-2 rounded-full border border-slate-200 bg-slate-50 text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2 pt-2 pb-3 space-y-0.5 overflow-y-auto">
            {ARTIST_NAV.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
          </nav>
          <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 flex-shrink-0">
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── Project tabs (Package active) ───────────────────────────────────

const PROJECT_TABS = [
  'Dashboard',
  'Overview',
  'Package',
  'Digital',
  'Physical',
  'Shopify',
  'Payments',
  'Customers',
  'Early access',
];

function ProjectTab({ t, active }: { t: string; active: boolean }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'relative whitespace-nowrap pb-2.5 pt-1 text-[13.5px] font-semibold transition-colors',
        active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800',
      )}
    >
      <span className="flex items-center gap-1.5">
        {t !== 'Dashboard' && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: active ? BLUE : '#CBD5E1' }}
          />
        )}
        {t}
      </span>
      {active && (
        <span
          className="absolute left-0 -bottom-px h-0.5 w-full rounded-full"
          style={{ backgroundColor: BLUE }}
        />
      )}
    </a>
  );
}

const ACTIVE_TAB = 'Package';
const TAB_GAP = 20; // matches gap-5
const MORE_RESERVE = 88; // room for the "More" trigger

function ProjectTabs() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(PROJECT_TABS.length);

  // Measure a hidden copy of every tab; collapse the ones that don't fit
  // into a "More" dropdown instead of letting the row scroll sideways.
  useEffect(() => {
    const recalc = () => {
      const wrap = wrapRef.current;
      const meas = measureRef.current;
      if (!wrap || !meas) return;
      const avail = wrap.clientWidth;
      const widths = Array.from(meas.children).map((c) => (c as HTMLElement).offsetWidth);

      // First pass: do they all fit as-is?
      let used = 0;
      let fitAll = 0;
      widths.forEach((w, i) => {
        used += w + (i ? TAB_GAP : 0);
        if (used <= avail) fitAll = i + 1;
      });
      if (fitAll === widths.length) {
        setVisibleCount(widths.length);
        return;
      }

      // Second pass: reserve room for the "More" trigger.
      used = 0;
      let fit = 0;
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i] + (i ? TAB_GAP : 0);
        if (used + w + TAB_GAP + MORE_RESERVE <= avail) {
          used += w;
          fit = i + 1;
        } else break;
      }
      setVisibleCount(Math.max(1, fit));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Keep the active tab visible: if it fell into the overflow, swap it
  // into the last visible slot.
  let visible = PROJECT_TABS.slice(0, visibleCount);
  let overflow = PROJECT_TABS.slice(visibleCount);
  if (overflow.includes(ACTIVE_TAB) && visible.length > 0) {
    const displaced = visible[visible.length - 1];
    visible = [...visible.slice(0, -1), ACTIVE_TAB];
    overflow = [displaced, ...overflow.filter((t) => t !== ACTIVE_TAB)];
  }

  return (
    <div ref={wrapRef} className="relative flex items-center gap-5 border-b border-slate-200 min-w-0">
      {/* Hidden measuring row — same classes, never visible */}
      <div
        ref={measureRef}
        aria-hidden
        className="absolute left-0 top-0 flex items-center gap-5 invisible pointer-events-none whitespace-nowrap"
      >
        {PROJECT_TABS.map((t) => (
          <span key={t} className="pb-2.5 pt-1 text-[13.5px] font-semibold whitespace-nowrap">
            <span className="flex items-center gap-1.5">
              {t !== 'Dashboard' && <span className="inline-block w-1.5 h-1.5 rounded-full" />}
              {t}
            </span>
          </span>
        ))}
      </div>

      {visible.map((t) => (
        <ProjectTab key={t} t={t} active={t === ACTIVE_TAB} />
      ))}

      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex items-center gap-1 whitespace-nowrap pb-2.5 pt-1 text-[13.5px] font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              More
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1.5">
            <div className="flex flex-col">
              {overflow.map((t) => (
                <a
                  key={t}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#CBD5E1' }} />
                  {t}
                </a>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ─── Vinyl color catalog (translucent swatch row) ────────────────────

type Swatch = { id: string; name: string; color: string; translucent?: boolean };

const SWATCHES: Swatch[] = [
  { id: 'T01', name: 'Ruby', color: '#C81E38', translucent: true },
  { id: 'T02', name: 'Clear', color: '#E8ECEF', translucent: true },
  { id: 'T03', name: 'Cobalt', color: '#2563EB', translucent: true },
  { id: 'T04', name: 'Emerald', color: '#059669', translucent: true },
  { id: 'T05', name: 'Magenta', color: '#A21457', translucent: true },
  { id: 'T06', name: 'Seafoam', color: '#8FCFC4', translucent: true },
  { id: 'T07', name: 'Amber', color: '#D9A441', translucent: true },
  { id: 'T08', name: 'Tangerine', color: '#E4622A', translucent: true },
  { id: 'T09', name: 'Smoke', color: '#8A8F98', translucent: true },
  { id: 'T10', name: 'Chartreuse', color: '#C7C948', translucent: true },
  { id: 'T11', name: 'Bone', color: '#D8D2C4', translucent: true },
  { id: 'T12', name: 'Forest', color: '#2F4F3A', translucent: true },
  { id: 'T13', name: 'Teal', color: '#1E7A8C', translucent: true },
  { id: 'T14', name: 'Sand', color: '#C9B48C', translucent: true },
  { id: 'T15', name: 'Olive', color: '#6B6B4A', translucent: true },
];

// ─── Live record mockup — cover art + vinyl disc that "greets" you ───
//
// Diggers-Factory behavior: the disc starts tucked behind the jacket, then
// after a short beat rolls out slowly (translating right with a gentle
// rotation so it reads as rolling), pauses at its greeted position, and eases
// back to a mostly-tucked resting pose — a sliver still peeking out. The greet
// replays whenever the selected vinyl color changes so the new color shows
// itself. Tailwind's animation utilities are unreliable in this sandbox, so
// the whole thing is a keyed <style> keyframe + inline styles.

// Resting/tucked pose and greeted pose, as transforms. The disc must stay
// VISIBLE AT ALL TIMES — rest keeps only a slim crescent (a moon of color)
// peeking past the jacket's right edge. The auto-greet (load + color change)
// rolls it well out, then eases back. On hover/tap the jacket eases LEFT while
// the disc rolls further RIGHT, like the record being drawn from the sleeve.
const DISC_TUCKED = 'translateX(-12%) rotate(-14deg)'; // rest: slim moon only
const DISC_GREET = 'translateX(28%) rotate(16deg)'; // auto greet + hover/tap
const JACKET_REST = 'translateX(0)';
const JACKET_PULLED = 'translateX(-9%)'; // eases left on draw-out
const EASE = 'cubic-bezier(0.33, 0, 0.2, 1)'; // same unhurried family as greet

function RecordMockup({ swatch }: { swatch: Swatch }) {
  // `greetKey` bumps on mount and whenever the color changes; restarting the
  // element with a fresh key re-runs the keyframe from the start.
  const [greetKey, setGreetKey] = useState(0);
  const firstRun = useRef(true);
  // `active` drives the draw-out via CSS transitions so pointer + touch share
  // one code path (no hover-only pseudo-classes). Hover sets/clears it; tap
  // toggles it so touch/tablet users get the same move.
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Bump on mount and on every subsequent color change.
    setGreetKey((k) => k + 1);
    firstRun.current = false;
    // We intentionally key only on the color id so the greet replays per color.
  }, [swatch.id]);

  const animName = `disc-greet-${greetKey}`;
  // While the auto-greet keyframe runs it owns the transform; once the user
  // interacts (active) the transition-driven pose takes over.
  const discTransform = active ? DISC_GREET : DISC_TUCKED;

  return (
    <div
      className="relative select-none cursor-pointer"
      style={{ aspectRatio: '1 / 1', overflow: 'visible' }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onClick={() => setActive((v) => !v)}
      data-testid="record-mockup"
    >
      {/* Per-run keyframes: tucked → roll out & pause → ease back to tucked. */}
      <style>{`
        @keyframes ${animName} {
          0%   { transform: ${DISC_TUCKED}; }
          8%   { transform: ${DISC_TUCKED}; }
          46%  { transform: ${DISC_GREET}; }
          60%  { transform: ${DISC_GREET}; }
          100% { transform: ${DISC_TUCKED}; }
        }
      `}</style>

      {/* Vinyl disc — rendered BEHIND the jacket, emerging from its right edge */}
      <div
        key={greetKey}
        className="absolute rounded-full"
        style={{
          top: '9%',
          right: '-14%',
          width: '82%',
          height: '82%',
          background: `radial-gradient(circle at 50% 42%, ${swatch.color} 0%, ${swatch.color} 34%, rgba(0,0,0,0.28) 100%)`,
          boxShadow: '0 10px 30px rgba(15,23,42,0.28)',
          opacity: 0.96,
          transformOrigin: 'center center',
          transform: discTransform,
          // On interaction the transition owns the motion; otherwise the keyed
          // keyframe plays the greet then holds the tucked pose.
          animation: active ? 'none' : `${animName} 4400ms ${EASE} 300ms 1 forwards`,
          transition: `transform 700ms ${EASE}`,
          willChange: 'transform',
        }}
      >
        {/* concentric groove sheen */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'repeating-radial-gradient(circle at 50% 42%, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0) 2px, rgba(0,0,0,0.06) 4px)',
          }}
        />
        {/* label */}
        <div
          className="absolute rounded-full ring-2 ring-white/40 flex items-center justify-center"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '34%',
            height: '34%',
            backgroundColor: '#1F2937',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white/70" />
        </div>
      </div>

      {/* Jacket with cover art — on top; eases left as the disc draws out */}
      <div
        className="absolute inset-0 overflow-hidden rounded-lg ring-1 ring-black/5"
        style={{
          boxShadow: '0 18px 40px rgba(15,23,42,0.22)',
          zIndex: 1,
          transform: active ? JACKET_PULLED : JACKET_REST,
          transition: `transform 700ms ${EASE}`,
          willChange: 'transform',
        }}
      >
        <img
          src={californialandCover}
          alt="CALIFORNIALAND cover"
          className="w-full h-full object-cover"
        />
        {/* spine shadow on the right edge to read as a real sleeve */}
        <div
          className="absolute right-0 top-0 h-full w-3"
          style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 100%)' }}
        />
      </div>
    </div>
  );
}

// ─── Sticky right rail ───────────────────────────────────────────────

function StickyRail({
  swatch,
  artistNet,
  goodDeedOn,
  goodDeedTotal,
}: {
  swatch: Swatch;
  artistNet: number;
  goodDeedOn: boolean;
  goodDeedTotal: number;
}) {
  return (
    <div className="sticky top-6 flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <RecordMockup swatch={swatch} />
        <div className="flex items-center justify-center gap-2 text-[12px] text-slate-500" style={{ marginTop: 18 }}>
          <span
            className="inline-block w-3 h-3 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: swatch.color }}
          />
          <span className="font-semibold text-slate-700">
            {swatch.id} {swatch.name}
          </span>
          <span className="text-slate-300">·</span>
          <span>Translucent 12" LP</span>
        </div>
        <p className="text-[11.5px] text-slate-400 text-center" style={{ marginTop: 6 }}>
          Every 12" LP ships in the standard jacket.
        </p>
      </div>

      <div
        className="rounded-2xl p-5 text-white shadow-sm"
        style={{ background: `linear-gradient(135deg, ${RUBY} 0%, #9A1230 100%)` }}
      >
        <div className="text-[10.5px] uppercase tracking-wider font-bold text-white/70">
          Your take-home on this run
        </div>
        <div className="text-[30px] font-bold tabular-nums leading-none" style={{ marginTop: 8 }}>
          {fmtUSD(artistNet)}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-white/80" style={{ marginTop: 8 }}>
          <span>Artist net · 1,000 pcs</span>
        </div>
        {goodDeedOn && (
          <div
            className="flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 text-[12px]"
            style={{ marginTop: 14 }}
          >
            <Heart className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Includes <span className="font-semibold">{fmtUSD(goodDeedTotal)}</span> raised via GoodDeed®
            </span>
          </div>
        )}
        <div
          className="flex items-center gap-2 text-[11.5px] text-white/80 border-t border-white/15"
          style={{ marginTop: 14, paddingTop: 12 }}
        >
          <Activity className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Break-even fills in once Memphis Record Pressing adds pricing for this tier.</span>
        </div>
        <p className="text-[11px] text-white/70" style={{ marginTop: 10 }}>
          A running estimate — nothing is charged until you send this to press.
        </p>
      </div>
    </div>
  );
}

// ─── Small building blocks ───────────────────────────────────────────

function InfoDot() {
  return <Info className="w-3.5 h-3.5 text-slate-400 inline-block align-[-2px]" />;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10.5px] uppercase tracking-wider font-bold text-slate-500">{children}</div>
  );
}

type AddOn = {
  id: string;
  title: string;
  meta: string;
  icon: typeof Award;
  on?: boolean;
};

const ADD_ONS: AddOn[] = [
  { id: 'cert', title: 'GoodDeed® Certificate', meta: 'On · 25% (250 of 1,000)', icon: Award, on: true },
  { id: 'booklet', title: '7×7 Booklet', meta: 'Request a quote', icon: BookOpen },
  { id: 'cd', title: 'CD', meta: 'Request a quote', icon: Disc },
  { id: 'custom', title: 'Custom', meta: 'Non-profit add-on', icon: Gift },
];

// ─── Page ────────────────────────────────────────────────────────────

export function ArtistProjectPackage() {
  const [tracks, setTracks] = useState(10);
  const [selectedSwatch, setSelectedSwatch] = useState('T01');
  const [retail, setRetail] = useState(35);
  const [qty] = useState(1000);
  const [goodDeedOn, setGoodDeedOn] = useState(true);

  const swatch = useMemo(
    () => SWATCHES.find((s) => s.id === selectedSwatch) ?? SWATCHES[0],
    [selectedSwatch],
  );

  // Pricing math — mirrors the reference ($35 retail → $20.70 per unit).
  const perUnitProfit = useMemo(() => Math.round((retail * 0.591428) * 100) / 100, [retail]);
  const total = useMemo(() => perUnitProfit * qty, [perUnitProfit, qty]);

  // GoodDeed: 25% of 250 of 1,000 (a quarter of the run gives back).
  const goodDeedUnits = Math.round(qty * 0.25); // 250
  const goodDeedPerUnit = useMemo(() => Math.round(perUnitProfit * 0.344 * 100) / 100, [perUnitProfit]); // ≈$7.12
  const goodDeedTotal = useMemo(
    () => (goodDeedOn ? Math.round(goodDeedPerUnit * goodDeedUnits * 100) / 100 : 0),
    [goodDeedOn, goodDeedPerUnit, goodDeedUnits],
  );

  const combinedTotal = useMemo(() => total + goodDeedTotal, [total, goodDeedTotal]);

  // Keep the header chip + rail totals in lockstep (avoid stale closures).
  const netRef = useRef(combinedTotal);
  netRef.current = combinedTotal;

  return (
    <ArtistShell>
      <div className="mx-auto w-full max-w-[1200px] px-6 sm:px-8 pt-6 pb-16">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
            Albums
          </a>
          <span className="text-slate-300">›</span>
          <span className="text-slate-700">CALIFORNIALAND</span>
        </div>

        {/* Project header */}
        <div className="flex items-start justify-between gap-4 flex-wrap" style={{ marginTop: 16 }}>
          <div className="flex items-start gap-4 min-w-0">
            {/* rounded rectangle album thumbnail */}
            <img
              src={californialandCover}
              alt="CALIFORNIALAND"
              className="rounded-lg object-cover ring-1 ring-slate-200 flex-shrink-0"
              style={{ width: 76, height: 76 }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  LP · Niina Soleil
                </span>
                <span
                  className="text-[10.5px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5"
                  style={{ color: BLUE, backgroundColor: 'rgba(49,158,216,0.10)' }}
                >
                  Preview
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              </div>
              <h1 className="text-[27px] font-bold tracking-tight text-slate-900 leading-tight" style={{ marginTop: 2 }}>
                CALIFORNIALAND
              </h1>
              <div className="flex items-center gap-3 text-[12.5px] text-slate-500" style={{ marginTop: 2 }}>
                <span>2026</span>
                <span className="inline-flex items-center gap-1">
                  <Disc3 className="w-3.5 h-3.5" /> {tracks} tracks
                </span>
              </div>
            </div>
          </div>

          {/* Status chip */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 h-9">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400">Status</span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> At press
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ marginTop: 18 }}>
          <ProjectTabs />
        </div>

        {/* Printer row — compact single line (press matters, real estate doesn't) */}
        <div className="flex items-center gap-2 text-[12.5px]" style={{ marginTop: 14 }}>
          {/* partner logo on a WHITE circle, object-contain, slight padding */}
          <span className="w-6 h-6 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0" style={{ padding: 3 }}>
            <img src={mrpLogo} alt="Memphis Record Pressing" className="w-full h-full object-contain" />
          </span>
          <span className="text-slate-500">Pressed by</span>
          <span className="font-semibold text-slate-900">Memphis Record Pressing</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-400">They invited you</span>
          <InfoDot />
        </div>

        {/* Two-column: builder + sticky rail */}
        <div
          style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 28 }}
        >
          {/* LEFT — the builder */}
          <div className="flex flex-col gap-6 min-w-0">
            {/* Design intro */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-[16px] tracking-tight" style={{ fontWeight: 600 }}>
                    <span className="text-slate-900">Design your package. </span>
                    <span className="text-slate-400 font-medium">Make it a record.</span>
                  </h2>
                  <p className="text-[13px] leading-relaxed text-slate-500" style={{ marginTop: 6, maxWidth: 620 }}>
                    This is where your music becomes a record you can hold. Pick the vinyl color,
                    set your price, choose your extras — the calculator shows what you could earn.
                    In the end it's up to your fans, so have fun with it, then send your offering
                    out into the world.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                  data-testid="button-add-good"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add physical good
                </Button>
              </div>

              {/* Selected-good summary strip */}
              <div
                className="flex items-center justify-between gap-4 rounded-xl border p-4 flex-wrap"
                style={{ marginTop: 18, borderColor: 'rgba(200,30,56,0.20)', backgroundColor: RUBY_SOFT }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={californialandCover}
                    alt="CALIFORNIALAND"
                    className="w-12 h-12 rounded-md object-cover ring-1 ring-black/5 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold uppercase tracking-wide" style={{ color: RUBY }}>
                      CALIFORNIALAND
                    </div>
                    <div className="text-[12.5px] text-slate-600">Niina Soleil</div>
                    <div className="text-[12px] text-slate-500">
                      12" LP · {swatch.id} {swatch.name} · {tracks} tracks · {qty.toLocaleString()} pcs
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-right">
                  <span className="text-[11.5px] font-semibold text-slate-500">Artist Net</span>
                  <span className="text-[15px] font-bold tabular-nums" style={{ color: RUBY }}>
                    {fmtUSD(combinedTotal)}
                  </span>
                  <InfoDot />
                </div>
              </div>
            </div>

            {/* Vinyl section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <SectionLabel>Required · Vinyl</SectionLabel>

              {/* Tracks */}
              <div style={{ marginTop: 18 }}>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-500">
                    Tracks
                  </label>
                  <InfoDot />
                </div>
                <div className="flex items-center gap-2" style={{ marginTop: 8, maxWidth: 200 }}>
                  <button
                    type="button"
                    onClick={() => setTracks((t) => Math.max(1, t - 1))}
                    className="w-9 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors flex-shrink-0"
                    aria-label="Fewer tracks"
                    data-testid="button-tracks-minus"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="flex-1 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-[15px] font-semibold text-slate-900 tabular-nums">
                    {tracks}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTracks((t) => t + 1)}
                    className="w-9 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors flex-shrink-0"
                    aria-label="More tracks"
                    data-testid="button-tracks-plus"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[12px] text-slate-500" style={{ marginTop: 10 }}>
                  Starting at 10 — a full side each. Add more or fewer anytime; we'll re-check the
                  runtime fits your format.
                </p>
              </div>

              {/* Color */}
              <div style={{ marginTop: 26 }}>
                <div className="flex items-center justify-between">
                  <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-500">
                    Color
                  </label>
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div
                  className="flex items-center justify-between h-10 rounded-lg border border-slate-200 px-3 text-[13.5px] text-slate-700"
                  style={{ marginTop: 8 }}
                >
                  <span>Translucent</span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>

                {/* Translucent swatch row */}
                <div className="flex flex-wrap items-center gap-2.5" style={{ marginTop: 14 }}>
                  {SWATCHES.map((s) => {
                    const active = s.id === selectedSwatch;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSwatch(s.id)}
                        aria-label={`${s.id} ${s.name}`}
                        aria-pressed={active}
                        data-testid={`swatch-${s.id}`}
                        className="relative w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none"
                        style={{
                          boxShadow: active
                            ? `0 0 0 2px #fff, 0 0 0 4px ${RUBY}`
                            : '0 0 0 1px rgba(15,23,42,0.12)',
                        }}
                      >
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${s.color} 70%)`,
                            opacity: 0.9,
                          }}
                        />
                        {active && (
                          <Check
                            className="absolute inset-0 m-auto w-3.5 h-3.5 text-white drop-shadow"
                            strokeWidth={3}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700" style={{ marginTop: 12 }}>
                  <span
                    className="inline-block w-3 h-3 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: swatch.color }}
                  />
                  {swatch.id} {swatch.name}
                </div>
              </div>
            </div>

            {/* Pricing section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[16px] tracking-tight" style={{ fontWeight: 600 }}>
                    <span className="text-slate-900">Pricing. </span>
                    <span className="text-slate-400 font-medium">See what you earn.</span>
                  </h2>
                  <InfoDot />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" data-testid="button-duplicate">
                    <Copy className="w-3.5 h-3.5" /> Duplicate
                  </Button>
                  <Button variant="outline" size="sm" data-testid="button-export">
                    <Download className="w-3.5 h-3.5" /> Export quote
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden" style={{ marginTop: 18 }}>
                {/* Retail price */}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-500">
                      Retail price
                    </label>
                    <InfoDot />
                  </div>
                  <div className="flex items-center h-10 rounded-lg border border-slate-200 px-3" style={{ marginTop: 8 }}>
                    <span className="text-[14px] text-slate-400 mr-1.5">$</span>
                    <input
                      type="number"
                      value={retail}
                      min={0}
                      onChange={(e) => setRetail(Number(e.target.value) || 0)}
                      className="flex-1 bg-transparent text-[14px] font-semibold text-slate-900 tabular-nums focus:outline-none"
                      data-testid="input-retail"
                    />
                  </div>
                </div>

                {/* Quantity */}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-500">
                      Select qty
                    </label>
                    <InfoDot />
                  </div>
                  <div
                    className="flex items-center justify-between h-10 rounded-lg border border-slate-200 px-3 text-[13.5px] font-medium text-slate-800"
                    style={{ marginTop: 8 }}
                  >
                    {qty.toLocaleString()} units
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </div>
                </div>

                {/* Profit per unit */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                  <span className="flex items-center gap-1.5 text-[12.5px]">
                    <span className="uppercase tracking-wider font-bold text-slate-500">Profit</span>
                    <span className="text-slate-400 inline-flex items-center gap-0.5">
                      Per unit sold <ChevronDown className="w-3 h-3" />
                    </span>
                  </span>
                  <span className="text-[16px] font-bold text-slate-900 tabular-nums">
                    {fmtUSD(perUnitProfit)}
                  </span>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                  <span className="flex items-center gap-1.5 text-[12.5px] uppercase tracking-wider font-bold text-slate-500">
                    Total <InfoDot />
                  </span>
                  <span className="text-[16px] font-bold text-slate-900 tabular-nums">
                    {fmtUSD(total)}
                  </span>
                </div>

                {/* GoodDeed — folded into the pricing story */}
                <div className="p-4 border-b border-slate-100" style={{ backgroundColor: RUBY_SOFT }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'rgba(200,30,56,0.14)', color: RUBY }}
                      >
                        <Heart className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: RUBY }}>
                          GoodDeed®
                        </div>
                        <div className="text-[11.5px] text-slate-500">
                          25% · {goodDeedUnits} of {qty.toLocaleString()} give back
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={goodDeedOn}
                      onCheckedChange={setGoodDeedOn}
                      data-testid="switch-gooddeed"
                    />
                  </div>

                  {goodDeedOn && (
                    <div className="rounded-lg bg-white/70 ring-1 ring-black/5 px-3 py-2.5" style={{ marginTop: 12 }}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1 text-slate-500">
                          Profit
                          <span className="text-slate-400 inline-flex items-center gap-0.5">
                            Per unit sold <ChevronDown className="w-3 h-3" />
                          </span>
                        </span>
                        <span className="font-semibold text-slate-700 tabular-nums">
                          {fmtUSD(goodDeedPerUnit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]" style={{ marginTop: 4 }}>
                        <span className="text-slate-500">Total to your cause</span>
                        <span className="font-semibold tabular-nums" style={{ color: RUBY }}>
                          {fmtUSD(goodDeedTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Combined artist-net total — prominent */}
                <div
                  className="flex items-center justify-between px-4 py-4"
                  style={{ background: 'linear-gradient(90deg, rgba(200,30,56,0.05), rgba(200,30,56,0.10))' }}
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] uppercase tracking-wider font-bold text-slate-600">
                    Combined total <InfoDot />
                  </span>
                  <span className="text-[22px] font-bold tabular-nums" style={{ color: RUBY }}>
                    {fmtUSD(combinedTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Optional add-ons */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <SectionLabel>Optional · Add-ons</SectionLabel>
              <div
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {ADD_ONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      data-testid={`addon-${a.id}`}
                      className={
                        a.on
                          ? 'group flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors'
                          : 'group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50'
                      }
                      style={
                        a.on
                          ? { borderColor: 'rgba(200,30,56,0.25)', backgroundColor: RUBY_SOFT }
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: a.on ? 'rgba(200,30,56,0.12)' : '#F1F5F9',
                            color: a.on ? RUBY : '#64748B',
                          }}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold text-slate-900">{a.title}</div>
                          <div className="text-[12px] text-slate-500">{a.meta}</div>
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Commit bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-[12.5px] text-slate-500">
                Saved as a preview — nothing goes to press until you say so.
              </p>
              <Button
                className="text-white hover:opacity-90"
                style={{ backgroundColor: BLUE, borderColor: BLUE }}
                data-testid="button-save-package"
              >
                Save this package
              </Button>
            </div>
          </div>

          {/* RIGHT — sticky rail */}
          <div className="min-w-0">
            <StickyRail
              swatch={swatch}
              artistNet={combinedTotal}
              goodDeedOn={goodDeedOn}
              goodDeedTotal={goodDeedTotal}
            />
          </div>
        </div>
      </div>
    </ArtistShell>
  );
}

export default ArtistProjectPackage;
